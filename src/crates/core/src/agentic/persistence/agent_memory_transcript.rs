//! Read-only adapter from persisted dialog turns to the memory transcript port.

use super::PersistenceManager;
use crate::service::agent_memory::{
    MemorySessionSourceError, MemorySessionSourceErrorCode, PersistentSessionTranscript,
    PersistentSessionTranscriptPort, PersistentSessionTranscriptRequest,
    PersistentTranscriptMessage,
};
use crate::service::session::DialogTurnData;
use async_trait::async_trait;

pub struct PersistentAgentMemoryTranscriptAdapter {
    persistence: PersistenceManager,
    missing_is_unsupported: bool,
}

impl PersistentAgentMemoryTranscriptAdapter {
    pub fn new(persistence: PersistenceManager) -> Self {
        Self {
            persistence,
            missing_is_unsupported: false,
        }
    }

    pub fn for_btw(persistence: PersistenceManager) -> Self {
        Self {
            persistence,
            missing_is_unsupported: true,
        }
    }
}

#[async_trait]
impl PersistentSessionTranscriptPort for PersistentAgentMemoryTranscriptAdapter {
    async fn load_persistent_transcript(
        &self,
        request: PersistentSessionTranscriptRequest,
    ) -> Result<PersistentSessionTranscript, MemorySessionSourceError> {
        let turns = self
            .persistence
            .load_session_turns(&request.workspace_root, &request.session_id)
            .await
            .map_err(|error| MemorySessionSourceError {
                code: MemorySessionSourceErrorCode::Failed,
                message: format!("Failed to load the durable session transcript: {error}"),
                retryable: true,
            })?;
        if turns.is_empty() {
            return Err(if self.missing_is_unsupported {
                MemorySessionSourceError {
                    code: MemorySessionSourceErrorCode::Unsupported,
                    message:
                        "BTW memory requires a durable child-session transcript, but none is available"
                            .to_string(),
                    retryable: false,
                }
            } else {
                MemorySessionSourceError {
                    code: MemorySessionSourceErrorCode::Missing,
                    message: "The durable session transcript is empty or unavailable".to_string(),
                    retryable: false,
                }
            });
        }

        Ok(PersistentSessionTranscript {
            session_id: request.session_id,
            messages: visible_messages_from_turns(turns),
        })
    }
}

fn visible_messages_from_turns(turns: Vec<DialogTurnData>) -> Vec<PersistentTranscriptMessage> {
    let mut messages = Vec::new();
    for turn in turns
        .into_iter()
        .filter(|turn| turn.kind.is_model_visible())
    {
        messages.push(PersistentTranscriptMessage {
            role: "user".to_string(),
            content: serde_json::Value::String(turn.user_message.content),
        });
        for round in turn.model_rounds {
            for text in round.text_items {
                if !text.content.trim().is_empty() {
                    messages.push(PersistentTranscriptMessage {
                        role: "assistant".to_string(),
                        content: serde_json::Value::String(text.content),
                    });
                }
            }
        }
    }
    messages
}
