//! Model-facing completion boundary for a delegated Team member.

use crate::agentic::coordination::get_global_coordinator;
use crate::agentic::team_member_tool_runtime::{
    TeamMemberToolFacts, TeamMemberToolInvocation, TeamMemberToolRequest, TEAM_MEMBER_TOOL_NAME,
};
use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext, ValidationResult};
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde_json::{json, Value};

pub struct TeamMemberTool;

impl TeamMemberTool {
    pub fn new() -> Self {
        Self
    }

    fn required<'a>(name: &str, value: Option<&'a String>) -> VoidResult<&'a str> {
        value
            .map(String::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| VoidError::tool(format!("TeamMember requires trusted {name} context")))
    }
}

impl Default for TeamMemberTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for TeamMemberTool {
    fn name(&self) -> &str {
        TEAM_MEMBER_TOOL_NAME
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Complete the current Team member assignment after every worker you summoned has reached a terminal state. Provide a concise summary of the completed deliverable. Team identity is supplied by the host; never include run or member IDs.".to_string())
    }

    fn short_description(&self) -> String {
        "Complete the current Team member assignment with its final summary.".to_string()
    }

    async fn is_available_in_context(&self, context: Option<&ToolUseContext>) -> bool {
        context
            .and_then(|context| TeamMemberToolFacts::from_custom_data(&context.custom_data))
            .is_some()
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ["complete"] },
                "summary": {
                    "type": "string",
                    "minLength": 1,
                    "description": "Concise summary of the completed assignment and deliverable."
                }
            },
            "required": ["action", "summary"],
            "additionalProperties": false
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
        if let Err(error) = TeamMemberToolRequest::parse_exact(input) {
            return ValidationResult {
                result: false,
                message: Some(error.to_string()),
                error_code: None,
                meta: None,
            };
        }
        if !self.is_available_in_context(context).await {
            return ValidationResult {
                result: false,
                message: Some(
                    "TeamMember is only available to a validated delegated Team member".to_string(),
                ),
                error_code: None,
                meta: None,
            };
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
        let request = TeamMemberToolRequest::parse_exact(input)?;
        let facts =
            TeamMemberToolFacts::from_custom_data(&context.custom_data).ok_or_else(|| {
                VoidError::tool("TeamMember requires validated member launch facts".to_string())
            })?;
        let round_id = context
            .custom_data
            .get("round_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                VoidError::tool("TeamMember requires trusted round context".to_string())
            })?;
        let invocation = TeamMemberToolInvocation {
            request,
            exact_input: input.clone(),
            member_session_id: Self::required("member session", context.session_id.as_ref())?
                .to_string(),
            dialog_turn_id: Self::required("dialog turn", context.dialog_turn_id.as_ref())?
                .to_string(),
            round_id: round_id.to_string(),
            tool_call_id: Self::required("tool call", context.tool_call_id.as_ref())?.to_string(),
            team_definition_id: facts.team_definition_id,
            team_definition_revision: facts.team_definition_revision,
            team_instance_id: facts.team_instance_id,
            team_run_id: facts.team_run_id,
            member_run_id: facts.member_run_id,
            member_id: facts.member_id,
            root_parent_session_id: facts.root_parent_session_id,
        };
        invocation.validate()?;
        let coordinator = get_global_coordinator().ok_or_else(|| {
            VoidError::tool("Team runtime coordinator is not initialized".to_string())
        })?;
        let outcome = coordinator.execute_team_member_tool(invocation).await?;
        Ok(vec![ToolResult::ok(
            outcome.data,
            outcome.result_for_assistant,
        )])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::tools::ToolRuntimeRestrictions;
    use std::collections::HashMap;

    fn context() -> ToolUseContext {
        ToolUseContext {
            tool_call_id: Some("tool".into()),
            agent_type: Some("agentic".into()),
            session_id: Some("member-session".into()),
            dialog_turn_id: Some("turn".into()),
            workspace: None,
            unlocked_collapsed_tools: vec![],
            custom_data: HashMap::from([
                ("round_id".into(), json!("round")),
                ("delegation_allow_subagent_spawn".into(), json!(true)),
                ("delegation_nesting_depth".into(), json!(1)),
                ("teamDefinitionId".into(), json!("definition")),
                ("teamDefinitionRevision".into(), json!("r2")),
                ("teamInstanceId".into(), json!("instance")),
                ("teamRunId".into(), json!("run")),
                ("memberRunId".into(), json!("member-run")),
                ("teamMemberId".into(), json!("member")),
                (
                    void_core_types::TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY.into(),
                    json!("root"),
                ),
            ]),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services: None,
        }
    }

    #[tokio::test]
    async fn schema_and_availability_are_member_scoped() {
        let tool = TeamMemberTool::new();
        assert_eq!(
            tool.input_schema()["required"],
            json!(["action", "summary"])
        );
        assert_eq!(tool.input_schema()["additionalProperties"], json!(false));
        assert!(tool.is_available_in_context(Some(&context())).await);

        let mut worker = context();
        worker
            .custom_data
            .insert("delegation_nesting_depth".into(), json!(2));
        worker
            .custom_data
            .insert("delegation_allow_subagent_spawn".into(), json!(false));
        assert!(!tool.is_available_in_context(Some(&worker)).await);
        assert!(
            !tool
                .validate_input(
                    &json!({"action":"complete","summary":" "}),
                    Some(&context())
                )
                .await
                .result
        );
    }
}
