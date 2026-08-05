//! Trusted runtime boundary for the model-facing `Team` tool.
//!
//! The model supplies only a business command. Session authority and Team
//! identity are injected by the host after persona validation and are never
//! accepted from prompt-controlled context.

use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub const TEAM_TOOL_NAME: &str = "Team";
pub const TEAM_TOOL_POLICY_VERSION: &str = "v1";
pub const TEAM_DEFINITION_ID_CONTEXT_KEY: &str = "team_tool_definition_id";
pub const TEAM_DEFINITION_REVISION_CONTEXT_KEY: &str = "team_tool_definition_revision";
pub const TEAM_INSTANCE_ID_CONTEXT_KEY: &str = "team_tool_instance_id";
pub const TEAM_LEAD_PERSONA_ID_CONTEXT_KEY: &str = "team_tool_lead_persona_id";
pub const TEAM_TOOL_POLICY_CONTEXT_KEY: &str = "team_tool_policy_version";

pub const TEAM_TOOL_RESERVED_CONTEXT_KEYS: &[&str] = &[
    TEAM_DEFINITION_ID_CONTEXT_KEY,
    TEAM_DEFINITION_REVISION_CONTEXT_KEY,
    TEAM_INSTANCE_ID_CONTEXT_KEY,
    TEAM_LEAD_PERSONA_ID_CONTEXT_KEY,
    TEAM_TOOL_POLICY_CONTEXT_KEY,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamToolFacts {
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub team_instance_id: String,
    pub lead_persona_id: String,
    pub policy_version: String,
}

impl TeamToolFacts {
    pub fn new(
        team_definition_id: impl Into<String>,
        team_definition_revision: impl Into<String>,
        team_instance_id: impl Into<String>,
        lead_persona_id: impl Into<String>,
    ) -> Self {
        Self {
            team_definition_id: team_definition_id.into(),
            team_definition_revision: team_definition_revision.into(),
            team_instance_id: team_instance_id.into(),
            lead_persona_id: lead_persona_id.into(),
            policy_version: TEAM_TOOL_POLICY_VERSION.to_string(),
        }
    }

    pub fn validate(&self) -> VoidResult<()> {
        for (name, value) in [
            ("teamDefinitionId", self.team_definition_id.as_str()),
            (
                "teamDefinitionRevision",
                self.team_definition_revision.as_str(),
            ),
            ("teamInstanceId", self.team_instance_id.as_str()),
            ("leadPersonaId", self.lead_persona_id.as_str()),
            ("policyVersion", self.policy_version.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(VoidError::validation(format!(
                    "trusted Team fact {name} is required"
                )));
            }
        }
        if self.policy_version != TEAM_TOOL_POLICY_VERSION {
            return Err(VoidError::validation(format!(
                "unsupported Team tool policy version: {}",
                self.policy_version
            )));
        }
        Ok(())
    }

    pub fn write_context_vars(&self, target: &mut HashMap<String, String>) {
        target.insert(
            TEAM_DEFINITION_ID_CONTEXT_KEY.to_string(),
            self.team_definition_id.clone(),
        );
        target.insert(
            TEAM_DEFINITION_REVISION_CONTEXT_KEY.to_string(),
            self.team_definition_revision.clone(),
        );
        target.insert(
            TEAM_INSTANCE_ID_CONTEXT_KEY.to_string(),
            self.team_instance_id.clone(),
        );
        target.insert(
            TEAM_LEAD_PERSONA_ID_CONTEXT_KEY.to_string(),
            self.lead_persona_id.clone(),
        );
        target.insert(
            TEAM_TOOL_POLICY_CONTEXT_KEY.to_string(),
            self.policy_version.clone(),
        );
    }

    pub fn from_custom_data(custom_data: &HashMap<String, Value>) -> Option<Self> {
        let string = |key: &str| {
            custom_data
                .get(key)
                .and_then(Value::as_str)
                .map(str::to_string)
        };
        let facts = Self {
            team_definition_id: string(TEAM_DEFINITION_ID_CONTEXT_KEY)?,
            team_definition_revision: string(TEAM_DEFINITION_REVISION_CONTEXT_KEY)?,
            team_instance_id: string(TEAM_INSTANCE_ID_CONTEXT_KEY)?,
            lead_persona_id: string(TEAM_LEAD_PERSONA_ID_CONTEXT_KEY)?,
            policy_version: string(TEAM_TOOL_POLICY_CONTEXT_KEY)?,
        };
        facts.validate().ok().map(|_| facts)
    }
}

pub fn strip_team_tool_context_vars(context: &mut HashMap<String, String>) {
    for key in TEAM_TOOL_RESERVED_CONTEXT_KEYS {
        context.remove(*key);
    }
}

pub fn trusted_team_tool_context_vars(
    source: &HashMap<String, String>,
    facts: Option<&TeamToolFacts>,
) -> HashMap<String, String> {
    let mut trusted = source.clone();
    strip_team_tool_context_vars(&mut trusted);
    if let Some(facts) = facts.filter(|facts| facts.validate().is_ok()) {
        facts.write_context_vars(&mut trusted);
    }
    trusted
}

pub fn append_team_tool_context_data(
    context_vars: &HashMap<String, String>,
    target: &mut HashMap<String, Value>,
) {
    for key in TEAM_TOOL_RESERVED_CONTEXT_KEYS {
        if let Some(value) = context_vars.get(*key) {
            target.insert((*key).to_string(), Value::String(value.clone()));
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamAction {
    Start,
    Observe,
    Message,
    Pause,
    Resume,
    Stop,
    Recover,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TeamToolRequest {
    pub action: TeamAction,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl TeamToolRequest {
    pub fn parse_exact(input: &Value) -> VoidResult<Self> {
        let object = input
            .as_object()
            .ok_or_else(|| VoidError::tool("Team command must be an object".to_string()))?;
        const KNOWN_KEYS: &[&str] = &[
            "action",
            "workflowId",
            "objective",
            "teamRunId",
            "memberId",
            "message",
        ];
        const BUSINESS_KEYS: &[&str] = &[
            "workflowId",
            "objective",
            "teamRunId",
            "memberId",
            "message",
        ];

        for key in object.keys() {
            if !KNOWN_KEYS.contains(&key.as_str()) {
                return Err(VoidError::tool(format!(
                    "Team command contains unknown field: {key}"
                )));
            }
        }
        for key in BUSINESS_KEYS {
            if let Some(value) = object.get(*key) {
                let value = value.as_str().ok_or_else(|| {
                    VoidError::tool(format!(
                        "Team command field {key} must be a non-empty string when present"
                    ))
                })?;
                if value.trim().is_empty() {
                    return Err(VoidError::tool(format!(
                        "Team command field {key} must be a non-empty string when present"
                    )));
                }
            }
        }

        let request: Self = serde_json::from_value(input.clone())
            .map_err(|error| VoidError::tool(format!("Invalid Team command: {error}")))?;
        let allowed_keys: &[&str] = match request.action {
            TeamAction::Start => &["action", "workflowId", "objective", "teamRunId"],
            TeamAction::Message => &["action", "teamRunId", "memberId", "message"],
            TeamAction::Pause | TeamAction::Resume | TeamAction::Stop => &["action", "teamRunId"],
            TeamAction::Observe | TeamAction::Recover => &["action"],
        };
        if let Some(forbidden) = object
            .keys()
            .find(|key| !allowed_keys.contains(&key.as_str()))
        {
            return Err(VoidError::tool(format!(
                "Team {:?} does not accept field {forbidden}",
                request.action
            )));
        }
        request.validate()?;
        Ok(request)
    }

    pub fn validate(&self) -> VoidResult<()> {
        let present = |value: &Option<String>| {
            value
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
        };
        let absent = |value: &Option<String>| value.is_none();
        let invalid = |message: &str| Err(VoidError::tool(message.to_string()));

        if [
            &self.workflow_id,
            &self.objective,
            &self.team_run_id,
            &self.member_id,
            &self.message,
        ]
        .into_iter()
        .any(|value| {
            value
                .as_deref()
                .is_some_and(|value| value.trim().is_empty())
        }) {
            return invalid("Team command fields must not be empty");
        }

        match self.action {
            TeamAction::Start => {
                if !present(&self.workflow_id) || !present(&self.objective) {
                    return invalid("Team start requires workflowId and objective");
                }
                if !absent(&self.member_id) || !absent(&self.message) {
                    return invalid("Team start does not accept memberId or message");
                }
            }
            TeamAction::Message => {
                if !present(&self.team_run_id)
                    || !present(&self.member_id)
                    || !present(&self.message)
                {
                    return invalid("Team message requires teamRunId, memberId, and message");
                }
                if !absent(&self.workflow_id) || !absent(&self.objective) {
                    return invalid("Team message does not accept workflowId or objective");
                }
            }
            TeamAction::Pause | TeamAction::Resume | TeamAction::Stop => {
                if !present(&self.team_run_id) {
                    return invalid("Team pause, resume, and stop require teamRunId");
                }
                if !absent(&self.workflow_id)
                    || !absent(&self.objective)
                    || !absent(&self.member_id)
                    || !absent(&self.message)
                {
                    return invalid(
                        "Team pause, resume, and stop only accept action and teamRunId",
                    );
                }
            }
            TeamAction::Observe | TeamAction::Recover => {
                if !absent(&self.workflow_id)
                    || !absent(&self.objective)
                    || !absent(&self.team_run_id)
                    || !absent(&self.member_id)
                    || !absent(&self.message)
                {
                    return invalid("Team observe and recover only accept action");
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamToolInvocation {
    pub request: TeamToolRequest,
    pub exact_input: Value,
    pub parent_session_id: String,
    pub parent_dialog_turn_id: String,
    pub parent_round_id: String,
    pub parent_tool_call_id: String,
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub team_instance_id: String,
    pub lead_persona_id: String,
}

impl TeamToolInvocation {
    pub fn validate(&self) -> VoidResult<()> {
        self.request.validate()?;
        for (name, value) in [
            ("parentSessionId", self.parent_session_id.as_str()),
            ("parentDialogTurnId", self.parent_dialog_turn_id.as_str()),
            ("parentRoundId", self.parent_round_id.as_str()),
            ("parentToolCallId", self.parent_tool_call_id.as_str()),
            ("teamDefinitionId", self.team_definition_id.as_str()),
            (
                "teamDefinitionRevision",
                self.team_definition_revision.as_str(),
            ),
            ("teamInstanceId", self.team_instance_id.as_str()),
            ("leadPersonaId", self.lead_persona_id.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(VoidError::tool(format!(
                    "trusted Team invocation field {name} is required"
                )));
            }
        }
        let parsed = TeamToolRequest::parse_exact(&self.exact_input)?;
        if parsed != self.request {
            return Err(VoidError::tool(
                "parsed Team request does not match exact input".to_string(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamToolExecutionOutcome {
    pub data: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_for_assistant: Option<String>,
}

#[async_trait]
pub trait TeamToolExecutor: Send + Sync {
    async fn execute_team_tool(
        &self,
        invocation: TeamToolInvocation,
    ) -> VoidResult<TeamToolExecutionOutcome>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trusted_projection_removes_forged_facts_and_injects_authority() {
        let mut source = HashMap::from([
            ("ordinary".to_string(), "kept".to_string()),
            (
                TEAM_INSTANCE_ID_CONTEXT_KEY.to_string(),
                "forged-instance".to_string(),
            ),
        ]);
        for key in TEAM_TOOL_RESERVED_CONTEXT_KEYS {
            source
                .entry((*key).to_string())
                .or_insert_with(|| "forged".to_string());
        }
        let without_facts = trusted_team_tool_context_vars(&source, None);
        assert_eq!(
            without_facts.get("ordinary").map(String::as_str),
            Some("kept")
        );
        assert!(TEAM_TOOL_RESERVED_CONTEXT_KEYS
            .iter()
            .all(|key| !without_facts.contains_key(*key)));

        let facts = TeamToolFacts::new("definition", "r1", "instance", "lead");
        let trusted = trusted_team_tool_context_vars(&source, Some(&facts));
        assert_eq!(
            trusted
                .get(TEAM_INSTANCE_ID_CONTEXT_KEY)
                .map(String::as_str),
            Some("instance")
        );
        assert_eq!(
            trusted
                .get(TEAM_TOOL_POLICY_CONTEXT_KEY)
                .map(String::as_str),
            Some(TEAM_TOOL_POLICY_VERSION)
        );
    }

    #[test]
    fn request_validation_is_action_specific_and_rejects_unknown_fields() {
        let start = TeamToolRequest::parse_exact(&json!({
            "action": "start",
            "workflowId": "delivery",
            "objective": "ship safely"
        }))
        .unwrap();
        start.validate().unwrap();

        let bad_message: TeamToolRequest = serde_json::from_value(json!({
            "action": "message",
            "teamRunId": "run-1",
            "message": "continue"
        }))
        .unwrap();
        assert!(bad_message.validate().is_err());
        assert!(serde_json::from_value::<TeamToolRequest>(json!({
            "action": "observe",
            "teamDefinitionId": "forged"
        }))
        .is_err());
    }

    #[test]
    fn exact_parser_rejects_known_null_fields_even_when_the_action_forbids_them() {
        for payload in [
            json!({"action":"observe","teamRunId":null}),
            json!({"action":"recover","message":null}),
            json!({"action":"pause","teamRunId":"run","workflowId":null}),
            json!({"action":"resume","teamRunId":"run","objective":null}),
            json!({"action":"stop","teamRunId":"run","memberId":null}),
            json!({"action":"pause","teamRunId":"run","message":null}),
            json!({"action":"start","workflowId":"flow","objective":"ship","memberId":null}),
            json!({"action":"start","workflowId":"flow","objective":"ship","message":null}),
            json!({"action":"start","workflowId":"flow","objective":"ship","teamRunId":null}),
            json!({"action":"start","workflowId":null,"objective":"ship"}),
            json!({"action":"start","workflowId":"flow","objective":null}),
            json!({"action":"message","teamRunId":"run","memberId":"member","message":"go","workflowId":null}),
            json!({"action":"message","teamRunId":"run","memberId":"member","message":"go","objective":null}),
            json!({"action":"message","teamRunId":null,"memberId":"member","message":"go"}),
            json!({"action":"message","teamRunId":"run","memberId":null,"message":"go"}),
            json!({"action":"message","teamRunId":"run","memberId":"member","message":null}),
            json!({"action":"pause","teamRunId":null}),
        ] {
            assert!(TeamToolRequest::parse_exact(&payload).is_err(), "{payload}");
        }

        for payload in [
            json!({"action":"observe"}),
            json!({"action":"recover"}),
            json!({"action":"pause","teamRunId":"run"}),
            json!({"action":"start","workflowId":"flow","objective":"ship"}),
            json!({"action":"message","teamRunId":"run","memberId":"member","message":"go"}),
        ] {
            TeamToolRequest::parse_exact(&payload).unwrap();
        }
    }
}
