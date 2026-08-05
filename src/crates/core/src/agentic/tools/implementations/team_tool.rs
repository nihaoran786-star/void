//! Model-facing control surface for a validated reusable Team lead.

use crate::agentic::coordination::get_global_coordinator;
use crate::agentic::team_tool_runtime::{
    TeamToolFacts, TeamToolInvocation, TeamToolRequest, TEAM_TOOL_NAME,
};
use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext, ValidationResult};
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde_json::{json, Value};

pub struct TeamTool;

impl Default for TeamTool {
    fn default() -> Self {
        Self::new()
    }
}

impl TeamTool {
    pub fn new() -> Self {
        Self
    }

    fn parse_request(input: &Value) -> VoidResult<TeamToolRequest> {
        TeamToolRequest::parse_exact(input)
    }

    fn invalid(message: impl Into<String>) -> ValidationResult {
        ValidationResult {
            result: false,
            message: Some(message.into()),
            error_code: None,
            meta: None,
        }
    }

    fn required_context<'a>(field: &'static str, value: Option<&'a String>) -> VoidResult<&'a str> {
        value
            .map(String::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| VoidError::tool(format!("Team requires trusted {field} context")))
    }
}

#[async_trait]
impl Tool for TeamTool {
    fn name(&self) -> &str {
        TEAM_TOOL_NAME
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Coordinate the active reusable AI Team. Start a declared workflow, inspect or recover its durable run, message a member through the lead, or pause, resume, and stop the run. Team identity and session authority are supplied by the host; never include them in the input.".to_string())
    }

    fn short_description(&self) -> String {
        "Coordinate the active reusable AI Team through its validated lead.".to_string()
    }

    async fn is_available_in_context(&self, context: Option<&ToolUseContext>) -> bool {
        context
            .and_then(|context| TeamToolFacts::from_custom_data(&context.custom_data))
            .is_some()
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["start", "observe", "message", "pause", "resume", "stop", "recover"]
                },
                "workflowId": { "type": "string", "minLength": 1 },
                "objective": { "type": "string", "minLength": 1 },
                "teamRunId": { "type": "string", "minLength": 1 },
                "memberId": { "type": "string", "minLength": 1 },
                "message": { "type": "string", "minLength": 1 }
            },
            "required": ["action"],
            "additionalProperties": false,
            "allOf": [
                {
                    "if": { "properties": { "action": { "const": "start" } } },
                    "then": { "required": ["workflowId", "objective"] }
                },
                {
                    "if": { "properties": { "action": { "const": "message" } } },
                    "then": { "required": ["teamRunId", "memberId", "message"] }
                },
                {
                    "if": { "properties": { "action": { "enum": ["pause", "resume", "stop"] } } },
                    "then": { "required": ["teamRunId"] }
                }
            ]
        })
    }

    fn is_readonly(&self) -> bool {
        false
    }

    fn is_concurrency_safe(&self, _input: Option<&Value>) -> bool {
        false
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        false
    }

    async fn validate_input(
        &self,
        input: &Value,
        context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if let Err(error) = Self::parse_request(input) {
            return Self::invalid(error.to_string());
        }
        if !self.is_available_in_context(context).await {
            return Self::invalid("Team is only available to a validated writable Team lead");
        }
        ValidationResult {
            result: true,
            message: None,
            error_code: None,
            meta: None,
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let request = Self::parse_request(input)?;
        let facts = TeamToolFacts::from_custom_data(&context.custom_data).ok_or_else(|| {
            VoidError::tool("Team requires complete validated Team lead facts".to_string())
        })?;
        let parent_session_id =
            Self::required_context("parent session", context.session_id.as_ref())?;
        let parent_dialog_turn_id =
            Self::required_context("parent dialog turn", context.dialog_turn_id.as_ref())?;
        let parent_tool_call_id =
            Self::required_context("parent tool call", context.tool_call_id.as_ref())?;
        let parent_round_id = context
            .custom_data
            .get("round_id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                VoidError::tool("Team requires trusted parent round context".to_string())
            })?;

        let invocation = TeamToolInvocation {
            request,
            exact_input: input.clone(),
            parent_session_id: parent_session_id.to_string(),
            parent_dialog_turn_id: parent_dialog_turn_id.to_string(),
            parent_round_id: parent_round_id.to_string(),
            parent_tool_call_id: parent_tool_call_id.to_string(),
            team_definition_id: facts.team_definition_id,
            team_definition_revision: facts.team_definition_revision,
            team_instance_id: facts.team_instance_id,
            lead_persona_id: facts.lead_persona_id,
        };
        invocation.validate()?;

        let coordinator = get_global_coordinator().ok_or_else(|| {
            VoidError::tool("Team runtime coordinator is not initialized".to_string())
        })?;
        let outcome = coordinator.execute_team_tool(invocation).await?;
        Ok(vec![ToolResult::ok(
            outcome.data,
            outcome.result_for_assistant,
        )])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::team_tool_runtime::TeamToolFacts;
    use crate::agentic::tools::ToolRuntimeRestrictions;
    use std::collections::HashMap;

    fn context_with_facts() -> ToolUseContext {
        let facts = TeamToolFacts::new("definition", "r1", "instance", "lead");
        let mut vars = HashMap::new();
        facts.write_context_vars(&mut vars);
        ToolUseContext {
            tool_call_id: Some("tool-1".to_string()),
            agent_type: Some("agentic".to_string()),
            session_id: Some("session-1".to_string()),
            dialog_turn_id: Some("turn-1".to_string()),
            workspace: None,
            unlocked_collapsed_tools: Vec::new(),
            custom_data: vars
                .into_iter()
                .map(|(key, value)| (key, Value::String(value)))
                .chain([("round_id".to_string(), json!("round-1"))])
                .collect(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services: None,
        }
    }

    #[tokio::test]
    async fn availability_requires_complete_trusted_facts() {
        let tool = TeamTool::new();
        assert!(
            tool.is_available_in_context(Some(&context_with_facts()))
                .await
        );

        let mut incomplete = context_with_facts();
        incomplete.custom_data.remove("team_tool_instance_id");
        assert!(!tool.is_available_in_context(Some(&incomplete)).await);
        assert!(!tool.is_available_in_context(None).await);
    }

    #[tokio::test]
    async fn schema_and_validation_are_action_specific() {
        let tool = TeamTool::new();
        assert_eq!(tool.input_schema()["additionalProperties"], json!(false));
        assert!(
            tool.validate_input(
                &json!({"action":"start","workflowId":"delivery","objective":"ship"}),
                Some(&context_with_facts())
            )
            .await
            .result
        );
        assert!(
            !tool
                .validate_input(
                    &json!({"action":"observe","teamRunId":"not-allowed"}),
                    Some(&context_with_facts())
                )
                .await
                .result
        );
        assert!(
            !tool
                .validate_input(
                    &json!({"action":"observe","teamRunId":null}),
                    Some(&context_with_facts())
                )
                .await
                .result
        );
        assert!(!tool
            .validate_input(
                &json!({"action":"start","workflowId":"delivery","objective":"ship","teamDefinitionId":"forged"}),
                Some(&context_with_facts())
            )
            .await
            .result);
    }
}
