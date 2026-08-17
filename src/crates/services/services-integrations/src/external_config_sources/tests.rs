use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use super::*;

static TEST_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct TestDirectory {
    path: PathBuf,
}

impl TestDirectory {
    fn new() -> Self {
        let sequence = TEST_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "void-external-config-sources-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        Self { path }
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn context(home: &Path, platform: HostPlatform) -> ExternalConfigDiscoveryContext {
    ExternalConfigDiscoveryContext {
        platform,
        home_dir: Some(home.to_path_buf()),
        platform_config_dir: None,
        codex_home: None,
        opencode_config: None,
    }
}

#[test]
fn candidate_paths_are_platform_specific_without_exposing_them_in_dtos() {
    let home = PathBuf::from("private-home-segment");
    let linux = candidates_for(
        ExternalConfigSource::OpenCode,
        &context(&home, HostPlatform::Linux),
    );
    let mac = candidates_for(
        ExternalConfigSource::OpenCode,
        &context(&home, HostPlatform::MacOs),
    );
    let windows = candidates_for(
        ExternalConfigSource::OpenCode,
        &context(&home, HostPlatform::Windows),
    );

    assert_eq!(
        linux[0].path,
        home.join(".config").join("opencode").join("opencode.json")
    );
    assert_eq!(
        mac[0].path,
        home.join(".config").join("opencode").join("opencode.json")
    );
    assert_eq!(
        windows[0].path,
        home.join(".config").join("opencode").join("opencode.json")
    );

    let snapshot = discover_external_config_sources_with(&context(&home, HostPlatform::Windows));
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("private-home-segment"));
    assert!(!serialized.contains("opencode.json"));
}

#[test]
fn json_adapter_only_returns_allowlisted_public_names() {
    let test_dir = TestDirectory::new();
    let config_dir = test_dir.path.join(".claude");
    fs::create_dir_all(&config_dir).expect("create claude config directory");
    fs::write(
        config_dir.join("settings.json"),
        r#"{
            "model": "claude-sonnet",
            "provider": "anthropic",
            "profiles": { "reviewer": { "model": "claude-opus" } },
            "env": { "ANTHROPIC_API_KEY": "do-not-leak" },
            "apiKey": "also-do-not-leak",
            "hooks": { "onStart": { "command": "never-execute-or-return" } },
            "cookie": "private-cookie"
        }"#,
    )
    .expect("write config");

    let snapshot = probe_source(
        ExternalConfigSource::ClaudeCode,
        &context(&test_dir.path, HostPlatform::Linux),
    );

    assert_eq!(snapshot.status, ExternalConfigSourceStatus::Ready);
    assert_eq!(snapshot.summary.provider_names, ["anthropic"]);
    assert_eq!(
        snapshot.summary.model_names,
        ["claude-opus", "claude-sonnet"]
    );
    assert_eq!(snapshot.summary.profile_names, ["reviewer"]);
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    for secret in [
        "do-not-leak",
        "also-do-not-leak",
        "never-execute-or-return",
        "private-cookie",
    ] {
        assert!(!serialized.contains(secret));
    }
}

#[test]
fn codex_toml_adapter_extracts_models_providers_and_profiles() {
    let test_dir = TestDirectory::new();
    let config_dir = test_dir.path.join(".codex");
    fs::create_dir_all(&config_dir).expect("create codex config directory");
    fs::write(
        config_dir.join("config.toml"),
        r#"
            model = "gpt-5.4"
            model_provider = "openai"
            api_key = "do-not-leak"

            [profiles.review]
            model = "gpt-5.3-codex"

            [model_providers.local]
            base_url = "http://localhost"
            env_key = "PRIVATE_ENV"
        "#,
    )
    .expect("write config");

    let snapshot = probe_source(
        ExternalConfigSource::Codex,
        &context(&test_dir.path, HostPlatform::Windows),
    );

    assert_eq!(snapshot.status, ExternalConfigSourceStatus::Ready);
    assert_eq!(snapshot.summary.provider_names, ["local", "openai"]);
    assert_eq!(snapshot.summary.model_names, ["gpt-5.3-codex", "gpt-5.4"]);
    assert_eq!(snapshot.summary.profile_names, ["review"]);
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("do-not-leak"));
    assert!(!serialized.contains("PRIVATE_ENV"));
    assert!(!serialized.contains("localhost"));
}

#[test]
fn reports_missing_and_parse_failure_as_explicit_states() {
    let test_dir = TestDirectory::new();
    let missing = probe_source(
        ExternalConfigSource::ClaudeCode,
        &context(&test_dir.path, HostPlatform::Linux),
    );
    assert_eq!(missing.status, ExternalConfigSourceStatus::Missing);
    assert!(missing.error.is_none());

    let config_dir = test_dir.path.join(".claude");
    fs::create_dir_all(&config_dir).expect("create config directory");
    fs::write(config_dir.join("settings.json"), "{ invalid json").expect("write invalid config");
    let failed = probe_source(
        ExternalConfigSource::ClaudeCode,
        &context(&test_dir.path, HostPlatform::Linux),
    );
    assert_eq!(failed.status, ExternalConfigSourceStatus::Failed);
    assert_eq!(
        failed.error.as_ref().map(|error| error.code),
        Some(ExternalConfigSourceErrorCode::ParseFailed)
    );
}

#[test]
fn permission_errors_are_typed_and_never_return_raw_os_details() {
    let candidate = candidate(
        PathBuf::from("private-path"),
        ExternalConfigLocationCategory::UserHome,
        ExternalConfigFormat::Json,
    );
    let snapshot = io_error_snapshot(
        ExternalConfigSource::ClaudeCode,
        &candidate,
        io::Error::new(io::ErrorKind::PermissionDenied, "secret raw OS detail"),
    );

    assert_eq!(snapshot.status, ExternalConfigSourceStatus::Denied);
    assert_eq!(
        snapshot.error.as_ref().map(|error| error.code),
        Some(ExternalConfigSourceErrorCode::PermissionDenied)
    );
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("private-path"));
    assert!(!serialized.contains("secret raw OS detail"));
}

#[test]
fn environment_overrides_are_labeled_but_their_values_are_not_returned() {
    let test_dir = TestDirectory::new();
    let codex_home = test_dir.path.join("custom-codex-private");
    fs::create_dir_all(&codex_home).expect("create codex home");
    fs::write(codex_home.join("config.toml"), "model = \"gpt-safe\"").expect("write config");
    let context = ExternalConfigDiscoveryContext {
        platform: HostPlatform::MacOs,
        home_dir: Some(test_dir.path.clone()),
        platform_config_dir: None,
        codex_home: Some(codex_home),
        opencode_config: None,
    };

    let snapshot = probe_source(ExternalConfigSource::Codex, &context);
    assert_eq!(
        snapshot.location_category,
        ExternalConfigLocationCategory::EnvironmentOverride
    );
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("custom-codex-private"));
}

#[test]
fn opencode_jsonc_adapter_uses_official_global_shape_without_leaking_credentials() {
    let test_dir = TestDirectory::new();
    let config_dir = test_dir.path.join(".config").join("opencode");
    fs::create_dir_all(&config_dir).expect("create opencode config directory");
    fs::write(
        config_dir.join("opencode.jsonc"),
        r#"{
            // OpenCode supports comments and trailing commas.
            "model": "anthropic/claude-sonnet-4-5",
            "provider": {
                "anthropic": {
                    "options": { "apiKey": "{env:ANTHROPIC_API_KEY}" },
                },
            },
            "agent": {
                "reviewer": { "model": "anthropic/claude-opus-4-1" },
            },
            "command": {
                "private": { "template": "never-return-this-command" },
            },
        }"#,
    )
    .expect("write config");

    let snapshot = probe_source(
        ExternalConfigSource::OpenCode,
        &context(&test_dir.path, HostPlatform::Windows),
    );

    assert_eq!(snapshot.status, ExternalConfigSourceStatus::Ready);
    assert_eq!(snapshot.format, ExternalConfigFormat::JsonWithComments);
    assert_eq!(snapshot.summary.provider_names, ["anthropic"]);
    assert_eq!(
        snapshot.summary.model_names,
        ["anthropic/claude-opus-4-1", "anthropic/claude-sonnet-4-5"]
    );
    assert_eq!(snapshot.summary.profile_names, ["reviewer"]);
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("ANTHROPIC_API_KEY"));
    assert!(!serialized.contains("never-return-this-command"));
}

#[test]
fn opencode_explicit_config_path_is_preferred_and_never_exposed() {
    let test_dir = TestDirectory::new();
    let custom_path = test_dir.path.join("private-custom-opencode.json");
    fs::write(&custom_path, r#"{ "model": "openai/gpt-5" }"#).expect("write custom config");
    let context = ExternalConfigDiscoveryContext {
        platform: HostPlatform::Linux,
        home_dir: Some(test_dir.path.clone()),
        platform_config_dir: None,
        codex_home: None,
        opencode_config: Some(custom_path),
    };

    let snapshot = probe_source(ExternalConfigSource::OpenCode, &context);

    assert_eq!(snapshot.status, ExternalConfigSourceStatus::Ready);
    assert_eq!(
        snapshot.location_category,
        ExternalConfigLocationCategory::EnvironmentOverride
    );
    assert_eq!(snapshot.summary.model_names, ["openai/gpt-5"]);
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("private-custom-opencode"));
}
