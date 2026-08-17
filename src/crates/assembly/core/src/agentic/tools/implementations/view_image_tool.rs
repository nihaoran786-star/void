use crate::agentic::image_analysis::{detect_mime_type_from_bytes, optimize_image_with_size_limit};
use crate::agentic::tools::framework::{
    Tool, ToolExposure, ToolRenderOptions, ToolResult, ToolUseContext, ValidationResult,
};
use crate::agentic::tools::restrictions::{
    is_local_path_within_root, is_remote_posix_path_within_root,
};
use crate::agentic::tools::tool_context_runtime::{
    ToolResultImageAttachmentCapability, ToolResultImageAttachmentUnsupportedReason,
};
use crate::util::errors::VoidResult;
use crate::util::types::ToolImageAttachment;
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const VIEW_IMAGE_MAX_BYTES: usize = 5 * 1024 * 1024;

pub const VIEW_IMAGE_OUTPUT_STATUSES: &[&str] = &[
    "completed",
    "unsupported_model",
    "unsupported_provider",
    "missing_workspace",
    "path_denied",
    "invalid_image",
];

pub struct ViewImageTool;

impl ViewImageTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ViewImageTool {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
struct ViewImageRequest {
    logical_path: String,
    original_size_bytes: usize,
    original_mime_type: String,
    provider: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct ViewImageStatus {
    status: &'static str,
    source: &'static str,
    error: String,
}

impl ViewImageStatus {
    fn unsupported_model(error: impl Into<String>) -> Self {
        Self {
            status: "unsupported_model",
            source: "primary_model_supports_image_understanding",
            error: error.into(),
        }
    }

    fn unsupported_provider(error: impl Into<String>) -> Self {
        Self {
            status: "unsupported_provider",
            source: "primary_model_provider",
            error: error.into(),
        }
    }

    fn missing_workspace(error: impl Into<String>) -> Self {
        Self {
            status: "missing_workspace",
            source: "image_path",
            error: error.into(),
        }
    }

    fn path_denied(error: impl Into<String>) -> Self {
        Self {
            status: "path_denied",
            source: "image_path",
            error: error.into(),
        }
    }

    fn invalid_image(error: impl Into<String>) -> Self {
        Self {
            status: "invalid_image",
            source: "image_path",
            error: error.into(),
        }
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

fn primary_provider(context: &ToolUseContext) -> String {
    context
        .custom_data
        .get("primary_model_provider")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase()
}

fn status_result(status: ViewImageStatus) -> Vec<ToolResult> {
    vec![ToolResult::ok(
        json!({
            "status": status.status,
            "source": status.source,
            "error": status.error,
            "allowed_statuses": VIEW_IMAGE_OUTPUT_STATUSES,
        }),
        Some(format!("ViewImage {}: {}", status.status, status.error)),
    )]
}

fn unsupported_capability_result(
    capability: ToolResultImageAttachmentCapability,
) -> Option<Vec<ToolResult>> {
    match capability {
        ToolResultImageAttachmentCapability::Supported { .. } => None,
        ToolResultImageAttachmentCapability::Unsupported {
            reason: ToolResultImageAttachmentUnsupportedReason::PrimaryModelDoesNotAcceptImages,
            ..
        } => Some(status_result(ViewImageStatus::unsupported_model(
            "The primary model does not accept image tool results.",
        ))),
        ToolResultImageAttachmentCapability::Unsupported {
            reason: ToolResultImageAttachmentUnsupportedReason::UnsupportedProvider { provider },
            ..
        } => Some(status_result(ViewImageStatus::unsupported_provider(
            format!(
                "Tool-result image attachments are not supported for primary provider: {}",
                if provider.is_empty() {
                    "<missing>"
                } else {
                    provider.as_str()
                }
            ),
        ))),
    }
}

async fn resolve_view_image_request(
    input: &Value,
    context: &ToolUseContext,
) -> Result<ViewImageRequest, ViewImageStatus> {
    let image_path = optional_text(input, "image_path").ok_or_else(|| {
        ViewImageStatus::invalid_image("image_path is required to view an image.")
    })?;
    let workspace = context.workspace_root().ok_or_else(|| {
        ViewImageStatus::missing_workspace("workspace is required to view image_path references")
    })?;
    let resolved = context
        .resolve_tool_path(image_path)
        .map_err(|error| ViewImageStatus::path_denied(error.to_string()))?;

    if resolved.uses_remote_workspace_backend() {
        let root = workspace.to_string_lossy();
        if !is_remote_posix_path_within_root(&resolved.resolved_path, &root) {
            return Err(ViewImageStatus::path_denied(format!(
                "image path resolves outside the current workspace: {}",
                resolved.logical_path
            )));
        }
    } else if !is_local_path_within_root(Path::new(&resolved.resolved_path), workspace)
        .map_err(|error| ViewImageStatus::path_denied(error.to_string()))?
    {
        return Err(ViewImageStatus::path_denied(format!(
            "image path resolves outside the current workspace: {}",
            resolved.logical_path
        )));
    }

    let logical_path = workspace_relative_logical_path(
        context,
        workspace,
        &resolved.resolved_path,
        &resolved.logical_path,
    );
    let bytes = read_resolved_image_bytes(context, &resolved.resolved_path, &logical_path).await?;
    let original_mime_type = detect_mime_type_from_bytes(&bytes, None)
        .map_err(|error| ViewImageStatus::invalid_image(error.to_string()))?;
    let original_size_bytes = bytes.len();

    Ok(ViewImageRequest {
        logical_path,
        original_size_bytes,
        original_mime_type,
        provider: primary_provider(context),
        bytes,
    })
}

fn workspace_relative_logical_path(
    context: &ToolUseContext,
    workspace: &Path,
    resolved_path: &str,
    fallback: &str,
) -> String {
    if context.is_remote() {
        let root = workspace.to_string_lossy().replace('\\', "/");
        let resolved = resolved_path.replace('\\', "/");
        if let Some(relative) = resolved.strip_prefix(root.trim_end_matches('/')) {
            return relative.trim_start_matches('/').to_string();
        }
    } else if let Ok(relative) = Path::new(resolved_path).strip_prefix(workspace) {
        return relative.to_string_lossy().replace('\\', "/");
    }

    fallback.replace('\\', "/")
}

async fn read_resolved_image_bytes(
    context: &ToolUseContext,
    resolved_path: &str,
    logical_path: &str,
) -> Result<Vec<u8>, ViewImageStatus> {
    if context.is_remote() {
        let fs = context.ws_fs().ok_or_else(|| {
            ViewImageStatus::missing_workspace(
                "workspace filesystem services are required to read remote image paths",
            )
        })?;
        let is_file = fs.is_file(resolved_path).await.map_err(|_| {
            ViewImageStatus::invalid_image(format!("failed to inspect image path: {logical_path}"))
        })?;
        if !is_file {
            return Err(ViewImageStatus::invalid_image(format!(
                "image path is not a file: {logical_path}"
            )));
        }
        return fs.read_file(resolved_path).await.map_err(|_| {
            ViewImageStatus::invalid_image(format!("failed to read image path: {logical_path}"))
        });
    }

    let path = PathBuf::from(resolved_path);
    let metadata = tokio::fs::metadata(&path).await.map_err(|_| {
        ViewImageStatus::invalid_image(format!("failed to inspect image path: {logical_path}"))
    })?;
    if !metadata.is_file() {
        return Err(ViewImageStatus::invalid_image(format!(
            "image path is not a file: {logical_path}"
        )));
    }
    tokio::fs::read(&path).await.map_err(|_| {
        ViewImageStatus::invalid_image(format!("failed to read image path: {logical_path}"))
    })
}

fn completed_result(request: ViewImageRequest) -> Result<Vec<ToolResult>, ViewImageStatus> {
    let processed = optimize_image_with_size_limit(
        request.bytes,
        &request.provider,
        Some(&request.original_mime_type),
        Some(VIEW_IMAGE_MAX_BYTES),
    )
    .map_err(|error| ViewImageStatus::invalid_image(format!("unable to prepare image: {error}")))?;
    let optimized_size_bytes = processed.data.len();
    let attachment = ToolImageAttachment {
        mime_type: processed.mime_type.clone(),
        data_base64: BASE64.encode(&processed.data),
    };

    Ok(vec![ToolResult::ok_with_images(
        json!({
            "status": "completed",
            "source": "image_path",
            "error": Value::Null,
            "path": request.logical_path,
            "mime_type": processed.mime_type,
            "width": processed.width,
            "height": processed.height,
            "size_bytes": request.original_size_bytes,
            "optimized_size_bytes": optimized_size_bytes,
        }),
        Some("Image attached to the tool result.".to_string()),
        vec![attachment],
    )])
}

#[async_trait]
impl Tool for ViewImageTool {
    fn name(&self) -> &str {
        "ViewImage"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok(r#"View a workspace image file by returning it as a readonly image attachment.

Provide `image_path` as a workspace-relative path. The tool enforces the current workspace boundary, detects image metadata, optimizes the image for tool-result delivery, and returns explicit status/source/error metadata. It does not analyze the image and does not call an AI model."#
            .to_string())
    }

    fn short_description(&self) -> String {
        "Attach a workspace image to the tool result.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "image_path": {
                    "type": "string",
                    "description": "Workspace-relative path to an image file."
                }
            },
            "required": ["image_path"],
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
        if optional_text(input, "image_path").is_none() {
            return invalid_input("image_path is required to view an image.");
        }
        valid_input()
    }

    fn render_tool_use_message(&self, input: &Value, _options: &ToolRenderOptions) -> String {
        optional_text(input, "image_path")
            .map(|path| format!("View image file: {path}"))
            .unwrap_or_else(|| "View image".to_string())
    }

    fn render_tool_result_message(&self, output: &Value) -> String {
        match output.get("status").and_then(Value::as_str) {
            Some("completed") => output
                .get("path")
                .and_then(Value::as_str)
                .map(|path| format!("Image attached: {path}"))
                .unwrap_or_else(|| "Image attached.".to_string()),
            Some(status) => output
                .get("error")
                .and_then(Value::as_str)
                .map(|error| format!("ViewImage {status}: {error}"))
                .unwrap_or_else(|| format!("ViewImage {status}.")),
            None => "ViewImage result.".to_string(),
        }
    }

    fn render_result_for_assistant(&self, output: &Value) -> String {
        match output.get("status").and_then(Value::as_str) {
            Some("completed") => "Image attached to the tool result.".to_string(),
            _ => output
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("ViewImage result.")
                .to_string(),
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        if let Some(result) =
            unsupported_capability_result(context.tool_result_image_attachment_capability())
        {
            return Ok(result);
        }

        let request = match resolve_view_image_request(input, context).await {
            Ok(request) => request,
            Err(status) => return Ok(status_result(status)),
        };

        Ok(match completed_result(request) {
            Ok(result) => result,
            Err(status) => status_result(status),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{ViewImageTool, VIEW_IMAGE_OUTPUT_STATUSES};
    use crate::agentic::tools::framework::{Tool, ToolExposure, ToolResult, ToolUseContext};
    use crate::agentic::tools::ToolRuntimeRestrictions;
    use crate::agentic::workspace::{
        WorkspaceCommandOptions, WorkspaceCommandResult, WorkspaceDirEntry, WorkspaceFileSystem,
        WorkspaceServices, WorkspaceShell,
    };
    use crate::agentic::WorkspaceBinding;
    use crate::service::remote_ssh::workspace_state::workspace_session_identity;
    use async_trait::async_trait;
    use image::codecs::png::PngEncoder;
    use image::{ColorType, ImageEncoder};
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Arc;

    fn test_context() -> ToolUseContext {
        let mut custom_data = HashMap::new();
        custom_data.insert("primary_model_provider".to_string(), json!("openai"));
        custom_data.insert(
            "primary_model_supports_image_understanding".to_string(),
            json!(true),
        );

        ToolUseContext {
            tool_call_id: None,
            agent_type: Some("default".to_string()),
            session_id: Some("session".to_string()),
            dialog_turn_id: Some("turn".to_string()),
            workspace: None,
            unlocked_collapsed_tools: Vec::new(),
            custom_data,
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

    fn test_context_with_remote_workspace() -> ToolUseContext {
        let identity =
            workspace_session_identity("/remote/project", Some("conn-1"), Some("remote-host"))
                .expect("remote identity");
        ToolUseContext {
            workspace: Some(WorkspaceBinding::new_remote(
                Some("remote-workspace".to_string()),
                PathBuf::from("/remote/project"),
                "conn-1".to_string(),
                "Remote".to_string(),
                identity,
            )),
            workspace_services: Some(WorkspaceServices {
                fs: Arc::new(FakeRemoteFs),
                shell: Arc::new(FakeShell),
            }),
            ..test_context()
        }
    }

    fn temp_workspace() -> PathBuf {
        let root = std::env::temp_dir().join(format!("void-view-image-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create temp workspace");
        root
    }

    fn tiny_png_bytes() -> Vec<u8> {
        let mut bytes = Vec::new();
        PngEncoder::new(&mut bytes)
            .write_image(&[255, 0, 0, 255], 1, 1, ColorType::Rgba8.into())
            .expect("encode png fixture");
        bytes
    }

    struct FakeRemoteFs;

    #[async_trait]
    impl WorkspaceFileSystem for FakeRemoteFs {
        async fn read_file(&self, path: &str) -> anyhow::Result<Vec<u8>> {
            if path == "/remote/project/assets/frame.png" {
                return Ok(tiny_png_bytes());
            }
            anyhow::bail!("not found: {}", path)
        }

        async fn read_file_text(&self, _path: &str) -> anyhow::Result<String> {
            anyhow::bail!("not used")
        }

        async fn write_file(&self, _path: &str, _contents: &[u8]) -> anyhow::Result<()> {
            anyhow::bail!("not used")
        }

        async fn exists(&self, path: &str) -> anyhow::Result<bool> {
            Ok(path == "/remote/project/assets/frame.png")
        }

        async fn is_file(&self, path: &str) -> anyhow::Result<bool> {
            Ok(path == "/remote/project/assets/frame.png")
        }

        async fn is_dir(&self, _path: &str) -> anyhow::Result<bool> {
            Ok(false)
        }

        async fn read_dir(&self, _path: &str) -> anyhow::Result<Vec<WorkspaceDirEntry>> {
            Ok(Vec::new())
        }
    }

    struct FakeShell;

    #[async_trait]
    impl WorkspaceShell for FakeShell {
        async fn exec_with_options(
            &self,
            _command: &str,
            _options: WorkspaceCommandOptions,
        ) -> anyhow::Result<WorkspaceCommandResult> {
            anyhow::bail!("not used")
        }
    }

    #[test]
    fn view_image_schema_exposes_readonly_image_path_contract() {
        let tool = ViewImageTool::new();
        let schema = tool.input_schema();

        assert_eq!(tool.name(), "ViewImage");
        assert!(tool.is_readonly());
        assert!(tool.is_concurrency_safe(None));
        assert!(!tool.needs_permissions(None));
        assert_eq!(tool.default_exposure(), ToolExposure::Collapsed);
        assert_eq!(schema["required"], json!(["image_path"]));

        for status in [
            "completed",
            "unsupported_model",
            "unsupported_provider",
            "missing_workspace",
            "path_denied",
            "invalid_image",
        ] {
            assert!(VIEW_IMAGE_OUTPUT_STATUSES.contains(&status));
        }
    }

    #[tokio::test]
    async fn view_image_validation_requires_image_path() {
        let tool = ViewImageTool::new();

        assert!(!tool.validate_input(&json!({}), None).await.result);
        assert!(
            tool.validate_input(&json!({ "image_path": "assets/frame.png" }), None)
                .await
                .result
        );
    }

    #[tokio::test]
    async fn view_image_returns_tool_result_image_attachment_with_metadata() {
        let workspace = temp_workspace();
        let asset_dir = workspace.join("assets");
        std::fs::create_dir_all(&asset_dir).expect("create assets dir");
        std::fs::write(asset_dir.join("frame.png"), tiny_png_bytes()).expect("write png");

        let tool = ViewImageTool::new();
        let results = tool
            .call_impl(
                &json!({ "image_path": "assets/frame.png" }),
                &test_context_with_workspace(workspace.clone()),
            )
            .await
            .expect("view image result");

        let ToolResult::Result {
            data,
            image_attachments,
            result_for_assistant,
        } = &results[0]
        else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "completed");
        assert_eq!(data["source"], "image_path");
        assert!(data["error"].is_null());
        assert_eq!(data["path"], "assets/frame.png");
        assert_eq!(data["mime_type"], "image/png");
        assert_eq!(data["width"], 1);
        assert_eq!(data["height"], 1);
        assert!(data["size_bytes"].as_u64().unwrap_or_default() > 0);
        assert!(data["optimized_size_bytes"].as_u64().unwrap_or_default() > 0);
        let attachments = image_attachments.as_ref().expect("image attachment");
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0].mime_type, "image/png");
        assert!(!attachments[0].data_base64.is_empty());
        assert!(result_for_assistant
            .as_deref()
            .unwrap_or_default()
            .contains("Image attached"));

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn view_image_reads_remote_workspace_image_through_workspace_services() {
        let results = ViewImageTool::new()
            .call_impl(
                &json!({ "image_path": "assets/frame.png" }),
                &test_context_with_remote_workspace(),
            )
            .await
            .expect("remote image result");

        let ToolResult::Result {
            data,
            image_attachments,
            ..
        } = &results[0]
        else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "completed");
        assert_eq!(data["path"], "assets/frame.png");
        assert_eq!(data["mime_type"], "image/png");
        assert!(image_attachments
            .as_ref()
            .is_some_and(|items| items.len() == 1));
    }

    #[tokio::test]
    async fn view_image_rejects_unsupported_provider_before_path_read() {
        let mut context = test_context();
        context
            .custom_data
            .insert("primary_model_provider".to_string(), json!("gemini"));

        let results = ViewImageTool::new()
            .call_impl(&json!({ "image_path": "missing.png" }), &context)
            .await
            .expect("unsupported provider should be structured");

        let ToolResult::Result {
            data,
            image_attachments,
            ..
        } = &results[0]
        else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "unsupported_provider");
        assert_eq!(data["source"], "primary_model_provider");
        assert_eq!(image_attachments, &None);
    }

    #[tokio::test]
    async fn view_image_rejects_primary_model_without_image_support() {
        let mut context = test_context();
        context.custom_data.insert(
            "primary_model_supports_image_understanding".to_string(),
            json!(false),
        );

        let results = ViewImageTool::new()
            .call_impl(&json!({ "image_path": "missing.png" }), &context)
            .await
            .expect("unsupported model should be structured");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "unsupported_model");
        assert_eq!(data["source"], "primary_model_supports_image_understanding");
    }

    #[tokio::test]
    async fn view_image_requires_workspace_for_image_path() {
        let results = ViewImageTool::new()
            .call_impl(
                &json!({ "image_path": "assets/frame.png" }),
                &test_context(),
            )
            .await
            .expect("missing workspace should be structured");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "missing_workspace");
        assert_eq!(data["allowed_statuses"], json!(VIEW_IMAGE_OUTPUT_STATUSES));
    }

    #[tokio::test]
    async fn view_image_denies_local_image_path_outside_workspace() {
        let workspace = temp_workspace();
        let outside = std::env::temp_dir().join(format!(
            "void-view-image-outside-{}.png",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&outside, tiny_png_bytes()).expect("write outside file");

        let results = ViewImageTool::new()
            .call_impl(
                &json!({ "image_path": outside.to_string_lossy() }),
                &test_context_with_workspace(workspace.clone()),
            )
            .await
            .expect("path denial should be structured");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "path_denied");

        let _ = std::fs::remove_file(outside);
        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn view_image_non_file_error_does_not_expose_local_absolute_path() {
        let workspace = temp_workspace();
        std::fs::create_dir_all(workspace.join("assets")).expect("create dir");

        let results = ViewImageTool::new()
            .call_impl(
                &json!({ "image_path": "assets" }),
                &test_context_with_workspace(workspace.clone()),
            )
            .await
            .expect("directory should be structured invalid image");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };
        let error = data["error"].as_str().unwrap_or_default();

        assert_eq!(data["status"], "invalid_image");
        assert!(error.contains("assets"));
        assert!(!error.contains(&workspace.to_string_lossy().to_string()));

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn view_image_remote_non_file_error_does_not_expose_remote_root() {
        let results = ViewImageTool::new()
            .call_impl(
                &json!({ "image_path": "assets/missing.png" }),
                &test_context_with_remote_workspace(),
            )
            .await
            .expect("remote missing file should be structured invalid image");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };
        let error = data["error"].as_str().unwrap_or_default();

        assert_eq!(data["status"], "invalid_image");
        assert!(error.contains("assets/missing.png"));
        assert!(!error.contains("/remote/project"));
    }

    #[tokio::test]
    async fn view_image_rejects_non_image_payload() {
        let workspace = temp_workspace();
        std::fs::write(workspace.join("note.txt"), b"not an image").expect("write text");

        let results = ViewImageTool::new()
            .call_impl(
                &json!({ "image_path": "note.txt" }),
                &test_context_with_workspace(workspace.clone()),
            )
            .await
            .expect("invalid image should be structured");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected regular tool result");
        };

        assert_eq!(data["status"], "invalid_image");

        let _ = std::fs::remove_dir_all(workspace);
    }
}
