//! Infinite Canvas local asset API (P5, 2026-08-26 owner decision §7 item 1).
//!
//! The web layer has no way to write image *bytes*: its only file-writing
//! channel (`workspaceAPI.writeFile` → `write_file_content` →
//! `write_text_file`) takes a `&str` and writes it verbatim — there is no
//! base64 decode anywhere on that path. Both P5 features that produce a local
//! image (crop, and the red-mark composite that feeds inpaint/erase) need a
//! real file on disk, so this module adds one small, tightly-scoped command
//! that both share.
//!
//! **This is deliberately not a general binary-write facility.** The
//! two-prefix allowlist below is the only barrier keeping it from becoming a
//! write-anywhere hole in the web layer. Widening it is equivalent to opening a
//! new attack surface and must be escalated to the owner, not done in passing.
//! See `docs/features/infinite-canvas-and-media-tools-prd.md` §3.9.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

/// The only two workspace-relative directories this command may write into.
///
/// - `.void/infinite-canvas/scratch/` — red-mark composites (PRD §3.7). Sits
///   outside all four `MANAGED_MEDIA_SOURCES` scan roots on purpose, so the
///   media library never surfaces these intermediates.
/// - `media/input/canvas-crops/` — crop output (PRD §3.8). Inside an existing
///   scan root on purpose, so the media library finds it with no index write.
const ALLOWED_RELATIVE_PREFIXES: &[&str] = &[
    ".void/infinite-canvas/scratch/",
    "media/input/canvas-crops/",
];

/// Decoded-byte ceiling. A 1024² PNG is far below this; the limit exists so a
/// runaway front end cannot fill the disk through this command.
const MAX_DECODED_BYTES: usize = 32 * 1024 * 1024;

/// PNG signature. The extension check alone only constrains the *name*; this
/// constrains the *content*, so the command cannot be used to drop arbitrary
/// payloads under a `.png` name.
const PNG_MAGIC: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

/// Default scratch retention. Cleanup is best-effort housekeeping, not a
/// correctness requirement: a failed generation may be retried against the
/// same mark image, so files are aged out rather than reference-counted.
const DEFAULT_SCRATCH_MAX_AGE_DAYS: u64 = 7;

const SCRATCH_RELATIVE_DIR: &str = ".void/infinite-canvas/scratch";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteCanvasImageBytesRequest {
    /// Absolute local workspace root.
    pub workspace_path: String,
    /// Workspace-relative destination path; must sit under one of
    /// `ALLOWED_RELATIVE_PREFIXES` and end in `.png`.
    pub relative_path: String,
    /// Bare base64 (no `data:` prefix) of the PNG bytes.
    pub base64_png: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WriteCanvasImageResponse {
    /// 'written' | 'invalid_input' | 'path_denied' | 'backend'.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relative_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_written: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl WriteCanvasImageResponse {
    fn failure(status: &str, message: impl Into<String>) -> Self {
        Self {
            status: status.to_string(),
            relative_path: None,
            bytes_written: None,
            message: Some(message.into()),
        }
    }

    fn invalid_input(message: impl Into<String>) -> Self {
        Self::failure("invalid_input", message)
    }

    fn path_denied(message: impl Into<String>) -> Self {
        Self::failure("path_denied", message)
    }

    fn backend(message: impl Into<String>) -> Self {
        Self::failure("backend", message)
    }

    fn written(relative_path: String, bytes_written: u64) -> Self {
        Self {
            status: "written".to_string(),
            relative_path: Some(relative_path),
            bytes_written: Some(bytes_written),
            message: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneCanvasScratchRequest {
    pub workspace_path: String,
    /// Files older than this are removed. Defaults to 7 days.
    #[serde(default)]
    pub max_age_days: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PruneCanvasScratchResponse {
    /// 'pruned' | 'invalid_input' | 'backend'.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub removed_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Normalises a caller-supplied relative path to forward slashes so the prefix
/// allowlist has a single spelling to match against on every platform. Purely
/// syntactic — every containment check runs on the normalised form.
pub(crate) fn normalize_relative_path(relative_path: &str) -> String {
    relative_path.replace('\\', "/")
}

/// Rejects anything that is not a plain, forward-slash, inside-the-workspace
/// relative path. Shared by both commands in this module; the allowlist check
/// is layered on top of it by the write command only.
fn validate_relative_path_shape(normalized: &str) -> Result<(), String> {
    if normalized.trim().is_empty() {
        return Err("relativePath is required".to_string());
    }
    if normalized.starts_with('/') {
        return Err(format!(
            "relativePath must be workspace-relative, got '{normalized}'"
        ));
    }
    if normalized.contains(':') {
        return Err(format!(
            "relativePath must not contain a drive or scheme separator, got '{normalized}'"
        ));
    }
    let candidate = Path::new(normalized);
    if candidate.is_absolute() {
        return Err(format!(
            "relativePath must be workspace-relative, got '{normalized}'"
        ));
    }
    if candidate
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(format!(
            "relativePath must not escape the workspace, got '{normalized}'"
        ));
    }
    Ok(())
}

/// Pure validation for `write_canvas_image_bytes`. Returns the normalised
/// relative path and the decoded bytes, or the typed failure to hand back.
///
/// Ordering matters for the error classes: shape and allowlist problems are
/// `path_denied`, payload problems are `invalid_input`.
pub(crate) fn validate_write_request(
    request: &WriteCanvasImageBytesRequest,
) -> Result<(String, Vec<u8>), WriteCanvasImageResponse> {
    if !Path::new(&request.workspace_path).is_absolute() {
        return Err(WriteCanvasImageResponse::invalid_input(
            "workspacePath must be an absolute local path",
        ));
    }

    let normalized = normalize_relative_path(&request.relative_path);
    if let Err(message) = validate_relative_path_shape(&normalized) {
        return Err(WriteCanvasImageResponse::path_denied(message));
    }

    if !ALLOWED_RELATIVE_PREFIXES
        .iter()
        .any(|prefix| normalized.starts_with(prefix))
    {
        return Err(WriteCanvasImageResponse::path_denied(format!(
            "relativePath must start with one of {ALLOWED_RELATIVE_PREFIXES:?}, got '{normalized}'"
        )));
    }

    let is_png = Path::new(&normalized)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("png"))
        .unwrap_or(false);
    if !is_png {
        return Err(WriteCanvasImageResponse::path_denied(format!(
            "relativePath must name a .png file, got '{normalized}'"
        )));
    }

    let payload = request.base64_png.trim();
    if payload.is_empty() {
        return Err(WriteCanvasImageResponse::invalid_input(
            "base64Png is required",
        ));
    }
    if payload.starts_with("data:") {
        return Err(WriteCanvasImageResponse::invalid_input(
            "base64Png must be bare base64 without a data: prefix",
        ));
    }
    // Cheap pre-check before allocating: base64 expands 4 chars per 3 bytes.
    if payload.len() / 4 * 3 > MAX_DECODED_BYTES {
        return Err(WriteCanvasImageResponse::invalid_input(format!(
            "image exceeds the {MAX_DECODED_BYTES} byte limit"
        )));
    }

    let bytes = BASE64
        .decode(payload.as_bytes())
        .map_err(|error| {
            WriteCanvasImageResponse::invalid_input(format!("base64Png is not decodable: {error}"))
        })?;
    if bytes.len() > MAX_DECODED_BYTES {
        return Err(WriteCanvasImageResponse::invalid_input(format!(
            "image exceeds the {MAX_DECODED_BYTES} byte limit: {} bytes",
            bytes.len()
        )));
    }
    if !bytes.starts_with(PNG_MAGIC) {
        return Err(WriteCanvasImageResponse::invalid_input(
            "base64Png does not decode to PNG bytes",
        ));
    }

    Ok((normalized, bytes))
}

/// Belt-and-braces containment check performed after the directory exists, so
/// a symlinked parent cannot land the write outside the workspace even though
/// the textual path looked clean.
fn resolved_stays_inside(workspace_root: &Path, parent: &Path) -> bool {
    match (
        std::fs::canonicalize(workspace_root),
        std::fs::canonicalize(parent),
    ) {
        (Ok(root), Ok(target)) => target.starts_with(root),
        // If either side cannot be canonicalised we already know the textual
        // path is clean; fail closed only when the parent itself is missing.
        _ => false,
    }
}

/// Writes PNG bytes to one of two allowlisted workspace directories.
///
/// Typed by construction: every rejection comes back as a `status` the card
/// can render, never as a thrown string protocol.
#[tauri::command]
pub async fn write_canvas_image_bytes(
    request: WriteCanvasImageBytesRequest,
) -> Result<WriteCanvasImageResponse, String> {
    let (normalized, bytes) = match validate_write_request(&request) {
        Ok(validated) => validated,
        Err(response) => return Ok(response),
    };

    let workspace_root = PathBuf::from(&request.workspace_path);
    if !workspace_root.is_dir() {
        return Ok(WriteCanvasImageResponse::invalid_input(
            "workspacePath does not exist on this machine",
        ));
    }

    let target = workspace_root.join(&normalized);
    let Some(parent) = target.parent() else {
        return Ok(WriteCanvasImageResponse::path_denied(
            "relativePath has no parent directory",
        ));
    };
    if let Err(error) = tokio::fs::create_dir_all(parent).await {
        return Ok(WriteCanvasImageResponse::backend(format!(
            "failed to create '{}': {error}",
            parent.display()
        )));
    }
    if !resolved_stays_inside(&workspace_root, parent) {
        return Ok(WriteCanvasImageResponse::path_denied(format!(
            "relativePath resolves outside the workspace: {normalized}"
        )));
    }

    let bytes_written = bytes.len() as u64;
    match tokio::fs::write(&target, &bytes).await {
        Ok(()) => Ok(WriteCanvasImageResponse::written(normalized, bytes_written)),
        Err(error) => Ok(WriteCanvasImageResponse::backend(format!(
            "failed to write '{}': {error}",
            target.display()
        ))),
    }
}

/// Deletes expired red-mark composites. Best-effort by contract: the front end
/// fires this on panel mount and ignores the outcome, so it must never be a
/// blocking or user-visible failure.
#[tauri::command]
pub async fn prune_canvas_scratch(
    request: PruneCanvasScratchRequest,
) -> Result<PruneCanvasScratchResponse, String> {
    if !Path::new(&request.workspace_path).is_absolute() {
        return Ok(PruneCanvasScratchResponse {
            status: "invalid_input".to_string(),
            removed_count: None,
            message: Some("workspacePath must be an absolute local path".to_string()),
        });
    }
    let workspace_root = PathBuf::from(&request.workspace_path);
    if !workspace_root.is_dir() {
        return Ok(PruneCanvasScratchResponse {
            status: "invalid_input".to_string(),
            removed_count: None,
            message: Some("workspacePath does not exist on this machine".to_string()),
        });
    }

    let max_age_days = request.max_age_days.unwrap_or(DEFAULT_SCRATCH_MAX_AGE_DAYS);
    let scratch_dir = workspace_root.join(SCRATCH_RELATIVE_DIR);
    match prune_scratch_dir(&scratch_dir, max_age_days).await {
        Ok(removed_count) => Ok(PruneCanvasScratchResponse {
            status: "pruned".to_string(),
            removed_count: Some(removed_count),
            message: None,
        }),
        Err(message) => Ok(PruneCanvasScratchResponse {
            status: "backend".to_string(),
            removed_count: None,
            message: Some(message),
        }),
    }
}

/// Removes expired *files* directly inside the scratch directory. Never
/// recurses and never touches directories, so nothing outside
/// `.void/infinite-canvas/scratch/` can be reached from here.
pub(crate) async fn prune_scratch_dir(
    scratch_dir: &Path,
    max_age_days: u64,
) -> Result<u64, String> {
    if !scratch_dir.is_dir() {
        // Nothing written yet is a normal state, not a failure.
        return Ok(0);
    }
    let max_age = std::time::Duration::from_secs(max_age_days.saturating_mul(24 * 60 * 60));
    let now = std::time::SystemTime::now();

    let mut entries = tokio::fs::read_dir(scratch_dir)
        .await
        .map_err(|error| format!("failed to read '{}': {error}", scratch_dir.display()))?;
    let mut removed = 0u64;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| format!("failed to enumerate '{}': {error}", scratch_dir.display()))?
    {
        let Ok(metadata) = entry.metadata().await else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let expired = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .map(|age| age > max_age)
            .unwrap_or(false);
        if expired && tokio::fs::remove_file(entry.path()).await.is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

// ---------------------------------------------------------------------------
// P5-R2: reverse-prompt (image → prompt) for the infinite canvas.
//
// Canvas buttons do not go through the session AI — that discipline is already
// recorded in CONTEXT.md, because routing a button click through the chat burns
// a model round trip and leaves the result in the conversation instead of on
// the card. So the reverse-prompt button gets its own command, built on the
// very same primitives the AnalyzeImage tool uses
// (`resolve_vision_model_from_global_config` + `optimize_image_with_size_limit`
// + `build_multimodal_message` + the global AI client factory) and reporting
// the very same typed status names. Nothing under `image_analysis/`,
// `analyze_image_tool.rs` or `modes/media.rs` is modified.
// ---------------------------------------------------------------------------

use async_trait::async_trait;
use std::sync::Arc;
use void_core::agentic::image_analysis::{
    build_multimodal_message, detect_mime_type_from_bytes, optimize_image_with_size_limit,
    resolve_vision_model_from_global_config,
};
use void_core::infrastructure::ai::get_global_ai_client_factory;
use void_core::util::errors::VoidError;

/// Matches `AnalyzeImage`'s ceiling so both paths hand the provider the same
/// class of payload.
const ANALYSIS_MAX_BYTES: usize = 1024 * 1024;

/// The instruction sent to the vision model. Deliberately asks for a
/// ready-to-use generation prompt rather than a description, because the
/// result is dropped straight into the card's prompt box.
const SUMMARY_REVERSE_PROMPT_INSTRUCTION: &str = "Look at this image and write a single image-generation prompt that would recreate it. Cover subject, composition, lighting, colour palette, art style and mood. Reply with the prompt text only — no preamble, no numbering, no explanation. Keep it under 80 words.";
const DETAILED_REVERSE_PROMPT_INSTRUCTION: &str = "Look at this image and write a single, richly detailed image-generation prompt that would recreate it. Cover subject and pose, composition and camera framing, lens and depth of field, lighting direction and quality, colour palette, materials and textures, art style, rendering technique and overall mood. Reply with the prompt text only — no preamble, no numbering, no explanation.";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeInfiniteCanvasImageRequest {
    /// Absolute local workspace root.
    pub workspace_path: String,
    /// Workspace-relative path of the image to read. No directory allowlist
    /// here — unlike the write command this reads the owner's own media —
    /// but it must still stay inside the workspace.
    pub relative_path: String,
    /// "summary" | "detailed". Defaults to "detailed".
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeInfiniteCanvasImageResponse {
    /// 'completed' | 'unsupported_model' | 'provider_not_configured'
    /// | 'invalid_image' | 'path_denied' | 'backend'.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl AnalyzeInfiniteCanvasImageResponse {
    fn failure(status: &str, message: impl Into<String>) -> Self {
        Self {
            status: status.to_string(),
            prompt: None,
            summary: None,
            model_id: None,
            message: Some(message.into()),
        }
    }
}

/// The typed status set, mirrored from `ANALYZE_IMAGE_OUTPUT_STATUSES`. No new
/// vocabulary is invented here, and no status is ever a bare string protocol.
pub const CANVAS_IMAGE_ANALYSIS_STATUSES: &[&str] = &[
    "completed",
    "unsupported_model",
    "provider_not_configured",
    "invalid_image",
    "path_denied",
    "backend",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CanvasImageAnalysisFailure {
    pub status: &'static str,
    pub message: String,
}

impl CanvasImageAnalysisFailure {
    fn new(status: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CanvasImageAnalysisSuccess {
    pub prompt: String,
    pub summary: String,
    pub model_id: String,
}

/// Seam for tests: the real implementation talks to the owner-configured
/// vision model, which no unit test may do.
#[async_trait]
pub(crate) trait CanvasImageAnalysisRuntime: Send + Sync {
    async fn analyze(
        &self,
        bytes: Vec<u8>,
        mime_type: String,
        instruction: String,
    ) -> Result<CanvasImageAnalysisSuccess, CanvasImageAnalysisFailure>;
}

struct DefaultCanvasImageAnalysisRuntime;

#[async_trait]
impl CanvasImageAnalysisRuntime for DefaultCanvasImageAnalysisRuntime {
    async fn analyze(
        &self,
        bytes: Vec<u8>,
        mime_type: String,
        instruction: String,
    ) -> Result<CanvasImageAnalysisSuccess, CanvasImageAnalysisFailure> {
        let vision_model = resolve_vision_model_from_global_config()
            .await
            .map_err(classify_vision_model_error)?;

        let processed = optimize_image_with_size_limit(
            bytes,
            &vision_model.provider,
            Some(&mime_type),
            Some(ANALYSIS_MAX_BYTES),
        )
        .map_err(|error| {
            CanvasImageAnalysisFailure::new(
                "invalid_image",
                format!("unable to prepare image: {error}"),
            )
        })?;

        let messages = build_multimodal_message(
            &instruction,
            &processed.data,
            &processed.mime_type,
            &vision_model.provider,
        )
        .map_err(|error| {
            CanvasImageAnalysisFailure::new(
                "backend",
                format!("unable to build image request: {error}"),
            )
        })?;

        let client = get_global_ai_client_factory()
            .await
            .map_err(|error| {
                CanvasImageAnalysisFailure::new(
                    "provider_not_configured",
                    format!("AI client factory unavailable: {error}"),
                )
            })?
            .get_client_by_id(&vision_model.id)
            .await
            .map_err(|error| {
                CanvasImageAnalysisFailure::new(
                    "provider_not_configured",
                    format!("failed to create image understanding client: {error}"),
                )
            })?;

        let response = client.send_message(messages, None).await.map_err(|error| {
            CanvasImageAnalysisFailure::new("backend", format!("image analysis failed: {error}"))
        })?;

        let prompt = response.text.trim().to_string();
        if prompt.is_empty() {
            return Err(CanvasImageAnalysisFailure::new(
                "backend",
                "the image understanding model returned an empty prompt",
            ));
        }
        let summary = first_non_empty_line(&prompt, 180);

        Ok(CanvasImageAnalysisSuccess {
            prompt,
            summary,
            model_id: vision_model.id,
        })
    }
}

/// Same classification the AnalyzeImage tool applies, so "no vision model
/// configured" surfaces as an explainable line on the card rather than a
/// silent no-op or a generic backend error.
pub(crate) fn classify_vision_model_error(error: VoidError) -> CanvasImageAnalysisFailure {
    let message = error.to_string();
    if message.contains("does not support image understanding") {
        return CanvasImageAnalysisFailure::new("unsupported_model", message);
    }
    if message.contains("not configured")
        || message.contains("Model not found")
        || message.contains("disabled")
        || message.contains("Failed to get AI config")
    {
        return CanvasImageAnalysisFailure::new("provider_not_configured", message);
    }
    CanvasImageAnalysisFailure::new("backend", message)
}

fn first_non_empty_line(text: &str, max_chars: usize) -> String {
    text.lines()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or_default()
        .chars()
        .take(max_chars)
        .collect()
}

pub(crate) fn instruction_for_detail(detail: Option<&str>) -> String {
    match detail.map(str::trim) {
        Some("summary") => SUMMARY_REVERSE_PROMPT_INSTRUCTION.to_string(),
        _ => DETAILED_REVERSE_PROMPT_INSTRUCTION.to_string(),
    }
}

/// Pure path validation for the read command: workspace-relative, no escapes,
/// and — after joining — still genuinely inside the workspace.
pub(crate) fn validate_analysis_request(
    request: &AnalyzeInfiniteCanvasImageRequest,
) -> Result<String, AnalyzeInfiniteCanvasImageResponse> {
    if !Path::new(&request.workspace_path).is_absolute() {
        return Err(AnalyzeInfiniteCanvasImageResponse::failure(
            "path_denied",
            "workspacePath must be an absolute local path",
        ));
    }
    if let Some(detail) = request.detail.as_deref().map(str::trim) {
        if !detail.is_empty() && !matches!(detail, "summary" | "detailed") {
            return Err(AnalyzeInfiniteCanvasImageResponse::failure(
                "invalid_image",
                "detail must be one of: \"summary\", \"detailed\"",
            ));
        }
    }
    let normalized = normalize_relative_path(&request.relative_path);
    validate_relative_path_shape(&normalized)
        .map_err(|message| AnalyzeInfiniteCanvasImageResponse::failure("path_denied", message))?;
    Ok(normalized)
}

/// Reverse-prompt a canvas image with the owner-configured vision model.
#[tauri::command]
pub async fn analyze_infinite_canvas_image(
    request: AnalyzeInfiniteCanvasImageRequest,
) -> Result<AnalyzeInfiniteCanvasImageResponse, String> {
    analyze_infinite_canvas_image_with_runtime(
        request,
        Arc::new(DefaultCanvasImageAnalysisRuntime),
    )
    .await
}

pub(crate) async fn analyze_infinite_canvas_image_with_runtime(
    request: AnalyzeInfiniteCanvasImageRequest,
    runtime: Arc<dyn CanvasImageAnalysisRuntime>,
) -> Result<AnalyzeInfiniteCanvasImageResponse, String> {
    let normalized = match validate_analysis_request(&request) {
        Ok(normalized) => normalized,
        Err(response) => return Ok(response),
    };

    let workspace_root = PathBuf::from(&request.workspace_path);
    if !workspace_root.is_dir() {
        return Ok(AnalyzeInfiniteCanvasImageResponse::failure(
            "path_denied",
            "workspacePath does not exist on this machine",
        ));
    }
    let target = workspace_root.join(&normalized);
    // Existence first: a path that simply is not there is a missing image, not
    // a denial — and `resolved_stays_inside` can only canonicalise something
    // that exists.
    if !target.is_file() {
        return Ok(AnalyzeInfiniteCanvasImageResponse::failure(
            "invalid_image",
            format!("no file at '{normalized}'"),
        ));
    }
    if !resolved_stays_inside(&workspace_root, &target) {
        return Ok(AnalyzeInfiniteCanvasImageResponse::failure(
            "path_denied",
            format!("relativePath resolves outside the workspace: {normalized}"),
        ));
    }

    let bytes = match tokio::fs::read(&target).await {
        Ok(bytes) => bytes,
        Err(error) => {
            return Ok(AnalyzeInfiniteCanvasImageResponse::failure(
                "invalid_image",
                format!("failed to read '{normalized}': {error}"),
            ))
        }
    };
    let mime_type = match detect_mime_type_from_bytes(&bytes, None) {
        Ok(mime_type) => mime_type,
        Err(error) => {
            return Ok(AnalyzeInfiniteCanvasImageResponse::failure(
                "invalid_image",
                error.to_string(),
            ))
        }
    };

    let instruction = instruction_for_detail(request.detail.as_deref());
    Ok(match runtime.analyze(bytes, mime_type, instruction).await {
        Ok(success) => AnalyzeInfiniteCanvasImageResponse {
            status: "completed".to_string(),
            prompt: Some(success.prompt),
            summary: Some(success.summary),
            model_id: Some(success.model_id),
            message: None,
        },
        Err(failure) => {
            AnalyzeInfiniteCanvasImageResponse::failure(failure.status, failure.message)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{
        prune_scratch_dir, validate_write_request, WriteCanvasImageBytesRequest,
        MAX_DECODED_BYTES, PNG_MAGIC,
    };
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;
    use std::path::PathBuf;

    fn temp_workspace() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "void-canvas-asset-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).expect("create temp workspace");
        root
    }

    fn tiny_png_bytes() -> Vec<u8> {
        let mut bytes = PNG_MAGIC.to_vec();
        bytes.extend_from_slice(b"\x00\x00\x00\x0DIHDR-not-a-real-image");
        bytes
    }

    fn request(relative_path: &str) -> WriteCanvasImageBytesRequest {
        WriteCanvasImageBytesRequest {
            workspace_path: if cfg!(windows) {
                "C:\\workspace".to_string()
            } else {
                "/workspace".to_string()
            },
            relative_path: relative_path.to_string(),
            base64_png: BASE64.encode(tiny_png_bytes()),
        }
    }

    #[test]
    fn accepts_both_allowlisted_prefixes() {
        for path in [
            ".void/infinite-canvas/scratch/op-1-mark.png",
            "media/input/canvas-crops/shot-crop-1756000000.png",
        ] {
            let (normalized, bytes) =
                validate_write_request(&request(path)).expect("allowlisted path must pass");
            assert_eq!(normalized, path);
            assert_eq!(bytes, tiny_png_bytes());
        }
    }

    #[test]
    fn normalizes_backslashes_before_matching_the_allowlist() {
        let (normalized, _) =
            validate_write_request(&request(".void\\infinite-canvas\\scratch\\op-1-mark.png"))
                .expect("backslash spelling of an allowlisted path must pass");
        assert_eq!(normalized, ".void/infinite-canvas/scratch/op-1-mark.png");
    }

    #[test]
    fn rejects_every_path_outside_the_allowlist() {
        // The allowlist is the only barrier against this becoming a general
        // write-to-disk command; each escape shape gets its own case.
        for path in [
            "media/generated/x.png",
            "media/input/x.png",
            ".void/media/uploads/x.png",
            "../x.png",
            ".void/infinite-canvas/scratch/../../../x.png",
            "/etc/x.png",
            "C:\\x.png",
            "src/main.rs.png",
            ".void/infinite-canvas/scratchy/x.png",
        ] {
            let response =
                validate_write_request(&request(path)).expect_err("path must be rejected");
            assert_eq!(response.status, "path_denied", "path was accepted: {path}");
        }
    }

    #[test]
    fn rejects_non_png_extensions() {
        for path in [
            ".void/infinite-canvas/scratch/op-1-mark.jpg",
            ".void/infinite-canvas/scratch/op-1-mark.png.exe",
            "media/input/canvas-crops/no-extension",
        ] {
            let response =
                validate_write_request(&request(path)).expect_err("non-png must be rejected");
            assert_eq!(response.status, "path_denied", "path was accepted: {path}");
        }
        // The extension check is case-insensitive.
        assert!(
            validate_write_request(&request("media/input/canvas-crops/a.PNG")).is_ok(),
            "uppercase .PNG must be accepted"
        );
    }

    #[test]
    fn rejects_a_relative_workspace_path() {
        let mut input = request("media/input/canvas-crops/a.png");
        input.workspace_path = "relative/workspace".to_string();
        let response = validate_write_request(&input).expect_err("must reject");
        assert_eq!(response.status, "invalid_input");
    }

    #[test]
    fn rejects_payloads_over_the_size_limit() {
        let mut input = request("media/input/canvas-crops/a.png");
        let mut oversized = PNG_MAGIC.to_vec();
        oversized.resize(MAX_DECODED_BYTES + 1, 0);
        input.base64_png = BASE64.encode(oversized);
        let response = validate_write_request(&input).expect_err("must reject");
        assert_eq!(response.status, "invalid_input");
        assert!(response
            .message
            .unwrap_or_default()
            .contains("exceeds the"));
    }

    #[test]
    fn rejects_undecodable_and_non_png_payloads() {
        let mut input = request("media/input/canvas-crops/a.png");
        input.base64_png = "not base64 !!!".to_string();
        assert_eq!(
            validate_write_request(&input)
                .expect_err("must reject")
                .status,
            "invalid_input"
        );

        let mut input = request("media/input/canvas-crops/a.png");
        input.base64_png = BASE64.encode(b"plain text, not an image");
        let response = validate_write_request(&input).expect_err("must reject");
        assert_eq!(response.status, "invalid_input");
        assert!(response
            .message
            .unwrap_or_default()
            .contains("does not decode to PNG"));

        // data: URLs are the caller's mistake, not a silently accepted input.
        let mut input = request("media/input/canvas-crops/a.png");
        input.base64_png = format!("data:image/png;base64,{}", BASE64.encode(tiny_png_bytes()));
        assert_eq!(
            validate_write_request(&input)
                .expect_err("must reject")
                .status,
            "invalid_input"
        );
    }

    #[tokio::test]
    async fn writes_the_exact_bytes_and_creates_missing_parents() {
        let workspace = temp_workspace();
        let response = super::write_canvas_image_bytes(WriteCanvasImageBytesRequest {
            workspace_path: workspace.to_string_lossy().to_string(),
            relative_path: "media/input/canvas-crops/shot-crop-1.png".to_string(),
            base64_png: BASE64.encode(tiny_png_bytes()),
        })
        .await
        .expect("command must not error out");

        assert_eq!(response.status, "written");
        assert_eq!(
            response.relative_path.as_deref(),
            Some("media/input/canvas-crops/shot-crop-1.png")
        );
        assert_eq!(response.bytes_written, Some(tiny_png_bytes().len() as u64));

        let written = std::fs::read(workspace.join("media/input/canvas-crops/shot-crop-1.png"))
            .expect("file must exist");
        assert_eq!(written, tiny_png_bytes());

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn rewriting_the_same_operation_id_overwrites_one_file() {
        // Scratch files are named by operationId precisely so a retry of the
        // same operation cannot pile up garbage.
        let workspace = temp_workspace();
        let relative = ".void/infinite-canvas/scratch/op-1-mark.png".to_string();
        for _ in 0..2 {
            let response = super::write_canvas_image_bytes(WriteCanvasImageBytesRequest {
                workspace_path: workspace.to_string_lossy().to_string(),
                relative_path: relative.clone(),
                base64_png: BASE64.encode(tiny_png_bytes()),
            })
            .await
            .expect("command must not error out");
            assert_eq!(response.status, "written");
        }
        let entries = std::fs::read_dir(workspace.join(".void/infinite-canvas/scratch"))
            .expect("scratch dir must exist")
            .count();
        assert_eq!(entries, 1);

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn write_reports_a_missing_workspace_as_invalid_input() {
        let missing = std::env::temp_dir().join(format!("void-canvas-missing-{}", uuid::Uuid::new_v4()));
        let response = super::write_canvas_image_bytes(WriteCanvasImageBytesRequest {
            workspace_path: missing.to_string_lossy().to_string(),
            relative_path: "media/input/canvas-crops/a.png".to_string(),
            base64_png: BASE64.encode(tiny_png_bytes()),
        })
        .await
        .expect("command must not error out");
        assert_eq!(response.status, "invalid_input");
    }

    #[tokio::test]
    async fn prune_removes_only_expired_files_and_leaves_everything_else() {
        let workspace = temp_workspace();
        let scratch = workspace.join(".void/infinite-canvas/scratch");
        std::fs::create_dir_all(&scratch).expect("create scratch");
        std::fs::create_dir_all(scratch.join("nested")).expect("create nested dir");

        let fresh = scratch.join("fresh-mark.png");
        let stale = scratch.join("stale-mark.png");
        std::fs::write(&fresh, b"fresh").expect("write fresh");
        std::fs::write(&stale, b"stale").expect("write stale");
        let long_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(30 * 86_400);
        filetime::set_file_mtime(&stale, filetime::FileTime::from_system_time(long_ago))
            .expect("age the stale file");

        let removed = prune_scratch_dir(&scratch, 7).await.expect("prune must succeed");
        assert_eq!(removed, 1);
        assert!(fresh.exists(), "fresh file must survive");
        assert!(!stale.exists(), "stale file must be removed");
        assert!(scratch.join("nested").is_dir(), "prune must not touch directories");

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn prune_treats_a_missing_scratch_dir_as_a_no_op() {
        let workspace = temp_workspace();
        let removed = prune_scratch_dir(&workspace.join(".void/infinite-canvas/scratch"), 7)
            .await
            .expect("missing scratch dir is a normal state");
        assert_eq!(removed, 0);
        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn prune_rejects_a_relative_workspace_path() {
        let response = super::prune_canvas_scratch(super::PruneCanvasScratchRequest {
            workspace_path: "relative/workspace".to_string(),
            max_age_days: None,
        })
        .await
        .expect("command must not error out");
        assert_eq!(response.status, "invalid_input");
    }

    // —— P5-R2: reverse-prompt ——

    use super::{
        analyze_infinite_canvas_image_with_runtime, classify_vision_model_error,
        instruction_for_detail, validate_analysis_request, AnalyzeInfiniteCanvasImageRequest,
        CanvasImageAnalysisFailure, CanvasImageAnalysisRuntime, CanvasImageAnalysisSuccess,
        CANVAS_IMAGE_ANALYSIS_STATUSES,
    };
    use std::sync::Arc;
    use void_core::util::errors::VoidError;

    /// A real 1×1 PNG, so MIME detection runs for real rather than against a
    /// stub that only happens to carry the right magic bytes.
    fn real_png_bytes() -> Vec<u8> {
        BASE64
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
            .expect("decode fixture png")
    }

    struct FakeAnalysisRuntime {
        outcome: Result<CanvasImageAnalysisSuccess, CanvasImageAnalysisFailure>,
    }

    #[async_trait::async_trait]
    impl CanvasImageAnalysisRuntime for FakeAnalysisRuntime {
        async fn analyze(
            &self,
            bytes: Vec<u8>,
            mime_type: String,
            instruction: String,
        ) -> Result<CanvasImageAnalysisSuccess, CanvasImageAnalysisFailure> {
            assert!(!bytes.is_empty(), "runtime must receive the file bytes");
            assert_eq!(mime_type, "image/png");
            assert!(!instruction.trim().is_empty());
            self.outcome.clone()
        }
    }

    struct PanicAnalysisRuntime;

    #[async_trait::async_trait]
    impl CanvasImageAnalysisRuntime for PanicAnalysisRuntime {
        async fn analyze(
            &self,
            _bytes: Vec<u8>,
            _mime_type: String,
            _instruction: String,
        ) -> Result<CanvasImageAnalysisSuccess, CanvasImageAnalysisFailure> {
            panic!("the vision model must never be reached for a rejected request");
        }
    }

    fn analysis_request(workspace: &std::path::Path, relative: &str) -> AnalyzeInfiniteCanvasImageRequest {
        AnalyzeInfiniteCanvasImageRequest {
            workspace_path: workspace.to_string_lossy().to_string(),
            relative_path: relative.to_string(),
            detail: None,
        }
    }

    #[test]
    fn analysis_accepts_any_in_workspace_relative_path() {
        // Unlike the write command, reading has no directory allowlist: the
        // owner's own media lives all over the workspace.
        for path in [
            "media/generated/batch-1/image-001.png",
            "media/input/canvas-crops/a.png",
            "assets/reference.jpg",
        ] {
            let request = AnalyzeInfiniteCanvasImageRequest {
                workspace_path: if cfg!(windows) {
                    "C:\\workspace".to_string()
                } else {
                    "/workspace".to_string()
                },
                relative_path: path.to_string(),
                detail: None,
            };
            assert!(
                validate_analysis_request(&request).is_ok(),
                "path must be accepted: {path}"
            );
        }
    }

    #[test]
    fn analysis_rejects_paths_escaping_the_workspace() {
        for path in ["../secret.png", "/etc/passwd", "C:\\outside\\a.png", ""] {
            let request = AnalyzeInfiniteCanvasImageRequest {
                workspace_path: if cfg!(windows) {
                    "C:\\workspace".to_string()
                } else {
                    "/workspace".to_string()
                },
                relative_path: path.to_string(),
                detail: None,
            };
            let response =
                validate_analysis_request(&request).expect_err("path must be rejected");
            assert_eq!(response.status, "path_denied", "path was accepted: {path}");
        }
    }

    #[test]
    fn analysis_detail_selects_the_instruction_and_rejects_unknown_values() {
        assert_ne!(
            instruction_for_detail(Some("summary")),
            instruction_for_detail(Some("detailed"))
        );
        // Absent detail behaves as "detailed".
        assert_eq!(
            instruction_for_detail(None),
            instruction_for_detail(Some("detailed"))
        );

        let mut request = AnalyzeInfiniteCanvasImageRequest {
            workspace_path: if cfg!(windows) {
                "C:\\workspace".to_string()
            } else {
                "/workspace".to_string()
            },
            relative_path: "a.png".to_string(),
            detail: Some("verbose".to_string()),
        };
        assert_eq!(
            validate_analysis_request(&request)
                .expect_err("unknown detail must be rejected")
                .status,
            "invalid_image"
        );
        request.detail = Some("summary".to_string());
        assert!(validate_analysis_request(&request).is_ok());
    }

    #[test]
    fn analysis_classifies_vision_model_configuration_errors_typed() {
        // An unconfigured vision model must never surface as silence.
        assert_eq!(
            classify_vision_model_error(VoidError::service(
                "Image understanding model is not configured."
            ))
            .status,
            "provider_not_configured"
        );
        assert_eq!(
            classify_vision_model_error(VoidError::service(
                "Model does not support image understanding: text-only"
            ))
            .status,
            "unsupported_model"
        );
        for status in [
            "completed",
            "unsupported_model",
            "provider_not_configured",
            "invalid_image",
            "path_denied",
            "backend",
        ] {
            assert!(CANVAS_IMAGE_ANALYSIS_STATUSES.contains(&status));
        }
    }

    #[tokio::test]
    async fn analysis_returns_completed_with_a_non_empty_prompt() {
        let workspace = temp_workspace();
        std::fs::create_dir_all(workspace.join("media/generated/batch-1")).expect("mkdir");
        std::fs::write(
            workspace.join("media/generated/batch-1/image-001.png"),
            real_png_bytes(),
        )
        .expect("write fixture png");

        let response = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "media/generated/batch-1/image-001.png"),
            Arc::new(FakeAnalysisRuntime {
                outcome: Ok(CanvasImageAnalysisSuccess {
                    prompt: "a lone red fox in snow, cinematic rim light".to_string(),
                    summary: "a lone red fox in snow".to_string(),
                    model_id: "vision-model-1".to_string(),
                }),
            }),
        )
        .await
        .expect("command must not error out");

        assert_eq!(response.status, "completed");
        assert!(!response.prompt.unwrap_or_default().trim().is_empty());
        assert_eq!(response.model_id.as_deref(), Some("vision-model-1"));
        assert!(response.message.is_none());

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn analysis_surfaces_an_unconfigured_vision_model_typed() {
        let workspace = temp_workspace();
        std::fs::write(workspace.join("a.png"), real_png_bytes()).expect("write fixture png");

        let response = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "a.png"),
            Arc::new(FakeAnalysisRuntime {
                outcome: Err(classify_vision_model_error(VoidError::service(
                    "Image understanding model is not configured.",
                ))),
            }),
        )
        .await
        .expect("an unconfigured model is a typed result, never a panic or an Err");

        assert_eq!(response.status, "provider_not_configured");
        assert!(response.prompt.is_none());
        assert!(!response.message.unwrap_or_default().is_empty());

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn analysis_never_reaches_the_model_for_denied_or_missing_paths() {
        let workspace = temp_workspace();

        let denied = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "../escape.png"),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(denied.status, "path_denied");

        let missing = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "not-there.png"),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(missing.status, "invalid_image");

        std::fs::write(workspace.join("notes.txt"), b"plain text, not an image")
            .expect("write non-image");
        let not_an_image = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "notes.txt"),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(not_an_image.status, "invalid_image");

        let _ = std::fs::remove_dir_all(workspace);
    }
}
