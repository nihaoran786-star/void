//! Local-filesystem adapter for ASR model discovery.
//!
//! Void does not currently bundle an inference engine. This adapter therefore
//! reports model presence independently from runtime availability.

use std::fs;
use std::path::{Component, Path};
pub use void_services_core::local_asr::{
    LocalAsrAppendAudioChunkRequest, LocalAsrAppendAudioChunkResponse, LocalAsrError,
    LocalAsrErrorCode, LocalAsrInputSession, LocalAsrSessionRequest, LocalAsrSource,
    LocalAsrStartInputSessionRequest, LocalAsrStatus, LocalAsrStatusCode, LocalAsrStatusProvider,
    LocalAsrTranscriptionResult, VoiceInputConfig,
};

const MAX_DISCOVERED_MODELS: usize = 100;

pub fn is_valid_local_model_id(model_id: &str) -> bool {
    let mut components = Path::new(model_id).components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}

#[derive(Debug, Clone, Copy)]
pub struct LocalFilesystemAsrStatusAdapter {
    engine_available: bool,
}

impl Default for LocalFilesystemAsrStatusAdapter {
    fn default() -> Self {
        Self::without_engine()
    }
}

impl LocalFilesystemAsrStatusAdapter {
    pub const fn without_engine() -> Self {
        Self {
            engine_available: false,
        }
    }

    pub const fn with_engine() -> Self {
        Self {
            engine_available: true,
        }
    }

    fn error_status(
        config: &VoiceInputConfig,
        status: LocalAsrStatusCode,
        code: LocalAsrErrorCode,
        message: impl Into<String>,
        discovered_models: Vec<String>,
    ) -> LocalAsrStatus {
        LocalAsrStatus {
            source: LocalAsrSource::LocalFilesystem,
            status,
            configured_model_id: config.model_id.clone(),
            model_directory: config.model_directory.clone(),
            model_available: false,
            engine_available: false,
            discovered_models,
            error: Some(LocalAsrError {
                code,
                message: message.into(),
                retryable: false,
            }),
        }
    }

    fn discover_models(directory: &Path) -> Result<Vec<String>, std::io::Error> {
        let mut models = fs::read_dir(directory)?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().trim().to_string();
                (!name.is_empty() && !name.starts_with('.')).then_some(name)
            })
            .take(MAX_DISCOVERED_MODELS)
            .collect::<Vec<_>>();
        models.sort();
        Ok(models)
    }
}

impl LocalAsrStatusProvider for LocalFilesystemAsrStatusAdapter {
    fn inspect(&self, config: &VoiceInputConfig) -> LocalAsrStatus {
        if !config.enabled {
            return LocalAsrStatus::disabled(config);
        }

        if config.provider != "local" {
            return Self::error_status(
                config,
                LocalAsrStatusCode::Unavailable,
                LocalAsrErrorCode::UnsupportedProvider,
                "Only the local ASR provider is supported by this adapter.",
                Vec::new(),
            );
        }

        if !is_valid_local_model_id(config.model_id.trim()) {
            return Self::error_status(
                config,
                LocalAsrStatusCode::MissingModel,
                LocalAsrErrorCode::InvalidModelId,
                "The ASR model id must be one local file or directory name.",
                Vec::new(),
            );
        }

        let directory = Path::new(config.model_directory.trim());
        if config.model_directory.trim().is_empty() || !directory.is_dir() {
            return Self::error_status(
                config,
                LocalAsrStatusCode::MissingDirectory,
                LocalAsrErrorCode::ModelDirectoryMissing,
                "The configured local ASR model directory does not exist.",
                Vec::new(),
            );
        }

        let discovered_models = match Self::discover_models(directory) {
            Ok(models) => models,
            Err(error) => {
                return Self::error_status(
                    config,
                    LocalAsrStatusCode::Failed,
                    LocalAsrErrorCode::InspectionFailed,
                    format!("Failed to inspect the local ASR model directory: {error}"),
                    Vec::new(),
                );
            }
        };

        let model_available = discovered_models
            .iter()
            .any(|model| model == config.model_id.trim());
        if !model_available {
            return Self::error_status(
                config,
                LocalAsrStatusCode::MissingModel,
                LocalAsrErrorCode::ModelMissing,
                "The selected ASR model was not found in the configured directory.",
                discovered_models,
            );
        }

        let model_path = directory.join(config.model_id.trim());
        if !model_path.join("model.int8.onnx").is_file() || !model_path.join("tokens.txt").is_file()
        {
            return Self::error_status(
                config,
                LocalAsrStatusCode::Failed,
                LocalAsrErrorCode::ModelCorrupt,
                "The SenseVoice model must contain model.int8.onnx and tokens.txt.",
                discovered_models,
            );
        }

        if self.engine_available {
            return LocalAsrStatus {
                source: LocalAsrSource::LocalFilesystem,
                status: LocalAsrStatusCode::Ready,
                configured_model_id: config.model_id.clone(),
                model_directory: config.model_directory.clone(),
                model_available: true,
                engine_available: true,
                discovered_models,
                error: None,
            };
        }

        LocalAsrStatus {
            source: LocalAsrSource::LocalFilesystem,
            status: LocalAsrStatusCode::Unavailable,
            configured_model_id: config.model_id.clone(),
            model_directory: config.model_directory.clone(),
            model_available: true,
            engine_available: false,
            discovered_models,
            error: Some(LocalAsrError {
                code: LocalAsrErrorCode::EngineNotBundled,
                message: "The local ASR inference engine is not bundled in this build.".to_string(),
                retryable: false,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "void-local-asr-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    #[test]
    fn reports_present_model_but_never_claims_unbundled_engine_is_ready() {
        let root = unique_temp_dir();
        let model = root.join("sensevoice-small-int8");
        fs::create_dir_all(&model).expect("create model fixture");
        fs::write(model.join("model.int8.onnx"), b"fixture").expect("write model fixture");
        fs::write(model.join("tokens.txt"), b"fixture").expect("write tokens fixture");
        let config = VoiceInputConfig {
            enabled: true,
            model_directory: root.to_string_lossy().into_owned(),
            ..VoiceInputConfig::default()
        };

        let status = LocalFilesystemAsrStatusAdapter::without_engine().inspect(&config);

        assert!(status.model_available);
        assert!(!status.engine_available);
        assert_eq!(status.status, LocalAsrStatusCode::Unavailable);
        assert_eq!(
            status.error.as_ref().map(|error| error.code),
            Some(LocalAsrErrorCode::EngineNotBundled)
        );
        fs::remove_dir_all(root).expect("remove model fixture");
    }

    #[test]
    fn rejects_model_ids_that_can_escape_the_configured_directory() {
        let config = VoiceInputConfig {
            enabled: true,
            model_id: "../outside".to_string(),
            model_directory: std::env::temp_dir().to_string_lossy().into_owned(),
            ..VoiceInputConfig::default()
        };

        let status = LocalFilesystemAsrStatusAdapter::without_engine().inspect(&config);

        assert_eq!(status.status, LocalAsrStatusCode::MissingModel);
        assert_eq!(
            status.error.as_ref().map(|error| error.code),
            Some(LocalAsrErrorCode::InvalidModelId)
        );
    }
}
