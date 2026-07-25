use super::consent::{AgentMemoryCandidate, MemoryTransitionError};
use crate::infrastructure::app_paths::PathManager;
use crate::service::atomic_file::replace_file;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_CANDIDATE_BYTES: usize = 4_096;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredAgentMemory {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCandidateBatch {
    pub candidates: Vec<AgentMemoryCandidate>,
    pub rejected_count: usize,
}

pub trait AgentMemoryRepository {
    fn list(&self, workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String>;
    fn write(&self, workspace_root: &Path, memory: &StoredAgentMemory) -> Result<(), String>;
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
        if id.is_empty()
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        {
            return Err("invalid memory id".to_string());
        }
        Ok(self.memory_dir(workspace_root).join(format!("{id}.json")))
    }
}

impl AgentMemoryRepository for FileAgentMemoryRepository {
    fn list(&self, workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String> {
        let dir = self.memory_dir(workspace_root);
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
            let memory = serde_json::from_str::<StoredAgentMemory>(&raw)
                .map_err(|error| error.to_string())?;
            memories.push(memory);
        }
        memories.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(memories)
    }

    fn write(&self, workspace_root: &Path, memory: &StoredAgentMemory) -> Result<(), String> {
        let path = self.memory_path(workspace_root, &memory.id)?;
        let data = serde_json::to_vec_pretty(memory).map_err(|error| error.to_string())?;
        replace_file(&path, &data)
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
        let memory = StoredAgentMemory {
            id: candidate.id.clone(),
            content: candidate.content.clone(),
        };
        candidate.commit_with(|_| self.repository.write(workspace_root, &memory))?;
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

        fn write(&self, _workspace_root: &Path, memory: &StoredAgentMemory) -> Result<(), String> {
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
                id: "old".to_string(),
                content: "use focused tests".to_string(),
            }],
            batch,
        );
        assert_eq!(merged.candidates.len(), 1);
        assert_eq!(merged.candidates[0].content, "Keep diffs small");
    }
}
