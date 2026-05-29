# Workspace Media Gallery Issues

## Parent

PRD: `docs/features/workspace-media-gallery-prd.md`

## Risk Boundary

- This is a right preview panel content module / tab, not a media editor.
- Do not implement media generation, APIMart polling, media task monitoring, or backend session changes.
- Do not read chat card state as the gallery source of truth.
- Do not put filesystem scanning logic in React page components, BrowserPanel, or chat components.
- Do not use BrowserPanel for pure image/video/audio preview from this gallery.
- Do not auto-switch the active preview tab when the Media entry appears.
- Keep entry visibility driven by explicit workspace media availability state.
- Keep full gallery rendering driven by explicit workspace media library state.
- Keep generated assets appearing through normal workspace file scanning, not through task-specific coupling.

## Proposed Vertical Slices

1. **Workspace media availability detector**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** 1, 2, 3, 16, 17, 21

2. **Media tab entry in the right preview panel**
   - **Type:** AFK
   - **Blocked by:** Issue 1
   - **User stories covered:** 1, 2, 3, 21

3. **Workspace media library scanner**
   - **Type:** AFK
   - **Blocked by:** Issue 1
   - **User stories covered:** 4, 5, 6, 7, 8, 16, 17, 18, 22, 23

4. **Media gallery content module**
   - **Type:** AFK
   - **Blocked by:** Issues 2-3
   - **User stories covered:** 4, 6, 7, 8, 9, 10, 11, 18, 19, 20, 22

5. **Lightweight preview integration**
   - **Type:** AFK
   - **Blocked by:** Issue 4
   - **User stories covered:** 12, 13, 14, 15, 24

6. **Performance, error, and desktop verification hardening**
   - **Type:** HITL
   - **Blocked by:** Issues 1-5
   - **User stories covered:** 16, 17, 18, 20, 25

## Issue 1: Workspace media availability detector

**Type:** AFK
**Blocked by:** None

### What to build

Add a lightweight workspace media availability detector that answers only whether the active workspace contains at least one supported image, video, or audio file. This detector should be fast enough to run in the background for entry visibility and should not perform the full media library scan.

### Acceptance criteria

- [ ] The detector exposes an explicit availability state: unknown, checking, available, unavailable, unsupported, or error.
- [ ] The detector supports image, video, and audio extensions defined by the PRD.
- [ ] The detector ignores high-cost directories such as dependency, build, VCS, and generated output folders that are not useful to browse.
- [ ] The detector stops after finding the first supported media file.
- [ ] The detector handles missing workspace, unsupported runtime, permission failure, and scan errors with explicit states.
- [ ] The detector does not open or switch any right preview tab.
- [ ] UI components consume only the detector interface and do not scan the filesystem directly.
- [ ] Tests cover available, unavailable, unsupported, error, ignored-directory, and first-match behavior.

## Issue 2: Media tab entry in the right preview panel

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Add a Media / 媒体 entry to the right preview panel that is visible only when the workspace media availability detector reports available. Showing the entry must not steal focus or automatically switch away from the user's current preview content.

### Acceptance criteria

- [ ] The Media entry is hidden when availability is unknown, checking, unavailable, unsupported, or error.
- [ ] The Media entry is shown when availability is available.
- [ ] The entry label is localized as Media / 媒体.
- [ ] The entry appears in the right preview panel content-module/tab area, not in BrowserPanel, chat cards, or global app chrome.
- [ ] The entry appearing does not automatically switch the active preview tab.
- [ ] Clicking the entry opens the Media content module.
- [ ] Existing Markdown, Browser, file, and code preview tabs are not closed or replaced by availability detection.
- [ ] Tests cover hidden, visible, click-to-open, and no-auto-switch behavior.

## Issue 3: Workspace media library scanner

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Add a full workspace media library scanner that returns normalized media items for the current workspace. It should classify media by kind, return relative paths and file metadata, sort by modified time descending, respect ignored directories, and report limits or errors explicitly.

### Acceptance criteria

- [ ] The scanner exposes explicit library states: idle, scanning, ready, empty, unsupported, or error.
- [ ] The scanner returns normalized media items with kind, file path, relative path, file name, extension, size when available, and modified time when available.
- [ ] The scanner classifies supported image, video, and audio extensions.
- [ ] The scanner sorts ready items by modified time descending by default.
- [ ] The scanner ignores high-cost directories consistently with the availability detector.
- [ ] The scanner supports a maximum result count and reports when results are truncated.
- [ ] The scanner does not inspect chat cards, media tasks, APIMart state, or BrowserPanel state.
- [ ] Tests cover classification, ignored directories, sorting, empty result, truncated result, unsupported runtime, and error normalization.

## Issue 4: Media gallery content module

**Type:** AFK
**Blocked by:** Issues 2-3

### What to build

Add the right preview Media content module. It should render the workspace media library state as a polished, compact browsing surface with filters, refresh, media cards, and clear empty/error/truncated states.

### Acceptance criteria

- [ ] Opening the Media module triggers or uses the full workspace media library scan.
- [ ] The module renders scanning, ready, empty, unsupported, error, and truncated states.
- [ ] Ready state shows a scan-friendly grid/list of media cards.
- [ ] Filters support All, Images, Videos, and Audio.
- [ ] Default order shows newest modified files first.
- [ ] Cards show file name, relative path, kind, size when available, and modified time when available.
- [ ] Image cards show thumbnails where safe and available.
- [ ] Video and audio cards have clear type-specific presentation without pretending to be images.
- [ ] Manual refresh re-runs the scanner and updates the module state.
- [ ] The module does not edit, generate, delete, move, or rename media files.
- [ ] Tests cover scan trigger, filters, card metadata, refresh, empty state, error state, and truncated state.

## Issue 5: Lightweight preview integration

**Type:** AFK
**Blocked by:** Issue 4

### What to build

Wire Media gallery card clicks to the existing lightweight media preview overlay. Image, video, and audio items should open through the media preview service using local workspace file URLs/paths where supported. BrowserPanel must remain untouched for pure media gallery preview.

### Acceptance criteria

- [ ] Clicking an image item opens the lightweight media preview overlay with image rendering.
- [ ] Clicking a video item opens the lightweight media preview overlay with native video controls.
- [ ] Clicking an audio item opens the lightweight media preview overlay with native audio controls.
- [ ] Preview title and copy value include useful file name/path information.
- [ ] BrowserPanel is not opened for pure media gallery item clicks.
- [ ] Preview behavior reuses the existing media preview service rather than creating a second modal/player.
- [ ] Tests cover image, video, audio, copy/path payload, and no-BrowserPanel dispatch behavior.

## Issue 6: Performance, error, and desktop verification hardening

**Type:** HITL
**Blocked by:** Issues 1-5

### What to build

Verify and harden the workspace media gallery in real desktop workflows, especially large workspaces and preview-first usage with the compact chat floating window. Confirm that the module appears only when useful, does not steal focus, and remains responsive.

### Acceptance criteria

- [ ] Frontend type-check passes.
- [ ] Relevant frontend tests pass.
- [ ] `git diff --check` passes.
- [ ] Desktop app starts successfully.
- [ ] Manual verification confirms a workspace with no media does not show the Media entry.
- [ ] Manual verification confirms a workspace with image/video/audio files shows the Media entry.
- [ ] Manual verification confirms the Media entry appearing does not switch the current active preview.
- [ ] Manual verification confirms opening the Media module displays files by modified time with filters.
- [ ] Manual verification confirms manual refresh sees newly generated media files.
- [ ] Manual verification confirms clicking image/video/audio opens the lightweight media preview overlay.
- [ ] Manual verification confirms BrowserPanel, APIMart, media generation, task polling, backend session schema, and chat cards are unaffected.
- [ ] Manual verification confirms large workspace scanning remains responsive or reports explicit limits/errors.

## Open Review Questions

- Should the Media entry remain visible after a successful availability detection until workspace switch, even if a manual refresh later finds zero files?
- Should SVG render as an image thumbnail in the grid or use a safer file-style preview in MVP?
- Should generated `media/generated/` assets be visually grouped later, or should MVP keep one unified modified-time list?
