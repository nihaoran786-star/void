//! Desktop adapter for versioned Agent authoring.
//!
//! The host validates workspace authority and materializes legacy source facts.
//! The shared domain service owns all state transitions and CAS semantics.

use crate::api::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use void_core::agentic::agent_revisions::{
    AgentDefinitionRecord, AgentDraftRecord, AgentPublishStatus, AgentRevisionContent,
    AgentRevisionError, AgentRevisionErrorCode, AgentRevisionLevel, AgentRevisionRecord,
    AgentRevisionScope, AgentRevisionService, AgentRevisionWorkspaceBackend, AgentSetDefaultStatus,
    AgentValidationEvidenceInput, LegacyAgentImport,
    OpenAgentRevisionDraftRequest as CoreOpenDraftRequest,
    PublishAgentRevisionRequest as CorePublishRequest,
    RecordAgentRevisionValidationRequest as CoreValidationRequest,
    SaveAgentRevisionDraftRequest as CoreSaveDraftRequest,
    SetAgentDefaultRevisionRequest as CoreSetDefaultRequest,
};
use void_core::agentic::persistence::FileAgentRevisionCatalogStore;
use void_core::service::workspace::{WorkspaceInfo, WorkspaceKind};

type DesktopAgentRevisionService = AgentRevisionService<FileAgentRevisionCatalogStore>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAgentDefinitionRecordRequest {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveAgentDefinitionByPersonaKeyRequest {
    pub scope: AgentRevisionScope,
    pub persona_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAgentRevisionDraftRequest {
    pub scope: AgentRevisionScope,
    pub definition_id: Option<String>,
    pub persona_key: Option<String>,
    pub initial_content: Option<AgentRevisionContent>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentRevisionDraftRequest {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub draft_id: String,
    pub expected_draft_revision_id: String,
    pub content: AgentRevisionContent,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordAgentRevisionValidationRequest {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub draft_id: String,
    pub draft_revision_id: String,
    pub evidence: AgentValidationEvidenceInput,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishAgentRevisionRequest {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub draft_id: String,
    pub expected_base_revision_id: Option<String>,
    pub expected_draft_revision_id: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentDefaultRevisionRequest {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub revision_id: String,
    pub expected_default_revision_id: Option<String>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAgentSourceSummary {
    pub source_path: PathBuf,
    pub imported_runtime_revision_alias: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinitionRecordView {
    pub scope: AgentRevisionScope,
    pub definition_id: String,
    pub persona_key: String,
    pub default_revision_id: Option<String>,
    pub latest_published_revision_id: Option<String>,
    pub revisions: Vec<AgentRevisionRecord>,
    pub drafts: Vec<AgentDraftRecord>,
    pub legacy_source: Option<LegacyAgentSourceSummary>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<AgentDefinitionRecord> for AgentDefinitionRecordView {
    fn from(record: AgentDefinitionRecord) -> Self {
        Self {
            scope: record.scope,
            definition_id: record.definition_id,
            persona_key: record.persona_key,
            default_revision_id: record.default_revision_id,
            latest_published_revision_id: record.latest_published_revision_id,
            revisions: record.revisions,
            drafts: record.drafts,
            legacy_source: record.legacy_source.map(|source| LegacyAgentSourceSummary {
                source_path: source.source_path,
                imported_runtime_revision_alias: source.imported_runtime_revision_alias,
            }),
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishAgentRevisionResponse {
    pub status: AgentPublishStatus,
    pub revision: AgentRevisionRecord,
    pub draft: AgentDraftRecord,
    pub definition: AgentDefinitionRecordView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentDefaultRevisionResponse {
    pub status: AgentSetDefaultStatus,
    pub definition: AgentDefinitionRecordView,
}

fn error(
    code: AgentRevisionErrorCode,
    message: impl Into<String>,
    retryable: bool,
) -> AgentRevisionError {
    AgentRevisionError::new(code, message, retryable)
}

fn validate_project_workspace_authority(
    requested: &AgentRevisionScope,
    workspace_by_id: Option<&WorkspaceInfo>,
    workspace_by_path: Option<&WorkspaceInfo>,
) -> Result<AgentRevisionScope, AgentRevisionError> {
    requested.validate()?;
    if requested.level == AgentRevisionLevel::User {
        return Ok(AgentRevisionScope::user());
    }
    let requested_workspace = requested.workspace.as_ref().ok_or_else(|| {
        error(
            AgentRevisionErrorCode::WorkspaceScopeMismatch,
            "Project Agent revision request is missing workspace facts",
            false,
        )
    })?;
    if requested_workspace.backend != AgentRevisionWorkspaceBackend::Local {
        return Err(error(
            AgentRevisionErrorCode::UnsupportedRemoteProject,
            "Remote project Agent revision authoring is not supported yet",
            false,
        ));
    }
    let workspace_by_id = workspace_by_id.ok_or_else(|| {
        error(
            AgentRevisionErrorCode::WorkspaceScopeMismatch,
            "Requested Agent revision workspace ID is not registered",
            false,
        )
    })?;
    let workspace_by_path = workspace_by_path.ok_or_else(|| {
        error(
            AgentRevisionErrorCode::WorkspaceScopeMismatch,
            "Requested Agent revision workspace path is not registered",
            false,
        )
    })?;
    if workspace_by_id.id != requested_workspace.workspace_id
        || workspace_by_path.id != requested_workspace.workspace_id
        || workspace_by_id.id != workspace_by_path.id
        || workspace_by_id.workspace_kind == WorkspaceKind::Remote
        || workspace_by_path.workspace_kind == WorkspaceKind::Remote
    {
        return Err(error(
            AgentRevisionErrorCode::WorkspaceScopeMismatch,
            "Agent revision workspace ID, path, and backend do not identify one local workspace",
            false,
        ));
    }
    Ok(AgentRevisionScope::local_project(
        workspace_by_id.id.clone(),
        workspace_by_id.root_path.clone(),
    ))
}

async fn trusted_scope(
    state: &AppState,
    requested: AgentRevisionScope,
) -> Result<AgentRevisionScope, AgentRevisionError> {
    if requested.level == AgentRevisionLevel::User {
        requested.validate()?;
        return Ok(AgentRevisionScope::user());
    }
    let requested_workspace = requested.workspace.as_ref().ok_or_else(|| {
        error(
            AgentRevisionErrorCode::WorkspaceScopeMismatch,
            "Project Agent revision request is missing workspace facts",
            false,
        )
    })?;
    if requested_workspace.backend != AgentRevisionWorkspaceBackend::Local {
        return Err(error(
            AgentRevisionErrorCode::UnsupportedRemoteProject,
            "Remote project Agent revision authoring is not supported yet",
            false,
        ));
    }
    let workspace_by_id = state
        .workspace_service
        .get_workspace(&requested_workspace.workspace_id)
        .await;
    let workspace_by_path = state
        .workspace_service
        .get_workspace_by_path(&requested_workspace.workspace_path)
        .await;
    validate_project_workspace_authority(
        &requested,
        workspace_by_id.as_ref(),
        workspace_by_path.as_ref(),
    )
}

fn service_for_scope(
    state: &AppState,
    scope: AgentRevisionScope,
) -> Result<DesktopAgentRevisionService, AgentRevisionError> {
    let store = FileAgentRevisionCatalogStore::for_scope(
        state.workspace_service.path_manager().clone(),
        scope,
    )?;
    Ok(AgentRevisionService::new(store))
}

fn persona_id(persona_key: &str) -> Result<&str, AgentRevisionError> {
    match persona_key.split("::").collect::<Vec<_>>().as_slice() {
        ["user", "void", id] | ["project", "void", id] if !id.trim().is_empty() => Ok(*id),
        _ => Err(AgentRevisionError::validation(
            "Agent persona key must be source-qualified",
        )),
    }
}

async fn legacy_import_for_persona(
    state: &AppState,
    scope: &AgentRevisionScope,
    persona_key: &str,
) -> Result<LegacyAgentImport, AgentRevisionError> {
    if !persona_key.starts_with(scope.expected_persona_prefix()) {
        return Err(AgentRevisionError::validation(
            "Agent persona key does not match the trusted authoring scope",
        ));
    }
    let workspace_root = scope
        .workspace
        .as_ref()
        .map(|workspace| workspace.workspace_path.as_path());
    let id = persona_id(persona_key)?;
    let detail = state
        .agent_registry
        .get_custom_subagent_detail_keyed(Some(persona_key), id, workspace_root)
        .await
        .map_err(|source| {
            error(
                AgentRevisionErrorCode::NotFound,
                format!("Cannot resolve legacy Agent source: {source}"),
                false,
            )
        })?;
    let runtime_revision_alias = state
        .agent_registry
        .get_subagents_info(workspace_root)
        .await
        .into_iter()
        .find(|agent| agent.key == persona_key)
        .map(|agent| agent.prompt_cache_scope_key)
        .ok_or_else(|| {
            error(
                AgentRevisionErrorCode::NotFound,
                "Cannot resolve the legacy Agent runtime revision",
                false,
            )
        })?;
    let source_path = PathBuf::from(&detail.path);
    let raw_document = tokio::fs::read_to_string(&source_path)
        .await
        .map_err(|source| {
            error(
                AgentRevisionErrorCode::SourceConflict,
                format!("Cannot read the legacy Agent source: {source}"),
                true,
            )
        })?;
    Ok(LegacyAgentImport {
        source_path,
        raw_document,
        runtime_revision_alias,
        content: AgentRevisionContent {
            persona_key: detail.subagent_key,
            display_name: detail.display_name,
            description: detail.description,
            prompt: detail.prompt,
            tools: detail.tools,
            readonly: detail.readonly,
            review: detail.review,
            model: detail.model,
            allowed_parent_agent_ids: detail.allowed_parent_agent_ids,
        },
    })
}

#[tauri::command]
pub async fn get_agent_definition_record(
    state: State<'_, AppState>,
    request: GetAgentDefinitionRecordRequest,
) -> Result<AgentDefinitionRecordView, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    service_for_scope(&state, scope)?
        .get_definition(&request.definition_id)
        .map(Into::into)
}

/// Resolves the definition behind a running session's persona binding.
///
/// A session stores a persona key rather than a definition id, so this is what
/// lets Agent Studio open the agent the conversation is actually running. It is
/// read only: the other persona-key entry point is `open_agent_revision_draft`,
/// which writes, and viewing an agent must not create a draft.
#[tauri::command]
pub async fn resolve_agent_definition_by_persona_key(
    state: State<'_, AppState>,
    request: ResolveAgentDefinitionByPersonaKeyRequest,
) -> Result<AgentDefinitionRecordView, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    service_for_scope(&state, scope)?
        .resolve_definition_by_persona_key(&request.persona_key)
        .map(Into::into)
}

#[tauri::command]
pub async fn open_agent_revision_draft(
    state: State<'_, AppState>,
    request: OpenAgentRevisionDraftRequest,
) -> Result<AgentDraftRecord, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    let service = service_for_scope(&state, scope.clone())?;
    let mut core_request = CoreOpenDraftRequest {
        definition_id: request.definition_id.clone(),
        persona_key: request.persona_key.clone(),
        initial_content: request.initial_content.clone(),
        legacy_import: None,
        idempotency_key: request.idempotency_key.clone(),
    };
    if let Some(replayed) = service.replay_open_draft(&core_request)? {
        return Ok(replayed);
    }
    let legacy_import = match request.persona_key.as_deref() {
        Some(persona_key) => match legacy_import_for_persona(&state, &scope, persona_key).await {
            Ok(import) => Some(import),
            Err(error) if error.code == AgentRevisionErrorCode::NotFound => None,
            Err(error) => return Err(error),
        },
        None => None,
    };
    if request.definition_id.is_none()
        && request.persona_key.is_none()
        && request.initial_content.is_none()
    {
        return Err(AgentRevisionError::validation(
            "Opening an Agent revision draft requires a definition, persona, or initial content",
        ));
    }
    core_request.legacy_import = legacy_import;
    service.open_draft(core_request)
}

#[tauri::command]
pub async fn save_agent_revision_draft(
    state: State<'_, AppState>,
    request: SaveAgentRevisionDraftRequest,
) -> Result<AgentDraftRecord, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    service_for_scope(&state, scope)?.save_draft(CoreSaveDraftRequest {
        definition_id: request.definition_id,
        draft_id: request.draft_id,
        expected_draft_revision_id: request.expected_draft_revision_id,
        content: request.content,
        idempotency_key: request.idempotency_key,
    })
}

#[tauri::command]
pub async fn record_agent_revision_validation(
    state: State<'_, AppState>,
    request: RecordAgentRevisionValidationRequest,
) -> Result<AgentDraftRecord, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    service_for_scope(&state, scope)?.record_validation(CoreValidationRequest {
        definition_id: request.definition_id,
        draft_id: request.draft_id,
        draft_revision_id: request.draft_revision_id,
        evidence: request.evidence,
        idempotency_key: request.idempotency_key,
    })
}

#[tauri::command]
pub async fn publish_agent_revision(
    state: State<'_, AppState>,
    request: PublishAgentRevisionRequest,
) -> Result<PublishAgentRevisionResponse, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    let result = service_for_scope(&state, scope)?.publish(CorePublishRequest {
        definition_id: request.definition_id,
        draft_id: request.draft_id,
        expected_base_revision_id: request.expected_base_revision_id,
        expected_draft_revision_id: request.expected_draft_revision_id,
        idempotency_key: request.idempotency_key,
    })?;
    Ok(PublishAgentRevisionResponse {
        status: result.status,
        revision: result.revision,
        draft: result.draft,
        definition: result.definition.into(),
    })
}

#[tauri::command]
pub async fn set_agent_default_revision(
    state: State<'_, AppState>,
    request: SetAgentDefaultRevisionRequest,
) -> Result<SetAgentDefaultRevisionResponse, AgentRevisionError> {
    let scope = trusted_scope(&state, request.scope).await?;
    let result = service_for_scope(&state, scope)?.set_default(CoreSetDefaultRequest {
        definition_id: request.definition_id,
        revision_id: request.revision_id,
        expected_default_revision_id: request.expected_default_revision_id,
        idempotency_key: request.idempotency_key,
    })?;
    Ok(SetAgentDefaultRevisionResponse {
        status: result.status,
        definition: result.definition.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use std::collections::HashMap;
    use void_core::service::workspace::{WorkspaceStatus, WorkspaceType};

    fn workspace(id: &str, root: &std::path::Path, kind: WorkspaceKind) -> WorkspaceInfo {
        WorkspaceInfo {
            id: id.to_string(),
            name: id.to_string(),
            root_path: root.to_path_buf(),
            workspace_type: WorkspaceType::Other,
            workspace_kind: kind,
            assistant_id: None,
            status: WorkspaceStatus::Active,
            languages: Vec::new(),
            opened_at: Utc::now(),
            last_accessed: Utc::now(),
            description: None,
            tags: Vec::new(),
            statistics: None,
            identity: None,
            worktree: None,
            related_paths: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn project_authority_requires_one_matching_local_workspace_identity() {
        let root = PathBuf::from(r"D:\workspace");
        let requested = AgentRevisionScope::local_project("workspace-1", root.clone());
        let valid = workspace("workspace-1", &root, WorkspaceKind::Normal);
        let other = workspace("workspace-2", &root, WorkspaceKind::Normal);
        assert_eq!(
            validate_project_workspace_authority(&requested, Some(&valid), Some(&valid)).unwrap(),
            requested
        );
        assert_eq!(
            validate_project_workspace_authority(&requested, Some(&valid), Some(&other))
                .unwrap_err()
                .code,
            AgentRevisionErrorCode::WorkspaceScopeMismatch
        );
    }

    #[test]
    fn wire_status_and_error_contracts_are_stable_camel_case_json() {
        assert_eq!(
            serde_json::to_value(AgentPublishStatus::AlreadyPublished).unwrap(),
            "already_published"
        );
        assert_eq!(
            serde_json::to_value(AgentSetDefaultStatus::AlreadyDefault).unwrap(),
            "already_default"
        );
        let value = serde_json::to_value(AgentRevisionError::revision_conflict(
            void_core::agentic::agent_revisions::AgentRevisionConflictKind::DraftRevision,
            Some("draft-1".to_string()),
            Some("draft-2".to_string()),
            "stale",
        ))
        .unwrap();
        assert_eq!(value["code"], "revision_conflict");
        assert_eq!(value["conflictKind"], "draft_revision");
        assert_eq!(value["expectedRevisionId"], "draft-1");
        assert_eq!(value["actualRevisionId"], "draft-2");

        let draft = AgentDraftRecord {
            scope: AgentRevisionScope::user(),
            definition_id: "agent-def-1".to_string(),
            draft_id: "agent-draft-1".to_string(),
            draft_revision_id: "agent-draft-rev-1".to_string(),
            base_revision_id: None,
            status: void_core::agentic::agent_revisions::AgentDraftStatus::Editing,
            draft_fingerprint: "agent-draft-rev-1".to_string(),
            content: AgentRevisionContent {
                persona_key: "user::void::writer".to_string(),
                display_name: "Writer".to_string(),
                description: "Writes".to_string(),
                prompt: "Write".to_string(),
                tools: Vec::new(),
                readonly: true,
                review: false,
                model: String::new(),
                allowed_parent_agent_ids: Vec::new(),
            },
            validation_evidence: Vec::new(),
            updated_at: "2026-08-15T00:00:00Z".to_string(),
        };
        let draft_value = serde_json::to_value(draft).unwrap();
        assert!(draft_value.get("baseRevisionId").is_some());
        assert!(draft_value["baseRevisionId"].is_null());
    }
}
