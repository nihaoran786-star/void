//! Conversation coordinator
//!
//! Top-level component that integrates all subsystems and provides a unified interface

use super::{scheduler::DialogSubmissionPolicy, turn_outcome::TurnOutcome};
use crate::agentic::agents::get_agent_registry;
use crate::agentic::context_profile::ContextProfilePolicy;
use crate::agentic::core::{
    has_prompt_markup, Message, MessageContent, ProcessingPhase, PromptEnvelope, Session,
    SessionConfig, SessionKind, SessionState, SessionSummary, TurnStats,
};
use crate::agentic::events::{
    AgenticEvent, DeepReviewQueueState, EventPriority, EventQueue, EventRouter, EventSubscriber,
};
use crate::agentic::execution::{
    resolve_persona_turn_runtime, wrap_persona_runtime_validation_error, ContextCompactionOutcome,
    ExecutionContext, ExecutionEngine, ExecutionResult, TeamLeadPersonaResolver,
};
use crate::agentic::fork_agent::ForkAgentContextSnapshot;
use crate::agentic::goal_mode::{
    build_goal_continuation_plan, build_goal_kickoff_messages, clear_goal_mode_patch,
    effective_subagent_timeout_seconds, ensure_final_response_in_goal_context,
    generate_goal_from_context, goal_mode_from_custom_metadata, goal_mode_patch, now_ms,
    should_skip_goal_verification_for_turn, update_goal_mode_state, user_facing_goal_mode_error,
    verify_goal_achievement, wrap_user_input_with_goal_reminder, GoalActivationResult,
    GoalContinuationPlan, GoalModeInitialGoal, GoalModeState, GoalModeStatus, GoalModeUpdateAction,
    GoalModeUpdateResult, MAX_GOAL_CONTINUATIONS,
};
use crate::agentic::image_analysis::ImageContextData;
use crate::agentic::round_preempt::{DialogRoundInjectionSource, DialogRoundPreemptSource};
use crate::agentic::session::{
    PersistedToolCallAuthority, PreparedPersistedTurn, PreparedTurnDisposition, SessionManager,
};
use crate::agentic::side_question::build_btw_user_input;
use crate::agentic::team_member_tool_runtime::{TeamMemberToolInvocation, TEAM_MEMBER_TOOL_NAME};
use crate::agentic::team_tool_runtime::{
    TeamToolExecutionOutcome, TeamToolExecutor, TeamToolInvocation, TEAM_TOOL_NAME,
};
use crate::agentic::tools::image_context::{
    store_image_contexts as store_media_image_contexts, ImageContextData as MediaToolImageContext,
};
use crate::agentic::tools::pipeline::{SubagentParentInfo, ToolPipeline};
use crate::agentic::tools::ToolRuntimeRestrictions;
use crate::agentic::WorkspaceBinding;
use crate::service::bootstrap::{
    ensure_workspace_persona_files_for_prompt, is_workspace_bootstrap_pending,
};
use crate::service::config::global::GlobalConfigManager;
use crate::service::remote_ssh::normalize_remote_workspace_path;
use crate::service::session::{SessionRelationship, SessionRelationshipKind};
use crate::service::workspace::{
    get_global_workspace_service, WorkspaceCreateOptions, WorkspaceKind,
};
use crate::util::errors::{VoidError, VoidResult};
use dashmap::DashMap;
use log::{debug, error, info, warn};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::{mpsc, watch, Mutex, OwnedSemaphorePermit, RwLock, Semaphore};
use tokio::time::{sleep, Duration, Instant};
use tokio_util::sync::CancellationToken;
use void_core_types::{
    SubagentLaunchAuthority, SubagentLaunchAuthorityKind, SubagentTaskContextMode,
    SubagentTaskExecutionMode, SubagentTaskLaunchSpec, SubagentTaskRecord,
    SubagentTaskRecoveryBlockCode, SubagentTaskRecoveryState, SubagentTaskReplaySafety,
    SubagentTaskStatus, TeamDelegationLineageSnapshot, TeamMemberSkillPolicySnapshot,
    SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION, TEAM_DELEGATION_PARENT_MEMBER_SESSION_CONTEXT_KEY,
    TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY,
};
use void_runtime_ports::{
    DelegationPolicy, DelegationTier, SubagentContextMode, TeamDelegationBudget,
    TEAM_DELEGATION_MAX_PARALLEL_WORKERS_CONTEXT_KEY, TEAM_DELEGATION_MAX_WORKER_TASKS_CONTEXT_KEY,
};

const MANUAL_COMPACTION_COMMAND: &str = "/compact";
const CONTEXT_COMPRESSION_TOOL_NAME: &str = "ContextCompression";
const DEFAULT_SUBAGENT_MAX_CONCURRENCY: usize = 5;
const MAX_SUBAGENT_MAX_CONCURRENCY: usize = 64;
const SUBAGENT_TIMEOUT_GRACE_PERIOD: Duration = Duration::from_secs(10);
const SUBAGENT_DELIVERY_LEASE_DURATION_MS: u64 = 30_000;
const MAX_DURABLE_SUBAGENT_CONTEXT_ENTRIES: usize = 8;
const MAX_DURABLE_SUBAGENT_CONTEXT_KEY_BYTES: usize = 64;
const MAX_DURABLE_SUBAGENT_CONTEXT_VALUE_BYTES: usize = 1024;
const MAX_DURABLE_SUBAGENT_CONTEXT_TOTAL_BYTES: usize = 4096;
const DURABLE_SUBAGENT_CONTEXT_ALLOWLIST: &[&str] = &[
    "deep_review_subagent_role",
    "deep_review_subagent_type",
    "multitaskBranchId",
    "multitaskBranchGoal",
    "teamDefinitionId",
    "teamDefinitionRevision",
    "teamInstanceId",
    "teamRunId",
    "memberRunId",
    "teamMemberId",
    "teamPhaseId",
    TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY,
    TEAM_DELEGATION_PARENT_MEMBER_SESSION_CONTEXT_KEY,
    TEAM_DELEGATION_MAX_WORKER_TASKS_CONTEXT_KEY,
    TEAM_DELEGATION_MAX_PARALLEL_WORKERS_CONTEXT_KEY,
];
const TEAM_MEMBER_RECOVERY_CONTEXT_KEYS: &[&str] = &[
    "teamDefinitionId",
    "teamDefinitionRevision",
    "teamInstanceId",
    "teamRunId",
    "teamMemberId",
    "teamPhaseId",
];

fn contains_explicit_sensitive_context_value(value: &str) -> bool {
    let lowered = value.to_ascii_lowercase();
    let trimmed = lowered.trim_start();
    let basic_credential = trimmed.strip_prefix("basic ").is_some_and(|credential| {
        credential.len() >= 12
            && !credential.chars().any(char::is_whitespace)
            && credential
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "+/=_-".contains(character))
    });
    if trimmed
        .strip_prefix("bearer ")
        .is_some_and(|credential| credential.trim().len() >= 8)
        || basic_credential
        || lowered.contains("authorization: bearer ")
        || lowered.contains("authorization: basic ")
    {
        return true;
    }
    [
        "authorization:",
        "authorization=",
        "api_key=",
        "api-key=",
        "password=",
        "passwd=",
        "cookie=",
        "secret=",
        "_token=",
        "-----begin private key-----",
        "-----begin rsa private key-----",
        "-----begin ec private key-----",
        "-----begin openssh private key-----",
    ]
    .iter()
    .any(|marker| lowered.contains(marker))
}

/// Subagent execution result
///
/// Contains the text response after subagent execution
#[derive(Debug, Clone)]
pub struct SubagentResult {
    /// AI text response
    pub text: String,
    pub status: SubagentResultStatus,
    pub reason: Option<String>,
    pub ledger_event_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubagentResultStatus {
    Completed,
    PartialTimeout,
}

#[derive(Debug, Clone)]
pub(crate) struct SubagentExecutionRequest {
    pub(crate) task_description: String,
    pub(crate) context_mode: SubagentContextMode,
    pub(crate) subagent_type: Option<String>,
    pub(crate) workspace_path: Option<String>,
    pub(crate) model_id: Option<String>,
    pub(crate) subagent_parent_info: SubagentParentInfo,
    pub(crate) context: HashMap<String, String>,
    /// Execution policy for the child subagent session being launched.
    pub(crate) delegation_policy: DelegationPolicy,
}

impl SubagentResult {
    fn completed(text: String) -> Self {
        Self {
            text,
            status: SubagentResultStatus::Completed,
            reason: None,
            ledger_event_id: None,
        }
    }

    fn partial_timeout(text: String, reason: String) -> Self {
        Self {
            text,
            status: SubagentResultStatus::PartialTimeout,
            reason: Some(reason),
            ledger_event_id: None,
        }
    }

    fn with_ledger_event_id(mut self, event_id: String) -> Self {
        self.ledger_event_id = Some(event_id);
        self
    }

    pub fn is_partial_timeout(&self) -> bool {
        self.status == SubagentResultStatus::PartialTimeout
    }

    pub fn ledger_event_id(&self) -> Option<&str> {
        self.ledger_event_id.as_deref()
    }
}

#[derive(Debug, Clone)]
pub struct BackgroundSubagentStartResult {
    pub background_task_id: String,
    pub reused: bool,
}

fn format_background_subagent_delivery_text(
    background_task_id: &str,
    agent_type: &str,
    outcome: Result<&SubagentResult, &VoidError>,
) -> String {
    match outcome {
        Ok(result) => {
            if result.is_partial_timeout() {
                format!(
                    "Background subagent '{}' (background_task_id='{}') completed with partial timeout result:\n<partial_result status=\"partial_timeout\">\n{}\n</partial_result>",
                    agent_type, background_task_id, result.text
                )
            } else {
                format!(
                    "Background subagent '{}' (background_task_id='{}') completed successfully:\n<result>\n{}\n</result>",
                    agent_type, background_task_id, result.text
                )
            }
        }
        Err(error) => {
            format!(
                "Background subagent '{}' (background_task_id='{}') failed before producing a final result.\nError: {}",
                agent_type, background_task_id, error
            )
        }
    }
}

fn background_subagent_terminal_facts(
    outcome: Result<&SubagentResult, &VoidError>,
) -> (SubagentTaskStatus, Option<String>, Option<String>) {
    match outcome {
        Ok(result) => (
            SubagentTaskStatus::Completed,
            Some(result.text.clone()),
            None,
        ),
        Err(error) if matches!(error, VoidError::Cancelled(_)) => {
            (SubagentTaskStatus::Cancelled, None, Some(error.to_string()))
        }
        Err(error) => (SubagentTaskStatus::Failed, None, Some(error.to_string())),
    }
}

fn build_background_subagent_result_metadata(
    background_task_id: &str,
    agent_type: &str,
    task_description: &str,
    context: HashMap<String, String>,
) -> serde_json::Value {
    serde_json::json!({
        "kind": "background_result",
        "sourceKind": "subagent",
        "backgroundTaskId": background_task_id,
        "subagentType": agent_type,
        "taskDescription": task_description,
        "context": context,
    })
}

fn durable_subagent_context(
    context: &HashMap<String, String>,
) -> std::collections::BTreeMap<String, String> {
    let mut durable = std::collections::BTreeMap::new();
    let mut total_bytes = 0usize;
    for key in DURABLE_SUBAGENT_CONTEXT_ALLOWLIST {
        let Some(value) = context.get(*key) else {
            continue;
        };
        let normalized_key = key.trim();
        let lowered = normalized_key.to_ascii_lowercase();
        if ["token", "key", "auth", "password", "secret", "cookie"]
            .iter()
            .any(|sensitive| lowered.contains(sensitive))
            || contains_explicit_sensitive_context_value(value)
            || normalized_key.len() > MAX_DURABLE_SUBAGENT_CONTEXT_KEY_BYTES
            || value.len() > MAX_DURABLE_SUBAGENT_CONTEXT_VALUE_BYTES
            || durable.len() >= MAX_DURABLE_SUBAGENT_CONTEXT_ENTRIES
            || total_bytes.saturating_add(normalized_key.len() + value.len())
                > MAX_DURABLE_SUBAGENT_CONTEXT_TOTAL_BYTES
        {
            continue;
        }
        total_bytes += normalized_key.len() + value.len();
        durable.insert(normalized_key.to_string(), value.clone());
    }
    durable
}

fn background_subagent_launch_matches(
    existing: &SubagentTaskRecord,
    expected: &SubagentTaskRecord,
) -> bool {
    existing.task_id == expected.task_id
        && existing.parent_session_id == expected.parent_session_id
        && existing.objective == expected.objective
        && existing.execution_mode == expected.execution_mode
        && existing.context_mode == expected.context_mode
        && existing.delivery_replay_safety == expected.delivery_replay_safety
        && existing.launch_spec == expected.launch_spec
        && existing.launch_authority == expected.launch_authority
}

fn format_persisted_background_subagent_delivery_text(
    task: &SubagentTaskRecord,
    agent_type: &str,
) -> String {
    match task.status {
        SubagentTaskStatus::Completed => format!(
            "Background subagent '{}' (background_task_id='{}') completed successfully:\n<result>\n{}\n</result>",
            agent_type,
            task.task_id,
            task.result.as_deref().unwrap_or_default()
        ),
        SubagentTaskStatus::Cancelled => format!(
            "Background subagent '{}' (background_task_id='{}') was cancelled.\nReason: {}",
            agent_type,
            task.task_id,
            task.failure.as_deref().unwrap_or("cancelled")
        ),
        _ => format!(
            "Background subagent '{}' (background_task_id='{}') failed before producing a final result.\nError: {}",
            agent_type,
            task.task_id,
            task.failure.as_deref().unwrap_or("unknown failure")
        ),
    }
}

fn build_subagent_session_relationship(
    parent_info: Option<&SubagentParentInfo>,
    agent_type: &str,
) -> SessionRelationship {
    SessionRelationship {
        kind: Some(SessionRelationshipKind::Subagent),
        parent_session_id: parent_info.map(|info| info.session_id.clone()),
        parent_request_id: None,
        parent_dialog_turn_id: parent_info.map(|info| info.dialog_turn_id.clone()),
        parent_turn_index: None,
        parent_tool_call_id: parent_info.map(|info| info.tool_call_id.clone()),
        subagent_type: Some(agent_type.to_string()),
    }
}

fn build_btw_session_relationship(
    parent_session_id: &str,
    parent_request_id: &str,
) -> SessionRelationship {
    SessionRelationship {
        kind: Some(SessionRelationshipKind::Btw),
        parent_session_id: Some(parent_session_id.to_string()),
        parent_request_id: Some(parent_request_id.to_string()),
        parent_dialog_turn_id: None,
        parent_turn_index: None,
        parent_tool_call_id: None,
        subagent_type: None,
    }
}

fn validate_btw_child_session(parent_session: &Session, child_session: &Session) -> VoidResult<()> {
    if child_session.kind != SessionKind::EphemeralChild {
        return Err(VoidError::Validation(format!(
            "Session {} is not a BTW child session",
            child_session.session_id
        )));
    }
    let expected_created_by = format!("session-{}", parent_session.session_id);
    if child_session.created_by.as_deref() != Some(expected_created_by.as_str()) {
        return Err(VoidError::Validation(format!(
            "BTW child {} does not belong to parent {}",
            child_session.session_id, parent_session.session_id
        )));
    }
    if child_session.config.workspace_path != parent_session.config.workspace_path {
        return Err(VoidError::Validation(format!(
            "BTW child {} does not belong to the parent workspace",
            child_session.session_id
        )));
    }
    Ok(())
}

fn fork_subagent_system_reminder() -> String {
    "<system_reminder>You are now running as a forked subagent. Messages before this reminder were inherited from the parent agent as context. Messages after this reminder are the request for you. Do not call the Task tool to launch another subagent. Use the tools available to complete the task directly.</system_reminder>".to_string()
}

fn runtime_tool_restrictions_for_delegation_policy(
    delegation_policy: DelegationPolicy,
) -> ToolRuntimeRestrictions {
    let mut restrictions = ToolRuntimeRestrictions::default();
    if !delegation_policy.allows_task_spawn() {
        restrictions.denied_tool_names.insert("Task".to_string());
        restrictions.denied_tool_messages.insert(
            "Task".to_string(),
            "This agent has reached its delegated Task depth. Complete the assigned work directly."
                .to_string(),
        );
    }
    if !delegation_policy.allows_team_orchestration() {
        restrictions
            .denied_tool_names
            .insert(TEAM_TOOL_NAME.to_string());
        restrictions.denied_tool_messages.insert(
            TEAM_TOOL_NAME.to_string(),
            "Only the parent Team lead may orchestrate the Team runtime.".to_string(),
        );
    }
    restrictions
}

fn resolve_child_delegation_policy(
    requested: DelegationPolicy,
    context: &mut HashMap<String, String>,
    parent_info: &SubagentParentInfo,
    has_typed_team_member_authority: bool,
) -> DelegationPolicy {
    match requested.tier() {
        DelegationTier::TeamMember if !has_typed_team_member_authority => {
            return DelegationPolicy::ordinary_child(requested.nesting_depth.max(1));
        }
        DelegationTier::TeamMember | DelegationTier::OrdinaryChild
            if requested.nesting_depth == 1 && has_typed_team_member_authority =>
        {
            context
                .entry(TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY.to_string())
                .or_insert_with(|| parent_info.session_id.clone());
            return DelegationPolicy::team_member();
        }
        _ => {}
    }
    requested
}

fn team_lineage_from_context(
    context: &HashMap<String, String>,
) -> Option<TeamDelegationLineageSnapshot> {
    let value = |key: &str| {
        context
            .get(key)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    };
    Some(TeamDelegationLineageSnapshot {
        team_definition_id: value("teamDefinitionId")?,
        team_definition_revision: value("teamDefinitionRevision")?,
        team_instance_id: value("teamInstanceId")?,
        team_run_id: value("teamRunId")?,
        member_run_id: value("memberRunId")?,
        member_id: value("teamMemberId")?,
        root_parent_session_id: value(TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY)?,
        parent_member_session_id: value(TEAM_DELEGATION_PARENT_MEMBER_SESSION_CONTEXT_KEY),
    })
}

fn launch_authority_for_request(
    policy: DelegationPolicy,
    context: &HashMap<String, String>,
    parent_info: &SubagentParentInfo,
    team_budget: Option<TeamDelegationBudget>,
) -> VoidResult<SubagentLaunchAuthority> {
    let (kind, max_nesting_depth, task_spawn_budget, max_parallel_workers, team_lineage) =
        match policy.tier() {
            DelegationTier::TeamMember => (
                SubagentLaunchAuthorityKind::TeamMember,
                2,
                u16::from(team_budget.map_or(0, |budget| budget.max_worker_tasks)),
                u16::from(team_budget.map_or(0, |budget| budget.max_parallel_workers)),
                team_lineage_from_context(context),
            ),
            DelegationTier::TeamWorker => (
                SubagentLaunchAuthorityKind::TeamWorker,
                2,
                0,
                0,
                team_lineage_from_context(context),
            ),
            DelegationTier::TopLevel | DelegationTier::OrdinaryChild => (
                SubagentLaunchAuthorityKind::OrdinaryChild,
                policy.nesting_depth.max(1),
                0,
                0,
                None,
            ),
        };
    let authority = SubagentLaunchAuthority {
        schema_version: SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
        kind,
        delegation_request_id: parent_info.tool_call_id.clone(),
        nesting_depth: policy.nesting_depth,
        max_nesting_depth,
        task_spawn_budget,
        max_parallel_workers,
        team_lineage,
    };
    authority
        .validate()
        .map_err(|error| VoidError::Validation(error.to_string()))?;
    match authority.kind {
        SubagentLaunchAuthorityKind::TeamMember
            if authority.team_lineage.as_ref().is_some_and(|lineage| {
                lineage.root_parent_session_id != parent_info.session_id
            }) =>
        {
            return Err(VoidError::Validation(
                "Team member authority is bound to a different root session".to_string(),
            ));
        }
        SubagentLaunchAuthorityKind::TeamWorker
            if authority.team_lineage.as_ref().is_some_and(|lineage| {
                lineage.parent_member_session_id.as_deref() != Some(parent_info.session_id.as_str())
            }) =>
        {
            return Err(VoidError::Validation(
                "Team worker authority is bound to a different member session".to_string(),
            ));
        }
        _ => {}
    }
    Ok(authority)
}

fn delegation_policy_from_task(task: &SubagentTaskRecord) -> DelegationPolicy {
    if let Some(authority) = task.launch_authority.as_ref() {
        if authority.validate().is_err() {
            return DelegationPolicy::ordinary_child(authority.nesting_depth.max(1));
        }
        return match authority.kind {
            SubagentLaunchAuthorityKind::TeamMember => DelegationPolicy::team_member(),
            SubagentLaunchAuthorityKind::TeamWorker => DelegationPolicy::team_worker(),
            SubagentLaunchAuthorityKind::OrdinaryChild => {
                DelegationPolicy::ordinary_child(authority.nesting_depth)
            }
        };
    }
    let launch_spec = task.launch_spec.as_ref();
    DelegationPolicy {
        allow_subagent_spawn: launch_spec.is_some_and(|launch| launch.allow_subagent_spawn),
        nesting_depth: launch_spec.map_or(1, |launch| launch.nesting_depth),
    }
}

fn team_member_authority_matches_worker(
    candidate: &SubagentLaunchAuthority,
    worker_lineage: &TeamDelegationLineageSnapshot,
) -> bool {
    candidate.kind == SubagentLaunchAuthorityKind::TeamMember
        && candidate.validate().is_ok()
        && candidate.team_lineage.as_ref().is_some_and(|member| {
            member.team_definition_id == worker_lineage.team_definition_id
                && member.team_definition_revision == worker_lineage.team_definition_revision
                && member.team_instance_id == worker_lineage.team_instance_id
                && member.team_run_id == worker_lineage.team_run_id
                && member.member_run_id == worker_lineage.member_run_id
                && member.member_id == worker_lineage.member_id
                && member.root_parent_session_id == worker_lineage.root_parent_session_id
        })
}

fn team_worker_authority_matches_lineage(
    candidate: &SubagentLaunchAuthority,
    expected: &TeamDelegationLineageSnapshot,
) -> bool {
    candidate.kind == SubagentLaunchAuthorityKind::TeamWorker
        && candidate.team_lineage.as_ref() == Some(expected)
}

fn team_follow_up_child_is_busy(
    task_status: SubagentTaskStatus,
    child_state: &SessionState,
    has_active_execution: bool,
) -> bool {
    !task_status.is_terminal()
        || matches!(child_state, SessionState::Processing { .. })
        || has_active_execution
}

fn remove_active_subagent_execution_if_generation_matches(
    active_subagent_executions: &DashMap<String, ActiveSubagentExecution>,
    subagent_session_id: &str,
    subagent_dialog_turn_id: &str,
) -> bool {
    active_subagent_executions
        .remove_if(subagent_session_id, |_, active| {
            active.subagent_dialog_turn_id == subagent_dialog_turn_id
        })
        .is_some()
}

fn team_follow_up_dialog_turn_id(operation_id: &str) -> String {
    format!("team-message-{operation_id}")
}

fn should_spawn_team_follow_up(disposition: PreparedTurnDisposition) -> bool {
    disposition == PreparedTurnDisposition::Created
}

fn session_config_matches_resume_authority(
    restored: &SessionConfig,
    authoritative: &SessionConfig,
) -> bool {
    restored.max_context_tokens == authoritative.max_context_tokens
        && restored.auto_compact == authoritative.auto_compact
        && restored.enable_tools == authoritative.enable_tools
        && restored.safe_mode == authoritative.safe_mode
        && restored.max_turns == authoritative.max_turns
        && restored.enable_context_compression == authoritative.enable_context_compression
        && restored.compression_threshold == authoritative.compression_threshold
        && restored.workspace_path == authoritative.workspace_path
        && restored.workspace_id == authoritative.workspace_id
        && restored.remote_connection_id == authoritative.remote_connection_id
        && restored.remote_ssh_host == authoritative.remote_ssh_host
        && restored.model_id == authoritative.model_id
}

fn hidden_subagent_resume_session_matches(
    session: &Session,
    expected_agent_type: &str,
    authoritative_config: &SessionConfig,
    expected_created_by: Option<&str>,
) -> bool {
    session.kind == SessionKind::Subagent
        && session.agent_type == expected_agent_type
        && session.created_by.as_deref() == expected_created_by
        && session_config_matches_resume_authority(&session.config, authoritative_config)
}

fn resolved_subagent_resume_storage_path(
    session_config: &SessionConfig,
    binding: Option<&WorkspaceBinding>,
) -> VoidResult<PathBuf> {
    let logical_workspace_path = session_config.workspace_path.as_deref().ok_or_else(|| {
        VoidError::Validation(
            "resumed subagent session has no persisted workspace path".to_string(),
        )
    })?;
    let requires_remote_binding =
        session_config.remote_connection_id.is_some() || session_config.remote_ssh_host.is_some();
    match binding {
        Some(binding) if requires_remote_binding && !binding.is_remote() => {
            Err(VoidError::Validation(
                "remote subagent resume resolved to a local workspace binding".to_string(),
            ))
        }
        Some(binding) => Ok(binding.session_storage_path().to_path_buf()),
        None if requires_remote_binding => Err(VoidError::Validation(
            "remote subagent resume could not resolve its persisted workspace identity".to_string(),
        )),
        None => Ok(PathBuf::from(logical_workspace_path)),
    }
}

struct HiddenSubagentExecutionRequest {
    session_name: String,
    agent_type: String,
    session_config: SessionConfig,
    initial_messages: Vec<Message>,
    user_input_text: String,
    created_by: Option<String>,
    subagent_parent_info: Option<SubagentParentInfo>,
    context: HashMap<String, String>,
    delegation_policy: DelegationPolicy,
    runtime_tool_restrictions: ToolRuntimeRestrictions,
    prompt_cache_source_session_id: Option<String>,
    persistent_task: Option<PersistentSubagentTaskContext>,
    resume_session_id: Option<String>,
    requested_dialog_turn_id: Option<String>,
    prepared_turn: Option<PreparedPersistedTurn>,
    team_member_skill_policy: Option<TeamMemberSkillPolicySnapshot>,
}

#[derive(Clone)]
struct PersistentSubagentTaskContext {
    task_id: String,
    parent_session_id: String,
}

pub use void_runtime_ports::DialogTriggerSource;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssistantBootstrapSkipReason {
    BootstrapNotRequired,
    SessionHasExistingTurns,
    SessionNotIdle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssistantBootstrapBlockReason {
    ModelUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssistantBootstrapEnsureOutcome {
    Started {
        session_id: String,
        turn_id: String,
    },
    Skipped {
        session_id: String,
        reason: AssistantBootstrapSkipReason,
    },
    Blocked {
        session_id: String,
        reason: AssistantBootstrapBlockReason,
        detail: String,
    },
}

const ASSISTANT_BOOTSTRAP_AGENT_TYPE: &str = "Claw";

/// Cancel token cleanup guard
///
/// Automatically cleans up cancel tokens in ExecutionEngine when dropped
struct CancelTokenGuard {
    execution_engine: Arc<ExecutionEngine>,
    dialog_turn_id: String,
}

impl Drop for CancelTokenGuard {
    fn drop(&mut self) {
        let execution_engine = self.execution_engine.clone();
        let dialog_turn_id = self.dialog_turn_id.clone();

        tokio::spawn(async move {
            execution_engine.cleanup_cancel_token(&dialog_turn_id).await;
        });
    }
}

#[derive(Clone)]
struct ActiveSubagentExecution {
    parent_session_id: String,
    parent_dialog_turn_id: String,
    subagent_session_id: String,
    subagent_dialog_turn_id: String,
    cancel_token: CancellationToken,
    abort_handle: tokio::task::AbortHandle,
}

/// Ensures orphaned subagent work is stopped when the parent tool await is dropped.
struct SubagentExecutionScope {
    execution_engine: Arc<ExecutionEngine>,
    tool_pipeline: Arc<ToolPipeline>,
    session_manager: Arc<SessionManager>,
    active_subagent_executions: Arc<DashMap<String, ActiveSubagentExecution>>,
    subagent_session_id: String,
    subagent_dialog_turn_id: String,
    subagent_cancel_token: CancellationToken,
    abort_handle: tokio::task::AbortHandle,
    disarmed: bool,
}

impl SubagentExecutionScope {
    fn disarm(&mut self) {
        self.disarmed = true;
        remove_active_subagent_execution_if_generation_matches(
            self.active_subagent_executions.as_ref(),
            &self.subagent_session_id,
            &self.subagent_dialog_turn_id,
        );
    }
}

impl Drop for SubagentExecutionScope {
    fn drop(&mut self) {
        if self.disarmed {
            return;
        }

        warn!(
            "Subagent execution scope dropped without normal completion; stopping orphaned subagent: session_id={}, dialog_turn_id={}",
            self.subagent_session_id, self.subagent_dialog_turn_id
        );

        self.subagent_cancel_token.cancel();
        self.abort_handle.abort();
        remove_active_subagent_execution_if_generation_matches(
            self.active_subagent_executions.as_ref(),
            &self.subagent_session_id,
            &self.subagent_dialog_turn_id,
        );

        let execution_engine = self.execution_engine.clone();
        let tool_pipeline = self.tool_pipeline.clone();
        let session_manager = self.session_manager.clone();
        let subagent_session_id = self.subagent_session_id.clone();
        let subagent_dialog_turn_id = self.subagent_dialog_turn_id.clone();

        tokio::spawn(async move {
            if let Err(error) = execution_engine
                .cancel_dialog_turn(&subagent_dialog_turn_id)
                .await
            {
                warn!(
                    "Failed to cancel orphaned subagent dialog turn: session_id={}, dialog_turn_id={}, error={}",
                    subagent_session_id, subagent_dialog_turn_id, error
                );
            }

            if let Err(error) = tool_pipeline
                .cancel_dialog_turn_tools(&subagent_dialog_turn_id)
                .await
            {
                warn!(
                    "Failed to cancel orphaned subagent tools: session_id={}, dialog_turn_id={}, error={}",
                    subagent_session_id, subagent_dialog_turn_id, error
                );
            }

            session_manager
                .reset_session_state_if_processing(&subagent_session_id, &subagent_dialog_turn_id);
        });
    }
}

#[derive(Clone)]
struct SubagentConcurrencyLimiter {
    semaphore: Arc<Semaphore>,
    max_concurrency: usize,
}

struct SubagentConcurrencyPermitGuard {
    permits: Vec<(OwnedSemaphorePermit, SubagentConcurrencyLimiter)>,
    agent_type: String,
}

impl SubagentConcurrencyPermitGuard {
    fn new(
        permits: Vec<(OwnedSemaphorePermit, SubagentConcurrencyLimiter)>,
        agent_type: String,
    ) -> Self {
        Self {
            permits,
            agent_type,
        }
    }
}

impl Drop for SubagentConcurrencyPermitGuard {
    fn drop(&mut self) {
        for (permit, limiter) in std::mem::take(&mut self.permits) {
            drop(permit);

            let active_subagents = limiter
                .max_concurrency
                .saturating_sub(limiter.semaphore.available_permits());
            debug!(
                "Released subagent concurrency permit: agent_type={}, active_subagents={}, max_concurrency={}",
                self.agent_type, active_subagents, limiter.max_concurrency
            );
        }
    }
}

fn normalize_subagent_max_concurrency(raw: usize) -> usize {
    raw.clamp(1, MAX_SUBAGENT_MAX_CONCURRENCY)
}

/// Actions for dynamically adjusting a subagent's timeout.
#[derive(Debug, Clone)]
pub enum SubagentTimeoutAction {
    /// Disable timeout (run without limit).
    Disable,
    /// Restore timeout using the remaining time captured at disable.
    Restore,
    /// Extend timeout by specified seconds from now.
    Extend { seconds: u64 },
}

/// Shared handle for dynamically adjusting a subagent's timeout deadline.
pub(crate) struct SubagentTimeoutHandle {
    /// watch sender: None = no timeout, Some(instant) = deadline.
    deadline_tx: watch::Sender<Option<Instant>>,
    /// Session ID this handle belongs to.
    #[allow(dead_code)]
    session_id: String,
    /// Original timeout in seconds (for restore calculations).
    original_timeout_seconds: Option<u64>,
    /// Remaining seconds at the moment timeout was disabled.
    remaining_at_pause: std::sync::Mutex<Option<u64>>,
}

impl SubagentTimeoutHandle {
    fn disable_timeout(&self) {
        let remaining = match *self.deadline_tx.borrow() {
            Some(deadline) => {
                let now = Instant::now();
                if deadline > now {
                    deadline.duration_since(now).as_secs()
                } else {
                    0
                }
            }
            None => self.original_timeout_seconds.unwrap_or(0),
        };
        let _ = self.remaining_at_pause.lock().map(|mut guard| {
            *guard = Some(remaining);
        });
        let _ = self.deadline_tx.send(None);
    }

    fn restore_timeout(&self) {
        let remaining = self
            .remaining_at_pause
            .lock()
            .ok()
            .and_then(|guard| *guard)
            .unwrap_or_else(|| self.original_timeout_seconds.unwrap_or(0));
        let new_deadline = Instant::now() + Duration::from_secs(remaining);
        let _ = self.deadline_tx.send(Some(new_deadline));
        let _ = self.remaining_at_pause.lock().map(|mut guard| {
            *guard = None;
        });
    }

    fn extend_timeout(&self, seconds: u64) {
        let new_deadline = Instant::now() + Duration::from_secs(seconds);
        let _ = self.deadline_tx.send(Some(new_deadline));
        let _ = self.remaining_at_pause.lock().map(|mut guard| {
            *guard = None;
        });
    }

    fn apply_action(&self, action: SubagentTimeoutAction) {
        match action {
            SubagentTimeoutAction::Disable => self.disable_timeout(),
            SubagentTimeoutAction::Restore => self.restore_timeout(),
            SubagentTimeoutAction::Extend { seconds } => self.extend_timeout(seconds),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeamMemberRecoveryPreflightErrorCode {
    MissingLaunchSpec,
    InvalidLaunchSpec,
    ResumeFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamMemberRecoveryPreflightError {
    pub code: TeamMemberRecoveryPreflightErrorCode,
    pub detail: String,
}

impl TeamMemberRecoveryPreflightError {
    pub fn missing_launch(detail: impl Into<String>) -> Self {
        Self {
            code: TeamMemberRecoveryPreflightErrorCode::MissingLaunchSpec,
            detail: detail.into(),
        }
    }

    pub fn invalid_launch(detail: impl Into<String>) -> Self {
        Self {
            code: TeamMemberRecoveryPreflightErrorCode::InvalidLaunchSpec,
            detail: detail.into(),
        }
    }

    pub fn resume_failed(detail: impl Into<String>) -> Self {
        Self {
            code: TeamMemberRecoveryPreflightErrorCode::ResumeFailed,
            detail: detail.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamMemberRecoveryTicket {
    pub parent_session_id: String,
    pub task_id: String,
    pub child_session_id: String,
    pub objective: String,
    pub expected_launch: SubagentTaskLaunchSpec,
}

#[async_trait::async_trait]
pub trait TeamMemberRecoveryPreflight: Send + Sync {
    async fn preflight(
        &self,
        task: SubagentTaskRecord,
    ) -> Result<TeamMemberRecoveryTicket, TeamMemberRecoveryPreflightError>;
}

fn install_team_member_recovery_preflight(
    slot: &OnceLock<Arc<dyn TeamMemberRecoveryPreflight>>,
    preflight: Arc<dyn TeamMemberRecoveryPreflight>,
) -> VoidResult<()> {
    slot.set(preflight).map_err(|_| {
        VoidError::Validation("Team member recovery preflight is already installed".to_string())
    })
}

fn launch_requires_team_recovery_preflight(
    launch: &SubagentTaskLaunchSpec,
) -> Result<bool, &'static str> {
    let present_marker_count = TEAM_MEMBER_RECOVERY_CONTEXT_KEYS
        .iter()
        .filter(|key| launch.context.contains_key(**key))
        .count();
    let is_team_tagged = present_marker_count > 0 || launch.team_member_skill_policy.is_some();
    if !is_team_tagged {
        return Ok(false);
    }
    if present_marker_count != TEAM_MEMBER_RECOVERY_CONTEXT_KEYS.len()
        || TEAM_MEMBER_RECOVERY_CONTEXT_KEYS.iter().any(|key| {
            launch
                .context
                .get(*key)
                .map_or(true, |value| value.trim().is_empty())
        })
    {
        return Err("Team-tagged launch has incomplete durable Team markers");
    }
    Ok(true)
}

fn recovery_ticket_matches_task(
    ticket: &TeamMemberRecoveryTicket,
    task: &SubagentTaskRecord,
) -> bool {
    task.status == SubagentTaskStatus::Interrupted
        && task.recovery_state == SubagentTaskRecoveryState::Queued
        && task.parent_session_id == ticket.parent_session_id
        && task.task_id == ticket.task_id
        && task.child_session_id.as_deref() == Some(ticket.child_session_id.as_str())
        && task.objective == ticket.objective
        && task.launch_spec.as_ref() == Some(&ticket.expected_launch)
}

fn install_team_lead_persona_resolver(
    slot: &OnceLock<Arc<dyn TeamLeadPersonaResolver>>,
    resolver: Arc<dyn TeamLeadPersonaResolver>,
) -> VoidResult<()> {
    slot.set(resolver).map_err(|_| {
        VoidError::Validation("Team lead persona resolver is already installed".to_string())
    })
}

fn install_team_tool_executor(
    slot: &OnceLock<Arc<dyn TeamToolExecutor>>,
    executor: Arc<dyn TeamToolExecutor>,
) -> VoidResult<()> {
    slot.set(executor)
        .map_err(|_| VoidError::Validation("Team tool executor is already installed".to_string()))
}

async fn execute_team_tool_after_checkpoint(
    executor: &dyn TeamToolExecutor,
    invocation: TeamToolInvocation,
    checkpoint: VoidResult<PersistedToolCallAuthority>,
) -> VoidResult<TeamToolExecutionOutcome> {
    let authority = checkpoint?;
    if authority.tool_name != TEAM_TOOL_NAME
        || authority.round_id != invocation.parent_round_id
        || authority.input != invocation.exact_input
    {
        return Err(VoidError::Validation(
            "Persisted Team tool authority does not match the current invocation".to_string(),
        ));
    }
    executor.execute_team_tool(invocation).await
}

async fn execute_team_member_tool_after_checkpoint(
    executor: &dyn TeamToolExecutor,
    invocation: TeamMemberToolInvocation,
    checkpoint: VoidResult<PersistedToolCallAuthority>,
) -> VoidResult<TeamToolExecutionOutcome> {
    let authority = checkpoint?;
    if authority.tool_name != TEAM_MEMBER_TOOL_NAME
        || authority.round_id != invocation.round_id
        || authority.input != invocation.exact_input
    {
        return Err(VoidError::Validation(
            "Persisted TeamMember tool authority does not match the current invocation".to_string(),
        ));
    }
    executor.execute_team_member_tool(invocation).await
}

/// Conversation coordinator
pub struct ConversationCoordinator {
    session_manager: Arc<SessionManager>,
    execution_engine: Arc<ExecutionEngine>,
    tool_pipeline: Arc<ToolPipeline>,
    event_queue: Arc<EventQueue>,
    event_router: Arc<EventRouter>,
    subagent_concurrency_limiter: Arc<RwLock<Option<SubagentConcurrencyLimiter>>>,
    subagent_profile_concurrency_limiters: Arc<RwLock<HashMap<usize, SubagentConcurrencyLimiter>>>,
    /// Registry for dynamically adjusting subagent timeouts.
    subagent_timeout_registry: Arc<RwLock<HashMap<String, Arc<SubagentTimeoutHandle>>>>,
    /// Active subagent executions keyed by subagent session id.
    active_subagent_executions: Arc<DashMap<String, ActiveSubagentExecution>>,
    /// Serializes the small Team-member worker budget reservation boundary.
    delegation_budget_guard: Arc<Mutex<()>>,
    /// Notifies DialogScheduler of turn outcomes; injected after construction
    scheduler_notify_tx: OnceLock<mpsc::Sender<(String, TurnOutcome)>>,
    /// Round-boundary yield (same source as scheduler's yield flags); injected after construction
    round_preempt_source: OnceLock<Arc<dyn DialogRoundPreemptSource>>,
    /// Round-boundary user steering source (mid-turn user message injection); injected after construction
    round_injection_source: OnceLock<Arc<dyn DialogRoundInjectionSource>>,
    /// Platform composition hook for resolving a durable reusable Team lead.
    /// Installed once by the desktop composition root; absent resolvers fail
    /// closed for Team snapshots while leaving ordinary Agent personas intact.
    team_lead_persona_resolver: OnceLock<Arc<dyn TeamLeadPersonaResolver>>,
    /// Platform-owned Team runtime bridge. It is installed once, and is only
    /// called after the exact model-issued Team call is durably checkpointed.
    team_tool_executor: OnceLock<Arc<dyn TeamToolExecutor>>,
    /// Platform-owned validation bridge for durable Team member recovery.
    /// The generic coordinator never reads Team definitions or runtime stores.
    team_member_recovery_preflight: OnceLock<Arc<dyn TeamMemberRecoveryPreflight>>,
    /// In-flight dialog turn tracker per session, used to serialize cancel→start
    /// transitions so a new turn never starts touching the in-memory message
    /// list while the previous (cancelled) turn's spawn task is still draining.
    /// Map value is a counter shared between the coordinator and the spawn
    /// task; spawn task increments on entry and decrements on exit.
    active_turns_per_session: Arc<DashMap<String, Arc<AtomicUsize>>>,
}

impl ConversationCoordinator {
    async fn resolve_workspace_id_for_config(config: &SessionConfig) -> Option<String> {
        let explicit = config
            .workspace_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        if explicit.is_some() {
            return explicit;
        }

        let workspace_path = config.workspace_path.as_deref()?;
        let workspace_service = get_global_workspace_service()?;

        if config.remote_connection_id.is_some() || config.remote_ssh_host.is_some() {
            let normalized_path = normalize_remote_workspace_path(workspace_path);
            let desired_connection_id = config
                .remote_connection_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let desired_ssh_host = config
                .remote_ssh_host
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());

            return workspace_service
                .list_workspace_infos()
                .await
                .into_iter()
                .find(|workspace| {
                    if workspace.workspace_kind != WorkspaceKind::Remote {
                        return false;
                    }
                    if normalize_remote_workspace_path(&workspace.root_path.to_string_lossy())
                        != normalized_path
                    {
                        return false;
                    }
                    if let Some(connection_id) = desired_connection_id {
                        if workspace.remote_ssh_connection_id() != Some(connection_id) {
                            return false;
                        }
                    }
                    if let Some(ssh_host) = desired_ssh_host {
                        let workspace_ssh_host = workspace
                            .metadata
                            .get("sshHost")
                            .and_then(|value| value.as_str())
                            .map(str::trim)
                            .filter(|value| !value.is_empty());
                        if workspace_ssh_host != Some(ssh_host) {
                            return false;
                        }
                    }
                    true
                })
                .map(|workspace| workspace.id);
        }

        workspace_service
            .get_workspace_by_path(Path::new(workspace_path))
            .await
            .map(|workspace| workspace.id)
    }

    async fn track_session_workspace_activity_best_effort(config: &SessionConfig, reason: &str) {
        let Some(workspace_path) = config.workspace_path.as_ref() else {
            return;
        };

        let Some(workspace_service) = get_global_workspace_service() else {
            return;
        };

        let mut options = WorkspaceCreateOptions {
            auto_set_current: false,
            add_to_recent: true,
            ..Default::default()
        };

        if config.remote_connection_id.is_some() {
            options.workspace_kind = WorkspaceKind::Remote;
            options.remote_connection_id = config.remote_connection_id.clone();
            options.remote_ssh_host = config.remote_ssh_host.clone();
        }

        if let Err(error) = workspace_service
            .track_workspace_activity(PathBuf::from(workspace_path), options)
            .await
        {
            warn!(
                "Failed to track session workspace activity: reason={}, workspace_path={}, error={}",
                reason, workspace_path, error
            );
        }
    }

    /// Build a workspace binding that is remote-aware.
    /// If the global remote workspace is active and matches the session path,
    /// returns a `WorkspaceBinding` with remote metadata and correct local
    /// session storage path.
    ///
    /// When the session's `remote_connection_id` does not match any active
    /// SSH connection (e.g. the user changed the port and the old ID is now
    /// stale), this method attempts to remap to the current workspace
    /// registration so that historical sessions continue to work.
    async fn build_workspace_binding(config: &SessionConfig) -> Option<WorkspaceBinding> {
        let workspace_path = config.workspace_path.as_ref()?;
        let path_buf = PathBuf::from(workspace_path);
        let workspace_id = Self::resolve_workspace_id_for_config(config).await;

        let identity =
            crate::service::remote_ssh::workspace_state::resolve_workspace_session_identity(
                workspace_path,
                config.remote_connection_id.as_deref(),
                config.remote_ssh_host.as_deref(),
            )
            .await?;

        if let Some(rid) = identity.remote_connection_id.as_deref() {
            // Try to look up the connection by the session's stored ID first.
            let lookup =
                crate::service::remote_ssh::workspace_state::lookup_remote_connection_with_hint(
                    workspace_path,
                    Some(rid),
                )
                .await;

            // If the stored connection_id does not resolve to a registered
            // workspace, attempt a path-only lookup.  This covers the case
            // where the user changed the SSH port: the old connection_id is
            // no longer registered, but the same remote path is now bound to
            // a new connection with the updated port.
            let (effective_rid, entry) = if lookup.is_some() {
                (rid.to_string(), lookup)
            } else {
                let path_entry =
                    crate::service::remote_ssh::workspace_state::lookup_remote_connection(
                        workspace_path,
                    )
                    .await;
                if let Some(ref pe) = path_entry {
                    log::info!(
                        "Session connection_id {} not registered for workspace {}; remapping to {}",
                        rid,
                        workspace_path,
                        pe.connection_id
                    );
                    (pe.connection_id.clone(), path_entry)
                } else {
                    (rid.to_string(), lookup)
                }
            };

            let connection_name = entry
                .map(|e| e.connection_name)
                .unwrap_or_else(|| effective_rid.clone());

            // Re-resolve identity with the effective connection_id so the
            // session storage path is correct.
            let effective_identity =
                crate::service::remote_ssh::workspace_state::resolve_workspace_session_identity(
                    workspace_path,
                    Some(&effective_rid),
                    config.remote_ssh_host.as_deref(),
                )
                .await
                .unwrap_or(identity);

            let binding = WorkspaceBinding::new_remote(
                workspace_id.clone(),
                path_buf,
                effective_rid,
                connection_name,
                effective_identity,
            );

            return Some(binding);
        }

        let binding = WorkspaceBinding::new(workspace_id, path_buf);

        Some(binding)
    }

    async fn build_session_config_for_workspace(
        workspace_path: String,
        model_id: Option<String>,
    ) -> SessionConfig {
        let remote_entry =
            crate::service::remote_ssh::workspace_state::lookup_remote_connection(&workspace_path)
                .await;

        let mut config = SessionConfig {
            workspace_path: Some(workspace_path),
            model_id,
            ..SessionConfig::default()
        };

        if let Some(entry) = remote_entry {
            config.remote_connection_id = Some(entry.connection_id);
            if !entry.ssh_host.trim().is_empty() {
                config.remote_ssh_host = Some(entry.ssh_host);
            }
        }

        config
    }

    /// Build `WorkspaceServices` from a resolved `WorkspaceBinding`.
    /// For remote bindings, wires up SSH-backed FS/shell; for local ones,
    /// returns local implementations.
    async fn build_workspace_services(
        binding: &Option<WorkspaceBinding>,
    ) -> Option<crate::agentic::workspace::WorkspaceServices> {
        let binding = binding.as_ref()?;

        if binding.is_remote() {
            let manager =
                match crate::service::remote_ssh::workspace_state::get_remote_workspace_manager() {
                    Some(m) => m,
                    None => {
                        log::warn!(
                            "build_workspace_services: RemoteWorkspaceStateManager not initialized"
                        );
                        return None;
                    }
                };
            let ssh_manager = match manager.get_ssh_manager().await {
                Some(m) => m,
                None => {
                    log::warn!(
                        "build_workspace_services: SSH manager not available in state manager"
                    );
                    return None;
                }
            };
            let file_service = match manager.get_file_service().await {
                Some(f) => f,
                None => {
                    log::warn!(
                        "build_workspace_services: File service not available in state manager"
                    );
                    return None;
                }
            };
            let connection_id = match binding.connection_id() {
                Some(id) => id.to_string(),
                None => {
                    log::warn!("build_workspace_services: No connection_id in workspace binding");
                    return None;
                }
            };
            log::info!(
                "build_workspace_services: Built remote services for connection_id={}",
                connection_id
            );
            Some(crate::agentic::workspace::remote_workspace_services(
                connection_id,
                file_service,
                ssh_manager,
                binding.root_path_string(),
            ))
        } else {
            Some(crate::agentic::workspace::local_workspace_services(
                binding.root_path_string(),
            ))
        }
    }

    fn normalize_agent_type(agent_type: &str) -> String {
        if agent_type.trim().is_empty() {
            "agentic".to_string()
        } else {
            agent_type.trim().to_string()
        }
    }

    fn ensure_user_message_metadata_object(
        metadata: Option<serde_json::Value>,
    ) -> serde_json::Value {
        match metadata {
            Some(value) if value.is_object() => value,
            Some(value) => serde_json::json!({ "raw_metadata": value }),
            None => serde_json::json!({}),
        }
    }

    fn assistant_bootstrap_kickoff_query(is_chinese: bool) -> &'static str {
        if is_chinese {
            "请开始初始化"
        } else {
            "Please start bootstrap"
        }
    }

    async fn is_chinese_locale() -> bool {
        use crate::service::config::get_global_config_service;
        use crate::service::config::types::AppConfig;
        let Ok(config_service) = get_global_config_service().await else {
            return false;
        };
        let app: AppConfig = config_service
            .get_config(Some("app"))
            .await
            .unwrap_or_default();
        app.language.starts_with("zh")
    }

    fn assistant_bootstrap_system_reminder(
        kickoff_query: &str,
        expected_reply_language: &str,
    ) -> String {
        format!(
            "This is an automatic bootstrap kickoff generated by the system because this assistant workspace still contains BOOTSTRAP.md. \
Treat the user message `{kickoff_query}` only as a start signal, begin bootstrap immediately, and finish it in this session. \
Use {expected_reply_language} for all user-facing replies during bootstrap unless the user later asks to switch languages. \
Update the persona files and delete BOOTSTRAP.md as soon as bootstrap is complete."
        )
    }

    fn estimate_context_tokens(messages: &[Message]) -> usize {
        let mut cloned = messages.to_vec();
        cloned.iter_mut().map(|message| message.get_tokens()).sum()
    }

    fn manual_compaction_metadata() -> serde_json::Value {
        serde_json::json!({
            "kind": "manual_compaction",
            "command": MANUAL_COMPACTION_COMMAND,
        })
    }

    fn build_manual_compaction_round_completed(
        turn_id: &str,
        outcome: &ContextCompactionOutcome,
        context_window: usize,
        threshold: f32,
    ) -> crate::service::session::ModelRoundData {
        use crate::service::session::{ModelRoundData, ToolCallData, ToolItemData, ToolResultData};

        let completed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let started_at = completed_at.saturating_sub(outcome.duration_ms);

        ModelRoundData {
            id: format!("{}-manual-compaction-round", turn_id),
            turn_id: turn_id.to_string(),
            round_index: 0,
            timestamp: started_at,
            text_items: Vec::new(),
            tool_items: vec![ToolItemData {
                id: outcome.compression_id.clone(),
                tool_name: CONTEXT_COMPRESSION_TOOL_NAME.to_string(),
                tool_call: ToolCallData {
                    input: serde_json::json!({
                        "trigger": "manual",
                        "tokens_before": outcome.tokens_before,
                        "context_window": context_window,
                        "threshold": threshold,
                    }),
                    id: outcome.compression_id.clone(),
                },
                tool_result: Some(ToolResultData {
                    result: serde_json::json!({
                        "compression_count": outcome.compression_count,
                        "tokens_before": outcome.tokens_before,
                        "tokens_after": outcome.tokens_after,
                        "compression_ratio": outcome.compression_ratio,
                        "duration": outcome.duration_ms,
                        "applied": outcome.applied,
                        "has_summary": outcome.has_summary,
                        "summary_source": outcome.summary_source,
                    }),
                    success: true,
                    result_for_assistant: None,
                    error: None,
                    duration_ms: Some(outcome.duration_ms),
                }),
                ai_intent: None,
                start_time: started_at,
                end_time: Some(completed_at),
                duration_ms: Some(outcome.duration_ms),
                order_index: Some(0),
                is_subagent_item: None,
                parent_task_tool_id: None,
                subagent_session_id: None,
                subagent_model_id: None,
                subagent_model_alias: None,
                status: Some("completed".to_string()),
                interruption_reason: None,
                queue_wait_ms: None,
                preflight_ms: None,
                confirmation_wait_ms: None,
                execution_ms: Some(outcome.duration_ms),
            }],
            thinking_items: Vec::new(),
            start_time: started_at,
            end_time: Some(completed_at),
            duration_ms: Some(outcome.duration_ms),
            provider_id: None,
            model_id: None,
            model_alias: None,
            first_chunk_ms: None,
            first_visible_output_ms: None,
            stream_duration_ms: None,
            attempt_count: None,
            failure_category: None,
            token_details: None,
            status: "completed".to_string(),
        }
    }

    fn build_manual_compaction_round_failed(
        turn_id: &str,
        compression_id: String,
        error: &str,
        context_window: usize,
        threshold: f32,
    ) -> crate::service::session::ModelRoundData {
        use crate::service::session::{ModelRoundData, ToolCallData, ToolItemData, ToolResultData};

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        ModelRoundData {
            id: format!("{}-manual-compaction-round", turn_id),
            turn_id: turn_id.to_string(),
            round_index: 0,
            timestamp,
            text_items: Vec::new(),
            tool_items: vec![ToolItemData {
                id: compression_id.clone(),
                tool_name: CONTEXT_COMPRESSION_TOOL_NAME.to_string(),
                tool_call: ToolCallData {
                    input: serde_json::json!({
                        "trigger": "manual",
                        "context_window": context_window,
                        "threshold": threshold,
                        "summary_source": "none",
                    }),
                    id: compression_id,
                },
                tool_result: Some(ToolResultData {
                    result: serde_json::Value::Null,
                    success: false,
                    result_for_assistant: None,
                    error: Some(error.to_string()),
                    duration_ms: None,
                }),
                ai_intent: None,
                start_time: timestamp,
                end_time: Some(timestamp),
                duration_ms: Some(0),
                order_index: Some(0),
                is_subagent_item: None,
                parent_task_tool_id: None,
                subagent_session_id: None,
                subagent_model_id: None,
                subagent_model_alias: None,
                status: Some("error".to_string()),
                interruption_reason: None,
                queue_wait_ms: None,
                preflight_ms: None,
                confirmation_wait_ms: None,
                execution_ms: None,
            }],
            thinking_items: Vec::new(),
            start_time: timestamp,
            end_time: Some(timestamp),
            duration_ms: Some(0),
            provider_id: None,
            model_id: None,
            model_alias: None,
            first_chunk_ms: None,
            first_visible_output_ms: None,
            stream_duration_ms: None,
            attempt_count: None,
            failure_category: Some("context_compression".to_string()),
            token_details: None,
            status: "error".to_string(),
        }
    }

    pub fn new(
        session_manager: Arc<SessionManager>,
        execution_engine: Arc<ExecutionEngine>,
        tool_pipeline: Arc<ToolPipeline>,
        event_queue: Arc<EventQueue>,
        event_router: Arc<EventRouter>,
    ) -> Self {
        Self {
            session_manager,
            execution_engine,
            tool_pipeline,
            event_queue,
            event_router,
            subagent_concurrency_limiter: Arc::new(RwLock::new(None)),
            subagent_profile_concurrency_limiters: Arc::new(RwLock::new(HashMap::new())),
            subagent_timeout_registry: Arc::new(RwLock::new(HashMap::new())),
            active_subagent_executions: Arc::new(DashMap::new()),
            delegation_budget_guard: Arc::new(Mutex::new(())),
            scheduler_notify_tx: OnceLock::new(),
            round_preempt_source: OnceLock::new(),
            round_injection_source: OnceLock::new(),
            team_lead_persona_resolver: OnceLock::new(),
            team_tool_executor: OnceLock::new(),
            team_member_recovery_preflight: OnceLock::new(),
            active_turns_per_session: Arc::new(DashMap::new()),
        }
    }

    /// Inject the DialogScheduler notification channel after construction.
    /// Called once during app initialization after the scheduler is created.
    pub fn set_scheduler_notifier(&self, tx: mpsc::Sender<(String, TurnOutcome)>) {
        let _ = self.scheduler_notify_tx.set(tx);
    }

    /// Wire round-boundary preempt (typically the scheduler's [`SessionRoundYieldFlags`](crate::agentic::round_preempt::SessionRoundYieldFlags)).
    pub fn set_round_preempt_source(&self, source: Arc<dyn DialogRoundPreemptSource>) {
        let _ = self.round_preempt_source.set(source);
    }

    /// Wire round-boundary injection source (typically the scheduler's
    /// [`SessionRoundInjectionBuffer`](crate::agentic::round_preempt::SessionRoundInjectionBuffer)).
    pub fn set_round_injection_source(&self, source: Arc<dyn DialogRoundInjectionSource>) {
        let _ = self.round_injection_source.set(source);
    }

    /// Installs the platform Team lead resolver exactly once during startup.
    /// Repeated composition is an explicit error so a later caller cannot
    /// silently replace the authority used to validate immutable snapshots.
    pub fn set_team_lead_persona_resolver(
        &self,
        resolver: Arc<dyn TeamLeadPersonaResolver>,
    ) -> VoidResult<()> {
        install_team_lead_persona_resolver(&self.team_lead_persona_resolver, resolver)
    }

    /// Installs the platform Team executor exactly once. Replacing this bridge
    /// at runtime could change the meaning of a persisted tool call, so later
    /// installations fail closed.
    pub fn set_team_tool_executor(&self, executor: Arc<dyn TeamToolExecutor>) -> VoidResult<()> {
        install_team_tool_executor(&self.team_tool_executor, executor)
    }

    /// Installs the platform Team recovery authority exactly once. Replacing
    /// it could reinterpret persisted Team markers, so duplicate installation
    /// is an explicit startup failure.
    pub fn set_team_member_recovery_preflight(
        &self,
        preflight: Arc<dyn TeamMemberRecoveryPreflight>,
    ) -> VoidResult<()> {
        install_team_member_recovery_preflight(&self.team_member_recovery_preflight, preflight)
    }

    /// Execute an authoritative Team command. The strict durable checkpoint is
    /// completed before the platform executor can observe the invocation.
    pub async fn execute_team_tool(
        &self,
        invocation: TeamToolInvocation,
    ) -> VoidResult<TeamToolExecutionOutcome> {
        invocation.validate()?;
        let executor =
            self.team_tool_executor.get().cloned().ok_or_else(|| {
                VoidError::tool("Team runtime executor is not installed".to_string())
            })?;
        let checkpoint = self
            .session_manager
            .checkpoint_current_tool_call_before_execution(
                &invocation.parent_session_id,
                &invocation.parent_dialog_turn_id,
                &invocation.parent_round_id,
                TEAM_TOOL_NAME,
                &invocation.parent_tool_call_id,
                invocation.exact_input.clone(),
            )
            .await;
        execute_team_tool_after_checkpoint(executor.as_ref(), invocation, checkpoint).await
    }

    /// Execute an authoritative Team member completion after durably recording
    /// the exact model-issued tool call in that member's child session.
    pub async fn execute_team_member_tool(
        &self,
        invocation: TeamMemberToolInvocation,
    ) -> VoidResult<TeamToolExecutionOutcome> {
        invocation.validate()?;
        let executor =
            self.team_tool_executor.get().cloned().ok_or_else(|| {
                VoidError::tool("Team runtime executor is not installed".to_string())
            })?;
        let checkpoint = self
            .session_manager
            .checkpoint_current_tool_call_before_execution(
                &invocation.member_session_id,
                &invocation.dialog_turn_id,
                &invocation.round_id,
                TEAM_MEMBER_TOOL_NAME,
                &invocation.tool_call_id,
                invocation.exact_input.clone(),
            )
            .await;
        execute_team_member_tool_after_checkpoint(executor.as_ref(), invocation, checkpoint).await
    }

    /// Dynamically adjust a running subagent's timeout.
    pub async fn set_subagent_timeout(
        &self,
        session_id: &str,
        action: SubagentTimeoutAction,
    ) -> VoidResult<()> {
        let registry = self.subagent_timeout_registry.read().await;
        let handle = registry.get(session_id).cloned().ok_or_else(|| {
            VoidError::tool(format!(
                "No active subagent timeout handle for session {}",
                session_id
            ))
        })?;
        drop(registry);
        handle.apply_action(action.clone());
        info!(
            "Subagent timeout adjusted: session_id={}, action={:?}",
            session_id,
            std::mem::discriminant(&action)
        );
        Ok(())
    }

    /// Create a new session
    pub async fn create_session(
        &self,
        session_name: String,
        agent_type: String,
        config: SessionConfig,
    ) -> VoidResult<Session> {
        let workspace_path = config.workspace_path.clone().ok_or_else(|| {
            VoidError::Validation("workspace_path is required when creating a session".to_string())
        })?;
        self.create_session_with_workspace_and_creator(
            None,
            session_name,
            agent_type,
            config,
            workspace_path,
            None,
        )
        .await
    }

    /// Create a new session with optional session ID
    pub async fn create_session_with_id(
        &self,
        session_id: Option<String>,
        session_name: String,
        agent_type: String,
        config: SessionConfig,
    ) -> VoidResult<Session> {
        let workspace_path = config.workspace_path.clone().ok_or_else(|| {
            VoidError::Validation("workspace_path is required when creating a session".to_string())
        })?;
        self.create_session_with_workspace_and_creator(
            session_id,
            session_name,
            agent_type,
            config,
            workspace_path,
            None,
        )
        .await
    }

    /// Create a new session with optional session ID and workspace binding.
    /// `workspace_path` is forwarded in the `SessionCreated` event and also stored
    /// in the session's in-memory config so it can be retrieved without disk access.
    pub async fn create_session_with_workspace(
        &self,
        session_id: Option<String>,
        session_name: String,
        agent_type: String,
        config: SessionConfig,
        workspace_path: String,
    ) -> VoidResult<Session> {
        self.create_session_with_workspace_and_creator(
            session_id,
            session_name,
            agent_type,
            config,
            workspace_path,
            None,
        )
        .await
    }

    pub async fn update_session_model(&self, session_id: &str, model_id: &str) -> VoidResult<()> {
        let normalized_model_id = model_id.trim();
        let normalized_model_id = if normalized_model_id.is_empty() {
            "auto"
        } else {
            normalized_model_id
        };

        self.session_manager
            .update_session_model_id(session_id, normalized_model_id)
            .await?;

        info!(
            "Coordinator updated session model: session_id={}, model_id={}",
            session_id, normalized_model_id
        );

        Ok(())
    }

    /// Create a new session with explicit creator identity.
    pub async fn create_session_with_workspace_and_creator(
        &self,
        session_id: Option<String>,
        session_name: String,
        agent_type: String,
        mut config: SessionConfig,
        workspace_path: String,
        created_by: Option<String>,
    ) -> VoidResult<Session> {
        // Persist the workspace binding inside the session config so execution can
        // consistently restore the correct workspace regardless of the entry point.
        config.workspace_path = Some(workspace_path.clone());
        config.workspace_id = Self::resolve_workspace_id_for_config(&config).await;
        let agent_type = Self::normalize_agent_type(&agent_type);
        let session = self
            .session_manager
            .create_session_with_id_and_creator(
                session_id,
                session_name,
                agent_type,
                config,
                created_by,
            )
            .await?;

        Self::track_session_workspace_activity_best_effort(&session.config, "session_created")
            .await;

        // SessionManager::create_session_with_id_and_creator already persists the
        // session into the effective workspace session storage path. Avoid writing
        // a second copy here using the raw workspace path, because remote workspaces
        // resolve to a different effective storage path and double-writing can leave
        // metadata/turn files split across two locations.

        self.emit_event(AgenticEvent::SessionCreated {
            session_id: session.session_id.clone(),
            session_name: session.session_name.clone(),
            agent_type: session.agent_type.clone(),
            workspace_path: Some(workspace_path),
        })
        .await;
        Ok(session)
    }

    /// Create a hidden internal subagent session that is persisted but excluded
    /// from normal user-facing session lists.
    pub async fn create_hidden_subagent_session_with_workspace(
        &self,
        session_id: Option<String>,
        session_name: String,
        agent_type: String,
        mut config: SessionConfig,
        workspace_path: String,
        created_by: Option<String>,
    ) -> VoidResult<Session> {
        config.workspace_path = Some(workspace_path);
        config.workspace_id = Self::resolve_workspace_id_for_config(&config).await;
        let agent_type = Self::normalize_agent_type(&agent_type);
        self.create_hidden_subagent_session(
            session_id,
            session_name,
            agent_type,
            config,
            created_by,
        )
        .await
    }

    /// Ensure the completed/failed/cancelled turn is persisted to the workspace
    /// session storage. If the frontend already saved a richer version
    /// during streaming, we only update the final status; otherwise we create
    /// a minimal record with the user message so the turn is never lost.
    /// Safety-net persistence: only creates a minimal record when the frontend
    /// has not saved anything yet.  The frontend's PersistenceModule is the
    /// authoritative writer for turn content (model rounds, text, tools, etc.)
    /// and final status.  This function must NOT overwrite frontend-managed
    /// data, because the spawned task always runs before the frontend receives
    /// the DialogTurnCompleted event via the transport layer, and the existing
    /// disk data from debounced saves may have incomplete model rounds.
    async fn finalize_turn_in_workspace(
        session_id: &str,
        turn_id: &str,
        turn_index: usize,
        agent_type: &str,
        user_input: &str,
        workspace_path: &str,
        // Pre-resolved on-disk session storage path (mirror dir for remote workspaces).
        // When present we use it directly so we never re-resolve without remote SSH info
        // (which would slugify a raw remote POSIX path under `~/.void/projects/`).
        resolved_session_storage_path: Option<&std::path::Path>,
        status: crate::service::session::TurnStatus,
        user_message_metadata: Option<serde_json::Value>,
    ) {
        use crate::agentic::persistence::PersistenceManager;
        use crate::infrastructure::PathManager;
        use crate::service::session::{
            DialogTurnData, SessionMetadata, SessionStatus, UserMessageData,
        };

        let path_manager = match PathManager::new() {
            Ok(pm) => std::sync::Arc::new(pm),
            Err(_) => return,
        };

        let workspace_path_buf = match resolved_session_storage_path {
            Some(p) => p.to_path_buf(),
            None => std::path::PathBuf::from(workspace_path),
        };
        let persistence_manager = match PersistenceManager::new(path_manager) {
            Ok(manager) => manager,
            Err(_) => return,
        };

        if let Ok(Some(_existing)) = persistence_manager
            .load_dialog_turn(&workspace_path_buf, session_id, turn_index)
            .await
        {
            return;
        }

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        if let Ok(None) = persistence_manager
            .load_session_metadata(&workspace_path_buf, session_id)
            .await
        {
            let metadata = SessionMetadata {
                session_id: session_id.to_string(),
                session_name: "Recovered Session".to_string(),
                agent_type: "agentic".to_string(),
                last_user_dialog_agent_type: None,
                last_submitted_agent_type: None,
                created_by: None,
                session_kind: SessionKind::Standard,
                model_name: "default".to_string(),
                created_at: now_ms,
                last_active_at: now_ms,
                turn_count: 0,
                message_count: 0,
                tool_call_count: 0,
                status: SessionStatus::Active,
                terminal_session_id: None,
                snapshot_session_id: None,
                tags: Vec::new(),
                custom_metadata: None,
                relationship: None,
                todos: None,
                deep_review_run_manifest: None,
                deep_review_cache: None,
                workspace_path: Some(workspace_path.to_string()),
                workspace_hostname: None,
                unread_completion: None,
                needs_user_attention: None,
            };
            if let Err(e) = persistence_manager
                .save_session_metadata(&workspace_path_buf, &metadata)
                .await
            {
                warn!(
                    "Failed to create fallback session metadata during turn finalization: session_id={}, error={}",
                    session_id, e
                );
                // Do not return: on read-only or transient IO errors we still try to persist the
                // minimal dialog turn so local/remote UI history is not silently empty.
            }
        }

        let mut turn_data = DialogTurnData::new(
            turn_id.to_string(),
            turn_index,
            session_id.to_string(),
            UserMessageData {
                id: format!("{}-user", turn_id),
                content: user_input.to_string(),
                timestamp: now_ms,
                metadata: user_message_metadata,
            },
        );
        turn_data.agent_type = Some(agent_type.to_string());
        turn_data.status = status;
        turn_data.end_time = Some(now_ms);
        turn_data.duration_ms = Some(now_ms.saturating_sub(turn_data.start_time));

        if let Err(e) = persistence_manager
            .save_dialog_turn(&workspace_path_buf, &turn_data)
            .await
        {
            warn!(
                "Failed to finalize turn in workspace: session_id={}, turn_index={}, error={}",
                session_id, turn_index, e
            );
        }
    }

    async fn persist_completed_dialog_turn(
        session_manager: &SessionManager,
        scheduler_notify_tx: Option<&mpsc::Sender<(String, TurnOutcome)>>,
        session_id: &str,
        turn_id: &str,
        execution_result: &ExecutionResult,
    ) -> (crate::service::session::TurnStatus, String) {
        let final_response = match &execution_result.final_message.content {
            MessageContent::Text(text) => text.clone(),
            MessageContent::Mixed { text, .. } => text.clone(),
            _ => String::new(),
        };

        info!(
            "Dialog turn completed: session={}, turn={}, rounds={}",
            session_id, turn_id, execution_result.total_rounds
        );

        if let Err(error) = session_manager
            .complete_dialog_turn(
                session_id,
                turn_id,
                final_response.clone(),
                &execution_result.new_messages,
                TurnStats {
                    total_rounds: execution_result.total_rounds,
                    total_tools: 0, // TODO: get from execution_result
                    total_tokens: 0,
                    duration_ms: 0,
                },
            )
            .await
        {
            error!(
                "Failed to complete dialog turn: session_id={}, turn_id={}, error={}",
                session_id, turn_id, error
            );
        }

        match session_manager
            .update_session_state_for_turn_if_processing(session_id, turn_id, SessionState::Idle)
            .await
        {
            Ok(true) => {}
            Ok(false) => {
                debug!(
                    "Skipped setting session Idle after completion for stale turn: session_id={}, turn_id={}",
                    session_id, turn_id
                );
            }
            Err(error) => {
                error!(
                    "Failed to set session state to Idle after completion: session_id={}, turn_id={}, error={}",
                    session_id, turn_id, error
                );
            }
        }

        if let Some(tx) = scheduler_notify_tx {
            if let Err(error) = tx.try_send((
                session_id.to_string(),
                TurnOutcome::Completed {
                    turn_id: turn_id.to_string(),
                    final_response: final_response.clone(),
                },
            )) {
                error!(
                    "Failed to notify scheduler of turn completion: session_id={}, turn_id={}, error={}",
                    session_id, turn_id, error
                );
            }
        }

        (
            crate::service::session::TurnStatus::Completed,
            final_response,
        )
    }

    async fn persist_cancelled_dialog_turn(
        event_queue: &EventQueue,
        session_manager: &SessionManager,
        scheduler_notify_tx: Option<&mpsc::Sender<(String, TurnOutcome)>>,
        session_id: &str,
        turn_id: &str,
    ) -> crate::service::session::TurnStatus {
        info!(
            "Dialog turn cancelled: session={}, turn={}",
            session_id, turn_id
        );

        // The execution engine only emits DialogTurnCancelled when cancellation is
        // detected between rounds. If cancellation interrupted streaming mid-round,
        // no event was emitted. Emit it here unconditionally; duplicates are harmless.
        if let Err(error) = event_queue
            .enqueue(
                AgenticEvent::DialogTurnCancelled {
                    session_id: session_id.to_string(),
                    turn_id: turn_id.to_string(),
                },
                Some(EventPriority::Critical),
            )
            .await
        {
            error!(
                "Failed to emit DialogTurnCancelled event: session_id={}, turn_id={}, error={}",
                session_id, turn_id, error
            );
        }

        if let Err(error) = session_manager
            .cancel_dialog_turn(session_id, turn_id)
            .await
        {
            error!(
                "Failed to cancel dialog turn in persistence: session_id={}, turn_id={}, error={}",
                session_id, turn_id, error
            );
        }

        match session_manager
            .update_session_state_for_turn_if_processing(session_id, turn_id, SessionState::Idle)
            .await
        {
            Ok(true) => {}
            Ok(false) => {
                debug!(
                    "Skipped setting session Idle after cancellation for stale turn: session_id={}, turn_id={}",
                    session_id, turn_id
                );
            }
            Err(error) => {
                error!(
                    "Failed to set session state to Idle after cancellation: session_id={}, turn_id={}, error={}",
                    session_id, turn_id, error
                );
            }
        }

        if let Some(tx) = scheduler_notify_tx {
            if let Err(error) = tx.try_send((
                session_id.to_string(),
                TurnOutcome::Cancelled {
                    turn_id: turn_id.to_string(),
                },
            )) {
                error!(
                    "Failed to notify scheduler of turn cancellation: session_id={}, turn_id={}, error={}",
                    session_id, turn_id, error
                );
            }
        }

        crate::service::session::TurnStatus::Cancelled
    }

    async fn persist_failed_dialog_turn(
        event_queue: &EventQueue,
        session_manager: &SessionManager,
        scheduler_notify_tx: Option<&mpsc::Sender<(String, TurnOutcome)>>,
        session_id: &str,
        turn_id: &str,
        error: &VoidError,
    ) -> crate::service::session::TurnStatus {
        let error_text = error.to_string();
        let recoverable = !matches!(error, VoidError::AIClient(_) | VoidError::Timeout(_));

        error!("Dialog turn execution failed: {}", error_text);

        if let Err(queue_error) = event_queue
            .enqueue(
                AgenticEvent::DialogTurnFailed {
                    session_id: session_id.to_string(),
                    turn_id: turn_id.to_string(),
                    error: error_text.clone(),
                    error_category: Some(error.error_category()),
                    error_detail: Some(error.error_detail()),
                },
                Some(EventPriority::Critical),
            )
            .await
        {
            error!(
                "Failed to emit DialogTurnFailed event: session_id={}, turn_id={}, error={}",
                session_id, turn_id, queue_error
            );
        }

        if let Err(persist_error) = session_manager
            .fail_dialog_turn(session_id, turn_id, error_text.clone())
            .await
        {
            error!(
                "Failed to mark dialog turn as failed: session_id={}, turn_id={}, error={}",
                session_id, turn_id, persist_error
            );
        }

        match session_manager
            .update_session_state_for_turn_if_processing(
                session_id,
                turn_id,
                SessionState::Error {
                    error: error_text.clone(),
                    recoverable,
                },
            )
            .await
        {
            Ok(true) => {}
            Ok(false) => {
                debug!(
                    "Skipped setting session Error after failure for stale turn: session_id={}, turn_id={}",
                    session_id, turn_id
                );
            }
            Err(state_error) => {
                error!(
                    "Failed to set session state to Error: session_id={}, turn_id={}, error={}",
                    session_id, turn_id, state_error
                );
            }
        }

        if let Some(tx) = scheduler_notify_tx {
            if let Err(notify_error) = tx.try_send((
                session_id.to_string(),
                TurnOutcome::Failed {
                    turn_id: turn_id.to_string(),
                    error: error_text,
                },
            )) {
                error!(
                    "Failed to notify scheduler of turn failure: session_id={}, turn_id={}, error={}",
                    session_id, turn_id, notify_error
                );
            }
        }

        crate::service::session::TurnStatus::Error
    }

    async fn finalize_persisted_turn_in_workspace_if_needed(
        session_manager: &SessionManager,
        session_id: &str,
        turn_id: &str,
        turn_index: usize,
        agent_type: &str,
        user_input: &str,
        workspace_path: Option<&str>,
        resolved_session_storage_path: Option<&std::path::Path>,
        status: Option<crate::service::session::TurnStatus>,
        user_message_metadata: Option<serde_json::Value>,
    ) {
        if !session_manager.should_persist_session_id(session_id) {
            return;
        }

        if let (Some(workspace_path), Some(status)) = (workspace_path, status) {
            Self::finalize_turn_in_workspace(
                session_id,
                turn_id,
                turn_index,
                agent_type,
                user_input,
                workspace_path,
                resolved_session_storage_path,
                status,
                user_message_metadata,
            )
            .await;
        }
    }

    /// Create a hidden subagent session for internal AI execution.
    /// Unlike `create_session`, this does NOT emit `SessionCreated` to the transport layer,
    /// because hidden child sessions are internal implementation details of the execution engine
    /// and must never appear as top-level items in the UI.
    async fn create_hidden_subagent_session(
        &self,
        session_id: Option<String>,
        session_name: String,
        agent_type: String,
        config: SessionConfig,
        created_by: Option<String>,
    ) -> VoidResult<Session> {
        self.session_manager
            .create_session_with_id_and_details(
                session_id,
                session_name,
                agent_type,
                config,
                created_by,
                SessionKind::Subagent,
            )
            .await
    }

    async fn load_session_context_messages(&self, session: &Session) -> VoidResult<Vec<Message>> {
        let session_id = &session.session_id;
        let mut context_messages = self
            .session_manager
            .get_context_messages(session_id)
            .await?;

        if context_messages.is_empty() && !session.dialog_turn_ids.is_empty() {
            if let Some(workspace_path) = session.config.workspace_path.as_deref() {
                match self
                    .session_manager
                    .restore_session(Path::new(workspace_path), session_id)
                    .await
                {
                    Ok(_) => {
                        context_messages = self
                            .session_manager
                            .get_context_messages(session_id)
                            .await?;
                    }
                    Err(e) => {
                        debug!(
                            "Failed to restore parent session context for fork capture: session_id={}, error={}",
                            session_id, e
                        );
                    }
                }
            }
        }

        Ok(context_messages)
    }

    async fn wrap_user_input(
        &self,
        agent_type: &str,
        previous_agent_type: Option<&str>,
        user_input: String,
        workspace: Option<&WorkspaceBinding>,
    ) -> VoidResult<String> {
        let agent_registry = get_agent_registry();
        if let Some(workspace) = workspace {
            agent_registry
                .load_custom_subagents(workspace.root_path())
                .await;
        }
        let current_agent = agent_registry
            .get_agent(agent_type, workspace.map(|binding| binding.root_path()))
            .ok_or_else(|| VoidError::NotFound(format!("Agent not found: {}", agent_type)))?;
        let system_reminder = current_agent
            .get_system_reminder(previous_agent_type, workspace)
            .await?;

        if has_prompt_markup(&user_input) {
            if system_reminder.is_empty() {
                Ok(user_input)
            } else {
                let mut envelope = PromptEnvelope::new();
                envelope.push_system_reminder(system_reminder);
                envelope.push_user_query(user_input);
                Ok(envelope.render())
            }
        } else {
            let mut envelope = PromptEnvelope::new();
            if !system_reminder.is_empty() {
                envelope.push_system_reminder(system_reminder);
            }
            envelope.push_user_query(user_input);
            Ok(envelope.render())
        }
    }

    pub async fn ensure_assistant_bootstrap(
        &self,
        session_id: String,
        workspace_path: String,
    ) -> VoidResult<AssistantBootstrapEnsureOutcome> {
        let workspace_root = PathBuf::from(&workspace_path);
        // Empty or partial assistant dirs may never have run create_assistant_workspace; fill only
        // missing persona stubs (never overwrite), while preserving completed bootstrap state.
        ensure_workspace_persona_files_for_prompt(&workspace_root).await?;
        let bootstrap_pending = is_workspace_bootstrap_pending(&workspace_root);
        if !bootstrap_pending {
            return Ok(AssistantBootstrapEnsureOutcome::Skipped {
                session_id,
                reason: AssistantBootstrapSkipReason::BootstrapNotRequired,
            });
        }

        let session = match self.session_manager.get_session(&session_id) {
            Some(session) => session,
            None => {
                self.session_manager
                    .restore_session(&workspace_root, &session_id)
                    .await?
            }
        };

        let turn_count = self.session_manager.get_turn_count(&session_id);

        if turn_count > 0 {
            return Ok(AssistantBootstrapEnsureOutcome::Skipped {
                session_id,
                reason: AssistantBootstrapSkipReason::SessionHasExistingTurns,
            });
        }

        if !matches!(session.state, SessionState::Idle) {
            return Ok(AssistantBootstrapEnsureOutcome::Skipped {
                session_id,
                reason: AssistantBootstrapSkipReason::SessionNotIdle,
            });
        }

        let is_chinese = Self::is_chinese_locale().await;
        let kickoff_query = Self::assistant_bootstrap_kickoff_query(is_chinese);
        let expected_reply_language = if is_chinese { "Chinese" } else { "English" };
        let workspace_binding = WorkspaceBinding::new(None, workspace_root.clone());
        let model_id = self
            .execution_engine
            .resolve_model_id_for_turn(
                &session,
                ASSISTANT_BOOTSTRAP_AGENT_TYPE,
                Some(&workspace_binding),
                kickoff_query,
                0,
            )
            .await?;

        let ai_client_factory =
            match crate::infrastructure::ai::get_global_ai_client_factory().await {
                Ok(factory) => factory,
                Err(error) => {
                    return Ok(AssistantBootstrapEnsureOutcome::Blocked {
                        session_id,
                        reason: AssistantBootstrapBlockReason::ModelUnavailable,
                        detail: format!("Failed to get AI client factory: {error}"),
                    });
                }
            };

        if let Err(error) = ai_client_factory.get_client_resolved(&model_id).await {
            return Ok(AssistantBootstrapEnsureOutcome::Blocked {
                session_id,
                reason: AssistantBootstrapBlockReason::ModelUnavailable,
                detail: format!("Failed to get AI client (model_id={model_id}): {error}"),
            });
        }

        let mut envelope = PromptEnvelope::new();
        envelope.push_system_reminder(Self::assistant_bootstrap_system_reminder(
            kickoff_query,
            expected_reply_language,
        ));
        envelope.push_user_query(kickoff_query.to_string());

        let turn_id = format!("assistant-bootstrap-{}", uuid::Uuid::new_v4());
        let metadata = serde_json::json!({
            "assistant_bootstrap": {
                "trigger": "lazy_auto",
                "system_generated": true,
                "workspace_path": workspace_path,
            }
        });

        self.start_dialog_turn_internal(
            session_id.clone(),
            envelope.render(),
            Some(kickoff_query.to_string()),
            None,
            Some(turn_id.clone()),
            ASSISTANT_BOOTSTRAP_AGENT_TYPE.to_string(),
            Some(workspace_root.to_string_lossy().to_string()),
            DialogSubmissionPolicy::for_source(DialogTriggerSource::DesktopApi)
                .with_skip_tool_confirmation(true),
            Some(metadata),
            true,
        )
        .await?;

        Ok(AssistantBootstrapEnsureOutcome::Started {
            session_id,
            turn_id,
        })
    }

    /// Start a new dialog turn
    /// Note: Events are sent to frontend via EventLoop, no Stream returned.
    /// Submission behavior is controlled by `submission_policy`, which provides
    /// default per-source behavior while still allowing selective overrides.
    #[allow(clippy::too_many_arguments)]
    pub async fn start_dialog_turn(
        &self,
        session_id: String,
        user_input: String,
        original_user_input: Option<String>,
        turn_id: Option<String>,
        agent_type: String,
        workspace_path: Option<String>,
        submission_policy: DialogSubmissionPolicy,
        user_message_metadata: Option<serde_json::Value>,
    ) -> VoidResult<()> {
        self.start_dialog_turn_internal(
            session_id,
            user_input,
            original_user_input,
            None,
            turn_id,
            agent_type,
            workspace_path,
            submission_policy,
            user_message_metadata,
            false,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn start_dialog_turn_with_image_contexts(
        &self,
        session_id: String,
        user_input: String,
        original_user_input: Option<String>,
        image_contexts: Vec<ImageContextData>,
        turn_id: Option<String>,
        agent_type: String,
        workspace_path: Option<String>,
        submission_policy: DialogSubmissionPolicy,
        user_message_metadata: Option<serde_json::Value>,
    ) -> VoidResult<()> {
        self.start_dialog_turn_internal(
            session_id,
            user_input,
            original_user_input,
            Some(image_contexts),
            turn_id,
            agent_type,
            workspace_path,
            submission_policy,
            user_message_metadata,
            false,
        )
        .await
    }

    async fn load_goal_mode(&self, session_id: &str) -> VoidResult<Option<GoalModeState>> {
        let session = self
            .session_manager
            .get_session(session_id)
            .ok_or_else(|| VoidError::NotFound(format!("Session not found: {session_id}")))?;
        let workspace_path = session.config.workspace_path.as_deref().ok_or_else(|| {
            VoidError::Validation(format!("Session workspace_path is missing: {session_id}"))
        })?;
        let metadata = self
            .session_manager
            .load_session_metadata(Path::new(workspace_path), session_id)
            .await?;
        Ok(goal_mode_from_custom_metadata(
            metadata
                .as_ref()
                .and_then(|value| value.custom_metadata.as_ref()),
        ))
    }

    async fn load_active_goal_mode(&self, session_id: &str) -> VoidResult<Option<GoalModeState>> {
        Ok(self
            .load_goal_mode(session_id)
            .await?
            .filter(GoalModeState::is_active))
    }

    /// Activate `/goal` mode for a session by synthesizing a goal from context.
    pub async fn activate_session_goal(
        &self,
        session_id: String,
        user_hint: Option<String>,
    ) -> VoidResult<GoalActivationResult> {
        let session = self
            .session_manager
            .get_session(&session_id)
            .ok_or_else(|| VoidError::NotFound(format!("Session not found: {session_id}")))?;

        if matches!(
            session.kind,
            SessionKind::Subagent | SessionKind::EphemeralChild
        ) {
            return Err(VoidError::Validation(
                "Goal mode is only available for main sessions".to_string(),
            ));
        }

        let context_messages = self
            .session_manager
            .get_context_messages(&session_id)
            .await?;
        let trimmed_hint = user_hint
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());

        let generation = generate_goal_from_context(&context_messages, trimmed_hint)
            .await
            .map_err(user_facing_goal_mode_error)?;
        let activation = build_goal_kickoff_messages(&generation, trimmed_hint);
        let activated_at_ms = now_ms();

        let state = GoalModeState {
            active: true,
            status: GoalModeStatus::Active,
            initial_goal: GoalModeInitialGoal::new(
                activation.goal_text.clone(),
                activation.success_criteria.clone(),
                trimmed_hint.map(str::to_string),
                activated_at_ms,
            ),
            goal_text: activation.goal_text.clone(),
            success_criteria: activation.success_criteria.clone(),
            user_hint: trimmed_hint.map(str::to_string),
            activated_at_ms,
            continuation_count: 0,
            token_budget: None,
            tokens_used: 0,
        };

        self.session_manager
            .merge_session_custom_metadata(&session_id, goal_mode_patch(&state))
            .await?;

        info!(
            "Session goal mode activated: session_id={}, goal={}",
            session_id, activation.goal_text
        );

        Ok(activation)
    }

    /// Update persisted `/goal` state without asking UI components to infer metadata shape.
    pub async fn update_session_goal(
        &self,
        session_id: String,
        action: GoalModeUpdateAction,
    ) -> VoidResult<GoalModeUpdateResult> {
        let session = self
            .session_manager
            .get_session(&session_id)
            .ok_or_else(|| VoidError::NotFound(format!("Session not found: {session_id}")))?;

        if matches!(
            session.kind,
            SessionKind::Subagent | SessionKind::EphemeralChild
        ) {
            return Err(VoidError::Validation(
                "Goal mode is only available for main sessions".to_string(),
            ));
        }

        let existing = self.load_goal_mode(&session_id).await?;
        let result = update_goal_mode_state(existing, action, now_ms())?;
        match result.state.as_ref() {
            Some(state) => {
                self.session_manager
                    .merge_session_custom_metadata(&session_id, goal_mode_patch(state))
                    .await?;
            }
            None => {
                self.session_manager
                    .merge_session_custom_metadata(&session_id, clear_goal_mode_patch())
                    .await?;
            }
        }

        info!(
            "Session goal mode updated: session_id={}, display_message={}",
            session_id, result.display_message
        );

        Ok(result)
    }

    /// Verify the active session goal after a dialog turn stops.
    pub async fn prepare_goal_continuation_after_turn(
        &self,
        session_id: &str,
        source_turn_id: &str,
        user_input: &str,
        user_message_metadata: Option<&serde_json::Value>,
        turn_observation: &str,
    ) -> VoidResult<Option<GoalContinuationPlan>> {
        if should_skip_goal_verification_for_turn(user_input, user_message_metadata) {
            return Ok(None);
        }

        let session = self
            .session_manager
            .get_session(session_id)
            .ok_or_else(|| VoidError::NotFound(format!("Session not found: {session_id}")))?;
        if matches!(
            session.kind,
            SessionKind::Subagent | SessionKind::EphemeralChild
        ) {
            return Ok(None);
        }

        let Some(mut goal_state) = self.load_active_goal_mode(session_id).await? else {
            return Ok(None);
        };

        if goal_state.continuation_count >= MAX_GOAL_CONTINUATIONS {
            warn!(
                "Session goal continuation limit reached; stopping auto-continue: session_id={}, goal={}",
                session_id, goal_state.goal_text
            );
            goal_state.active = false;
            goal_state.status = GoalModeStatus::Blocked;
            self.session_manager
                .merge_session_custom_metadata(session_id, goal_mode_patch(&goal_state))
                .await?;
            self.emit_event(AgenticEvent::GoalVerificationFinished {
                session_id: session_id.to_string(),
                source_turn_id: source_turn_id.to_string(),
                outcome: "limit_reached".to_string(),
            })
            .await;
            return Ok(None);
        }

        self.emit_event(AgenticEvent::GoalVerificationStarted {
            session_id: session_id.to_string(),
            source_turn_id: source_turn_id.to_string(),
        })
        .await;

        let context_messages = self
            .session_manager
            .get_context_messages(session_id)
            .await?;
        let context_messages = ensure_final_response_in_goal_context(
            context_messages,
            turn_observation,
            source_turn_id,
        );
        let verification = match verify_goal_achievement(&goal_state, &context_messages).await {
            Ok(result) => result,
            Err(error) => {
                self.emit_event(AgenticEvent::GoalVerificationFinished {
                    session_id: session_id.to_string(),
                    source_turn_id: source_turn_id.to_string(),
                    outcome: "failed".to_string(),
                })
                .await;
                return Err(user_facing_goal_mode_error(error));
            }
        };

        if verification.achieved {
            info!(
                "Session goal achieved: session_id={}, goal={}",
                session_id, goal_state.goal_text
            );
            goal_state.active = false;
            goal_state.status = GoalModeStatus::Complete;
            self.session_manager
                .merge_session_custom_metadata(session_id, goal_mode_patch(&goal_state))
                .await?;
            self.emit_event(AgenticEvent::GoalVerificationFinished {
                session_id: session_id.to_string(),
                source_turn_id: source_turn_id.to_string(),
                outcome: "achieved".to_string(),
            })
            .await;
            return Ok(None);
        }

        goal_state.continuation_count = goal_state.continuation_count.saturating_add(1);
        self.session_manager
            .merge_session_custom_metadata(session_id, goal_mode_patch(&goal_state))
            .await?;

        self.emit_event(AgenticEvent::GoalVerificationFinished {
            session_id: session_id.to_string(),
            source_turn_id: source_turn_id.to_string(),
            outcome: "continuing".to_string(),
        })
        .await;

        Ok(Some(build_goal_continuation_plan(
            &goal_state,
            &verification,
        )))
    }

    /// Compact the active session context as a persisted maintenance turn.
    pub async fn compact_session_manually(&self, session_id: String) -> VoidResult<()> {
        let session = self
            .session_manager
            .get_session(&session_id)
            .ok_or_else(|| VoidError::NotFound(format!("Session not found: {}", session_id)))?;

        match &session.state {
            SessionState::Idle => {}
            SessionState::Processing {
                current_turn_id,
                phase,
            } => {
                return Err(VoidError::Validation(format!(
                    "Session is still processing: current_turn_id={}, phase={:?}",
                    current_turn_id, phase
                )));
            }
            SessionState::Error { error, .. } => {
                return Err(VoidError::Validation(format!(
                    "Session must be idle before manual compaction: {}",
                    error
                )));
            }
        }

        let context_messages = self
            .session_manager
            .get_context_messages(&session_id)
            .await?;
        let needs_restore = if context_messages.is_empty() {
            true
        } else {
            context_messages.len() == 1 && !session.dialog_turn_ids.is_empty()
        };

        if needs_restore {
            let workspace_path = session.config.workspace_path.as_deref().ok_or_else(|| {
                VoidError::Validation(format!(
                    "workspace_path is required when restoring session: {}",
                    session_id
                ))
            })?;
            self.session_manager
                .restore_session(Path::new(workspace_path), &session_id)
                .await?;
        }

        let context_messages = self
            .session_manager
            .get_context_messages(&session_id)
            .await?;
        let turn_index = self.session_manager.get_turn_count(&session_id);
        let user_message_metadata = Some(Self::manual_compaction_metadata());
        let turn_id = self
            .session_manager
            .start_maintenance_turn(
                &session_id,
                MANUAL_COMPACTION_COMMAND.to_string(),
                None,
                user_message_metadata.clone(),
            )
            .await?;

        self.emit_event(AgenticEvent::DialogTurnStarted {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            turn_index,
            user_input: MANUAL_COMPACTION_COMMAND.to_string(),
            original_user_input: None,
            user_message_metadata: user_message_metadata.clone(),
        })
        .await;

        let current_tokens = Self::estimate_context_tokens(&context_messages);
        let manual_workspace = Self::build_workspace_binding(&session.config).await;
        let manual_workspace_services = Self::build_workspace_services(&manual_workspace).await;
        let manual_execution_context = ExecutionContext {
            session_id: session_id.clone(),
            dialog_turn_id: turn_id.clone(),
            turn_index,
            agent_type: session.agent_type.clone(),
            workspace: manual_workspace,
            context: HashMap::new(),
            subagent_parent_info: None,
            delegation_policy: DelegationPolicy::top_level(),
            skip_tool_confirmation: true,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services: manual_workspace_services,
            round_preempt: None,
            round_injection: None,
            recover_partial_on_cancel: false,
            persona_runtime: None,
            team_member_skill_policy: None,
        };
        let session_max_tokens = session.config.max_context_tokens;

        // Unify context_window: min(model capability, session config)
        let model_context_window =
            match crate::infrastructure::ai::get_global_ai_client_factory().await {
                Ok(factory) => {
                    let model_id = session.config.model_id.as_deref().unwrap_or("default");
                    match factory.get_client_resolved(model_id).await {
                        Ok(client) => Some(client.config.context_window as usize),
                        Err(_) => None,
                    }
                }
                Err(_) => None,
            };
        let context_window = match model_context_window {
            Some(mcw) => mcw.min(session_max_tokens),
            None => session_max_tokens,
        };
        let compression_threshold = session.config.compression_threshold;

        match self
            .execution_engine
            .compact_session_context(
                session_id.clone(),
                turn_id.clone(),
                manual_execution_context,
                context_messages,
                current_tokens,
                "manual",
            )
            .await
        {
            Ok(outcome) => {
                let model_round = Self::build_manual_compaction_round_completed(
                    &turn_id,
                    &outcome,
                    context_window,
                    compression_threshold,
                );
                self.session_manager
                    .complete_maintenance_turn(
                        &session_id,
                        &turn_id,
                        vec![model_round],
                        outcome.duration_ms,
                    )
                    .await?;
                self.session_manager
                    .update_session_state(&session_id, SessionState::Idle)
                    .await?;

                self.emit_event(AgenticEvent::DialogTurnCompleted {
                    session_id,
                    turn_id,
                    total_rounds: 1,
                    total_tools: 1,
                    duration_ms: outcome.duration_ms,
                    partial_recovery_reason: None,
                    success: Some(true),
                    finish_reason: Some("complete".to_string()),
                })
                .await;

                Ok(())
            }
            Err(err) => {
                let error_text = err.to_string();
                let compression_id = format!("compression_{}", uuid::Uuid::new_v4());
                let model_round = Self::build_manual_compaction_round_failed(
                    &turn_id,
                    compression_id,
                    &error_text,
                    context_window,
                    compression_threshold,
                );
                let _ = self
                    .session_manager
                    .fail_maintenance_turn(
                        &session_id,
                        &turn_id,
                        error_text.clone(),
                        vec![model_round],
                    )
                    .await;
                let _ = self
                    .session_manager
                    .update_session_state(&session_id, SessionState::Idle)
                    .await;
                self.emit_event(AgenticEvent::DialogTurnFailed {
                    session_id,
                    turn_id,
                    error: error_text.clone(),
                    error_category: Some(err.error_category()),
                    error_detail: Some(err.error_detail()),
                })
                .await;
                Err(err)
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn start_dialog_turn_internal(
        &self,
        session_id: String,
        user_input: String,
        original_user_input: Option<String>,
        image_contexts: Option<Vec<ImageContextData>>,
        turn_id: Option<String>,
        agent_type: String,
        workspace_path: Option<String>,
        submission_policy: DialogSubmissionPolicy,
        extra_user_message_metadata: Option<serde_json::Value>,
        suppress_session_title_generation: bool,
    ) -> VoidResult<()> {
        // Get latest session, restoring from persistence on demand so every entry
        // point can use the same start_dialog_turn flow.
        let session = match self.session_manager.get_session(&session_id) {
            Some(session) => session,
            None => {
                debug!(
                    "Session not found in memory, attempting restore before starting dialog: session_id={}",
                    session_id
                );
                let workspace_path = workspace_path.clone().ok_or_else(|| {
                    VoidError::Validation(format!(
                        "workspace_path is required when restoring session: {}",
                        session_id
                    ))
                })?;
                self.session_manager
                    .restore_session(Path::new(&workspace_path), &session_id)
                    .await?
            }
        };
        self.schedule_subagent_task_recovery_sweep(&session_id);

        let previous_agent_type = session.last_user_dialog_agent_type.clone();
        let requested_agent_type = agent_type.trim().to_string();
        let provisional_agent_type = if !requested_agent_type.is_empty() {
            requested_agent_type.clone()
        } else if !session.agent_type.is_empty() {
            session.agent_type.clone()
        } else {
            "agentic".to_string()
        };
        let effective_agent_type = Self::normalize_agent_type(&provisional_agent_type);

        Self::track_session_workspace_activity_best_effort(&session.config, "dialog_started").await;

        debug!(
            "Resolved dialog turn agent type: session_id={}, turn_id={}, requested_agent_type={}, session_agent_type={}, effective_agent_type={}, trigger_source={:?}, queue_priority={:?}, skip_tool_confirmation={}",
            session_id,
            turn_id.as_deref().unwrap_or(""),
            if requested_agent_type.is_empty() {
                "<empty>"
            } else {
                requested_agent_type.as_str()
            },
            if session.agent_type.is_empty() {
                "<empty>"
            } else {
                session.agent_type.as_str()
            },
            effective_agent_type,
            submission_policy.trigger_source,
            submission_policy.queue_priority,
            submission_policy.skip_tool_confirmation
        );

        if session.agent_type != effective_agent_type {
            self.session_manager
                .update_session_agent_type(&session_id, &effective_agent_type)
                .await?;
        }

        debug!(
            "Checking session state: session_id={}, state={:?}",
            session_id, session.state
        );

        // P0-8: Even when SessionState is Idle, a previously cancelled turn's
        // spawn task may still be draining (writing tail messages into the
        // in-memory context cache). Wait briefly for it to finish so the new
        // turn does not race with it. This is a no-op when no turn is in flight.
        let pending = self
            .wait_session_drained(&session_id, Duration::from_millis(800))
            .await;
        if pending > 0 {
            warn!(
                "Starting new dialog while previous turn still draining: session_id={}, pending={}",
                session_id, pending
            );
        }

        // Check session state
        // Allow Idle or any error state (user can retry after error)
        // If Processing, cancel request hasn't arrived yet, reject new dialog
        match &session.state {
            SessionState::Idle => {
                debug!(
                    "Session state is Idle, allowing new dialog: session_id={}",
                    session_id
                );
            }
            SessionState::Error { .. } => {
                debug!(
                    "Session in error state, allowing new dialog (user retry): session_id={}",
                    session_id
                );
            }
            SessionState::Processing {
                current_turn_id,
                phase,
            } => {
                warn!(
                    "Session still processing, rejecting new dialog: session_id={}, current_turn_id={}, phase={:?}",
                    session_id, current_turn_id, phase
                );
                return Err(VoidError::Validation(format!(
                    "Session state does not allow starting new dialog: {:?}",
                    session.state
                )));
            }
        }

        // Ensure session history is loaded into memory
        // Critical fix: prevent unloaded history after app restart
        let context_messages = self
            .session_manager
            .get_context_messages(&session_id)
            .await?;

        // Check if restore is needed:
        // - Empty context needs restore
        // - Only 1 message (likely just system prompt) with existing turns needs restore
        // - Sessions with multiple turns should have > 1 messages (at least system + user + assistant)
        let needs_restore = if context_messages.is_empty() {
            debug!(
                "Session {} context is empty, restoring from persistence",
                session_id
            );
            true
        } else if context_messages.len() == 1 && !session.dialog_turn_ids.is_empty() {
            debug!(
                "Session {} has {} turns but only {} messages, restoring history",
                session_id,
                session.dialog_turn_ids.len(),
                context_messages.len()
            );
            true
        } else {
            debug!(
                "Session {} context exists ({} messages, {} turns), no restore needed",
                session_id,
                context_messages.len(),
                session.dialog_turn_ids.len()
            );
            false
        };

        if needs_restore {
            debug!(
                "Starting session history restore: session_id={}",
                session_id
            );
            match self
                .session_manager
                .restore_session(
                    Path::new(
                        session
                            .config
                            .workspace_path
                            .as_deref()
                            .or(workspace_path.as_deref())
                            .ok_or_else(|| {
                                VoidError::Validation(format!(
                                    "workspace_path is required when restoring session: {}",
                                    session_id
                                ))
                            })?,
                    ),
                    &session_id,
                )
                .await
            {
                Ok(_) => {
                    let restored_messages = self
                        .session_manager
                        .get_context_messages(&session_id)
                        .await?;
                    info!(
                        "Session history restored from persistence: session_id={}, messages: {} -> {}",
                        session_id,
                        context_messages.len(),
                        restored_messages.len()
                    );
                }
                Err(e) => {
                    debug!(
                        "Failed to restore session history (may be new session): session_id={}, error={}",
                        session_id, e
                    );
                }
            }
        }

        let original_user_input = original_user_input.unwrap_or_else(|| user_input.clone());

        let mut user_message_metadata = extra_user_message_metadata;

        // Build image metadata for workspace turn persistence (before image_contexts is consumed)
        // Also stores original_text so the UI can display the user's actual input
        // instead of the vision-enhanced text.
        if let Some(imgs) = image_contexts.as_ref().filter(|imgs| !imgs.is_empty()) {
            let media_tool_images: Vec<MediaToolImageContext> = imgs
                .iter()
                .map(|img| {
                    let metadata = img.metadata.as_ref();
                    let name = metadata
                        .and_then(|m| m.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("image.png");
                    let file_size = metadata
                        .and_then(|m| m.get("file_size"))
                        .and_then(|v| v.as_u64())
                        .and_then(|value| usize::try_from(value).ok())
                        .unwrap_or(0);
                    let width = metadata
                        .and_then(|m| m.get("width"))
                        .and_then(|v| v.as_u64())
                        .and_then(|value| u32::try_from(value).ok());
                    let height = metadata
                        .and_then(|m| m.get("height"))
                        .and_then(|v| v.as_u64())
                        .and_then(|value| u32::try_from(value).ok());
                    let source = metadata
                        .and_then(|m| m.get("source"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("chat");

                    MediaToolImageContext {
                        id: img.id.clone(),
                        image_path: img.image_path.clone(),
                        data_url: img.data_url.clone(),
                        mime_type: img.mime_type.clone(),
                        image_name: name.to_string(),
                        file_size,
                        width,
                        height,
                        source: source.to_string(),
                    }
                })
                .collect();
            store_media_image_contexts(media_tool_images);

            let image_meta: Vec<serde_json::Value> = imgs
                .iter()
                .map(|img| {
                    let name = img
                        .metadata
                        .as_ref()
                        .and_then(|m| m.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("image.png");
                    let mut meta = serde_json::json!({
                        "id": &img.id,
                        "name": name,
                        "mime_type": &img.mime_type,
                    });
                    if let Some(url) = &img.data_url {
                        meta["data_url"] = serde_json::json!(url);
                    }
                    if let Some(path) = &img.image_path {
                        meta["image_path"] = serde_json::json!(path);
                    }
                    meta
                })
                .collect();

            let mut metadata =
                Self::ensure_user_message_metadata_object(user_message_metadata.take());
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert("images".to_string(), serde_json::json!(image_meta));
                obj.insert(
                    "original_text".to_string(),
                    serde_json::json!(original_user_input.clone()),
                );
            }
            user_message_metadata = Some(metadata);
        }

        let session_workspace = Self::build_workspace_binding(&session.config).await;

        // Parse and resolve the immutable persona snapshot before the turn is
        // persisted or emitted. Any explicit unsupported/mismatched persona
        // fails closed instead of silently falling back to the base mode.
        let persona_runtime = resolve_persona_turn_runtime(
            user_message_metadata.as_ref(),
            &session_id,
            &effective_agent_type,
            session.kind,
            session_workspace.as_ref(),
            self.team_lead_persona_resolver.get(),
        )
        .await
        .map_err(wrap_persona_runtime_validation_error)?;

        // Build WorkspaceServices based on the workspace type
        let workspace_services = Self::build_workspace_services(&session_workspace).await;

        info!(
            "Dialog turn workspace context: session_id={}, workspace_path={:?}, is_remote={}, workspace_services={}",
            session_id,
            session.config.workspace_path,
            session_workspace
                .as_ref()
                .map(|ws| ws.is_remote())
                .unwrap_or(false),
            if workspace_services.is_some() {
                "available"
            } else {
                "NONE"
            }
        );

        let mut wrapped_user_input = self
            .wrap_user_input(
                &effective_agent_type,
                previous_agent_type
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
                user_input,
                session_workspace.as_ref(),
            )
            .await?;

        if let Ok(Some(goal_state)) = self.load_active_goal_mode(&session_id).await {
            if !should_skip_goal_verification_for_turn(
                &original_user_input,
                user_message_metadata.as_ref(),
            ) {
                wrapped_user_input =
                    wrap_user_input_with_goal_reminder(wrapped_user_input, &goal_state);
            }
        }

        if original_user_input != wrapped_user_input {
            let mut metadata =
                Self::ensure_user_message_metadata_object(user_message_metadata.take());
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert(
                    "original_text".to_string(),
                    serde_json::json!(original_user_input.clone()),
                );
            }
            user_message_metadata = Some(metadata);
        }

        // Start new dialog turn (sets state to Processing internally)
        let turn_index = self.session_manager.get_turn_count(&session_id);
        // Pass frontend turnId, generate if not provided
        let turn_id = self
            .session_manager
            .start_dialog_turn(
                &session_id,
                effective_agent_type.clone(),
                wrapped_user_input.clone(),
                turn_id,
                image_contexts,
                user_message_metadata.clone(),
            )
            .await?;

        // Register this turn as in-flight immediately after it becomes visible
        // as Processing. Later await points must not leave a cancel/start
        // window where wait_session_drained observes zero active work.
        let active_counter = self
            .active_turns_per_session
            .entry(session_id.clone())
            .or_insert_with(|| Arc::new(AtomicUsize::new(0)))
            .clone();
        active_counter.fetch_add(1, Ordering::SeqCst);
        struct ActiveTurnRegistration {
            counter: Arc<AtomicUsize>,
            armed: bool,
        }
        impl ActiveTurnRegistration {
            fn disarm(&mut self) {
                self.armed = false;
            }
        }
        impl Drop for ActiveTurnRegistration {
            fn drop(&mut self) {
                if self.armed {
                    self.counter.fetch_sub(1, Ordering::SeqCst);
                }
            }
        }
        let mut active_registration = ActiveTurnRegistration {
            counter: active_counter.clone(),
            armed: true,
        };
        let cancellation_token = CancellationToken::new();
        self.execution_engine
            .register_cancel_token(&turn_id, cancellation_token);

        // Send dialog turn started event with original input and image metadata
        // so all frontends (desktop, mobile, bot) can display correctly.
        self.emit_event(AgenticEvent::DialogTurnStarted {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            turn_index,
            user_input: wrapped_user_input.clone(),
            original_user_input: if original_user_input != wrapped_user_input {
                Some(original_user_input.clone())
            } else {
                None
            },
            user_message_metadata: user_message_metadata.clone(),
        })
        .await;

        // Get context messages (re-fetch as history may have been restored)
        let messages = match self.session_manager.get_context_messages(&session_id).await {
            Ok(messages) => messages,
            Err(error) => {
                self.execution_engine.cleanup_cancel_token(&turn_id).await;
                return Err(error);
            }
        };

        // Create execution context (pass full config and resource IDs)
        let mut context_vars = std::collections::HashMap::new();
        context_vars.insert(
            "max_context_tokens".to_string(),
            session.config.max_context_tokens.to_string(),
        );
        context_vars.insert(
            "enable_tools".to_string(),
            session.config.enable_tools.to_string(),
        );
        context_vars.insert(
            "original_user_input".to_string(),
            original_user_input.clone(),
        );

        // Pass model_id for token usage tracking
        if let Some(model_id) = &session.config.model_id {
            context_vars.insert("model_name".to_string(), model_id.clone());
        }

        // Pass snapshot session ID
        if let Some(snapshot_id) = &session.snapshot_session_id {
            context_vars.insert("snapshot_session_id".to_string(), snapshot_id.clone());
        }

        // Pass turn_index (for operation history/rollback)
        context_vars.insert("turn_index".to_string(), turn_index.to_string());
        if let Some(run_manifest) = user_message_metadata.as_ref().and_then(|metadata| {
            metadata
                .get("deepReviewRunManifest")
                .or_else(|| metadata.get("deep_review_run_manifest"))
        }) {
            context_vars.insert(
                "deep_review_run_manifest".to_string(),
                run_manifest.to_string(),
            );
        }
        if user_message_metadata
            .as_ref()
            .and_then(|metadata| metadata.get("acp_transport"))
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
        {
            context_vars.insert("acp_transport".to_string(), "true".to_string());
        }
        let session_workspace_path = session_workspace
            .as_ref()
            .map(|workspace| workspace.root_path_string());
        // Pre-resolve the on-disk session storage path (mirror dir for remote workspaces)
        // so the safety-net writer never has to re-resolve without remote_connection_id /
        // remote_ssh_host (which would silently fall back to a slugified raw remote path).
        let session_storage_path = session_workspace
            .as_ref()
            .map(|workspace| workspace.session_storage_path().to_path_buf());

        let execution_context = ExecutionContext {
            session_id: session_id.clone(),
            dialog_turn_id: turn_id.clone(),
            turn_index,
            agent_type: effective_agent_type.clone(),
            workspace: session_workspace,
            context: context_vars,
            subagent_parent_info: None,
            delegation_policy: DelegationPolicy::top_level(),
            skip_tool_confirmation: submission_policy.skip_tool_confirmation,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services,
            round_preempt: self.round_preempt_source.get().cloned(),
            round_injection: self.round_injection_source.get().cloned(),
            recover_partial_on_cancel: false,
            persona_runtime,
            team_member_skill_policy: None,
        };

        // Auto-generate session title on first message
        if turn_index == 0 && !suppress_session_title_generation {
            let sm = self.session_manager.clone();
            let eq = self.event_queue.clone();
            let sid = session_id.clone();
            let msg = original_user_input;
            let expected_title = self
                .session_manager
                .get_session(&session_id)
                .map(|session| session.session_name)
                .unwrap_or_default();
            tokio::spawn(async move {
                let allow_ai = is_ai_session_title_generation_enabled().await;
                let resolved = sm.resolve_session_title(&msg, Some(20), allow_ai).await;

                match sm
                    .update_session_title_if_current(&sid, &expected_title, &resolved.title)
                    .await
                {
                    Ok(true) => {
                        let _ = eq
                            .enqueue(
                                AgenticEvent::SessionTitleGenerated {
                                    session_id: sid,
                                    title: resolved.title,
                                    method: resolved.method.as_str().to_string(),
                                },
                                Some(EventPriority::Normal),
                            )
                            .await;
                    }
                    Ok(false) => {
                        debug!("Skipped auto session title update because title changed");
                    }
                    Err(error) => {
                        debug!("Auto session title generation failed to apply: {error}");
                    }
                }
            });
        }

        // Start async execution task
        let session_manager = self.session_manager.clone();
        let execution_engine = self.execution_engine.clone();
        let event_queue = self.event_queue.clone();
        let session_id_clone = session_id.clone();
        let turn_id_clone = turn_id.clone();
        let user_input_for_workspace = wrapped_user_input.clone();
        let session_storage_path_for_finalize = session_storage_path.clone();
        let effective_agent_type_clone = effective_agent_type.clone();
        let user_message_metadata_clone = user_message_metadata;
        let scheduler_notify_tx = self.scheduler_notify_tx.get().cloned();

        tokio::spawn(async move {
            // RAII guard: on drop (ANY exit path, including panic), decrements
            // the in-flight counter and resets Processing → Idle only if this
            // task still owns the current turn.
            //
            // This is the single source of truth for "is this spawn active?".
            // Because `Drop` is synchronous we use an in-memory-only state
            // update here; the async persistence of the state change is done
            // explicitly in the spawn body below.
            struct SessionExecutionGuard {
                session_manager: Arc<SessionManager>,
                session_id: String,
                turn_id: String,
                active_counter: Arc<AtomicUsize>,
            }
            impl SessionExecutionGuard {
                fn new(
                    session_manager: Arc<SessionManager>,
                    session_id: String,
                    turn_id: String,
                    active_counter: Arc<AtomicUsize>,
                ) -> Self {
                    Self {
                        session_manager,
                        session_id,
                        turn_id,
                        active_counter,
                    }
                }
            }
            impl Drop for SessionExecutionGuard {
                fn drop(&mut self) {
                    self.active_counter.fetch_sub(1, Ordering::SeqCst);
                    // If the session is still in Processing (abnormal exit),
                    // synchronously reset to Idle so the user is never stuck.
                    self.session_manager
                        .reset_session_state_if_processing(&self.session_id, &self.turn_id);
                }
            }

            let _guard = SessionExecutionGuard::new(
                session_manager.clone(),
                session_id_clone.clone(),
                turn_id_clone.clone(),
                active_counter,
            );

            // Note: Don't check cancellation here as cancel token hasn't been created yet
            // Cancel token is created in execute_dialog_turn -> execute_round
            // execute_dialog_turn has proper cancellation checks internally

            match session_manager
                .update_session_state_for_turn_if_processing(
                    &session_id_clone,
                    &turn_id_clone,
                    SessionState::Processing {
                        current_turn_id: turn_id_clone.clone(),
                        phase: ProcessingPhase::Thinking,
                    },
                )
                .await
            {
                Ok(true) => {}
                Ok(false) => {
                    debug!(
                        "Skipped refreshing Processing state for stale or cancelled turn: session_id={}, turn_id={}",
                        session_id_clone, turn_id_clone
                    );
                }
                Err(e) => {
                    error!(
                        "Failed to set session state to Processing: session_id={}, turn_id={}, error={}",
                        session_id_clone, turn_id_clone, e
                    );
                }
            }

            let workspace_turn_status = match execution_engine
                .execute_dialog_turn(
                    effective_agent_type_clone.clone(),
                    messages,
                    execution_context,
                )
                .await
            {
                Ok(execution_result) => Some(
                    Self::persist_completed_dialog_turn(
                        session_manager.as_ref(),
                        scheduler_notify_tx.as_ref(),
                        &session_id_clone,
                        &turn_id_clone,
                        &execution_result,
                    )
                    .await
                    .0,
                ),
                Err(e) => {
                    if matches!(&e, VoidError::Cancelled(_)) {
                        Some(
                            Self::persist_cancelled_dialog_turn(
                                event_queue.as_ref(),
                                session_manager.as_ref(),
                                scheduler_notify_tx.as_ref(),
                                &session_id_clone,
                                &turn_id_clone,
                            )
                            .await,
                        )
                    } else {
                        Some(
                            Self::persist_failed_dialog_turn(
                                event_queue.as_ref(),
                                session_manager.as_ref(),
                                scheduler_notify_tx.as_ref(),
                                &session_id_clone,
                                &turn_id_clone,
                                &e,
                            )
                            .await,
                        )
                    }
                }
            };

            Self::finalize_persisted_turn_in_workspace_if_needed(
                session_manager.as_ref(),
                &session_id_clone,
                &turn_id_clone,
                turn_index,
                &effective_agent_type_clone,
                &user_input_for_workspace,
                session_workspace_path.as_deref(),
                session_storage_path_for_finalize.as_deref(),
                workspace_turn_status,
                user_message_metadata_clone,
            )
            .await;
        });
        active_registration.disarm();

        Ok(())
    }

    /// P0-8: Wait until all in-flight spawn tasks for this session have
    /// drained, or until `deadline` is reached. Returns the number of
    /// in-flight turns still running (0 means fully drained). This is used to
    /// serialize cancel→start so a new turn does not start mutating the
    /// in-memory context cache while a cancelled turn's spawn task is still
    /// finishing its tail.
    async fn wait_session_drained(&self, session_id: &str, max_wait: Duration) -> usize {
        let counter = match self.active_turns_per_session.get(session_id) {
            Some(entry) => entry.value().clone(),
            None => return 0,
        };
        let deadline = Instant::now() + max_wait;
        loop {
            let pending = counter.load(Ordering::SeqCst);
            if pending == 0 {
                return 0;
            }
            if Instant::now() >= deadline {
                return pending;
            }
            sleep(Duration::from_millis(20)).await;
        }
    }

    async fn cancel_active_subagents_for_parent_turn(
        &self,
        parent_session_id: &str,
        parent_dialog_turn_id: &str,
    ) {
        let active_subagents: Vec<ActiveSubagentExecution> = self
            .active_subagent_executions
            .iter()
            .filter(|entry| {
                entry.parent_session_id == parent_session_id
                    && entry.parent_dialog_turn_id == parent_dialog_turn_id
            })
            .map(|entry| entry.value().clone())
            .collect();

        if active_subagents.is_empty() {
            return;
        }

        info!(
            "Cancelling {} active subagent execution(s) for parent turn: parent_session_id={}, parent_dialog_turn_id={}",
            active_subagents.len(),
            parent_session_id,
            parent_dialog_turn_id
        );

        for active in active_subagents {
            self.stop_active_subagent_execution(&active, "Parent dialog turn cancelled")
                .await;
        }
    }

    async fn stop_active_subagent_execution(&self, active: &ActiveSubagentExecution, reason: &str) {
        debug!(
            "Stopping active subagent execution: subagent_session_id={}, subagent_dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, reason={}",
            active.subagent_session_id,
            active.subagent_dialog_turn_id,
            active.parent_session_id,
            active.parent_dialog_turn_id,
            reason
        );

        active.cancel_token.cancel();
        active.abort_handle.abort();

        if let Err(error) = self
            .execution_engine
            .cancel_dialog_turn(&active.subagent_dialog_turn_id)
            .await
        {
            warn!(
                "Failed to cancel active subagent dialog turn: subagent_session_id={}, subagent_dialog_turn_id={}, error={}",
                active.subagent_session_id, active.subagent_dialog_turn_id, error
            );
        }

        if let Err(error) = self
            .tool_pipeline
            .cancel_dialog_turn_tools(&active.subagent_dialog_turn_id)
            .await
        {
            warn!(
                "Failed to cancel active subagent tools: subagent_session_id={}, subagent_dialog_turn_id={}, error={}",
                active.subagent_session_id, active.subagent_dialog_turn_id, error
            );
        }

        Self::persist_cancelled_dialog_turn(
            self.event_queue.as_ref(),
            self.session_manager.as_ref(),
            None,
            &active.subagent_session_id,
            &active.subagent_dialog_turn_id,
        )
        .await;

        self.session_manager.reset_session_state_if_processing(
            &active.subagent_session_id,
            &active.subagent_dialog_turn_id,
        );

        remove_active_subagent_execution_if_generation_matches(
            self.active_subagent_executions.as_ref(),
            &active.subagent_session_id,
            &active.subagent_dialog_turn_id,
        );
    }

    /// Cancel dialog turn execution
    /// Immediately set state to Idle to allow new dialog, old turn ends naturally via cancel token
    pub async fn cancel_dialog_turn(
        &self,
        session_id: &str,
        dialog_turn_id: &str,
    ) -> VoidResult<()> {
        info!(
            "Received cancel request: dialog_turn_id={}, session_id={}",
            dialog_turn_id, session_id
        );

        let old_state = self
            .session_manager
            .get_session(session_id)
            .map(|s| format!("{:?}", s.state))
            .unwrap_or_else(|| "Unknown".to_string());
        debug!("Current state: {}", old_state);

        // Step 1: Immediately update session state to Idle only if this
        // cancellation still targets the currently processing turn. A delayed
        // cancel request for an older turn must not clear a newer turn.
        debug!("Conditionally updating session state to Idle for cancelled turn");
        let state_updated = self
            .session_manager
            .update_session_state_for_turn_if_processing(
                session_id,
                dialog_turn_id,
                SessionState::Idle,
            )
            .await?;

        let new_state = self
            .session_manager
            .get_session(session_id)
            .map(|s| format!("{:?}", s.state))
            .unwrap_or_else(|| "Unknown".to_string());
        debug!("State updated: {} -> {}", old_state, new_state);

        // Step 2: Immediately send state change event only when this cancel
        // actually changed the active turn state.
        if state_updated {
            if let Ok(Some(goal_state)) = self.load_active_goal_mode(session_id).await {
                match update_goal_mode_state(Some(goal_state), GoalModeUpdateAction::Pause, now_ms())
                {
                    Ok(result) => {
                        if let Some(state) = result.state.as_ref() {
                            if let Err(error) = self
                                .session_manager
                                .merge_session_custom_metadata(session_id, goal_mode_patch(state))
                                .await
                            {
                                warn!(
                                    "Failed to pause active goal after cancellation: session_id={}, dialog_turn_id={}, error={}",
                                    session_id, dialog_turn_id, error
                                );
                            } else {
                                self.emit_event(AgenticEvent::GoalVerificationFinished {
                                    session_id: session_id.to_string(),
                                    source_turn_id: dialog_turn_id.to_string(),
                                    outcome: "paused".to_string(),
                                })
                                .await;
                            }
                        }
                    }
                    Err(error) => warn!(
                        "Failed to build paused goal state after cancellation: session_id={}, dialog_turn_id={}, error={}",
                        session_id, dialog_turn_id, error
                    ),
                }
            }

            self.emit_event(AgenticEvent::SessionStateChanged {
                session_id: session_id.to_string(),
                new_state: "idle".to_string(),
            })
            .await;
            debug!("Session state change event sent");
        } else {
            debug!(
                "Skipped idle event for stale cancellation: session_id={}, dialog_turn_id={}",
                session_id, dialog_turn_id
            );
        }

        // Step 3: Trigger cancellation tokens so the running turn unwinds. We
        // do this synchronously (not spawn) because the calls themselves are
        // cheap (just signalling tokens); the actual long-running work
        // (waiting for the spawn task to drain) is handled via
        // `wait_session_drained` below.
        if let Err(e) = self
            .execution_engine
            .cancel_dialog_turn(dialog_turn_id)
            .await
        {
            warn!("Failed to cancel execution engine: {}", e);
        }
        if let Err(e) = self
            .tool_pipeline
            .cancel_dialog_turn_tools(dialog_turn_id)
            .await
        {
            warn!("Failed to cancel tool execution: {}", e);
        }

        self.cancel_active_subagents_for_parent_turn(session_id, dialog_turn_id)
            .await;

        // Step 4: Wait briefly for the spawn task that owns this turn to drain
        // its in-memory message writes before returning. Capped so the RPC
        // never blocks longer than ~1.5s — beyond that we let the new turn
        // proceed and rely on the cancellation token already being signalled.
        let pending = self
            .wait_session_drained(session_id, Duration::from_millis(1500))
            .await;
        if pending > 0 {
            warn!(
                "Cancelled turn did not fully drain within 1500ms: session_id={}, dialog_turn_id={}, pending={}",
                session_id, dialog_turn_id, pending
            );
        } else {
            debug!(
                "Cancelled turn fully drained: session_id={}, dialog_turn_id={}",
                session_id, dialog_turn_id
            );
        }

        Ok(())
    }

    pub async fn cancel_active_turn_for_session(
        &self,
        session_id: &str,
        wait_timeout: Duration,
    ) -> VoidResult<Option<String>> {
        let Some(session) = self.session_manager.get_session(session_id) else {
            return Ok(None);
        };

        let SessionState::Processing {
            current_turn_id, ..
        } = session.state
        else {
            return Ok(None);
        };

        self.cancel_dialog_turn(session_id, &current_turn_id)
            .await?;

        let deadline = Instant::now() + wait_timeout;
        while self.execution_engine.has_active_turn(&current_turn_id) {
            if Instant::now() >= deadline {
                warn!(
                    "Timed out waiting for active turn cancellation: session_id={}, dialog_turn_id={}, timeout_ms={}",
                    session_id,
                    current_turn_id,
                    wait_timeout.as_millis()
                );
                break;
            }
            sleep(Duration::from_millis(50)).await;
        }

        Ok(Some(current_turn_id))
    }

    /// Delete session
    pub async fn delete_session(&self, workspace_path: &Path, session_id: &str) -> VoidResult<()> {
        self.session_manager
            .delete_session(workspace_path, session_id)
            .await?;
        self.emit_event(AgenticEvent::SessionDeleted {
            session_id: session_id.to_string(),
        })
        .await;
        Ok(())
    }

    pub async fn delete_hidden_subagent_sessions_for_parent_turns(
        &self,
        workspace_path: &Path,
        parent_session_id: &str,
        parent_dialog_turn_ids: &HashSet<String>,
    ) -> VoidResult<Vec<String>> {
        let session_ids = self
            .session_manager
            .collect_hidden_subagent_cascade_for_parent_turns(
                workspace_path,
                parent_session_id,
                parent_dialog_turn_ids,
            )
            .await?;

        let mut deleted_session_ids = Vec::new();

        for session_id in session_ids {
            if let Err(e) = self
                .cancel_active_turn_for_session(&session_id, Duration::from_secs(2))
                .await
            {
                warn!(
                    "Failed to cancel hidden subagent session before deletion: session_id={}, parent_session_id={}, error={}",
                    session_id, parent_session_id, e
                );
            }

            self.delete_session(workspace_path, &session_id).await?;
            deleted_session_ids.push(session_id);
        }

        Ok(deleted_session_ids)
    }

    /// Restore session
    pub async fn restore_session(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Session> {
        let session = self
            .session_manager
            .restore_session(workspace_path, session_id)
            .await?;
        self.schedule_subagent_task_recovery_sweep(session_id);
        Ok(session)
    }

    pub async fn restore_internal_session(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<Session> {
        let session = self
            .session_manager
            .restore_internal_session(workspace_path, session_id)
            .await?;
        self.schedule_subagent_task_recovery_sweep(session_id);
        Ok(session)
    }

    /// Restore session and return the persisted turns read during restore.
    pub async fn restore_session_with_turns(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<(Session, Vec<crate::service::session::DialogTurnData>)> {
        let restored = self
            .session_manager
            .restore_session_with_turns(workspace_path, session_id)
            .await?;
        self.schedule_subagent_task_recovery_sweep(session_id);
        Ok(restored)
    }

    pub async fn restore_internal_session_with_turns(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<(Session, Vec<crate::service::session::DialogTurnData>)> {
        let restored = self
            .session_manager
            .restore_internal_session_with_turns(workspace_path, session_id)
            .await?;
        self.schedule_subagent_task_recovery_sweep(session_id);
        Ok(restored)
    }

    /// Restore only the UI-visible persisted session view.
    pub async fn restore_session_view(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<(Session, Vec<crate::service::session::DialogTurnData>)> {
        self.session_manager
            .restore_session_view(workspace_path, session_id)
            .await
    }

    pub async fn restore_internal_session_view(
        &self,
        workspace_path: &Path,
        session_id: &str,
    ) -> VoidResult<(Session, Vec<crate::service::session::DialogTurnData>)> {
        self.session_manager
            .restore_internal_session_view(workspace_path, session_id)
            .await
    }

    /// List all sessions
    pub async fn list_sessions(&self, workspace_path: &Path) -> VoidResult<Vec<SessionSummary>> {
        self.session_manager.list_sessions(workspace_path).await
    }

    pub async fn resolve_session_workspace_path(
        &self,
        session_id: &str,
    ) -> Option<std::path::PathBuf> {
        self.session_manager
            .resolve_session_workspace_path(session_id)
            .await
    }

    /// Get a best-effort message view for a session.
    pub async fn get_messages(&self, session_id: &str) -> VoidResult<Vec<Message>> {
        self.session_manager.get_messages(session_id).await
    }

    /// Get a paginated best-effort message view for a session.
    pub async fn get_messages_paginated(
        &self,
        session_id: &str,
        limit: usize,
        before_message_id: Option<&str>,
    ) -> VoidResult<(Vec<Message>, bool)> {
        self.session_manager
            .get_messages_paginated(session_id, limit, before_message_id)
            .await
    }

    /// Subscribe to internal events
    ///
    /// For internal systems to subscribe to events (e.g., logging, monitoring)
    pub fn subscribe_internal<H>(&self, subscriber_id: String, handler: H)
    where
        H: EventSubscriber + 'static,
    {
        self.event_router
            .subscribe_internal(subscriber_id, Arc::new(handler));
    }

    /// Unsubscribe from internal events
    ///
    /// Remove subscriber previously added via subscribe_internal
    pub fn unsubscribe_internal(&self, subscriber_id: &str) {
        self.event_router.unsubscribe_internal(subscriber_id);
    }

    /// Confirm tool execution
    pub async fn confirm_tool(
        &self,
        tool_id: &str,
        updated_input: Option<serde_json::Value>,
    ) -> VoidResult<()> {
        self.tool_pipeline
            .confirm_tool(tool_id, updated_input)
            .await
    }

    /// Reject tool execution
    pub async fn reject_tool(&self, tool_id: &str, reason: String) -> VoidResult<()> {
        self.tool_pipeline.reject_tool(tool_id, reason).await
    }

    /// Cancel tool execution
    pub async fn cancel_tool(&self, tool_id: &str, reason: String) -> VoidResult<()> {
        self.tool_pipeline.cancel_tool(tool_id, reason).await
    }

    async fn get_subagent_concurrency_limiter(&self) -> SubagentConcurrencyLimiter {
        let configured = match GlobalConfigManager::get_service().await {
            Ok(config_service) => match config_service
                .get_config::<usize>(Some("ai.subagent_max_concurrency"))
                .await
            {
                Ok(value) => value,
                Err(error) => {
                    warn!(
                        "Failed to read ai.subagent_max_concurrency, using default {}: {}",
                        DEFAULT_SUBAGENT_MAX_CONCURRENCY, error
                    );
                    DEFAULT_SUBAGENT_MAX_CONCURRENCY
                }
            },
            Err(error) => {
                warn!(
                    "Config service unavailable while reading ai.subagent_max_concurrency, using default {}: {}",
                    DEFAULT_SUBAGENT_MAX_CONCURRENCY, error
                );
                DEFAULT_SUBAGENT_MAX_CONCURRENCY
            }
        };

        let normalized = normalize_subagent_max_concurrency(configured);
        if normalized != configured {
            warn!(
                "Normalized ai.subagent_max_concurrency from {} to {}",
                configured, normalized
            );
        }

        {
            let limiter_guard = self.subagent_concurrency_limiter.read().await;
            if let Some(limiter) = limiter_guard.as_ref() {
                if limiter.max_concurrency == normalized {
                    return limiter.clone();
                }
            }
        }

        let mut limiter_guard = self.subagent_concurrency_limiter.write().await;
        if let Some(limiter) = limiter_guard.as_ref() {
            if limiter.max_concurrency == normalized {
                return limiter.clone();
            }
        }

        let limiter = SubagentConcurrencyLimiter {
            semaphore: Arc::new(Semaphore::new(normalized)),
            max_concurrency: normalized,
        };
        *limiter_guard = Some(limiter.clone());
        limiter
    }

    async fn get_subagent_profile_concurrency_limiter(
        &self,
        max_concurrency: usize,
    ) -> SubagentConcurrencyLimiter {
        let max_concurrency = normalize_subagent_max_concurrency(max_concurrency);

        {
            let limiter_guard = self.subagent_profile_concurrency_limiters.read().await;
            if let Some(limiter) = limiter_guard.get(&max_concurrency) {
                return limiter.clone();
            }
        }

        let mut limiter_guard = self.subagent_profile_concurrency_limiters.write().await;
        if let Some(limiter) = limiter_guard.get(&max_concurrency) {
            return limiter.clone();
        }

        let limiter = SubagentConcurrencyLimiter {
            semaphore: Arc::new(Semaphore::new(max_concurrency)),
            max_concurrency,
        };
        limiter_guard.insert(max_concurrency, limiter.clone());
        limiter
    }

    async fn acquire_permit_from_limiter(
        &self,
        limiter: &SubagentConcurrencyLimiter,
        agent_type: &str,
        cancel_token: Option<&CancellationToken>,
        deadline: Option<Instant>,
        label: &str,
    ) -> VoidResult<OwnedSemaphorePermit> {
        let semaphore = limiter.semaphore.clone();
        let permit = match (cancel_token, deadline) {
            (Some(token), Some(deadline)) => {
                tokio::select! {
                    result = semaphore.acquire_owned() => result
                        .map_err(|error| VoidError::Semaphore(error.to_string()))?,
                    _ = token.cancelled() => {
                        return Err(VoidError::Cancelled(
                            "Subagent task was cancelled while waiting for a concurrency slot".to_string(),
                        ));
                    }
                    _ = tokio::time::sleep_until(deadline) => {
                        return Err(VoidError::Timeout(format!(
                            "Timed out while waiting for a {} concurrency slot for subagent '{}'",
                            label, agent_type
                        )));
                    }
                }
            }
            (Some(token), None) => {
                tokio::select! {
                    result = semaphore.acquire_owned() => result
                        .map_err(|error| VoidError::Semaphore(error.to_string()))?,
                    _ = token.cancelled() => {
                        return Err(VoidError::Cancelled(
                            "Subagent task was cancelled while waiting for a concurrency slot".to_string(),
                        ));
                    }
                }
            }
            (None, Some(deadline)) => {
                tokio::select! {
                    result = semaphore.acquire_owned() => result
                        .map_err(|error| VoidError::Semaphore(error.to_string()))?,
                    _ = tokio::time::sleep_until(deadline) => {
                        return Err(VoidError::Timeout(format!(
                            "Timed out while waiting for a {} concurrency slot for subagent '{}'",
                            label, agent_type
                        )));
                    }
                }
            }
            (None, None) => semaphore
                .acquire_owned()
                .await
                .map_err(|error| VoidError::Semaphore(error.to_string()))?,
        };

        let active_subagents = limiter
            .max_concurrency
            .saturating_sub(limiter.semaphore.available_permits());
        debug!(
            "Acquired subagent {} concurrency permit: agent_type={}, active_subagents={}, max_concurrency={}",
            label, agent_type, active_subagents, limiter.max_concurrency
        );

        Ok(permit)
    }

    async fn acquire_subagent_concurrency_permit(
        &self,
        agent_type: &str,
        profile_concurrency_cap: usize,
        cancel_token: Option<&CancellationToken>,
        deadline: Option<Instant>,
    ) -> VoidResult<(
        Vec<(OwnedSemaphorePermit, SubagentConcurrencyLimiter)>,
        u128,
    )> {
        let started_waiting = Instant::now();

        let profile_limiter = self
            .get_subagent_profile_concurrency_limiter(profile_concurrency_cap)
            .await;
        let profile_permit = self
            .acquire_permit_from_limiter(
                &profile_limiter,
                agent_type,
                cancel_token,
                deadline,
                "profile",
            )
            .await?;

        let global_limiter = self.get_subagent_concurrency_limiter().await;
        let global_permit = self
            .acquire_permit_from_limiter(
                &global_limiter,
                agent_type,
                cancel_token,
                deadline,
                "global",
            )
            .await?;

        let wait_ms = started_waiting.elapsed().as_millis();
        debug!(
            "Acquired subagent concurrency permits: agent_type={}, wait_ms={}, profile_max_concurrency={}, global_max_concurrency={}",
            agent_type, wait_ms, profile_limiter.max_concurrency, global_limiter.max_concurrency
        );

        Ok((
            vec![
                (profile_permit, profile_limiter),
                (global_permit, global_limiter),
            ],
            wait_ms,
        ))
    }

    fn context_profile_policy_for_subagent(
        &self,
        agent_type: &str,
        session_config: &SessionConfig,
        subagent_parent_info: Option<&SubagentParentInfo>,
    ) -> ContextProfilePolicy {
        if let Some(parent_info) = subagent_parent_info {
            if let Some(parent_session) = self.session_manager.get_session(&parent_info.session_id)
            {
                let parent_is_review_subagent = get_agent_registry()
                    .get_subagent_is_review(&parent_session.agent_type)
                    .unwrap_or(false);
                let is_review_subagent = get_agent_registry()
                    .get_subagent_is_review(agent_type)
                    .unwrap_or(false);
                return ContextProfilePolicy::for_subagent_context_and_models(
                    agent_type,
                    is_review_subagent,
                    session_config.model_id.as_deref(),
                    Some(&parent_session.agent_type),
                    parent_is_review_subagent,
                    parent_session.config.model_id.as_deref(),
                );
            }
        }

        let is_review_subagent = get_agent_registry()
            .get_subagent_is_review(agent_type)
            .unwrap_or(false);
        let model_id = session_config.model_id.as_deref().unwrap_or_default();
        ContextProfilePolicy::for_agent_context_and_model(
            agent_type,
            is_review_subagent,
            model_id,
            model_id,
        )
    }

    async fn execute_hidden_subagent_internal(
        &self,
        request: HiddenSubagentExecutionRequest,
        cancel_token: Option<&CancellationToken>,
        timeout_seconds: Option<u64>,
    ) -> VoidResult<SubagentResult> {
        let HiddenSubagentExecutionRequest {
            session_name,
            agent_type,
            session_config,
            initial_messages,
            user_input_text,
            created_by,
            subagent_parent_info,
            context,
            delegation_policy,
            runtime_tool_restrictions,
            prompt_cache_source_session_id,
            persistent_task,
            resume_session_id,
            requested_dialog_turn_id,
            prepared_turn,
            team_member_skill_policy,
        } = request;

        let requested_timeout_seconds = timeout_seconds.filter(|seconds| *seconds > 0);
        let parent_goal_mode_active = if let Some(parent_info) = subagent_parent_info.as_ref() {
            matches!(
                self.load_active_goal_mode(&parent_info.session_id).await,
                Ok(Some(_))
            )
        } else {
            false
        };
        if parent_goal_mode_active {
            let parent_session_id = subagent_parent_info
                .as_ref()
                .map(|info| info.session_id.as_str())
                .unwrap_or("-");
            debug!(
                "Subagent timeout disabled by default for active goal mode: agent_type={}, parent_session_id={}",
                agent_type, parent_session_id
            );
        }
        let timeout_seconds =
            effective_subagent_timeout_seconds(requested_timeout_seconds, parent_goal_mode_active);
        let timeout_error_message = match timeout_seconds.or(requested_timeout_seconds) {
            Some(seconds) => format!(
                "Subagent '{}' timed out after {} seconds",
                agent_type, seconds
            ),
            None => format!("Subagent '{}' timed out", agent_type),
        };

        // Create dynamic deadline via watch channel so it can be adjusted at runtime.
        let initial_deadline =
            timeout_seconds.map(|seconds| Instant::now() + Duration::from_secs(seconds));
        let (deadline_tx, mut deadline_rx) = watch::channel(initial_deadline);
        let subagent_started_at = Instant::now();
        let parent_session_id = subagent_parent_info
            .as_ref()
            .map(|info| info.session_id.as_str())
            .unwrap_or("-");
        let parent_dialog_turn_id = subagent_parent_info
            .as_ref()
            .map(|info| info.dialog_turn_id.as_str())
            .unwrap_or("-");
        let parent_tool_call_id = subagent_parent_info
            .as_ref()
            .map(|info| info.tool_call_id.as_str())
            .unwrap_or("-");

        let context_profile_policy = self.context_profile_policy_for_subagent(
            &agent_type,
            &session_config,
            subagent_parent_info.as_ref(),
        );
        debug!(
            "Subagent context profile policy selected: agent_type={}, profile={:?}, profile_concurrency_cap={}",
            agent_type,
            context_profile_policy.profile,
            context_profile_policy.subagent_concurrency_cap
        );

        // Check cancel token (before creating session)
        if let Some(token) = cancel_token {
            if token.is_cancelled() {
                debug!("Subagent task cancelled before execution");
                return Err(VoidError::Cancelled(
                    "Subagent task has been cancelled".to_string(),
                ));
            }
        }

        // Create independent subagent session.
        // Use create_subagent_session (not create_session) so that no SessionCreated
        // event is emitted to the transport layer — subagent sessions are internal
        // implementation details and must not appear in the UI session list.
        let (permits, wait_ms) = self
            .acquire_subagent_concurrency_permit(
                &agent_type,
                context_profile_policy.subagent_concurrency_cap,
                cancel_token,
                initial_deadline,
            )
            .await?;
        let _permit_guard = SubagentConcurrencyPermitGuard::new(permits, agent_type.clone());

        if let Some(token) = cancel_token {
            if token.is_cancelled() {
                debug!(
                    "Subagent task cancelled after waiting for concurrency slot: agent_type={}",
                    agent_type
                );
                return Err(VoidError::Cancelled(
                    "Subagent task has been cancelled".to_string(),
                ));
            }
        }
        if initial_deadline.is_some_and(|expires_at| Instant::now() >= expires_at) {
            warn!(
                "Subagent timed out before session creation after waiting for concurrency slot: agent_type={}, wait_ms={}",
                agent_type, wait_ms
            );
            return Err(VoidError::Timeout(timeout_error_message.clone()));
        }

        let is_resume = resume_session_id.is_some();
        let session = if let Some(resume_session_id) = resume_session_id.as_deref() {
            let expected_created_by = created_by.as_deref();
            let session = if let Some(session) = self.session_manager.get_session(resume_session_id)
            {
                session
            } else {
                let workspace_binding = Self::build_workspace_binding(&session_config).await;
                let session_storage_path = resolved_subagent_resume_storage_path(
                    &session_config,
                    workspace_binding.as_ref(),
                )?;
                self.session_manager
                    .restore_internal_session(&session_storage_path, resume_session_id)
                    .await?
            };
            if !hidden_subagent_resume_session_matches(
                &session,
                &agent_type,
                &session_config,
                expected_created_by,
            ) {
                return Err(VoidError::Validation(
                    "resumed subagent session does not match the authoritative launch identity"
                        .to_string(),
                ));
            }
            session
        } else {
            self.create_hidden_subagent_session(
                None,
                session_name,
                agent_type.clone(),
                session_config,
                created_by,
            )
            .await?
        };
        let session_id = session.session_id.clone();
        if !is_resume {
            if let Some(source_session_id) = prompt_cache_source_session_id.as_deref() {
                let copied = self
                    .session_manager
                    .clone_prompt_cache(source_session_id, &session_id)
                    .await;
                debug!(
                "Forked prompt cache into subagent session: source_session_id={}, session_id={}, copied={}",
                source_session_id, session_id, copied
            );
            }
            self.session_manager
                .replace_context_messages(&session_id, initial_messages.clone())
                .await;
            self.session_manager
                .persist_session_lineage(
                    &session_id,
                    build_subagent_session_relationship(subagent_parent_info.as_ref(), &agent_type),
                )
                .await?;
        }

        if !is_resume {
            if let Some(task) = persistent_task.as_ref() {
                self.session_manager
                    .transition_subagent_task(
                        &task.parent_session_id,
                        &task.task_id,
                        SubagentTaskStatus::Running,
                        Some(session_id.clone()),
                        None,
                        None,
                        None,
                        now_ms(),
                    )
                    .await?;
            }
        }

        if !is_resume {
            if let Some(parent_info) = subagent_parent_info.as_ref() {
                self.emit_event(AgenticEvent::SubagentSessionLinked {
                    session_id: session_id.clone(),
                    parent_session_id: parent_info.session_id.clone(),
                    parent_dialog_turn_id: parent_info.dialog_turn_id.clone(),
                    parent_tool_call_id: parent_info.tool_call_id.clone(),
                    agent_type: Some(agent_type.clone()),
                })
                .await;
            }
        }

        // Register timeout handle so it can be adjusted at runtime.
        let timeout_handle = Arc::new(SubagentTimeoutHandle {
            deadline_tx: deadline_tx.clone(),
            session_id: session_id.clone(),
            original_timeout_seconds: requested_timeout_seconds,
            remaining_at_pause: std::sync::Mutex::new(None),
        });
        {
            let mut registry = self.subagent_timeout_registry.write().await;
            registry.insert(session_id.clone(), timeout_handle);
        }

        // Check cancel token (after creating session, before execution)
        if let Some(token) = cancel_token {
            if token.is_cancelled() {
                debug!("Subagent task cancelled before AI call, cleaning up resources");
                let _ = self.cleanup_subagent_resources(&session_id).await;
                let mut registry = self.subagent_timeout_registry.write().await;
                registry.remove(&session_id);
                return Err(VoidError::Cancelled(
                    "Subagent task has been cancelled".to_string(),
                ));
            }
        }
        if initial_deadline.is_some_and(|expires_at| Instant::now() >= expires_at) {
            warn!(
                "Subagent timed out before AI call after session creation: agent_type={}, session={}, wait_ms={}",
                agent_type, session_id, wait_ms
            );
            let _ = self.cleanup_subagent_resources(&session_id).await;
            let mut registry = self.subagent_timeout_registry.write().await;
            registry.remove(&session_id);
            return Err(VoidError::Timeout(timeout_error_message.clone()));
        }

        let (dialog_turn_id, turn_index) = if let Some(prepared_turn) = prepared_turn {
            if prepared_turn.disposition != PreparedTurnDisposition::Created {
                return Err(VoidError::Validation(
                    "A reused prepared subagent turn must not be executed again".to_string(),
                ));
            }
            (prepared_turn.turn_id, prepared_turn.turn_index)
        } else {
            let turn_index = self.session_manager.get_turn_count(&session_id);
            let requested_dialog_turn_id = requested_dialog_turn_id
                .unwrap_or_else(|| format!("subagent-{}", uuid::Uuid::new_v4()));
            let dialog_turn_id = self
                .session_manager
                .start_dialog_turn_with_existing_context(
                    &session_id,
                    agent_type.clone(),
                    user_input_text.clone(),
                    Some(requested_dialog_turn_id),
                    None,
                )
                .await?;
            (dialog_turn_id, turn_index)
        };
        debug!(
            "Generated unique dialog_turn_id for subagent: {}",
            dialog_turn_id
        );

        // Register a dedicated subagent token so both external cancellation and
        // coordinator-enforced timeouts can stop the same dialog turn.
        let subagent_cancel_token = cancel_token
            .map(CancellationToken::child_token)
            .unwrap_or_else(CancellationToken::new);
        self.execution_engine
            .register_cancel_token(&dialog_turn_id, subagent_cancel_token.clone());

        debug!(
            "Registered cancel token to RoundExecutor: dialog_turn_id={}",
            dialog_turn_id
        );

        let _cleanup_guard = CancelTokenGuard {
            execution_engine: self.execution_engine.clone(),
            dialog_turn_id: dialog_turn_id.clone(),
        };

        self.session_manager
            .update_session_state_for_turn_if_processing(
                &session_id,
                &dialog_turn_id,
                SessionState::Processing {
                    current_turn_id: dialog_turn_id.clone(),
                    phase: ProcessingPhase::Thinking,
                },
            )
            .await?;

        // Emit DialogTurnStarted after the dedicated linking event.
        self.emit_event(AgenticEvent::DialogTurnStarted {
            session_id: session_id.clone(),
            turn_id: dialog_turn_id.clone(),
            turn_index,
            user_input: user_input_text.clone(),
            original_user_input: None,
            user_message_metadata: None,
        })
        .await;

        let subagent_workspace = Self::build_workspace_binding(&session.config).await;
        let subagent_workspace_path = subagent_workspace
            .as_ref()
            .map(|workspace| workspace.root_path_string());
        let subagent_session_storage_path = subagent_workspace
            .as_ref()
            .map(|workspace| workspace.session_storage_path().to_path_buf());
        let subagent_services = Self::build_workspace_services(&subagent_workspace).await;
        let execution_context = ExecutionContext {
            session_id: session_id.clone(),
            dialog_turn_id: dialog_turn_id.clone(),
            turn_index,
            agent_type: agent_type.clone(),
            workspace: subagent_workspace,
            context,
            subagent_parent_info: subagent_parent_info.clone(),
            delegation_policy,
            // Subagents run autonomously without user interaction; always skip
            // tool confirmation to prevent them from blocking indefinitely on a
            // confirmation channel that nobody will ever respond to.
            skip_tool_confirmation: true,
            runtime_tool_restrictions,
            workspace_services: subagent_services,
            round_preempt: self.round_preempt_source.get().cloned(),
            // Subagents are autonomous; user steering is targeted at top-level
            // dialog turns only. Leave None so we don't intercept buffer entries
            // that belong to a different (parent) session/turn.
            round_injection: None,
            recover_partial_on_cancel: true,
            persona_runtime: None,
            team_member_skill_policy,
        };

        let execution_engine = self.execution_engine.clone();
        let tool_pipeline = self.tool_pipeline.clone();
        let agent_type_for_execution = agent_type.clone();
        debug!(
            "Subagent execution task starting: agent_type={}, session_id={}, dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, parent_tool_call_id={}, timeout_seconds={:?}, wait_ms={}",
            agent_type,
            session_id,
            dialog_turn_id,
            parent_session_id,
            parent_dialog_turn_id,
            parent_tool_call_id,
            timeout_seconds,
            wait_ms
        );
        let mut execution_task = tokio::spawn(async move {
            execution_engine
                .execute_dialog_turn(
                    agent_type_for_execution,
                    initial_messages,
                    execution_context,
                )
                .await
        });
        let abort_handle = execution_task.abort_handle();

        if subagent_parent_info.is_some() {
            self.active_subagent_executions.insert(
                session_id.clone(),
                ActiveSubagentExecution {
                    parent_session_id: parent_session_id.to_string(),
                    parent_dialog_turn_id: parent_dialog_turn_id.to_string(),
                    subagent_session_id: session_id.clone(),
                    subagent_dialog_turn_id: dialog_turn_id.clone(),
                    cancel_token: subagent_cancel_token.clone(),
                    abort_handle: abort_handle.clone(),
                },
            );
        }

        let mut execution_scope = SubagentExecutionScope {
            execution_engine: self.execution_engine.clone(),
            tool_pipeline: self.tool_pipeline.clone(),
            session_manager: self.session_manager.clone(),
            active_subagent_executions: self.active_subagent_executions.clone(),
            subagent_session_id: session_id.clone(),
            subagent_dialog_turn_id: dialog_turn_id.clone(),
            subagent_cancel_token: subagent_cancel_token.clone(),
            abort_handle,
            disarmed: false,
        };

        enum SubagentExecutionOutcome<T> {
            Completed(T),
            Cancelled,
            TimedOut,
        }

        // Dynamic timeout loop: deadline can be adjusted via watch channel.
        let execution_outcome = loop {
            let current_deadline = *deadline_rx.borrow_and_update();
            match current_deadline {
                Some(expires_at) if Instant::now() >= expires_at => {
                    break SubagentExecutionOutcome::TimedOut;
                }
                Some(expires_at) => {
                    let sleep = tokio::time::sleep_until(expires_at);
                    tokio::pin!(sleep);
                    tokio::select! {
                        join_result = &mut execution_task => {
                            break SubagentExecutionOutcome::Completed(join_result);
                        }
                        _ = subagent_cancel_token.cancelled() => {
                            break SubagentExecutionOutcome::Cancelled;
                        }
                        _ = &mut sleep => {
                            // Sleep expired; check if deadline was updated.
                            continue;
                        }
                        _ = deadline_rx.changed() => {
                            // Deadline changed externally; re-evaluate.
                            // If sender was dropped, treat as no timeout and
                            // let execution_task/cancel_token branches handle it.
                            continue;
                        }
                    }
                }
                None => {
                    // No timeout (disabled).
                    tokio::select! {
                        join_result = &mut execution_task => {
                            break SubagentExecutionOutcome::Completed(join_result);
                        }
                        _ = subagent_cancel_token.cancelled() => {
                            break SubagentExecutionOutcome::Cancelled;
                        }
                        _ = deadline_rx.changed() => {
                            // Deadline was set; re-evaluate.
                            // If sender was dropped, remain in no-timeout mode
                            // and let execution_task/cancel_token branches handle it.
                            continue;
                        }
                    }
                }
            }
        };

        let execution_outcome_label = match &execution_outcome {
            SubagentExecutionOutcome::Completed(_) => "completed",
            SubagentExecutionOutcome::Cancelled => "cancelled",
            SubagentExecutionOutcome::TimedOut => "timed_out",
        };
        debug!(
            "Subagent execution outcome resolved: agent_type={}, session_id={}, dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, parent_tool_call_id={}, outcome={}, duration_ms={}",
            agent_type,
            session_id,
            dialog_turn_id,
            parent_session_id,
            parent_dialog_turn_id,
            parent_tool_call_id,
            execution_outcome_label,
            subagent_started_at.elapsed().as_millis()
        );

        let result = match execution_outcome {
            SubagentExecutionOutcome::Completed(join_result) => match join_result {
                Ok(result) => result,
                Err(error) => {
                    let join_error = VoidError::tool(format!(
                        "Subagent '{}' failed to join: {}",
                        agent_type, error
                    ));
                    Self::persist_failed_dialog_turn(
                        self.event_queue.as_ref(),
                        self.session_manager.as_ref(),
                        None,
                        &session_id,
                        &dialog_turn_id,
                        &join_error,
                    )
                    .await;
                    Self::finalize_persisted_turn_in_workspace_if_needed(
                        self.session_manager.as_ref(),
                        &session_id,
                        &dialog_turn_id,
                        turn_index,
                        &agent_type,
                        &user_input_text,
                        subagent_workspace_path.as_deref(),
                        subagent_session_storage_path.as_deref(),
                        Some(crate::service::session::TurnStatus::Error),
                        None,
                    )
                    .await;
                    error!(
                        "Subagent execution failed to join: agent_type={}, session={}, error={}",
                        agent_type, session_id, error
                    );

                    if let Err(cleanup_err) = self.cleanup_subagent_resources(&session_id).await {
                        warn!(
                            "Failed to cleanup subagent resources after join failure: session={}, error={}",
                            session_id, cleanup_err
                        );
                    }
                    let mut registry = self.subagent_timeout_registry.write().await;
                    registry.remove(&session_id);

                    execution_scope.disarm();
                    return Err(join_error);
                }
            },
            SubagentExecutionOutcome::Cancelled => {
                warn!(
                    "Stopping subagent execution after cancellation: agent_type={}, session={}, dialog_turn_id={}",
                    agent_type, session_id, dialog_turn_id
                );
                subagent_cancel_token.cancel();

                if let Err(error) = self
                    .execution_engine
                    .cancel_dialog_turn(&dialog_turn_id)
                    .await
                {
                    warn!(
                        "Failed to cancel subagent dialog turn after cancellation: dialog_turn_id={}, error={}",
                        dialog_turn_id, error
                    );
                }

                if let Err(error) = tool_pipeline
                    .cancel_dialog_turn_tools(&dialog_turn_id)
                    .await
                {
                    warn!(
                        "Failed to cancel subagent tools after cancellation: dialog_turn_id={}, error={}",
                        dialog_turn_id, error
                    );
                }

                match tokio::time::timeout(SUBAGENT_TIMEOUT_GRACE_PERIOD, &mut execution_task).await
                {
                    Ok(Ok(Ok(_))) | Ok(Ok(Err(_))) => {}
                    Ok(Err(error)) => {
                        warn!(
                            "Subagent join failed during cancellation grace period: agent_type={}, session={}, error={}",
                            agent_type, session_id, error
                        );
                        execution_task.abort();
                    }
                    Err(_) => {
                        warn!(
                            "Subagent did not stop within cancellation grace period, aborting task: agent_type={}, session={}",
                            agent_type, session_id
                        );
                        execution_task.abort();
                    }
                }

                Self::persist_cancelled_dialog_turn(
                    self.event_queue.as_ref(),
                    self.session_manager.as_ref(),
                    None,
                    &session_id,
                    &dialog_turn_id,
                )
                .await;
                Self::finalize_persisted_turn_in_workspace_if_needed(
                    self.session_manager.as_ref(),
                    &session_id,
                    &dialog_turn_id,
                    turn_index,
                    &agent_type,
                    &user_input_text,
                    subagent_workspace_path.as_deref(),
                    subagent_session_storage_path.as_deref(),
                    Some(crate::service::session::TurnStatus::Cancelled),
                    None,
                )
                .await;

                if let Err(cleanup_err) = self.cleanup_subagent_resources(&session_id).await {
                    warn!(
                        "Failed to cleanup subagent resources after cancellation: session={}, error={}",
                        session_id, cleanup_err
                    );
                }
                let mut registry = self.subagent_timeout_registry.write().await;
                registry.remove(&session_id);

                execution_scope.disarm();
                return Err(VoidError::Cancelled(
                    "Subagent task has been cancelled".to_string(),
                ));
            }
            SubagentExecutionOutcome::TimedOut => {
                warn!(
                    "Stopping subagent execution after timeout: agent_type={}, session={}, dialog_turn_id={}",
                    agent_type, session_id, dialog_turn_id
                );
                subagent_cancel_token.cancel();

                if let Err(error) = self
                    .execution_engine
                    .cancel_dialog_turn(&dialog_turn_id)
                    .await
                {
                    warn!(
                        "Failed to cancel subagent dialog turn after timeout: dialog_turn_id={}, error={}",
                        dialog_turn_id, error
                    );
                }

                if let Err(error) = tool_pipeline
                    .cancel_dialog_turn_tools(&dialog_turn_id)
                    .await
                {
                    warn!(
                        "Failed to cancel subagent tools after timeout: dialog_turn_id={}, error={}",
                        dialog_turn_id, error
                    );
                }

                let partial_timeout_result = match tokio::time::timeout(
                    SUBAGENT_TIMEOUT_GRACE_PERIOD,
                    &mut execution_task,
                )
                .await
                {
                    Ok(Ok(Ok(exec_result))) => {
                        let (_status, response_text) = Self::persist_completed_dialog_turn(
                            self.session_manager.as_ref(),
                            None,
                            &session_id,
                            &dialog_turn_id,
                            &exec_result,
                        )
                        .await;
                        Self::finalize_persisted_turn_in_workspace_if_needed(
                            self.session_manager.as_ref(),
                            &session_id,
                            &dialog_turn_id,
                            turn_index,
                            &agent_type,
                            &user_input_text,
                            subagent_workspace_path.as_deref(),
                            subagent_session_storage_path.as_deref(),
                            Some(crate::service::session::TurnStatus::Completed),
                            None,
                        )
                        .await;
                        if response_text.trim().is_empty() {
                            None
                        } else {
                            Some(SubagentResult::partial_timeout(
                                response_text,
                                timeout_error_message.clone(),
                            ))
                        }
                    }
                    Ok(Ok(Err(error))) => {
                        debug!(
                            "Subagent returned error during timeout grace period: agent_type={}, session={}, error={}",
                            agent_type, session_id, error
                        );
                        None
                    }
                    Ok(Err(error)) => {
                        warn!(
                            "Subagent join failed during timeout grace period: agent_type={}, session={}, error={}",
                            agent_type, session_id, error
                        );
                        execution_task.abort();
                        None
                    }
                    Err(_) => {
                        warn!(
                            "Subagent did not stop within timeout grace period, aborting task: agent_type={}, session={}",
                            agent_type, session_id
                        );
                        execution_task.abort();
                        None
                    }
                };

                if let Some(mut partial_result) = partial_timeout_result {
                    warn!(
                        "Subagent timed out with partial output: agent_type={}, session={}, text_len={}",
                        agent_type,
                        session_id,
                        partial_result.text.len()
                    );
                    if let Some(parent_info) = subagent_parent_info.as_ref() {
                        let event = self.session_manager.record_subagent_partial_timeout(
                            &parent_info.session_id,
                            &parent_info.dialog_turn_id,
                            &agent_type,
                            &partial_result.text,
                            Some("timeout"),
                        );
                        partial_result = partial_result.with_ledger_event_id(event.event_id);
                    }
                    if let Err(cleanup_err) = self.cleanup_subagent_resources(&session_id).await {
                        warn!(
                            "Failed to cleanup subagent resources after partial timeout: session={}, error={}",
                            session_id, cleanup_err
                        );
                    }
                    let mut registry = self.subagent_timeout_registry.write().await;
                    registry.remove(&session_id);

                    execution_scope.disarm();
                    return Ok(partial_result);
                }

                let timeout_error = VoidError::Timeout(timeout_error_message.clone());
                Self::persist_failed_dialog_turn(
                    self.event_queue.as_ref(),
                    self.session_manager.as_ref(),
                    None,
                    &session_id,
                    &dialog_turn_id,
                    &timeout_error,
                )
                .await;
                Self::finalize_persisted_turn_in_workspace_if_needed(
                    self.session_manager.as_ref(),
                    &session_id,
                    &dialog_turn_id,
                    turn_index,
                    &agent_type,
                    &user_input_text,
                    subagent_workspace_path.as_deref(),
                    subagent_session_storage_path.as_deref(),
                    Some(crate::service::session::TurnStatus::Error),
                    None,
                )
                .await;

                if let Err(cleanup_err) = self.cleanup_subagent_resources(&session_id).await {
                    warn!(
                        "Failed to cleanup subagent resources after timeout: session={}, error={}",
                        session_id, cleanup_err
                    );
                }
                let mut registry = self.subagent_timeout_registry.write().await;
                registry.remove(&session_id);

                execution_scope.disarm();
                return Err(VoidError::Timeout(timeout_error_message.clone()));
            }
        };

        // cleanup_guard automatically cleans up token on scope exit (via Drop trait)

        // Persist turn lifecycle before cleaning up the hidden subagent runtime.
        let (workspace_turn_status, response_text) = match result {
            Ok(exec_result) => {
                Self::persist_completed_dialog_turn(
                    self.session_manager.as_ref(),
                    None,
                    &session_id,
                    &dialog_turn_id,
                    &exec_result,
                )
                .await
            }
            Err(e) => {
                let turn_status = if matches!(&e, VoidError::Cancelled(_)) {
                    Self::persist_cancelled_dialog_turn(
                        self.event_queue.as_ref(),
                        self.session_manager.as_ref(),
                        None,
                        &session_id,
                        &dialog_turn_id,
                    )
                    .await
                } else {
                    Self::persist_failed_dialog_turn(
                        self.event_queue.as_ref(),
                        self.session_manager.as_ref(),
                        None,
                        &session_id,
                        &dialog_turn_id,
                        &e,
                    )
                    .await
                };
                Self::finalize_persisted_turn_in_workspace_if_needed(
                    self.session_manager.as_ref(),
                    &session_id,
                    &dialog_turn_id,
                    turn_index,
                    &agent_type,
                    &user_input_text,
                    subagent_workspace_path.as_deref(),
                    subagent_session_storage_path.as_deref(),
                    Some(turn_status),
                    None,
                )
                .await;
                error!(
                    "Subagent execution failed: session={}, error={}",
                    session_id, e
                );

                if let Err(cleanup_err) = self.cleanup_subagent_resources(&session_id).await {
                    warn!(
                        "Failed to cleanup subagent resources: session={}, error={}",
                        session_id, cleanup_err
                    );
                }
                let mut registry = self.subagent_timeout_registry.write().await;
                registry.remove(&session_id);

                execution_scope.disarm();
                return Err(e);
            }
        };
        Self::finalize_persisted_turn_in_workspace_if_needed(
            self.session_manager.as_ref(),
            &session_id,
            &dialog_turn_id,
            turn_index,
            &agent_type,
            &user_input_text,
            subagent_workspace_path.as_deref(),
            subagent_session_storage_path.as_deref(),
            Some(workspace_turn_status),
            None,
        )
        .await;

        // Clean up subagent session resources after successful execution
        debug!(
            "Subagent successful execution produced final text: agent_type={}, session_id={}, dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, parent_tool_call_id={}, text_len={}, duration_ms={}",
            agent_type,
            session_id,
            dialog_turn_id,
            parent_session_id,
            parent_dialog_turn_id,
            parent_tool_call_id,
            response_text.len(),
            subagent_started_at.elapsed().as_millis()
        );
        let cleanup_started_at = Instant::now();
        debug!(
            "Subagent cleanup starting after successful execution: agent_type={}, session_id={}, dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, parent_tool_call_id={}",
            agent_type,
            session_id,
            dialog_turn_id,
            parent_session_id,
            parent_dialog_turn_id,
            parent_tool_call_id
        );
        if let Err(e) = self.cleanup_subagent_resources(&session_id).await {
            warn!(
                "Failed to cleanup subagent resources: session={}, error={}",
                session_id, e
            );
        } else {
            debug!(
                "Subagent cleanup completed after successful execution: agent_type={}, session_id={}, dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, parent_tool_call_id={}, cleanup_duration_ms={}",
                agent_type,
                session_id,
                dialog_turn_id,
                parent_session_id,
                parent_dialog_turn_id,
                parent_tool_call_id,
                cleanup_started_at.elapsed().as_millis()
            );
        }
        debug!(
            "Subagent timeout registry removal starting: agent_type={}, session_id={}, dialog_turn_id={}",
            agent_type, session_id, dialog_turn_id
        );
        let mut registry = self.subagent_timeout_registry.write().await;
        registry.remove(&session_id);
        debug!(
            "Subagent timeout registry removal completed: agent_type={}, session_id={}, dialog_turn_id={}, total_duration_ms={}",
            agent_type,
            session_id,
            dialog_turn_id,
            subagent_started_at.elapsed().as_millis()
        );

        debug!(
            "Subagent result returning to caller: agent_type={}, session_id={}, dialog_turn_id={}, parent_session_id={}, parent_dialog_turn_id={}, parent_tool_call_id={}, status=completed, text_len={}, total_duration_ms={}",
            agent_type,
            session_id,
            dialog_turn_id,
            parent_session_id,
            parent_dialog_turn_id,
            parent_tool_call_id,
            response_text.len(),
            subagent_started_at.elapsed().as_millis()
        );
        execution_scope.disarm();
        Ok(SubagentResult::completed(response_text))
    }

    pub async fn capture_fork_agent_context_snapshot(
        &self,
        parent_session_id: &str,
    ) -> VoidResult<ForkAgentContextSnapshot> {
        let parent_session = self
            .session_manager
            .get_session(parent_session_id)
            .ok_or_else(|| {
                VoidError::NotFound(format!("Parent session not found: {}", parent_session_id))
            })?;
        let context_messages = self.load_session_context_messages(&parent_session).await?;
        ForkAgentContextSnapshot::from_parent_session(&parent_session, context_messages)
    }

    async fn ensure_hidden_btw_session(
        &self,
        request_id: &str,
        parent_session_id: &str,
        child_session_id: &str,
        child_session_name: Option<&str>,
    ) -> VoidResult<Session> {
        let parent_session = self
            .session_manager
            .get_session(parent_session_id)
            .ok_or_else(|| {
                VoidError::NotFound(format!("Parent session not found: {parent_session_id}"))
            })?;

        if let Some(session) = self.session_manager.get_session(child_session_id) {
            validate_btw_child_session(&parent_session, &session)?;
            return Ok(session);
        }

        let workspace_path = parent_session
            .config
            .workspace_path
            .as_deref()
            .ok_or_else(|| {
                VoidError::Validation(format!(
                    "Parent session has no workspace path: {parent_session_id}"
                ))
            })?;
        if let Some(metadata) = self
            .session_manager
            .load_session_metadata(Path::new(workspace_path), child_session_id)
            .await?
        {
            let relationship = metadata.relationship.as_ref().ok_or_else(|| {
                VoidError::Validation(format!(
                    "Persisted BTW child has no typed lineage: {child_session_id}"
                ))
            })?;
            if relationship.kind.as_ref() != Some(&SessionRelationshipKind::Btw)
                || relationship.parent_session_id.as_deref() != Some(parent_session_id)
            {
                return Err(VoidError::Validation(format!(
                    "Persisted session {child_session_id} is not a child of BTW parent {parent_session_id}"
                )));
            }
            let restored = self
                .session_manager
                .restore_internal_session(Path::new(workspace_path), child_session_id)
                .await?;
            validate_btw_child_session(&parent_session, &restored)?;
            return Ok(restored);
        }

        let snapshot = self
            .capture_fork_agent_context_snapshot(parent_session_id)
            .await?;
        let session_name = child_session_name
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or("Side thread")
            .to_string();
        let child_session = self
            .session_manager
            .create_session_with_id_and_details(
                Some(child_session_id.to_string()),
                session_name,
                snapshot.parent_agent_type.clone(),
                snapshot.build_child_session_config(None),
                Some(format!("session-{}", snapshot.parent_session_id)),
                SessionKind::EphemeralChild,
            )
            .await?;

        self.session_manager
            .replace_context_messages(&child_session.session_id, snapshot.messages)
            .await;
        self.session_manager
            .persist_session_lineage(
                &child_session.session_id,
                build_btw_session_relationship(parent_session_id, request_id),
            )
            .await?;

        Ok(child_session)
    }

    pub async fn start_hidden_btw_turn(
        &self,
        request_id: &str,
        parent_session_id: &str,
        child_session_id: &str,
        child_session_name: Option<&str>,
        question: &str,
        model_id: Option<&str>,
        image_contexts: Option<Vec<ImageContextData>>,
    ) -> VoidResult<String> {
        if request_id.trim().is_empty() {
            return Err(VoidError::Validation("request_id is required".to_string()));
        }
        if parent_session_id.trim().is_empty() {
            return Err(VoidError::Validation(
                "parent_session_id is required".to_string(),
            ));
        }
        if child_session_id.trim().is_empty() {
            return Err(VoidError::Validation(
                "child_session_id is required".to_string(),
            ));
        }
        if question.trim().is_empty() {
            return Err(VoidError::Validation("question is required".to_string()));
        }

        let child_session = self
            .ensure_hidden_btw_session(
                request_id,
                parent_session_id,
                child_session_id,
                child_session_name,
            )
            .await?;

        if let Some(model_id) = model_id
            .map(str::trim)
            .filter(|model_id| !model_id.is_empty())
        {
            self.session_manager
                .update_session_model_id(child_session_id, model_id)
                .await?;
        }

        let turn_id = format!("btw-turn-{}", request_id.trim());
        let user_message_metadata = Some(serde_json::json!({
            "kind": "btw",
            "parentSessionId": parent_session_id,
        }));

        self.start_dialog_turn_internal(
            child_session_id.to_string(),
            build_btw_user_input(question),
            Some(question.trim().to_string()),
            image_contexts,
            Some(turn_id.clone()),
            child_session.agent_type.clone(),
            child_session.config.workspace_path.clone(),
            DialogSubmissionPolicy::for_source(DialogTriggerSource::DesktopApi)
                .with_skip_tool_confirmation(true),
            user_message_metadata,
            true,
        )
        .await?;

        Ok(turn_id)
    }

    async fn resolve_hidden_subagent_execution_request(
        &self,
        mut request: SubagentExecutionRequest,
        inherited_session_config: Option<SessionConfig>,
        team_member_skill_policy: Option<&TeamMemberSkillPolicySnapshot>,
    ) -> VoidResult<HiddenSubagentExecutionRequest> {
        let authority_parent = request.subagent_parent_info.clone();
        let has_typed_team_member_authority = team_member_skill_policy.is_some()
            && TeamDelegationBudget::from_context(&request.context).is_some();
        request.delegation_policy = resolve_child_delegation_policy(
            request.delegation_policy,
            &mut request.context,
            &authority_parent,
            has_typed_team_member_authority,
        );
        let task_description = request.task_description.trim().to_string();
        if task_description.is_empty() {
            return Err(VoidError::Validation(
                "task_description is required when creating a subagent session".to_string(),
            ));
        }

        let model_id = request
            .model_id
            .as_deref()
            .map(str::trim)
            .filter(|model_id| !model_id.is_empty())
            .map(str::to_string);
        let created_by = Some(format!(
            "session-{}",
            request.subagent_parent_info.session_id
        ));

        match request.context_mode {
            SubagentContextMode::Fresh => {
                let agent_type = request.subagent_type.ok_or_else(|| {
                    VoidError::Validation(
                        "subagent_type is required when context_mode is 'fresh'".to_string(),
                    )
                })?;
                let workspace_path = request.workspace_path.ok_or_else(|| {
                    VoidError::Validation(
                        "workspace_path is required when creating a fresh subagent session"
                            .to_string(),
                    )
                })?;
                let session_config = if let Some(mut inherited) = inherited_session_config {
                    if inherited.workspace_path.as_deref() != Some(workspace_path.as_str()) {
                        return Err(VoidError::Validation(
                            "inherited subagent session config does not match the requested workspace"
                                .to_string(),
                        ));
                    }
                    if model_id.is_some() {
                        inherited.model_id = model_id;
                    }
                    inherited
                } else {
                    Self::build_session_config_for_workspace(workspace_path, model_id).await
                };

                Ok(HiddenSubagentExecutionRequest {
                    session_name: format!("Subagent: {}", task_description),
                    agent_type,
                    session_config,
                    initial_messages: vec![Message::user(task_description.clone())],
                    user_input_text: task_description,
                    created_by,
                    subagent_parent_info: Some(request.subagent_parent_info),
                    context: request.context,
                    delegation_policy: request.delegation_policy,
                    runtime_tool_restrictions: runtime_tool_restrictions_for_delegation_policy(
                        request.delegation_policy,
                    ),
                    prompt_cache_source_session_id: None,
                    persistent_task: None,
                    resume_session_id: None,
                    requested_dialog_turn_id: None,
                    prepared_turn: None,
                    team_member_skill_policy: None,
                })
            }
            SubagentContextMode::Fork => {
                if inherited_session_config.is_some() {
                    return Err(VoidError::Validation(
                        "inherited session config is only supported for fresh Team subagents"
                            .to_string(),
                    ));
                }
                if request.subagent_type.is_some() {
                    return Err(VoidError::Validation(
                        "subagent_type is not allowed when context_mode is 'fork'".to_string(),
                    ));
                }
                if request.workspace_path.is_some() {
                    return Err(VoidError::Validation(
                        "workspace_path is not allowed when context_mode is 'fork'".to_string(),
                    ));
                }
                if model_id.is_some() {
                    return Err(VoidError::Validation(
                        "model_id is not allowed when context_mode is 'fork'".to_string(),
                    ));
                }

                let snapshot = self
                    .capture_fork_agent_context_snapshot(&request.subagent_parent_info.session_id)
                    .await?;
                let mut initial_messages = snapshot.messages.clone();
                initial_messages.push(Message::user(fork_subagent_system_reminder()));
                initial_messages.push(Message::user(task_description.clone()));

                Ok(HiddenSubagentExecutionRequest {
                    session_name: format!("Fork: {}", task_description),
                    agent_type: snapshot.parent_agent_type.clone(),
                    session_config: snapshot.build_child_session_config(None),
                    initial_messages,
                    user_input_text: task_description,
                    created_by,
                    subagent_parent_info: Some(request.subagent_parent_info),
                    context: request.context,
                    delegation_policy: request.delegation_policy,
                    runtime_tool_restrictions: runtime_tool_restrictions_for_delegation_policy(
                        request.delegation_policy,
                    ),
                    prompt_cache_source_session_id: Some(snapshot.parent_session_id),
                    persistent_task: None,
                    resume_session_id: None,
                    requested_dialog_turn_id: None,
                    prepared_turn: None,
                    team_member_skill_policy: None,
                })
            }
        }
    }

    /// Execute subagent task directly
    /// DialogTurnStarted event not needed for now
    ///
    /// Returns SubagentResult with the final text response
    async fn ensure_team_worker_budget_available(
        &self,
        parent_session_id: &str,
        authority: &SubagentLaunchAuthority,
    ) -> VoidResult<()> {
        if authority.kind != SubagentLaunchAuthorityKind::TeamWorker {
            return Ok(());
        }
        let lineage = authority.team_lineage.as_ref().ok_or_else(|| {
            VoidError::Validation("Team worker launch is missing durable lineage".to_string())
        })?;
        let root_tasks = self
            .session_manager
            .list_subagent_tasks(&lineage.root_parent_session_id)
            .await?;
        let parent_authority = root_tasks
            .iter()
            .find(|task| {
                task.child_session_id.as_deref() == Some(parent_session_id)
                    && task.launch_authority.as_ref().is_some_and(|candidate| {
                        team_member_authority_matches_worker(candidate, lineage)
                    })
            })
            .and_then(|task| task.launch_authority.as_ref())
            .ok_or_else(|| {
                VoidError::Validation(
                    "Team worker launch cannot resolve its parent member authority".to_string(),
                )
            })?;
        parent_authority
            .validate()
            .map_err(|error| VoidError::Validation(error.to_string()))?;
        let budget = parent_authority.task_spawn_budget;
        let max_parallel_workers = parent_authority.max_parallel_workers;
        let existing = self
            .session_manager
            .list_subagent_tasks(parent_session_id)
            .await?;
        let request_ids = existing
            .iter()
            .filter_map(|task| task.launch_authority.as_ref())
            .filter(|candidate| team_worker_authority_matches_lineage(candidate, lineage))
            .map(|candidate| candidate.delegation_request_id.as_str())
            .collect::<HashSet<_>>();
        if request_ids.contains(authority.delegation_request_id.as_str()) {
            return Ok(());
        }
        if request_ids.len() >= usize::from(budget) {
            return Err(VoidError::Validation(format!(
                "Team member worker Task budget exhausted ({budget})"
            )));
        }
        let active_request_ids = existing
            .iter()
            .filter(|task| !task.status.is_terminal())
            .filter_map(|task| task.launch_authority.as_ref())
            .filter(|candidate| team_worker_authority_matches_lineage(candidate, lineage))
            .map(|candidate| candidate.delegation_request_id.as_str())
            .collect::<HashSet<_>>();
        if active_request_ids.len() >= usize::from(max_parallel_workers) {
            return Err(VoidError::Validation(format!(
                "Team member parallel worker limit reached ({max_parallel_workers})"
            )));
        }
        Ok(())
    }

    pub(crate) async fn execute_subagent(
        &self,
        request: SubagentExecutionRequest,
        cancel_token: Option<&CancellationToken>,
        timeout_seconds: Option<u64>,
    ) -> VoidResult<SubagentResult> {
        let context_mode = match request.context_mode {
            SubagentContextMode::Fresh => SubagentTaskContextMode::Fresh,
            SubagentContextMode::Fork => SubagentTaskContextMode::Fork,
        };
        let mut request = self
            .resolve_hidden_subagent_execution_request(request, None, None)
            .await?;
        let launch_parent = request.subagent_parent_info.clone().ok_or_else(|| {
            VoidError::Validation("subagent launch is missing parent identity".to_string())
        })?;
        let launch_authority = launch_authority_for_request(
            request.delegation_policy,
            &request.context,
            &launch_parent,
            TeamDelegationBudget::from_context(&request.context),
        )?;
        let _budget_guard = if launch_authority.kind == SubagentLaunchAuthorityKind::TeamWorker {
            Some(self.delegation_budget_guard.lock().await)
        } else {
            None
        };
        self.ensure_team_worker_budget_available(&launch_parent.session_id, &launch_authority)
            .await?;
        let persistent_task =
            request
                .subagent_parent_info
                .as_ref()
                .map(|parent| PersistentSubagentTaskContext {
                    task_id: if launch_authority.kind == SubagentLaunchAuthorityKind::TeamWorker {
                        format!("team-worker-{}", parent.tool_call_id)
                    } else {
                        format!("subagent-{}", uuid::Uuid::new_v4())
                    },
                    parent_session_id: parent.session_id.clone(),
                });
        if let Some(task) = persistent_task.as_ref() {
            let mut record = SubagentTaskRecord::new_typed(
                task.task_id.clone(),
                task.parent_session_id.clone(),
                request.user_input_text.clone(),
                format!("synchronous-execution-{}", uuid::Uuid::new_v4()),
                SubagentTaskExecutionMode::Synchronous,
                context_mode,
                SubagentTaskReplaySafety::Idempotent,
                now_ms(),
            );
            record.launch_spec = Some(SubagentTaskLaunchSpec {
                agent_type: request.agent_type.clone(),
                parent_dialog_turn_id: launch_parent.dialog_turn_id.clone(),
                parent_tool_call_id: launch_parent.tool_call_id.clone(),
                context: durable_subagent_context(&request.context),
                allow_subagent_spawn: false,
                nesting_depth: request.delegation_policy.nesting_depth,
                timeout_seconds,
                team_member_skill_policy: request.team_member_skill_policy.clone(),
            });
            record.launch_authority = Some(launch_authority.clone());
            match self.session_manager.create_subagent_task(record).await {
                Ok(_) => request.persistent_task = Some(task.clone()),
                Err(error) if launch_authority.kind == SubagentLaunchAuthorityKind::TeamWorker => {
                    return Err(error);
                }
                Err(error) => {
                    warn!(
                        "Failed to persist synchronous subagent task; execution semantics are unchanged: parent_session_id={}, task_id={}, error={}",
                        task.parent_session_id, task.task_id, error
                    );
                }
            }
        }
        drop(_budget_guard);

        let outcome = self
            .execute_hidden_subagent_internal(request, cancel_token, timeout_seconds)
            .await;
        if let Some(task) = persistent_task {
            let (status, result, failure) = background_subagent_terminal_facts(outcome.as_ref());
            if let Err(error) = self
                .session_manager
                .transition_subagent_task(
                    &task.parent_session_id,
                    &task.task_id,
                    status,
                    None,
                    None,
                    result,
                    failure,
                    now_ms(),
                )
                .await
            {
                warn!(
                    "Failed to persist synchronous subagent terminal state; execution result is unchanged: parent_session_id={}, task_id={}, error={}",
                    task.parent_session_id, task.task_id, error
                );
            }
        }
        outcome
    }

    async fn deliver_persisted_background_task(
        &self,
        parent_session_id: &str,
        task_id: &str,
        agent_type: &str,
        task_description: &str,
        context: HashMap<String, String>,
        delivery_text: Option<String>,
    ) -> VoidResult<()> {
        let delivery_lease_id = format!("delivery-lease-{}", uuid::Uuid::new_v4());
        let delivery_owner = format!("delivery-worker-{}", uuid::Uuid::new_v4());
        let Some(claimed_task) = self
            .session_manager
            .claim_subagent_task_delivery(
                parent_session_id,
                task_id,
                delivery_lease_id.clone(),
                delivery_owner,
                now_ms(),
                SUBAGENT_DELIVERY_LEASE_DURATION_MS,
            )
            .await?
        else {
            return Ok(());
        };

        let parent_session = self
            .session_manager
            .get_session(parent_session_id)
            .ok_or_else(|| {
                VoidError::NotFound(format!(
                    "Parent session not restored for subagent delivery: {parent_session_id}"
                ))
            })?;
        let parent_workspace_path = parent_session.config.workspace_path.clone();
        let mut metadata = build_background_subagent_result_metadata(
            task_id,
            agent_type,
            task_description,
            context,
        );
        if let Some(object) = metadata.as_object_mut() {
            object.insert(
                "deliveryIdempotencyKey".to_string(),
                serde_json::Value::String(claimed_task.delivery_idempotency_key.clone()),
            );
        }

        let delivery_result = if let Some(scheduler) = super::scheduler::get_global_scheduler() {
            scheduler
                .deliver_background_result_idempotent(
                    parent_session_id.to_string(),
                    parent_session.agent_type,
                    parent_workspace_path,
                    delivery_text.unwrap_or_else(|| {
                        format_persisted_background_subagent_delivery_text(
                            &claimed_task,
                            agent_type,
                        )
                    }),
                    None,
                    Some(metadata),
                    claimed_task.delivery_idempotency_key,
                )
                .await
        } else {
            Err("Scheduler not initialized for background result delivery".to_string())
        };

        match delivery_result {
            Ok(external_receipt) => {
                self.session_manager
                    .complete_subagent_task_delivery(
                        parent_session_id,
                        task_id,
                        &delivery_lease_id,
                        external_receipt,
                        now_ms(),
                    )
                    .await?;
            }
            Err(error) => {
                self.session_manager
                    .fail_subagent_task_delivery(
                        parent_session_id,
                        task_id,
                        &delivery_lease_id,
                        error,
                        now_ms(),
                    )
                    .await?;
            }
        }
        Ok(())
    }

    async fn block_subagent_recovery(
        &self,
        task: &SubagentTaskRecord,
        code: SubagentTaskRecoveryBlockCode,
        detail: impl Into<String>,
    ) {
        let detail = detail.into();
        if let Err(error) = self
            .session_manager
            .block_subagent_task_recovery(
                &task.parent_session_id,
                &task.task_id,
                code,
                detail.clone(),
                now_ms(),
            )
            .await
        {
            warn!(
                "Failed to persist typed subagent recovery block: parent_session_id={}, task_id={}, detail={}, error={}",
                task.parent_session_id, task.task_id, detail, error
            );
        }
    }

    /// Consume the persisted recovery queue for one restored parent session.
    ///
    /// Delivery claims and interrupted-to-running transitions are persisted
    /// before work starts, so concurrent restore entry points still elect one
    /// winner.
    pub async fn consume_subagent_task_recovery_queue(
        &self,
        parent_session_id: &str,
    ) -> VoidResult<()> {
        let recovery_queue = self
            .session_manager
            .list_subagent_task_recovery_queue(parent_session_id)
            .await?;
        for mut task in recovery_queue {
            if task.status.is_terminal() {
                let agent_type = task
                    .launch_spec
                    .as_ref()
                    .map(|spec| spec.agent_type.as_str())
                    .unwrap_or("subagent");
                let context = task
                    .launch_spec
                    .as_ref()
                    .map(|spec| spec.context.clone().into_iter().collect())
                    .unwrap_or_default();
                if let Err(error) = self
                    .deliver_persisted_background_task(
                        parent_session_id,
                        &task.task_id,
                        agent_type,
                        &task.objective,
                        context,
                        None,
                    )
                    .await
                {
                    warn!(
                        "Recovered subagent delivery attempt failed: parent_session_id={}, task_id={}, error={}",
                        parent_session_id, task.task_id, error
                    );
                }
                continue;
            }

            if task.status != SubagentTaskStatus::Interrupted {
                continue;
            }
            if task.durable_checkpoint.is_none() {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::MissingCheckpoint,
                    "interrupted subagent has no durable checkpoint",
                )
                .await;
                continue;
            };
            let Some(initial_launch_spec) = task.launch_spec.as_ref() else {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::MissingLaunchSpec,
                    "legacy interrupted subagent has no persisted launch spec",
                )
                .await;
                continue;
            };
            if let Err(error) = initial_launch_spec.validate() {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::InvalidLaunchSpec,
                    error.to_string(),
                )
                .await;
                continue;
            }
            let persisted_context = initial_launch_spec
                .context
                .clone()
                .into_iter()
                .collect::<HashMap<_, _>>();
            if durable_subagent_context(&persisted_context) != initial_launch_spec.context {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::InvalidLaunchSpec,
                    "persisted launch context violates the durable context policy",
                )
                .await;
                continue;
            }

            let requires_team_preflight =
                match launch_requires_team_recovery_preflight(initial_launch_spec) {
                    Ok(value) => value,
                    Err(detail) => {
                        self.block_subagent_recovery(
                            &task,
                            SubagentTaskRecoveryBlockCode::InvalidLaunchSpec,
                            detail,
                        )
                        .await;
                        continue;
                    }
                };
            if requires_team_preflight {
                let Some(preflight) = self.team_member_recovery_preflight.get().cloned() else {
                    self.block_subagent_recovery(
                        &task,
                        SubagentTaskRecoveryBlockCode::ResumeFailed,
                        "Team-tagged launch cannot recover before the Team preflight bridge is installed",
                    )
                    .await;
                    continue;
                };
                let ticket = match preflight.preflight(task.clone()).await {
                    Ok(ticket) => ticket,
                    Err(error) => {
                        let code = match error.code {
                            TeamMemberRecoveryPreflightErrorCode::MissingLaunchSpec => {
                                SubagentTaskRecoveryBlockCode::MissingLaunchSpec
                            }
                            TeamMemberRecoveryPreflightErrorCode::InvalidLaunchSpec => {
                                SubagentTaskRecoveryBlockCode::InvalidLaunchSpec
                            }
                            TeamMemberRecoveryPreflightErrorCode::ResumeFailed => {
                                SubagentTaskRecoveryBlockCode::ResumeFailed
                            }
                        };
                        self.block_subagent_recovery(&task, code, error.detail)
                            .await;
                        continue;
                    }
                };
                let Some(authoritative_task) = self
                    .session_manager
                    .get_subagent_task(parent_session_id, &task.task_id)
                    .await?
                else {
                    self.block_subagent_recovery(
                        &task,
                        SubagentTaskRecoveryBlockCode::ResumeFailed,
                        "Team recovery task disappeared after preflight",
                    )
                    .await;
                    continue;
                };
                if !recovery_ticket_matches_task(&ticket, &authoritative_task) {
                    self.block_subagent_recovery(
                        &task,
                        SubagentTaskRecoveryBlockCode::InvalidLaunchSpec,
                        "authoritative Team task changed after recovery preflight",
                    )
                    .await;
                    continue;
                }
                task = authoritative_task;
            }

            let checkpoint_ref = task
                .durable_checkpoint
                .as_ref()
                .expect("validated interrupted task retains a checkpoint");
            let launch_spec = task
                .launch_spec
                .as_ref()
                .expect("validated interrupted task retains a launch spec");
            let Some(child_session_id) = task.child_session_id.as_deref() else {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::MissingChildSession,
                    "interrupted subagent launch spec has no child session",
                )
                .await;
                continue;
            };
            if checkpoint_ref.session_id != child_session_id {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::InvalidCheckpoint,
                    "durable checkpoint does not belong to the persisted child session",
                )
                .await;
                continue;
            }
            let parent_session = self
                .session_manager
                .get_session(parent_session_id)
                .ok_or_else(|| {
                    VoidError::NotFound(format!(
                        "Parent session not restored for subagent recovery: {parent_session_id}"
                    ))
                })?;
            let parent_config = parent_session.config.clone();
            let workspace_binding = Self::build_workspace_binding(&parent_config).await;
            let session_storage_path = match resolved_subagent_resume_storage_path(
                &parent_config,
                workspace_binding.as_ref(),
            ) {
                Ok(path) => path,
                Err(error) => {
                    self.block_subagent_recovery(
                        &task,
                        SubagentTaskRecoveryBlockCode::ResumeFailed,
                        format!("parent workspace cannot be resolved for child restore: {error}"),
                    )
                    .await;
                    continue;
                }
            };
            let child_session = match self
                .session_manager
                .restore_internal_session(&session_storage_path, child_session_id)
                .await
            {
                Ok(session) => session,
                Err(error) => {
                    self.block_subagent_recovery(
                        &task,
                        SubagentTaskRecoveryBlockCode::MissingChildSession,
                        format!("persisted child session cannot be restored: {error}"),
                    )
                    .await;
                    continue;
                }
            };
            let context_messages = self
                .session_manager
                .get_context_messages(child_session_id)
                .await?;
            let Some(persisted_checkpoint) = self
                .session_manager
                .load_recovery_checkpoint(child_session_id)
                .await?
            else {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::MissingCheckpoint,
                    "durable checkpoint payload is missing",
                )
                .await;
                continue;
            };
            if persisted_checkpoint.checkpoint_id != checkpoint_ref.checkpoint_id
                || self
                    .session_manager
                    .validate_recovery_checkpoint(
                        child_session_id,
                        persisted_checkpoint.catalog_generation,
                        &context_messages,
                    )
                    .await
                    .is_err()
            {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::InvalidCheckpoint,
                    "durable checkpoint failed identity or context validation",
                )
                .await;
                continue;
            }

            match self
                .session_manager
                .transition_subagent_task(
                    parent_session_id,
                    &task.task_id,
                    SubagentTaskStatus::Running,
                    Some(child_session_id.to_string()),
                    Some("resuming from durable checkpoint".to_string()),
                    None,
                    None,
                    now_ms(),
                )
                .await
            {
                Ok(_) => {}
                Err(error) => {
                    let claim_was_lost = self
                        .session_manager
                        .get_subagent_task(parent_session_id, &task.task_id)
                        .await?
                        .is_some_and(|current| current.status == SubagentTaskStatus::Running);
                    if claim_was_lost {
                        continue;
                    }
                    self.block_subagent_recovery(
                        &task,
                        SubagentTaskRecoveryBlockCode::ResumeFailed,
                        format!("failed to claim interrupted subagent for resume: {error}"),
                    )
                    .await;
                    continue;
                }
            }

            let Some(coordinator) = get_global_coordinator() else {
                self.block_subagent_recovery(
                    &task,
                    SubagentTaskRecoveryBlockCode::ResumeFailed,
                    "coordinator is unavailable after recovery claim",
                )
                .await;
                continue;
            };
            let task_id = task.task_id.clone();
            let parent_session_id = parent_session_id.to_string();
            let task_description = task.objective.clone();
            let launch_spec = launch_spec.clone();
            let delegation_policy = delegation_policy_from_task(&task);
            let child_session_id = child_session_id.to_string();
            tokio::spawn(async move {
                let request = HiddenSubagentExecutionRequest {
                    session_name: child_session.session_name.clone(),
                    agent_type: launch_spec.agent_type.clone(),
                    session_config: child_session.config.clone(),
                    initial_messages: context_messages,
                    user_input_text:
                        "<system_reminder>Resume the interrupted task from the validated durable checkpoint. Do not restart completed work.</system_reminder>"
                            .to_string(),
                    created_by: child_session.created_by.clone(),
                    subagent_parent_info: Some(SubagentParentInfo {
                        tool_call_id: launch_spec.parent_tool_call_id.clone(),
                        session_id: parent_session_id.clone(),
                        dialog_turn_id: launch_spec.parent_dialog_turn_id.clone(),
                    }),
                    context: launch_spec.context.clone().into_iter().collect(),
                    delegation_policy,
                    runtime_tool_restrictions: runtime_tool_restrictions_for_delegation_policy(
                        delegation_policy,
                    ),
                    prompt_cache_source_session_id: None,
                    persistent_task: Some(PersistentSubagentTaskContext {
                        task_id: task_id.clone(),
                        parent_session_id: parent_session_id.clone(),
                    }),
                    resume_session_id: Some(child_session_id),
                    requested_dialog_turn_id: None,
                    prepared_turn: None,
                    team_member_skill_policy: launch_spec.team_member_skill_policy.clone(),
                };
                let outcome = coordinator
                    .execute_hidden_subagent_internal(request, None, launch_spec.timeout_seconds)
                    .await;
                let (status, result, failure) =
                    background_subagent_terminal_facts(outcome.as_ref());
                if let Err(error) = coordinator
                    .session_manager
                    .transition_subagent_task(
                        &parent_session_id,
                        &task_id,
                        status,
                        None,
                        None,
                        result,
                        failure,
                        now_ms(),
                    )
                    .await
                {
                    warn!(
                        "Failed to persist resumed subagent terminal state: parent_session_id={}, task_id={}, error={}",
                        parent_session_id, task_id, error
                    );
                    return;
                }
                if let Err(error) = coordinator
                    .deliver_persisted_background_task(
                        &parent_session_id,
                        &task_id,
                        &launch_spec.agent_type,
                        &task_description,
                        launch_spec.context.into_iter().collect(),
                        None,
                    )
                    .await
                {
                    warn!(
                        "Failed to deliver resumed subagent result: parent_session_id={}, task_id={}, error={}",
                        parent_session_id, task_id, error
                    );
                }
            });
        }
        Ok(())
    }

    fn schedule_subagent_task_recovery_sweep(&self, parent_session_id: &str) {
        let Some(coordinator) = get_global_coordinator() else {
            warn!(
                "Cannot schedule subagent recovery sweep before coordinator initialization: parent_session_id={}",
                parent_session_id
            );
            return;
        };
        let parent_session_id = parent_session_id.to_string();
        tokio::spawn(async move {
            if let Err(error) = coordinator
                .consume_subagent_task_recovery_queue(&parent_session_id)
                .await
            {
                warn!(
                    "Subagent recovery sweep failed: parent_session_id={}, error={}",
                    parent_session_id, error
                );
            }
        });
    }

    pub(crate) async fn start_background_subagent(
        &self,
        request: SubagentExecutionRequest,
        timeout_seconds: Option<u64>,
    ) -> VoidResult<BackgroundSubagentStartResult> {
        let background_task_id = if request.delegation_policy.tier() == DelegationTier::TeamWorker {
            format!("team-worker-{}", request.subagent_parent_info.tool_call_id)
        } else {
            format!("bg-subagent-{}", uuid::Uuid::new_v4())
        };
        self.ensure_background_subagent_with_task_id(background_task_id, request, timeout_seconds)
            .await
    }

    /// Idempotently create and start one background subagent task with a caller-owned,
    /// stable task ID. A matching persisted task is reused; a mismatched launch is
    /// rejected so retrying another Team member can never attach to this task.
    pub(crate) async fn ensure_background_subagent_with_task_id(
        &self,
        background_task_id: String,
        request: SubagentExecutionRequest,
        timeout_seconds: Option<u64>,
    ) -> VoidResult<BackgroundSubagentStartResult> {
        self.ensure_background_subagent_with_task_id_and_config(
            background_task_id,
            request,
            timeout_seconds,
            None,
            None,
        )
        .await
    }

    /// Team-only entry point for initial member launch. The parent session owns
    /// the complete workspace/runtime configuration; path-based reconstruction
    /// would lose workspace and remote connection identity.
    pub(crate) async fn ensure_team_background_subagent_with_task_id(
        &self,
        background_task_id: String,
        request: SubagentExecutionRequest,
        parent_session_config: SessionConfig,
        timeout_seconds: Option<u64>,
        team_member_skill_policy: TeamMemberSkillPolicySnapshot,
    ) -> VoidResult<BackgroundSubagentStartResult> {
        team_member_skill_policy
            .validate()
            .map_err(|error| VoidError::Validation(error.to_string()))?;
        self.ensure_background_subagent_with_task_id_and_config(
            background_task_id,
            request,
            timeout_seconds,
            Some(parent_session_config),
            Some(team_member_skill_policy),
        )
        .await
    }

    async fn ensure_background_subagent_with_task_id_and_config(
        &self,
        background_task_id: String,
        request: SubagentExecutionRequest,
        timeout_seconds: Option<u64>,
        inherited_session_config: Option<SessionConfig>,
        team_member_skill_policy: Option<TeamMemberSkillPolicySnapshot>,
    ) -> VoidResult<BackgroundSubagentStartResult> {
        if background_task_id.trim().is_empty() {
            return Err(VoidError::Validation(
                "background subagent task ID is required".to_string(),
            ));
        }
        let mut request = self
            .resolve_hidden_subagent_execution_request(
                request,
                inherited_session_config,
                team_member_skill_policy.as_ref(),
            )
            .await?;
        request.team_member_skill_policy = team_member_skill_policy;
        let agent_type = request.agent_type.clone();
        let subagent_parent_info = request.subagent_parent_info.clone().ok_or_else(|| {
            VoidError::Validation(
                "subagent_parent_info is required when creating a background subagent session"
                    .to_string(),
            )
        })?;
        if self
            .session_manager
            .get_session(&subagent_parent_info.session_id)
            .is_none()
        {
            return Err(VoidError::NotFound(format!(
                "Parent session not found: {}",
                subagent_parent_info.session_id
            )));
        }
        let background_execution_owner = format!("background-execution-{}", uuid::Uuid::new_v4());
        let background_task_id_for_delivery = background_task_id.clone();
        let task_description = request.user_input_text.clone();
        let request_context = request.context.clone();
        let launch_authority = launch_authority_for_request(
            request.delegation_policy,
            &request_context,
            &subagent_parent_info,
            TeamDelegationBudget::from_context(&request_context),
        )?;
        let _budget_guard = if launch_authority.kind == SubagentLaunchAuthorityKind::TeamWorker {
            Some(self.delegation_budget_guard.lock().await)
        } else {
            None
        };
        self.ensure_team_worker_budget_available(
            &subagent_parent_info.session_id,
            &launch_authority,
        )
        .await?;
        let mut task_record = SubagentTaskRecord::new_typed(
            background_task_id.clone(),
            subagent_parent_info.session_id.clone(),
            task_description.clone(),
            background_execution_owner,
            SubagentTaskExecutionMode::Background,
            if request.prompt_cache_source_session_id.is_some() {
                SubagentTaskContextMode::Fork
            } else {
                SubagentTaskContextMode::Fresh
            },
            SubagentTaskReplaySafety::Idempotent,
            now_ms(),
        );
        task_record.launch_spec = Some(SubagentTaskLaunchSpec {
            agent_type: agent_type.clone(),
            parent_dialog_turn_id: subagent_parent_info.dialog_turn_id.clone(),
            parent_tool_call_id: subagent_parent_info.tool_call_id.clone(),
            context: durable_subagent_context(&request_context),
            // Keep the legacy field fail-closed. Typed authority below owns
            // Team-member Task delegation and recovery.
            allow_subagent_spawn: false,
            nesting_depth: request.delegation_policy.nesting_depth,
            timeout_seconds,
            team_member_skill_policy: request.team_member_skill_policy.clone(),
        });
        task_record.launch_authority = Some(launch_authority);
        if let Some(existing) = self
            .session_manager
            .get_subagent_task(&subagent_parent_info.session_id, &background_task_id)
            .await?
        {
            if !background_subagent_launch_matches(&existing, &task_record) {
                return Err(VoidError::Validation(format!(
                    "background subagent task ID {} is already bound to different launch facts",
                    background_task_id
                )));
            }
            return Ok(BackgroundSubagentStartResult {
                background_task_id,
                reused: true,
            });
        }
        match self
            .session_manager
            .create_subagent_task(task_record.clone())
            .await
        {
            Ok(_) => {}
            Err(create_error) => {
                let Some(existing) = self
                    .session_manager
                    .get_subagent_task(&subagent_parent_info.session_id, &background_task_id)
                    .await?
                else {
                    return Err(create_error);
                };
                if !background_subagent_launch_matches(&existing, &task_record) {
                    return Err(VoidError::Validation(format!(
                        "background subagent task ID {} is already bound to different launch facts",
                        background_task_id
                    )));
                }
                return Ok(BackgroundSubagentStartResult {
                    background_task_id,
                    reused: true,
                });
            }
        }
        drop(_budget_guard);
        request.persistent_task = Some(PersistentSubagentTaskContext {
            task_id: background_task_id.clone(),
            parent_session_id: subagent_parent_info.session_id.clone(),
        });
        let coordinator = get_global_coordinator()
            .ok_or_else(|| VoidError::service("Coordinator not initialized".to_string()))?;
        let parent_cancel_token = self
            .execution_engine
            .cancel_token_for_dialog_turn(&subagent_parent_info.dialog_turn_id)
            .map(|token| token.child_token());

        tokio::spawn(async move {
            let outcome = coordinator
                .execute_hidden_subagent_internal(
                    request,
                    parent_cancel_token.as_ref(),
                    timeout_seconds,
                )
                .await;
            let delivery_text = match &outcome {
                Ok(result) => format_background_subagent_delivery_text(
                    &background_task_id_for_delivery,
                    &agent_type,
                    Ok(result),
                ),
                Err(error) => format_background_subagent_delivery_text(
                    &background_task_id_for_delivery,
                    &agent_type,
                    Err(error),
                ),
            };
            let (terminal_status, result, failure) =
                background_subagent_terminal_facts(outcome.as_ref());

            if let Err(error) = coordinator
                .session_manager
                .transition_subagent_task(
                    &subagent_parent_info.session_id,
                    &background_task_id_for_delivery,
                    terminal_status,
                    None,
                    None,
                    result,
                    failure,
                    now_ms(),
                )
                .await
            {
                warn!(
                    "Failed to persist terminal background subagent task state; result will not be delivered: background_task_id={}, parent_session_id={}, error={}",
                    background_task_id_for_delivery,
                    subagent_parent_info.session_id,
                    error
                );
                return;
            }

            if let Err(error) = coordinator
                .deliver_persisted_background_task(
                    &subagent_parent_info.session_id,
                    &background_task_id_for_delivery,
                    &agent_type,
                    &task_description,
                    request_context,
                    Some(delivery_text),
                )
                .await
            {
                warn!(
                    "Failed to persist background subagent delivery outcome: background_task_id={}, parent_session_id={}, error={}",
                    background_task_id_for_delivery,
                    subagent_parent_info.session_id,
                    error
                );
            }
        });

        Ok(BackgroundSubagentStartResult {
            background_task_id,
            reused: false,
        })
    }

    /// Starts one Team member follow-up in the existing hidden child session.
    /// The durable launch specification remains authoritative and this path
    /// deliberately carries no persistent task context, so a message cannot
    /// create, replace, or transition the member's original task record.
    pub(crate) async fn follow_up_team_subagent(
        self: &Arc<Self>,
        task: &SubagentTaskRecord,
        child_session: &Session,
        operation_id: &str,
        message: String,
    ) -> VoidResult<PreparedTurnDisposition> {
        if operation_id.trim().is_empty() {
            return Err(VoidError::Validation(
                "Team member follow-up operation id is required".to_string(),
            ));
        }
        if message.trim().is_empty() {
            return Err(VoidError::Validation(
                "Team member follow-up message is required".to_string(),
            ));
        }
        let launch_spec = task.launch_spec.as_ref().ok_or_else(|| {
            VoidError::Validation(
                "Team member task has no durable launch specification".to_string(),
            )
        })?;
        launch_spec
            .validate()
            .map_err(|error| VoidError::Validation(error.to_string()))?;
        if launch_spec.allow_subagent_spawn {
            return Err(VoidError::Validation(
                "Team member launch policy cannot allow recursive subagent delegation".to_string(),
            ));
        }
        if task.child_session_id.as_deref() != Some(child_session.session_id.as_str()) {
            return Err(VoidError::Validation(
                "Team member task is not bound to the requested child session".to_string(),
            ));
        }
        if child_session.kind != SessionKind::Subagent
            || child_session.agent_type != launch_spec.agent_type
        {
            return Err(VoidError::Validation(
                "Team member child session does not match the durable launch identity".to_string(),
            ));
        }

        let child_session_id = child_session.session_id.clone();
        let latest_child = self
            .session_manager
            .get_session(&child_session_id)
            .ok_or_else(|| {
                VoidError::NotFound(format!(
                    "Team member child session not found: {child_session_id}"
                ))
            })?;
        if team_follow_up_child_is_busy(
            task.status,
            &latest_child.state,
            self.active_subagent_executions
                .contains_key(&child_session_id),
        ) {
            return Err(VoidError::Validation(
                "Team member child session is busy; wait for the active turn to finish".to_string(),
            ));
        }
        let initial_messages = self.load_session_context_messages(&latest_child).await?;
        let prepared_turn = self
            .session_manager
            .prepare_dialog_turn_with_existing_context(
                &child_session_id,
                launch_spec.agent_type.clone(),
                message.clone(),
                team_follow_up_dialog_turn_id(operation_id),
                None,
            )
            .await?;
        if !should_spawn_team_follow_up(prepared_turn.disposition) {
            return Ok(PreparedTurnDisposition::Reused);
        }

        let delegation_policy = delegation_policy_from_task(task);
        let request = HiddenSubagentExecutionRequest {
            session_name: latest_child.session_name.clone(),
            agent_type: launch_spec.agent_type.clone(),
            session_config: latest_child.config.clone(),
            initial_messages,
            user_input_text: message,
            created_by: latest_child.created_by.clone(),
            subagent_parent_info: Some(SubagentParentInfo {
                tool_call_id: launch_spec.parent_tool_call_id.clone(),
                session_id: task.parent_session_id.clone(),
                dialog_turn_id: launch_spec.parent_dialog_turn_id.clone(),
            }),
            context: launch_spec.context.clone().into_iter().collect(),
            delegation_policy,
            runtime_tool_restrictions: runtime_tool_restrictions_for_delegation_policy(
                delegation_policy,
            ),
            prompt_cache_source_session_id: None,
            persistent_task: None,
            resume_session_id: Some(child_session_id.clone()),
            requested_dialog_turn_id: None,
            prepared_turn: Some(prepared_turn),
            team_member_skill_policy: launch_spec.team_member_skill_policy.clone(),
        };
        let timeout_seconds = launch_spec.timeout_seconds;
        let coordinator = Arc::clone(self);
        tokio::spawn(async move {
            if let Err(error) = coordinator
                .execute_hidden_subagent_internal(request, None, timeout_seconds)
                .await
            {
                warn!("Team member follow-up execution failed: {error}");
            }
        });
        Ok(PreparedTurnDisposition::Created)
    }

    /// Stops exactly one active subagent session after its caller has validated
    /// the durable task-to-session relationship. This deliberately does not
    /// broaden cancellation to the parent dialog turn.
    pub(crate) async fn stop_active_background_subagent_session(
        &self,
        parent_session_id: &str,
        parent_dialog_turn_id: &str,
        child_session_id: &str,
    ) -> VoidResult<bool> {
        let Some(active) = self
            .active_subagent_executions
            .get(child_session_id)
            .map(|entry| entry.value().clone())
        else {
            return Ok(false);
        };
        if active.parent_session_id != parent_session_id
            || active.parent_dialog_turn_id != parent_dialog_turn_id
        {
            return Err(VoidError::Validation(
                "active subagent does not belong to the requested parent turn".to_string(),
            ));
        }
        self.stop_active_subagent_execution(&active, "Team member stop requested")
            .await;
        Ok(true)
    }

    /// Clean up runtime-only subagent resources.
    ///
    /// Subagent sessions are now persisted so users can reopen them from the UI.
    /// This cleanup path must only release ephemeral runtime resources such as
    /// snapshot bookkeeping; it must not delete the persisted session itself.
    async fn cleanup_subagent_resources(&self, session_id: &str) -> VoidResult<()> {
        let cleanup_started_at = Instant::now();
        debug!(
            "Starting subagent resource cleanup: session_id={}",
            session_id
        );

        // Clean up snapshot system resources
        if let Some(workspace_path) = self
            .session_manager
            .get_session(session_id)
            .and_then(|session| session.config.workspace_path.map(std::path::PathBuf::from))
        {
            debug!(
                "Subagent cleanup stage starting: session_id={}, stage=snapshot_cleanup, workspace_path={}",
                session_id,
                workspace_path.display()
            );
            let stage_started_at = Instant::now();
            if let Ok(snapshot_manager) =
                crate::service::snapshot::ensure_snapshot_manager_for_workspace(&workspace_path)
            {
                let snapshot_service = snapshot_manager.get_snapshot_service();
                let snapshot_service = snapshot_service.read().await;
                if let Err(e) = snapshot_service.accept_session(session_id).await {
                    warn!(
                        "Failed to cleanup snapshot system resources: session={}, error={}",
                        session_id, e
                    );
                } else {
                    debug!(
                        "Snapshot system resources cleaned up: session={}",
                        session_id
                    );
                }
            }
            debug!(
                "Subagent cleanup stage completed: session_id={}, stage=snapshot_cleanup, duration_ms={}",
                session_id,
                stage_started_at.elapsed().as_millis()
            );
        }

        debug!(
            "Subagent resource cleanup completed: session_id={}, duration_ms={}",
            session_id,
            cleanup_started_at.elapsed().as_millis()
        );
        Ok(())
    }

    /// Generate session title
    ///
    /// Use AI to generate a concise and accurate session title based on user message content.
    /// Also persists the title to the session backend. Callers that go through
    /// `start_dialog_turn` do NOT need to call this separately — first-message
    /// title generation is handled automatically inside `start_dialog_turn`.
    pub async fn generate_session_title(
        &self,
        session_id: &str,
        user_message: &str,
        max_length: Option<usize>,
    ) -> VoidResult<String> {
        let allow_ai = is_ai_session_title_generation_enabled().await;
        let resolved = self
            .session_manager
            .resolve_session_title(user_message, max_length, allow_ai)
            .await;

        self.session_manager
            .update_session_title(session_id, &resolved.title)
            .await?;

        let event = AgenticEvent::SessionTitleGenerated {
            session_id: session_id.to_string(),
            title: resolved.title.clone(),
            method: resolved.method.as_str().to_string(),
        };
        self.emit_event(event).await;

        debug!(
            "Session title generation event sent: session_id={}, title={}",
            session_id, resolved.title
        );

        Ok(resolved.title)
    }

    pub async fn update_session_title(&self, session_id: &str, title: &str) -> VoidResult<String> {
        let normalized = title.trim().to_string();
        if normalized.is_empty() {
            return Err(VoidError::validation(
                "Session title must not be empty".to_string(),
            ));
        }

        self.session_manager
            .update_session_title(session_id, &normalized)
            .await?;

        Ok(normalized)
    }

    pub async fn update_session_agent_type(
        &self,
        session_id: &str,
        agent_type: &str,
    ) -> VoidResult<()> {
        let normalized = Self::normalize_agent_type(agent_type);
        self.session_manager
            .update_session_agent_type(session_id, &normalized)
            .await
    }

    /// Update the session-level prompt-cache guard mode for the latest
    /// scheduler-accepted user submission.
    pub async fn update_last_submitted_agent_type(
        &self,
        session_id: &str,
        agent_type: &str,
    ) -> VoidResult<()> {
        let normalized = Self::normalize_agent_type(agent_type);
        self.session_manager
            .update_last_submitted_agent_type(session_id, &normalized)
            .await
    }

    /// Emit event
    async fn emit_event(&self, event: AgenticEvent) {
        let _ = self
            .event_queue
            .enqueue(event, Some(EventPriority::Normal))
            .await;
    }

    pub(crate) async fn emit_queued_turn_validation_failed(
        &self,
        session_id: &str,
        turn_id: &str,
        error: &str,
    ) {
        let validation_error = VoidError::validation(error.to_string());
        self.emit_event(AgenticEvent::DialogTurnFailed {
            session_id: session_id.to_string(),
            turn_id: turn_id.to_string(),
            error: error.to_string(),
            error_category: Some(validation_error.error_category()),
            error_detail: Some(validation_error.error_detail()),
        })
        .await;
    }

    /// Emit a `SessionModelAutoMigrated` event with `High` priority so the
    /// frontend can refresh its model selector and surface a notice promptly.
    ///
    /// Callers (e.g. `SessionManager`) reach this method via
    /// [`get_global_coordinator`] so they don't need to thread an
    /// `Arc<EventQueue>` through every constructor.
    pub async fn emit_session_model_auto_migrated(
        &self,
        session_id: &str,
        previous_model_id: &str,
        new_model_id: &str,
        reason: &str,
    ) {
        let event = AgenticEvent::SessionModelAutoMigrated {
            session_id: session_id.to_string(),
            previous_model_id: previous_model_id.to_string(),
            new_model_id: new_model_id.to_string(),
            reason: reason.to_string(),
        };
        let _ = self
            .event_queue
            .enqueue(event, Some(EventPriority::High))
            .await;
    }

    pub async fn emit_subagent_task_changed(&self, task: SubagentTaskRecord) {
        let event = AgenticEvent::SubagentTaskChanged {
            session_id: task.parent_session_id.clone(),
            task,
        };
        let _ = self
            .event_queue
            .enqueue(event, Some(EventPriority::High))
            .await;
    }

    pub async fn emit_deep_review_queue_state_changed(
        &self,
        session_id: &str,
        turn_id: &str,
        queue_state: DeepReviewQueueState,
    ) {
        let event = AgenticEvent::DeepReviewQueueStateChanged {
            session_id: session_id.to_string(),
            turn_id: turn_id.to_string(),
            queue_state,
        };
        let _ = self
            .event_queue
            .enqueue(event, Some(EventPriority::High))
            .await;
    }

    pub async fn emit_tool_event(&self, event: AgenticEvent) {
        let _ = self
            .event_queue
            .enqueue(event, Some(EventPriority::High))
            .await;
    }

    /// Get SessionManager reference (for advanced features like mode management)
    pub fn get_session_manager(&self) -> &Arc<SessionManager> {
        &self.session_manager
    }

    /// Persist a completed `/btw` side-question turn into an existing child session.
    #[allow(clippy::too_many_arguments)]
    pub async fn persist_btw_turn(
        &self,
        workspace_path: &Path,
        child_session_id: &str,
        request_id: &str,
        question: &str,
        full_text: &str,
        parent_session_id: &str,
        parent_dialog_turn_id: Option<&str>,
        parent_turn_index: Option<usize>,
    ) -> VoidResult<()> {
        self.session_manager
            .persist_btw_turn(
                workspace_path,
                child_session_id,
                request_id,
                question,
                full_text,
                parent_session_id,
                parent_dialog_turn_id,
                parent_turn_index,
            )
            .await
    }

    /// Set global coordinator (called during initialization)
    ///
    /// Skips if global coordinator already exists
    pub fn set_global(coordinator: Arc<ConversationCoordinator>) {
        match GLOBAL_COORDINATOR.set(coordinator) {
            Ok(_) => {
                debug!("Global coordinator set");
            }
            Err(_) => {
                debug!("Global coordinator already exists, skipping set");
            }
        }
    }
}

fn resolve_agent_submission_turn_id(
    request: &void_runtime_ports::AgentSubmissionRequest,
) -> String {
    request
        .turn_id
        .as_deref()
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            request
                .metadata
                .get("turnId")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
}

#[async_trait::async_trait]
impl void_runtime_ports::AgentSubmissionPort for ConversationCoordinator {
    async fn create_session(
        &self,
        request: void_runtime_ports::AgentSessionCreateRequest,
    ) -> void_runtime_ports::PortResult<void_runtime_ports::AgentSessionCreateResult> {
        let workspace_path = request.workspace_path.clone().ok_or_else(|| {
            void_runtime_ports::PortError::new(
                void_runtime_ports::PortErrorKind::InvalidRequest,
                "workspace_path is required to create an agent session",
            )
        })?;

        let session = self
            .create_session_with_workspace(
                None,
                request.session_name,
                request.agent_type,
                SessionConfig {
                    workspace_path: Some(workspace_path.clone()),
                    ..Default::default()
                },
                workspace_path,
            )
            .await
            .map_err(|error| {
                void_runtime_ports::PortError::new(
                    void_runtime_ports::PortErrorKind::Backend,
                    error.to_string(),
                )
            })?;

        Ok(void_runtime_ports::AgentSessionCreateResult {
            session_id: session.session_id,
            agent_type: session.agent_type,
        })
    }

    async fn submit_message(
        &self,
        request: void_runtime_ports::AgentSubmissionRequest,
    ) -> void_runtime_ports::PortResult<void_runtime_ports::AgentSubmissionResult> {
        if !request.attachments.is_empty() {
            return Err(void_runtime_ports::PortError::new(
                void_runtime_ports::PortErrorKind::InvalidRequest,
                "agent submission port does not yet accept generic attachments",
            ));
        }

        let session = self
            .get_session_manager()
            .get_session(&request.session_id)
            .ok_or_else(|| {
                void_runtime_ports::PortError::new(
                    void_runtime_ports::PortErrorKind::NotFound,
                    format!("session not found: {}", request.session_id),
                )
            })?;

        let turn_id = resolve_agent_submission_turn_id(&request);

        let trigger_source = request.source.unwrap_or(DialogTriggerSource::Bot);
        let user_message_metadata = if request.metadata.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(request.metadata.clone()))
        };

        self.start_dialog_turn(
            request.session_id,
            request.message.clone(),
            Some(request.message),
            Some(turn_id.clone()),
            session.agent_type.clone(),
            session.config.workspace_path.clone(),
            DialogSubmissionPolicy::for_source(trigger_source),
            user_message_metadata,
        )
        .await
        .map_err(|error| {
            void_runtime_ports::PortError::new(
                void_runtime_ports::PortErrorKind::Backend,
                error.to_string(),
            )
        })?;

        Ok(void_runtime_ports::AgentSubmissionResult {
            turn_id,
            accepted: true,
        })
    }

    async fn resolve_session_agent_type(
        &self,
        session_id: &str,
    ) -> void_runtime_ports::PortResult<Option<String>> {
        Ok(self
            .get_session_manager()
            .get_session(session_id)
            .map(|session| session.agent_type.clone()))
    }
}

#[async_trait::async_trait]
impl void_runtime_ports::AgentTurnCancellationPort for ConversationCoordinator {
    async fn cancel_turn(
        &self,
        request: void_runtime_ports::AgentTurnCancellationRequest,
    ) -> void_runtime_ports::PortResult<void_runtime_ports::AgentTurnCancellationResult> {
        let session_id = request.session_id;
        if let Some(turn_id) = request.turn_id {
            self.cancel_dialog_turn(&session_id, &turn_id)
                .await
                .map_err(|error| {
                    void_runtime_ports::PortError::new(
                        void_runtime_ports::PortErrorKind::Backend,
                        error.to_string(),
                    )
                })?;

            return Ok(void_runtime_ports::AgentTurnCancellationResult {
                session_id,
                turn_id: Some(turn_id),
                requested: true,
            });
        }

        let wait_timeout = Duration::from_millis(request.wait_timeout_ms.unwrap_or(1500));
        let cancelled_turn_id = self
            .cancel_active_turn_for_session(&session_id, wait_timeout)
            .await
            .map_err(|error| {
                void_runtime_ports::PortError::new(
                    void_runtime_ports::PortErrorKind::Backend,
                    error.to_string(),
                )
            })?;
        let requested = cancelled_turn_id.is_some();

        Ok(void_runtime_ports::AgentTurnCancellationResult {
            session_id,
            turn_id: cancelled_turn_id,
            requested,
        })
    }
}

#[async_trait::async_trait]
impl void_runtime_ports::RemoteControlStatePort for ConversationCoordinator {
    async fn read_remote_control_state(
        &self,
        request: void_runtime_ports::RemoteControlStateRequest,
    ) -> void_runtime_ports::PortResult<Option<void_runtime_ports::RemoteControlStateSnapshot>>
    {
        let Some(session) = self.get_session_manager().get_session(&request.session_id) else {
            return Ok(None);
        };

        let mut metadata = serde_json::Map::new();
        let (state, active_turn_id) = match session.state {
            SessionState::Idle => (void_runtime_ports::RemoteControlSessionState::Idle, None),
            SessionState::Processing {
                current_turn_id,
                phase,
            } => {
                metadata.insert(
                    "phase".to_string(),
                    serde_json::Value::String(format!("{:?}", phase)),
                );
                (
                    void_runtime_ports::RemoteControlSessionState::Processing,
                    Some(current_turn_id),
                )
            }
            SessionState::Error { error, recoverable } => {
                metadata.insert("error".to_string(), serde_json::Value::String(error));
                metadata.insert(
                    "recoverable".to_string(),
                    serde_json::Value::Bool(recoverable),
                );
                (void_runtime_ports::RemoteControlSessionState::Error, None)
            }
        };

        Ok(Some(void_runtime_ports::RemoteControlStateSnapshot {
            session_id: request.session_id,
            state,
            active_turn_id,
            queue_depth: 0,
            metadata,
        }))
    }
}

#[async_trait::async_trait]
impl void_runtime_ports::SessionTranscriptReader for ConversationCoordinator {
    async fn read_session_transcript(
        &self,
        request: void_runtime_ports::SessionTranscriptRequest,
    ) -> void_runtime_ports::PortResult<void_runtime_ports::SessionTranscript> {
        let messages = self
            .get_messages(&request.session_id)
            .await
            .map_err(|error| {
                void_runtime_ports::PortError::new(
                    void_runtime_ports::PortErrorKind::Backend,
                    error.to_string(),
                )
            })?;

        let messages = messages
            .into_iter()
            .filter(|message| match request.turn_id.as_ref() {
                Some(turn_id) => message.metadata.turn_id.as_ref() == Some(turn_id),
                None => true,
            })
            .map(|message| {
                let role = match message.role {
                    crate::agentic::core::MessageRole::User => "user",
                    crate::agentic::core::MessageRole::Assistant => "assistant",
                    crate::agentic::core::MessageRole::Tool => "tool",
                    crate::agentic::core::MessageRole::System => "system",
                }
                .to_string();

                void_runtime_ports::TranscriptMessage {
                    role,
                    turn_id: message.metadata.turn_id,
                    content: serde_json::to_value(message.content).unwrap_or_default(),
                }
            })
            .collect();

        Ok(void_runtime_ports::SessionTranscript {
            session_id: request.session_id,
            messages,
        })
    }
}

async fn is_ai_session_title_generation_enabled() -> bool {
    match crate::service::config::get_global_config_service().await {
        Ok(service) => service
            .get_config::<bool>(Some("app.ai_experience.enable_session_title_generation"))
            .await
            .unwrap_or(true),
        Err(_) => true,
    }
}

// Global coordinator singleton
static GLOBAL_COORDINATOR: OnceLock<Arc<ConversationCoordinator>> = OnceLock::new();

/// Get global coordinator
///
/// Returns `None` if coordinator hasn't been initialized
pub fn get_global_coordinator() -> Option<Arc<ConversationCoordinator>> {
    GLOBAL_COORDINATOR.get().cloned()
}

#[cfg(test)]
mod tests {
    use super::{
        background_subagent_launch_matches, delegation_policy_from_task,
        execute_team_tool_after_checkpoint, install_team_lead_persona_resolver,
        install_team_member_recovery_preflight, install_team_tool_executor,
        launch_requires_team_recovery_preflight, normalize_subagent_max_concurrency,
        recovery_ticket_matches_task, remove_active_subagent_execution_if_generation_matches,
        resolve_agent_submission_turn_id, resolve_child_delegation_policy,
        resolved_subagent_resume_storage_path, runtime_tool_restrictions_for_delegation_policy,
        should_spawn_team_follow_up, team_follow_up_child_is_busy, team_follow_up_dialog_turn_id,
        team_member_authority_matches_worker, team_worker_authority_matches_lineage,
        ActiveSubagentExecution, ConversationCoordinator, SubagentParentInfo,
        TeamMemberRecoveryPreflight, TeamMemberRecoveryPreflightError, TeamMemberRecoveryTicket,
        TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY,
    };
    use crate::agentic::session::PersistedToolCallAuthority;
    use crate::agentic::session::PreparedTurnDisposition;
    use crate::agentic::team_tool_runtime::{
        TeamAction, TeamToolExecutionOutcome, TeamToolExecutor, TeamToolInvocation, TeamToolRequest,
    };
    use crate::service::remote_ssh::workspace_state::init_remote_workspace_manager;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, OnceLock};
    use void_core_types::{
        SubagentTaskCheckpointRef, SubagentTaskLaunchSpec, SubagentTaskRecord,
        SubagentTaskRecoveryBlockCode, SubagentTaskRecoveryState, SubagentTaskStatus,
        TeamMemberSkillPolicySnapshot,
    };
    use void_runtime_ports::{AgentSubmissionRequest, AgentSubmissionSource, DelegationPolicy};

    struct TestTeamLeadPersonaResolver;

    struct CountingTeamToolExecutor {
        calls: Arc<AtomicUsize>,
    }

    struct TestTeamMemberRecoveryPreflight;

    struct RecoveryQueueWorkspace {
        root: PathBuf,
    }

    impl RecoveryQueueWorkspace {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "void-team-recovery-queue-test-{}",
                uuid::Uuid::new_v4().simple()
            ));
            std::fs::create_dir_all(&root).expect("recovery test workspace should exist");
            Self { root }
        }
    }

    impl Drop for RecoveryQueueWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    async fn recovery_queue_coordinator() -> (
        RecoveryQueueWorkspace,
        Arc<crate::agentic::session::SessionManager>,
        Arc<ConversationCoordinator>,
        String,
    ) {
        use crate::agentic::events::{EventQueue, EventRouter};
        use crate::agentic::execution::{
            ExecutionEngine, ExecutionEngineConfig, RoundExecutor, StreamProcessor,
        };
        use crate::agentic::persistence::PersistenceManager;
        use crate::agentic::session::{
            ContextCompressor, SessionContextStore, SessionManagerConfig,
        };
        use crate::agentic::tools::pipeline::{ToolPipeline, ToolStateManager};
        use crate::infrastructure::PathManager;

        let workspace = RecoveryQueueWorkspace::new();
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            workspace.root.join("user-root"),
        ));
        let persistence_manager = Arc::new(
            PersistenceManager::new(path_manager)
                .expect("recovery test persistence manager should initialize"),
        );
        let session_manager = Arc::new(crate::agentic::session::SessionManager::new(
            Arc::new(SessionContextStore::new()),
            persistence_manager,
            SessionManagerConfig {
                enable_persistence: true,
                ..Default::default()
            },
        ));
        let parent_session_id = format!("team-recovery-parent-{}", uuid::Uuid::new_v4().simple());
        session_manager
            .create_session_with_id(
                Some(parent_session_id.clone()),
                "Team recovery parent".to_string(),
                "agentic".to_string(),
                crate::agentic::SessionConfig {
                    workspace_path: Some(workspace.root.to_string_lossy().to_string()),
                    workspace_id: Some("team-recovery-workspace".to_string()),
                    ..Default::default()
                },
            )
            .await
            .expect("recovery parent session should persist");

        let event_queue = Arc::new(EventQueue::new(Default::default()));
        let event_router = Arc::new(EventRouter::new());
        let tool_state_manager = Arc::new(ToolStateManager::new(event_queue.clone()));
        let tool_pipeline = Arc::new(ToolPipeline::new(
            crate::agentic::tools::registry::get_global_tool_registry(),
            tool_state_manager,
            None,
        ));
        let stream_processor = Arc::new(StreamProcessor::new(event_queue.clone()));
        let round_executor = Arc::new(RoundExecutor::new(
            stream_processor,
            event_queue.clone(),
            tool_pipeline.clone(),
        ));
        let execution_engine = Arc::new(ExecutionEngine::new(
            round_executor,
            event_queue.clone(),
            session_manager.clone(),
            Arc::new(ContextCompressor::new(Default::default())),
            ExecutionEngineConfig::default(),
        ));
        let coordinator = Arc::new(ConversationCoordinator::new(
            session_manager.clone(),
            execution_engine,
            tool_pipeline,
            event_queue,
            event_router,
        ));
        (workspace, session_manager, coordinator, parent_session_id)
    }

    fn recovery_team_launch(
        include_all_markers: bool,
        policy: Option<TeamMemberSkillPolicySnapshot>,
    ) -> SubagentTaskLaunchSpec {
        let mut context = [
            ("teamDefinitionId", "definition"),
            ("teamDefinitionRevision", "revision"),
            ("teamInstanceId", "instance"),
            ("teamRunId", "run"),
            ("teamMemberId", "member"),
            ("teamPhaseId", "phase"),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect::<std::collections::BTreeMap<_, _>>();
        if !include_all_markers {
            context.retain(|key, _| key == "teamInstanceId");
        }
        SubagentTaskLaunchSpec {
            agent_type: "agent".to_string(),
            parent_dialog_turn_id: "turn".to_string(),
            parent_tool_call_id: "tool".to_string(),
            context,
            allow_subagent_spawn: false,
            nesting_depth: 1,
            timeout_seconds: None,
            team_member_skill_policy: policy,
        }
    }

    fn interrupted_recovery_task(
        parent_session_id: &str,
        task_id: &str,
        schema_version: u32,
        launch_spec: SubagentTaskLaunchSpec,
    ) -> SubagentTaskRecord {
        let child_session_id = format!("{task_id}-child");
        let mut task = SubagentTaskRecord::new(
            task_id.to_string(),
            parent_session_id.to_string(),
            format!("recover {task_id}"),
            "test-owner".to_string(),
            1,
        );
        task.schema_version = schema_version;
        task.status = SubagentTaskStatus::Interrupted;
        task.recovery_state = SubagentTaskRecoveryState::Queued;
        task.child_session_id = Some(child_session_id.clone());
        task.durable_checkpoint = Some(SubagentTaskCheckpointRef {
            checkpoint_id: format!("{task_id}-checkpoint"),
            session_id: child_session_id,
            checkpoint_version: 1,
        });
        task.launch_spec = Some(launch_spec);
        task
    }

    struct RecoveryQueuePreflight {
        session_manager: Arc<crate::agentic::session::SessionManager>,
        calls: Arc<AtomicUsize>,
    }

    #[async_trait::async_trait]
    impl TeamMemberRecoveryPreflight for RecoveryQueuePreflight {
        async fn preflight(
            &self,
            task: SubagentTaskRecord,
        ) -> Result<TeamMemberRecoveryTicket, TeamMemberRecoveryPreflightError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let launch = task
                .launch_spec
                .clone()
                .expect("Team recovery fixture always has a launch specification");
            if task.task_id == "legacy-team-task" {
                let mut expected_launch = launch;
                expected_launch.team_member_skill_policy = Some(
                    TeamMemberSkillPolicySnapshot::new(
                        "definition".to_string(),
                        "revision".to_string(),
                        "instance".to_string(),
                        "member".to_string(),
                        "agent".to_string(),
                        Vec::new(),
                    )
                    .expect("legacy fixture no_policy should be valid"),
                );
                self.session_manager
                    .compare_and_set_legacy_team_member_skill_policy(&task, &expected_launch)
                    .await
                    .map_err(|error| {
                        TeamMemberRecoveryPreflightError::resume_failed(error.to_string())
                    })?;
                return Err(TeamMemberRecoveryPreflightError::resume_failed(
                    "fixture stops after legacy policy migration",
                ));
            }

            self.session_manager
                .transition_subagent_task(
                    &task.parent_session_id,
                    &task.task_id,
                    SubagentTaskStatus::Failed,
                    task.child_session_id.clone(),
                    None,
                    None,
                    Some("fixture concurrent mutation".to_string()),
                    task.updated_at.saturating_add(1),
                )
                .await
                .map_err(|error| {
                    TeamMemberRecoveryPreflightError::resume_failed(error.to_string())
                })?;
            Ok(TeamMemberRecoveryTicket {
                parent_session_id: task.parent_session_id,
                task_id: task.task_id,
                child_session_id: task
                    .child_session_id
                    .expect("mutation fixture has a child session"),
                objective: task.objective,
                expected_launch: launch,
            })
        }
    }

    #[async_trait::async_trait]
    impl TeamMemberRecoveryPreflight for TestTeamMemberRecoveryPreflight {
        async fn preflight(
            &self,
            _task: SubagentTaskRecord,
        ) -> Result<TeamMemberRecoveryTicket, TeamMemberRecoveryPreflightError> {
            unreachable!("installation test does not execute the hook")
        }
    }

    #[async_trait::async_trait]
    impl TeamToolExecutor for CountingTeamToolExecutor {
        async fn execute_team_tool(
            &self,
            invocation: TeamToolInvocation,
        ) -> crate::util::errors::VoidResult<TeamToolExecutionOutcome> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(TeamToolExecutionOutcome {
                data: serde_json::json!({"input": invocation.exact_input}),
                result_for_assistant: Some("accepted".to_string()),
            })
        }
    }

    fn team_tool_invocation() -> TeamToolInvocation {
        let exact_input = serde_json::json!({
            "action": "start",
            "workflowId": "delivery",
            "objective": "ship safely"
        });
        TeamToolInvocation {
            request: TeamToolRequest {
                action: TeamAction::Start,
                workflow_id: Some("delivery".to_string()),
                objective: Some("ship safely".to_string()),
                team_run_id: None,
                member_id: None,
                message: None,
            },
            exact_input,
            parent_session_id: "session-1".to_string(),
            parent_dialog_turn_id: "turn-1".to_string(),
            parent_round_id: "round-1".to_string(),
            parent_tool_call_id: "tool-1".to_string(),
            team_definition_id: "definition".to_string(),
            team_definition_revision: "r1".to_string(),
            team_instance_id: "instance".to_string(),
            lead_persona_id: "lead".to_string(),
        }
    }

    #[async_trait::async_trait]
    impl crate::agentic::execution::TeamLeadPersonaResolver for TestTeamLeadPersonaResolver {
        async fn resolve_team_lead_persona(
            &self,
            _request: crate::agentic::execution::TeamLeadPersonaResolveRequest,
        ) -> crate::util::errors::VoidResult<crate::agentic::execution::ResolvedTeamLeadPersona>
        {
            Err(crate::util::errors::VoidError::validation(
                "unused test resolver".to_string(),
            ))
        }
    }

    #[test]
    fn team_lead_persona_resolver_can_only_be_installed_once() {
        let slot = std::sync::OnceLock::new();
        install_team_lead_persona_resolver(&slot, std::sync::Arc::new(TestTeamLeadPersonaResolver))
            .expect("first startup installation should succeed");
        let error = install_team_lead_persona_resolver(
            &slot,
            std::sync::Arc::new(TestTeamLeadPersonaResolver),
        )
        .expect_err("a later resolver must not replace startup authority");
        assert!(error.to_string().contains("already installed"));
    }

    #[test]
    fn team_member_recovery_preflight_is_once_only_and_markers_fail_closed() {
        let slot: OnceLock<Arc<dyn TeamMemberRecoveryPreflight>> = OnceLock::new();
        install_team_member_recovery_preflight(&slot, Arc::new(TestTeamMemberRecoveryPreflight))
            .expect("first recovery preflight installation should succeed");
        assert!(install_team_member_recovery_preflight(
            &slot,
            Arc::new(TestTeamMemberRecoveryPreflight),
        )
        .is_err());

        let mut launch = SubagentTaskLaunchSpec {
            agent_type: "agent".into(),
            parent_dialog_turn_id: "turn".into(),
            parent_tool_call_id: "tool".into(),
            context: Default::default(),
            allow_subagent_spawn: false,
            nesting_depth: 1,
            timeout_seconds: None,
            team_member_skill_policy: None,
        };
        assert!(!launch_requires_team_recovery_preflight(&launch).unwrap());
        launch
            .context
            .insert("teamInstanceId".into(), "instance".into());
        assert!(launch_requires_team_recovery_preflight(&launch).is_err());
        for (key, value) in [
            ("teamDefinitionId", "definition"),
            ("teamDefinitionRevision", "revision"),
            ("teamInstanceId", "instance"),
            ("teamRunId", "run"),
            ("teamMemberId", "member"),
            ("teamPhaseId", "phase"),
        ] {
            launch.context.insert(key.into(), value.into());
        }
        assert!(launch_requires_team_recovery_preflight(&launch).unwrap());

        launch.context.clear();
        launch.team_member_skill_policy = Some(
            void_core_types::TeamMemberSkillPolicySnapshot::new(
                "definition".into(),
                "revision".into(),
                "instance".into(),
                "member".into(),
                "agent".into(),
                vec![],
            )
            .unwrap(),
        );
        assert!(launch_requires_team_recovery_preflight(&launch).is_err());
    }

    #[test]
    fn team_member_recovery_ticket_requires_an_exact_authoritative_reread() {
        let launch = SubagentTaskLaunchSpec {
            agent_type: "agent".into(),
            parent_dialog_turn_id: "turn".into(),
            parent_tool_call_id: "tool".into(),
            context: [
                ("teamDefinitionId", "definition"),
                ("teamDefinitionRevision", "revision"),
                ("teamInstanceId", "instance"),
                ("teamRunId", "run"),
                ("teamMemberId", "member"),
                ("teamPhaseId", "phase"),
            ]
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
            allow_subagent_spawn: false,
            nesting_depth: 1,
            timeout_seconds: None,
            team_member_skill_policy: Some(
                void_core_types::TeamMemberSkillPolicySnapshot::new(
                    "definition".into(),
                    "revision".into(),
                    "instance".into(),
                    "member".into(),
                    "agent".into(),
                    vec![],
                )
                .unwrap(),
            ),
        };
        let mut task = SubagentTaskRecord::new(
            "task".into(),
            "parent".into(),
            "objective".into(),
            "owner".into(),
            1,
        );
        task.status = SubagentTaskStatus::Interrupted;
        task.recovery_state = SubagentTaskRecoveryState::Queued;
        task.child_session_id = Some("child".into());
        task.launch_spec = Some(launch.clone());
        let ticket = TeamMemberRecoveryTicket {
            parent_session_id: "parent".into(),
            task_id: "task".into(),
            child_session_id: "child".into(),
            objective: "objective".into(),
            expected_launch: launch,
        };
        assert!(recovery_ticket_matches_task(&ticket, &task));

        for variant in [
            "status",
            "recovery",
            "parent",
            "task",
            "child",
            "objective",
            "launch",
        ] {
            let mut changed = task.clone();
            match variant {
                "status" => changed.status = SubagentTaskStatus::Blocked,
                "recovery" => changed.recovery_state = SubagentTaskRecoveryState::None,
                "parent" => changed.parent_session_id = "other-parent".into(),
                "task" => changed.task_id = "other-task".into(),
                "child" => changed.child_session_id = Some("other-child".into()),
                "objective" => changed.objective = "other objective".into(),
                "launch" => {
                    changed
                        .launch_spec
                        .as_mut()
                        .unwrap()
                        .context
                        .insert("teamRunId".into(), "other-run".into());
                }
                _ => unreachable!(),
            }
            assert!(
                !recovery_ticket_matches_task(&ticket, &changed),
                "post-preflight {variant} mutation must fail closed"
            );
        }
    }

    #[tokio::test]
    async fn consume_team_recovery_queue_blocks_missing_hook_and_partial_markers() {
        let (_workspace, session_manager, coordinator, parent_session_id) =
            recovery_queue_coordinator().await;
        let policy = TeamMemberSkillPolicySnapshot::new(
            "definition".to_string(),
            "revision".to_string(),
            "instance".to_string(),
            "member".to_string(),
            "agent".to_string(),
            Vec::new(),
        )
        .expect("explicit no_policy fixture should be valid");
        session_manager
            .create_subagent_task(interrupted_recovery_task(
                &parent_session_id,
                "complete-team-task",
                void_core_types::SUBAGENT_TASK_SCHEMA_VERSION,
                recovery_team_launch(true, Some(policy)),
            ))
            .await
            .expect("complete Team task should persist");
        session_manager
            .create_subagent_task(interrupted_recovery_task(
                &parent_session_id,
                "partial-team-task",
                void_core_types::SUBAGENT_TASK_SCHEMA_VERSION,
                recovery_team_launch(false, None),
            ))
            .await
            .expect("partial Team task should persist");

        coordinator
            .consume_subagent_task_recovery_queue(&parent_session_id)
            .await
            .expect("invalid Team recovery entries should be durably blocked");

        let complete = session_manager
            .get_subagent_task(&parent_session_id, "complete-team-task")
            .await
            .expect("complete Team task should remain readable")
            .expect("complete Team task should remain persisted");
        assert_eq!(complete.status, SubagentTaskStatus::Blocked);
        let complete_block = complete
            .recovery_block
            .expect("missing bridge must persist a recovery block");
        assert_eq!(
            complete_block.code,
            SubagentTaskRecoveryBlockCode::ResumeFailed
        );
        assert!(complete_block
            .detail
            .contains("preflight bridge is installed"));

        let partial = session_manager
            .get_subagent_task(&parent_session_id, "partial-team-task")
            .await
            .expect("partial Team task should remain readable")
            .expect("partial Team task should remain persisted");
        assert_eq!(partial.status, SubagentTaskStatus::Blocked);
        let partial_block = partial
            .recovery_block
            .expect("partial Team markers must persist a recovery block");
        assert_eq!(
            partial_block.code,
            SubagentTaskRecoveryBlockCode::InvalidLaunchSpec
        );
        assert!(partial_block
            .detail
            .contains("incomplete durable Team markers"));
    }

    #[tokio::test]
    async fn consume_team_recovery_queue_persists_legacy_policy_and_blocks_postflight_mutation() {
        let (_workspace, session_manager, coordinator, parent_session_id) =
            recovery_queue_coordinator().await;
        session_manager
            .create_subagent_task(interrupted_recovery_task(
                &parent_session_id,
                "legacy-team-task",
                void_core_types::SUBAGENT_TASK_SCHEMA_VERSION - 1,
                recovery_team_launch(true, None),
            ))
            .await
            .expect("legacy Team task should persist with its raw legacy schema");
        let policy = TeamMemberSkillPolicySnapshot::new(
            "definition".to_string(),
            "revision".to_string(),
            "instance".to_string(),
            "member".to_string(),
            "agent".to_string(),
            Vec::new(),
        )
        .expect("mutation fixture no_policy should be valid");
        session_manager
            .create_subagent_task(interrupted_recovery_task(
                &parent_session_id,
                "mutated-team-task",
                void_core_types::SUBAGENT_TASK_SCHEMA_VERSION,
                recovery_team_launch(true, Some(policy)),
            ))
            .await
            .expect("mutation Team task should persist");
        let calls = Arc::new(AtomicUsize::new(0));
        coordinator
            .set_team_member_recovery_preflight(Arc::new(RecoveryQueuePreflight {
                session_manager: session_manager.clone(),
                calls: calls.clone(),
            }))
            .expect("fake Team recovery preflight should install once");

        coordinator
            .consume_subagent_task_recovery_queue(&parent_session_id)
            .await
            .expect("preflight failures should be converted into durable task blocks");
        assert_eq!(calls.load(Ordering::SeqCst), 2);

        let legacy = session_manager
            .get_subagent_task(&parent_session_id, "legacy-team-task")
            .await
            .expect("legacy Team task should remain readable")
            .expect("legacy Team task should remain persisted");
        assert_eq!(
            legacy.schema_version,
            void_core_types::SUBAGENT_TASK_SCHEMA_VERSION
        );
        let migrated_policy = legacy
            .launch_spec
            .as_ref()
            .and_then(|launch| launch.team_member_skill_policy.as_ref())
            .expect("legacy Team policy must be written back before recovery continues");
        migrated_policy
            .validate()
            .expect("persisted legacy no_policy hash and identity should validate");
        assert!(!migrated_policy.policy_hash.is_empty());
        let legacy_block = legacy
            .recovery_block
            .expect("legacy fixture stop should persist a recovery block");
        assert_eq!(
            legacy_block.code,
            SubagentTaskRecoveryBlockCode::ResumeFailed
        );
        assert!(legacy_block
            .detail
            .contains("fixture stops after legacy policy migration"));

        let mutated = session_manager
            .get_subagent_task(&parent_session_id, "mutated-team-task")
            .await
            .expect("mutated Team task should remain readable")
            .expect("mutated Team task should remain persisted");
        assert_eq!(mutated.status, SubagentTaskStatus::Blocked);
        let mutation_block = mutated
            .recovery_block
            .expect("post-preflight mutation must persist a recovery block");
        assert_eq!(
            mutation_block.code,
            SubagentTaskRecoveryBlockCode::InvalidLaunchSpec
        );
        assert!(mutation_block
            .detail
            .contains("authoritative Team task changed after recovery preflight"));
    }

    #[tokio::test]
    async fn team_tool_executor_is_once_only_and_checkpoint_gates_every_call() {
        let slot = std::sync::OnceLock::new();
        let calls = Arc::new(AtomicUsize::new(0));
        install_team_tool_executor(
            &slot,
            Arc::new(CountingTeamToolExecutor {
                calls: calls.clone(),
            }),
        )
        .expect("first executor installation should succeed");
        assert!(install_team_tool_executor(
            &slot,
            Arc::new(CountingTeamToolExecutor {
                calls: calls.clone(),
            }),
        )
        .is_err());

        let invocation = team_tool_invocation();
        let checkpoint_error = crate::util::errors::VoidError::validation(
            "strict atomic checkpoint failed".to_string(),
        );
        assert!(execute_team_tool_after_checkpoint(
            slot.get().unwrap().as_ref(),
            invocation.clone(),
            Err(checkpoint_error),
        )
        .await
        .is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        let mismatched = PersistedToolCallAuthority {
            tool_name: "Task".to_string(),
            turn_index: 0,
            round_id: invocation.parent_round_id.clone(),
            input: invocation.exact_input.clone(),
        };
        assert!(execute_team_tool_after_checkpoint(
            slot.get().unwrap().as_ref(),
            invocation.clone(),
            Ok(mismatched),
        )
        .await
        .is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        let authority = PersistedToolCallAuthority {
            tool_name: "Team".to_string(),
            turn_index: 0,
            round_id: invocation.parent_round_id.clone(),
            input: invocation.exact_input.clone(),
        };
        let outcome = execute_team_tool_after_checkpoint(
            slot.get().unwrap().as_ref(),
            invocation,
            Ok(authority),
        )
        .await
        .expect("matching durable authority may reach the executor");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(outcome.result_for_assistant.as_deref(), Some("accepted"));
    }

    #[test]
    fn conversation_coordinator_exposes_remote_runtime_ports() {
        fn assert_cancellation_port<T: void_runtime_ports::AgentTurnCancellationPort>() {}
        fn assert_state_port<T: void_runtime_ports::RemoteControlStatePort>() {}

        assert_cancellation_port::<ConversationCoordinator>();
        assert_state_port::<ConversationCoordinator>();
    }

    #[test]
    fn clamps_subagent_max_concurrency_into_safe_range() {
        assert_eq!(normalize_subagent_max_concurrency(0), 1);
        assert_eq!(normalize_subagent_max_concurrency(5), 5);
        assert_eq!(normalize_subagent_max_concurrency(usize::MAX), 64);
    }

    #[test]
    fn subagent_timeout_disable_clears_active_deadline() {
        use super::SubagentTimeoutAction;
        use std::sync::Mutex;
        use tokio::sync::watch;
        use tokio::time::{Duration, Instant};

        let initial_deadline = Instant::now() + Duration::from_secs(1200);
        let (deadline_tx, mut deadline_rx) = watch::channel(Some(initial_deadline));
        let handle = super::SubagentTimeoutHandle {
            deadline_tx,
            session_id: "subagent-session".to_string(),
            original_timeout_seconds: Some(1200),
            remaining_at_pause: Mutex::new(None),
        };

        handle.apply_action(SubagentTimeoutAction::Disable);

        assert!(deadline_rx.borrow_and_update().is_none());
    }

    #[test]
    fn background_subagent_delivery_text_includes_background_task_id() {
        let completed = super::SubagentResult::completed("done".to_string());
        let completed_text = super::format_background_subagent_delivery_text(
            "bg-subagent-123",
            "GeneralPurpose",
            Ok(&completed),
        );
        assert!(completed_text.contains(
            "Background subagent 'GeneralPurpose' (background_task_id='bg-subagent-123') completed successfully:"
        ));
        assert!(completed_text.contains("<result>\n"));
        assert!(!completed_text.contains("background_task_id=\"bg-subagent-123\""));

        let partial =
            super::SubagentResult::partial_timeout("partial".to_string(), "timeout".to_string());
        let partial_text = super::format_background_subagent_delivery_text(
            "bg-subagent-456",
            "GeneralPurpose",
            Ok(&partial),
        );
        assert!(partial_text.contains(
            "Background subagent 'GeneralPurpose' (background_task_id='bg-subagent-456') completed with partial timeout result:"
        ));
        assert!(partial_text.contains("<partial_result status=\"partial_timeout\">\n"));
        assert!(!partial_text.contains("background_task_id=\"bg-subagent-456\""));

        let failed_text = super::format_background_subagent_delivery_text(
            "bg-subagent-789",
            "GeneralPurpose",
            Err(&crate::util::errors::VoidError::tool("boom".to_string())),
        );
        assert!(failed_text.contains(
            "Background subagent 'GeneralPurpose' (background_task_id='bg-subagent-789') failed before producing a final result."
        ));
        assert!(failed_text.contains("Error:"));
    }

    #[test]
    fn background_subagent_terminal_facts_preserve_typed_outcome() {
        let completed = super::SubagentResult::completed("done".to_string());
        assert_eq!(
            super::background_subagent_terminal_facts(Ok(&completed)),
            (
                void_core_types::SubagentTaskStatus::Completed,
                Some("done".to_string()),
                None
            )
        );

        let cancelled = crate::util::errors::VoidError::Cancelled("stopped".to_string());
        let cancelled_facts = super::background_subagent_terminal_facts(Err(&cancelled));
        assert_eq!(
            cancelled_facts.0,
            void_core_types::SubagentTaskStatus::Cancelled
        );
        assert!(cancelled_facts
            .2
            .as_deref()
            .is_some_and(|failure| failure.contains("stopped")));

        let failed = crate::util::errors::VoidError::tool("boom".to_string());
        assert_eq!(
            super::background_subagent_terminal_facts(Err(&failed)).0,
            void_core_types::SubagentTaskStatus::Failed
        );
    }

    #[test]
    fn background_subagent_metadata_preserves_request_context() {
        let mut context = HashMap::new();
        context.insert("multitaskBranchId".to_string(), "backend".to_string());

        let metadata = super::build_background_subagent_result_metadata(
            "bg-subagent-123",
            "GeneralPurpose",
            "inspect backend",
            context,
        );

        assert_eq!(metadata["kind"], "background_result");
        assert_eq!(metadata["backgroundTaskId"], "bg-subagent-123");
        assert_eq!(metadata["context"]["multitaskBranchId"], "backend");
    }

    #[test]
    fn durable_subagent_context_is_allowlisted_bounded_and_secret_free() {
        assert!(super::contains_explicit_sensitive_context_value(
            "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="
        ));
        assert!(!super::contains_explicit_sensitive_context_value(
            "basic reviewer"
        ));
        let mut context = HashMap::new();
        context.insert("multitaskBranchId".to_string(), "backend".to_string());
        context.insert(
            "multitaskBranchGoal".to_string(),
            "x".repeat(super::MAX_DURABLE_SUBAGENT_CONTEXT_VALUE_BYTES + 1),
        );
        context.insert(
            "deep_review_subagent_type".to_string(),
            "Bearer credential-value".to_string(),
        );
        context.insert(
            "deep_review_subagent_role".to_string(),
            "basic reviewer".to_string(),
        );
        context.insert("apiToken".to_string(), "top-secret".to_string());
        context.insert("cookie".to_string(), "session=secret".to_string());
        context.insert("arbitrary_hidden_payload".to_string(), "hidden".to_string());

        let durable = super::durable_subagent_context(&context);

        assert_eq!(
            durable.get("multitaskBranchId").map(String::as_str),
            Some("backend")
        );
        assert!(!durable.contains_key("multitaskBranchGoal"));
        assert!(!durable.contains_key("deep_review_subagent_type"));
        assert_eq!(
            durable.get("deep_review_subagent_role").map(String::as_str),
            Some("basic reviewer")
        );
        assert!(!durable.contains_key("apiToken"));
        assert!(!durable.contains_key("cookie"));
        assert!(!durable.contains_key("arbitrary_hidden_payload"));
        assert!(serde_json::to_string(&durable)
            .unwrap()
            .find("top-secret")
            .is_none());

        let tampered = std::collections::BTreeMap::from([(
            "multitaskBranchGoal".to_string(),
            "Authorization: Bearer persisted-secret".to_string(),
        )]);
        let tampered_map = tampered.clone().into_iter().collect();
        assert_ne!(super::durable_subagent_context(&tampered_map), tampered);
    }

    #[test]
    fn background_subagent_launch_match_requires_identical_immutable_facts() {
        use std::collections::BTreeMap;
        use void_core_types::{
            SubagentLaunchAuthority, SubagentLaunchAuthorityKind, SubagentTaskContextMode,
            SubagentTaskExecutionMode, SubagentTaskLaunchSpec, SubagentTaskRecord,
            SubagentTaskReplaySafety,
        };

        let mut expected = SubagentTaskRecord::new_typed(
            "team-task".to_string(),
            "parent".to_string(),
            "objective".to_string(),
            "owner-a".to_string(),
            SubagentTaskExecutionMode::Background,
            SubagentTaskContextMode::Fresh,
            SubagentTaskReplaySafety::Idempotent,
            1,
        );
        expected.launch_spec = Some(SubagentTaskLaunchSpec {
            agent_type: "reviewer".to_string(),
            parent_dialog_turn_id: "turn".to_string(),
            parent_tool_call_id: "tool".to_string(),
            context: BTreeMap::from([("teamInstanceId".to_string(), "instance".to_string())]),
            allow_subagent_spawn: false,
            nesting_depth: 1,
            timeout_seconds: Some(60),
            team_member_skill_policy: None,
        });
        expected.launch_authority = Some(SubagentLaunchAuthority {
            schema_version: void_core_types::SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
            kind: SubagentLaunchAuthorityKind::OrdinaryChild,
            delegation_request_id: "tool".to_string(),
            nesting_depth: 1,
            max_nesting_depth: 1,
            task_spawn_budget: 0,
            max_parallel_workers: 0,
            team_lineage: None,
        });
        let mut matching = expected.clone();
        matching.owner = "different owner is not a launch fact".to_string();
        assert!(background_subagent_launch_matches(&matching, &expected));

        matching.objective = "different objective".to_string();
        assert!(!background_subagent_launch_matches(&matching, &expected));

        matching = expected.clone();
        matching
            .launch_authority
            .as_mut()
            .unwrap()
            .delegation_request_id = "different-tool".to_string();
        assert!(!background_subagent_launch_matches(&matching, &expected));
    }

    #[test]
    fn invalid_persisted_authority_fails_closed_to_ordinary_child() {
        let mut task = SubagentTaskRecord::new(
            "task".into(),
            "parent".into(),
            "objective".into(),
            "owner".into(),
            1,
        );
        task.launch_authority = Some(void_core_types::SubagentLaunchAuthority {
            schema_version: void_core_types::SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
            kind: void_core_types::SubagentLaunchAuthorityKind::TeamMember,
            delegation_request_id: "tool".into(),
            nesting_depth: 1,
            max_nesting_depth: 2,
            task_spawn_budget: 8,
            max_parallel_workers: 3,
            team_lineage: None,
        });

        let policy = delegation_policy_from_task(&task);
        assert!(!policy.allows_task_spawn());
        assert!(!policy.allows_team_orchestration());
    }

    #[test]
    fn worker_budget_parent_match_is_isolated_by_member_run_id() {
        let member_lineage = void_core_types::TeamDelegationLineageSnapshot {
            team_definition_id: "definition".into(),
            team_definition_revision: "revision".into(),
            team_instance_id: "instance".into(),
            team_run_id: "team-run".into(),
            member_run_id: "member-run-1".into(),
            member_id: "writer".into(),
            root_parent_session_id: "root".into(),
            parent_member_session_id: None,
        };
        let member = void_core_types::SubagentLaunchAuthority {
            schema_version: void_core_types::SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
            kind: void_core_types::SubagentLaunchAuthorityKind::TeamMember,
            delegation_request_id: "member-launch".into(),
            nesting_depth: 1,
            max_nesting_depth: 2,
            task_spawn_budget: 8,
            max_parallel_workers: 3,
            team_lineage: Some(member_lineage.clone()),
        };
        let mut worker_lineage = member_lineage;
        worker_lineage.parent_member_session_id = Some("member-session".into());
        assert!(team_member_authority_matches_worker(
            &member,
            &worker_lineage
        ));

        worker_lineage.member_run_id = "member-run-2".into();
        assert!(!team_member_authority_matches_worker(
            &member,
            &worker_lineage
        ));
    }

    #[test]
    fn worker_budget_scope_ignores_historical_member_runs() {
        let current_lineage = void_core_types::TeamDelegationLineageSnapshot {
            team_definition_id: "definition".into(),
            team_definition_revision: "revision".into(),
            team_instance_id: "instance".into(),
            team_run_id: "team-run-2".into(),
            member_run_id: "member-run-2".into(),
            member_id: "writer".into(),
            root_parent_session_id: "root".into(),
            parent_member_session_id: Some("member-session".into()),
        };
        let mut worker = void_core_types::SubagentLaunchAuthority {
            schema_version: void_core_types::SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
            kind: void_core_types::SubagentLaunchAuthorityKind::TeamWorker,
            delegation_request_id: "worker-tool".into(),
            nesting_depth: 2,
            max_nesting_depth: 2,
            task_spawn_budget: 0,
            max_parallel_workers: 0,
            team_lineage: Some(current_lineage.clone()),
        };

        assert!(team_worker_authority_matches_lineage(
            &worker,
            &current_lineage
        ));

        worker.task_spawn_budget = 1;
        assert!(worker.validate().is_err());
        assert!(team_worker_authority_matches_lineage(
            &worker,
            &current_lineage
        ));

        worker.task_spawn_budget = 0;
        worker.team_lineage.as_mut().unwrap().member_run_id = "member-run-1".into();
        assert!(!team_worker_authority_matches_lineage(
            &worker,
            &current_lineage
        ));
    }

    #[test]
    fn team_member_may_spawn_one_worker_level_without_team_authority() {
        let policy = DelegationPolicy::team_member();
        let restrictions = runtime_tool_restrictions_for_delegation_policy(policy);

        assert!(policy.allows_task_spawn());
        assert!(!restrictions.denied_tool_names.contains("Task"));
        assert!(restrictions.denied_tool_names.contains("Team"));

        let worker = policy.spawn_child();
        let worker_restrictions = runtime_tool_restrictions_for_delegation_policy(worker);
        assert_eq!(worker.nesting_depth, 2);
        assert!(!worker.allows_task_spawn());
        assert!(worker_restrictions.denied_tool_names.contains("Task"));
        assert!(worker_restrictions.denied_tool_names.contains("Team"));
    }

    #[test]
    fn team_member_policy_requires_typed_adapter_authority() {
        let parent = SubagentParentInfo {
            tool_call_id: "tool".into(),
            session_id: "parent".into(),
            dialog_turn_id: "turn".into(),
        };
        let mut context = HashMap::new();
        let denied = resolve_child_delegation_policy(
            DelegationPolicy::team_member(),
            &mut context,
            &parent,
            false,
        );
        assert!(!denied.allows_task_spawn());

        let granted = resolve_child_delegation_policy(
            DelegationPolicy::ordinary_child(1),
            &mut context,
            &parent,
            true,
        );
        assert!(granted.allows_task_spawn());
        assert_eq!(
            context
                .get(TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY)
                .map(String::as_str),
            Some("parent")
        );
    }

    #[test]
    fn top_level_lead_policy_keeps_team_orchestration_available() {
        let policy = DelegationPolicy::top_level();
        let restrictions = runtime_tool_restrictions_for_delegation_policy(policy);

        assert!(policy.allow_subagent_spawn);
        assert_eq!(policy.nesting_depth, 0);
        assert!(!restrictions.denied_tool_names.contains("Task"));
        assert!(!restrictions.denied_tool_names.contains("Team"));
    }

    #[test]
    fn team_follow_up_busy_guard_requires_terminal_task_and_idle_child() {
        use crate::agentic::core::{ProcessingPhase, SessionState};
        use void_core_types::SubagentTaskStatus;

        assert!(!team_follow_up_child_is_busy(
            SubagentTaskStatus::Completed,
            &SessionState::Idle,
            false,
        ));
        assert!(team_follow_up_child_is_busy(
            SubagentTaskStatus::Running,
            &SessionState::Idle,
            false,
        ));
        assert!(team_follow_up_child_is_busy(
            SubagentTaskStatus::Completed,
            &SessionState::Processing {
                current_turn_id: "turn".to_string(),
                phase: ProcessingPhase::Thinking,
            },
            false,
        ));
        assert!(team_follow_up_child_is_busy(
            SubagentTaskStatus::Completed,
            &SessionState::Idle,
            true,
        ));
    }

    #[tokio::test]
    async fn stale_execution_cleanup_does_not_remove_new_generation() {
        use dashmap::DashMap;
        use tokio_util::sync::CancellationToken;

        let active_executions = DashMap::new();
        let new_task = tokio::spawn(std::future::pending::<()>());
        let session_id = "child-session";

        active_executions.insert(
            session_id.to_string(),
            ActiveSubagentExecution {
                parent_session_id: "parent-session".to_string(),
                parent_dialog_turn_id: "parent-turn".to_string(),
                subagent_session_id: session_id.to_string(),
                subagent_dialog_turn_id: "new-turn".to_string(),
                cancel_token: CancellationToken::new(),
                abort_handle: new_task.abort_handle(),
            },
        );

        assert!(!remove_active_subagent_execution_if_generation_matches(
            &active_executions,
            session_id,
            "old-turn",
        ));
        assert_eq!(
            active_executions
                .get(session_id)
                .map(|active| active.subagent_dialog_turn_id.clone()),
            Some("new-turn".to_string())
        );
        assert!(remove_active_subagent_execution_if_generation_matches(
            &active_executions,
            session_id,
            "new-turn",
        ));
        assert!(!active_executions.contains_key(session_id));

        new_task.abort();
    }

    #[test]
    fn remote_subagent_resume_without_remote_binding_never_uses_logical_path_fallback() {
        use crate::agentic::core::SessionConfig;

        let remote = SessionConfig {
            workspace_path: Some("/remote/project".to_string()),
            workspace_id: Some("workspace".to_string()),
            remote_connection_id: Some("connection".to_string()),
            remote_ssh_host: Some("host".to_string()),
            ..Default::default()
        };
        assert!(resolved_subagent_resume_storage_path(&remote, None).is_err());
        let local_binding = crate::agentic::WorkspaceBinding::new(
            Some("workspace".to_string()),
            std::path::PathBuf::from("/remote/project"),
        );
        assert!(resolved_subagent_resume_storage_path(&remote, Some(&local_binding)).is_err());
    }

    #[test]
    fn remote_subagent_resume_uses_binding_session_storage_path() {
        use crate::agentic::core::SessionConfig;
        use crate::service::remote_ssh::workspace_state::workspace_session_identity;

        let remote = SessionConfig {
            workspace_path: Some("/remote/project".to_string()),
            workspace_id: Some("workspace".to_string()),
            remote_connection_id: Some("connection".to_string()),
            remote_ssh_host: Some("host".to_string()),
            ..Default::default()
        };
        let identity =
            workspace_session_identity("/remote/project", Some("connection"), Some("host"))
                .expect("remote session identity should resolve");
        let binding = crate::agentic::WorkspaceBinding::new_remote(
            Some("workspace".to_string()),
            std::path::PathBuf::from("/remote/project"),
            "connection".to_string(),
            "host".to_string(),
            identity,
        );

        let resolved = resolved_subagent_resume_storage_path(&remote, Some(&binding)).unwrap();
        assert_eq!(resolved, binding.session_storage_path());
        assert_ne!(resolved, std::path::PathBuf::from("/remote/project"));
    }

    #[test]
    fn local_subagent_resume_keeps_logical_workspace_path() {
        use crate::agentic::core::SessionConfig;

        let local = SessionConfig {
            workspace_path: Some("D:\\local-project".to_string()),
            workspace_id: Some("workspace".to_string()),
            ..Default::default()
        };
        assert_eq!(
            resolved_subagent_resume_storage_path(&local, None).unwrap(),
            std::path::PathBuf::from("D:\\local-project")
        );
    }

    #[test]
    fn team_follow_up_turn_id_preserves_operation_identity() {
        assert_eq!(
            team_follow_up_dialog_turn_id("operation-123"),
            "team-message-operation-123"
        );
    }

    #[test]
    fn reused_prepared_team_follow_up_never_spawns_again() {
        assert!(should_spawn_team_follow_up(
            PreparedTurnDisposition::Created
        ));
        assert!(!should_spawn_team_follow_up(
            PreparedTurnDisposition::Reused
        ));
    }

    #[test]
    fn agent_submission_turn_id_prefers_explicit_field_over_metadata() {
        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "turnId".to_string(),
            serde_json::Value::String("legacy_metadata_turn".to_string()),
        );
        let request = AgentSubmissionRequest {
            session_id: "session_1".to_string(),
            message: "hello".to_string(),
            turn_id: Some("explicit_turn".to_string()),
            source: Some(AgentSubmissionSource::RemoteRelay),
            attachments: Vec::new(),
            metadata,
        };

        assert_eq!(resolve_agent_submission_turn_id(&request), "explicit_turn");
    }

    #[test]
    fn agent_submission_turn_id_keeps_metadata_fallback() {
        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "turnId".to_string(),
            serde_json::Value::String("legacy_metadata_turn".to_string()),
        );
        let request = AgentSubmissionRequest {
            session_id: "session_1".to_string(),
            message: "hello".to_string(),
            turn_id: None,
            source: Some(AgentSubmissionSource::RemoteRelay),
            attachments: Vec::new(),
            metadata,
        };

        assert_eq!(
            resolve_agent_submission_turn_id(&request),
            "legacy_metadata_turn"
        );
    }

    #[tokio::test]
    async fn subagent_session_config_preserves_registered_remote_workspace_identity() {
        let manager = init_remote_workspace_manager();
        manager
            .register_remote_workspace(
                "/remote/subagent-test".to_string(),
                "conn-subagent-test".to_string(),
                "Remote Test".to_string(),
                "remote-host".to_string(),
            )
            .await;
        manager
            .set_active_connection_hint(Some("conn-subagent-test".to_string()))
            .await;

        let config = ConversationCoordinator::build_session_config_for_workspace(
            "/remote/subagent-test/project".to_string(),
            Some("model-fast".to_string()),
        )
        .await;

        assert_eq!(
            config.workspace_path.as_deref(),
            Some("/remote/subagent-test/project")
        );
        assert_eq!(
            config.remote_connection_id.as_deref(),
            Some("conn-subagent-test")
        );
        assert_eq!(config.remote_ssh_host.as_deref(), Some("remote-host"));
        assert_eq!(config.model_id.as_deref(), Some("model-fast"));
    }
}
