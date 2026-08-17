use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::service::config::ConfigService;
use crate::service::mcp::server::MCPServerConfig;
use crate::util::errors::VoidResult;

pub struct MCPConfigService {
    pub(super) config_service: Arc<ConfigService>,
    inner: void_services_integrations::mcp::config::MCPConfigService,
    pub(super) mutation_lock: Arc<Mutex<()>>,
}

struct CoreMCPConfigStore {
    config_service: Arc<ConfigService>,
}

#[async_trait]
impl void_services_integrations::mcp::config::MCPConfigStore for CoreMCPConfigStore {
    async fn get_config_value(
        &self,
        key: &str,
    ) -> void_services_integrations::mcp::MCPRuntimeResult<Option<serde_json::Value>> {
        match self
            .config_service
            .get_config::<serde_json::Value>(Some(key))
            .await
        {
            Ok(value) => Ok(Some(value)),
            Err(_) => Ok(None),
        }
    }

    async fn set_config_value(
        &self,
        key: &str,
        value: serde_json::Value,
    ) -> void_services_integrations::mcp::MCPRuntimeResult<()> {
        self.config_service
            .set_config(key, value)
            .await
            .map_err(|e| {
                void_services_integrations::mcp::MCPRuntimeError::configuration(e.to_string())
            })
    }
}

impl MCPConfigService {
    pub fn get_remote_authorization_value(config: &MCPServerConfig) -> Option<String> {
        void_services_integrations::mcp::config::MCPConfigService::get_remote_authorization_value(
            config,
        )
    }

    pub fn get_remote_authorization_source(config: &MCPServerConfig) -> Option<&'static str> {
        void_services_integrations::mcp::config::MCPConfigService::get_remote_authorization_source(
            config,
        )
    }

    pub fn has_remote_authorization(config: &MCPServerConfig) -> bool {
        void_services_integrations::mcp::config::MCPConfigService::has_remote_authorization(config)
    }

    pub fn has_remote_oauth(config: &MCPServerConfig) -> bool {
        void_services_integrations::mcp::config::MCPConfigService::has_remote_oauth(config)
    }

    pub fn has_remote_xaa(config: &MCPServerConfig) -> bool {
        void_services_integrations::mcp::config::MCPConfigService::has_remote_xaa(config)
    }

    pub fn new(config_service: Arc<ConfigService>) -> VoidResult<Self> {
        let store = Arc::new(CoreMCPConfigStore {
            config_service: config_service.clone(),
        });
        Ok(Self {
            config_service,
            inner: void_services_integrations::mcp::config::MCPConfigService::new(store),
            mutation_lock: Arc::new(Mutex::new(())),
        })
    }

    pub async fn load_all_configs(&self) -> VoidResult<Vec<MCPServerConfig>> {
        Ok(self.inner.load_all_configs().await?)
    }

    pub async fn get_server_config(&self, server_id: &str) -> VoidResult<Option<MCPServerConfig>> {
        Ok(self.inner.get_server_config(server_id).await?)
    }

    pub async fn save_server_config(&self, config: &MCPServerConfig) -> VoidResult<()> {
        let _guard = self.mutation_lock.lock().await;
        Ok(self.inner.save_server_config(config).await?)
    }

    pub async fn insert_user_config_if_absent(&self, config: &MCPServerConfig) -> VoidResult<()> {
        let _guard = self.mutation_lock.lock().await;
        if self.inner.get_server_config(&config.id).await?.is_some() {
            return Err(crate::util::errors::VoidError::validation(format!(
                "MCP_CONNECTOR_ALREADY_INSTALLED: {}",
                config.id
            )));
        }
        Ok(self.inner.insert_user_config_if_absent(config).await?)
    }

    pub async fn set_remote_authorization(
        &self,
        server_id: &str,
        authorization_value: &str,
    ) -> VoidResult<MCPServerConfig> {
        let _guard = self.mutation_lock.lock().await;
        Ok(self
            .inner
            .set_remote_authorization(server_id, authorization_value)
            .await?)
    }

    pub async fn clear_remote_authorization(&self, server_id: &str) -> VoidResult<MCPServerConfig> {
        let _guard = self.mutation_lock.lock().await;
        Ok(self.inner.clear_remote_authorization(server_id).await?)
    }

    pub async fn delete_server_config(&self, server_id: &str) -> VoidResult<()> {
        let _guard = self.mutation_lock.lock().await;
        Ok(self.inner.delete_server_config(server_id).await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::PathManager;
    use crate::service::config::ConfigManagerSettings;
    use crate::service::mcp::config::ConfigLocation;
    use crate::service::mcp::server::MCPServerType;
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

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

    async fn test_mcp_config_service(
        prefix: &str,
    ) -> (Arc<ConfigService>, Arc<MCPConfigService>, TestTempDir) {
        let dir = TestTempDir::new(prefix);
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(dir.path()));
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
        (config_service, mcp_config_service, dir)
    }

    fn make_config(
        id: &str,
        location: ConfigLocation,
        server_type: MCPServerType,
        command: Option<&str>,
        url: Option<&str>,
    ) -> MCPServerConfig {
        MCPServerConfig {
            id: id.to_string(),
            name: id.to_string(),
            server_type,
            transport: None,
            command: command.map(str::to_string),
            args: Vec::new(),
            env: HashMap::new(),
            headers: HashMap::new(),
            url: url.map(str::to_string),
            auto_start: true,
            enabled: true,
            location,
            capabilities: Vec::new(),
            settings: Default::default(),
            oauth: None,
            xaa: None,
        }
    }

    #[test]
    fn remote_authorization_prefers_headers_and_normalizes_tokens() {
        let mut config = make_config(
            "remote-auth",
            ConfigLocation::User,
            MCPServerType::Remote,
            None,
            Some("https://example.com/mcp"),
        );
        config
            .env
            .insert("Authorization".to_string(), "legacy-token".to_string());
        config.headers.insert(
            "Authorization".to_string(),
            "Bearer header-token".to_string(),
        );

        assert_eq!(
            MCPConfigService::get_remote_authorization_value(&config).as_deref(),
            Some("Bearer header-token")
        );
        assert_eq!(
            MCPConfigService::get_remote_authorization_source(&config),
            Some("headers")
        );
        assert_eq!(
            void_services_integrations::mcp::config::normalize_mcp_authorization_value(
                "plain-token"
            )
            .as_deref(),
            Some("Bearer plain-token")
        );
    }

    #[tokio::test]
    async fn concurrent_inserts_for_different_ids_preserve_both_and_root_metadata() {
        let (config_service, mcp_config_service, _dir) =
            test_mcp_config_service("void-mcp-config-concurrent-different").await;
        let user_metadata = json!({
            "owner": "connector-tests",
            "labels": ["preserve", "concurrent"]
        });
        config_service
            .set_config(
                "mcp_servers",
                json!({
                    "schemaVersion": 3,
                    "userMetadata": user_metadata.clone(),
                    "mcpServers": {}
                }),
            )
            .await
            .expect("initial MCP config should be persisted");

        let first = make_config(
            "concurrent-first",
            ConfigLocation::User,
            MCPServerType::Local,
            Some("first-command"),
            None,
        );
        let second = make_config(
            "concurrent-second",
            ConfigLocation::User,
            MCPServerType::Local,
            Some("second-command"),
            None,
        );

        let (first_result, second_result) = tokio::join!(
            mcp_config_service.insert_user_config_if_absent(&first),
            mcp_config_service.insert_user_config_if_absent(&second)
        );
        first_result.expect("first concurrent insert should succeed");
        second_result.expect("second concurrent insert should succeed");

        let persisted: serde_json::Value = config_service
            .get_config(Some("mcp_servers"))
            .await
            .expect("persisted MCP config should be readable");
        assert_eq!(persisted["schemaVersion"], json!(3));
        assert_eq!(persisted["userMetadata"], user_metadata);
        assert!(persisted["mcpServers"].get(&first.id).is_some());
        assert!(persisted["mcpServers"].get(&second.id).is_some());
    }

    #[tokio::test]
    async fn concurrent_inserts_for_same_id_allow_exactly_one() {
        let (config_service, mcp_config_service, _dir) =
            test_mcp_config_service("void-mcp-config-concurrent-same").await;
        let user_metadata = json!({"owner": "same-id-test"});
        config_service
            .set_config(
                "mcp_servers",
                json!({
                    "schemaVersion": 3,
                    "userMetadata": user_metadata.clone(),
                    "mcpServers": {}
                }),
            )
            .await
            .expect("initial MCP config should be persisted");

        let connector = make_config(
            "concurrent-same",
            ConfigLocation::User,
            MCPServerType::Local,
            Some("same-command"),
            None,
        );
        let (first_result, second_result) = tokio::join!(
            mcp_config_service.insert_user_config_if_absent(&connector),
            mcp_config_service.insert_user_config_if_absent(&connector)
        );
        let results = [first_result, second_result];
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        let errors: Vec<String> = results
            .into_iter()
            .filter_map(Result::err)
            .map(|error| error.to_string())
            .collect();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("MCP_CONNECTOR_ALREADY_INSTALLED"));

        let persisted: serde_json::Value = config_service
            .get_config(Some("mcp_servers"))
            .await
            .expect("persisted MCP config should be readable");
        assert_eq!(persisted["schemaVersion"], json!(3));
        assert_eq!(persisted["userMetadata"], user_metadata);
        assert_eq!(
            persisted["mcpServers"]
                .as_object()
                .expect("mcpServers should remain an object")
                .len(),
            1
        );
        assert!(persisted["mcpServers"].get(&connector.id).is_some());
    }
}
