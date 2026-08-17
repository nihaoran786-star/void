//! File-backed adapter for the Team runtime persistence port.

use super::super::team_runtime::{TeamWorkspaceBackend, TeamWorkspaceIdentity};
use super::super::team_runtime_store::{
    TeamRuntimeDiagnostic, TeamRuntimeDiagnosticCode, TeamRuntimeList, TeamRuntimeRecord,
    TeamRuntimeSnapshot, TeamRuntimeStore, TeamRuntimeStoreError, TeamRuntimeStoreErrorCode,
    TEAM_RUNTIME_STORE_SCHEMA_VERSION,
};
use crate::infrastructure::PathManager;
use async_trait::async_trait;
use fs2::FileExt;
use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const MAX_RECORD_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone)]
pub struct FileTeamRuntimeStore {
    path_manager: Arc<PathManager>,
    workspace_root: PathBuf,
    workspace_identity: TeamWorkspaceIdentity,
}

impl FileTeamRuntimeStore {
    pub fn new(
        path_manager: Arc<PathManager>,
        workspace_root: PathBuf,
        workspace_identity: TeamWorkspaceIdentity,
    ) -> Result<Self, TeamRuntimeStoreError> {
        workspace_identity.validate().map_err(|error| {
            TeamRuntimeStoreError::new(
                TeamRuntimeStoreErrorCode::InvalidSnapshot,
                format!("invalid bound workspace identity: {error}"),
                false,
            )
        })?;
        Ok(Self {
            path_manager,
            workspace_root,
            workspace_identity,
        })
    }

    fn sessions_root(&self) -> PathBuf {
        if self.workspace_identity.backend == TeamWorkspaceBackend::Remote
            && self
                .workspace_root
                .starts_with(PathManager::remote_ssh_mirror_root())
        {
            return self.workspace_root.clone();
        }
        self.path_manager.project_sessions_dir(&self.workspace_root)
    }

    fn runtime_dir(&self, parent_session_id: &str) -> PathBuf {
        self.sessions_root()
            .join(parent_session_id)
            .join("team-runtime")
    }

    fn record_path(&self, parent_session_id: &str, team_instance_id: &str) -> PathBuf {
        self.runtime_dir(parent_session_id)
            .join(format!("{team_instance_id}.json"))
    }

    fn lock_path(&self, parent_session_id: &str, team_instance_id: &str) -> PathBuf {
        self.runtime_dir(parent_session_id)
            .join(format!("{team_instance_id}.lock"))
    }

    fn recovery_path(&self, parent_session_id: &str, team_instance_id: &str) -> PathBuf {
        self.runtime_dir(parent_session_id)
            .join(format!("{team_instance_id}.json.recovery"))
    }

    fn validate_snapshot_scope(
        &self,
        snapshot: &TeamRuntimeSnapshot,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> Result<(), TeamRuntimeStoreError> {
        let instance = &snapshot.instance;
        if instance.workspace != self.workspace_identity {
            return Err(scope_error(format!(
                "snapshot workspace identity does not match the store binding for Team instance '{team_instance_id}'"
            )));
        }
        if instance.parent_session_id != parent_session_id {
            return Err(scope_error(format!(
                "snapshot parent session '{}' does not match requested parent session '{parent_session_id}'",
                instance.parent_session_id
            )));
        }
        if instance.team_instance_id != team_instance_id {
            return Err(scope_error(format!(
                "snapshot Team instance '{}' does not match requested Team instance '{team_instance_id}'",
                instance.team_instance_id
            )));
        }
        Ok(())
    }
}

#[async_trait]
impl TeamRuntimeStore for FileTeamRuntimeStore {
    async fn list(
        &self,
        parent_session_id: &str,
    ) -> Result<TeamRuntimeList, TeamRuntimeStoreError> {
        validate_storage_identifier("parentSessionId", parent_session_id)?;

        let store = self.clone();
        let parent_session_id = parent_session_id.to_string();
        tokio::task::spawn_blocking(move || store.list_blocking(&parent_session_id))
            .await
            .map_err(task_join_error)?
    }

    async fn load(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> Result<Option<TeamRuntimeRecord>, TeamRuntimeStoreError> {
        validate_storage_identifier("parentSessionId", parent_session_id)?;
        validate_storage_identifier("teamInstanceId", team_instance_id)?;

        let store = self.clone();
        let parent_session_id = parent_session_id.to_string();
        let team_instance_id = team_instance_id.to_string();
        tokio::task::spawn_blocking(move || {
            store.load_blocking(&parent_session_id, &team_instance_id)
        })
        .await
        .map_err(task_join_error)?
    }

    async fn save(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
        snapshot: TeamRuntimeSnapshot,
        expected_revision: Option<u64>,
    ) -> Result<TeamRuntimeRecord, TeamRuntimeStoreError> {
        validate_storage_identifier("parentSessionId", parent_session_id)?;
        validate_storage_identifier("teamInstanceId", team_instance_id)?;
        snapshot.validate().map_err(|error| {
            TeamRuntimeStoreError::new(
                TeamRuntimeStoreErrorCode::InvalidSnapshot,
                format!("invalid Team runtime snapshot: {error}"),
                false,
            )
        })?;
        self.validate_snapshot_scope(&snapshot, parent_session_id, team_instance_id)?;

        let store = self.clone();
        let parent_session_id = parent_session_id.to_string();
        let team_instance_id = team_instance_id.to_string();
        tokio::task::spawn_blocking(move || {
            store.save_blocking(
                &parent_session_id,
                &team_instance_id,
                snapshot,
                expected_revision,
            )
        })
        .await
        .map_err(task_join_error)?
    }
}

impl FileTeamRuntimeStore {
    fn list_blocking(
        &self,
        parent_session_id: &str,
    ) -> Result<TeamRuntimeList, TeamRuntimeStoreError> {
        let runtime_dir = self.runtime_dir(parent_session_id);
        let entries = match fs::read_dir(&runtime_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(TeamRuntimeList {
                    records: Vec::new(),
                    diagnostics: Vec::new(),
                });
            }
            Err(error) => {
                return Err(TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::DirectoryUnavailable,
                    format!("cannot read Team runtime directory: {error}"),
                    true,
                ));
            }
        };

        let mut record_ids = BTreeSet::new();
        let mut invalid_record_ids = BTreeSet::new();
        let mut diagnostics = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| {
                TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::DirectoryUnavailable,
                    format!("cannot enumerate Team runtime directory: {error}"),
                    true,
                )
            })?;
            let Some(record_id) = record_id_from_file_name(&entry.file_name()) else {
                continue;
            };
            if validate_storage_identifier("teamInstanceId", &record_id).is_err() {
                invalid_record_ids.insert(record_id);
                continue;
            }
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    diagnostics.push(diagnostic(
                        record_id,
                        TeamRuntimeDiagnosticCode::Io,
                        format!("cannot inspect Team runtime record: {error}"),
                    ));
                    continue;
                }
            };
            if !file_type.is_file() {
                continue;
            }
            record_ids.insert(record_id);
        }

        for record_id in invalid_record_ids {
            let error = validate_storage_identifier("teamInstanceId", &record_id)
                .expect_err("invalid Team runtime filename must stay invalid");
            diagnostics.push(diagnostic(
                record_id,
                TeamRuntimeDiagnosticCode::InvalidContract,
                error.message,
            ));
        }

        let mut records = Vec::new();
        for record_id in record_ids {
            let path = self.record_path(parent_session_id, &record_id);
            let recovery_path = self.recovery_path(parent_session_id, &record_id);

            let lock_path = self.lock_path(parent_session_id, &record_id);
            let lock_file = match open_and_lock(&lock_path) {
                Ok(file) => file,
                Err(error) => {
                    diagnostics.push(diagnostic(
                        record_id,
                        TeamRuntimeDiagnosticCode::Io,
                        format!("cannot lock Team runtime record: {error}"),
                    ));
                    continue;
                }
            };

            if let Err(error) = crate::service::atomic_file::recover_file(&path, &recovery_path) {
                diagnostics.push(diagnostic(
                    record_id,
                    TeamRuntimeDiagnosticCode::Io,
                    format!("cannot recover Team runtime record: {error}"),
                ));
                drop(lock_file);
                continue;
            }

            match read_record(&path) {
                Ok(record) => {
                    if let Err(message) = validate_record_scope(
                        &record,
                        &self.workspace_identity,
                        parent_session_id,
                        &record_id,
                    ) {
                        diagnostics.push(diagnostic(
                            record_id,
                            TeamRuntimeDiagnosticCode::ScopeMismatch,
                            message,
                        ));
                    } else {
                        records.push(record);
                    }
                }
                Err(problem) => diagnostics.push(problem.into_diagnostic(record_id)),
            }
            drop(lock_file);
        }

        records.sort_by(|left, right| {
            left.snapshot
                .instance
                .team_instance_id
                .cmp(&right.snapshot.instance.team_instance_id)
        });
        diagnostics.sort_by(|left, right| left.record_id.cmp(&right.record_id));
        Ok(TeamRuntimeList {
            records,
            diagnostics,
        })
    }

    fn load_blocking(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> Result<Option<TeamRuntimeRecord>, TeamRuntimeStoreError> {
        validate_storage_identifier("parentSessionId", parent_session_id)?;
        validate_storage_identifier("teamInstanceId", team_instance_id)?;
        let runtime_dir = self.runtime_dir(parent_session_id);
        fs::create_dir_all(&runtime_dir).map_err(|error| {
            TeamRuntimeStoreError::new(
                TeamRuntimeStoreErrorCode::DirectoryUnavailable,
                format!("cannot create Team runtime directory: {error}"),
                true,
            )
        })?;
        let record_path = self.record_path(parent_session_id, team_instance_id);
        let recovery_path = self.recovery_path(parent_session_id, team_instance_id);
        let lock_path = self.lock_path(parent_session_id, team_instance_id);
        let _lock_file = open_and_lock(&lock_path)
            .map_err(|error| io_store_error(format!("cannot lock Team runtime record: {error}")))?;
        crate::service::atomic_file::recover_file(&record_path, &recovery_path).map_err(
            |error| io_store_error(format!("cannot recover Team runtime record: {error}")),
        )?;

        let record = match read_record(&record_path) {
            Ok(record) => record,
            Err(ReadProblem::Missing) => return Ok(None),
            Err(ReadProblem::TooLarge(message)) => {
                return Err(TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::RecordTooLarge,
                    message,
                    false,
                ));
            }
            Err(ReadProblem::Io(message)) => return Err(io_store_error(message)),
            Err(problem @ (ReadProblem::InvalidJson(_) | ReadProblem::InvalidContract(_))) => {
                return Err(TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::InvalidRecord,
                    problem.message(),
                    false,
                ));
            }
        };
        validate_record_scope(
            &record,
            &self.workspace_identity,
            parent_session_id,
            team_instance_id,
        )
        .map_err(scope_error)?;
        Ok(Some(record))
    }

    fn save_blocking(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
        snapshot: TeamRuntimeSnapshot,
        expected_revision: Option<u64>,
    ) -> Result<TeamRuntimeRecord, TeamRuntimeStoreError> {
        validate_storage_identifier("parentSessionId", parent_session_id)?;
        validate_storage_identifier("teamInstanceId", team_instance_id)?;
        let runtime_dir = self.runtime_dir(parent_session_id);
        fs::create_dir_all(&runtime_dir).map_err(|error| {
            TeamRuntimeStoreError::new(
                TeamRuntimeStoreErrorCode::DirectoryUnavailable,
                format!("cannot create Team runtime directory: {error}"),
                true,
            )
        })?;
        let record_path = self.record_path(parent_session_id, team_instance_id);
        let recovery_path = self.recovery_path(parent_session_id, team_instance_id);
        let lock_path = self.lock_path(parent_session_id, team_instance_id);
        let _lock_file = open_and_lock(&lock_path)
            .map_err(|error| io_store_error(format!("cannot lock Team runtime record: {error}")))?;
        crate::service::atomic_file::recover_file(&record_path, &recovery_path).map_err(
            |error| io_store_error(format!("cannot recover Team runtime record: {error}")),
        )?;

        let actual_revision = match read_record(&record_path) {
            Ok(record) => {
                validate_record_scope(
                    &record,
                    &self.workspace_identity,
                    parent_session_id,
                    team_instance_id,
                )
                .map_err(scope_error)?;
                Some(record.revision)
            }
            Err(ReadProblem::Missing) => None,
            Err(ReadProblem::Io(message)) => return Err(io_store_error(message)),
            Err(problem) => {
                return Err(TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::InvalidRecord,
                    format!(
                        "existing Team runtime record is invalid and was not overwritten: {}",
                        problem.message()
                    ),
                    false,
                ));
            }
        };

        if actual_revision != expected_revision {
            return Err(TeamRuntimeStoreError::revision_conflict(
                expected_revision,
                actual_revision,
            ));
        }
        let revision = match actual_revision {
            None => 1,
            Some(revision) => revision.checked_add(1).ok_or_else(|| {
                TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::InvalidRecord,
                    "Team runtime record revision overflow; existing record was not overwritten",
                    false,
                )
            })?,
        };
        let record = TeamRuntimeRecord {
            schema_version: TEAM_RUNTIME_STORE_SCHEMA_VERSION,
            revision,
            snapshot,
        };
        let data = serde_json::to_vec_pretty(&record).map_err(|error| {
            TeamRuntimeStoreError::new(
                TeamRuntimeStoreErrorCode::Serialization,
                format!("cannot serialize Team runtime record: {error}"),
                false,
            )
        })?;
        if data.len() as u64 > MAX_RECORD_BYTES {
            return Err(TeamRuntimeStoreError::new(
                TeamRuntimeStoreErrorCode::RecordTooLarge,
                format!("serialized Team runtime record exceeds the {MAX_RECORD_BYTES}-byte limit"),
                false,
            ));
        }
        crate::service::atomic_file::replace_file_with_recovery(
            &record_path,
            &recovery_path,
            &data,
        )
        .map_err(|error| io_store_error(format!("cannot replace Team runtime record: {error}")))?;
        Ok(record)
    }
}

fn record_id_from_file_name(file_name: &OsStr) -> Option<String> {
    let name = file_name.to_str()?;
    name.strip_suffix(".json.recovery")
        .or_else(|| name.strip_suffix(".json"))
        .map(str::to_owned)
}

fn validate_storage_identifier(field: &str, value: &str) -> Result<(), TeamRuntimeStoreError> {
    if value.is_empty()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(TeamRuntimeStoreError::new(
            TeamRuntimeStoreErrorCode::InvalidIdentifier,
            format!("{field} must be non-empty and contain only ASCII letters, digits, '-' or '_'"),
            false,
        ));
    }
    Ok(())
}

fn open_and_lock(path: &Path) -> io::Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)?;
    FileExt::lock_exclusive(&file)?;
    Ok(file)
}

#[derive(Debug)]
enum ReadProblem {
    Missing,
    TooLarge(String),
    Io(String),
    InvalidJson(String),
    InvalidContract(String),
}

impl ReadProblem {
    fn message(&self) -> String {
        match self {
            Self::Missing => "Team runtime record does not exist".to_string(),
            Self::TooLarge(message)
            | Self::Io(message)
            | Self::InvalidJson(message)
            | Self::InvalidContract(message) => message.clone(),
        }
    }

    fn into_diagnostic(self, record_id: String) -> TeamRuntimeDiagnostic {
        let code = match self {
            Self::Missing | Self::Io(_) => TeamRuntimeDiagnosticCode::Io,
            Self::TooLarge(_) => TeamRuntimeDiagnosticCode::RecordTooLarge,
            Self::InvalidJson(_) => TeamRuntimeDiagnosticCode::InvalidJson,
            Self::InvalidContract(_) => TeamRuntimeDiagnosticCode::InvalidContract,
        };
        diagnostic(record_id, code, self.message())
    }
}

fn read_record(path: &Path) -> Result<TeamRuntimeRecord, ReadProblem> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(ReadProblem::Missing);
        }
        Err(error) => {
            return Err(ReadProblem::Io(format!(
                "cannot open Team runtime record: {error}"
            )));
        }
    };
    let metadata = file
        .metadata()
        .map_err(|error| ReadProblem::Io(format!("cannot inspect Team runtime record: {error}")))?;
    if metadata.len() > MAX_RECORD_BYTES {
        return Err(ReadProblem::TooLarge(format!(
            "Team runtime record metadata reports {} bytes, exceeding the {MAX_RECORD_BYTES}-byte limit",
            metadata.len()
        )));
    }

    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_RECORD_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| ReadProblem::Io(format!("cannot read Team runtime record: {error}")))?;
    if bytes.len() as u64 > MAX_RECORD_BYTES {
        return Err(ReadProblem::TooLarge(format!(
            "Team runtime record contains more than the {MAX_RECORD_BYTES}-byte limit"
        )));
    }
    let record = serde_json::from_slice::<TeamRuntimeRecord>(&bytes).map_err(|error| {
        ReadProblem::InvalidJson(format!("invalid Team runtime record JSON: {error}"))
    })?;
    record.validate().map_err(|error| {
        ReadProblem::InvalidContract(format!("invalid Team runtime record contract: {error}"))
    })?;
    Ok(record)
}

fn validate_record_scope(
    record: &TeamRuntimeRecord,
    workspace_identity: &TeamWorkspaceIdentity,
    parent_session_id: &str,
    team_instance_id: &str,
) -> Result<(), String> {
    let instance = &record.snapshot.instance;
    if &instance.workspace != workspace_identity {
        return Err(format!(
            "record workspace identity does not match the bound store for Team instance '{team_instance_id}'"
        ));
    }
    if instance.parent_session_id != parent_session_id {
        return Err(format!(
            "record parent session '{}' does not match requested parent session '{parent_session_id}'",
            instance.parent_session_id
        ));
    }
    if instance.team_instance_id != team_instance_id {
        return Err(format!(
            "record Team instance '{}' does not match record id '{team_instance_id}'",
            instance.team_instance_id
        ));
    }
    Ok(())
}

fn diagnostic(
    record_id: String,
    code: TeamRuntimeDiagnosticCode,
    message: String,
) -> TeamRuntimeDiagnostic {
    TeamRuntimeDiagnostic {
        record_id,
        code,
        message,
    }
}

fn scope_error(message: impl Into<String>) -> TeamRuntimeStoreError {
    TeamRuntimeStoreError::new(TeamRuntimeStoreErrorCode::ScopeMismatch, message, false)
}

fn io_store_error(message: impl Into<String>) -> TeamRuntimeStoreError {
    TeamRuntimeStoreError::new(TeamRuntimeStoreErrorCode::Io, message, true)
}

fn task_join_error(error: tokio::task::JoinError) -> TeamRuntimeStoreError {
    TeamRuntimeStoreError::new(
        TeamRuntimeStoreErrorCode::TaskJoin,
        format!("Team runtime persistence task failed: {error}"),
        true,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::team_runtime::{
        TeamExecutionProfile, TeamInstance, TeamInstanceCreationSource, TeamInstanceLifecycle,
        TeamLeadBinding, TeamMemberBinding, TeamMemberRun, TeamMemberRunStatus, TeamPhaseRun,
        TeamPhaseRunStatus, TeamRun, TeamRunStatus, TeamWorkspaceBackend,
    };
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "void-team-runtime-{label}-{}-{nonce}-{}",
                std::process::id(),
                Uuid::new_v4()
            ));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn workspace(&self, name: &str) -> PathBuf {
            let path = self.path.join(name);
            fs::create_dir_all(&path).unwrap();
            path
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            if self.path.exists() {
                fs::remove_dir_all(&self.path).unwrap_or_else(|error| {
                    panic!(
                        "failed to clean Team runtime test directory '{}': {error}",
                        self.path.display()
                    )
                });
            }
        }
    }

    fn identity(id: &str) -> TeamWorkspaceIdentity {
        TeamWorkspaceIdentity {
            workspace_id: id.to_string(),
            context_key: format!("local:{id}"),
            backend: TeamWorkspaceBackend::Local,
            remote_connection_id: None,
            remote_host: None,
        }
    }

    fn remote_identity(id: &str) -> TeamWorkspaceIdentity {
        TeamWorkspaceIdentity {
            workspace_id: id.to_string(),
            context_key: format!("remote:{id}"),
            backend: TeamWorkspaceBackend::Remote,
            remote_connection_id: Some("connection-1".to_string()),
            remote_host: Some("build.example.test".to_string()),
        }
    }

    fn snapshot(
        workspace: TeamWorkspaceIdentity,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> TeamRuntimeSnapshot {
        let mut instance = TeamInstance::new(
            team_instance_id,
            "definition-1",
            "revision-1",
            workspace,
            parent_session_id,
            TeamExecutionProfile::PromptOrchestrated,
            TeamLeadBinding::ParentPersona {
                parent_session_id: parent_session_id.to_string(),
            },
            vec![TeamMemberBinding {
                member_id: "member-1".to_string(),
                child_session_id: Some("child-1".to_string()),
                subagent_task_id: Some("task-1".to_string()),
            }],
            TeamInstanceCreationSource::UserAttachment,
            1,
        )
        .unwrap();
        instance
            .transition(TeamInstanceLifecycle::Ready, None, 2)
            .unwrap();
        let mut team_run = TeamRun::new("run-1", team_instance_id, "workflow-1", 1, 2).unwrap();
        instance.set_active_run(&team_run, 2).unwrap();
        team_run
            .transition(TeamRunStatus::Running, None, 3)
            .unwrap();
        let mut member_run =
            TeamMemberRun::new("member-run-1", "run-1", team_instance_id, "member-1", 1, 2)
                .unwrap();
        member_run.child_session_id = Some("child-1".to_string());
        member_run.subagent_task_id = Some("task-1".to_string());
        member_run
            .transition(TeamMemberRunStatus::Queued, None, 3)
            .unwrap();
        let mut phase_run = TeamPhaseRun::new(
            "phase-run-1",
            "run-1",
            team_instance_id,
            "workflow-1",
            "phase-1",
            1,
            2,
        )
        .unwrap();
        phase_run
            .transition(TeamPhaseRunStatus::Ready, None, 3)
            .unwrap();
        TeamRuntimeSnapshot {
            instance,
            team_runs: vec![team_run],
            member_runs: vec![member_run],
            phase_runs: vec![phase_run],
        }
    }

    fn test_store(
        directory: &TestDirectory,
        workspace_name: &str,
        workspace_identity: TeamWorkspaceIdentity,
    ) -> (FileTeamRuntimeStore, Arc<PathManager>, PathBuf) {
        let workspace_root = directory.workspace(workspace_name);
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.path.join("config"),
        ));
        let store = FileTeamRuntimeStore::new(
            path_manager.clone(),
            workspace_root.clone(),
            workspace_identity,
        )
        .unwrap();
        (store, path_manager, workspace_root)
    }

    #[tokio::test]
    async fn rejects_path_traversal_before_creating_directories() {
        let directory = TestDirectory::new("traversal");
        let workspace_identity = identity("workspace-1");
        let (store, path_manager, workspace_root) =
            test_store(&directory, "workspace", workspace_identity.clone());
        let sessions_dir = path_manager.project_sessions_dir(&workspace_root);

        let error = store
            .save(
                "../parent",
                "instance-1",
                snapshot(workspace_identity, "../parent", "instance-1"),
                None,
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, TeamRuntimeStoreErrorCode::InvalidIdentifier);
        assert!(!sessions_dir.exists());
    }

    #[tokio::test]
    async fn invalid_instance_load_and_save_have_no_filesystem_side_effects() {
        let directory = TestDirectory::new("invalid-instance");
        let workspace_identity = identity("workspace-1");
        let (store, path_manager, workspace_root) =
            test_store(&directory, "workspace", workspace_identity.clone());
        let sessions_dir = path_manager.project_sessions_dir(&workspace_root);

        let load_error = store.load("parent-1", "bad!").await.unwrap_err();
        assert_eq!(
            load_error.code,
            TeamRuntimeStoreErrorCode::InvalidIdentifier
        );
        let save_error = store
            .save(
                "parent-1",
                "bad!",
                snapshot(workspace_identity, "parent-1", "instance-1"),
                None,
            )
            .await
            .unwrap_err();
        assert_eq!(
            save_error.code,
            TeamRuntimeStoreErrorCode::InvalidIdentifier
        );
        assert!(!sessions_dir.exists());
    }

    #[tokio::test]
    async fn invalid_list_filename_is_diagnostic_without_creating_a_lock_sidecar() {
        let directory = TestDirectory::new("invalid-list-name");
        let workspace_identity = identity("workspace-1");
        let (store, _, _) = test_store(&directory, "workspace", workspace_identity);
        let runtime_dir = store.runtime_dir("parent-1");
        fs::create_dir_all(&runtime_dir).unwrap();
        fs::write(runtime_dir.join("bad!.json"), b"{}").unwrap();

        let listed = store.list("parent-1").await.unwrap();

        assert!(listed.records.is_empty());
        assert_eq!(listed.diagnostics.len(), 1);
        assert_eq!(listed.diagnostics[0].record_id, "bad!");
        assert_eq!(
            listed.diagnostics[0].code,
            TeamRuntimeDiagnosticCode::InvalidContract
        );
        assert!(!runtime_dir.join("bad!.lock").exists());
    }

    #[test]
    fn remote_mirror_sessions_root_is_exact_but_local_workspace_is_slugged() {
        let directory = TestDirectory::new("sessions-root");
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.path.join("config"),
        ));
        let remote_sessions_root = PathManager::remote_ssh_mirror_root()
            .join("build-example-test")
            .join("workspace")
            .join("sessions");
        let remote_store = FileTeamRuntimeStore::new(
            path_manager.clone(),
            remote_sessions_root.clone(),
            remote_identity("remote-workspace"),
        )
        .unwrap();
        assert_eq!(remote_store.sessions_root(), remote_sessions_root);

        let local_workspace =
            PathManager::remote_ssh_mirror_root().join("local-looking-mirror-workspace");
        let local_store = FileTeamRuntimeStore::new(
            path_manager.clone(),
            local_workspace.clone(),
            identity("local-workspace"),
        )
        .unwrap();
        assert_eq!(
            local_store.sessions_root(),
            path_manager.project_sessions_dir(&local_workspace)
        );
    }

    #[tokio::test]
    async fn isolates_workspace_parent_and_instance_scopes() {
        let directory = TestDirectory::new("isolation");
        let identity_a = identity("workspace-a");
        let identity_b = identity("workspace-b");
        let (store_a, _, _) = test_store(&directory, "workspace-a", identity_a.clone());
        let (store_b, _, _) = test_store(&directory, "workspace-b", identity_b.clone());

        store_a
            .save(
                "parent-a",
                "instance-a",
                snapshot(identity_a, "parent-a", "instance-a"),
                None,
            )
            .await
            .unwrap();
        store_b
            .save(
                "parent-a",
                "instance-a",
                snapshot(identity_b, "parent-a", "instance-a"),
                None,
            )
            .await
            .unwrap();

        assert!(store_a
            .load("parent-b", "instance-a")
            .await
            .unwrap()
            .is_none());
        assert!(store_a
            .load("parent-a", "instance-b")
            .await
            .unwrap()
            .is_none());
        assert_eq!(store_a.list("parent-a").await.unwrap().records.len(), 1);
        assert_eq!(store_b.list("parent-a").await.unwrap().records.len(), 1);
    }

    #[tokio::test]
    async fn creates_updates_and_rejects_stale_revisions() {
        let directory = TestDirectory::new("cas");
        let workspace_identity = identity("workspace-1");
        let (store, _, _) = test_store(&directory, "workspace", workspace_identity.clone());
        let snapshot = snapshot(workspace_identity, "parent-1", "instance-1");

        let created = store
            .save("parent-1", "instance-1", snapshot.clone(), None)
            .await
            .unwrap();
        assert_eq!(created.revision, 1);
        let updated = store
            .save("parent-1", "instance-1", snapshot.clone(), Some(1))
            .await
            .unwrap();
        assert_eq!(updated.revision, 2);
        let conflict = store
            .save("parent-1", "instance-1", snapshot, Some(1))
            .await
            .unwrap_err();
        assert_eq!(conflict.code, TeamRuntimeStoreErrorCode::RevisionConflict);
        assert_eq!(conflict.expected_revision, Some(1));
        assert_eq!(conflict.actual_revision, Some(2));
    }

    #[tokio::test]
    async fn recovery_only_record_is_discovered_and_restored_by_list() {
        let directory = TestDirectory::new("recovery-only-list");
        let workspace_identity = identity("workspace-1");
        let (store, _, _) = test_store(&directory, "workspace", workspace_identity.clone());
        let expected = store
            .save(
                "parent-1",
                "instance-1",
                snapshot(workspace_identity, "parent-1", "instance-1"),
                None,
            )
            .await
            .unwrap();
        let target = store.record_path("parent-1", "instance-1");
        let recovery = store.recovery_path("parent-1", "instance-1");
        fs::rename(&target, &recovery).unwrap();

        let listed = store.list("parent-1").await.unwrap();

        assert_eq!(listed.records, vec![expected]);
        assert!(target.exists());
        assert!(!recovery.exists());
    }

    #[tokio::test]
    async fn target_wins_over_recovery_and_cas_continues_from_target_revision() {
        let directory = TestDirectory::new("target-wins");
        let workspace_identity = identity("workspace-1");
        let (store, _, _) = test_store(&directory, "workspace", workspace_identity.clone());
        let first = store
            .save(
                "parent-1",
                "instance-1",
                snapshot(workspace_identity.clone(), "parent-1", "instance-1"),
                None,
            )
            .await
            .unwrap();
        let second = store
            .save(
                "parent-1",
                "instance-1",
                snapshot(workspace_identity.clone(), "parent-1", "instance-1"),
                Some(1),
            )
            .await
            .unwrap();
        let recovery = store.recovery_path("parent-1", "instance-1");
        fs::write(&recovery, serde_json::to_vec_pretty(&first).unwrap()).unwrap();

        let listed = store.list("parent-1").await.unwrap();
        assert_eq!(listed.records, vec![second]);
        assert!(!recovery.exists());

        let third = store
            .save(
                "parent-1",
                "instance-1",
                snapshot(workspace_identity, "parent-1", "instance-1"),
                Some(2),
            )
            .await
            .unwrap();
        assert_eq!(third.revision, 3);
    }

    #[tokio::test]
    async fn independent_stores_serialize_concurrent_create_and_update() {
        let directory = TestDirectory::new("concurrency");
        let workspace_identity = identity("workspace-1");
        let workspace_root = directory.workspace("workspace");
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.path.join("config"),
        ));
        let store_a = FileTeamRuntimeStore::new(
            path_manager.clone(),
            workspace_root.clone(),
            workspace_identity.clone(),
        )
        .unwrap();
        let store_b =
            FileTeamRuntimeStore::new(path_manager, workspace_root, workspace_identity.clone())
                .unwrap();
        let first = snapshot(workspace_identity.clone(), "parent-1", "instance-1");
        let second = first.clone();
        let (create_a, create_b) = tokio::join!(
            store_a.save("parent-1", "instance-1", first, None),
            store_b.save("parent-1", "instance-1", second, None)
        );
        assert_eq!(
            usize::from(create_a.is_ok()) + usize::from(create_b.is_ok()),
            1
        );
        assert_eq!(
            create_a.err().or_else(|| create_b.err()).unwrap().code,
            TeamRuntimeStoreErrorCode::RevisionConflict
        );

        let update_a = snapshot(workspace_identity.clone(), "parent-1", "instance-1");
        let update_b = update_a.clone();
        let (result_a, result_b) = tokio::join!(
            store_a.save("parent-1", "instance-1", update_a, Some(1)),
            store_b.save("parent-1", "instance-1", update_b, Some(1))
        );
        assert_eq!(
            usize::from(result_a.is_ok()) + usize::from(result_b.is_ok()),
            1
        );
        assert_eq!(
            result_a.err().or_else(|| result_b.err()).unwrap().code,
            TeamRuntimeStoreErrorCode::RevisionConflict
        );
    }

    #[tokio::test]
    async fn corrupt_neighbor_does_not_hide_valid_list_records() {
        let directory = TestDirectory::new("list-corrupt");
        let workspace_identity = identity("workspace-1");
        let (store, path_manager, workspace_root) =
            test_store(&directory, "workspace", workspace_identity.clone());
        store
            .save(
                "parent-1",
                "instance-good",
                snapshot(workspace_identity, "parent-1", "instance-good"),
                None,
            )
            .await
            .unwrap();
        let runtime_dir = path_manager
            .project_sessions_dir(&workspace_root)
            .join("parent-1")
            .join("team-runtime");
        tokio::fs::write(runtime_dir.join("instance-bad.json"), b"{not-json")
            .await
            .unwrap();

        let listed = store.list("parent-1").await.unwrap();
        assert_eq!(listed.records.len(), 1);
        assert_eq!(
            listed.records[0].snapshot.instance.team_instance_id,
            "instance-good"
        );
        assert_eq!(listed.diagnostics.len(), 1);
        assert_eq!(listed.diagnostics[0].record_id, "instance-bad");
        assert_eq!(
            listed.diagnostics[0].code,
            TeamRuntimeDiagnosticCode::InvalidJson
        );
    }

    #[tokio::test]
    async fn load_and_save_never_overwrite_a_corrupt_record() {
        let directory = TestDirectory::new("preserve-corrupt");
        let workspace_identity = identity("workspace-1");
        let (store, path_manager, workspace_root) =
            test_store(&directory, "workspace", workspace_identity.clone());
        let runtime_dir = path_manager
            .project_sessions_dir(&workspace_root)
            .join("parent-1")
            .join("team-runtime");
        tokio::fs::create_dir_all(&runtime_dir).await.unwrap();
        let record_path = runtime_dir.join("instance-1.json");
        let recovery_path = runtime_dir.join("instance-1.json.recovery");
        let corrupt_bytes = b"{broken-record";
        tokio::fs::write(&record_path, corrupt_bytes).await.unwrap();
        let recovery_record = TeamRuntimeRecord {
            schema_version: TEAM_RUNTIME_STORE_SCHEMA_VERSION,
            revision: 1,
            snapshot: snapshot(workspace_identity.clone(), "parent-1", "instance-1"),
        };
        tokio::fs::write(
            &recovery_path,
            serde_json::to_vec_pretty(&recovery_record).unwrap(),
        )
        .await
        .unwrap();

        let load_error = store.load("parent-1", "instance-1").await.unwrap_err();
        assert_eq!(load_error.code, TeamRuntimeStoreErrorCode::InvalidRecord);
        assert_eq!(tokio::fs::read(&record_path).await.unwrap(), corrupt_bytes);
        assert!(!recovery_path.exists());
        let save_error = store
            .save(
                "parent-1",
                "instance-1",
                snapshot(workspace_identity, "parent-1", "instance-1"),
                None,
            )
            .await
            .unwrap_err();
        assert_eq!(save_error.code, TeamRuntimeStoreErrorCode::InvalidRecord);
        assert_eq!(tokio::fs::read(&record_path).await.unwrap(), corrupt_bytes);
    }

    #[tokio::test]
    async fn rebuilding_store_restores_revision_and_runtime_references() {
        let directory = TestDirectory::new("restore");
        let workspace_identity = identity("workspace-1");
        let workspace_root = directory.workspace("workspace");
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.path.join("config"),
        ));
        let original = FileTeamRuntimeStore::new(
            path_manager.clone(),
            workspace_root.clone(),
            workspace_identity.clone(),
        )
        .unwrap();
        let expected = original
            .save(
                "parent-1",
                "instance-1",
                snapshot(workspace_identity.clone(), "parent-1", "instance-1"),
                None,
            )
            .await
            .unwrap();
        drop(original);

        let rebuilt =
            FileTeamRuntimeStore::new(path_manager, workspace_root, workspace_identity).unwrap();
        let restored = rebuilt
            .load("parent-1", "instance-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(restored, expected);
        assert_eq!(restored.revision, 1);
        assert_eq!(
            restored.snapshot.instance.active_run_id.as_deref(),
            Some("run-1")
        );
        assert_eq!(
            restored.snapshot.member_runs[0].child_session_id.as_deref(),
            Some("child-1")
        );
        assert_eq!(
            restored.snapshot.member_runs[0].subagent_task_id.as_deref(),
            Some("task-1")
        );
    }
}
