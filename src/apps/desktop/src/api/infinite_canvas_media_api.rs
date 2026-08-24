//! Infinite Canvas direct media generation API (2026-08-24 owner decision).
//!
//! The canvas generate / regenerate / five-tool buttons no longer send task
//! messages into a session for the AI to relay — they submit straight into
//! the existing APIMart media pipeline through this command. No AI (and no
//! session context) is involved: submit → background polling → a completion
//! event on the `infinite-canvas://media-job-event` channel, which the front
//! end forwards onto the same `agent:tool-run-event` bus the
//! InfiniteCanvasMediaBridge already listens to. The session tool path
//! (GenerateImage / GenerateVideo with an `infinite_canvas` binding) stays
//! untouched for "user asks the AI in chat" flows.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use void_core::agentic::media::apimart::ApimartClient;
use void_core::agentic::media::jobs::MediaJobCompletionSink;
use void_core::agentic::tools::implementations::media_tools::{
    submit_image_generation_job, submit_video_generation_job, upload_media_image_for_public_url,
    MediaGenerationSubmission,
};
use void_core::util::errors::VoidError;

/// Tauri event channel carrying finished direct-path media batches. The
/// payload mirrors the `agent:tool-run-event` observer shape (`eventType`,
/// `toolName`, `result`), so the front end forwards it verbatim.
pub const INFINITE_CANVAS_MEDIA_JOB_EVENT: &str = "infinite-canvas://media-job-event";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitInfiniteCanvasMediaJobRequest {
    /// Canvas workspace ID; must match the binding's `workspaceId`.
    pub workspace_id: String,
    /// Absolute local workspace root; media jobs and assets live under it.
    pub workspace_path: String,
    /// 'image' | 'video'.
    pub kind: String,
    #[serde(default)]
    pub model: Option<String>,
    pub prompt: String,
    /// Already-public reference URLs (http(s) / data:image), in order.
    #[serde(default)]
    pub image_urls: Vec<String>,
    /// Workspace-relative reference image paths, in the authoritative order
    /// (edit target first, then references in connection order). Uploaded
    /// through the UploadMediaImage kernel to obtain public URLs.
    #[serde(default)]
    pub local_reference_paths: Vec<String>,
    #[serde(default)]
    pub n: Option<u8>,
    #[serde(default)]
    pub size: Option<String>,
    /// The §3.2 binding object; passed through verbatim so completed media
    /// flows back to the right canvas card.
    pub infinite_canvas: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitInfiniteCanvasMediaJobError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitInfiniteCanvasMediaJobResponse {
    /// 'submitted' | 'error'.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    /// The full submission receipt / typed error payload (same shape the
    /// GenerateImage tool result carries, including the `infiniteCanvas`
    /// echo) so the front end can hand it to the media bridge unchanged.
    pub receipt: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SubmitInfiniteCanvasMediaJobError>,
}

fn error_response(
    code: &str,
    message: impl Into<String>,
    receipt: Value,
) -> SubmitInfiniteCanvasMediaJobResponse {
    SubmitInfiniteCanvasMediaJobResponse {
        status: "error".to_string(),
        batch_id: None,
        receipt,
        error: Some(SubmitInfiniteCanvasMediaJobError {
            code: code.to_string(),
            message: message.into(),
        }),
    }
}

fn invalid_input(message: impl Into<String>) -> SubmitInfiniteCanvasMediaJobResponse {
    error_response("invalid_input", message, Value::Null)
}

/// Pure request validation: the command only spends the owner-configured
/// media quota for a well-formed, workspace-bound canvas click. The binding
/// `workspaceId` must match the request; local reference paths must stay
/// inside the workspace (relative, no `..` escapes, no absolute paths).
fn validate_request(
    request: &SubmitInfiniteCanvasMediaJobRequest,
) -> Result<(), SubmitInfiniteCanvasMediaJobResponse> {
    if request.kind != "image" && request.kind != "video" {
        return Err(invalid_input(format!(
            "kind must be 'image' or 'video', got '{}'",
            request.kind
        )));
    }
    if request.prompt.trim().is_empty() {
        return Err(invalid_input("prompt is required"));
    }
    if !std::path::Path::new(&request.workspace_path).is_absolute() {
        return Err(invalid_input("workspacePath must be an absolute local path"));
    }
    let Some(binding) = request.infinite_canvas.as_object() else {
        return Err(invalid_input("infiniteCanvas binding must be an object"));
    };
    let binding_workspace_id = binding
        .get("workspaceId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if binding_workspace_id != request.workspace_id {
        return Err(invalid_input(
            "infiniteCanvas.workspaceId does not match the requesting workspace",
        ));
    }
    for required in ["documentId", "nodeId", "operationId"] {
        if binding
            .get(required)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(invalid_input(format!(
                "infiniteCanvas.{required} is required"
            )));
        }
    }
    for path in &request.local_reference_paths {
        let candidate = std::path::Path::new(path);
        if candidate.is_absolute()
            || path.starts_with('/')
            || path.starts_with('\\')
            || path.contains(':')
            || candidate
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return Err(invalid_input(format!(
                "localReferencePaths entries must be workspace-relative without '..': {path}"
            )));
        }
    }
    Ok(())
}

fn completion_sink(
    app: AppHandle,
    tool_name: &'static str,
    operation_id: String,
) -> MediaJobCompletionSink {
    MediaJobCompletionSink::Handler(Box::new(move |result| {
        let payload = json!({
            "sessionId": "",
            "eventType": "Completed",
            "toolId": format!("infinite-canvas-direct:{operation_id}"),
            "toolName": tool_name,
            "result": result,
        });
        if let Err(error) = app.emit(INFINITE_CANVAS_MEDIA_JOB_EVENT, payload) {
            log::warn!(
                "Failed to emit infinite canvas media job completion: operation_id={} error={}",
                operation_id,
                error
            );
        }
    }))
}

fn submission_response(submission: MediaGenerationSubmission) -> SubmitInfiniteCanvasMediaJobResponse {
    let data = submission.data;
    let status = data.get("status").and_then(Value::as_str).unwrap_or("");
    match status {
        "polling" => SubmitInfiniteCanvasMediaJobResponse {
            status: "submitted".to_string(),
            batch_id: data
                .get("batch_id")
                .and_then(Value::as_str)
                .map(str::to_string),
            receipt: data,
            error: None,
        },
        "error" => {
            let code = data
                .pointer("/error/code")
                .and_then(Value::as_str)
                .unwrap_or("backend")
                .to_string();
            let message = data
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Media generation submission failed.")
                .to_string();
            error_response(&code, message, data)
        }
        // 'submitted_but_task_id_missing' and anything else unknowable: no
        // polling will run, so the card must fail typed instead of spinning.
        _ => error_response(
            "task_id_missing",
            "APIMart did not return a task id for background polling.",
            data,
        ),
    }
}

/// Direct media generation for the infinite canvas (no AI in the loop).
#[tauri::command]
pub async fn submit_infinite_canvas_media_job(
    app: AppHandle,
    request: SubmitInfiniteCanvasMediaJobRequest,
) -> Result<SubmitInfiniteCanvasMediaJobResponse, String> {
    if let Err(response) = validate_request(&request) {
        return Ok(response);
    }
    let workspace_root = std::path::PathBuf::from(&request.workspace_path);
    if !workspace_root.is_dir() {
        return Ok(invalid_input(
            "workspacePath does not exist on this machine",
        ));
    }

    let tool_name: &'static str = if request.kind == "video" {
        "GenerateVideo"
    } else {
        "GenerateImage"
    };
    let operation_id = request
        .infinite_canvas
        .get("operationId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    // Uploads happen before submission (same as the session template's
    // "UploadMediaImage first" rule); the client is fetched once for both.
    let client = match ApimartClient::from_config().await {
        Ok(client) => client,
        Err(VoidError::Configuration(message)) if message == "media_provider_not_configured" => {
            return Ok(error_response(
                "provider_not_configured",
                "APIMart media token is not configured in Settings > Providers.",
                Value::Null,
            ));
        }
        Err(error) => return Err(error.to_string()),
    };

    let mut image_urls = request.image_urls.clone();
    for path in &request.local_reference_paths {
        match upload_media_image_for_public_url(&client, Some(&workspace_root), path).await {
            Ok(url) => image_urls.push(url),
            Err(error) => {
                return Ok(error_response(
                    "upload_failed",
                    format!("Failed to upload reference image '{path}': {error}"),
                    Value::Null,
                ));
            }
        }
    }

    let input = json!({
        "prompt": request.prompt,
        "model": request.model,
        "size": request.size,
        "n": request.n,
        "image_urls": image_urls,
        "infinite_canvas": request.infinite_canvas,
    });
    let sink = Some(completion_sink(app, tool_name, operation_id));
    let submitted = if request.kind == "video" {
        submit_video_generation_job(&input, Some(&workspace_root), sink, tool_name).await
    } else {
        submit_image_generation_job(&input, Some(&workspace_root), sink, tool_name).await
    };
    match submitted {
        Ok(submission) => Ok(submission_response(submission)),
        Err(VoidError::Validation(message)) => Ok(invalid_input(message)),
        Err(error) => Ok(error_response("backend", error.to_string(), Value::Null)),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        submission_response, validate_request, SubmitInfiniteCanvasMediaJobRequest,
    };
    use serde_json::{json, Value};
    use void_core::agentic::tools::implementations::media_tools::MediaGenerationSubmission;

    fn sample_request() -> SubmitInfiniteCanvasMediaJobRequest {
        SubmitInfiniteCanvasMediaJobRequest {
            workspace_id: "workspace-1".to_string(),
            workspace_path: if cfg!(windows) {
                "C:\\workspace".to_string()
            } else {
                "/workspace".to_string()
            },
            kind: "image".to_string(),
            model: None,
            prompt: "a red fox".to_string(),
            image_urls: vec![],
            local_reference_paths: vec!["media/generated/batch/image-001.png".to_string()],
            n: Some(1),
            size: None,
            infinite_canvas: json!({
                "workspaceId": "workspace-1",
                "documentId": "doc-1",
                "nodeId": "node-1",
                "resultMode": "self",
                "toolId": "generate",
                "operationId": "op-1"
            }),
        }
    }

    #[test]
    fn accepts_a_well_formed_request() {
        assert!(validate_request(&sample_request()).is_ok());
    }

    #[test]
    fn rejects_binding_workspace_mismatch() {
        let mut request = sample_request();
        request.workspace_id = "workspace-other".to_string();
        let response = validate_request(&request).expect_err("must reject");
        assert_eq!(response.status, "error");
        assert_eq!(response.error.expect("typed error").code, "invalid_input");
    }

    #[test]
    fn rejects_unknown_kind_and_empty_prompt() {
        let mut request = sample_request();
        request.kind = "audio".to_string();
        assert!(validate_request(&request).is_err());

        let mut request = sample_request();
        request.prompt = "  ".to_string();
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn rejects_reference_paths_escaping_the_workspace() {
        for path in ["../secret.png", "C:\\outside\\a.png", "/etc/passwd"] {
            let mut request = sample_request();
            request.local_reference_paths = vec![path.to_string()];
            assert!(
                validate_request(&request).is_err(),
                "path must be rejected: {path}"
            );
        }
    }

    #[test]
    fn rejects_missing_binding_anchors() {
        let mut request = sample_request();
        request.infinite_canvas = json!({ "workspaceId": "workspace-1" });
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn maps_polling_receipt_to_submitted_response() {
        let response = submission_response(MediaGenerationSubmission {
            data: json!({ "status": "polling", "batch_id": "media_batch_1" }),
            assistant_text: String::new(),
        });
        assert_eq!(response.status, "submitted");
        assert_eq!(response.batch_id.as_deref(), Some("media_batch_1"));
        assert!(response.error.is_none());
    }

    #[test]
    fn maps_typed_error_receipt_to_typed_response() {
        let response = submission_response(MediaGenerationSubmission {
            data: json!({
                "status": "error",
                "error": { "code": "provider_not_configured", "message": "no token" }
            }),
            assistant_text: String::new(),
        });
        assert_eq!(response.status, "error");
        let error = response.error.expect("typed error");
        assert_eq!(error.code, "provider_not_configured");
        assert_eq!(error.message, "no token");
    }

    #[test]
    fn maps_missing_task_id_receipt_to_typed_failure() {
        let response = submission_response(MediaGenerationSubmission {
            data: json!({ "status": "submitted_but_task_id_missing" }),
            assistant_text: String::new(),
        });
        assert_eq!(response.status, "error");
        assert_eq!(
            response.error.expect("typed error").code,
            "task_id_missing"
        );
        assert_ne!(response.receipt, Value::Null);
    }
}
