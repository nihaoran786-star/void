//! Trusted runtime boundary for the model-facing `TeamMember` tool.
//!
//! A Team member may only submit its completion summary. Team/run/member
//! identity comes from the validated durable launch context and is never
//! accepted from model input.

use crate::util::errors::{VoidError, VoidResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use void_core_types::TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY;
use void_runtime_ports::{DelegationPolicy, DelegationTier};

pub const TEAM_MEMBER_TOOL_NAME: &str = "TeamMember";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamMemberToolFacts {
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub team_instance_id: String,
    pub team_run_id: String,
    pub member_run_id: String,
    pub member_id: String,
    pub root_parent_session_id: String,
}

impl TeamMemberToolFacts {
    pub fn from_context_vars(
        context: &HashMap<String, String>,
        delegation_policy: DelegationPolicy,
    ) -> Option<Self> {
        if delegation_policy.tier() != DelegationTier::TeamMember {
            return None;
        }
        let value = |key: &str| {
            context
                .get(key)
                .map(String::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        Some(Self {
            team_definition_id: value("teamDefinitionId")?,
            team_definition_revision: value("teamDefinitionRevision")?,
            team_instance_id: value("teamInstanceId")?,
            team_run_id: value("teamRunId")?,
            member_run_id: value("memberRunId")?,
            member_id: value("teamMemberId")?,
            root_parent_session_id: value(TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY)?,
        })
    }

    pub fn from_custom_data(custom_data: &HashMap<String, Value>) -> Option<Self> {
        let bool_value = |key: &str| custom_data.get(key).and_then(Value::as_bool);
        let depth = custom_data
            .get("delegation_nesting_depth")
            .and_then(Value::as_u64)
            .and_then(|value| u8::try_from(value).ok())?;
        let delegation_policy = DelegationPolicy {
            allow_subagent_spawn: bool_value("delegation_allow_subagent_spawn")?,
            nesting_depth: depth,
        };
        let context = custom_data
            .iter()
            .filter_map(|(key, value)| value.as_str().map(|value| (key.clone(), value.to_string())))
            .collect();
        Self::from_context_vars(&context, delegation_policy)
    }
}

pub fn enable_team_member_tool(
    allowed_tools: &mut Vec<String>,
    context: &HashMap<String, String>,
    delegation_policy: DelegationPolicy,
) {
    if TeamMemberToolFacts::from_context_vars(context, delegation_policy).is_some()
        && !allowed_tools
            .iter()
            .any(|tool| tool == TEAM_MEMBER_TOOL_NAME)
    {
        allowed_tools.push(TEAM_MEMBER_TOOL_NAME.to_string());
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamMemberAction {
    Complete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TeamMemberToolRequest {
    pub action: TeamMemberAction,
    pub summary: String,
}

impl TeamMemberToolRequest {
    pub fn parse_exact(input: &Value) -> VoidResult<Self> {
        let request: Self = serde_json::from_value(input.clone())
            .map_err(|error| VoidError::tool(format!("Invalid TeamMember command: {error}")))?;
        if request.summary.trim().is_empty() {
            return Err(VoidError::tool(
                "TeamMember complete requires a non-empty summary".to_string(),
            ));
        }
        Ok(request)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberToolInvocation {
    pub request: TeamMemberToolRequest,
    pub exact_input: Value,
    pub member_session_id: String,
    pub dialog_turn_id: String,
    pub round_id: String,
    pub tool_call_id: String,
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub team_instance_id: String,
    pub team_run_id: String,
    pub member_run_id: String,
    pub member_id: String,
    pub root_parent_session_id: String,
}

impl TeamMemberToolInvocation {
    pub fn validate(&self) -> VoidResult<()> {
        let parsed = TeamMemberToolRequest::parse_exact(&self.exact_input)?;
        if parsed != self.request {
            return Err(VoidError::tool(
                "parsed TeamMember request does not match exact input".to_string(),
            ));
        }
        for (name, value) in [
            ("memberSessionId", self.member_session_id.as_str()),
            ("dialogTurnId", self.dialog_turn_id.as_str()),
            ("roundId", self.round_id.as_str()),
            ("toolCallId", self.tool_call_id.as_str()),
            ("teamDefinitionId", self.team_definition_id.as_str()),
            (
                "teamDefinitionRevision",
                self.team_definition_revision.as_str(),
            ),
            ("teamInstanceId", self.team_instance_id.as_str()),
            ("teamRunId", self.team_run_id.as_str()),
            ("memberRunId", self.member_run_id.as_str()),
            ("memberId", self.member_id.as_str()),
            ("rootParentSessionId", self.root_parent_session_id.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(VoidError::tool(format!(
                    "trusted TeamMember invocation field {name} is required"
                )));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exact_request_accepts_only_complete_with_non_empty_summary() {
        assert!(TeamMemberToolRequest::parse_exact(&json!({
            "action": "complete",
            "summary": "Delivered the script."
        }))
        .is_ok());
        assert!(TeamMemberToolRequest::parse_exact(&json!({
            "action": "complete",
            "summary": " "
        }))
        .is_err());
        assert!(TeamMemberToolRequest::parse_exact(&json!({
            "action": "complete",
            "summary": "done",
            "teamRunId": "forged"
        }))
        .is_err());
    }

    #[test]
    fn facts_require_team_member_tier_and_exact_member_run_id() {
        let context = HashMap::from([
            ("teamDefinitionId".into(), "definition".into()),
            ("teamDefinitionRevision".into(), "r2".into()),
            ("teamInstanceId".into(), "instance".into()),
            ("teamRunId".into(), "run".into()),
            ("memberRunId".into(), "member-run".into()),
            ("teamMemberId".into(), "member".into()),
            (
                TEAM_DELEGATION_ROOT_SESSION_CONTEXT_KEY.into(),
                "root".into(),
            ),
        ]);
        assert!(
            TeamMemberToolFacts::from_context_vars(&context, DelegationPolicy::team_member())
                .is_some()
        );
        assert!(
            TeamMemberToolFacts::from_context_vars(&context, DelegationPolicy::team_worker())
                .is_none()
        );

        let mut missing_run = context;
        missing_run.remove("memberRunId");
        assert!(TeamMemberToolFacts::from_context_vars(
            &missing_run,
            DelegationPolicy::team_member()
        )
        .is_none());
    }
}
