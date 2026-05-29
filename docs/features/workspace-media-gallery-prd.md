# Workspace Media Gallery PRD

> Status: Draft
> Scope: Right preview panel content module / tab for browsing current workspace media assets
> Non-goal: this is not a media editor, media generator, task monitor, APIMart surface, BrowserPanel extension, chat-card feature, or backend session feature.

## Problem Statement

When the user asks AI to generate images, videos, or audio, the result should be easy to inspect as workspace output. Today the user can see generated media in chat cards and can preview individual media items through the lightweight media preview overlay, but there is no dedicated right-preview surface that gathers all media files already present in the current workspace.

This creates friction in preview-first work. The user wants the floating chat to remain available while the right preview area becomes the primary workspace. In that layout, the user should not need to hunt through the file tree to find newly generated media. The right preview area should be able to show a clean, categorized view of images, videos, and audio files that exist in the active workspace.

## Solution

Add a right preview panel content module / tab called "Media" or "媒体". It appears only when the current workspace is detected to contain at least one supported media file. The module scans the current workspace, classifies media files by kind, displays them in a clean grid/list experience, shows useful file metadata, and opens the existing lightweight media preview overlay when the user clicks an item.

The module is a workspace media browser. It does not edit media, generate media, understand media-generation tasks, or read chat card state. It indexes and presents files from the workspace.

Entry behavior:

- The media entry is hidden while workspace media availability is unknown, unavailable, or unsupported.
- A lightweight background availability check detects whether the active workspace contains at least one supported media file.
- Once availability is detected, the right preview panel shows the "Media" entry.
- Showing the entry does not automatically switch the current preview tab.
- Full scanning and thumbnail loading happen when the user opens the media tab.
- If a later refresh finds no media files, the media panel shows an empty state. The entry may be removed after explicit refresh or workspace switch, but should avoid flickering during normal work.

## User Stories

1. As a preview-first user, I want a Media entry in the right preview panel when my workspace contains media, so that I can inspect generated outputs without searching the file tree.
2. As a preview-first user, I want the Media entry to stay hidden when the workspace has no media, so that the right panel does not gain irrelevant tabs.
3. As a preview-first user, I want the Media entry to appear without stealing focus from my current preview, so that Markdown, Browser, file preview, or code preview work is not interrupted.
4. As a media creation user, I want images, videos, and audio files grouped or filterable by type, so that I can quickly find the asset I need.
5. As a media creation user, I want new generated files to be visible after refresh, so that I can verify AI output from the preview area.
6. As a media creation user, I want files sorted by modification time by default, so that the latest generated assets appear first.
7. As a media creation user, I want each card to show file name and relative path, so that I know where the asset lives in the workspace.
8. As a media creation user, I want media cards to show file size and modified time when available, so that I can distinguish similar outputs.
9. As a media creation user, I want image thumbnails to show in the grid, so that visual comparison is fast.
10. As a media creation user, I want video items to show a representative preview surface or clear video placeholder, so that videos are easy to distinguish from images.
11. As a media creation user, I want audio items to show a clean audio-focused card, so that audio assets are represented without pretending to be images.
12. As a media creation user, I want to click a media item and open the lightweight preview overlay, so that I can inspect it without opening BrowserPanel.
13. As a media creation user, I want video preview to keep native controls, so that playback is reliable.
14. As a media creation user, I want audio preview to keep native controls, so that generated speech or music can be checked quickly.
15. As a media creation user, I want to copy or see the file path from preview, so that I can use the asset in prompts or external tools.
16. As a user with a large workspace, I want scanning to avoid heavy folders like dependencies and build outputs, so that the UI stays responsive.
17. As a user with a large workspace, I want scans to have clear limits and error states, so that the app does not freeze or silently fail.
18. As a user, I want manual refresh, so that I control when the gallery re-scans after AI generates new assets.
19. As a user, I want clear empty state behavior, so that I understand whether no media exists or scanning has not run yet.
20. As a user, I want clear error state behavior, so that file permission or unsupported workspace failures are understandable.
21. As a maintainer, I want UI components to consume a media availability state, so that tab visibility does not guess filesystem details.
22. As a maintainer, I want the media gallery to consume a library state, so that rendering stays separate from scanning and classification.
23. As a maintainer, I want filesystem access behind an adapter, so that React components do not perform recursive scans directly.
24. As a maintainer, I want BrowserPanel to remain responsible for webpages and browser previews only, so that pure media preview stays lightweight.
25. As a maintainer, I want media generation, APIMart, and task polling to remain untouched, so that this gallery cannot regress generation workflows.

## Implementation Decisions

- The feature is a right preview panel content module / tab, not an editor component.
- The user-facing name should be "Media" in English and "媒体" in Chinese locales.
- The module should appear only when a lightweight availability check detects at least one supported media file in the current workspace.
- Displaying the Media entry must not automatically switch the active preview tab.
- Opening the Media tab triggers or uses the full workspace media library scan.
- Manual refresh is required in the MVP. File-watch auto-refresh is intentionally deferred.
- The availability check and full scan are separate concepts. Availability is optimized for fast entry visibility; the library scan is optimized for complete display.
- Supported MVP kinds are image, video, and audio.
- Supported MVP image extensions include png, jpg, jpeg, webp, gif, and svg.
- Supported MVP video extensions include mp4, webm, and mov.
- Supported MVP audio extensions include mp3, wav, m4a, and ogg.
- Default sort is modified time descending, with the newest assets first.
- MVP filters are All, Images, Videos, and Audio.
- Cards should show file name, relative workspace path, media kind, file size when available, and modified time when available.
- Clicking a card uses the existing lightweight media preview overlay.
- BrowserPanel must not be used for pure image/video/audio preview in this feature.
- Scanning should ignore high-cost and low-value directories such as `.git`, `node_modules`, `dist`, `build`, `.next`, `target`, and other existing project-appropriate generated directories.
- Scanning should have a maximum result count and should return an explicit truncated/limited state if limits are reached.
- The UI should render explicit states rather than deriving meaning from empty arrays.
- Filesystem access should be behind a service/adapter boundary. UI and panel entry code should not recursively scan directories directly.
- Media generation cards are not used as an input source for the gallery. The gallery indexes files from the workspace.
- Generated media saved under workspace asset directories should naturally appear because they are files in the workspace, not because the gallery reads generation task state.

The intended state model is:

```ts
type MediaKind = 'image' | 'video' | 'audio';

type WorkspaceMediaAvailability =
  | { status: 'unknown' }
  | { status: 'checking' }
  | { status: 'available'; firstDetectedAt: number }
  | { status: 'unavailable'; checkedAt: number }
  | { status: 'unsupported'; reason: WorkspaceMediaError }
  | { status: 'error'; error: WorkspaceMediaError };

type WorkspaceMediaItem = {
  id: string;
  kind: MediaKind;
  filePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes?: number;
  modifiedAt?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
};

type WorkspaceMediaLibraryState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'ready'; items: WorkspaceMediaItem[]; scannedAt: number; truncated?: boolean }
  | { status: 'empty'; scannedAt: number }
  | { status: 'unsupported'; reason: WorkspaceMediaError }
  | { status: 'error'; error: WorkspaceMediaError };
```

## Testing Decisions

- Tests should cover external behavior and module boundaries, not implementation details of directory traversal.
- Availability tests should cover unknown, checking, available, unavailable, unsupported, and error states.
- Scanner/service tests should cover extension classification, ignored directories, sorting by modified time, result limits, empty result, and scan error normalization.
- Entry tests should prove that the Media entry is hidden without availability, visible when available, and does not auto-switch the active preview.
- Gallery UI tests should cover loading, ready grid, filters, empty state, truncated state, and error state.
- Preview interaction tests should assert that clicking image/video/audio dispatches to the existing lightweight media preview service, not BrowserPanel.
- Localization tests should cover Media labels in supported locale files if locale keys are added.
- Type-check should run for any TypeScript implementation.
- Desktop smoke should verify that a workspace containing media shows the entry, opening it displays assets, refresh sees newly generated files, and clicking media opens the lightweight overlay.

## Out of Scope

- Editing images, videos, or audio.
- Generating media.
- Polling APIMart or media-generation tasks.
- Reading chat card state.
- Changing media generation card behavior.
- Changing generated asset save behavior.
- Changing backend session schemas.
- Changing BrowserPanel behavior for webpages, localhost previews, or HTML artifacts.
- Automatic filesystem watching.
- Thumbnail cache persistence.
- Video hover autoplay.
- Audio waveform rendering.
- Timeline, storyboard, asset manager, or production board workflows.
- Cloud sync or remote media indexing.

## Further Notes

This PRD complements the existing media workspace assets work. The existing asset work makes generated media become workspace files and supports lightweight item preview. Workspace Media Gallery then provides a right-preview browsing surface for those files and any other media already present in the workspace.

The product model should stay narrow:

> Media is an on-demand right preview content module for browsing current workspace media files. It appears only when media exists, never steals the active preview, and opens existing lightweight media preview for inspection.
