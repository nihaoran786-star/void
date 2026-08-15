//! Versioned Agent authoring contracts.
//!
//! This module owns the hot configuration plane for custom Agents. Published
//! revisions are immutable; running sessions resolve one exact revision and
//! never observe later draft or default-pointer changes.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;

pub const AGENT_REVISION_CATALOG_SCHEMA_VERSION: u32 = 1;
pub const AGENT_REVISION_RECEIPT_REPLAY_LIMIT: usize = 512;
pub const AGENT_REVISION_RECEIPT_REPLAY_BYTES: usize = 2 * 1024 * 1024;

pub struct AgentRevisionCatalogMutation<T> {
    pub value: T,
    pub changed: bool,
}

impl<T> AgentRevisionCatalogMutation<T> {
    pub fn changed(value: T) -> Self {
        Self {
            value,
            changed: true,
        }
    }

    pub fn unchanged(value: T) -> Self {
        Self {
            value,
            changed: false,
        }
    }
}

/// Adapter port for one trusted user/project Agent revision scope.
///
/// Domain transitions depend only on this port. Concrete filesystem locking,
/// recovery, and workspace-root selection remain in persistence/host adapters.
pub trait AgentRevisionCatalogStore: Clone + Send + Sync + 'static {
    fn scope(&self) -> &AgentRevisionScope;

    fn read<T>(
        &self,
        operation: impl FnOnce(&AgentRevisionCatalog) -> AgentRevisionResult<T>,
    ) -> AgentRevisionResult<T>;

    fn mutate<T>(
        &self,
        operation: impl FnOnce(
            &mut AgentRevisionCatalog,
        ) -> AgentRevisionResult<AgentRevisionCatalogMutation<T>>,
    ) -> AgentRevisionResult<T>;

    fn read_legacy_source(&self, path: &Path) -> AgentRevisionResult<String>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRevisionLevel {
    User,
    Project,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRevisionWorkspaceBackend {
    Local,
    Remote,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRevisionWorkspaceFacts {
    pub workspace_id: String,
    pub workspace_path: PathBuf,
    pub backend: AgentRevisionWorkspaceBackend,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRevisionScope {
    pub level: AgentRevisionLevel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<AgentRevisionWorkspaceFacts>,
}

impl AgentRevisionScope {
    pub fn user() -> Self {
        Self {
            level: AgentRevisionLevel::User,
            workspace: None,
        }
    }

    pub fn local_project(
        workspace_id: impl Into<String>,
        workspace_path: impl Into<PathBuf>,
    ) -> Self {
        Self {
            level: AgentRevisionLevel::Project,
            workspace: Some(AgentRevisionWorkspaceFacts {
                workspace_id: workspace_id.into(),
                workspace_path: workspace_path.into(),
                backend: AgentRevisionWorkspaceBackend::Local,
            }),
        }
    }

    pub fn validate(&self) -> AgentRevisionResult<()> {
        match (self.level, self.workspace.as_ref()) {
            (AgentRevisionLevel::User, None) => Ok(()),
            (AgentRevisionLevel::User, Some(_)) => Err(AgentRevisionError::validation(
                "User Agent revision scope must not carry workspace facts",
            )),
            (AgentRevisionLevel::Project, None) => Err(AgentRevisionError::validation(
                "Project Agent revision scope requires workspace facts",
            )),
            (AgentRevisionLevel::Project, Some(workspace)) => {
                if workspace.backend == AgentRevisionWorkspaceBackend::Remote {
                    return Err(AgentRevisionError::new(
                        AgentRevisionErrorCode::UnsupportedRemoteProject,
                        "Remote project Agent revision authoring is not supported yet",
                        false,
                    ));
                }
                if workspace.workspace_id.trim().is_empty() {
                    return Err(AgentRevisionError::validation(
                        "Project Agent revision scope requires a workspace ID",
                    ));
                }
                if !workspace.workspace_path.is_absolute() {
                    return Err(AgentRevisionError::validation(
                        "Project Agent revision scope requires an absolute workspace path",
                    ));
                }
                Ok(())
            }
        }
    }

    pub fn expected_persona_prefix(&self) -> &'static str {
        match self.level {
            AgentRevisionLevel::User => "user::void::",
            AgentRevisionLevel::Project => "project::void::",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRevisionContent {
    pub persona_key: String,
    pub display_name: String,
    pub description: String,
    pub prompt: String,
    #[serde(default)]
    pub tools: Vec<String>,
    pub readonly: bool,
    #[serde(default)]
    pub review: bool,
    pub model: String,
    #[serde(default)]
    pub allowed_parent_agent_ids: Vec<String>,
}

impl AgentRevisionContent {
    fn validate_for_scope(&self, scope: &AgentRevisionScope) -> AgentRevisionResult<()> {
        if !self
            .persona_key
            .starts_with(scope.expected_persona_prefix())
            || self
                .persona_key
                .trim_start_matches(scope.expected_persona_prefix())
                .trim()
                .is_empty()
        {
            return Err(AgentRevisionError::validation(
                "Agent persona key does not match its authoring scope",
            ));
        }
        if self.display_name.trim().is_empty()
            || self.description.trim().is_empty()
            || self.prompt.trim().is_empty()
        {
            return Err(AgentRevisionError::validation(
                "Agent revision content requires display name, description, and prompt",
            ));
        }
        if self.review && !self.readonly {
            return Err(AgentRevisionError::validation(
                "Review Agent revisions must remain readonly",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentDraftStatus {
    Editing,
    Validating,
    Validated,
    Publishing,
    Published,
    Invalid,
    Failed,
    Stale,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentValidationStatus {
    Passed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentValidationEvidenceInput {
    pub status: AgentValidationStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debug_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub test_case_id: Option<String>,
    #[serde(default)]
    pub capability_snapshot: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentValidationEvidence {
    pub validation_id: String,
    pub draft_revision_id: String,
    pub status: AgentValidationStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debug_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub test_case_id: Option<String>,
    #[serde(default)]
    pub capability_snapshot: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub validated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRevisionRecord {
    pub revision_id: String,
    pub definition_id: String,
    pub content: AgentRevisionContent,
    pub created_at: String,
    #[serde(default)]
    pub legacy_runtime_revision_aliases: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDraftRecord {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub draft_id: String,
    pub draft_revision_id: String,
    #[serde(default)]
    pub base_revision_id: Option<String>,
    pub status: AgentDraftStatus,
    /// Opaque content-version token. This intentionally equals the generated
    /// draft revision ID and is not a content hash.
    pub draft_fingerprint: String,
    pub content: AgentRevisionContent,
    #[serde(default)]
    pub validation_evidence: Vec<AgentValidationEvidence>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAgentSourceRecord {
    pub source_path: PathBuf,
    pub imported_raw_document: String,
    pub imported_runtime_revision_alias: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinitionRecord {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub persona_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_revision_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_published_revision_id: Option<String>,
    #[serde(default)]
    pub revisions: Vec<AgentRevisionRecord>,
    #[serde(default)]
    pub drafts: Vec<AgentDraftRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_source: Option<LegacyAgentSourceRecord>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAgentImport {
    pub source_path: PathBuf,
    pub raw_document: String,
    pub runtime_revision_alias: String,
    pub content: AgentRevisionContent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAgentRevisionDraftRequest {
    pub definition_id: Option<String>,
    pub persona_key: Option<String>,
    pub initial_content: Option<AgentRevisionContent>,
    pub legacy_import: Option<LegacyAgentImport>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentRevisionDraftRequest {
    pub definition_id: String,
    pub draft_id: String,
    pub expected_draft_revision_id: String,
    pub content: AgentRevisionContent,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordAgentRevisionValidationRequest {
    pub definition_id: String,
    pub draft_id: String,
    pub draft_revision_id: String,
    pub evidence: AgentValidationEvidenceInput,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishAgentRevisionRequest {
    pub definition_id: String,
    pub draft_id: String,
    pub expected_base_revision_id: Option<String>,
    pub expected_draft_revision_id: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentDefaultRevisionRequest {
    pub definition_id: String,
    pub revision_id: String,
    pub expected_default_revision_id: Option<String>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentPublishStatus {
    Published,
    AlreadyPublished,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishAgentRevisionResult {
    pub status: AgentPublishStatus,
    pub revision: AgentRevisionRecord,
    pub draft: AgentDraftRecord,
    pub definition: AgentDefinitionRecord,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSetDefaultStatus {
    Updated,
    AlreadyDefault,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentDefaultRevisionResult {
    pub status: AgentSetDefaultStatus,
    pub definition: AgentDefinitionRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRevisionOpenIntent {
    pub definition_id: Option<String>,
    pub persona_key: Option<String>,
    pub initial_content: Option<AgentRevisionContent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRevisionErrorCode {
    ValidationFailed,
    NotFound,
    RevisionConflict,
    SourceConflict,
    IdempotencyConflict,
    UnsupportedRemoteProject,
    WorkspaceScopeMismatch,
    Io,
    Serialization,
    RollbackFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRevisionConflictKind {
    BaseRevision,
    DraftRevision,
    DefaultRevision,
    IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct AgentRevisionError {
    pub code: AgentRevisionErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conflict_kind: Option<AgentRevisionConflictKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_revision_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actual_revision_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery_path: Option<String>,
}

impl AgentRevisionError {
    pub fn new(code: AgentRevisionErrorCode, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
            conflict_kind: None,
            expected_revision_id: None,
            actual_revision_id: None,
            recovery_path: None,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(AgentRevisionErrorCode::ValidationFailed, message, false)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(AgentRevisionErrorCode::RevisionConflict, message, true)
    }

    pub fn revision_conflict(
        kind: AgentRevisionConflictKind,
        expected_revision_id: Option<String>,
        actual_revision_id: Option<String>,
        message: impl Into<String>,
    ) -> Self {
        let mut error = Self::conflict(message);
        error.conflict_kind = Some(kind);
        error.expected_revision_id = expected_revision_id;
        error.actual_revision_id = actual_revision_id;
        error
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(AgentRevisionErrorCode::NotFound, message, false)
    }
}

pub type AgentRevisionResult<T> = Result<T, AgentRevisionError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "operation", content = "result")]
pub(crate) enum AgentRevisionReceiptResult {
    Open(AgentDraftRecord),
    Save(AgentDraftRecord),
    Validate(AgentDraftRecord),
    Publish(PublishAgentRevisionResult),
    SetDefault(SetAgentDefaultRevisionResult),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "operation", content = "request")]
pub(crate) enum AgentRevisionReceiptIntent {
    Open(AgentRevisionOpenIntent),
    Save(SaveAgentRevisionDraftRequest),
    Validate(RecordAgentRevisionValidationRequest),
    Publish(PublishAgentRevisionRequest),
    SetDefault(SetAgentDefaultRevisionRequest),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRevisionIdempotencyReceipt {
    pub idempotency_key: String,
    pub intent: AgentRevisionReceiptIntent,
    pub result: AgentRevisionReceiptResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRevisionCatalog {
    pub(crate) schema_version: u32,
    pub(crate) catalog_revision: u64,
    pub(crate) scope: AgentRevisionScope,
    #[serde(default)]
    pub(crate) definitions: Vec<AgentDefinitionRecord>,
    #[serde(default)]
    pub(crate) idempotency_receipts: Vec<AgentRevisionIdempotencyReceipt>,
}

impl AgentRevisionCatalog {
    pub(crate) fn empty(scope: AgentRevisionScope) -> Self {
        Self {
            schema_version: AGENT_REVISION_CATALOG_SCHEMA_VERSION,
            catalog_revision: 0,
            scope,
            definitions: Vec::new(),
            idempotency_receipts: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub struct AgentRevisionService<S: AgentRevisionCatalogStore> {
    store: S,
}

impl<S: AgentRevisionCatalogStore> AgentRevisionService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn scope(&self) -> &AgentRevisionScope {
        self.store.scope()
    }

    pub fn get_definition(
        &self,
        definition_id: &str,
    ) -> AgentRevisionResult<AgentDefinitionRecord> {
        self.scope().validate()?;
        self.store.read(|catalog| {
            let definition = catalog
                .definitions
                .iter()
                .find(|definition| definition.definition_id == definition_id)
                .cloned()
                .ok_or_else(|| {
                    AgentRevisionError::not_found(format!(
                        "Agent definition was not found: {definition_id}"
                    ))
                })?;
            self.verify_legacy_source(&definition)?;
            Ok(definition)
        })
    }

    pub fn open_draft(
        &self,
        request: OpenAgentRevisionDraftRequest,
    ) -> AgentRevisionResult<AgentDraftRecord> {
        self.scope().validate()?;
        require_idempotency_key(&request.idempotency_key)?;
        let intent = AgentRevisionReceiptIntent::Open(open_intent(&request));
        if let Some(replayed) = self.replay_open_draft(&request)? {
            return Ok(replayed);
        }
        if let Some(import) = request.legacy_import.as_ref() {
            import.content.validate_for_scope(self.scope())?;
            self.verify_import_source(import)?;
        }
        if let Some(content) = request.initial_content.as_ref() {
            content.validate_for_scope(self.scope())?;
        }
        let requested_persona_key = open_request_persona_key(&request)?;

        self.store.mutate(|catalog| {
            if let Some(receipt) = catalog
                .idempotency_receipts
                .iter()
                .find(|receipt| receipt.idempotency_key == request.idempotency_key)
            {
                if receipt.intent == intent {
                    if let AgentRevisionReceiptResult::Open(draft) = &receipt.result {
                        return Ok(AgentRevisionCatalogMutation::unchanged(draft.clone()));
                    }
                }
                return Err(idempotency_conflict("Agent draft open"));
            }

            let existing_index = match request.definition_id.as_deref() {
                Some(id) => catalog
                    .definitions
                    .iter()
                    .position(|definition| definition.definition_id == id),
                None => requested_persona_key.as_deref().and_then(|persona_key| {
                    catalog
                        .definitions
                        .iter()
                        .position(|definition| definition.persona_key == persona_key)
                }),
            };

            let index = match existing_index {
                Some(index) => {
                    let definition = &catalog.definitions[index];
                    if requested_persona_key
                        .as_deref()
                        .is_some_and(|persona_key| persona_key != definition.persona_key)
                    {
                        return Err(AgentRevisionError::validation(
                            "Requested Agent identities do not match the definition",
                        ));
                    }
                    index
                }
                None => {
                    if request.definition_id.is_some() {
                        return Err(AgentRevisionError::not_found(
                            "Requested Agent definition does not exist",
                        ));
                    }
                    let now = now();
                    let definition_id = generated_id("agent-def");
                    let (content, legacy_source, revisions, latest, default) =
                        if let Some(import) = request.legacy_import.clone() {
                            let revision_id = generated_id("agent-rev");
                            let revision = AgentRevisionRecord {
                                revision_id: revision_id.clone(),
                                definition_id: definition_id.clone(),
                                content: import.content.clone(),
                                created_at: now.clone(),
                                legacy_runtime_revision_aliases: vec![import
                                    .runtime_revision_alias
                                    .clone()],
                            };
                            (
                                import.content,
                                Some(LegacyAgentSourceRecord {
                                    source_path: import.source_path,
                                    imported_raw_document: import.raw_document,
                                    imported_runtime_revision_alias: import.runtime_revision_alias,
                                }),
                                vec![revision],
                                Some(revision_id.clone()),
                                Some(revision_id),
                            )
                        } else {
                            let content = request.initial_content.clone().ok_or_else(|| {
                                AgentRevisionError::validation(
                                    "Opening a new Agent definition requires initial content",
                                )
                            })?;
                            (content, None, Vec::new(), None, None)
                        };
                    if requested_persona_key.as_deref() != Some(content.persona_key.as_str()) {
                        return Err(AgentRevisionError::validation(
                            "Requested persona key does not match Agent revision content",
                        ));
                    }
                    if catalog
                        .definitions
                        .iter()
                        .any(|definition| definition.persona_key == content.persona_key)
                    {
                        return Err(AgentRevisionError::validation(
                            "Agent persona key already belongs to another definition",
                        ));
                    }
                    catalog.definitions.push(AgentDefinitionRecord {
                        scope: catalog.scope.clone(),
                        definition_id,
                        persona_key: content.persona_key,
                        default_revision_id: default,
                        latest_published_revision_id: latest,
                        revisions,
                        drafts: Vec::new(),
                        legacy_source,
                        created_at: now.clone(),
                        updated_at: now,
                    });
                    catalog.definitions.len() - 1
                }
            };

            let definition = catalog
                .definitions
                .get_mut(index)
                .expect("definition index was resolved from this catalog");
            self.verify_legacy_source(definition)?;
            let draft = definition
                .drafts
                .iter()
                .rev()
                .find(|draft| draft.status != AgentDraftStatus::Published)
                .cloned()
                .unwrap_or_else(|| {
                    let draft_revision_id = generated_id("agent-draft-rev");
                    let content = definition
                        .latest_published_revision_id
                        .as_deref()
                        .and_then(|revision_id| {
                            definition
                                .revisions
                                .iter()
                                .find(|revision| revision.revision_id == revision_id)
                        })
                        .map(|revision| revision.content.clone())
                        .or_else(|| request.initial_content.clone())
                        .or_else(|| {
                            request
                                .legacy_import
                                .as_ref()
                                .map(|item| item.content.clone())
                        })
                        .expect("new definitions always have draft content");
                    let draft = AgentDraftRecord {
                        scope: catalog.scope.clone(),
                        definition_id: definition.definition_id.clone(),
                        draft_id: generated_id("agent-draft"),
                        draft_revision_id: draft_revision_id.clone(),
                        base_revision_id: definition.latest_published_revision_id.clone(),
                        status: AgentDraftStatus::Editing,
                        draft_fingerprint: draft_revision_id,
                        content,
                        validation_evidence: Vec::new(),
                        updated_at: now(),
                    };
                    definition.drafts.push(draft.clone());
                    definition.updated_at = draft.updated_at.clone();
                    draft
                });
            append_receipt(
                catalog,
                AgentRevisionIdempotencyReceipt {
                    idempotency_key: request.idempotency_key.clone(),
                    intent,
                    result: AgentRevisionReceiptResult::Open(draft.clone()),
                },
            )?;
            Ok(AgentRevisionCatalogMutation::changed(draft))
        })
    }

    /// Replay a completed open command from its client-controlled intent
    /// before a host adapter re-reads mutable legacy source material.
    pub fn replay_open_draft(
        &self,
        request: &OpenAgentRevisionDraftRequest,
    ) -> AgentRevisionResult<Option<AgentDraftRecord>> {
        require_idempotency_key(&request.idempotency_key)?;
        let intent = AgentRevisionReceiptIntent::Open(open_intent(request));
        self.store.read(|catalog| {
            let Some(receipt) = catalog
                .idempotency_receipts
                .iter()
                .find(|receipt| receipt.idempotency_key == request.idempotency_key)
            else {
                return Ok(None);
            };
            if receipt.intent != intent {
                return Err(idempotency_conflict("Agent draft open"));
            }
            match &receipt.result {
                AgentRevisionReceiptResult::Open(draft) => Ok(Some(draft.clone())),
                _ => Err(idempotency_conflict("Agent draft open")),
            }
        })
    }

    pub fn save_draft(
        &self,
        request: SaveAgentRevisionDraftRequest,
    ) -> AgentRevisionResult<AgentDraftRecord> {
        require_idempotency_key(&request.idempotency_key)?;
        request.content.validate_for_scope(self.scope())?;
        let intent = AgentRevisionReceiptIntent::Save(request.clone());
        self.store.mutate(|catalog| {
            if let Some(receipt) = catalog
                .idempotency_receipts
                .iter()
                .find(|receipt| receipt.idempotency_key == request.idempotency_key)
            {
                if receipt.intent == intent {
                    if let AgentRevisionReceiptResult::Save(draft) = &receipt.result {
                        return Ok(AgentRevisionCatalogMutation::unchanged(draft.clone()));
                    }
                }
                return Err(idempotency_conflict("Agent draft save"));
            }

            let result = {
                let definition = definition_mut(catalog, &request.definition_id)?;
                self.verify_legacy_source(definition)?;
                if definition.persona_key != request.content.persona_key {
                    return Err(AgentRevisionError::validation(
                        "Agent runtime persona identity is immutable",
                    ));
                }
                let (result, updated_at) = {
                    let draft = draft_mut(definition, &request.draft_id)?;
                    if draft.draft_revision_id != request.expected_draft_revision_id {
                        return Err(AgentRevisionError::revision_conflict(
                            AgentRevisionConflictKind::DraftRevision,
                            Some(request.expected_draft_revision_id.clone()),
                            Some(draft.draft_revision_id.clone()),
                            "Agent draft revision changed before save",
                        ));
                    }
                    if draft.status == AgentDraftStatus::Published {
                        return Err(AgentRevisionError::conflict(
                            "Published Agent draft is immutable",
                        ));
                    }
                    let next_revision_id = generated_id("agent-draft-rev");
                    draft.draft_revision_id = next_revision_id.clone();
                    draft.draft_fingerprint = next_revision_id;
                    draft.content = request.content.clone();
                    draft.validation_evidence.clear();
                    draft.status = AgentDraftStatus::Editing;
                    draft.updated_at = now();
                    (draft.clone(), draft.updated_at.clone())
                };
                definition.updated_at = updated_at;
                result
            };
            append_receipt(
                catalog,
                AgentRevisionIdempotencyReceipt {
                    idempotency_key: request.idempotency_key.clone(),
                    intent,
                    result: AgentRevisionReceiptResult::Save(result.clone()),
                },
            )?;
            Ok(AgentRevisionCatalogMutation::changed(result))
        })
    }

    pub fn record_validation(
        &self,
        request: RecordAgentRevisionValidationRequest,
    ) -> AgentRevisionResult<AgentDraftRecord> {
        require_idempotency_key(&request.idempotency_key)?;
        let intent = AgentRevisionReceiptIntent::Validate(request.clone());
        self.store.mutate(|catalog| {
            if let Some(receipt) = catalog
                .idempotency_receipts
                .iter()
                .find(|receipt| receipt.idempotency_key == request.idempotency_key)
            {
                if receipt.intent == intent {
                    if let AgentRevisionReceiptResult::Validate(draft) = &receipt.result {
                        return Ok(AgentRevisionCatalogMutation::unchanged(draft.clone()));
                    }
                }
                return Err(idempotency_conflict("Agent draft validation"));
            }

            let result = {
                let definition = definition_mut(catalog, &request.definition_id)?;
                self.verify_legacy_source(definition)?;
                let (result, updated_at) = {
                    let draft = draft_mut(definition, &request.draft_id)?;
                    if draft.draft_revision_id != request.draft_revision_id {
                        return Err(AgentRevisionError::revision_conflict(
                            AgentRevisionConflictKind::DraftRevision,
                            Some(request.draft_revision_id.clone()),
                            Some(draft.draft_revision_id.clone()),
                            "Validation evidence targets a stale Agent draft revision",
                        ));
                    }
                    if draft.status == AgentDraftStatus::Published {
                        return Err(AgentRevisionError::conflict(
                            "Published Agent draft cannot accept validation evidence",
                        ));
                    }
                    let evidence = AgentValidationEvidence {
                        validation_id: generated_id("agent-validation"),
                        draft_revision_id: draft.draft_revision_id.clone(),
                        status: request.evidence.status,
                        debug_session_id: request.evidence.debug_session_id.clone(),
                        test_case_id: request.evidence.test_case_id.clone(),
                        capability_snapshot: request.evidence.capability_snapshot.clone(),
                        message: request.evidence.message.clone(),
                        validated_at: now(),
                    };
                    draft.status = match evidence.status {
                        AgentValidationStatus::Passed => AgentDraftStatus::Validated,
                        AgentValidationStatus::Failed => AgentDraftStatus::Invalid,
                    };
                    draft.validation_evidence.push(evidence);
                    draft.updated_at = now();
                    (draft.clone(), draft.updated_at.clone())
                };
                definition.updated_at = updated_at;
                result
            };
            append_receipt(
                catalog,
                AgentRevisionIdempotencyReceipt {
                    idempotency_key: request.idempotency_key.clone(),
                    intent,
                    result: AgentRevisionReceiptResult::Validate(result.clone()),
                },
            )?;
            Ok(AgentRevisionCatalogMutation::changed(result))
        })
    }

    pub fn publish(
        &self,
        request: PublishAgentRevisionRequest,
    ) -> AgentRevisionResult<PublishAgentRevisionResult> {
        require_idempotency_key(&request.idempotency_key)?;
        let intent = AgentRevisionReceiptIntent::Publish(request.clone());
        self.store.mutate(|catalog| {
            if let Some(receipt) = catalog
                .idempotency_receipts
                .iter()
                .find(|receipt| receipt.idempotency_key == request.idempotency_key)
            {
                if receipt.intent == intent {
                    if let AgentRevisionReceiptResult::Publish(result) = &receipt.result {
                        let mut result = result.clone();
                        result.status = AgentPublishStatus::AlreadyPublished;
                        return Ok(AgentRevisionCatalogMutation::unchanged(result));
                    }
                }
                return Err(idempotency_conflict("Agent publish"));
            }

            let definition_index = catalog
                .definitions
                .iter()
                .position(|definition| definition.definition_id == request.definition_id)
                .ok_or_else(|| AgentRevisionError::not_found("Agent definition was not found"))?;
            {
                let definition = &catalog.definitions[definition_index];
                self.verify_legacy_source(definition)?;
                if definition.latest_published_revision_id != request.expected_base_revision_id {
                    return Err(AgentRevisionError::revision_conflict(
                        AgentRevisionConflictKind::BaseRevision,
                        request.expected_base_revision_id.clone(),
                        definition.latest_published_revision_id.clone(),
                        "Agent definition latest revision changed before publication",
                    ));
                }
            }

            let (revision, published_draft, definition_snapshot) = {
                let definition = &mut catalog.definitions[definition_index];
                let draft_index = definition
                    .drafts
                    .iter()
                    .position(|draft| draft.draft_id == request.draft_id)
                    .ok_or_else(|| AgentRevisionError::not_found("Agent draft was not found"))?;
                let draft = &definition.drafts[draft_index];
                if draft.base_revision_id != request.expected_base_revision_id {
                    return Err(AgentRevisionError::revision_conflict(
                        AgentRevisionConflictKind::BaseRevision,
                        request.expected_base_revision_id.clone(),
                        draft.base_revision_id.clone(),
                        "Agent draft base revision changed before publication",
                    ));
                }
                if draft.draft_revision_id != request.expected_draft_revision_id {
                    return Err(AgentRevisionError::revision_conflict(
                        AgentRevisionConflictKind::DraftRevision,
                        Some(request.expected_draft_revision_id.clone()),
                        Some(draft.draft_revision_id.clone()),
                        "Agent draft revision changed before publication",
                    ));
                }
                let has_current_pass = draft.validation_evidence.iter().any(|evidence| {
                    evidence.draft_revision_id == draft.draft_revision_id
                        && evidence.status == AgentValidationStatus::Passed
                });
                if draft.status != AgentDraftStatus::Validated || !has_current_pass {
                    return Err(AgentRevisionError::validation(
                        "Agent draft must have passing validation for its current revision",
                    ));
                }
                let revision = AgentRevisionRecord {
                    revision_id: generated_id("agent-rev"),
                    definition_id: definition.definition_id.clone(),
                    content: draft.content.clone(),
                    created_at: now(),
                    legacy_runtime_revision_aliases: Vec::new(),
                };
                definition.revisions.push(revision.clone());
                definition.latest_published_revision_id = Some(revision.revision_id.clone());
                definition.drafts[draft_index].status = AgentDraftStatus::Published;
                definition.drafts[draft_index].updated_at = now();
                definition.updated_at = definition.drafts[draft_index].updated_at.clone();
                (
                    revision,
                    definition.drafts[draft_index].clone(),
                    definition.clone(),
                )
            };
            let result = PublishAgentRevisionResult {
                status: AgentPublishStatus::Published,
                revision,
                draft: published_draft,
                definition: definition_snapshot,
            };
            append_receipt(
                catalog,
                AgentRevisionIdempotencyReceipt {
                    idempotency_key: request.idempotency_key.clone(),
                    intent,
                    result: AgentRevisionReceiptResult::Publish(result.clone()),
                },
            )?;
            Ok(AgentRevisionCatalogMutation::changed(result))
        })
    }

    pub fn set_default(
        &self,
        request: SetAgentDefaultRevisionRequest,
    ) -> AgentRevisionResult<SetAgentDefaultRevisionResult> {
        require_idempotency_key(&request.idempotency_key)?;
        let intent = AgentRevisionReceiptIntent::SetDefault(request.clone());
        self.store.mutate(|catalog| {
            if let Some(receipt) = catalog
                .idempotency_receipts
                .iter()
                .find(|receipt| receipt.idempotency_key == request.idempotency_key)
            {
                if receipt.intent == intent {
                    if let AgentRevisionReceiptResult::SetDefault(result) = &receipt.result {
                        let mut result = result.clone();
                        result.status = AgentSetDefaultStatus::AlreadyDefault;
                        return Ok(AgentRevisionCatalogMutation::unchanged(result));
                    }
                }
                return Err(idempotency_conflict("Agent default revision"));
            }

            let result = {
                let definition = definition_mut(catalog, &request.definition_id)?;
                self.verify_legacy_source(definition)?;
                if definition.default_revision_id != request.expected_default_revision_id {
                    return Err(AgentRevisionError::revision_conflict(
                        AgentRevisionConflictKind::DefaultRevision,
                        request.expected_default_revision_id.clone(),
                        definition.default_revision_id.clone(),
                        "Agent default revision changed before update",
                    ));
                }
                if !definition
                    .revisions
                    .iter()
                    .any(|revision| revision.revision_id == request.revision_id)
                {
                    return Err(AgentRevisionError::not_found(
                        "Target Agent revision was not found",
                    ));
                }
                definition.default_revision_id = Some(request.revision_id.clone());
                definition.updated_at = now();
                SetAgentDefaultRevisionResult {
                    status: AgentSetDefaultStatus::Updated,
                    definition: definition.clone(),
                }
            };
            append_receipt(
                catalog,
                AgentRevisionIdempotencyReceipt {
                    idempotency_key: request.idempotency_key.clone(),
                    intent,
                    result: AgentRevisionReceiptResult::SetDefault(result.clone()),
                },
            )?;
            Ok(AgentRevisionCatalogMutation::changed(result))
        })
    }

    pub fn resolve_published_revision(
        &self,
        persona_key: &str,
        expected_revision: &str,
    ) -> AgentRevisionResult<Option<AgentRevisionRecord>> {
        self.scope().validate()?;
        self.store.read(|catalog| {
            let Some(definition) = catalog
                .definitions
                .iter()
                .find(|definition| definition.persona_key == persona_key)
            else {
                return Ok(None);
            };
            let revision = definition.revisions.iter().find(|revision| {
                revision.revision_id == expected_revision
                    || revision
                        .legacy_runtime_revision_aliases
                        .iter()
                        .any(|alias| alias == expected_revision)
            });
            revision.cloned().map(Some).ok_or_else(|| {
                AgentRevisionError::not_found(format!(
                    "Unknown published Agent revision for persona {persona_key}"
                ))
            })
        })
    }

    /// Return whether a catalog persona was imported from a legacy source.
    /// Runtime uses this fact to preserve live legacy revocation without
    /// requiring catalog-only Agents to have a shadow `.md` definition.
    pub fn resolve_persona_legacy_backing(
        &self,
        persona_key: &str,
    ) -> AgentRevisionResult<Option<bool>> {
        self.scope().validate()?;
        self.store.read(|catalog| {
            Ok(catalog
                .definitions
                .iter()
                .find(|definition| definition.persona_key == persona_key)
                .map(|definition| definition.legacy_source.is_some()))
        })
    }

    fn verify_import_source(&self, import: &LegacyAgentImport) -> AgentRevisionResult<()> {
        let current = self.store.read_legacy_source(&import.source_path)?;
        if current != import.raw_document {
            return Err(AgentRevisionError::new(
                AgentRevisionErrorCode::SourceConflict,
                "Legacy Agent source changed before import",
                true,
            ));
        }
        Ok(())
    }

    fn verify_legacy_source(&self, definition: &AgentDefinitionRecord) -> AgentRevisionResult<()> {
        let Some(source) = definition.legacy_source.as_ref() else {
            return Ok(());
        };
        let current = self.store.read_legacy_source(&source.source_path)?;
        if current != source.imported_raw_document {
            return Err(AgentRevisionError::new(
                AgentRevisionErrorCode::SourceConflict,
                "Legacy Agent source changed after import; revision authoring stopped",
                true,
            ));
        }
        Ok(())
    }
}

fn definition_mut<'a>(
    catalog: &'a mut AgentRevisionCatalog,
    definition_id: &str,
) -> AgentRevisionResult<&'a mut AgentDefinitionRecord> {
    catalog
        .definitions
        .iter_mut()
        .find(|definition| definition.definition_id == definition_id)
        .ok_or_else(|| AgentRevisionError::not_found("Agent definition was not found"))
}

fn draft_mut<'a>(
    definition: &'a mut AgentDefinitionRecord,
    draft_id: &str,
) -> AgentRevisionResult<&'a mut AgentDraftRecord> {
    definition
        .drafts
        .iter_mut()
        .find(|draft| draft.draft_id == draft_id)
        .ok_or_else(|| AgentRevisionError::not_found("Agent draft was not found"))
}

fn open_request_persona_key(
    request: &OpenAgentRevisionDraftRequest,
) -> AgentRevisionResult<Option<String>> {
    let identities = [
        request.persona_key.as_deref(),
        request
            .initial_content
            .as_ref()
            .map(|content| content.persona_key.as_str()),
        request
            .legacy_import
            .as_ref()
            .map(|import| import.content.persona_key.as_str()),
    ];
    let identity = identities.iter().flatten().copied().next();
    if let Some(identity) = identity {
        if identities
            .iter()
            .flatten()
            .any(|candidate| *candidate != identity)
        {
            return Err(AgentRevisionError::validation(
                "Agent draft open request contains conflicting persona identities",
            ));
        }
    }
    Ok(identity.map(str::to_string))
}

fn open_intent(request: &OpenAgentRevisionDraftRequest) -> AgentRevisionOpenIntent {
    AgentRevisionOpenIntent {
        definition_id: request.definition_id.clone(),
        persona_key: request.persona_key.clone().or_else(|| {
            request
                .legacy_import
                .as_ref()
                .map(|import| import.content.persona_key.clone())
        }),
        initial_content: request.initial_content.clone(),
    }
}

fn require_idempotency_key(value: &str) -> AgentRevisionResult<()> {
    if value.trim().is_empty() {
        Err(AgentRevisionError::validation(
            "Agent revision command requires an idempotency key",
        ))
    } else {
        Ok(())
    }
}

fn idempotency_conflict(operation: &str) -> AgentRevisionError {
    let mut error = AgentRevisionError::new(
        AgentRevisionErrorCode::IdempotencyConflict,
        format!("Idempotency key was already used for a different {operation} request"),
        false,
    );
    error.conflict_kind = Some(AgentRevisionConflictKind::IdempotencyKey);
    error
}

fn append_receipt(
    catalog: &mut AgentRevisionCatalog,
    receipt: AgentRevisionIdempotencyReceipt,
) -> AgentRevisionResult<()> {
    catalog.idempotency_receipts.push(receipt);
    if catalog.idempotency_receipts.len() > AGENT_REVISION_RECEIPT_REPLAY_LIMIT {
        let remove_count = catalog.idempotency_receipts.len() - AGENT_REVISION_RECEIPT_REPLAY_LIMIT;
        catalog.idempotency_receipts.drain(..remove_count);
    }
    while catalog.idempotency_receipts.len() > 1 {
        let serialized_bytes = serde_json::to_vec(&catalog.idempotency_receipts)
            .map_err(|error| {
                AgentRevisionError::new(
                    AgentRevisionErrorCode::Serialization,
                    format!("Cannot size Agent revision idempotency receipts: {error}"),
                    false,
                )
            })?
            .len();
        if serialized_bytes <= AGENT_REVISION_RECEIPT_REPLAY_BYTES {
            break;
        }
        catalog.idempotency_receipts.remove(0);
    }
    Ok(())
}

fn generated_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4().simple())
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    #[derive(Clone)]
    struct MemoryCatalogStore {
        scope: AgentRevisionScope,
        catalog: Arc<Mutex<AgentRevisionCatalog>>,
        sources: Arc<Mutex<HashMap<PathBuf, String>>>,
    }

    impl MemoryCatalogStore {
        fn user() -> Self {
            let scope = AgentRevisionScope::user();
            Self {
                catalog: Arc::new(Mutex::new(AgentRevisionCatalog::empty(scope.clone()))),
                scope,
                sources: Arc::new(Mutex::new(HashMap::new())),
            }
        }

        fn install_source(&self, path: PathBuf, content: impl Into<String>) {
            self.sources.lock().unwrap().insert(path, content.into());
        }

        fn receipt_count(&self) -> usize {
            self.catalog.lock().unwrap().idempotency_receipts.len()
        }
    }

    impl AgentRevisionCatalogStore for MemoryCatalogStore {
        fn scope(&self) -> &AgentRevisionScope {
            &self.scope
        }

        fn read<T>(
            &self,
            operation: impl FnOnce(&AgentRevisionCatalog) -> AgentRevisionResult<T>,
        ) -> AgentRevisionResult<T> {
            operation(&self.catalog.lock().unwrap())
        }

        fn mutate<T>(
            &self,
            operation: impl FnOnce(
                &mut AgentRevisionCatalog,
            ) -> AgentRevisionResult<AgentRevisionCatalogMutation<T>>,
        ) -> AgentRevisionResult<T> {
            let mut guard = self.catalog.lock().unwrap();
            let mut candidate = guard.clone();
            let mutation = operation(&mut candidate)?;
            if mutation.changed {
                candidate.catalog_revision += 1;
                *guard = candidate;
            }
            Ok(mutation.value)
        }

        fn read_legacy_source(&self, path: &Path) -> AgentRevisionResult<String> {
            self.sources
                .lock()
                .unwrap()
                .get(path)
                .cloned()
                .ok_or_else(|| {
                    AgentRevisionError::new(
                        AgentRevisionErrorCode::SourceConflict,
                        "Legacy source is unavailable",
                        true,
                    )
                })
        }
    }

    fn content(persona_key: &str, prompt: &str) -> AgentRevisionContent {
        AgentRevisionContent {
            persona_key: persona_key.to_string(),
            display_name: "Agent".to_string(),
            description: "Test Agent".to_string(),
            prompt: prompt.to_string(),
            tools: vec!["Read".to_string()],
            readonly: true,
            review: false,
            model: "fast".to_string(),
            allowed_parent_agent_ids: vec!["agentic".to_string()],
        }
    }

    fn open_new(
        service: &AgentRevisionService<MemoryCatalogStore>,
        persona_key: &str,
        idempotency_key: &str,
    ) -> AgentDraftRecord {
        service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some(persona_key.to_string()),
                initial_content: Some(content(persona_key, "v1")),
                legacy_import: None,
                idempotency_key: idempotency_key.to_string(),
            })
            .unwrap()
    }

    fn pass_validation(
        service: &AgentRevisionService<MemoryCatalogStore>,
        draft: &AgentDraftRecord,
        idempotency_key: &str,
    ) -> AgentDraftRecord {
        service
            .record_validation(RecordAgentRevisionValidationRequest {
                definition_id: draft.definition_id.clone(),
                draft_id: draft.draft_id.clone(),
                draft_revision_id: draft.draft_revision_id.clone(),
                evidence: AgentValidationEvidenceInput {
                    status: AgentValidationStatus::Passed,
                    debug_session_id: Some("debug-1".to_string()),
                    test_case_id: Some("smoke".to_string()),
                    capability_snapshot: vec!["Read".to_string()],
                    message: None,
                },
                idempotency_key: idempotency_key.to_string(),
            })
            .unwrap()
    }

    #[test]
    fn save_uses_exact_draft_cas_invalidates_evidence_and_replays_idempotently() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store);
        let draft = open_new(&service, "user::void::writer", "open-writer");
        let validated = pass_validation(&service, &draft, "validate-writer");
        assert_eq!(validated.status, AgentDraftStatus::Validated);
        assert_eq!(validated.validation_evidence.len(), 1);

        let request = SaveAgentRevisionDraftRequest {
            definition_id: draft.definition_id.clone(),
            draft_id: draft.draft_id.clone(),
            expected_draft_revision_id: draft.draft_revision_id.clone(),
            content: content("user::void::writer", "v2"),
            idempotency_key: "save-writer".to_string(),
        };
        let saved = service.save_draft(request.clone()).unwrap();
        assert_ne!(saved.draft_revision_id, draft.draft_revision_id);
        assert_eq!(saved.draft_fingerprint, saved.draft_revision_id);
        assert_eq!(saved.status, AgentDraftStatus::Editing);
        assert!(saved.validation_evidence.is_empty());

        let replayed = service.save_draft(request).unwrap();
        assert_eq!(replayed.draft_revision_id, saved.draft_revision_id);

        let conflict = service
            .save_draft(SaveAgentRevisionDraftRequest {
                idempotency_key: "save-writer".to_string(),
                content: content("user::void::writer", "different intent"),
                ..SaveAgentRevisionDraftRequest {
                    definition_id: draft.definition_id,
                    draft_id: draft.draft_id,
                    expected_draft_revision_id: draft.draft_revision_id,
                    content: content("user::void::writer", "v2"),
                    idempotency_key: String::new(),
                }
            })
            .unwrap_err();
        assert_eq!(conflict.code, AgentRevisionErrorCode::IdempotencyConflict);
        assert_eq!(
            conflict.conflict_kind,
            Some(AgentRevisionConflictKind::IdempotencyKey)
        );
    }

    #[test]
    fn publication_is_atomic_idempotent_and_never_changes_default_pointer() {
        let store = MemoryCatalogStore::user();
        let legacy_path = PathBuf::from("legacy-agent.md");
        let raw = "legacy v3 source";
        store.install_source(legacy_path.clone(), raw);
        let service = AgentRevisionService::new(store);
        let draft = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::legacy".to_string()),
                initial_content: None,
                legacy_import: Some(LegacyAgentImport {
                    source_path: legacy_path,
                    raw_document: raw.to_string(),
                    runtime_revision_alias: "runtime-v3".to_string(),
                    content: content("user::void::legacy", "v3"),
                }),
                idempotency_key: "open-legacy".to_string(),
            })
            .unwrap();
        let validated = pass_validation(&service, &draft, "validate-legacy");
        let publish_request = PublishAgentRevisionRequest {
            definition_id: draft.definition_id.clone(),
            draft_id: draft.draft_id.clone(),
            expected_base_revision_id: draft.base_revision_id.clone(),
            expected_draft_revision_id: validated.draft_revision_id.clone(),
            idempotency_key: "publish-v4".to_string(),
        };
        let published = service.publish(publish_request.clone()).unwrap();

        assert_eq!(published.status, AgentPublishStatus::Published);
        assert_eq!(published.draft.status, AgentDraftStatus::Published);
        assert_eq!(
            published.definition.default_revision_id,
            draft.base_revision_id
        );
        assert_eq!(
            published.definition.latest_published_revision_id.as_deref(),
            Some(published.revision.revision_id.as_str())
        );
        let replayed = service.publish(publish_request).unwrap();
        assert_eq!(replayed.status, AgentPublishStatus::AlreadyPublished);
        assert_eq!(
            replayed.revision.revision_id,
            published.revision.revision_id
        );

        let set_request = SetAgentDefaultRevisionRequest {
            definition_id: draft.definition_id,
            revision_id: published.revision.revision_id.clone(),
            expected_default_revision_id: draft.base_revision_id,
            idempotency_key: "default-v4".to_string(),
        };
        let updated = service.set_default(set_request.clone()).unwrap();
        assert_eq!(updated.status, AgentSetDefaultStatus::Updated);
        let replayed = service.set_default(set_request).unwrap();
        assert_eq!(replayed.status, AgentSetDefaultStatus::AlreadyDefault);
    }

    #[test]
    fn receipt_window_evicts_oldest_intent_and_keeps_recent_replay_protection() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store.clone());
        for index in 0..=AGENT_REVISION_RECEIPT_REPLAY_LIMIT {
            open_new(
                &service,
                &format!("user::void::agent-{index}"),
                &format!("open-{index}"),
            );
        }
        assert_eq!(store.receipt_count(), AGENT_REVISION_RECEIPT_REPLAY_LIMIT);

        let reused_evicted = open_new(&service, "user::void::after-eviction", "open-0");
        assert_eq!(
            reused_evicted.content.persona_key,
            "user::void::after-eviction"
        );
        let recent_conflict = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::conflict".to_string()),
                initial_content: Some(content("user::void::conflict", "v1")),
                legacy_import: None,
                idempotency_key: format!("open-{}", AGENT_REVISION_RECEIPT_REPLAY_LIMIT),
            })
            .unwrap_err();
        assert_eq!(
            recent_conflict.code,
            AgentRevisionErrorCode::IdempotencyConflict
        );
    }

    #[test]
    fn open_treats_definition_id_as_authoritative_and_rejects_identity_mismatch() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store);
        let existing = open_new(&service, "user::void::writer", "open-writer");

        let unknown = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: Some("agent-def-missing".to_string()),
                persona_key: Some(existing.content.persona_key.clone()),
                initial_content: None,
                legacy_import: None,
                idempotency_key: "open-missing-definition".to_string(),
            })
            .unwrap_err();
        assert_eq!(unknown.code, AgentRevisionErrorCode::NotFound);

        let mismatched = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: Some(existing.definition_id),
                persona_key: Some("user::void::other".to_string()),
                initial_content: Some(content("user::void::other", "other")),
                legacy_import: None,
                idempotency_key: "open-mismatched-identity".to_string(),
            })
            .unwrap_err();
        assert_eq!(mismatched.code, AgentRevisionErrorCode::ValidationFailed);
    }

    #[test]
    fn caller_cannot_supply_a_new_definition_identity_or_duplicate_a_persona() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store);
        let existing = open_new(&service, "user::void::writer", "open-writer");

        let duplicate = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: Some("agent-def-new".to_string()),
                persona_key: Some("user::void::writer".to_string()),
                initial_content: Some(content("user::void::writer", "duplicate")),
                legacy_import: None,
                idempotency_key: "open-duplicate-persona".to_string(),
            })
            .unwrap_err();

        assert_eq!(duplicate.code, AgentRevisionErrorCode::NotFound);

        let initial_content_only_duplicate = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: None,
                initial_content: Some(content("user::void::writer", "duplicate again")),
                legacy_import: None,
                idempotency_key: "open-duplicate-persona-from-content".to_string(),
            })
            .unwrap();
        assert_eq!(
            initial_content_only_duplicate.definition_id,
            existing.definition_id
        );
    }

    #[test]
    fn catalog_only_definition_reopens_by_persona_key() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store);
        let opened = open_new(&service, "user::void::writer", "open-writer");

        let reopened = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::writer".to_string()),
                initial_content: None,
                legacy_import: None,
                idempotency_key: "reopen-writer-by-persona".to_string(),
            })
            .unwrap();

        assert_eq!(reopened.draft_id, opened.draft_id);
        assert_eq!(reopened.definition_id, opened.definition_id);
    }

    #[test]
    fn successful_legacy_open_replays_after_the_source_changes() {
        let store = MemoryCatalogStore::user();
        let legacy_path = PathBuf::from("legacy-replay.md");
        store.install_source(legacy_path.clone(), "legacy v3");
        let service = AgentRevisionService::new(store.clone());
        let request = OpenAgentRevisionDraftRequest {
            definition_id: None,
            persona_key: Some("user::void::legacy-replay".to_string()),
            initial_content: None,
            legacy_import: Some(LegacyAgentImport {
                source_path: legacy_path.clone(),
                raw_document: "legacy v3".to_string(),
                runtime_revision_alias: "runtime-v3".to_string(),
                content: content("user::void::legacy-replay", "v3"),
            }),
            idempotency_key: "open-legacy-replay".to_string(),
        };
        let opened = service.open_draft(request.clone()).unwrap();
        store.install_source(legacy_path, "legacy v4 from compatibility editor");

        let replayed = service
            .replay_open_draft(&OpenAgentRevisionDraftRequest {
                legacy_import: None,
                ..request
            })
            .unwrap()
            .expect("host preflight must replay before legacy materialization");

        assert_eq!(replayed.draft_id, opened.draft_id);
        assert_eq!(replayed.draft_revision_id, opened.draft_revision_id);
    }

    #[test]
    fn receipt_replay_window_is_bounded_by_persisted_bytes() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store.clone());
        for index in 0..2 {
            let persona_key = format!("user::void::large-{index}");
            let mut large = content(&persona_key, "large");
            large.prompt = "x".repeat(700_000);
            service
                .open_draft(OpenAgentRevisionDraftRequest {
                    definition_id: None,
                    persona_key: Some(persona_key),
                    initial_content: Some(large),
                    legacy_import: None,
                    idempotency_key: format!("large-open-{index}"),
                })
                .unwrap();
        }
        assert_eq!(store.receipt_count(), 1);

        let conflict = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::different".to_string()),
                initial_content: Some(content("user::void::different", "different")),
                legacy_import: None,
                idempotency_key: "large-open-1".to_string(),
            })
            .unwrap_err();
        assert_eq!(conflict.code, AgentRevisionErrorCode::IdempotencyConflict);
    }

    #[test]
    fn review_revision_cannot_request_write_capability() {
        let store = MemoryCatalogStore::user();
        let service = AgentRevisionService::new(store);
        let mut unsafe_review = content("user::void::reviewer", "review");
        unsafe_review.review = true;
        unsafe_review.readonly = false;
        unsafe_review.tools.push("Write".to_string());

        let error = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some(unsafe_review.persona_key.clone()),
                initial_content: Some(unsafe_review),
                legacy_import: None,
                idempotency_key: "open-unsafe-review".to_string(),
            })
            .unwrap_err();

        assert_eq!(error.code, AgentRevisionErrorCode::ValidationFailed);
    }
}
