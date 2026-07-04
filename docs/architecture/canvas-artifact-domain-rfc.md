# Canvas Artifact Domain RFC

Date: 2026-07-04

Status: Accepted for `ISSUE-1190B` as a documentation contract only.

## Purpose

Upstream BitFun added a broad Canvas product domain. Void should reuse the useful product ideas without importing the upstream runtime, storage, desktop API, iframe bridge, skills, or `core.canvas` exposure.

This RFC defines the Void-owned contract for any future persistent interactive artifact module. It also records which existing Void artifact-like surfaces already have their own source of truth.

## Existing Surfaces

| Surface | Current owner | Source of truth | UI role | Future Canvas-like relationship |
|---|---|---|---|---|
| `GenerativeUI` | Core tool result plus Flow Chat tool card | Tool result payload with `widget_id`, `title`, `widget_code`, dimensions, `is_svg`, and optional modules | Render one chat-scoped HTML/SVG widget | Not persistent artifact state. A future artifact may import the idea of compact, theme-aware generated output, but must not treat a chat card as storage. |
| Miniapps | Miniapp manager/domain modules | Miniapp entity, `meta.json`, source files, storage, permissions, runtime state, and desktop/web MiniApp API | Gallery/scene renders app catalog and runner state | Already a persistent app domain. A future artifact must not bypass MiniApp permissions or reuse MiniApp storage as hidden Canvas storage. |
| AI media | Media tools and workspace media services | `.void/media-jobs/<batch>.json`, `media/generated/<batch>/manifest.json`, saved assets, and workspace media library state | Gallery and tool cards render pending/completed media facts | Media assets may be referenced by a future artifact, but media generation and trash/path safety remain owned by media modules. |
| AI short-drama | `ShortDramaProject` plus short-drama services | `.void/short-drama/manifest.json`, script, artifacts, sidecars, attempts, revisions, change requests, focus, and rebuildable indexes | `ShortDramaCenterPanel` renders and coordinates project state | Short-drama artifacts remain project facts. A future Canvas-like artifact can only project or embed references unless a separate issue changes ownership explicitly. |
| Future persistent interactive artifact | Not implemented | A new Void-owned artifact record with explicit status facts, revision history, compiled payload facts, diagnostics, and workspace/session references | UI may render/inspect artifact state and dispatch commands through the module interface | Requires separate security, runtime, storage, and tool-exposure issues before implementation. |

Current panel facts:

- `ContentCanvas` opens and restores tabs. It is not a media, short-drama, MiniApp, or artifact fact store.
- `canvasStore` is tab/layout state. It must not become persistent artifact storage.
- Flow Chat tool cards and right-side panels render tool results or service view models. They must not become a hidden source of truth.
- A `GenerativeUI` payload may be promoted to a future artifact only through an explicit save/promote command that creates workspace-scoped artifact facts. A chat card or right-side preview is never persistent state by default.

## Candidate Module Interface

A future persistent interactive artifact module should be deep: callers should know one artifact interface rather than renderer, storage, compiler, and tool-runtime internals.

Logical reference rules:

- Use a Void-owned logical reference such as `void-artifact://workspace/{workspaceId}/artifact/{artifactId}` or an equivalent future name accepted by a separate issue.
- Do not expose raw filesystem paths, desktop handles, iframe origins, or session storage paths as artifact identity.
- Reject path traversal, local file URIs, and external URI schemes at the reference parser seam.
- Session links may be metadata, but session-scoped storage must not become the source of truth.

Minimum state facts:

- `artifactId`
- logical artifact reference
- `workspaceId` or workspace root identity
- `kind`
- `status`: `source_saved`, `compiling`, `compiled`, `compile_failed`, `runtime_failed`, `unsupported`, or an accepted Void-owned equivalent
- `source`: `assistant`, `user`, `import`, `tool`, or `system`
- `revision`
- `sourceRevision`
- `latestCompiledRevision`
- `lastKnownGoodRevision`
- `diagnostics`
- `error`
- `createdAt`
- `updatedAt`

Minimum content facts:

- source payload reference
- compiled payload reference
- last-known-good compiled payload reference
- snapshot facts: metadata, source, diagnostics, optional compiled payload, optional runtime state
- dependency/runtime requirements
- theme/runtime governance metadata
- optional links to media ids, MiniApp ids, short-drama coordinates, or Flow Chat tool-call ids

Allowed link fields must stay narrow:

- MiniApp links: app id, name, permission summary, runtime status, catalog metadata, or runner projection.
- AI media links: batch id, item index, media item id, relative path metadata, manifest metadata, preview facts, or thumbnail facts.
- AI short-drama links: project id, stage, episode id, artifact id/handle, revision/attempt summary, media reference, or derived index entry facts.
- `GenerativeUI` promotion inputs: session id, tool call id, tool item id, widget id, title, and widget code.
- Content canvas links: tab/layout projection metadata only.

Artifact records must not copy MiniApp storage, media manifests, generated media files, short-drama manifests, short-drama artifacts, or panel snapshots into artifact-owned state.

Required commands:

- create artifact
- read artifact
- update artifact metadata
- patch source payload with exact unique replacement semantics
- replace full source payload when patch matching is ambiguous or too broad
- compile or validate
- promote last-known-good compiled payload
- list diagnostics
- delete or archive

Every command must return explicit `status/source/error/diagnostic` facts. UI and tool cards must not infer artifact state from missing files, empty arrays, panel open state, iframe messages, or chat transcript text.

Structured diagnostics must carry machine-readable fields such as severity, category, code, message, location, and optional suggested fix. Prose-only diagnostics are not sufficient for UI, tool, or agent repair flows.

Source policy should be a pure rule layer. Before any runtime exists, a future implementation issue must decide allowed source format, import policy, dynamic import policy, dependency policy, size limits, and whether generated code may persist runtime state.

## Required Seams

Recommended ownership chain:

```text
AI/tool event -> Artifact tool/core permission interface -> workspace-scoped artifact facts -> Web ArtifactLibraryService -> Canvas panel projection
```

Storage seam:

- Owns artifact records and revisions.
- Does not write `.void/short-drama`, `.void/media-jobs`, media generated manifests, or MiniApp source/storage unless a separate adapter is explicitly accepted.

Compiler/runtime seam:

- Produces compiled payloads and diagnostics.
- Keeps last-known-good compiled payload facts separate from failed source revisions.
- Must not execute untrusted generated code in the main Web UI context.

Tool seam:

- Exposes artifact commands only after storage and runtime contracts exist.
- Tool results must include typed `status/source/error/diagnostic`, not prose-only failures.
- Readonly manifests must not expose write tools.

UI seam:

- Renders artifact state and dispatches commands.
- Does not own source-of-truth storage, provider calls, path policy, compiler decisions, or runtime permissions.
- `ContentCanvas`, `canvasStore`, Flow Chat tool cards, `ShortDramaCenterPanel`, MiniApp scenes, and generated-widget frames must not directly write artifact facts or infer artifact source/runtime fallback.

Security seam:

- Defines iframe/worker isolation, host bridge methods, path scope, network scope, dependency policy, and workspace/session opener restrictions.
- Must be accepted by `ISSUE-1190D` before any generated runtime is implemented.

## Forbidden Direct Imports From Upstream

Do not import or mirror these upstream pieces in this RFC slice:

- `bitfun-canvas` runtime paths or URI identities.
- Upstream Canvas desktop APIs.
- Upstream iframe bridge or workspace/session opener actions.
- Upstream auto-repair loop.
- Upstream skills registration.
- `core.canvas` mode/tool exposure.
- Session-scoped Canvas storage as source of truth.
- A second source of truth for AI short-drama artifacts or AI media assets.

Do not use future artifact work as permission to directly modify these high-risk surfaces without a separate implementation issue:

- `ChatInput.tsx`
- `FlowChatStore.ts`
- `ContentCanvas.tsx`
- `ShortDramaCenterPanel.tsx`
- content-canvas `canvasStore`
- Flow Chat tool cards
- generated-widget runtime/frame files
- MiniApp scene/runtime files
- desktop MiniApp APIs
- provider adapters
- tool-pack assembly

## Acceptance For Future Implementation

Before any code issue creates a persistent interactive artifact module, it must provide:

- storage contract tests for create/read/update/patch/error paths,
- compiler/runtime tests proving diagnostics and last-known-good behavior,
- UI tests proving panels render explicit state rather than inferring from raw storage,
- security review for generated code isolation and host bridge scope,
- migration safety review for MiniApp, AI media, and AI short-drama ownership,
- theme governance review if generated runtime CSS or tokens are introduced.

## Deferred Questions

- Whether future artifacts are workspace-global, session-linked, or both.
- Whether artifacts can be exported/imported as portable bundles.
- Whether MiniApps and future artifacts share any compiler utilities.
- Whether Flow Chat tool cards should open artifact panels or only link to artifact records.
- Whether generated runtime dependencies are bundled, vendored, or rejected.
