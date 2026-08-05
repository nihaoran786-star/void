//! Desktop persistence adapter for reusable Team definitions.
//!
//! This module stores validated, runtime-independent Team definitions only.
//! It does not create Team instances or interact with the subagent runtime.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tokio::sync::Mutex;
use uuid::Uuid;
use void_core::agentic::fixed_team_definitions::{
    ai_short_drama_team_definition, AI_SHORT_DRAMA_TEAM_DEFINITION_ID,
};
use void_core::agentic::team_definitions::{
    materialize_team_definition, team_definition_revision, validate_team_definition,
    TeamDefinition, TeamDefinitionDraft, TeamDefinitionError, TeamDefinitionErrorCode,
    TeamDefinitionLevel, TeamDefinitionOrigin, TeamDefinitionRecord,
};
use void_core::infrastructure::{get_path_manager_arc, PathManager};
use void_core::service::remote_ssh::workspace_state::is_remote_path;

const TEAM_DEFINITION_FILE: &str = "team.json";
const MAX_TEAM_PACKAGE_BYTES: u64 = 1024 * 1024;
const AI_SHORT_DRAMA_TEAM_BUILTIN_PATH: &str = "builtin://ai-short-drama-team";

static TEAM_DEFINITION_MUTATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn mutation_lock() -> &'static Mutex<()> {
    TEAM_DEFINITION_MUTATION_LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTeamDefinitionsRequest {
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamDefinitionListStatus {
    Ready,
    Partial,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinitionDiagnostic {
    pub level: Option<TeamDefinitionLevel>,
    pub path: Option<String>,
    pub error: TeamDefinitionError,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinitionListResult {
    pub status: TeamDefinitionListStatus,
    pub records: Vec<TeamDefinitionRecord>,
    pub diagnostics: Vec<TeamDefinitionDiagnostic>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTeamDefinitionRequest {
    pub team_definition_id: String,
    pub level: TeamDefinitionLevel,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTeamDefinitionRequest {
    pub level: TeamDefinitionLevel,
    pub draft: TeamDefinitionDraft,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTeamDefinitionRequest {
    pub team_definition_id: String,
    pub level: TeamDefinitionLevel,
    pub expected_revision: String,
    pub definition: TeamDefinition,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallTeamDefinitionRequest {
    pub source_path: String,
    pub level: TeamDefinitionLevel,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTeamDefinitionRequest {
    pub team_definition_id: String,
    pub level: TeamDefinitionLevel,
    pub workspace_path: Option<String>,
}

fn error(code: TeamDefinitionErrorCode, message: impl Into<String>) -> TeamDefinitionError {
    TeamDefinitionError {
        code,
        message: message.into(),
        recovery_path: None,
    }
}

fn rollback_error(message: impl Into<String>, path: &Path) -> TeamDefinitionError {
    TeamDefinitionError {
        code: TeamDefinitionErrorCode::RollbackFailed,
        message: message.into(),
        recovery_path: Some(path.to_string_lossy().to_string()),
    }
}

fn trim_workspace_path(workspace_path: Option<&str>) -> Option<&str> {
    workspace_path
        .map(str::trim)
        .filter(|path| !path.is_empty())
}

fn has_custom_team_id_shape(team_definition_id: &str) -> bool {
    team_definition_id
        .strip_prefix("custom-")
        .is_some_and(|suffix| {
            suffix.len() == 32
                && suffix.chars().all(|character| {
                    character.is_ascii_hexdigit() && !character.is_ascii_uppercase()
                })
        })
}

fn validate_requested_team_id(team_definition_id: &str) -> Result<(), TeamDefinitionError> {
    if has_custom_team_id_shape(team_definition_id) {
        Ok(())
    } else {
        Err(error(
            TeamDefinitionErrorCode::ValidationFailed,
            "Team definition ID must be a generated custom UUID",
        ))
    }
}

async fn project_root_for_workspace(
    path_manager: &PathManager,
    workspace_path: Option<&str>,
) -> Result<PathBuf, TeamDefinitionError> {
    let workspace_path = trim_workspace_path(workspace_path).ok_or_else(|| {
        error(
            TeamDefinitionErrorCode::ValidationFailed,
            "Project-level Team definition requires an open workspace",
        )
    })?;
    if is_remote_path(workspace_path).await {
        return Err(error(
            TeamDefinitionErrorCode::UnsupportedRemoteProject,
            "Remote project Team definition management is not supported yet",
        ));
    }
    Ok(path_manager.project_team_definitions_dir(Path::new(workspace_path)))
}

async fn root_for_level(
    path_manager: &PathManager,
    level: TeamDefinitionLevel,
    workspace_path: Option<&str>,
) -> Result<PathBuf, TeamDefinitionError> {
    match level {
        TeamDefinitionLevel::User => Ok(path_manager.user_team_definitions_dir()),
        TeamDefinitionLevel::Project => {
            project_root_for_workspace(path_manager, workspace_path).await
        }
    }
}

fn definition_file(root: &Path, team_definition_id: &str) -> PathBuf {
    root.join(team_definition_id).join(TEAM_DEFINITION_FILE)
}

fn is_authorable(definition: &TeamDefinition, level: TeamDefinitionLevel) -> bool {
    matches!(
        (definition.origin, level),
        (TeamDefinitionOrigin::User, TeamDefinitionLevel::User)
            | (TeamDefinitionOrigin::Project, TeamDefinitionLevel::Project)
    )
}

fn validate_origin_for_level(
    definition: &TeamDefinition,
    level: TeamDefinitionLevel,
) -> Result<(), TeamDefinitionError> {
    if definition.origin == TeamDefinitionOrigin::Installed || is_authorable(definition, level) {
        return Ok(());
    }
    Err(error(
        TeamDefinitionErrorCode::ValidationFailed,
        "Team definition origin does not match its persistence level",
    ))
}

async fn load_record_from_file(
    file: &Path,
    level: TeamDefinitionLevel,
    expected_id: Option<&str>,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let content = tokio::fs::read(file).await.map_err(|read_error| {
        let code = if read_error.kind() == std::io::ErrorKind::NotFound {
            TeamDefinitionErrorCode::NotFound
        } else {
            TeamDefinitionErrorCode::ReadFailed
        };
        error(
            code,
            format!(
                "Failed to read Team definition '{}': {read_error}",
                file.display()
            ),
        )
    })?;
    let definition = serde_json::from_slice::<TeamDefinition>(&content).map_err(|parse_error| {
        error(
            TeamDefinitionErrorCode::ValidationFailed,
            format!(
                "Team definition '{}' is not valid JSON: {parse_error}",
                file.display()
            ),
        )
    })?;
    validate_team_definition(&definition)?;
    validate_origin_for_level(&definition, level)?;
    if expected_id.is_some_and(|expected| expected != definition.team_definition_id) {
        return Err(error(
            TeamDefinitionErrorCode::ValidationFailed,
            format!(
                "Team definition identity does not match its directory '{}'",
                file.display()
            ),
        ));
    }
    Ok(TeamDefinitionRecord {
        revision: team_definition_revision(&definition),
        is_authorable: is_authorable(&definition, level),
        definition,
        level,
        path: file.to_string_lossy().to_string(),
    })
}

async fn load_record(
    root: &Path,
    level: TeamDefinitionLevel,
    team_definition_id: &str,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    validate_requested_team_id(team_definition_id)?;
    load_record_from_file(
        &definition_file(root, team_definition_id),
        level,
        Some(team_definition_id),
    )
    .await
}

fn builtin_ai_short_drama_team_record() -> TeamDefinitionRecord {
    let definition = ai_short_drama_team_definition();
    TeamDefinitionRecord {
        revision: team_definition_revision(&definition),
        definition,
        level: TeamDefinitionLevel::User,
        path: AI_SHORT_DRAMA_TEAM_BUILTIN_PATH.to_string(),
        is_authorable: false,
    }
}

/// Resolve one runtime Team definition across the trusted user/project roots.
///
/// Runtime lookup has no implicit precedence: shadowing the same immutable ID
/// at two persistence levels is ambiguous and therefore rejected. Remote
/// callers pass no project workspace root and can only use the user catalog.
pub(crate) async fn load_unique_runtime_team_definition(
    path_manager: &PathManager,
    team_definition_id: &str,
    project_workspace_root: Option<&Path>,
) -> Result<Option<TeamDefinitionRecord>, TeamDefinitionError> {
    if team_definition_id == AI_SHORT_DRAMA_TEAM_DEFINITION_ID {
        return Ok(Some(builtin_ai_short_drama_team_record()));
    }
    let user_root = path_manager.user_team_definitions_dir();
    let project_root = project_workspace_root
        .map(|workspace_root| path_manager.project_team_definitions_dir(workspace_root));
    load_unique_runtime_team_definition_from_roots(
        &user_root,
        project_root.as_deref(),
        team_definition_id,
    )
    .await
}

async fn load_unique_runtime_team_definition_from_roots(
    user_root: &Path,
    project_root: Option<&Path>,
    team_definition_id: &str,
) -> Result<Option<TeamDefinitionRecord>, TeamDefinitionError> {
    let mut matches = Vec::new();
    let candidates = [
        Some((user_root.to_path_buf(), TeamDefinitionLevel::User)),
        project_root.map(|root| (root.to_path_buf(), TeamDefinitionLevel::Project)),
    ];

    for candidate in candidates.into_iter().flatten() {
        match load_record(&candidate.0, candidate.1, team_definition_id).await {
            Ok(record) => matches.push(record),
            Err(record_error) if record_error.code == TeamDefinitionErrorCode::NotFound => {}
            Err(record_error) => return Err(record_error),
        }
    }

    match matches.len() {
        0 => Ok(None),
        1 => Ok(matches.pop()),
        _ => Err(error(
            TeamDefinitionErrorCode::ValidationFailed,
            format!(
                "Team definition '{team_definition_id}' exists at both user and project levels"
            ),
        )),
    }
}

async fn list_records_at_root(
    root: &Path,
    level: TeamDefinitionLevel,
) -> Result<(Vec<TeamDefinitionRecord>, Vec<TeamDefinitionDiagnostic>), TeamDefinitionError> {
    let mut entries = match tokio::fs::read_dir(root).await {
        Ok(entries) => entries,
        Err(read_error) if read_error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((Vec::new(), Vec::new()));
        }
        Err(read_error) => {
            return Err(error(
                TeamDefinitionErrorCode::ReadFailed,
                format!(
                    "Failed to list Team definition root '{}': {read_error}",
                    root.display()
                ),
            ));
        }
    };
    let mut records = Vec::new();
    let mut diagnostics = Vec::new();
    loop {
        let entry = match entries.next_entry().await {
            Ok(Some(entry)) => entry,
            Ok(None) => break,
            Err(read_error) => {
                diagnostics.push(TeamDefinitionDiagnostic {
                    level: Some(level),
                    path: Some(root.to_string_lossy().to_string()),
                    error: error(
                        TeamDefinitionErrorCode::ReadFailed,
                        format!(
                            "Failed while scanning Team definition root '{}': {read_error}",
                            root.display()
                        ),
                    ),
                });
                break;
            }
        };
        let file_type = match entry.file_type().await {
            Ok(file_type) => file_type,
            Err(read_error) => {
                diagnostics.push(TeamDefinitionDiagnostic {
                    level: Some(level),
                    path: Some(entry.path().to_string_lossy().to_string()),
                    error: error(
                        TeamDefinitionErrorCode::ReadFailed,
                        format!("Failed to inspect Team definition entry: {read_error}"),
                    ),
                });
                continue;
            }
        };
        if !file_type.is_dir() {
            continue;
        }
        let directory_name = entry.file_name().to_string_lossy().to_string();
        if directory_name.starts_with('.') {
            continue;
        }
        if let Err(identity_error) = validate_requested_team_id(&directory_name) {
            diagnostics.push(TeamDefinitionDiagnostic {
                level: Some(level),
                path: Some(entry.path().to_string_lossy().to_string()),
                error: identity_error,
            });
            continue;
        }
        let file = entry.path().join(TEAM_DEFINITION_FILE);
        match load_record_from_file(&file, level, Some(&directory_name)).await {
            Ok(record) => records.push(record),
            Err(record_error) => diagnostics.push(TeamDefinitionDiagnostic {
                level: Some(level),
                path: Some(file.to_string_lossy().to_string()),
                error: record_error,
            }),
        }
    }
    Ok((records, diagnostics))
}

fn serialize_definition(definition: &TeamDefinition) -> Result<Vec<u8>, TeamDefinitionError> {
    let mut document = serde_json::to_vec_pretty(definition).map_err(|serialize_error| {
        error(
            TeamDefinitionErrorCode::ValidationFailed,
            format!("Failed to serialize Team definition: {serialize_error}"),
        )
    })?;
    document.push(b'\n');
    Ok(document)
}

async fn cleanup_directory(path: &Path) -> Result<(), TeamDefinitionError> {
    match tokio::fs::remove_dir_all(path).await {
        Ok(()) => Ok(()),
        Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(cleanup_error) => Err(rollback_error(
            format!(
                "Failed to clean staged Team definition '{}': {cleanup_error}",
                path.display()
            ),
            path,
        )),
    }
}

async fn stage_definition_directory(
    root: &Path,
    level: TeamDefinitionLevel,
    definition: &TeamDefinition,
) -> Result<PathBuf, TeamDefinitionError> {
    tokio::fs::create_dir_all(root)
        .await
        .map_err(|write_error| {
            error(
                TeamDefinitionErrorCode::WriteFailed,
                format!(
                    "Failed to create Team definition root '{}': {write_error}",
                    root.display()
                ),
            )
        })?;
    let document = serialize_definition(definition)?;
    let staging = root.join(format!(
        ".{}.{}.tmp",
        definition.team_definition_id,
        Uuid::new_v4().simple()
    ));
    tokio::fs::create_dir(&staging)
        .await
        .map_err(|write_error| {
            error(
                TeamDefinitionErrorCode::WriteFailed,
                format!(
                    "Failed to create staged Team definition '{}': {write_error}",
                    staging.display()
                ),
            )
        })?;
    let staged_file = staging.join(TEAM_DEFINITION_FILE);
    if let Err(write_error) = tokio::fs::write(&staged_file, document).await {
        if let Err(cleanup_error) = cleanup_directory(&staging).await {
            return Err(rollback_error(
                format!(
                    "Staged Team definition write failed and cleanup failed: original_error={write_error}; cleanup_error={}",
                    cleanup_error.message
                ),
                &staging,
            ));
        }
        return Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            format!("Failed to write staged Team definition: {write_error}"),
        ));
    }
    if let Err(validation_error) = load_record_from_file(&staged_file, level, None).await {
        if let Err(cleanup_error) = cleanup_directory(&staging).await {
            return Err(rollback_error(
                format!(
                    "Staged Team definition validation failed and cleanup failed: original_error={}; cleanup_error={}",
                    validation_error.message, cleanup_error.message
                ),
                &staging,
            ));
        }
        return Err(validation_error);
    }
    Ok(staging)
}

async fn activate_staged_definition(
    root: &Path,
    level: TeamDefinitionLevel,
    definition: &TeamDefinition,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let final_directory = root.join(&definition.team_definition_id);
    let exists = tokio::fs::try_exists(&final_directory)
        .await
        .map_err(|read_error| {
            error(
                TeamDefinitionErrorCode::ReadFailed,
                format!("Failed to inspect Team definition target: {read_error}"),
            )
        })?;
    if exists {
        return Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            format!(
                "Team definition '{}' already exists",
                definition.team_definition_id
            ),
        ));
    }
    let staging = stage_definition_directory(root, level, definition).await?;
    if let Err(write_error) = tokio::fs::rename(&staging, &final_directory).await {
        if let Err(cleanup_error) = cleanup_directory(&staging).await {
            return Err(rollback_error(
                format!(
                    "Team definition activation failed and cleanup failed: original_error={write_error}; cleanup_error={}",
                    cleanup_error.message
                ),
                &staging,
            ));
        }
        return Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            format!("Failed to activate Team definition: {write_error}"),
        ));
    }
    match load_record(root, level, &definition.team_definition_id).await {
        Ok(record) => Ok(record),
        Err(load_error) => {
            if let Err(cleanup_error) = cleanup_directory(&final_directory).await {
                return Err(rollback_error(
                    format!(
                        "Activated Team definition failed validation and rollback failed: original_error={}; cleanup_error={}",
                        load_error.message, cleanup_error.message
                    ),
                    &final_directory,
                ));
            }
            Err(load_error)
        }
    }
}

async fn replace_definition_with_backup(
    target: &Path,
    document: &[u8],
) -> Result<PathBuf, TeamDefinitionError> {
    let parent = target.parent().ok_or_else(|| {
        error(
            TeamDefinitionErrorCode::WriteFailed,
            "Team definition file has no parent directory",
        )
    })?;
    let nonce = Uuid::new_v4().simple();
    let temporary = parent.join(format!(".team.{nonce}.tmp"));
    let backup = parent.join(format!(".team.{nonce}.bak"));
    if let Err(write_error) = tokio::fs::write(&temporary, document).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            format!("Failed to write staged Team definition update: {write_error}"),
        ));
    }
    if let Err(replace_error) = atomic_replace_definition(target, &temporary, &backup).await {
        if let Err(cleanup_error) = tokio::fs::remove_file(&temporary).await {
            if cleanup_error.kind() != std::io::ErrorKind::NotFound {
                return Err(rollback_error(
                    format!(
                        "Atomic Team definition replacement failed and staged file cleanup failed: original_error={replace_error}; cleanup_error={cleanup_error}"
                    ),
                    &temporary,
                ));
            }
        }
        return Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            format!("Failed to atomically replace Team definition: {replace_error}"),
        ));
    }
    Ok(backup)
}

#[cfg(windows)]
async fn atomic_replace_definition(
    target: &Path,
    replacement: &Path,
    backup: &Path,
) -> Result<(), String> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_WRITE_THROUGH};

    let target = target.to_path_buf();
    let replacement = replacement.to_path_buf();
    let backup = backup.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let target_wide = target
            .as_os_str()
            .encode_wide()
            .chain(once(0))
            .collect::<Vec<_>>();
        let replacement_wide = replacement
            .as_os_str()
            .encode_wide()
            .chain(once(0))
            .collect::<Vec<_>>();
        let backup_wide = backup
            .as_os_str()
            .encode_wide()
            .chain(once(0))
            .collect::<Vec<_>>();
        unsafe {
            ReplaceFileW(
                PCWSTR::from_raw(target_wide.as_ptr()),
                PCWSTR::from_raw(replacement_wide.as_ptr()),
                PCWSTR::from_raw(backup_wide.as_ptr()),
                REPLACEFILE_WRITE_THROUGH,
                None,
                None,
            )
        }
        .map_err(|replace_error| replace_error.to_string())
    })
    .await
    .map_err(|join_error| format!("Atomic replacement task failed: {join_error}"))?
}

#[cfg(not(windows))]
async fn atomic_replace_definition(
    target: &Path,
    replacement: &Path,
    backup: &Path,
) -> Result<(), String> {
    tokio::fs::copy(target, backup)
        .await
        .map_err(|copy_error| format!("Failed to create Team definition backup: {copy_error}"))?;
    tokio::fs::rename(replacement, target)
        .await
        .map_err(|rename_error| {
            format!("Failed to activate Team definition replacement: {rename_error}")
        })?;
    Ok(())
}

async fn restore_definition(
    target: &Path,
    backup: &Path,
    level: TeamDefinitionLevel,
    expected_revision: &str,
) -> Result<(), TeamDefinitionError> {
    match tokio::fs::remove_file(target).await {
        Ok(()) => {}
        Err(remove_error) if remove_error.kind() == std::io::ErrorKind::NotFound => {}
        Err(remove_error) => {
            return Err(rollback_error(
                format!(
                    "Could not remove failed Team definition update '{}': {remove_error}",
                    target.display()
                ),
                backup,
            ));
        }
    }
    tokio::fs::rename(backup, target)
        .await
        .map_err(|restore_error| {
            rollback_error(
                format!(
                    "Could not restore Team definition '{}': {restore_error}",
                    target.display()
                ),
                backup,
            )
        })?;
    let restored = load_record_from_file(target, level, None)
        .await
        .map_err(|restore_error| {
            rollback_error(
                format!(
                    "Restored Team definition could not be validated: {}",
                    restore_error.message
                ),
                target,
            )
        })?;
    if restored.revision != expected_revision {
        return Err(rollback_error(
            format!(
                "Restored Team definition revision mismatch for '{}'",
                target.display()
            ),
            target,
        ));
    }
    Ok(())
}

async fn create_at_root(
    root: &Path,
    level: TeamDefinitionLevel,
    draft: TeamDefinitionDraft,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let definition = materialize_team_definition(draft, level)?;
    activate_staged_definition(root, level, &definition).await
}

async fn update_at_root(
    root: &Path,
    request: UpdateTeamDefinitionRequest,
    inject_post_replace_failure: bool,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    validate_requested_team_id(&request.team_definition_id)?;
    let current = load_record(root, request.level, &request.team_definition_id).await?;
    if !current.is_authorable {
        return Err(error(
            TeamDefinitionErrorCode::NotAuthorable,
            "Installed Team definitions are read-only; duplicate one before editing",
        ));
    }
    if current.revision != request.expected_revision {
        return Err(error(
            TeamDefinitionErrorCode::RevisionConflict,
            "Team definition changed after it was opened. Reload before saving.",
        ));
    }
    if request.definition.team_definition_id != current.definition.team_definition_id
        || request.definition.schema_version != current.definition.schema_version
        || request.definition.origin != current.definition.origin
    {
        return Err(error(
            TeamDefinitionErrorCode::NotAuthorable,
            "Team definition identity, schema, and origin are immutable",
        ));
    }
    validate_team_definition(&request.definition)?;
    validate_origin_for_level(&request.definition, request.level)?;
    let target = definition_file(root, &request.team_definition_id);
    let document = serialize_definition(&request.definition)?;
    let backup = replace_definition_with_backup(&target, &document).await?;

    let verification = if inject_post_replace_failure {
        Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            "Injected post-replacement verification failure",
        ))
    } else {
        load_record(root, request.level, &request.team_definition_id).await
    };
    let updated = match verification {
        Ok(updated) => updated,
        Err(verification_error) => {
            restore_definition(&target, &backup, request.level, &current.revision).await?;
            return Err(verification_error);
        }
    };
    if let Err(cleanup_error) = tokio::fs::remove_file(&backup).await {
        log::warn!(
            "Updated Team definition was saved but backup cleanup failed: path={}, error={}",
            backup.display(),
            cleanup_error
        );
    }
    Ok(updated)
}

async fn install_at_root(
    root: &Path,
    level: TeamDefinitionLevel,
    source_path: &Path,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let metadata = tokio::fs::metadata(source_path)
        .await
        .map_err(|read_error| {
            error(
                TeamDefinitionErrorCode::ReadFailed,
                format!(
                    "Failed to inspect Team package '{}': {read_error}",
                    source_path.display()
                ),
            )
        })?;
    if !metadata.is_file() {
        return Err(error(
            TeamDefinitionErrorCode::ValidationFailed,
            "Team package source must be a regular file",
        ));
    }
    if metadata.len() > MAX_TEAM_PACKAGE_BYTES {
        return Err(error(
            TeamDefinitionErrorCode::ValidationFailed,
            format!(
                "Team package exceeds the {} byte limit",
                MAX_TEAM_PACKAGE_BYTES
            ),
        ));
    }
    let content = tokio::fs::read(source_path).await.map_err(|read_error| {
        error(
            TeamDefinitionErrorCode::ReadFailed,
            format!(
                "Failed to read Team package '{}': {read_error}",
                source_path.display()
            ),
        )
    })?;
    if content.len() as u64 > MAX_TEAM_PACKAGE_BYTES {
        return Err(error(
            TeamDefinitionErrorCode::ValidationFailed,
            format!(
                "Team package exceeds the {} byte limit",
                MAX_TEAM_PACKAGE_BYTES
            ),
        ));
    }
    let mut definition =
        serde_json::from_slice::<TeamDefinition>(&content).map_err(|parse_error| {
            error(
                TeamDefinitionErrorCode::ValidationFailed,
                format!("Team package is not valid JSON: {parse_error}"),
            )
        })?;
    definition.origin = TeamDefinitionOrigin::Installed;
    validate_team_definition(&definition)?;
    activate_staged_definition(root, level, &definition).await
}

async fn delete_at_root(
    root: &Path,
    level: TeamDefinitionLevel,
    team_definition_id: &str,
) -> Result<(), TeamDefinitionError> {
    let _record = load_record(root, level, team_definition_id).await?;
    let directory = root.join(team_definition_id);
    let tombstone = root.join(format!(
        ".deleted-{team_definition_id}-{}",
        Uuid::new_v4().simple()
    ));
    tokio::fs::rename(&directory, &tombstone)
        .await
        .map_err(|write_error| {
            error(
                TeamDefinitionErrorCode::WriteFailed,
                format!("Failed to stage Team definition removal: {write_error}"),
            )
        })?;
    if let Err(remove_error) = tokio::fs::remove_dir_all(&tombstone).await {
        if let Err(restore_error) = tokio::fs::rename(&tombstone, &directory).await {
            return Err(rollback_error(
                format!(
                    "Team definition removal failed and rollback failed: original_error={remove_error}; rollback_error={restore_error}"
                ),
                &tombstone,
            ));
        }
        return Err(error(
            TeamDefinitionErrorCode::WriteFailed,
            format!("Team definition removal failed and was restored: {remove_error}"),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_team_definitions(
    request: ListTeamDefinitionsRequest,
) -> Result<TeamDefinitionListResult, TeamDefinitionError> {
    let path_manager = get_path_manager_arc();
    let (mut records, mut diagnostics) = list_records_at_root(
        &path_manager.user_team_definitions_dir(),
        TeamDefinitionLevel::User,
    )
    .await?;

    if let Some(workspace_path) = trim_workspace_path(request.workspace_path.as_deref()) {
        match project_root_for_workspace(&path_manager, Some(workspace_path)).await {
            Ok(project_root) => {
                match list_records_at_root(&project_root, TeamDefinitionLevel::Project).await {
                    Ok((project_records, project_diagnostics)) => {
                        records.extend(project_records);
                        diagnostics.extend(project_diagnostics);
                    }
                    Err(project_error) => diagnostics.push(TeamDefinitionDiagnostic {
                        level: Some(TeamDefinitionLevel::Project),
                        path: Some(project_root.to_string_lossy().to_string()),
                        error: project_error,
                    }),
                }
            }
            Err(project_error)
                if project_error.code == TeamDefinitionErrorCode::UnsupportedRemoteProject =>
            {
                diagnostics.push(TeamDefinitionDiagnostic {
                    level: Some(TeamDefinitionLevel::Project),
                    path: Some(workspace_path.to_string()),
                    error: project_error,
                });
            }
            Err(project_error) => return Err(project_error),
        }
    }
    records.push(builtin_ai_short_drama_team_record());
    records.sort_by(|left, right| {
        left.definition
            .display_name
            .cmp(&right.definition.display_name)
            .then_with(|| {
                left.definition
                    .team_definition_id
                    .cmp(&right.definition.team_definition_id)
            })
    });
    Ok(TeamDefinitionListResult {
        status: if diagnostics.is_empty() {
            TeamDefinitionListStatus::Ready
        } else {
            TeamDefinitionListStatus::Partial
        },
        records,
        diagnostics,
    })
}

#[tauri::command]
pub async fn get_team_definition(
    request: GetTeamDefinitionRequest,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    if request.team_definition_id == AI_SHORT_DRAMA_TEAM_DEFINITION_ID {
        return Ok(builtin_ai_short_drama_team_record());
    }
    let path_manager = get_path_manager_arc();
    let root = root_for_level(
        &path_manager,
        request.level,
        request.workspace_path.as_deref(),
    )
    .await?;
    load_record(&root, request.level, &request.team_definition_id).await
}

#[tauri::command]
pub async fn create_team_definition(
    request: CreateTeamDefinitionRequest,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let _guard = mutation_lock().lock().await;
    let path_manager = get_path_manager_arc();
    let root = root_for_level(
        &path_manager,
        request.level,
        request.workspace_path.as_deref(),
    )
    .await?;
    create_at_root(&root, request.level, request.draft).await
}

#[tauri::command]
pub async fn update_team_definition(
    request: UpdateTeamDefinitionRequest,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let _guard = mutation_lock().lock().await;
    let path_manager = get_path_manager_arc();
    let root = root_for_level(
        &path_manager,
        request.level,
        request.workspace_path.as_deref(),
    )
    .await?;
    update_at_root(&root, request, false).await
}

#[tauri::command]
pub async fn install_team_definition(
    request: InstallTeamDefinitionRequest,
) -> Result<TeamDefinitionRecord, TeamDefinitionError> {
    let _guard = mutation_lock().lock().await;
    let path_manager = get_path_manager_arc();
    let root = root_for_level(
        &path_manager,
        request.level,
        request.workspace_path.as_deref(),
    )
    .await?;
    install_at_root(&root, request.level, Path::new(&request.source_path)).await
}

#[tauri::command]
pub async fn delete_team_definition(
    request: DeleteTeamDefinitionRequest,
) -> Result<(), TeamDefinitionError> {
    let _guard = mutation_lock().lock().await;
    let path_manager = get_path_manager_arc();
    let root = root_for_level(
        &path_manager,
        request.level,
        request.workspace_path.as_deref(),
    )
    .await?;
    delete_at_root(&root, request.level, &request.team_definition_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use void_core::agentic::team_definitions::{
        TeamMemberDraft, TeamMemberRole, TeamScenario, TeamWorkflowDraft, TeamWorkflowPhaseDraft,
        TeamWorkflowPhaseKind,
    };

    #[test]
    fn builtin_short_drama_team_is_readonly_and_runtime_addressable() {
        let record = builtin_ai_short_drama_team_record();
        assert_eq!(
            record.definition.team_definition_id,
            AI_SHORT_DRAMA_TEAM_DEFINITION_ID
        );
        assert_eq!(record.path, AI_SHORT_DRAMA_TEAM_BUILTIN_PATH);
        assert!(!record.is_authorable);
        assert!(!record.revision.is_empty());
    }

    fn test_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "void-team-definition-{label}-{}",
            Uuid::new_v4().simple()
        ))
    }

    fn valid_draft(name: &str) -> TeamDefinitionDraft {
        TeamDefinitionDraft {
            display_name: name.to_string(),
            description: "由主理人与专业成员协作完成稳定交付。".to_string(),
            emblem: None,
            accent: None,
            category: "技术工程".to_string(),
            capability_tags: vec!["软件交付".to_string()],
            scenario_eligibility: vec![TeamScenario::Code],
            lead_member_key: "lead".to_string(),
            members: vec![
                TeamMemberDraft {
                    client_key: "lead".to_string(),
                    display_name: "技术负责人".to_string(),
                    professional_role: "交付主理人".to_string(),
                    role: TeamMemberRole::Lead,
                    instructions: "协调成员并汇总结论。".to_string(),
                    output_responsibility: "交付最终方案。".to_string(),
                    agent_id: Some("agentic".to_string()),
                    allowed_skill_keys: Vec::new(),
                    allowed_tool_names: Vec::new(),
                    is_readonly: false,
                },
                TeamMemberDraft {
                    client_key: "developer".to_string(),
                    display_name: "开发工程师".to_string(),
                    professional_role: "实现专家".to_string(),
                    role: TeamMemberRole::Specialist,
                    instructions: "独立完成实现分析。".to_string(),
                    output_responsibility: "提交实现产物。".to_string(),
                    agent_id: Some("code_researcher".to_string()),
                    allowed_skill_keys: Vec::new(),
                    allowed_tool_names: Vec::new(),
                    is_readonly: false,
                },
            ],
            workflows: vec![TeamWorkflowDraft {
                client_key: "delivery".to_string(),
                display_name: "软件交付".to_string(),
                trigger_description: "需要完成软件功能时使用。".to_string(),
                phases: vec![TeamWorkflowPhaseDraft {
                    client_key: "implementation".to_string(),
                    display_name: "实现".to_string(),
                    kind: TeamWorkflowPhaseKind::Serial,
                    depends_on_phase_keys: Vec::new(),
                    assigned_member_keys: vec!["developer".to_string()],
                    expected_outputs: vec!["实现产物".to_string()],
                    completion_rule: "开发工程师返回可验证产物。".to_string(),
                }],
            }],
        }
    }

    async fn remove_test_roots(roots: &[&Path]) {
        for root in roots {
            let _ = tokio::fs::remove_dir_all(root).await;
        }
    }

    #[tokio::test]
    async fn keeps_user_and_project_definitions_isolated() {
        let user_root = test_root("user");
        let project_root = test_root("project");
        create_at_root(
            &user_root,
            TeamDefinitionLevel::User,
            valid_draft("用户团队"),
        )
        .await
        .expect("create user team");
        create_at_root(
            &project_root,
            TeamDefinitionLevel::Project,
            valid_draft("项目团队"),
        )
        .await
        .expect("create project team");

        let (user_records, user_diagnostics) =
            list_records_at_root(&user_root, TeamDefinitionLevel::User)
                .await
                .expect("list user teams");
        let (project_records, project_diagnostics) =
            list_records_at_root(&project_root, TeamDefinitionLevel::Project)
                .await
                .expect("list project teams");
        assert_eq!(user_records.len(), 1);
        assert_eq!(user_records[0].definition.display_name, "用户团队");
        assert_eq!(project_records.len(), 1);
        assert_eq!(project_records[0].definition.display_name, "项目团队");
        assert!(user_diagnostics.is_empty());
        assert!(project_diagnostics.is_empty());

        remove_test_roots(&[&user_root, &project_root]).await;
    }

    #[tokio::test]
    async fn runtime_loader_uses_user_definitions_without_a_local_project_root() {
        let user_root = test_root("runtime-user-root");
        let record = create_at_root(
            &user_root,
            TeamDefinitionLevel::User,
            valid_draft("远程可用用户团队"),
        )
        .await
        .expect("user definition should create");

        let loaded = load_unique_runtime_team_definition_from_roots(
            &user_root,
            None,
            &record.definition.team_definition_id,
        )
        .await
        .expect("runtime lookup should succeed")
        .expect("user definition should be found");

        assert_eq!(loaded.level, TeamDefinitionLevel::User);
        assert_eq!(loaded.revision, record.revision);
        remove_test_roots(&[&user_root]).await;
    }

    #[tokio::test]
    async fn runtime_loader_rejects_duplicate_user_and_project_identity() {
        let user_root = test_root("runtime-duplicate-user");
        let project_root = test_root("runtime-duplicate-project");
        let user_record = create_at_root(
            &user_root,
            TeamDefinitionLevel::User,
            valid_draft("重复团队"),
        )
        .await
        .expect("user definition should create");
        let mut project_definition = user_record.definition.clone();
        project_definition.origin = TeamDefinitionOrigin::Project;
        activate_staged_definition(
            &project_root,
            TeamDefinitionLevel::Project,
            &project_definition,
        )
        .await
        .expect("project duplicate should create for ambiguity test");

        let duplicate_error = load_unique_runtime_team_definition_from_roots(
            &user_root,
            Some(&project_root),
            &user_record.definition.team_definition_id,
        )
        .await
        .expect_err("cross-level duplicate must fail closed");

        assert_eq!(
            duplicate_error.code,
            TeamDefinitionErrorCode::ValidationFailed
        );
        remove_test_roots(&[&user_root, &project_root]).await;
    }

    #[tokio::test]
    async fn rejects_stale_revision_updates() {
        let root = test_root("revision");
        let record = create_at_root(&root, TeamDefinitionLevel::User, valid_draft("并发团队"))
            .await
            .expect("create team");
        let result = update_at_root(
            &root,
            UpdateTeamDefinitionRequest {
                team_definition_id: record.definition.team_definition_id.clone(),
                level: TeamDefinitionLevel::User,
                expected_revision: "stale".to_string(),
                definition: record.definition,
                workspace_path: None,
            },
            false,
        )
        .await;
        assert_eq!(
            result.expect_err("stale update must fail").code,
            TeamDefinitionErrorCode::RevisionConflict
        );
        remove_test_roots(&[&root]).await;
    }

    #[tokio::test]
    async fn installed_definitions_are_readonly() {
        let source_root = test_root("package-source");
        let target_root = test_root("package-target");
        tokio::fs::create_dir_all(&source_root)
            .await
            .expect("create source");
        let package =
            materialize_team_definition(valid_draft("安装团队"), TeamDefinitionLevel::User)
                .expect("materialize package");
        let source_path = source_root.join("team.void-team.json");
        tokio::fs::write(
            &source_path,
            serialize_definition(&package).expect("serialize package"),
        )
        .await
        .expect("write package");
        let installed = install_at_root(&target_root, TeamDefinitionLevel::User, &source_path)
            .await
            .expect("install package");
        assert!(!installed.is_authorable);
        assert_eq!(installed.definition.origin, TeamDefinitionOrigin::Installed);

        let result = update_at_root(
            &target_root,
            UpdateTeamDefinitionRequest {
                team_definition_id: installed.definition.team_definition_id.clone(),
                level: TeamDefinitionLevel::User,
                expected_revision: installed.revision,
                definition: installed.definition,
                workspace_path: None,
            },
            false,
        )
        .await;
        assert_eq!(
            result.expect_err("installed Team is readonly").code,
            TeamDefinitionErrorCode::NotAuthorable
        );
        remove_test_roots(&[&source_root, &target_root]).await;
    }

    #[tokio::test]
    async fn installed_definitions_without_agent_references_are_rejected() {
        let source_root = test_root("missing-agent-package-source");
        let target_root = test_root("missing-agent-package-target");
        tokio::fs::create_dir_all(&source_root)
            .await
            .expect("create source");
        let mut package =
            materialize_team_definition(valid_draft("无效安装团队"), TeamDefinitionLevel::User)
                .expect("materialize package");
        package.members[0].agent_id = None;
        let source_path = source_root.join("team.void-team.json");
        tokio::fs::write(
            &source_path,
            serialize_definition(&package).expect("serialize package"),
        )
        .await
        .expect("write package");

        let error = install_at_root(&target_root, TeamDefinitionLevel::User, &source_path)
            .await
            .expect_err("missing Agent ID must fail closed");
        assert_eq!(error.code, TeamDefinitionErrorCode::ValidationFailed);
        assert!(error.message.contains("non-empty Agent ID"));
        assert!(!tokio::fs::try_exists(&target_root)
            .await
            .expect("inspect target root"));
        remove_test_roots(&[&source_root, &target_root]).await;
    }

    #[tokio::test]
    async fn update_failure_restores_exact_previous_revision() {
        let root = test_root("restore");
        let record = create_at_root(&root, TeamDefinitionLevel::User, valid_draft("可恢复团队"))
            .await
            .expect("create team");
        let mut updated_definition = record.definition.clone();
        updated_definition.description = "这次更新将在验证阶段触发故障。".to_string();
        let result = update_at_root(
            &root,
            UpdateTeamDefinitionRequest {
                team_definition_id: record.definition.team_definition_id.clone(),
                level: TeamDefinitionLevel::User,
                expected_revision: record.revision.clone(),
                definition: updated_definition,
                workspace_path: None,
            },
            true,
        )
        .await;
        assert_eq!(
            result.expect_err("injected failure must surface").code,
            TeamDefinitionErrorCode::WriteFailed
        );
        let restored = load_record(
            &root,
            TeamDefinitionLevel::User,
            &record.definition.team_definition_id,
        )
        .await
        .expect("load restored team");
        assert_eq!(restored.revision, record.revision);
        assert_eq!(restored.definition, record.definition);
        remove_test_roots(&[&root]).await;
    }

    #[tokio::test]
    async fn corrupt_definition_produces_partial_diagnostic_without_hiding_valid_records() {
        let root = test_root("partial");
        create_at_root(&root, TeamDefinitionLevel::User, valid_draft("有效团队"))
            .await
            .expect("create valid team");
        let corrupt_id = format!("custom-{}", Uuid::new_v4().simple());
        let corrupt_directory = root.join(corrupt_id);
        tokio::fs::create_dir_all(&corrupt_directory)
            .await
            .expect("create corrupt directory");
        tokio::fs::write(corrupt_directory.join(TEAM_DEFINITION_FILE), b"{not-json")
            .await
            .expect("write corrupt definition");

        let (records, diagnostics) = list_records_at_root(&root, TeamDefinitionLevel::User)
            .await
            .expect("list teams");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].definition.display_name, "有效团队");
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].error.code,
            TeamDefinitionErrorCode::ValidationFailed
        );
        remove_test_roots(&[&root]).await;
    }

    #[tokio::test]
    async fn oversized_team_package_is_rejected_before_parsing() {
        let source_root = test_root("oversized-package-source");
        let target_root = test_root("oversized-package-target");
        tokio::fs::create_dir_all(&source_root)
            .await
            .expect("create package source");
        let source_path = source_root.join("oversized.void-team.json");
        tokio::fs::write(
            &source_path,
            vec![b' '; MAX_TEAM_PACKAGE_BYTES as usize + 1],
        )
        .await
        .expect("write oversized package");

        let result = install_at_root(&target_root, TeamDefinitionLevel::User, &source_path).await;
        assert_eq!(
            result.expect_err("oversized package must fail").code,
            TeamDefinitionErrorCode::ValidationFailed
        );
        assert!(!tokio::fs::try_exists(&target_root)
            .await
            .expect("inspect target root"));
        remove_test_roots(&[&source_root, &target_root]).await;
    }
}
