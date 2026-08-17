//! Pure Team instance and run domain contracts.
//!
//! This module owns only `TeamInstance` and run state/validation contracts. It
//! does not execute models, manage sessions, persist records, or perform I/O.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::error::Error;
use std::fmt;

pub const TEAM_RUNTIME_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TeamExecutionProfile {
    PromptOrchestrated,
    FlagshipAdapter {
        #[serde(rename = "adapterId")]
        adapter_id: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamWorkspaceBackend {
    Local,
    Remote,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWorkspaceIdentity {
    pub workspace_id: String,
    pub context_key: String,
    pub backend: TeamWorkspaceBackend,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_connection_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_host: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamInstanceCreationSource {
    UserAttachment,
    PersonaActivation,
    FixedRuntimeAdapter,
    Recovery,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TeamLeadBinding {
    ParentPersona {
        #[serde(rename = "parentSessionId")]
        parent_session_id: String,
    },
    ChildOrchestrator {
        #[serde(rename = "childSessionId")]
        child_session_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberBinding {
    pub member_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subagent_task_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamInstanceLifecycle {
    Provisioning,
    Ready,
    Unavailable,
    Archived,
}

impl TeamInstanceLifecycle {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Archived)
    }

    fn allows(self, next: Self) -> bool {
        matches!(
            (self, next),
            (
                Self::Provisioning,
                Self::Ready | Self::Unavailable | Self::Archived
            ) | (Self::Ready, Self::Unavailable | Self::Archived)
                | (Self::Unavailable, Self::Provisioning | Self::Archived)
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuntimeError {
    pub source: String,
    pub code: String,
    pub message: String,
    pub retryable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery_action: Option<String>,
}

impl TeamRuntimeError {
    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        validate_identifier("error.source", &self.source)?;
        validate_identifier("error.code", &self.code)?;
        validate_identifier("error.message", &self.message)?;
        validate_optional_identifier("error.recoveryAction", self.recovery_action.as_deref())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamInstance {
    pub schema_version: u32,
    pub team_instance_id: String,
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub workspace: TeamWorkspaceIdentity,
    pub parent_session_id: String,
    pub execution_profile: TeamExecutionProfile,
    pub lead_binding: TeamLeadBinding,
    pub member_bindings: Vec<TeamMemberBinding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_run_id: Option<String>,
    pub lifecycle: TeamInstanceLifecycle,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<TeamRuntimeError>,
    pub creation_source: TeamInstanceCreationSource,
    pub created_at: u64,
    pub updated_at: u64,
}

impl TeamInstance {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        team_instance_id: impl Into<String>,
        team_definition_id: impl Into<String>,
        team_definition_revision: impl Into<String>,
        workspace: TeamWorkspaceIdentity,
        parent_session_id: impl Into<String>,
        execution_profile: TeamExecutionProfile,
        lead_binding: TeamLeadBinding,
        member_bindings: Vec<TeamMemberBinding>,
        creation_source: TeamInstanceCreationSource,
        created_at: u64,
    ) -> Result<Self, TeamRuntimeContractError> {
        let instance = Self {
            schema_version: TEAM_RUNTIME_SCHEMA_VERSION,
            team_instance_id: team_instance_id.into(),
            team_definition_id: team_definition_id.into(),
            team_definition_revision: team_definition_revision.into(),
            workspace,
            parent_session_id: parent_session_id.into(),
            execution_profile,
            lead_binding,
            member_bindings,
            active_run_id: None,
            lifecycle: TeamInstanceLifecycle::Provisioning,
            error: None,
            creation_source,
            created_at,
            updated_at: created_at,
        };
        instance.validate()?;
        Ok(instance)
    }

    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        if self.schema_version != TEAM_RUNTIME_SCHEMA_VERSION {
            return Err(TeamRuntimeContractError::UnsupportedSchemaVersion {
                found: self.schema_version,
            });
        }
        validate_identifier("teamInstanceId", &self.team_instance_id)?;
        validate_identifier("teamDefinitionId", &self.team_definition_id)?;
        validate_identifier("teamDefinitionRevision", &self.team_definition_revision)?;
        validate_identifier("parentSessionId", &self.parent_session_id)?;
        validate_timestamps(self.created_at, self.updated_at)?;
        self.workspace.validate()?;
        self.execution_profile.validate()?;
        self.lead_binding.validate(&self.parent_session_id)?;
        validate_execution_binding(&self.execution_profile, &self.lead_binding)?;

        let mut member_ids = HashSet::new();
        for binding in &self.member_bindings {
            binding.validate()?;
            if !member_ids.insert(binding.member_id.as_str()) {
                return Err(TeamRuntimeContractError::DuplicateMemberId {
                    member_id: binding.member_id.clone(),
                });
            }
        }
        validate_optional_identifier("activeRunId", self.active_run_id.as_deref())?;
        if self.active_run_id.is_some() && self.lifecycle != TeamInstanceLifecycle::Ready {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "an active run requires a ready Team instance".to_string(),
            });
        }
        validate_runtime_error(
            "team instance",
            matches!(self.lifecycle, TeamInstanceLifecycle::Unavailable),
            self.error.as_ref(),
        )?;
        Ok(())
    }

    pub fn transition(
        &mut self,
        next: TeamInstanceLifecycle,
        error: Option<TeamRuntimeError>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        if !self.lifecycle.allows(next) {
            return Err(invalid_transition("team instance", self.lifecycle, next));
        }
        if self.active_run_id.is_some() && next != TeamInstanceLifecycle::Ready {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "clear the active run before leaving the ready lifecycle".to_string(),
            });
        }
        let mut candidate = self.clone();
        candidate.lifecycle = next;
        candidate.error = error;
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    pub fn set_active_run(
        &mut self,
        run: &TeamRun,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at.max(run.updated_at), updated_at)?;
        self.validate()?;
        run.validate()?;
        if self.lifecycle != TeamInstanceLifecycle::Ready {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "only a ready Team instance may bind an active run".to_string(),
            });
        }
        if run.team_instance_id != self.team_instance_id {
            return Err(TeamRuntimeContractError::IdentityMismatch {
                field: "teamInstanceId",
                expected: self.team_instance_id.clone(),
                actual: run.team_instance_id.clone(),
            });
        }
        if run.status.is_terminal() {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "a terminal Team run cannot become active".to_string(),
            });
        }
        if let Some(active_run_id) = &self.active_run_id {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: format!("Team instance already has active run '{active_run_id}'"),
            });
        }
        let mut candidate = self.clone();
        candidate.active_run_id = Some(run.team_run_id.clone());
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    pub fn clear_active_run(
        &mut self,
        run: &TeamRun,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at.max(run.updated_at), updated_at)?;
        self.validate()?;
        run.validate()?;
        if run.team_instance_id != self.team_instance_id {
            return Err(TeamRuntimeContractError::IdentityMismatch {
                field: "teamInstanceId",
                expected: self.team_instance_id.clone(),
                actual: run.team_instance_id.clone(),
            });
        }
        if self.active_run_id.as_deref() != Some(run.team_run_id.as_str()) {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "the supplied run is not the Team instance's active run".to_string(),
            });
        }
        if !run.status.is_terminal() {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "an active run can only be cleared after reaching a terminal state"
                    .to_string(),
            });
        }
        let mut candidate = self.clone();
        candidate.active_run_id = None;
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    pub fn align_member_binding(
        &mut self,
        member_id: &str,
        child_session_id: Option<String>,
        subagent_task_id: Option<String>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        let mut candidate = self.clone();
        let binding = candidate
            .member_bindings
            .iter_mut()
            .find(|binding| binding.member_id == member_id)
            .ok_or_else(|| TeamRuntimeContractError::RuntimeBindingInconsistent {
                message: format!("Team instance has no member binding for '{member_id}'"),
            })?;
        if let (Some(current), Some(next)) = (
            binding.subagent_task_id.as_deref(),
            subagent_task_id.as_deref(),
        ) {
            if current != next {
                return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                    message: format!(
                        "member task binding mismatch: expected '{current}', received '{next}'"
                    ),
                });
            }
        }
        if let (Some(current), Some(next)) = (
            binding.child_session_id.as_deref(),
            child_session_id.as_deref(),
        ) {
            if current != next {
                return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                    message: format!(
                        "member child binding mismatch: expected '{current}', received '{next}'"
                    ),
                });
            }
        }
        if child_session_id.is_some() {
            binding.child_session_id = child_session_id;
        }
        if subagent_task_id.is_some() {
            binding.subagent_task_id = subagent_task_id;
        }
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    /// Rotates the instance-level pointer to the member execution reserved for
    /// a newly active Team run. Historical member runs keep their own durable
    /// task and child-session bindings; this pointer only identifies the
    /// member's current execution.
    pub fn begin_member_run_binding(
        &mut self,
        member_id: &str,
        subagent_task_id: String,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        validate_identifier("subagentTaskId", &subagent_task_id)?;
        self.validate()?;
        if self.lifecycle != TeamInstanceLifecycle::Ready || self.active_run_id.is_none() {
            return Err(TeamRuntimeContractError::ActiveRunInconsistent {
                message: "a member execution can only begin for an active ready Team run"
                    .to_string(),
            });
        }

        let mut candidate = self.clone();
        let binding = candidate
            .member_bindings
            .iter_mut()
            .find(|binding| binding.member_id == member_id)
            .ok_or_else(|| TeamRuntimeContractError::RuntimeBindingInconsistent {
                message: format!("Team instance has no member binding for '{member_id}'"),
            })?;
        binding.child_session_id = None;
        binding.subagent_task_id = Some(subagent_task_id);
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }
}

impl TeamExecutionProfile {
    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        match self {
            Self::PromptOrchestrated => Ok(()),
            Self::FlagshipAdapter { adapter_id } => validate_identifier("adapterId", adapter_id),
        }
    }
}

impl TeamWorkspaceIdentity {
    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        validate_identifier("workspaceId", &self.workspace_id)?;
        validate_identifier("contextKey", &self.context_key)?;
        match self.backend {
            TeamWorkspaceBackend::Local => {
                if self.remote_connection_id.is_some() || self.remote_host.is_some() {
                    return Err(TeamRuntimeContractError::InvalidWorkspace {
                        message: "a local workspace cannot carry remote connection facts"
                            .to_string(),
                    });
                }
            }
            TeamWorkspaceBackend::Remote => {
                validate_required_identifier(
                    "remoteConnectionId",
                    self.remote_connection_id.as_deref(),
                )?;
                validate_required_identifier("remoteHost", self.remote_host.as_deref())?;
            }
        }
        Ok(())
    }
}

impl TeamLeadBinding {
    pub fn validate(&self, parent_session_id: &str) -> Result<(), TeamRuntimeContractError> {
        match self {
            Self::ParentPersona {
                parent_session_id: binding_parent_session_id,
            } => {
                validate_identifier("leadBinding.parentSessionId", binding_parent_session_id)?;
                if binding_parent_session_id != parent_session_id {
                    return Err(TeamRuntimeContractError::IdentityMismatch {
                        field: "leadBinding.parentSessionId",
                        expected: parent_session_id.to_string(),
                        actual: binding_parent_session_id.clone(),
                    });
                }
            }
            Self::ChildOrchestrator { child_session_id } => {
                validate_identifier("leadBinding.childSessionId", child_session_id)?;
            }
        }
        Ok(())
    }
}

fn validate_execution_binding(
    execution_profile: &TeamExecutionProfile,
    lead_binding: &TeamLeadBinding,
) -> Result<(), TeamRuntimeContractError> {
    if matches!(execution_profile, TeamExecutionProfile::PromptOrchestrated)
        && matches!(lead_binding, TeamLeadBinding::ChildOrchestrator { .. })
    {
        return Err(TeamRuntimeContractError::IncompatibleExecutionBinding {
            execution_profile: "prompt_orchestrated",
            lead_binding: "child_orchestrator",
        });
    }
    Ok(())
}

impl TeamMemberBinding {
    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        validate_identifier("memberId", &self.member_id)?;
        validate_optional_identifier("childSessionId", self.child_session_id.as_deref())?;
        validate_optional_identifier("subagentTaskId", self.subagent_task_id.as_deref())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRunStatus {
    Queued,
    Running,
    WaitingUser,
    Blocked,
    Completed,
    Failed,
    Interrupted,
    Cancelled,
}

impl TeamRunStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Interrupted | Self::Cancelled
        )
    }

    fn allows(self, next: Self) -> bool {
        matches!(
            (self, next),
            (
                Self::Queued,
                Self::Running | Self::Failed | Self::Interrupted | Self::Cancelled
            ) | (
                Self::Running,
                Self::WaitingUser
                    | Self::Blocked
                    | Self::Completed
                    | Self::Failed
                    | Self::Interrupted
                    | Self::Cancelled
            ) | (
                Self::WaitingUser,
                Self::Running | Self::Blocked | Self::Failed | Self::Interrupted | Self::Cancelled
            ) | (
                Self::Blocked,
                Self::Running | Self::Failed | Self::Interrupted | Self::Cancelled
            )
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamMemberRunStatus {
    Idle,
    Queued,
    Running,
    Waiting,
    Completed,
    Failed,
    Interrupted,
    Cancelled,
}

impl TeamMemberRunStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Interrupted | Self::Cancelled
        )
    }

    fn allows(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Idle, Self::Queued | Self::Failed | Self::Cancelled)
                | (
                    Self::Queued,
                    Self::Running | Self::Failed | Self::Interrupted | Self::Cancelled
                )
                | (
                    Self::Running,
                    Self::Waiting
                        | Self::Completed
                        | Self::Failed
                        | Self::Interrupted
                        | Self::Cancelled
                )
                | (
                    Self::Waiting,
                    Self::Running | Self::Failed | Self::Interrupted | Self::Cancelled
                )
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamPhaseRunStatus {
    Pending,
    Ready,
    Running,
    Blocked,
    Completed,
    Failed,
    Skipped,
    Cancelled,
}

impl TeamPhaseRunStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Skipped | Self::Cancelled
        )
    }

    fn allows(self, next: Self) -> bool {
        matches!(
            (self, next),
            (
                Self::Pending,
                Self::Ready | Self::Failed | Self::Skipped | Self::Cancelled
            ) | (
                Self::Ready,
                Self::Running | Self::Failed | Self::Skipped | Self::Cancelled
            ) | (
                Self::Running,
                Self::Blocked | Self::Completed | Self::Failed | Self::Cancelled
            ) | (
                Self::Blocked,
                Self::Ready | Self::Running | Self::Failed | Self::Skipped | Self::Cancelled
            )
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRun {
    pub team_run_id: String,
    pub team_instance_id: String,
    pub workflow_id: String,
    pub objective: String,
    pub parent_dialog_turn_id: String,
    pub parent_tool_call_id: String,
    pub attempt: u32,
    pub status: TeamRunStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<TeamRuntimeError>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
}

impl TeamRun {
    /// Compatibility constructor for storage fixtures created before run scope became durable.
    /// Runtime services must use [`Self::new_scoped`] so request scope is never reconstructed
    /// from a replayed command.
    #[cfg(test)]
    pub fn new(
        team_run_id: impl Into<String>,
        team_instance_id: impl Into<String>,
        workflow_id: impl Into<String>,
        attempt: u32,
        created_at: u64,
    ) -> Result<Self, TeamRuntimeContractError> {
        Self::new_scoped(
            team_run_id,
            team_instance_id,
            workflow_id,
            "legacy-objective",
            "legacy-parent-dialog-turn",
            "legacy-parent-tool-call",
            attempt,
            created_at,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new_scoped(
        team_run_id: impl Into<String>,
        team_instance_id: impl Into<String>,
        workflow_id: impl Into<String>,
        objective: impl Into<String>,
        parent_dialog_turn_id: impl Into<String>,
        parent_tool_call_id: impl Into<String>,
        attempt: u32,
        created_at: u64,
    ) -> Result<Self, TeamRuntimeContractError> {
        let run = Self {
            team_run_id: team_run_id.into(),
            team_instance_id: team_instance_id.into(),
            workflow_id: workflow_id.into(),
            objective: objective.into(),
            parent_dialog_turn_id: parent_dialog_turn_id.into(),
            parent_tool_call_id: parent_tool_call_id.into(),
            attempt,
            status: TeamRunStatus::Queued,
            error: None,
            created_at,
            updated_at: created_at,
            started_at: None,
            finished_at: None,
        };
        run.validate()?;
        Ok(run)
    }

    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        validate_identifier("teamRunId", &self.team_run_id)?;
        validate_identifier("teamInstanceId", &self.team_instance_id)?;
        validate_identifier("workflowId", &self.workflow_id)?;
        validate_identifier("objective", &self.objective)?;
        validate_identifier("parentDialogTurnId", &self.parent_dialog_turn_id)?;
        validate_identifier("parentToolCallId", &self.parent_tool_call_id)?;
        validate_attempt(self.attempt)?;
        validate_run_timestamps(
            self.created_at,
            self.updated_at,
            self.started_at,
            self.finished_at,
            match self.status {
                TeamRunStatus::Queued => StartedAtRequirement::Forbidden,
                TeamRunStatus::Running
                | TeamRunStatus::WaitingUser
                | TeamRunStatus::Blocked
                | TeamRunStatus::Completed => StartedAtRequirement::Required,
                TeamRunStatus::Failed | TeamRunStatus::Interrupted | TeamRunStatus::Cancelled => {
                    StartedAtRequirement::Optional
                }
            },
            self.status.is_terminal(),
        )?;
        validate_runtime_error(
            "team run",
            matches!(self.status, TeamRunStatus::Blocked | TeamRunStatus::Failed),
            self.error.as_ref(),
        )
    }

    pub fn transition(
        &mut self,
        next: TeamRunStatus,
        error: Option<TeamRuntimeError>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        if !self.status.allows(next) {
            return Err(invalid_transition("team run", self.status, next));
        }
        let mut candidate = self.clone();
        candidate.status = next;
        candidate.error = error;
        candidate.updated_at = updated_at;
        if candidate.started_at.is_none() && next == TeamRunStatus::Running {
            candidate.started_at = Some(updated_at);
        }
        candidate.finished_at = next.is_terminal().then_some(updated_at);
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberRun {
    pub member_run_id: String,
    pub team_run_id: String,
    pub team_instance_id: String,
    pub member_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_dialog_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subagent_task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub applied_operation_ids: Vec<String>,
    pub attempt: u32,
    pub status: TeamMemberRunStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<TeamRuntimeError>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_summary: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
}

/// Concise PRD-facing name for a member execution record.
pub type MemberRun = TeamMemberRun;

impl TeamMemberRun {
    pub fn new(
        member_run_id: impl Into<String>,
        team_run_id: impl Into<String>,
        team_instance_id: impl Into<String>,
        member_id: impl Into<String>,
        attempt: u32,
        created_at: u64,
    ) -> Result<Self, TeamRuntimeContractError> {
        let run = Self {
            member_run_id: member_run_id.into(),
            team_run_id: team_run_id.into(),
            team_instance_id: team_instance_id.into(),
            member_id: member_id.into(),
            phase_id: None,
            operation_id: None,
            parent_dialog_turn_id: None,
            parent_tool_call_id: None,
            agent_id: None,
            child_session_id: None,
            subagent_task_id: None,
            applied_operation_ids: vec![],
            attempt,
            status: TeamMemberRunStatus::Idle,
            error: None,
            completion_summary: None,
            created_at,
            updated_at: created_at,
            started_at: None,
            finished_at: None,
        };
        run.validate()?;
        Ok(run)
    }

    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        validate_identifier("memberRunId", &self.member_run_id)?;
        validate_identifier("teamRunId", &self.team_run_id)?;
        validate_identifier("teamInstanceId", &self.team_instance_id)?;
        validate_identifier("memberId", &self.member_id)?;
        validate_optional_identifier("phaseId", self.phase_id.as_deref())?;
        validate_optional_identifier("operationId", self.operation_id.as_deref())?;
        validate_optional_identifier("parentDialogTurnId", self.parent_dialog_turn_id.as_deref())?;
        validate_optional_identifier("parentToolCallId", self.parent_tool_call_id.as_deref())?;
        validate_optional_identifier("agentId", self.agent_id.as_deref())?;
        validate_optional_identifier("childSessionId", self.child_session_id.as_deref())?;
        validate_optional_identifier("subagentTaskId", self.subagent_task_id.as_deref())?;
        if self
            .completion_summary
            .as_ref()
            .is_some_and(|summary| summary.trim().is_empty() || summary.chars().count() > 4000)
        {
            return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                message: "member completion summary must contain 1 to 4000 printable characters"
                    .to_string(),
            });
        }
        let mut applied_operation_ids = HashSet::new();
        for operation_id in &self.applied_operation_ids {
            validate_identifier("appliedOperationId", operation_id)?;
            if !applied_operation_ids.insert(operation_id.as_str()) {
                return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                    message: format!("duplicate applied operation ID '{operation_id}'"),
                });
            }
        }
        validate_attempt(self.attempt)?;
        validate_run_timestamps(
            self.created_at,
            self.updated_at,
            self.started_at,
            self.finished_at,
            match self.status {
                TeamMemberRunStatus::Idle | TeamMemberRunStatus::Queued => {
                    StartedAtRequirement::Forbidden
                }
                TeamMemberRunStatus::Running
                | TeamMemberRunStatus::Waiting
                | TeamMemberRunStatus::Completed => StartedAtRequirement::Required,
                TeamMemberRunStatus::Failed
                | TeamMemberRunStatus::Interrupted
                | TeamMemberRunStatus::Cancelled => StartedAtRequirement::Optional,
            },
            self.status.is_terminal(),
        )?;
        validate_runtime_error(
            "member run",
            matches!(self.status, TeamMemberRunStatus::Failed),
            self.error.as_ref(),
        )
    }

    pub fn transition(
        &mut self,
        next: TeamMemberRunStatus,
        error: Option<TeamRuntimeError>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        if !self.status.allows(next) {
            return Err(invalid_transition("member run", self.status, next));
        }
        let mut candidate = self.clone();
        candidate.status = next;
        candidate.error = error;
        candidate.updated_at = updated_at;
        if candidate.started_at.is_none() && next == TeamMemberRunStatus::Running {
            candidate.started_at = Some(updated_at);
        }
        candidate.finished_at = next.is_terminal().then_some(updated_at);
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn reserve_execution(
        &mut self,
        phase_id: impl Into<String>,
        operation_id: impl Into<String>,
        parent_dialog_turn_id: impl Into<String>,
        parent_tool_call_id: impl Into<String>,
        agent_id: impl Into<String>,
        subagent_task_id: impl Into<String>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        if self.status != TeamMemberRunStatus::Idle {
            return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                message: "only an idle member run may reserve an execution".to_string(),
            });
        }
        let mut candidate = self.clone();
        candidate.phase_id = Some(phase_id.into());
        candidate.operation_id = Some(operation_id.into());
        candidate.parent_dialog_turn_id = Some(parent_dialog_turn_id.into());
        candidate.parent_tool_call_id = Some(parent_tool_call_id.into());
        candidate.agent_id = Some(agent_id.into());
        candidate.subagent_task_id = Some(subagent_task_id.into());
        candidate.transition(TeamMemberRunStatus::Queued, None, updated_at)?;
        *self = candidate;
        Ok(())
    }

    pub fn align_runtime_references(
        &mut self,
        child_session_id: Option<String>,
        subagent_task_id: Option<String>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        if let (Some(current), Some(next)) = (
            self.subagent_task_id.as_deref(),
            subagent_task_id.as_deref(),
        ) {
            if current != next {
                return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                    message: format!(
                        "member run task binding mismatch: expected '{current}', received '{next}'"
                    ),
                });
            }
        }
        if let (Some(current), Some(next)) = (
            self.child_session_id.as_deref(),
            child_session_id.as_deref(),
        ) {
            if current != next {
                return Err(TeamRuntimeContractError::RuntimeBindingInconsistent {
                    message: format!(
                        "member run child binding mismatch: expected '{current}', received '{next}'"
                    ),
                });
            }
        }
        let mut candidate = self.clone();
        if child_session_id.is_some() {
            candidate.child_session_id = child_session_id;
        }
        if subagent_task_id.is_some() {
            candidate.subagent_task_id = subagent_task_id;
        }
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    pub fn has_applied_operation(&self, operation_id: &str) -> bool {
        self.applied_operation_ids
            .iter()
            .any(|applied| applied == operation_id)
    }

    pub fn mark_operation_applied(
        &mut self,
        operation_id: impl Into<String>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        let operation_id = operation_id.into();
        validate_identifier("appliedOperationId", &operation_id)?;
        if self.has_applied_operation(&operation_id) {
            return Ok(());
        }
        let mut candidate = self.clone();
        candidate.applied_operation_ids.push(operation_id);
        candidate.updated_at = updated_at;
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamPhaseRun {
    pub phase_run_id: String,
    pub team_run_id: String,
    pub team_instance_id: String,
    pub workflow_id: String,
    pub phase_id: String,
    pub attempt: u32,
    pub status: TeamPhaseRunStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<TeamRuntimeError>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
}

/// Concise PRD-facing name for a workflow phase execution record.
pub type PhaseRun = TeamPhaseRun;

impl TeamPhaseRun {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        phase_run_id: impl Into<String>,
        team_run_id: impl Into<String>,
        team_instance_id: impl Into<String>,
        workflow_id: impl Into<String>,
        phase_id: impl Into<String>,
        attempt: u32,
        created_at: u64,
    ) -> Result<Self, TeamRuntimeContractError> {
        let run = Self {
            phase_run_id: phase_run_id.into(),
            team_run_id: team_run_id.into(),
            team_instance_id: team_instance_id.into(),
            workflow_id: workflow_id.into(),
            phase_id: phase_id.into(),
            attempt,
            status: TeamPhaseRunStatus::Pending,
            error: None,
            created_at,
            updated_at: created_at,
            started_at: None,
            finished_at: None,
        };
        run.validate()?;
        Ok(run)
    }

    pub fn validate(&self) -> Result<(), TeamRuntimeContractError> {
        validate_identifier("phaseRunId", &self.phase_run_id)?;
        validate_identifier("teamRunId", &self.team_run_id)?;
        validate_identifier("teamInstanceId", &self.team_instance_id)?;
        validate_identifier("workflowId", &self.workflow_id)?;
        validate_identifier("phaseId", &self.phase_id)?;
        validate_attempt(self.attempt)?;
        validate_run_timestamps(
            self.created_at,
            self.updated_at,
            self.started_at,
            self.finished_at,
            match self.status {
                TeamPhaseRunStatus::Pending => StartedAtRequirement::Forbidden,
                TeamPhaseRunStatus::Ready
                | TeamPhaseRunStatus::Skipped
                | TeamPhaseRunStatus::Cancelled => StartedAtRequirement::Optional,
                TeamPhaseRunStatus::Running
                | TeamPhaseRunStatus::Blocked
                | TeamPhaseRunStatus::Completed => StartedAtRequirement::Required,
                TeamPhaseRunStatus::Failed => StartedAtRequirement::Optional,
            },
            self.status.is_terminal(),
        )?;
        validate_runtime_error(
            "phase run",
            matches!(
                self.status,
                TeamPhaseRunStatus::Blocked | TeamPhaseRunStatus::Failed
            ),
            self.error.as_ref(),
        )
    }

    pub fn transition(
        &mut self,
        next: TeamPhaseRunStatus,
        error: Option<TeamRuntimeError>,
        updated_at: u64,
    ) -> Result<(), TeamRuntimeContractError> {
        validate_transition_time(self.updated_at, updated_at)?;
        if !self.status.allows(next) {
            return Err(invalid_transition("phase run", self.status, next));
        }
        let mut candidate = self.clone();
        candidate.status = next;
        candidate.error = error;
        candidate.updated_at = updated_at;
        if candidate.started_at.is_none() && next == TeamPhaseRunStatus::Running {
            candidate.started_at = Some(updated_at);
        }
        candidate.finished_at = next.is_terminal().then_some(updated_at);
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TeamRuntimeContractError {
    EmptyIdentifier {
        field: &'static str,
    },
    UnsupportedSchemaVersion {
        found: u32,
    },
    InvalidWorkspace {
        message: String,
    },
    IdentityMismatch {
        field: &'static str,
        expected: String,
        actual: String,
    },
    DuplicateMemberId {
        member_id: String,
    },
    ActiveRunInconsistent {
        message: String,
    },
    RuntimeBindingInconsistent {
        message: String,
    },
    IncompatibleExecutionBinding {
        execution_profile: &'static str,
        lead_binding: &'static str,
    },
    InvalidAttempt {
        attempt: u32,
    },
    InvalidTimestamps {
        message: String,
    },
    MissingRuntimeError {
        entity: &'static str,
    },
    UnexpectedRuntimeError {
        entity: &'static str,
    },
    InvalidTransition {
        entity: &'static str,
        from: String,
        to: String,
    },
}

impl fmt::Display for TeamRuntimeContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyIdentifier { field } => write!(formatter, "{field} cannot be empty"),
            Self::UnsupportedSchemaVersion { found } => {
                write!(formatter, "unsupported Team runtime schema version {found}")
            }
            Self::InvalidWorkspace { message }
            | Self::ActiveRunInconsistent { message }
            | Self::RuntimeBindingInconsistent { message } => formatter.write_str(message),
            Self::IdentityMismatch {
                field,
                expected,
                actual,
            } => write!(
                formatter,
                "{field} mismatch: expected '{expected}', received '{actual}'"
            ),
            Self::DuplicateMemberId { member_id } => {
                write!(formatter, "duplicate Team member binding '{member_id}'")
            }
            Self::IncompatibleExecutionBinding {
                execution_profile,
                lead_binding,
            } => write!(
                formatter,
                "lead binding '{lead_binding}' is incompatible with execution profile '{execution_profile}'"
            ),
            Self::InvalidAttempt { attempt } => {
                write!(
                    formatter,
                    "run attempt must be positive, received {attempt}"
                )
            }
            Self::InvalidTimestamps { message } => formatter.write_str(message),
            Self::MissingRuntimeError { entity } => {
                write!(
                    formatter,
                    "{entity} error status requires structured error facts"
                )
            }
            Self::UnexpectedRuntimeError { entity } => {
                write!(formatter, "{entity} non-error status cannot carry runtime error facts")
            }
            Self::InvalidTransition { entity, from, to } => {
                write!(formatter, "invalid {entity} transition from {from} to {to}")
            }
        }
    }
}

impl Error for TeamRuntimeContractError {}

fn validate_identifier(field: &'static str, value: &str) -> Result<(), TeamRuntimeContractError> {
    if value.trim().is_empty() {
        Err(TeamRuntimeContractError::EmptyIdentifier { field })
    } else {
        Ok(())
    }
}

fn validate_optional_identifier(
    field: &'static str,
    value: Option<&str>,
) -> Result<(), TeamRuntimeContractError> {
    match value {
        Some(value) => validate_identifier(field, value),
        None => Ok(()),
    }
}

fn validate_required_identifier(
    field: &'static str,
    value: Option<&str>,
) -> Result<(), TeamRuntimeContractError> {
    value.map_or(
        Err(TeamRuntimeContractError::EmptyIdentifier { field }),
        |value| validate_identifier(field, value),
    )
}

fn validate_attempt(attempt: u32) -> Result<(), TeamRuntimeContractError> {
    if attempt == 0 {
        Err(TeamRuntimeContractError::InvalidAttempt { attempt })
    } else {
        Ok(())
    }
}

fn validate_timestamps(created_at: u64, updated_at: u64) -> Result<(), TeamRuntimeContractError> {
    if updated_at < created_at {
        Err(TeamRuntimeContractError::InvalidTimestamps {
            message: "updatedAt cannot precede createdAt".to_string(),
        })
    } else {
        Ok(())
    }
}

fn validate_transition_time(
    current_updated_at: u64,
    next_updated_at: u64,
) -> Result<(), TeamRuntimeContractError> {
    if next_updated_at < current_updated_at {
        Err(TeamRuntimeContractError::InvalidTimestamps {
            message: "a state transition cannot move updatedAt backwards".to_string(),
        })
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StartedAtRequirement {
    Forbidden,
    Required,
    Optional,
}

fn validate_run_timestamps(
    created_at: u64,
    updated_at: u64,
    started_at: Option<u64>,
    finished_at: Option<u64>,
    started_at_requirement: StartedAtRequirement,
    terminal: bool,
) -> Result<(), TeamRuntimeContractError> {
    validate_timestamps(created_at, updated_at)?;
    match (started_at_requirement, started_at) {
        (StartedAtRequirement::Forbidden, Some(_)) => {
            return Err(TeamRuntimeContractError::InvalidTimestamps {
                message: "the current run status cannot carry startedAt".to_string(),
            });
        }
        (StartedAtRequirement::Required, None) => {
            return Err(TeamRuntimeContractError::InvalidTimestamps {
                message: "the current run status requires startedAt".to_string(),
            });
        }
        _ => {}
    }
    if let Some(started_at) = started_at {
        if started_at < created_at || started_at > updated_at {
            return Err(TeamRuntimeContractError::InvalidTimestamps {
                message: "startedAt must be between createdAt and updatedAt".to_string(),
            });
        }
    }
    match (terminal, finished_at) {
        (true, Some(finished_at))
            if finished_at >= started_at.unwrap_or(created_at) && finished_at <= updated_at =>
        {
            Ok(())
        }
        (true, Some(_)) => Err(TeamRuntimeContractError::InvalidTimestamps {
            message: "finishedAt must be between startedAt and updatedAt".to_string(),
        }),
        (true, None) => Err(TeamRuntimeContractError::InvalidTimestamps {
            message: "a terminal run requires finishedAt".to_string(),
        }),
        (false, Some(_)) => Err(TeamRuntimeContractError::InvalidTimestamps {
            message: "a non-terminal run cannot carry finishedAt".to_string(),
        }),
        (false, None) => Ok(()),
    }
}

fn validate_runtime_error(
    entity: &'static str,
    required: bool,
    error: Option<&TeamRuntimeError>,
) -> Result<(), TeamRuntimeContractError> {
    if required && error.is_none() {
        return Err(TeamRuntimeContractError::MissingRuntimeError { entity });
    }
    if !required && error.is_some() {
        return Err(TeamRuntimeContractError::UnexpectedRuntimeError { entity });
    }
    if let Some(error) = error {
        error.validate()?;
    }
    Ok(())
}

fn invalid_transition(
    entity: &'static str,
    from: impl fmt::Debug,
    to: impl fmt::Debug,
) -> TeamRuntimeContractError {
    TeamRuntimeContractError::InvalidTransition {
        entity,
        from: format!("{from:?}").to_ascii_lowercase(),
        to: format!("{to:?}").to_ascii_lowercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_workspace(id: &str) -> TeamWorkspaceIdentity {
        TeamWorkspaceIdentity {
            workspace_id: id.to_string(),
            context_key: format!("local:{id}"),
            backend: TeamWorkspaceBackend::Local,
            remote_connection_id: None,
            remote_host: None,
        }
    }

    fn runtime_error() -> TeamRuntimeError {
        TeamRuntimeError {
            source: "team_runtime_adapter".to_string(),
            code: "member_failed".to_string(),
            message: "member execution failed".to_string(),
            retryable: true,
            recovery_action: Some("retry_member".to_string()),
        }
    }

    fn scoped_team_run(id: &str, created_at: u64) -> TeamRun {
        TeamRun::new_scoped(
            id,
            "instance-1",
            "workflow-1",
            "objective",
            "parent-turn",
            "parent-tool",
            1,
            created_at,
        )
        .expect("valid scoped Team run")
    }

    #[test]
    fn team_run_persists_required_start_scope() {
        let run = scoped_team_run("run-scoped", 1);
        let value = serde_json::to_value(&run).expect("serialize Team run");
        assert_eq!(value["objective"], "objective");
        assert_eq!(value["parentDialogTurnId"], "parent-turn");
        assert_eq!(value["parentToolCallId"], "parent-tool");

        let mut missing_scope = value;
        missing_scope.as_object_mut().unwrap().remove("objective");
        assert!(serde_json::from_value::<TeamRun>(missing_scope).is_err());
        assert!(TeamRun::new_scoped(
            "run-invalid",
            "instance-1",
            "workflow-1",
            " ",
            "parent-turn",
            "parent-tool",
            1,
            1,
        )
        .is_err());
    }

    #[test]
    fn pending_and_ready_phases_may_fail_before_start() {
        for ready in [false, true] {
            let mut phase = TeamPhaseRun::new(
                if ready {
                    "phase-ready"
                } else {
                    "phase-pending"
                },
                "run-1",
                "instance-1",
                "workflow-1",
                "phase-1",
                1,
                1,
            )
            .unwrap();
            if ready {
                phase
                    .transition(TeamPhaseRunStatus::Ready, None, 2)
                    .unwrap();
            }
            phase
                .transition(TeamPhaseRunStatus::Failed, Some(runtime_error()), 3)
                .unwrap();
            assert_eq!(phase.started_at, None);
            assert_eq!(phase.finished_at, Some(3));
        }
    }

    fn instance_with_profile(
        id: &str,
        workspace_id: &str,
        parent_session_id: &str,
        profile: TeamExecutionProfile,
    ) -> TeamInstance {
        TeamInstance::new(
            id,
            "definition-1",
            "revision-1",
            local_workspace(workspace_id),
            parent_session_id,
            profile,
            TeamLeadBinding::ParentPersona {
                parent_session_id: parent_session_id.to_string(),
            },
            vec![TeamMemberBinding {
                member_id: "specialist-1".to_string(),
                child_session_id: Some(format!("{parent_session_id}-child")),
                subagent_task_id: Some("task-1".to_string()),
            }],
            TeamInstanceCreationSource::PersonaActivation,
            10,
        )
        .expect("valid instance")
    }

    fn instance_with_binding(
        profile: TeamExecutionProfile,
        lead_binding: TeamLeadBinding,
    ) -> Result<TeamInstance, TeamRuntimeContractError> {
        TeamInstance::new(
            "instance-binding",
            "definition-1",
            "revision-1",
            local_workspace("workspace-1"),
            "parent-1",
            profile,
            lead_binding,
            vec![],
            TeamInstanceCreationSource::FixedRuntimeAdapter,
            10,
        )
    }

    #[test]
    fn prompt_and_flagship_instances_share_a_round_trip_contract() {
        let profiles = [
            TeamExecutionProfile::PromptOrchestrated,
            TeamExecutionProfile::FlagshipAdapter {
                adapter_id: "deep-review".to_string(),
            },
        ];

        for (index, profile) in profiles.into_iter().enumerate() {
            let instance = instance_with_profile(
                &format!("instance-{index}"),
                "workspace-1",
                "parent-1",
                profile,
            );
            let json = serde_json::to_value(&instance).expect("serialize instance");
            assert_eq!(json["schemaVersion"], TEAM_RUNTIME_SCHEMA_VERSION);
            assert!(json["executionProfile"]["kind"].is_string());
            let decoded: TeamInstance = serde_json::from_value(json).expect("deserialize instance");
            assert_eq!(decoded, instance);
        }
    }

    #[test]
    fn execution_profiles_accept_only_compatible_lead_bindings() {
        assert!(instance_with_binding(
            TeamExecutionProfile::PromptOrchestrated,
            TeamLeadBinding::ParentPersona {
                parent_session_id: "parent-1".to_string(),
            },
        )
        .is_ok());

        assert!(matches!(
            instance_with_binding(
                TeamExecutionProfile::PromptOrchestrated,
                TeamLeadBinding::ChildOrchestrator {
                    child_session_id: "lead-child-1".to_string(),
                },
            ),
            Err(TeamRuntimeContractError::IncompatibleExecutionBinding {
                execution_profile: "prompt_orchestrated",
                lead_binding: "child_orchestrator",
            })
        ));

        for lead_binding in [
            TeamLeadBinding::ParentPersona {
                parent_session_id: "parent-1".to_string(),
            },
            TeamLeadBinding::ChildOrchestrator {
                child_session_id: "lead-child-1".to_string(),
            },
        ] {
            assert!(instance_with_binding(
                TeamExecutionProfile::FlagshipAdapter {
                    adapter_id: "deep-review".to_string(),
                },
                lead_binding,
            )
            .is_ok());
        }
    }

    #[test]
    fn workspace_and_parent_session_identity_are_isolated() {
        let first = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        let second = instance_with_profile(
            "instance-2",
            "workspace-2",
            "parent-2",
            TeamExecutionProfile::PromptOrchestrated,
        );

        assert_ne!(first.workspace.workspace_id, second.workspace.workspace_id);
        assert_ne!(first.workspace.context_key, second.workspace.context_key);
        assert_ne!(first.parent_session_id, second.parent_session_id);

        let mut mismatched = first;
        mismatched.lead_binding = TeamLeadBinding::ParentPersona {
            parent_session_id: second.parent_session_id,
        };
        assert!(matches!(
            mismatched.validate(),
            Err(TeamRuntimeContractError::IdentityMismatch { .. })
        ));
    }

    #[test]
    fn validates_legal_and_illegal_instance_transitions() {
        let mut instance = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        instance
            .transition(TeamInstanceLifecycle::Ready, None, 11)
            .expect("provisioning may become ready");
        assert!(instance
            .transition(TeamInstanceLifecycle::Provisioning, None, 12)
            .is_err());
        instance
            .transition(TeamInstanceLifecycle::Archived, None, 12)
            .expect("ready may be archived");
        assert!(instance
            .transition(TeamInstanceLifecycle::Ready, None, 13)
            .is_err());
    }

    #[test]
    fn team_member_and_phase_terminal_states_cannot_revive() {
        let mut team_run =
            TeamRun::new("run-1", "instance-1", "workflow-1", 1, 1).expect("valid team run");
        team_run
            .transition(TeamRunStatus::Running, None, 2)
            .expect("run starts");
        team_run
            .transition(TeamRunStatus::Completed, None, 3)
            .expect("run completes");
        assert!(team_run
            .transition(TeamRunStatus::Running, None, 4)
            .is_err());

        let mut member_run =
            TeamMemberRun::new("member-run-1", "run-1", "instance-1", "member-1", 1, 1)
                .expect("valid member run");
        member_run
            .transition(TeamMemberRunStatus::Queued, None, 2)
            .expect("member queues");
        member_run
            .transition(TeamMemberRunStatus::Cancelled, None, 3)
            .expect("member cancels");
        assert!(member_run
            .transition(TeamMemberRunStatus::Running, None, 4)
            .is_err());

        let mut phase_run = TeamPhaseRun::new(
            "phase-run-1",
            "run-1",
            "instance-1",
            "workflow-1",
            "phase-1",
            1,
            1,
        )
        .expect("valid phase run");
        phase_run
            .transition(TeamPhaseRunStatus::Skipped, None, 2)
            .expect("phase skips");
        assert!(phase_run
            .transition(TeamPhaseRunStatus::Ready, None, 3)
            .is_err());
    }

    #[test]
    fn error_states_require_structured_error_facts() {
        let mut instance = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        assert!(matches!(
            instance.transition(TeamInstanceLifecycle::Unavailable, None, 11),
            Err(TeamRuntimeContractError::MissingRuntimeError { .. })
        ));
        instance
            .transition(
                TeamInstanceLifecycle::Unavailable,
                Some(runtime_error()),
                11,
            )
            .expect("unavailable has structured error");

        let mut team_run =
            TeamRun::new("run-1", "instance-1", "workflow-1", 1, 1).expect("valid team run");
        assert!(matches!(
            team_run.transition(TeamRunStatus::Failed, None, 2),
            Err(TeamRuntimeContractError::MissingRuntimeError { .. })
        ));
        team_run
            .transition(TeamRunStatus::Failed, Some(runtime_error()), 2)
            .expect("failed Team run has structured error");

        let mut blocked_team_run =
            TeamRun::new("run-2", "instance-1", "workflow-1", 1, 1).expect("valid team run");
        blocked_team_run
            .transition(TeamRunStatus::Running, None, 2)
            .expect("Team run starts");
        blocked_team_run
            .transition(TeamRunStatus::Blocked, Some(runtime_error()), 3)
            .expect("blocked Team run has structured error");

        let mut member_run =
            TeamMemberRun::new("member-run-1", "run-1", "instance-1", "member-1", 1, 1)
                .expect("valid member run");
        member_run
            .transition(TeamMemberRunStatus::Queued, None, 2)
            .expect("member queues");
        assert!(member_run
            .transition(TeamMemberRunStatus::Failed, None, 3)
            .is_err());
        member_run
            .transition(TeamMemberRunStatus::Failed, Some(runtime_error()), 3)
            .expect("failed member run has structured error");

        let mut phase_run = TeamPhaseRun::new(
            "phase-run-1",
            "run-1",
            "instance-1",
            "workflow-1",
            "phase-1",
            1,
            1,
        )
        .expect("valid phase run");
        phase_run
            .transition(TeamPhaseRunStatus::Ready, None, 2)
            .expect("phase ready");
        phase_run
            .transition(TeamPhaseRunStatus::Running, None, 3)
            .expect("phase running");
        assert!(phase_run
            .transition(TeamPhaseRunStatus::Blocked, None, 4)
            .is_err());
        phase_run
            .transition(TeamPhaseRunStatus::Blocked, Some(runtime_error()), 4)
            .expect("blocked phase has structured error");
        phase_run
            .transition(TeamPhaseRunStatus::Failed, Some(runtime_error()), 5)
            .expect("failed phase has structured error");
    }

    #[test]
    fn non_error_states_reject_stale_runtime_errors() {
        let mut instance = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        instance.error = Some(runtime_error());
        assert!(matches!(
            instance.validate(),
            Err(TeamRuntimeContractError::UnexpectedRuntimeError {
                entity: "team instance"
            })
        ));

        let mut team_run =
            TeamRun::new("run-1", "instance-1", "workflow-1", 1, 1).expect("valid team run");
        team_run.error = Some(runtime_error());
        assert!(matches!(
            team_run.validate(),
            Err(TeamRuntimeContractError::UnexpectedRuntimeError { entity: "team run" })
        ));

        let mut member_run =
            TeamMemberRun::new("member-run-1", "run-1", "instance-1", "member-1", 1, 1)
                .expect("valid member run");
        member_run.error = Some(runtime_error());
        assert!(matches!(
            member_run.validate(),
            Err(TeamRuntimeContractError::UnexpectedRuntimeError {
                entity: "member run"
            })
        ));

        let mut phase_run = TeamPhaseRun::new(
            "phase-run-1",
            "run-1",
            "instance-1",
            "workflow-1",
            "phase-1",
            1,
            1,
        )
        .expect("valid phase run");
        phase_run.error = Some(runtime_error());
        assert!(matches!(
            phase_run.validate(),
            Err(TeamRuntimeContractError::UnexpectedRuntimeError {
                entity: "phase run"
            })
        ));
    }

    #[test]
    fn started_at_records_only_the_first_running_transition() {
        let mut failed_before_start =
            TeamRun::new("run-failed", "instance-1", "workflow-1", 1, 1).expect("valid Team run");
        failed_before_start
            .transition(TeamRunStatus::Failed, Some(runtime_error()), 2)
            .expect("queued Team run may fail before starting");
        assert_eq!(failed_before_start.started_at, None);
        assert_eq!(failed_before_start.finished_at, Some(2));

        let mut cancelled_before_start = TeamMemberRun::new(
            "member-run-cancelled",
            "run-1",
            "instance-1",
            "member-1",
            1,
            1,
        )
        .expect("valid member run");
        cancelled_before_start
            .transition(TeamMemberRunStatus::Cancelled, None, 2)
            .expect("idle member run may cancel before starting");
        assert_eq!(cancelled_before_start.started_at, None);
        assert_eq!(cancelled_before_start.finished_at, Some(2));

        let mut failed_member_before_start =
            TeamMemberRun::new("member-run-failed", "run-1", "instance-1", "member-1", 1, 1)
                .expect("valid member run");
        failed_member_before_start
            .transition(TeamMemberRunStatus::Queued, None, 2)
            .expect("member queues");
        failed_member_before_start
            .transition(TeamMemberRunStatus::Failed, Some(runtime_error()), 3)
            .expect("queued member run may fail before starting");
        assert_eq!(failed_member_before_start.started_at, None);

        let mut skipped_before_start = TeamPhaseRun::new(
            "phase-run-skipped",
            "run-1",
            "instance-1",
            "workflow-1",
            "phase-1",
            1,
            1,
        )
        .expect("valid phase run");
        skipped_before_start
            .transition(TeamPhaseRunStatus::Skipped, None, 2)
            .expect("pending phase may skip before starting");
        assert_eq!(skipped_before_start.started_at, None);
        assert_eq!(skipped_before_start.finished_at, Some(2));

        let mut completed_team_run =
            TeamRun::new("run-completed", "instance-1", "workflow-1", 1, 1)
                .expect("valid Team run");
        completed_team_run
            .transition(TeamRunStatus::Running, None, 2)
            .expect("Team run starts");
        completed_team_run
            .transition(TeamRunStatus::WaitingUser, None, 3)
            .expect("Team run waits");
        completed_team_run
            .transition(TeamRunStatus::Running, None, 4)
            .expect("Team run resumes");
        completed_team_run
            .transition(TeamRunStatus::Completed, None, 5)
            .expect("Team run completes");
        assert_eq!(completed_team_run.started_at, Some(2));

        let mut completed_member_run = TeamMemberRun::new(
            "member-run-completed",
            "run-1",
            "instance-1",
            "member-1",
            1,
            1,
        )
        .expect("valid member run");
        completed_member_run
            .transition(TeamMemberRunStatus::Queued, None, 2)
            .expect("member queues");
        completed_member_run
            .transition(TeamMemberRunStatus::Running, None, 3)
            .expect("member starts");
        completed_member_run
            .transition(TeamMemberRunStatus::Completed, None, 4)
            .expect("member completes");
        assert_eq!(completed_member_run.started_at, Some(3));

        let mut completed_phase_run = TeamPhaseRun::new(
            "phase-run-completed",
            "run-1",
            "instance-1",
            "workflow-1",
            "phase-1",
            1,
            1,
        )
        .expect("valid phase run");
        completed_phase_run
            .transition(TeamPhaseRunStatus::Ready, None, 2)
            .expect("phase becomes ready");
        completed_phase_run
            .transition(TeamPhaseRunStatus::Running, None, 3)
            .expect("phase starts");
        completed_phase_run
            .transition(TeamPhaseRunStatus::Completed, None, 4)
            .expect("phase completes");
        assert_eq!(completed_phase_run.started_at, Some(3));

        let mut queued_with_start =
            TeamRun::new("run-invalid-queued", "instance-1", "workflow-1", 1, 1)
                .expect("valid Team run");
        queued_with_start.started_at = Some(1);
        assert!(matches!(
            queued_with_start.validate(),
            Err(TeamRuntimeContractError::InvalidTimestamps { .. })
        ));

        let mut running_without_start =
            TeamRun::new("run-invalid-running", "instance-1", "workflow-1", 1, 1)
                .expect("valid Team run");
        running_without_start.status = TeamRunStatus::Running;
        running_without_start.updated_at = 2;
        assert!(matches!(
            running_without_start.validate(),
            Err(TeamRuntimeContractError::InvalidTimestamps { .. })
        ));

        let mut ready_after_start = TeamPhaseRun::new(
            "phase-run-ready",
            "run-1",
            "instance-1",
            "workflow-1",
            "phase-1",
            1,
            1,
        )
        .expect("valid phase run");
        ready_after_start
            .transition(TeamPhaseRunStatus::Ready, None, 2)
            .expect("phase becomes ready");
        ready_after_start
            .transition(TeamPhaseRunStatus::Running, None, 3)
            .expect("phase starts");
        ready_after_start
            .transition(TeamPhaseRunStatus::Blocked, Some(runtime_error()), 4)
            .expect("phase blocks");
        ready_after_start
            .transition(TeamPhaseRunStatus::Ready, None, 5)
            .expect("started phase becomes ready again");
        assert_eq!(ready_after_start.started_at, Some(3));
        ready_after_start
            .validate()
            .expect("ready started phase is valid");
    }

    #[test]
    fn rejects_duplicate_members_blank_adapters_and_incomplete_remote_workspaces() {
        let duplicate = TeamInstance::new(
            "instance-1",
            "definition-1",
            "revision-1",
            local_workspace("workspace-1"),
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
            TeamLeadBinding::ParentPersona {
                parent_session_id: "parent-1".to_string(),
            },
            vec![
                TeamMemberBinding {
                    member_id: "member-1".to_string(),
                    child_session_id: None,
                    subagent_task_id: None,
                },
                TeamMemberBinding {
                    member_id: "member-1".to_string(),
                    child_session_id: Some("child-1".to_string()),
                    subagent_task_id: None,
                },
            ],
            TeamInstanceCreationSource::UserAttachment,
            1,
        );
        assert!(matches!(
            duplicate,
            Err(TeamRuntimeContractError::DuplicateMemberId { .. })
        ));

        let blank_adapter = instance_with_profile(
            "instance-2",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::FlagshipAdapter {
                adapter_id: "valid".to_string(),
            },
        );
        let mut blank_adapter = blank_adapter;
        blank_adapter.execution_profile = TeamExecutionProfile::FlagshipAdapter {
            adapter_id: "   ".to_string(),
        };
        assert!(matches!(
            blank_adapter.validate(),
            Err(TeamRuntimeContractError::EmptyIdentifier { field: "adapterId" })
        ));

        let remote = TeamWorkspaceIdentity {
            workspace_id: "workspace-remote".to_string(),
            context_key: "ssh:/workspace".to_string(),
            backend: TeamWorkspaceBackend::Remote,
            remote_connection_id: None,
            remote_host: Some("build.example.test".to_string()),
        };
        assert!(remote.validate().is_err());
    }

    #[test]
    fn active_run_must_match_the_instance_and_be_terminal_before_clear() {
        let mut instance = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        instance
            .transition(TeamInstanceLifecycle::Ready, None, 11)
            .expect("instance ready");
        let mismatched =
            TeamRun::new("run-x", "instance-x", "workflow-1", 1, 11).expect("valid mismatched run");
        assert!(matches!(
            instance.set_active_run(&mismatched, 12),
            Err(TeamRuntimeContractError::IdentityMismatch { .. })
        ));

        let mut run = TeamRun::new("run-1", "instance-1", "workflow-1", 1, 11).expect("valid run");
        instance
            .set_active_run(&run, 12)
            .expect("matching run becomes active");
        assert!(instance.clear_active_run(&run, 13).is_err());
        run.transition(TeamRunStatus::Cancelled, None, 13)
            .expect("run cancels");
        instance
            .clear_active_run(&run, 13)
            .expect("terminal run clears");
    }

    #[test]
    fn active_run_updates_are_monotonic_against_instance_and_run() {
        let mut instance = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        instance
            .transition(TeamInstanceLifecycle::Ready, None, 11)
            .expect("instance ready");
        let mut run =
            TeamRun::new("run-1", "instance-1", "workflow-1", 1, 20).expect("valid Team run");

        let before_stale_set = instance.clone();
        assert!(matches!(
            instance.set_active_run(&run, 19),
            Err(TeamRuntimeContractError::InvalidTimestamps { .. })
        ));
        assert_eq!(instance, before_stale_set);

        instance
            .set_active_run(&run, 20)
            .expect("timestamp equal to both records' maximum is accepted");
        run.transition(TeamRunStatus::Cancelled, None, 21)
            .expect("run cancels before starting");

        let before_stale_clear = instance.clone();
        assert!(matches!(
            instance.clear_active_run(&run, 20),
            Err(TeamRuntimeContractError::InvalidTimestamps { .. })
        ));
        assert_eq!(instance, before_stale_clear);

        instance
            .clear_active_run(&run, 21)
            .expect("clear accepts the current maximum timestamp");
        assert_eq!(instance.active_run_id, None);
        assert_eq!(instance.updated_at, 21);
    }

    #[test]
    fn a_new_active_run_rotates_the_current_member_execution_binding() {
        let mut instance = instance_with_profile(
            "instance-1",
            "workspace-1",
            "parent-1",
            TeamExecutionProfile::PromptOrchestrated,
        );
        instance
            .transition(TeamInstanceLifecycle::Ready, None, 11)
            .expect("instance ready");
        let run =
            TeamRun::new("run-2", "instance-1", "workflow-1", 2, 12).expect("valid second run");

        assert!(instance
            .begin_member_run_binding("specialist-1", "task-2".to_string(), 12)
            .is_err());
        instance
            .set_active_run(&run, 12)
            .expect("second run becomes active");
        instance
            .begin_member_run_binding("specialist-1", "task-2".to_string(), 12)
            .expect("current member binding rotates for the new run");

        let binding = &instance.member_bindings[0];
        assert_eq!(binding.subagent_task_id.as_deref(), Some("task-2"));
        assert_eq!(binding.child_session_id, None);
    }
}
