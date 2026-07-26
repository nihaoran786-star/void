use super::consent::AgentMemoryState;
use super::repository::{
    contains_sensitive_or_hidden_data, current_time_ms, normalize_memory_content,
    AgentMemoryRepository, AgentMemorySource, StoredAgentMemory, AGENT_MEMORY_SCHEMA_VERSION,
    MAX_CANDIDATE_BYTES,
};
use super::session_source::{
    AgentMemorySessionSourcePort, MemorySessionSourceError, PersistentSessionTranscriptRequest,
    SafeSessionTranscript,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryWorkflowErrorCode {
    Unsupported,
    Source,
    Extractor,
    InvalidCandidate,
    Conflict,
    ConfirmationRequired,
    Persistence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryWorkflowError {
    pub code: MemoryWorkflowErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl MemoryWorkflowError {
    pub(crate) fn new(
        code: MemoryWorkflowErrorCode,
        message: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }
}

impl From<MemorySessionSourceError> for MemoryWorkflowError {
    fn from(error: MemorySessionSourceError) -> Self {
        Self::new(
            if error.code == super::session_source::MemorySessionSourceErrorCode::Unsupported {
                MemoryWorkflowErrorCode::Unsupported
            } else {
                MemoryWorkflowErrorCode::Source
            },
            error.message,
            error.retryable,
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingMemoryForExtraction {
    pub id: String,
    pub content: String,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryExtractionRequest {
    pub transcript: SafeSessionTranscript,
    pub existing: Vec<ExistingMemoryForExtraction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedMemory {
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_memory_id: Option<String>,
}

#[async_trait]
pub trait AgentMemoryExtractorPort: Send + Sync {
    async fn extract_memories(
        &self,
        request: MemoryExtractionRequest,
    ) -> Result<Vec<ExtractedMemory>, MemoryWorkflowError>;
}

#[derive(Debug, Default)]
pub struct UnsupportedAgentMemoryExtractor;

#[async_trait]
impl AgentMemoryExtractorPort for UnsupportedAgentMemoryExtractor {
    async fn extract_memories(
        &self,
        _request: MemoryExtractionRequest,
    ) -> Result<Vec<ExtractedMemory>, MemoryWorkflowError> {
        Err(MemoryWorkflowError::new(
            MemoryWorkflowErrorCode::Unsupported,
            "A long-term memory extraction model adapter is not configured",
            false,
        ))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCompletionTriggerConfig {
    pub enabled: bool,
}

impl Default for MemoryCompletionTriggerConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionCompletionMemoryRequest {
    pub workspace_root: PathBuf,
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryProposal {
    pub proposal_id: String,
    pub memory_id: String,
    pub content: String,
    pub expected_revision: Option<u64>,
    pub source: AgentMemorySource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "status", content = "proposals")]
pub enum MemoryCompletionOutcome {
    Disabled,
    Proposed(Vec<AgentMemoryProposal>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryApprovalStatus {
    Denied,
    Committed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryApprovalOutcome {
    pub status: MemoryApprovalStatus,
    pub memory: Option<StoredAgentMemory>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteMemoryConfirmation {
    pub memory_id: String,
    pub expected_revision: u64,
    pub confirmation: String,
}

pub struct AgentMemoryWorkflow<R, S, E> {
    repository: R,
    session_source: S,
    extractor: E,
    trigger: MemoryCompletionTriggerConfig,
}

impl<R, S, E> AgentMemoryWorkflow<R, S, E>
where
    R: AgentMemoryRepository,
    S: AgentMemorySessionSourcePort,
    E: AgentMemoryExtractorPort,
{
    pub fn new(
        repository: R,
        session_source: S,
        extractor: E,
        trigger: MemoryCompletionTriggerConfig,
    ) -> Self {
        Self {
            repository,
            session_source,
            extractor,
            trigger,
        }
    }

    pub async fn on_session_completed(
        &self,
        request: SessionCompletionMemoryRequest,
    ) -> Result<MemoryCompletionOutcome, MemoryWorkflowError> {
        if !self.trigger.enabled {
            return Ok(MemoryCompletionOutcome::Disabled);
        }
        let existing = self
            .repository
            .list(&request.workspace_root)
            .map_err(persistence_error)?;
        let transcript = self
            .session_source
            .load_safe_transcript(PersistentSessionTranscriptRequest {
                workspace_root: request.workspace_root,
                session_id: request.session_id,
            })
            .await?;
        let extraction_request = MemoryExtractionRequest {
            transcript: transcript.clone(),
            existing: existing
                .iter()
                .filter(|memory| memory.is_committed())
                .map(|memory| ExistingMemoryForExtraction {
                    id: memory.id.clone(),
                    content: memory.content.clone(),
                    revision: memory.revision,
                })
                .collect(),
        };
        let extracted = self.extractor.extract_memories(extraction_request).await?;
        Ok(MemoryCompletionOutcome::Proposed(merge_proposals(
            &existing,
            extracted,
            &transcript,
        )))
    }

    pub fn approve(
        &self,
        workspace_root: &Path,
        proposal: AgentMemoryProposal,
        approved: bool,
    ) -> Result<MemoryApprovalOutcome, MemoryWorkflowError> {
        validate_proposal(&proposal)?;
        if !approved {
            return Ok(MemoryApprovalOutcome {
                status: MemoryApprovalStatus::Denied,
                memory: None,
            });
        }

        let now = current_time_ms();
        let existing = self
            .repository
            .list(workspace_root)
            .map_err(persistence_error)?;
        let previous = proposal.expected_revision.and_then(|revision| {
            existing
                .iter()
                .find(|memory| memory.id == proposal.memory_id && memory.revision == revision)
                .cloned()
        });
        if proposal.expected_revision.is_some() && previous.is_none() {
            return Err(MemoryWorkflowError::new(
                MemoryWorkflowErrorCode::Conflict,
                "Memory changed after this proposal was created",
                true,
            ));
        }
        let revision = match proposal.expected_revision {
            Some(revision) => revision.checked_add(1).ok_or_else(|| {
                MemoryWorkflowError::new(
                    MemoryWorkflowErrorCode::Conflict,
                    "Memory revision cannot be advanced",
                    false,
                )
            })?,
            None => 1,
        };
        let memory = StoredAgentMemory {
            schema_version: AGENT_MEMORY_SCHEMA_VERSION,
            id: proposal.memory_id,
            content: normalize_memory_content(&proposal.content),
            revision,
            source: proposal.source,
            created_at: previous
                .as_ref()
                .map(|memory| memory.created_at)
                .unwrap_or(now),
            updated_at: now,
            state: AgentMemoryState::Committed,
        };
        self.repository
            .write_cas(workspace_root, &memory, proposal.expected_revision)
            .map_err(|message| {
                if message.contains("revision conflict") {
                    MemoryWorkflowError::new(
                        MemoryWorkflowErrorCode::Conflict,
                        "Memory changed while approval was being committed",
                        true,
                    )
                } else {
                    persistence_error(message)
                }
            })?;
        Ok(MemoryApprovalOutcome {
            status: MemoryApprovalStatus::Committed,
            memory: Some(memory),
        })
    }

    pub fn delete_confirmed(
        &self,
        workspace_root: &Path,
        request: DeleteMemoryConfirmation,
    ) -> Result<(), MemoryWorkflowError> {
        let expected_confirmation =
            delete_confirmation_token(&request.memory_id, request.expected_revision);
        if request.confirmation != expected_confirmation {
            return Err(MemoryWorkflowError::new(
                MemoryWorkflowErrorCode::ConfirmationRequired,
                "Exact delete confirmation is required",
                false,
            ));
        }
        self.repository
            .delete_cas(
                workspace_root,
                &request.memory_id,
                request.expected_revision,
            )
            .map_err(|message| {
                if message.contains("revision conflict") || message.contains("not found") {
                    MemoryWorkflowError::new(
                        MemoryWorkflowErrorCode::Conflict,
                        "Memory changed before deletion was confirmed",
                        true,
                    )
                } else {
                    persistence_error(message)
                }
            })
    }
}

pub fn delete_confirmation_token(memory_id: &str, revision: u64) -> String {
    format!("delete:{memory_id}:revision:{revision}")
}

pub fn revise_memory_proposal(
    mut proposal: AgentMemoryProposal,
    content: String,
) -> Result<AgentMemoryProposal, MemoryWorkflowError> {
    proposal.content = normalize_memory_content(&content);
    proposal.proposal_id = deterministic_proposal_id(
        proposal
            .source
            .transcript_fingerprint
            .as_deref()
            .unwrap_or_default(),
        &proposal.memory_id,
        proposal.expected_revision,
        &proposal.content,
    );
    validate_proposal(&proposal)?;
    Ok(proposal)
}

fn merge_proposals(
    existing: &[StoredAgentMemory],
    extracted: Vec<ExtractedMemory>,
    transcript: &SafeSessionTranscript,
) -> Vec<AgentMemoryProposal> {
    let existing_by_id = existing
        .iter()
        .filter(|memory| memory.is_committed())
        .map(|memory| (memory.id.as_str(), memory))
        .collect::<HashMap<_, _>>();
    let existing_content = existing
        .iter()
        .filter(|memory| memory.is_committed())
        .map(|memory| normalize_memory_content(&memory.content).to_lowercase())
        .collect::<HashSet<_>>();

    let mut normalized = extracted
        .into_iter()
        .filter_map(|candidate| {
            let content = normalize_memory_content(&candidate.content);
            if content.is_empty()
                || content.len() > MAX_CANDIDATE_BYTES
                || contains_sensitive_or_hidden_data(&content)
            {
                return None;
            }
            Some((candidate.target_memory_id, content))
        })
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.to_lowercase().cmp(&right.1.to_lowercase()))
            .then_with(|| left.1.cmp(&right.1))
    });

    let mut seen = HashSet::new();
    normalized
        .into_iter()
        .filter_map(|(target_id, content)| {
            let content_key = content.to_lowercase();
            if existing_content.contains(&content_key) || !seen.insert(content_key) {
                return None;
            }
            let (memory_id, expected_revision) = match target_id {
                Some(target_id) => {
                    let existing = existing_by_id.get(target_id.as_str())?;
                    (existing.id.clone(), Some(existing.revision))
                }
                None => (
                    deterministic_memory_id(&transcript.fingerprint, &content),
                    None,
                ),
            };
            let proposal_id = deterministic_proposal_id(
                &transcript.fingerprint,
                &memory_id,
                expected_revision,
                &content,
            );
            Some(AgentMemoryProposal {
                proposal_id,
                memory_id,
                content,
                expected_revision,
                source: AgentMemorySource {
                    kind: "session_completion".to_string(),
                    session_id: Some(transcript.session_id.clone()),
                    transcript_fingerprint: Some(transcript.fingerprint.clone()),
                    renderer_version: Some(transcript.renderer_version.clone()),
                },
            })
        })
        .collect()
}

fn validate_proposal(proposal: &AgentMemoryProposal) -> Result<(), MemoryWorkflowError> {
    let content = normalize_memory_content(&proposal.content);
    if proposal.proposal_id.is_empty()
        || proposal.memory_id.is_empty()
        || content.is_empty()
        || content.len() > MAX_CANDIDATE_BYTES
        || contains_sensitive_or_hidden_data(&content)
        || proposal.source.kind != "session_completion"
        || proposal.source.session_id.is_none()
        || proposal.source.transcript_fingerprint.is_none()
        || proposal.source.renderer_version.is_none()
    {
        return Err(MemoryWorkflowError::new(
            MemoryWorkflowErrorCode::InvalidCandidate,
            "Memory proposal is incomplete or contains unsafe content",
            false,
        ));
    }
    let expected_proposal_id = deterministic_proposal_id(
        proposal
            .source
            .transcript_fingerprint
            .as_deref()
            .unwrap_or_default(),
        &proposal.memory_id,
        proposal.expected_revision,
        &content,
    );
    if proposal.proposal_id != expected_proposal_id {
        return Err(MemoryWorkflowError::new(
            MemoryWorkflowErrorCode::InvalidCandidate,
            "Memory proposal integrity check failed",
            false,
        ));
    }
    if proposal.expected_revision.is_none() {
        let expected_memory_id = deterministic_memory_id(
            proposal
                .source
                .transcript_fingerprint
                .as_deref()
                .unwrap_or_default(),
            &content,
        );
        if proposal.memory_id != expected_memory_id {
            return Err(MemoryWorkflowError::new(
                MemoryWorkflowErrorCode::InvalidCandidate,
                "New memory proposal identifier is not derived from its safe transcript",
                false,
            ));
        }
    }
    Ok(())
}

fn deterministic_memory_id(fingerprint: &str, content: &str) -> String {
    format!(
        "memory-{}",
        digest_hex(&[fingerprint, &content.to_lowercase()])[..24].to_string()
    )
}

fn deterministic_proposal_id(
    fingerprint: &str,
    memory_id: &str,
    expected_revision: Option<u64>,
    content: &str,
) -> String {
    let revision = expected_revision
        .map(|revision| revision.to_string())
        .unwrap_or_else(|| "new".to_string());
    format!(
        "proposal-{}",
        &digest_hex(&[fingerprint, memory_id, &revision, content])[..24]
    )
}

fn digest_hex(parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part.as_bytes());
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

fn persistence_error(message: String) -> MemoryWorkflowError {
    MemoryWorkflowError::new(MemoryWorkflowErrorCode::Persistence, message, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_memory::session_source::{
        MemorySessionSourceError, MemorySessionSourceErrorCode, SafeTranscriptMessage,
    };
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };

    #[derive(Clone, Default)]
    struct TestRepository {
        values: Arc<Mutex<Vec<StoredAgentMemory>>>,
    }

    impl TestRepository {
        fn with(values: Vec<StoredAgentMemory>) -> Self {
            Self {
                values: Arc::new(Mutex::new(values)),
            }
        }

        fn values(&self) -> Vec<StoredAgentMemory> {
            self.values.lock().unwrap().clone()
        }

        fn replace(&self, memory: StoredAgentMemory) {
            let mut values = self.values.lock().unwrap();
            values.retain(|value| value.id != memory.id);
            values.push(memory);
        }
    }

    impl AgentMemoryRepository for TestRepository {
        fn list(&self, _workspace_root: &Path) -> Result<Vec<StoredAgentMemory>, String> {
            Ok(self.values())
        }

        fn write_cas(
            &self,
            _workspace_root: &Path,
            memory: &StoredAgentMemory,
            expected_revision: Option<u64>,
        ) -> Result<(), String> {
            let actual_revision = self
                .values
                .lock()
                .unwrap()
                .iter()
                .find(|value| value.id == memory.id)
                .map(|value| value.revision);
            if actual_revision != expected_revision {
                return Err("memory revision conflict".to_string());
            }
            self.replace(memory.clone());
            Ok(())
        }

        fn delete(&self, _workspace_root: &Path, id: &str) -> Result<(), String> {
            self.values.lock().unwrap().retain(|value| value.id != id);
            Ok(())
        }

        fn delete_cas(
            &self,
            _workspace_root: &Path,
            id: &str,
            expected_revision: u64,
        ) -> Result<(), String> {
            let mut values = self.values.lock().unwrap();
            let actual_revision = values
                .iter()
                .find(|value| value.id == id)
                .map(|value| value.revision)
                .ok_or_else(|| "memory not found".to_string())?;
            if actual_revision != expected_revision {
                return Err("memory revision conflict".to_string());
            }
            values.retain(|value| value.id != id);
            Ok(())
        }
    }

    #[derive(Clone)]
    struct TestSessionSource {
        calls: Arc<AtomicUsize>,
        result: Result<SafeSessionTranscript, MemorySessionSourceError>,
    }

    #[async_trait]
    impl AgentMemorySessionSourcePort for TestSessionSource {
        async fn load_safe_transcript(
            &self,
            _request: PersistentSessionTranscriptRequest,
        ) -> Result<SafeSessionTranscript, MemorySessionSourceError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.result.clone()
        }
    }

    #[derive(Clone)]
    struct TestExtractor {
        calls: Arc<AtomicUsize>,
        result: Result<Vec<ExtractedMemory>, MemoryWorkflowError>,
    }

    #[async_trait]
    impl AgentMemoryExtractorPort for TestExtractor {
        async fn extract_memories(
            &self,
            _request: MemoryExtractionRequest,
        ) -> Result<Vec<ExtractedMemory>, MemoryWorkflowError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.result.clone()
        }
    }

    fn transcript() -> SafeSessionTranscript {
        SafeSessionTranscript {
            session_id: "session-1".to_string(),
            renderer_version: "safe-v1".to_string(),
            fingerprint: "fingerprint-1".to_string(),
            messages: vec![SafeTranscriptMessage {
                role: "user".to_string(),
                text: "Remember that I prefer focused tests".to_string(),
            }],
        }
    }

    fn stored(id: &str, content: &str, revision: u64) -> StoredAgentMemory {
        StoredAgentMemory {
            schema_version: AGENT_MEMORY_SCHEMA_VERSION,
            id: id.to_string(),
            content: content.to_string(),
            revision,
            source: AgentMemorySource::legacy_manual(),
            created_at: 10,
            updated_at: 10,
            state: AgentMemoryState::Committed,
        }
    }

    fn completion_request() -> SessionCompletionMemoryRequest {
        SessionCompletionMemoryRequest {
            workspace_root: PathBuf::from("workspace"),
            session_id: "session-1".to_string(),
        }
    }

    #[tokio::test]
    async fn completion_trigger_is_default_off_without_touching_ports() {
        let source_calls = Arc::new(AtomicUsize::new(0));
        let extractor_calls = Arc::new(AtomicUsize::new(0));
        let workflow = AgentMemoryWorkflow::new(
            TestRepository::default(),
            TestSessionSource {
                calls: source_calls.clone(),
                result: Ok(transcript()),
            },
            TestExtractor {
                calls: extractor_calls.clone(),
                result: Ok(Vec::new()),
            },
            MemoryCompletionTriggerConfig::default(),
        );

        assert_eq!(
            workflow
                .on_session_completed(completion_request())
                .await
                .unwrap(),
            MemoryCompletionOutcome::Disabled
        );
        assert_eq!(source_calls.load(Ordering::SeqCst), 0);
        assert_eq!(extractor_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn unsupported_transcript_source_is_typed_and_never_calls_extractor() {
        let extractor_calls = Arc::new(AtomicUsize::new(0));
        let workflow = AgentMemoryWorkflow::new(
            TestRepository::default(),
            TestSessionSource {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Err(MemorySessionSourceError {
                    code: MemorySessionSourceErrorCode::Unsupported,
                    message: "unsupported".to_string(),
                    retryable: false,
                }),
            },
            TestExtractor {
                calls: extractor_calls.clone(),
                result: Ok(Vec::new()),
            },
            MemoryCompletionTriggerConfig { enabled: true },
        );

        let error = workflow
            .on_session_completed(completion_request())
            .await
            .unwrap_err();
        assert_eq!(error.code, MemoryWorkflowErrorCode::Unsupported);
        assert_eq!(extractor_calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn proposal_merge_is_deterministic_and_filters_duplicates_and_secrets() {
        let existing = vec![stored("existing", "Keep the UI concise", 3)];
        let candidates = vec![
            ExtractedMemory {
                content: " Prefer focused tests ".to_string(),
                target_memory_id: Some("existing".to_string()),
            },
            ExtractedMemory {
                content: "API_KEY=do-not-store".to_string(),
                target_memory_id: None,
            },
            ExtractedMemory {
                content: "Keep the UI concise".to_string(),
                target_memory_id: None,
            },
            ExtractedMemory {
                content: "Use narrow changes".to_string(),
                target_memory_id: None,
            },
            ExtractedMemory {
                content: "use narrow changes".to_string(),
                target_memory_id: None,
            },
        ];
        let first = merge_proposals(&existing, candidates.clone(), &transcript());
        let second = merge_proposals(
            &existing,
            candidates.into_iter().rev().collect(),
            &transcript(),
        );

        assert_eq!(first, second);
        assert_eq!(first.len(), 2);
        assert!(first
            .iter()
            .any(|proposal| proposal.expected_revision == Some(3)));
        assert!(first
            .iter()
            .any(|proposal| proposal.content == "Use narrow changes"));
    }

    #[test]
    fn approval_uses_revision_cas_and_denial_does_not_write() {
        let repository = TestRepository::with(vec![stored("existing", "old", 1)]);
        let workflow = AgentMemoryWorkflow::new(
            repository.clone(),
            TestSessionSource {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Ok(transcript()),
            },
            TestExtractor {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Ok(Vec::new()),
            },
            MemoryCompletionTriggerConfig::default(),
        );
        let update = merge_proposals(
            &repository.values(),
            vec![ExtractedMemory {
                content: "updated".to_string(),
                target_memory_id: Some("existing".to_string()),
            }],
            &transcript(),
        )
        .remove(0);

        assert_eq!(
            workflow
                .approve(Path::new("workspace"), update.clone(), false)
                .unwrap()
                .status,
            MemoryApprovalStatus::Denied
        );
        assert_eq!(repository.values()[0].content, "old");

        repository.replace(stored("existing", "concurrent", 2));
        let error = workflow
            .approve(Path::new("workspace"), update, true)
            .unwrap_err();
        assert_eq!(error.code, MemoryWorkflowErrorCode::Conflict);
        assert_eq!(repository.values()[0].content, "concurrent");
    }

    #[test]
    fn reviewed_proposal_can_be_edited_without_losing_merge_target() {
        let proposal = merge_proposals(
            &[stored("existing", "old", 3)],
            vec![ExtractedMemory {
                content: "draft".to_string(),
                target_memory_id: Some("existing".to_string()),
            }],
            &transcript(),
        )
        .remove(0);
        let original_id = proposal.proposal_id.clone();

        let revised =
            revise_memory_proposal(proposal, "  Prefer focused integration tests  ".to_string())
                .unwrap();

        assert_eq!(revised.content, "Prefer focused integration tests");
        assert_eq!(revised.memory_id, "existing");
        assert_eq!(revised.expected_revision, Some(3));
        assert_ne!(revised.proposal_id, original_id);
    }

    #[test]
    fn approved_creation_commits_and_tampered_id_is_rejected() {
        let repository = TestRepository::default();
        let workflow = AgentMemoryWorkflow::new(
            repository.clone(),
            TestSessionSource {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Ok(transcript()),
            },
            TestExtractor {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Ok(Vec::new()),
            },
            MemoryCompletionTriggerConfig::default(),
        );
        let proposal = merge_proposals(
            &[],
            vec![ExtractedMemory {
                content: "Use narrow changes".to_string(),
                target_memory_id: None,
            }],
            &transcript(),
        )
        .remove(0);
        let committed = workflow
            .approve(Path::new("workspace"), proposal.clone(), true)
            .unwrap();
        assert_eq!(committed.status, MemoryApprovalStatus::Committed);
        assert_eq!(repository.values().len(), 1);

        let mut tampered = proposal;
        tampered.memory_id = "memory-attacker-selected".to_string();
        tampered.proposal_id = deterministic_proposal_id(
            tampered.source.transcript_fingerprint.as_deref().unwrap(),
            &tampered.memory_id,
            tampered.expected_revision,
            &tampered.content,
        );
        assert_eq!(
            workflow
                .approve(Path::new("workspace"), tampered, true)
                .unwrap_err()
                .code,
            MemoryWorkflowErrorCode::InvalidCandidate
        );
    }

    #[test]
    fn delete_requires_exact_confirmation_and_current_revision() {
        let repository = TestRepository::with(vec![stored("memory-1", "content", 2)]);
        let workflow = AgentMemoryWorkflow::new(
            repository.clone(),
            TestSessionSource {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Ok(transcript()),
            },
            TestExtractor {
                calls: Arc::new(AtomicUsize::new(0)),
                result: Ok(Vec::new()),
            },
            MemoryCompletionTriggerConfig::default(),
        );

        let wrong = workflow
            .delete_confirmed(
                Path::new("workspace"),
                DeleteMemoryConfirmation {
                    memory_id: "memory-1".to_string(),
                    expected_revision: 2,
                    confirmation: "delete".to_string(),
                },
            )
            .unwrap_err();
        assert_eq!(wrong.code, MemoryWorkflowErrorCode::ConfirmationRequired);
        assert_eq!(repository.values().len(), 1);

        let stale = workflow
            .delete_confirmed(
                Path::new("workspace"),
                DeleteMemoryConfirmation {
                    memory_id: "memory-1".to_string(),
                    expected_revision: 1,
                    confirmation: delete_confirmation_token("memory-1", 1),
                },
            )
            .unwrap_err();
        assert_eq!(stale.code, MemoryWorkflowErrorCode::Conflict);
        assert_eq!(repository.values().len(), 1);

        workflow
            .delete_confirmed(
                Path::new("workspace"),
                DeleteMemoryConfirmation {
                    memory_id: "memory-1".to_string(),
                    expected_revision: 2,
                    confirmation: delete_confirmation_token("memory-1", 2),
                },
            )
            .unwrap();
        assert!(repository.values().is_empty());
    }
}
