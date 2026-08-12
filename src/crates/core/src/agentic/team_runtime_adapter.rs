//! Adapter from prompt-authored Teams to the existing durable subagent runtime.
//!
//! This module owns the Team-specific authorization checks. It never exposes a
//! generic child-session message or parent-turn cancellation as a Team action.

use super::coordination::{ConversationCoordinator, SubagentExecutionRequest};
use super::core::{Session, SessionConfig, SessionKind};
use super::session::PreparedTurnDisposition;
use super::team_definitions::TeamMemberDelegationPolicy;
use super::team_orchestrator::{
    RuntimeDisposition, RuntimeReceipt, RuntimeRequest, RuntimeTaskState, TeamOrchestratorError,
    TeamOrchestratorErrorCode, TeamRuntimeAdapter,
};
use super::team_runtime::TeamWorkspaceBackend;
use super::tools::pipeline::SubagentParentInfo;
use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc};
use void_core_types::{
    SubagentLaunchAuthorityKind, SubagentTaskContextMode, SubagentTaskExecutionMode,
    SubagentTaskLaunchSpec, SubagentTaskRecord, SubagentTaskStatus, TeamMemberSkillPolicyKind,
    TeamMemberSkillPolicySnapshot, TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY,
};
use void_runtime_ports::{DelegationPolicy, SubagentContextMode, TeamDelegationBudget};

const ADAPTER_ID: &str = "prompt-team-subagent-runtime";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PersistedStopDisposition {
    Reused,
    RejectTerminal,
    RequiresActiveStop,
}

/// The concrete Team runtime adapter. All task creation still belongs to
/// `ConversationCoordinator`; this layer only supplies the stable Team task ID
/// and validates every cross-session operation against the durable launch spec.
pub struct PromptTeamRuntimeAdapter {
    coordinator: Arc<ConversationCoordinator>,
}

impl PromptTeamRuntimeAdapter {
    pub fn new(coordinator: Arc<ConversationCoordinator>) -> Self {
        Self { coordinator }
    }

    fn rejected(message: impl Into<String>) -> TeamOrchestratorError {
        TeamOrchestratorError {
            code: TeamOrchestratorErrorCode::AdapterRejected,
            message: message.into(),
            retryable: false,
        }
    }

    fn unsupported(operation: &str) -> TeamOrchestratorError {
        TeamOrchestratorError {
            code: TeamOrchestratorErrorCode::AdapterUnsupported,
            message: format!("{operation} is not supported by the prompt Team runtime"),
            retryable: false,
        }
    }

    fn map_runtime_error(error: impl std::fmt::Display) -> TeamOrchestratorError {
        Self::rejected(format!(
            "subagent runtime rejected the Team operation: {error}"
        ))
    }

    fn required(value: Option<&str>, name: &str) -> Result<String, TeamOrchestratorError> {
        value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .ok_or_else(|| Self::rejected(format!("{name} is required")))
    }

    fn validate_scope(request: &RuntimeRequest) -> Result<(), TeamOrchestratorError> {
        for (name, value) in [
            ("operationId", request.operation_id.as_str()),
            ("parentSessionId", request.parent_session_id.as_str()),
            ("teamInstanceId", request.team_instance_id.as_str()),
            ("teamDefinitionId", request.team_definition_id.as_str()),
            (
                "teamDefinitionRevision",
                request.team_definition_revision.as_str(),
            ),
        ] {
            if value.trim().is_empty() {
                return Err(Self::rejected(format!("{name} is required")));
            }
        }
        request
            .workspace
            .validate()
            .map_err(|error| Self::rejected(error.to_string()))
    }

    fn validate_parent_workspace(
        request: &RuntimeRequest,
        config: &SessionConfig,
    ) -> Result<(), TeamOrchestratorError> {
        let workspace_id = config
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| Self::rejected("parent session has no stable workspace id"))?;
        if request.workspace.workspace_id != workspace_id {
            return Err(Self::rejected(
                "requested workspace id does not match the parent session",
            ));
        }

        let parent_backend =
            if config.remote_connection_id.is_some() || config.remote_ssh_host.is_some() {
                TeamWorkspaceBackend::Remote
            } else {
                TeamWorkspaceBackend::Local
            };
        if request.workspace.backend != parent_backend {
            return Err(Self::rejected(
                "requested workspace backend does not match the parent session",
            ));
        }
        if request.workspace.remote_connection_id != config.remote_connection_id
            || request.workspace.remote_host != config.remote_ssh_host
        {
            return Err(Self::rejected(
                "requested remote workspace identity does not match the parent session",
            ));
        }
        Ok(())
    }

    fn session_config_matches_parent(child: &SessionConfig, parent: &SessionConfig) -> bool {
        child.max_context_tokens == parent.max_context_tokens
            && child.auto_compact == parent.auto_compact
            && child.enable_tools == parent.enable_tools
            && child.safe_mode == parent.safe_mode
            && child.max_turns == parent.max_turns
            && child.enable_context_compression == parent.enable_context_compression
            && child.compression_threshold == parent.compression_threshold
            && child.workspace_path == parent.workspace_path
            && child.workspace_id == parent.workspace_id
            && child.remote_connection_id == parent.remote_connection_id
            && child.remote_ssh_host == parent.remote_ssh_host
            && child.model_id == parent.model_id
    }

    fn durable_team_context(request: &RuntimeRequest) -> HashMap<String, String> {
        let mut context = HashMap::from([
            (
                "teamDefinitionId".to_string(),
                request.team_definition_id.clone(),
            ),
            (
                TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY.to_string(),
                request.parent_session_id.clone(),
            ),
            (
                "teamDefinitionRevision".to_string(),
                request.team_definition_revision.clone(),
            ),
            (
                "teamInstanceId".to_string(),
                request.team_instance_id.clone(),
            ),
        ]);
        for (key, value) in [
            ("teamRunId", request.team_run_id.as_deref()),
            ("teamMemberId", request.member_id.as_deref()),
            ("memberRunId", request.member_run_id.as_deref()),
            ("teamPhaseId", request.phase_id.as_deref()),
        ] {
            if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
                context.insert(key.to_string(), value.to_string());
            }
        }
        if let Some(TeamMemberDelegationPolicy::Bounded {
            max_worker_tasks,
            max_parallel_workers,
        }) = request.team_member_delegation_policy
        {
            TeamDelegationBudget::bounded(max_worker_tasks, max_parallel_workers)
                .expect("validated Team definition has a bounded delegation budget")
                .write_context(&mut context);
        }
        context
    }

    fn member_delegation_policy(
        request: &RuntimeRequest,
    ) -> Result<DelegationPolicy, TeamOrchestratorError> {
        match request
            .team_member_delegation_policy
            .unwrap_or(TeamMemberDelegationPolicy::Disabled)
        {
            TeamMemberDelegationPolicy::Disabled => Ok(DelegationPolicy::ordinary_child(1)),
            TeamMemberDelegationPolicy::Bounded { .. } => Ok(DelegationPolicy::team_member()),
        }
    }

    fn task_state(status: SubagentTaskStatus) -> RuntimeTaskState {
        match status {
            SubagentTaskStatus::Created => RuntimeTaskState::Created,
            SubagentTaskStatus::Running => RuntimeTaskState::Running,
            SubagentTaskStatus::Blocked => RuntimeTaskState::Blocked,
            SubagentTaskStatus::Completed => RuntimeTaskState::Completed,
            SubagentTaskStatus::Failed => RuntimeTaskState::Failed,
            SubagentTaskStatus::Cancelled => RuntimeTaskState::Cancelled,
            SubagentTaskStatus::Interrupted => RuntimeTaskState::Interrupted,
        }
    }

    fn message_disposition(disposition: PreparedTurnDisposition) -> RuntimeDisposition {
        match disposition {
            PreparedTurnDisposition::Created => RuntimeDisposition::MessageAccepted,
            PreparedTurnDisposition::Reused => RuntimeDisposition::Reused,
        }
    }

    fn persisted_stop_disposition(status: SubagentTaskStatus) -> PersistedStopDisposition {
        match status {
            SubagentTaskStatus::Cancelled | SubagentTaskStatus::Interrupted => {
                PersistedStopDisposition::Reused
            }
            SubagentTaskStatus::Completed | SubagentTaskStatus::Failed => {
                PersistedStopDisposition::RejectTerminal
            }
            SubagentTaskStatus::Created
            | SubagentTaskStatus::Running
            | SubagentTaskStatus::Blocked => PersistedStopDisposition::RequiresActiveStop,
        }
    }

    fn receipt(
        request: &RuntimeRequest,
        accepted: bool,
        disposition: RuntimeDisposition,
        task_state: RuntimeTaskState,
        child_session_id: Option<String>,
        subagent_task_id: Option<String>,
    ) -> RuntimeReceipt {
        RuntimeReceipt {
            operation_id: request.operation_id.clone(),
            accepted,
            disposition,
            task_state,
            parent_session_id: request.parent_session_id.clone(),
            team_instance_id: request.team_instance_id.clone(),
            team_definition_id: request.team_definition_id.clone(),
            team_definition_revision: request.team_definition_revision.clone(),
            workspace: request.workspace.clone(),
            parent_dialog_turn_id: request.parent_dialog_turn_id.clone(),
            parent_tool_call_id: request.parent_tool_call_id.clone(),
            team_run_id: request.team_run_id.clone(),
            member_id: request.member_id.clone(),
            member_run_id: request.member_run_id.clone(),
            phase_id: request.phase_id.clone(),
            agent_id: request.agent_id.clone(),
            child_session_id,
            subagent_task_id,
            worker_summary: None,
        }
    }

    fn validate_member_launch(
        request: &RuntimeRequest,
    ) -> Result<MemberLaunch, TeamOrchestratorError> {
        Self::validate_scope(request)?;
        Self::validated_member_skill_policy(request)?;
        Ok(MemberLaunch {
            parent_dialog_turn_id: Self::required(
                request.parent_dialog_turn_id.as_deref(),
                "parentDialogTurnId",
            )?,
            parent_tool_call_id: Self::required(
                request.parent_tool_call_id.as_deref(),
                "parentToolCallId",
            )?,
            agent_type: Self::required(request.agent_id.as_deref(), "agentId")?,
            objective: Self::required(request.objective.as_deref(), "objective")?,
            _member_id: Self::required(request.member_id.as_deref(), "memberId")?,
            _team_run_id: Self::required(request.team_run_id.as_deref(), "teamRunId")?,
            _phase_id: Self::required(request.phase_id.as_deref(), "phaseId")?,
        })
    }

    fn validated_member_skill_policy(
        request: &RuntimeRequest,
    ) -> Result<&TeamMemberSkillPolicySnapshot, TeamOrchestratorError> {
        let policy = request
            .team_member_skill_policy
            .as_ref()
            .ok_or_else(|| Self::rejected("Team member Skill policy is required"))?;
        policy
            .validate()
            .map_err(|error| Self::rejected(error.to_string()))?;
        if policy.team_definition_id != request.team_definition_id
            || policy.team_definition_revision != request.team_definition_revision
            || policy.team_instance_id != request.team_instance_id
            || Some(policy.member_id.as_str()) != request.member_id.as_deref()
            || Some(policy.agent_id.as_str()) != request.agent_id.as_deref()
        {
            return Err(Self::rejected(
                "Team member Skill policy does not match the requested Team member scope",
            ));
        }
        Ok(policy)
    }

    fn validate_linked_task(
        request: &RuntimeRequest,
        task_id: &str,
        task: &SubagentTaskRecord,
    ) -> Result<(), TeamOrchestratorError> {
        if task.parent_session_id != request.parent_session_id || task.task_id != task_id {
            return Err(Self::rejected(
                "subagent task parent identity does not match",
            ));
        }
        if task.execution_mode != SubagentTaskExecutionMode::Background
            || task.context_mode != SubagentTaskContextMode::Fresh
        {
            return Err(Self::rejected(
                "Team member task does not have the expected background launch kind",
            ));
        }
        let launch = task
            .launch_spec
            .as_ref()
            .ok_or_else(|| Self::rejected("subagent task has no durable launch specification"))?;
        launch
            .validate()
            .map_err(|error| Self::rejected(error.to_string()))?;
        let requested_agent_id = Self::required(request.agent_id.as_deref(), "agentId")?;
        if requested_agent_id != launch.agent_type {
            return Err(Self::rejected(
                "requested agent id does not match the durable member launch",
            ));
        }
        let requested_delegation = Self::member_delegation_policy(request)?;
        let persisted_is_member = task
            .launch_authority
            .as_ref()
            .is_some_and(|authority| authority.kind == SubagentLaunchAuthorityKind::TeamMember);
        if launch.allow_subagent_spawn != requested_delegation.allow_subagent_spawn
            || persisted_is_member != requested_delegation.allow_subagent_spawn
        {
            return Err(Self::rejected(
                "requested Team member delegation policy does not match the durable launch",
            ));
        }
        let requested_policy = Self::validated_member_skill_policy(request)?;
        match launch.team_member_skill_policy.as_ref() {
            Some(persisted_policy) if persisted_policy == requested_policy => {}
            _ => {
                return Err(Self::rejected(
                    "requested Team member Skill policy does not match the durable launch",
                ))
            }
        }
        let mut expected_context = Self::durable_team_context(request);
        if task.launch_authority.is_none() {
            expected_context.remove(TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY);
        }
        if launch.context != expected_context.into_iter().collect()
            || launch.parent_dialog_turn_id
                != request.parent_dialog_turn_id.clone().unwrap_or_default()
            || launch.parent_tool_call_id != request.parent_tool_call_id.clone().unwrap_or_default()
            || task.objective != request.objective.clone().unwrap_or_default()
        {
            return Err(Self::rejected(
                "subagent task launch context is not bound to this Team member run",
            ));
        }
        if let Some(requested_child_session_id) = request.child_session_id.as_deref() {
            if task.child_session_id.as_deref() != Some(requested_child_session_id) {
                return Err(Self::rejected(
                    "subagent task child session does not match the requested member session",
                ));
            }
        }
        Ok(())
    }

    /// Validate every durable Team launch fact before the only allowed legacy
    /// policy migration. The returned launch differs solely by the explicit
    /// expected `no_policy` snapshot; PersistenceManager still decides whether
    /// the on-disk schema is genuinely legacy.
    pub fn expected_member_recovery_launch(
        request: &RuntimeRequest,
        task: &SubagentTaskRecord,
    ) -> Result<SubagentTaskLaunchSpec, TeamOrchestratorError> {
        let expected_policy = Self::validated_member_skill_policy(request)?;
        let mut expected = task
            .launch_spec
            .clone()
            .ok_or_else(|| Self::rejected("subagent task has no durable launch specification"))?;
        if expected.team_member_skill_policy.is_some() {
            Self::validate_linked_task(request, &task.task_id, task)?;
            return Ok(expected);
        }
        if expected_policy.kind != TeamMemberSkillPolicyKind::NoPolicy {
            return Err(Self::rejected(
                "an absent legacy policy can only migrate to no_policy",
            ));
        }
        expected.team_member_skill_policy = Some(expected_policy.clone());
        let mut migrated = task.clone();
        migrated.launch_spec = Some(expected.clone());
        Self::validate_linked_task(request, &task.task_id, &migrated)?;
        Ok(expected)
    }

    /// Strict post-migration recovery validation. No compatibility exception
    /// is accepted here: the persisted launch must contain the exact typed
    /// policy generated from the pinned Team definition.
    pub fn validate_member_recovery(
        request: &RuntimeRequest,
        task: &SubagentTaskRecord,
    ) -> Result<SubagentTaskLaunchSpec, TeamOrchestratorError> {
        Self::validate_linked_task(request, &task.task_id, task)?;
        task.launch_spec
            .clone()
            .ok_or_else(|| Self::rejected("subagent task has no durable launch specification"))
    }

    async fn linked_task(
        &self,
        request: &RuntimeRequest,
    ) -> Result<SubagentTaskRecord, TeamOrchestratorError> {
        Self::validate_scope(request)?;
        let parent = self
            .coordinator
            .get_session_manager()
            .get_session(&request.parent_session_id)
            .ok_or_else(|| Self::rejected("parent session does not exist"))?;
        Self::validate_parent_workspace(request, &parent.config)?;
        let task_id = Self::required(request.subagent_task_id.as_deref(), "subagentTaskId")?;
        let task = self
            .coordinator
            .get_session_manager()
            .get_subagent_task(&request.parent_session_id, &task_id)
            .await
            .map_err(Self::map_runtime_error)?
            .ok_or_else(|| Self::rejected("subagent task was not found for this parent session"))?;
        Self::validate_linked_task(request, &task_id, &task)?;
        Ok(task)
    }

    fn validated_child_session(
        &self,
        request: &RuntimeRequest,
        task: &SubagentTaskRecord,
    ) -> Result<(String, Session), TeamOrchestratorError> {
        let child_session_id = task
            .child_session_id
            .clone()
            .ok_or_else(|| Self::rejected("subagent task has not created a child session"))?;
        let child = self
            .coordinator
            .get_session_manager()
            .get_session(&child_session_id)
            .ok_or_else(|| Self::rejected("member child session does not exist"))?;
        let parent = self
            .coordinator
            .get_session_manager()
            .get_session(&request.parent_session_id)
            .ok_or_else(|| Self::rejected("parent session does not exist"))?;
        let expected_created_by = format!("session-{}", request.parent_session_id);
        let launch = task
            .launch_spec
            .as_ref()
            .ok_or_else(|| Self::rejected("subagent task has no durable launch specification"))?;
        if child.kind != SessionKind::Subagent
            || child.created_by.as_deref() != Some(expected_created_by.as_str())
            || !Self::session_config_matches_parent(&child.config, &parent.config)
            || child.agent_type != launch.agent_type
        {
            return Err(Self::rejected(
                "member child session is not the child recorded for this Team task launch",
            ));
        }
        Ok((child_session_id, child))
    }
}

#[derive(Debug)]
struct MemberLaunch {
    parent_dialog_turn_id: String,
    parent_tool_call_id: String,
    agent_type: String,
    objective: String,
    _member_id: String,
    _team_run_id: String,
    _phase_id: String,
}

#[async_trait]
impl TeamRuntimeAdapter for PromptTeamRuntimeAdapter {
    fn adapter_id(&self) -> &str {
        ADAPTER_ID
    }

    async fn activate_lead(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        Self::validate_scope(&request)?;
        let parent = self
            .coordinator
            .get_session_manager()
            .get_session(&request.parent_session_id)
            .ok_or_else(|| Self::rejected("parent session does not exist"))?;
        Self::validate_parent_workspace(&request, &parent.config)?;
        Ok(Self::receipt(
            &request,
            true,
            RuntimeDisposition::Activated,
            RuntimeTaskState::NotApplicable,
            None,
            None,
        ))
    }

    async fn ensure_member_task(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        let launch = Self::validate_member_launch(&request)?;
        let task_id = request
            .subagent_task_id
            .clone()
            .unwrap_or_else(|| request.operation_id.clone());
        if task_id.trim().is_empty() {
            return Err(Self::rejected("subagentTaskId or operationId is required"));
        }
        let parent = self
            .coordinator
            .get_session_manager()
            .get_session(&request.parent_session_id)
            .ok_or_else(|| Self::rejected("parent session does not exist"))?;
        Self::validate_parent_workspace(&request, &parent.config)?;
        let parent_config = parent.config.clone();
        let workspace_path = parent_config
            .workspace_path
            .clone()
            .ok_or_else(|| Self::rejected("parent session has no workspace path"))?;
        let result = self
            .coordinator
            .ensure_team_background_subagent_with_task_id(
                task_id.clone(),
                SubagentExecutionRequest {
                    task_description: launch.objective,
                    context_mode: SubagentContextMode::Fresh,
                    subagent_type: Some(launch.agent_type),
                    workspace_path: Some(workspace_path),
                    model_id: None,
                    subagent_parent_info: SubagentParentInfo {
                        tool_call_id: launch.parent_tool_call_id,
                        session_id: request.parent_session_id.clone(),
                        dialog_turn_id: launch.parent_dialog_turn_id,
                    },
                    context: Self::durable_team_context(&request),
                    delegation_policy: Self::member_delegation_policy(&request)?,
                },
                parent_config,
                request.timeout_seconds,
                request
                    .team_member_skill_policy
                    .clone()
                    .expect("validated member launch has a typed Skill policy"),
            )
            .await
            .map_err(Self::map_runtime_error)?;
        let task = self
            .coordinator
            .get_session_manager()
            .get_subagent_task(&request.parent_session_id, &result.background_task_id)
            .await
            .map_err(Self::map_runtime_error)?
            .ok_or_else(|| Self::rejected("created subagent task was not persisted"))?;
        Ok(Self::receipt(
            &request,
            true,
            if result.reused {
                RuntimeDisposition::Reused
            } else {
                RuntimeDisposition::Created
            },
            Self::task_state(task.status),
            task.child_session_id.clone(),
            Some(task.task_id),
        ))
    }

    async fn inspect_member_task(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        let task = self.linked_task(&request).await?;
        let mut receipt = Self::receipt(
            &request,
            true,
            RuntimeDisposition::Inspected,
            Self::task_state(task.status),
            task.child_session_id.clone(),
            Some(task.task_id),
        );
        if let Some(child_session_id) = task.child_session_id.as_deref() {
            let workers = self
                .coordinator
                .get_session_manager()
                .list_subagent_tasks(child_session_id)
                .await
                .map_err(Self::map_runtime_error)?;
            let mut summary = super::team_orchestrator::MemberWorkerSummary::default();
            for worker in workers.into_iter().filter(|worker| {
                worker.launch_authority.as_ref().is_some_and(|authority| {
                    authority.kind == SubagentLaunchAuthorityKind::TeamWorker
                        && authority.team_lineage.as_ref().is_some_and(|lineage| {
                            lineage.team_instance_id == request.team_instance_id
                                && request.team_run_id.as_deref() == Some(&lineage.team_run_id)
                                && request.member_id.as_deref() == Some(&lineage.member_id)
                                && request.member_run_id.as_deref() == Some(&lineage.member_run_id)
                        })
                })
            }) {
                summary.total += 1;
                if worker.status.is_terminal() {
                    if worker.status == SubagentTaskStatus::Failed {
                        summary.failed += 1;
                    }
                } else {
                    summary.active += 1;
                }
            }
            receipt.worker_summary = Some(summary);
        }
        Ok(receipt)
    }

    async fn message_member(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        let task = self.linked_task(&request).await?;
        let message = Self::required(request.message.as_deref(), "message")?;
        let (child_session_id, child) = self.validated_child_session(&request, &task)?;
        let disposition = self
            .coordinator
            .follow_up_team_subagent(&task, &child, &request.operation_id, message)
            .await
            .map_err(Self::map_runtime_error)?;
        Ok(Self::receipt(
            &request,
            true,
            Self::message_disposition(disposition),
            Self::task_state(task.status),
            Some(child_session_id),
            Some(task.task_id),
        ))
    }

    async fn pause_run(
        &self,
        _request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        Err(Self::unsupported("pause"))
    }

    async fn resume_run(
        &self,
        _request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        Err(Self::unsupported("resume"))
    }

    async fn stop_run(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
        let task = self.linked_task(&request).await?;
        let mut stopped_worker = false;
        if let Some(member_session_id) = task.child_session_id.as_deref() {
            let workers = self
                .coordinator
                .get_session_manager()
                .list_subagent_tasks(member_session_id)
                .await
                .map_err(Self::map_runtime_error)?;
            for worker in workers.into_iter().filter(|worker| {
                !worker.status.is_terminal()
                    && worker.launch_authority.as_ref().is_some_and(|authority| {
                        authority.kind == SubagentLaunchAuthorityKind::TeamWorker
                            && authority.team_lineage.as_ref().is_some_and(|lineage| {
                                lineage.team_instance_id == request.team_instance_id
                                    && request.team_run_id.as_deref() == Some(&lineage.team_run_id)
                                    && request.member_id.as_deref() == Some(&lineage.member_id)
                                    && request.member_run_id.as_deref()
                                        == Some(&lineage.member_run_id)
                            })
                    })
            }) {
                let launch = worker.launch_spec.as_ref().ok_or_else(|| {
                    Self::rejected("active Team worker has no durable launch specification")
                })?;
                let worker_session_id = worker
                    .child_session_id
                    .as_deref()
                    .ok_or_else(|| Self::rejected("active Team worker has no child session"))?;
                stopped_worker |= self
                    .coordinator
                    .stop_active_background_subagent_session(
                        member_session_id,
                        &launch.parent_dialog_turn_id,
                        worker_session_id,
                    )
                    .await
                    .map_err(Self::map_runtime_error)?;
            }
        }
        match Self::persisted_stop_disposition(task.status) {
            PersistedStopDisposition::Reused => {
                return Ok(Self::receipt(
                    &request,
                    true,
                    RuntimeDisposition::Reused,
                    Self::task_state(task.status),
                    task.child_session_id.clone(),
                    Some(task.task_id),
                ));
            }
            PersistedStopDisposition::RejectTerminal => {
                if stopped_worker {
                    return Ok(Self::receipt(
                        &request,
                        true,
                        RuntimeDisposition::Stopped,
                        Self::task_state(task.status),
                        task.child_session_id.clone(),
                        Some(task.task_id),
                    ));
                }
                return Err(Self::rejected(
                    "a completed or failed member task cannot be reported as stopped",
                ));
            }
            PersistedStopDisposition::RequiresActiveStop => {}
        }
        let (child_session_id, _) = self.validated_child_session(&request, &task)?;
        let parent_dialog_turn_id = request
            .parent_dialog_turn_id
            .as_deref()
            .ok_or_else(|| Self::rejected("parentDialogTurnId is required"))?;
        let stopped = self
            .coordinator
            .stop_active_background_subagent_session(
                &request.parent_session_id,
                parent_dialog_turn_id,
                &child_session_id,
            )
            .await
            .map_err(Self::map_runtime_error)?;
        let refreshed_task = self
            .coordinator
            .get_session_manager()
            .get_subagent_task(&request.parent_session_id, &task.task_id)
            .await
            .map_err(Self::map_runtime_error)?
            .ok_or_else(|| Self::rejected("stopped subagent task could not be read back"))?;
        let persisted_disposition = Self::persisted_stop_disposition(refreshed_task.status);
        let disposition = if stopped {
            if persisted_disposition == PersistedStopDisposition::RejectTerminal {
                return Err(Self::rejected(
                    "a completed or failed member task cannot be reported as stopped",
                ));
            }
            RuntimeDisposition::Stopped
        } else if persisted_disposition == PersistedStopDisposition::Reused {
            RuntimeDisposition::Reused
        } else {
            return Err(Self::rejected(
                "the member task is not an active subagent execution and cannot be stopped safely",
            ));
        };
        Ok(Self::receipt(
            &request,
            true,
            disposition,
            Self::task_state(refreshed_task.status),
            refreshed_task
                .child_session_id
                .clone()
                .or(Some(child_session_id)),
            Some(refreshed_task.task_id),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::team_runtime::TeamWorkspaceIdentity;
    use void_core_types::{
        SubagentLaunchAuthority, SubagentTaskLaunchSpec, SubagentTaskReplaySafety,
        TeamDelegationLineageSnapshot, SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
    };

    fn request() -> RuntimeRequest {
        RuntimeRequest {
            operation_id: "operation".into(),
            parent_session_id: "parent".into(),
            team_instance_id: "instance".into(),
            team_definition_id: "definition".into(),
            team_definition_revision: "revision".into(),
            workspace: TeamWorkspaceIdentity {
                workspace_id: "workspace".into(),
                context_key: "local:workspace".into(),
                backend: TeamWorkspaceBackend::Local,
                remote_connection_id: None,
                remote_host: None,
            },
            parent_dialog_turn_id: Some("turn".into()),
            parent_tool_call_id: Some("tool".into()),
            team_run_id: Some("run".into()),
            member_id: Some("member".into()),
            member_run_id: Some("member-run".into()),
            child_session_id: None,
            subagent_task_id: Some("task".into()),
            phase_id: Some("phase".into()),
            agent_id: Some("agent".into()),
            objective: Some("objective".into()),
            timeout_seconds: Some(30),
            message: None,
            team_member_skill_policy: Some(
                TeamMemberSkillPolicySnapshot::new(
                    "definition".into(),
                    "revision".into(),
                    "instance".into(),
                    "member".into(),
                    "agent".into(),
                    vec![],
                )
                .unwrap(),
            ),
            team_member_delegation_policy: Some(
                crate::agentic::team_definitions::TeamMemberDelegationPolicy::bounded_default(),
            ),
        }
    }

    fn task() -> SubagentTaskRecord {
        let request = request();
        let mut task = SubagentTaskRecord::new_typed(
            "task".into(),
            "parent".into(),
            "objective".into(),
            "owner".into(),
            SubagentTaskExecutionMode::Background,
            SubagentTaskContextMode::Fresh,
            SubagentTaskReplaySafety::Idempotent,
            1,
        );
        task.launch_spec = Some(SubagentTaskLaunchSpec {
            agent_type: "agent".into(),
            parent_dialog_turn_id: "turn".into(),
            parent_tool_call_id: "tool".into(),
            context: PromptTeamRuntimeAdapter::durable_team_context(&request)
                .into_iter()
                .collect(),
            allow_subagent_spawn: true,
            nesting_depth: 1,
            timeout_seconds: Some(30),
            team_member_skill_policy: Some(
                TeamMemberSkillPolicySnapshot::new(
                    "definition".into(),
                    "revision".into(),
                    "instance".into(),
                    "member".into(),
                    "agent".into(),
                    vec![],
                )
                .unwrap(),
            ),
        });
        task.launch_authority = Some(SubagentLaunchAuthority {
            schema_version: SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
            kind: SubagentLaunchAuthorityKind::TeamMember,
            delegation_request_id: "tool".into(),
            nesting_depth: 1,
            max_nesting_depth: 2,
            task_spawn_budget: 8,
            max_parallel_workers: 3,
            team_lineage: Some(TeamDelegationLineageSnapshot {
                team_definition_id: "definition".into(),
                team_definition_revision: "revision".into(),
                team_instance_id: "instance".into(),
                team_run_id: "run".into(),
                member_run_id: "member-run".into(),
                member_id: "member".into(),
                root_parent_session_id: "parent".into(),
                parent_member_session_id: None,
            }),
        });
        task
    }

    #[test]
    fn durable_context_is_only_stable_team_scope() {
        let context = PromptTeamRuntimeAdapter::durable_team_context(&request());
        assert_eq!(context.len(), 10);
        assert_eq!(
            context.get("memberRunId").map(String::as_str),
            Some("member-run")
        );
        assert_eq!(
            context
                .get(TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY)
                .map(String::as_str),
            Some("parent")
        );
        assert_eq!(
            context
                .get(void_runtime_ports::TEAM_DELEGATION_MAX_WORKER_TASKS_CONTEXT_KEY)
                .map(String::as_str),
            Some("8")
        );
        assert_eq!(
            context
                .get(void_runtime_ports::TEAM_DELEGATION_MAX_PARALLEL_WORKERS_CONTEXT_KEY)
                .map(String::as_str),
            Some("3")
        );
        assert!(!context.contains_key("objective"));
        assert!(!context.contains_key("message"));
    }

    #[test]
    fn member_launch_fails_closed_without_parent_tool_identity() {
        let mut invalid = request();
        invalid.parent_tool_call_id = None;
        let error = PromptTeamRuntimeAdapter::validate_member_launch(&invalid).unwrap_err();
        assert_eq!(error.code, TeamOrchestratorErrorCode::AdapterRejected);
    }

    #[test]
    fn member_launch_requires_typed_skill_policy() {
        let mut invalid = request();
        invalid.team_member_skill_policy = None;
        assert!(PromptTeamRuntimeAdapter::validate_member_launch(&invalid).is_err());
    }

    #[test]
    fn parent_session_config_is_workspace_authority_but_context_key_is_not() {
        let mut value = request();
        value.workspace.context_key = "presentation-only-context".into();
        let config = SessionConfig {
            workspace_path: Some("D:\\workspace".into()),
            workspace_id: Some("workspace".into()),
            ..Default::default()
        };
        assert!(PromptTeamRuntimeAdapter::validate_parent_workspace(&value, &config).is_ok());

        value.workspace.backend = TeamWorkspaceBackend::Remote;
        value.workspace.remote_connection_id = Some("connection".into());
        value.workspace.remote_host = Some("host".into());
        assert!(PromptTeamRuntimeAdapter::validate_parent_workspace(&value, &config).is_err());
    }

    #[test]
    fn linked_task_requires_agent_identity_and_exact_typed_delegation_policy() {
        let mut value = request();
        let mut linked = task();
        assert!(PromptTeamRuntimeAdapter::validate_linked_task(&value, "task", &linked).is_ok());

        value.agent_id = Some("other-agent".into());
        assert!(PromptTeamRuntimeAdapter::validate_linked_task(&value, "task", &linked).is_err());

        value.agent_id = Some("agent".into());
        linked.launch_spec.as_mut().unwrap().allow_subagent_spawn = false;
        assert!(PromptTeamRuntimeAdapter::validate_linked_task(&value, "task", &linked).is_err());
    }

    #[test]
    fn legacy_no_policy_is_only_accepted_by_recovery_migration_precheck() {
        let mut legacy = task();
        let mut no_policy = request();
        no_policy.team_member_delegation_policy =
            Some(crate::agentic::team_definitions::TeamMemberDelegationPolicy::Disabled);
        legacy.launch_authority = None;
        let legacy_launch = legacy.launch_spec.as_mut().unwrap();
        legacy_launch.team_member_skill_policy = None;
        legacy_launch.allow_subagent_spawn = false;
        legacy_launch.context = PromptTeamRuntimeAdapter::durable_team_context(&no_policy)
            .into_iter()
            .filter(|(key, _)| key != TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY)
            .collect();
        assert!(
            PromptTeamRuntimeAdapter::validate_linked_task(&no_policy, "task", &legacy).is_err()
        );
        let expected =
            PromptTeamRuntimeAdapter::expected_member_recovery_launch(&no_policy, &legacy)
                .expect("legacy no_policy recovery should produce an exact migration launch");
        assert_eq!(
            expected.team_member_skill_policy,
            no_policy.team_member_skill_policy
        );
        let mut migrated = legacy.clone();
        migrated.launch_spec = Some(expected);
        assert!(PromptTeamRuntimeAdapter::validate_member_recovery(&no_policy, &migrated).is_ok());

        let mut restricted = request();
        restricted.team_member_skill_policy = Some(
            TeamMemberSkillPolicySnapshot::new(
                "definition".into(),
                "revision".into(),
                "instance".into(),
                "member".into(),
                "agent".into(),
                vec!["void:skill-a".into()],
            )
            .unwrap(),
        );
        assert!(
            PromptTeamRuntimeAdapter::expected_member_recovery_launch(&restricted, &legacy)
                .is_err()
        );
    }

    #[test]
    fn child_session_config_must_fully_match_parent() {
        let parent = SessionConfig {
            max_context_tokens: 4096,
            auto_compact: false,
            enable_tools: true,
            safe_mode: false,
            max_turns: 17,
            enable_context_compression: false,
            compression_threshold: 0.5,
            workspace_path: Some("/remote/project".into()),
            workspace_id: Some("workspace".into()),
            remote_connection_id: Some("connection".into()),
            remote_ssh_host: Some("host".into()),
            model_id: Some("model".into()),
        };
        let mut child = parent.clone();
        assert!(PromptTeamRuntimeAdapter::session_config_matches_parent(
            &child, &parent
        ));
        child.safe_mode = true;
        assert!(!PromptTeamRuntimeAdapter::session_config_matches_parent(
            &child, &parent
        ));
    }

    #[test]
    fn receipt_echoes_full_scope_and_typed_state() {
        let value = request();
        let receipt = PromptTeamRuntimeAdapter::receipt(
            &value,
            true,
            RuntimeDisposition::Reused,
            RuntimeTaskState::Running,
            Some("child".into()),
            Some("task".into()),
        );
        assert_eq!(receipt.team_instance_id, "instance");
        assert_eq!(receipt.parent_dialog_turn_id.as_deref(), Some("turn"));
        assert_eq!(receipt.task_state, RuntimeTaskState::Running);
        assert_eq!(receipt.disposition, RuntimeDisposition::Reused);
    }

    #[test]
    fn message_replay_maps_to_reused_instead_of_message_accepted() {
        assert_eq!(
            PromptTeamRuntimeAdapter::message_disposition(PreparedTurnDisposition::Created),
            RuntimeDisposition::MessageAccepted
        );
        assert_eq!(
            PromptTeamRuntimeAdapter::message_disposition(PreparedTurnDisposition::Reused),
            RuntimeDisposition::Reused
        );
    }

    #[test]
    fn stop_replay_only_reuses_persisted_cancelled_or_interrupted_tasks() {
        for status in [
            SubagentTaskStatus::Cancelled,
            SubagentTaskStatus::Interrupted,
        ] {
            assert_eq!(
                PromptTeamRuntimeAdapter::persisted_stop_disposition(status),
                PersistedStopDisposition::Reused
            );
        }
        for status in [SubagentTaskStatus::Completed, SubagentTaskStatus::Failed] {
            assert_eq!(
                PromptTeamRuntimeAdapter::persisted_stop_disposition(status),
                PersistedStopDisposition::RejectTerminal
            );
        }
        for status in [
            SubagentTaskStatus::Created,
            SubagentTaskStatus::Running,
            SubagentTaskStatus::Blocked,
        ] {
            assert_eq!(
                PromptTeamRuntimeAdapter::persisted_stop_disposition(status),
                PersistedStopDisposition::RequiresActiveStop
            );
        }
    }
}
