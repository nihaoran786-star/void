# Visual Artifact Boundary Decision

Date: 2026-07-04

Status: Accepted for `ISSUE-1190C` as a documentation contract only.

## Purpose

Upstream BitFun Canvas overlaps with several existing Void surfaces: `GenerativeUI`, MiniApps, AI media, and the AI short-drama canvas. Void should borrow the useful ownership ideas without creating a second source of truth for any existing module.

This decision names the single owner for each visual artifact route and defines when a future persistent Canvas-like artifact may be introduced.

## Route Ownership Matrix

| Route | Single owner | Source of truth | Use when | Must not do |
|---|---|---|---|---|
| `GenerativeUI` | Core `GenerativeUI` tool result plus Flow Chat generated-widget card/panel | Tool result payload: `widget_id`, `title`, `widget_code`, optional dimensions, `is_svg`, and modules | The assistant needs a chat-scoped HTML/SVG widget, chart, compact mockup, diagram, repo map, or lightweight interaction | Persist workspace artifact state, compile revisions, own files, infer project facts, or automatically promote itself into a persistent artifact |
| MiniApp | MiniApp manager/domain, MiniApp API, storage, permissions, and runtime | MiniApp id, metadata, source files, compiled HTML, runtime status, drafts, customization metadata, and permission model | The user needs a reusable toolbox app with its own files, permissions, runtime lifecycle, or editable source | Store hidden Canvas artifacts, bypass MiniApp permission checks, or let a Canvas module edit MiniApp internals without MiniApp APIs |
| AI media | Media tools, media-reference services, workspace media library, media job manifests, and generated asset manifests | `.void/media-jobs`, `media/generated/<batch>/manifest.json`, saved assets, media references, previews, and library events | The workflow creates, imports, previews, organizes, or deletes generated image/video/audio assets | Treat media assets as Canvas documents, expose raw paths/URLs outside media adapters, or move media path safety into UI panels |
| AI short-drama | `ShortDramaProject`, short-drama services, workspace manifest adapter, runtime bridge, and center panel projection | `.void/short-drama/manifest.json`, script, stages, artifacts, attempts, revisions, change requests, dependency indexes, media references, focus, and binding state | The workflow edits short-drama scripts, storyboard/image/video/post artifacts, stage-agent work, revisions, or media references | Let Canvas own short-drama artifacts, write `.void/short-drama` through a generic artifact adapter, or read panel state as project facts |
| Future persistent interactive artifact | A future Void-owned artifact module accepted by separate issues | Logical artifact reference, explicit status/source/error/diagnostics, source and compiled revisions, snapshots, last-known-good compiled payload, and workspace/session links | The user explicitly saves or creates a workspace-scoped interactive artifact that needs persistence, versioning, diagnostics, and runtime isolation | Reuse upstream Canvas identities directly, import upstream runtime/desktop API/iframe bridge/skills, or silently convert chat widgets, MiniApps, media assets, or short-drama artifacts |

## Route Rules

`GenerativeUI` remains compatible with current behavior:

- The core tool accepts raw HTML/SVG in `widget_code` and returns a tool result for the Flow Chat card.
- The Flow Chat generated-widget card may stream, preview, export an image, and open a right-panel tab from the tool result.
- The right-panel tab is a projection of a tool result. Its `_source` metadata helps identify the tool call; it is not artifact storage.
- Editing or saving from the generated-widget panel means updating the current session/dialog turn tool result. It is not workspace artifact save.
- A generated widget may become a persistent artifact only through a future explicit save/promote command that creates artifact state through the future artifact module interface.

MiniApps remain independent:

- MiniApp creation, update, draft, permission diff, runtime status, dependency install, recompile, and customization flows must stay behind MiniApp APIs and manager/domain modules.
- A future artifact may link to a MiniApp id or open a MiniApp-adjacent view only through a deliberate adapter.
- A future artifact must not write MiniApp source files, storage, or permission state as a side effect of artifact compilation.

AI media remains asset-owned:

- Future artifacts may reference media ids, media references, preview handles, or saved asset metadata.
- Media generation, polling, manifest writing, deletion/trash policy, preview resolution, and path safety stay in media modules.
- UI panels must not infer media generation state from raw filesystem paths, public URLs, or empty galleries.

AI short-drama remains project-owned:

- Future artifacts may project or embed short-drama references such as project id, stage, episode, artifact id, media item id, or revision id.
- Creation, mutation, attempts, revision history, change requests, dependency invalidation, stage-agent binding, and workspace manifest IO stay inside short-drama modules.
- `ShortDramaCenterPanel` may coordinate and render state but must not become a generic artifact source of truth.

Allowed references are intentionally narrow:

- MiniApp links may carry `app_id`, name, permission summary, runtime status, catalog metadata, or runner projection.
- AI media links may carry `batchId`, `itemIndex`, `mediaItemId`, relative path metadata, manifest metadata, preview facts, or thumbnail facts.
- AI short-drama links may carry `projectId`, stage, episode id, artifact id/handle, revision/attempt summary, `mediaReference`, or derived index entry facts.
- `GenerativeUI` promotion input may carry `sessionId`, `toolCallId`, `toolItemId`, `widget_id`, title, and `widget_code`.
- `ContentCanvas` links may carry tab/layout projection metadata only.

References must remain references. They must not copy MiniApp storage, media manifests, generated media files, short-drama manifests, short-drama artifacts, or panel snapshots into a second source of truth.

## Future Promotion Gate

Any future route that saves, promotes, imports, or opens a persistent interactive artifact must first define:

- owner module and source of truth,
- logical reference format,
- allowed source formats and dependency policy,
- explicit command interface,
- `status/source/error/diagnostic` result model,
- source revision, compiled revision, snapshot, and last-known-good behavior,
- security isolation and host bridge limits,
- migration rules for links to `GenerativeUI`, MiniApps, AI media, and AI short-drama,
- contract tests for the module interface,
- UI tests proving panels render explicit state instead of inferring from storage, transcript, iframe messages, or panel-open state.
- promotion tests proving the input references the source `sessionId/toolCallId/toolItemId/widget_id` and the output is a new artifact logical reference,
- migration-boundary tests proving artifact storage does not write MiniApp source/storage, `.void/media-jobs`, generated media manifests/files, or `.void/short-drama`.

No automatic promotion is allowed. Missing files, empty arrays, iframe messages, chat transcript text, or an open right panel are never evidence that a persistent artifact exists.

## Forbidden In This Decision

This decision does not approve:

- a new Canvas runtime,
- generated-widget rewrites,
- MiniApp registry or storage rewrites,
- AI short-drama UI or manifest rewrites,
- AI media service rewrites,
- provider changes,
- desktop API changes,
- upstream `bitfun-canvas` identifiers,
- upstream iframe bridge, skills, auto-repair loop, or `core.canvas` exposure.

## Acceptance

- Each visual artifact type has exactly one named owner.
- Existing `GenerativeUI` chat-scoped behavior remains valid.
- Future persistent artifacts require an explicit module interface and tests before implementation.
- Existing MiniApp, AI media, and AI short-drama owners keep their current source-of-truth boundaries.
