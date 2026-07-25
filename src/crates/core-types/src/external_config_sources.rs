//! Safe, presentation-neutral DTOs for read-only external CLI configuration discovery.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExternalConfigSource {
    ClaudeCode,
    Codex,
    OpenCode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExternalConfigSourceStatus {
    Ready,
    Missing,
    Denied,
    Unsupported,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExternalConfigLocationCategory {
    UserHome,
    PlatformConfig,
    EnvironmentOverride,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExternalConfigFormat {
    Json,
    JsonWithComments,
    Toml,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExternalConfigSourceErrorCode {
    HomeUnavailable,
    PermissionDenied,
    UnsupportedFormat,
    TooLarge,
    ParseFailed,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalConfigSourceError {
    pub code: ExternalConfigSourceErrorCode,
    /// Sanitized user-facing detail. Never contains a path or raw OS error.
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalConfigSafeSummary {
    pub provider_names: Vec<String>,
    pub model_names: Vec<String>,
    pub profile_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalConfigSourceSnapshot {
    pub source: ExternalConfigSource,
    pub status: ExternalConfigSourceStatus,
    pub location_category: ExternalConfigLocationCategory,
    pub format: ExternalConfigFormat,
    pub summary: ExternalConfigSafeSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ExternalConfigSourceError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalConfigSourcesSnapshot {
    pub sources: Vec<ExternalConfigSourceSnapshot>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_explicit_source_status_and_error_contract() {
        let snapshot = ExternalConfigSourceSnapshot {
            source: ExternalConfigSource::Codex,
            status: ExternalConfigSourceStatus::Unsupported,
            location_category: ExternalConfigLocationCategory::EnvironmentOverride,
            format: ExternalConfigFormat::Toml,
            summary: ExternalConfigSafeSummary::default(),
            error: Some(ExternalConfigSourceError {
                code: ExternalConfigSourceErrorCode::UnsupportedFormat,
                message: "The configuration format is not supported.".to_string(),
            }),
        };

        let value = serde_json::to_value(snapshot).expect("serialize snapshot");
        assert_eq!(value["source"], "codex");
        assert_eq!(value["status"], "unsupported");
        assert_eq!(value["locationCategory"], "environment_override");
        assert_eq!(value["error"]["code"], "unsupported_format");
    }
}
