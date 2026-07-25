//! Persistence Manager
//!
//! Responsible for project-scoped session persistence.

use crate::agentic::core::{
    strip_prompt_markup, CompressionState, Message, MessageContent, RecoveryCheckpoint,
    RecoveryCheckpointStatus, Session, SessionConfig, SessionKind, SessionState, SessionSummary,
};
use crate::agentic::session::{SessionPromptCache, PROMPT_CACHE_SCHEMA_VERSION};
use crate::infrastructure::PathManager;
use crate::service::remote_ssh::workspace_state::{
    resolve_workspace_session_identity, LOCAL_WORKSPACE_SSH_HOST,
};
use crate::service::session::{
    DialogTurnData, SessionMetadata, SessionRelationship, SessionRelationshipKind, SessionStatus,
    SessionTranscriptExport, SessionTranscriptExportOptions, SessionTranscriptIndexEntry,
    StoredSessionIndexFile, StoredSessionMetadataFile, ToolItemData, TranscriptLineRange,
    SESSION_STORAGE_SCHEMA_VERSION,
};
use crate::service::workspace_runtime::WorkspaceRuntimeService;
use crate::util::errors::{VoidError, VoidResult};
use fs2::FileExt;
use log::{debug, info, warn};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::fs;
use tokio::sync::Mutex;
use void_core_types::{
    SubagentTaskCheckpointRef, SubagentTaskDeliveryState, SubagentTaskRecord,
    SubagentTaskRecoveryBlockCode, SubagentTaskRecoveryState, SubagentTaskStatus,
};

const TRANSCRIPT_SCHEMA_VERSION: u32 = 1;
const JSON_WRITE_MAX_RETRIES: usize = 5;
const JSON_WRITE_RETRY_BASE_DELAY_MS: u64 = 30;
const SESSION_TRANSCRIPT_PREVIEW_CHAR_LIMIT: usize = 120;

static JSON_FILE_WRITE_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
static SESSION_INDEX_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
static SESSION_METADATA_UPDATE_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> =
    OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredDialogTurnFile {
    schema_version: u32,
    #[serde(flatten)]
    turn: DialogTurnData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSessionStateFile {
    schema_version: u32,
    config: SessionConfig,
    snapshot_session_id: Option<String>,
    // Derived runtime cache for reminder semantics. The source of truth lives
    // on persisted dialog turns via `DialogTurnData.agent_type`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_user_dialog_agent_type: Option<String>,
    // Session-level prompt-cache guard state. This records the most recent user
    // submission accepted by the scheduler and intentionally does not rewind on
    // history rollback.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_submitted_agent_type: Option<String>,
    compression_state: CompressionState,
    runtime_state: SessionState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSessionPromptCacheFile {
    schema_version: u32,
    #[serde(flatten)]
    cache: SessionPromptCache,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredTurnContextSnapshotFile {
    schema_version: u32,
    session_id: String,
    turn_index: usize,
    messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadataPage {
    pub sessions: Vec<SessionMetadata>,
    pub total_top_level_count: usize,
    pub loaded_top_level_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionMetadataPageCursor {
    last_active_at: u64,
    session_id: String,
}

#[derive(Debug, Default)]
struct ContextSnapshotPayloadStats {
    tool_result_count: usize,
    raw_result_string_chars: usize,
    result_for_assistant_chars: usize,
    largest_raw_result_chars: usize,
    largest_raw_result_path: String,
}

fn collect_json_string_stats(
    value: &serde_json::Value,
    path: &str,
    total: &mut usize,
    largest: &mut (usize, String),
) {
    match value {
        serde_json::Value::String(text) => {
            let char_count = text.chars().count();
            *total += char_count;
            if char_count > largest.0 {
                *largest = (char_count, path.to_string());
            }
        }
        serde_json::Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                collect_json_string_stats(item, &format!("{}[{}]", path, index), total, largest);
            }
        }
        serde_json::Value::Object(map) => {
            for (key, item) in map {
                let next_path = if path.is_empty() {
                    key.to_string()
                } else {
                    format!("{}.{}", path, key)
                };
                collect_json_string_stats(item, &next_path, total, largest);
            }
        }
        _ => {}
    }
}

fn context_snapshot_payload_stats(messages: &[Message]) -> ContextSnapshotPayloadStats {
    let mut stats = ContextSnapshotPayloadStats::default();
    for (message_index, message) in messages.iter().enumerate() {
        let MessageContent::ToolResult {
            tool_name,
            result,
            result_for_assistant,
            ..
        } = &message.content
        else {
            continue;
        };

        stats.tool_result_count += 1;
        if let Some(text) = result_for_assistant.as_deref() {
            stats.result_for_assistant_chars += text.chars().count();
        }

        let mut raw_chars = 0usize;
        let mut largest = (0usize, String::new());
        collect_json_string_stats(
            result,
            &format!("message[{}].{}", message_index, tool_name),
            &mut raw_chars,
            &mut largest,
        );
        stats.raw_result_string_chars += raw_chars;
        if largest.0 > stats.largest_raw_result_chars {
            stats.largest_raw_result_chars = largest.0;
            stats.largest_raw_result_path = largest.1;
        }
    }
    stats
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSessionTranscriptFile {
    schema_version: u32,
    #[serde(flatten)]
    transcript: SessionTranscriptExport,
}

#[derive(Debug, Clone, Serialize)]
struct TranscriptFingerprintPayload {
    session_id: String,
    tools: bool,
    tool_inputs: bool,
    thinking: bool,
    turn_selectors: Option<Vec<String>>,
    turns: Vec<TranscriptFingerprintTurn>,
}

#[derive(Debug, Clone, Serialize)]
struct TranscriptFingerprintTurn {
    turn_id: String,
    turn_index: usize,
    status: String,
    user: String,
    assistant: Vec<TranscriptFingerprintTextBlock>,
    tools: Vec<TranscriptFingerprintTool>,
    thinking: Vec<TranscriptFingerprintTextBlock>,
}

#[derive(Debug, Clone, Serialize)]
struct TranscriptFingerprintTextBlock {
    round_index: usize,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct TranscriptFingerprintTool {
    tool_name: String,
    tool_input: Option<String>,
    result: Option<String>,
}

#[derive(Debug, Clone)]
struct TranscriptTextBlock {
    round_index: usize,
    content: String,
}

#[derive(Debug, Clone)]
struct TranscriptToolBlock {
    tool_name: String,
    tool_input: Option<String>,
    result: Option<String>,
}

#[derive(Debug, Clone)]
enum TranscriptRoundBlock {
    Thinking(String),
    Assistant(String),
    Tool(TranscriptToolBlock),
}

#[derive(Debug, Clone)]
struct TranscriptRoundData {
    round_index: usize,
    blocks: Vec<TranscriptRoundBlock>,
}

#[derive(Debug, Clone)]
struct TranscriptSectionData {
    turn_index: usize,
    preview: String,
    lines: Vec<String>,
    turn_range: TranscriptLineRange,
    user_range: TranscriptLineRange,
}

#[derive(Debug, Clone, Copy)]
enum TranscriptTurnSelector {
    Index(isize),
    Slice {
        start: Option<isize>,
        end: Option<isize>,
    },
}

#[derive(Debug, Clone)]
struct ParsedTranscriptTurnSelector {
    normalized: String,
    selector: TranscriptTurnSelector,
}

pub struct PersistenceManager {
    path_manager: Arc<PathManager>,
    runtime_service: Arc<WorkspaceRuntimeService>,
}

impl PersistenceManager {
    fn build_session_relationship(
        session: &Session,
        existing: Option<&SessionMetadata>,
    ) -> Option<SessionRelationship> {
        let existing_relationship = existing.and_then(|value| value.relationship.clone());
        let existing_custom_metadata = existing.and_then(|value| value.custom_metadata.as_ref());

        let kind = match session.kind {
            SessionKind::Subagent => Some(SessionRelationshipKind::Subagent),
            SessionKind::EphemeralChild => Some(SessionRelationshipKind::Btw),
            SessionKind::Standard => existing_relationship
                .as_ref()
                .and_then(|value| value.kind.clone()),
        };

        let parent_session_id = existing_relationship
            .as_ref()
            .and_then(|value| value.parent_session_id.clone())
            .or_else(|| {
                existing_custom_metadata
                    .and_then(|value| value.get("parentSessionId"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            });
        let parent_request_id = existing_relationship
            .as_ref()
            .and_then(|value| value.parent_request_id.clone())
            .or_else(|| {
                existing_custom_metadata
                    .and_then(|value| value.get("parentRequestId"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            });
        let parent_dialog_turn_id = existing_relationship
            .as_ref()
            .and_then(|value| value.parent_dialog_turn_id.clone())
            .or_else(|| {
                existing_custom_metadata
                    .and_then(|value| value.get("parentDialogTurnId"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            });
        let parent_turn_index = existing_relationship
            .as_ref()
            .and_then(|value| value.parent_turn_index)
            .or_else(|| {
                existing_custom_metadata
                    .and_then(|value| value.get("parentTurnIndex"))
                    .and_then(|value| value.as_u64())
                    .map(|value| value as usize)
            });
        let parent_tool_call_id = existing_relationship
            .as_ref()
            .and_then(|value| value.parent_tool_call_id.clone())
            .or_else(|| {
                existing_custom_metadata
                    .and_then(|value| value.get("parentToolCallId"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            });
        let subagent_type = existing_relationship
            .as_ref()
            .and_then(|value| value.subagent_type.clone())
            .or_else(|| {
                existing_custom_metadata
                    .and_then(|value| value.get("subagentType"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            });

        if kind.is_none()
            && parent_session_id.is_none()
            && parent_request_id.is_none()
            && parent_dialog_turn_id.is_none()
            && parent_turn_index.is_none()
            && parent_tool_call_id.is_none()
            && subagent_type.is_none()
        {
            return None;
        }

        Some(SessionRelationship {
            kind,
            parent_session_id,
            parent_request_id,
            parent_dialog_turn_id,
            parent_turn_index,
            parent_tool_call_id,
            subagent_type,
        })
    }

    pub fn new(path_manager: Arc<PathManager>) -> VoidResult<Self> {
        Ok(Self {
            runtime_service: Arc::new(WorkspaceRuntimeService::new(path_manager.clone())),
            path_manager,
        })
    }

    /// Get PathManager reference
    pub fn path_manager(&self) -> &Arc<PathManager> {
        &self.path_manager
    }

    pub fn runtime_service(&self) -> &Arc<WorkspaceRuntimeService> {
        &self.runtime_service
    }

    /// Resolve the on-disk sessions directory for `workspace_path`.
    ///
    /// For local workspaces this delegates to `PathManager::project_sessions_dir`,
    /// which slugifies the workspace root under `~/.void/projects/`.
    ///
    /// For remote SSH workspaces, callers (notably `desktop_effective_session_storage_path`)
    /// pass an already-resolved mirror path under `~/.void/remote_ssh/{host}/{path}/sessions`.
    /// In that case we MUST use the path as-is; otherwise the slug pipeline would treat the
    /// mirror path as a workspace root and write/read to a bogus
    /// `~/.void/projects/<slug-of-mirror-path>/sessions/` location.
    fn project_sessions_dir(&self, workspace_path: &Path) -> PathBuf {
        let remote_mirror_root = PathManager::remote_ssh_mirror_root();
        if workspace_path.starts_with(&remote_mirror_root) {
            // Already resolved: either the mirror runtime root, the mirror sessions dir,
            // or a session sub-dir. Treat the path as the sessions root directly.
            // (Inputs that already include a trailing `sessions` segment stay correct;
            // inputs at the mirror runtime root would historically fall back to the
            // legacy slug, but no current call-site uses that shape.)
            return workspace_path.to_path_buf();
        }
        self.path_manager.project_sessions_dir(workspace_path)
    }

    fn session_dir(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.project_sessions_dir(workspace_path).join(session_id)
    }

    fn validate_subagent_task_id(task_id: &str) -> VoidResult<()> {
        if task_id.is_empty()
            || !task_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err(VoidError::Validation(format!(
                "Invalid subagent task id: {task_id}"
            )));
        }
        Ok(())
    }

    fn subagent_tasks_dir(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("subagent-tasks")
    }

    fn subagent_task_path(
        &self,
        workspace_path: &Path,
        session_id: &str,
        task_id: &str,
    ) -> VoidResult<PathBuf> {
        Self::validate_subagent_task_id(task_id)?;
        Ok(self
            .subagent_tasks_dir(workspace_path, session_id)
            .join(format!("{task_id}.json")))
    }

    async fn acquire_subagent_task_file_lock(&self, task_path: &Path) -> VoidResult<File> {
        let lock_path = task_path.with_extension("lock");
        if let Some(parent) = lock_path.parent() {
            fs::create_dir_all(parent).await.map_err(|error| {
                VoidError::io(format!(
                    "Failed to create subagent task lock directory {}: {}",
                    parent.display(),
                    error
                ))
            })?;
        }
        tokio::task::spawn_blocking(move || {
            let file = OpenOptions::new()
                .create(true)
                .read(true)
                .write(true)
                .open(&lock_path)
                .map_err(|error| {
                    VoidError::io(format!(
                        "Failed to open subagent task lock {}: {}",
                        lock_path.display(),
                        error
                    ))
                })?;
            file.lock_exclusive().map_err(|error| {
                VoidError::io(format!(
                    "Failed to lock subagent task {}: {}",
                    lock_path.display(),
                    error
                ))
            })?;
            Ok(file)
        })
        .await
        .map_err(|error| VoidError::service(format!("Subagent task lock worker failed: {error}")))?
    }

    async fn read_subagent_task_optional(
        &self,
        path: &Path,
    ) -> VoidResult<Option<SubagentTaskRecord>> {
        let mut task = self.read_json_optional::<SubagentTaskRecord>(path).await?;
        if let Some(task) = task.as_mut() {
            task.upgrade_legacy_fields();
        }
        Ok(task)
    }

    fn metadata_path(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("metadata.json")
    }

    fn state_path(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("state.json")
    }

    fn prompt_cache_path(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("prompt_cache.json")
    }

    fn turns_dir(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id).join("turns")
    }

    fn snapshots_dir(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("snapshots")
    }

    fn artifacts_dir(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("artifacts")
    }

    fn turn_path(&self, workspace_path: &Path, session_id: &str, turn_index: usize) -> PathBuf {
        self.turns_dir(workspace_path, session_id)
            .join(format!("turn-{:04}.json", turn_index))
    }

    fn context_snapshot_path(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> PathBuf {
        self.snapshots_dir(workspace_path, session_id)
            .join(format!("context-{:04}.json", turn_index))
    }

    fn recovery_checkpoint_path(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.session_dir(workspace_path, session_id)
            .join("recovery-checkpoint.json")
    }

    fn transcript_path(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.artifacts_dir(workspace_path, session_id)
            .join("transcript.txt")
    }

    fn transcript_meta_path(&self, workspace_path: &Path, session_id: &str) -> PathBuf {
        self.artifacts_dir(workspace_path, session_id)
            .join("transcript.meta.json")
    }

    fn index_path(&self, workspace_path: &Path) -> PathBuf {
        self.project_sessions_dir(workspace_path).join("index.json")
    }

    fn existing_project_sessions_dir(&self, workspace_path: &Path) -> Option<PathBuf> {
        let dir = self.project_sessions_dir(workspace_path);
        dir.exists().then_some(dir)
    }

    async fn ensure_runtime_for_write(&self, workspace_path: &Path) -> VoidResult<()> {
        let remote_mirror_root = PathManager::remote_ssh_mirror_root();
        if workspace_path.starts_with(&remote_mirror_root) {
            return Ok(());
        }

        self.runtime_service
            .ensure_local_workspace_runtime(workspace_path)
            .await
            .map(|_| ())
    }

    async fn ensure_session_dir(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<PathBuf> {
        let dir = self.session_dir(workspace_path, session_id);
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to create session directory: {}", e)))?;
        Ok(dir)
    }

    async fn ensure_turns_dir(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<PathBuf> {
        let dir = self.turns_dir(workspace_path, session_id);
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to create turns directory: {}", e)))?;
        Ok(dir)
    }

    async fn ensure_snapshots_dir(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<PathBuf> {
        let dir = self.snapshots_dir(workspace_path, session_id);
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to create snapshots directory: {}", e)))?;
        Ok(dir)
    }

    async fn ensure_artifacts_dir(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<PathBuf> {
        let dir = self.artifacts_dir(workspace_path, session_id);
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to create artifacts directory: {}", e)))?;
        Ok(dir)
    }

    async fn read_json_optional<T: DeserializeOwned>(
        &self,
        path: &Path,
    ) -> VoidResult<Option<T>> {
        let started_at = Instant::now();
        let metadata_started_at = Instant::now();
        let metadata = match fs::metadata(path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(VoidError::io(format!(
                    "Failed to read JSON metadata {}: {}",
                    path.display(),
                    error
                )));
            }
        };
        let metadata_duration = metadata_started_at.elapsed();

        let read_started_at = Instant::now();
        let content = fs::read_to_string(path).await.map_err(|e| {
            VoidError::io(format!(
                "Failed to read JSON file {}: {}",
                path.display(),
                e
            ))
        })?;
        let read_duration = read_started_at.elapsed();

        let parse_started_at = Instant::now();
        let value = serde_json::from_str::<T>(&content).map_err(|e| {
            VoidError::Deserialization(format!(
                "Failed to deserialize JSON file {}: {}",
                path.display(),
                e
            ))
        })?;
        let parse_duration = parse_started_at.elapsed();
        let total_duration = started_at.elapsed();

        if total_duration >= Duration::from_millis(80) || metadata.len() >= 1024 * 1024 {
            debug!(
                "Read JSON file: path={} type={} size_bytes={} metadata_duration_ms={} read_duration_ms={} parse_duration_ms={} total_duration_ms={}",
                path.display(),
                std::any::type_name::<T>(),
                metadata.len(),
                metadata_duration.as_millis(),
                read_duration.as_millis(),
                parse_duration.as_millis(),
                total_duration.as_millis()
            );
        }

        Ok(Some(value))
    }

    async fn write_json_atomic<T: Serialize>(&self, path: &Path, value: &T) -> VoidResult<()> {
        let parent = path.parent().ok_or_else(|| {
            VoidError::io(format!(
                "Target path has no parent directory: {}",
                path.display()
            ))
        })?;

        fs::create_dir_all(parent)
            .await
            .map_err(|e| VoidError::io(format!("Failed to create parent directory: {}", e)))?;

        let json = serde_json::to_string_pretty(value)
            .map_err(|e| VoidError::serialization(format!("Failed to serialize JSON: {}", e)))?;
        let lock = Self::get_file_write_lock(path).await;
        let _lock_guard = lock.lock().await;

        let json_bytes = json.into_bytes();
        let mut last_replace_error: Option<std::io::Error> = None;

        for attempt in 0..=JSON_WRITE_MAX_RETRIES {
            let tmp_path = Self::build_temp_json_path(path, attempt)?;
            if let Err(e) = fs::write(&tmp_path, &json_bytes).await {
                return Err(VoidError::io(format!(
                    "Failed to write temp JSON file: {}",
                    e
                )));
            }

            match Self::replace_file_from_temp(path, &tmp_path).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    let should_retry =
                        Self::is_retryable_write_error(&e) && attempt < JSON_WRITE_MAX_RETRIES;
                    last_replace_error = Some(e);
                    let _ = fs::remove_file(&tmp_path).await;

                    if should_retry {
                        tokio::time::sleep(Self::retry_delay(attempt)).await;
                        continue;
                    }

                    break;
                }
            }
        }

        if let Some(error) = last_replace_error {
            // On Windows, external scanners/file indexers may temporarily hold a non-shareable
            // handle, making delete/rename fail with PermissionDenied. Fallback to direct write
            // to avoid losing session persistence while keeping best-effort atomic behavior.
            if error.kind() == ErrorKind::PermissionDenied {
                warn!(
                    "Atomic JSON replace permission denied for {}, fallback to direct overwrite",
                    path.display()
                );
                fs::write(path, &json_bytes).await.map_err(|e| {
                    VoidError::io(format!(
                        "Failed fallback JSON overwrite {}: {}",
                        path.display(),
                        e
                    ))
                })?;
                return Ok(());
            }

            return Err(VoidError::io(format!(
                "Failed to replace JSON file: {}",
                error
            )));
        }

        Err(VoidError::io(format!(
            "Failed to replace JSON file {}: unknown error",
            path.display()
        )))
    }

    async fn get_file_write_lock(path: &Path) -> Arc<Mutex<()>> {
        let registry = JSON_FILE_WRITE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut registry_guard = registry.lock().await;
        registry_guard
            .entry(path.to_path_buf())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    async fn get_session_index_lock(&self, workspace_path: &Path) -> Arc<Mutex<()>> {
        let index_path = self.index_path(workspace_path);
        let registry = SESSION_INDEX_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut registry_guard = registry.lock().await;
        registry_guard
            .entry(index_path)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    async fn get_session_metadata_update_lock(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> Arc<Mutex<()>> {
        let metadata_path = self.metadata_path(workspace_path, session_id);
        let registry = SESSION_METADATA_UPDATE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut registry_guard = registry.lock().await;
        registry_guard
            .entry(metadata_path)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn build_temp_json_path(path: &Path, attempt: usize) -> VoidResult<PathBuf> {
        let parent = path.parent().ok_or_else(|| {
            VoidError::io(format!(
                "Target path has no parent directory: {}",
                path.display()
            ))
        })?;

        let file_name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "data.json".to_string());
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let temp_name = format!(
            ".{}.{}.{}.{}.tmp",
            file_name,
            std::process::id(),
            nonce,
            attempt
        );
        Ok(parent.join(temp_name))
    }

    async fn replace_file_from_temp(target_path: &Path, tmp_path: &Path) -> std::io::Result<()> {
        if let Ok(()) = fs::rename(tmp_path, target_path).await {
            return Ok(());
        }

        if target_path.exists() {
            match fs::remove_file(target_path).await {
                Ok(()) => {}
                Err(e) if e.kind() == ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
        }

        fs::rename(tmp_path, target_path).await
    }

    fn is_retryable_write_error(error: &std::io::Error) -> bool {
        matches!(
            error.kind(),
            ErrorKind::PermissionDenied
                | ErrorKind::WouldBlock
                | ErrorKind::Interrupted
                | ErrorKind::TimedOut
                | ErrorKind::AlreadyExists
                | ErrorKind::Other
        )
    }

    fn retry_delay(attempt: usize) -> Duration {
        let exp = attempt.min(6) as u32;
        Duration::from_millis(JSON_WRITE_RETRY_BASE_DELAY_MS * (1u64 << exp))
    }

    fn system_time_to_unix_ms(time: SystemTime) -> u64 {
        time.duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    fn unix_ms_to_system_time(timestamp_ms: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(timestamp_ms)
    }

    fn sanitize_messages_for_persistence(messages: &[Message]) -> Vec<Message> {
        messages
            .iter()
            .map(Self::sanitize_message_for_persistence)
            .collect()
    }

    fn sanitize_message_for_persistence(message: &Message) -> Message {
        let mut sanitized = message.clone();

        match &mut sanitized.content {
            MessageContent::Multimodal { images, .. } => {
                for image in images.iter_mut() {
                    if image.data_url.as_ref().is_some_and(|v| !v.is_empty()) {
                        image.data_url = None;

                        let mut metadata = image
                            .metadata
                            .take()
                            .unwrap_or_else(|| serde_json::json!({}));
                        if !metadata.is_object() {
                            metadata = serde_json::json!({ "raw_metadata": metadata });
                        }
                        if let Some(obj) = metadata.as_object_mut() {
                            obj.insert("has_data_url".to_string(), serde_json::json!(true));
                        }
                        image.metadata = Some(metadata);
                    }
                }
            }
            MessageContent::ToolResult {
                result,
                image_attachments,
                ..
            } => {
                Self::redact_data_url_in_json(result);
                if image_attachments.is_some() {
                    *image_attachments = None;
                }
            }
            _ => {}
        }

        sanitized
    }

    fn redact_data_url_in_json(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                let had_data_url = map.remove("data_url").is_some();
                if had_data_url {
                    map.insert("has_data_url".to_string(), serde_json::json!(true));
                }
                for child in map.values_mut() {
                    Self::redact_data_url_in_json(child);
                }
            }
            serde_json::Value::Array(arr) => {
                for child in arr {
                    Self::redact_data_url_in_json(child);
                }
            }
            _ => {}
        }
    }

    fn sanitize_runtime_state(state: &SessionState) -> SessionState {
        match state {
            SessionState::Processing { .. } => SessionState::Idle,
            other => other.clone(),
        }
    }

    async fn build_session_metadata(
        &self,
        workspace_path: &Path,
        session: &Session,
        existing: Option<&SessionMetadata>,
    ) -> SessionMetadata {
        let created_at = existing
            .map(|value| value.created_at)
            .unwrap_or_else(|| Self::system_time_to_unix_ms(session.created_at));
        let last_active_at = Self::system_time_to_unix_ms(session.last_activity_at);
        let model_name = session
            .config
            .model_id
            .clone()
            .or_else(|| existing.map(|value| value.model_name.clone()))
            .unwrap_or_else(|| "default".to_string());

        let resolved_identity =
            if let Some(workspace_root) = session.config.workspace_path.as_deref() {
                resolve_workspace_session_identity(
                    workspace_root,
                    session.config.remote_connection_id.as_deref(),
                    session.config.remote_ssh_host.as_deref(),
                )
                .await
            } else {
                None
            };

        let workspace_root = resolved_identity
            .as_ref()
            .map(|identity| identity.logical_workspace_path().to_string())
            .or_else(|| session.config.workspace_path.clone())
            .or_else(|| existing.and_then(|value| value.workspace_path.clone()))
            .unwrap_or_else(|| workspace_path.to_string_lossy().to_string());
        let workspace_hostname = resolved_identity
            .as_ref()
            .map(|identity| identity.hostname.clone())
            .or_else(|| existing.and_then(|value| value.workspace_hostname.clone()))
            .or_else(|| {
                if session.config.remote_connection_id.is_some() {
                    session.config.remote_ssh_host.clone()
                } else {
                    Some(LOCAL_WORKSPACE_SSH_HOST.to_string())
                }
            });

        SessionMetadata {
            session_id: session.session_id.clone(),
            session_name: session.session_name.clone(),
            agent_type: session.agent_type.clone(),
            last_user_dialog_agent_type: session.last_user_dialog_agent_type.clone(),
            last_submitted_agent_type: session.last_submitted_agent_type.clone(),
            created_by: session
                .created_by
                .clone()
                .or_else(|| existing.and_then(|value| value.created_by.clone())),
            session_kind: session.kind,
            model_name,
            created_at,
            last_active_at,
            turn_count: session.dialog_turn_ids.len(),
            message_count: existing.map(|value| value.message_count).unwrap_or(0),
            tool_call_count: existing.map(|value| value.tool_call_count).unwrap_or(0),
            status: existing
                .map(|value| value.status.clone())
                .unwrap_or(SessionStatus::Active),
            terminal_session_id: existing.and_then(|value| value.terminal_session_id.clone()),
            snapshot_session_id: session
                .snapshot_session_id
                .clone()
                .or_else(|| existing.and_then(|value| value.snapshot_session_id.clone())),
            tags: existing.map(|value| value.tags.clone()).unwrap_or_default(),
            custom_metadata: existing.and_then(|value| value.custom_metadata.clone()),
            relationship: Self::build_session_relationship(session, existing),
            todos: existing.and_then(|value| value.todos.clone()),
            deep_review_run_manifest: existing
                .and_then(|value| value.deep_review_run_manifest.clone()),
            deep_review_cache: existing.and_then(|value| value.deep_review_cache.clone()),
            workspace_path: Some(workspace_root),
            workspace_hostname,
            unread_completion: existing.and_then(|value| value.unread_completion.clone()),
            needs_user_attention: existing.and_then(|value| value.needs_user_attention.clone()),
        }
    }

    fn turn_status_label(status: &crate::service::session::TurnStatus) -> &'static str {
        match status {
            crate::service::session::TurnStatus::InProgress => "inprogress",
            crate::service::session::TurnStatus::Completed => "completed",
            crate::service::session::TurnStatus::Error => "error",
            crate::service::session::TurnStatus::Cancelled => "cancelled",
        }
    }

    fn transcript_preview(content: &str) -> String {
        let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.is_empty() {
            return "(empty user message)".to_string();
        }

        let mut preview: String = normalized
            .chars()
            .take(SESSION_TRANSCRIPT_PREVIEW_CHAR_LIMIT)
            .collect();
        if normalized.chars().count() > SESSION_TRANSCRIPT_PREVIEW_CHAR_LIMIT {
            preview.push_str("...");
        }
        preview
    }

    fn transcript_text_lines(content: &str) -> Vec<String> {
        if content.is_empty() {
            return vec!["(empty)".to_string()];
        }

        let lines = content
            .lines()
            .map(|line| line.to_string())
            .collect::<Vec<_>>();
        if lines.is_empty() {
            vec!["(empty)".to_string()]
        } else {
            lines
        }
    }

    fn transcript_value_string(value: &serde_json::Value) -> String {
        match value {
            serde_json::Value::String(text) => text.clone(),
            _ => serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()),
        }
    }

    fn transcript_tool_input(item: &ToolItemData, tool_inputs: bool) -> Option<String> {
        if !tool_inputs || item.tool_call.input.is_null() {
            return None;
        }

        Some(Self::transcript_value_string(&item.tool_call.input))
    }

    fn transcript_tool_result(item: &ToolItemData) -> Option<String> {
        item.tool_result.as_ref().and_then(|result| {
            result
                .result_for_assistant
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .or_else(|| {
                    if result.result.is_null() {
                        None
                    } else {
                        Some(Self::transcript_value_string(&result.result))
                    }
                })
        })
    }

    fn transcript_display_user_content(turn: &DialogTurnData) -> String {
        turn.user_message
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("original_text"))
            .and_then(|value| value.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| strip_prompt_markup(&turn.user_message.content))
    }

    fn transcript_assistant_blocks(turn: &DialogTurnData) -> Vec<TranscriptTextBlock> {
        turn.model_rounds
            .iter()
            .filter_map(|round| {
                let content = round
                    .text_items
                    .iter()
                    .filter(|item| !item.is_subagent_item.unwrap_or(false))
                    .map(|item| item.content.trim())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                if content.is_empty() {
                    None
                } else {
                    Some(TranscriptTextBlock {
                        round_index: round.round_index,
                        content,
                    })
                }
            })
            .collect()
    }

    fn transcript_thinking_blocks(turn: &DialogTurnData) -> Vec<TranscriptTextBlock> {
        turn.model_rounds
            .iter()
            .filter_map(|round| {
                let content = round
                    .thinking_items
                    .iter()
                    .filter(|item| !item.is_subagent_item.unwrap_or(false))
                    .map(|item| item.content.trim())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                if content.is_empty() {
                    None
                } else {
                    Some(TranscriptTextBlock {
                        round_index: round.round_index,
                        content,
                    })
                }
            })
            .collect()
    }

    fn transcript_tool_blocks(
        turn: &DialogTurnData,
        tool_inputs: bool,
    ) -> Vec<TranscriptToolBlock> {
        turn.model_rounds
            .iter()
            .flat_map(|round| round.tool_items.iter())
            .filter(|item| !item.is_subagent_item.unwrap_or(false))
            .map(|item| TranscriptToolBlock {
                tool_name: item.tool_name.clone(),
                tool_input: Self::transcript_tool_input(item, tool_inputs),
                result: Self::transcript_tool_result(item),
            })
            .collect()
    }

    fn transcript_round_blocks(
        turn: &DialogTurnData,
        options: &SessionTranscriptExportOptions,
    ) -> Vec<TranscriptRoundData> {
        turn.model_rounds
            .iter()
            .filter_map(|round| {
                let thinking_content = if options.thinking {
                    round
                        .thinking_items
                        .iter()
                        .filter(|item| !item.is_subagent_item.unwrap_or(false))
                        .map(|item| item.content.trim())
                        .filter(|value| !value.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n\n")
                } else {
                    String::new()
                };

                let assistant_content = round
                    .text_items
                    .iter()
                    .filter(|item| !item.is_subagent_item.unwrap_or(false))
                    .map(|item| item.content.trim())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n\n");

                let tool_blocks = if options.tools {
                    round
                        .tool_items
                        .iter()
                        .filter(|item| !item.is_subagent_item.unwrap_or(false))
                        .map(|item| TranscriptToolBlock {
                            tool_name: item.tool_name.clone(),
                            tool_input: Self::transcript_tool_input(item, options.tool_inputs),
                            result: Self::transcript_tool_result(item),
                        })
                        .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };

                if thinking_content.is_empty()
                    && assistant_content.is_empty()
                    && tool_blocks.is_empty()
                {
                    return None;
                }

                let mut blocks = Vec::new();
                if !thinking_content.is_empty() {
                    blocks.push(TranscriptRoundBlock::Thinking(thinking_content));
                }
                if !assistant_content.is_empty() {
                    blocks.push(TranscriptRoundBlock::Assistant(assistant_content));
                }
                for tool in tool_blocks {
                    blocks.push(TranscriptRoundBlock::Tool(tool));
                }

                Some(TranscriptRoundData {
                    round_index: round.round_index,
                    blocks,
                })
            })
            .collect()
    }

    fn transcript_fingerprint(
        session_id: &str,
        turns: &[DialogTurnData],
        options: &SessionTranscriptExportOptions,
    ) -> VoidResult<String> {
        let payload = TranscriptFingerprintPayload {
            session_id: session_id.to_string(),
            tools: options.tools,
            tool_inputs: options.tool_inputs,
            thinking: options.thinking,
            turn_selectors: options.turns.clone(),
            turns: turns
                .iter()
                .map(|turn| TranscriptFingerprintTurn {
                    turn_id: turn.turn_id.clone(),
                    turn_index: turn.turn_index,
                    status: Self::turn_status_label(&turn.status).to_string(),
                    user: Self::transcript_display_user_content(turn),
                    assistant: Self::transcript_assistant_blocks(turn)
                        .into_iter()
                        .map(|block| TranscriptFingerprintTextBlock {
                            round_index: block.round_index,
                            content: block.content,
                        })
                        .collect(),
                    tools: if options.tools {
                        Self::transcript_tool_blocks(turn, options.tool_inputs)
                            .into_iter()
                            .map(|tool| TranscriptFingerprintTool {
                                tool_name: tool.tool_name,
                                tool_input: tool.tool_input,
                                result: tool.result,
                            })
                            .collect()
                    } else {
                        Vec::new()
                    },
                    thinking: if options.thinking {
                        Self::transcript_thinking_blocks(turn)
                            .into_iter()
                            .map(|block| TranscriptFingerprintTextBlock {
                                round_index: block.round_index,
                                content: block.content,
                            })
                            .collect()
                    } else {
                        Vec::new()
                    },
                })
                .collect(),
        };

        let bytes = serde_json::to_vec(&payload).map_err(|e| {
            VoidError::serialization(format!("Failed to serialize transcript fingerprint: {}", e))
        })?;
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        Ok(format!("{:x}", hasher.finalize()))
    }

    fn push_transcript_block(
        lines: &mut Vec<String>,
        label: &str,
        body_lines: Vec<String>,
    ) -> TranscriptLineRange {
        let start_line = lines.len() + 1;
        lines.push(format!("[{}]", label));
        lines.extend(body_lines);
        lines.push(format!("[/{}]", label));
        TranscriptLineRange {
            start_line,
            end_line: lines.len(),
        }
    }

    fn build_transcript_section(
        turn: &DialogTurnData,
        options: &SessionTranscriptExportOptions,
    ) -> TranscriptSectionData {
        let user_content = Self::transcript_display_user_content(turn);
        let round_blocks = Self::transcript_round_blocks(turn, options);

        let mut lines = Vec::new();
        lines.push(format!("## Turn {}", turn.turn_index));
        lines.push(String::new());

        let user_range = Self::push_transcript_block(
            &mut lines,
            "user",
            Self::transcript_text_lines(&user_content),
        );

        if !round_blocks.is_empty() {
            lines.push(String::new());
            for (round_index, round) in round_blocks.iter().enumerate() {
                lines.push(format!("[assistant_round {}]", round.round_index));
                for (block_index, block) in round.blocks.iter().enumerate() {
                    match block {
                        TranscriptRoundBlock::Thinking(content) => {
                            lines.push("[thinking]".to_string());
                            lines.extend(Self::transcript_text_lines(content));
                            lines.push("[/thinking]".to_string());
                        }
                        TranscriptRoundBlock::Assistant(content) => {
                            lines.push("[text]".to_string());
                            lines.extend(Self::transcript_text_lines(content));
                            lines.push("[/text]".to_string());
                        }
                        TranscriptRoundBlock::Tool(tool) => {
                            lines.push("[tool]".to_string());
                            lines.push(format!("name: {}", tool.tool_name));
                            if let Some(tool_input) = tool.tool_input.as_ref() {
                                lines.push("input:".to_string());
                                lines.extend(Self::transcript_text_lines(tool_input));
                            }
                            if let Some(result) = tool.result.as_ref() {
                                lines.push("result:".to_string());
                                lines.extend(Self::transcript_text_lines(result));
                            }
                            lines.push("[/tool]".to_string());
                        }
                    }

                    if block_index + 1 < round.blocks.len() {
                        lines.push(String::new());
                    }
                }
                lines.push(format!("[/assistant_round {}]", round.round_index));
                if round_index + 1 < round_blocks.len() {
                    lines.push(String::new());
                }
            }
        }

        TranscriptSectionData {
            turn_index: turn.turn_index,
            preview: Self::transcript_preview(&user_content),
            turn_range: TranscriptLineRange {
                start_line: 1,
                end_line: lines.len(),
            },
            user_range,
            lines,
        }
    }

    fn offset_range(range: &TranscriptLineRange, offset: usize) -> TranscriptLineRange {
        TranscriptLineRange {
            start_line: range.start_line + offset,
            end_line: range.end_line + offset,
        }
    }

    fn format_range(range: &TranscriptLineRange) -> String {
        format!("{}-{}", range.start_line, range.end_line)
    }

    fn parse_transcript_turn_selectors(
        selectors: &[String],
    ) -> VoidResult<Vec<ParsedTranscriptTurnSelector>> {
        if selectors.is_empty() {
            return Err(VoidError::Validation(
                "turns cannot be an empty array".to_string(),
            ));
        }

        selectors
            .iter()
            .map(|selector| Self::parse_transcript_turn_selector(selector))
            .collect()
    }

    fn parse_transcript_turn_selector(
        selector: &str,
    ) -> VoidResult<ParsedTranscriptTurnSelector> {
        let normalized = selector.trim();
        if normalized.is_empty() {
            return Err(VoidError::Validation(
                "turns cannot contain empty selectors".to_string(),
            ));
        }

        if normalized.matches(':').count() > 1 {
            return Err(VoidError::Validation(format!(
                "Invalid turn selector '{}'. Use forms like ':20', '-20:', '10:30', or '15'.",
                normalized
            )));
        }

        let selector = if let Some((start, end)) = normalized.split_once(':') {
            TranscriptTurnSelector::Slice {
                start: if start.is_empty() {
                    None
                } else {
                    Some(Self::parse_transcript_turn_value(start, normalized)?)
                },
                end: if end.is_empty() {
                    None
                } else {
                    Some(Self::parse_transcript_turn_value(end, normalized)?)
                },
            }
        } else {
            TranscriptTurnSelector::Index(Self::parse_transcript_turn_value(
                normalized, normalized,
            )?)
        };

        Ok(ParsedTranscriptTurnSelector {
            normalized: normalized.to_string(),
            selector,
        })
    }

    fn parse_transcript_turn_value(value: &str, selector: &str) -> VoidResult<isize> {
        value.parse::<isize>().map_err(|_| {
            VoidError::Validation(format!(
                "Invalid turn selector '{}'. Use forms like ':20', '-20:', '10:30', or '15'.",
                selector
            ))
        })
    }

    fn transcript_normalize_slice_bound(
        total: usize,
        bound: Option<isize>,
        default: usize,
    ) -> usize {
        let Some(bound) = bound else {
            return default;
        };

        let total = total as isize;
        let normalized = if bound < 0 {
            total.saturating_add(bound)
        } else {
            bound
        };
        normalized.clamp(0, total) as usize
    }

    fn transcript_normalize_index(total: usize, index: isize) -> Option<usize> {
        let total = total as isize;
        let normalized = if index < 0 {
            total.saturating_add(index)
        } else {
            index
        };

        if normalized < 0 || normalized >= total {
            None
        } else {
            Some(normalized as usize)
        }
    }

    fn transcript_select_turn_indices(
        total: usize,
        selectors: &[ParsedTranscriptTurnSelector],
    ) -> Vec<usize> {
        let mut selected = vec![false; total];

        for selector in selectors {
            match selector.selector {
                TranscriptTurnSelector::Index(index) => {
                    if let Some(index) = Self::transcript_normalize_index(total, index) {
                        selected[index] = true;
                    }
                }
                TranscriptTurnSelector::Slice { start, end } => {
                    let start = Self::transcript_normalize_slice_bound(total, start, 0);
                    let end = Self::transcript_normalize_slice_bound(total, end, total);
                    if start < end {
                        selected[start..end].fill(true);
                    }
                }
            }
        }

        selected
            .into_iter()
            .enumerate()
            .filter_map(|(index, is_selected)| is_selected.then_some(index))
            .collect()
    }

    fn transcript_omitted_turns_label(
        turns: &[DialogTurnData],
        start: usize,
        end: usize,
    ) -> String {
        let start_turn = turns[start].turn_index;
        let end_turn = turns[end].turn_index;
        if start_turn == end_turn {
            format!("(omitted turn {})", start_turn)
        } else {
            format!("(omitted turns {}-{})", start_turn, end_turn)
        }
    }

    async fn scan_session_metadata_dirs(
        &self,
        workspace_path: &Path,
    ) -> VoidResult<Vec<SessionMetadata>> {
        let Some(sessions_root) = self.existing_project_sessions_dir(workspace_path) else {
            return Ok(Vec::new());
        };
        let mut metadata_list = Vec::new();
        let mut entries = fs::read_dir(&sessions_root)
            .await
            .map_err(|e| VoidError::io(format!("Failed to read sessions root: {}", e)))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| {
            VoidError::io(format!("Failed to read session directory entry: {}", e))
        })? {
            let file_type = entry
                .file_type()
                .await
                .map_err(|e| VoidError::io(format!("Failed to get file type: {}", e)))?;
            if !file_type.is_dir() {
                continue;
            }

            let session_id = entry.file_name().to_string_lossy().to_string();
            match self
                .load_session_metadata(workspace_path, &session_id)
                .await
            {
                Ok(Some(metadata)) => metadata_list.push(metadata),
                Ok(None) => {}
                Err(e) => {
                    warn!(
                        "Failed to rebuild session index entry: session_id={}, error={}",
                        session_id, e
                    );
                }
            }
        }

        metadata_list.sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));

        Ok(metadata_list)
    }

    async fn count_session_metadata_dirs(&self, workspace_path: &Path) -> VoidResult<usize> {
        let Some(sessions_root) = self.existing_project_sessions_dir(workspace_path) else {
            return Ok(0);
        };
        let mut count = 0;
        let mut entries = fs::read_dir(&sessions_root)
            .await
            .map_err(|e| VoidError::io(format!("Failed to read sessions root: {}", e)))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| {
            VoidError::io(format!("Failed to read session directory entry: {}", e))
        })? {
            let file_type = entry
                .file_type()
                .await
                .map_err(|e| VoidError::io(format!("Failed to get file type: {}", e)))?;
            if !file_type.is_dir() {
                continue;
            }

            let session_id = entry.file_name().to_string_lossy().to_string();
            if self.metadata_path(workspace_path, &session_id).exists() {
                count += 1;
            }
        }

        Ok(count)
    }

    async fn rebuild_index_locked(
        &self,
        workspace_path: &Path,
    ) -> VoidResult<Vec<SessionMetadata>> {
        let metadata_list = self.scan_session_metadata_dirs(workspace_path).await?;
        let metadata_file_count = metadata_list.len();
        let visible_sessions = metadata_list
            .into_iter()
            .filter(|metadata| !metadata.should_hide_from_user_lists())
            .collect::<Vec<_>>();

        let index = StoredSessionIndexFile::with_metadata_file_count(
            Self::system_time_to_unix_ms(SystemTime::now()),
            visible_sessions.clone(),
            metadata_file_count,
        );
        self.write_json_atomic(&self.index_path(workspace_path), &index)
            .await?;

        Ok(visible_sessions)
    }

    async fn upsert_index_entry_locked(
        &self,
        workspace_path: &Path,
        metadata: &SessionMetadata,
        metadata_file_created: bool,
    ) -> VoidResult<()> {
        let index_path = self.index_path(workspace_path);
        let existing_index = self
            .read_json_optional::<StoredSessionIndexFile>(&index_path)
            .await?;
        let had_index = existing_index.is_some();
        let mut index = match existing_index {
            Some(index) => index,
            None => StoredSessionIndexFile {
                schema_version: SESSION_STORAGE_SCHEMA_VERSION,
                updated_at: 0,
                metadata_file_count: self.count_session_metadata_dirs(workspace_path).await?,
                sessions: Vec::new(),
            },
        };

        if let Some(existing) = index
            .sessions
            .iter_mut()
            .find(|value| value.session_id == metadata.session_id)
        {
            *existing = metadata.clone();
        } else {
            index.sessions.push(metadata.clone());
        }

        index
            .sessions
            .sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));
        if had_index && metadata_file_created {
            index.metadata_file_count = index.metadata_file_count.saturating_add(1);
        }
        index.updated_at = Self::system_time_to_unix_ms(SystemTime::now());
        index.schema_version = SESSION_STORAGE_SCHEMA_VERSION;
        self.write_json_atomic(&index_path, &index).await
    }

    async fn remove_index_entry_locked(
        &self,
        workspace_path: &Path,
        session_id: &str,
        metadata_file_count_delta: isize,
    ) -> VoidResult<()> {
        let index_path = self.index_path(workspace_path);
        let Some(mut index) = self
            .read_json_optional::<StoredSessionIndexFile>(&index_path)
            .await?
        else {
            return Ok(());
        };

        index
            .sessions
            .retain(|value| value.session_id != session_id);
        if metadata_file_count_delta > 0 {
            index.metadata_file_count = index
                .metadata_file_count
                .saturating_add(metadata_file_count_delta as usize);
        } else if metadata_file_count_delta < 0 {
            index.metadata_file_count = index
                .metadata_file_count
                .saturating_sub(metadata_file_count_delta.unsigned_abs());
        }
        index.updated_at = Self::system_time_to_unix_ms(SystemTime::now());
        self.write_json_atomic(&index_path, &index).await
    }

    pub async fn list_session_metadata(
        &self,
        workspace_path: &Path,
    ) -> VoidResult<Vec<SessionMetadata>> {
        if !workspace_path.exists() {
            return Ok(Vec::new());
        }

        if self.existing_project_sessions_dir(workspace_path).is_none() {
            return Ok(Vec::new());
        }

        let lock = self.get_session_index_lock(workspace_path).await;
        let _guard = lock.lock().await;
        let index_path = self.index_path(workspace_path);
        if let Some(index) = self
            .read_json_optional::<StoredSessionIndexFile>(&index_path)
            .await?
        {
            let has_stale_entry = index.sessions.iter().any(|metadata| {
                !self
                    .metadata_path(workspace_path, &metadata.session_id)
                    .exists()
            });
            if has_stale_entry {
                warn!(
                    "Session index contains stale entries, rebuilding: {}",
                    index_path.display()
                );
                return self.rebuild_index_locked(workspace_path).await;
            }

            let disk_count = self.count_session_metadata_dirs(workspace_path).await?;
            if index.metadata_file_count != disk_count {
                warn!(
                    "Session index incomplete (index: {}, disk: {}), rebuilding: {}",
                    index.metadata_file_count,
                    disk_count,
                    index_path.display()
                );
                return self.rebuild_index_locked(workspace_path).await;
            }

            return Ok(index.sessions);
        }

        self.rebuild_index_locked(workspace_path).await
    }

    fn session_parent_id(metadata: &SessionMetadata) -> Option<String> {
        if let Some(parent_id) = metadata
            .relationship
            .as_ref()
            .and_then(|relationship| relationship.parent_session_id.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(parent_id.to_string());
        }

        metadata
            .custom_metadata
            .as_ref()
            .and_then(|custom| {
                custom
                    .get("parentSessionId")
                    .or_else(|| custom.get("parent_session_id"))
            })
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    }

    fn session_metadata_page_offset(
        cursor: Option<&str>,
        top_level_sessions: &[SessionMetadata],
    ) -> usize {
        let Some(cursor) = cursor else {
            return 0;
        };

        if let Ok(parsed) = serde_json::from_str::<SessionMetadataPageCursor>(cursor) {
            if let Some(index) = top_level_sessions.iter().position(|metadata| {
                metadata.session_id == parsed.session_id
                    && metadata.last_active_at == parsed.last_active_at
            }) {
                return index + 1;
            }

            if let Some(index) = top_level_sessions
                .iter()
                .position(|metadata| metadata.session_id == parsed.session_id)
            {
                return index + 1;
            }
        }

        cursor.parse::<usize>().unwrap_or(0)
    }

    fn session_metadata_page_cursor(metadata: &SessionMetadata) -> String {
        serde_json::to_string(&SessionMetadataPageCursor {
            last_active_at: metadata.last_active_at,
            session_id: metadata.session_id.clone(),
        })
        .unwrap_or_else(|_| metadata.session_id.clone())
    }

    fn build_session_metadata_page(
        indexed_sessions: Vec<SessionMetadata>,
        cursor: Option<&str>,
        limit: usize,
    ) -> SessionMetadataPage {
        let visible_sessions = indexed_sessions
            .into_iter()
            .filter(|metadata| {
                !metadata.should_hide_from_user_lists()
                    && metadata.status != SessionStatus::Archived
            })
            .collect::<Vec<_>>();
        let visible_ids = visible_sessions
            .iter()
            .map(|metadata| metadata.session_id.clone())
            .collect::<HashSet<_>>();

        let mut top_level_sessions = Vec::new();
        let mut children_by_parent: HashMap<String, Vec<SessionMetadata>> = HashMap::new();
        for metadata in visible_sessions {
            if let Some(parent_id) = Self::session_parent_id(&metadata) {
                if visible_ids.contains(&parent_id) {
                    children_by_parent
                        .entry(parent_id)
                        .or_default()
                        .push(metadata);
                    continue;
                }
            }

            top_level_sessions.push(metadata);
        }

        let total_top_level_count = top_level_sessions.len();
        let offset = Self::session_metadata_page_offset(cursor, &top_level_sessions);
        let offset = offset.min(total_top_level_count);
        let next_offset = offset.saturating_add(limit).min(total_top_level_count);
        let selected_top_level = top_level_sessions
            .iter()
            .skip(offset)
            .take(limit)
            .cloned()
            .collect::<Vec<_>>();
        let loaded_top_level_count = selected_top_level.len();
        let has_more = next_offset < total_top_level_count;
        let next_cursor = has_more
            .then(|| {
                selected_top_level
                    .last()
                    .map(Self::session_metadata_page_cursor)
            })
            .flatten();

        let mut sessions = Vec::new();
        for metadata in selected_top_level {
            let session_id = metadata.session_id.clone();
            sessions.push(metadata);

            if let Some(mut children) = children_by_parent.remove(&session_id) {
                children.sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));
                sessions.extend(children);
            }
        }

        SessionMetadataPage {
            sessions,
            total_top_level_count,
            loaded_top_level_count,
            next_cursor,
            has_more,
        }
    }

    pub async fn list_session_metadata_page(
        &self,
        workspace_path: &Path,
        cursor: Option<&str>,
        limit: usize,
    ) -> VoidResult<SessionMetadataPage> {
        if !workspace_path.exists() {
            return Ok(SessionMetadataPage {
                sessions: Vec::new(),
                total_top_level_count: 0,
                loaded_top_level_count: 0,
                next_cursor: None,
                has_more: false,
            });
        }

        if self.existing_project_sessions_dir(workspace_path).is_none() {
            return Ok(SessionMetadataPage {
                sessions: Vec::new(),
                total_top_level_count: 0,
                loaded_top_level_count: 0,
                next_cursor: None,
                has_more: false,
            });
        }

        let limit = limit.max(1);

        let lock = self.get_session_index_lock(workspace_path).await;
        let _guard = lock.lock().await;
        let index_path = self.index_path(workspace_path);
        let indexed_sessions = if let Some(index) = self
            .read_json_optional::<StoredSessionIndexFile>(&index_path)
            .await?
        {
            if index.metadata_file_count < index.sessions.len() {
                warn!(
                    "Session index has invalid metadata count before page read (index: {}, sessions: {}), rebuilding: {}",
                    index.metadata_file_count,
                    index.sessions.len(),
                    index_path.display()
                );
                self.rebuild_index_locked(workspace_path).await?
            } else {
                index.sessions
            }
        } else {
            self.rebuild_index_locked(workspace_path).await?
        };

        let page = Self::build_session_metadata_page(indexed_sessions, cursor, limit);
        let has_stale_page_entry = page.sessions.iter().any(|metadata| {
            !self
                .metadata_path(workspace_path, &metadata.session_id)
                .exists()
        });
        if !has_stale_page_entry {
            return Ok(page);
        }

        warn!(
            "Session index page contains stale entries, rebuilding before page read: {}",
            index_path.display()
        );
        let rebuilt_sessions = self.rebuild_index_locked(workspace_path).await?;
        Ok(Self::build_session_metadata_page(
            rebuilt_sessions,
            cursor,
            limit,
        ))
    }

    pub async fn list_session_metadata_including_internal(
        &self,
        workspace_path: &Path,
    ) -> VoidResult<Vec<SessionMetadata>> {
        if !workspace_path.exists() {
            return Ok(Vec::new());
        }

        if self.existing_project_sessions_dir(workspace_path).is_none() {
            return Ok(Vec::new());
        }

        self.scan_session_metadata_dirs(workspace_path).await
    }

    pub async fn save_session_metadata(
        &self,
        workspace_path: &Path,
        metadata: &SessionMetadata,
    ) -> VoidResult<()> {
        self.ensure_runtime_for_write(workspace_path).await?;
        self.ensure_session_dir(workspace_path, &metadata.session_id)
            .await?;
        let metadata_path = self.metadata_path(workspace_path, &metadata.session_id);
        let file = StoredSessionMetadataFile::new(metadata.clone());

        let lock = self.get_session_index_lock(workspace_path).await;
        let _guard = lock.lock().await;
        let metadata_file_created = !metadata_path.exists();
        self.write_json_atomic(&metadata_path, &file).await?;
        if !metadata.should_hide_from_user_lists() {
            self.upsert_index_entry_locked(workspace_path, metadata, metadata_file_created)
                .await
        } else {
            self.remove_index_entry_locked(
                workspace_path,
                &metadata.session_id,
                if metadata_file_created { 1 } else { 0 },
            )
            .await
        }
    }

    pub async fn create_subagent_task(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task: &SubagentTaskRecord,
    ) -> VoidResult<SubagentTaskRecord> {
        if task.parent_session_id != parent_session_id {
            return Err(VoidError::Validation(
                "Subagent task parent session does not match storage session".to_string(),
            ));
        }
        let path = self.subagent_task_path(workspace_path, parent_session_id, &task.task_id)?;
        self.ensure_runtime_for_write(workspace_path).await?;
        self.ensure_session_dir(workspace_path, parent_session_id)
            .await?;

        let lock = self
            .get_session_metadata_update_lock(workspace_path, parent_session_id)
            .await;
        let _guard = lock.lock().await;
        let _file_guard = self.acquire_subagent_task_file_lock(&path).await?;
        if self.read_subagent_task_optional(&path).await?.is_some() {
            return Err(VoidError::Validation(format!(
                "Subagent task already exists: {}",
                task.task_id
            )));
        }
        self.write_json_atomic(&path, task).await?;
        Ok(task.clone())
    }

    pub async fn get_subagent_task(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
    ) -> VoidResult<Option<SubagentTaskRecord>> {
        let path = self.subagent_task_path(workspace_path, parent_session_id, task_id)?;
        self.read_subagent_task_optional(&path).await
    }

    pub async fn list_subagent_tasks(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
    ) -> VoidResult<Vec<SubagentTaskRecord>> {
        let directory = self.subagent_tasks_dir(workspace_path, parent_session_id);
        let mut entries = match fs::read_dir(&directory).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(VoidError::io(format!(
                    "Failed to list subagent tasks {}: {}",
                    directory.display(),
                    error
                )));
            }
        };
        let mut tasks = Vec::new();
        while let Some(entry) = entries.next_entry().await.map_err(|error| {
            VoidError::io(format!(
                "Failed to read subagent task directory {}: {}",
                directory.display(),
                error
            ))
        })? {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Some(task) = self.read_subagent_task_optional(&path).await? {
                tasks.push(task);
            }
        }
        tasks.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.task_id.cmp(&right.task_id))
        });
        Ok(tasks)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn transition_subagent_task(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
        next_status: SubagentTaskStatus,
        child_session_id: Option<String>,
        progress: Option<String>,
        result: Option<String>,
        failure: Option<String>,
        updated_at: u64,
    ) -> VoidResult<SubagentTaskRecord> {
        let path = self.subagent_task_path(workspace_path, parent_session_id, task_id)?;
        let lock = self
            .get_session_metadata_update_lock(workspace_path, parent_session_id)
            .await;
        let _guard = lock.lock().await;
        let _file_guard = self.acquire_subagent_task_file_lock(&path).await?;
        let mut task = self
            .read_subagent_task_optional(&path)
            .await?
            .ok_or_else(|| VoidError::NotFound(format!("Subagent task not found: {task_id}")))?;

        if let Some(child_session_id) = child_session_id {
            if task
                .child_session_id
                .as_ref()
                .is_some_and(|existing| existing != &child_session_id)
            {
                return Err(VoidError::Validation(format!(
                    "Subagent task {task_id} is already bound to another child session"
                )));
            }
            task.child_session_id = Some(child_session_id);
        }
        task.transition_status(next_status, updated_at)
            .map_err(|error| VoidError::Validation(error.to_string()))?;
        if progress.is_some() {
            task.progress = progress;
        }
        if result.is_some() {
            task.result = result;
        }
        if failure.is_some() {
            task.failure = failure;
        }
        self.write_json_atomic(&path, &task).await?;
        Ok(task)
    }

    pub async fn claim_subagent_task_delivery(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
        lease_id: String,
        lease_owner: String,
        now: u64,
        lease_duration_ms: u64,
    ) -> VoidResult<Option<SubagentTaskRecord>> {
        let path = self.subagent_task_path(workspace_path, parent_session_id, task_id)?;
        let lock = self
            .get_session_metadata_update_lock(workspace_path, parent_session_id)
            .await;
        let _guard = lock.lock().await;
        let _file_guard = self.acquire_subagent_task_file_lock(&path).await?;
        let mut task = self
            .read_subagent_task_optional(&path)
            .await?
            .ok_or_else(|| VoidError::NotFound(format!("Subagent task not found: {task_id}")))?;
        if !task
            .claim_delivery(lease_id, lease_owner, now, lease_duration_ms)
            .map_err(|error| VoidError::Validation(error.to_string()))?
        {
            if task.recovery_state == SubagentTaskRecoveryState::Blocked {
                self.write_json_atomic(&path, &task).await?;
            }
            return Ok(None);
        }
        self.write_json_atomic(&path, &task).await?;
        Ok(Some(task))
    }

    pub async fn block_subagent_task_recovery(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
        code: SubagentTaskRecoveryBlockCode,
        detail: String,
        updated_at: u64,
    ) -> VoidResult<SubagentTaskRecord> {
        let path = self.subagent_task_path(workspace_path, parent_session_id, task_id)?;
        let lock = self
            .get_session_metadata_update_lock(workspace_path, parent_session_id)
            .await;
        let _guard = lock.lock().await;
        let _file_guard = self.acquire_subagent_task_file_lock(&path).await?;
        let mut task = self
            .read_subagent_task_optional(&path)
            .await?
            .ok_or_else(|| VoidError::NotFound(format!("Subagent task not found: {task_id}")))?;
        task.block_recovery(code, detail, updated_at);
        self.write_json_atomic(&path, &task).await?;
        Ok(task)
    }

    async fn finish_subagent_task_delivery(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
        next_state: SubagentTaskDeliveryState,
        lease_id: &str,
        detail: String,
        updated_at: u64,
    ) -> VoidResult<SubagentTaskRecord> {
        let path = self.subagent_task_path(workspace_path, parent_session_id, task_id)?;
        let lock = self
            .get_session_metadata_update_lock(workspace_path, parent_session_id)
            .await;
        let _guard = lock.lock().await;
        let _file_guard = self.acquire_subagent_task_file_lock(&path).await?;
        let mut task = self
            .read_subagent_task_optional(&path)
            .await?
            .ok_or_else(|| VoidError::NotFound(format!("Subagent task not found: {task_id}")))?;
        match next_state {
            SubagentTaskDeliveryState::Delivered => task
                .complete_delivery(lease_id, detail, updated_at)
                .map_err(|error| VoidError::Validation(error.to_string()))?,
            SubagentTaskDeliveryState::Failed => {
                task.fail_delivery(lease_id, detail, updated_at)
                    .map_err(|error| VoidError::Validation(error.to_string()))?
            }
            _ => {
                return Err(VoidError::Validation(format!(
                    "Unsupported subagent delivery finish state: {next_state:?}"
                )));
            }
        }
        self.write_json_atomic(&path, &task).await?;
        Ok(task)
    }

    pub async fn complete_subagent_task_delivery(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
        lease_id: &str,
        external_receipt: String,
        updated_at: u64,
    ) -> VoidResult<SubagentTaskRecord> {
        self.finish_subagent_task_delivery(
            workspace_path,
            parent_session_id,
            task_id,
            SubagentTaskDeliveryState::Delivered,
            lease_id,
            external_receipt,
            updated_at,
        )
        .await
    }

    pub async fn fail_subagent_task_delivery(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        task_id: &str,
        lease_id: &str,
        reason: String,
        updated_at: u64,
    ) -> VoidResult<SubagentTaskRecord> {
        self.finish_subagent_task_delivery(
            workspace_path,
            parent_session_id,
            task_id,
            SubagentTaskDeliveryState::Failed,
            lease_id,
            reason,
            updated_at,
        )
        .await
    }

    pub async fn recover_subagent_tasks_after_restart(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        updated_at: u64,
    ) -> VoidResult<Vec<SubagentTaskRecord>> {
        let mut changed = Vec::new();
        for mut task in self
            .list_subagent_tasks(workspace_path, parent_session_id)
            .await?
        {
            let path = self.subagent_task_path(workspace_path, parent_session_id, &task.task_id)?;
            let lock = self
                .get_session_metadata_update_lock(workspace_path, parent_session_id)
                .await;
            let _guard = lock.lock().await;
            let _file_guard = self.acquire_subagent_task_file_lock(&path).await?;
            task = self
                .read_subagent_task_optional(&path)
                .await?
                .ok_or_else(|| {
                    VoidError::NotFound(format!("Subagent task not found: {}", task.task_id))
                })?;

            if matches!(
                task.status,
                SubagentTaskStatus::Created
                    | SubagentTaskStatus::Running
                    | SubagentTaskStatus::Interrupted
            ) {
                task.durable_checkpoint = match task.child_session_id.as_deref() {
                    Some(child_session_id) => self
                        .load_recovery_checkpoint(workspace_path, child_session_id)
                        .await?
                        .filter(|checkpoint| {
                            checkpoint.status == RecoveryCheckpointStatus::Ready
                                && checkpoint
                                    .validate(child_session_id, checkpoint.catalog_generation)
                                    .is_ok()
                        })
                        .map(|checkpoint| SubagentTaskCheckpointRef {
                            checkpoint_id: checkpoint.checkpoint_id,
                            session_id: checkpoint.session_id,
                            checkpoint_version: checkpoint.checkpoint_version,
                        }),
                    None => None,
                };
            }
            if task.mark_recovery_after_restart(updated_at) {
            self.write_json_atomic(&path, &task).await?;
            changed.push(task);
        }
        }
        Ok(changed)
    }

    pub async fn load_session_metadata(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Option<SessionMetadata>> {
        let path = self.metadata_path(workspace_path, session_id);
        Ok(self
            .read_json_optional::<StoredSessionMetadataFile>(&path)
            .await?
            .map(|file| file.metadata))
    }

    async fn load_stored_session_state(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Option<StoredSessionStateFile>> {
        self.read_json_optional::<StoredSessionStateFile>(
            &self.state_path(workspace_path, session_id),
        )
        .await
    }

    async fn save_stored_session_state(
        &self,
        workspace_path: &Path,
        session_id: &str,
        state: &StoredSessionStateFile,
    ) -> VoidResult<()> {
        self.write_json_atomic(&self.state_path(workspace_path, session_id), state)
            .await
    }

    pub async fn load_prompt_cache(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Option<SessionPromptCache>> {
        Ok(self
            .read_json_optional::<StoredSessionPromptCacheFile>(
                &self.prompt_cache_path(workspace_path, session_id),
            )
            .await?
            .map(|file| file.cache))
    }

    pub async fn save_prompt_cache(
        &self,
        workspace_path: &Path,
        session_id: &str,
        cache: &SessionPromptCache,
    ) -> VoidResult<()> {
        self.ensure_runtime_for_write(workspace_path).await?;
        self.ensure_session_dir(workspace_path, session_id).await?;

        self.write_json_atomic(
            &self.prompt_cache_path(workspace_path, session_id),
            &StoredSessionPromptCacheFile {
                schema_version: PROMPT_CACHE_SCHEMA_VERSION,
                cache: cache.clone(),
            },
        )
        .await
    }

    pub async fn delete_prompt_cache(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<()> {
        match fs::remove_file(self.prompt_cache_path(workspace_path, session_id)).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(VoidError::io(format!(
                "Failed to delete prompt cache for session {}: {}",
                session_id, error
            ))),
        }
    }

    // ============ Turn context snapshot (sent to model)============

    pub async fn save_recovery_checkpoint(
        &self,
        workspace_path: &Path,
        session_id: &str,
        checkpoint: &RecoveryCheckpoint,
    ) -> VoidResult<RecoveryCheckpoint> {
        if checkpoint.session_id != session_id {
            return Err(VoidError::Validation(
                "Recovery checkpoint session does not match storage session".to_string(),
            ));
        }
        self.ensure_runtime_for_write(workspace_path).await?;
        self.ensure_session_dir(workspace_path, session_id).await?;
        let lock = self
            .get_session_metadata_update_lock(workspace_path, session_id)
            .await;
        let _guard = lock.lock().await;
        self.write_json_atomic(
            &self.recovery_checkpoint_path(workspace_path, session_id),
            checkpoint,
        )
        .await?;
        Ok(checkpoint.clone())
    }

    pub async fn load_recovery_checkpoint(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Option<RecoveryCheckpoint>> {
        self.read_json_optional(&self.recovery_checkpoint_path(workspace_path, session_id))
            .await
    }

    pub async fn save_turn_context_snapshot(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
        messages: &[Message],
    ) -> VoidResult<()> {
        self.ensure_runtime_for_write(workspace_path).await?;
        self.ensure_snapshots_dir(workspace_path, session_id)
            .await?;

        let snapshot = StoredTurnContextSnapshotFile {
            schema_version: SESSION_STORAGE_SCHEMA_VERSION,
            session_id: session_id.to_string(),
            turn_index,
            messages: Self::sanitize_messages_for_persistence(messages),
        };

        self.write_json_atomic(
            &self.context_snapshot_path(workspace_path, session_id, turn_index),
            &snapshot,
        )
        .await
    }

    pub async fn load_turn_context_snapshot(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> VoidResult<Option<Vec<Message>>> {
        let snapshot = self
            .read_json_optional::<StoredTurnContextSnapshotFile>(&self.context_snapshot_path(
                workspace_path,
                session_id,
                turn_index,
            ))
            .await?;
        Ok(snapshot.map(|value| value.messages))
    }

    pub async fn load_latest_turn_context_snapshot(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Option<(usize, Vec<Message>)>> {
        let started_at = Instant::now();
        let dir = self.snapshots_dir(workspace_path, session_id);
        if !dir.exists() {
            return Ok(None);
        }

        let scan_started_at = Instant::now();
        let mut latest: Option<usize> = None;
        let mut snapshot_file_count = 0usize;
        let mut rd = fs::read_dir(&dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to read snapshots directory: {}", e)))?;

        while let Some(entry) = rd
            .next_entry()
            .await
            .map_err(|e| VoidError::io(format!("Failed to iterate snapshots directory: {}", e)))?
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Some(index_str) = stem.strip_prefix("context-") else {
                continue;
            };
            if let Ok(index) = index_str.parse::<usize>() {
                snapshot_file_count += 1;
                latest = Some(latest.map(|value| value.max(index)).unwrap_or(index));
            }
        }
        let scan_duration = scan_started_at.elapsed();

        let Some(turn_index) = latest else {
            return Ok(None);
        };

        let load_started_at = Instant::now();
        let Some(messages) = self
            .load_turn_context_snapshot(workspace_path, session_id, turn_index)
            .await?
        else {
            return Ok(None);
        };
        let load_duration = load_started_at.elapsed();
        let total_duration = started_at.elapsed();

        if total_duration >= Duration::from_millis(80) || snapshot_file_count >= 10 {
            let payload_stats = context_snapshot_payload_stats(&messages);
            debug!(
                "Loaded latest context snapshot: session_id={} turn_index={} snapshot_file_count={} scan_duration_ms={} load_duration_ms={} total_duration_ms={} message_count={} tool_result_count={} raw_result_string_chars={} result_for_assistant_chars={} largest_raw_result_chars={} largest_raw_result_path={}",
                session_id,
                turn_index,
                snapshot_file_count,
                scan_duration.as_millis(),
                load_duration.as_millis(),
                total_duration.as_millis(),
                messages.len(),
                payload_stats.tool_result_count,
                payload_stats.raw_result_string_chars,
                payload_stats.result_for_assistant_chars,
                payload_stats.largest_raw_result_chars,
                payload_stats.largest_raw_result_path
            );
        }

        Ok(Some((turn_index, messages)))
    }

    pub async fn delete_turn_context_snapshots_from(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> VoidResult<()> {
        let dir = self.snapshots_dir(workspace_path, session_id);
        if !dir.exists() {
            return Ok(());
        }

        let mut rd = fs::read_dir(&dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to read snapshots directory: {}", e)))?;
        while let Some(entry) = rd
            .next_entry()
            .await
            .map_err(|e| VoidError::io(format!("Failed to iterate snapshots directory: {}", e)))?
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Some(index_str) = stem.strip_prefix("context-") else {
                continue;
            };
            let Ok(index) = index_str.parse::<usize>() else {
                continue;
            };
            if index >= turn_index {
                let _ = fs::remove_file(&path).await;
            }
        }

        Ok(())
    }

    // ============ Session Persistence ============

    /// Save session
    pub async fn save_session(&self, workspace_path: &Path, session: &Session) -> VoidResult<()> {
        self.ensure_runtime_for_write(workspace_path).await?;
        self.ensure_session_dir(workspace_path, &session.session_id)
            .await?;

        let existing_metadata = self
            .load_session_metadata(workspace_path, &session.session_id)
            .await?;
        let metadata = self
            .build_session_metadata(workspace_path, session, existing_metadata.as_ref())
            .await;
        self.save_session_metadata(workspace_path, &metadata)
            .await?;

        let state = StoredSessionStateFile {
            schema_version: SESSION_STORAGE_SCHEMA_VERSION,
            config: session.config.clone(),
            snapshot_session_id: session.snapshot_session_id.clone(),
            last_user_dialog_agent_type: session.last_user_dialog_agent_type.clone(),
            last_submitted_agent_type: session.last_submitted_agent_type.clone(),
            compression_state: session.compression_state.clone(),
            runtime_state: Self::sanitize_runtime_state(&session.state),
        };
        self.save_stored_session_state(workspace_path, &session.session_id, &state)
            .await
    }

    /// Load session
    pub async fn load_session(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Session> {
        let (session, _) = self
            .load_session_with_turns(workspace_path, session_id)
            .await?;
        Ok(session)
    }

    /// Load session and return the persisted turns read while rebuilding the session header.
    pub async fn load_session_with_turns(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<(Session, Vec<DialogTurnData>)> {
        let metadata = self
            .load_session_metadata(workspace_path, session_id)
            .await?
            .ok_or_else(|| {
                VoidError::NotFound(format!("Session metadata not found: {}", session_id))
            })?;
        let stored_state = self
            .load_stored_session_state(workspace_path, session_id)
            .await?;
        let turns = self.load_session_turns(workspace_path, session_id).await?;

        let mut config = stored_state
            .as_ref()
            .map(|value| value.config.clone())
            .unwrap_or_default();
        if config.workspace_path.is_none() {
            config.workspace_path = metadata.workspace_path.clone();
        }
        if config.remote_ssh_host.is_none() {
            config.remote_ssh_host = metadata
                .workspace_hostname
                .clone()
                .filter(|host| host != LOCAL_WORKSPACE_SSH_HOST && host != "_unresolved");
        }
        if config.model_id.is_none() && !metadata.model_name.is_empty() {
            config.model_id = Some(metadata.model_name.clone());
        }

        let compression_state = stored_state
            .as_ref()
            .map(|value| value.compression_state.clone())
            .unwrap_or_default();
        let runtime_state = stored_state
            .as_ref()
            .map(|value| Self::sanitize_runtime_state(&value.runtime_state))
            .unwrap_or(SessionState::Idle);
        let created_at = Self::unix_ms_to_system_time(metadata.created_at);
        let last_activity_at = Self::unix_ms_to_system_time(metadata.last_active_at);

        let dialog_turn_ids = turns.iter().map(|turn| turn.turn_id.clone()).collect();
        let session = Session {
            session_id: metadata.session_id.clone(),
            session_name: metadata.session_name.clone(),
            agent_type: metadata.agent_type.clone(),
            last_user_dialog_agent_type: stored_state
                .as_ref()
                .and_then(|value| value.last_user_dialog_agent_type.clone())
                .or_else(|| metadata.last_user_dialog_agent_type.clone()),
            last_submitted_agent_type: stored_state
                .as_ref()
                .and_then(|value| value.last_submitted_agent_type.clone())
                .or_else(|| metadata.last_submitted_agent_type.clone()),
            created_by: metadata.created_by.clone(),
            kind: metadata.session_kind,
            snapshot_session_id: stored_state
                .and_then(|value| value.snapshot_session_id)
                .or(metadata.snapshot_session_id.clone()),
            dialog_turn_ids,
            state: runtime_state,
            config,
            compression_state,
            created_at,
            updated_at: last_activity_at,
            last_activity_at,
        };

        Ok((session, turns))
    }

    /// Save session state
    pub async fn save_session_state(
        &self,
        workspace_path: &Path,
        session_id: &str,
        state: &SessionState,
    ) -> VoidResult<()> {
        self.ensure_runtime_for_write(workspace_path).await?;
        let mut stored_state = self
            .load_stored_session_state(workspace_path, session_id)
            .await?
            .unwrap_or(StoredSessionStateFile {
                schema_version: SESSION_STORAGE_SCHEMA_VERSION,
                config: SessionConfig {
                    workspace_path: None,
                    ..Default::default()
                },
                snapshot_session_id: None,
                last_user_dialog_agent_type: None,
                last_submitted_agent_type: None,
                compression_state: CompressionState::default(),
                runtime_state: SessionState::Idle,
            });
        stored_state.schema_version = SESSION_STORAGE_SCHEMA_VERSION;
        stored_state.runtime_state = Self::sanitize_runtime_state(state);
        self.save_stored_session_state(workspace_path, session_id, &stored_state)
            .await
    }

    /// Delete session
    pub async fn delete_session(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<()> {
        let lock = self.get_session_index_lock(workspace_path).await;
        let _guard = lock.lock().await;
        let dir = self.session_dir(workspace_path, session_id);
        let metadata_file_removed = self.metadata_path(workspace_path, session_id).exists();
        if dir.exists() {
            fs::remove_dir_all(&dir).await.map_err(|e| {
                VoidError::io(format!("Failed to delete session directory: {}", e))
            })?;
        }

        self.remove_index_entry_locked(
            workspace_path,
            session_id,
            if metadata_file_removed { -1 } else { 0 },
        )
        .await?;
        info!("Session deleted: session_id={}", session_id);
        Ok(())
    }

    /// List all sessions
    pub async fn list_sessions(&self, workspace_path: &Path) -> VoidResult<Vec<SessionSummary>> {
        let metadata_list = self.list_session_metadata(workspace_path).await?;
        let mut summaries = Vec::with_capacity(metadata_list.len());

        for metadata in metadata_list {
            let state = self
                .load_stored_session_state(workspace_path, &metadata.session_id)
                .await?
                .map(|value| Self::sanitize_runtime_state(&value.runtime_state))
                .unwrap_or(SessionState::Idle);

            summaries.push(SessionSummary {
                session_id: metadata.session_id,
                session_name: metadata.session_name,
                agent_type: metadata.agent_type,
                last_user_dialog_agent_type: metadata.last_user_dialog_agent_type,
                last_submitted_agent_type: metadata.last_submitted_agent_type,
                created_by: metadata.created_by,
                kind: metadata.session_kind,
                turn_count: metadata.turn_count,
                created_at: Self::unix_ms_to_system_time(metadata.created_at),
                last_activity_at: Self::unix_ms_to_system_time(metadata.last_active_at),
                state,
            });
        }

        summaries.sort_by(|a, b| b.last_activity_at.cmp(&a.last_activity_at));
        Ok(summaries)
    }

    fn estimate_turn_message_count(turn: &DialogTurnData) -> usize {
        let assistant_text_count: usize = turn
            .model_rounds
            .iter()
            .map(|round| round.text_items.len())
            .sum();
        1 + assistant_text_count
    }

    fn refresh_metadata_from_turns(
        metadata: &mut SessionMetadata,
        workspace_path: &Path,
        turns: &[DialogTurnData],
        last_active_at: u64,
    ) {
        metadata.turn_count = turns.len();
        metadata.message_count = turns.iter().map(Self::estimate_turn_message_count).sum();
        metadata.tool_call_count = turns.iter().map(DialogTurnData::count_tool_calls).sum();
        metadata.last_active_at = last_active_at;
        if metadata.workspace_path.is_none() {
            metadata.workspace_path = Some(workspace_path.to_string_lossy().to_string());
        }
    }

    fn try_refresh_metadata_for_saved_turn(
        metadata: &mut SessionMetadata,
        workspace_path: &Path,
        previous_turn: Option<&DialogTurnData>,
        turn: &DialogTurnData,
        last_active_at: u64,
    ) -> bool {
        let new_message_count = Self::estimate_turn_message_count(turn);
        let new_tool_call_count = turn.count_tool_calls();

        match previous_turn {
            Some(previous)
                if previous.session_id == turn.session_id
                    && previous.turn_index == turn.turn_index
                    && turn.turn_index < metadata.turn_count =>
            {
                metadata.message_count = metadata
                    .message_count
                    .saturating_sub(Self::estimate_turn_message_count(previous))
                    .saturating_add(new_message_count);
                metadata.tool_call_count = metadata
                    .tool_call_count
                    .saturating_sub(previous.count_tool_calls())
                    .saturating_add(new_tool_call_count);
            }
            None if turn.turn_index == metadata.turn_count => {
                metadata.turn_count += 1;
                metadata.message_count = metadata.message_count.saturating_add(new_message_count);
                metadata.tool_call_count =
                    metadata.tool_call_count.saturating_add(new_tool_call_count);
            }
            _ => return false,
        }

        metadata.last_active_at = last_active_at;
        if metadata.workspace_path.is_none() {
            metadata.workspace_path = Some(workspace_path.to_string_lossy().to_string());
        }

        true
    }

    pub async fn save_dialog_turn(
        &self,
        workspace_path: &Path,
        turn: &DialogTurnData,
    ) -> VoidResult<()> {
        let save_started_at = Instant::now();
        self.ensure_runtime_for_write(workspace_path).await?;
        let metadata_update_lock = self
            .get_session_metadata_update_lock(workspace_path, &turn.session_id)
            .await;
        let _metadata_update_guard = metadata_update_lock.lock().await;
        let mut metadata = self
            .load_session_metadata(workspace_path, &turn.session_id)
            .await?
            .ok_or_else(|| {
                VoidError::NotFound(format!("Session metadata not found: {}", turn.session_id))
            })?;

        self.ensure_turns_dir(workspace_path, &turn.session_id)
            .await?;

        let previous_turn = match self
            .load_dialog_turn(workspace_path, &turn.session_id, turn.turn_index)
            .await
        {
            Ok(turn) => turn,
            Err(error) => {
                warn!(
                    "Failed to load existing dialog turn before save; falling back to full metadata refresh: session_id={} turn_index={} error={}",
                    turn.session_id,
                    turn.turn_index,
                    error
                );
                None
            }
        };
        let previous_turn_load_failed = previous_turn.is_none()
            && self
                .turn_path(workspace_path, &turn.session_id, turn.turn_index)
                .exists();

        let file = StoredDialogTurnFile {
            schema_version: SESSION_STORAGE_SCHEMA_VERSION,
            turn: turn.clone(),
        };
        let write_started_at = Instant::now();
        self.write_json_atomic(
            &self.turn_path(workspace_path, &turn.session_id, turn.turn_index),
            &file,
        )
        .await?;
        let write_duration = write_started_at.elapsed();

        let last_active_at = turn
            .end_time
            .unwrap_or_else(|| Self::system_time_to_unix_ms(SystemTime::now()));
        let mut metadata_refresh_mode = "incremental";
        if previous_turn_load_failed
            || !Self::try_refresh_metadata_for_saved_turn(
                &mut metadata,
                workspace_path,
                previous_turn.as_ref(),
                turn,
                last_active_at,
            )
        {
            metadata_refresh_mode = "full_scan";
            let turns = self
                .load_session_turns(workspace_path, &turn.session_id)
                .await?;
            Self::refresh_metadata_from_turns(
                &mut metadata,
                workspace_path,
                &turns,
                last_active_at,
            );
        }

        let metadata_started_at = Instant::now();
        self.save_session_metadata(workspace_path, &metadata)
            .await?;
        let metadata_duration = metadata_started_at.elapsed();
        let total_duration = save_started_at.elapsed();
        if total_duration >= Duration::from_millis(80) || metadata_refresh_mode == "full_scan" {
            debug!(
                "Saved dialog turn: session_id={} turn_index={} metadata_refresh={} write_duration_ms={} metadata_duration_ms={} total_duration_ms={}",
                turn.session_id,
                turn.turn_index,
                metadata_refresh_mode,
                write_duration.as_millis(),
                metadata_duration.as_millis(),
                total_duration.as_millis()
            );
        }

        Ok(())
    }

    pub async fn load_dialog_turn(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> VoidResult<Option<DialogTurnData>> {
        Ok(self
            .read_json_optional::<StoredDialogTurnFile>(&self.turn_path(
                workspace_path,
                session_id,
                turn_index,
            ))
            .await?
            .map(|file| file.turn))
    }

    pub async fn load_session_turns(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Vec<DialogTurnData>> {
        let started_at = Instant::now();
        let turns_dir = self.turns_dir(workspace_path, session_id);
        if !turns_dir.exists() {
            return Ok(Vec::new());
        }

        let scan_started_at = Instant::now();
        let mut indexed_paths = Vec::new();
        let mut entries = fs::read_dir(&turns_dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to read turns directory: {}", e)))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| VoidError::io(format!("Failed to iterate turns directory: {}", e)))?
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Some(index_str) = stem.strip_prefix("turn-") else {
                continue;
            };
            let Ok(index) = index_str.parse::<usize>() else {
                continue;
            };
            indexed_paths.push((index, path));
        }

        indexed_paths.sort_by_key(|(index, _)| *index);
        let scan_duration = scan_started_at.elapsed();

        let read_started_at = Instant::now();
        let mut turns = Vec::with_capacity(indexed_paths.len());
        let turn_file_count = indexed_paths.len();
        for (_, path) in indexed_paths {
            if let Some(file) = self
                .read_json_optional::<StoredDialogTurnFile>(&path)
                .await?
            {
                turns.push(file.turn);
            }
        }
        let read_duration = read_started_at.elapsed();
        let total_duration = started_at.elapsed();
        if total_duration >= Duration::from_millis(80) || turn_file_count >= 50 {
            debug!(
                "Loaded session turns: session_id={} turn_count={} turn_file_count={} scan_duration_ms={} read_duration_ms={} total_duration_ms={}",
                session_id,
                turns.len(),
                turn_file_count,
                scan_duration.as_millis(),
                read_duration.as_millis(),
                total_duration.as_millis()
            );
        }

        Ok(turns)
    }

    pub async fn delete_dialog_turns_from(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> VoidResult<()> {
        let turns_dir = self.turns_dir(workspace_path, session_id);
        if !turns_dir.exists() {
            return Ok(());
        }

        let mut entries = fs::read_dir(&turns_dir)
            .await
            .map_err(|e| VoidError::io(format!("Failed to read turns directory: {}", e)))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| VoidError::io(format!("Failed to iterate turns directory: {}", e)))?
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Some(index_str) = stem.strip_prefix("turn-") else {
                continue;
            };
            let Ok(index) = index_str.parse::<usize>() else {
                continue;
            };
            if index >= turn_index {
                fs::remove_file(&path).await.map_err(|e| {
                    VoidError::io(format!("Failed to delete dialog turn file: {}", e))
                })?;
            }
        }

        if let Some(mut metadata) = self
            .load_session_metadata(workspace_path, session_id)
            .await?
        {
            let turns = self.load_session_turns(workspace_path, session_id).await?;
            metadata.turn_count = turns.len();
            metadata.message_count = turns.iter().map(Self::estimate_turn_message_count).sum();
            metadata.tool_call_count = turns.iter().map(DialogTurnData::count_tool_calls).sum();
            metadata.last_active_at = Self::system_time_to_unix_ms(SystemTime::now());
            self.save_session_metadata(workspace_path, &metadata)
                .await?;
        }

        Ok(())
    }

    pub async fn load_recent_turns(
        &self,
        workspace_path: &Path,
        session_id: &str,
        count: usize,
    ) -> VoidResult<Vec<DialogTurnData>> {
        let turns = self.load_session_turns(workspace_path, session_id).await?;
        let start = turns.len().saturating_sub(count);
        Ok(turns[start..].to_vec())
    }

    pub async fn export_session_transcript(
        &self,
        workspace_path: &Path,
        session_id: &str,
        options: &SessionTranscriptExportOptions,
    ) -> VoidResult<SessionTranscriptExport> {
        if self
            .load_session_metadata(workspace_path, session_id)
            .await?
            .is_none()
        {
            return Err(VoidError::NotFound(format!(
                "Session metadata not found: {}",
                session_id
            )));
        }

        let transcript_path = self.transcript_path(workspace_path, session_id);
        let transcript_meta_path = self.transcript_meta_path(workspace_path, session_id);

        let parsed_turn_selectors = options
            .turns
            .as_ref()
            .map(|selectors| Self::parse_transcript_turn_selectors(selectors))
            .transpose()?;
        let normalized_options = SessionTranscriptExportOptions {
            tools: options.tools,
            tool_inputs: options.tool_inputs,
            thinking: options.thinking,
            turns: parsed_turn_selectors.as_ref().map(|selectors| {
                selectors
                    .iter()
                    .map(|selector| selector.normalized.clone())
                    .collect()
            }),
        };

        let all_turns = self.load_session_turns(workspace_path, session_id).await?;
        let selected_indices = parsed_turn_selectors
            .as_ref()
            .map(|selectors| Self::transcript_select_turn_indices(all_turns.len(), selectors))
            .unwrap_or_else(|| (0..all_turns.len()).collect::<Vec<_>>());
        let turns = selected_indices
            .iter()
            .map(|&index| all_turns[index].clone())
            .collect::<Vec<_>>();

        let source_fingerprint =
            Self::transcript_fingerprint(session_id, &turns, &normalized_options)?;
        if transcript_path.exists() {
            if let Some(stored) = self
                .read_json_optional::<StoredSessionTranscriptFile>(&transcript_meta_path)
                .await?
            {
                if stored.transcript.source_fingerprint == source_fingerprint
                    && stored.transcript.index_range.start_line > 0
                    && stored.transcript.index_range.end_line > 0
                {
                    return Ok(stored.transcript);
                }
            }
        }

        self.ensure_artifacts_dir(workspace_path, session_id)
            .await?;

        let generated_at = Self::system_time_to_unix_ms(SystemTime::now());
        let sections = selected_indices
            .iter()
            .map(|&index| {
                (
                    index,
                    Self::build_transcript_section(&all_turns[index], &normalized_options),
                )
            })
            .collect::<Vec<_>>();

        let mut lines = vec!["## Index".to_string()];

        let mut index = Vec::with_capacity(sections.len());
        if sections.is_empty() {
            lines.push(if all_turns.is_empty() {
                "(no persisted turns)".to_string()
            } else {
                "(no matching turns)".to_string()
            });
        } else {
            let index_offset = lines.len() + sections.len() + 1;
            let mut body_lines = Vec::new();

            for (position, (source_index, section)) in sections.iter().enumerate() {
                let omitted_range = if position == 0 {
                    (*source_index > 0).then(|| (0, *source_index - 1))
                } else {
                    let previous_index = sections[position - 1].0;
                    (*source_index > previous_index + 1)
                        .then(|| (previous_index + 1, *source_index - 1))
                };

                if let Some((start, end)) = omitted_range {
                    if !body_lines.is_empty() {
                        body_lines.push(String::new());
                    }
                    body_lines.push(Self::transcript_omitted_turns_label(&all_turns, start, end));
                    body_lines.push(String::new());
                } else if !body_lines.is_empty() {
                    body_lines.push(String::new());
                }

                let section_offset = index_offset + body_lines.len();
                let turn_range = Self::offset_range(&section.turn_range, section_offset);
                let user_range = Self::offset_range(&section.user_range, section_offset);

                let index_line = format!(
                    "- turn={} range={} preview=\"{}\"",
                    section.turn_index,
                    Self::format_range(&turn_range),
                    section.preview.replace('"', "'")
                );
                lines.push(index_line);

                index.push(SessionTranscriptIndexEntry {
                    turn_index: section.turn_index,
                    preview: section.preview.clone(),
                    turn_range,
                    user_range,
                });

                body_lines.extend(section.lines.iter().cloned());
            }

            if let Some((last_index, _)) = sections.last() {
                if *last_index + 1 < all_turns.len() {
                    body_lines.push(String::new());
                    body_lines.push(Self::transcript_omitted_turns_label(
                        &all_turns,
                        *last_index + 1,
                        all_turns.len() - 1,
                    ));
                }
            }

            lines.push(String::new());
            lines.extend(body_lines);
        }

        let index_range = TranscriptLineRange {
            start_line: 1,
            end_line: lines
                .iter()
                .position(|line| line.is_empty())
                .unwrap_or(lines.len()),
        };

        let transcript_content = lines.join("\n");
        fs::write(&transcript_path, transcript_content)
            .await
            .map_err(|e| {
                VoidError::io(format!(
                    "Failed to write transcript file {}: {}",
                    transcript_path.display(),
                    e
                ))
            })?;

        let transcript = SessionTranscriptExport {
            session_id: session_id.to_string(),
            transcript_path: transcript_path.to_string_lossy().to_string(),
            generated_at,
            source_fingerprint,
            includes_tools: normalized_options.tools,
            includes_tool_inputs: normalized_options.tool_inputs,
            includes_thinking: normalized_options.thinking,
            turns: normalized_options.turns,
            turn_count: turns.len(),
            line_count: lines.len(),
            index_range,
            index,
        };

        self.write_json_atomic(
            &transcript_meta_path,
            &StoredSessionTranscriptFile {
                schema_version: TRANSCRIPT_SCHEMA_VERSION,
                transcript: transcript.clone(),
            },
        )
        .await?;

        Ok(transcript)
    }

    pub async fn delete_turns_after(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> VoidResult<usize> {
        let turns = self.load_session_turns(workspace_path, session_id).await?;
        let mut deleted = 0usize;

        for turn in turns
            .into_iter()
            .filter(|value| value.turn_index > turn_index)
        {
            let path = self.turn_path(workspace_path, session_id, turn.turn_index);
            if path.exists() {
                fs::remove_file(&path)
                    .await
                    .map_err(|e| VoidError::io(format!("Failed to delete turn file: {}", e)))?;
                deleted += 1;
            }
        }

        if let Some(mut metadata) = self
            .load_session_metadata(workspace_path, session_id)
            .await?
        {
            let remaining_turns = self.load_session_turns(workspace_path, session_id).await?;
            metadata.turn_count = remaining_turns.len();
            metadata.message_count = remaining_turns
                .iter()
                .map(Self::estimate_turn_message_count)
                .sum();
            metadata.tool_call_count = remaining_turns
                .iter()
                .map(DialogTurnData::count_tool_calls)
                .sum();
            metadata.last_active_at = Self::system_time_to_unix_ms(SystemTime::now());
            self.save_session_metadata(workspace_path, &metadata)
                .await?;
        }

        Ok(deleted)
    }

    pub async fn delete_turns_from(
        &self,
        workspace_path: &Path,
        session_id: &str,
        turn_index: usize,
    ) -> VoidResult<usize> {
        let turns = self.load_session_turns(workspace_path, session_id).await?;
        let mut deleted = 0usize;

        for turn in turns
            .into_iter()
            .filter(|value| value.turn_index >= turn_index)
        {
            let path = self.turn_path(workspace_path, session_id, turn.turn_index);
            if path.exists() {
                fs::remove_file(&path)
                    .await
                    .map_err(|e| VoidError::io(format!("Failed to delete turn file: {}", e)))?;
                deleted += 1;
            }
        }

        if let Some(mut metadata) = self
            .load_session_metadata(workspace_path, session_id)
            .await?
        {
            let remaining_turns = self.load_session_turns(workspace_path, session_id).await?;
            metadata.turn_count = remaining_turns.len();
            metadata.message_count = remaining_turns
                .iter()
                .map(Self::estimate_turn_message_count)
                .sum();
            metadata.tool_call_count = remaining_turns
                .iter()
                .map(DialogTurnData::count_tool_calls)
                .sum();
            metadata.last_active_at = Self::system_time_to_unix_ms(SystemTime::now());
            self.save_session_metadata(workspace_path, &metadata)
                .await?;
        }

        Ok(deleted)
    }

    pub async fn touch_session(&self, workspace_path: &Path, session_id: &str) -> VoidResult<()> {
        if let Some(mut metadata) = self
            .load_session_metadata(workspace_path, session_id)
            .await?
        {
            metadata.touch();
            self.save_session_metadata(workspace_path, &metadata)
                .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{context_snapshot_payload_stats, PersistenceManager};
    use crate::agentic::core::{
        Message, RecoveryBoundary, RecoveryCheckpoint, Session, SessionConfig, SessionKind,
        ToolResult,
    };
    use crate::infrastructure::PathManager;
    use crate::service::session::{
        DialogTurnData, ModelRoundData, SessionMetadata, SessionRelationship,
        SessionRelationshipKind, SessionTranscriptExportOptions, StoredSessionIndexFile,
        TextItemData, UserMessageData,
    };
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::Arc;
    use std::time::Instant;
    use uuid::Uuid;
    use void_core_types::{
        SubagentTaskDeliveryState, SubagentTaskRecord, SubagentTaskRecoveryBlockCode,
        SubagentTaskRecoveryState, SubagentTaskReplaySafety, SubagentTaskStatus,
    };

    struct TestWorkspace {
        path: PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("void-session-transcript-test-{}", Uuid::new_v4()));
            std::fs::create_dir_all(&path).expect("test workspace should be created");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }

        fn path_manager(&self) -> Arc<PathManager> {
            Arc::new(PathManager::with_user_root_for_tests(
                self.path.join("user-root"),
            ))
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn subagent_task(task_id: &str, parent_session_id: &str) -> SubagentTaskRecord {
        SubagentTaskRecord::new(
            task_id.to_string(),
            parent_session_id.to_string(),
            "inspect runtime".to_string(),
            "execution-1".to_string(),
            10,
        )
    }

    const CROSS_PROCESS_WORKSPACE_ENV: &str = "VOID_B2_CLAIM_WORKSPACE";
    const CROSS_PROCESS_USER_ROOT_ENV: &str = "VOID_B2_CLAIM_USER_ROOT";

    #[test]
    fn cross_process_delivery_claim_worker() {
        let Ok(workspace_path) = std::env::var(CROSS_PROCESS_WORKSPACE_ENV) else {
            return;
        };
        let user_root =
            std::env::var(CROSS_PROCESS_USER_ROOT_ENV).expect("worker user root should be set");
        let runtime = tokio::runtime::Runtime::new().expect("worker runtime");
        runtime.block_on(async {
            let manager = PersistenceManager::new(Arc::new(
                PathManager::with_user_root_for_tests(PathBuf::from(user_root)),
            ))
            .expect("worker persistence manager");
            manager
                .claim_subagent_task_delivery(
                    Path::new(&workspace_path),
                    "parent-1",
                    "bg-subagent-cross-process",
                    format!("lease-{}", std::process::id()),
                    format!("process-{}", std::process::id()),
                    13,
                    30_000,
                )
                .await
                .expect("worker claim should not fail");
        });
    }

    #[tokio::test]
    async fn recovery_checkpoint_round_trips_through_existing_session_storage() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");
        let checkpoint = RecoveryCheckpoint::from_messages(
            "checkpoint-1".to_string(),
            "session-1".to_string(),
            "turn-1".to_string(),
            RecoveryBoundary::AutomaticContinue,
            42,
            &[Message::user("Continue the task".to_string())],
            10,
        );

        manager
            .save_recovery_checkpoint(workspace.path(), "session-1", &checkpoint)
            .await
            .expect("checkpoint should persist");
        let restored = manager
            .load_recovery_checkpoint(workspace.path(), "session-1")
            .await
            .expect("checkpoint should load")
            .expect("checkpoint should exist");

        assert_eq!(restored, checkpoint);
        assert!(manager
            .save_recovery_checkpoint(workspace.path(), "different-session", &checkpoint)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn subagent_task_storage_handles_missing_directory_and_rejects_unsafe_ids() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        assert!(manager
            .list_subagent_tasks(workspace.path(), "parent-1")
            .await
            .expect("legacy session without task directory should list")
            .is_empty());
        assert!(manager
            .get_subagent_task(workspace.path(), "parent-1", "../escape")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn concurrent_subagent_delivery_claim_has_one_winner() {
        let workspace = TestWorkspace::new();
        let manager = Arc::new(
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager"),
        );
        let competing_manager =
            Arc::new(PersistenceManager::new(workspace.path_manager()).expect("competing manager"));
        let mut task = subagent_task("bg-subagent-claim", "parent-1");
        task.transition_status(SubagentTaskStatus::Running, 11)
            .expect("task should run");
        task.transition_status(SubagentTaskStatus::Completed, 12)
            .expect("task should complete");
        task.result = Some("done".to_string());
        manager
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .expect("task should save");

        let (left, right) = tokio::join!(
            manager.claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-claim",
                "lease-left".into(),
                "process-left".into(),
                13,
                30_000,
            ),
            competing_manager.claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-claim",
                "lease-right".into(),
                "process-right".into(),
                13,
                30_000,
            )
        );
        let winners = [left, right]
            .into_iter()
            .filter(|result| result.as_ref().is_ok_and(Option::is_some))
            .count();
        assert_eq!(winners, 1);

        let claimed = manager
            .get_subagent_task(workspace.path(), "parent-1", "bg-subagent-claim")
            .await
            .unwrap()
            .unwrap();
        let winning_lease = claimed.delivery_lease.unwrap().lease_id;
        manager
            .complete_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-claim",
                &winning_lease,
                "dialog-turn:receipt".into(),
                14,
            )
            .await
            .expect("claimed delivery should complete");
        assert!(manager
            .complete_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-claim",
                &winning_lease,
                "duplicate".into(),
                15,
            )
            .await
            .is_err());
        assert!(manager
            .fail_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-claim",
                &winning_lease,
                "duplicate".into(),
                15,
            )
            .await
            .is_err());

        let mut failed_delivery = subagent_task("bg-subagent-failed-delivery", "parent-1");
        failed_delivery
            .transition_status(SubagentTaskStatus::Running, 16)
            .expect("task should run");
        failed_delivery
            .transition_status(SubagentTaskStatus::Failed, 17)
            .expect("task should fail");
        failed_delivery.failure = Some("execution failed".to_string());
        manager
            .create_subagent_task(workspace.path(), "parent-1", &failed_delivery)
            .await
            .expect("second task should save");
        manager
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-failed-delivery",
                "failure-lease".into(),
                "process".into(),
                18,
                30_000,
            )
            .await
            .expect("claim should succeed")
            .expect("delivery should be claimable");
        let failed = manager
            .fail_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-failed-delivery",
                "failure-lease",
                "scheduler unavailable".into(),
                19,
            )
            .await
            .expect("claimed delivery should fail once");
        assert_eq!(failed.failure.as_deref(), Some("execution failed"));
        let retry_claim = manager
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-failed-delivery",
                "retry-lease".into(),
                "process".into(),
                20,
                30_000,
            )
            .await
            .expect("claim check should succeed")
            .expect("idempotent failed delivery should be retryable");
        assert_eq!(retry_claim.delivery_attempts, 2);
        assert_eq!(
            retry_claim.delivery_state,
            SubagentTaskDeliveryState::Delivering
        );
        assert!(manager
            .fail_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-failed-delivery",
                "failure-lease",
                "duplicate".into(),
                20,
            )
            .await
            .is_err());
    }

    #[tokio::test]
    async fn cross_process_subagent_delivery_claim_has_one_winner() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");
        let mut task = subagent_task("bg-subagent-cross-process", "parent-1");
        task.transition_status(SubagentTaskStatus::Running, 11)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 12)
            .unwrap();
        manager
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .unwrap();

        let executable = std::env::current_exe().expect("current test executable");
        let user_root = workspace.path().join("user-root");
        let spawn_worker = || {
            Command::new(&executable)
                .arg("--exact")
                .arg(
                    "agentic::persistence::manager::tests::cross_process_delivery_claim_worker",
                )
                .env(CROSS_PROCESS_WORKSPACE_ENV, workspace.path())
                .env(CROSS_PROCESS_USER_ROOT_ENV, &user_root)
                .spawn()
                .expect("claim worker should start")
        };
        let mut first = spawn_worker();
        let mut second = spawn_worker();
        assert!(first.wait().expect("first worker should exit").success());
        assert!(second.wait().expect("second worker should exit").success());

        let claimed = manager
            .get_subagent_task(
                workspace.path(),
                "parent-1",
                "bg-subagent-cross-process",
            )
            .await
            .unwrap()
            .unwrap();
        assert_eq!(claimed.delivery_attempts, 1);
        assert_eq!(
            claimed.delivery_state,
            SubagentTaskDeliveryState::Delivering
        );
    }

    #[tokio::test]
    async fn restart_recovery_interrupts_active_tasks_and_queues_terminal_pending_delivery() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        let created = subagent_task("bg-subagent-created", "parent-1");
        manager
            .create_subagent_task(workspace.path(), "parent-1", &created)
            .await
            .expect("created task should save");

        let mut running = subagent_task("bg-subagent-running", "parent-1");
        running
            .transition_status(SubagentTaskStatus::Running, 11)
            .expect("task should run");
        manager
            .create_subagent_task(workspace.path(), "parent-1", &running)
            .await
            .expect("running task should save");

        let mut completed = subagent_task("bg-subagent-completed", "parent-1");
        completed
            .transition_status(SubagentTaskStatus::Running, 11)
            .expect("task should run");
        completed
            .transition_status(SubagentTaskStatus::Completed, 12)
            .expect("task should complete");
        manager
            .create_subagent_task(workspace.path(), "parent-1", &completed)
            .await
            .expect("completed task should save");

        let changed = manager
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 20)
            .await
            .expect("recovery should succeed");
        assert_eq!(changed.len(), 3);
        assert!(changed
            .iter()
            .filter(|task| task.status == SubagentTaskStatus::Interrupted)
            .all(|task| task.recovery_state == SubagentTaskRecoveryState::Blocked));
        let completed = manager
                .get_subagent_task(workspace.path(), "parent-1", "bg-subagent-completed")
                .await
                .expect("task should load")
            .expect("task should exist");
        assert_eq!(completed.status, SubagentTaskStatus::Completed);
        assert_eq!(completed.recovery_state, SubagentTaskRecoveryState::Queued);

        assert!(manager
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 21)
            .await
            .expect("repeated recovery should succeed")
            .is_empty());
    }

    #[tokio::test]
    async fn expired_delivery_lease_can_be_reclaimed_after_process_crash() {
        let workspace = TestWorkspace::new();
        let first_process =
            PersistenceManager::new(workspace.path_manager()).expect("first process");
        let restarted_process =
            PersistenceManager::new(workspace.path_manager()).expect("restarted process");
        let mut task = subagent_task("bg-subagent-crash", "parent-1");
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        first_process
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .unwrap();
        first_process
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-crash",
                "crashed-lease".into(),
                "process-1".into(),
                4,
                10,
            )
            .await
            .unwrap()
            .expect("initial claim");

        assert!(restarted_process
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-crash",
                "too-early".into(),
                "process-2".into(),
                13,
                10,
            )
            .await
            .unwrap()
            .is_none());
        let reclaimed = restarted_process
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-crash",
                "reclaimed-lease".into(),
                "process-2".into(),
                14,
                10,
            )
            .await
            .unwrap()
            .expect("expired lease should be reclaimed");
        assert_eq!(reclaimed.delivery_attempts, 2);
        assert_eq!(
            reclaimed.delivery_lease.unwrap().lease_id,
            "reclaimed-lease"
        );
    }

    #[tokio::test]
    async fn failed_idempotent_delivery_is_requeued_and_single_winner_reclaims_it() {
        let workspace = TestWorkspace::new();
        let first_process =
            PersistenceManager::new(workspace.path_manager()).expect("first process");
        let restarted_process =
            PersistenceManager::new(workspace.path_manager()).expect("restarted process");
        let competing_process =
            PersistenceManager::new(workspace.path_manager()).expect("competing process");
        let mut task = subagent_task("bg-subagent-retry", "parent-1");
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        first_process
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .unwrap();
        first_process
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-retry",
                "failed-lease".into(),
                "process-1".into(),
                4,
                10,
            )
            .await
            .unwrap()
            .unwrap();
        first_process
            .fail_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-retry",
                "failed-lease",
                "connection reset".into(),
                5,
            )
            .await
            .unwrap();
        restarted_process
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 20)
            .await
            .unwrap();

        let (winner, loser) = tokio::join!(
            restarted_process.claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-retry",
                "retry-1".into(),
                "process-2".into(),
                21,
                10,
            ),
            competing_process.claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-retry",
                "retry-2".into(),
                "process-3".into(),
                21,
                10,
            ),
        );
        assert_eq!(
            [winner.unwrap().is_some(), loser.unwrap().is_some()]
                .into_iter()
                .filter(|claimed| *claimed)
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn restart_blocks_expired_delivery_without_replay_guarantee() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");
        let mut task = subagent_task("bg-subagent-unsafe", "parent-1");
        task.delivery_replay_safety = SubagentTaskReplaySafety::UnsafeExternalSideEffect;
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        manager
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .unwrap();
        manager
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-unsafe",
                "unsafe-lease".into(),
                "process-1".into(),
                4,
                10,
            )
            .await
            .unwrap()
            .expect("initial delivery may be claimed");

        let changed = manager
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 14)
            .await
            .unwrap();
        assert_eq!(changed.len(), 1);
        assert_eq!(
            changed[0].delivery_state,
            SubagentTaskDeliveryState::Blocked
        );
        assert_eq!(
            changed[0].recovery_state,
            SubagentTaskRecoveryState::Blocked
        );
        assert!(changed[0]
            .recovery_reason
            .as_deref()
            .unwrap()
            .contains("without idempotency"));
        assert_eq!(
            changed[0]
                .recovery_block
                .as_ref()
                .map(|blocked| blocked.code),
            Some(SubagentTaskRecoveryBlockCode::UnsafeDeliveryReplay)
        );
    }

    #[tokio::test]
    async fn interrupted_task_is_resumable_only_with_persisted_checkpoint() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");
        let mut task = subagent_task("subagent-resume", "parent-1");
        task.child_session_id = Some("child-1".into());
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        manager
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .unwrap();
        let checkpoint = RecoveryCheckpoint::from_messages(
            "checkpoint-1".into(),
            "child-1".into(),
            "turn-1".into(),
            RecoveryBoundary::AutomaticContinue,
            42,
            &[Message::user("finish the child task".into())],
            3,
        );
        manager
            .save_recovery_checkpoint(workspace.path(), "child-1", &checkpoint)
            .await
            .unwrap();

        let recovered = manager
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 4)
            .await
            .unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].status, SubagentTaskStatus::Interrupted);
        assert_eq!(
            recovered[0].recovery_state,
            SubagentTaskRecoveryState::Queued
        );
        assert_eq!(
            recovered[0]
                .durable_checkpoint
                .as_ref()
                .map(|checkpoint| checkpoint.checkpoint_id.as_str()),
            Some("checkpoint-1")
        );
        let resumed = manager
            .transition_subagent_task(
                workspace.path(),
                "parent-1",
                "subagent-resume",
                SubagentTaskStatus::Running,
                None,
                None,
                None,
                None,
                5,
            )
            .await
            .expect("durable checkpoint should allow resume");
        assert_eq!(resumed.status, SubagentTaskStatus::Running);
    }

    #[tokio::test]
    async fn delivered_task_is_unchanged_across_repeated_startup_recovery() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");
        let mut task = subagent_task("bg-subagent-delivered", "parent-1");
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        manager
            .create_subagent_task(workspace.path(), "parent-1", &task)
            .await
            .unwrap();
        manager
            .claim_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-delivered",
                "lease".into(),
                "process".into(),
                4,
                10,
            )
            .await
            .unwrap();
        manager
            .complete_subagent_task_delivery(
                workspace.path(),
                "parent-1",
                "bg-subagent-delivered",
                "lease",
                "dialog-turn:receipt".into(),
                5,
            )
            .await
            .unwrap();

        assert!(manager
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 20)
            .await
            .unwrap()
            .is_empty());
        assert!(manager
            .recover_subagent_tasks_after_restart(workspace.path(), "parent-1", 21)
            .await
            .unwrap()
            .is_empty());
    }

    #[test]
    fn transcript_turn_selectors_support_head_and_tail_ranges() {
        let selectors = PersistenceManager::parse_transcript_turn_selectors(&[
            ":1".to_string(),
            "-3:".to_string(),
        ])
        .expect("selectors should parse");

        let selected = PersistenceManager::transcript_select_turn_indices(8, &selectors);

        assert_eq!(selected, vec![0, 5, 6, 7]);
    }

    #[test]
    fn transcript_turn_selectors_deduplicate_and_sort_results() {
        let selectors = PersistenceManager::parse_transcript_turn_selectors(&[
            "4".to_string(),
            "2:5".to_string(),
            "-1".to_string(),
        ])
        .expect("selectors should parse");

        let selected = PersistenceManager::transcript_select_turn_indices(6, &selectors);

        assert_eq!(selected, vec![2, 3, 4, 5]);
    }

    #[test]
    fn transcript_turn_selectors_reject_invalid_syntax() {
        let error = PersistenceManager::parse_transcript_turn_selectors(&["1:2:3".to_string()])
            .expect_err("selector should be rejected");

        assert!(
            error.to_string().contains("Invalid turn selector"),
            "unexpected error: {}",
            error
        );
    }

    #[tokio::test]
    async fn export_session_transcript_handles_first_selected_turn_without_panicking() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");
        let session_id = Uuid::new_v4().to_string();

        let metadata = SessionMetadata::new(
            session_id.clone(),
            "Transcript test".to_string(),
            "agent".to_string(),
            "model".to_string(),
        );
        manager
            .save_session_metadata(workspace.path(), &metadata)
            .await
            .expect("metadata should save");

        let user_message = UserMessageData {
            id: "user-1".to_string(),
            content: "hello transcript".to_string(),
            timestamp: 0,
            metadata: None,
        };
        let mut turn =
            DialogTurnData::new("turn-1".to_string(), 0, session_id.clone(), user_message);
        turn.mark_completed();
        manager
            .save_dialog_turn(workspace.path(), &turn)
            .await
            .expect("turn should save");

        let export = manager
            .export_session_transcript(
                workspace.path(),
                &session_id,
                &SessionTranscriptExportOptions::default(),
            )
            .await
            .expect("transcript export should succeed");

        assert_eq!(export.turn_count, 1);
        assert_eq!(export.index.len(), 1);

        let transcript = std::fs::read_to_string(&export.transcript_path)
            .expect("transcript file should be readable");
        assert!(transcript.contains("## Turn 0"));
        assert!(transcript.contains("hello transcript"));
    }

    #[tokio::test]
    async fn load_session_with_turns_returns_session_and_persisted_turns() {
        let workspace = TestWorkspace::new();
        let manager = PersistenceManager::new(Arc::new(PathManager::new().expect("path manager")))
            .expect("persistence manager");
        let session_id = Uuid::new_v4().to_string();
        let session = Session::new_with_id(
            session_id.clone(),
            "Load once".to_string(),
            "agent".to_string(),
            SessionConfig {
                workspace_path: Some(workspace.path().to_string_lossy().to_string()),
                ..Default::default()
            },
        );

        manager
            .save_session(workspace.path(), &session)
            .await
            .expect("session should save");

        let user_message = UserMessageData {
            id: "user-1".to_string(),
            content: "hello once".to_string(),
            timestamp: 0,
            metadata: None,
        };
        let mut turn =
            DialogTurnData::new("turn-1".to_string(), 0, session_id.clone(), user_message);
        turn.mark_completed();
        manager
            .save_dialog_turn(workspace.path(), &turn)
            .await
            .expect("turn should save");

        let (loaded_session, loaded_turns) = manager
            .load_session_with_turns(workspace.path(), &session_id)
            .await
            .expect("session and turns should load together");

        assert_eq!(loaded_session.dialog_turn_ids, vec!["turn-1".to_string()]);
        assert_eq!(loaded_turns.len(), 1);
        assert_eq!(loaded_turns[0].turn_id, "turn-1");
    }

    fn user_message(content: &str) -> UserMessageData {
        UserMessageData {
            id: format!("user-{}", content),
            content: content.to_string(),
            timestamp: 0,
            metadata: None,
        }
    }

    fn text_item(id: &str, content: &str) -> TextItemData {
        TextItemData {
            id: id.to_string(),
            content: content.to_string(),
            is_streaming: false,
            timestamp: 0,
            is_markdown: true,
            order_index: None,
            is_subagent_item: None,
            parent_task_tool_id: None,
            subagent_session_id: None,
            status: None,
        }
    }

    fn round_with_text(turn_id: &str, text_items: Vec<TextItemData>) -> ModelRoundData {
        ModelRoundData {
            id: format!("round-{}", turn_id),
            turn_id: turn_id.to_string(),
            round_index: 0,
            timestamp: 0,
            text_items,
            tool_items: Vec::new(),
            thinking_items: Vec::new(),
            start_time: 0,
            end_time: Some(0),
            duration_ms: Some(0),
            provider_id: None,
            model_id: None,
            model_alias: None,
            first_chunk_ms: None,
            first_visible_output_ms: None,
            stream_duration_ms: None,
            attempt_count: None,
            failure_category: None,
            token_details: None,
            status: "completed".to_string(),
        }
    }

    #[tokio::test]
    async fn save_dialog_turn_updates_metadata_without_scanning_unrelated_turn_files() {
        let workspace = TestWorkspace::new();
        let manager = PersistenceManager::new(Arc::new(PathManager::new().expect("path manager")))
            .expect("persistence manager");
        let session_id = Uuid::new_v4().to_string();
        let session = Session::new_with_id(
            session_id.clone(),
            "Incremental metadata".to_string(),
            "agent".to_string(),
            SessionConfig {
                workspace_path: Some(workspace.path().to_string_lossy().to_string()),
                ..Default::default()
            },
        );

        manager
            .save_session(workspace.path(), &session)
            .await
            .expect("session should save");

        let mut turn_0 = DialogTurnData::new(
            "turn-0".to_string(),
            0,
            session_id.clone(),
            user_message("first"),
        );
        turn_0.model_rounds.push(round_with_text(
            "turn-0",
            vec![text_item("text-0", "first response")],
        ));
        turn_0.mark_completed();
        manager
            .save_dialog_turn(workspace.path(), &turn_0)
            .await
            .expect("first turn should save");

        let mut turn_1 = DialogTurnData::new(
            "turn-1".to_string(),
            1,
            session_id.clone(),
            user_message("second"),
        );
        turn_1.model_rounds.push(round_with_text(
            "turn-1",
            vec![text_item("text-1", "second response")],
        ));
        turn_1.mark_completed();
        manager
            .save_dialog_turn(workspace.path(), &turn_1)
            .await
            .expect("second turn should save");

        std::fs::write(
            manager.turn_path(workspace.path(), &session_id, 0),
            "{ not valid json",
        )
        .expect("old turn file should be replaceable for test");

        turn_1.model_rounds[0]
            .text_items
            .push(text_item("text-2", "additional response"));
        manager
            .save_dialog_turn(workspace.path(), &turn_1)
            .await
            .expect("saving current turn should not scan unrelated old turn files");

        let metadata = manager
            .load_session_metadata(workspace.path(), &session_id)
            .await
            .expect("metadata should load")
            .expect("metadata should exist");
        assert_eq!(metadata.turn_count, 2);
        assert_eq!(metadata.message_count, 5);
    }

    #[tokio::test]
    async fn concurrent_dialog_turn_saves_keep_metadata_counts_consistent() {
        let workspace = TestWorkspace::new();
        let manager = PersistenceManager::new(Arc::new(PathManager::new().expect("path manager")))
            .expect("persistence manager");
        let session_id = Uuid::new_v4().to_string();
        let session = Session::new_with_id(
            session_id.clone(),
            "Concurrent metadata".to_string(),
            "agent".to_string(),
            SessionConfig {
                workspace_path: Some(workspace.path().to_string_lossy().to_string()),
                ..Default::default()
            },
        );

        manager
            .save_session(workspace.path(), &session)
            .await
            .expect("session should save");

        let mut turn_0 = DialogTurnData::new(
            "turn-0".to_string(),
            0,
            session_id.clone(),
            user_message("first"),
        );
        turn_0.model_rounds.push(round_with_text(
            "turn-0",
            vec![text_item("text-0", "first response")],
        ));
        turn_0.mark_completed();
        manager
            .save_dialog_turn(workspace.path(), &turn_0)
            .await
            .expect("first turn should save");

        let mut turn_1 = DialogTurnData::new(
            "turn-1".to_string(),
            1,
            session_id.clone(),
            user_message("second"),
        );
        turn_1.model_rounds.push(round_with_text(
            "turn-1",
            vec![text_item("text-1", "second response")],
        ));
        turn_1.mark_completed();
        manager
            .save_dialog_turn(workspace.path(), &turn_1)
            .await
            .expect("second turn should save");

        let mut updated_turn_0 = turn_0.clone();
        updated_turn_0.model_rounds[0]
            .text_items
            .push(text_item("text-0b", "first follow-up"));

        let mut updated_turn_1 = turn_1.clone();
        updated_turn_1.model_rounds[0]
            .text_items
            .push(text_item("text-1b", "second follow-up"));
        updated_turn_1.model_rounds[0]
            .text_items
            .push(text_item("text-1c", "second final"));

        let (first_result, second_result) = tokio::join!(
            manager.save_dialog_turn(workspace.path(), &updated_turn_0),
            manager.save_dialog_turn(workspace.path(), &updated_turn_1)
        );
        first_result.expect("first concurrent save should succeed");
        second_result.expect("second concurrent save should succeed");

        let metadata = manager
            .load_session_metadata(workspace.path(), &session_id)
            .await
            .expect("metadata should load")
            .expect("metadata should exist");
        assert_eq!(metadata.turn_count, 2);
        assert_eq!(metadata.message_count, 7);
    }

    #[test]
    fn context_snapshot_payload_stats_counts_tool_result_payloads_without_contents() {
        let messages = vec![
            Message::assistant("hello".to_string()),
            Message::tool_result(ToolResult {
                tool_id: "tool-1".to_string(),
                tool_name: "Bash".to_string(),
                result: serde_json::json!({ "output": "x".repeat(40) }),
                result_for_assistant: Some("assistant summary".to_string()),
                is_error: false,
                duration_ms: Some(1),
                image_attachments: None,
            }),
        ];

        let stats = context_snapshot_payload_stats(&messages);

        assert_eq!(stats.tool_result_count, 1);
        assert_eq!(stats.raw_result_string_chars, 40);
        assert_eq!(stats.result_for_assistant_chars, 17);
        assert_eq!(stats.largest_raw_result_chars, 40);
        assert_eq!(stats.largest_raw_result_path, "message[1].Bash.output");
        assert!(!stats.largest_raw_result_path.contains(&"x".repeat(40)));
    }

    #[tokio::test]
    async fn subagent_session_kind_is_hidden_from_visible_session_index() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        let mut metadata = SessionMetadata::new(
            Uuid::new_v4().to_string(),
            "Subagent: repo sweep".to_string(),
            "Explore".to_string(),
            "model".to_string(),
        );
        metadata.session_kind = SessionKind::Subagent;

        manager
            .save_session_metadata(workspace.path(), &metadata)
            .await
            .expect("metadata should save");

        let visible = manager
            .list_session_metadata(workspace.path())
            .await
            .expect("visible metadata should load");
        let raw = manager
            .list_session_metadata_including_internal(workspace.path())
            .await
            .expect("raw metadata should load");

        assert!(visible.is_empty());
        assert_eq!(raw.len(), 1);
        assert!(raw[0].is_subagent());
    }

    #[tokio::test]
    async fn legacy_leaked_subagent_is_hidden_from_visible_session_index() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        let mut metadata = SessionMetadata::new(
            Uuid::new_v4().to_string(),
            "Subagent: stale task".to_string(),
            "Explore".to_string(),
            "model".to_string(),
        );
        metadata.created_by = Some("session-parent".to_string());

        manager
            .save_session_metadata(workspace.path(), &metadata)
            .await
            .expect("metadata should save");

        let visible = manager
            .list_session_metadata(workspace.path())
            .await
            .expect("visible metadata should load");
        let raw = manager
            .list_session_metadata_including_internal(workspace.path())
            .await
            .expect("raw metadata should load");

        assert!(visible.is_empty());
        assert_eq!(raw.len(), 1);
        assert!(raw[0].is_legacy_leaked_subagent_candidate());
    }

    #[tokio::test]
    async fn listing_sessions_does_not_create_sessions_dir_for_uninitialized_runtime() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        let visible = manager
            .list_session_metadata(workspace.path())
            .await
            .expect("visible listing should succeed");
        let raw = manager
            .list_session_metadata_including_internal(workspace.path())
            .await
            .expect("raw listing should succeed");

        assert!(visible.is_empty());
        assert!(raw.is_empty());
        assert!(
            !manager.project_sessions_dir(workspace.path()).exists(),
            "listing sessions should not create the runtime sessions directory"
        );
    }

    #[tokio::test]
    async fn list_session_metadata_page_returns_visible_top_level_page_with_children() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        for index in 0..12 {
            let mut metadata = SessionMetadata::new(
                format!("parent-{index}"),
                format!("Parent {index}"),
                "agent".to_string(),
                "model".to_string(),
            );
            metadata.last_active_at = 1_000 + index;
            manager
                .save_session_metadata(workspace.path(), &metadata)
                .await
                .expect("parent metadata should save");
        }

        let mut child = SessionMetadata::new(
            "child-latest".to_string(),
            "Child latest".to_string(),
            "agent".to_string(),
            "model".to_string(),
        );
        child.last_active_at = 2_000;
        child.relationship = Some(SessionRelationship {
            kind: Some(SessionRelationshipKind::Btw),
            parent_session_id: Some("parent-11".to_string()),
            ..Default::default()
        });
        manager
            .save_session_metadata(workspace.path(), &child)
            .await
            .expect("child metadata should save");

        let page = manager
            .list_session_metadata_page(workspace.path(), None, 5)
            .await
            .expect("session metadata page should load");
        let session_ids = page
            .sessions
            .iter()
            .map(|metadata| metadata.session_id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(page.total_top_level_count, 12);
        assert_eq!(page.loaded_top_level_count, 5);
        assert!(page.next_cursor.is_some());
        assert!(page.has_more);
        assert_eq!(
            session_ids,
            vec![
                "parent-11",
                "child-latest",
                "parent-10",
                "parent-9",
                "parent-8",
                "parent-7",
            ]
        );

        let second_page = manager
            .list_session_metadata_page(workspace.path(), page.next_cursor.as_deref(), 5)
            .await
            .expect("second session metadata page should load");
        let second_page_session_ids = second_page
            .sessions
            .iter()
            .map(|metadata| metadata.session_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(second_page.loaded_top_level_count, 5);
        assert_eq!(
            second_page_session_ids,
            vec!["parent-6", "parent-5", "parent-4", "parent-3", "parent-2"]
        );
    }

    #[tokio::test]
    async fn list_session_metadata_page_rebuilds_stale_visible_page_entry() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        let mut older = SessionMetadata::new(
            "older-session".to_string(),
            "Older session".to_string(),
            "agent".to_string(),
            "model".to_string(),
        );
        older.last_active_at = 1_000;
        let mut newer = SessionMetadata::new(
            "newer-session".to_string(),
            "Newer session".to_string(),
            "agent".to_string(),
            "model".to_string(),
        );
        newer.last_active_at = 2_000;

        manager
            .save_session_metadata(workspace.path(), &older)
            .await
            .expect("older metadata should save");
        manager
            .save_session_metadata(workspace.path(), &newer)
            .await
            .expect("newer metadata should save");

        let mut missing = SessionMetadata::new(
            "missing-session".to_string(),
            "Missing session".to_string(),
            "agent".to_string(),
            "model".to_string(),
        );
        missing.last_active_at = 3_000;

        let stale_index = StoredSessionIndexFile::new(0, vec![missing, older]);
        manager
            .write_json_atomic(&manager.index_path(workspace.path()), &stale_index)
            .await
            .expect("stale index should be written");

        let page = manager
            .list_session_metadata_page(workspace.path(), None, 5)
            .await
            .expect("session metadata page should rebuild stale index");
        let session_ids = page
            .sessions
            .iter()
            .map(|metadata| metadata.session_id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(page.total_top_level_count, 2);
        assert_eq!(session_ids, vec!["newer-session", "older-session"]);
    }

    #[tokio::test]
    #[ignore = "local performance benchmark; prints timing data only"]
    async fn bench_session_metadata_page_vs_full_list() {
        const SESSION_COUNT: usize = 1_000;
        const ITERATIONS: usize = 10;

        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        for index in 0..SESSION_COUNT {
            let mut metadata = SessionMetadata::new(
                format!("bench-parent-{index}"),
                format!("Bench parent {index}"),
                "agent".to_string(),
                "model".to_string(),
            );
            metadata.last_active_at = 1_000_000 + index as u64;
            manager
                .save_session_metadata(workspace.path(), &metadata)
                .await
                .expect("benchmark metadata should save");
        }

        manager
            .list_session_metadata(workspace.path())
            .await
            .expect("warm full list should load");
        manager
            .list_session_metadata_page(workspace.path(), None, 5)
            .await
            .expect("warm page should load");

        let mut full_list_total_ms = 0.0;
        for _ in 0..ITERATIONS {
            let started = Instant::now();
            let full = manager
                .list_session_metadata(workspace.path())
                .await
                .expect("full list should load");
            assert_eq!(full.len(), SESSION_COUNT);
            full_list_total_ms += started.elapsed().as_secs_f64() * 1000.0;
        }

        let mut page_total_ms = 0.0;
        for _ in 0..ITERATIONS {
            let started = Instant::now();
            let page = manager
                .list_session_metadata_page(workspace.path(), None, 5)
                .await
                .expect("page should load");
            assert_eq!(page.loaded_top_level_count, 5);
            assert_eq!(page.total_top_level_count, SESSION_COUNT);
            page_total_ms += started.elapsed().as_secs_f64() * 1000.0;
        }

        let full_avg_ms = full_list_total_ms / ITERATIONS as f64;
        let page_avg_ms = page_total_ms / ITERATIONS as f64;
        println!(
            "session_metadata_bench sessions={} iterations={} full_list_avg_ms={:.3} page5_avg_ms={:.3} speedup={:.1}x",
            SESSION_COUNT,
            ITERATIONS,
            full_avg_ms,
            page_avg_ms,
            full_avg_ms / page_avg_ms.max(0.001)
        );
    }

    #[tokio::test]
    async fn saving_session_metadata_ensures_runtime_layout_before_writing() {
        let workspace = TestWorkspace::new();
        let manager =
            PersistenceManager::new(workspace.path_manager()).expect("persistence manager");

        let metadata = SessionMetadata::new(
            Uuid::new_v4().to_string(),
            "Runtime ensure".to_string(),
            "agent".to_string(),
            "model".to_string(),
        );

        manager
            .save_session_metadata(workspace.path(), &metadata)
            .await
            .expect("metadata should save");

        let runtime = manager
            .runtime_service()
            .context_for_local_workspace(workspace.path());
        assert!(runtime.runtime_root.exists());
        assert!(runtime.sessions_dir.exists());
        assert!(runtime.snapshot_by_hash_dir.exists());
        assert!(runtime.snapshot_metadata_dir.exists());
        assert!(runtime.snapshot_operations_dir.exists());
        assert!(runtime.plans_dir.exists());
        assert!(runtime.layout_state_file.exists());
    }
}
