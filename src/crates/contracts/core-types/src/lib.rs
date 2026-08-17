//! Shared low-level product DTOs.
//!
//! This crate must stay lightweight: do not add runtime, network, platform, or
//! product assembly dependencies here.

pub mod errors;
pub mod external_config_sources;
pub mod session;
pub mod subagent_task;
pub mod subscription_auth;
pub mod surface;
pub mod tool_image_attachment;

pub use errors::{AiErrorDetail, ErrorCategory};
pub use external_config_sources::{
    ExternalConfigFormat, ExternalConfigLocationCategory, ExternalConfigSafeSummary,
    ExternalConfigSource, ExternalConfigSourceError, ExternalConfigSourceErrorCode,
    ExternalConfigSourceSnapshot, ExternalConfigSourceStatus, ExternalConfigSourcesSnapshot,
};
pub use session::SessionKind;
pub use subagent_task::{
    SubagentLaunchAuthority, SubagentLaunchAuthorityKind, SubagentTaskCheckpointRef,
    SubagentTaskContextMode, SubagentTaskDeliveryLease, SubagentTaskDeliveryReceipt,
    SubagentTaskDeliveryState, SubagentTaskExecutionMode, SubagentTaskLaunchSpec,
    SubagentTaskRecord, SubagentTaskRecoveryBlock, SubagentTaskRecoveryBlockCode,
    SubagentTaskRecoveryState, SubagentTaskReplaySafety, SubagentTaskStatus,
    SubagentTaskTransitionError, TeamDelegationLineageSnapshot, TeamMemberSkillPolicyKind,
    TeamMemberSkillPolicySnapshot, SUBAGENT_LAUNCH_AUTHORITY_SCHEMA_VERSION,
    SUBAGENT_TASK_SCHEMA_VERSION, TEAM_DELEGATION_CONTEXT_KEYS,
    TEAM_DELEGATION_PARENT_MEMBER_SESSION_CONTEXT_KEY, TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY,
    TEAM_MEMBER_SKILL_POLICY_SCHEMA_VERSION,
};
pub use subscription_auth::SubscriptionProvider;
pub use surface::{
    ApprovalSource, CapabilityRequest, CapabilityRequestKind, PermissionDecision, PermissionScope,
    RuntimeArtifactKind, RuntimeArtifactRef, SurfaceKind, ThreadEnvironment, ThreadEnvironmentKind,
};
pub use tool_image_attachment::ToolImageAttachment;
