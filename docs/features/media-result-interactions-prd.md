# Media Result Interactions PRD

## Problem Statement

Media generation results are currently useful but too passive. A generated image or video can be seen in the chat card, but users cannot quickly reuse a specific result as a reference for the next prompt. Clicking a result opens an external browser tab, which breaks focus in the desktop app. The card also lacks a polished working state and a compact collapsed mode, so long batches can take over the conversation.

## Solution

Keep the chat card as the primary notification and summary surface, then add three low-risk interactions:

1. Hovering a generated image or video shows a small action to use it as a reference. Clicking that action adds the asset to the chat input as an image context and focuses the input.
2. Clicking generated image, video, or audio opens an app-internal media preview tab using the existing right-panel browser shell. The media still renders with the browser's native image/video/audio support.
3. Media generation cards become collapsible and gain a restrained generation animation while polling. Completed batches show a cleaner asset grid, item numbers, summary counts, and failure rows.

## User Stories

1. As a media creation user, I want to reuse a generated image as a reference, so that I can iterate on characters, scenes, and product shots without downloading and re-uploading.
2. As a media creation user, I want to reuse a generated video thumbnail/reference when supported, so that follow-up generation can refer to previous visual output.
3. As a media creation user, I want generated media to open inside the app, so that I do not lose desktop workflow context.
4. As a media creation user, I want audio/video to use native browser playback controls, so that playback remains reliable without custom player risk.
5. As a media creation user, I want large media batches to collapse, so that the conversation stays readable.
6. As a media creation user, I want a visible generation animation, so that I can tell the media job is still actively polling.
7. As a media creation user, I want each generated item to keep its number, so that I can say “use #3 as reference” confidently.
8. As a developer, I want the preview action to reuse the existing right-panel browser tab system, so that no new browser engine or custom media player is introduced.
9. As a developer, I want the reference action to go through the existing context/input path, so that media references are sent to the backend like other image attachments.
10. As a developer, I want URL-backed references to preserve their URL through the image context payload, so that APIMart can receive http/https references without fetching bytes in the frontend.

## Implementation Decisions

- Media result cards remain the only visible entry point for these interactions.
- The right panel opens a `browser` tab with the media URL. This is the app-internal shell and relies on browser-native rendering for image/video/audio.
- The reference action adds an `ImageContext` with `source: "url"` and a stable generated id. It does not download or base64-convert the media.
- The backend payload mapper must preserve URL image contexts as `image_path` so the backend/tool layer can resolve them to APIMart-supported `image_urls`.
- Video and audio preview is view-only in this phase. Only image-like references are added as input image contexts. Video may still be previewed internally.
- Media cards own only UI state such as collapsed/expanded. Batch status remains derived from existing `MediaToolViewModel`.
- No APIMart protocol, Rust job schema, session lifecycle, or external browser behavior changes are required.

## Testing Decisions

- Test the media result view-model and URL reference payload mapping as module behavior.
- Test that URL image contexts are preserved for backend transport.
- Test UI behavior with a lightweight component test where practical: reference action calls the input/reference path and preview action dispatches an internal tab event.
- Run frontend type-check and existing media tool-card tests.
- Run a desktop smoke test to verify hover/click reference and internal preview do not crash.

## Out of Scope

- A custom media player.
- Media asset library, timeline, storyboard, or short-drama production board.
- Download manager.
- Persistent asset metadata beyond existing media batch state.
- Fetching remote media and converting to base64 in the frontend.
- Changing APIMart models or provider behavior.

## Further Notes

Risk is concentrated in UI event routing and URL-backed image contexts. Keep the implementation as two small interfaces:

- `createMediaReferenceContext(asset)` builds an input-safe image context.
- `openMediaPreview(asset)` dispatches the existing right-panel browser tab event.

