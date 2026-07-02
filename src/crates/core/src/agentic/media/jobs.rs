use crate::agentic::coordination::get_global_coordinator;
use crate::agentic::core::{Message, MessageSemanticKind};
use crate::agentic::events::{AgenticEvent, ToolEventData};
use crate::agentic::media::apimart::ApimartClient;
use crate::agentic::tools::framework::ToolUseContext;
use chrono::Utc;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

pub const MEDIA_JOB_INITIAL_POLL_DELAY: Duration = Duration::from_secs(20);
pub const MEDIA_JOB_POLL_INTERVAL: Duration = Duration::from_secs(5);
const MEDIA_JOB_MAX_ATTEMPTS: usize = 120;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaJobHandle {
    pub batch_id: String,
    pub task_ids: Vec<String>,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub requested_count: Option<usize>,
    pub requested_aspect_ratio: Option<String>,
    pub placeholder_aspect_ratio: Option<String>,
    pub short_drama: Option<Value>,
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
    let mut ids = Vec::new();
    collect_task_ids(response, &mut ids, false);
    ids
}

fn push_task_id(ids: &mut Vec<String>, id: &str) {
    let id = id.trim();
    if !id.is_empty() && !ids.iter().any(|existing| existing == id) {
        ids.push(id.to_string());
    }
}

fn collect_task_ids(value: &Value, ids: &mut Vec<String>, id_allowed_here: bool) {
    match value {
        Value::Object(map) => {
            for key in ["task_id", "taskId"] {
                if let Some(id) = map.get(key).and_then(Value::as_str) {
                    push_task_id(ids, id);
                }
            }

            if id_allowed_here {
                if let Some(id) = map.get("id").and_then(Value::as_str) {
                    push_task_id(ids, id);
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
    store_path: Option<PathBuf>,
    event_context: Option<MediaToolEventContext>,
) {
    let Some(event_context) = event_context else {
        return;
    };
    tokio::spawn(async move {
        if let Some(path) = store_path.as_deref() {
            let _ = persist_media_batch(
                path,
                &build_media_polling_result(
                    kind,
                    &handle.batch_id,
                    &handle.task_ids,
                    handle.prompt.as_deref(),
                    handle.model.as_deref(),
                    handle.requested_count,
                    handle.requested_aspect_ratio.as_deref(),
                    handle.placeholder_aspect_ratio.as_deref(),
                ),
            )
            .await;
        }
        tokio::time::sleep(MEDIA_JOB_INITIAL_POLL_DELAY).await;
        let mut result = poll_media_jobs(client, kind, &handle).await;
        if let Some(path) = store_path.as_deref() {
            result = save_generated_media_assets(&result, path)
                .await
                .unwrap_or(result);
            let _ = persist_media_batch(path, &result).await;
        }
        attach_short_drama_media_result(&mut result, kind, handle.short_drama.as_ref());
        emit_media_job_completed(event_context, result).await;
    });
}

async fn poll_media_jobs(client: ApimartClient, kind: &str, handle: &MediaJobHandle) -> Value {
    let mut final_results = Vec::new();
    let mut pending = handle.task_ids.clone();

    for _ in 0..MEDIA_JOB_MAX_ATTEMPTS {
        if pending.is_empty() {
            return build_media_batch_result_with_id_and_metadata(
                kind,
                &handle.batch_id,
                Value::Array(final_results),
                vec![],
                handle.prompt.as_deref(),
                handle.model.as_deref(),
                handle.requested_count,
                handle.requested_aspect_ratio.as_deref(),
                handle.placeholder_aspect_ratio.as_deref(),
            );
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

    build_media_batch_result_with_id_and_metadata(
        kind,
        &handle.batch_id,
        Value::Array(final_results),
        pending,
        handle.prompt.as_deref(),
        handle.model.as_deref(),
        handle.requested_count,
        handle.requested_aspect_ratio.as_deref(),
        handle.placeholder_aspect_ratio.as_deref(),
    )
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
        .emit_tool_event(AgenticEvent::ToolEvent {
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
        })
        .await;
}

pub fn build_media_batch_result(kind: &str, tasks: Value, pending_task_ids: Vec<String>) -> Value {
    build_media_batch_result_with_id(kind, &new_media_batch_id(), tasks, pending_task_ids)
}

pub fn build_media_batch_result_with_id(
    kind: &str,
    batch_id: &str,
    tasks: Value,
    pending_task_ids: Vec<String>,
) -> Value {
    build_media_batch_result_with_id_and_metadata(
        kind,
        batch_id,
        tasks,
        pending_task_ids,
        None,
        None,
        None,
        None,
        None,
    )
}

fn build_media_batch_result_with_id_and_metadata(
    kind: &str,
    batch_id: &str,
    tasks: Value,
    pending_task_ids: Vec<String>,
    prompt: Option<&str>,
    model: Option<&str>,
    requested_count: Option<usize>,
    requested_aspect_ratio: Option<&str>,
    placeholder_aspect_ratio: Option<&str>,
) -> Value {
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
    let items = build_media_items(kind, &task_items, &pending_task_ids, prompt, model);
    let now = Utc::now().to_rfc3339();
    let requested_count = requested_count.unwrap_or(total_count);
    let requested_aspect_ratio =
        requested_aspect_ratio.unwrap_or(default_requested_aspect_ratio(kind));
    let placeholder_aspect_ratio =
        placeholder_aspect_ratio.unwrap_or(default_placeholder_aspect_ratio(kind));

    json!({
        "status": status,
        "source": "apimart",
        "kind": kind,
        "batch": {
            "batch_id": batch_id,
            "kind": kind,
            "status": status,
            "source": "apimart",
            "total_count": total_count,
            "requested_count": requested_count,
            "requested_aspect_ratio": requested_aspect_ratio,
            "placeholder_aspect_ratio": placeholder_aspect_ratio,
            "completed_count": completed_count,
            "failed_count": failed_count,
            "pending_count": pending_task_ids.len(),
            "pending_task_ids": pending_task_ids,
            "updated_at": now,
            "items": items,
            "assets": assets,
        },
        "tasks": task_items,
    })
}

pub fn build_media_polling_result(
    kind: &str,
    batch_id: &str,
    task_ids: &[String],
    prompt: Option<&str>,
    model: Option<&str>,
    requested_count: Option<usize>,
    requested_aspect_ratio: Option<&str>,
    placeholder_aspect_ratio: Option<&str>,
) -> Value {
    let now = Utc::now().to_rfc3339();
    let requested_count = requested_count.unwrap_or(task_ids.len().max(1));
    let requested_aspect_ratio =
        requested_aspect_ratio.unwrap_or(default_requested_aspect_ratio(kind));
    let placeholder_aspect_ratio =
        placeholder_aspect_ratio.unwrap_or(default_placeholder_aspect_ratio(kind));
    let items = task_ids
        .iter()
        .enumerate()
        .map(|(index, task_id)| {
            json!({
                "item_index": index + 1,
                "kind": kind,
                "role": default_media_role(kind),
                "prompt": prompt.unwrap_or_default(),
                "model": model.unwrap_or_default(),
                "task_id": task_id,
                "status": "polling",
                "started_at": now,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "status": "polling",
        "source": "apimart",
        "kind": kind,
        "batch_id": batch_id,
        "task_ids": task_ids,
        "initial_delay_seconds": MEDIA_JOB_INITIAL_POLL_DELAY.as_secs(),
        "poll_interval_seconds": MEDIA_JOB_POLL_INTERVAL.as_secs(),
        "batch": {
            "batch_id": batch_id,
            "kind": kind,
            "status": "polling",
            "source": "apimart",
            "total_count": task_ids.len(),
            "requested_count": requested_count,
            "requested_aspect_ratio": requested_aspect_ratio,
            "placeholder_aspect_ratio": placeholder_aspect_ratio,
            "completed_count": 0,
            "failed_count": 0,
            "pending_count": task_ids.len(),
            "pending_task_ids": task_ids,
            "created_at": now,
            "updated_at": now,
            "items": items,
            "assets": [],
        }
    })
}

fn attach_short_drama_media_result(result: &mut Value, kind: &str, short_drama: Option<&Value>) {
    let Some(short_drama) = short_drama.filter(|value| value.is_object()) else {
        return;
    };
    let Some(batch) = result.get("batch").and_then(Value::as_object) else {
        return;
    };
    let Some(batch_id) = batch.get("batch_id").and_then(Value::as_str) else {
        return;
    };
    let first_asset = batch
        .get("assets")
        .and_then(Value::as_array)
        .and_then(|items| items.first());
    let first_item = batch
        .get("items")
        .and_then(Value::as_array)
        .and_then(|items| items.first());
    let item_index = first_asset
        .and_then(|asset| asset.get("item_index"))
        .or_else(|| first_item.and_then(|item| item.get("item_index")))
        .and_then(Value::as_u64)
        .unwrap_or(1);
    let preview_url = first_asset
        .and_then(|asset| asset.get("url"))
        .or_else(|| first_item.and_then(|item| item.get("result_url")))
        .and_then(Value::as_str);
    let local_path = first_asset
        .and_then(|asset| asset.get("local_path"))
        .or_else(|| first_item.and_then(|item| item.get("local_path")))
        .and_then(Value::as_str);

    let mut metadata = short_drama.clone();
    let Some(metadata_object) = metadata.as_object_mut() else {
        return;
    };
    metadata_object.insert(
        "outputMediaItemId".to_string(),
        json!(format!("{batch_id}-{item_index}")),
    );
    metadata_object.insert("outputMediaKind".to_string(), json!(kind));
    if let Some(preview_url) = preview_url {
        metadata_object.insert("outputPreviewUrl".to_string(), json!(preview_url));
        metadata_object.insert("outputThumbnailUrl".to_string(), json!(preview_url));
    }
    if let Some(local_path) = local_path {
        metadata_object.insert("outputMediaPath".to_string(), json!(local_path));
        if let Some(relative_path) = generated_media_relative_path(local_path) {
            metadata_object.insert("outputMediaRelativePath".to_string(), json!(relative_path));
        }
    }
    if !metadata_object.contains_key("outputMediaLabel") {
        metadata_object.insert("outputMediaLabel".to_string(), json!("Generated media"));
    }
    result["shortDrama"] = metadata;
}

fn generated_media_relative_path(local_path: &str) -> Option<String> {
    let normalized = local_path.replace('\\', "/");
    let marker = "/media/generated/";
    normalized
        .find(marker)
        .map(|index| normalized[index + 1..].to_string())
        .or_else(|| {
            normalized
                .strip_prefix("media/generated/")
                .map(|path| path.to_string())
        })
}

fn default_requested_aspect_ratio(kind: &str) -> &'static str {
    match kind {
        "video" => "16:9",
        "audio" => "5:2",
        _ => "1:1",
    }
}

fn default_placeholder_aspect_ratio(kind: &str) -> &'static str {
    match kind {
        "video" => "16 / 9",
        "audio" => "5 / 2",
        _ => "1 / 1",
    }
}

pub fn new_media_batch_id() -> String {
    format!("media_batch_{}", Uuid::new_v4().simple())
}

pub fn media_job_store_path(workspace_root: Option<&Path>, batch_id: &str) -> Option<PathBuf> {
    let workspace_root = workspace_root?;
    Some(
        workspace_root
            .join(".void")
            .join("media-jobs")
            .join(format!("{batch_id}.json")),
    )
}

pub async fn persist_media_batch(path: &Path, result: &Value) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let bytes = serde_json::to_vec_pretty(result).map_err(std::io::Error::other)?;
    tokio::fs::write(path, bytes).await
}

pub async fn load_media_batch(path: &Path) -> Result<Value, std::io::Error> {
    let bytes = tokio::fs::read(path).await?;
    serde_json::from_slice(&bytes).map_err(std::io::Error::other)
}

pub async fn save_generated_media_assets(
    result: &Value,
    media_job_path: &Path,
) -> Result<Value, std::io::Error> {
    let client = reqwest::Client::new();
    save_generated_media_assets_with_downloader(result, media_job_path, |url| {
        let client = client.clone();
        async move {
            let response = client
                .get(url)
                .send()
                .await
                .map_err(std::io::Error::other)?;
            if !response.status().is_success() {
                return Err(std::io::Error::other(format!(
                    "download failed with HTTP {}",
                    response.status()
                )));
            }
            response
                .bytes()
                .await
                .map(|bytes| bytes.to_vec())
                .map_err(std::io::Error::other)
        }
    })
    .await
}

async fn save_generated_media_assets_with_downloader<F, Fut>(
    result: &Value,
    media_job_path: &Path,
    downloader: F,
) -> Result<Value, std::io::Error>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<u8>, std::io::Error>>,
{
    let mut next = result.clone();
    let Some(batch) = next.get_mut("batch").and_then(Value::as_object_mut) else {
        return Ok(next);
    };
    let batch_id = batch
        .get("batch_id")
        .and_then(Value::as_str)
        .unwrap_or("media_batch_unknown")
        .to_string();
    let kind = batch
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("media")
        .to_string();
    let Some(workspace_root) = media_job_path
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
    else {
        return Ok(next);
    };
    let batch_dir = workspace_root
        .join("media")
        .join("generated")
        .join(sanitize_path_component(&batch_id));
    tokio::fs::create_dir_all(&batch_dir).await?;

    let mut item_updates = Vec::new();
    if let Some(assets) = batch.get_mut("assets").and_then(Value::as_array_mut) {
        for asset in assets.iter_mut() {
            let Some(asset_object) = asset.as_object_mut() else {
                continue;
            };
            let Some(url) = asset_object
                .get("url")
                .and_then(Value::as_str)
                .map(str::to_string)
            else {
                continue;
            };
            let item_index = asset_object
                .get("item_index")
                .and_then(Value::as_u64)
                .unwrap_or(1);
            let asset_kind = asset_object
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or(&kind)
                .to_string();
            match downloader(url.clone()).await.and_then(|bytes| {
                downloaded_media_extension(&asset_kind, &url, &bytes)
                    .map(|extension| (bytes, extension))
                    .ok_or_else(|| {
                        std::io::Error::other(format!(
                            "downloaded content is not valid {} media",
                            asset_kind
                        ))
                    })
            }) {
                Ok((bytes, extension)) => {
                    let file_name = format!("{}-{:03}.{}", asset_kind, item_index, extension);
                    let local_path = batch_dir.join(file_name);
                    tokio::fs::write(&local_path, bytes).await?;
                    let local_path_string = local_path.to_string_lossy().to_string();
                    asset_object.insert("local_path".to_string(), json!(local_path_string));
                    asset_object.insert("save_status".to_string(), json!("saved"));
                    item_updates.push((
                        item_index,
                        local_path.to_string_lossy().to_string(),
                        "saved".to_string(),
                        None,
                    ));
                }
                Err(error) => {
                    let message = error.to_string();
                    asset_object.insert("save_status".to_string(), json!("failed"));
                    asset_object.insert("save_error".to_string(), json!(message.clone()));
                    item_updates.push((
                        item_index,
                        String::new(),
                        "failed".to_string(),
                        Some(message),
                    ));
                }
            }
        }
    }

    if let Some(items) = batch.get_mut("items").and_then(Value::as_array_mut) {
        for item in items {
            let Some(item_object) = item.as_object_mut() else {
                continue;
            };
            let item_index = item_object
                .get("item_index")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            if let Some((_, local_path, save_status, save_error)) = item_updates
                .iter()
                .find(|(index, _, _, _)| *index == item_index)
            {
                item_object.insert("save_status".to_string(), json!(save_status));
                if !local_path.is_empty() {
                    item_object.insert("local_path".to_string(), json!(local_path));
                }
                if let Some(error) = save_error {
                    item_object.insert("save_error".to_string(), json!(error));
                }
            }
        }
    }

    batch.insert(
        "asset_root".to_string(),
        json!(batch_dir.to_string_lossy().to_string()),
    );
    let manifest_path = batch_dir.join("manifest.json");
    tokio::fs::write(
        manifest_path,
        serde_json::to_vec_pretty(&next).map_err(std::io::Error::other)?,
    )
    .await?;
    Ok(next)
}

fn sanitize_path_component(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect();
    let trimmed = sanitized.trim_matches(['.', ' ', '-']);
    if trimmed.is_empty() {
        "media-batch".to_string()
    } else {
        trimmed.chars().take(96).collect()
    }
}

fn extension_for_media_url(kind: &str, url: &str) -> &'static str {
    if let Ok(parsed) = reqwest::Url::parse(url) {
        if let Some(ext) = Path::new(parsed.path())
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
        {
            return match ext.as_str() {
                "png" => "png",
                "jpg" | "jpeg" => "jpg",
                "webp" => "webp",
                "gif" => "gif",
                "mp4" => "mp4",
                "webm" => "webm",
                "mp3" => "mp3",
                "wav" => "wav",
                "m4a" => "m4a",
                _ => default_extension_for_kind(kind),
            };
        }
    }
    default_extension_for_kind(kind)
}

fn default_extension_for_kind(kind: &str) -> &'static str {
    match kind {
        "video" => "mp4",
        "audio" => "mp3",
        "image" | "upload" | "upload_image" => "png",
        _ => "bin",
    }
}

fn media_bytes_match_extension(extension: &str, bytes: &[u8]) -> bool {
    match extension {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        "jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        "gif" => bytes.starts_with(b"GIF8"),
        "mp4" | "m4a" => bytes.len() >= 8 && &bytes[4..8] == b"ftyp",
        "webm" => bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]),
        "mp3" => {
            bytes.starts_with(b"ID3")
                || (bytes.len() >= 2 && bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0)
        }
        "wav" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE",
        _ => false,
    }
}

fn sniff_downloaded_media_extension(kind: &str, bytes: &[u8]) -> Option<&'static str> {
    let candidates: &[&str] = match kind {
        "image" | "upload" | "upload_image" => &["png", "jpg", "webp", "gif"],
        "video" => &["mp4", "webm"],
        "audio" => &["mp3", "wav", "m4a"],
        _ => &[],
    };
    candidates
        .iter()
        .copied()
        .find(|extension| media_bytes_match_extension(extension, bytes))
}

fn downloaded_media_extension(kind: &str, url: &str, bytes: &[u8]) -> Option<&'static str> {
    let extension = extension_for_media_url(kind, url);
    if media_bytes_match_extension(extension, bytes) {
        return Some(extension);
    }
    sniff_downloaded_media_extension(kind, bytes)
}

#[cfg(test)]
fn is_valid_downloaded_media_bytes(kind: &str, url: &str, bytes: &[u8]) -> bool {
    downloaded_media_extension(kind, url, bytes).is_some()
}

fn build_media_items(
    kind: &str,
    task_items: &[Value],
    pending_task_ids: &[String],
    prompt: Option<&str>,
    model: Option<&str>,
) -> Vec<Value> {
    let mut items = Vec::new();
    for (index, task) in task_items.iter().enumerate() {
        let status = task
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let task_id = task
            .get("task_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let result_url = first_url(task);
        let error = task.get("error").cloned();
        let mut item = json!({
            "item_index": index + 1,
            "kind": kind,
            "role": default_media_role(kind),
            "prompt": prompt.unwrap_or_default(),
            "model": model.unwrap_or_default(),
            "task_id": task_id,
            "status": status,
            "completed_at": Utc::now().to_rfc3339(),
        });
        if let Some(url) = result_url {
            item["result_url"] = json!(url);
        }
        if let Some(error) = error {
            item["error"] = error;
        }
        items.push(item);
    }
    let offset = items.len();
    for (index, task_id) in pending_task_ids.iter().enumerate() {
        items.push(json!({
            "item_index": offset + index + 1,
            "kind": kind,
            "role": default_media_role(kind),
            "prompt": prompt.unwrap_or_default(),
            "model": model.unwrap_or_default(),
            "task_id": task_id,
            "status": "timeout",
        }));
    }
    items
}

fn first_url(value: &Value) -> Option<String> {
    let mut urls = Vec::new();
    collect_urls(value, &mut urls);
    urls.into_iter().next()
}

fn default_media_role(kind: &str) -> &'static str {
    match kind {
        "image" => "asset",
        "video" => "clip",
        "audio" => "speech",
        "upload_image" | "upload" => "upload",
        _ => "unknown",
    }
}

fn extract_media_assets(kind: &str, task_items: &[Value]) -> Vec<Value> {
    let mut assets = Vec::new();
    for (index, task) in task_items.iter().enumerate() {
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
                "item_index": index + 1,
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
    let kind = batch.get("kind").and_then(Value::as_str).unwrap_or("media");
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
            "Batch: {}; Kind: {kind}; status: {status}; completed: {completed_count}/{total_count}; failed: {failed_count}.",
            batch
                .get("batch_id")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
        ),
    ];
    if !urls.is_empty() {
        lines.push("Assets:".to_string());
        lines.extend(
            urls.into_iter()
                .enumerate()
                .map(|(index, url)| format!("- Item {}: {url}", index + 1)),
        );
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
        attach_short_drama_media_result, build_media_batch_result,
        build_media_batch_result_with_id, build_media_polling_result, classify_apimart_error,
        classify_apimart_error_message, extract_media_task_ids, is_valid_downloaded_media_bytes,
        load_media_batch, media_batch_context_text, media_job_store_path, media_task_status,
        persist_media_batch, sanitize_path_component, save_generated_media_assets_with_downloader,
        MEDIA_JOB_INITIAL_POLL_DELAY, MEDIA_JOB_POLL_INTERVAL,
    };
    use serde_json::json;
    use std::path::PathBuf;

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
                "task_root".to_string(),
                "task_a".to_string(),
                "task_b".to_string(),
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

        assert_eq!(
            extract_media_task_ids(&response),
            vec!["task_data".to_string()]
        );
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
        assert!(result["batch"]["batch_id"].as_str().is_some());
        assert_eq!(result["batch"]["total_count"], 2);
        assert_eq!(result["batch"]["completed_count"], 1);
        assert_eq!(result["batch"]["failed_count"], 1);
        assert_eq!(result["batch"]["items"][0]["item_index"], 1);
        assert_eq!(result["batch"]["items"][0]["task_id"], "task-a");
        assert_eq!(
            result["batch"]["items"][0]["result_url"],
            "https://cdn.example/a.png"
        );
        assert_eq!(result["batch"]["items"][1]["item_index"], 2);
        assert_eq!(result["batch"]["items"][1]["status"], "failed");
        assert_eq!(
            result["batch"]["assets"][0]["url"],
            "https://cdn.example/a.png"
        );
    }

    #[test]
    fn builds_polling_result_with_delay_and_placeholder_metadata() {
        let task_ids = vec!["task-a".to_string(), "task-b".to_string()];
        let result = build_media_polling_result(
            "image",
            "media_batch_test",
            &task_ids,
            Some("portrait"),
            Some("gpt-image-2"),
            Some(2),
            Some("9:16"),
            Some("9 / 16"),
        );

        assert_eq!(
            result["initial_delay_seconds"],
            MEDIA_JOB_INITIAL_POLL_DELAY.as_secs()
        );
        assert_eq!(
            result["poll_interval_seconds"],
            MEDIA_JOB_POLL_INTERVAL.as_secs()
        );
        assert_eq!(result["batch"]["requested_count"], 2);
        assert_eq!(result["batch"]["requested_aspect_ratio"], "9:16");
        assert_eq!(result["batch"]["placeholder_aspect_ratio"], "9 / 16");
        assert_eq!(result["batch"]["pending_count"], 2);
        assert_eq!(result["batch"]["items"][0]["prompt"], "portrait");
    }

    #[test]
    fn batch_result_keeps_item_order_independent_from_task_id_sorting() {
        let result = build_media_batch_result(
            "image",
            json!([
                {
                    "task_id": "task-z",
                    "status": "completed",
                    "response": {
                        "data": [{ "url": "https://cdn.example/z.png" }]
                    }
                },
                {
                    "task_id": "task-a",
                    "status": "completed",
                    "response": {
                        "data": [{ "url": "https://cdn.example/a.png" }]
                    }
                }
            ]),
            vec![],
        );

        assert_eq!(result["batch"]["items"][0]["item_index"], 1);
        assert_eq!(result["batch"]["items"][0]["task_id"], "task-z");
        assert_eq!(result["batch"]["items"][1]["item_index"], 2);
        assert_eq!(result["batch"]["items"][1]["task_id"], "task-a");
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
        assert!(text.contains("Batch: media_batch_"));
        assert!(text.contains("Item 1: https://cdn.example/clip.mp4"));
        assert!(text.contains("https://cdn.example/clip.mp4"));
    }

    #[tokio::test]
    async fn persists_and_loads_media_batch_state_under_workspace() {
        let root = std::env::temp_dir().join(format!(
            "void-media-job-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let path =
            media_job_store_path(Some(root.as_path()), "media_batch_test").expect("store path");
        let result = build_media_batch_result_with_id(
            "image",
            "media_batch_test",
            json!([{
                "task_id": "task-a",
                "status": "completed",
                "response": {
                    "data": [{ "url": "https://cdn.example/a.png" }]
                }
            }]),
            vec![],
        );

        persist_media_batch(&path, &result)
            .await
            .expect("persist batch");
        let loaded = load_media_batch(&path).await.expect("load batch");

        assert_eq!(loaded["batch"]["items"][0]["item_index"], 1);
        assert_eq!(
            loaded["batch"]["items"][0]["result_url"],
            "https://cdn.example/a.png"
        );
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn saves_generated_assets_and_writes_manifest_under_workspace() {
        let root = std::env::temp_dir().join(format!(
            "void-media-generated-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let path =
            media_job_store_path(Some(root.as_path()), "media_batch_test").expect("store path");
        let result = build_media_batch_result_with_id(
            "image",
            "media_batch_test",
            json!([{
                "task_id": "task-a",
                "status": "completed",
                "response": {
                    "data": [{ "url": "https://cdn.example/a.png" }]
                }
            }]),
            vec![],
        );

        let saved = save_generated_media_assets_with_downloader(&result, &path, |url| async move {
            assert_eq!(url, "https://cdn.example/a.png");
            Ok(vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
        })
        .await
        .expect("save generated asset");

        let local_path = saved["batch"]["assets"][0]["local_path"]
            .as_str()
            .expect("local path");
        assert!(PathBuf::from(local_path).ends_with(
            PathBuf::from("media")
                .join("generated")
                .join("media_batch_test")
                .join("image-001.png")
        ));
        assert_eq!(saved["batch"]["assets"][0]["save_status"], "saved");
        assert_eq!(saved["batch"]["items"][0]["local_path"], local_path);
        assert_eq!(saved["batch"]["items"][0]["save_status"], "saved");

        let bytes = tokio::fs::read(local_path).await.expect("saved bytes");
        assert_eq!(bytes, vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
        let manifest = root
            .join("media")
            .join("generated")
            .join("media_batch_test")
            .join("manifest.json");
        assert!(manifest.exists());
        let manifest_value: serde_json::Value =
            serde_json::from_slice(&tokio::fs::read(manifest).await.expect("manifest bytes"))
                .expect("manifest json");
        assert_eq!(manifest_value["batch"]["batch_id"], "media_batch_test");
        assert_eq!(
            manifest_value["batch"]["assets"][0]["url"],
            "https://cdn.example/a.png"
        );
        assert_eq!(
            manifest_value["batch"]["assets"][0]["local_path"],
            local_path
        );
        assert_eq!(manifest_value["batch"]["assets"][0]["save_status"], "saved");
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn attaches_short_drama_metadata_to_saved_media_batch() {
        let root = std::env::temp_dir().join(format!(
            "void-media-short-drama-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let path = media_job_store_path(Some(root.as_path()), "media_batch_short_drama")
            .expect("store path");
        let result = build_media_batch_result_with_id(
            "image",
            "media_batch_short_drama",
            json!([{
                "task_id": "task-a",
                "status": "completed",
                "response": {
                    "data": [{ "url": "https://cdn.example/asset.png" }]
                }
            }]),
            vec![],
        );

        let mut saved =
            save_generated_media_assets_with_downloader(&result, &path, |_url| async move {
                Ok(vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
            })
            .await
            .expect("save generated asset");

        attach_short_drama_media_result(
            &mut saved,
            "image",
            Some(&json!({
                "projectId": "short-drama-project",
                "stage": "assets",
                "artifactHandle": "CHAR-001",
                "outputMediaLabel": "林晚角色图"
            })),
        );

        assert_eq!(saved["shortDrama"]["artifactHandle"], "CHAR-001");
        assert_eq!(
            saved["shortDrama"]["outputMediaItemId"],
            "media_batch_short_drama-1"
        );
        assert_eq!(saved["shortDrama"]["outputMediaKind"], "image");
        assert_eq!(
            saved["shortDrama"]["outputPreviewUrl"],
            "https://cdn.example/asset.png"
        );
        assert!(saved["shortDrama"]["outputMediaPath"]
            .as_str()
            .is_some_and(|path| path.ends_with("image-001.png")));
        assert!(saved["shortDrama"]["outputMediaRelativePath"]
            .as_str()
            .is_some_and(
                |path| path.ends_with("media/generated/media_batch_short_drama/image-001.png")
            ));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[test]
    fn generated_asset_batch_paths_are_sanitized() {
        assert_eq!(
            sanitize_path_component("media:batch/test?"),
            "media-batch-test"
        );
        assert_eq!(sanitize_path_component("..."), "media-batch");
    }

    #[test]
    fn validates_downloaded_media_bytes_by_signature() {
        assert!(is_valid_downloaded_media_bytes(
            "image",
            "https://cdn.example/a.png",
            &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
        ));
        assert!(is_valid_downloaded_media_bytes(
            "video",
            "https://cdn.example/a.mp4",
            &[0, 0, 0, 24, b'f', b't', b'y', b'p'],
        ));
        assert!(!is_valid_downloaded_media_bytes(
            "image",
            "https://cdn.example/a.png",
            b"<html>not an image</html>",
        ));
    }

    #[tokio::test]
    async fn keeps_remote_url_and_records_error_when_generated_asset_save_fails() {
        let root = std::env::temp_dir().join(format!(
            "void-media-generated-failed-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let path =
            media_job_store_path(Some(root.as_path()), "media_batch_test").expect("store path");
        let result = build_media_batch_result(
            "image",
            json!([{
                "task_id": "task-a",
                "status": "completed",
                "response": {
                    "data": [{ "url": "https://cdn.example/a.png" }]
                }
            }]),
            vec![],
        );

        let saved =
            save_generated_media_assets_with_downloader(&result, &path, |_url| async move {
                Err(std::io::Error::other("network down"))
            })
            .await
            .expect("save failure is captured in result");

        assert_eq!(
            saved["batch"]["assets"][0]["url"],
            "https://cdn.example/a.png"
        );
        assert_eq!(saved["batch"]["assets"][0]["save_status"], "failed");
        assert_eq!(saved["batch"]["assets"][0]["save_error"], "network down");
        assert!(saved["batch"]["assets"][0]["local_path"].is_null());
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn rejects_invalid_downloaded_asset_bytes_without_writing_fake_media() {
        let root = std::env::temp_dir().join(format!(
            "void-media-generated-invalid-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let path =
            media_job_store_path(Some(root.as_path()), "media_batch_test").expect("store path");
        let result = build_media_batch_result_with_id(
            "image",
            "media_batch_test",
            json!([{
                "task_id": "task-a",
                "status": "completed",
                "response": {
                    "data": [{ "url": "https://cdn.example/a.png" }]
                }
            }]),
            vec![],
        );

        let saved =
            save_generated_media_assets_with_downloader(&result, &path, |_url| async move {
                Ok(b"<html>not an image</html>".to_vec())
            })
            .await
            .expect("invalid asset is captured");

        assert_eq!(saved["batch"]["assets"][0]["save_status"], "failed");
        assert_eq!(
            saved["batch"]["assets"][0]["save_error"],
            "downloaded content is not valid image media"
        );
        assert!(saved["batch"]["assets"][0]["local_path"].is_null());
        assert!(!root
            .join("media")
            .join("generated")
            .join("media_batch_test")
            .join("image-001.png")
            .exists());
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn saves_valid_image_bytes_when_provider_url_has_no_extension() {
        let root = std::env::temp_dir().join(format!(
            "void-media-generated-sniff-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let path =
            media_job_store_path(Some(root.as_path()), "media_batch_test").expect("store path");
        let result = build_media_batch_result_with_id(
            "image",
            "media_batch_test",
            json!([{
                "task_id": "task-a",
                "status": "completed",
                "response": {
                    "data": [{ "url": "https://cdn.example/download?id=asset" }]
                }
            }]),
            vec![],
        );

        let saved =
            save_generated_media_assets_with_downloader(&result, &path, |_url| async move {
                Ok(vec![0xff, 0xd8, 0xff, 0xe0, 0x00])
            })
            .await
            .expect("save sniffed image asset");

        let local_path = saved["batch"]["assets"][0]["local_path"]
            .as_str()
            .expect("local path");
        assert!(PathBuf::from(local_path).ends_with(
            PathBuf::from("media")
                .join("generated")
                .join("media_batch_test")
                .join("image-001.jpg")
        ));
        assert_eq!(saved["batch"]["assets"][0]["save_status"], "saved");
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[test]
    fn media_job_store_path_is_workspace_scoped() {
        let path = media_job_store_path(Some(PathBuf::from("C:/repo").as_path()), "batch-1")
            .expect("store path");

        assert!(path.ends_with(".void/media-jobs/batch-1.json"));
    }
}
