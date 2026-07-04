//! Tool pipeline type definitions

use crate::agentic::core::{ToolCall, ToolExecutionState};
use crate::agentic::events::SubagentParentInfo as EventSubagentParentInfo;
use crate::agentic::round_preempt::DialogRoundInjectionInterrupt;
use crate::agentic::tools::ToolRuntimeRestrictions;
use crate::agentic::workspace::WorkspaceServices;
use crate::agentic::WorkspaceBinding;
use crate::util::errors::VoidError;
use std::collections::HashMap;
use std::time::SystemTime;
use void_runtime_ports::DelegationPolicy;

/// Tool execution options
#[derive(Debug, Clone)]
pub struct ToolExecutionOptions {
    pub allow_parallel: bool,
    pub max_retries: usize,
    /// Tool execution timeout (seconds), None means infinite waiting
    pub timeout_secs: Option<u64>,
    pub confirm_before_run: bool,
    /// Tool confirmation timeout (seconds), None means infinite waiting
    pub confirmation_timeout_secs: Option<u64>,
}

impl Default for ToolExecutionOptions {
    fn default() -> Self {
        Self {
            allow_parallel: true,
            max_retries: 0,
            timeout_secs: None, // Default no timeout (infinite waiting)
            confirm_before_run: true,
            confirmation_timeout_secs: None, // Default no timeout (infinite waiting)
        }
    }
}

#[derive(Debug, Clone)]
pub struct SubagentParentInfo {
    pub tool_call_id: String,
    pub session_id: String,
    pub dialog_turn_id: String,
}

impl From<SubagentParentInfo> for EventSubagentParentInfo {
    fn from(info: SubagentParentInfo) -> Self {
        Self {
            tool_call_id: info.tool_call_id,
            session_id: info.session_id,
            dialog_turn_id: info.dialog_turn_id,
        }
    }
}

/// Tool execution context
#[derive(Debug, Clone)]
pub struct ToolExecutionContext {
    pub session_id: String,
    pub dialog_turn_id: String,
    pub round_id: String,
    pub agent_type: String,
    pub workspace: Option<WorkspaceBinding>,
    pub context_vars: HashMap<String, String>,
    pub subagent_parent_info: Option<SubagentParentInfo>,
    pub(crate) delegation_policy: DelegationPolicy,
    pub collapsed_tools: Vec<String>,
    pub unlocked_collapsed_tools: Vec<String>,
    /// Allowed tools list (whitelist)
    /// If empty, allow all registered tools
    /// If not empty, only allow tools in the list to be executed
    pub allowed_tools: Vec<String>,
    pub runtime_tool_restrictions: ToolRuntimeRestrictions,
    /// Optional cooperative interrupt used to stop remaining tool calls when a
    /// round injection is waiting for this turn.
    pub steering_interrupt: Option<DialogRoundInjectionInterrupt>,
    pub workspace_services: Option<WorkspaceServices>,
}

/// Tool execution task
#[derive(Debug, Clone)]
pub struct ToolTask {
    pub tool_call: ToolCall,
    pub context: ToolExecutionContext,
    pub options: ToolExecutionOptions,
    pub state: ToolExecutionState,
    pub created_at: SystemTime,
    pub started_at: Option<SystemTime>,
    pub completed_at: Option<SystemTime>,
}

impl ToolTask {
    pub fn new(
        tool_call: ToolCall,
        context: ToolExecutionContext,
        options: ToolExecutionOptions,
    ) -> Self {
        Self {
            tool_call,
            context,
            options,
            state: ToolExecutionState::Queued { position: 0 },
            created_at: SystemTime::now(),
            started_at: None,
            completed_at: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolPipelineOutcomeCategory {
    InvalidArguments,
    UserRejected,
    ConfirmationTimeout,
    RuntimeDenied,
    CollapsedToolGateDenied,
    McpRuntimeError,
    ToolTimeout,
    Cancelled,
    NotFound,
    ExecutionError,
}

impl ToolPipelineOutcomeCategory {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidArguments => "invalid_arguments",
            Self::UserRejected => "user_rejected",
            Self::ConfirmationTimeout => "confirmation_timeout",
            Self::RuntimeDenied => "runtime_denied",
            Self::CollapsedToolGateDenied => "collapsed_tool_gate_denied",
            Self::McpRuntimeError => "mcp_runtime_error",
            Self::ToolTimeout => "tool_timeout",
            Self::Cancelled => "cancelled",
            Self::NotFound => "not_found",
            Self::ExecutionError => "execution_error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolPipelineOutcome {
    pub status: ToolPipelineOutcomeStatus,
    pub source: ToolPipelineOutcomeSource,
    pub category: ToolPipelineOutcomeCategory,
    pub error_code: &'static str,
    pub retryable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolPipelineOutcomeStatus {
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolPipelineOutcomeSource {
    ToolPipeline,
    UserConfirmation,
    RuntimePolicy,
    ToolManifest,
    McpRuntime,
}

impl ToolPipelineOutcome {
    pub const fn category_str(&self) -> &'static str {
        self.category.as_str()
    }

    pub fn from_error(error: &VoidError) -> Self {
        match error {
            VoidError::Validation(message) if is_user_rejection_message(message) => Self {
                status: ToolPipelineOutcomeStatus::Cancelled,
                source: ToolPipelineOutcomeSource::UserConfirmation,
                category: ToolPipelineOutcomeCategory::UserRejected,
                error_code: "tool_user_rejected",
                retryable: false,
            },
            VoidError::Timeout(message) if is_confirmation_timeout_message(message) => Self {
                status: ToolPipelineOutcomeStatus::Cancelled,
                source: ToolPipelineOutcomeSource::UserConfirmation,
                category: ToolPipelineOutcomeCategory::ConfirmationTimeout,
                error_code: "tool_confirmation_timeout",
                retryable: false,
            },
            VoidError::Tool(message) if is_runtime_denial_message(message) => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::RuntimePolicy,
                category: ToolPipelineOutcomeCategory::RuntimeDenied,
                error_code: "tool_runtime_denied",
                retryable: false,
            },
            VoidError::Tool(message) if is_collapsed_tool_gate_message(message) => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::ToolManifest,
                category: ToolPipelineOutcomeCategory::CollapsedToolGateDenied,
                error_code: "tool_collapsed_gate_denied",
                retryable: false,
            },
            VoidError::MCPError(_) => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::McpRuntime,
                category: ToolPipelineOutcomeCategory::McpRuntimeError,
                error_code: "tool_mcp_runtime_error",
                retryable: false,
            },
            VoidError::Timeout(_) => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::ToolPipeline,
                category: ToolPipelineOutcomeCategory::ToolTimeout,
                error_code: "tool_timeout",
                retryable: true,
            },
            VoidError::Validation(_) => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::ToolPipeline,
                category: ToolPipelineOutcomeCategory::InvalidArguments,
                error_code: "tool_invalid_arguments",
                retryable: false,
            },
            VoidError::Cancelled(_) => Self {
                status: ToolPipelineOutcomeStatus::Cancelled,
                source: ToolPipelineOutcomeSource::ToolPipeline,
                category: ToolPipelineOutcomeCategory::Cancelled,
                error_code: "tool_cancelled",
                retryable: false,
            },
            VoidError::NotFound(_) => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::ToolPipeline,
                category: ToolPipelineOutcomeCategory::NotFound,
                error_code: "tool_not_found",
                retryable: false,
            },
            _ => Self {
                status: ToolPipelineOutcomeStatus::Error,
                source: ToolPipelineOutcomeSource::ToolPipeline,
                category: ToolPipelineOutcomeCategory::ExecutionError,
                error_code: "tool_execution_error",
                retryable: false,
            },
        }
    }
}

fn is_user_rejection_message(message: &str) -> bool {
    message.starts_with("Tool was rejected by user:")
}

fn is_confirmation_timeout_message(message: &str) -> bool {
    message.starts_with("Confirmation timeout")
}

fn is_runtime_denial_message(message: &str) -> bool {
    message.contains("denied by runtime restrictions")
        || message.contains("not allowed by runtime restrictions")
}

fn is_collapsed_tool_gate_message(message: &str) -> bool {
    message.contains(" is collapsed.") || message.contains("is collapsed. Call")
}

/// Tool execution result wrapper
#[derive(Debug, Clone)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    pub tool_name: String,
    pub result: crate::agentic::core::ToolResult,
    pub execution_time_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(error: VoidError) -> ToolPipelineOutcome {
        ToolPipelineOutcome::from_error(&error)
    }

    #[test]
    fn tool_pipeline_outcome_classifies_user_rejection() {
        let result = outcome(VoidError::Validation(
            "Tool was rejected by user: do not run this".to_string(),
        ));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Cancelled);
        assert_eq!(result.source, ToolPipelineOutcomeSource::UserConfirmation);
        assert_eq!(result.category, ToolPipelineOutcomeCategory::UserRejected);
        assert_eq!(result.error_code, "tool_user_rejected");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_confirmation_timeout() {
        let result = outcome(VoidError::Timeout("Confirmation timeout: Bash".to_string()));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Cancelled);
        assert_eq!(result.source, ToolPipelineOutcomeSource::UserConfirmation);
        assert_eq!(
            result.category,
            ToolPipelineOutcomeCategory::ConfirmationTimeout
        );
        assert_eq!(result.error_code, "tool_confirmation_timeout");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_runtime_denial() {
        let result = outcome(VoidError::Tool(
            "Tool 'Task' is denied by runtime restrictions".to_string(),
        ));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Error);
        assert_eq!(result.source, ToolPipelineOutcomeSource::RuntimePolicy);
        assert_eq!(result.category, ToolPipelineOutcomeCategory::RuntimeDenied);
        assert_eq!(result.error_code, "tool_runtime_denied");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_collapsed_tool_gate() {
        let result = outcome(VoidError::Tool(
            "Tool 'Git' is collapsed. Call GetToolSpec first.".to_string(),
        ));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Error);
        assert_eq!(result.source, ToolPipelineOutcomeSource::ToolManifest);
        assert_eq!(
            result.category,
            ToolPipelineOutcomeCategory::CollapsedToolGateDenied
        );
        assert_eq!(result.error_code, "tool_collapsed_gate_denied");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_mcp_runtime_error() {
        let result = outcome(VoidError::MCPError(
            "MCP server returned -32000".to_string(),
        ));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Error);
        assert_eq!(result.source, ToolPipelineOutcomeSource::McpRuntime);
        assert_eq!(
            result.category,
            ToolPipelineOutcomeCategory::McpRuntimeError
        );
        assert_eq!(result.error_code, "tool_mcp_runtime_error");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_tool_timeout_and_cancelled() {
        let timeout_result = outcome(VoidError::Timeout("tool execution timed out".to_string()));
        assert_eq!(
            timeout_result.category,
            ToolPipelineOutcomeCategory::ToolTimeout
        );
        assert_eq!(timeout_result.error_code, "tool_timeout");
        assert!(timeout_result.retryable);

        let cancelled_result = outcome(VoidError::Cancelled("user cancelled".to_string()));
        assert_eq!(
            cancelled_result.category,
            ToolPipelineOutcomeCategory::Cancelled
        );
        assert_eq!(cancelled_result.error_code, "tool_cancelled");
        assert!(!cancelled_result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_invalid_arguments() {
        let result = outcome(VoidError::Validation(
            "Arguments are invalid JSON.".to_string(),
        ));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Error);
        assert_eq!(result.source, ToolPipelineOutcomeSource::ToolPipeline);
        assert_eq!(
            result.category,
            ToolPipelineOutcomeCategory::InvalidArguments
        );
        assert_eq!(result.error_code, "tool_invalid_arguments");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_not_found() {
        let result = outcome(VoidError::NotFound(
            "Tool task not found: tool_1".to_string(),
        ));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Error);
        assert_eq!(result.source, ToolPipelineOutcomeSource::ToolPipeline);
        assert_eq!(result.category, ToolPipelineOutcomeCategory::NotFound);
        assert_eq!(result.error_code, "tool_not_found");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_classifies_generic_execution_error() {
        let result = outcome(VoidError::Tool("tool exited with status 1".to_string()));

        assert_eq!(result.status, ToolPipelineOutcomeStatus::Error);
        assert_eq!(result.source, ToolPipelineOutcomeSource::ToolPipeline);
        assert_eq!(result.category, ToolPipelineOutcomeCategory::ExecutionError);
        assert_eq!(result.error_code, "tool_execution_error");
        assert!(!result.retryable);
    }

    #[test]
    fn tool_pipeline_outcome_preserves_legacy_category_strings() {
        assert_eq!(
            ToolPipelineOutcomeCategory::InvalidArguments.as_str(),
            "invalid_arguments"
        );
        assert_eq!(
            ToolPipelineOutcomeCategory::UserRejected.as_str(),
            "user_rejected"
        );
        assert_eq!(
            ToolPipelineOutcomeCategory::ConfirmationTimeout.as_str(),
            "confirmation_timeout"
        );
        assert_eq!(
            ToolPipelineOutcomeCategory::CollapsedToolGateDenied.as_str(),
            "collapsed_tool_gate_denied"
        );
        assert_eq!(
            ToolPipelineOutcomeCategory::ExecutionError.as_str(),
            "execution_error"
        );
    }
}
