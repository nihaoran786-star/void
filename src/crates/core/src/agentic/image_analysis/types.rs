//! Image analysis related type definitions

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Image context data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageContextData {
    /// Image ID
    pub id: String,
    /// Image file path (local file)
    pub image_path: Option<String>,
    /// Base64 encoded image data (clipboard/temporary file)
    pub data_url: Option<String>,
    /// MIME type
    pub mime_type: String,
    /// Metadata
    pub metadata: Option<serde_json::Value>,
}

pub fn image_context_reference_name(image: &ImageContextData) -> String {
    image
        .metadata
        .as_ref()
        .and_then(|m| m.get("name"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| image.image_path.as_ref().filter(|s| !s.is_empty()).cloned())
        .unwrap_or_else(|| image.id.clone())
}

pub fn render_attached_image_references(
    images: &[ImageContextData],
    include_text_only_note: bool,
) -> String {
    if images.is_empty() {
        return String::new();
    }

    let mut content = String::new();
    content.push_str("[Attached image(s):\n");
    for image in images {
        let name = image_context_reference_name(image);
        content.push_str(&format!(
            "- {} ({}, image_id={})\n",
            name, image.mime_type, image.id
        ));
    }
    content.push_str("]\n");
    content.push_str(
        "Media tool reference: for GenerateImage/GenerateVideo image-to-image or reference generation, pass an attached image_id or file name in image_urls; the tool resolves it internally to data_url or provider URL when available. Do not ask the user for a local file path or public URL when an attached image is listed.\n",
    );
    if include_text_only_note {
        content.push_str(
            "Vision note: this primary model may not inspect pixels directly, but the listed attached image references remain usable by media tools.\n",
        );
    }

    content
}

/// Image analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAnalysisResult {
    /// Image ID
    pub image_id: String,
    /// Brief summary (1-2 sentences)
    pub summary: String,
    /// Detailed description
    pub detailed_description: String,
    /// Detected key elements
    pub detected_elements: Vec<String>,
    /// Confidence (0-1)
    pub confidence: f32,
    /// Analysis time (milliseconds)
    pub analysis_time_ms: u64,
}

/// Image analysis request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeImagesRequest {
    /// List of images
    pub images: Vec<ImageContextData>,
    /// User message (optional, helps understand user intent)
    pub user_message: Option<String>,
    /// Session ID
    pub session_id: String,
    /// Workspace path for the owning session.
    #[serde(default, alias = "workspacePath")]
    pub workspace_path: Option<String>,
}

/// Send enhanced message request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendEnhancedMessageRequest {
    /// Original user message
    pub original_message: String,
    /// Image analysis results
    pub image_analyses: Vec<ImageAnalysisResult>,
    /// Other contexts (files, code snippets, etc.)
    pub other_contexts: Vec<serde_json::Value>,
    /// Session ID
    pub session_id: String,
    /// Dialog turn ID
    pub dialog_turn_id: String,
    pub agent_type: String,
}

/// Image source
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageSource {
    /// Local file path
    Path(PathBuf),
    /// Base64 encoded data
    Base64 { data: String, mime_type: String },
    /// URL (future extension)
    Url(String),
}

/// Image content (for message construction)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageContent {
    pub source: ImageSource,
    pub mime_type: String,
    pub metadata: Option<ImageMetadata>,
}

/// Image metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_size: Option<u64>,
}

/// Image model limits configuration
#[derive(Debug, Clone)]
pub struct ImageLimits {
    /// Maximum file size (bytes)
    pub max_size: usize,
    /// Maximum width (pixels)
    pub max_width: u32,
    /// Maximum height (pixels)
    pub max_height: u32,
    /// Maximum number of images per request (no app-side cap; provider APIs may still reject).
    pub max_images_per_request: usize,
}

impl Default for ImageLimits {
    fn default() -> Self {
        Self {
            max_size: 20 * 1024 * 1024, // 20MB
            max_width: 2048,
            max_height: 2048,
            max_images_per_request: usize::MAX,
        }
    }
}

impl ImageLimits {
    /// Get limits based on model provider
    pub fn for_provider(provider: &str) -> Self {
        match provider.to_lowercase().as_str() {
            "openai" | "response" | "responses" | "nvidia" | "openrouter" => Self {
                max_size: 20 * 1024 * 1024, // 20MB
                max_width: 2048,
                max_height: 2048,
                max_images_per_request: usize::MAX,
            },
            "anthropic" => Self {
                max_size: 5 * 1024 * 1024, // 5MB
                max_width: 1568,
                max_height: 2390,
                max_images_per_request: usize::MAX,
            },
            "google" | "gemini" => Self {
                max_size: 10 * 1024 * 1024, // 10MB
                max_width: 4096,
                max_height: 4096,
                max_images_per_request: usize::MAX,
            },
            _ => Self::default(),
        }
    }
}
