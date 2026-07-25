use super::consent::{AgentMemoryCandidate, MemoryTransitionError};
use crate::infrastructure::app_paths::PathManager;
use crate::service::atomic_file::replace_file;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_CANDIDATE_BYTES: usize = 4_096;
pub const AGENT_MEMORY_SCHEMA_VERSION: u32 = 2;

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn default_schema_version() -> u32 {
    AGENT_MEMORY_SCHEMA_VERSION
}

fn default_revision() -> u64 {
    1
}

fn default_committed_state() -> super::consent::AgentMemoryState {
    super::consent::AgentMemoryState::Committed
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemorySource {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renderer_version: Option<String>,
}

impl AgentMemorySource {
    pub fn legacy_manual() -> Self {
        Self {
            kind: "legacy_manual".to_string(),
            session_id: None,
            transcript_fingerprint: None,
            renderer_version: None,
        }
    }
}

impl Default for AgentMemorySource {
    fn default() -> Self {
        Self::legacy_manual()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredAgentMemory {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub id: String,
    pub content: String,
    #[serde(default = "default_revision")]
    pub revision: u64,
    #[serde(default)]
    pub source: AgentMemorySource,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub updated_at: u64,
    #[serde(default = "default_committed_state")]
    pub state: super::consent::AgentMemoryState,
}

impl StoredAgentMemory {
    fn new_committed(id: String, content: String, now: u64) -> Self {
        Self {
            schema_version: AGENT_MEMORY_SCHEMA_VERSION,
            id,
            content,
            revision: 1,
            source: AgentMemorySource::legacy_manual(),
            created_at: now,
            updated_at: now,
            state: super::consent::AgentMemoryState::Committed,
        }
    }

    pub fn is_committed(&self) -> bool {
        self.state == super::consent::AgentMemoryState::Committed
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCandidateBatch {
    pub candidates: Vec<AgentMemoryCandidate>,
    pub rejected_count: usize,
}

pub trait AgentMemoryRepository {
    fn list(&self, workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String>;
    fn write_cas(
        &self,
        workspace_root: &Path,
        memory: &StoredAgentMemory,
        expected_revision: Option<u64>,
    ) -> Result<(), String>;
    fn delete(&self, workspace_root: &Path, id: &str) -> Result<(), String>;
}

#[derive(Clone)]
pub struct FileAgentMemoryRepository {
    path_manager: std::sync::Arc<PathManager>,
}

impl FileAgentMemoryRepository {
    pub fn new(path_manager: std::sync::Arc<PathManager>) -> Self {
        Self { path_manager }
    }

    fn memory_dir(&self, workspace_root: &Path) -> PathBuf {
        self.path_manager.project_memory_dir(workspace_root)
    }

    fn memory_path(&self, workspace_root: &Path, id: &str) -> Result<PathBuf, String> {
        memory_file_path(&self.memory_dir(workspace_root), id)
    }
}

fn memory_file_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("invalid memory id".to_string());
    }
    Ok(dir.join(format!("{id}.json")))
}

pub(crate) fn list_stored_agent_memories_in_dir(
    dir: &Path,
) -> Result<Vec<StoredAgentMemory>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut memories = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(entry.path()).map_err(|error| error.to_string())?;
        let memory =
            serde_json::from_str::<StoredAgentMemory>(&raw).map_err(|error| error.to_string())?;
        memories.push(memory);
    }
    memories.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(memories)
}

fn write_stored_agent_memory_cas_in_dir(
    memory_dir: &Path,
    memory: &StoredAgentMemory,
    expected_revision: Option<u64>,
) -> Result<(), String> {
    fs::create_dir_all(memory_dir).map_err(|error| error.to_string())?;
    let lock = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(memory_dir.join(".agent-memory.lock"))
        .map_err(|error| error.to_string())?;
    lock.lock_exclusive().map_err(|error| error.to_string())?;

    let path = memory_file_path(memory_dir, &memory.id)?;
    let actual_revision = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        Some(
            serde_json::from_str::<StoredAgentMemory>(&raw)
                .map_err(|error| error.to_string())?
                .revision,
        )
    } else {
        None
    };
    if actual_revision != expected_revision {
        return Err(format!(
            "memory revision conflict: expected {:?}, found {:?}",
            expected_revision, actual_revision
        ));
    }
    let required_revision = expected_revision
        .map(|revision| revision.saturating_add(1))
        .unwrap_or(1);
    if memory.schema_version != AGENT_MEMORY_SCHEMA_VERSION || memory.revision != required_revision
    {
        return Err(format!(
            "invalid memory version: schemaVersion={} revision={}, expected schemaVersion={} revision={}",
            memory.schema_version,
            memory.revision,
            AGENT_MEMORY_SCHEMA_VERSION,
            required_revision
        ));
    }
    let data = serde_json::to_vec_pretty(memory).map_err(|error| error.to_string())?;
    replace_file(&path, &data)
}

impl AgentMemoryRepository for FileAgentMemoryRepository {
    fn list(&self, workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String> {
        list_stored_agent_memories_in_dir(&self.memory_dir(workspace_root))
    }

    fn write_cas(
        &self,
        workspace_root: &Path,
        memory: &StoredAgentMemory,
        expected_revision: Option<u64>,
    ) -> Result<(), String> {
        write_stored_agent_memory_cas_in_dir(
            &self.memory_dir(workspace_root),
            memory,
            expected_revision,
        )
    }

    fn delete(&self, workspace_root: &Path, id: &str) -> Result<(), String> {
        let path = self.memory_path(workspace_root, id)?;
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

pub struct AgentMemoryService<R> {
    repository: R,
}

impl<R: AgentMemoryRepository> AgentMemoryService<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub fn extract_candidates(
        &self,
        inputs: impl IntoIterator<Item = String>,
    ) -> MemoryCandidateBatch {
        let mut rejected_count = 0;
        let mut seen = HashSet::new();
        let candidates = inputs
            .into_iter()
            .filter_map(|input| {
                let content = normalize_memory_content(&input);
                if content.is_empty()
                    || content.len() > MAX_CANDIDATE_BYTES
                    || contains_sensitive_or_hidden_data(&content)
                {
                    rejected_count += 1;
                    return None;
                }
                let key = content.to_lowercase();
                if !seen.insert(key) {
                    return None;
                }
                let mut candidate =
                    AgentMemoryCandidate::new(Uuid::new_v4().to_string(), content).ok()?;
                candidate.request_consent().ok()?;
                Some(candidate)
            })
            .collect();
        MemoryCandidateBatch {
            candidates,
            rejected_count,
        }
    }

    pub fn merge_candidates(
        &self,
        existing: &[StoredAgentMemory],
        batch: MemoryCandidateBatch,
    ) -> MemoryCandidateBatch {
        let existing = existing
            .iter()
            .map(|memory| normalize_memory_content(&memory.content).to_lowercase())
            .collect::<HashSet<_>>();
        MemoryCandidateBatch {
            candidates: batch
                .candidates
                .into_iter()
                .filter(|candidate| !existing.contains(&candidate.content.to_lowercase()))
                .collect(),
            rejected_count: batch.rejected_count,
        }
    }

    pub fn commit(
        &self,
        workspace_root: &Path,
        mut candidate: AgentMemoryCandidate,
        approved: bool,
    ) -> Result<AgentMemoryCandidate, MemoryTransitionError> {
        candidate.resolve_consent(approved)?;
        if !approved {
            return Ok(candidate);
        }
        if contains_sensitive_or_hidden_data(&candidate.content) {
            return Err(MemoryTransitionError::PersistenceFailed(
                "candidate contains credentials or hidden system data".to_string(),
            ));
        }
        let memory = StoredAgentMemory::new_committed(
            candidate.id.clone(),
            candidate.content.clone(),
            current_time_ms(),
        );
        candidate.commit_with(|_| self.repository.write_cas(workspace_root, &memory, None))?;
        Ok(candidate)
    }

    pub fn list(&self, workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String> {
        self.repository.list(workspace_root)
    }

    pub fn delete(&self, workspace_root: &Path, id: &str) -> Result<(), String> {
        self.repository.delete(workspace_root, id)
    }
}

fn normalize_memory_content(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_sensitive_or_hidden_data(input: &str) -> bool {
    let lower = input.to_lowercase();
    const BLOCKED_MARKERS: &[&str] = &[
        "api_key",
        "api key",
        "access_token",
        "access token",
        "refresh_token",
        "refresh token",
        "password",
        "passwd",
        "authorization: bearer",
        "begin private key",
        "secret=",
        "system prompt",
        "hidden instruction",
        "<system>",
    ];
    const CREDENTIAL_PREFIXES: &[&str] = &["sk-", "ghp_", "github_pat_", "xoxb-", "xoxp-", "eyjhb"];
    BLOCKED_MARKERS.iter().any(|marker| lower.contains(marker))
        || lower
            .split(|character: char| character.is_whitespace() || "=:\"'".contains(character))
            .any(|word| {
                CREDENTIAL_PREFIXES
                    .iter()
                    .any(|prefix| word.starts_with(prefix))
            })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_memory::consent::AgentMemoryState;
    use std::cell::RefCell;

    #[derive(Default)]
    struct MemoryRepository {
        values: RefCell<Vec<StoredAgentMemory>>,
    }

    impl AgentMemoryRepository for MemoryRepository {
        fn list(&self, _workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String> {
            Ok(self.values.borrow().clone())
        }

        fn write_cas(
            &self,
            _workspace_root: &Path,
            memory: &StoredAgentMemory,
            expected_revision: Option<u64>,
        ) -> Result<(), String> {
            let actual_revision = self
                .values
                .borrow()
                .iter()
                .find(|value| value.id == memory.id)
                .map(|value| value.revision);
            if actual_revision != expected_revision {
                return Err("memory revision conflict".to_string());
            }
            self.values.borrow_mut().push(memory.clone());
            Ok(())
        }

        fn delete(&self, _workspace_root: &Path, id: &str) -> Result<(), String> {
            self.values.borrow_mut().retain(|memory| memory.id != id);
            Ok(())
        }
    }

    #[test]
    fn extracts_unique_candidates_and_rejects_secrets() {
        let service = AgentMemoryService::new(MemoryRepository::default());
        let batch = service.extract_candidates([
            "Prefer focused tests".to_string(),
            " Prefer   focused tests ".to_string(),
            "API_KEY=do-not-store".to_string(),
        ]);
        assert_eq!(batch.candidates.len(), 1);
        assert_eq!(batch.rejected_count, 1);
        assert_eq!(batch.candidates[0].state, AgentMemoryState::ConsentPending);
    }

    #[test]
    fn commit_requires_explicit_approval_and_supports_list_delete() {
        let service = AgentMemoryService::new(MemoryRepository::default());
        let workspace = Path::new("workspace");
        let candidate = service
            .extract_candidates(["Use narrow changes".to_string()])
            .candidates
            .remove(0);
        let denied = service.commit(workspace, candidate.clone(), false).unwrap();
        assert_eq!(denied.state, AgentMemoryState::Deleted);
        assert!(service.list(workspace).unwrap().is_empty());

        let committed = service.commit(workspace, candidate, true).unwrap();
        assert_eq!(committed.state, AgentMemoryState::Committed);
        assert_eq!(service.list(workspace).unwrap().len(), 1);
        service.delete(workspace, &committed.id).unwrap();
        assert!(service.list(workspace).unwrap().is_empty());
    }

    #[test]
    fn merge_removes_memories_already_committed() {
        let service = AgentMemoryService::new(MemoryRepository::default());
        let batch = service.extract_candidates([
            "Use focused tests".to_string(),
            "Keep diffs small".to_string(),
        ]);
        let merged = service.merge_candidates(
            &[StoredAgentMemory {
                schema_version: AGENT_MEMORY_SCHEMA_VERSION,
                id: "old".to_string(),
                content: "use focused tests".to_string(),
                revision: 1,
                source: AgentMemorySource::legacy_manual(),
                created_at: 0,
                updated_at: 0,
                state: AgentMemoryState::Committed,
            }],
            batch,
        );
        assert_eq!(merged.candidates.len(), 1);
        assert_eq!(merged.candidates[0].content, "Keep diffs small");
    }

    #[test]
    fn v1_memory_deserializes_as_committed_v2_record() {
        let memory: StoredAgentMemory =
            serde_json::from_str(r#"{"id":"legacy","content":"Keep diffs small"}"#).unwrap();

        assert_eq!(memory.schema_version, AGENT_MEMORY_SCHEMA_VERSION);
        assert_eq!(memory.revision, 1);
        assert_eq!(memory.source, AgentMemorySource::legacy_manual());
        assert_eq!(memory.created_at, 0);
        assert_eq!(memory.updated_at, 0);
        assert_eq!(memory.state, AgentMemoryState::Committed);
    }

    #[test]
    fn file_repository_compare_and_swap_rejects_stale_revision() {
        let directory = crate::service::agent_memory::AgentMemoryTestDir::new();
        let first =
            StoredAgentMemory::new_committed("memory-1".to_string(), "first".to_string(), 10);
        write_stored_agent_memory_cas_in_dir(directory.path(), &first, None).unwrap();

        let mut second = first.clone();
        second.content = "second".to_string();
        second.revision = 2;
        second.updated_at = 20;
        write_stored_agent_memory_cas_in_dir(directory.path(), &second, Some(1)).unwrap();

        let mut stale = second.clone();
        stale.content = "stale".to_string();
        let error =
            write_stored_agent_memory_cas_in_dir(directory.path(), &stale, Some(1)).unwrap_err();
        assert!(error.contains("revision conflict"));

        let stored = list_stored_agent_memories_in_dir(directory.path()).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].revision, 2);
        assert_eq!(stored[0].content, "second");
    }
}
