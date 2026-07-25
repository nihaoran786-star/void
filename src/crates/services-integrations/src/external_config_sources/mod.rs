//! Read-only adapters for public Claude Code, Codex, and OpenCode configuration.
//!
//! This module intentionally does not expose raw files, paths, environment
//! values, authentication material, hooks, or commands.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;

use serde_json::Value;
pub use void_core_types::{
    ExternalConfigFormat, ExternalConfigLocationCategory, ExternalConfigSafeSummary,
    ExternalConfigSource, ExternalConfigSourceError, ExternalConfigSourceErrorCode,
    ExternalConfigSourceSnapshot, ExternalConfigSourceStatus, ExternalConfigSourcesSnapshot,
};

const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_SUMMARY_ITEMS: usize = 32;
const MAX_SUMMARY_VALUE_CHARS: usize = 128;
const MAX_JSON_DEPTH: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostPlatform {
    Windows,
    MacOs,
    Linux,
}

#[derive(Debug, Clone)]
pub struct ExternalConfigDiscoveryContext {
    pub platform: HostPlatform,
    pub home_dir: Option<PathBuf>,
    pub platform_config_dir: Option<PathBuf>,
    pub codex_home: Option<PathBuf>,
}

impl ExternalConfigDiscoveryContext {
    pub fn from_environment() -> Self {
        let platform = current_platform();
        let home_dir = env_path(if platform == HostPlatform::Windows {
            "USERPROFILE"
        } else {
            "HOME"
        })
        .or_else(|| env_path("HOME"));
        let platform_config_dir = env_path("XDG_CONFIG_HOME").or_else(|| {
            if platform == HostPlatform::Windows {
                env_path("APPDATA")
            } else {
                None
            }
        });

        Self {
            platform,
            home_dir,
            platform_config_dir,
            codex_home: env_path("CODEX_HOME"),
        }
    }
}

#[derive(Debug, Clone)]
struct ConfigCandidate {
    path: PathBuf,
    location_category: ExternalConfigLocationCategory,
    format: ExternalConfigFormat,
}

/// Discover all supported sources. Failures remain source-local so one broken
/// config cannot hide the availability of the other adapters.
pub fn discover_external_config_sources() -> ExternalConfigSourcesSnapshot {
    discover_external_config_sources_with(&ExternalConfigDiscoveryContext::from_environment())
}

pub fn discover_external_config_sources_with(
    context: &ExternalConfigDiscoveryContext,
) -> ExternalConfigSourcesSnapshot {
    ExternalConfigSourcesSnapshot {
        sources: [
            ExternalConfigSource::ClaudeCode,
            ExternalConfigSource::Codex,
            ExternalConfigSource::OpenCode,
        ]
        .into_iter()
        .map(|source| probe_source(source, context))
        .collect(),
    }
}

fn current_platform() -> HostPlatform {
    #[cfg(target_os = "windows")]
    {
        HostPlatform::Windows
    }
    #[cfg(target_os = "macos")]
    {
        HostPlatform::MacOs
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        HostPlatform::Linux
    }
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn probe_source(
    source: ExternalConfigSource,
    context: &ExternalConfigDiscoveryContext,
) -> ExternalConfigSourceSnapshot {
    let candidates = candidates_for(source, context);
    let Some(default_candidate) = candidates.first() else {
        return source_error(
            source,
            ExternalConfigLocationCategory::UserHome,
            default_format(source),
            ExternalConfigSourceStatus::Failed,
            ExternalConfigSourceErrorCode::HomeUnavailable,
            "The user configuration directory is unavailable.",
        );
    };

    for candidate in &candidates {
        match fs::metadata(&candidate.path) {
            Ok(metadata) => {
                if !metadata.is_file() {
                    continue;
                }
                if metadata.len() > MAX_CONFIG_BYTES {
                    return source_error(
                        source,
                        candidate.location_category,
                        candidate.format,
                        ExternalConfigSourceStatus::Unsupported,
                        ExternalConfigSourceErrorCode::TooLarge,
                        "The configuration file is too large to inspect safely.",
                    );
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return io_error_snapshot(source, candidate, error),
        }

        let content = match fs::read_to_string(&candidate.path) {
            Ok(content) => content,
            Err(error) => return io_error_snapshot(source, candidate, error),
        };
        let summary = match candidate.format {
            ExternalConfigFormat::Json => parse_json_summary(&content),
            ExternalConfigFormat::JsonWithComments => {
                Err(ExternalConfigSourceErrorCode::UnsupportedFormat)
            }
            ExternalConfigFormat::Toml => parse_toml_summary(&content),
        };

        return match summary {
            Ok(summary) => ExternalConfigSourceSnapshot {
                source,
                status: ExternalConfigSourceStatus::Ready,
                location_category: candidate.location_category,
                format: candidate.format,
                summary,
                error: None,
            },
            Err(code) => source_error(
                source,
                candidate.location_category,
                candidate.format,
                error_status(code),
                code,
                error_message(code),
            ),
        };
    }

    ExternalConfigSourceSnapshot {
        source,
        status: ExternalConfigSourceStatus::Missing,
        location_category: default_candidate.location_category,
        format: default_candidate.format,
        summary: ExternalConfigSafeSummary::default(),
        error: None,
    }
}

fn candidates_for(
    source: ExternalConfigSource,
    context: &ExternalConfigDiscoveryContext,
) -> Vec<ConfigCandidate> {
    match source {
        ExternalConfigSource::ClaudeCode => context
            .home_dir
            .as_ref()
            .map(|home| {
                vec![
                    candidate(
                        home.join(".claude").join("settings.json"),
                        ExternalConfigLocationCategory::UserHome,
                        ExternalConfigFormat::Json,
                    ),
                    candidate(
                        home.join(".claude.json"),
                        ExternalConfigLocationCategory::UserHome,
                        ExternalConfigFormat::Json,
                    ),
                ]
            })
            .unwrap_or_default(),
        ExternalConfigSource::Codex => {
            if let Some(codex_home) = &context.codex_home {
                vec![candidate(
                    codex_home.join("config.toml"),
                    ExternalConfigLocationCategory::EnvironmentOverride,
                    ExternalConfigFormat::Toml,
                )]
            } else {
                context
                    .home_dir
                    .as_ref()
                    .map(|home| {
                        vec![candidate(
                            home.join(".codex").join("config.toml"),
                            ExternalConfigLocationCategory::UserHome,
                            ExternalConfigFormat::Toml,
                        )]
                    })
                    .unwrap_or_default()
            }
        }
        ExternalConfigSource::OpenCode => open_code_candidates(context),
    }
}

fn open_code_candidates(context: &ExternalConfigDiscoveryContext) -> Vec<ConfigCandidate> {
    let (config_root, category) = if let Some(config_dir) = &context.platform_config_dir {
        (
            Some(config_dir.clone()),
            ExternalConfigLocationCategory::EnvironmentOverride,
        )
    } else if let Some(home) = &context.home_dir {
        let path = match context.platform {
            HostPlatform::Windows | HostPlatform::Linux => home.join(".config"),
            HostPlatform::MacOs => home.join("Library").join("Application Support"),
        };
        (Some(path), ExternalConfigLocationCategory::PlatformConfig)
    } else {
        (None, ExternalConfigLocationCategory::PlatformConfig)
    };

    let Some(root) = config_root else {
        return Vec::new();
    };
    let base = root.join("opencode");
    vec![
        candidate(
            base.join("opencode.json"),
            category,
            ExternalConfigFormat::Json,
        ),
        candidate(
            base.join("config.json"),
            category,
            ExternalConfigFormat::Json,
        ),
        candidate(
            base.join("opencode.jsonc"),
            category,
            ExternalConfigFormat::JsonWithComments,
        ),
    ]
}

fn candidate(
    path: PathBuf,
    location_category: ExternalConfigLocationCategory,
    format: ExternalConfigFormat,
) -> ConfigCandidate {
    ConfigCandidate {
        path,
        location_category,
        format,
    }
}

fn default_format(source: ExternalConfigSource) -> ExternalConfigFormat {
    match source {
        ExternalConfigSource::Codex => ExternalConfigFormat::Toml,
        ExternalConfigSource::ClaudeCode | ExternalConfigSource::OpenCode => {
            ExternalConfigFormat::Json
        }
    }
}

fn io_error_snapshot(
    source: ExternalConfigSource,
    candidate: &ConfigCandidate,
    error: io::Error,
) -> ExternalConfigSourceSnapshot {
    if error.kind() == io::ErrorKind::PermissionDenied {
        source_error(
            source,
            candidate.location_category,
            candidate.format,
            ExternalConfigSourceStatus::Denied,
            ExternalConfigSourceErrorCode::PermissionDenied,
            "Permission to read the configuration was denied.",
        )
    } else {
        source_error(
            source,
            candidate.location_category,
            candidate.format,
            ExternalConfigSourceStatus::Failed,
            ExternalConfigSourceErrorCode::Io,
            "The configuration could not be read.",
        )
    }
}

fn source_error(
    source: ExternalConfigSource,
    location_category: ExternalConfigLocationCategory,
    format: ExternalConfigFormat,
    status: ExternalConfigSourceStatus,
    code: ExternalConfigSourceErrorCode,
    message: &str,
) -> ExternalConfigSourceSnapshot {
    ExternalConfigSourceSnapshot {
        source,
        status,
        location_category,
        format,
        summary: ExternalConfigSafeSummary::default(),
        error: Some(ExternalConfigSourceError {
            code,
            message: message.to_string(),
        }),
    }
}

fn error_status(code: ExternalConfigSourceErrorCode) -> ExternalConfigSourceStatus {
    match code {
        ExternalConfigSourceErrorCode::PermissionDenied => ExternalConfigSourceStatus::Denied,
        ExternalConfigSourceErrorCode::UnsupportedFormat
        | ExternalConfigSourceErrorCode::TooLarge => ExternalConfigSourceStatus::Unsupported,
        ExternalConfigSourceErrorCode::HomeUnavailable
        | ExternalConfigSourceErrorCode::ParseFailed
        | ExternalConfigSourceErrorCode::Io => ExternalConfigSourceStatus::Failed,
    }
}

fn error_message(code: ExternalConfigSourceErrorCode) -> &'static str {
    match code {
        ExternalConfigSourceErrorCode::HomeUnavailable => {
            "The user configuration directory is unavailable."
        }
        ExternalConfigSourceErrorCode::PermissionDenied => {
            "Permission to read the configuration was denied."
        }
        ExternalConfigSourceErrorCode::UnsupportedFormat => {
            "The configuration format is not supported."
        }
        ExternalConfigSourceErrorCode::TooLarge => {
            "The configuration file is too large to inspect safely."
        }
        ExternalConfigSourceErrorCode::ParseFailed => {
            "The public configuration fields could not be parsed."
        }
        ExternalConfigSourceErrorCode::Io => "The configuration could not be read.",
    }
}

fn parse_json_summary(
    content: &str,
) -> Result<ExternalConfigSafeSummary, ExternalConfigSourceErrorCode> {
    let value: Value =
        serde_json::from_str(content).map_err(|_| ExternalConfigSourceErrorCode::ParseFailed)?;
    let mut collector = SummaryCollector::default();
    collect_json_summary(&value, None, 0, &mut collector);
    Ok(collector.finish())
}

fn collect_json_summary(
    value: &Value,
    parent_key: Option<&str>,
    depth: usize,
    collector: &mut SummaryCollector,
) {
    if depth > MAX_JSON_DEPTH {
        return;
    }
    match value {
        Value::Object(object) => {
            let normalized_parent = parent_key.map(normalize_key);
            if matches!(
                normalized_parent.as_deref(),
                Some("providers" | "modelproviders")
            ) {
                for key in object.keys() {
                    collector.add_provider(key);
                }
            }
            if matches!(normalized_parent.as_deref(), Some("profiles" | "agents")) {
                for key in object.keys() {
                    collector.add_profile(key);
                }
            }

            for (key, child) in object {
                let normalized = normalize_key(key);
                if is_sensitive_key(&normalized) {
                    continue;
                }
                if let Value::String(text) = child {
                    match normalized.as_str() {
                        "provider" | "modelprovider" | "defaultprovider" => {
                            collector.add_provider(text)
                        }
                        "model" | "defaultmodel" | "smallmodel" | "bigmodel" => {
                            collector.add_model(text)
                        }
                        "profile" | "activeprofile" => collector.add_profile(text),
                        _ => {}
                    }
                }
                collect_json_summary(child, Some(key), depth + 1, collector);
            }
        }
        Value::Array(values) => {
            for child in values {
                collect_json_summary(child, parent_key, depth + 1, collector);
            }
        }
        _ => {}
    }
}

fn parse_toml_summary(
    content: &str,
) -> Result<ExternalConfigSafeSummary, ExternalConfigSourceErrorCode> {
    let mut collector = SummaryCollector::default();
    for raw_line in content.lines() {
        let line = strip_toml_comment(raw_line).trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            if !line.ends_with(']') {
                return Err(ExternalConfigSourceErrorCode::ParseFailed);
            }
            collect_toml_section(&line[1..line.len() - 1], &mut collector);
            continue;
        }
        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = normalize_key(raw_key.trim().trim_matches('"').trim_matches('\''));
        if is_sensitive_key(&key) {
            continue;
        }
        let Some(value) = parse_toml_string(raw_value.trim()) else {
            if matches!(
                key.as_str(),
                "provider"
                    | "modelprovider"
                    | "defaultprovider"
                    | "model"
                    | "defaultmodel"
                    | "profile"
                    | "activeprofile"
            ) {
                return Err(ExternalConfigSourceErrorCode::ParseFailed);
            }
            continue;
        };
        match key.as_str() {
            "provider" | "modelprovider" | "defaultprovider" => collector.add_provider(value),
            "model" | "defaultmodel" => collector.add_model(value),
            "profile" | "activeprofile" => collector.add_profile(value),
            _ => {}
        }
    }
    Ok(collector.finish())
}

fn collect_toml_section(section: &str, collector: &mut SummaryCollector) {
    let mut parts = section
        .split('.')
        .map(|part| part.trim().trim_matches('"').trim_matches('\''));
    let Some(root) = parts.next() else {
        return;
    };
    let Some(name) = parts.next() else {
        return;
    };
    match normalize_key(root).as_str() {
        "profiles" => collector.add_profile(name),
        "modelproviders" | "providers" => collector.add_provider(name),
        _ => {}
    }
}

fn strip_toml_comment(line: &str) -> &str {
    let mut quote = None;
    let mut escaped = false;
    for (index, character) in line.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote == Some('"') {
            escaped = true;
            continue;
        }
        if character == '"' || character == '\'' {
            quote = if quote == Some(character) {
                None
            } else if quote.is_none() {
                Some(character)
            } else {
                quote
            };
            continue;
        }
        if character == '#' && quote.is_none() {
            return &line[..index];
        }
    }
    line
}

fn parse_toml_string(value: &str) -> Option<&str> {
    if value.len() < 2 {
        return None;
    }
    let first = value.as_bytes()[0];
    let last = value.as_bytes()[value.len() - 1];
    if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
        Some(&value[1..value.len() - 1])
    } else {
        None
    }
}

fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_sensitive_key(normalized_key: &str) -> bool {
    [
        "token",
        "apikey",
        "secret",
        "password",
        "cookie",
        "credential",
        "authorization",
        "oauth",
        "env",
        "hook",
        "command",
        "header",
    ]
    .iter()
    .any(|sensitive| normalized_key.contains(sensitive))
}

#[derive(Default)]
struct SummaryCollector {
    providers: BTreeSet<String>,
    models: BTreeSet<String>,
    profiles: BTreeSet<String>,
}

impl SummaryCollector {
    fn add_provider(&mut self, value: &str) {
        add_safe_value(&mut self.providers, value);
    }

    fn add_model(&mut self, value: &str) {
        add_safe_value(&mut self.models, value);
    }

    fn add_profile(&mut self, value: &str) {
        add_safe_value(&mut self.profiles, value);
    }

    fn finish(self) -> ExternalConfigSafeSummary {
        ExternalConfigSafeSummary {
            provider_names: self.providers.into_iter().collect(),
            model_names: self.models.into_iter().collect(),
            profile_names: self.profiles.into_iter().collect(),
        }
    }
}

fn add_safe_value(values: &mut BTreeSet<String>, value: &str) {
    if values.len() >= MAX_SUMMARY_ITEMS {
        return;
    }
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_SUMMARY_VALUE_CHARS
        || value.chars().any(char::is_control)
    {
        return;
    }
    values.insert(value.to_string());
}

#[cfg(test)]
mod tests;
