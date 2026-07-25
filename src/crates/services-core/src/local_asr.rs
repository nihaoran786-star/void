//! Platform-neutral contracts for local speech recognition capability checks.

use serde::{Deserialize, Serialize};

pub const DEFAULT_LOCAL_ASR_MODEL_ID: &str = "sensevoice-small-int8";
pub const DEFAULT_MAX_RECORDING_SECONDS: u32 = 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct VoiceInputConfig {
    pub enabled: bool,
    pub provider: String,
    pub model_id: String,
    pub model_directory: String,
    pub default_language: String,
    pub max_recording_seconds: u32,
    pub microphone_device_id: String,
}

impl Default for VoiceInputConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: "local".to_string(),
            model_id: DEFAULT_LOCAL_ASR_MODEL_ID.to_string(),
            model_directory: String::new(),
            default_language: "auto".to_string(),
            max_recording_seconds: DEFAULT_MAX_RECORDING_SECONDS,
            microphone_device_id: String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalAsrSource {
    LocalFilesystem,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalAsrStatusCode {
    Disabled,
    MissingDirectory,
    MissingModel,
    Unavailable,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalAsrErrorCode {
    UnsupportedProvider,
    InvalidModelId,
    ModelDirectoryMissing,
    ModelMissing,
    EngineNotBundled,
    InspectionFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAsrError {
    pub code: LocalAsrErrorCode,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAsrStatus {
    pub source: LocalAsrSource,
    pub status: LocalAsrStatusCode,
    pub configured_model_id: String,
    pub model_directory: String,
    pub model_available: bool,
    pub engine_available: bool,
    pub discovered_models: Vec<String>,
    pub error: Option<LocalAsrError>,
}

impl LocalAsrStatus {
    pub fn disabled(config: &VoiceInputConfig) -> Self {
        Self {
            source: LocalAsrSource::LocalFilesystem,
            status: LocalAsrStatusCode::Disabled,
            configured_model_id: config.model_id.clone(),
            model_directory: config.model_directory.clone(),
            model_available: false,
            engine_available: false,
            discovered_models: Vec::new(),
            error: None,
        }
    }
}

pub trait LocalAsrStatusProvider: Send + Sync {
    fn inspect(&self, config: &VoiceInputConfig) -> LocalAsrStatus;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_disabled_and_do_not_claim_runtime_availability() {
        let config = VoiceInputConfig::default();
        let status = LocalAsrStatus::disabled(&config);

        assert!(!config.enabled);
        assert_eq!(status.status, LocalAsrStatusCode::Disabled);
        assert!(!status.model_available);
        assert!(!status.engine_available);
        assert!(status.error.is_none());
    }

    #[test]
    fn contracts_use_stable_camel_case_fields_and_snake_case_states() {
        let status = LocalAsrStatus {
            source: LocalAsrSource::LocalFilesystem,
            status: LocalAsrStatusCode::Unavailable,
            configured_model_id: DEFAULT_LOCAL_ASR_MODEL_ID.to_string(),
            model_directory: "models".to_string(),
            model_available: true,
            engine_available: false,
            discovered_models: vec![DEFAULT_LOCAL_ASR_MODEL_ID.to_string()],
            error: Some(LocalAsrError {
                code: LocalAsrErrorCode::EngineNotBundled,
                message: "Unavailable".to_string(),
                retryable: false,
            }),
        };

        let value = serde_json::to_value(status).expect("serialize local ASR status");
        assert_eq!(value["source"], "local_filesystem");
        assert_eq!(value["status"], "unavailable");
        assert_eq!(value["modelAvailable"], true);
        assert_eq!(value["error"]["code"], "engine_not_bundled");
    }
}
