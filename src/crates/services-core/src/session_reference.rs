use crate::session::types::{DialogTurnData, DialogTurnKind, SessionMetadata};
use serde::{Deserialize, Serialize};

pub const SESSION_REFERENCE_MAX_MESSAGES: usize = 24;
pub const SESSION_REFERENCE_MAX_TOKENS: usize = 6_000;
pub const SESSION_REFERENCE_MAX_REFERENCES: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionReferenceTranscriptStatus {
    Ready,
    Missing,
    Denied,
    TooLarge,
    Unsupported,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReferenceTranscriptSource {
    pub kind: String,
    pub session_id: String,
    pub session_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReferenceTranscriptError {
    pub code: SessionReferenceTranscriptStatus,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReferenceTranscriptResult {
    pub source: SessionReferenceTranscriptSource,
    pub status: SessionReferenceTranscriptStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
    pub message_count: usize,
    pub estimated_tokens: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SessionReferenceTranscriptError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReferenceLocator {
    pub session_id: String,
    pub session_title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_connection_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_ssh_host: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReferenceAccessScope {
    pub current_session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub workspace_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_connection_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_ssh_host: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionReferenceTranscriptCandidate {
    pub session_id: String,
    pub session_title: String,
    pub workspace_path: Option<String>,
    pub owner_id: Option<String>,
    pub is_user_visible: bool,
    pub contains_nested_reference: bool,
    pub messages: Vec<SessionReferenceMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionReferenceMessage {
    pub role: &'static str,
    pub content: String,
}

fn normalized_scope_value(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn optional_scope_matches(reference: Option<&str>, active: Option<&str>) -> bool {
    match reference.map(str::trim).filter(|value| !value.is_empty()) {
        Some(reference) => active
            .map(normalized_scope_value)
            .is_some_and(|active| normalized_scope_value(reference) == active),
        None => true,
    }
}

fn metadata_contains_session_reference(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Array(values) => values.iter().any(metadata_contains_session_reference),
        serde_json::Value::Object(values) => {
            if values
                .get("type")
                .and_then(serde_json::Value::as_str)
                .is_some_and(|kind| kind == "session-reference")
            {
                return true;
            }
            if values
                .get("sessionReferences")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|references| !references.is_empty())
            {
                return true;
            }
            values.values().any(metadata_contains_session_reference)
        }
        _ => false,
    }
}

pub fn candidate_from_persisted(
    metadata: &SessionMetadata,
    turns: &[DialogTurnData],
) -> SessionReferenceTranscriptCandidate {
    let contains_nested_reference = turns.iter().any(|turn| {
        turn.user_message
            .metadata
            .as_ref()
            .is_some_and(metadata_contains_session_reference)
    });
    let mut messages = Vec::new();
    for turn in turns
        .iter()
        .filter(|turn| turn.kind == DialogTurnKind::UserDialog)
    {
        let user_content = turn.user_message.content.trim();
        if !user_content.is_empty() {
            messages.push(SessionReferenceMessage {
                role: "user",
                content: user_content.to_string(),
            });
        }
        for round in &turn.model_rounds {
            let assistant_content = round
                .text_items
                .iter()
                .map(|item| item.content.trim())
                .filter(|content| !content.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            if !assistant_content.is_empty() {
                messages.push(SessionReferenceMessage {
                    role: "assistant",
                    content: assistant_content,
                });
            }
        }
    }

    SessionReferenceTranscriptCandidate {
        session_id: metadata.session_id.clone(),
        session_title: metadata.session_name.clone(),
        workspace_path: metadata.workspace_path.clone(),
        owner_id: metadata.created_by.clone(),
        is_user_visible: !metadata.should_hide_from_user_lists(),
        contains_nested_reference,
        messages,
    }
}

fn error_result(
    locator: &SessionReferenceLocator,
    status: SessionReferenceTranscriptStatus,
    message: impl Into<String>,
) -> SessionReferenceTranscriptResult {
    SessionReferenceTranscriptResult {
        source: SessionReferenceTranscriptSource {
            kind: "session_reference".to_string(),
            session_id: locator.session_id.clone(),
            session_title: locator.session_title.clone(),
        },
        status: status.clone(),
        transcript: None,
        message_count: 0,
        estimated_tokens: 0,
        error: Some(SessionReferenceTranscriptError {
            code: status,
            message: message.into(),
        }),
    }
}

pub fn failed_session_reference_result(
    locator: &SessionReferenceLocator,
    message: impl Into<String>,
) -> SessionReferenceTranscriptResult {
    error_result(locator, SessionReferenceTranscriptStatus::Failed, message)
}

pub fn too_large_session_reference_result(
    locator: &SessionReferenceLocator,
    message: impl Into<String>,
) -> SessionReferenceTranscriptResult {
    error_result(locator, SessionReferenceTranscriptStatus::TooLarge, message)
}

pub fn resolve_session_reference_transcript(
    scope: &SessionReferenceAccessScope,
    locator: &SessionReferenceLocator,
    candidate: Option<&SessionReferenceTranscriptCandidate>,
) -> SessionReferenceTranscriptResult {
    if locator.session_id.trim().is_empty() || scope.workspace_path.trim().is_empty() {
        return error_result(
            locator,
            SessionReferenceTranscriptStatus::Unsupported,
            "Session reference is missing a supported workspace or session locator.",
        );
    }
    if locator.session_id == scope.current_session_id {
        return error_result(
            locator,
            SessionReferenceTranscriptStatus::Unsupported,
            "A session cannot inject its own transcript.",
        );
    }
    let scope_matches = optional_scope_matches(
        locator.workspace_id.as_deref(),
        scope.workspace_id.as_deref(),
    ) && optional_scope_matches(
        locator.workspace_path.as_deref(),
        Some(scope.workspace_path.as_str()),
    ) && optional_scope_matches(
        locator.remote_connection_id.as_deref(),
        scope.remote_connection_id.as_deref(),
    ) && optional_scope_matches(
        locator.remote_ssh_host.as_deref(),
        scope.remote_ssh_host.as_deref(),
    );
    if !scope_matches {
        return error_result(
            locator,
            SessionReferenceTranscriptStatus::Denied,
            "Referenced session is outside the active workspace scope.",
        );
    }

    let Some(candidate) = candidate else {
        return error_result(
            locator,
            SessionReferenceTranscriptStatus::Missing,
            "Referenced session does not exist in the active workspace.",
        );
    };
    if candidate.session_id != locator.session_id
        || !candidate.is_user_visible
        || candidate
            .owner_id
            .as_deref()
            .is_some_and(|owner_id| scope.current_user_id.as_deref() != Some(owner_id))
        || !optional_scope_matches(
            candidate.workspace_path.as_deref(),
            Some(scope.workspace_path.as_str()),
        )
    {
        return error_result(
            locator,
            SessionReferenceTranscriptStatus::Denied,
            "Referenced session is not accessible from the active workspace.",
        );
    }
    if candidate.contains_nested_reference {
        return error_result(
            locator,
            SessionReferenceTranscriptStatus::Unsupported,
            "Recursive session-reference expansion is not supported.",
        );
    }

    let message_count = candidate.messages.len();
    let estimated_tokens = candidate
        .messages
        .iter()
        .map(|message| message.content.chars().count().div_ceil(4))
        .sum();
    if message_count > SESSION_REFERENCE_MAX_MESSAGES
        || estimated_tokens > SESSION_REFERENCE_MAX_TOKENS
    {
        let mut result = error_result(
            locator,
            SessionReferenceTranscriptStatus::TooLarge,
            "Referenced transcript exceeds the safe injection budget.",
        );
        result.message_count = message_count;
        result.estimated_tokens = estimated_tokens;
        return result;
    }

    let title = if candidate.session_title.trim().is_empty() {
        &locator.session_title
    } else {
        &candidate.session_title
    };
    let body = candidate
        .messages
        .iter()
        .map(|message| format!("[{}]\n{}", message.role, message.content))
        .collect::<Vec<_>>()
        .join("\n\n");
    SessionReferenceTranscriptResult {
        source: SessionReferenceTranscriptSource {
            kind: "session_reference".to_string(),
            session_id: locator.session_id.clone(),
            session_title: title.clone(),
        },
        status: SessionReferenceTranscriptStatus::Ready,
        transcript: Some(format!(
            "<referenced_session>\nsource_session_id: {}\nsource_title: {}\n\n{}\n</referenced_session>",
            serde_json::to_string(&locator.session_id).unwrap_or_default(),
            serde_json::to_string(title).unwrap_or_default(),
            body
        )),
        message_count,
        estimated_tokens,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> SessionReferenceAccessScope {
        SessionReferenceAccessScope {
            current_session_id: "current".to_string(),
            current_user_id: None,
            workspace_id: Some("workspace-1".to_string()),
            workspace_path: "D:/workspace/project".to_string(),
            remote_connection_id: None,
            remote_ssh_host: None,
        }
    }

    fn locator() -> SessionReferenceLocator {
        SessionReferenceLocator {
            session_id: "research".to_string(),
            session_title: "Research".to_string(),
            workspace_id: Some("workspace-1".to_string()),
            workspace_path: Some("D:\\workspace\\project\\".to_string()),
            remote_connection_id: None,
            remote_ssh_host: None,
        }
    }

    fn candidate() -> SessionReferenceTranscriptCandidate {
        SessionReferenceTranscriptCandidate {
            session_id: "research".to_string(),
            session_title: "Research".to_string(),
            workspace_path: Some("D:/workspace/project".to_string()),
            owner_id: None,
            is_user_visible: true,
            contains_nested_reference: false,
            messages: vec![
                SessionReferenceMessage {
                    role: "user",
                    content: "Question".to_string(),
                },
                SessionReferenceMessage {
                    role: "assistant",
                    content: "Answer".to_string(),
                },
            ],
        }
    }

    #[test]
    fn resolves_same_workspace_transcript() {
        let result = resolve_session_reference_transcript(&scope(), &locator(), Some(&candidate()));
        assert_eq!(result.status, SessionReferenceTranscriptStatus::Ready);
        assert!(result.transcript.unwrap().contains("[assistant]\nAnswer"));
    }

    #[test]
    fn denies_cross_workspace_reference() {
        let mut locator = locator();
        locator.workspace_id = Some("workspace-2".to_string());
        let result = resolve_session_reference_transcript(&scope(), &locator, Some(&candidate()));
        assert_eq!(result.status, SessionReferenceTranscriptStatus::Denied);
    }

    #[test]
    fn reports_missing_session() {
        let result = resolve_session_reference_transcript(&scope(), &locator(), None);
        assert_eq!(result.status, SessionReferenceTranscriptStatus::Missing);
    }

    #[test]
    fn rejects_transcript_over_message_budget() {
        let mut candidate = candidate();
        candidate.messages = (0..=SESSION_REFERENCE_MAX_MESSAGES)
            .map(|index| SessionReferenceMessage {
                role: "user",
                content: format!("message {index}"),
            })
            .collect();
        let result = resolve_session_reference_transcript(&scope(), &locator(), Some(&candidate));
        assert_eq!(result.status, SessionReferenceTranscriptStatus::TooLarge);
    }

    #[test]
    fn rejects_recursive_session_reference() {
        let mut candidate = candidate();
        candidate.contains_nested_reference = true;
        let result = resolve_session_reference_transcript(&scope(), &locator(), Some(&candidate));
        assert_eq!(result.status, SessionReferenceTranscriptStatus::Unsupported);
    }

    #[test]
    fn denies_a_session_owned_by_another_user() {
        let mut candidate = candidate();
        candidate.owner_id = Some("user-2".to_string());
        let mut scope = scope();
        scope.current_user_id = Some("user-1".to_string());
        let result = resolve_session_reference_transcript(&scope, &locator(), Some(&candidate));
        assert_eq!(result.status, SessionReferenceTranscriptStatus::Denied);
    }
}
