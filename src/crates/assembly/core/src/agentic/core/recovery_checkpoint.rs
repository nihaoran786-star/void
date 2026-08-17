use super::{Message, MessageContent, MessageHelper, ToolCall};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};

pub const RECOVERY_CHECKPOINT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryCheckpointStatus {
    Ready,
    Blocked,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryBoundary {
    AutomaticContinue,
    ManualUserAssistant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryInvocationState {
    Pending,
    Finished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PendingInvocationDisposition {
    Blocked,
    Failed,
    Resume,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryInvocation {
    pub invocation_id: String,
    pub tool_name: String,
    pub arguments_hash: String,
    pub catalog_generation: u64,
    pub state: RecoveryInvocationState,
    pub executed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_is_error: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_disposition: Option<PendingInvocationDisposition>,
}

impl RecoveryInvocation {
    pub fn signature(&self) -> String {
        format!("{}:{}", self.tool_name, self.arguments_hash)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryCheckpoint {
    pub checkpoint_version: u32,
    pub checkpoint_id: String,
    pub session_id: String,
    pub turn_id: String,
    pub boundary: RecoveryBoundary,
    pub status: RecoveryCheckpointStatus,
    pub latest_user_goal: String,
    pub completed_items: Vec<String>,
    pub unfinished_items: Vec<String>,
    pub invocations: Vec<RecoveryInvocation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocking_reason: Option<String>,
    pub catalog_generation: u64,
    pub created_at: u64,
    pub updated_at: u64,
}

impl RecoveryCheckpoint {
    #[allow(clippy::too_many_arguments)]
    pub fn from_messages(
        checkpoint_id: String,
        session_id: String,
        turn_id: String,
        boundary: RecoveryBoundary,
        catalog_generation: u64,
        messages: &[Message],
        timestamp: u64,
    ) -> Self {
        let previous = Self::latest_embedded(messages);
        let latest_user_goal = messages
            .iter()
            .rev()
            .find(|message| message.is_actual_user_message())
            .and_then(message_text)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
            .or_else(|| {
                previous
                    .as_ref()
                    .map(|checkpoint| checkpoint.latest_user_goal.clone())
            })
            .unwrap_or_default();
        let previous = previous
            .filter(|checkpoint| checkpoint.latest_user_goal.trim() == latest_user_goal.trim());

        let todo = MessageHelper::get_last_todo_snapshot(messages);
        let (completed_items, unfinished_items) = if let Some(todo) = todo {
            todo.todos.into_iter().fold(
                (Vec::new(), Vec::new()),
                |(mut completed, mut unfinished), item| {
                    if matches!(item.status.as_str(), "completed" | "done") {
                        completed.push(item.content);
                    } else {
                        unfinished.push(item.content);
                    }
                    (completed, unfinished)
                },
            )
        } else {
            previous
                .as_ref()
                .map(|checkpoint| {
                    (
                        checkpoint.completed_items.clone(),
                        checkpoint.unfinished_items.clone(),
                    )
                })
                .unwrap_or_default()
        };

        let mut invocations = previous
            .as_ref()
            .map(|checkpoint| {
                checkpoint
                    .invocations
                    .iter()
                    .cloned()
                    .map(|invocation| (invocation.invocation_id.clone(), invocation))
                    .collect::<BTreeMap<_, _>>()
            })
            .unwrap_or_default();
        let results = tool_results_by_id(messages);

        for message in messages {
            let MessageContent::Mixed { tool_calls, .. } = &message.content else {
                continue;
            };
            for tool_call in tool_calls {
                let (tool_name, arguments, invocation_generation) =
                    effective_invocation(tool_call, catalog_generation);
                let result = results.get(&tool_call.tool_id);
                let duplicate_blocked = result.is_some_and(|result| {
                    result
                        .0
                        .get("recovery_duplicate_blocked")
                        .and_then(Value::as_bool)
                        == Some(true)
                });
                let invocation = RecoveryInvocation {
                    invocation_id: tool_call.tool_id.clone(),
                    tool_name,
                    arguments_hash: stable_arguments_hash(&arguments),
                    catalog_generation: invocation_generation,
                    state: if result.is_some() {
                        RecoveryInvocationState::Finished
                    } else {
                        RecoveryInvocationState::Pending
                    },
                    executed: result.is_some() && !duplicate_blocked,
                    result_is_error: result.map(|result| result.1),
                    pending_disposition: result
                        .is_none()
                        .then_some(PendingInvocationDisposition::Blocked),
                };
                invocations.insert(tool_call.tool_id.clone(), invocation);
            }
        }

        let invocations = invocations.into_values().collect::<Vec<_>>();
        let pending_count = invocations
            .iter()
            .filter(|invocation| invocation.state == RecoveryInvocationState::Pending)
            .count();
        let missing_goal = latest_user_goal.is_empty();
        let (status, blocking_reason) = if missing_goal {
            (
                RecoveryCheckpointStatus::Failed,
                Some("latest user goal is unavailable".to_string()),
            )
        } else if pending_count > 0 {
            (
                RecoveryCheckpointStatus::Blocked,
                Some(format!(
                    "{pending_count} pending tool invocation(s) require explicit recovery"
                )),
            )
        } else {
            (RecoveryCheckpointStatus::Ready, None)
        };

        Self {
            checkpoint_version: RECOVERY_CHECKPOINT_VERSION,
            checkpoint_id,
            session_id,
            turn_id,
            boundary,
            status,
            latest_user_goal,
            completed_items,
            unfinished_items,
            invocations,
            blocking_reason,
            catalog_generation,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    pub fn validate(
        &self,
        expected_session_id: &str,
        expected_catalog_generation: u64,
    ) -> Result<(), String> {
        if self.checkpoint_version != RECOVERY_CHECKPOINT_VERSION {
            return Err(format!(
                "unsupported recovery checkpoint version: {}",
                self.checkpoint_version
            ));
        }
        if self.session_id != expected_session_id {
            return Err("recovery checkpoint session does not match".to_string());
        }
        if self.checkpoint_id.trim().is_empty() || self.turn_id.trim().is_empty() {
            return Err("recovery checkpoint identity is incomplete".to_string());
        }
        if self.latest_user_goal.trim().is_empty() {
            return Err("recovery checkpoint latest user goal is empty".to_string());
        }
        if self.catalog_generation != expected_catalog_generation {
            return Err(format!(
                "recovery checkpoint catalog generation is stale: checkpoint={}, current={}",
                self.catalog_generation, expected_catalog_generation
            ));
        }

        let mut ids = HashSet::new();
        for invocation in &self.invocations {
            if invocation.invocation_id.trim().is_empty()
                || invocation.tool_name.trim().is_empty()
                || invocation.arguments_hash.trim().is_empty()
            {
                return Err("recovery checkpoint contains an incomplete invocation".to_string());
            }
            if !ids.insert(invocation.invocation_id.as_str()) {
                return Err(format!(
                    "recovery checkpoint contains duplicate invocation id: {}",
                    invocation.invocation_id
                ));
            }
            match invocation.state {
                RecoveryInvocationState::Pending if invocation.pending_disposition.is_none() => {
                    return Err(format!(
                        "pending invocation has no explicit recovery disposition: {}",
                        invocation.invocation_id
                    ));
                }
                RecoveryInvocationState::Finished if invocation.pending_disposition.is_some() => {
                    return Err(format!(
                        "finished invocation has a pending recovery disposition: {}",
                        invocation.invocation_id
                    ));
                }
                _ => {}
            }
        }

        let has_pending = self
            .invocations
            .iter()
            .any(|invocation| invocation.state == RecoveryInvocationState::Pending);
        if self.status == RecoveryCheckpointStatus::Ready && has_pending {
            return Err("ready recovery checkpoint contains pending invocations".to_string());
        }
        if self.status != RecoveryCheckpointStatus::Ready && self.blocking_reason.is_none() {
            return Err("non-ready recovery checkpoint has no blocking reason".to_string());
        }
        Ok(())
    }

    pub fn mark_failed(&mut self, reason: String, timestamp: u64) {
        self.status = RecoveryCheckpointStatus::Failed;
        self.blocking_reason = Some(reason);
        self.updated_at = timestamp;
    }

    pub fn finished_execution_signatures(&self) -> HashSet<String> {
        self.invocations
            .iter()
            .filter(|invocation| {
                invocation.state == RecoveryInvocationState::Finished && invocation.executed
            })
            .map(RecoveryInvocation::signature)
            .collect()
    }

    pub fn latest_embedded(messages: &[Message]) -> Option<Self> {
        messages.iter().rev().find_map(|message| {
            let payload = message.metadata.compression_payload.as_ref()?;
            payload.entries.iter().rev().find_map(|entry| match entry {
                super::CompressionEntry::RecoveryCheckpoint { checkpoint } => {
                    Some(checkpoint.clone())
                }
                _ => None,
            })
        })
    }

    pub fn matches_latest_user_goal(&self, messages: &[Message]) -> bool {
        messages
            .iter()
            .rev()
            .find(|message| message.is_actual_user_message())
            .and_then(message_text)
            .is_some_and(|goal| goal.trim() == self.latest_user_goal.trim())
    }
}

pub fn invocation_signature(tool_call: &ToolCall, catalog_generation: u64) -> String {
    let (tool_name, arguments, _) = effective_invocation(tool_call, catalog_generation);
    format!("{}:{}", tool_name, stable_arguments_hash(&arguments))
}

fn message_text(message: &Message) -> Option<&str> {
    match &message.content {
        MessageContent::Text(text) | MessageContent::Multimodal { text, .. } => Some(text),
        _ => None,
    }
}

fn tool_results_by_id(messages: &[Message]) -> HashMap<String, (Value, bool)> {
    messages
        .iter()
        .filter_map(|message| {
            let MessageContent::ToolResult {
                tool_id,
                result,
                is_error,
                ..
            } = &message.content
            else {
                return None;
            };
            Some((tool_id.clone(), (result.clone(), *is_error)))
        })
        .collect()
}

fn effective_invocation(tool_call: &ToolCall, catalog_generation: u64) -> (String, Value, u64) {
    if tool_call.tool_name == void_agent_tools::CALL_DEFERRED_TOOL_NAME {
        if let Ok(call) = void_agent_tools::parse_deferred_tool_call(&tool_call.arguments) {
            return (call.tool_name, call.arguments, call.catalog_generation);
        }
    }
    (
        tool_call.tool_name.clone(),
        tool_call.arguments.clone(),
        catalog_generation,
    )
}

fn stable_arguments_hash(arguments: &Value) -> String {
    fn canonical_json(value: &Value) -> String {
        match value {
            Value::Null => "null".to_string(),
            Value::Bool(value) => value.to_string(),
            Value::Number(value) => value.to_string(),
            Value::String(value) => serde_json::to_string(value).unwrap_or_default(),
            Value::Array(values) => format!(
                "[{}]",
                values
                    .iter()
                    .map(canonical_json)
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            Value::Object(map) => {
                let mut keys = map.keys().collect::<Vec<_>>();
                keys.sort_unstable();
                format!(
                    "{{{}}}",
                    keys.into_iter()
                        .map(|key| format!(
                            "{}:{}",
                            serde_json::to_string(key).unwrap_or_default(),
                            canonical_json(&map[key])
                        ))
                        .collect::<Vec<_>>()
                        .join(",")
                )
            }
        }
    }

    hex::encode(Sha256::digest(canonical_json(arguments).as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::core::{Message, ToolResult};
    use serde_json::json;

    fn finished_tool_messages() -> Vec<Message> {
        vec![
            Message::user("Finish the runtime recovery".to_string()),
            Message::assistant_with_tools(
                String::new(),
                vec![ToolCall {
                    tool_id: "call-1".to_string(),
                    tool_name: "Read".to_string(),
                    arguments: json!({"path": "src/lib.rs"}),
                    raw_arguments: None,
                    is_error: false,
                    recovered_from_truncation: false,
                }],
            ),
            Message::tool_result(ToolResult {
                tool_id: "call-1".to_string(),
                tool_name: "Read".to_string(),
                result: json!({"content": "ok"}),
                result_for_assistant: None,
                is_error: false,
                duration_ms: Some(1),
                image_attachments: None,
            }),
        ]
    }

    #[test]
    fn finished_invocation_round_trips_and_guards_by_stable_signature() {
        let messages = finished_tool_messages();
        let checkpoint = RecoveryCheckpoint::from_messages(
            "checkpoint-1".to_string(),
            "session-1".to_string(),
            "turn-1".to_string(),
            RecoveryBoundary::AutomaticContinue,
            42,
            &messages,
            10,
        );

        checkpoint
            .validate("session-1", 42)
            .expect("valid checkpoint");
        assert_eq!(checkpoint.status, RecoveryCheckpointStatus::Ready);
        assert_eq!(checkpoint.invocations.len(), 1);
        assert!(checkpoint.invocations[0].executed);
        assert!(checkpoint
            .finished_execution_signatures()
            .contains(&invocation_signature(
                &ToolCall {
                    tool_id: "different-id".to_string(),
                    tool_name: "Read".to_string(),
                    arguments: json!({"path": "src/lib.rs"}),
                    raw_arguments: None,
                    is_error: false,
                    recovered_from_truncation: false,
                },
                42,
            )));

        let restored: RecoveryCheckpoint =
            serde_json::from_str(&serde_json::to_string(&checkpoint).expect("serialize"))
                .expect("deserialize");
        assert_eq!(restored, checkpoint);
    }

    #[test]
    fn pending_invocation_is_explicitly_blocked() {
        let messages = vec![
            Message::user("Run the command".to_string()),
            Message::assistant_with_tools(
                String::new(),
                vec![ToolCall {
                    tool_id: "call-pending".to_string(),
                    tool_name: "Bash".to_string(),
                    arguments: json!({"command": "cargo test"}),
                    raw_arguments: None,
                    is_error: false,
                    recovered_from_truncation: false,
                }],
            ),
        ];
        let checkpoint = RecoveryCheckpoint::from_messages(
            "checkpoint-1".to_string(),
            "session-1".to_string(),
            "turn-1".to_string(),
            RecoveryBoundary::AutomaticContinue,
            7,
            &messages,
            10,
        );

        checkpoint
            .validate("session-1", 7)
            .expect("valid blocked checkpoint");
        assert_eq!(checkpoint.status, RecoveryCheckpointStatus::Blocked);
        assert_eq!(
            checkpoint.invocations[0].pending_disposition,
            Some(PendingInvocationDisposition::Blocked)
        );
        assert!(checkpoint.blocking_reason.is_some());
    }

    #[test]
    fn stale_catalog_generation_fails_validation() {
        let checkpoint = RecoveryCheckpoint::from_messages(
            "checkpoint-1".to_string(),
            "session-1".to_string(),
            "turn-1".to_string(),
            RecoveryBoundary::AutomaticContinue,
            41,
            &finished_tool_messages(),
            10,
        );

        assert!(checkpoint.validate("session-1", 42).is_err());
    }

    #[test]
    fn deferred_gateway_and_direct_target_share_invocation_identity() {
        let direct = ToolCall {
            tool_id: "direct".to_string(),
            tool_name: "Read".to_string(),
            arguments: json!({"path": "src/lib.rs"}),
            raw_arguments: None,
            is_error: false,
            recovered_from_truncation: false,
        };
        let deferred = ToolCall {
            tool_id: "gateway".to_string(),
            tool_name: void_agent_tools::CALL_DEFERRED_TOOL_NAME.to_string(),
            arguments: json!({
                "tool_name": "Read",
                "arguments": {"path": "src/lib.rs"},
                "catalog_generation": 42
            }),
            raw_arguments: None,
            is_error: false,
            recovered_from_truncation: false,
        };

        assert_eq!(
            invocation_signature(&direct, 42),
            invocation_signature(&deferred, 42)
        );
    }

    #[test]
    fn new_user_goal_does_not_inherit_finished_invocations_from_old_checkpoint() {
        let old_checkpoint = RecoveryCheckpoint::from_messages(
            "old-checkpoint".to_string(),
            "session-1".to_string(),
            "turn-1".to_string(),
            RecoveryBoundary::AutomaticContinue,
            42,
            &finished_tool_messages(),
            10,
        );
        let old_summary = Message::assistant("Old summary".to_string()).with_compression_payload(
            super::super::CompressionPayload {
                entries: vec![super::super::CompressionEntry::RecoveryCheckpoint {
                    checkpoint: old_checkpoint,
                }],
            },
        );
        let messages = vec![
            old_summary,
            Message::user("Start a different task".to_string()),
        ];

        let checkpoint = RecoveryCheckpoint::from_messages(
            "new-checkpoint".to_string(),
            "session-1".to_string(),
            "turn-2".to_string(),
            RecoveryBoundary::AutomaticContinue,
            42,
            &messages,
            20,
        );

        assert_eq!(checkpoint.latest_user_goal, "Start a different task");
        assert!(checkpoint.invocations.is_empty());
    }
}
