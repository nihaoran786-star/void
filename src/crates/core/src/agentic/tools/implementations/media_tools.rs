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

const MEDIA_IMAGE_URLS_DESCRIPTION: &str = "Reference images. Accepts public URLs, data:image data_url values, or uploaded image references shown in chat context such as image_id or file name. Use the attached image_id or file name directly; Do not ask the user for a URL or local path when an attached image is available.";

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

fn normalize_image_size(value: Option<String>) -> Option<String> {
    let size = value?;
    let trimmed = size.trim();
    let Some((width, height)) = parse_pixel_size(trimmed) else {
        return Some(size);
    };

    let divisor = gcd(width, height);
    let ratio = (width / divisor, height / divisor);
    let normalized = match ratio {
        (1, 1) => "1:1",
        (3, 2) => "3:2",
        (2, 3) => "2:3",
        (4, 3) => "4:3",
        (3, 4) => "3:4",
        (5, 4) => "5:4",
        (4, 5) => "4:5",
        (16, 9) => "16:9",
        (9, 16) => "9:16",
        (2, 1) => "2:1",
        (1, 2) => "1:2",
        (3, 1) => "3:1",
        (1, 3) => "1:3",
        (21, 9) => "21:9",
        (9, 21) => "9:21",
        _ => return Some(size),
    };
    Some(normalized.to_string())
}

fn parse_pixel_size(value: &str) -> Option<(u32, u32)> {
    let (width, height) = value.split_once(['x', 'X'])?;
    let width = width.trim().parse::<u32>().ok()?;
    let height = height.trim().parse::<u32>().ok()?;
    if width == 0 || height == 0 {
        return None;
    }
    Some((width, height))
}

fn gcd(mut a: u32, mut b: u32) -> u32 {
    while b != 0 {
        let remainder = a % b;
        a = b;
        b = remainder;
    }
    a
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
    value.starts_with("http://") || value.starts_with("https://") || value.starts_with("data:image")
}

fn resolve_media_image_urls(image_urls: Vec<String>) -> Vec<String> {
    image_urls
        .into_iter()
        .map(|url| {
            if is_apimart_image_reference(&url) {
                return url;
            }

            find_image_context_by_reference(&url)
                .and_then(|image| {
                    image.data_url.or_else(|| {
                        image
                            .image_path
                            .filter(|path| is_apimart_image_reference(path))
                    })
                })
                .unwrap_or(url)
        })
        .collect()
}

fn resolve_media_upload_path_reference(path: &str) -> String {
    find_image_context_by_reference(path)
        .and_then(|image| image.image_path)
        .filter(|image_path| !image_path.trim().is_empty())
        .unwrap_or_else(|| path.to_string())
}

fn image_generation_request_from_input(input: &Value) -> ImageGenerationRequest {
    ImageGenerationRequest {
        model: optional_string(input, "model"),
        size: normalize_image_size(optional_string(input, "size")),
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
    }
}

fn collect_http_urls(value: &Value, urls: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            if (text.starts_with("http://") || text.starts_with("https://")) && !urls.contains(text)
            {
                urls.push(text.clone());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_http_urls(item, urls);
            }
        }
        Value::Object(map) => {
            for child in map.values() {
                collect_http_urls(child, urls);
            }
        }
        _ => {}
    }
}

fn upload_image_result(response: Value) -> Value {
    let mut urls = Vec::new();
    collect_http_urls(&response, &mut urls);
    let url = urls.first().cloned();
    let assets: Vec<Value> = urls
        .iter()
        .enumerate()
        .map(|(index, url)| {
            json!({
                "kind": "image",
                "item_index": index + 1,
                "url": url
            })
        })
        .collect();

    json!({
        "status": "completed",
        "source": "apimart",
        "kind": "upload_image",
        "url": url,
        "assets": assets,
        "response": response
    })
}

#[cfg(test)]
mod media_image_reference_tests {
    use super::{
        image_generation_request_from_input, resolve_media_image_urls,
        resolve_media_upload_path_reference, upload_image_result, GenerateImageTool,
    };
    use crate::agentic::tools::framework::Tool;
    use crate::agentic::tools::image_context::{store_image_context, ImageContextData};
    use serde_json::json;

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

    #[test]
    fn resolves_uploaded_image_id_to_data_url() {
        store_image_context(ImageContextData {
            id: "img-upload-by-id".to_string(),
            image_path: None,
            data_url: Some("data:image/png;base64,by-id".to_string()),
            mime_type: "image/png".to_string(),
            image_name: "reference-by-id.png".to_string(),
            file_size: 12,
            width: Some(64),
            height: Some(64),
            source: "file".to_string(),
        });

        let resolved = resolve_media_image_urls(vec!["img-upload-by-id".to_string()]);

        assert_eq!(resolved, vec!["data:image/png;base64,by-id".to_string()]);
    }

    #[test]
    fn prefers_data_url_over_provider_url_for_registered_image_contexts() {
        store_image_context(ImageContextData {
            id: "img-data-wins".to_string(),
            image_path: Some("https://cdn.example.com/fallback.png".to_string()),
            data_url: Some("data:image/png;base64,data-wins".to_string()),
            mime_type: "image/png".to_string(),
            image_name: "data-wins.png".to_string(),
            file_size: 12,
            width: Some(64),
            height: Some(64),
            source: "file".to_string(),
        });

        let resolved = resolve_media_image_urls(vec!["data-wins.png".to_string()]);

        assert_eq!(
            resolved,
            vec!["data:image/png;base64,data-wins".to_string()]
        );
    }

    #[test]
    fn preserves_unmatched_image_reference_as_raw_string() {
        let resolved = resolve_media_image_urls(vec!["missing-reference.png".to_string()]);

        assert_eq!(resolved, vec!["missing-reference.png".to_string()]);
    }

    #[test]
    fn resolves_url_backed_image_name_to_provider_url() {
        store_image_context(ImageContextData {
            id: "img-url-1".to_string(),
            image_path: Some("https://cdn.example.com/generated.png".to_string()),
            data_url: None,
            mime_type: "image/png".to_string(),
            image_name: "Generated media 1".to_string(),
            file_size: 0,
            width: Some(512),
            height: Some(512),
            source: "url".to_string(),
        });

        let resolved = resolve_media_image_urls(vec!["Generated media 1".to_string()]);

        assert_eq!(resolved, vec!["https://cdn.example.com/generated.png"]);
    }

    #[test]
    fn resolves_upload_path_from_named_local_image_context() {
        store_image_context(ImageContextData {
            id: "img-local-1".to_string(),
            image_path: Some("C:/tmp/thor-reference.jpg".to_string()),
            data_url: None,
            mime_type: "image/jpeg".to_string(),
            image_name: "local-upload-source.jpg".to_string(),
            file_size: 123,
            width: None,
            height: None,
            source: "file".to_string(),
        });

        assert_eq!(
            resolve_media_upload_path_reference("local-upload-source.jpg"),
            "C:/tmp/thor-reference.jpg"
        );
    }

    #[test]
    fn exposes_uploaded_image_url_as_normalized_asset() {
        let result = upload_image_result(json!({
            "data": {
                "url": "https://cdn.example.com/uploaded.png"
            }
        }));

        assert_eq!(result["url"], "https://cdn.example.com/uploaded.png");
        assert_eq!(
            result["assets"][0]["url"],
            "https://cdn.example.com/uploaded.png"
        );
        assert_eq!(result["assets"][0]["item_index"], 1);
    }

    #[test]
    fn generate_image_schema_accepts_uploaded_image_references() {
        let schema = GenerateImageTool::new().input_schema();
        let image_urls_description = schema
            .pointer("/properties/image_urls/description")
            .and_then(|value| value.as_str())
            .unwrap_or("");

        assert!(image_urls_description.contains("image_id"));
        assert!(image_urls_description.contains("file name"));
        assert!(image_urls_description.contains("data_url"));
        assert!(image_urls_description.contains("Do not ask"));
    }

    #[tokio::test]
    async fn generate_image_accepts_common_pixel_size_as_aspect_ratio() {
        let result = GenerateImageTool::new()
            .validate_input(
                &json!({
                    "prompt": "make an image",
                    "model": "gpt-image-2",
                    "size": "1024x1024"
                }),
                None,
            )
            .await;

        assert!(
            result.result,
            "expected valid input, got {:?}",
            result.message
        );
    }

    #[test]
    fn normalizes_common_pixel_image_sizes_before_provider_validation() {
        assert_eq!(
            image_generation_request_from_input(&json!({ "size": "1024x1024" })).size,
            Some("1:1".to_string())
        );
        assert_eq!(
            image_generation_request_from_input(&json!({ "size": "1536x1024" })).size,
            Some("3:2".to_string())
        );
        assert_eq!(
            image_generation_request_from_input(&json!({ "size": "1024x1536" })).size,
            Some("2:3".to_string())
        );
    }

    #[tokio::test]
    async fn generate_image_description_prevents_path_prompt_for_attached_images() {
        let description = GenerateImageTool::new()
            .description()
            .await
            .expect("description should be available");

        assert!(description.contains("image_id"));
        assert!(description.contains("image_urls"));
        assert!(description.contains("Do not ask the user for a URL or local path"));
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
        Ok("Submit an APIMart image generation job. Supports text-to-image and image-to-image. For image-to-image/reference generation, set image_urls to an attached image_id or file name from the chat image context; the tool resolves it to data_url or provider URL when available. Do not ask the user for a URL or local path when an attached image is available.".to_string())
    }

    fn short_description(&self) -> String {
        "Submit APIMart image generation; uploaded image_id/name references are valid image_urls."
            .to_string()
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
                "image_urls": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": MEDIA_IMAGE_URLS_DESCRIPTION
                },
                "size": {
                    "type": "string",
                    "enum": ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
                    "description": "Image aspect ratio. Use auto unless the user asks for a specific aspect ratio; do not use pixel sizes such as 1024x1024."
                },
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
        let request = image_generation_request_from_input(input);
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
        let request = image_generation_request_from_input(input);
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
        Ok("Submit an APIMart video generation job. Supports text-to-video, image-to-video, video extension, and selected audio/reference inputs by model capability. For image-to-video/reference generation, set image_urls to an attached image_id or file name from the chat image context; the tool resolves it to data_url or provider URL when available. Do not ask the user for a URL or local path when an attached image is available.".to_string())
    }

    fn short_description(&self) -> String {
        "Submit APIMart video generation; uploaded image_id/name references are valid image_urls."
            .to_string()
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
                "image_urls": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": MEDIA_IMAGE_URLS_DESCRIPTION
                },
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
        if is_apimart_image_reference(&input_path) {
            return Ok(ok_result(
                upload_image_result(json!({ "url": input_path })),
                "Image is already a public provider-compatible URL.",
            ));
        }
        let input_path = resolve_media_upload_path_reference(&input_path);
        let path = resolve_workspace_path(context.workspace_root(), &input_path)?;
        let response = client.upload_image(&path).await?;
        Ok(ok_result(
            upload_image_result(response),
            "Image uploaded through APIMart. Use the returned url only where a model needs a public image reference.",
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
