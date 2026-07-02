# Media Workspace Assets Issues

## Applicability Summary

The earlier seven-issue draft is partially applicable after the current `dataUrl` instant reference implementation.

- Old Issue 1, "upload image auto-stage to workspace": **not applicable now**. Replaced by the current instant `dataUrl` reference path.
- Old Issue 2, "make image context readable": **partially complete** for `dataUrl` image id/name references; still relevant for future saved local assets.
- Old Issue 3, "lightweight media card": **still applicable**.
- Old Issue 4, "lightweight media preview": **still applicable** and now higher priority because BrowserPanel is still used for pure media.
- Old Issue 5, "save generated outputs": **still applicable**, but only for generated media outputs, not uploaded reference images.
- Old Issue 6, "asset reuse": **still applicable** for generated/saved assets.
- Old Issue 7, "end-to-end verification": **still applicable** after the preceding issues.

## Risk Boundary

- Do not replace the existing uploaded-image `dataUrl` reference path.
- Do not put filesystem logic in `ChatInput` or media card components.
- Do not use BrowserPanel for pure image/video/audio preview once the lightweight preview issue is implemented.
- Do not modify APIMart request/response contracts.
- Do not change media job polling semantics unless a separate backend design requires it.
- Keep generated asset saving backend-owned.

## Issue 1: Keep Uploaded Images on the Instant Reference Path

**Type:** AFK
**Blocked by:** None
**Status:** Completed; kept as a regression guard.

### What to build

Ensure uploaded and pasted images continue to work as immediate `dataUrl` references and are not re-routed through workspace staging.

### Acceptance criteria

- [x] File uploads keep `dataUrl` even when a browser path exists.
- [x] Clipboard uploads keep `dataUrl`.
- [x] Backend image context payload includes `data_url` when available.
- [x] Session persistence stores only a redaction marker for large data URLs.
- [x] Media tools resolve image id/name to `data_url`.

## Issue 2: Lightweight Media Generation Card

**Type:** AFK
**Blocked by:** None
**Status:** Completed.

### What to build

Make media generation cards compact and batch-friendly. During generation, show a slim status row. After completion, show a thumbnail grid with useful counts and details available on expansion.

### Acceptance criteria

- [x] Generating state defaults to a compact row instead of a tall card.
- [x] Task id is visually de-emphasized or hidden behind details.
- [x] Loader is a lightweight progress line or subtle activity indicator.
- [x] Completed image/video/audio outputs render as a scan-friendly grid.
- [x] Errors and partial failures remain visible when expanded.
- [x] `prefers-reduced-motion` disables non-essential animation.
- [x] No APIMart protocol or polling changes are introduced.

## Issue 3: Lightweight Media Preview for Pure Media

**Type:** HITL
**Blocked by:** None
**Status:** Completed with focused overlay placement.

### What to build

Clicking generated image, video, or audio opens a media-specific in-app preview instead of BrowserPanel. BrowserPanel remains available for webpages, localhost URLs, and HTML artifacts.

### Acceptance criteria

- [x] Image preview uses an image element.
- [x] Video preview uses native video controls.
- [x] Audio preview uses native audio controls.
- [x] Preview supports close.
- [x] Preview supports copying URL and, when available, local path.
- [x] Pure media click does not dispatch to BrowserPanel.
- [x] BrowserPanel behavior for non-media preview is unchanged.
- [x] The implementation documents whether the preview lives in the right panel shell or a focused overlay.

## Issue 4: Save Generated Media Outputs to Workspace

**Type:** AFK
**Blocked by:** Issue 3
**Status:** Completed.

### What to build

When media jobs complete, save generated remote image/video/audio outputs to a deterministic workspace directory and write a manifest for the batch.

### Acceptance criteria

- [x] Generated assets are saved under `media/generated/`.
- [x] Each batch has a unique directory.
- [x] Each batch writes `manifest.json`.
- [x] Manifest records batch id, prompt, model, task ids, remote URL, local path, kind, status, and error.
- [x] Download failures preserve remote URL and error state.
- [x] UI does not download or write files directly.
- [x] Tests cover successful save, failed save, path sanitization, and manifest structure.

## Issue 5: Prefer Local Generated Assets in Cards and Preview

**Type:** AFK
**Blocked by:** Issue 4
**Status:** Completed.

### What to build

After generated outputs are saved locally, media cards and previews should prefer local workspace assets while still falling back to remote URLs when saving is unavailable or failed.

### Acceptance criteria

- [x] Media asset view models expose both remote URL and local path/status when available.
- [x] Card thumbnails prefer local saved assets.
- [x] Preview prefers local saved assets.
- [x] Copy actions distinguish remote URL and local path.
- [x] Failed local save does not hide usable remote media.
- [x] Tests cover local-first and remote-fallback behavior.

## Issue 6: Reuse Generated Image Assets as References

**Type:** AFK
**Blocked by:** Issues 4 and 5
**Status:** Completed.

### What to build

Generated image assets can be added back to the composer as reference images. The reference should use a saved local path when available, or the remote URL fallback when not.

### Acceptance criteria

- [x] Generated image assets show a reference action.
- [x] Reference uses local path when saved.
- [x] Reference uses remote URL when no local path exists.
- [x] Duplicate references do not create duplicate chips.
- [x] Video/audio do not show misleading image-reference actions.
- [x] Tests cover local-path, remote-url, duplicate, and unsupported-kind cases.

## Issue 7: End-to-End Media Workspace Asset Verification

**Type:** AFK
**Blocked by:** Issues 1-6
**Status:** Partially completed by automated verification; desktop smoke remains manual.

### What to build

Verify the full flow from immediate uploaded-image reference through generated output preview, local save, and reuse.

### Acceptance criteria

- [x] Frontend media tests pass.
- [x] Rust media/asset tests pass.
- [x] Type-check passes.
- [ ] Desktop smoke verifies uploaded image prompts do not ask for paths.
- [x] Desktop e2e smoke verifies pure media preview opens the lightweight overlay, not BrowserPanel.
- [ ] Desktop smoke verifies generated asset exists under `media/generated/`.
- [ ] Desktop smoke verifies saved generated image can be referenced again.
- [x] `git diff --check` passes.
