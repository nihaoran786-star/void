use crate::agentic::image_analysis::{
    build_multimodal_message, decode_data_url, detect_mime_type_from_bytes,
    optimize_image_with_size_limit, resolve_vision_model_from_global_config,
};
use crate::agentic::tools::framework::{
    Tool, ToolExposure, ToolRenderOptions, ToolResult, ToolUseContext, ValidationResult,
};
use crate::agentic::tools::image_context::find_image_context_by_reference;
use crate::agentic::tools::restrictions::{
    is_local_path_within_root, is_remote_posix_path_within_root,
};
use crate::infrastructure::ai::get_global_ai_client_factory;
use crate::util::errors::VoidResult;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const IMAGE_ANALYSIS_MAX_BYTES: usize = 1024 * 1024;

pub const ANALYZE_IMAGE_OUTPUT_STATUSES: &[&str] = &[
    "completed",
    "unsupported_model",
    "provider_not_configured",
    "missing_workspace",
    "permission_denied",
    "path_denied",
    "invalid_image",
    "error",
];

pub struct AnalyzeImageTool {
    runtime: Arc<dyn AnalyzeImageRuntime>,
}

impl AnalyzeImageTool {
    pub fn new() -> Self {
        Self {
            runtime: Arc::new(DefaultAnalyzeImageRuntime),
        }
    }

    #[cfg(test)]
    fn new_with_runtime_for_tests(runtime: Arc<dyn AnalyzeImageRuntime>) -> Self {
        Self { runtime }
    }
}

impl Default for AnalyzeImageTool {
    fn default() -> Self {
        Self::new()
    }
}

fn optional_text<'a>(input: &'a Value, key: &str) -> Option<&'a str> {
    input
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn invalid_input(message: impl Into<String>) -> ValidationResult {
    ValidationResult {
        result: false,
        message: Some(message.into()),
        error_code: Some(400),
        meta: None,
    }
}

fn valid_input() -> ValidationResult {
    ValidationResult {
        result: true,
        message: None,
        error_code: None,
        meta: None,
    }
}

fn selected_image_source(input: &Value) -> Option<(&'static str, String)> {
    ["image_id", "image_path", "data_url"]
        .into_iter()
        .find_map(|key| optional_text(input, key).map(|value| (key, value.to_string())))
}

#[derive(Debug, Clone)]
struct AnalyzeImageRequest {
    source: &'static str,
    display_path: String,
    bytes: Vec<u8>,
    mime_type: String,
    prompt: String,
}

#[derive(Debug, Clone)]
struct AnalyzeImageSuccess {
    model_id: String,
    model_name: String,
    mime_type: String,
    width: u32,
    height: u32,
    summary: String,
    analysis: String,
}

#[async_trait]
trait AnalyzeImageRuntime: Send + Sync {
    async fn analyze(
        &self,
        request: AnalyzeImageRequest,
    ) -> Result<AnalyzeImageSuccess, AnalyzeImageStatus>;
}

#[derive(Debug, Clone)]
struct DefaultAnalyzeImageRuntime;

#[async_trait]
impl AnalyzeImageRuntime for DefaultAnalyzeImageRuntime {
    async fn analyze(
        &self,
        request: AnalyzeImageRequest,
    ) -> Result<AnalyzeImageSuccess, AnalyzeImageStatus> {
        let vision_model = resolve_vision_model_from_global_config()
            .await
            .map_err(classify_vision_model_error)?;

        let processed = optimize_image_with_size_limit(
            request.bytes,
            &vision_model.provider,
            Some(&request.mime_type),
            Some(IMAGE_ANALYSIS_MAX_BYTES),
        )
        .map_err(|error| {
            AnalyzeImageStatus::invalid_image(format!("unable to prepare image: {error}"))
        })?;

        let messages = build_multimodal_message(
            &request.prompt,
            &processed.data,
            &processed.mime_type,
            &vision_model.provider,
        )
        .map_err(|error| {
            AnalyzeImageStatus::error(format!("unable to build image request: {error}"))
        })?;

        let client = get_global_ai_client_factory()
            .await
            .map_err(|error| {
                AnalyzeImageStatus::provider_not_configured(format!(
                    "AI client factory unavailable: {error}"
                ))
            })?
            .get_client_by_id(&vision_model.id)
            .await
            .map_err(|error| {
                AnalyzeImageStatus::provider_not_configured(format!(
                    "Failed to create image understanding model client: {error}"
                ))
            })?;

        let response = client.send_message(messages, None).await.map_err(|error| {
            AnalyzeImageStatus::error(format!("Image analysis failed: {error}"))
        })?;
        let analysis = response.text.trim().to_string();
        let summary = first_non_empty_line(&analysis, "Image analysis completed", 180);

        Ok(AnalyzeImageSuccess {
            model_id: vision_model.id,
            model_name: vision_model.model_name,
            mime_type: processed.mime_type,
            width: processed.width,
            height: processed.height,
            summary,
            analysis,
        })
    }
}

#[derive(Debug, Clone)]
struct AnalyzeImageStatus {
    status: &'static str,
    error: String,
}

impl AnalyzeImageStatus {
    fn provider_not_configured(error: impl Into<String>) -> Self {
        Self {
            status: "provider_not_configured",
            error: error.into(),
        }
    }

    fn missing_workspace(error: impl Into<String>) -> Self {
        Self {
            status: "missing_workspace",
            error: error.into(),
        }
    }

    fn path_denied(error: impl Into<String>) -> Self {
        Self {
            status: "path_denied",
            error: error.into(),
        }
    }

    fn invalid_image(error: impl Into<String>) -> Self {
        Self {
            status: "invalid_image",
            error: error.into(),
        }
    }

    fn unsupported_model(error: impl Into<String>) -> Self {
        Self {
            status: "unsupported_model",
            error: error.into(),
        }
    }

    fn error(error: impl Into<String>) -> Self {
        Self {
            status: "error",
            error: error.into(),
        }
    }
}

fn classify_vision_model_error(error: crate::util::errors::VoidError) -> AnalyzeImageStatus {
    let message = error.to_string();
    if message.contains("does not support image understanding") {
        return AnalyzeImageStatus::unsupported_model(message);
    }
    if message.contains("not configured")
        || message.contains("Model not found")
        || message.contains("disabled")
        || message.contains("Failed to get AI config")
    {
        return AnalyzeImageStatus::provider_not_configured(message);
    }
    AnalyzeImageStatus::error(message)
}

fn prompt_from_input(input: &Value) -> String {
    optional_text(input, "prompt")
        .unwrap_or("Analyze this image in detail. Describe visible content, text, layout, and any details relevant to the user's task.")
        .to_string()
}

fn first_non_empty_line(text: &str, fallback: &str, max_chars: usize) -> String {
    text.lines()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or(fallback)
        .chars()
        .take(max_chars)
        .collect()
}

fn status_result(status: AnalyzeImageStatus) -> Vec<ToolResult> {
    vec![ToolResult::ok(
        json!({
            "status": status.status,
            "error": status.error,
            "allowed_statuses": ANALYZE_IMAGE_OUTPUT_STATUSES,
        }),
        Some(format!(
            "Image analysis {}: {}",
            status.status, status.error
        )),
    )]
}

fn completed_result(
    request: &AnalyzeImageRequest,
    success: AnalyzeImageSuccess,
) -> Vec<ToolResult> {
    vec![ToolResult::ok(
        json!({
            "status": "completed",
            "source": request.source,
            "path": request.display_path,
            "model_id": success.model_id,
            "model_name": success.model_name,
            "mime_type": success.mime_type,
            "width": success.width,
            "height": success.height,
            "summary": success.summary,
            "analysis": success.analysis,
        }),
        Some(format!(
            "Image analysis for {}:\n{}",
            request.display_path, success.analysis
        )),
    )]
}

async fn resolve_analyze_image_request(
    input: &Value,
    context: &ToolUseContext,
) -> Result<AnalyzeImageRequest, AnalyzeImageStatus> {
    let prompt = prompt_from_input(input);
    match selected_image_source(input) {
        Some(("data_url", data_url)) => {
            let (bytes, mime_type) = decode_data_url(&data_url)
                .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;
            let mime_type = detect_mime_type_from_bytes(&bytes, mime_type.as_deref())
                .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;
            Ok(AnalyzeImageRequest {
                source: "data_url",
                display_path: "inline data_url".to_string(),
                bytes,
                mime_type,
                prompt,
            })
        }
        Some(("image_id", image_id)) => {
            let image = find_image_context_by_reference(&image_id).ok_or_else(|| {
                AnalyzeImageStatus::invalid_image(format!("image_id not found: {image_id}"))
            })?;
            if let Some(data_url) = image.data_url {
                let (bytes, mime_type) = decode_data_url(&data_url)
                    .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;
                let mime_type = detect_mime_type_from_bytes(&bytes, mime_type.as_deref())
                    .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;
                return Ok(AnalyzeImageRequest {
                    source: "image_id",
                    display_path: image.image_name,
                    bytes,
                    mime_type,
                    prompt,
                });
            }
            let Some(image_path) = image.image_path else {
                return Err(AnalyzeImageStatus::invalid_image(format!(
                    "image_id has no image data or path: {image_id}"
                )));
            };
            resolve_image_path_source("image_id", &image_path, prompt, context).await
        }
        Some(("image_path", image_path)) => {
            resolve_image_path_source("image_path", &image_path, prompt, context).await
        }
        _ => Err(AnalyzeImageStatus::invalid_image(
            "Exactly one of image_id, image_path, or data_url is required.",
        )),
    }
}

async fn resolve_image_path_source(
    source: &'static str,
    image_path: &str,
    prompt: String,
    context: &ToolUseContext,
) -> Result<AnalyzeImageRequest, AnalyzeImageStatus> {
    let workspace = context.workspace_root().ok_or_else(|| {
        AnalyzeImageStatus::missing_workspace(
            "workspace is required to analyze image_path references",
        )
    })?;
    let resolved = context
        .resolve_tool_path(image_path)
        .map_err(|error| AnalyzeImageStatus::path_denied(error.to_string()))?;

    if resolved.uses_remote_workspace_backend() {
        let root = workspace.to_string_lossy();
        if !is_remote_posix_path_within_root(&resolved.resolved_path, &root) {
            return Err(AnalyzeImageStatus::path_denied(format!(
                "image path resolves outside the current workspace: {}",
                resolved.logical_path
            )));
        }
    } else if !is_local_path_within_root(Path::new(&resolved.resolved_path), workspace)
        .map_err(|error| AnalyzeImageStatus::path_denied(error.to_string()))?
    {
        return Err(AnalyzeImageStatus::path_denied(format!(
            "image path resolves outside the current workspace: {}",
            resolved.logical_path
        )));
    }

    let bytes = read_resolved_image_bytes(context, &resolved.resolved_path).await?;
    let mime_type = detect_mime_type_from_bytes(&bytes, None)
        .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;

    Ok(AnalyzeImageRequest {
        source,
        display_path: resolved.logical_path,
        bytes,
        mime_type,
        prompt,
    })
}

async fn read_resolved_image_bytes(
    context: &ToolUseContext,
    resolved_path: &str,
) -> Result<Vec<u8>, AnalyzeImageStatus> {
    if context.is_remote() {
        let fs = context.ws_fs().ok_or_else(|| {
            AnalyzeImageStatus::missing_workspace(
                "workspace filesystem services are required to read remote image paths",
            )
        })?;
        let is_file = fs
            .is_file(resolved_path)
            .await
            .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;
        if !is_file {
            return Err(AnalyzeImageStatus::invalid_image(format!(
                "image path is not a file: {resolved_path}"
            )));
        }
        return fs
            .read_file(resolved_path)
            .await
            .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()));
    }

    let path = PathBuf::from(resolved_path);
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))?;
    if !metadata.is_file() {
        return Err(AnalyzeImageStatus::invalid_image(format!(
            "image path is not a file: {}",
            path.display()
        )));
    }
    tokio::fs::read(&path)
        .await
        .map_err(|error| AnalyzeImageStatus::invalid_image(error.to_string()))
}

#[async_trait]
impl Tool for AnalyzeImageTool {
    fn name(&self) -> &str {
        "AnalyzeImage"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok(r#"Analyze a workspace image or attached image reference with an image-understanding model.

Provide exactly one image source:
- image_id: an image attachment identifier already present in chat context.
- image_path: a workspace-relative image path. Workspace context remains authoritative.
- data_url: an inline data:image/* URL.

The tool is read-only, but runtime execution must still enforce workspace path policy and provider capability/configuration checks. This schema is registered before provider execution is enabled."#
            .to_string())
    }

    fn short_description(&self) -> String {
        "Analyze an attached or workspace image.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "image_id": {
                    "type": "string",
                    "description": "Image attachment identifier already present in chat context."
                },
                "image_path": {
                    "type": "string",
                    "description": "Workspace-relative path to an image file. ToolUseContext workspace policy is authoritative."
                },
                "data_url": {
                    "type": "string",
                    "description": "Inline data:image/* URL."
                },
                "prompt": {
                    "type": "string",
                    "description": "Question or instruction for image analysis."
                },
                "detail": {
                    "type": "string",
                    "enum": ["summary", "detailed"],
                    "default": "detailed",
                    "description": "Requested analysis depth."
                },
                "workspacePath": {
                    "type": "string",
                    "description": "Compatibility field only. ToolUseContext workspace is authoritative."
                }
            },
            "oneOf": [
                { "required": ["image_id"] },
                { "required": ["image_path"] },
                { "required": ["data_url"] }
            ],
            "additionalProperties": false
        })
    }

    fn is_readonly(&self) -> bool {
        true
    }

    fn is_concurrency_safe(&self, _input: Option<&Value>) -> bool {
        true
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        false
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        let source_count = ["image_id", "image_path", "data_url"]
            .into_iter()
            .filter(|key| optional_text(input, key).is_some())
            .count();

        if source_count == 0 {
            return invalid_input("Exactly one of image_id, image_path, or data_url is required.");
        }
        if source_count > 1 {
            return invalid_input("Only one of image_id, image_path, or data_url may be provided.");
        }

        if let Some(detail) = optional_text(input, "detail") {
            if !matches!(detail, "summary" | "detailed") {
                return invalid_input("detail must be one of: \"summary\", \"detailed\".");
            }
        }

        if let Some(data_url) = optional_text(input, "data_url") {
            if !data_url.starts_with("data:image/") {
                return invalid_input("data_url must be an image data URL.");
            }
        }

        valid_input()
    }

    fn render_tool_use_message(&self, input: &Value, _options: &ToolRenderOptions) -> String {
        match selected_image_source(input) {
            Some(("image_id", value)) => format!("Analyze image attachment: {}", value),
            Some(("image_path", value)) => format!("Analyze image file: {}", value),
            Some(("data_url", _)) => "Analyze inline image data".to_string(),
            _ => "Analyze image".to_string(),
        }
    }

    fn render_tool_result_message(&self, output: &Value) -> String {
        match output.get("status").and_then(Value::as_str) {
            Some("completed") => output
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("Image analysis completed.")
                .to_string(),
            Some(status) => output
                .get("error")
                .and_then(Value::as_str)
                .map(|error| format!("Image analysis {status}: {error}"))
                .unwrap_or_else(|| format!("Image analysis {status}.")),
            None => "Image analysis result.".to_string(),
        }
    }

    fn render_result_for_assistant(&self, output: &Value) -> String {
        output
            .get("analysis")
            .or_else(|| output.get("summary"))
            .or_else(|| output.get("error"))
            .and_then(Value::as_str)
            .unwrap_or("Image analysis result.")
            .to_string()
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let request = match resolve_analyze_image_request(input, context).await {
            Ok(request) => request,
            Err(status) => return Ok(status_result(status)),
        };

        Ok(match self.runtime.analyze(request.clone()).await {
            Ok(success) => completed_result(&request, success),
            Err(status) => status_result(status),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{AnalyzeImageTool, ANALYZE_IMAGE_OUTPUT_STATUSES};
    use crate::agentic::tools::framework::{Tool, ToolExposure, ToolResult, ToolUseContext};
    use crate::agentic::tools::image_context::{
        remove_image_context, store_image_context, ImageContextData,
    };
    use crate::agentic::tools::ToolRuntimeRestrictions;
    use crate::agentic::WorkspaceBinding;
    use crate::util::errors::VoidError;
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn test_context() -> ToolUseContext {
        ToolUseContext {
            tool_call_id: None,
            agent_type: Some("default".to_string()),
            session_id: Some("session".to_string()),
            dialog_turn_id: Some("turn".to_string()),
            workspace: None,
            unlocked_collapsed_tools: Vec::new(),
            custom_data: HashMap::new(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services: None,
        }
    }

    fn test_context_with_workspace(root: PathBuf) -> ToolUseContext {
        ToolUseContext {
            workspace: Some(WorkspaceBinding::new(None, root)),
            ..test_context()
        }
    }

    fn temp_workspace() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("void-analyze-image-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create temp workspace");
        root
    }

    fn tiny_png_data_url() -> &'static str {
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    }

    #[test]
    fn analyze_image_schema_exposes_explicit_sources_and_status_contract() {
        let tool = AnalyzeImageTool::new();
        let schema = tool.input_schema();

        assert_eq!(tool.name(), "AnalyzeImage");
        assert!(tool.is_readonly());
        assert!(tool.is_concurrency_safe(None));
        assert!(!tool.needs_permissions(None));
        assert_eq!(tool.default_exposure(), ToolExposure::Collapsed);
        assert!(schema
            .get("oneOf")
            .and_then(|value| value.as_array())
            .is_some());
        assert!(schema["properties"].get("image_id").is_some());
        assert!(schema["properties"].get("image_path").is_some());
        assert!(schema["properties"].get("data_url").is_some());
        assert_eq!(
            schema["properties"]["detail"]["enum"],
            json!(["summary", "detailed"])
        );

        for status in [
            "completed",
            "unsupported_model",
            "provider_not_configured",
            "missing_workspace",
            "permission_denied",
            "path_denied",
            "invalid_image",
            "error",
        ] {
            assert!(ANALYZE_IMAGE_OUTPUT_STATUSES.contains(&status));
        }
    }

    #[tokio::test]
    async fn analyze_image_validation_requires_exactly_one_source() {
        let tool = AnalyzeImageTool::new();

        assert!(!tool.validate_input(&json!({}), None).await.result);
        assert!(
            !tool
                .validate_input(
                    &json!({
                        "image_id": "img-1",
                        "image_path": "assets/frame.png"
                    }),
                    None,
                )
                .await
                .result
        );
        assert!(
            tool.validate_input(&json!({ "image_id": "img-1" }), None)
                .await
                .result
        );
    }

    #[tokio::test]
    async fn analyze_image_validation_rejects_non_image_data_url_and_bad_detail() {
        let tool = AnalyzeImageTool::new();

        assert!(
            !tool
                .validate_input(&json!({ "data_url": "data:text/plain;base64,abc" }), None)
                .await
                .result
        );
        assert!(
            !tool
                .validate_input(
                    &json!({
                        "image_id": "img-1",
                        "detail": "verbose"
                    }),
                    None,
                )
                .await
                .result
        );
    }

    #[tokio::test]
    async fn analyze_image_runtime_reports_missing_image_id_as_invalid_image() {
        let tool = AnalyzeImageTool::new();
        let results = tool
            .call_impl(&json!({ "image_id": "img-1" }), &test_context())
            .await
            .expect("missing image id should be a structured result");

        let ToolResult::Result {
            data,
            result_for_assistant,
            ..
        } = &results[0]
        else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "invalid_image");
        assert_eq!(
            data["allowed_statuses"],
            json!(ANALYZE_IMAGE_OUTPUT_STATUSES)
        );
        assert!(result_for_assistant
            .as_deref()
            .unwrap_or_default()
            .contains("image_id not found"));
    }

    #[tokio::test]
    async fn analyze_image_runtime_rejects_invalid_data_url_before_provider() {
        let tool = AnalyzeImageTool::new();
        let results = tool
            .call_impl(
                &json!({ "data_url": "data:image/png;base64,not-valid" }),
                &test_context(),
            )
            .await
            .expect("invalid image should be a structured tool result");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "invalid_image");
    }

    #[tokio::test]
    async fn analyze_image_runtime_requires_workspace_for_image_path() {
        let tool = AnalyzeImageTool::new();
        let results = tool
            .call_impl(
                &json!({ "image_path": "assets/frame.png" }),
                &test_context(),
            )
            .await
            .expect("missing workspace should be a structured tool result");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "missing_workspace");
    }

    #[tokio::test]
    async fn analyze_image_runtime_denies_local_image_path_outside_workspace() {
        let workspace = temp_workspace();
        let outside = std::env::temp_dir().join(format!(
            "void-analyze-image-outside-{}.png",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&outside, b"not a real image").expect("write outside file");

        let tool = AnalyzeImageTool::new();
        let results = tool
            .call_impl(
                &json!({ "image_path": outside.to_string_lossy() }),
                &test_context_with_workspace(workspace.clone()),
            )
            .await
            .expect("path denial should be a structured tool result");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "path_denied");

        let _ = std::fs::remove_file(outside);
        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn analyze_image_runtime_uses_injected_runtime_for_data_url_success() {
        let tool = AnalyzeImageTool::new_with_runtime_for_tests(std::sync::Arc::new(
            FakeAnalyzeImageRuntime::completed("test-model", "image/png", 1, 1),
        ));
        let results = tool
            .call_impl(
                &json!({
                    "data_url": tiny_png_data_url(),
                    "prompt": "What is visible?",
                    "detail": "summary"
                }),
                &test_context(),
            )
            .await
            .expect("successful injected runtime result");

        let ToolResult::Result {
            data,
            result_for_assistant,
            ..
        } = &results[0]
        else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "completed");
        assert_eq!(data["source"], "data_url");
        assert_eq!(data["model_id"], "test-model");
        assert_eq!(data["mime_type"], "image/png");
        assert!(result_for_assistant
            .as_deref()
            .unwrap_or_default()
            .contains("fake analysis"));
    }

    #[tokio::test]
    async fn analyze_image_runtime_resolves_image_id_context_data_url() {
        let image_id = format!("img-{}", uuid::Uuid::new_v4());
        store_image_context(ImageContextData {
            id: image_id.clone(),
            image_path: None,
            data_url: Some(tiny_png_data_url().to_string()),
            mime_type: "image/png".to_string(),
            image_name: "frame.png".to_string(),
            file_size: 68,
            width: Some(1),
            height: Some(1),
            source: "test".to_string(),
        });

        let tool = AnalyzeImageTool::new_with_runtime_for_tests(std::sync::Arc::new(
            FakeAnalyzeImageRuntime::completed("test-model", "image/png", 1, 1),
        ));
        let results = tool
            .call_impl(&json!({ "image_id": image_id }), &test_context())
            .await
            .expect("image_id context should resolve");

        remove_image_context(&image_id);

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "completed");
        assert_eq!(data["source"], "image_id");
        assert_eq!(data["path"], "frame.png");
    }

    #[test]
    fn analyze_image_classifies_vision_model_configuration_errors() {
        let provider_status = super::classify_vision_model_error(VoidError::service(
            "Image understanding model is not configured.",
        ));
        assert_eq!(provider_status.status, "provider_not_configured");

        let unsupported_status = super::classify_vision_model_error(VoidError::service(
            "Model does not support image understanding: text-only",
        ));
        assert_eq!(unsupported_status.status, "unsupported_model");
    }

    #[derive(Debug)]
    struct FakeAnalyzeImageRuntime {
        model_id: String,
        mime_type: String,
        width: u32,
        height: u32,
    }

    impl FakeAnalyzeImageRuntime {
        fn completed(model_id: &str, mime_type: &str, width: u32, height: u32) -> Self {
            Self {
                model_id: model_id.to_string(),
                mime_type: mime_type.to_string(),
                width,
                height,
            }
        }
    }

    #[async_trait::async_trait]
    impl super::AnalyzeImageRuntime for FakeAnalyzeImageRuntime {
        async fn analyze(
            &self,
            request: super::AnalyzeImageRequest,
        ) -> Result<super::AnalyzeImageSuccess, super::AnalyzeImageStatus> {
            assert!(!request.bytes.is_empty());
            assert_eq!(request.mime_type, self.mime_type);
            assert!(!request.prompt.trim().is_empty());
            Ok(super::AnalyzeImageSuccess {
                model_id: self.model_id.clone(),
                model_name: "Fake Vision".to_string(),
                mime_type: self.mime_type.clone(),
                width: self.width,
                height: self.height,
                summary: "fake summary".to_string(),
                analysis: "fake analysis".to_string(),
            })
        }
    }
}
