use super::*;
use crate::infrastructure::PathManager;
use crate::service::config::{ConfigManagerSettings, ConfigService};
use crate::service::mcp::config::ConfigLocation;
use crate::service::mcp::server::{MCPServerStatus, MCPServerTransport, MCPServerType};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use void_services_integrations::mcp::server::{
    compute_mcp_backoff_delay, detect_mcp_list_changed_kind, MCPListChangedKind,
};

static NEXT_TEST_DIR_ID: AtomicU64 = AtomicU64::new(0);

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after UNIX_EPOCH")
            .as_nanos();
        let sequence = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "{prefix}-{}-{unique}-{sequence}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).expect("test temp dir should be created");
        Self { path }
    }

    fn path(&self) -> PathBuf {
        self.path.clone()
    }
}

impl Drop for TestTempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

async fn test_manager(prefix: &str) -> (Arc<ConfigService>, MCPServerManager, TestTempDir) {
    let dir = TestTempDir::new(prefix);
    let path_manager = Arc::new(PathManager::with_user_root_for_tests(
        dir.path().join("user"),
    ));
    let config_service = Arc::new(
        ConfigService::with_settings(ConfigManagerSettings {
            path_manager: Some(path_manager),
            auto_save: true,
            backup_count: 1,
        })
        .await
        .expect("test config service should start"),
    );
    let mcp_config_service = Arc::new(
        MCPConfigService::new(config_service.clone())
            .expect("test MCP config service should start"),
    );
    let manager = MCPServerManager::new(mcp_config_service);
    (config_service, manager, dir)
}

fn local_config(id: &str, command: String, auto_start: bool) -> MCPServerConfig {
    MCPServerConfig {
        id: id.to_string(),
        name: id.to_string(),
        server_type: MCPServerType::Local,
        transport: None,
        command: Some(command),
        args: Vec::new(),
        env: HashMap::new(),
        headers: HashMap::new(),
        url: None,
        auto_start,
        enabled: true,
        location: ConfigLocation::User,
        capabilities: Vec::new(),
        settings: Default::default(),
        oauth: None,
        xaa: None,
    }
}

fn remote_config(id: &str, url: &str) -> MCPServerConfig {
    MCPServerConfig {
        id: id.to_string(),
        name: id.to_string(),
        server_type: MCPServerType::Remote,
        transport: Some(MCPServerTransport::StreamableHttp),
        command: None,
        args: Vec::new(),
        env: HashMap::new(),
        headers: HashMap::new(),
        url: Some(url.to_string()),
        auto_start: true,
        enabled: true,
        location: ConfigLocation::User,
        capabilities: Vec::new(),
        settings: Default::default(),
        oauth: None,
        xaa: None,
    }
}

async fn assert_server_removed(
    config_service: &ConfigService,
    manager: &MCPServerManager,
    server_id: &str,
) {
    let persisted: serde_json::Value = config_service
        .get_config(Some("mcp_servers"))
        .await
        .expect("persisted MCP config should remain readable");
    let target_persisted = persisted
        .get("mcpServers")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|servers| servers.contains_key(server_id));

    assert!(!target_persisted, "target config should be removed");
    assert!(
        !manager.registry.contains(server_id).await,
        "target runtime registration should be removed"
    );
}

fn assert_temp_root_removed(
    config_service: Arc<ConfigService>,
    manager: MCPServerManager,
    dir: TestTempDir,
) {
    let temp_root = dir.path();
    drop(manager);
    drop(config_service);
    drop(dir);

    assert!(
        !temp_root.exists(),
        "isolated MCP test root should be deleted: {}",
        temp_root.display()
    );
}

#[test]
fn backoff_delay_grows_exponentially_and_caps() {
    let base = Duration::from_secs(2);
    let max = Duration::from_secs(60);

    assert_eq!(
        compute_mcp_backoff_delay(base, max, 1),
        Duration::from_secs(2)
    );
    assert_eq!(
        compute_mcp_backoff_delay(base, max, 2),
        Duration::from_secs(4)
    );
    assert_eq!(
        compute_mcp_backoff_delay(base, max, 5),
        Duration::from_secs(32)
    );
    assert_eq!(
        compute_mcp_backoff_delay(base, max, 10),
        Duration::from_secs(60)
    );
}

#[test]
fn detect_list_changed_kind_supports_three_catalogs() {
    assert_eq!(
        detect_mcp_list_changed_kind("notifications/tools/list_changed"),
        Some(MCPListChangedKind::Tools)
    );
    assert_eq!(
        detect_mcp_list_changed_kind("notifications/prompts/list_changed"),
        Some(MCPListChangedKind::Prompts)
    );
    assert_eq!(
        detect_mcp_list_changed_kind("notifications/resources/list_changed"),
        Some(MCPListChangedKind::Resources)
    );
    assert_eq!(detect_mcp_list_changed_kind("notifications/unknown"), None);
}

#[tokio::test]
async fn transactional_install_rolls_back_failed_autostart_without_losing_existing_config() {
    let (config_service, manager, _dir) =
        test_manager("void-mcp-manager-transactional-rollback").await;
    let existing = local_config("existing", "existing-command".to_string(), false);
    let user_metadata = json!({
        "owner": "connector-tests",
        "keep": true
    });
    config_service
        .set_config(
            "mcp_servers",
            json!({
                "schemaVersion": 3,
                "userMetadata": user_metadata.clone(),
                "mcpServers": {
                    "existing": {
                        "type": "stdio",
                        "command": "existing-command",
                        "enabled": true,
                        "autoStart": false
                    }
                }
            }),
        )
        .await
        .expect("initial MCP config should be persisted");
    manager
        .registry
        .register(&existing)
        .await
        .expect("existing connector should be registered");

    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after UNIX_EPOCH")
        .as_nanos();
    let target = local_config(
        "transactional-target",
        format!(
            "void-mcp-command-that-does-not-exist-{}-{unique}",
            std::process::id()
        ),
        true,
    );

    let error = manager
        .install_server_transactional(target.clone())
        .await
        .expect_err("missing command should fail transactional install");
    assert!(error.to_string().contains("MCP_CONNECTOR_INSTALL_FAILED"));

    let persisted: serde_json::Value = config_service
        .get_config(Some("mcp_servers"))
        .await
        .expect("persisted MCP config should be readable after rollback");
    assert_eq!(persisted["schemaVersion"], json!(3));
    assert_eq!(persisted["userMetadata"], user_metadata);
    assert!(persisted["mcpServers"].get("existing").is_some());
    assert!(persisted["mcpServers"].get(&target.id).is_none());
    assert!(manager.registry.contains("existing").await);
    assert!(!manager.registry.contains(&target.id).await);
}

#[tokio::test]
#[ignore = "requires approved live network access to the official Context7 MCP endpoint"]
async fn mcp_live_smoke_context7_remote_install_health_remove() {
    let (config_service, manager, dir) = test_manager("void-mcp-live-context7").await;
    let target = remote_config("live-context7", "https://mcp.context7.com/mcp");

    let install_result = tokio::time::timeout(
        Duration::from_secs(90),
        manager.install_server_transactional(target.clone()),
    )
    .await;
    match install_result {
        Ok(result) => result.expect("Context7 should install and complete its MCP handshake"),
        Err(_) => {
            let _ = manager.remove_server(&target.id).await;
            panic!("Context7 MCP installation timed out");
        }
    }

    let status = manager
        .get_server_status(&target.id)
        .await
        .expect("Context7 status should be available after installation");
    assert!(
        matches!(
            status,
            MCPServerStatus::Connected | MCPServerStatus::Healthy
        ),
        "Context7 should be ready after installation, got {status:?}"
    );

    manager
        .remove_server(&target.id)
        .await
        .expect("Context7 should be removed after the smoke test");
    assert_server_removed(&config_service, &manager, &target.id).await;
    assert_temp_root_removed(config_service, manager, dir);
}

#[tokio::test]
#[ignore = "requires approved live network access to the official npm registry"]
async fn mcp_live_smoke_memory_npx_install_health_remove() {
    let (config_service, manager, dir) = test_manager("void-mcp-live-memory").await;
    let npm_cache = dir.path().join("npm-cache");
    let npm_cache_value = npm_cache.to_string_lossy().into_owned();
    let mut target = local_config("live-memory", "npx".to_string(), true);
    target.args = vec![
        "-y".to_string(),
        "@modelcontextprotocol/server-memory".to_string(),
    ];
    target.env = HashMap::from([
        ("npm_config_cache".to_string(), npm_cache_value.clone()),
        ("NPM_CONFIG_CACHE".to_string(), npm_cache_value),
        (
            "npm_config_registry".to_string(),
            "https://registry.npmjs.org".to_string(),
        ),
        (
            "NPM_CONFIG_REGISTRY".to_string(),
            "https://registry.npmjs.org".to_string(),
        ),
        ("npm_config_audit".to_string(), "false".to_string()),
        ("npm_config_fund".to_string(), "false".to_string()),
        (
            "npm_config_update_notifier".to_string(),
            "false".to_string(),
        ),
        ("NO_UPDATE_NOTIFIER".to_string(), "1".to_string()),
        ("npm_config_fetch_retries".to_string(), "1".to_string()),
        ("npm_config_fetch_timeout".to_string(), "60000".to_string()),
    ]);

    let install_result = tokio::time::timeout(
        Duration::from_secs(180),
        manager.install_server_transactional(target.clone()),
    )
    .await;
    match install_result {
        Ok(result) => result.expect("memory MCP should install and complete its MCP handshake"),
        Err(_) => {
            let _ = manager.remove_server(&target.id).await;
            panic!("memory MCP installation timed out");
        }
    }

    let status = manager
        .get_server_status(&target.id)
        .await
        .expect("memory MCP status should be available after installation");
    assert!(
        matches!(
            status,
            MCPServerStatus::Connected | MCPServerStatus::Healthy
        ),
        "memory MCP should be ready after installation, got {status:?}"
    );
    assert!(
        npm_cache.exists(),
        "npx should use the isolated npm cache inside the MCP test root"
    );

    manager
        .remove_server(&target.id)
        .await
        .expect("memory MCP should be removed after the smoke test");
    assert_server_removed(&config_service, &manager, &target.id).await;
    assert_temp_root_removed(config_service, manager, dir);
}

#[tokio::test]
#[ignore = "requires explicit approval because it exercises a real remote transport failure"]
async fn mcp_live_smoke_unreachable_remote_rolls_back_target_only() {
    let (config_service, manager, dir) = test_manager("void-mcp-live-unreachable").await;
    let sentinel = local_config("live-sentinel", "sentinel-command".to_string(), false);
    let sentinel_metadata = json!({
        "owner": "connector-live-smoke",
        "keep": true
    });
    config_service
        .set_config(
            "mcp_servers",
            json!({
                "schemaVersion": 3,
                "userMetadata": sentinel_metadata.clone(),
                "mcpServers": {
                    "live-sentinel": {
                        "type": "stdio",
                        "command": "sentinel-command",
                        "enabled": true,
                        "autoStart": false
                    }
                }
            }),
        )
        .await
        .expect("sentinel MCP config should be persisted");
    manager
        .registry
        .register(&sentinel)
        .await
        .expect("sentinel MCP should be registered without starting");

    let target = remote_config("live-unreachable", "https://127.0.0.1:9/mcp");
    let install_result = tokio::time::timeout(
        Duration::from_secs(30),
        manager.install_server_transactional(target.clone()),
    )
    .await;
    let error = match install_result {
        Ok(result) => result.expect_err("unreachable remote MCP should fail installation"),
        Err(_) => {
            let _ = manager.remove_server(&target.id).await;
            panic!("unreachable remote MCP failure did not complete within the timeout");
        }
    };
    assert!(error.to_string().contains("MCP_CONNECTOR_INSTALL_FAILED"));

    let persisted: serde_json::Value = config_service
        .get_config(Some("mcp_servers"))
        .await
        .expect("persisted MCP config should be readable after live rollback");
    assert_eq!(persisted["schemaVersion"], json!(3));
    assert_eq!(persisted["userMetadata"], sentinel_metadata);
    assert!(persisted["mcpServers"].get("live-sentinel").is_some());
    assert!(persisted["mcpServers"].get(&target.id).is_none());
    assert!(manager.registry.contains("live-sentinel").await);
    assert!(!manager.registry.contains(&target.id).await);

    manager
        .remove_server("live-sentinel")
        .await
        .expect("sentinel MCP should be cleaned up after rollback assertions");
    assert_server_removed(&config_service, &manager, "live-sentinel").await;
    assert_temp_root_removed(config_service, manager, dir);
}
