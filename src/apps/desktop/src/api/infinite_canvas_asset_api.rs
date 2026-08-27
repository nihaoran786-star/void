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
//! **This is deliberately not a general binary-write facility.** Three
//! independent barriers keep it from becoming a write-anywhere hole in the web
//! layer, and none of them is redundant:
//!
//! 1. **Workspace binding.** `workspacePath` is not trusted as supplied. It
//!    must resolve to the same directory as the desktop app's *currently
//!    active* workspace root (`AppState::workspace_path`). A caller cannot name
//!    an arbitrary directory on the machine and have this command create files
//!    under it. Boundary: this pins the write to one directory tree — anything
//!    the owner has genuinely opened as a workspace is in scope, by design.
//! 2. **Prefix allowlist.** Inside that root, only the two directories in
//!    `ALLOWED_RELATIVE_PREFIXES` may be written.
//! 3. **Symlink-safe landing.** The bytes are staged into a fresh temporary
//!    file and renamed over the destination, so neither a symlinked parent nor
//!    a symlinked destination can redirect the write outside the workspace.
//!
//! Widening any of them is equivalent to opening a new attack surface and must
//! be escalated to the owner, not done in passing.
//!
//! The reverse-prompt command further down (`analyze_infinite_canvas_image`)
//! *reads* rather than writes, and is bound by barrier 1 as well. Its boundary
//! differs on purpose and is worth stating plainly: it has **no prefix
//! allowlist**, because what it reads is the owner's own media, which lives all
//! over the workspace — but every path it reads must still resolve inside the
//! workspace the app currently has open. That matters more here than for the
//! writes, not less: this command sends the bytes it reads to a configured
//! vision model, so an unbound `workspacePath` would be a channel for shipping
//! arbitrary local files off the machine.
//! See `docs/features/infinite-canvas-and-media-tools-prd.md` §3.9.

use crate::api::app_state::AppState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tauri::State;

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

/// PNG signature.
///
/// Honest scope, corrected after the P5 adversarial review: the extension check
/// constrains the file *name*, and this plus [`validate_png_header`] constrain
/// the first 33 bytes of the *content*. Neither is a guarantee that the payload
/// carries nothing else — a well-formed PNG header followed by arbitrary bytes
/// still passes, exactly as it would for any real PNG with trailing junk.
/// Treat these as well-formedness checks that stop a plain non-image blob from
/// being parked under a `.png` name, not as a proof of harmless content. The
/// barrier that actually bounds the damage is *where* the file may land
/// (workspace binding + prefix allowlist), not what is inside it.
const PNG_MAGIC: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

/// Signature + IHDR chunk (4-byte length, 4-byte type, 13-byte data, 4-byte
/// CRC). Anything shorter cannot be a PNG at all.
const PNG_MIN_HEADER_BYTES: usize = 8 + 4 + 4 + 13 + 4;

/// Windows reserved device names. `media/input/canvas-crops/NUL.png` opens the
/// null device rather than creating a file, so the command would report
/// `written` for a file that does not exist. The UI never produces such a name,
/// but the command contract has to hold on its own. Rejected on *every*
/// platform so the accepted-path contract does not vary by OS.
const WINDOWS_RESERVED_STEMS: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "CONIN$",
    "CONOUT$",
];

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
    if let Some(reserved) = first_reserved_device_segment(normalized) {
        return Err(format!(
            "relativePath must not name the reserved device '{reserved}', got '{normalized}'"
        ));
    }
    Ok(())
}

/// Returns the first path segment whose leading name is a Windows device name.
///
/// `NUL`, `NUL.png` and `nul.png.bak` all open the null device on Windows, so
/// the whole segment is judged by the text before its first `.`.
fn first_reserved_device_segment(normalized: &str) -> Option<String> {
    normalized
        .split('/')
        .find(|segment| {
            let stem = segment.split('.').next().unwrap_or(segment).trim();
            WINDOWS_RESERVED_STEMS
                .iter()
                .any(|reserved| stem.eq_ignore_ascii_case(reserved))
        })
        .map(str::to_string)
}

/// Structural check on the PNG header: signature, then an IHDR chunk whose
/// declared geometry and pixel format are legal per the PNG spec.
///
/// Deliberately does *not* claim to validate the whole file — see [`PNG_MAGIC`].
fn validate_png_header(bytes: &[u8]) -> Result<(), String> {
    if !bytes.starts_with(PNG_MAGIC) {
        return Err("base64Png does not decode to PNG bytes".to_string());
    }
    if bytes.len() < PNG_MIN_HEADER_BYTES {
        return Err("base64Png is too short to contain a PNG header".to_string());
    }
    let chunk_length = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
    if chunk_length != 13 || &bytes[12..16] != b"IHDR" {
        return Err("base64Png does not start with a PNG IHDR chunk".to_string());
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    if width == 0 || height == 0 {
        return Err("base64Png declares a zero-sized image".to_string());
    }
    let bit_depth = bytes[24];
    let colour_type = bytes[25];
    if !matches!(bit_depth, 1 | 2 | 4 | 8 | 16) {
        return Err(format!("base64Png declares an illegal PNG bit depth: {bit_depth}"));
    }
    if !matches!(colour_type, 0 | 2 | 3 | 4 | 6) {
        return Err(format!(
            "base64Png declares an illegal PNG colour type: {colour_type}"
        ));
    }
    Ok(())
}

/// Binds a caller-supplied `workspacePath` to the workspace the desktop app
/// actually has open.
///
/// Without this the web layer could name *any* existing absolute directory and
/// have files created under it. The check is deliberately exact-root equality:
/// there is one active workspace at a time in `AppState`, and both the canvas
/// panel and the media library already operate on that root.
///
/// Boundary, stated plainly: this proves the write lands in the workspace the
/// owner currently has open — it does not sandbox the workspace itself, and it
/// denies everything while no workspace is open (including remote workspaces,
/// whose roots do not exist on this machine).
fn workspace_matches_active(active: Option<&Path>, requested: &Path) -> Result<(), String> {
    let Some(active) = active else {
        return Err(
            "no workspace is open; this command only writes inside the active workspace"
                .to_string(),
        );
    };
    // Canonicalise so `C:/ws` and `C:\ws\.` compare equal; fall back to the raw
    // path when a side cannot be resolved, which then only matches verbatim.
    let resolve = |path: &Path| std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if resolve(active) != resolve(requested) {
        return Err(format!(
            "workspacePath is not the active workspace root: {}",
            requested.display()
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
    if let Err(message) = validate_png_header(&bytes) {
        return Err(WriteCanvasImageResponse::invalid_input(message));
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
    state: State<'_, AppState>,
) -> Result<WriteCanvasImageResponse, String> {
    let active_workspace = state.workspace_path.read().await.clone();
    write_canvas_image_bytes_inner(request, active_workspace.as_deref()).await
}

/// The command body, with the active workspace root passed in rather than read
/// from `AppState`, so the containment rules are unit-testable.
pub(crate) async fn write_canvas_image_bytes_inner(
    request: WriteCanvasImageBytesRequest,
    active_workspace: Option<&Path>,
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
    // The caller does not get to choose which directory tree it writes into.
    if let Err(message) = workspace_matches_active(active_workspace, &workspace_root) {
        return Ok(WriteCanvasImageResponse::path_denied(message));
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

    // A destination that already exists as a *symlink* would make a plain
    // `fs::write` follow the link and land the bytes wherever it points —
    // possibly outside the workspace, while still reporting `written`. The
    // parent canonicalisation above cannot see this, because it only resolves
    // the directory. Reject the leaf explicitly, and also refuse a destination
    // that exists as anything other than a regular file.
    match tokio::fs::symlink_metadata(&target).await {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Ok(WriteCanvasImageResponse::path_denied(format!(
                "relativePath already exists as a symlink and will not be followed: {normalized}"
            )));
        }
        Ok(metadata) if !metadata.is_file() => {
            return Ok(WriteCanvasImageResponse::path_denied(format!(
                "relativePath already exists and is not a regular file: {normalized}"
            )));
        }
        _ => {}
    }

    let bytes_written = bytes.len() as u64;
    match write_through_temp_file(&target, &bytes).await {
        Ok(()) => Ok(WriteCanvasImageResponse::written(normalized, bytes_written)),
        Err(error) => Ok(WriteCanvasImageResponse::backend(format!(
            "failed to write '{}': {error}",
            target.display()
        ))),
    }
}

/// Stages the bytes into a fresh sibling file and renames it over the
/// destination.
///
/// `create_new(true)` is `O_EXCL`: it fails outright if the staging path
/// already exists in any form, so the write itself can never follow a symlink.
/// `rename` then replaces the destination *entry* rather than writing through
/// it, so even if a symlink were planted at the destination between the check
/// above and this call, the bytes still land inside the workspace. Together
/// these give the leaf the same guarantee `canonicalize` gives the parent,
/// without needing `O_NOFOLLOW` (and therefore without a new dependency).
async fn write_through_temp_file(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut staging = target.as_os_str().to_os_string();
    staging.push(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let staging = PathBuf::from(staging);

    let write_result = async {
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)
            .await?;
        tokio::io::AsyncWriteExt::write_all(&mut file, bytes).await?;
        tokio::io::AsyncWriteExt::flush(&mut file).await?;
        drop(file);
        tokio::fs::rename(&staging, target).await
    }
    .await;

    if write_result.is_err() {
        // Never leave a stray staging file behind in an allowlisted directory.
        let _ = tokio::fs::remove_file(&staging).await;
    }
    write_result
}

/// Deletes expired red-mark composites. Best-effort by contract: the front end
/// fires this on panel mount and ignores the outcome, so it must never be a
/// blocking or user-visible failure.
#[tauri::command]
pub async fn prune_canvas_scratch(
    request: PruneCanvasScratchRequest,
    state: State<'_, AppState>,
) -> Result<PruneCanvasScratchResponse, String> {
    let active_workspace = state.workspace_path.read().await.clone();
    prune_canvas_scratch_inner(request, active_workspace.as_deref()).await
}

/// The command body, with the active workspace root passed in rather than read
/// from `AppState`, so the containment rules are unit-testable.
pub(crate) async fn prune_canvas_scratch_inner(
    request: PruneCanvasScratchRequest,
    active_workspace: Option<&Path>,
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
    // Same binding as the write command: without it this deletes scratch files
    // under any directory the caller names. Reported as `invalid_input` because
    // the prune contract has no `path_denied` status and the front end ignores
    // the outcome either way.
    if let Err(message) = workspace_matches_active(active_workspace, &workspace_root) {
        return Ok(PruneCanvasScratchResponse {
            status: "invalid_input".to_string(),
            removed_count: None,
            message: Some(message),
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
///
/// Failure accounting, stated honestly: a file whose `remove_file` fails —
/// read-only attribute, a Windows lock held by a viewer, permissions — is
/// silently skipped and simply not counted in `removedCount`. `removedCount` is
/// therefore "files actually deleted", never "files that were expired", and the
/// command still reports `pruned`. That is intentional for best-effort
/// housekeeping the front end ignores; it is not a claim that the directory is
/// empty of expired files afterwards.
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
    /// Absolute local workspace root. Must be the workspace the app currently
    /// has open; it is checked against `AppState`, not taken on trust.
    pub workspace_path: String,
    /// Workspace-relative path of the image to read. No directory allowlist
    /// here — unlike the write command this reads the owner's own media —
    /// but it must still stay inside that one workspace.
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
    state: State<'_, AppState>,
) -> Result<AnalyzeInfiniteCanvasImageResponse, String> {
    let active_workspace = state.workspace_path.read().await.clone();
    analyze_infinite_canvas_image_with_runtime(
        request,
        active_workspace.as_deref(),
        Arc::new(DefaultCanvasImageAnalysisRuntime),
    )
    .await
}

pub(crate) async fn analyze_infinite_canvas_image_with_runtime(
    request: AnalyzeInfiniteCanvasImageRequest,
    active_workspace: Option<&Path>,
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
    // Same binding as the write commands. Without it a caller can name any
    // directory on the machine and have local images read out and posted to
    // the configured vision model — the file never has to leave the disk for
    // its contents to leave the machine.
    if let Err(message) = workspace_matches_active(active_workspace, &workspace_root) {
        return Ok(AnalyzeInfiniteCanvasImageResponse::failure(
            "path_denied",
            message,
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
        prune_canvas_scratch_inner, prune_scratch_dir, validate_write_request,
        write_canvas_image_bytes_inner, PruneCanvasScratchRequest, WriteCanvasImageBytesRequest,
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

    /// A structurally valid PNG head: signature + a well-formed 1×1 8-bit RGBA
    /// IHDR chunk. Kept as the shared fixture so the header validation runs for
    /// real in every write test rather than against magic bytes alone.
    fn tiny_png_bytes() -> Vec<u8> {
        let mut bytes = PNG_MAGIC.to_vec();
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&1u32.to_be_bytes()); // width
        bytes.extend_from_slice(&1u32.to_be_bytes()); // height
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]); // depth, colour, compression, filter, interlace
        bytes.extend_from_slice(&[0x1F, 0x15, 0xC4, 0x89]); // IHDR CRC
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
        // The allowlist is one of the three barriers against this becoming a
        // general write-to-disk command; each escape shape gets its own case.
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

        // The signature alone is not enough: the IHDR chunk must be there and
        // must be structurally legal. This is what the header check buys over
        // the old eight-byte magic test.
        for (label, payload) in [
            ("magic only", PNG_MAGIC.to_vec()),
            ("magic plus junk", {
                let mut bytes = PNG_MAGIC.to_vec();
                bytes.extend_from_slice(b"\x00\x00\x00\x0DIHDR-not-a-real-image");
                bytes
            }),
            ("zero-sized image", {
                let mut bytes = tiny_png_bytes();
                bytes[16..20].copy_from_slice(&0u32.to_be_bytes());
                bytes
            }),
            ("illegal bit depth", {
                let mut bytes = tiny_png_bytes();
                bytes[24] = 7;
                bytes
            }),
            ("illegal colour type", {
                let mut bytes = tiny_png_bytes();
                bytes[25] = 5;
                bytes
            }),
        ] {
            let mut input = request("media/input/canvas-crops/a.png");
            input.base64_png = BASE64.encode(payload);
            assert_eq!(
                validate_write_request(&input)
                    .expect_err("must reject")
                    .status,
                "invalid_input",
                "payload was accepted: {label}"
            );
        }

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
        let response = write_canvas_image_bytes_inner(
            WriteCanvasImageBytesRequest {
                workspace_path: workspace.to_string_lossy().to_string(),
                relative_path: "media/input/canvas-crops/shot-crop-1.png".to_string(),
                base64_png: BASE64.encode(tiny_png_bytes()),
            },
            Some(workspace.as_path()),
        )
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
            let response = write_canvas_image_bytes_inner(
                WriteCanvasImageBytesRequest {
                    workspace_path: workspace.to_string_lossy().to_string(),
                    relative_path: relative.clone(),
                    base64_png: BASE64.encode(tiny_png_bytes()),
                },
                Some(workspace.as_path()),
            )
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
        let response = write_canvas_image_bytes_inner(
            WriteCanvasImageBytesRequest {
                workspace_path: missing.to_string_lossy().to_string(),
                relative_path: "media/input/canvas-crops/a.png".to_string(),
                base64_png: BASE64.encode(tiny_png_bytes()),
            },
            Some(missing.as_path()),
        )
        .await
        .expect("command must not error out");
        assert_eq!(response.status, "invalid_input");
    }

    #[test]
    fn rejects_windows_reserved_device_names_on_every_platform() {
        // `NUL.png` opens the null device on Windows: the write "succeeds" and
        // no file exists. Rejected everywhere so the contract is one contract.
        for path in [
            "media/input/canvas-crops/NUL.png",
            "media/input/canvas-crops/nul.png",
            "media/input/canvas-crops/CON.png",
            "media/input/canvas-crops/com1.png",
            "media/input/canvas-crops/LPT9.png",
            "media/input/canvas-crops/aux.png",
            ".void/infinite-canvas/scratch/PRN.png",
            ".void/infinite-canvas/scratch/NUL/op-1.png",
        ] {
            let response =
                validate_write_request(&request(path)).expect_err("reserved name must be rejected");
            assert_eq!(response.status, "path_denied", "path was accepted: {path}");
        }
        // Names that merely *contain* a device name are ordinary files.
        for path in [
            "media/input/canvas-crops/nullify.png",
            "media/input/canvas-crops/console.png",
            "media/input/canvas-crops/com10.png",
        ] {
            assert!(
                validate_write_request(&request(path)).is_ok(),
                "path must be accepted: {path}"
            );
        }
    }

    /// Creates a file symlink, returning `false` when the platform refuses
    /// (Windows without developer mode), so the test can skip instead of fail.
    fn try_symlink_file(source: &std::path::Path, link: &std::path::Path) -> bool {
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(source, link).is_ok()
        }
        #[cfg(windows)]
        {
            std::os::windows::fs::symlink_file(source, link).is_ok()
        }
        #[cfg(not(any(unix, windows)))]
        {
            let _ = (source, link);
            false
        }
    }

    #[tokio::test]
    async fn write_refuses_to_follow_a_symlinked_destination() {
        // C1: the parent canonicalisation cannot see a symlink at the *leaf*.
        // A repo clone, a restored backup or a hand-made link can leave one
        // there pointing outside the workspace; the write must not follow it.
        let workspace = temp_workspace();
        let outside = temp_workspace();
        let escape_target = outside.join("pwned.png");
        std::fs::write(&escape_target, b"original outside content").expect("seed outside file");

        let crops = workspace.join("media/input/canvas-crops");
        std::fs::create_dir_all(&crops).expect("create crops dir");
        let link = crops.join("shot-crop-1.png");
        if !try_symlink_file(&escape_target, &link) {
            // Windows without developer mode: nothing to assert, and the
            // symlink_metadata guard is platform-independent anyway.
            let _ = std::fs::remove_dir_all(&workspace);
            let _ = std::fs::remove_dir_all(&outside);
            return;
        }

        let response = write_canvas_image_bytes_inner(
            WriteCanvasImageBytesRequest {
                workspace_path: workspace.to_string_lossy().to_string(),
                relative_path: "media/input/canvas-crops/shot-crop-1.png".to_string(),
                base64_png: BASE64.encode(tiny_png_bytes()),
            },
            Some(workspace.as_path()),
        )
        .await
        .expect("command must not error out");

        assert_eq!(response.status, "path_denied");
        assert_eq!(
            std::fs::read(&escape_target).expect("outside file must still be readable"),
            b"original outside content".to_vec(),
            "the write must not have landed outside the workspace"
        );

        let _ = std::fs::remove_dir_all(workspace);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[tokio::test]
    async fn write_refuses_a_workspace_the_app_does_not_have_open() {
        // C2: `workspacePath` is caller-supplied, so it is only honoured when
        // it names the workspace the desktop app actually has active.
        let active = temp_workspace();
        let foreign = temp_workspace();

        let response = write_canvas_image_bytes_inner(
            WriteCanvasImageBytesRequest {
                workspace_path: foreign.to_string_lossy().to_string(),
                relative_path: "media/input/canvas-crops/a.png".to_string(),
                base64_png: BASE64.encode(tiny_png_bytes()),
            },
            Some(active.as_path()),
        )
        .await
        .expect("command must not error out");

        assert_eq!(response.status, "path_denied");
        assert!(
            !foreign.join("media").exists(),
            "a denied write must not even create directories"
        );

        // With no workspace open at all, nothing is writable.
        let closed = write_canvas_image_bytes_inner(
            WriteCanvasImageBytesRequest {
                workspace_path: active.to_string_lossy().to_string(),
                relative_path: "media/input/canvas-crops/a.png".to_string(),
                base64_png: BASE64.encode(tiny_png_bytes()),
            },
            None,
        )
        .await
        .expect("command must not error out");
        assert_eq!(closed.status, "path_denied");
        assert!(!active.join("media").exists());

        let _ = std::fs::remove_dir_all(active);
        let _ = std::fs::remove_dir_all(foreign);
    }

    #[tokio::test]
    async fn prune_refuses_a_workspace_the_app_does_not_have_open() {
        let active = temp_workspace();
        let foreign = temp_workspace();
        let scratch = foreign.join(".void/infinite-canvas/scratch");
        std::fs::create_dir_all(&scratch).expect("create scratch");
        let stale = scratch.join("stale-mark.png");
        std::fs::write(&stale, b"stale").expect("write stale");
        let long_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(30 * 86_400);
        filetime::set_file_mtime(&stale, filetime::FileTime::from_system_time(long_ago))
            .expect("age the stale file");

        let response = prune_canvas_scratch_inner(
            PruneCanvasScratchRequest {
                workspace_path: foreign.to_string_lossy().to_string(),
                max_age_days: None,
            },
            Some(active.as_path()),
        )
        .await
        .expect("command must not error out");

        assert_eq!(response.status, "invalid_input");
        assert!(stale.exists(), "prune must not reach a foreign workspace");

        let _ = std::fs::remove_dir_all(active);
        let _ = std::fs::remove_dir_all(foreign);
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
        let response = prune_canvas_scratch_inner(
            PruneCanvasScratchRequest {
                workspace_path: "relative/workspace".to_string(),
                max_age_days: None,
            },
            None,
        )
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
            Some(workspace.as_path()),
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
            Some(workspace.as_path()),
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
            Some(workspace.as_path()),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(denied.status, "path_denied");

        let missing = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "not-there.png"),
            Some(workspace.as_path()),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(missing.status, "invalid_image");

        std::fs::write(workspace.join("notes.txt"), b"plain text, not an image")
            .expect("write non-image");
        let not_an_image = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&workspace, "notes.txt"),
            Some(workspace.as_path()),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(not_an_image.status, "invalid_image");

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[tokio::test]
    async fn analysis_refuses_a_workspace_the_app_does_not_have_open() {
        // Reading has no prefix allowlist on purpose, so the workspace binding
        // is the whole of the containment here — and this command posts what it
        // reads to a vision model, so a miss ships the owner's file off the
        // machine. A real, readable PNG is planted in the foreign workspace so
        // the only thing standing between it and the model is the binding.
        let active = temp_workspace();
        let foreign = temp_workspace();
        std::fs::write(foreign.join("private.png"), real_png_bytes()).expect("write fixture png");

        let response = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&foreign, "private.png"),
            Some(active.as_path()),
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(response.status, "path_denied");
        assert!(response.prompt.is_none());

        // No workspace open at all denies everything too.
        let closed = analyze_infinite_canvas_image_with_runtime(
            analysis_request(&foreign, "private.png"),
            None,
            Arc::new(PanicAnalysisRuntime),
        )
        .await
        .expect("command must not error out");
        assert_eq!(closed.status, "path_denied");

        let _ = std::fs::remove_dir_all(active);
        let _ = std::fs::remove_dir_all(foreign);
    }
}
