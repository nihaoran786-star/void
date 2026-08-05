//! Stateful Team orchestration service.
//!
//! The service reserves durable runtime state before crossing the adapter
//! boundary. This keeps task creation retryable and prevents an unrecorded
//! member task from being launched.

use super::team_definitions::{
    team_definition_revision, validate_team_definition, TeamDefinitionRecord,
};
use super::team_orchestrator::{
    stable_operation_id, AttachCommand, MessageCommand, ObserveCommand, PauseCommand,
    RecoverCommand, ResumeCommand, RuntimeReceipt, RuntimeRequest, RuntimeTaskState, StartCommand,
    StopCommand, TeamOrchestrator, TeamOrchestratorError, TeamOrchestratorErrorCode,
    TeamOrchestratorOutcome, TeamRuntimeAdapter,
};
use super::team_runtime::{
    TeamExecutionProfile, TeamInstance, TeamInstanceLifecycle, TeamLeadBinding, TeamMemberBinding,
    TeamMemberRun, TeamMemberRunStatus, TeamPhaseRun, TeamPhaseRunStatus, TeamRun, TeamRunStatus,
    TeamRuntimeError,
};
use super::team_runtime_store::{
    TeamRuntimeList, TeamRuntimeRecord, TeamRuntimeSnapshot, TeamRuntimeStore,
    TeamRuntimeStoreError, TeamRuntimeStoreErrorCode,
};
use async_trait::async_trait;
use std::sync::Arc;
use void_core_types::{SubagentTaskRecord, TeamMemberSkillPolicySnapshot};

#[async_trait]
pub trait DefinitionResolver: Send + Sync {
    async fn resolve(
        &self,
        team_definition_id: &str,
        team_definition_revision: &str,
    ) -> Result<Option<TeamDefinitionRecord>, TeamOrchestratorError>;
}

#[async_trait]
pub trait AdapterResolver: Send + Sync {
    async fn resolve(
        &self,
        execution_profile: &TeamExecutionProfile,
    ) -> Result<Arc<dyn TeamRuntimeAdapter>, TeamOrchestratorError>;
}

pub trait Clock: Send + Sync {
    fn now(&self) -> u64;
}

pub struct TeamRuntimeService {
    definitions: Arc<dyn DefinitionResolver>,
    store: Arc<dyn TeamRuntimeStore>,
    adapters: Arc<dyn AdapterResolver>,
    clock: Arc<dyn Clock>,
}

const MAX_CAS_ATTEMPTS: usize = 8;

#[derive(Clone, Copy)]
enum ReceiptEffect {
    Attach,
    Start,
    Message,
    Inspect,
    Reconcile,
    Stop,
}

impl TeamRuntimeService {
    pub fn new(
        definitions: Arc<dyn DefinitionResolver>,
        store: Arc<dyn TeamRuntimeStore>,
        adapters: Arc<dyn AdapterResolver>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            definitions,
            store,
            adapters,
            clock,
        }
    }

    /// List the durable Team runtime projections bound to one parent session.
    ///
    /// The persistence port remains private to the service so Desktop/Web
    /// adapters cannot bypass aggregate validation or accidentally enumerate a
    /// different parent-session scope.
    pub async fn list_records(
        &self,
        parent_session_id: &str,
    ) -> Result<TeamRuntimeList, TeamOrchestratorError> {
        Self::validate_required(&[("parentSessionId", parent_session_id)])?;
        let list = self
            .store
            .list(parent_session_id)
            .await
            .map_err(Self::map_store_error)?;
        if list
            .records
            .iter()
            .any(|record| record.snapshot.instance.parent_session_id != parent_session_id)
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::ScopeMismatch,
                "stored Team runtime list contains a record from another parent session",
                false,
            ));
        }
        Ok(list)
    }

    /// Refresh active background-member facts before projecting the Team list.
    ///
    /// Adapter inspection is read-only. A durable write occurs only when the
    /// member, phase, or Team-run state actually changed, so a polling UI does
    /// not churn the store while work is still in the same state.
    pub async fn reconcile_and_list_records(
        &self,
        parent_session_id: &str,
    ) -> Result<TeamRuntimeList, TeamOrchestratorError> {
        let initial = self.list_records(parent_session_id).await?;
        for record in initial.records.iter().filter(|record| {
            record.snapshot.instance.active_run_id.is_some()
                && matches!(
                    record.snapshot.instance.execution_profile,
                    TeamExecutionProfile::PromptOrchestrated
                )
        }) {
            let team_run_id = record
                .snapshot
                .instance
                .active_run_id
                .clone()
                .expect("active Team record selected above");
            let identity = super::team_orchestrator::TeamCommandIdentity {
                operation_id: stable_operation_id(
                    "team-runtime-reconcile",
                    parent_session_id,
                    &record.snapshot.instance.team_instance_id,
                    &[&team_run_id],
                ),
                parent_session_id: parent_session_id.to_string(),
                team_instance_id: record.snapshot.instance.team_instance_id.clone(),
            };
            if let Err(error) = self.reconcile_active_record_with_cas(&identity).await {
                self.fail_active_run_with_cas(&identity, &team_run_id, &error)
                    .await?;
            }
        }
        self.list_records(parent_session_id).await
    }

    /// Load one durable Team runtime projection without exposing the store.
    pub async fn get_record(
        &self,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> Result<Option<TeamRuntimeRecord>, TeamOrchestratorError> {
        Self::validate_required(&[
            ("parentSessionId", parent_session_id),
            ("teamInstanceId", team_instance_id),
        ])?;
        let record = self
            .store
            .load(parent_session_id, team_instance_id)
            .await
            .map_err(Self::map_store_error)?;
        if let Some(record) = record.as_ref() {
            let instance = &record.snapshot.instance;
            if instance.parent_session_id != parent_session_id
                || instance.team_instance_id != team_instance_id
            {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::ScopeMismatch,
                    "stored Team runtime scope does not match the requested projection",
                    false,
                ));
            }
        }
        Ok(record)
    }

    fn error(
        code: TeamOrchestratorErrorCode,
        message: impl Into<String>,
        retryable: bool,
    ) -> TeamOrchestratorError {
        TeamOrchestratorError {
            code,
            message: message.into(),
            retryable,
        }
    }

    fn rejected(
        operation_id: impl Into<String>,
        error: TeamOrchestratorError,
    ) -> TeamOrchestratorOutcome {
        TeamOrchestratorOutcome {
            operation_id: operation_id.into(),
            accepted: false,
            operation_ids: vec![],
            notes: vec![],
            error: Some(error),
        }
    }

    fn unsupported(operation_id: impl Into<String>, operation: &str) -> TeamOrchestratorOutcome {
        Self::rejected(
            operation_id,
            Self::error(
                TeamOrchestratorErrorCode::AdapterUnsupported,
                format!("Team runtime operation '{operation}' is not implemented"),
                false,
            ),
        )
    }

    fn validate_identity(
        identity: &super::team_orchestrator::TeamCommandIdentity,
    ) -> Result<(), TeamOrchestratorError> {
        for (name, value) in [
            ("operationId", identity.operation_id.as_str()),
            ("parentSessionId", identity.parent_session_id.as_str()),
            ("teamInstanceId", identity.team_instance_id.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::InvalidCommand,
                    format!("{name} is required"),
                    false,
                ));
            }
        }
        Ok(())
    }

    fn validate_required(fields: &[(&str, &str)]) -> Result<(), TeamOrchestratorError> {
        for (name, value) in fields {
            if value.trim().is_empty() {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::InvalidCommand,
                    format!("{name} is required"),
                    false,
                ));
            }
        }
        Ok(())
    }

    async fn definition(
        &self,
        definition_id: &str,
        expected_revision: &str,
    ) -> Result<TeamDefinitionRecord, TeamOrchestratorError> {
        let record = self
            .definitions
            .resolve(definition_id, expected_revision)
            .await?
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::DefinitionNotFound,
                    "Team definition was not found",
                    false,
                )
            })?;
        validate_team_definition(&record.definition).map_err(|error| {
            Self::error(
                TeamOrchestratorErrorCode::DefinitionInvalid,
                error.message,
                false,
            )
        })?;
        if record.definition.team_definition_id != definition_id {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionInvalid,
                "resolved Team definition ID does not match the request",
                false,
            ));
        }
        if record.revision != expected_revision {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                "resolved Team definition revision does not match the request",
                false,
            ));
        }
        if team_definition_revision(&record.definition) != record.revision {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                "Team definition content does not match its recorded revision",
                false,
            ));
        }
        Ok(record)
    }

    fn map_store_error(error: TeamRuntimeStoreError) -> TeamOrchestratorError {
        let code = if error.code == TeamRuntimeStoreErrorCode::RevisionConflict {
            TeamOrchestratorErrorCode::RuntimeConflict
        } else {
            TeamOrchestratorErrorCode::StoreFailure
        };
        Self::error(code, error.message, error.retryable)
    }

    fn map_contract_error(error: impl std::fmt::Display) -> TeamOrchestratorError {
        Self::error(
            TeamOrchestratorErrorCode::RuntimeConflict,
            format!("Team runtime state is invalid: {error}"),
            false,
        )
    }

    fn check_scope(
        identity: &super::team_orchestrator::TeamCommandIdentity,
        record: &TeamRuntimeRecord,
    ) -> Result<(), TeamOrchestratorError> {
        let instance = &record.snapshot.instance;
        if instance.parent_session_id != identity.parent_session_id
            || instance.team_instance_id != identity.team_instance_id
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::ScopeMismatch,
                "stored Team runtime scope does not match the command",
                false,
            ));
        }
        Ok(())
    }

    fn request(operation_id: String, instance: &TeamInstance) -> RuntimeRequest {
        RuntimeRequest {
            operation_id,
            parent_session_id: instance.parent_session_id.clone(),
            team_instance_id: instance.team_instance_id.clone(),
            team_definition_id: instance.team_definition_id.clone(),
            team_definition_revision: instance.team_definition_revision.clone(),
            workspace: instance.workspace.clone(),
            parent_dialog_turn_id: None,
            parent_tool_call_id: None,
            team_run_id: None,
            member_id: None,
            child_session_id: None,
            subagent_task_id: None,
            phase_id: None,
            agent_id: None,
            objective: None,
            timeout_seconds: None,
            message: None,
            team_member_skill_policy: None,
        }
    }

    fn validate_receipt_scope(
        receipt: &RuntimeReceipt,
        request: &RuntimeRequest,
        effect: ReceiptEffect,
    ) -> Result<(), TeamOrchestratorError> {
        if receipt.operation_id != request.operation_id
            || receipt.parent_session_id != request.parent_session_id
            || receipt.team_instance_id != request.team_instance_id
            || receipt.team_definition_id != request.team_definition_id
            || receipt.team_definition_revision != request.team_definition_revision
            || receipt.workspace != request.workspace
            || receipt.parent_dialog_turn_id != request.parent_dialog_turn_id
            || receipt.parent_tool_call_id != request.parent_tool_call_id
            || receipt.team_run_id != request.team_run_id
            || receipt.member_id != request.member_id
            || receipt.phase_id != request.phase_id
            || receipt.agent_id != request.agent_id
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::AdapterRejected,
                "runtime adapter receipt does not match the reserved Team operation",
                false,
            ));
        }
        if !receipt.accepted {
            return Err(Self::error(
                TeamOrchestratorErrorCode::AdapterRejected,
                "runtime adapter rejected the Team operation",
                false,
            ));
        }
        let may_hydrate_runtime_references =
            matches!(effect, ReceiptEffect::Start | ReceiptEffect::Reconcile);
        if (!may_hydrate_runtime_references
            && (receipt.child_session_id != request.child_session_id
                || receipt.subagent_task_id != request.subagent_task_id))
            || (may_hydrate_runtime_references
                && ((request.child_session_id.is_some()
                    && receipt.child_session_id != request.child_session_id)
                    || (request.subagent_task_id.is_some()
                        && receipt.subagent_task_id != request.subagent_task_id)))
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::AdapterRejected,
                "runtime adapter receipt changed a persisted member task or session binding",
                false,
            ));
        }
        let valid_disposition = match effect {
            ReceiptEffect::Attach => matches!(
                receipt.disposition,
                super::team_orchestrator::RuntimeDisposition::Activated
            ),
            ReceiptEffect::Start => matches!(
                receipt.disposition,
                super::team_orchestrator::RuntimeDisposition::Created
                    | super::team_orchestrator::RuntimeDisposition::Reused
            ),
            ReceiptEffect::Message => matches!(
                receipt.disposition,
                super::team_orchestrator::RuntimeDisposition::MessageAccepted
                    | super::team_orchestrator::RuntimeDisposition::Reused
            ),
            ReceiptEffect::Inspect => matches!(
                receipt.disposition,
                super::team_orchestrator::RuntimeDisposition::Inspected
            ),
            ReceiptEffect::Reconcile => matches!(
                receipt.disposition,
                super::team_orchestrator::RuntimeDisposition::Inspected
            ),
            ReceiptEffect::Stop => matches!(
                receipt.disposition,
                super::team_orchestrator::RuntimeDisposition::Stopped
                    | super::team_orchestrator::RuntimeDisposition::Reused
            ),
        };
        if !valid_disposition {
            return Err(Self::error(
                TeamOrchestratorErrorCode::AdapterRejected,
                "runtime adapter receipt has an unexpected disposition",
                false,
            ));
        }
        if matches!(
            receipt.task_state,
            RuntimeTaskState::Failed | RuntimeTaskState::NotFound
        ) {
            return Err(Self::error(
                TeamOrchestratorErrorCode::AdapterRejected,
                "runtime adapter receipt reports a missing or failed member task",
                false,
            ));
        }
        Ok(())
    }

    fn runtime_error(error: &TeamOrchestratorError) -> TeamRuntimeError {
        TeamRuntimeError {
            source: "team_runtime_service".to_string(),
            code: format!("{:?}", error.code).to_ascii_lowercase(),
            message: error.message.clone(),
            retryable: error.retryable,
            recovery_action: Some("start_a_new_team_run".to_string()),
        }
    }

    async fn load_scoped(
        &self,
        identity: &super::team_orchestrator::TeamCommandIdentity,
    ) -> Result<TeamRuntimeRecord, TeamOrchestratorError> {
        let record = self
            .store
            .load(&identity.parent_session_id, &identity.team_instance_id)
            .await
            .map_err(Self::map_store_error)?
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team runtime was not found",
                    false,
                )
            })?;
        Self::check_scope(identity, &record)?;
        Ok(record)
    }

    async fn member_request(
        &self,
        record: &TeamRuntimeRecord,
        team_run_id: &str,
        member_run_id: &str,
        operation_id: String,
        message: Option<String>,
    ) -> Result<RuntimeRequest, TeamOrchestratorError> {
        let run = record
            .snapshot
            .team_runs
            .iter()
            .find(|run| run.team_run_id == team_run_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team run was not found",
                    false,
                )
            })?;
        let member = record
            .snapshot
            .member_runs
            .iter()
            .find(|member| member.member_run_id == member_run_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "member run was not found",
                    false,
                )
            })?;
        if member.team_run_id != run.team_run_id
            || member.team_instance_id != run.team_instance_id
            || member.parent_dialog_turn_id.as_deref() != Some(run.parent_dialog_turn_id.as_str())
            || member.parent_tool_call_id.as_deref() != Some(run.parent_tool_call_id.as_str())
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "persisted member execution scope does not match its Team run",
                false,
            ));
        }
        let mut request = Self::request(operation_id, &record.snapshot.instance);
        request.parent_dialog_turn_id = Some(run.parent_dialog_turn_id.clone());
        request.parent_tool_call_id = Some(run.parent_tool_call_id.clone());
        request.team_run_id = Some(run.team_run_id.clone());
        request.member_id = Some(member.member_id.clone());
        request.child_session_id = member.child_session_id.clone();
        request.subagent_task_id = member.subagent_task_id.clone();
        request.phase_id = member.phase_id.clone();
        request.agent_id = member.agent_id.clone();
        request.objective = Some(run.objective.clone());
        request.message = message;
        let definition_record = self
            .definition(
                &record.snapshot.instance.team_definition_id,
                &record.snapshot.instance.team_definition_revision,
            )
            .await?;
        let definition_member = definition_record
            .definition
            .members
            .iter()
            .find(|definition_member| definition_member.member_id == member.member_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                    "persisted Team member is absent from the pinned Team definition",
                    false,
                )
            })?;
        let definition_agent_id = definition_member
            .agent_id
            .as_deref()
            .filter(|agent_id| !agent_id.trim().is_empty())
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                    "pinned Team member has no executable agent identity",
                    false,
                )
            })?;
        if member.agent_id.as_deref() != Some(definition_agent_id) {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                "persisted Team member agent does not match the pinned Team definition",
                false,
            ));
        }
        request.team_member_skill_policy = Some(
            TeamMemberSkillPolicySnapshot::new(
                definition_record.definition.team_definition_id,
                definition_record.revision,
                record.snapshot.instance.team_instance_id.clone(),
                definition_member.member_id.clone(),
                definition_agent_id.to_string(),
                definition_member.allowed_skill_keys.clone(),
            )
            .map_err(|error| {
                Self::error(
                    TeamOrchestratorErrorCode::DefinitionInvalid,
                    format!("Team member Skill policy is invalid: {error}"),
                    false,
                )
            })?,
        );
        Ok(request)
    }

    /// Rebuild the complete member request from authoritative Team state and
    /// the exact pinned definition revision. Durable task context is used only
    /// to locate the record; every marker is then checked against the stored
    /// instance/run/phase/member binding.
    pub async fn member_recovery_request(
        &self,
        task: &SubagentTaskRecord,
    ) -> Result<RuntimeRequest, TeamOrchestratorError> {
        let launch = task.launch_spec.as_ref().ok_or_else(|| {
            Self::error(
                TeamOrchestratorErrorCode::RecoveryReferenceMissing,
                "Team member recovery task has no durable launch specification",
                false,
            )
        })?;
        let marker = |name: &str| {
            launch
                .context
                .get(name)
                .map(String::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    Self::error(
                        TeamOrchestratorErrorCode::RecoveryReferenceMissing,
                        format!("Team member recovery task is missing {name}"),
                        false,
                    )
                })
        };
        let definition_id = marker("teamDefinitionId")?;
        let definition_revision = marker("teamDefinitionRevision")?;
        let team_instance_id = marker("teamInstanceId")?;
        let team_run_id = marker("teamRunId")?;
        let member_id = marker("teamMemberId")?;
        let phase_id = marker("teamPhaseId")?;

        let record = self
            .get_record(&task.parent_session_id, team_instance_id)
            .await?
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team runtime was not found for the durable member task",
                    false,
                )
            })?;
        let instance = &record.snapshot.instance;
        if instance.team_definition_id != definition_id
            || instance.team_definition_revision != definition_revision
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                "durable Team markers do not match the pinned Team instance definition",
                false,
            ));
        }
        let run = record
            .snapshot
            .team_runs
            .iter()
            .find(|run| run.team_run_id == team_run_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team run was not found for the durable member task",
                    false,
                )
            })?;
        if run.team_instance_id != team_instance_id || run.objective != task.objective {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "durable Team task objective or instance does not match its Team run",
                false,
            ));
        }
        if !record.snapshot.phase_runs.iter().any(|phase| {
            phase.team_run_id == team_run_id
                && phase.team_instance_id == team_instance_id
                && phase.phase_id == phase_id
        }) {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "durable Team phase marker does not match a persisted phase run",
                false,
            ));
        }
        let member = record
            .snapshot
            .member_runs
            .iter()
            .find(|member| {
                member.team_run_id == team_run_id
                    && member.member_id == member_id
                    && member.phase_id.as_deref() == Some(phase_id)
                    && member.subagent_task_id.as_deref() == Some(task.task_id.as_str())
            })
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team member run was not found for the durable task binding",
                    false,
                )
            })?;
        if member.child_session_id != task.child_session_id {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "durable Team task child session does not match the member run",
                false,
            ));
        }
        let operation_id = stable_operation_id(
            "restart-recovery-preflight",
            &task.parent_session_id,
            team_instance_id,
            &[team_run_id, phase_id, member_id, &task.task_id],
        );
        let request = self
            .member_request(
                &record,
                team_run_id,
                &member.member_run_id,
                operation_id,
                None,
            )
            .await?;
        Self::require_complete_member_reference(&request)?;
        if request.child_session_id != task.child_session_id
            || request.subagent_task_id.as_deref() != Some(task.task_id.as_str())
            || request.objective.as_deref() != Some(task.objective.as_str())
            || request.parent_dialog_turn_id.as_deref()
                != Some(launch.parent_dialog_turn_id.as_str())
            || request.parent_tool_call_id.as_deref() != Some(launch.parent_tool_call_id.as_str())
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "rebuilt Team recovery request does not match the durable task binding",
                false,
            ));
        }
        Ok(request)
    }

    fn require_complete_member_reference(
        request: &RuntimeRequest,
    ) -> Result<(), TeamOrchestratorError> {
        Self::require_member_reference(request, true)
    }

    fn require_reconcilable_member_reference(
        request: &RuntimeRequest,
    ) -> Result<(), TeamOrchestratorError> {
        Self::require_member_reference(request, false)
    }

    fn require_member_reference(
        request: &RuntimeRequest,
        require_child_session: bool,
    ) -> Result<(), TeamOrchestratorError> {
        for (name, value) in [
            (
                "parentDialogTurnId",
                request.parent_dialog_turn_id.as_deref(),
            ),
            ("parentToolCallId", request.parent_tool_call_id.as_deref()),
            ("teamRunId", request.team_run_id.as_deref()),
            ("memberId", request.member_id.as_deref()),
            ("subagentTaskId", request.subagent_task_id.as_deref()),
            ("phaseId", request.phase_id.as_deref()),
            ("agentId", request.agent_id.as_deref()),
        ] {
            if value
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
            {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::RecoveryReferenceMissing,
                    format!("persisted member runtime is missing {name}"),
                    false,
                ));
            }
        }
        if require_child_session
            && request
                .child_session_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RecoveryReferenceMissing,
                "persisted member runtime is missing childSessionId",
                false,
            ));
        }
        Ok(())
    }

    async fn persist_attach_failure(
        &self,
        mut record: TeamRuntimeRecord,
        error: &TeamOrchestratorError,
    ) -> Result<(), TeamOrchestratorError> {
        let now = self.clock.now();
        record
            .snapshot
            .instance
            .transition(
                TeamInstanceLifecycle::Unavailable,
                Some(TeamRuntimeError {
                    source: "team_runtime_service".to_string(),
                    code: "activation_failed".to_string(),
                    message: error.message.clone(),
                    retryable: error.retryable,
                    recovery_action: Some("reattach_team".to_string()),
                }),
                now,
            )
            .map_err(Self::map_contract_error)?;
        let parent_session_id = record.snapshot.instance.parent_session_id.clone();
        let team_instance_id = record.snapshot.instance.team_instance_id.clone();
        self.store
            .save(
                &parent_session_id,
                &team_instance_id,
                record.snapshot,
                Some(record.revision),
            )
            .await
            .map_err(Self::map_store_error)?;
        Ok(())
    }

    async fn finish_attach(
        &self,
        command: &AttachCommand,
        mut record: TeamRuntimeRecord,
    ) -> TeamOrchestratorOutcome {
        let adapter = match self.adapters.resolve(&command.execution_profile).await {
            Ok(adapter) => adapter,
            Err(error) => {
                if let Err(store_error) = self.persist_attach_failure(record, &error).await {
                    return Self::rejected(&command.identity.operation_id, store_error);
                }
                return Self::rejected(&command.identity.operation_id, error);
            }
        };
        let request = Self::request(
            command.identity.operation_id.clone(),
            &record.snapshot.instance,
        );
        let receipt = match adapter.activate_lead(request.clone()).await {
            Ok(receipt) => {
                match Self::validate_receipt_scope(&receipt, &request, ReceiptEffect::Attach) {
                    Ok(()) => receipt,
                    Err(error) => {
                        if let Err(store_error) = self.persist_attach_failure(record, &error).await
                        {
                            return Self::rejected(&command.identity.operation_id, store_error);
                        }
                        return Self::rejected(&command.identity.operation_id, error);
                    }
                }
            }
            Err(error) => {
                if let Err(store_error) = self.persist_attach_failure(record, &error).await {
                    return Self::rejected(&command.identity.operation_id, store_error);
                }
                return Self::rejected(&command.identity.operation_id, error);
            }
        };
        let now = self.clock.now();
        if let Err(error) =
            record
                .snapshot
                .instance
                .transition(TeamInstanceLifecycle::Ready, None, now)
        {
            return Self::rejected(
                &command.identity.operation_id,
                Self::map_contract_error(error),
            );
        }
        match self
            .store
            .save(
                &command.identity.parent_session_id,
                &command.identity.team_instance_id,
                record.snapshot,
                Some(record.revision),
            )
            .await
        {
            Ok(_) => TeamOrchestratorOutcome::accepted(
                command.identity.operation_id.clone(),
                vec![receipt.operation_id],
            ),
            Err(error) => {
                Self::rejected(&command.identity.operation_id, Self::map_store_error(error))
            }
        }
    }

    fn attach_matches(command: &AttachCommand, record: &TeamRuntimeRecord) -> bool {
        let instance = &record.snapshot.instance;
        instance.parent_session_id == command.identity.parent_session_id
            && instance.team_instance_id == command.identity.team_instance_id
            && instance.team_definition_id == command.team_definition_id
            && instance.team_definition_revision == command.team_definition_revision
            && instance.workspace == command.workspace
            && instance.execution_profile == command.execution_profile
            && instance.creation_source == command.creation_source
    }

    fn apply_receipt(
        snapshot: &mut TeamRuntimeSnapshot,
        member_run_id: &str,
        request: &RuntimeRequest,
        receipt: &RuntimeReceipt,
        effect: ReceiptEffect,
        updated_at: u64,
    ) -> Result<(), TeamOrchestratorError> {
        let member_id = request.member_id.as_deref().ok_or_else(|| {
            Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "member operation has no member ID",
                false,
            )
        })?;
        let mut candidate = snapshot.clone();
        let member_index = candidate
            .member_runs
            .iter()
            .position(|run| run.member_run_id == member_run_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "persisted member run was not found",
                    false,
                )
            })?;
        let member = &candidate.member_runs[member_index];
        if member.has_applied_operation(&request.operation_id) {
            return Ok(());
        }
        if member.team_run_id.as_str() != request.team_run_id.as_deref().unwrap_or_default()
            || member.member_id != member_id
            || member.phase_id != request.phase_id
            || member.agent_id != request.agent_id
            || member.parent_dialog_turn_id != request.parent_dialog_turn_id
            || member.parent_tool_call_id != request.parent_tool_call_id
            || member.subagent_task_id != request.subagent_task_id
            || member.child_session_id != request.child_session_id
            || (matches!(effect, ReceiptEffect::Start)
                && member.operation_id.as_deref() != Some(request.operation_id.as_str()))
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::RuntimeConflict,
                "member receipt no longer matches the persisted run scope",
                false,
            ));
        }
        {
            let member = &mut candidate.member_runs[member_index];
            if matches!(effect, ReceiptEffect::Start | ReceiptEffect::Reconcile) {
                member
                    .align_runtime_references(
                        receipt.child_session_id.clone(),
                        receipt.subagent_task_id.clone(),
                        updated_at,
                    )
                    .map_err(Self::map_contract_error)?;
            }
            if !matches!(effect, ReceiptEffect::Stop) {
                Self::sync_member_task_state(member, receipt.task_state, updated_at)?;
            }
            if !matches!(effect, ReceiptEffect::Reconcile) {
                member
                    .mark_operation_applied(request.operation_id.clone(), updated_at)
                    .map_err(Self::map_contract_error)?;
            }
        }
        if matches!(effect, ReceiptEffect::Start | ReceiptEffect::Reconcile) {
            candidate
                .instance
                .align_member_binding(
                    member_id,
                    receipt.child_session_id.clone(),
                    receipt.subagent_task_id.clone(),
                    updated_at,
                )
                .map_err(Self::map_contract_error)?;
        }
        candidate.validate().map_err(Self::map_contract_error)?;
        *snapshot = candidate;
        Ok(())
    }

    fn sync_member_task_state(
        member: &mut TeamMemberRun,
        task_state: RuntimeTaskState,
        updated_at: u64,
    ) -> Result<(), TeamOrchestratorError> {
        if member.status.is_terminal() {
            return Ok(());
        }
        let transition = |member: &mut TeamMemberRun, next| {
            member
                .transition(next, None, updated_at)
                .map_err(Self::map_contract_error)
        };
        if member.status == TeamMemberRunStatus::Idle {
            transition(member, TeamMemberRunStatus::Queued)?;
        }
        match task_state {
            RuntimeTaskState::Created | RuntimeTaskState::NotApplicable => {}
            RuntimeTaskState::Running => {
                if member.status == TeamMemberRunStatus::Waiting {
                    transition(member, TeamMemberRunStatus::Running)?;
                } else if member.status == TeamMemberRunStatus::Queued {
                    transition(member, TeamMemberRunStatus::Running)?;
                }
            }
            RuntimeTaskState::Blocked => {
                if member.status == TeamMemberRunStatus::Queued {
                    transition(member, TeamMemberRunStatus::Running)?;
                }
                if member.status == TeamMemberRunStatus::Running {
                    transition(member, TeamMemberRunStatus::Waiting)?;
                }
            }
            RuntimeTaskState::Completed => {
                if member.status == TeamMemberRunStatus::Queued {
                    transition(member, TeamMemberRunStatus::Running)?;
                } else if member.status == TeamMemberRunStatus::Waiting {
                    transition(member, TeamMemberRunStatus::Running)?;
                }
                if member.status == TeamMemberRunStatus::Running {
                    transition(member, TeamMemberRunStatus::Completed)?;
                }
            }
            RuntimeTaskState::Cancelled => {
                transition(member, TeamMemberRunStatus::Cancelled)?;
            }
            RuntimeTaskState::Interrupted => {
                if member.status == TeamMemberRunStatus::Queued {
                    transition(member, TeamMemberRunStatus::Interrupted)?;
                } else {
                    transition(member, TeamMemberRunStatus::Interrupted)?;
                }
            }
            RuntimeTaskState::Failed | RuntimeTaskState::NotFound => {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::AdapterRejected,
                    "member task is missing or failed",
                    false,
                ));
            }
        }
        Ok(())
    }

    fn sync_completed_scopes(
        snapshot: &mut TeamRuntimeSnapshot,
        definition: &TeamDefinitionRecord,
        team_run_id: &str,
        updated_at: u64,
    ) -> Result<(), TeamOrchestratorError> {
        let run_index = snapshot
            .team_runs
            .iter()
            .position(|run| run.team_run_id == team_run_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team run was not found while reconciling member progress",
                    false,
                )
            })?;
        let workflow = definition
            .definition
            .workflows
            .iter()
            .find(|workflow| workflow.workflow_id == snapshot.team_runs[run_index].workflow_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::WorkflowNotFound,
                    "pinned Team workflow was not found while reconciling progress",
                    false,
                )
            })?;

        let phase_run_ids = snapshot
            .phase_runs
            .iter()
            .filter(|phase| phase.team_run_id == team_run_id)
            .map(|phase| phase.phase_run_id.clone())
            .collect::<Vec<_>>();
        for phase_run_id in phase_run_ids {
            let phase_index = snapshot
                .phase_runs
                .iter()
                .position(|phase| phase.phase_run_id == phase_run_id)
                .expect("phase run selected above");
            if snapshot.phase_runs[phase_index].status.is_terminal() {
                continue;
            }
            let phase_id = snapshot.phase_runs[phase_index].phase_id.clone();
            let member_statuses = snapshot
                .member_runs
                .iter()
                .filter(|member| {
                    member.team_run_id == team_run_id
                        && member.phase_id.as_deref() == Some(phase_id.as_str())
                })
                .map(|member| member.status)
                .collect::<Vec<_>>();
            if member_statuses.is_empty() {
                continue;
            }
            if snapshot.phase_runs[phase_index].status == TeamPhaseRunStatus::Ready
                && member_statuses
                    .iter()
                    .any(|status| *status != TeamMemberRunStatus::Idle)
            {
                snapshot.phase_runs[phase_index]
                    .transition(TeamPhaseRunStatus::Running, None, updated_at)
                    .map_err(Self::map_contract_error)?;
            }
            if member_statuses
                .iter()
                .all(|status| *status == TeamMemberRunStatus::Completed)
                && snapshot.phase_runs[phase_index].status == TeamPhaseRunStatus::Running
            {
                snapshot.phase_runs[phase_index]
                    .transition(TeamPhaseRunStatus::Completed, None, updated_at)
                    .map_err(Self::map_contract_error)?;
            }
        }

        let phase_runs = snapshot
            .phase_runs
            .iter()
            .filter(|phase| phase.team_run_id == team_run_id)
            .collect::<Vec<_>>();
        let all_workflow_phases_present = workflow.phases.len() == phase_runs.len()
            && workflow.phases.iter().all(|definition_phase| {
                phase_runs
                    .iter()
                    .any(|phase| phase.phase_id == definition_phase.phase_id)
            });
        if all_workflow_phases_present
            && phase_runs
                .iter()
                .all(|phase| phase.status == TeamPhaseRunStatus::Completed)
            && snapshot.team_runs[run_index].status == TeamRunStatus::Running
        {
            snapshot.team_runs[run_index]
                .transition(TeamRunStatus::Completed, None, updated_at)
                .map_err(Self::map_contract_error)?;
            let completed_run = snapshot.team_runs[run_index].clone();
            if snapshot.instance.active_run_id.as_deref() == Some(team_run_id) {
                snapshot
                    .instance
                    .clear_active_run(&completed_run, updated_at)
                    .map_err(Self::map_contract_error)?;
            }
        }
        snapshot.validate().map_err(Self::map_contract_error)
    }

    async fn reconcile_active_record_with_cas(
        &self,
        identity: &super::team_orchestrator::TeamCommandIdentity,
    ) -> Result<(), TeamOrchestratorError> {
        for _ in 0..MAX_CAS_ATTEMPTS {
            let record = self.load_scoped(identity).await?;
            let Some(team_run_id) = record.snapshot.instance.active_run_id.clone() else {
                return Ok(());
            };
            let definition = self
                .definition(
                    &record.snapshot.instance.team_definition_id,
                    &record.snapshot.instance.team_definition_revision,
                )
                .await?;
            let member_run_ids = record
                .snapshot
                .member_runs
                .iter()
                .filter(|member| member.team_run_id == team_run_id && !member.status.is_terminal())
                .map(|member| member.member_run_id.clone())
                .collect::<Vec<_>>();
            let adapter = self
                .adapters
                .resolve(&record.snapshot.instance.execution_profile)
                .await?;
            let mut candidate = record.snapshot.clone();
            for member_run_id in member_run_ids {
                let operation_id = stable_operation_id(
                    &identity.operation_id,
                    &identity.parent_session_id,
                    &identity.team_instance_id,
                    &[&team_run_id, &member_run_id, "member"],
                );
                let request = self
                    .member_request(&record, &team_run_id, &member_run_id, operation_id, None)
                    .await?;
                Self::require_reconcilable_member_reference(&request)?;
                let receipt = adapter.inspect_member_task(request.clone()).await?;
                Self::validate_receipt_scope(&receipt, &request, ReceiptEffect::Reconcile)?;
                Self::apply_receipt(
                    &mut candidate,
                    &member_run_id,
                    &request,
                    &receipt,
                    ReceiptEffect::Reconcile,
                    self.clock.now(),
                )?;
            }
            Self::sync_completed_scopes(
                &mut candidate,
                &definition,
                &team_run_id,
                self.clock.now(),
            )?;
            if candidate == record.snapshot {
                return Ok(());
            }
            match self
                .store
                .save(
                    &identity.parent_session_id,
                    &identity.team_instance_id,
                    candidate,
                    Some(record.revision),
                )
                .await
            {
                Ok(_) => return Ok(()),
                Err(error) if error.code == TeamRuntimeStoreErrorCode::RevisionConflict => continue,
                Err(error) => return Err(Self::map_store_error(error)),
            }
        }
        Err(Self::error(
            TeamOrchestratorErrorCode::RuntimeConflict,
            "Team runtime reconciliation exceeded the bounded CAS retry limit",
            true,
        ))
    }

    async fn persist_receipt_with_cas(
        &self,
        identity: &super::team_orchestrator::TeamCommandIdentity,
        team_run_id: &str,
        member_run_id: &str,
        mut record: TeamRuntimeRecord,
        request: &RuntimeRequest,
        receipt: &RuntimeReceipt,
        effect: ReceiptEffect,
    ) -> Result<TeamRuntimeRecord, TeamOrchestratorError> {
        for _ in 0..MAX_CAS_ATTEMPTS {
            Self::apply_receipt(
                &mut record.snapshot,
                member_run_id,
                request,
                receipt,
                effect,
                self.clock.now(),
            )?;
            match self
                .store
                .save(
                    &identity.parent_session_id,
                    &identity.team_instance_id,
                    record.snapshot,
                    Some(record.revision),
                )
                .await
            {
                Ok(saved) => return Ok(saved),
                Err(error) if error.code == TeamRuntimeStoreErrorCode::RevisionConflict => {
                    record = self.load_scoped(identity).await?;
                    let run_exists = record
                        .snapshot
                        .team_runs
                        .iter()
                        .any(|run| run.team_run_id == team_run_id);
                    if !run_exists {
                        return Err(Self::error(
                            TeamOrchestratorErrorCode::RuntimeConflict,
                            "Team run disappeared while applying a runtime receipt",
                            false,
                        ));
                    }
                }
                Err(error) => return Err(Self::map_store_error(error)),
            }
        }
        Err(Self::error(
            TeamOrchestratorErrorCode::RuntimeConflict,
            "Team runtime receipt exceeded the bounded CAS retry limit",
            true,
        ))
    }

    async fn fail_active_run_with_cas(
        &self,
        identity: &super::team_orchestrator::TeamCommandIdentity,
        team_run_id: &str,
        cause: &TeamOrchestratorError,
    ) -> Result<(), TeamOrchestratorError> {
        let failure = Self::runtime_error(cause);
        for _ in 0..MAX_CAS_ATTEMPTS {
            let record = self.load_scoped(identity).await?;
            let Some(run) = record
                .snapshot
                .team_runs
                .iter()
                .find(|run| run.team_run_id == team_run_id)
            else {
                return Ok(());
            };
            if run.status.is_terminal() {
                return Ok(());
            }
            let mut snapshot = record.snapshot.clone();
            let now = self.clock.now();
            for member in snapshot
                .member_runs
                .iter_mut()
                .filter(|member| member.team_run_id == team_run_id && !member.status.is_terminal())
            {
                member
                    .transition(TeamMemberRunStatus::Failed, Some(failure.clone()), now)
                    .map_err(Self::map_contract_error)?;
            }
            for phase in snapshot
                .phase_runs
                .iter_mut()
                .filter(|phase| phase.team_run_id == team_run_id && !phase.status.is_terminal())
            {
                phase
                    .transition(TeamPhaseRunStatus::Failed, Some(failure.clone()), now)
                    .map_err(Self::map_contract_error)?;
            }
            let run_index = snapshot
                .team_runs
                .iter()
                .position(|run| run.team_run_id == team_run_id)
                .expect("run checked above");
            snapshot.team_runs[run_index]
                .transition(TeamRunStatus::Failed, Some(failure.clone()), now)
                .map_err(Self::map_contract_error)?;
            let failed_run = snapshot.team_runs[run_index].clone();
            if snapshot.instance.active_run_id.as_deref() == Some(team_run_id) {
                snapshot
                    .instance
                    .clear_active_run(&failed_run, now)
                    .map_err(Self::map_contract_error)?;
            }
            match self
                .store
                .save(
                    &identity.parent_session_id,
                    &identity.team_instance_id,
                    snapshot,
                    Some(record.revision),
                )
                .await
            {
                Ok(_) => return Ok(()),
                Err(error) if error.code == TeamRuntimeStoreErrorCode::RevisionConflict => continue,
                Err(error) => return Err(Self::map_store_error(error)),
            }
        }
        Err(Self::error(
            TeamOrchestratorErrorCode::RuntimeConflict,
            "Team run failure exceeded the bounded CAS retry limit",
            true,
        ))
    }

    async fn reject_and_fail(
        &self,
        identity: &super::team_orchestrator::TeamCommandIdentity,
        team_run_id: &str,
        error: TeamOrchestratorError,
    ) -> TeamOrchestratorOutcome {
        match self
            .fail_active_run_with_cas(identity, team_run_id, &error)
            .await
        {
            Ok(()) => Self::rejected(&identity.operation_id, error),
            Err(store_error) => Self::rejected(&identity.operation_id, store_error),
        }
    }

    async fn cancel_run_with_cas(
        &self,
        identity: &super::team_orchestrator::TeamCommandIdentity,
        team_run_id: &str,
    ) -> Result<(), TeamOrchestratorError> {
        for _ in 0..MAX_CAS_ATTEMPTS {
            let record = self.load_scoped(identity).await?;
            let run_index = record
                .snapshot
                .team_runs
                .iter()
                .position(|run| run.team_run_id == team_run_id)
                .ok_or_else(|| {
                    Self::error(
                        TeamOrchestratorErrorCode::RuntimeNotFound,
                        "Team run was not found",
                        false,
                    )
                })?;
            if record.snapshot.team_runs[run_index].status == TeamRunStatus::Cancelled {
                return Ok(());
            }
            if record.snapshot.team_runs[run_index].status.is_terminal() {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "a terminal Team run cannot be stopped again",
                    false,
                ));
            }
            let mut snapshot = record.snapshot.clone();
            let now = self.clock.now();
            for member in snapshot
                .member_runs
                .iter_mut()
                .filter(|member| member.team_run_id == team_run_id && !member.status.is_terminal())
            {
                member
                    .transition(TeamMemberRunStatus::Cancelled, None, now)
                    .map_err(Self::map_contract_error)?;
            }
            for phase in snapshot
                .phase_runs
                .iter_mut()
                .filter(|phase| phase.team_run_id == team_run_id && !phase.status.is_terminal())
            {
                phase
                    .transition(TeamPhaseRunStatus::Cancelled, None, now)
                    .map_err(Self::map_contract_error)?;
            }
            snapshot.team_runs[run_index]
                .transition(TeamRunStatus::Cancelled, None, now)
                .map_err(Self::map_contract_error)?;
            let cancelled_run = snapshot.team_runs[run_index].clone();
            if snapshot.instance.active_run_id.as_deref() == Some(team_run_id) {
                snapshot
                    .instance
                    .clear_active_run(&cancelled_run, now)
                    .map_err(Self::map_contract_error)?;
            }
            match self
                .store
                .save(
                    &identity.parent_session_id,
                    &identity.team_instance_id,
                    snapshot,
                    Some(record.revision),
                )
                .await
            {
                Ok(_) => return Ok(()),
                Err(error) if error.code == TeamRuntimeStoreErrorCode::RevisionConflict => continue,
                Err(error) => return Err(Self::map_store_error(error)),
            }
        }
        Err(Self::error(
            TeamOrchestratorErrorCode::RuntimeConflict,
            "Team stop exceeded the bounded CAS retry limit",
            true,
        ))
    }
}

#[async_trait]
impl TeamOrchestrator for TeamRuntimeService {
    async fn attach(&self, command: AttachCommand) -> TeamOrchestratorOutcome {
        if let Err(error) = Self::validate_identity(&command.identity).and_then(|_| {
            Self::validate_required(&[
                ("teamDefinitionId", &command.team_definition_id),
                ("teamDefinitionRevision", &command.team_definition_revision),
            ])
        }) {
            return Self::rejected(&command.identity.operation_id, error);
        }
        if let Err(error) = command.workspace.validate() {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::InvalidCommand,
                    error.to_string(),
                    false,
                ),
            );
        }
        let definition = match self
            .definition(
                &command.team_definition_id,
                &command.team_definition_revision,
            )
            .await
        {
            Ok(record) => record,
            Err(error) => return Self::rejected(&command.identity.operation_id, error),
        };
        if !definition
            .definition
            .scenario_eligibility
            .contains(&command.scenario)
        {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::ScenarioUnsupported,
                    "Team definition does not support this scenario",
                    false,
                ),
            );
        }

        match self
            .store
            .load(
                &command.identity.parent_session_id,
                &command.identity.team_instance_id,
            )
            .await
        {
            Ok(Some(record)) => {
                if !Self::attach_matches(&command, &record) {
                    return Self::rejected(
                        &command.identity.operation_id,
                        Self::error(
                            TeamOrchestratorErrorCode::RuntimeConflict,
                            "Team instance ID is already bound to different runtime facts",
                            false,
                        ),
                    );
                }
                return match record.snapshot.instance.lifecycle {
                    TeamInstanceLifecycle::Provisioning => {
                        self.finish_attach(&command, record).await
                    }
                    TeamInstanceLifecycle::Ready => {
                        TeamOrchestratorOutcome::accepted(command.identity.operation_id, vec![])
                    }
                    TeamInstanceLifecycle::Unavailable => Self::rejected(
                        command.identity.operation_id,
                        Self::error(
                            TeamOrchestratorErrorCode::AdapterUnavailable,
                            "Team instance is unavailable",
                            true,
                        ),
                    ),
                    TeamInstanceLifecycle::Archived => Self::rejected(
                        command.identity.operation_id,
                        Self::error(
                            TeamOrchestratorErrorCode::RuntimeConflict,
                            "Team instance is archived",
                            false,
                        ),
                    ),
                };
            }
            Ok(None) => {}
            Err(error) => {
                return Self::rejected(&command.identity.operation_id, Self::map_store_error(error))
            }
        }

        let member_bindings = definition
            .definition
            .members
            .iter()
            .filter(|member| member.member_id != definition.definition.lead_member_id)
            .map(|member| TeamMemberBinding {
                member_id: member.member_id.clone(),
                child_session_id: None,
                subagent_task_id: None,
            })
            .collect();
        let lead_binding = TeamLeadBinding::ParentPersona {
            parent_session_id: command.identity.parent_session_id.clone(),
        };
        let instance = match TeamInstance::new(
            command.identity.team_instance_id.clone(),
            command.team_definition_id.clone(),
            command.team_definition_revision.clone(),
            command.workspace.clone(),
            command.identity.parent_session_id.clone(),
            command.execution_profile.clone(),
            lead_binding,
            member_bindings,
            command.creation_source,
            self.clock.now(),
        ) {
            Ok(instance) => instance,
            Err(error) => {
                return Self::rejected(
                    &command.identity.operation_id,
                    Self::error(
                        TeamOrchestratorErrorCode::InvalidCommand,
                        error.to_string(),
                        false,
                    ),
                )
            }
        };
        let snapshot = TeamRuntimeSnapshot {
            instance,
            team_runs: vec![],
            member_runs: vec![],
            phase_runs: vec![],
        };
        let record = match self
            .store
            .save(
                &command.identity.parent_session_id,
                &command.identity.team_instance_id,
                snapshot,
                None,
            )
            .await
        {
            Ok(record) => record,
            Err(error) => {
                return Self::rejected(&command.identity.operation_id, Self::map_store_error(error))
            }
        };
        self.finish_attach(&command, record).await
    }

    async fn observe(&self, command: ObserveCommand) -> TeamOrchestratorOutcome {
        if let Err(error) = Self::validate_identity(&command.identity) {
            return Self::rejected(&command.identity.operation_id, error);
        }
        match self
            .store
            .load(
                &command.identity.parent_session_id,
                &command.identity.team_instance_id,
            )
            .await
        {
            Ok(Some(record)) => match Self::check_scope(&command.identity, &record) {
                Ok(()) => TeamOrchestratorOutcome::accepted(command.identity.operation_id, vec![]),
                Err(error) => Self::rejected(command.identity.operation_id, error),
            },
            Ok(None) => Self::rejected(
                command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeNotFound,
                    "Team runtime was not found",
                    false,
                ),
            ),
            Err(error) => {
                Self::rejected(command.identity.operation_id, Self::map_store_error(error))
            }
        }
    }

    async fn start(&self, command: StartCommand) -> TeamOrchestratorOutcome {
        if let Err(error) = Self::validate_identity(&command.identity).and_then(|_| {
            Self::validate_required(&[
                ("teamRunId", &command.team_run_id),
                ("workflowId", &command.workflow_id),
                ("objective", &command.objective),
                ("parentDialogTurnId", &command.parent_dialog_turn_id),
                ("parentToolCallId", &command.parent_tool_call_id),
            ])
        }) {
            return Self::rejected(&command.identity.operation_id, error);
        }
        let mut record = match self.load_scoped(&command.identity).await {
            Ok(record) => record,
            Err(error) => return Self::rejected(&command.identity.operation_id, error),
        };
        if record.snapshot.instance.lifecycle != TeamInstanceLifecycle::Ready {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "only a ready Team instance may start a run",
                    false,
                ),
            );
        }
        let existing_run = record
            .snapshot
            .team_runs
            .iter()
            .find(|run| run.team_run_id == command.team_run_id);
        if let Some(run) = existing_run {
            if run.workflow_id != command.workflow_id
                || run.objective != command.objective
                || run.parent_dialog_turn_id != command.parent_dialog_turn_id
                || run.parent_tool_call_id != command.parent_tool_call_id
                || record.snapshot.instance.active_run_id.as_deref()
                    != Some(command.team_run_id.as_str())
                || run.status.is_terminal()
            {
                return Self::rejected(
                    &command.identity.operation_id,
                    Self::error(
                        TeamOrchestratorErrorCode::RuntimeConflict,
                        "Team run ID is already bound to different start scope or is inactive",
                        false,
                    ),
                );
            }
        } else {
            let definition = match self
                .definition(
                    &record.snapshot.instance.team_definition_id,
                    &record.snapshot.instance.team_definition_revision,
                )
                .await
            {
                Ok(record) => record,
                Err(error) => return Self::rejected(&command.identity.operation_id, error),
            };
            let workflow = match definition
                .definition
                .workflows
                .iter()
                .find(|workflow| workflow.workflow_id == command.workflow_id)
            {
                Some(workflow) => workflow.clone(),
                None => {
                    return Self::rejected(
                        &command.identity.operation_id,
                        Self::error(
                            TeamOrchestratorErrorCode::WorkflowNotFound,
                            "Team workflow was not found",
                            false,
                        ),
                    )
                }
            };
            let mut reserved = false;
            for _ in 0..MAX_CAS_ATTEMPTS {
                if let Some(run) = record
                    .snapshot
                    .team_runs
                    .iter()
                    .find(|run| run.team_run_id == command.team_run_id)
                {
                    if run.workflow_id == command.workflow_id
                        && run.objective == command.objective
                        && run.parent_dialog_turn_id == command.parent_dialog_turn_id
                        && run.parent_tool_call_id == command.parent_tool_call_id
                        && record.snapshot.instance.active_run_id.as_deref()
                            == Some(command.team_run_id.as_str())
                        && !run.status.is_terminal()
                    {
                        reserved = true;
                        break;
                    }
                    return Self::rejected(
                        &command.identity.operation_id,
                        Self::error(
                            TeamOrchestratorErrorCode::RuntimeConflict,
                            "Team run ID was concurrently bound to different start scope",
                            false,
                        ),
                    );
                }
                if record.snapshot.instance.active_run_id.is_some() {
                    return Self::rejected(
                        &command.identity.operation_id,
                        Self::error(
                            TeamOrchestratorErrorCode::RuntimeConflict,
                            "Team instance already has an active run",
                            false,
                        ),
                    );
                }
                let now = self.clock.now();
                let attempt = record
                    .snapshot
                    .team_runs
                    .iter()
                    .filter(|run| run.workflow_id == command.workflow_id)
                    .count() as u32
                    + 1;
                let mut snapshot = record.snapshot.clone();
                let mut team_run = match TeamRun::new_scoped(
                    command.team_run_id.clone(),
                    command.identity.team_instance_id.clone(),
                    command.workflow_id.clone(),
                    command.objective.clone(),
                    command.parent_dialog_turn_id.clone(),
                    command.parent_tool_call_id.clone(),
                    attempt,
                    now,
                ) {
                    Ok(run) => run,
                    Err(error) => {
                        return Self::rejected(
                            &command.identity.operation_id,
                            Self::map_contract_error(error),
                        )
                    }
                };
                if let Err(error) = team_run.transition(TeamRunStatus::Running, None, now) {
                    return Self::rejected(
                        &command.identity.operation_id,
                        Self::map_contract_error(error),
                    );
                }
                if let Err(error) = snapshot.instance.set_active_run(&team_run, now) {
                    return Self::rejected(
                        &command.identity.operation_id,
                        Self::map_contract_error(error),
                    );
                }
                snapshot.team_runs.push(team_run);

                for phase in workflow
                    .phases
                    .iter()
                    .filter(|phase| phase.depends_on_phase_ids.is_empty())
                {
                    let phase_run_id = stable_operation_id(
                        &command.identity.operation_id,
                        &command.identity.parent_session_id,
                        &command.identity.team_instance_id,
                        &[&command.team_run_id, &phase.phase_id, "phase-run"],
                    );
                    let mut phase_run = match TeamPhaseRun::new(
                        phase_run_id,
                        command.team_run_id.clone(),
                        command.identity.team_instance_id.clone(),
                        command.workflow_id.clone(),
                        phase.phase_id.clone(),
                        attempt,
                        now,
                    ) {
                        Ok(run) => run,
                        Err(error) => {
                            return Self::rejected(
                                &command.identity.operation_id,
                                Self::map_contract_error(error),
                            )
                        }
                    };
                    if let Err(error) = phase_run.transition(TeamPhaseRunStatus::Ready, None, now) {
                        return Self::rejected(
                            &command.identity.operation_id,
                            Self::map_contract_error(error),
                        );
                    }
                    snapshot.phase_runs.push(phase_run);

                    if !matches!(
                        phase.kind,
                        super::team_definitions::TeamWorkflowPhaseKind::Serial
                            | super::team_definitions::TeamWorkflowPhaseKind::Parallel
                    ) {
                        continue;
                    }
                    for member_id in phase
                        .assigned_member_ids
                        .iter()
                        .filter(|member_id| *member_id != &definition.definition.lead_member_id)
                    {
                        let member = match definition
                            .definition
                            .members
                            .iter()
                            .find(|member| &member.member_id == member_id)
                        {
                            Some(member) => member,
                            None => {
                                return Self::rejected(
                                    &command.identity.operation_id,
                                    Self::error(
                                        TeamOrchestratorErrorCode::DefinitionInvalid,
                                        "workflow phase references an unknown Team member",
                                        false,
                                    ),
                                )
                            }
                        };
                        let agent_id = match member.agent_id.as_deref() {
                            Some(agent_id) if !agent_id.trim().is_empty() => agent_id,
                            _ => {
                                return Self::rejected(
                                    &command.identity.operation_id,
                                    Self::error(
                                        TeamOrchestratorErrorCode::ExecutionRouteInvalid,
                                        format!(
                                            "Team member '{member_id}' has no runtime agent ID"
                                        ),
                                        false,
                                    ),
                                )
                            }
                        };
                        let operation_id = stable_operation_id(
                            &command.identity.operation_id,
                            &command.identity.parent_session_id,
                            &command.identity.team_instance_id,
                            &[&command.team_run_id, &phase.phase_id, member_id],
                        );
                        let member_run_id = stable_operation_id(
                            &command.identity.operation_id,
                            &command.identity.parent_session_id,
                            &command.identity.team_instance_id,
                            &[
                                &command.team_run_id,
                                &phase.phase_id,
                                member_id,
                                "member-run",
                            ],
                        );
                        if let Err(error) = snapshot.instance.begin_member_run_binding(
                            member_id,
                            operation_id.clone(),
                            now,
                        ) {
                            return Self::rejected(
                                &command.identity.operation_id,
                                Self::map_contract_error(error),
                            );
                        }
                        let mut member_run = match TeamMemberRun::new(
                            member_run_id,
                            command.team_run_id.clone(),
                            command.identity.team_instance_id.clone(),
                            member_id.clone(),
                            attempt,
                            now,
                        ) {
                            Ok(run) => run,
                            Err(error) => {
                                return Self::rejected(
                                    &command.identity.operation_id,
                                    Self::map_contract_error(error),
                                )
                            }
                        };
                        if let Err(error) = member_run.reserve_execution(
                            phase.phase_id.clone(),
                            operation_id.clone(),
                            command.parent_dialog_turn_id.clone(),
                            command.parent_tool_call_id.clone(),
                            agent_id.to_string(),
                            operation_id,
                            now,
                        ) {
                            return Self::rejected(
                                &command.identity.operation_id,
                                Self::map_contract_error(error),
                            );
                        }
                        snapshot.member_runs.push(member_run);
                    }
                }
                match self
                    .store
                    .save(
                        &command.identity.parent_session_id,
                        &command.identity.team_instance_id,
                        snapshot,
                        Some(record.revision),
                    )
                    .await
                {
                    Ok(saved) => {
                        record = saved;
                        reserved = true;
                        break;
                    }
                    Err(error) if error.code == TeamRuntimeStoreErrorCode::RevisionConflict => {
                        record = match self.load_scoped(&command.identity).await {
                            Ok(record) => record,
                            Err(error) => {
                                return Self::rejected(&command.identity.operation_id, error)
                            }
                        };
                    }
                    Err(error) => {
                        return Self::rejected(
                            &command.identity.operation_id,
                            Self::map_store_error(error),
                        )
                    }
                }
            }
            if !reserved {
                return Self::rejected(
                    &command.identity.operation_id,
                    Self::error(
                        TeamOrchestratorErrorCode::RuntimeConflict,
                        "Team start exceeded the bounded CAS retry limit",
                        true,
                    ),
                );
            }
        }
        let reserved = record
            .snapshot
            .member_runs
            .iter()
            .filter(|run| {
                run.team_run_id == command.team_run_id
                    && !run.status.is_terminal()
                    && run
                        .operation_id
                        .as_deref()
                        .is_some_and(|operation| !run.has_applied_operation(operation))
            })
            .map(|run| run.member_run_id.clone())
            .collect::<Vec<_>>();
        let all_operation_ids = record
            .snapshot
            .member_runs
            .iter()
            .filter(|run| run.team_run_id == command.team_run_id)
            .filter_map(|run| run.operation_id.clone())
            .collect::<Vec<_>>();
        if reserved.is_empty() {
            return TeamOrchestratorOutcome::accepted(
                command.identity.operation_id,
                all_operation_ids,
            );
        }
        let adapter = match self
            .adapters
            .resolve(&record.snapshot.instance.execution_profile)
            .await
        {
            Ok(adapter) => adapter,
            Err(error) => {
                return self
                    .reject_and_fail(&command.identity, &command.team_run_id, error)
                    .await
            }
        };
        let mut operation_ids = Vec::with_capacity(reserved.len());
        for member_run_id in reserved {
            let member_operation_id = record
                .snapshot
                .member_runs
                .iter()
                .find(|run| run.member_run_id == member_run_id)
                .and_then(|run| run.operation_id.clone())
                .expect("reserved member run has an operation ID");
            let request = match self
                .member_request(
                    &record,
                    &command.team_run_id,
                    &member_run_id,
                    member_operation_id,
                    None,
                )
                .await
            {
                Ok(request) => request,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &command.team_run_id, error)
                        .await
                }
            };
            let receipt = match adapter.ensure_member_task(request.clone()).await {
                Ok(receipt) => receipt,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &command.team_run_id, error)
                        .await
                }
            };
            if let Err(error) =
                Self::validate_receipt_scope(&receipt, &request, ReceiptEffect::Start)
            {
                return self
                    .reject_and_fail(&command.identity, &command.team_run_id, error)
                    .await;
            }
            record = match self
                .persist_receipt_with_cas(
                    &command.identity,
                    &command.team_run_id,
                    &member_run_id,
                    record,
                    &request,
                    &receipt,
                    ReceiptEffect::Start,
                )
                .await
            {
                Ok(record) => record,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &command.team_run_id, error)
                        .await
                }
            };
            operation_ids.push(receipt.operation_id);
        }
        TeamOrchestratorOutcome::accepted(command.identity.operation_id, operation_ids)
    }

    async fn message(&self, command: MessageCommand) -> TeamOrchestratorOutcome {
        if let Err(error) = Self::validate_identity(&command.identity).and_then(|_| {
            Self::validate_required(&[
                ("teamRunId", &command.team_run_id),
                ("memberId", &command.member_id),
                ("message", &command.message),
            ])
        }) {
            return Self::rejected(&command.identity.operation_id, error);
        }
        let mut record = match self.load_scoped(&command.identity).await {
            Ok(record) => record,
            Err(error) => return Self::rejected(&command.identity.operation_id, error),
        };
        let run_is_active = record
            .snapshot
            .team_runs
            .iter()
            .any(|run| run.team_run_id == command.team_run_id && !run.status.is_terminal())
            && record.snapshot.instance.active_run_id.as_deref()
                == Some(command.team_run_id.as_str());
        if !run_is_active {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "message target is not the active Team run",
                    false,
                ),
            );
        }
        let matching_members = record
            .snapshot
            .member_runs
            .iter()
            .filter(|member| {
                member.team_run_id == command.team_run_id
                    && member.member_id == command.member_id
                    && !member.status.is_terminal()
            })
            .collect::<Vec<_>>();
        if matching_members.len() != 1 {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "message target must resolve to exactly one active member run",
                    false,
                ),
            );
        }
        let member_run_id = matching_members[0].member_run_id.clone();
        if matching_members[0].has_applied_operation(&command.identity.operation_id) {
            return TeamOrchestratorOutcome::accepted(
                command.identity.operation_id.clone(),
                vec![command.identity.operation_id],
            );
        }
        let request = match self
            .member_request(
                &record,
                &command.team_run_id,
                &member_run_id,
                command.identity.operation_id.clone(),
                Some(command.message.clone()),
            )
            .await
            .and_then(|request| {
                Self::require_complete_member_reference(&request)?;
                Ok(request)
            }) {
            Ok(request) => request,
            Err(error) => {
                return self
                    .reject_and_fail(&command.identity, &command.team_run_id, error)
                    .await
            }
        };
        let adapter = match self
            .adapters
            .resolve(&record.snapshot.instance.execution_profile)
            .await
        {
            Ok(adapter) => adapter,
            Err(error) => {
                return self
                    .reject_and_fail(&command.identity, &command.team_run_id, error)
                    .await
            }
        };
        let receipt = match adapter.message_member(request.clone()).await {
            Ok(receipt) => receipt,
            Err(error) => {
                return self
                    .reject_and_fail(&command.identity, &command.team_run_id, error)
                    .await
            }
        };
        if let Err(error) = Self::validate_receipt_scope(&receipt, &request, ReceiptEffect::Message)
        {
            return self
                .reject_and_fail(&command.identity, &command.team_run_id, error)
                .await;
        }
        record = match self
            .persist_receipt_with_cas(
                &command.identity,
                &command.team_run_id,
                &member_run_id,
                record,
                &request,
                &receipt,
                ReceiptEffect::Message,
            )
            .await
        {
            Ok(record) => record,
            Err(error) => {
                return self
                    .reject_and_fail(&command.identity, &command.team_run_id, error)
                    .await
            }
        };
        let _ = record;
        TeamOrchestratorOutcome::accepted(
            command.identity.operation_id.clone(),
            vec![receipt.operation_id],
        )
    }

    async fn pause(&self, command: PauseCommand) -> TeamOrchestratorOutcome {
        Self::unsupported(command.identity.operation_id, "pause")
    }

    async fn resume(&self, command: ResumeCommand) -> TeamOrchestratorOutcome {
        Self::unsupported(command.identity.operation_id, "resume")
    }

    async fn stop(&self, command: StopCommand) -> TeamOrchestratorOutcome {
        if let Err(error) = Self::validate_identity(&command.identity)
            .and_then(|_| Self::validate_required(&[("teamRunId", &command.team_run_id)]))
        {
            return Self::rejected(&command.identity.operation_id, error);
        }
        let mut record = match self.load_scoped(&command.identity).await {
            Ok(record) => record,
            Err(error) => return Self::rejected(&command.identity.operation_id, error),
        };
        let run = match record
            .snapshot
            .team_runs
            .iter()
            .find(|run| run.team_run_id == command.team_run_id)
        {
            Some(run) => run,
            None => {
                return Self::rejected(
                    &command.identity.operation_id,
                    Self::error(
                        TeamOrchestratorErrorCode::RuntimeNotFound,
                        "Team run was not found",
                        false,
                    ),
                )
            }
        };
        if run.status == TeamRunStatus::Cancelled {
            let operation_ids = record
                .snapshot
                .member_runs
                .iter()
                .filter(|member| member.team_run_id == command.team_run_id)
                .map(|member| {
                    stable_operation_id(
                        &command.identity.operation_id,
                        &command.identity.parent_session_id,
                        &command.identity.team_instance_id,
                        &[&command.team_run_id, &member.member_run_id, "stop"],
                    )
                })
                .collect();
            return TeamOrchestratorOutcome::accepted(command.identity.operation_id, operation_ids);
        }
        if run.status.is_terminal()
            || record.snapshot.instance.active_run_id.as_deref()
                != Some(command.team_run_id.as_str())
        {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "only the active non-terminal Team run may be stopped",
                    false,
                ),
            );
        }
        let member_run_ids = record
            .snapshot
            .member_runs
            .iter()
            .filter(|member| {
                member.team_run_id == command.team_run_id && !member.status.is_terminal()
            })
            .map(|member| member.member_run_id.clone())
            .collect::<Vec<_>>();
        let mut requests = Vec::new();
        let mut operation_ids = Vec::new();
        for member_run_id in member_run_ids {
            let operation_id = stable_operation_id(
                &command.identity.operation_id,
                &command.identity.parent_session_id,
                &command.identity.team_instance_id,
                &[&command.team_run_id, &member_run_id, "stop"],
            );
            operation_ids.push(operation_id.clone());
            let member = record
                .snapshot
                .member_runs
                .iter()
                .find(|member| member.member_run_id == member_run_id)
                .expect("member run selected above");
            if member.has_applied_operation(&operation_id) {
                continue;
            }
            let request = match self
                .member_request(
                    &record,
                    &command.team_run_id,
                    &member_run_id,
                    operation_id,
                    None,
                )
                .await
                .and_then(|request| {
                    Self::require_complete_member_reference(&request)?;
                    Ok(request)
                }) {
                Ok(request) => request,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &command.team_run_id, error)
                        .await
                }
            };
            requests.push((member_run_id, request));
        }
        if !requests.is_empty() {
            let adapter = match self
                .adapters
                .resolve(&record.snapshot.instance.execution_profile)
                .await
            {
                Ok(adapter) => adapter,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &command.team_run_id, error)
                        .await
                }
            };
            for (member_run_id, request) in requests {
                let receipt = match adapter.stop_run(request.clone()).await {
                    Ok(receipt) => receipt,
                    Err(error) => {
                        return self
                            .reject_and_fail(&command.identity, &command.team_run_id, error)
                            .await
                    }
                };
                if let Err(error) =
                    Self::validate_receipt_scope(&receipt, &request, ReceiptEffect::Stop)
                {
                    return self
                        .reject_and_fail(&command.identity, &command.team_run_id, error)
                        .await;
                }
                record = match self
                    .persist_receipt_with_cas(
                        &command.identity,
                        &command.team_run_id,
                        &member_run_id,
                        record,
                        &request,
                        &receipt,
                        ReceiptEffect::Stop,
                    )
                    .await
                {
                    Ok(record) => record,
                    Err(error) => {
                        return self
                            .reject_and_fail(&command.identity, &command.team_run_id, error)
                            .await
                    }
                };
            }
        }
        match self
            .cancel_run_with_cas(&command.identity, &command.team_run_id)
            .await
        {
            Ok(()) => {
                TeamOrchestratorOutcome::accepted(command.identity.operation_id, operation_ids)
            }
            Err(error) => Self::rejected(command.identity.operation_id, error),
        }
    }

    async fn recover(&self, command: RecoverCommand) -> TeamOrchestratorOutcome {
        if let Err(error) = Self::validate_identity(&command.identity) {
            return Self::rejected(&command.identity.operation_id, error);
        }
        let mut record = match self.load_scoped(&command.identity).await {
            Ok(record) => record,
            Err(error) => return Self::rejected(&command.identity.operation_id, error),
        };
        let Some(team_run_id) = record.snapshot.instance.active_run_id.clone() else {
            return TeamOrchestratorOutcome::accepted(command.identity.operation_id, vec![]);
        };
        let run_is_active = record
            .snapshot
            .team_runs
            .iter()
            .any(|run| run.team_run_id == team_run_id && !run.status.is_terminal());
        if !run_is_active {
            return Self::rejected(
                &command.identity.operation_id,
                Self::error(
                    TeamOrchestratorErrorCode::RuntimeConflict,
                    "active Team run reference is terminal or missing",
                    false,
                ),
            );
        }
        let member_run_ids = record
            .snapshot
            .member_runs
            .iter()
            .filter(|member| member.team_run_id == team_run_id && !member.status.is_terminal())
            .map(|member| member.member_run_id.clone())
            .collect::<Vec<_>>();
        let mut requests = Vec::new();
        let mut operation_ids = Vec::new();
        for member_run_id in member_run_ids {
            let operation_id = stable_operation_id(
                &command.identity.operation_id,
                &command.identity.parent_session_id,
                &command.identity.team_instance_id,
                &[&team_run_id, &member_run_id, "inspect"],
            );
            operation_ids.push(operation_id.clone());
            let member = record
                .snapshot
                .member_runs
                .iter()
                .find(|member| member.member_run_id == member_run_id)
                .expect("member run selected above");
            if member.has_applied_operation(&operation_id) {
                continue;
            }
            let request = match self
                .member_request(&record, &team_run_id, &member_run_id, operation_id, None)
                .await
                .and_then(|request| {
                    Self::require_complete_member_reference(&request)?;
                    Ok(request)
                }) {
                Ok(request) => request,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &team_run_id, error)
                        .await
                }
            };
            requests.push((member_run_id, request));
        }
        if requests.is_empty() {
            return TeamOrchestratorOutcome::accepted(command.identity.operation_id, operation_ids);
        }
        let adapter = match self
            .adapters
            .resolve(&record.snapshot.instance.execution_profile)
            .await
        {
            Ok(adapter) => adapter,
            Err(error) => {
                return self
                    .reject_and_fail(&command.identity, &team_run_id, error)
                    .await
            }
        };
        for (member_run_id, request) in requests {
            let receipt = match adapter.inspect_member_task(request.clone()).await {
                Ok(receipt) => receipt,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &team_run_id, error)
                        .await
                }
            };
            if let Err(error) =
                Self::validate_receipt_scope(&receipt, &request, ReceiptEffect::Inspect)
            {
                return self
                    .reject_and_fail(&command.identity, &team_run_id, error)
                    .await;
            }
            record = match self
                .persist_receipt_with_cas(
                    &command.identity,
                    &team_run_id,
                    &member_run_id,
                    record,
                    &request,
                    &receipt,
                    ReceiptEffect::Inspect,
                )
                .await
            {
                Ok(record) => record,
                Err(error) => {
                    return self
                        .reject_and_fail(&command.identity, &team_run_id, error)
                        .await
                }
            };
        }
        TeamOrchestratorOutcome::accepted(command.identity.operation_id, operation_ids)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::team_definitions::{
        TeamCollaborationPolicy, TeamDefinition, TeamDefinitionLevel, TeamDefinitionOrigin,
        TeamMemberDefinition, TeamMemberRole, TeamPermissionPolicy, TeamScenario,
        TeamWorkflowDefinition, TeamWorkflowPhaseDefinition, TeamWorkflowPhaseKind,
        TEAM_DEFINITION_SCHEMA_VERSION,
    };
    use crate::agentic::team_orchestrator::{RuntimeDisposition, TeamCommandIdentity};
    use crate::agentic::team_runtime::{
        TeamInstanceCreationSource, TeamWorkspaceBackend, TeamWorkspaceIdentity,
    };
    use crate::agentic::team_runtime_adapter::PromptTeamRuntimeAdapter;
    use crate::agentic::team_runtime_store::{TeamRuntimeList, TeamRuntimeStoreError};
    use std::collections::BTreeMap;
    use std::sync::Mutex;
    use void_core_types::{
        SubagentTaskContextMode, SubagentTaskExecutionMode, SubagentTaskLaunchSpec,
        SubagentTaskRecoveryState, SubagentTaskReplaySafety, SubagentTaskStatus,
    };

    fn id(prefix: &str, suffix: char) -> String {
        format!("{prefix}-{}", suffix.to_string().repeat(32))
    }

    fn workspace() -> TeamWorkspaceIdentity {
        TeamWorkspaceIdentity {
            workspace_id: "workspace".into(),
            context_key: "local:workspace".into(),
            backend: TeamWorkspaceBackend::Local,
            remote_connection_id: None,
            remote_host: None,
        }
    }

    fn member(member_id: String, role: TeamMemberRole) -> TeamMemberDefinition {
        TeamMemberDefinition {
            member_id,
            display_name: "Member".into(),
            professional_role: "Role".into(),
            role,
            instructions: "Do work".into(),
            output_responsibility: "Output".into(),
            agent_id: Some("agent-id".into()),
            allowed_skill_keys: vec![],
            allowed_tool_names: vec![],
            permission_policy: TeamPermissionPolicy::InheritParentIntersection,
            is_readonly: false,
        }
    }

    fn definition_record() -> TeamDefinitionRecord {
        let lead = id("member", 'a');
        let worker = id("member", 'b');
        let phase = id("phase", 'c');
        let definition = TeamDefinition {
            schema_version: TEAM_DEFINITION_SCHEMA_VERSION,
            team_definition_id: id("custom", 'd'),
            display_name: "Team".into(),
            description: "Description".into(),
            emblem: None,
            accent: None,
            category: "code".into(),
            capability_tags: vec![],
            scenario_eligibility: vec![TeamScenario::Code],
            lead_member_id: lead.clone(),
            members: vec![
                member(lead.clone(), TeamMemberRole::Lead),
                member(worker.clone(), TeamMemberRole::Specialist),
            ],
            workflows: vec![TeamWorkflowDefinition {
                workflow_id: id("workflow", 'e'),
                display_name: "Flow".into(),
                trigger_description: "go".into(),
                phases: vec![TeamWorkflowPhaseDefinition {
                    phase_id: phase,
                    display_name: "Root".into(),
                    kind: TeamWorkflowPhaseKind::Parallel,
                    depends_on_phase_ids: vec![],
                    assigned_member_ids: vec![lead, worker],
                    expected_outputs: vec![],
                    completion_rule: "Done".into(),
                }],
            }],
            collaboration_policy: TeamCollaborationPolicy::LeadMediated,
            permission_policy: TeamPermissionPolicy::InheritParentIntersection,
            origin: TeamDefinitionOrigin::User,
        };
        let revision = team_definition_revision(&definition);
        TeamDefinitionRecord {
            definition,
            revision,
            level: TeamDefinitionLevel::User,
            path: "team.json".into(),
            is_authorable: true,
        }
    }

    struct TestDefinitions(TeamDefinitionRecord);

    #[async_trait]
    impl DefinitionResolver for TestDefinitions {
        async fn resolve(
            &self,
            team_definition_id: &str,
            team_definition_revision: &str,
        ) -> Result<Option<TeamDefinitionRecord>, TeamOrchestratorError> {
            Ok((self.0.definition.team_definition_id == team_definition_id
                && self.0.revision == team_definition_revision)
                .then(|| self.0.clone()))
        }
    }

    struct TestStore {
        record: Mutex<Option<TeamRuntimeRecord>>,
        events: Arc<Mutex<Vec<String>>>,
        conflict_expected_revision: Mutex<Option<Option<u64>>>,
    }

    #[async_trait]
    impl TeamRuntimeStore for TestStore {
        async fn list(
            &self,
            _parent_session_id: &str,
        ) -> Result<TeamRuntimeList, TeamRuntimeStoreError> {
            Ok(TeamRuntimeList {
                records: self.record.lock().unwrap().clone().into_iter().collect(),
                diagnostics: vec![],
            })
        }

        async fn load(
            &self,
            _parent_session_id: &str,
            _team_instance_id: &str,
        ) -> Result<Option<TeamRuntimeRecord>, TeamRuntimeStoreError> {
            self.events.lock().unwrap().push("load".into());
            Ok(self.record.lock().unwrap().clone())
        }

        async fn save(
            &self,
            _parent_session_id: &str,
            _team_instance_id: &str,
            snapshot: TeamRuntimeSnapshot,
            expected_revision: Option<u64>,
        ) -> Result<TeamRuntimeRecord, TeamRuntimeStoreError> {
            snapshot.validate().map_err(|error| {
                TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::InvalidSnapshot,
                    error.to_string(),
                    false,
                )
            })?;
            let mut current = self.record.lock().unwrap();
            let actual = current.as_ref().map(|record| record.revision);
            let mut conflict_expected_revision = self.conflict_expected_revision.lock().unwrap();
            if conflict_expected_revision.as_ref() == Some(&expected_revision) {
                *conflict_expected_revision = None;
                return Err(TeamRuntimeStoreError::revision_conflict(
                    expected_revision,
                    actual,
                ));
            }
            if actual != expected_revision {
                return Err(TeamRuntimeStoreError::revision_conflict(
                    expected_revision,
                    actual,
                ));
            }
            let record = TeamRuntimeRecord {
                schema_version: super::super::team_runtime_store::TEAM_RUNTIME_STORE_SCHEMA_VERSION,
                revision: actual.unwrap_or(0) + 1,
                snapshot,
            };
            record.validate().map_err(|error| {
                TeamRuntimeStoreError::new(
                    TeamRuntimeStoreErrorCode::InvalidSnapshot,
                    error.to_string(),
                    false,
                )
            })?;
            *current = Some(record.clone());
            self.events.lock().unwrap().push("save".into());
            Ok(record)
        }
    }

    struct TestAdapter {
        events: Arc<Mutex<Vec<String>>>,
        member_requests: Mutex<Vec<RuntimeRequest>>,
        message_requests: Mutex<Vec<RuntimeRequest>>,
        inspect_requests: Mutex<Vec<RuntimeRequest>>,
        stop_requests: Mutex<Vec<RuntimeRequest>>,
        ensure_failure: Mutex<Option<TeamOrchestratorError>>,
        malformed_ensure_receipt: Mutex<bool>,
        message_disposition: Mutex<RuntimeDisposition>,
        inspect_task_state: Mutex<RuntimeTaskState>,
    }

    impl TestAdapter {
        fn receipt(
            request: &RuntimeRequest,
            disposition: RuntimeDisposition,
            task_state: RuntimeTaskState,
            child_session_id: Option<String>,
            subagent_task_id: Option<String>,
        ) -> RuntimeReceipt {
            RuntimeReceipt {
                operation_id: request.operation_id.clone(),
                accepted: true,
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
                phase_id: request.phase_id.clone(),
                agent_id: request.agent_id.clone(),
                child_session_id,
                subagent_task_id,
            }
        }

        fn unsupported() -> TeamOrchestratorError {
            TeamRuntimeService::error(
                TeamOrchestratorErrorCode::AdapterUnsupported,
                "unsupported in test adapter",
                false,
            )
        }
    }

    #[async_trait]
    impl TeamRuntimeAdapter for TestAdapter {
        fn adapter_id(&self) -> &str {
            "test-adapter"
        }

        async fn activate_lead(
            &self,
            request: RuntimeRequest,
        ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
            self.events.lock().unwrap().push("activate".into());
            Ok(Self::receipt(
                &request,
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
            self.events.lock().unwrap().push("ensure".into());
            self.member_requests.lock().unwrap().push(request.clone());
            if let Some(error) = self.ensure_failure.lock().unwrap().take() {
                return Err(error);
            }
            let mut receipt = Self::receipt(
                &request,
                RuntimeDisposition::Created,
                RuntimeTaskState::Created,
                Some("child-session".into()),
                request.subagent_task_id.clone(),
            );
            if *self.malformed_ensure_receipt.lock().unwrap() {
                receipt.member_id = Some("wrong-member".into());
            }
            Ok(receipt)
        }

        async fn inspect_member_task(
            &self,
            request: RuntimeRequest,
        ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
            self.events.lock().unwrap().push("inspect".into());
            self.inspect_requests.lock().unwrap().push(request.clone());
            Ok(Self::receipt(
                &request,
                RuntimeDisposition::Inspected,
                *self.inspect_task_state.lock().unwrap(),
                request
                    .child_session_id
                    .clone()
                    .or_else(|| Some("child-session".into())),
                request.subagent_task_id.clone(),
            ))
        }

        async fn message_member(
            &self,
            request: RuntimeRequest,
        ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
            self.events.lock().unwrap().push("message".into());
            self.message_requests.lock().unwrap().push(request.clone());
            Ok(Self::receipt(
                &request,
                *self.message_disposition.lock().unwrap(),
                RuntimeTaskState::Running,
                request.child_session_id.clone(),
                request.subagent_task_id.clone(),
            ))
        }

        async fn pause_run(
            &self,
            _request: RuntimeRequest,
        ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
            Err(Self::unsupported())
        }

        async fn resume_run(
            &self,
            _request: RuntimeRequest,
        ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
            Err(Self::unsupported())
        }

        async fn stop_run(
            &self,
            request: RuntimeRequest,
        ) -> Result<RuntimeReceipt, TeamOrchestratorError> {
            self.events.lock().unwrap().push("stop".into());
            self.stop_requests.lock().unwrap().push(request.clone());
            Ok(Self::receipt(
                &request,
                RuntimeDisposition::Stopped,
                RuntimeTaskState::Cancelled,
                request.child_session_id.clone(),
                request.subagent_task_id.clone(),
            ))
        }
    }

    struct TestAdapters(Arc<TestAdapter>);

    #[async_trait]
    impl AdapterResolver for TestAdapters {
        async fn resolve(
            &self,
            _execution_profile: &TeamExecutionProfile,
        ) -> Result<Arc<dyn TeamRuntimeAdapter>, TeamOrchestratorError> {
            Ok(self.0.clone())
        }
    }

    struct TestClock;

    impl Clock for TestClock {
        fn now(&self) -> u64 {
            10
        }
    }

    fn harness() -> (
        TeamRuntimeService,
        Arc<TestStore>,
        Arc<TestAdapter>,
        TeamDefinitionRecord,
        TeamCommandIdentity,
    ) {
        let definition = definition_record();
        harness_with_definition(definition)
    }

    fn harness_with_definition(
        definition: TeamDefinitionRecord,
    ) -> (
        TeamRuntimeService,
        Arc<TestStore>,
        Arc<TestAdapter>,
        TeamDefinitionRecord,
        TeamCommandIdentity,
    ) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let store = Arc::new(TestStore {
            record: Mutex::new(None),
            events: events.clone(),
            conflict_expected_revision: Mutex::new(None),
        });
        let adapter = Arc::new(TestAdapter {
            events,
            member_requests: Mutex::new(vec![]),
            message_requests: Mutex::new(vec![]),
            inspect_requests: Mutex::new(vec![]),
            stop_requests: Mutex::new(vec![]),
            ensure_failure: Mutex::new(None),
            malformed_ensure_receipt: Mutex::new(false),
            message_disposition: Mutex::new(RuntimeDisposition::MessageAccepted),
            inspect_task_state: Mutex::new(RuntimeTaskState::Running),
        });
        let service = TeamRuntimeService::new(
            Arc::new(TestDefinitions(definition.clone())),
            store.clone(),
            Arc::new(TestAdapters(adapter.clone())),
            Arc::new(TestClock),
        );
        let identity = TeamCommandIdentity {
            operation_id: "operation".into(),
            parent_session_id: "parent-session".into(),
            team_instance_id: "team-instance".into(),
        };
        (service, store, adapter, definition, identity)
    }

    #[tokio::test]
    async fn list_and_get_records_project_only_the_requested_parent_scope() {
        let (service, _store, _adapter, definition, identity) = harness();
        let outcome = service
            .attach(AttachCommand {
                identity: identity.clone(),
                workspace: workspace(),
                team_definition_id: definition.definition.team_definition_id.clone(),
                team_definition_revision: definition.revision.clone(),
                scenario: TeamScenario::Code,
                execution_profile: TeamExecutionProfile::PromptOrchestrated,
                creation_source: TeamInstanceCreationSource::UserAttachment,
            })
            .await;
        assert!(outcome.accepted);

        let list = service
            .list_records(&identity.parent_session_id)
            .await
            .expect("list projection should load");
        assert_eq!(list.records.len(), 1);
        let record = service
            .get_record(&identity.parent_session_id, &identity.team_instance_id)
            .await
            .expect("record projection should load")
            .expect("record should exist");
        assert_eq!(record.snapshot.instance.parent_session_id, "parent-session");
        assert_eq!(record.snapshot.instance.team_instance_id, "team-instance");
        assert_eq!(
            service
                .get_record("another-parent", &identity.team_instance_id)
                .await
                .expect_err("get must recheck stored parent scope")
                .code,
            TeamOrchestratorErrorCode::ScopeMismatch
        );
        assert_eq!(
            service
                .list_records("another-parent")
                .await
                .expect_err("list must not leak another parent scope")
                .code,
            TeamOrchestratorErrorCode::ScopeMismatch
        );
    }

    #[tokio::test]
    async fn list_and_get_records_reject_empty_scope_identifiers() {
        let (service, _store, _adapter, _definition, _identity) = harness();
        assert_eq!(
            service
                .list_records(" ")
                .await
                .expect_err("empty parent should fail")
                .code,
            TeamOrchestratorErrorCode::InvalidCommand
        );
        assert_eq!(
            service
                .get_record("parent-session", "")
                .await
                .expect_err("empty instance should fail")
                .code,
            TeamOrchestratorErrorCode::InvalidCommand
        );
    }

    #[tokio::test]
    async fn reconciled_list_projects_background_member_progress_without_idle_writes() {
        let (service, store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        assert!(
            service
                .start(start_command(&definition, &identity))
                .await
                .accepted
        );

        store.events.lock().unwrap().clear();
        let running = service
            .reconcile_and_list_records(&identity.parent_session_id)
            .await
            .expect("running member should reconcile");
        let running_snapshot = &running.records[0].snapshot;
        assert_eq!(
            running_snapshot.member_runs[0].status,
            TeamMemberRunStatus::Running
        );
        assert_eq!(
            running_snapshot.phase_runs[0].status,
            TeamPhaseRunStatus::Running
        );
        assert_eq!(
            store
                .events
                .lock()
                .unwrap()
                .iter()
                .filter(|event| event.as_str() == "save")
                .count(),
            1
        );

        store.events.lock().unwrap().clear();
        service
            .reconcile_and_list_records(&identity.parent_session_id)
            .await
            .expect("unchanged member should remain readable");
        assert_eq!(
            store
                .events
                .lock()
                .unwrap()
                .iter()
                .filter(|event| event.as_str() == "save")
                .count(),
            0,
            "unchanged polling must not rewrite the durable Team record"
        );

        *adapter.inspect_task_state.lock().unwrap() = RuntimeTaskState::Completed;
        let completed = service
            .reconcile_and_list_records(&identity.parent_session_id)
            .await
            .expect("completed member should close its phase and Team run");
        let completed_snapshot = &completed.records[0].snapshot;
        assert_eq!(
            completed_snapshot.member_runs[0].status,
            TeamMemberRunStatus::Completed
        );
        assert_eq!(
            completed_snapshot.phase_runs[0].status,
            TeamPhaseRunStatus::Completed
        );
        assert_eq!(
            completed_snapshot.team_runs[0].status,
            TeamRunStatus::Completed
        );
        assert_eq!(completed_snapshot.instance.active_run_id, None);
        assert_eq!(
            completed_snapshot.member_runs[0]
                .child_session_id
                .as_deref(),
            Some("child-session")
        );
    }

    #[tokio::test]
    async fn reconciled_list_hydrates_a_late_member_child_session_binding() {
        let (service, store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        assert!(
            service
                .start(start_command(&definition, &identity))
                .await
                .accepted
        );

        {
            let mut guard = store.record.lock().unwrap();
            let record = guard.as_mut().expect("Team runtime record");
            record.snapshot.member_runs[0].child_session_id = None;
            let specialist_id = record.snapshot.member_runs[0].member_id.clone();
            record
                .snapshot
                .instance
                .member_bindings
                .iter_mut()
                .find(|binding| binding.member_id == specialist_id)
                .expect("specialist binding")
                .child_session_id = None;
            record
                .snapshot
                .validate()
                .expect("delayed child binding is valid");
        }
        *adapter.inspect_task_state.lock().unwrap() = RuntimeTaskState::Completed;

        let reconciled = service
            .reconcile_and_list_records(&identity.parent_session_id)
            .await
            .expect("the durable task should hydrate its late child session binding");
        let snapshot = &reconciled.records[0].snapshot;
        assert_eq!(
            snapshot.member_runs[0].child_session_id.as_deref(),
            Some("child-session")
        );
        assert_eq!(
            snapshot.member_runs[0].status,
            TeamMemberRunStatus::Completed
        );
        assert_eq!(snapshot.team_runs[0].status, TeamRunStatus::Completed);
        assert_eq!(snapshot.instance.active_run_id, None);
    }

    #[tokio::test]
    async fn a_completed_team_can_run_the_same_member_again_with_a_new_task_binding() {
        let (service, store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        let first = service.start(start_command(&definition, &identity)).await;
        assert!(first.accepted, "{first:?}");
        let first_task_id = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .member_runs[0]
            .subagent_task_id
            .clone()
            .expect("first task binding");

        *adapter.inspect_task_state.lock().unwrap() = RuntimeTaskState::Completed;
        service
            .reconcile_and_list_records(&identity.parent_session_id)
            .await
            .expect("first run completes");

        *adapter.inspect_task_state.lock().unwrap() = RuntimeTaskState::Running;
        let mut second_command = start_command(&definition, &identity);
        second_command.identity.operation_id = "start-operation-2".into();
        second_command.team_run_id = "team-run-2".into();
        second_command.parent_dialog_turn_id = "parent-turn-2".into();
        second_command.parent_tool_call_id = "parent-tool-2".into();
        let second = service.start(second_command).await;
        assert!(second.accepted, "{second:?}");

        let snapshot = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .clone();
        assert_eq!(snapshot.team_runs.len(), 2);
        assert_eq!(snapshot.member_runs.len(), 2);
        assert_eq!(snapshot.team_runs[0].status, TeamRunStatus::Completed);
        assert_eq!(snapshot.team_runs[1].status, TeamRunStatus::Running);
        let second_task_id = snapshot.member_runs[1]
            .subagent_task_id
            .as_deref()
            .expect("second task binding");
        assert_ne!(second_task_id, first_task_id);
        let current_binding = snapshot
            .instance
            .member_bindings
            .iter()
            .find(|binding| binding.member_id == snapshot.member_runs[1].member_id)
            .expect("current specialist binding");
        assert_eq!(
            current_binding.subagent_task_id.as_deref(),
            Some(second_task_id)
        );
        assert_eq!(
            current_binding.child_session_id.as_deref(),
            Some("child-session")
        );
    }

    async fn attach_ready(
        service: &TeamRuntimeService,
        definition: &TeamDefinitionRecord,
        identity: &TeamCommandIdentity,
    ) {
        let attached = service
            .attach(AttachCommand {
                identity: TeamCommandIdentity {
                    operation_id: "attach-operation".into(),
                    ..identity.clone()
                },
                workspace: workspace(),
                team_definition_id: definition.definition.team_definition_id.clone(),
                team_definition_revision: definition.revision.clone(),
                scenario: TeamScenario::Code,
                execution_profile: TeamExecutionProfile::PromptOrchestrated,
                creation_source: TeamInstanceCreationSource::UserAttachment,
            })
            .await;
        assert!(attached.accepted, "{attached:?}");
    }

    fn start_command(
        definition: &TeamDefinitionRecord,
        identity: &TeamCommandIdentity,
    ) -> StartCommand {
        StartCommand {
            identity: TeamCommandIdentity {
                operation_id: "start-operation".into(),
                ..identity.clone()
            },
            team_run_id: "team-run".into(),
            workflow_id: definition.definition.workflows[0].workflow_id.clone(),
            objective: "complete the root phase".into(),
            parent_dialog_turn_id: "parent-turn".into(),
            parent_tool_call_id: "parent-tool".into(),
        }
    }

    #[tokio::test]
    async fn attach_observe_and_start_keep_io_order_and_parent_context() {
        let definition = definition_record();
        let events = Arc::new(Mutex::new(Vec::new()));
        let store = Arc::new(TestStore {
            record: Mutex::new(None),
            events: events.clone(),
            conflict_expected_revision: Mutex::new(None),
        });
        let adapter = Arc::new(TestAdapter {
            events: events.clone(),
            member_requests: Mutex::new(vec![]),
            message_requests: Mutex::new(vec![]),
            inspect_requests: Mutex::new(vec![]),
            stop_requests: Mutex::new(vec![]),
            ensure_failure: Mutex::new(None),
            malformed_ensure_receipt: Mutex::new(false),
            message_disposition: Mutex::new(RuntimeDisposition::MessageAccepted),
            inspect_task_state: Mutex::new(RuntimeTaskState::Running),
        });
        let service = TeamRuntimeService::new(
            Arc::new(TestDefinitions(definition.clone())),
            store.clone(),
            Arc::new(TestAdapters(adapter.clone())),
            Arc::new(TestClock),
        );
        let identity = TeamCommandIdentity {
            operation_id: "attach-operation".into(),
            parent_session_id: "parent-session".into(),
            team_instance_id: "team-instance".into(),
        };
        let attached = service
            .attach(AttachCommand {
                identity: identity.clone(),
                workspace: workspace(),
                team_definition_id: definition.definition.team_definition_id.clone(),
                team_definition_revision: definition.revision.clone(),
                scenario: TeamScenario::Code,
                execution_profile: TeamExecutionProfile::PromptOrchestrated,
                creation_source: TeamInstanceCreationSource::UserAttachment,
            })
            .await;
        assert!(attached.accepted, "{attached:?}");
        assert_eq!(
            events.lock().unwrap().as_slice(),
            ["load", "save", "activate", "save"]
        );
        assert_eq!(
            store
                .record
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .snapshot
                .instance
                .lifecycle,
            TeamInstanceLifecycle::Ready
        );

        events.lock().unwrap().clear();
        let observed = service
            .observe(ObserveCommand {
                identity: TeamCommandIdentity {
                    operation_id: "observe-operation".into(),
                    ..identity.clone()
                },
            })
            .await;
        assert!(observed.accepted, "{observed:?}");
        assert_eq!(events.lock().unwrap().as_slice(), ["load"]);

        events.lock().unwrap().clear();
        let started = service
            .start(StartCommand {
                identity: TeamCommandIdentity {
                    operation_id: "start-operation".into(),
                    ..identity
                },
                team_run_id: "team-run".into(),
                workflow_id: definition.definition.workflows[0].workflow_id.clone(),
                objective: "complete the root phase".into(),
                parent_dialog_turn_id: "parent-turn".into(),
                parent_tool_call_id: "parent-tool".into(),
            })
            .await;
        assert!(started.accepted, "{started:?}");
        assert_eq!(
            events.lock().unwrap().as_slice(),
            ["load", "save", "ensure", "save"]
        );
        let requests = adapter.member_requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(
            requests[0].parent_dialog_turn_id.as_deref(),
            Some("parent-turn")
        );
        assert_eq!(
            requests[0].parent_tool_call_id.as_deref(),
            Some("parent-tool")
        );
        let member_policy = requests[0]
            .team_member_skill_policy
            .as_ref()
            .expect("Team service must project a typed member Skill policy");
        assert!(!member_policy.is_restricted());
        assert_eq!(
            member_policy.team_definition_id,
            definition.definition.team_definition_id
        );
        assert_eq!(member_policy.team_definition_revision, definition.revision);
        assert_eq!(member_policy.team_instance_id, "team-instance");
        assert_eq!(member_policy.agent_id, "agent-id");
        let snapshot = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .clone();
        assert_eq!(snapshot.phase_runs.len(), 1);
        assert_eq!(snapshot.member_runs.len(), 1);
        assert_eq!(snapshot.instance.active_run_id.as_deref(), Some("team-run"));
        assert_eq!(
            snapshot.member_runs[0].child_session_id.as_deref(),
            Some("child-session")
        );
        assert_eq!(snapshot.team_runs[0].objective, "complete the root phase");
        assert_eq!(snapshot.team_runs[0].parent_dialog_turn_id, "parent-turn");
        assert_eq!(snapshot.team_runs[0].parent_tool_call_id, "parent-tool");
    }

    #[tokio::test]
    async fn restricted_member_skill_policy_comes_from_the_pinned_definition() {
        let mut definition = definition_record();
        let specialist = definition
            .definition
            .members
            .iter_mut()
            .find(|member| member.role == TeamMemberRole::Specialist)
            .unwrap();
        specialist.allowed_skill_keys = vec!["void:skill-a".into(), "void:skill-b".into()];
        definition.revision = team_definition_revision(&definition.definition);
        let (service, _store, adapter, definition, identity) = harness_with_definition(definition);
        attach_ready(&service, &definition, &identity).await;

        let outcome = service.start(start_command(&definition, &identity)).await;
        assert!(outcome.accepted, "{outcome:?}");
        let requests = adapter.member_requests.lock().unwrap();
        let policy = requests[0].team_member_skill_policy.as_ref().unwrap();
        assert!(policy.is_restricted());
        assert_eq!(
            policy.allowed_skill_keys,
            vec!["void:skill-a", "void:skill-b"]
        );
        policy.validate().unwrap();
    }

    fn recovery_task_from_member_request(request: &RuntimeRequest) -> SubagentTaskRecord {
        let task_id = request
            .subagent_task_id
            .clone()
            .expect("member request has durable task id");
        let mut task = SubagentTaskRecord::new_typed(
            task_id,
            request.parent_session_id.clone(),
            request.objective.clone().expect("member objective"),
            "team-runtime".into(),
            SubagentTaskExecutionMode::Background,
            SubagentTaskContextMode::Fresh,
            SubagentTaskReplaySafety::Idempotent,
            1,
        );
        task.status = SubagentTaskStatus::Interrupted;
        task.recovery_state = SubagentTaskRecoveryState::Queued;
        task.child_session_id = Some("child-session".into());
        task.launch_spec = Some(SubagentTaskLaunchSpec {
            agent_type: request.agent_id.clone().expect("member agent"),
            parent_dialog_turn_id: request.parent_dialog_turn_id.clone().expect("parent turn"),
            parent_tool_call_id: request.parent_tool_call_id.clone().expect("parent tool"),
            context: BTreeMap::from([
                (
                    "teamDefinitionId".into(),
                    request.team_definition_id.clone(),
                ),
                (
                    "teamDefinitionRevision".into(),
                    request.team_definition_revision.clone(),
                ),
                ("teamInstanceId".into(), request.team_instance_id.clone()),
                (
                    "teamRunId".into(),
                    request.team_run_id.clone().expect("team run"),
                ),
                (
                    "teamMemberId".into(),
                    request.member_id.clone().expect("member id"),
                ),
                (
                    "teamPhaseId".into(),
                    request.phase_id.clone().expect("phase id"),
                ),
            ]),
            allow_subagent_spawn: false,
            nesting_depth: 1,
            timeout_seconds: request.timeout_seconds,
            team_member_skill_policy: request.team_member_skill_policy.clone(),
        });
        task
    }

    #[tokio::test]
    async fn team_member_recovery_rebuilds_exact_authority_and_rejects_tampering() {
        let (service, _store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        let outcome = service.start(start_command(&definition, &identity)).await;
        assert!(outcome.accepted, "{outcome:?}");
        let original_request = adapter.member_requests.lock().unwrap()[0].clone();
        let task = recovery_task_from_member_request(&original_request);

        let rebuilt = service
            .member_recovery_request(&task)
            .await
            .expect("exact pinned member recovery request");
        for (actual, expected) in [
            (
                &rebuilt.parent_session_id,
                &original_request.parent_session_id,
            ),
            (
                &rebuilt.team_instance_id,
                &original_request.team_instance_id,
            ),
            (
                &rebuilt.team_definition_id,
                &original_request.team_definition_id,
            ),
            (
                &rebuilt.team_definition_revision,
                &original_request.team_definition_revision,
            ),
        ] {
            assert_eq!(actual, expected);
        }
        assert_eq!(rebuilt.team_run_id, original_request.team_run_id);
        assert_eq!(rebuilt.phase_id, original_request.phase_id);
        assert_eq!(rebuilt.member_id, original_request.member_id);
        assert_eq!(rebuilt.subagent_task_id, original_request.subagent_task_id);
        assert_eq!(rebuilt.child_session_id, task.child_session_id);
        assert_eq!(rebuilt.agent_id, original_request.agent_id);
        assert_eq!(
            rebuilt.parent_dialog_turn_id,
            original_request.parent_dialog_turn_id
        );
        assert_eq!(
            rebuilt.parent_tool_call_id,
            original_request.parent_tool_call_id
        );
        assert_eq!(rebuilt.objective, original_request.objective);
        assert_eq!(
            rebuilt.team_member_skill_policy,
            original_request.team_member_skill_policy
        );
        let exact_launch =
            PromptTeamRuntimeAdapter::expected_member_recovery_launch(&rebuilt, &task)
                .expect("strict adapter launch");
        assert_eq!(exact_launch, task.launch_spec.clone().unwrap());
        assert!(PromptTeamRuntimeAdapter::validate_member_recovery(&rebuilt, &task).is_ok());

        for variant in [
            "definition",
            "revision",
            "instance",
            "run",
            "phase",
            "member",
            "task",
            "child",
            "agent",
            "turn",
            "tool",
            "objective",
        ] {
            let mut tampered = task.clone();
            match variant {
                "definition" => {
                    tampered
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamDefinitionId".into(), "wrong-definition".into());
                }
                "revision" => {
                    tampered
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamDefinitionRevision".into(), "wrong-revision".into());
                }
                "instance" => {
                    tampered
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamInstanceId".into(), "wrong-instance".into());
                }
                "run" => {
                    tampered
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamRunId".into(), "wrong-run".into());
                }
                "phase" => {
                    tampered
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamPhaseId".into(), "wrong-phase".into());
                }
                "member" => {
                    tampered
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamMemberId".into(), "wrong-member".into());
                }
                "task" => tampered.task_id = "wrong-task".into(),
                "child" => tampered.child_session_id = Some("wrong-child".into()),
                "agent" => tampered.launch_spec.as_mut().unwrap().agent_type = "wrong-agent".into(),
                "turn" => {
                    tampered.launch_spec.as_mut().unwrap().parent_dialog_turn_id =
                        "wrong-turn".into()
                }
                "tool" => {
                    tampered.launch_spec.as_mut().unwrap().parent_tool_call_id = "wrong-tool".into()
                }
                "objective" => tampered.objective = "wrong objective".into(),
                _ => unreachable!(),
            }
            match service.member_recovery_request(&tampered).await {
                Err(_) => {}
                Ok(rebuilt) => assert!(
                    PromptTeamRuntimeAdapter::expected_member_recovery_launch(&rebuilt, &tampered,)
                        .is_err(),
                    "tampered {variant} must fail closed across service and adapter"
                ),
            }
        }
    }

    #[tokio::test]
    async fn team_member_recovery_only_migrates_legacy_no_policy_and_is_strict_afterward() {
        let (service, _store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        assert!(
            service
                .start(start_command(&definition, &identity))
                .await
                .accepted
        );
        let original = adapter.member_requests.lock().unwrap()[0].clone();
        let mut legacy = recovery_task_from_member_request(&original);
        legacy
            .launch_spec
            .as_mut()
            .unwrap()
            .team_member_skill_policy = None;
        let rebuilt = service.member_recovery_request(&legacy).await.unwrap();
        let expected = PromptTeamRuntimeAdapter::expected_member_recovery_launch(&rebuilt, &legacy)
            .expect("legacy no_policy may produce one migration launch");
        let mut migrated = legacy;
        migrated.launch_spec = Some(expected);
        PromptTeamRuntimeAdapter::validate_member_recovery(&rebuilt, &migrated)
            .expect("post-CAS validation is strict");

        let mut definition = definition_record();
        definition
            .definition
            .members
            .iter_mut()
            .find(|member| member.role == TeamMemberRole::Specialist)
            .unwrap()
            .allowed_skill_keys = vec!["void:skill-a".into()];
        definition.revision = team_definition_revision(&definition.definition);
        let (restricted_service, _store, restricted_adapter, definition, identity) =
            harness_with_definition(definition);
        attach_ready(&restricted_service, &definition, &identity).await;
        assert!(
            restricted_service
                .start(start_command(&definition, &identity))
                .await
                .accepted
        );
        let restricted_request = restricted_adapter.member_requests.lock().unwrap()[0].clone();
        let mut restricted_legacy = recovery_task_from_member_request(&restricted_request);
        restricted_legacy
            .launch_spec
            .as_mut()
            .unwrap()
            .team_member_skill_policy = None;
        let rebuilt = restricted_service
            .member_recovery_request(&restricted_legacy)
            .await
            .unwrap();
        assert!(PromptTeamRuntimeAdapter::expected_member_recovery_launch(
            &rebuilt,
            &restricted_legacy
        )
        .is_err());

        let mut tampered = recovery_task_from_member_request(&restricted_request);
        tampered
            .launch_spec
            .as_mut()
            .unwrap()
            .team_member_skill_policy
            .as_mut()
            .unwrap()
            .policy_hash = "tampered".into();
        assert!(
            PromptTeamRuntimeAdapter::validate_member_recovery(&restricted_request, &tampered)
                .is_err()
        );
    }

    #[tokio::test]
    async fn identical_start_replay_does_not_spawn_and_changed_payload_conflicts() {
        let (service, _store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        let command = start_command(&definition, &identity);
        assert!(service.start(command.clone()).await.accepted);
        assert!(service.start(command.clone()).await.accepted);
        assert_eq!(adapter.member_requests.lock().unwrap().len(), 1);

        let mut changed = command;
        changed.objective = "different objective".into();
        let outcome = service.start(changed).await;
        assert!(!outcome.accepted);
        assert_eq!(
            outcome.error.unwrap().code,
            TeamOrchestratorErrorCode::RuntimeConflict
        );
        assert_eq!(adapter.member_requests.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn adapter_and_receipt_failures_terminalize_the_reserved_run() {
        for malformed_receipt in [false, true] {
            let (service, store, adapter, definition, identity) = harness();
            attach_ready(&service, &definition, &identity).await;
            if malformed_receipt {
                *adapter.malformed_ensure_receipt.lock().unwrap() = true;
            } else {
                *adapter.ensure_failure.lock().unwrap() = Some(TestAdapter::unsupported());
            }
            let outcome = service.start(start_command(&definition, &identity)).await;
            assert!(!outcome.accepted);
            let snapshot = store
                .record
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .snapshot
                .clone();
            assert_eq!(snapshot.instance.active_run_id, None);
            assert!(snapshot
                .team_runs
                .iter()
                .all(|run| run.status == TeamRunStatus::Failed));
            assert!(snapshot
                .member_runs
                .iter()
                .all(|run| run.status == TeamMemberRunStatus::Failed));
            assert!(snapshot
                .phase_runs
                .iter()
                .all(|run| run.status == TeamPhaseRunStatus::Failed));
        }
    }

    #[tokio::test]
    async fn receipt_cas_conflict_does_not_repeat_adapter_side_effect() {
        let (service, store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        *store.conflict_expected_revision.lock().unwrap() = Some(Some(3));
        let outcome = service.start(start_command(&definition, &identity)).await;
        assert!(outcome.accepted, "{outcome:?}");
        assert_eq!(adapter.member_requests.lock().unwrap().len(), 1);
        let member = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .member_runs[0]
            .clone();
        assert!(member.has_applied_operation(member.operation_id.as_deref().unwrap()));
    }

    #[tokio::test]
    async fn test_store_injects_create_conflict_once_with_nested_none() {
        let (service, store, _adapter, definition, identity) = harness();
        *store.conflict_expected_revision.lock().unwrap() = Some(None);
        let command = AttachCommand {
            identity: TeamCommandIdentity {
                operation_id: "attach-operation".into(),
                ..identity
            },
            workspace: workspace(),
            team_definition_id: definition.definition.team_definition_id.clone(),
            team_definition_revision: definition.revision.clone(),
            scenario: TeamScenario::Code,
            execution_profile: TeamExecutionProfile::PromptOrchestrated,
            creation_source: TeamInstanceCreationSource::UserAttachment,
        };

        let conflicted = service.attach(command.clone()).await;
        assert!(!conflicted.accepted);
        assert!(store.conflict_expected_revision.lock().unwrap().is_none());
        assert!(service.attach(command).await.accepted);
    }

    #[tokio::test]
    async fn message_recover_and_stop_use_full_persisted_scope_and_replay_safely() {
        let (service, store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        assert!(
            service
                .start(start_command(&definition, &identity))
                .await
                .accepted
        );
        let member_id = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .member_runs[0]
            .member_id
            .clone();
        let message = MessageCommand {
            identity: TeamCommandIdentity {
                operation_id: "message-operation".into(),
                ..identity.clone()
            },
            team_run_id: "team-run".into(),
            member_id,
            message: "follow up".into(),
        };
        *adapter.message_disposition.lock().unwrap() = RuntimeDisposition::Reused;
        assert!(service.message(message.clone()).await.accepted);
        assert!(service.message(message).await.accepted);
        let message_requests = adapter.message_requests.lock().unwrap();
        assert_eq!(message_requests.len(), 1);
        assert_eq!(message_requests[0].team_run_id.as_deref(), Some("team-run"));
        assert_eq!(
            message_requests[0].objective.as_deref(),
            Some("complete the root phase")
        );
        assert_eq!(
            message_requests[0].parent_dialog_turn_id.as_deref(),
            Some("parent-turn")
        );
        assert_eq!(
            message_requests[0].parent_tool_call_id.as_deref(),
            Some("parent-tool")
        );
        assert_eq!(
            message_requests[0].child_session_id.as_deref(),
            Some("child-session")
        );
        assert!(message_requests[0].subagent_task_id.is_some());
        drop(message_requests);

        let recover = RecoverCommand {
            identity: TeamCommandIdentity {
                operation_id: "recover-operation".into(),
                ..identity.clone()
            },
        };
        assert!(service.recover(recover.clone()).await.accepted);
        assert!(service.recover(recover).await.accepted);
        assert_eq!(adapter.inspect_requests.lock().unwrap().len(), 1);
        assert_eq!(adapter.member_requests.lock().unwrap().len(), 1);

        let stop = StopCommand {
            identity: TeamCommandIdentity {
                operation_id: "stop-operation".into(),
                ..identity
            },
            team_run_id: "team-run".into(),
        };
        assert!(service.stop(stop.clone()).await.accepted);
        assert!(service.stop(stop).await.accepted);
        assert_eq!(adapter.stop_requests.lock().unwrap().len(), 1);
        let snapshot = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .clone();
        assert_eq!(snapshot.instance.active_run_id, None);
        assert!(snapshot
            .team_runs
            .iter()
            .all(|run| run.status == TeamRunStatus::Cancelled));
        assert!(snapshot
            .member_runs
            .iter()
            .all(|run| run.status == TeamMemberRunStatus::Cancelled));
        assert!(snapshot
            .phase_runs
            .iter()
            .all(|run| run.status == TeamPhaseRunStatus::Cancelled));
    }

    #[tokio::test]
    async fn recover_missing_reference_never_inspects_and_fails_the_active_run() {
        let (service, store, adapter, definition, identity) = harness();
        attach_ready(&service, &definition, &identity).await;
        assert!(
            service
                .start(start_command(&definition, &identity))
                .await
                .accepted
        );
        store
            .record
            .lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .snapshot
            .member_runs[0]
            .child_session_id = None;
        let outcome = service
            .recover(RecoverCommand {
                identity: TeamCommandIdentity {
                    operation_id: "recover-operation".into(),
                    ..identity
                },
            })
            .await;
        assert!(!outcome.accepted);
        assert_eq!(adapter.inspect_requests.lock().unwrap().len(), 0);
        let snapshot = store
            .record
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .snapshot
            .clone();
        assert_eq!(snapshot.instance.active_run_id, None);
        assert_eq!(snapshot.team_runs[0].status, TeamRunStatus::Failed);
    }

    #[tokio::test]
    async fn unsupported_commands_fail_closed_without_touching_dependencies() {
        let definition = definition_record();
        let events = Arc::new(Mutex::new(Vec::new()));
        let store = Arc::new(TestStore {
            record: Mutex::new(None),
            events: events.clone(),
            conflict_expected_revision: Mutex::new(None),
        });
        let adapter = Arc::new(TestAdapter {
            events: events.clone(),
            member_requests: Mutex::new(vec![]),
            message_requests: Mutex::new(vec![]),
            inspect_requests: Mutex::new(vec![]),
            stop_requests: Mutex::new(vec![]),
            ensure_failure: Mutex::new(None),
            malformed_ensure_receipt: Mutex::new(false),
            message_disposition: Mutex::new(RuntimeDisposition::MessageAccepted),
            inspect_task_state: Mutex::new(RuntimeTaskState::Running),
        });
        let service = TeamRuntimeService::new(
            Arc::new(TestDefinitions(definition)),
            store,
            Arc::new(TestAdapters(adapter)),
            Arc::new(TestClock),
        );
        let outcome = service
            .pause(PauseCommand {
                identity: TeamCommandIdentity {
                    operation_id: "stop-operation".into(),
                    parent_session_id: "parent-session".into(),
                    team_instance_id: "team-instance".into(),
                },
                team_run_id: "team-run".into(),
            })
            .await;
        assert!(!outcome.accepted);
        assert_eq!(
            outcome.error.unwrap().code,
            TeamOrchestratorErrorCode::AdapterUnsupported
        );
        assert!(events.lock().unwrap().is_empty());
    }
}
