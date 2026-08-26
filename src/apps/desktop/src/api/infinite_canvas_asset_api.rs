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
}
