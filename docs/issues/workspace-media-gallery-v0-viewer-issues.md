# Workspace Media Gallery v0 Viewer Integration Issues

## Parent

PRD: `docs/features/workspace-media-gallery-prd.md`

Prototype reference: `C:\Users\17949\Desktop\媒体库.zip`

## Context

The current Workspace Media Gallery implementation proves the scanning and preview-service integration path, but the viewing experience is not acceptable yet:

- It can scan many images that cannot render as thumbnails.
- Broken or unsupported media pollutes the main visual wall.
- The grid can compress irregular images into poor shapes.
- The visual layout feels like a generic card grid instead of a media review surface.
- Clicking items must reliably open a usable lightweight preview.

The v0 prototype provides a better visual direction: a compact right-side panel with a masonry media wall, type-specific tiles, search/filter/sort controls, and clearer states. That prototype must be adapted, not copied wholesale.

## Risk Boundary

- Keep the existing workspace media scanner and `WorkspaceMediaLibraryState` as the source of truth.
- Do not replace the scanner with v0 mock data or frontend filesystem logic.
- Do not import Next.js, Tailwind, shadcn, Radix Dialog, or the v0 `components/ui` folder.
- Do not add new runtime dependencies unless a separate issue explicitly justifies them.
- Do not use BrowserPanel for image/video/audio preview.
- Do not modify media generation, APIMart, media task polling, backend session schemas, or chat cards.
- Do not add media business logic to large entry components.
- Keep all visual work scoped to the Workspace Media Gallery surface and small view-model helpers.
- If the implementation requires backend or scanner contract changes, stop and write a separate issue before coding.

## Proposed Vertical Slices

1. **Media tile view-model mapper and renderability guard**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** media files with broken thumbnails do not pollute the main wall; UI consumes explicit render state.

2. **Masonry media wall layout adapted from v0**
   - **Type:** AFK
   - **Blocked by:** Issue 1
   - **User stories covered:** irregular images keep visual rhythm; portrait, landscape, square, video, and audio assets scan well.

3. **v0-style toolbar, filters, sorting, and states**
   - **Type:** AFK
   - **Blocked by:** Issue 1
   - **User stories covered:** users can search, filter, sort, refresh, and understand loading/empty/error/filtered states.

4. **Reliable lightweight preview trigger for masonry tiles**
   - **Type:** AFK
   - **Blocked by:** Issues 1-2
   - **User stories covered:** clicking image/video/audio opens the existing lightweight media preview reliably.

5. **Visual hardening for broken media and non-image assets**
   - **Type:** AFK
   - **Blocked by:** Issues 1-4
   - **User stories covered:** failed images, unsupported thumbnails, video tiles, and audio tiles have deliberate UI instead of blank or broken surfaces.

6. **Screenshot-based desktop verification**
   - **Type:** HITL
   - **Blocked by:** Issues 1-5
   - **User stories covered:** final quality is verified visually in the real app, not only by unit tests.

## Issue 1: Media tile view-model mapper and renderability guard

**Type:** AFK
**Blocked by:** None

### What to build

Add a thin UI view-model layer that maps `WorkspaceMediaItem` into a tile-ready model for the gallery. The mapper should preserve the existing library state boundary while adding presentation-only fields such as display name, path label, media type label, aspect ratio fallback, thumbnail URL, preview URL, sort values, and renderability status.

This slice should prevent broken or non-previewable media from being treated as successful visual thumbnails. It should define which items can enter the primary masonry wall and which should be shown as failed/unpreviewable assets.

### Acceptance criteria

- [ ] A gallery-specific view-model mapper accepts `WorkspaceMediaItem[]` and returns tile-ready media models.
- [ ] The mapper does not access the filesystem, APIMart, chat cards, BrowserPanel, or media task state.
- [ ] Image tiles require a usable `thumbnailUrl` or `previewUrl` to be considered primary-wall renderable.
- [ ] Video tiles can be renderable with a poster/preview URL or a deliberate video placeholder.
- [ ] Audio tiles render through an audio-specific visual model and do not pretend to be images.
- [ ] Items without usable preview data are marked with an explicit failed/unpreviewable render state.
- [ ] Modified time, file size, media kind, and relative path remain available for sorting and display.
- [ ] Tests cover image/video/audio mapping, missing preview URL, fallback aspect ratio, failed/unpreviewable state, and sorting data.

## Issue 2: Masonry media wall layout adapted from v0

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Replace the current equal-card media grid with a masonry-style media wall inspired by the v0 prototype. The layout should use project-local React and SCSS only. It should support mixed tile heights and preserve a strong visual rhythm for portrait, landscape, square, video, and audio assets inside the right preview panel.

### Acceptance criteria

- [ ] The gallery uses a masonry or column-based wall rather than equal-height cards.
- [ ] Portrait assets are not compressed into thin horizontal strips.
- [ ] Landscape and square assets remain visually balanced with portrait assets.
- [ ] Tile layout works in narrow right-panel widths and expanded preview-first widths.
- [ ] Tile gaps are compact and consistent.
- [ ] The layout uses SCSS/CSS already supported by the project, not Tailwind classes.
- [ ] The implementation does not import the v0 `components/ui` folder.
- [ ] Component tests or layout tests cover mixed aspect-ratio item rendering and absence of equal-height forced card behavior where practical.

## Issue 3: v0-style toolbar, filters, sorting, and states

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Adapt the v0 panel structure into the existing gallery: compact toolbar, search, filters, sort controls, media counts, refresh, and clean loading/empty/error/filtered states. The toolbar must stay suitable for an embeddable right-side preview panel, not a full-page app.

### Acceptance criteria

- [ ] Toolbar includes search, refresh, media counts, filters, and sort controls.
- [ ] Filters support All, Images, Videos, and Audio.
- [ ] Sort supports at least Recent, Name, and Size.
- [ ] Search filters by file name and relative path.
- [ ] Empty state distinguishes no workspace media from no filtered matches.
- [ ] Error state exposes the normalized scanner error message and retry/refresh action.
- [ ] Loading state uses a masonry-like skeleton rather than a generic spinner-only state.
- [ ] Toolbar and states are localized through existing locale files.
- [ ] Tests cover search, filters, sort, refresh, loading, empty, filtered-empty, and error behavior.

## Issue 4: Reliable lightweight preview trigger for masonry tiles

**Type:** AFK
**Blocked by:** Issues 1-2

### What to build

Ensure all renderable masonry tiles open the existing lightweight media preview path with the correct kind, title, preview URL, and local path. Do not use the v0 modal, Radix Dialog, BrowserPanel, or a second custom preview system in this slice.

### Acceptance criteria

- [ ] Clicking an image tile dispatches the existing media preview event with `kind: image`.
- [ ] Clicking a video tile dispatches the existing media preview event with `kind: video`.
- [ ] Clicking an audio tile dispatches the existing media preview event with `kind: audio`.
- [ ] The preview payload includes title and local path when available.
- [ ] BrowserPanel is not opened for gallery item clicks.
- [ ] Failed/unpreviewable tiles do not dispatch a broken preview; they show a clear unavailable affordance instead.
- [ ] Tests cover image, video, audio, failed/unpreviewable, and no-BrowserPanel behavior.

## Issue 5: Visual hardening for broken media and non-image assets

**Type:** AFK
**Blocked by:** Issues 1-4

### What to build

Harden the gallery UI so broken thumbnails, unsupported files, videos, and audio do not degrade the visual wall. Failed images should show a deliberate placeholder. Video tiles should show a play affordance and duration when available. Audio tiles should use a compact waveform-like visual, following the v0 prototype direction.

### Acceptance criteria

- [ ] Image load failures update tile presentation to a failed visual state.
- [ ] Failed image tiles no longer appear as blank gray boxes or broken browser icons.
- [ ] Video tiles show a clear video/play affordance and duration when available.
- [ ] Audio tiles show an audio-specific visual, such as deterministic waveform bars.
- [ ] Hover overlay shows file name, relative path, media kind, and available metadata without obscuring the tile permanently.
- [ ] Reduced-motion users do not receive unnecessary hover animation.
- [ ] The main wall remains visually clean when some media cannot be previewed.
- [ ] Tests cover image load failure, video presentation, audio presentation, hover metadata presence, and reduced-motion-safe classes or behavior where practical.

## Issue 6: Screenshot-based desktop verification

**Type:** HITL
**Blocked by:** Issues 1-5

### What to build

Run final verification in the real desktop app and capture screenshots proving the v0-inspired gallery is usable inside the right preview panel. Automated tests are required but not enough for this feature because the primary failure mode is visual: bad masonry layout, squeezed thumbnails, broken tiles, and unusable preview.

### Acceptance criteria

- [ ] Relevant Workspace Media Gallery tests pass.
- [ ] Existing media preview tests pass.
- [ ] Frontend type-check passes.
- [ ] `git diff --check` passes.
- [ ] Desktop app starts successfully.
- [ ] Screenshot: right preview panel with Media entry hidden in a workspace with no media, or documented if no such workspace is available.
- [ ] Screenshot: Media entry visible in a workspace with media files, without auto-switching the current preview.
- [ ] Screenshot: Media tab open with a mixed masonry wall showing portrait, landscape, square, video, and audio tiles where available.
- [ ] Screenshot: no thumbnail is visibly compressed into a thin horizontal line.
- [ ] Screenshot: broken/unpreviewable media is represented with a deliberate placeholder or separate unavailable state.
- [ ] Screenshot: image preview opened from a masonry tile.
- [ ] Screenshot: video or audio preview opened from a masonry tile, with native controls where available.
- [ ] Manual verification confirms BrowserPanel, APIMart, media generation, task polling, backend session schema, and chat cards are unaffected.
- [ ] Manual verification confirms the gallery remains usable in preview-first layout with compact chat floating window open.

## Open Review Questions

- Should failed/unpreviewable media be hidden from the main wall by default, or shown at the bottom as a separate "Needs attention" group?
- Should generated assets under `media/generated/` receive a subtle "generated" grouping later, or should MVP remain one unified wall sorted by recency?
- Should the existing lightweight `MediaPreviewOverlay` eventually adopt the v0 preview visual treatment, or should that remain a separate overlay redesign?
