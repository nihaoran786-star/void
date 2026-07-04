# Canvas Runtime Security Review

Date: 2026-07-04

Status: Accepted for `ISSUE-1190D` as a documentation contract only.

## Purpose

Upstream BitFun Canvas adds a generated React runtime, iframe host bridge, desktop Canvas API, session-scoped state, auto-repair prompts, HTML export, and Canvas skills. These ideas are useful, but Void must not copy the runtime or bridge before a Void-owned security model exists.

This review defines the minimum security gate for any future persistent interactive artifact runtime.

## Upstream Surfaces Reviewed

The reviewed upstream wave includes:

- `src/apps/desktop/src/api/canvas_api.rs`
- `src/crates/assembly/core/src/agentic/tools/implementations/canvas_tools.rs`
- `src/crates/contracts/product-domains/src/canvas/*`
- `src/crates/services/services-integrations/src/canvas/compiler/*`
- `src/crates/assembly/core/builtin_skills/bitfun-canvas/SKILL.md`
- `src/web-ui/src/tools/bitfun-canvas/BitfunCanvasPanel.tsx`
- `src/web-ui/src/tools/bitfun-canvas/runtime/*`
- `src/web-ui/src/flow_chat/tool-cards/CanvasToolCard.tsx`
- `src/web-ui/src/infrastructure/api/service-api/CanvasAPI.ts`

Low-risk ideas worth borrowing later:

- single-file source policy,
- exact unique patch semantics,
- compile diagnostics,
- runtime diagnostics,
- last-known-good compiled payloads,
- narrow SDK surface,
- theme-domain isolation,
- explicit artifact references,
- source/compiled/runtime state separation.

High-risk pieces not approved:

- upstream `bitfun-canvas://` identity,
- upstream desktop Canvas commands,
- upstream iframe host action bridge,
- upstream auto-repair loop,
- upstream skills,
- `core.canvas` tool exposure,
- session-scoped Canvas storage as source of truth,
- generated-runtime HTML export,
- generated-content initiated workspace file or session opening,
- default exposure of Canvas create/update/patch tools without a capability pack and permission gate.

## Current Void Baseline

Void already has a chat-scoped generated-widget runtime:

- `src/web-ui/src/tools/generative-widget/GenerativeWidgetFrame.tsx`
- `src/web-ui/src/tools/generative-widget/widgetInteraction.ts`
- `src/web-ui/src/tools/generative-widget/GenerativeWidgetPanel.tsx`
- `src/web-ui/src/flow_chat/tool-cards/GenerativeWidgetToolCard.tsx`

Current generated widgets run in an iframe with `sandbox="allow-scripts allow-forms allow-modals allow-popups"`. The parent checks `event.source === iframe.contentWindow`, `data.source === 'void-widget'`, and matching `widgetId` before handling messages. The iframe shell posts messages with `targetOrigin: '*'` because it is a `srcDoc` chat-scoped widget. That is acceptable only for current chat-scoped `GenerativeUI`; it is not approved for persistent artifact runtime work.

Current generated-widget bridge actions include:

- resize/ready messages,
- prompt messages through `sendPrompt` / `voidWidget.sendPrompt`,
- context-menu selection,
- `void-widget:open-file` navigation from `data-file-path` / `data-void-open-file`.

These are chat-scoped affordances. They must not become persistent artifact host actions without a new permission model, allowlist, diagnostics, and user confirmation.

MiniApp runtime remains a separate owner with its own files, permissions, storage, runtime state, and APIs. Future Canvas-like artifacts must not reuse MiniApp permissions or bypass them.

MiniApp bridge behavior is not precedent for persistent artifacts. MiniApps may expose `window.app` capabilities through MiniApp-owned permissions, host primitive allowlists, and storage policy. Future persistent artifacts must not reuse MiniApp APIs, MiniApp storage, MiniApp dependency install/recompile behavior, or MiniApp dialog/clipboard affordances unless a deliberate adapter and permission contract is accepted.

AI media and AI short-drama runtimes remain separate product surfaces. Future artifact runtime may reference their facts only through the boundary defined in `docs/architecture/visual-artifact-boundary-decision.md`.

## Required Runtime Security Model

Any future persistent interactive artifact runtime must define these interfaces before implementation.

### Iframe And Worker Isolation

Minimum requirements:

- Default to the narrowest iframe sandbox that can render the accepted source format.
- Do not add `allow-same-origin`, `allow-downloads`, clipboard, top-navigation, popups, or modal permissions without a separate issue and tests.
- If a worker runtime is introduced, isolate worker host methods behind the same action policy as iframe methods.
- Runtime startup must emit explicit `ready`, `unsupported`, `runtime_failed`, or `timed_out` status facts.
- A blank iframe, no message, or delayed startup is not a successful render state.

### Message Validation

Every host-bound message must be validated by a single bridge adapter:

- source window or worker identity,
- origin strategy, including explicit treatment of opaque `srcDoc` or `blob:` origins,
- expected artifact id/reference,
- expected source revision,
- message type allowlist,
- capability token or equivalent unguessable channel binding,
- request id correlation,
- payload schema,
- size limits,
- replay/idempotency policy,
- rate limits for repeated actions,
- explicit `status/source/error/diagnostic` result.

For a persistent runtime, `targetOrigin: '*'` is not an accepted long-term contract. If `srcDoc` or `blob:` forces an opaque origin, the runtime issue must document the origin limitation and compensate with source-window identity, artifact/revision tokens, request ids, payload validation, and action-level permissions.

### Host Action Policy

Generated content must not call host capabilities directly. It may request actions through a policy layer that returns explicit results.

Allowed-by-default host actions:

- report ready,
- report runtime error,
- report measured size,
- request current theme payload,
- request artifact state only for the current artifact and revision.

Separately gated actions:

- save runtime state,
- open workspace file,
- open session,
- fill chat input with element context,
- export HTML,
- download files,
- copy to clipboard,
- network access,
- provider/tool calls,
- media or short-drama reference resolution.

Rejected until a later issue proves safety:

- generated-content initiated session switching,
- generated-content initiated workspace file opening without user confirmation,
- generated-content initiated clipboard writes,
- generated-content initiated HTML export or download,
- hidden writes to MiniApp, media, short-drama, or workspace files,
- host action chains triggered by runtime startup,
- auto-repair loops that send chat messages without user approval.

Workspace file opening, if ever accepted, must canonicalize the requested path, reject absolute paths by default, prove the target stays inside the active workspace or an explicitly allowed root, and return a machine-readable denied/unsupported/error status when the target is outside policy.

Session opening, if ever accepted, must show the target session to the user and require confirmation before switching. Generated content must never directly call session switching APIs.

### User Confirmation

The runtime must require explicit user confirmation before any generated artifact can:

- open a workspace file,
- switch/open a session,
- persist mutable state outside the artifact module,
- export or download generated HTML,
- send a repair prompt,
- request provider/model/tool execution,
- access media or short-drama details beyond already-rendered references.

Confirmation results must be machine-readable. A canceled, timed-out, unsupported, or denied confirmation is not a generic error string.

### Runtime Diagnostics

Runtime diagnostics must be structured and stored with the artifact module:

- severity,
- category,
- code,
- message,
- source revision,
- stack or location when available,
- suggested fix,
- firstSeen/lastSeen,
- dedupe key,
- count,
- source: `runtime`, `host-bridge`, `compiler`, `policy`, or accepted equivalent.

Failed runtime revisions must not replace last-known-good compiled payloads. UI must render explicit runtime failure state and link diagnostics without inferring from iframe blankness.

### Auto-Repair

Upstream auto-repair prompts are not approved for Void persistent artifacts.

Before any repair loop exists, a separate issue must define:

- user confirmation requirements,
- maximum attempts,
- dedupe key,
- cooldown,
- source revision lock,
- what context is sent,
- how repairs stop,
- how failures are surfaced,
- how multi-agent/subagent and BTW child-dialog state is protected.

Auto-repair must never run from iframe startup alone.

### State Persistence

Runtime state must be artifact-owned and revision-aware:

- state save requires artifact id/reference and source revision seen,
- stale revision writes must be rejected or returned as conflict,
- state payloads require a schema version, quota, size limits, write throttle, and sensitive-field policy,
- state writes must be auditable by artifact id/reference, source revision, request id, and source,
- state writes must not touch MiniApp storage, `.void/media-jobs`, media manifests/files, or `.void/short-drama`,
- state load/save must return explicit `ready`, `not_found`, `conflict`, `unsupported`, or `error` results,
- empty state is different from unsupported state.

### CSP, Source, And Bundle Policy

A future implementation issue must decide:

- accepted source format,
- SDK import policy,
- dynamic import policy,
- network/fetch policy,
- inline script/style policy,
- dependency bundling policy,
- bundle size limits,
- generated HTML export policy,
- runtime CSS/token namespace,
- source map and stack trace policy.

Until then, Void must not copy upstream React runtime, runtime bootstrap, Vite Canvas plugin, or generated HTML export service.

Canvas-like tools, if ever exposed, must live in an explicit capability pack. Create/update/patch tools must not default to permission-free global exposure in core agent modes. Readonly exposure must stay separate from write tools.

## Required Tests Before Runtime Code

Any implementation issue that introduces a persistent artifact runtime must include tests for:

- iframe/worker message source rejection,
- wrong artifact id/reference rejection,
- stale source revision rejection,
- unknown action rejection,
- malformed payload rejection,
- oversized payload rejection,
- action rate limiting or dedupe,
- confirmation accepted/denied/timeout paths,
- runtime diagnostic persistence and dedupe,
- failed runtime preserving last-known-good compiled payload,
- blank/no-message iframe producing explicit timed-out or runtime_failed state,
- artifact state writes not touching MiniApp/media/short-drama storage,
- generated content unable to open files/sessions without confirmation,
- generated content unable to write clipboard, export HTML, or download files without confirmation,
- write tools absent from readonly manifests and default core modes unless the capability pack is explicitly enabled.

Static policy tests may be added before runtime implementation, but this review issue does not add runtime code.

## Decision

Void should borrow upstream Canvas security ideas only as requirements. Runtime code, desktop API, iframe bridge, skills, HTML export, `core.canvas`, and auto-repair remain rejected until separate implementation issues satisfy this review.
