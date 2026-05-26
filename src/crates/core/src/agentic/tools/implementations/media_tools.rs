use crate::agentic::media::apimart::{
    provider_not_configured_result, resolve_workspace_path, ApimartClient,
};
use crate::agentic::media::capabilities::{
    validate_image_generation, validate_video_generation, ImageGenerationRequest,
    VideoGenerationRequest, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL,
};
use crate::agentic::media::jobs::{
    build_media_polling_result, classify_apimart_error_message, extract_media_task_ids,
    media_job_store_path, new_media_batch_id, start_media_job_polling, MediaJobHandle,
    MediaToolEventContext,
};
use crate::agentic::tools::framework::{
    Tool, ToolExposure, ToolResult, ToolUseContext, ValidationResult,
};
use crate::agentic::tools::image_context::find_image_context_by_reference;
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

fn ok_result(data: Value, assistant: impl Into<String>) -> Vec<ToolResult> {
    vec![ToolResult::Result {
        data,
        result_for_assistant: Some(assistant.into()),
        image_attachments: None,
    }]
}

fn validation_error(message: impl Into<String>) -> ValidationResult {
    ValidationResult {
        result: false,
        message: Some(message.into()),
        error_code: Some(400),
        meta: None,
    }
}

fn valid() -> ValidationResult {
    ValidationResult {
        result: true,
        message: None,
        error_code: None,
        meta: None,
    }
}

async fn client_or_not_configured(
    tool_name: &str,
) -> VoidResult<Result<ApimartClient, Vec<ToolResult>>> {
    match ApimartClient::from_config().await {
        Ok(client) => Ok(Ok(client)),
        Err(VoidError::Configuration(message)) if message == "media_provider_not_configured" => {
            Ok(Err(ok_result(
                provider_not_configured_result(tool_name),
                "APIMart media token is not configured.",
            )))
        }
        Err(error) => Err(error),
    }
}

fn string_array(input: &Value, key: &str) -> Vec<String> {
    input
        .get(key)
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .filter(|item| !item.trim().is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn optional_string(input: &Value, key: &str) -> Option<String> {
    input
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn optional_u8(input: &Value, key: &str) -> Option<u8> {
    input
        .get(key)
        .and_then(|value| value.as_u64())
        .and_then(|value| u8::try_from(value).ok())
}

fn prompt_required(input: &Value) -> Result<String, VoidError> {
    optional_string(input, "prompt").ok_or_else(|| VoidError::tool("prompt is required"))
}

fn strip_nulls(mut payload: Map<String, Value>) -> Value {
    payload.retain(|_, value| !value.is_null());
    Value::Object(payload)
}

fn is_apimart_image_reference(value: &str) -> bool {
    let value = value.trim();
    value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("data:image")
}

fn resolve_media_image_urls(image_urls: Vec<String>) -> Vec<String> {
    image_urls
        .into_iter()
        .map(|url| {
            if is_apimart_image_reference(&url) {
                return url;
            }

            find_image_context_by_reference(&url)
                .and_then(|image| image.data_url)
                .unwrap_or(url)
        })
        .collect()
}

#[cfg(test)]
mod media_image_reference_tests {
    use super::resolve_media_image_urls;
    use crate::agentic::tools::image_context::{store_image_context, ImageContextData};

    #[test]
    fn resolves_uploaded_image_name_to_data_url() {
        store_image_context(ImageContextData {
            id: "img-upload-1".to_string(),
            image_path: None,
            data_url: Some("data:image/jpeg;base64,abc123".to_string()),
            mime_type: "image/jpeg".to_string(),
            image_name: "微信图片_20250307192517.jpg".to_string(),
            file_size: 12,
            width: Some(64),
            height: Some(64),
            source: "file".to_string(),
        });

        let resolved = resolve_media_image_urls(vec![
            "微信图片_20250307192517.jpg".to_string(),
            "https://example.com/keep.png".to_string(),
        ]);

        assert_eq!(
            resolved,
            vec![
                "data:image/jpeg;base64,abc123".to_string(),
                "https://example.com/keep.png".to_string(),
            ]
        );
    }
}

pub struct GenerateImageTool;

impl GenerateImageTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for GenerateImageTool {
    fn name(&self) -> &str {
        "GenerateImage"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Submit an APIMart image generation job. Supports text-to-image and image-to-image; upload local images separately only when a provider requires public URLs.".to_string())
    }

    fn short_description(&self) -> String {
        "Submit an APIMart image generation job.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "prompt": { "type": "string" },
                "model": { "type": "string", "default": DEFAULT_IMAGE_MODEL },
                "image_urls": { "type": "array", "items": { "type": "string" } },
                "size": { "type": "string" },
                "resolution": { "type": "string" },
                "n": { "type": "integer", "minimum": 1, "maximum": 4 },
                "official_fallback": { "type": "boolean" },
                "google_search": { "type": "boolean" },
                "google_image_search": { "type": "boolean" }
            },
            "required": ["prompt"]
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if prompt_required(input).is_err() {
            return validation_error("prompt is required");
        }
        let request = ImageGenerationRequest {
            model: optional_string(input, "model"),
            size: optional_string(input, "size"),
            resolution: optional_string(input, "resolution"),
            image_urls: resolve_media_image_urls(string_array(input, "image_urls")),
            n: optional_u8(input, "n"),
            official_fallback: input
                .get("official_fallback")
                .and_then(|value| value.as_bool()),
            google_search: input.get("google_search").and_then(|value| value.as_bool()),
            google_image_search: input
                .get("google_image_search")
                .and_then(|value| value.as_bool()),
        };
        match validate_image_generation(&request) {
            Ok(_) => valid(),
            Err(error) => validation_error(format!("{error:?}")),
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let client = match client_or_not_configured(self.name()).await? {
            Ok(client) => client,
            Err(result) => return Ok(result),
        };
        let prompt = prompt_required(input)?;
        let request = ImageGenerationRequest {
            model: optional_string(input, "model"),
            size: optional_string(input, "size"),
            resolution: optional_string(input, "resolution"),
            image_urls: resolve_media_image_urls(string_array(input, "image_urls")),
            n: optional_u8(input, "n"),
            official_fallback: input
                .get("official_fallback")
                .and_then(|value| value.as_bool()),
            google_search: input.get("google_search").and_then(|value| value.as_bool()),
            google_image_search: input
                .get("google_image_search")
                .and_then(|value| value.as_bool()),
        };
        let resolved = validate_image_generation(&request)
            .map_err(|error| VoidError::validation(format!("{error:?}")))?;
        let payload = strip_nulls(Map::from_iter([
            ("model".to_string(), json!(resolved.model)),
            ("prompt".to_string(), json!(prompt)),
            ("image_urls".to_string(), json!(request.image_urls)),
            (
                "size".to_string(),
                request.size.map(Value::String).unwrap_or(Value::Null),
            ),
            (
                "resolution".to_string(),
                request.resolution.map(Value::String).unwrap_or(Value::Null),
            ),
            (
                "n".to_string(),
                request.n.map(|value| json!(value)).unwrap_or(Value::Null),
            ),
            (
                "official_fallback".to_string(),
                request
                    .official_fallback
                    .map(|value| json!(value))
                    .unwrap_or(Value::Null),
            ),
            (
                "google_search".to_string(),
                request
                    .google_search
                    .map(|value| json!(value))
                    .unwrap_or(Value::Null),
            ),
            (
                "google_image_search".to_string(),
                request
                    .google_image_search
                    .map(|value| json!(value))
                    .unwrap_or(Value::Null),
            ),
        ]));
        let response = match client.submit_image_generation(payload).await {
            Ok(response) => response,
            Err(VoidError::Http(message)) => {
                if let Some(error) = classify_apimart_error_message(&message) {
                    return Ok(ok_result(error, "APIMart image generation request failed."));
                }
                return Err(VoidError::Http(message));
            }
            Err(error) => return Err(error),
        };
        let task_ids = extract_media_task_ids(&response);
        let batch_id = new_media_batch_id();
        if task_ids.is_empty() {
            return Ok(ok_result(
                json!({
                    "status": "submitted_but_task_id_missing",
                    "source": "apimart",
                    "kind": "image",
                    "batch_id": batch_id,
                    "response": response
                }),
                "Image generation was submitted, but APIMart did not return a task id for background polling.",
            ));
        }
        start_media_job_polling(
            client,
            "image",
            MediaJobHandle {
                batch_id: batch_id.clone(),
                task_ids: task_ids.clone(),
                prompt: Some(prompt.clone()),
                model: Some(resolved.model.clone()),
            },
            media_job_store_path(context.workspace_root(), &batch_id),
            MediaToolEventContext::from_tool_context(context, self.name()),
        );
        let mut result = build_media_polling_result(
            "image",
            &batch_id,
            &task_ids,
            Some(&prompt),
            Some(&resolved.model),
        );
        result["response"] = response;
        Ok(ok_result(
            result,
            "Image generation job submitted through APIMart. Background polling has started; results will be posted back when ready.",
        ))
    }
}

pub struct GenerateVideoTool;

impl GenerateVideoTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for GenerateVideoTool {
    fn name(&self) -> &str {
        "GenerateVideo"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Submit an APIMart video generation job. Supports text-to-video, image-to-video, video extension, and selected audio/reference inputs by model capability.".to_string())
    }

    fn short_description(&self) -> String {
        "Submit an APIMart video generation job.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "prompt": { "type": "string" },
                "model": { "type": "string", "default": DEFAULT_VIDEO_MODEL },
                "duration": { "type": "integer" },
                "resolution": { "type": "string" },
                "aspect_ratio": { "type": "string" },
                "size": { "type": "string" },
                "image_urls": { "type": "array", "items": { "type": "string" } },
                "image_with_roles": { "type": "array", "items": { "type": "object" } },
                "video_urls": { "type": "array", "items": { "type": "string" } },
                "audio_urls": { "type": "array", "items": { "type": "string" } },
                "generate_audio": { "type": "boolean" },
                "return_last_frame": { "type": "boolean" }
            },
            "required": ["prompt"]
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if prompt_required(input).is_err() {
            return validation_error("prompt is required");
        }
        let request = video_request_from_input(input);
        match validate_video_generation(&request) {
            Ok(_) => valid(),
            Err(error) => validation_error(format!("{error:?}")),
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let client = match client_or_not_configured(self.name()).await? {
            Ok(client) => client,
            Err(result) => return Ok(result),
        };
        let prompt = prompt_required(input)?;
        let request = video_request_from_input(input);
        let resolved = validate_video_generation(&request)
            .map_err(|error| VoidError::validation(format!("{error:?}")))?;
        let payload = strip_nulls(Map::from_iter([
            ("model".to_string(), json!(resolved.model)),
            ("prompt".to_string(), json!(prompt)),
            (
                "duration".to_string(),
                request
                    .duration
                    .map(|value| json!(value))
                    .unwrap_or(Value::Null),
            ),
            (
                "resolution".to_string(),
                request.resolution.map(Value::String).unwrap_or(Value::Null),
            ),
            (
                "aspect_ratio".to_string(),
                request
                    .aspect_ratio
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            ),
            (
                "size".to_string(),
                request.size.map(Value::String).unwrap_or(Value::Null),
            ),
            ("image_urls".to_string(), json!(request.image_urls)),
            (
                "image_with_roles".to_string(),
                input
                    .get("image_with_roles")
                    .cloned()
                    .unwrap_or_else(|| json!([])),
            ),
            ("video_urls".to_string(), json!(request.video_urls)),
            ("audio_urls".to_string(), json!(request.audio_urls)),
            (
                "generate_audio".to_string(),
                input.get("generate_audio").cloned().unwrap_or(Value::Null),
            ),
            (
                "return_last_frame".to_string(),
                input
                    .get("return_last_frame")
                    .cloned()
                    .unwrap_or(Value::Null),
            ),
        ]));
        let response = match client.submit_video_generation(payload).await {
            Ok(response) => response,
            Err(VoidError::Http(message)) => {
                if let Some(error) = classify_apimart_error_message(&message) {
                    return Ok(ok_result(error, "APIMart video generation request failed."));
                }
                return Err(VoidError::Http(message));
            }
            Err(error) => return Err(error),
        };
        let task_ids = extract_media_task_ids(&response);
        let batch_id = new_media_batch_id();
        if task_ids.is_empty() {
            return Ok(ok_result(
                json!({
                    "status": "submitted_but_task_id_missing",
                    "source": "apimart",
                    "kind": "video",
                    "batch_id": batch_id,
                    "response": response
                }),
                "Video generation was submitted, but APIMart did not return a task id for background polling.",
            ));
        }
        start_media_job_polling(
            client,
            "video",
            MediaJobHandle {
                batch_id: batch_id.clone(),
                task_ids: task_ids.clone(),
                prompt: Some(prompt.clone()),
                model: Some(resolved.model.clone()),
            },
            media_job_store_path(context.workspace_root(), &batch_id),
            MediaToolEventContext::from_tool_context(context, self.name()),
        );
        let mut result = build_media_polling_result(
            "video",
            &batch_id,
            &task_ids,
            Some(&prompt),
            Some(&resolved.model),
        );
        result["response"] = response;
        Ok(ok_result(
            result,
            "Video generation job submitted through APIMart. Background polling has started; results will be posted back when ready.",
        ))
    }
}

fn video_request_from_input(input: &Value) -> VideoGenerationRequest {
    VideoGenerationRequest {
        model: optional_string(input, "model"),
        duration: optional_u8(input, "duration"),
        resolution: optional_string(input, "resolution"),
        aspect_ratio: optional_string(input, "aspect_ratio"),
        size: optional_string(input, "size"),
        image_urls: resolve_media_image_urls(string_array(input, "image_urls")),
        image_with_roles: input
            .get("image_with_roles")
            .and_then(|value| value.as_array())
            .map(|items| items.iter().map(ToString::to_string).collect())
            .unwrap_or_default(),
        video_urls: string_array(input, "video_urls"),
        audio_urls: string_array(input, "audio_urls"),
    }
}

pub struct GetMediaTaskStatusTool;

impl GetMediaTaskStatusTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for GetMediaTaskStatusTool {
    fn name(&self) -> &str {
        "GetMediaTaskStatus"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Poll an APIMart asynchronous media task and return normalized provider status, result, and error fields.".to_string())
    }

    fn short_description(&self) -> String {
        "Poll an APIMart media task.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": { "type": "string" },
                "language": { "type": "string", "default": "zh" }
            },
            "required": ["task_id"]
        })
    }

    fn is_readonly(&self) -> bool {
        true
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if optional_string(input, "task_id").is_none() {
            return validation_error("task_id is required");
        }
        valid()
    }

    async fn call_impl(
        &self,
        input: &Value,
        _context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let client = match client_or_not_configured(self.name()).await? {
            Ok(client) => client,
            Err(result) => return Ok(result),
        };
        let task_id = optional_string(input, "task_id")
            .ok_or_else(|| VoidError::tool("task_id is required"))?;
        let language = optional_string(input, "language").unwrap_or_else(|| "zh".to_string());
        let response = client.get_task_status(&task_id, Some(&language)).await?;
        Ok(ok_result(
            json!({ "status": response.get("status").cloned().unwrap_or(Value::Null), "source": "apimart", "task_id": task_id, "response": response }),
            "Media task status returned by APIMart.",
        ))
    }
}

pub struct UploadMediaImageTool;

impl UploadMediaImageTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for UploadMediaImageTool {
    fn name(&self) -> &str {
        "UploadMediaImage"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Explicitly upload a local image to APIMart and return a public URL for models that require cloud image references. This may incur provider cost; do not call unless a public URL is needed.".to_string())
    }

    fn short_description(&self) -> String {
        "Upload a local image to APIMart for a public URL.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Absolute path or workspace-relative image path." }
            },
            "required": ["path"]
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if optional_string(input, "path").is_none() {
            return validation_error("path is required");
        }
        valid()
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let client = match client_or_not_configured(self.name()).await? {
            Ok(client) => client,
            Err(result) => return Ok(result),
        };
        let input_path =
            optional_string(input, "path").ok_or_else(|| VoidError::tool("path is required"))?;
        let path = resolve_workspace_path(context.workspace_root(), &input_path)?;
        let response = client.upload_image(&path).await?;
        Ok(ok_result(
            json!({ "status": "completed", "source": "apimart", "kind": "upload_image", "response": response }),
            "Image uploaded through APIMart. Use the returned URL only where a model needs a public image reference.",
        ))
    }
}

pub struct GenerateSpeechTool;

impl GenerateSpeechTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for GenerateSpeechTool {
    fn name(&self) -> &str {
        "GenerateSpeech"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Generate speech audio through APIMart gpt-4o-mini-tts and save the binary audio to a local workspace file.".to_string())
    }

    fn short_description(&self) -> String {
        "Generate speech audio through APIMart.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "input": { "type": "string" },
                "voice": { "type": "string", "enum": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"], "default": "alloy" },
                "response_format": { "type": "string", "enum": ["wav", "opus", "aac", "flac", "pcm"], "default": "wav" },
                "speed": { "type": "number", "minimum": 0.25, "maximum": 4.0 },
                "output_path": { "type": "string" }
            },
            "required": ["input"]
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        let Some(text) = optional_string(input, "input") else {
            return validation_error("input is required");
        };
        if text.chars().count() > 4096 {
            return validation_error("input must be at most 4096 characters");
        }
        valid()
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let client = match client_or_not_configured(self.name()).await? {
            Ok(client) => client,
            Err(result) => return Ok(result),
        };
        let text =
            optional_string(input, "input").ok_or_else(|| VoidError::tool("input is required"))?;
        let format = optional_string(input, "response_format").unwrap_or_else(|| "wav".to_string());
        let output_path = optional_string(input, "output_path")
            .unwrap_or_else(|| format!("media-speech.{format}"));
        let path = resolve_workspace_path(context.workspace_root(), &output_path)?;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let payload = strip_nulls(Map::from_iter([
            ("model".to_string(), json!("gpt-4o-mini-tts")),
            ("input".to_string(), json!(text)),
            (
                "voice".to_string(),
                json!(optional_string(input, "voice").unwrap_or_else(|| "alloy".to_string())),
            ),
            ("response_format".to_string(), json!(format)),
            (
                "speed".to_string(),
                input.get("speed").cloned().unwrap_or(Value::Null),
            ),
        ]));
        let bytes = client.generate_speech(payload).await?;
        tokio::fs::write(&path, &bytes).await?;
        Ok(ok_result(
            json!({ "status": "completed", "source": "apimart", "kind": "speech", "path": path.to_string_lossy(), "bytes": bytes.len() }),
            "Speech audio generated and saved to the requested local file.",
        ))
    }
}

pub struct TranscribeAudioTool;

impl TranscribeAudioTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for TranscribeAudioTool {
    fn name(&self) -> &str {
        "TranscribeAudio"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Transcribe a local audio file through APIMart whisper-1.".to_string())
    }

    fn short_description(&self) -> String {
        "Transcribe audio through APIMart.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": { "type": "string" },
                "language": { "type": "string" },
                "prompt": { "type": "string" },
                "response_format": { "type": "string", "enum": ["json", "text", "srt", "verbose_json", "vtt"], "default": "json" },
                "temperature": { "type": "number", "minimum": 0, "maximum": 1 }
            },
            "required": ["path"]
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if optional_string(input, "path").is_none() {
            return validation_error("path is required");
        }
        valid()
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let client = match client_or_not_configured(self.name()).await? {
            Ok(client) => client,
            Err(result) => return Ok(result),
        };
        let input_path =
            optional_string(input, "path").ok_or_else(|| VoidError::tool("path is required"))?;
        let path: PathBuf = resolve_workspace_path(context.workspace_root(), &input_path)?;
        let mut fields = vec![("model", "whisper-1".to_string())];
        for key in ["language", "prompt", "response_format"] {
            if let Some(value) = optional_string(input, key) {
                fields.push((key, value));
            }
        }
        if let Some(value) = input.get("temperature").and_then(|value| value.as_f64()) {
            fields.push(("temperature", value.to_string()));
        }
        let response = client.transcribe_audio(&path, fields).await?;
        Ok(ok_result(
            json!({ "status": "completed", "source": "apimart", "kind": "transcription", "response": response }),
            "Audio transcription completed through APIMart.",
        ))
    }
}
