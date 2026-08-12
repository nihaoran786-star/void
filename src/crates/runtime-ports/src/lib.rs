//! Thin runtime ports for boundaries that currently cross service and agentic
//! concrete implementations.
//!
//! This crate intentionally contains only DTOs and traits. It must not depend
//! on concrete managers, platform adapters, `void-core`, or app crates.

use serde::{Deserialize, Serialize};

pub type PortResult<T> = Result<T, PortError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PortErrorKind {
    NotAvailable,
    NotFound,
    InvalidRequest,
    PermissionDenied,
    Cancelled,
    Timeout,
    Backend,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortError {
    pub kind: PortErrorKind,
    pub message: String,
}

impl PortError {
    pub fn new(kind: PortErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for PortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for PortError {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCreateRequest {
    pub session_name: String,
    pub agent_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCreateResult {
    pub session_id: String,
    pub agent_type: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSubmissionRequest {
    pub session_id: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AgentSubmissionSource>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<AgentInputAttachment>,
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSubmissionSource {
    DesktopUi,
    DesktopApi,
    AgentSession,
    ScheduledJob,
    RemoteRelay,
    Bot,
    Cli,
}

pub type DialogTriggerSource = AgentSubmissionSource;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DialogQueuePriority {
    Low = 0,
    Normal = 1,
    High = 2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogSubmissionPolicy {
    pub trigger_source: DialogTriggerSource,
    pub queue_priority: DialogQueuePriority,
    pub skip_tool_confirmation: bool,
}

impl DialogSubmissionPolicy {
    pub const fn new(
        trigger_source: DialogTriggerSource,
        queue_priority: DialogQueuePriority,
        skip_tool_confirmation: bool,
    ) -> Self {
        Self {
            trigger_source,
            queue_priority,
            skip_tool_confirmation,
        }
    }

    pub const fn for_source(trigger_source: DialogTriggerSource) -> Self {
        let (queue_priority, skip_tool_confirmation) = match trigger_source {
            DialogTriggerSource::AgentSession => (DialogQueuePriority::Low, true),
            DialogTriggerSource::ScheduledJob => (DialogQueuePriority::Low, true),
            DialogTriggerSource::DesktopUi
            | DialogTriggerSource::DesktopApi
            | DialogTriggerSource::Cli => (DialogQueuePriority::Normal, false),
            DialogTriggerSource::RemoteRelay | DialogTriggerSource::Bot => {
                (DialogQueuePriority::Normal, true)
            }
        };
        Self::new(trigger_source, queue_priority, skip_tool_confirmation)
    }

    pub const fn with_queue_priority(mut self, queue_priority: DialogQueuePriority) -> Self {
        self.queue_priority = queue_priority;
        self
    }

    pub const fn with_skip_tool_confirmation(mut self, skip_tool_confirmation: bool) -> Self {
        self.skip_tool_confirmation = skip_tool_confirmation;
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DialogSubmitOutcome {
    Started { session_id: String, turn_id: String },
    Queued { session_id: String, turn_id: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DialogSessionStateFact {
    Missing,
    Idle,
    Processing,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DialogSubmitQueueFacts {
    pub session_state: DialogSessionStateFact,
    pub queue_has_items: bool,
    pub policy: DialogSubmissionPolicy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DialogSubmitQueueAction {
    StartImmediately,
    ClearQueueAndStartImmediately,
    EnqueueThenStartNext,
    EnqueueForActiveTurn { request_yield: bool },
}

pub const fn dialog_policy_may_preempt(policy: &DialogSubmissionPolicy) -> bool {
    matches!(
        policy.trigger_source,
        DialogTriggerSource::DesktopUi
            | DialogTriggerSource::DesktopApi
            | DialogTriggerSource::Cli
            | DialogTriggerSource::RemoteRelay
            | DialogTriggerSource::Bot
    )
}

pub const fn resolve_dialog_submit_queue_action(
    facts: DialogSubmitQueueFacts,
) -> DialogSubmitQueueAction {
    match facts.session_state {
        DialogSessionStateFact::Missing => DialogSubmitQueueAction::StartImmediately,
        DialogSessionStateFact::Error => DialogSubmitQueueAction::ClearQueueAndStartImmediately,
        DialogSessionStateFact::Idle => {
            if facts.queue_has_items {
                DialogSubmitQueueAction::EnqueueThenStartNext
            } else {
                DialogSubmitQueueAction::StartImmediately
            }
        }
        DialogSessionStateFact::Processing => DialogSubmitQueueAction::EnqueueForActiveTurn {
            request_yield: dialog_policy_may_preempt(&facts.policy),
        },
    }
}

pub fn should_suppress_agent_session_cancelled_reply(
    policy: &DialogSubmissionPolicy,
    reply_source_session_id: Option<&str>,
    requester_session_id: &str,
) -> bool {
    policy.trigger_source == DialogTriggerSource::AgentSession
        && reply_source_session_id.is_some_and(|source| source == requester_session_id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DialogTurnOutcomeKind {
    Completed,
    Cancelled,
    Failed,
}

pub const fn should_skip_agent_session_reply(
    outcome_kind: DialogTurnOutcomeKind,
    suppressed_cancelled_reply: bool,
) -> bool {
    matches!(outcome_kind, DialogTurnOutcomeKind::Cancelled) && suppressed_cancelled_reply
}

/// Source session route used when an agent-session request should reply to the
/// requester after the target session finishes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentSessionReplyRoute {
    pub source_session_id: String,
    pub source_workspace_path: String,
}

/// Outcome for steering a message into an already-running dialog turn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DialogSteerOutcome {
    /// Steering was buffered for the running turn and will be consumed at the
    /// next model-round boundary.
    Buffered {
        session_id: String,
        turn_id: String,
        steering_id: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoundInjectionKind {
    UserSteering,
    BackgroundResult,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoundInjectionTarget {
    /// Only inject into the exact targeted running turn.
    ExactTurn(String),
    /// Inject into whichever turn is currently running for the session.
    CurrentRunningTurn,
}

/// A message to inject into the currently running dialog turn at the next
/// model-round boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoundInjection {
    pub id: String,
    pub kind: RoundInjectionKind,
    pub target: RoundInjectionTarget,
    pub content: String,
    pub display_content: String,
    pub created_at: std::time::SystemTime,
}

/// Observes whether the current dialog turn should end after the latest model
/// round so a queued user message can start as a new turn.
pub trait DialogRoundPreemptSource: Send + Sync {
    fn should_yield_after_round(&self, session_id: &str) -> bool;
    fn clear_yield_after_round(&self, session_id: &str);
}

/// Observes round-boundary injections for a given running turn.
pub trait DialogRoundInjectionSource: Send + Sync {
    fn has_pending(&self, session_id: &str, turn_id: &str) -> bool;
    fn take_pending(&self, session_id: &str, turn_id: &str) -> Vec<RoundInjection>;
}

pub const GOAL_MODE_METADATA_KEY: &str = "goal_mode";
pub const MAX_GOAL_CONTINUATIONS: u32 = 100;
pub const MAX_CONTEXT_SUMMARY_CHARS: usize = 12_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GoalModeStatus {
    Active,
    Paused,
    Blocked,
    UsageLimited,
    Complete,
}

impl Default for GoalModeStatus {
    fn default() -> Self {
        Self::Active
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoalModeInitialGoal {
    pub goal_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_hint: Option<String>,
    #[serde(default)]
    pub created_at_ms: u64,
}

impl Default for GoalModeInitialGoal {
    fn default() -> Self {
        Self {
            goal_text: String::new(),
            success_criteria: Vec::new(),
            user_hint: None,
            created_at_ms: 0,
        }
    }
}

impl GoalModeInitialGoal {
    pub fn new(
        goal_text: String,
        success_criteria: Vec<String>,
        user_hint: Option<String>,
        created_at_ms: u64,
    ) -> Self {
        Self {
            goal_text,
            success_criteria,
            user_hint,
            created_at_ms,
        }
    }

    pub fn is_set(&self) -> bool {
        !self.goal_text.trim().is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoalModeState {
    pub active: bool,
    #[serde(default)]
    pub status: GoalModeStatus,
    #[serde(default)]
    pub initial_goal: GoalModeInitialGoal,
    pub goal_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_hint: Option<String>,
    #[serde(default)]
    pub activated_at_ms: u64,
    #[serde(default)]
    pub continuation_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_budget: Option<u64>,
    #[serde(default)]
    pub tokens_used: u64,
}

impl GoalModeState {
    pub fn is_active(&self) -> bool {
        self.active
            && self.status == GoalModeStatus::Active
            && !self.initial_goal_text().trim().is_empty()
    }

    pub fn initial_goal_text(&self) -> &str {
        if self.initial_goal.is_set() {
            self.initial_goal.goal_text.as_str()
        } else {
            self.goal_text.as_str()
        }
    }

    pub fn initial_success_criteria(&self) -> &[String] {
        if self.initial_goal.is_set() {
            self.initial_goal.success_criteria.as_slice()
        } else {
            self.success_criteria.as_slice()
        }
    }

    pub fn initial_user_hint(&self) -> Option<&str> {
        self.initial_goal
            .user_hint
            .as_deref()
            .or(self.user_hint.as_deref())
    }

    pub fn initial_goal_created_at_ms(&self) -> u64 {
        if self.initial_goal.is_set() {
            self.initial_goal.created_at_ms
        } else {
            self.activated_at_ms
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoalGenerationResult {
    pub goal_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoalVerificationResult {
    pub achieved: bool,
    #[serde(default)]
    pub confidence: f32,
    #[serde(default)]
    pub gaps: Vec<String>,
    #[serde(default)]
    pub guidance: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoalActivationResult {
    pub goal_text: String,
    pub success_criteria: Vec<String>,
    pub kickoff_message: String,
    pub display_message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoalContinuationPlan {
    pub wrapped_message: String,
    pub display_message: String,
    pub user_message_metadata: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompressionContract {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub touched_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub verification_commands: Vec<CompressionContractItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocking_failures: Vec<CompressionContractItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub subagent_statuses: Vec<CompressionContractItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompressionContractItem {
    pub target: String,
    pub status: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
}

impl CompressionContract {
    pub fn is_empty(&self) -> bool {
        self.touched_files.is_empty()
            && self.verification_commands.is_empty()
            && self.blocking_failures.is_empty()
            && self.subagent_statuses.is_empty()
    }

    pub fn render_for_model(&self) -> String {
        let mut lines = vec![
            "Compaction contract: preserve these factual fields when continuing the task."
                .to_string(),
        ];

        if !self.touched_files.is_empty() {
            lines.push("Touched files:".to_string());
            for file in &self.touched_files {
                lines.push(format!("- {}", file));
            }
        }

        render_contract_items(
            &mut lines,
            "Verification commands:",
            &self.verification_commands,
        );
        render_contract_items(&mut lines, "Blocking failures:", &self.blocking_failures);
        render_contract_items(&mut lines, "Subagent statuses:", &self.subagent_statuses);

        lines.join("\n")
    }
}

fn render_contract_items(lines: &mut Vec<String>, title: &str, items: &[CompressionContractItem]) {
    if items.is_empty() {
        return;
    }

    lines.push(title.to_string());
    for item in items {
        let mut rendered = format!("- {} [{}]: {}", item.target, item.status, item.summary);
        if let Some(error_kind) = item.error_kind.as_ref() {
            rendered.push_str(&format!(" ({})", error_kind));
        }
        lines.push(rendered);
    }
}

/// User-managed related directory reference for request-context prompts.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RelatedPath {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInputAttachment {
    pub kind: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub metadata: serde_json::Map<String, serde_json::Value>,
}

impl AgentInputAttachment {
    pub fn remote_image(
        id: impl Into<String>,
        name: impl Into<String>,
        data_url: impl Into<String>,
    ) -> Self {
        let mut metadata = serde_json::Map::new();
        metadata.insert("name".to_string(), serde_json::Value::String(name.into()));
        metadata.insert(
            "dataUrl".to_string(),
            serde_json::Value::String(data_url.into()),
        );

        Self {
            kind: "remote_image".to_string(),
            id: id.into(),
            metadata,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSubmissionResult {
    pub turn_id: String,
    #[serde(default)]
    pub accepted: bool,
}

#[async_trait::async_trait]
pub trait AgentSubmissionPort: Send + Sync {
    async fn create_session(
        &self,
        request: AgentSessionCreateRequest,
    ) -> PortResult<AgentSessionCreateResult>;

    async fn submit_message(
        &self,
        request: AgentSubmissionRequest,
    ) -> PortResult<AgentSubmissionResult>;

    async fn resolve_session_agent_type(&self, session_id: &str) -> PortResult<Option<String>>;
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnCancellationRequest {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AgentSubmissionSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wait_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnCancellationResult {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub requested: bool,
}

#[async_trait::async_trait]
pub trait AgentTurnCancellationPort: Send + Sync {
    async fn cancel_turn(
        &self,
        request: AgentTurnCancellationRequest,
    ) -> PortResult<AgentTurnCancellationResult>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteControlSessionState {
    Idle,
    Processing,
    Error,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlStateRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlStateSnapshot {
    pub session_id: String,
    pub state: RemoteControlSessionState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_turn_id: Option<String>,
    #[serde(default)]
    pub queue_depth: usize,
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[async_trait::async_trait]
pub trait RemoteControlStatePort: Send + Sync {
    async fn read_remote_control_state(
        &self,
        request: RemoteControlStateRequest,
    ) -> PortResult<Option<RemoteControlStateSnapshot>>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeEventType {
    TurnStarted,
    TurnCompleted,
    TurnFailed,
    TurnCancelled,
    SessionStateChanged,
    ModelRoundCacheTelemetry,
    MultitaskSchedulerDryRun,
    MultitaskSchedulerDecision,
    MultitaskBranchResult,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventEnvelope {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AgentSubmissionSource>,
    pub event_type: RuntimeEventType,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[async_trait::async_trait]
pub trait RuntimeEventSink: Send + Sync {
    async fn publish_runtime_event(&self, event: RuntimeEventEnvelope) -> PortResult<()>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptCacheTelemetrySource {
    Provider,
    RuntimeInference,
    Unsupported,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptCacheStatus {
    Hit,
    PartialHit,
    Miss,
    Unsupported,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCacheTelemetry {
    pub eligible: bool,
    pub status: PromptCacheStatus,
    pub source: PromptCacheTelemetrySource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_tokens: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub miss_reason: Option<String>,
}

impl PromptCacheTelemetry {
    pub fn unsupported() -> Self {
        Self {
            eligible: false,
            status: PromptCacheStatus::Unsupported,
            source: PromptCacheTelemetrySource::Unsupported,
            cached_tokens: None,
            cache_creation_tokens: None,
            miss_reason: Some("provider_does_not_report_prompt_cache_telemetry".to_string()),
        }
    }

    pub fn unavailable() -> Self {
        Self {
            eligible: false,
            status: PromptCacheStatus::Unavailable,
            source: PromptCacheTelemetrySource::Unavailable,
            cached_tokens: None,
            cache_creation_tokens: None,
            miss_reason: Some("provider_cache_telemetry_unavailable".to_string()),
        }
    }

    pub fn from_provider_counts(
        prompt_tokens: usize,
        cached_tokens: Option<usize>,
        cache_creation_tokens: Option<usize>,
    ) -> Self {
        match cached_tokens {
            Some(cached) if cached >= prompt_tokens && prompt_tokens > 0 => Self {
                eligible: true,
                status: PromptCacheStatus::Hit,
                source: PromptCacheTelemetrySource::Provider,
                cached_tokens: Some(cached),
                cache_creation_tokens,
                miss_reason: None,
            },
            Some(cached) if cached > 0 => Self {
                eligible: true,
                status: PromptCacheStatus::PartialHit,
                source: PromptCacheTelemetrySource::Provider,
                cached_tokens: Some(cached),
                cache_creation_tokens,
                miss_reason: None,
            },
            Some(cached) => Self {
                eligible: true,
                status: PromptCacheStatus::Miss,
                source: PromptCacheTelemetrySource::Provider,
                cached_tokens: Some(cached),
                cache_creation_tokens,
                miss_reason: Some("provider_reported_zero_cached_tokens".to_string()),
            },
            None if cache_creation_tokens.is_some() => Self {
                eligible: true,
                status: PromptCacheStatus::Miss,
                source: PromptCacheTelemetrySource::Provider,
                cached_tokens: None,
                cache_creation_tokens,
                miss_reason: Some("provider_reported_cache_creation_without_read".to_string()),
            },
            None => Self::unavailable(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptPrefixIdentity {
    pub stable_scope_key: String,
    pub base_prompt_hash: String,
    pub toolset_hash: String,
    pub user_context_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_turn_id: Option<String>,
}

impl PromptPrefixIdentity {
    pub fn new(
        stable_scope_key: impl Into<String>,
        base_prompt_hash: impl Into<String>,
        toolset_hash: impl Into<String>,
        user_context_hash: impl Into<String>,
    ) -> Self {
        Self {
            stable_scope_key: stable_scope_key.into(),
            base_prompt_hash: base_prompt_hash.into(),
            toolset_hash: toolset_hash.into(),
            user_context_hash: user_context_hash.into(),
            parent_session_id: None,
            parent_turn_id: None,
        }
    }

    pub fn with_parent_link(
        mut self,
        parent_session_id: impl Into<String>,
        parent_turn_id: impl Into<String>,
    ) -> Self {
        self.parent_session_id = Some(parent_session_id.into());
        self.parent_turn_id = Some(parent_turn_id.into());
        self
    }

    pub fn prefix_safe_fields_match(&self, other: &Self) -> bool {
        self.stable_scope_key == other.stable_scope_key
            && self.base_prompt_hash == other.base_prompt_hash
            && self.toolset_hash == other.toolset_hash
            && self.user_context_hash == other.user_context_hash
    }

    pub fn clone_for_child_if_compatible(
        &self,
        child: &Self,
        parent_session_id: impl Into<String>,
        parent_turn_id: impl Into<String>,
    ) -> Option<Self> {
        if self.prefix_safe_fields_match(child) {
            Some(
                child
                    .clone()
                    .with_parent_link(parent_session_id, parent_turn_id),
            )
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultitaskBranchRisk {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultitaskBranch {
    pub id: String,
    pub goal: String,
    #[serde(default)]
    pub inputs: Vec<String>,
    #[serde(default)]
    pub write_scopes: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    pub risk: MultitaskBranchRisk,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultitaskPlan {
    pub id: String,
    #[serde(default)]
    pub branches: Vec<MultitaskBranch>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultitaskRejectionReason {
    NoIndependentBranches,
    DependencyUnfinished,
    WriteScopeConflict,
    ForcedExecutionDisabled,
    ConcurrencyLimitUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultitaskSchedulerDryRun {
    pub plan_id: String,
    #[serde(default)]
    pub planned_branch_ids: Vec<String>,
    #[serde(default)]
    pub rejected_branch_ids: Vec<String>,
    #[serde(default)]
    pub rejection_reasons: Vec<MultitaskRejectionReason>,
    pub estimated_parallelism: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultitaskSchedulerAction {
    ExecuteParallel,
    FallbackToPromptGuided,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultitaskSchedulerDecision {
    pub plan_id: String,
    pub action: MultitaskSchedulerAction,
    pub dry_run: MultitaskSchedulerDryRun,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultitaskBranchResultStatus {
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultitaskBranchResult {
    pub branch_id: String,
    pub status: MultitaskBranchResultStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicToolDescriptor {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
}

#[async_trait::async_trait]
pub trait DynamicToolProvider: Send + Sync {
    async fn list_dynamic_tools(&self) -> PortResult<Vec<DynamicToolDescriptor>>;
}

pub trait ToolDecorator<Tool>: Send + Sync {
    fn decorate(&self, tool: Tool) -> Tool;
}

#[async_trait::async_trait]
pub trait ConfigReadPort: Send + Sync {
    async fn get_config_value(&self, key: &str) -> PortResult<Option<serde_json::Value>>;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTranscriptRequest {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTranscript {
    pub session_id: String,
    #[serde(default)]
    pub messages: Vec<TranscriptMessage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub content: serde_json::Value,
}

#[async_trait::async_trait]
pub trait SessionTranscriptReader: Send + Sync {
    async fn read_session_transcript(
        &self,
        request: SessionTranscriptRequest,
    ) -> PortResult<SessionTranscript>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DelegationPolicy {
    /// Legacy serialized Task authority. Keep this field for persisted/runtime
    /// compatibility; callers should prefer the typed query methods below.
    pub allow_subagent_spawn: bool,
    pub nesting_depth: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DelegationTier {
    TopLevel,
    OrdinaryChild,
    TeamMember,
    TeamWorker,
}

pub const TEAM_DELEGATION_MAX_WORKER_TASKS_CONTEXT_KEY: &str = "teamDelegationMaxWorkerTasks";
pub const TEAM_DELEGATION_MAX_PARALLEL_WORKERS_CONTEXT_KEY: &str =
    "teamDelegationMaxParallelWorkers";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDelegationBudget {
    pub max_worker_tasks: u8,
    pub max_parallel_workers: u8,
}

impl TeamDelegationBudget {
    pub fn bounded(max_worker_tasks: u8, max_parallel_workers: u8) -> Option<Self> {
        (max_worker_tasks > 0
            && max_parallel_workers > 0
            && max_parallel_workers <= max_worker_tasks)
            .then_some(Self {
                max_worker_tasks,
                max_parallel_workers,
            })
    }

    pub fn write_context(self, context: &mut std::collections::HashMap<String, String>) {
        context.insert(
            TEAM_DELEGATION_MAX_WORKER_TASKS_CONTEXT_KEY.to_string(),
            self.max_worker_tasks.to_string(),
        );
        context.insert(
            TEAM_DELEGATION_MAX_PARALLEL_WORKERS_CONTEXT_KEY.to_string(),
            self.max_parallel_workers.to_string(),
        );
    }

    pub fn from_context(context: &std::collections::HashMap<String, String>) -> Option<Self> {
        let max_worker_tasks = context
            .get(TEAM_DELEGATION_MAX_WORKER_TASKS_CONTEXT_KEY)?
            .parse::<u8>()
            .ok()?;
        let max_parallel_workers = context
            .get(TEAM_DELEGATION_MAX_PARALLEL_WORKERS_CONTEXT_KEY)?
            .parse::<u8>()
            .ok()?;
        Self::bounded(max_worker_tasks, max_parallel_workers)
    }
}

impl Default for DelegationPolicy {
    fn default() -> Self {
        Self::top_level()
    }
}

impl DelegationPolicy {
    pub fn top_level() -> Self {
        Self {
            allow_subagent_spawn: true,
            nesting_depth: 0,
        }
    }

    pub fn spawn_child(self) -> Self {
        match self.tier() {
            DelegationTier::TeamMember => Self::team_worker(),
            _ => Self::ordinary_child(self.nesting_depth.saturating_add(1)),
        }
    }

    pub fn team_member() -> Self {
        Self {
            allow_subagent_spawn: true,
            nesting_depth: 1,
        }
    }

    pub fn team_worker() -> Self {
        Self {
            allow_subagent_spawn: false,
            nesting_depth: 2,
        }
    }

    pub fn ordinary_child(nesting_depth: u8) -> Self {
        Self {
            allow_subagent_spawn: false,
            nesting_depth,
        }
    }

    pub fn tier(self) -> DelegationTier {
        match (self.allow_subagent_spawn, self.nesting_depth) {
            (true, 0) => DelegationTier::TopLevel,
            (true, 1) => DelegationTier::TeamMember,
            (false, depth) if depth >= 2 => DelegationTier::TeamWorker,
            _ => DelegationTier::OrdinaryChild,
        }
    }

    pub fn allows_task_spawn(self) -> bool {
        matches!(
            self.tier(),
            DelegationTier::TopLevel | DelegationTier::TeamMember
        )
    }

    pub fn allows_team_orchestration(self) -> bool {
        self.tier() == DelegationTier::TopLevel
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentContextMode {
    #[default]
    Fresh,
    Fork,
}

impl SubagentContextMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fresh => "fresh",
            Self::Fork => "fork",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_error_display_keeps_kind_and_message() {
        let error = PortError::new(PortErrorKind::NotAvailable, "coordinator missing");

        assert_eq!(
            error.to_string(),
            "NotAvailable: coordinator missing".to_string()
        );
    }

    #[test]
    fn agent_submission_request_serializes_with_stable_camel_case() {
        let request = AgentSubmissionRequest {
            session_id: "session_1".to_string(),
            message: "hello".to_string(),
            turn_id: None,
            source: None,
            attachments: Vec::new(),
            metadata: serde_json::Map::new(),
        };

        let json = serde_json::to_value(request).expect("serialize request");

        assert_eq!(json["sessionId"], "session_1");
        assert_eq!(json["message"], "hello");
        assert!(json.get("source").is_none());
        assert!(json.get("attachments").is_none());
    }

    #[test]
    fn agent_submission_request_serializes_source_without_changing_field_case() {
        let request = AgentSubmissionRequest {
            session_id: "session_1".to_string(),
            message: "hello".to_string(),
            turn_id: None,
            source: Some(AgentSubmissionSource::RemoteRelay),
            attachments: Vec::new(),
            metadata: serde_json::Map::new(),
        };

        let json = serde_json::to_value(request).expect("serialize request");

        assert_eq!(json["source"], "remote_relay");
        assert!(json.get("turnId").is_none());
    }

    #[test]
    fn dialog_trigger_source_reuses_agent_submission_source_contract() {
        let json = serde_json::to_value(DialogTriggerSource::Cli)
            .expect("serialize dialog trigger source");

        assert_eq!(json, serde_json::json!("cli"));
    }

    #[test]
    fn dialog_submission_policy_preserves_current_surface_queue_defaults() {
        let remote = DialogSubmissionPolicy::for_source(DialogTriggerSource::RemoteRelay);
        assert_eq!(remote.queue_priority, DialogQueuePriority::Normal);
        assert!(remote.skip_tool_confirmation);

        let bot = DialogSubmissionPolicy::for_source(DialogTriggerSource::Bot);
        assert_eq!(bot.queue_priority, DialogQueuePriority::Normal);
        assert!(bot.skip_tool_confirmation);

        let agent_session = DialogSubmissionPolicy::for_source(DialogTriggerSource::AgentSession);
        assert_eq!(agent_session.queue_priority, DialogQueuePriority::Low);
        assert!(agent_session.skip_tool_confirmation);

        let cli = DialogSubmissionPolicy::for_source(DialogTriggerSource::Cli);
        assert_eq!(cli.queue_priority, DialogQueuePriority::Normal);
        assert!(!cli.skip_tool_confirmation);
    }

    #[test]
    fn dialog_submit_outcome_preserves_started_and_queued_fields() {
        let started = DialogSubmitOutcome::Started {
            session_id: "session_1".to_string(),
            turn_id: "turn_1".to_string(),
        };
        let queued = DialogSubmitOutcome::Queued {
            session_id: "session_1".to_string(),
            turn_id: "turn_2".to_string(),
        };

        assert_eq!(
            started,
            DialogSubmitOutcome::Started {
                session_id: "session_1".to_string(),
                turn_id: "turn_1".to_string(),
            }
        );
        assert_ne!(started, queued);
    }

    #[test]
    fn dialog_submit_queue_action_preserves_current_scheduler_routing_policy() {
        let remote = DialogSubmissionPolicy::for_source(DialogTriggerSource::RemoteRelay);
        assert!(dialog_policy_may_preempt(&remote));

        let agent_session = DialogSubmissionPolicy::for_source(DialogTriggerSource::AgentSession);
        assert!(!dialog_policy_may_preempt(&agent_session));

        assert_eq!(
            resolve_dialog_submit_queue_action(DialogSubmitQueueFacts {
                session_state: DialogSessionStateFact::Missing,
                queue_has_items: true,
                policy: remote,
            }),
            DialogSubmitQueueAction::StartImmediately
        );
        assert_eq!(
            resolve_dialog_submit_queue_action(DialogSubmitQueueFacts {
                session_state: DialogSessionStateFact::Error,
                queue_has_items: true,
                policy: remote,
            }),
            DialogSubmitQueueAction::ClearQueueAndStartImmediately
        );
        assert_eq!(
            resolve_dialog_submit_queue_action(DialogSubmitQueueFacts {
                session_state: DialogSessionStateFact::Idle,
                queue_has_items: false,
                policy: remote,
            }),
            DialogSubmitQueueAction::StartImmediately
        );
        assert_eq!(
            resolve_dialog_submit_queue_action(DialogSubmitQueueFacts {
                session_state: DialogSessionStateFact::Idle,
                queue_has_items: true,
                policy: remote,
            }),
            DialogSubmitQueueAction::EnqueueThenStartNext
        );
        assert_eq!(
            resolve_dialog_submit_queue_action(DialogSubmitQueueFacts {
                session_state: DialogSessionStateFact::Processing,
                queue_has_items: false,
                policy: remote,
            }),
            DialogSubmitQueueAction::EnqueueForActiveTurn {
                request_yield: true
            }
        );
        assert_eq!(
            resolve_dialog_submit_queue_action(DialogSubmitQueueFacts {
                session_state: DialogSessionStateFact::Processing,
                queue_has_items: false,
                policy: agent_session,
            }),
            DialogSubmitQueueAction::EnqueueForActiveTurn {
                request_yield: false
            }
        );
    }

    #[test]
    fn agent_session_reply_decisions_preserve_cancel_suppression_boundary() {
        let policy = DialogSubmissionPolicy::for_source(DialogTriggerSource::AgentSession);
        assert!(should_suppress_agent_session_cancelled_reply(
            &policy,
            Some("requester"),
            "requester",
        ));
        assert!(!should_suppress_agent_session_cancelled_reply(
            &policy,
            Some("requester"),
            "other",
        ));

        let remote = DialogSubmissionPolicy::for_source(DialogTriggerSource::RemoteRelay);
        assert!(!should_suppress_agent_session_cancelled_reply(
            &remote,
            Some("requester"),
            "requester",
        ));

        assert!(should_skip_agent_session_reply(
            DialogTurnOutcomeKind::Cancelled,
            true,
        ));
        assert!(!should_skip_agent_session_reply(
            DialogTurnOutcomeKind::Cancelled,
            false,
        ));
        assert!(!should_skip_agent_session_reply(
            DialogTurnOutcomeKind::Completed,
            true,
        ));
        assert!(!should_skip_agent_session_reply(
            DialogTurnOutcomeKind::Failed,
            true,
        ));
    }

    #[test]
    fn agent_session_reply_route_keeps_requester_fields() {
        let route = AgentSessionReplyRoute {
            source_session_id: "requester_session".to_string(),
            source_workspace_path: "D:\\workspace\\requester".to_string(),
        };

        assert_eq!(route.source_session_id, "requester_session");
        assert_eq!(route.source_workspace_path, "D:\\workspace\\requester");
    }

    #[test]
    fn dialog_steer_outcome_preserves_buffered_fields() {
        let outcome = DialogSteerOutcome::Buffered {
            session_id: "session_1".to_string(),
            turn_id: "turn_1".to_string(),
            steering_id: "steer_1".to_string(),
        };

        assert_eq!(
            outcome,
            DialogSteerOutcome::Buffered {
                session_id: "session_1".to_string(),
                turn_id: "turn_1".to_string(),
                steering_id: "steer_1".to_string(),
            }
        );
    }

    #[test]
    fn round_injection_contract_keeps_kind_and_target_identity() {
        assert_eq!(
            RoundInjectionKind::UserSteering,
            RoundInjectionKind::UserSteering
        );
        assert_ne!(
            RoundInjectionKind::UserSteering,
            RoundInjectionKind::BackgroundResult
        );

        let target = RoundInjectionTarget::ExactTurn("turn_1".to_string());
        assert_eq!(
            target,
            RoundInjectionTarget::ExactTurn("turn_1".to_string())
        );
        assert_ne!(target, RoundInjectionTarget::CurrentRunningTurn);
    }

    #[test]
    fn round_injection_source_contract_drains_portable_injections() {
        struct StaticInjectionSource {
            injection: RoundInjection,
        }

        impl DialogRoundInjectionSource for StaticInjectionSource {
            fn has_pending(&self, session_id: &str, turn_id: &str) -> bool {
                session_id == "session_1" && turn_id == "turn_1"
            }

            fn take_pending(&self, session_id: &str, turn_id: &str) -> Vec<RoundInjection> {
                if self.has_pending(session_id, turn_id) {
                    vec![self.injection.clone()]
                } else {
                    Vec::new()
                }
            }
        }

        let source = StaticInjectionSource {
            injection: RoundInjection {
                id: "injection_1".to_string(),
                kind: RoundInjectionKind::BackgroundResult,
                target: RoundInjectionTarget::CurrentRunningTurn,
                content: "result".to_string(),
                display_content: "result".to_string(),
                created_at: std::time::SystemTime::UNIX_EPOCH,
            },
        };

        assert!(source.has_pending("session_1", "turn_1"));
        assert!(!source.has_pending("session_2", "turn_1"));
        let drained = source.take_pending("session_1", "turn_1");
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].id, "injection_1");
        assert_eq!(drained[0].kind, RoundInjectionKind::BackgroundResult);
    }

    #[test]
    fn goal_mode_state_requires_active_non_empty_goal() {
        let active = GoalModeState {
            active: true,
            status: GoalModeStatus::Active,
            initial_goal: GoalModeInitialGoal::new(
                "Initial HR-C".to_string(),
                vec!["Initial check".to_string()],
                Some("preserve main baseline".to_string()),
                7,
            ),
            goal_text: "Ship HR-C".to_string(),
            success_criteria: vec!["Checks pass".to_string()],
            user_hint: None,
            activated_at_ms: 42,
            continuation_count: 1,
            token_budget: None,
            tokens_used: 0,
        };
        assert!(active.is_active());
        assert_eq!(active.initial_goal_text(), "Initial HR-C");
        assert_eq!(
            active.initial_success_criteria(),
            &["Initial check".to_string()]
        );
        assert_eq!(active.initial_user_hint(), Some("preserve main baseline"));
        assert_eq!(active.initial_goal_created_at_ms(), 7);

        let empty = GoalModeState {
            initial_goal: GoalModeInitialGoal::default(),
            goal_text: "  ".to_string(),
            ..active
        };
        assert!(!empty.is_active());
    }

    #[test]
    fn goal_verification_result_serializes_current_wire_shape() {
        let result = GoalVerificationResult {
            achieved: false,
            confidence: 0.7,
            gaps: vec!["missing docs".to_string()],
            guidance: "update docs".to_string(),
        };

        let json = serde_json::to_value(result).expect("serialize goal verification");

        assert_eq!(json["achieved"], false);
        let confidence = json["confidence"].as_f64().expect("confidence number");
        assert!((confidence - 0.7).abs() < 0.000_001);
        assert_eq!(json["gaps"][0], "missing docs");
        assert_eq!(json["guidance"], "update docs");
    }

    #[test]
    fn compression_contract_renders_model_visible_fields() {
        let contract = CompressionContract {
            touched_files: vec!["src/lib.rs".to_string()],
            verification_commands: vec![CompressionContractItem {
                target: "cargo test -p void-runtime-ports".to_string(),
                status: "passed".to_string(),
                summary: "runtime ports contract tests passed".to_string(),
                error_kind: None,
            }],
            blocking_failures: vec![CompressionContractItem {
                target: "cargo check".to_string(),
                status: "failed".to_string(),
                summary: "compile error before migration".to_string(),
                error_kind: Some("compile".to_string()),
            }],
            subagent_statuses: Vec::new(),
        };

        let rendered = contract.render_for_model();

        assert!(rendered.contains("Compaction contract"));
        assert!(rendered.contains("Touched files:"));
        assert!(rendered.contains("- src/lib.rs"));
        assert!(rendered.contains(
            "- cargo test -p void-runtime-ports [passed]: runtime ports contract tests passed"
        ));
        assert!(
            rendered.contains("- cargo check [failed]: compile error before migration (compile)")
        );
    }

    #[test]
    fn related_path_serializes_as_request_context_fact() {
        let related = RelatedPath {
            path: "D:/workspace/shared".to_string(),
            description: Some("shared fixtures".to_string()),
        };

        let json = serde_json::to_value(related).expect("serialize related path");

        assert_eq!(json["path"], "D:/workspace/shared");
        assert_eq!(json["description"], "shared fixtures");
        assert!(json.get("related_path").is_none());
    }

    #[test]
    fn agent_submission_request_serializes_explicit_turn_id_contract() {
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

        let json = serde_json::to_value(request).expect("serialize request");

        assert_eq!(json["turnId"], "explicit_turn");
        assert_eq!(json["metadata"]["turnId"], "legacy_metadata_turn");
    }

    #[test]
    fn remote_image_attachment_serializes_portable_metadata_contract() {
        let attachment =
            AgentInputAttachment::remote_image("image-1", "clip.png", "data:image/png;base64,abc");

        let json = serde_json::to_value(attachment).expect("serialize attachment");

        assert_eq!(json["kind"], "remote_image");
        assert_eq!(json["id"], "image-1");
        assert_eq!(json["metadata"]["name"], "clip.png");
        assert_eq!(json["metadata"]["dataUrl"], "data:image/png;base64,abc");
    }

    #[test]
    fn agent_turn_cancellation_request_serializes_current_contract() {
        let request = AgentTurnCancellationRequest {
            session_id: "session_1".to_string(),
            turn_id: Some("turn_1".to_string()),
            source: Some(AgentSubmissionSource::Bot),
            reason: Some("user_cancelled".to_string()),
            wait_timeout_ms: Some(1500),
        };

        let json = serde_json::to_value(request).expect("serialize cancel request");

        assert_eq!(json["sessionId"], "session_1");
        assert_eq!(json["turnId"], "turn_1");
        assert_eq!(json["source"], "bot");
        assert_eq!(json["reason"], "user_cancelled");
        assert_eq!(json["waitTimeoutMs"], 1500);
    }

    #[test]
    fn remote_control_state_snapshot_serializes_active_turn_contract() {
        let snapshot = RemoteControlStateSnapshot {
            session_id: "session_1".to_string(),
            state: RemoteControlSessionState::Processing,
            active_turn_id: Some("turn_1".to_string()),
            queue_depth: 2,
            metadata: serde_json::Map::new(),
        };

        let json = serde_json::to_value(snapshot).expect("serialize state snapshot");

        assert_eq!(json["sessionId"], "session_1");
        assert_eq!(json["state"], "processing");
        assert_eq!(json["activeTurnId"], "turn_1");
        assert_eq!(json["queueDepth"], 2);
    }

    #[test]
    fn runtime_event_envelope_serializes_observational_surface_facts() {
        let event = RuntimeEventEnvelope {
            session_id: "session_1".to_string(),
            turn_id: Some("turn_1".to_string()),
            source: Some(AgentSubmissionSource::RemoteRelay),
            event_type: RuntimeEventType::TurnCancelled,
            payload: serde_json::json!({ "reason": "user_cancelled" }),
        };

        let json = serde_json::to_value(event).expect("serialize event");

        assert_eq!(json["sessionId"], "session_1");
        assert_eq!(json["turnId"], "turn_1");
        assert_eq!(json["source"], "remote_relay");
        assert_eq!(json["eventType"], "turn_cancelled");
        assert_eq!(json["payload"]["reason"], "user_cancelled");
    }

    #[test]
    fn session_transcript_request_serializes_turn_id_contract() {
        let request = SessionTranscriptRequest {
            session_id: "session_1".to_string(),
            turn_id: Some("turn_1".to_string()),
        };

        let json = serde_json::to_value(request).expect("serialize transcript request");

        assert_eq!(json["sessionId"], "session_1");
        assert_eq!(json["turnId"], "turn_1");
        assert!(json.get("fromTurnId").is_none());
    }

    #[test]
    fn dynamic_tool_descriptor_serializes_current_wire_shape() {
        let descriptor = DynamicToolDescriptor {
            name: "external_search".to_string(),
            description: "Search external docs".to_string(),
            input_schema: serde_json::json!({ "type": "object" }),
            provider_id: Some("provider-a".to_string()),
        };

        let json = serde_json::to_value(descriptor).expect("serialize descriptor");

        assert_eq!(json["name"], "external_search");
        assert_eq!(json["description"], "Search external docs");
        assert_eq!(json["inputSchema"]["type"], "object");
        assert_eq!(json["providerId"], "provider-a");
        assert!(json.get("provider_id").is_none());
    }

    #[test]
    fn subagent_context_mode_preserves_fork_wire_value() {
        assert_eq!(SubagentContextMode::default(), SubagentContextMode::Fresh);
        assert_eq!(SubagentContextMode::Fresh.as_str(), "fresh");
        assert_eq!(SubagentContextMode::Fork.as_str(), "fork");

        let json = serde_json::to_value(SubagentContextMode::Fork)
            .expect("serialize subagent context mode");

        assert_eq!(json, serde_json::json!("fork"));
    }

    #[test]
    fn delegation_policy_child_blocks_recursive_spawn_without_losing_depth() {
        let top_level = DelegationPolicy::top_level();
        assert!(top_level.allows_task_spawn());
        assert!(top_level.allows_team_orchestration());
        assert_eq!(top_level.nesting_depth, 0);

        let child = top_level.spawn_child();

        assert!(!child.allows_task_spawn());
        assert!(!child.allows_team_orchestration());
        assert_eq!(child.nesting_depth, 1);
        assert_eq!(child.spawn_child().nesting_depth, 2);
    }

    #[test]
    fn team_member_can_spawn_exactly_one_worker_level_without_team_authority() {
        let member = DelegationPolicy::team_member();
        assert_eq!(member.tier(), DelegationTier::TeamMember);
        assert!(member.allows_task_spawn());
        assert!(!member.allows_team_orchestration());

        let worker = member.spawn_child();
        assert_eq!(worker.tier(), DelegationTier::TeamWorker);
        assert_eq!(worker.nesting_depth, 2);
        assert!(!worker.allows_task_spawn());
        assert!(!worker.allows_team_orchestration());
    }

    #[test]
    fn team_delegation_budget_round_trips_through_typed_context() {
        let budget = TeamDelegationBudget::bounded(8, 3).expect("bounded budget");
        let mut context = std::collections::HashMap::new();
        budget.write_context(&mut context);

        assert_eq!(TeamDelegationBudget::from_context(&context), Some(budget));
        assert!(TeamDelegationBudget::bounded(2, 3).is_none());
    }

    #[test]
    fn dynamic_tool_descriptor_omits_missing_provider_id() {
        let descriptor = DynamicToolDescriptor {
            name: "local_tool".to_string(),
            description: "Local tool".to_string(),
            input_schema: serde_json::json!({ "type": "object" }),
            provider_id: None,
        };

        let json = serde_json::to_value(descriptor).expect("serialize descriptor");

        assert!(json.get("providerId").is_none());
    }

    #[test]
    fn prompt_cache_telemetry_distinguishes_hit_miss_and_unavailable() {
        let hit = PromptCacheTelemetry::from_provider_counts(100, Some(100), None);
        assert_eq!(hit.status, PromptCacheStatus::Hit);
        assert_eq!(hit.source, PromptCacheTelemetrySource::Provider);
        assert_eq!(hit.cached_tokens, Some(100));

        let partial = PromptCacheTelemetry::from_provider_counts(100, Some(40), None);
        assert_eq!(partial.status, PromptCacheStatus::PartialHit);

        let miss = PromptCacheTelemetry::from_provider_counts(100, Some(0), None);
        assert_eq!(miss.status, PromptCacheStatus::Miss);
        assert_eq!(
            miss.miss_reason.as_deref(),
            Some("provider_reported_zero_cached_tokens")
        );

        let unavailable = PromptCacheTelemetry::from_provider_counts(100, None, None);
        assert_eq!(unavailable.status, PromptCacheStatus::Unavailable);
        assert_eq!(unavailable.source, PromptCacheTelemetrySource::Unavailable);
    }

    #[test]
    fn prompt_prefix_identity_reuses_only_when_prefix_safe_fields_match() {
        let parent = PromptPrefixIdentity::new("coding_shared", "base-a", "tools-a", "ctx-a");
        let child = PromptPrefixIdentity::new("coding_shared", "base-a", "tools-a", "ctx-a");

        let cloned = parent
            .clone_for_child_if_compatible(&child, "parent-session", "turn-1")
            .expect("compatible child should inherit parent link");

        assert_eq!(cloned.parent_session_id.as_deref(), Some("parent-session"));
        assert_eq!(cloned.parent_turn_id.as_deref(), Some("turn-1"));

        let changed_tools =
            PromptPrefixIdentity::new("coding_shared", "base-a", "tools-b", "ctx-a");
        assert!(
            parent
                .clone_for_child_if_compatible(&changed_tools, "parent-session", "turn-1")
                .is_none(),
            "tool list changes must invalidate the prefix identity"
        );
    }

    #[test]
    fn multitask_plan_serializes_scheduler_contract() {
        let plan = MultitaskPlan {
            id: "plan-1".to_string(),
            branches: vec![
                MultitaskBranch {
                    id: "branch-a".to_string(),
                    goal: "inspect backend".to_string(),
                    inputs: vec!["src/crates/core".to_string()],
                    write_scopes: vec![],
                    dependencies: vec![],
                    risk: MultitaskBranchRisk::Low,
                    subagent_type: Some("Explore".to_string()),
                },
                MultitaskBranch {
                    id: "branch-b".to_string(),
                    goal: "inspect frontend".to_string(),
                    inputs: vec!["src/web-ui".to_string()],
                    write_scopes: vec![],
                    dependencies: vec![],
                    risk: MultitaskBranchRisk::Low,
                    subagent_type: Some("Explore".to_string()),
                },
            ],
        };

        let json = serde_json::to_value(&plan).expect("serialize plan");
        assert_eq!(json["id"], "plan-1");
        assert_eq!(json["branches"][0]["risk"], "low");

        let dry_run = MultitaskSchedulerDryRun {
            plan_id: plan.id,
            planned_branch_ids: vec!["branch-a".to_string(), "branch-b".to_string()],
            rejected_branch_ids: vec![],
            rejection_reasons: vec![],
            estimated_parallelism: 2,
        };
        let decision = MultitaskSchedulerDecision {
            plan_id: "plan-1".to_string(),
            action: MultitaskSchedulerAction::ExecuteParallel,
            dry_run,
        };
        let json = serde_json::to_value(&decision).expect("serialize decision");
        assert_eq!(json["action"], "execute_parallel");
        assert_eq!(json["dryRun"]["estimatedParallelism"], 2);
    }
}
