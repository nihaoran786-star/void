//! Persistence port and aggregate validation for Team runtime state.
//!
//! The port deliberately exposes logical identities only. Filesystem layout,
//! locking, and recovery belong to persistence adapters.

use super::team_runtime::{
    TeamInstance, TeamMemberRun, TeamPhaseRun, TeamRun, TeamRuntimeContractError,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fmt;

pub const TEAM_RUNTIME_STORE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRuntimeSnapshotErrorCode {
    ContractViolation,
    DuplicateRunId,
    IdentityMismatch,
    MissingTeamRun,
    UnknownMember,
    WorkflowMismatch,
    ActiveRunMismatch,
    TerminalRunHasActiveChild,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamRuntimeSnapshotError {
    pub code: TeamRuntimeSnapshotErrorCode,
    pub message: String,
}

impl TeamRuntimeSnapshotError {
    fn new(code: TeamRuntimeSnapshotErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn contract(entity: &str, error: TeamRuntimeContractError) -> Self {
        Self::new(
            TeamRuntimeSnapshotErrorCode::ContractViolation,
            format!("invalid {entity}: {error}"),
        )
    }
}

impl fmt::Display for TeamRuntimeSnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl Error for TeamRuntimeSnapshotError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuntimeSnapshot {
    pub instance: TeamInstance,
    #[serde(default)]
    pub team_runs: Vec<TeamRun>,
    #[serde(default)]
    pub member_runs: Vec<TeamMemberRun>,
    #[serde(default)]
    pub phase_runs: Vec<TeamPhaseRun>,
}

impl TeamRuntimeSnapshot {
    pub fn validate(&self) -> Result<(), TeamRuntimeSnapshotError> {
        self.instance
            .validate()
            .map_err(|error| TeamRuntimeSnapshotError::contract("Team instance", error))?;

        let instance_id = self.instance.team_instance_id.as_str();
        let mut team_runs = HashMap::new();
        for run in &self.team_runs {
            run.validate()
                .map_err(|error| TeamRuntimeSnapshotError::contract("Team run", error))?;
            if run.team_instance_id != instance_id {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::IdentityMismatch,
                    format!(
                        "Team run '{}' belongs to instance '{}', expected '{}'",
                        run.team_run_id, run.team_instance_id, instance_id
                    ),
                ));
            }
            if team_runs.insert(run.team_run_id.as_str(), run).is_some() {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::DuplicateRunId,
                    format!("duplicate Team run id '{}'", run.team_run_id),
                ));
            }
        }

        let bound_members = self
            .instance
            .member_bindings
            .iter()
            .map(|binding| binding.member_id.as_str())
            .collect::<HashSet<_>>();
        let mut member_run_ids = HashSet::new();
        for run in &self.member_runs {
            run.validate()
                .map_err(|error| TeamRuntimeSnapshotError::contract("member run", error))?;
            if !member_run_ids.insert(run.member_run_id.as_str()) {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::DuplicateRunId,
                    format!("duplicate member run id '{}'", run.member_run_id),
                ));
            }
            if run.team_instance_id != instance_id {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::IdentityMismatch,
                    format!(
                        "member run '{}' belongs to instance '{}', expected '{}'",
                        run.member_run_id, run.team_instance_id, instance_id
                    ),
                ));
            }
            if !team_runs.contains_key(run.team_run_id.as_str()) {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::MissingTeamRun,
                    format!(
                        "member run '{}' references missing Team run '{}'",
                        run.member_run_id, run.team_run_id
                    ),
                ));
            }
            if !bound_members.contains(run.member_id.as_str()) {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::UnknownMember,
                    format!(
                        "member run '{}' references member '{}' not bound to the instance",
                        run.member_run_id, run.member_id
                    ),
                ));
            }
        }

        let mut phase_run_ids = HashSet::new();
        for run in &self.phase_runs {
            run.validate()
                .map_err(|error| TeamRuntimeSnapshotError::contract("phase run", error))?;
            if !phase_run_ids.insert(run.phase_run_id.as_str()) {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::DuplicateRunId,
                    format!("duplicate phase run id '{}'", run.phase_run_id),
                ));
            }
            if run.team_instance_id != instance_id {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::IdentityMismatch,
                    format!(
                        "phase run '{}' belongs to instance '{}', expected '{}'",
                        run.phase_run_id, run.team_instance_id, instance_id
                    ),
                ));
            }
            let Some(team_run) = team_runs.get(run.team_run_id.as_str()) else {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::MissingTeamRun,
                    format!(
                        "phase run '{}' references missing Team run '{}'",
                        run.phase_run_id, run.team_run_id
                    ),
                ));
            };
            if run.workflow_id != team_run.workflow_id {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::WorkflowMismatch,
                    format!(
                        "phase run '{}' workflow '{}' does not match Team run workflow '{}'",
                        run.phase_run_id, run.workflow_id, team_run.workflow_id
                    ),
                ));
            }
        }

        let non_terminal = self
            .team_runs
            .iter()
            .filter(|run| !run.status.is_terminal())
            .collect::<Vec<_>>();
        match self.instance.active_run_id.as_deref() {
            Some(active_id)
                if non_terminal.len() == 1 && non_terminal[0].team_run_id == active_id => {}
            Some(active_id) => {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::ActiveRunMismatch,
                    format!(
                        "active run '{active_id}' must be the snapshot's unique non-terminal Team run"
                    ),
                ));
            }
            None if non_terminal.is_empty() => {}
            None => {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::ActiveRunMismatch,
                    "a snapshot without activeRunId cannot contain non-terminal Team runs",
                ));
            }
        }

        for team_run in self.team_runs.iter().filter(|run| run.status.is_terminal()) {
            let member_is_active = self
                .member_runs
                .iter()
                .any(|run| run.team_run_id == team_run.team_run_id && !run.status.is_terminal());
            let phase_is_active = self
                .phase_runs
                .iter()
                .any(|run| run.team_run_id == team_run.team_run_id && !run.status.is_terminal());
            if member_is_active || phase_is_active {
                return Err(TeamRuntimeSnapshotError::new(
                    TeamRuntimeSnapshotErrorCode::TerminalRunHasActiveChild,
                    format!(
                        "terminal Team run '{}' retains a non-terminal member or phase run",
                        team_run.team_run_id
                    ),
                ));
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuntimeRecord {
    pub schema_version: u32,
    pub revision: u64,
    pub snapshot: TeamRuntimeSnapshot,
}

impl TeamRuntimeRecord {
    pub fn validate(&self) -> Result<(), TeamRuntimeSnapshotError> {
        if self.schema_version != TEAM_RUNTIME_STORE_SCHEMA_VERSION {
            return Err(TeamRuntimeSnapshotError::new(
                TeamRuntimeSnapshotErrorCode::ContractViolation,
                format!(
                    "unsupported Team runtime store schema version {}",
                    self.schema_version
                ),
            ));
        }
        if self.revision == 0 {
            return Err(TeamRuntimeSnapshotError::new(
                TeamRuntimeSnapshotErrorCode::ContractViolation,
                "Team runtime record revision must be at least 1",
            ));
        }
        self.snapshot.validate()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRuntimeDiagnosticCode {
    Io,
    RecordTooLarge,
    InvalidJson,
    InvalidContract,
    ScopeMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuntimeDiagnostic {
    pub record_id: String,
    pub code: TeamRuntimeDiagnosticCode,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuntimeList {
    pub records: Vec<TeamRuntimeRecord>,
    pub diagnostics: Vec<TeamRuntimeDiagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRuntimeStoreErrorCode {
    InvalidIdentifier,
    InvalidSnapshot,
    RecordTooLarge,
    RevisionConflict,
    ScopeMismatch,
    InvalidRecord,
    DirectoryUnavailable,
    Io,
    Serialization,
    TaskJoin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuntimeStoreError {
    pub code: TeamRuntimeStoreErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actual_revision: Option<u64>,
}

impl TeamRuntimeStoreError {
    pub fn new(
        code: TeamRuntimeStoreErrorCode,
        message: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
            expected_revision: None,
            actual_revision: None,
        }
    }

    pub fn revision_conflict(expected: Option<u64>, actual: Option<u64>) -> Self {
        Self {
            code: TeamRuntimeStoreErrorCode::RevisionConflict,
            message: format!(
                "Team runtime revision conflict: expected {expected:?}, found {actual:?}"
            ),
            retryable: true,
            expected_revision: expected,
            actual_revision: actual,
        }
    }
}

impl fmt::Display for TeamRuntimeStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl Error for TeamRuntimeStoreError {}

#[async_trait]
pub trait TeamRuntimeStore: Send + Sync {
    async fn list(&self, parent_session_id: &str)
        -> Result<TeamRuntimeList, TeamRuntimeStoreError>;

    async fn load(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> Result<Option<TeamRuntimeRecord>, TeamRuntimeStoreError>;

    async fn save(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
        snapshot: TeamRuntimeSnapshot,
        expected_revision: Option<u64>,
    ) -> Result<TeamRuntimeRecord, TeamRuntimeStoreError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::team_runtime::{
        TeamExecutionProfile, TeamInstanceCreationSource, TeamInstanceLifecycle, TeamLeadBinding,
        TeamMemberBinding, TeamMemberRunStatus, TeamPhaseRunStatus, TeamRunStatus,
        TeamWorkspaceBackend, TeamWorkspaceIdentity,
    };

    fn valid_snapshot() -> TeamRuntimeSnapshot {
        let workspace = TeamWorkspaceIdentity {
            workspace_id: "workspace-1".to_string(),
            context_key: "local:workspace-1".to_string(),
            backend: TeamWorkspaceBackend::Local,
            remote_connection_id: None,
            remote_host: None,
        };
        let mut instance = TeamInstance::new(
            "instance-1",
            "definition-1",
            "revision-1",
            workspace,
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
            TeamLeadBinding::ParentPersona {
                parent_session_id: "parent-1".to_string(),
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
        let mut team_run = TeamRun::new("run-1", "instance-1", "workflow-1", 1, 2).unwrap();
        instance.set_active_run(&team_run, 2).unwrap();
        team_run
            .transition(TeamRunStatus::Running, None, 3)
            .unwrap();
        let mut member_run =
            TeamMemberRun::new("member-run-1", "run-1", "instance-1", "member-1", 1, 2).unwrap();
        member_run.child_session_id = Some("child-1".to_string());
        member_run.subagent_task_id = Some("task-1".to_string());
        member_run
            .transition(TeamMemberRunStatus::Queued, None, 3)
            .unwrap();
        let mut phase_run = TeamPhaseRun::new(
            "phase-run-1",
            "run-1",
            "instance-1",
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

    #[test]
    fn valid_snapshot_preserves_child_runtime_references() {
        let snapshot = valid_snapshot();
        snapshot.validate().unwrap();
        assert_eq!(
            snapshot.member_runs[0].child_session_id.as_deref(),
            Some("child-1")
        );
        assert_eq!(
            snapshot.member_runs[0].subagent_task_id.as_deref(),
            Some("task-1")
        );
    }

    #[test]
    fn snapshot_rejects_cross_reference_errors() {
        let mut missing_team = valid_snapshot();
        missing_team.member_runs[0].team_run_id = "missing".to_string();
        assert_eq!(
            missing_team.validate().unwrap_err().code,
            TeamRuntimeSnapshotErrorCode::MissingTeamRun
        );

        let mut unknown_member = valid_snapshot();
        unknown_member.member_runs[0].member_id = "unknown".to_string();
        assert_eq!(
            unknown_member.validate().unwrap_err().code,
            TeamRuntimeSnapshotErrorCode::UnknownMember
        );

        let mut wrong_workflow = valid_snapshot();
        wrong_workflow.phase_runs[0].workflow_id = "workflow-2".to_string();
        assert_eq!(
            wrong_workflow.validate().unwrap_err().code,
            TeamRuntimeSnapshotErrorCode::WorkflowMismatch
        );
    }

    #[test]
    fn snapshot_requires_exactly_one_active_non_terminal_team_run() {
        let mut snapshot = valid_snapshot();
        snapshot.instance.active_run_id = None;
        assert_eq!(
            snapshot.validate().unwrap_err().code,
            TeamRuntimeSnapshotErrorCode::ActiveRunMismatch
        );

        let mut duplicate = valid_snapshot();
        let mut second = TeamRun::new("run-2", "instance-1", "workflow-1", 1, 3).unwrap();
        second.transition(TeamRunStatus::Running, None, 4).unwrap();
        duplicate.team_runs.push(second);
        assert_eq!(
            duplicate.validate().unwrap_err().code,
            TeamRuntimeSnapshotErrorCode::ActiveRunMismatch
        );
    }
}
