//! Typed desktop adapter for consent-gated workspace memory.

use serde::Deserialize;
use std::path::PathBuf;
use tauri::State;
use void_core::infrastructure::app_paths::get_path_manager_arc;
use void_core::service::agent_memory::consent::AgentMemoryCandidate;
use void_core::service::agent_memory::{
    AgentMemoryService, FileAgentMemoryRepository, MemoryCandidateBatch, StoredAgentMemory,
};
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

fn service() -> AgentMemoryService<FileAgentMemoryRepository> {
    AgentMemoryService::new(FileAgentMemoryRepository::new(get_path_manager_arc()))
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
