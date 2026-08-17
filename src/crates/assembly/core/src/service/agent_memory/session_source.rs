use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

const SAFE_TRANSCRIPT_RENDERER_VERSION: &str = "agent-memory-visible-text-v1";
const MAX_TRANSCRIPT_MESSAGES: usize = 200;
const MAX_TRANSCRIPT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemorySessionSourceErrorCode {
    Unsupported,
    Missing,
    Denied,
    TooLarge,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySessionSourceError {
    pub code: MemorySessionSourceErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl MemorySessionSourceError {
    fn new(
        code: MemorySessionSourceErrorCode,
        message: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }

    pub fn unsupported() -> Self {
        Self::new(
            MemorySessionSourceErrorCode::Unsupported,
            "A workspace-authorized persistent session transcript source is not available",
            false,
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistentSessionTranscriptRequest {
    pub workspace_root: PathBuf,
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PersistentSessionTranscript {
    pub session_id: String,
    pub messages: Vec<PersistentTranscriptMessage>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PersistentTranscriptMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeSessionTranscript {
    pub session_id: String,
    pub renderer_version: String,
    pub fingerprint: String,
    pub messages: Vec<SafeTranscriptMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeTranscriptMessage {
    pub role: String,
    pub text: String,
}

#[async_trait]
pub trait PersistentSessionTranscriptPort: Send + Sync {
    async fn load_persistent_transcript(
        &self,
        request: PersistentSessionTranscriptRequest,
    ) -> Result<PersistentSessionTranscript, MemorySessionSourceError>;
}

#[async_trait]
pub trait AgentMemorySessionSourcePort: Send + Sync {
    async fn load_safe_transcript(
        &self,
        request: PersistentSessionTranscriptRequest,
    ) -> Result<SafeSessionTranscript, MemorySessionSourceError>;
}

/// Security adapter that turns a workspace-authorized persistent transcript
/// into the only shape an extractor may observe.
pub struct SafePersistentSessionSourceAdapter<P> {
    inner: P,
}

impl<P> SafePersistentSessionSourceAdapter<P> {
    pub fn new(inner: P) -> Self {
        Self { inner }
    }
}

#[async_trait]
impl<P: PersistentSessionTranscriptPort> AgentMemorySessionSourcePort
    for SafePersistentSessionSourceAdapter<P>
{
    async fn load_safe_transcript(
        &self,
        request: PersistentSessionTranscriptRequest,
    ) -> Result<SafeSessionTranscript, MemorySessionSourceError> {
        let expected_session_id = request.session_id.clone();
        let transcript = self.inner.load_persistent_transcript(request).await?;
        if transcript.session_id != expected_session_id {
            return Err(MemorySessionSourceError::new(
                MemorySessionSourceErrorCode::Denied,
                "Persistent transcript returned a mismatched session",
                false,
            ));
        }
        if transcript.messages.len() > MAX_TRANSCRIPT_MESSAGES {
            return Err(MemorySessionSourceError::new(
                MemorySessionSourceErrorCode::TooLarge,
                "Persistent transcript exceeds the memory extraction message limit",
                false,
            ));
        }

        let mut rendered_bytes = 0usize;
        let mut messages = Vec::new();
        for message in transcript.messages {
            let Some(text) = visible_text(&message.role, &message.content) else {
                continue;
            };
            let text = normalize_visible_text(&text);
            if text.is_empty() {
                continue;
            }
            rendered_bytes = rendered_bytes
                .saturating_add(message.role.len())
                .saturating_add(text.len());
            if rendered_bytes > MAX_TRANSCRIPT_BYTES {
                return Err(MemorySessionSourceError::new(
                    MemorySessionSourceErrorCode::TooLarge,
                    "Persistent transcript exceeds the memory extraction byte limit",
                    false,
                ));
            }
            messages.push(SafeTranscriptMessage {
                role: message.role,
                text,
            });
        }
        if messages.is_empty() {
            return Err(MemorySessionSourceError::new(
                MemorySessionSourceErrorCode::Missing,
                "Persistent transcript contains no user-visible conversation text",
                false,
            ));
        }

        let fingerprint = transcript_fingerprint(&transcript.session_id, &messages);
        Ok(SafeSessionTranscript {
            session_id: transcript.session_id,
            renderer_version: SAFE_TRANSCRIPT_RENDERER_VERSION.to_string(),
            fingerprint,
            messages,
        })
    }
}

#[derive(Debug, Default)]
pub struct UnsupportedPersistentSessionSourceAdapter;

#[async_trait]
impl AgentMemorySessionSourcePort for UnsupportedPersistentSessionSourceAdapter {
    async fn load_safe_transcript(
        &self,
        _request: PersistentSessionTranscriptRequest,
    ) -> Result<SafeSessionTranscript, MemorySessionSourceError> {
        Err(MemorySessionSourceError::unsupported())
    }
}

fn visible_text(role: &str, content: &serde_json::Value) -> Option<String> {
    match role {
        "user" => enum_text(content, &["Text", "Multimodal"]),
        "assistant" => enum_text(content, &["Text", "Mixed"]),
        // Never expose raw tool results, system prompts, or hidden roles.
        _ => None,
    }
}

fn enum_text(content: &serde_json::Value, allowed_variants: &[&str]) -> Option<String> {
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    let object = content.as_object()?;
    if let Some(text) = object.get("Text").and_then(serde_json::Value::as_str) {
        return allowed_variants.contains(&"Text").then(|| text.to_string());
    }
    for variant in allowed_variants {
        let Some(value) = object.get(*variant).and_then(serde_json::Value::as_object) else {
            continue;
        };
        if let Some(text) = value.get("text").and_then(serde_json::Value::as_str) {
            return Some(text.to_string());
        }
    }
    None
}

fn normalize_visible_text(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn transcript_fingerprint(session_id: &str, messages: &[SafeTranscriptMessage]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(SAFE_TRANSCRIPT_RENDERER_VERSION.as_bytes());
    hasher.update([0]);
    hasher.update(session_id.as_bytes());
    for message in messages {
        hasher.update([0]);
        hasher.update(message.role.as_bytes());
        hasher.update([0]);
        hasher.update(message.text.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TranscriptPort(PersistentSessionTranscript);

    #[async_trait]
    impl PersistentSessionTranscriptPort for TranscriptPort {
        async fn load_persistent_transcript(
            &self,
            _request: PersistentSessionTranscriptRequest,
        ) -> Result<PersistentSessionTranscript, MemorySessionSourceError> {
            Ok(self.0.clone())
        }
    }

    fn request() -> PersistentSessionTranscriptRequest {
        PersistentSessionTranscriptRequest {
            workspace_root: PathBuf::from("workspace"),
            session_id: "session-1".to_string(),
        }
    }

    #[tokio::test]
    async fn adapter_keeps_visible_text_and_drops_system_tool_and_hidden_fields() {
        let adapter =
            SafePersistentSessionSourceAdapter::new(TranscriptPort(PersistentSessionTranscript {
                session_id: "session-1".to_string(),
                messages: vec![
                    PersistentTranscriptMessage {
                        role: "system".to_string(),
                        content: serde_json::json!({"Text": "hidden system prompt"}),
                    },
                    PersistentTranscriptMessage {
                        role: "user".to_string(),
                        content: serde_json::json!({"Multimodal": {
                            "text": "  Prefer focused tests  ",
                            "images": [{"path": "secret.png"}]
                        }}),
                    },
                    PersistentTranscriptMessage {
                        role: "assistant".to_string(),
                        content: serde_json::json!({"Mixed": {
                            "reasoning_content": "hidden reasoning",
                            "text": "Understood",
                            "tool_calls": [{"arguments": {"token": "secret"}}]
                        }}),
                    },
                    PersistentTranscriptMessage {
                        role: "tool".to_string(),
                        content: serde_json::json!({"ToolResult": {"result": "secret"}}),
                    },
                ],
            }));

        let safe = adapter.load_safe_transcript(request()).await.unwrap();
        assert_eq!(
            safe.messages,
            vec![
                SafeTranscriptMessage {
                    role: "user".to_string(),
                    text: "Prefer focused tests".to_string(),
                },
                SafeTranscriptMessage {
                    role: "assistant".to_string(),
                    text: "Understood".to_string(),
                },
            ]
        );
        let serialized = serde_json::to_string(&safe).unwrap();
        assert!(!serialized.contains("hidden"));
        assert!(!serialized.contains("secret"));
    }

    #[tokio::test]
    async fn adapter_rejects_mismatched_session_and_oversized_transcript() {
        let mismatch =
            SafePersistentSessionSourceAdapter::new(TranscriptPort(PersistentSessionTranscript {
                session_id: "other".to_string(),
                messages: Vec::new(),
            }));
        assert_eq!(
            mismatch
                .load_safe_transcript(request())
                .await
                .unwrap_err()
                .code,
            MemorySessionSourceErrorCode::Denied
        );

        let oversized =
            SafePersistentSessionSourceAdapter::new(TranscriptPort(PersistentSessionTranscript {
                session_id: "session-1".to_string(),
                messages: (0..=MAX_TRANSCRIPT_MESSAGES)
                    .map(|_| PersistentTranscriptMessage {
                        role: "user".to_string(),
                        content: serde_json::json!({"Text": "hello"}),
                    })
                    .collect(),
            }));
        assert_eq!(
            oversized
                .load_safe_transcript(request())
                .await
                .unwrap_err()
                .code,
            MemorySessionSourceErrorCode::TooLarge
        );
    }

    #[tokio::test]
    async fn unsupported_adapter_fails_explicitly() {
        assert_eq!(
            UnsupportedPersistentSessionSourceAdapter
                .load_safe_transcript(request())
                .await
                .unwrap_err()
                .code,
            MemorySessionSourceErrorCode::Unsupported
        );
    }
}
