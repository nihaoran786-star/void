//! Shared low-level product DTOs.
//!
//! This crate must stay lightweight: do not add runtime, network, platform, or
//! product assembly dependencies here.

pub mod errors;
pub mod external_config_sources;
pub mod session;
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
pub use subscription_auth::SubscriptionProvider;
pub use surface::{
    ApprovalSource, CapabilityRequest, CapabilityRequestKind, PermissionDecision, PermissionScope,
    RuntimeArtifactKind, RuntimeArtifactRef, SurfaceKind, ThreadEnvironment, ThreadEnvironmentKind,
};
pub use tool_image_attachment::ToolImageAttachment;
