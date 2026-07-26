//! Typed desktop adapter for consent-gated workspace memory.

use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;
use void_core::agentic::persistence::{PersistenceManager, PersistentAgentMemoryTranscriptAdapter};
use void_core::infrastructure::ai::AIClientAgentMemoryExtractor;
use void_core::infrastructure::app_paths::get_path_manager_arc;
use void_core::service::agent_memory::consent::AgentMemoryCandidate;
use void_core::service::agent_memory::{
    revise_memory_proposal, AgentMemoryProposal, AgentMemoryService, AgentMemoryWorkflow,
    DeleteMemoryConfirmation, FileAgentMemoryRepository, MemoryApprovalOutcome,
    MemoryCandidateBatch, MemoryCompletionOutcome, MemoryCompletionTriggerConfig,
    MemoryWorkflowError, MemoryWorkflowErrorCode, SafePersistentSessionSourceAdapter,
    SessionCompletionMemoryRequest, StoredAgentMemory, UnsupportedAgentMemoryExtractor,
    UnsupportedPersistentSessionSourceAdapter,
};
use void_core::service::btw_relationship::BtwRelationshipRepository;
use void_core::service::session::SessionRelationshipKind;
use void_core::service::workspace::WorkspaceKind;

use crate::api::app_state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposeAgentMemoryRequest {
    pub workspace_path: PathBuf,
    pub inputs: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitAgentMemoryRequest {
    pub workspace_path: PathBuf,
    pub candidate: AgentMemoryCandidate,
    pub approved: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAgentMemoryRequest {
    pub workspace_path: PathBuf,
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractAgentMemoryFromSessionRequest {
    pub workspace_path: PathBuf,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewAgentMemoryProposalRequest {
    pub workspace_path: PathBuf,
    pub proposal: AgentMemoryProposal,
    pub edited_content: Option<String>,
    pub approved: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAgentMemoryConfirmedRequest {
    pub workspace_path: PathBuf,
    pub memory_id: String,
    pub expected_revision: u64,
    pub confirmation: String,
}

fn repository() -> FileAgentMemoryRepository {
    FileAgentMemoryRepository::new(get_path_manager_arc())
}

fn service() -> AgentMemoryService<FileAgentMemoryRepository> {
    AgentMemoryService::new(repository())
}

fn workflow_error(
    code: MemoryWorkflowErrorCode,
    message: impl Into<String>,
    retryable: bool,
) -> MemoryWorkflowError {
    MemoryWorkflowError {
        code,
        message: message.into(),
        retryable,
    }
}

pub(crate) async fn resolve_registered_local_workspace(
    state: &AppState,
    requested_path: &std::path::Path,
) -> Result<PathBuf, String> {
    let workspace = state
        .workspace_service
        .get_workspace_by_path(requested_path)
        .await
        .ok_or_else(|| "workspace is not registered in Void".to_string())?;
    if workspace.workspace_kind == WorkspaceKind::Remote {
        return Err("workspace memory is not supported for remote workspaces".to_string());
    }
    if !workspace.root_path.is_dir() {
        return Err("registered local workspace is not available".to_string());
    }
    Ok(workspace.root_path)
}

#[tauri::command]
pub async fn propose_agent_memory(
    state: State<'_, AppState>,
    request: ProposeAgentMemoryRequest,
) -> Result<MemoryCandidateBatch, String> {
    let workspace_path =
        resolve_registered_local_workspace(&state, &request.workspace_path).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = service();
        let existing = service.list(&workspace_path)?;
        Ok(service.merge_candidates(&existing, service.extract_candidates(request.inputs)))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn commit_agent_memory(
    state: State<'_, AppState>,
    request: CommitAgentMemoryRequest,
) -> Result<AgentMemoryCandidate, String> {
    let workspace_path =
        resolve_registered_local_workspace(&state, &request.workspace_path).await?;
    tauri::async_runtime::spawn_blocking(move || {
        service()
            .commit(&workspace_path, request.candidate, request.approved)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_agent_memories(
    state: State<'_, AppState>,
    workspace_path: PathBuf,
) -> Result<Vec<StoredAgentMemory>, String> {
    let workspace_path = resolve_registered_local_workspace(&state, &workspace_path).await?;
    tauri::async_runtime::spawn_blocking(move || service().list(&workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_agent_memory(
    state: State<'_, AppState>,
    request: DeleteAgentMemoryRequest,
) -> Result<(), String> {
    let workspace_path =
        resolve_registered_local_workspace(&state, &request.workspace_path).await?;
    tauri::async_runtime::spawn_blocking(move || service().delete(&workspace_path, &request.id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn extract_agent_memory_from_session(
    state: State<'_, AppState>,
    request: ExtractAgentMemoryFromSessionRequest,
) -> Result<MemoryCompletionOutcome, MemoryWorkflowError> {
    let workspace_path = resolve_registered_local_workspace(&state, &request.workspace_path)
        .await
        .map_err(|message| workflow_error(MemoryWorkflowErrorCode::Source, message, false))?;
    if !is_safe_session_id(&request.session_id) {
        return Err(workflow_error(
            MemoryWorkflowErrorCode::Source,
            "sessionId must be one safe persistent session identifier",
            false,
        ));
    }
    let extraction_enabled = state
        .config_service
        .get_config::<bool>(Some("app.ai_experience.agent_memory_extraction_enabled"))
        .await
        .map_err(|error| {
            workflow_error(
                MemoryWorkflowErrorCode::Source,
                format!("Failed to read the memory extraction setting: {error}"),
                true,
            )
        })?;
    if !extraction_enabled {
        return Err(workflow_error(
            MemoryWorkflowErrorCode::Unsupported,
            "Session memory extraction is disabled in settings",
            false,
        ));
    }
    let persistence = PersistenceManager::new(get_path_manager_arc()).map_err(|error| {
        workflow_error(
            MemoryWorkflowErrorCode::Source,
            format!("Failed to initialize persistent transcript access: {error}"),
            true,
        )
    })?;
    let metadata = persistence
        .load_session_metadata(&workspace_path, &request.session_id)
        .await
        .map_err(|error| {
            workflow_error(
                MemoryWorkflowErrorCode::Source,
                format!("Failed to authorize the persistent session: {error}"),
                true,
            )
        })?
        .ok_or_else(|| {
            workflow_error(
                MemoryWorkflowErrorCode::Source,
                "The session is not persisted in the registered workspace",
                false,
            )
        })?;
    if metadata.session_id != request.session_id
        || metadata.workspace_path.as_deref().is_some_and(|recorded| {
            !same_workspace_path(std::path::Path::new(recorded), &workspace_path)
        })
    {
        return Err(workflow_error(
            MemoryWorkflowErrorCode::Source,
            "The persistent session does not belong to the registered workspace",
            false,
        ));
    }
    let metadata_btw_parent = metadata.relationship.as_ref().and_then(|relationship| {
        (relationship.kind.as_ref() == Some(&SessionRelationshipKind::Btw))
            .then(|| relationship.parent_session_id.clone())
            .flatten()
    });
    let persisted_btw = BtwRelationshipRepository::new(get_path_manager_arc())
        .find_by_child(&workspace_path, &request.session_id)
        .map_err(|error| {
            workflow_error(
                MemoryWorkflowErrorCode::Source,
                format!("Failed to authorize BTW memory: {error}"),
                true,
            )
        })?;
    let durable_source = if let Some(relationship) = persisted_btw {
        if !is_safe_session_id(&relationship.parent_session_id)
            || relationship.child_session_id != request.session_id
            || metadata_btw_parent
                .as_deref()
                .is_some_and(|parent| parent != relationship.parent_session_id)
        {
            return Err(workflow_error(
                MemoryWorkflowErrorCode::Unsupported,
                "The BTW relationship does not match the persistent session lineage",
                false,
            ));
        }
        if !relationship.memory_enabled {
            return Err(workflow_error(
                MemoryWorkflowErrorCode::Unsupported,
                "Long-term memory is disabled for this BTW session",
                false,
            ));
        }
        let parent_metadata = persistence
            .load_session_metadata(&workspace_path, &relationship.parent_session_id)
            .await
            .map_err(|error| {
                workflow_error(
                    MemoryWorkflowErrorCode::Source,
                    format!("Failed to authorize the BTW parent session: {error}"),
                    true,
                )
            })?
            .ok_or_else(|| {
                workflow_error(
                    MemoryWorkflowErrorCode::Unsupported,
                    "The BTW parent session is not persisted in the registered workspace",
                    false,
                )
            })?;
        if parent_metadata.session_id != relationship.parent_session_id
            || parent_metadata
                .workspace_path
                .as_deref()
                .is_some_and(|recorded| {
                    !same_workspace_path(std::path::Path::new(recorded), &workspace_path)
                })
        {
            return Err(workflow_error(
                MemoryWorkflowErrorCode::Unsupported,
                "The BTW parent session does not belong to the registered workspace",
                false,
            ));
        }
        PersistentAgentMemoryTranscriptAdapter::for_btw(persistence)
    } else if metadata_btw_parent.is_some() {
        return Err(workflow_error(
            MemoryWorkflowErrorCode::Unsupported,
            "The BTW session has no durable relationship record",
            false,
        ));
    } else {
        PersistentAgentMemoryTranscriptAdapter::new(persistence)
    };
    AgentMemoryWorkflow::new(
        repository(),
        SafePersistentSessionSourceAdapter::new(durable_source),
        AIClientAgentMemoryExtractor,
        MemoryCompletionTriggerConfig { enabled: true },
    )
    .on_session_completed(SessionCompletionMemoryRequest {
        workspace_root: workspace_path,
        session_id: request.session_id,
    })
    .await
}

fn same_workspace_path(recorded: &std::path::Path, registered: &std::path::Path) -> bool {
    match (recorded.canonicalize(), registered.canonicalize()) {
        (Ok(recorded), Ok(registered)) => recorded == registered,
        _ => recorded == registered,
    }
}

fn is_safe_session_id(session_id: &str) -> bool {
    const MAX_SESSION_ID_BYTES: usize = 128;

    !session_id.is_empty()
        && session_id.len() <= MAX_SESSION_ID_BYTES
        && session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::is_safe_session_id;

    #[test]
    fn safe_session_id_rejects_path_tokens_and_unbounded_values() {
        assert!(is_safe_session_id("session_01-abcdef"));
        assert!(is_safe_session_id(&"a".repeat(128)));

        assert!(!is_safe_session_id(""));
        assert!(!is_safe_session_id("../session"));
        assert!(!is_safe_session_id("session/child"));
        assert!(!is_safe_session_id("会话"));
        assert!(!is_safe_session_id(&"a".repeat(129)));
    }
}

#[tauri::command]
pub async fn review_agent_memory_proposal(
    state: State<'_, AppState>,
    request: ReviewAgentMemoryProposalRequest,
) -> Result<MemoryApprovalOutcome, MemoryWorkflowError> {
    let workspace_path = resolve_registered_local_workspace(&state, &request.workspace_path)
        .await
        .map_err(|message| workflow_error(MemoryWorkflowErrorCode::Persistence, message, false))?;
    let proposal = match request.edited_content {
        Some(content) => revise_memory_proposal(request.proposal, content)?,
        None => request.proposal,
    };
    tauri::async_runtime::spawn_blocking(move || {
        AgentMemoryWorkflow::new(
            repository(),
            UnsupportedPersistentSessionSourceAdapter,
            UnsupportedAgentMemoryExtractor,
            MemoryCompletionTriggerConfig::default(),
        )
        .approve(&workspace_path, proposal, request.approved)
    })
    .await
    .map_err(|error| {
        workflow_error(
            MemoryWorkflowErrorCode::Persistence,
            format!("Memory approval task failed: {error}"),
            true,
        )
    })?
}

#[tauri::command]
pub async fn delete_agent_memory_confirmed(
    state: State<'_, AppState>,
    request: DeleteAgentMemoryConfirmedRequest,
) -> Result<(), MemoryWorkflowError> {
    let workspace_path = resolve_registered_local_workspace(&state, &request.workspace_path)
        .await
        .map_err(|message| workflow_error(MemoryWorkflowErrorCode::Persistence, message, false))?;
    tauri::async_runtime::spawn_blocking(move || {
        AgentMemoryWorkflow::new(
            repository(),
            UnsupportedPersistentSessionSourceAdapter,
            UnsupportedAgentMemoryExtractor,
            MemoryCompletionTriggerConfig::default(),
        )
        .delete_confirmed(
            &workspace_path,
            DeleteMemoryConfirmation {
                memory_id: request.memory_id,
                expected_revision: request.expected_revision,
                confirmation: request.confirmation,
            },
        )
    })
    .await
    .map_err(|error| {
        workflow_error(
            MemoryWorkflowErrorCode::Persistence,
            format!("Memory deletion task failed: {error}"),
            true,
        )
    })?
}
