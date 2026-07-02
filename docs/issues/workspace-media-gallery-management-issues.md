# Workspace Media Gallery Management Issues

## Parent

PRD: `docs/features/workspace-media-gallery-prd.md`

## Risk Boundary

- Keep the right Media gallery as a browser for normalized workspace media state, not a media editor or task monitor.
- Do not put filesystem mutation, deletion policy, generated asset matching, or chat composer mutation directly in `WorkspaceMediaGallery.tsx`.
- Keep generated media identity in the workspace-media service/model layer.
- Keep UI components rendering state and invoking explicit callbacks only.
- Keep file operations behind the workspace-media service/adapter boundary with workspace path safety checks.
- Do not use prompt/model/time-window matching as the primary generated media identity. It is only a future fallback after strong metadata is unavailable.
- Do not implement delete, trash, or media reference behavior before stable identity and `sortAt` are in place.

## Proposed Vertical Slices

1. **Stable media identity and real recent sorting**
   - **Type:** AFK
   - **Blocked by:** None

2. **Delete and Recently Deleted model**
   - **Type:** AFK
   - **Blocked by:** Issue 1

3. **Media reference interface**
   - **Type:** AFK
   - **Blocked by:** Issue 1

4. **Media tile visual and interaction polish**
   - **Type:** AFK
   - **Blocked by:** Issues 1-3 where action buttons are involved

## Issue 1: Stable media identity and real recent sorting

**Type:** AFK
**Blocked by:** None

### What to build

Introduce explicit generated media identity and normalized sorting fields so pending generation placeholders and completed files represent the same logical media slot.

### Acceptance criteria

- [x] Workspace media items can expose `generatedIdentity` with `batchId` and `itemIndex` when the file comes from generated media output metadata or the generated output path convention.
- [x] Workspace media view models expose `stableSlotId` for React keys and future actions.
- [x] Workspace media view models expose `sortAt` as the single recent-sort field.
- [x] Recent sorting uses `sortAt desc`, not a mix of `modifiedAt`, `startedAt`, or array order.
- [x] A ready generated file with the same `generatedIdentity` as a pending placeholder replaces that placeholder as one tile instead of rendering two tiles.
- [x] The replaced tile keeps the pending slot identity and requested placeholder aspect ratio during the transition to avoid masonry jumps.
- [x] User-uploaded/input media also uses `sortAt` and follows recent sorting with new files above old files.
- [x] Tests cover pending-to-ready replacement, stable key identity, `sortAt` sorting, and generated identity extraction.

## Issue 2: Delete and Recently Deleted model

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Add structured delete operations and a Recently Deleted view backed by trash metadata.

### Acceptance criteria

- [x] Media state names use `active`, `trashed`, and `expired`.
- [x] Single delete accepts structured media selection with `id`, `filePath`, `stableSlotId`, `kind`, and `source`.
- [x] Batch delete accepts the same structured media selection array.
- [x] Adapter validates paths are inside the active workspace and belong to currently indexed media before moving files.
- [x] Active gallery scan excludes `.void/media-trash/`.
- [x] Recently Deleted reads trash metadata separately from active media scanning.
- [x] Restore returns media to its original path or handles path conflicts explicitly.
- [x] Permanent delete removes trash entries only after path validation.
- [x] Expired cleanup is exposed as `purgeExpiredTrash(now)` and is testable with injected time.
- [x] Tests cover single delete, batch delete, restore, permanent delete, expired purge, active scan exclusion, and path escape rejection.

## Issue 3: Media reference interface

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Add a structured media reference action from gallery tiles to the active chat composer without mutating chat state directly in the gallery.

### Acceptance criteria

- [x] Define a `MediaReferenceContext` containing kind, file path, preview URL, display name, extension, and source metadata.
- [x] Gallery hover actions call an injected or module-level `addMediaReference(reference)` interface.
- [x] Image, video, and audio references stay typed as their own media kind.
- [x] Unsupported downstream send behavior does not cause video/audio to be disguised as image inputs.
- [x] Duplicate reference clicks do not create duplicate composer chips for the same `stableSlotId` or file path.
- [x] Tests cover image, video, and audio reference payloads without asserting chat implementation details.

## Issue 4: Media tile visual and interaction polish

**Type:** AFK
**Blocked by:** Issues 1-3 where action buttons are involved

### What to build

Polish the tile surface so media type is implied by the preview itself and tile actions feel interactive.

### Acceptance criteria

- [x] Remove the top-left `IMG`, `VID`, and `AUD` badges from ready media tiles.
- [x] Keep pending tiles visually recognizable without using ready-media type badges.
- [x] Video cards keep a play affordance, but the button is smaller and slightly more transparent.
- [x] Hover action buttons include reference/delete affordances only when their backing interfaces exist.
- [x] Action buttons have visible hover, focus, and pressed feedback.
- [x] `prefers-reduced-motion` keeps the UI usable without high-motion effects.
- [x] Tests cover action labels/callbacks and video play affordance presence without relying on CSS internals.

## Issue 5: Visible media batch selection

**Type:** AFK
**Blocked by:** Issues 1-2

### What to build

Add a compact batch selection control to the active Media view so users can select or clear all currently visible, actionable media tiles and then use the existing bulk delete action.

### Acceptance criteria

- [x] Active Media view exposes a select-visible control when there are visible media tiles that can be selected.
- [x] The control selects only the currently visible active media items, respecting the current search and kind filter.
- [x] Activating the control again clears only those visible selected media items.
- [x] Pending generation placeholders are not selected for deletion.
- [x] Existing per-tile selection and existing bulk delete behavior continue to work.
- [x] Tests cover selecting visible media and deleting through the existing service boundary.

## Issue 6: Recently Deleted batch selection

**Type:** AFK
**Blocked by:** Issue 5

### What to build

Reuse the same batch selection control in the Recently Deleted view so users can select or clear all currently visible trash records and then use the existing restore or permanent delete actions.

### Acceptance criteria

- [x] Recently Deleted view exposes the select-visible control when there are visible trash records.
- [x] The control selects only currently visible trash records, respecting search and kind filter.
- [x] Activating the control again clears only those visible selected trash records.
- [x] Existing per-record selection, restore selected, and delete selected forever behavior continue to work.
- [x] Tests cover selecting visible trash records and invoking restore/permanent delete through the existing service boundary.
