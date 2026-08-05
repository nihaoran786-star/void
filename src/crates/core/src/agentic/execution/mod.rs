//! Execution Engine Layer
//!
//! Responsible for AI interaction and model round control

pub mod execution_engine;
pub mod persona_runtime;
pub mod round_executor;
pub mod stream_processor;
pub mod types;
pub mod write_content_sanitizer;

pub use execution_engine::*;
pub use persona_runtime::{
    is_persona_runtime_validation_error_message, resolve_persona_turn_runtime,
    wrap_persona_runtime_validation_error, ResolvedPersonaRuntime, ResolvedTeamLeadPersona,
    TeamLeadPersonaResolveRequest, TeamLeadPersonaResolver,
};
pub use round_executor::*;
pub use stream_processor::*;
pub use types::{ExecutionContext, ExecutionResult, FinishReason, RoundContext, RoundResult};
