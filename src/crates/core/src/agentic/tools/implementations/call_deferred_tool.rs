//! Model-visible gateway for deferred tool execution.
//!
//! The concrete target is resolved by `ToolPipeline`; calling this tool's
//! implementation directly is always an error.

use crate::agentic::tools::framework::{
    Tool, ToolRenderOptions, ToolResult, ToolUseContext, ValidationResult,
};
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde_json::Value;
use void_agent_tools::{
    call_deferred_tool_description, call_deferred_tool_input_schema,
    call_deferred_tool_short_description, parse_deferred_tool_call, CALL_DEFERRED_TOOL_NAME,
};

pub struct CallDeferredTool;

impl CallDeferredTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CallDeferredTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for CallDeferredTool {
    fn name(&self) -> &str {
        CALL_DEFERRED_TOOL_NAME
    }

    async fn description(&self) -> VoidResult<String> {
        Ok(call_deferred_tool_description())
    }

    fn short_description(&self) -> String {
        call_deferred_tool_short_description()
    }

    fn input_schema(&self) -> Value {
        call_deferred_tool_input_schema()
    }

    fn is_readonly(&self) -> bool {
        false
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        false
    }

    fn render_tool_use_message(&self, input: &Value, _options: &ToolRenderOptions) -> String {
        let target = input
            .get("tool_name")
            .and_then(Value::as_str)
            .unwrap_or("?");
        format!("Calling deferred tool '{}'.", target)
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        match parse_deferred_tool_call(input) {
            Ok(_) => ValidationResult::default(),
            Err(message) => ValidationResult {
                result: false,
                message: Some(message),
                error_code: Some(400),
                meta: None,
            },
        }
    }

    async fn call_impl(
        &self,
        _input: &Value,
        _context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        Err(VoidError::Validation(
            "CallDeferredTool must be resolved by the tool pipeline".to_string(),
        ))
    }
}
