//! Pure Team orchestration contracts and deterministic planning.
//!
//! Plans do not create sessions or tasks. Runtime adapters are the only I/O boundary.

use super::team_definitions::{
    validate_team_definition, TeamDefinitionRecord, TeamMemberDelegationPolicy, TeamScenario,
};
use super::team_runtime::{
    TeamExecutionProfile, TeamInstanceCreationSource, TeamLeadBinding, TeamMemberBinding,
    TeamWorkspaceIdentity,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{error::Error, fmt};
use void_core_types::TeamMemberSkillPolicySnapshot;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamCommandIdentity {
    pub operation_id: String,
    pub parent_session_id: String,
    pub team_instance_id: String,
}
macro_rules! run_command {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        pub struct $name {
            pub identity: TeamCommandIdentity,
            pub team_run_id: String,
        }
    };
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachCommand {
    pub identity: TeamCommandIdentity,
    pub workspace: TeamWorkspaceIdentity,
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub scenario: TeamScenario,
    pub execution_profile: TeamExecutionProfile,
    pub creation_source: TeamInstanceCreationSource,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCommand {
    pub identity: TeamCommandIdentity,
    pub team_run_id: String,
    pub workflow_id: String,
    pub objective: String,
    pub parent_dialog_turn_id: String,
    pub parent_tool_call_id: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObserveCommand {
    pub identity: TeamCommandIdentity,
}
run_command!(PauseCommand);
run_command!(ResumeCommand);
run_command!(StopCommand);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteMemberCommand {
    pub identity: TeamCommandIdentity,
    pub team_run_id: String,
    pub member_run_id: String,
    pub summary: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverCommand {
    pub identity: TeamCommandIdentity,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageCommand {
    pub identity: TeamCommandIdentity,
    pub team_run_id: String,
    pub member_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamOrchestratorErrorCode {
    InvalidCommand,
    ScopeMismatch,
    DefinitionInvalid,
    DefinitionNotFound,
    DefinitionRevisionMismatch,
    ScenarioUnsupported,
    WorkflowNotFound,
    ExecutionRouteInvalid,
    RecoveryReferenceMissing,
    RuntimeNotFound,
    RuntimeConflict,
    StoreFailure,
    AdapterUnavailable,
    AdapterRejected,
    AdapterUnsupported,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamOrchestratorError {
    pub code: TeamOrchestratorErrorCode,
    pub message: String,
    pub retryable: bool,
}
impl fmt::Display for TeamOrchestratorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
impl Error for TeamOrchestratorError {}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamOrchestratorOutcome {
    pub operation_id: String,
    pub accepted: bool,
    #[serde(default)]
    pub operation_ids: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<TeamOrchestratorError>,
}
impl TeamOrchestratorOutcome {
    pub fn accepted(operation_id: impl Into<String>, operation_ids: Vec<String>) -> Self {
        Self {
            operation_id: operation_id.into(),
            accepted: true,
            operation_ids,
            notes: vec![],
            error: None,
        }
    }
}

#[async_trait]
pub trait TeamOrchestrator: Send + Sync {
    async fn attach(&self, command: AttachCommand) -> TeamOrchestratorOutcome;
    async fn start(&self, command: StartCommand) -> TeamOrchestratorOutcome;
    async fn observe(&self, command: ObserveCommand) -> TeamOrchestratorOutcome;
    async fn message(&self, command: MessageCommand) -> TeamOrchestratorOutcome;
    async fn pause(&self, command: PauseCommand) -> TeamOrchestratorOutcome;
    async fn resume(&self, command: ResumeCommand) -> TeamOrchestratorOutcome;
    async fn stop(&self, command: StopCommand) -> TeamOrchestratorOutcome;
    async fn recover(&self, command: RecoverCommand) -> TeamOrchestratorOutcome;
    async fn complete_member(&self, command: CompleteMemberCommand) -> TeamOrchestratorOutcome;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRequest {
    pub operation_id: String,
    pub parent_session_id: String,
    pub team_instance_id: String,
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub workspace: TeamWorkspaceIdentity,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_dialog_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subagent_task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Trusted Team-service projection. UI/context strings are never Skill authority.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_member_skill_policy: Option<TeamMemberSkillPolicySnapshot>,
    /// Trusted policy from the exact Team definition revision pinned by the instance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_member_delegation_policy: Option<TeamMemberDelegationPolicy>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeTaskState {
    NotFound,
    Created,
    Running,
    Blocked,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
    NotApplicable,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeDisposition {
    Activated,
    Created,
    Reused,
    Inspected,
    MessageAccepted,
    Stopped,
    Unsupported,
    Rejected,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeReceipt {
    pub operation_id: String,
    pub accepted: bool,
    pub disposition: RuntimeDisposition,
    pub task_state: RuntimeTaskState,
    pub parent_session_id: String,
    pub team_instance_id: String,
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub workspace: TeamWorkspaceIdentity,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_dialog_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subagent_task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worker_summary: Option<MemberWorkerSummary>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemberWorkerSummary {
    pub total: u32,
    pub active: u32,
    pub failed: u32,
}
/// Narrow runtime boundary; only `ensure_member_task` may create a member task.
///
/// Every side-effecting method must treat `operation_id` as an idempotency key across retries.
/// Replaying an operation with the same ID and scope must return the same logical result and must
/// not create another session, task, message, pause, resume, or stop effect. `inspect_member_task`
/// is read-only and must never create a task or session.
#[async_trait]
pub trait TeamRuntimeAdapter: Send + Sync {
    fn adapter_id(&self) -> &str;
    async fn activate_lead(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
    async fn ensure_member_task(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
    async fn inspect_member_task(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
    async fn message_member(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
    async fn pause_run(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
    async fn resume_run(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
    async fn stop_run(
        &self,
        request: RuntimeRequest,
    ) -> Result<RuntimeReceipt, TeamOrchestratorError>;
}

pub fn stable_operation_id(
    operation_id: &str,
    parent_session_id: &str,
    team_instance_id: &str,
    logical_parts: &[&str],
) -> String {
    let mut hasher = Sha256::new();
    for (index, part) in [operation_id, parent_session_id, team_instance_id]
        .into_iter()
        .chain(logical_parts.iter().copied())
        .enumerate()
    {
        if index > 0 {
            // NUL delimiters preserve the fixed scope order without concatenation ambiguity.
            hasher.update([0]);
        }
        hasher.update(part.as_bytes());
    }
    format!("team-op-{:x}", hasher.finalize())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamPlanIntentKind {
    Dispatch,
    Inspect,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberIntent {
    pub kind: TeamPlanIntentKind,
    pub operation_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase_id: Option<String>,
    pub member_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_session_id: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTeamPlan {
    pub definition_id: String,
    pub definition_revision: String,
    pub workflow_id: String,
    pub member_bindings: Vec<TeamMemberBinding>,
    pub ready_phase_ids: Vec<String>,
    pub member_intents: Vec<TeamMemberIntent>,
}
pub struct PromptTeamPlanBuilder;
impl PromptTeamPlanBuilder {
    #[allow(clippy::too_many_arguments)]
    pub fn build(
        record: &TeamDefinitionRecord,
        expected_revision: &str,
        scenario: TeamScenario,
        workflow_id: &str,
        operation_id: &str,
        parent_session_id: &str,
        team_instance_id: &str,
        profile: &TeamExecutionProfile,
        lead_binding: &TeamLeadBinding,
    ) -> Result<PromptTeamPlan, TeamOrchestratorError> {
        validate_team_definition(&record.definition).map_err(|error| {
            Self::error(TeamOrchestratorErrorCode::DefinitionInvalid, error.message)
        })?;
        if super::team_definitions::team_definition_revision(&record.definition) != record.revision
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                "Team definition content does not match its recorded revision",
            ));
        }
        if record.revision != expected_revision {
            return Err(Self::error(
                TeamOrchestratorErrorCode::DefinitionRevisionMismatch,
                "Team definition revision does not match the requested revision",
            ));
        }
        if !record.definition.scenario_eligibility.contains(&scenario) {
            return Err(Self::error(
                TeamOrchestratorErrorCode::ScenarioUnsupported,
                "Team definition does not support this scenario",
            ));
        }
        if operation_id.trim().is_empty()
            || parent_session_id.trim().is_empty()
            || team_instance_id.trim().is_empty()
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::InvalidCommand,
                "operation ID, parent session ID, and team instance ID are required",
            ));
        }
        match (profile, lead_binding) {
            (
                TeamExecutionProfile::PromptOrchestrated,
                TeamLeadBinding::ParentPersona {
                    parent_session_id: lead_parent,
                },
            ) if lead_parent == parent_session_id => {}
            (TeamExecutionProfile::PromptOrchestrated, _) => {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::ExecutionRouteInvalid,
                    "PromptOrchestrated requires ParentPersona for the parent session",
                ))
            }
            (TeamExecutionProfile::FlagshipAdapter { adapter_id }, _)
                if !adapter_id.trim().is_empty() => {}
            (TeamExecutionProfile::FlagshipAdapter { .. }, _) => {
                return Err(Self::error(
                    TeamOrchestratorErrorCode::ExecutionRouteInvalid,
                    "FlagshipAdapter requires an explicit adapterId",
                ))
            }
        }
        let workflow = record
            .definition
            .workflows
            .iter()
            .find(|workflow| workflow.workflow_id == workflow_id)
            .ok_or_else(|| {
                Self::error(
                    TeamOrchestratorErrorCode::WorkflowNotFound,
                    "Team workflow was not found",
                )
            })?;
        let member_bindings = record
            .definition
            .members
            .iter()
            .filter(|member| member.member_id != record.definition.lead_member_id)
            .map(|member| TeamMemberBinding {
                member_id: member.member_id.clone(),
                child_session_id: None,
                subagent_task_id: None,
            })
            .collect();
        let root_phases = workflow
            .phases
            .iter()
            .filter(|phase| phase.depends_on_phase_ids.is_empty())
            .collect::<Vec<_>>();
        let ready_phase_ids = root_phases
            .iter()
            .map(|phase| phase.phase_id.clone())
            .collect();
        let member_intents = root_phases
            .into_iter()
            .filter(|phase| {
                matches!(
                    phase.kind,
                    super::team_definitions::TeamWorkflowPhaseKind::Serial
                        | super::team_definitions::TeamWorkflowPhaseKind::Parallel
                )
            })
            .flat_map(|phase| {
                phase
                    .assigned_member_ids
                    .iter()
                    .filter(move |member| *member != &record.definition.lead_member_id)
                    .map(move |member_id| TeamMemberIntent {
                        kind: TeamPlanIntentKind::Dispatch,
                        operation_id: stable_operation_id(
                            operation_id,
                            parent_session_id,
                            team_instance_id,
                            &[workflow_id, &phase.phase_id, member_id],
                        ),
                        phase_id: Some(phase.phase_id.clone()),
                        member_id: member_id.clone(),
                        existing_task_id: None,
                        existing_session_id: None,
                    })
            })
            .collect();
        Ok(PromptTeamPlan {
            definition_id: record.definition.team_definition_id.clone(),
            definition_revision: record.revision.clone(),
            workflow_id: workflow.workflow_id.clone(),
            member_bindings,
            ready_phase_ids,
            member_intents,
        })
    }
    pub fn recover_plan(
        operation_id: &str,
        parent_session_id: &str,
        team_instance_id: &str,
        existing: &[(String, Option<String>, Option<String>)],
    ) -> Result<Vec<TeamMemberIntent>, TeamOrchestratorError> {
        if operation_id.trim().is_empty()
            || parent_session_id.trim().is_empty()
            || team_instance_id.trim().is_empty()
        {
            return Err(Self::error(
                TeamOrchestratorErrorCode::InvalidCommand,
                "operation ID, parent session ID, and team instance ID are required",
            ));
        }
        let mut members = std::collections::HashSet::new();
        existing
            .iter()
            .try_fold(Vec::new(), |mut intents, (member_id, task, session)| {
                if member_id.trim().is_empty() || (task.is_none() && session.is_none()) {
                    return Err(Self::error(
                        TeamOrchestratorErrorCode::RecoveryReferenceMissing,
                        "Recovery requires a member ID and an existing task or session reference",
                    ));
                }
                if !members.insert(member_id.clone()) {
                    return Ok(intents);
                }
                intents.push(TeamMemberIntent {
                    kind: TeamPlanIntentKind::Inspect,
                    operation_id: stable_operation_id(
                        operation_id,
                        parent_session_id,
                        team_instance_id,
                        &["recover", member_id],
                    ),
                    phase_id: None,
                    member_id: member_id.clone(),
                    existing_task_id: task.clone(),
                    existing_session_id: session.clone(),
                });
                Ok(intents)
            })
    }
    fn error(code: TeamOrchestratorErrorCode, message: impl Into<String>) -> TeamOrchestratorError {
        TeamOrchestratorError {
            code,
            message: message.into(),
            retryable: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::team_definitions::{
        team_definition_revision, TeamCollaborationPolicy, TeamDefinition, TeamDefinitionLevel,
        TeamDefinitionOrigin, TeamMemberDefinition, TeamMemberRole, TeamPermissionPolicy,
        TeamWorkflowDefinition, TeamWorkflowPhaseDefinition, TeamWorkflowPhaseKind,
        TEAM_DEFINITION_SCHEMA_VERSION,
    };
    use super::super::team_runtime::TeamWorkspaceBackend;
    use super::*;
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
    fn record() -> TeamDefinitionRecord {
        let lead = id("member", 'a');
        let worker = id("member", 'b');
        let first = id("phase", 'c');
        let later = id("phase", 'd');
        let definition = TeamDefinition {
            schema_version: TEAM_DEFINITION_SCHEMA_VERSION,
            team_definition_id: id("custom", 'e'),
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
                workflow_id: id("workflow", 'f'),
                display_name: "Flow".into(),
                trigger_description: "go".into(),
                phases: vec![
                    phase(
                        first.clone(),
                        TeamWorkflowPhaseKind::Parallel,
                        vec![],
                        vec![lead, worker.clone()],
                    ),
                    phase(
                        later,
                        TeamWorkflowPhaseKind::Serial,
                        vec![first],
                        vec![worker],
                    ),
                ],
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
            path: "x".into(),
            is_authorable: true,
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
            delegation_policy: Default::default(),
        }
    }
    fn phase(
        phase_id: String,
        kind: TeamWorkflowPhaseKind,
        depends_on_phase_ids: Vec<String>,
        assigned_member_ids: Vec<String>,
    ) -> TeamWorkflowPhaseDefinition {
        TeamWorkflowPhaseDefinition {
            phase_id,
            display_name: "Phase".into(),
            kind,
            depends_on_phase_ids,
            assigned_member_ids,
            expected_outputs: vec![],
            completion_rule: "Done".into(),
        }
    }
    fn plan(value: &TeamDefinitionRecord) -> Result<PromptTeamPlan, TeamOrchestratorError> {
        plan_for(value, "parent", "instance")
    }
    fn plan_for(
        value: &TeamDefinitionRecord,
        parent_session_id: &str,
        team_instance_id: &str,
    ) -> Result<PromptTeamPlan, TeamOrchestratorError> {
        PromptTeamPlanBuilder::build(
            value,
            &value.revision,
            TeamScenario::Code,
            &value.definition.workflows[0].workflow_id,
            "op",
            parent_session_id,
            team_instance_id,
            &TeamExecutionProfile::PromptOrchestrated,
            &TeamLeadBinding::ParentPersona {
                parent_session_id: parent_session_id.into(),
            },
        )
    }
    #[test]
    fn fixture_is_valid() {
        validate_team_definition(&record().definition).unwrap();
    }
    #[test]
    fn operation_id_is_stable_across_retries() {
        assert_eq!(
            stable_operation_id("a", "parent", "instance", &["b"]),
            stable_operation_id("a", "parent", "instance", &["b"])
        );
    }
    #[test]
    fn operation_id_separates_parts() {
        assert_ne!(
            stable_operation_id("ab", "parent", "instance", &["c"]),
            stable_operation_id("a", "parent", "instance", &["bc"])
        );
    }
    #[test]
    fn operation_id_isolated_by_parent_and_team_instance() {
        let operation_id = stable_operation_id("op", "parent-a", "instance-a", &["part"]);
        assert_ne!(
            operation_id,
            stable_operation_id("op", "parent-b", "instance-a", &["part"])
        );
        assert_ne!(
            operation_id,
            stable_operation_id("op", "parent-a", "instance-b", &["part"])
        );
    }
    #[test]
    fn plan_excludes_lead() {
        assert_eq!(plan(&record()).unwrap().member_bindings.len(), 1);
    }
    #[test]
    fn root_phase_is_ready_and_dispatches_worker() {
        let plan = plan(&record()).unwrap();
        assert_eq!(plan.ready_phase_ids.len(), 1);
        assert_eq!(plan.member_intents.len(), 1);
    }
    #[test]
    fn scenario_unsupported_is_rejected() {
        let value = record();
        let error = PromptTeamPlanBuilder::build(
            &value,
            &value.revision,
            TeamScenario::Cowork,
            &value.definition.workflows[0].workflow_id,
            "op",
            "parent",
            "instance",
            &TeamExecutionProfile::PromptOrchestrated,
            &TeamLeadBinding::ParentPersona {
                parent_session_id: "parent".into(),
            },
        )
        .unwrap_err();
        assert_eq!(error.code, TeamOrchestratorErrorCode::ScenarioUnsupported);
    }
    #[test]
    fn workflow_missing_is_rejected() {
        let value = record();
        let error = PromptTeamPlanBuilder::build(
            &value,
            &value.revision,
            TeamScenario::Code,
            "missing",
            "op",
            "parent",
            "instance",
            &TeamExecutionProfile::PromptOrchestrated,
            &TeamLeadBinding::ParentPersona {
                parent_session_id: "parent".into(),
            },
        )
        .unwrap_err();
        assert_eq!(error.code, TeamOrchestratorErrorCode::WorkflowNotFound);
    }
    #[test]
    fn revision_mismatch_is_rejected() {
        let value = record();
        let error = PromptTeamPlanBuilder::build(
            &value,
            "stale",
            TeamScenario::Code,
            &value.definition.workflows[0].workflow_id,
            "op",
            "parent",
            "instance",
            &TeamExecutionProfile::PromptOrchestrated,
            &TeamLeadBinding::ParentPersona {
                parent_session_id: "parent".into(),
            },
        )
        .unwrap_err();
        assert_eq!(
            error.code,
            TeamOrchestratorErrorCode::DefinitionRevisionMismatch
        );
    }
    #[test]
    fn stale_record_revision_is_rejected() {
        let mut value = record();
        value.definition.description.push('!');
        let error = plan(&value).unwrap_err();
        assert_eq!(
            error.code,
            TeamOrchestratorErrorCode::DefinitionRevisionMismatch
        );
    }
    #[test]
    fn attach_and_start_serde_round_trip_preserves_context() {
        let identity = TeamCommandIdentity {
            operation_id: "op".into(),
            parent_session_id: "parent".into(),
            team_instance_id: "instance".into(),
        };
        let attach = AttachCommand {
            identity: identity.clone(),
            workspace: workspace(),
            team_definition_id: "definition".into(),
            team_definition_revision: "revision".into(),
            scenario: TeamScenario::Code,
            execution_profile: TeamExecutionProfile::PromptOrchestrated,
            creation_source: TeamInstanceCreationSource::UserAttachment,
        };
        let start = StartCommand {
            identity,
            team_run_id: "run".into(),
            workflow_id: "workflow".into(),
            objective: "Complete the task".into(),
            parent_dialog_turn_id: "parent-turn".into(),
            parent_tool_call_id: "parent-tool".into(),
        };
        let attach_json = serde_json::to_string(&attach).unwrap();
        let start_json = serde_json::to_string(&start).unwrap();
        assert_eq!(
            serde_json::from_str::<AttachCommand>(&attach_json).unwrap(),
            attach
        );
        assert_eq!(
            serde_json::from_str::<StartCommand>(&start_json).unwrap(),
            start
        );
    }
    #[test]
    fn runtime_request_serde_round_trip_preserves_definition_and_child_session() {
        let request = RuntimeRequest {
            operation_id: "op".into(),
            parent_session_id: "parent".into(),
            team_instance_id: "instance".into(),
            team_definition_id: "definition".into(),
            team_definition_revision: "revision".into(),
            workspace: workspace(),
            parent_dialog_turn_id: Some("parent-turn".into()),
            parent_tool_call_id: Some("parent-tool".into()),
            team_run_id: Some("run".into()),
            member_id: Some("member".into()),
            member_run_id: Some("member-run".into()),
            child_session_id: Some("child".into()),
            subagent_task_id: Some("task".into()),
            phase_id: Some("phase".into()),
            agent_id: Some("agent".into()),
            objective: Some("objective".into()),
            timeout_seconds: Some(30),
            message: Some("message".into()),
            team_member_skill_policy: None,
            team_member_delegation_policy: None,
        };
        let json = serde_json::to_string(&request).unwrap();
        assert_eq!(
            serde_json::from_str::<RuntimeRequest>(&json).unwrap(),
            request
        );
    }
    #[test]
    fn prompt_requires_parent_persona() {
        let value = record();
        let error = PromptTeamPlanBuilder::build(
            &value,
            &value.revision,
            TeamScenario::Code,
            &value.definition.workflows[0].workflow_id,
            "op",
            "parent",
            "instance",
            &TeamExecutionProfile::PromptOrchestrated,
            &TeamLeadBinding::ChildOrchestrator {
                child_session_id: "child".into(),
            },
        )
        .unwrap_err();
        assert_eq!(error.code, TeamOrchestratorErrorCode::ExecutionRouteInvalid);
    }
    #[test]
    fn decision_and_review_roots_do_not_dispatch() {
        let mut value = record();
        for kind in [
            TeamWorkflowPhaseKind::Decision,
            TeamWorkflowPhaseKind::Review,
        ] {
            value.definition.workflows[0].phases[0].kind = kind;
            value.revision = team_definition_revision(&value.definition);
            assert!(plan(&value).unwrap().member_intents.is_empty());
        }
    }
    #[test]
    fn recover_contains_only_inspect_intents() {
        let intents = PromptTeamPlanBuilder::recover_plan(
            "op",
            "parent",
            "instance",
            &[("member".into(), Some("task".into()), Some("session".into()))],
        )
        .unwrap();
        assert_eq!(intents[0].kind, TeamPlanIntentKind::Inspect);
        assert_eq!(intents[0].phase_id, None);
        assert_eq!(intents[0].existing_task_id.as_deref(), Some("task"));
    }
    #[test]
    fn dispatch_and_recovery_operations_are_isolated_by_team_instance() {
        let value = record();
        let dispatch_a = plan_for(&value, "parent", "instance-a").unwrap();
        let dispatch_b = plan_for(&value, "parent", "instance-b").unwrap();
        assert_ne!(
            dispatch_a.member_intents[0].operation_id,
            dispatch_b.member_intents[0].operation_id
        );

        let existing = [("member".into(), Some("task".into()), Some("session".into()))];
        let recovery_a =
            PromptTeamPlanBuilder::recover_plan("op", "parent", "instance-a", &existing).unwrap();
        let recovery_b =
            PromptTeamPlanBuilder::recover_plan("op", "parent", "instance-b", &existing).unwrap();
        assert_ne!(recovery_a[0].operation_id, recovery_b[0].operation_id);
    }
    #[test]
    fn recover_rejects_missing_handle() {
        let error = PromptTeamPlanBuilder::recover_plan(
            "op",
            "parent",
            "instance",
            &[("member".into(), None, None)],
        )
        .unwrap_err();
        assert_eq!(
            error.code,
            TeamOrchestratorErrorCode::RecoveryReferenceMissing
        );
    }
}
