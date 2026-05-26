use crate::agentic::coordination::get_global_coordinator;
use crate::agentic::core::{Message, MessageSemanticKind};
use crate::agentic::events::{AgenticEvent, ToolEventData};
use crate::agentic::media::apimart::ApimartClient;
use crate::agentic::tools::framework::ToolUseContext;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::time::Duration;

pub const MEDIA_JOB_POLL_INTERVAL: Duration = Duration::from_secs(5);
const MEDIA_JOB_MAX_ATTEMPTS: usize = 120;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaJobHandle {
    pub task_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MediaToolEventContext {
    pub session_id: String,
    pub turn_id: String,
    pub round_id: String,
    pub tool_id: String,
    pub tool_name: String,
}

impl MediaToolEventContext {
    pub fn from_tool_context(context: &ToolUseContext, tool_name: &str) -> Option<Self> {
        Some(Self {
            session_id: context.session_id.clone()?,
            turn_id: context.dialog_turn_id.clone()?,
            round_id: context
                .custom_data
                .get("round_id")
                .and_then(|value| value.as_str())
                .map(str::to_string)?,
            tool_id: context.tool_call_id.clone()?,
            tool_name: tool_name.to_string(),
        })
    }
}

pub fn extract_media_task_ids(response: &Value) -> Vec<String> {
    let mut ids = BTreeSet::new();
    collect_task_ids(response, &mut ids, false);
    ids.into_iter().collect()
}

fn collect_task_ids(value: &Value, ids: &mut BTreeSet<String>, id_allowed_here: bool) {
    match value {
        Value::Object(map) => {
            for key in ["task_id", "taskId"] {
                if let Some(id) = map.get(key).and_then(Value::as_str) {
                    if !id.trim().is_empty() {
                        ids.insert(id.trim().to_string());
                    }
                }
            }

            if id_allowed_here {
                if let Some(id) = map.get("id").and_then(Value::as_str) {
                    if !id.trim().is_empty() {
                        ids.insert(id.trim().to_string());
                    }
                }
            }

            for (key, child) in map {
                let child_allows_id = matches!(
                    key.as_str(),
                    "data" | "task" | "job" | "tasks" | "jobs" | "result"
                );
                collect_task_ids(child, ids, child_allows_id);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_task_ids(child, ids, true);
            }
        }
        _ => {}
    }
}

pub fn classify_apimart_error(status: u16, body: &str) -> Value {
    let parsed = serde_json::from_str::<Value>(body).ok();
    let message = parsed
        .as_ref()
        .and_then(|value| value.pointer("/error/message"))
        .and_then(Value::as_str)
        .unwrap_or(body);
    let provider_type = parsed
        .as_ref()
        .and_then(|value| value.pointer("/error/type"))
        .and_then(Value::as_str);

    let code = if message.contains("safety_violations=") {
        "safety_rejected"
    } else {
        "provider_error"
    };
    let safety_violation = message
        .split("safety_violations=[")
        .nth(1)
        .and_then(|rest| rest.split(']').next())
        .filter(|value| !value.is_empty());

    json!({
        "status": "error",
        "source": "apimart",
        "error": {
            "code": code,
            "http_status": status,
            "message": message,
            "provider_type": provider_type,
            "safety_violation": safety_violation
        }
    })
}

pub fn classify_apimart_error_message(message: &str) -> Option<Value> {
    let rest = message.strip_prefix("APIMart error ")?;
    let (status, body) = rest.split_once(": ")?;
    let status = status.parse::<u16>().ok()?;
    Some(classify_apimart_error(status, body))
}

pub fn start_media_job_polling(
    client: ApimartClient,
    kind: &'static str,
    handle: MediaJobHandle,
    event_context: Option<MediaToolEventContext>,
) {
    let Some(event_context) = event_context else {
        return;
    };
    tokio::spawn(async move {
        let result = poll_media_jobs(client, kind, &handle.task_ids).await;
        emit_media_job_completed(event_context, result).await;
    });
}

async fn poll_media_jobs(client: ApimartClient, kind: &str, task_ids: &[String]) -> Value {
    let mut final_results = Vec::new();
    let mut pending = task_ids.to_vec();

    for _ in 0..MEDIA_JOB_MAX_ATTEMPTS {
        if pending.is_empty() {
            return build_media_batch_result(kind, Value::Array(final_results), vec![]);
        }

        let mut still_pending = Vec::new();
        for task_id in pending {
            match client.get_task_status(&task_id, Some("zh")).await {
                Ok(status_response) => {
                    let status = media_task_status(&status_response).unwrap_or("unknown");
                    if matches!(status, "completed" | "failed" | "cancelled") {
                        final_results.push(json!({
                            "task_id": task_id,
                            "status": status,
                            "response": status_response,
                        }));
                    } else {
                        still_pending.push(task_id);
                    }
                }
                Err(error) => {
                    final_results.push(json!({
                        "task_id": task_id,
                        "status": "failed",
                        "error": {
                            "code": "poll_failed",
                            "message": error.to_string(),
                        }
                    }));
                }
            }
        }

        pending = still_pending;
        if !pending.is_empty() {
            tokio::time::sleep(MEDIA_JOB_POLL_INTERVAL).await;
        }
    }

    build_media_batch_result(kind, Value::Array(final_results), pending)
}

fn media_task_status(response: &Value) -> Option<&str> {
    response
        .get("status")
        .and_then(Value::as_str)
        .or_else(|| response.pointer("/data/status").and_then(Value::as_str))
}

async fn emit_media_job_completed(event_context: MediaToolEventContext, result: Value) {
    let Some(coordinator) = get_global_coordinator() else {
        return;
    };
    let assistant_text = media_result_assistant_text(&result);
    let context_text = media_batch_context_text(&result);
    if !context_text.trim().is_empty() {
        let message = Message::system(context_text)
            .with_turn_id(event_context.turn_id.clone())
            .with_semantic_kind(MessageSemanticKind::InternalReminder);
        if let Err(error) = coordinator
            .get_session_manager()
            .add_message(&event_context.session_id, message)
            .await
        {
            log::warn!(
                "Failed to add media batch completion context: session_id={} error={}",
                event_context.session_id,
                error
            );
        }
    }
    coordinator
        .emit_tool_event(
            AgenticEvent::ToolEvent {
                session_id: event_context.session_id,
                turn_id: event_context.turn_id,
                round_id: event_context.round_id,
                tool_event: ToolEventData::Completed {
                    tool_id: event_context.tool_id,
                    tool_name: event_context.tool_name,
                    result,
                    result_for_assistant: Some(assistant_text),
                    duration_ms: 0,
                    queue_wait_ms: None,
                    preflight_ms: None,
                    confirmation_wait_ms: None,
                    execution_ms: None,
                },
            },
        )
        .await;
}

pub fn build_media_batch_result(kind: &str, tasks: Value, pending_task_ids: Vec<String>) -> Value {
    let task_items = tasks.as_array().cloned().unwrap_or_default();
    let total_count = task_items.len() + pending_task_ids.len();
    let completed_count = task_items
        .iter()
        .filter(|task| task.get("status").and_then(Value::as_str) == Some("completed"))
        .count();
    let failed_count = task_items
        .iter()
        .filter(|task| {
            matches!(
                task.get("status").and_then(Value::as_str),
                Some("failed" | "cancelled")
            )
        })
        .count();
    let status = if !pending_task_ids.is_empty() {
        "timeout"
    } else if failed_count == 0 && completed_count == total_count {
        "completed"
    } else if completed_count > 0 {
        "partial"
    } else {
        "failed"
    };
    let assets = extract_media_assets(kind, &task_items);

    json!({
        "status": status,
        "source": "apimart",
        "kind": kind,
        "batch": {
            "kind": kind,
            "status": status,
            "total_count": total_count,
            "completed_count": completed_count,
            "failed_count": failed_count,
            "pending_count": pending_task_ids.len(),
            "pending_task_ids": pending_task_ids,
            "assets": assets,
        },
        "tasks": task_items,
    })
}

fn extract_media_assets(kind: &str, task_items: &[Value]) -> Vec<Value> {
    let mut assets = Vec::new();
    for task in task_items {
        if task.get("status").and_then(Value::as_str) != Some("completed") {
            continue;
        }

        let task_id = task
            .get("task_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut urls = Vec::new();
        collect_urls(task, &mut urls);
        for url in urls {
            assets.push(json!({
                "kind": kind,
                "task_id": task_id,
                "url": url,
            }));
        }
    }
    assets
}

pub fn media_batch_context_text(result: &Value) -> String {
    let batch = result.get("batch").unwrap_or(result);
    let kind = batch
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("media");
    let status = batch
        .get("status")
        .and_then(Value::as_str)
        .or_else(|| result.get("status").and_then(Value::as_str))
        .unwrap_or("completed");
    let total_count = batch
        .get("total_count")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let completed_count = batch
        .get("completed_count")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let failed_count = batch
        .get("failed_count")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let urls = batch
        .get("assets")
        .and_then(Value::as_array)
        .map(|assets| {
            assets
                .iter()
                .filter_map(|asset| asset.get("url").and_then(Value::as_str))
                .filter(|url| url.starts_with("http://") || url.starts_with("https://"))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut lines = vec![
        "Media batch completed.".to_string(),
        format!(
            "Kind: {kind}; status: {status}; completed: {completed_count}/{total_count}; failed: {failed_count}."
        ),
    ];
    if !urls.is_empty() {
        lines.push("Assets:".to_string());
        lines.extend(urls.into_iter().map(|url| format!("- {url}")));
    }
    lines.push(
        "Use these assets in the next reply when the user asks to inspect, select, refine, or continue media work."
            .to_string(),
    );
    lines.join("\n")
}

fn media_result_assistant_text(result: &Value) -> String {
    let urls = result
        .pointer("/batch/assets")
        .and_then(Value::as_array)
        .map(|assets| {
            assets
                .iter()
                .filter_map(|asset| asset.get("url").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            let mut urls = Vec::new();
            collect_urls(result, &mut urls);
            urls
        });
    if urls.is_empty() {
        return "媒体生成任务已完成，请查看工具结果。".to_string();
    }

    let list = urls
        .iter()
        .map(|url| format!("- {url}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("媒体生成任务已完成，结果链接：\n{list}")
}

fn collect_urls(value: &Value, urls: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if key == "url" || key.ends_with("_url") {
                    if let Some(url) = child.as_str() {
                        if (url.starts_with("http://") || url.starts_with("https://"))
                            && !urls.iter().any(|existing| existing == url)
                        {
                            urls.push(url.to_string());
                        }
                    }
                }
                collect_urls(child, urls);
            }
        }
        Value::Array(items) => {
            for child in items {
                if let Some(url) = child.as_str() {
                    if (url.starts_with("http://") || url.starts_with("https://"))
                        && !urls.iter().any(|existing| existing == url)
                    {
                        urls.push(url.to_string());
                    }
                    continue;
                }
                collect_urls(child, urls);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_media_batch_result, classify_apimart_error, classify_apimart_error_message,
        extract_media_task_ids, media_batch_context_text, media_task_status,
    };
    use serde_json::json;

    #[test]
    fn extracts_task_ids_from_single_and_batched_submit_responses() {
        let response = json!({
            "task_id": "task_root",
            "data": {
                "tasks": [
                    { "id": "task_a" },
                    { "taskId": "task_b" },
                    { "task_id": "task_a" }
                ]
            }
        });

        assert_eq!(
            extract_media_task_ids(&response),
            vec![
                "task_a".to_string(),
                "task_b".to_string(),
                "task_root".to_string()
            ]
        );
    }

    #[test]
    fn does_not_treat_unrelated_root_id_as_task_id() {
        let response = json!({
            "id": "request_not_task",
            "model": "gpt-image-2",
            "data": { "id": "task_data" }
        });

        assert_eq!(extract_media_task_ids(&response), vec!["task_data".to_string()]);
    }

    #[test]
    fn classifies_provider_safety_rejection() {
        let body = r#"{"error":{"message":"Your request was rejected. safety_violations=[sexual]. traceid: abc","type":"invalid_request_error"}}"#;

        let error = classify_apimart_error(500, body);

        assert_eq!(error["error"]["code"], "safety_rejected");
        assert_eq!(error["error"]["safety_violation"], "sexual");
        assert_eq!(error["error"]["http_status"], 500);
    }

    #[test]
    fn classifies_apimart_http_error_messages() {
        let message = r#"APIMart error 500: {"error":{"message":"blocked safety_violations=[sexual].","type":"invalid_request_error"}}"#;

        let error = classify_apimart_error_message(message).expect("classified error");

        assert_eq!(error["error"]["code"], "safety_rejected");
        assert_eq!(error["error"]["safety_violation"], "sexual");
    }

    #[test]
    fn builds_batch_result_with_counts_and_assets() {
        let result = build_media_batch_result(
            "image",
            json!([
                {
                    "task_id": "task-a",
                    "status": "completed",
                    "response": {
                        "data": [{ "url": "https://cdn.example/a.png" }]
                    }
                },
                {
                    "task_id": "task-b",
                    "status": "failed",
                    "error": { "code": "provider_error", "message": "failed" }
                }
            ]),
            vec![],
        );

        assert_eq!(result["status"], "partial");
        assert_eq!(result["batch"]["kind"], "image");
        assert_eq!(result["batch"]["total_count"], 2);
        assert_eq!(result["batch"]["completed_count"], 1);
        assert_eq!(result["batch"]["failed_count"], 1);
        assert_eq!(result["batch"]["assets"][0]["url"], "https://cdn.example/a.png");
    }

    #[test]
    fn reads_apimart_task_status_and_image_urls_from_data_wrapper() {
        let status_response = json!({
            "code": 200,
            "data": {
                "id": "task_01KA040M0HP1GJWBJYZMKX1XS1",
                "status": "completed",
                "progress": 100,
                "result": {
                    "images": [
                        {
                            "url": [
                                "https://upload.apimart.ai/f/image/generated.png"
                            ],
                            "expires_at": 1763174708
                        }
                    ]
                }
            }
        });

        assert_eq!(media_task_status(&status_response), Some("completed"));

        let result = build_media_batch_result(
            "image",
            json!([{
                "task_id": "task_01KA040M0HP1GJWBJYZMKX1XS1",
                "status": "completed",
                "response": status_response,
            }]),
            vec![],
        );

        assert_eq!(result["status"], "completed");
        assert_eq!(
            result["batch"]["assets"][0]["url"],
            "https://upload.apimart.ai/f/image/generated.png"
        );
    }

    #[test]
    fn renders_batch_context_for_next_ai_turn() {
        let result = build_media_batch_result(
            "video",
            json!([
                {
                    "task_id": "task-video",
                    "status": "completed",
                    "response": {
                        "result": { "video_url": "https://cdn.example/clip.mp4" }
                    }
                }
            ]),
            vec![],
        );

        let text = media_batch_context_text(&result);

        assert!(text.contains("Media batch completed"));
        assert!(text.contains("https://cdn.example/clip.mp4"));
    }
}
