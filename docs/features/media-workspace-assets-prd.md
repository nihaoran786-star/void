# Media Workspace Assets PRD

## Current Applicability Review

This PRD supersedes the earlier draft that proposed "upload image -> stage to `.void/media/uploads/`" as the first step.

Current implementation has changed the first phase to an instant reference-image path:

- Uploaded and pasted images keep `dataUrl` in `ImageContext`.
- Message sending passes `data_url` to the backend.
- Backend media tools can resolve image id or image name to `data_url`.
- Frontend and backend persistence redact large data URLs for long-term storage.

Because of that, upload staging is no longer the right first issue. The still-applicable work is:

- Make media generation cards lighter.
- Replace BrowserPanel-based pure media preview with a lightweight media viewer.
- Save generated remote media outputs into the workspace as project assets.
- Let saved/generated assets be reused as references.
- Keep generated asset persistence separate from immediate uploaded-image references.

## Problem Statement

Media generation results currently behave like temporary chat output rather than reusable project assets. Generated images, videos, and audio can be seen in the chat, but clicking them still opens through the right-side BrowserPanel path. That path is useful for webpages and localhost previews, but it feels slow and heavy for pure media.

The product also lacks a clear generated-asset storage path. A user working on AI short dramas, product images, character sheets, scene images, storyboards, or videos needs generated outputs to become workspace assets that can be previewed quickly, reused, copied, and tracked later. The current immediate `dataUrl` reference path solves uploaded-image prompting, but it is intentionally not a long-term asset system.

## Solution

Keep the immediate uploaded-image flow as `dataUrl` based. Add a separate workspace asset flow for generated media results.

The revised staged approach is:

1. Keep uploaded images as immediate `dataUrl` references for current-turn image-to-image workflows.
2. Lightweight media cards: compact generating state, low visual weight, completed asset grid, details only when needed.
3. Lightweight media preview: image/video/audio open in a media-specific in-app viewer, not BrowserPanel.
4. Generated asset persistence: when media jobs complete, save remote output URLs to `.void/media/generated/` with a manifest.
5. Asset reuse: image assets can be referenced again from local saved paths or remote URLs; video/audio expose copyable paths/URLs without pretending to be image references.

## User Stories

1. As a media creator, I want uploaded images to work immediately as references, so that I can say "turn this into..." without providing a file path.
2. As a media creator, I want media generation cards to stay compact while jobs run, so that batch generation does not dominate the chat.
3. As a media creator, I want completed media results to show as a clear thumbnail grid, so that I can quickly compare outputs.
4. As a media creator, I want image previews to open instantly in an image viewer, so that pure media does not pay the BrowserPanel cost.
5. As a media creator, I want video previews to use native video controls, so that playback is reliable and fast.
6. As a media creator, I want audio previews to use native audio controls, so that generated speech or music can be checked quickly.
7. As a media creator, I want generated outputs saved into the workspace, so that remote URL expiry does not destroy project assets.
8. As a short-drama workflow user, I want each generated batch to have a manifest, so that character, scene, storyboard, and video assets keep their prompt and task provenance.
9. As a user, I want to copy remote URL or local path from a media preview, so that I can use assets in other tools.
10. As a user, I want generated image assets to be reusable as reference images, so that iteration is fast.
11. As a developer, I want UI to render media state without guessing storage source, so that BrowserPanel, local files, and remote URLs remain separate concerns.
12. As a developer, I want generated asset saving in a backend service, so that UI never downloads or writes files directly.
13. As a developer, I want clear asset status fields, so that partial download failures do not masquerade as successful local assets.

## Implementation Decisions

- Uploaded user images stay on the current immediate `dataUrl` path. They are not staged to `.void/media/uploads/` in this PRD.
- Generated media persistence is a later backend-owned asset flow under `.void/media/generated/`.
- Media cards must not inspect provider details. They render a normalized media asset view model.
- Pure media preview should use image/video/audio elements in an app-owned preview surface. BrowserPanel remains for webpages, localhost previews, and HTML artifacts.
- The first lightweight preview is implemented as a focused app overlay. It does not instantiate BrowserPanel for pure media, and avoids broad right-panel shell refactoring.
- Generated asset persistence should write a manifest per batch with batch id, prompt, model, task ids, remote URLs, local paths, kind, status, and errors.
- UI should prefer local saved assets when available and fall back to remote URLs when saving fails or is not done yet.
- Image asset reuse should prefer `local_path` when it exists; otherwise it can use remote URL as a URL-backed reference.
- Video and audio should not show an image-reference action unless a supported image-like reference exists.

## Testing Decisions

- Tests should cover module interfaces and user-visible behavior, not internal implementation details.
- Media card tests should cover compact generating state, completed grid, expanded error details, and reduced motion behavior.
- Media preview tests should cover image/video/audio dispatch into a lightweight preview state, not BrowserPanel.
- Generated asset persistence tests should cover remote URL download success, download failure, manifest shape, and path sanitization.
- Asset reuse tests should cover local-path image references, remote URL fallback, duplicate prevention, and unsupported video/audio reference actions.
- End-to-end smoke should verify: immediate uploaded image reference still works, media click opens lightweight preview, generated result can be saved, and saved image can be referenced again.

## Out of Scope

- Replacing the immediate uploaded-image `dataUrl` reference path.
- Building a full media asset library, timeline, storyboard editor, or short-drama production board.
- Changing APIMart request/response contracts.
- Changing media job polling protocol.
- Syncing generated assets to cloud storage.
- Advanced video/audio editing.
- UI direct filesystem writes.

## Further Notes

The old "upload image stage to workspace" issue is not applicable as a first-phase requirement anymore. It may return later as an explicit asset import feature, but it should not block the current immediate reference-image workflow.

## Implementation Status

Implemented in the current development branch:

- Immediate uploaded-image `dataUrl` reference path remains the source of truth for current-turn reference images.
- Media generation cards default to a compact generating row and show completed assets in a grid.
- Pure image/video/audio preview dispatches to a lightweight media overlay instead of BrowserPanel.
- Completed generated media assets are saved by the backend under `.void/media/generated/<batch_id>/`.
- Each generated batch writes `manifest.json` and records `local_path`, `save_status`, and `save_error` where applicable.
- Media card view models expose remote URL, local path, preview URL, and save status.
- Image references prefer saved local paths, fall back to remote URLs, and use stable ids so repeated references do not duplicate chips.
