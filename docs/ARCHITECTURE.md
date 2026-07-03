# Upstream Migration Architecture

Date: 2026-07-02

## Migration Principle

Upstream code is a reference implementation, not the source of truth. Void module contracts are the source of truth. Accepted upstream behavior must be adapted through existing Void interfaces.

## Module Boundaries

### Web UI

Responsibility:

- Render state.
- Collect user input.
- Call service interfaces.
- Subscribe to typed events.

Forbidden:

- Direct Tauri or filesystem calls in page components.
- Business rules in large composition components.
- Inferring backend capability from empty arrays or string matching.

High-risk files that must remain orchestration-only:

- `src/web-ui/src/flow_chat/components/ChatInput.tsx`
- `src/web-ui/src/flow_chat/store/FlowChatStore.ts`
- `src/web-ui/src/app/components/panels/content-canvas/ContentCanvas.tsx`
- `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx`

### Web Services and Hooks

Responsibility:

- Convert API events into UI state.
- Own state transitions.
- Own workspace media and short-drama view models.
- Provide testable module interfaces.

Key protected services:

- `WorkspaceMediaLibraryService`
- `WorkspaceMediaRefreshSignal`
- `ShortDramaLibraryService`
- `ShortDramaRuntimeBridge`
- `ShortDramaWorkspaceManifestAdapter`
- `BtwThreadService`

### Rust Core

Responsibility:

- Agent runtime.
- Tool contracts.
- Session, goal, subagent, and tool execution semantics.
- Workspace-scoped file operations through controlled tools.

Protected contracts:

- `SessionManager -> Session -> DialogTurn -> ModelRound`.
- Tool permission and readonly/concurrency flags.
- `ShortDramaProject` tool as the controlled AI short-drama project interface.
- Media tool APIMart submission, polling, and workspace save contracts.

### AI Provider Adapters

Responsibility:

- Own provider HTTP/SSE requests, response mapping, stream parsing, tool-call aggregation, model discovery, and health checks.
- Return structured connection-test diagnostics through `ConnectionTestResult` fields such as `message_code`, `error_category`, and `error_details`.
- Own provider stream handler lifecycle: dropping the adapter-returned stream or closing the handler event receiver must stop provider handler work without redefining core turn cancellation.

Forbidden:

- UI, settings pages, desktop entrypoints, or installer frontends must not classify provider failures by matching raw error strings.
- Connection-test classification must not change provider catalogs, model config schemas, retry policy, or core business retry behavior.
- Stream handler cancellation must not change completed-stream usage/tool-call delivery, adapter transport retry, or core/business retry.
- Provider/service owner migration requires a separate decision; `void-ai-adapters` remains the default provider transport owner.

### Desktop Tauri Adapter

Responsibility:

- Native windows.
- Tray.
- OS integrations.
- Terminal adapter.
- Computer Use host.
- WebDriver bridge.

Forbidden:

- Moving terminal domain logic into `terminal_api.rs`.
- Moving Computer Use policy into UI.
- Replacing Void window labels or URL parameters with upstream labels.

### Installer and Brand

Responsibility:

- Void installer flow.
- Void desktop identity.
- Icons, registry keys, updater identity, product names.

Forbidden:

- Any upstream BitFun installer or brand replacement.

### Build and Governance Scripts

Responsibility:

- Root package/workspace metadata.
- Repository hygiene, i18n, theme, CI, build, and release orchestration.
- Delegating commands into owned module directories.

Required boundary:

- Root `package.json` is an orchestration layer only.
- Scripts must use Void paths and environment names.
- i18n/theme governance baselines must describe current Void output, not upstream BitFun output.
- Theme bootstrap generated manifests are derived from Web UI `builtinThemes` only and live under Web UI theme preset governance until a separate desktop consumption issue is accepted.
- Relay static homepage shared terms are page-scoped generated artifacts: `scripts/generate-i18n-contract.mjs` may emit `src/apps/relay-server/static/homepage/i18n.shared.json` from `src/shared/i18n/resources/shared/**/terms.json`, but the static homepage must not import Web UI, mobile, installer, or core locale catalogs.

Forbidden:

- Adding product behavior or UI state logic to root scripts.
- Copying upstream package identity, `BITFUN_*`, `__BITFUN_*`, `BitFun-Installer`, release targets, or installer bundle metadata.
- Using root scripts to bypass module-owned tests or service boundaries.
- Changing desktop startup/theme behavior from a generation script without a separate desktop adapter issue.

## Data and Event Flows

### Flow Chat and Session Restore

```text
UI input -> FlowChatManager/BtwThreadService -> Agent API/Tauri adapter -> Rust agent runtime -> agentic events -> FlowChatStore -> UI render
```

Required state model:

- session identity,
- `SessionHistoryState`,
- `SessionContextRestoreState`,
- `parentSessionId`,
- `sessionKind`,
- `btwOrigin`,
- `subagentType`,
- model round/tool item ordering.

### Workspace Media

```text
Media tool -> APIMart -> .void/media-jobs/<batch>.json -> media/generated/<batch>/manifest.json -> WorkspaceMediaLibraryService -> gallery tiles
```

Required state model:

- `WorkspaceMediaAvailability`
- `WorkspaceMediaLibraryState`
- `WorkspaceMediaPendingGeneration`
- `WorkspaceMediaTrashStateResult`
- stable pending-to-ready identity: `batchId + itemIndex`

### AI Short Drama

```text
Media session -> ContentCanvas -> ShortDramaCenterPanel -> ShortDramaLibraryService -> .void/short-drama facts
Agent/tool event -> ShortDramaRuntimeBridge -> artifact status/media reference -> UI
```

Required state model:

- `ShortDramaLibraryState`
- explicit `ready/empty/mismatch/unsupported/error`
- stage agent binding state
- focus state
- artifact attempts/revisions/change requests
- workspace mismatch state

## Upstream Adaptation Rules

1. Compare upstream behavior first.
2. Decide whether the behavior belongs in UI, service, core, adapter, or docs.
3. Add or update tests for the module interface.
4. Implement the smallest vertical slice.
5. Run the issue-specific verification.
6. Update docs.

## Theme Visual Governance

`scripts/theme-visual-governance-contract.json` is the Void-owned surface checklist for theme-sensitive visual review. It covers app shell, Flow Chat, terminal, markdown/mermaid, generated widgets, AI media and short-drama canvas, mobile web, and installer surfaces.

`scripts/validate-theme-visual-contract.mjs` validates contract shape, required surface coverage, ownership paths, allowed platform/form-factor/theme/evidence values, protected contracts, and upstream identity leakage. The validator is a QA governance boundary only; it must not import UI modules, change theme tokens, infer business state, or replace screenshot/manual review when a future issue changes visuals.

## Rejected Architectural Moves

- Whole-repo merge.
- Whole-file replacement of large local files.
- Upstream crate layout migration.
- BitFun root config restoration.
- Direct UI access to filesystem, process, terminal, window, or provider APIs.
- Treating derived indexes as short-drama source facts.
- Treating absent history/media/subscriptions as meaningful business state.

## Hard Interface Contracts

### Flow Chat, BTW, and Subagent

Interface ownership:

- `FlowChatManager` owns user-message orchestration, backend session readiness, queued input handling, and event module coordination.
- `BtwThreadService` owns BTW child session creation, transient child send flow, parent-child origin updates, and parent backend-session readiness.
- `FlowChatStore` owns UI state projection, session metadata restore, history hydration states, and turn/model-round item ordering.
- BTW components render child session state and review actions; they must not own parent-child relationship semantics.
- Session APIs/adapters are transport and persistence boundaries only.

Protected fields:

- `sessionId`
- `workspacePath`
- `workspaceId`
- `remoteConnectionId`
- `remoteSshHost`
- `historyState`
- `contextRestoreState`
- `isPartial`
- `loadedTurnCount`
- `totalTurnCount`
- `parentSessionId`
- `sessionKind`
- `parentToolCallId`
- `subagentType`
- `btwThreads`
- `btwOrigin`
- `isTransient`
- `agentBackedTransient`

Protected events:

- `agent:subagent-session-linked`
- `agent:tool-run-event`

Forbidden:

- Inferring business state in UI from empty `sessions`, empty `turns`, missing `historyState`, URL parameters, adapter names, or raw strings.
- Moving BTW parent-child, fork, background-result, or review-readonly semantics into UI components.
- Copying upstream `FlowChatStore.ts`, `BtwThreadService.ts`, or Flow Chat container files wholesale.

Long-session performance migration boundary:

- Upstream Flow Chat long-session fixes are accepted only as sliced, test-first changes. Pure render helpers such as model-round progressive rendering and virtual message height estimates may be introduced before store or history-hydration changes.
- `VirtualMessageList` may own viewport-local scroll, follow-output, visible-range, session-boundary, handoff-overlay, and initial render-window behavior. It must not mutate `FlowChatStore` state, infer history support from empty arrays, or derive AI media/short-drama state from transcript text. `ISSUE-130C` limits itself to a pure default-height estimate helper and `defaultItemHeight` wiring based on `activeSession.isHistorical` plus current `virtualItems`; `ISSUE-130E2` enables only a gated static-scroller initial history window with DOM navigation adapters. `heightEstimates`, `firstItemIndex`, projection handoff, and deferred hydration remain separate issues.
- `ModelRoundItem` may apply presentation-only progressive rendering for completed oversized rounds. It must preserve item order, streaming/running visibility, `MediaGenerationToolGroupCard` grouping, and task/subagent projection rendering. `ISSUE-130B` implements this with component-local rendered-group count/timer state only; synthetic AI media groups and `Task` subagent groups disable progressive slicing for that round so media results and subagent projection remain visible until separate protected-group-aware slicing policies exist.
- `CodePreview` may limit streaming preview rendering to a viewport-aware tail plus character budget. Completed, non-streaming code preview must still receive the full content. CodePreview performance harnesses must use Void naming and stay out of production entry paths.
- Terminal output preview budgeting belongs to Flow Chat terminal tool-card presentation or terminal preview pure helpers only. Terminal replay/history facts remain owned by terminal services/core. `ISSUE-130H` may pass bounded live/final preview strings into the Flow Chat card renderer, but it must not mutate stored tool output, terminal sessions, replay events, or ACP permission actions.
- Deferred full-history hydration remains a separate high-risk store/API design issue. It must not be bundled with virtual-list layout, model-round rendering, code preview, or terminal preview changes. `ISSUE-130G1` accepts only the frontend store/API-facing contract: `Session` and `RestoreSessionViewResponse` may expose optional `isPartial`, `loadedTurnCount`, and `totalTurnCount`; `FlowChatStore` is the only conversion layer; partial ready history keeps `isHistorical: true`; full projection completion clears partial fields only through a session-scoped store method. `ISSUE-130G2` may add a frontend scheduler that starts one full-history follow-up after a partial view restore and applies it through that guarded store method, but it must not change `AgentAPI.restoreSessionView` request shape, backend commands, virtual-list UI, terminal, AI media, or AI short-drama modules.

### Runtime Ports and Agent Tools

Required boundary:

- Runtime scheduling, registry, session branching, prompt cache, running-turn continuation, background result delivery, and review-subagent readonly policy remain in product runtime/core unless an issue records a specific migration decision.
- `void-runtime-ports` may contain DTOs, traits, and decision primitives only.
- `void-agent-tools` may contain portable tool contracts only.
- Tool manifest metadata has two explicit layers: `DynamicToolDescriptor` remains the current provider-list wire contract (`name`, `description`, `inputSchema`, optional `providerId`), while richer dynamic provider subtype facts such as `providerKind` and MCP `serverId/serverName/toolName` remain registry metadata exposed through `DynamicToolInfo`. Do not infer provider identity from dynamic tool names.
- Readonly manifest snapshots are defined by `is_readonly() && is_enabled()`. Disabled readonly tools must not be exposed as readonly-enabled merely because their readonly flag is true.
- Tool approval/rejection/timeout outcome classification belongs to the core tool pipeline boundary. Pipeline helpers may map errors to stable status/source/category/error_code/retryable facts; UI surfaces must consume explicit outcome state and must not infer user rejection, confirmation timeout, runtime denial, or collapsed-tool gate denial from prose.
- `void-tool-packs` owns provider group planning and order only. It does not own concrete tool behavior, MCP lifecycle, provider adapters, media services, or short-drama services.
- MCP ordinary-request timeout has separate remote and local contracts. Remote Streamable HTTP keeps its existing bounded request timeout in `RemoteMCPTransport`, with `await_with_optional_timeout` as the single helper that maps remote request futures into typed timeout outcomes. `MCPConnection::new_remote_with_request_timeout` is an explicit injection path for tests and controlled callers; the default remote constructor still uses the production timeout. Local stdio `MCPConnection` owns a distinct optional ordinary request timeout that must not reuse or inherit initialize timeout. The current production local default remains delegated to the outer tool pipeline timeout until a separate config issue wires a default. Local timeout paths must remove pending response waiters and return `MCPRuntimeErrorKind::Timeout`.
- Current Void keeps its existing Rust workspace crate graph as the authoritative layout. Upstream-style crate reorganization is not accepted as a bulk move; boundary changes must be split into explicit issues with manifest, dependency, and behavior tests.
- `scripts/check-core-boundaries.mjs` is the static governance check for this layout. It must keep owner file anchors for runtime scheduling, dialog preempt policy, remote runtime host adapters, remote command handler traits, and initial-sync handlers so future migrations cannot silently weaken current module boundaries.
- Upstream tool/event ABI and plugin-runtime owner moves are planning inputs only. Current Void already owns local boundary equivalents such as `ToolCatalogSnapshotProvider`, `RuntimeEventSink`, runtime-port DTOs, and product-runtime tool assembly. Future owner migration candidates must be split before code: tool snapshot ABI, event projection manifest, plugin runtime/capability boundary, MCP runtime owner, ExecCommand/tool-runtime owner, and remote file/helper owner. Each candidate needs behavior-equivalence tests and must preserve Flow Chat, multi-agent/subagent, AI media, AI short-drama, MCP timeout, and provider boundaries before any crate move or event shape change.

Forbidden:

- Moving `ToolUseContext`, concrete tools, workspace services, cancellation tokens, session file-read state, or tool-result filesystem writes into `void-agent-tools`.
- Making `void-agent-tools`, `void-runtime-ports`, or `void-core-types` depend on `void-core`, Tauri, app crates, process runtime, or provider network runtime.
- Weakening recursive subagent restrictions or review-subagent readonly behavior.
- Adding provider-specific OpenAI Responses or Codex ChatGPT flat tool schemas to core portable tool contracts.
- Expanding `DynamicToolDescriptor` or model-facing tool schemas to carry MCP subtype metadata without a dedicated contract issue and compatibility tests.
- Reusing initialize timeout as local stdio ordinary-request timeout or representing MCP request timeout as a UI fallback string.
- Renaming crates, moving crate directories, or changing Cargo manifests as an incidental follow-up to upstream migration inventory.

### Provider Adapters

Interface ownership:

- `src/crates/ai-adapters` owns provider HTTP/SSE transport, provider stream parsing, and conversion into `UnifiedResponse`.
- Integration fixtures under `src/crates/ai-adapters/tests` own provider replay inputs and expected public adapter output.
- Core agent runtime consumes unified adapter output and must not depend on provider-specific fixture internals.
- Legal AI provider HTTP/SSE owner paths are `src/crates/ai-adapters/src/**` and `src/crates/ai-adapters/tests/**`.
- A future service adapter may own provider HTTP/SSE only when a specific issue and decision name that adapter explicitly. `services-integrations` MCP Streamable HTTP/SSE ownership is not a blanket AI provider transport owner.
- `src/crates/core/src/**` may keep provider config, credential, model-selection, and unified adapter consumption facts, but must not own provider-specific OpenAI/Anthropic/Gemini HTTP transport or SSE stream parsing.
- `src/crates/product-domains/src/**`, `src/crates/agent-tools/src/**`, `src/crates/runtime-ports/src/**`, and `src/crates/core-types/src/**` must not own provider HTTP/SSE runtime.

Required boundary:

- Parser and retry migrations must first add or update focused adapter tests.
- Fixture harnesses should call public adapter APIs, not private provider internals, unless a later issue records a narrower test-only need.
- Provider-specific parser fixes must remain split by provider family: OpenAI/Responses, Anthropic/Gemini, retry transport, and model selector/credential helpers.
- `scripts/check-core-boundaries.mjs` owns the static guard for provider HTTP/SSE ownership under `forbiddenContentUnderRules`.
- OpenAI Chat Completions content-part array recognition belongs to `OpenAIMessageConverter`; only fully valid `text`/`image_url` arrays may become multimodal content, while plain JSON arrays stay text.

Forbidden:

- Copying upstream `bitfun_*` crate names, event types, globals, or crate layout into Void.
- Folding provider-specific OpenAI/Responses/Gemini/Anthropic parsing assumptions into core portable tool contracts.
- Combining retry policy changes with provider parser rewrites in one issue.
- Adding provider-specific HTTP/SSE transport or provider stream-parser imports to core/product/domain/portable contract crates as an incidental upstream-sync change.

### Image Understanding

Interface ownership:

- `src/crates/core/src/agentic/image_analysis/*` owns image loading, data URL decoding, size/provider limits, multimodal message construction, and `ImageAnalyzer` runtime behavior.
- `src/crates/core/src/agentic/tools/image_context.rs` owns temporary image context references by image id, file name, path, or data URL. It must not call models or enforce provider policy.
- `ToolUseContext` owns workspace identity, remote/local path resolution, read policy, primary-model capability facts, and tool execution context.
- `AnalyzeImage` lives under `src/crates/core/src/agentic/tools/implementations/` and is registered through `void-tool-packs` plus `ProductToolRuntime`.
- `AnalyzeImage` resolves exactly one source (`image_id`, `image_path`, or `data_url`) and maps runtime outcomes into explicit statuses. `image_path` must resolve through `ToolUseContext` and remain inside the current workspace before any bytes are read.
- `AnalyzeImage` is the only conversion layer for inline `data_url` tool input. It must reject oversized, unsupported MIME, and unrecognized image payloads before provider runtime execution; UI, Flow Chat, media, and short-drama modules must not duplicate this policy.
- `AnalyzeImage` may call the configured image-understanding model through existing `image_analysis` and `AIClientFactory` infrastructure. It must not add provider-specific wire logic; provider payload conversion stays in `src/crates/ai-adapters` or existing image-processing helpers.
- `src/crates/ai-adapters` owns provider-specific OpenAI/Responses, Anthropic, and Gemini multimodal request conversion only.
- Flow Chat, media gallery, and short-drama UI/services may render image analysis state, but must not own provider calls, path policy, or schema interpretation.
- BTW child-session follow-up image contexts are a Flow Chat service-boundary concern: `MessageModule` may package already-normalized `BackendImageContextPayload` from composer options, and `BtwThreadService` remains the only transient BTW send layer that maps it into `btwAPI.askStream`. `ChatInput.tsx`, `BtwSessionPanel.tsx`, media services, short-drama services, and provider adapters must not infer provider/path/model capability for this flow.

Required state model:

- `completed`
- `unsupported_model`
- `provider_not_configured`
- `missing_workspace`
- `path_denied`
- `invalid_image`
- `error`

Required follow-up split:

- `ISSUE-100B` defined schema, output status, readonly behavior, path permission, model configuration contract, and manifest/catalog tests.
- `ISSUE-100C` implemented runtime execution after `ISSUE-100B`, reusing existing image analysis and adapter boundaries.

Forbidden:

- Copying upstream assembly crate layout, runtime URI names, upload temp paths, or product identity.
- Adding provider request logic to Flow Chat UI, workspace media services, short-drama services, desktop API handlers, or media generation tools.
- Treating empty image arrays, missing provider fields, or absent workspace path as success.
- Letting a readonly image tool bypass workspace read policy merely because it does not write files.

### Workspace Media

Interface ownership:

- Rust media tools own provider request validation, APIMart job submission, polling result creation, and workspace-scoped save metadata.
- `.void/media-jobs` owns pending and completed job facts.
- `media/generated/<batch>/manifest.json` owns saved media batch enrichment facts.
- `WorkspaceMediaLibraryService` owns scanning, enrichment, pending placeholders, trash operations, and unsafe path rejection.
- Gallery components render only `WorkspaceMediaLibraryState` and user commands exposed by service methods.

Protected events:

- `void:open-workspace-media`
- `void:workspace-media-refresh`

Forbidden:

- Deriving gallery state from chat transcript text.
- Moving `.void/media-jobs`, manifest parsing, trash path safety, or pending-to-ready identity logic into UI components.
- Bypassing `WorkspaceMediaLibraryService` for UI-facing media state.

### AI Short Drama

Interface ownership:

- `.void/short-drama/manifest.json` and sidecars are source facts.
- Derived indexes are rebuildable cache, not source facts.
- `ShortDramaProject` Rust tool is the controlled AI write/read interface for short-drama project facts.
- `ShortDramaWorkspaceManifestAdapter` owns workspace-scoped manifest IO in Web UI services.
- `ShortDramaRuntimeBridge` maps tool/subagent events into project status changes.
- `ShortDramaCenterPanel` renders and coordinates panel interactions only.
- Short-drama image-understanding bridge data must enter through `ShortDramaProject` as low-context artifact/reference metadata. Main AI context exports may expose media ids, active-media summaries, preview/playable availability, and recommended short-drama tools, but must not include raw `mediaReference`, `previewUrl`, `thumbnailUrl`, `localPath`, `filePath`, public CDN URLs, data URLs, or raw bytes. `AnalyzeImage` remains a generic image-context tool and must not read short-drama project state or right-panel UI state directly.

Protected events:

- `void:open-short-drama-center`
- `agent:tool-run-event`

Forbidden:

- Writing `.void/short-drama` directly from UI components.
- Silently overwriting existing `manifest.json` or `script.md`.
- Letting stage agents bypass stage tool policy or cross-stage change requests.
- Hiding workspace mismatch by merging another workspace's events into the current panel.

### Desktop, Terminal, and Computer Use

Interface ownership:

- Desktop Tauri APIs are native adapters only.
- Terminal domain logic remains in terminal service/core boundaries.
- Terminal UI state and xterm behavior remain under `src/web-ui/src/tools/terminal`; Flow Chat tool cards render terminal tool state and must not infer PTY/session internals.
- Terminal replay/history facts are owned by `src/crates/terminal`, with `terminal_api.rs` limited to DTO/command/event adaptation.
- Current terminal owner chain is Web `TerminalService`/`useTerminal` -> desktop `terminal_api.rs` adapter -> `terminal-core` `TerminalApi`/`SessionManager` -> PTY/session/replay owner. `void-runtime-ports` must not acquire terminal-core, PTY, Tauri, or remote SSH implementation ownership without a separate implementation issue.
- Computer Use strategy and policy remain behind `ComputerUseHost` and core tool contracts.
- Platform-specific capture/input implementations remain under desktop platform adapters.
- Computer Use terminal/GVim detection is an input-routing concern, not a terminal service concern.

Forbidden:

- Moving terminal domain logic into `src/apps/desktop/src/api/terminal_api.rs`.
- Adding `SessionManager`, `TerminalReplayHistory`, PTY, or replay-event ownership to `terminal_api.rs`, `Flow Chat`, or `void-runtime-ports`.
- Replacing the local terminal crate with upstream `src/crates/services/terminal` layout.
- Whole-file replacement of `Terminal.tsx`, `ConnectedTerminal.tsx`, or `TerminalToolCard.tsx` to import upstream behavior.
- Moving Computer Use permission, verification, or policy logic into Web UI.
- Replacing desktop host lifecycle with upstream BitFun window labels, bundle ids, updater names, registry keys, or global names.

Accepted terminal migration slices:

- Lazy terminal output rendering stays in the Web UI renderer layer.
- Input queue and paste policy stay in Web UI terminal utilities and are consumed by `ConnectedTerminal`.
- IME/key rollover safety stays in Web UI terminal utilities and is consumed by `Terminal.tsx`; the component may wire xterm/helper-textarea events but must not duplicate the rollover decision inline.
- Resize repaint guard stays near xterm output handling, with pure utility tests before integration.
- Structured replay crosses terminal core, desktop DTOs, and Web UI types/hooks only through explicit replay event interfaces.
- Terminal history availability crosses the desktop/Web boundary through explicit `historyStatus`, `historySource`, `errorCode`, and `error` fields. Remote unsupported history is not equivalent to successful local empty history, and UI/entrypoints must not infer source or failure from empty `events` or empty `data`.
- Terminal/GVim detection for `type_text` stays under desktop Computer Use input routing.

Structured replay contract:

- `pty/process.rs` owns low-level PTY child lifecycle. Natural child completion must emit `PtyEvent::Exit { exit_code }` through the existing PTY event stream; callers must not infer process exit from missing output, EOF, empty history, or closed UI state.
- `terminal-core` session owns ordered replay facts as `{ cols, rows, data }` events.
- Empty `data` is a resize marker; non-empty `data` is raw terminal output written after applying its `cols`/`rows`.
- Terminal API and desktop Tauri DTOs must keep legacy flat `data/historySize/cols/rows` fields while adding `events`.
- Web UI normalizes history at the terminal hook boundary; `ConnectedTerminal` may replay xterm resize/data queue items, but replay resize must not call backend `terminal_resize`.
- `useTerminal` owns the frontend replay/live-event ordering contract: it fetches history, subscribes to session events, drains pending session events through a replay-aware queue, delivers structured replay, then flushes queued live events.
- `TerminalService` may buffer a bounded number of per-session live events when no session listener is registered so history replay does not drop events at the listener boundary.
- Remote terminal history must stay explicit about unsupported replay by returning empty replay events until remote replay is implemented.

Computer Use terminal/GVim routing contract:

- `src/apps/desktop/src/computer_use/terminal_detect.rs` owns the pure `TerminalRoute::{AxText, KeyEvent}` decision model.
- The route model accepts normalized platform/app metadata and must stay free of OS calls, UI state, terminal crate dependencies, and permission logic.
- macOS `app_type_text` may resolve pid-owned app identity inside `macos_bg_input` and then delegate route selection to `terminal_detect`; `interactive_type_text` must continue to reuse `app_type_text` instead of duplicating detection.
- Generic display text containing `terminal` is not enough to select `KeyEvent`; known bundle ids, terminal-keyword bundle ids, known terminal names, or Windows/Linux terminal/GVim class/process identifiers are required.
- Windows/Linux routing coverage in 120B is pure detection only. Windows background input, cloaked injection, MSAA, and capture remain separate platform slices.

Computer Use platform migration contract:

- `ComputerUseHost` remains the only boundary between core Computer Use tools and desktop platform implementations.
- Platform work must be split by adapter capability: app/window enumeration, accessibility snapshot, capture, input primitive, host action wiring, and interactive/visual view enabling.
- Windows app enumeration, UIA/MSAA traversal, capture, background input, and host action wiring must be accepted as separate issues so each can be verified without changing unrelated platform behavior.
- macOS SkyLight, window id resolution, focus-without-raise, Chromium/Electron click recipes, AX tree enablement, and input parity helpers must be accepted as separate issues; private SPI must soft-fail and stay isolated in macOS-only adapter modules.
- `screenshot_display` may keep mutating coordinate/navigation/click readiness state; peek-style screenshot APIs must not mutate readiness state.
- `ComputerUseInteractionState` serialized shape, click safety guards, `after_screenshot`, `after_pointer_mutation`, and unsupported platform statuses must not be weakened by platform parity work.
- Capture adapters must expose fallback or occlusion uncertainty explicitly instead of presenting fallback pixels as guaranteed current app state.
- Windows pointer coordinate safety is a host/adapter contract, not a UI contract. `desktop_host.rs` owns `PointerMap`, `screenshot_pointer_maps`, app pid fallback maps, and `mouse_move_global_f64`; explicit `screenshot_id` maps must be preferred over pid/global fallbacks for image-coordinate actions. Focused Rust tests may lock mathematical mapping and failure semantics, but DPI scaling, mixed-scale multi-monitor, occlusion, and UIPI delivery remain Windows smoke requirements.
- Windows Computer Use settings deep-link routing belongs to `src/apps/desktop/src/api/computer_use_api.rs`. It may map supported panes to documented `ms-settings:` URIs or return stable unsupported facts, but Web UI and `ComputerUseHost` must not infer Windows permission state from raw settings strings.
- Core schema additions such as `describe_screen` and upstream tool-contract DTO extraction are separate architecture issues, not hidden prerequisites for platform adapter migration.

Computer Use `describe_screen` contract:

- `describe_screen` belongs to the Computer Use tool contract/core schema module, not to Windows/macOS platform adapter migration.
- The model-facing interface is the `ComputerUseTool` action schema plus the `ToolResult` JSON/image envelope. A future implementation must keep schema exposure and runtime dispatch in sync so an exposed action never falls through to an unknown-action error.
- The first implementation composes existing host seams only: `computer_use_session_snapshot`, `computer_use_interaction_state`, and `enumerate_ui_tree_text`. It does not call `screenshot_display`, `screenshot_peek_full_display`, `get_app_state`, action-history recording, screenshot hash updates, or committed-action hooks. Do not add `ComputerUseHost::describe_screen` until an accepted issue proves existing seams are insufficient.
- Observation must be readonly by default. It must not mutate screenshot navigation state, click readiness, pointer maps, `interactive_view_cache`, `visual_mark_cache`, input state, focus, or platform capability flags.
- Output must be explicit about `status`, `source`, `scope`, warnings, and `error`/`error_code`. Unsupported, unavailable, permission-denied, provider-not-configured, and capture-failed states must not be represented as empty strings, empty arrays, or silent success.
- `describe_screen` may summarize visual or structural state, but it must not produce unbound coordinates for direct clicking. Any future coordinate or region hint must name its coordinate basis, preferably a `screenshot_id`.
- Text-only and multimodal schema behavior is deliberate: `describe_screen` is exposed in both because it returns JSON/text only; `screenshot` remains absent from text-only schema. `describe_screen` must not bypass the existing screenshot/provider gate by aliasing to `screenshot`.
- 122A is docs-only contract acceptance. 122C owns the first schema/dispatch/read-only observation code. 122B owns broader tool-contract DTO extraction and remains separate.
- `scripts/check-core-boundaries.mjs` must keep static anchors for `ComputerUseHost`, `computer_use_session_snapshot`, `computer_use_interaction_state`, `enumerate_ui_tree_text`, `describe_screen_result`, and the readonly/no-screenshot regression tests. These anchors are governance only; they do not authorize DTO extraction, new host methods, or platform adapter rewrites.

Windows app enumeration contract:

- `src/apps/desktop/src/computer_use/windows_list_apps.rs` owns Windows running-app enumeration for `ComputerUseHost::list_apps`.
- Enumeration is app/window discovery only: it may inspect visible, non-minimized, titled top-level windows and process image names, but it must not perform capture, input injection, app action wiring, interactive view construction, or visual mark generation.
- Windows `AppInfo` entries use `bundle_id: None`, `pid: Some(pid)`, `running: true`, `last_used_ms: None`, and `launch_count: 0` until a later Windows metadata issue records richer signals.
- `DesktopComputerUseHost::list_apps` may route to the Windows adapter under `#[cfg(target_os = "windows")]`; macOS and non-macOS/non-Windows behavior remain separate cfg branches.

Windows accessibility snapshot contract:

- `src/apps/desktop/src/computer_use/windows_ax_ui.rs` owns cached Windows UI Automation snapshot traversal for `ComputerUseHost::get_app_state`.
- `src/apps/desktop/src/computer_use/windows_msaa.rs` owns the narrow MSAA fallback for SAL/VCL-style windows when UIA fails or returns an empty tree.
- Windows `get_app_state` returns the existing `AppStateSnapshot`/`AxNode` model from a resolved target window. Since 120H1, calls that request `capture_screenshot=true` may attach a same-HWND `ComputerScreenshot` through the host-level screenshot attachment contract.
- Empty accessibility trees are explicit errors, not support signals. SAL/VCL fallback failure must also remain explicit.
- UIA snapshot traversal should use `IUIAutomationCacheRequest`, subtree scope, control-view filtering, cached properties/patterns, and `BuildUpdatedCache` retry before falling back to MSAA.
- Windows accessibility snapshot support must not wire app actions, background input, interactive views, visual mark views, capture adapters, Web UI policy, or core schema changes. Those remain separate issues.

Windows foreground/window capture adapter contract:

- `src/apps/desktop/src/computer_use/windows_capture.rs` owns Windows-only foreground/window bitmap capture primitives.
- The adapter may use `PrintWindow(PW_RENDERFULLCONTENT)`, DWM extended-frame bounds, mostly-black detection, and screen-region `BitBlt` fallback, but it must keep those Win32 details behind the desktop adapter boundary.
- The adapter result must carry internal metadata for `CaptureSource`, `potentially_occluded`, origin, width, and height. A `BitBlt` fallback result is never a guaranteed target-window snapshot; it is current desktop pixels and may include an occluding window.
- WGC/Windows Graphics Capture is available only inside the Windows capture adapter as a Direct3D/WinRT tier-2 fallback after mostly-black `PrintWindow` results. Until real Windows smoke proves UWP/WinUI/DirectComposition, occlusion, DPI, multi-monitor, and timeout behavior, WGC must be described as wired but platform-unverified rather than guaranteed occlusion-proof capture.
- 120E intentionally did not wire capture into `desktop_host.rs`, `get_app_state`, `screenshot_display`, interactive views, visual mark views, input actions, Web UI permission policy, or core schema. 120H1 later accepts a narrow host attachment only for Windows `get_app_state(..., capture_screenshot=true)`.

Windows background input adapter contract:

- `src/apps/desktop/src/computer_use/windows_bg_input.rs` owns Windows-only low-level input primitives.
- The adapter may expose PostMessage-based click/key/char/scroll/drag, cloaked SendInput text/key helpers, UIPI checks, DirectComposition/UWP heuristics, and key chord parsing, but these are not user-facing host actions until 120G accepts wiring.
- Adapter results must use an explicit delivery status such as `PostedUnknown`, `SentInput`, `BlockedUipi`, `ForegroundUnavailable`, `ForegroundRestoreFailed`, `UnsupportedSurface`, or `Win32Error`. `Ok(())` or a successful `PostMessageW` call must not be interpreted as target delivery.
- Windows input primitives must not mutate `ComputerUseSessionMutableState`, screenshot cache, pointer maps, click readiness, `supports_background_input`, interactive/visual view support, Web UI permission policy, terminal crate behavior, or core tool schema.

Windows host action wiring contract:

- Windows `app_click`, `app_type_text`, `app_scroll`, and `app_key_chord` are `ComputerUseHost` orchestration only: resolve target HWND/AppSelector, resolve target coordinates, call Windows adapters, wait for settle where applicable, then return a fresh `AppStateSnapshot`.
- Target HWND resolution belongs to `windows_list_apps`; target-window UIA/MSAA snapshots belong to `windows_ax_ui`; low-level dispatch belongs to `windows_bg_input`.
- Host orchestration owns HWND identity revalidation. Text/key input actions must carry an expected pid across await boundaries, revalidate the selected HWND before dispatch, and validate returned snapshots through the expected-pid boundary instead of recomputing identity from a potentially stale handle.
- Host wiring must preserve `WindowsInputOutcome`: `BlockedUipi`, `ForegroundRestoreFailed`, `UnsupportedSurface`, and `Win32Error` fail closed; uncertain delivery such as `PostedUnknown` may return a snapshot but must preserve a warning through existing host fields.
- Windows host action wiring does not enable `supports_background_input`, interactive views, visual mark views, drag, `app_wait_for`, Web UI permission changes, terminal behavior changes, or core schema changes.

Windows app-state screenshot attachment contract:

- `desktop_host.rs` owns the conversion from `windows_capture::WindowCapture` to `ComputerScreenshot` and `PointerMap`; `windows_capture.rs` remains a bitmap/metadata adapter and must not mutate host session state.
- Windows `get_app_state_inner(..., capture_screenshot=true)` must use the same target HWND resolved for the UIA/MSAA snapshot. It must not silently fall back to an unrelated foreground window, and it must revalidate the HWND still belongs to the expected pid after capture before registering coordinate maps.
- Attached window screenshots are registered in `ComputerUseSessionMutableState.app_pointer_maps` by pid and `screenshot_pointer_maps` by screenshot id so later `app_click(ImageXy/ImageGrid)` and visual flows use the same image basis the model saw.
- Capture failure during app-state attachment is non-fatal: the UI tree can still be returned. Capture uncertainty from `WindowCaptureMetadata.potentially_occluded` must surface as `[WINDOWS_CAPTURE_UNCERTAIN]` through `AppStateSnapshot.loop_warning` and must be composed with any existing warning instead of replacing or suppressing it.
- This attachment does not enable `supports_interactive_view`, `supports_visual_mark_view`, `supports_background_input`, drag, `app_wait_for`, Web UI permission changes, terminal behavior changes, macOS behavior changes, or core schema changes.

Windows interactive view contract:

- Windows `build_interactive_view` is host orchestration only: obtain a Windows `AppStateSnapshot` with screenshot through `get_app_state_inner(..., capture_screenshot=true)`, filter nodes with `interactive_filter`, optionally render the SoM overlay with `som_overlay`, and cache `InteractiveElement` values for later index resolution.
- `interactive_filter.rs` and `som_overlay.rs` stay platform-neutral. They must not call Win32, mutate `ComputerUseSessionMutableState`, or dispatch input.
- `ComputerUseSessionMutableState.interactive_view_cache` remains the cache boundary. It keeps the existing pid key to match current macOS state shape and also stores the Windows `hwnd_raw` plus `screenshot_id` from the source snapshot so actions can reject changed windows and image-coordinate fallbacks can use the exact map the model saw. Same-process multi-window behavior remains a manual-smoke risk, but actions must fail closed when the current resolved HWND differs from the cached HWND.
- Windows interactive view must preserve `AppStateSnapshot.loop_warning` into `InteractiveView.loop_warning`, including `[WINDOWS_CAPTURE_UNCERTAIN]` from the screenshot attachment layer.
- Filtered views with no interactive elements must fail explicitly with `[INTERACTIVE_VIEW_EMPTY]` and must not populate `interactive_view_cache`; an empty array is not a support-success signal.
- `supports_interactive_view` may be true on Windows only after build/cache/resolver tests pass. `supports_visual_mark_view`, visual mark actions, drag, `app_wait_for`, Web UI permission policy, terminal behavior, macOS behavior, and core schema remain separate issues.
- `resolve_interactive_index` and `cached_interactive_image_center` may resolve app pid per platform, but the digest and index contracts remain unchanged: `INTERACTIVE_VIEW_MISSING`, `STALE_INTERACTIVE_VIEW`, and `INTERACTIVE_INDEX_OUT_OF_RANGE` are explicit errors, not empty-state signals.

Windows interactive action contract:

- Windows `interactive_click`, `interactive_type_text`, and `interactive_scroll` are host orchestration only. They resolve `i` through `interactive_view_cache`, validate the current resolved HWND against the cached HWND, and delegate to existing `app_click`, `app_type_text`, `app_scroll`, and `app_key_chord`.
- `interactive_click` uses `ClickTarget::NodeIdx` as the primary path. If that delegated app action fails and the cached element has `frame_image`, it falls back to `ClickTarget::ImageXy` with the cached `screenshot_id`; fallback must not use an unbound image coordinate when a screenshot id is available.
- Stale interactive digests may rebuild once and retry, matching the existing macOS orchestration, but must still fail explicitly if the rebuilt view no longer contains the requested `i`.
- Windows `interactive_type_text(clear_first=true)` must clear through existing app actions using `Ctrl+A` then `Delete`; `press_enter_after=true` must use existing Windows key-chord dispatch with `Enter`. It must not call new low-level input primitives.
- Windows `interactive_scroll` must route through `app_scroll`, with optional focus resolved from the cached `i`. It must not call scroll primitives directly.
- 120H3 does not enable visual mark view/click, visual grid, drag, `app_wait_for`, `supports_background_input`, Web UI permission changes, terminal behavior changes, macOS rewrites, or core schema changes.

Windows visual mark contract:

- Windows `build_visual_mark_view` is host orchestration only: resolve one target HWND, collect same-HWND `AppStateSnapshot` plus screenshot through `get_app_state_for_windows_hwnd_raw_inner(..., capture_screenshot=true)`, build marks with existing `build_regular_visual_marks`, optionally render an overlay with `som_overlay`, and cache the marks.
- `ComputerUseSessionMutableState.visual_mark_cache` stores `digest`, `marks`, `screenshot_id`, and Windows `hwnd_raw`. `visual_click` must validate the current resolved HWND against cached `hwnd_raw` before using any cached mark.
- Visual mark digest includes mark coordinates and screenshot identity through `compute_visual_mark_view_digest`. Missing cache, stale digest, out-of-range mark index, empty mark set, and changed HWND are explicit errors.
- Windows `visual_click` delegates only through `app_click(ClickTarget::ImageXy { x, y, screenshot_id })` using the cached screenshot id. It must not call low-level input primitives directly or infer coordinates from a different screenshot basis.
- `[WINDOWS_CAPTURE_UNCERTAIN]` warnings from screenshot attachment must remain observable through returned snapshots/views; overlay render failure is non-fatal and must not erase the original screenshot basis.
- 120H4 enables `supports_visual_mark_view` on Windows, but does not enable VisualGrid, drag, `app_wait_for`, `supports_background_input`, Web UI permission changes, terminal behavior changes, macOS rewrites, or core schema changes.

Windows VisualGrid contract:

- Windows `ClickTarget::VisualGrid` remains explicitly unsupported after 120H5. Unsupported behavior is a stable contract, not an empty-grid success, stale-view error, or silent fallback.
- The stable Windows error code is `[WINDOWS_VISUAL_GRID_UNSUPPORTED]`. The message must direct callers to `build_visual_mark_view` plus `visual_click`, or to `ImageXy`/`ImageGrid` when they already have an explicit screenshot basis.
- Windows `VisualGrid` must not reuse macOS `detect_regular_grid_rect_from_screenshot` until real Windows smoke covers DPI scaling, occlusion/minimized windows, DirectComposition/UWP surfaces, same-process multi-window identity, and multi-monitor coordinates.
- This decision does not disable `ImageGrid`, `ImageXy`, Windows visual marks, or macOS VisualGrid. It also does not change Web UI permission policy, core tool schemas, low-level input primitives, drag, `app_wait_for`, terminal behavior, or background-input capability flags.

macOS SkyLight bridge contract:

- Private SkyLight/SLS access is isolated in the macOS Computer Use adapter foundation module. No private symbols, raw handles, or private structs may leak into `ComputerUseHost`, core tool schemas, Web UI, or cross-platform modules.
- 121A exposes only structured availability/diagnostics and a default-disabled policy. Availability is not a capability flag and must not change click, type, scroll, focus, drag, `app_wait_for`, or background-input behavior.
- SkyLight must be loaded at runtime on macOS through dynamic symbol probing. Missing framework or missing symbols are soft-fail diagnostic states, not panics and not app-start failures.
- Non-macOS builds must not compile or link private SkyLight behavior outside tests. Windows-local tests may exercise pure status/policy code, but real macOS target check and smoke remain required before later slices connect behavior.

macOS dual-post background input contract:

- `src/apps/desktop/src/computer_use/macos_dual_post.rs` owns the pure post-plan rules that can be tested on non-macOS hosts. It must not import CoreGraphics or private SPI.
- `src/apps/desktop/src/computer_use/macos_skylight.rs` owns runtime `SLEventPostToPid` and optional keyboard authentication-message attachment. SkyLight failure is a false return so callers can fall back to public `CGEvent::post_to_pid`; it must not panic or change app-start behavior.
- `src/apps/desktop/src/computer_use/macos_bg_input.rs` may wrap existing normal click, scroll, Unicode text, and key-chord event posts in dual-post helpers while preserving event construction, click counts, modifiers, scroll deltas, Unicode buffers, and key ordering.
- Mouse/scroll events use SkyLight plus public post when SkyLight succeeds; keyboard events use SkyLight with auth and skip duplicate public posts on SkyLight success, falling back to public only when SkyLight is unavailable or the attempt fails.
- Terminal-safe typing stays on its existing public post path until real macOS Terminal/iTerm/GVim smoke proves dual-post behavior there. `bg_type_text_auto`, `is_terminal_emulator`, terminal detection, `supports_background_input`, `desktop_host.rs`, focus/window behavior, Chromium-specific click recipes, drag, `app_wait_for`, Web UI policy, Windows behavior, and core schemas must remain unchanged by 121B.

macOS window identity and focus-without-raise contract:

- `src/apps/desktop/src/computer_use/macos_focus_plan.rs` owns the pure focus activation policy. Public activation fallback is an explicit plan input because it can raise/steal focus.
- `src/apps/desktop/src/computer_use/macos_bg_input.rs` owns macOS pid-owned window id lookup through `CGWindowListCopyWindowInfo`. Window candidates must match the requested owner pid, use on-screen non-desktop windows, and ignore non-zero layer entries.
- `src/apps/desktop/src/computer_use/macos_skylight.rs` owns `_SLPSGetFrontProcess`, `GetProcessForPID`, and `SLPSPostEventRecordTo` focus-without-raise primitives. Private SPI must be runtime-resolved, soft-fail, and remain macOS-adapter scoped.
- Existing macOS `activate_pid_macos(pid)` is the explicit app-action activation entry point and may allow public `NSRunningApplication.activateWithOptions` fallback to preserve prior behavior. New callers that must not raise must use the focus plan with `allow_raise_fallback=false`.
- 121C must not change click/type/scroll/key event payload construction, terminal/GVim route selection, `supports_background_input`, Chromium/Electron click recipes, drag, `app_wait_for`, Web UI policy, core schemas, Windows behavior, or tray/window lifecycle.

macOS Chromium/Electron click recipe contract:

- `src/apps/desktop/src/computer_use/macos_chromium_click_plan.rs` owns the pure route decision and recipe event order. The route is either `Default(reason)` or `ChromiumElectron` with explicit global point, window-local point, window id, and click count.
- Chromium/Electron selection must use stable app/window metadata. Bundle id matching is allowed; loose window title, AX text, OCR text, display text, or page content matching is forbidden.
- Metadata gaps are safe defaults: missing bundle id, unsupported bundle id, non-left button, missing window id, missing window bounds, invalid bounds, or point outside the selected window must keep the existing generic `bg_click` path.
- `src/apps/desktop/src/computer_use/macos_skylight.rs` owns `SLEventSetIntegerValueField` and `CGEventSetWindowLocation` runtime wrappers for event stamping. Missing private symbols soft-fail; wrappers must not become product capability flags.
- `src/apps/desktop/src/computer_use/macos_bg_input.rs` owns `bg_click_chromium`, which posts the fixed Chromium recipe: target mouse move, off-screen primer down/up, then up to two target down/up pairs. It must reuse the existing mouse dual-post helper and preserve the generic `bg_click` implementation.
- `src/apps/desktop/src/computer_use/desktop_host.rs` may do only narrow macOS `app_click` route selection and dispatch. If the Chromium recipe errors, the host falls back to the existing generic click path.
- 121D must not change type/scroll/key input, terminal/GVim routing, Windows behavior, Web UI policy, core schemas, drag, `app_wait_for`, or screenshot/click target resolution.

macOS AX snapshot improvement contract:

- `src/apps/desktop/src/computer_use/macos_ax_dump.rs` owns macOS app-state AX snapshot traversal, node cache, digest, and tree text. 121E changes only this snapshot adapter behavior.
- `src/apps/desktop/src/computer_use/macos_ax_snapshot_plan.rs` owns pure policy helpers for Windows-local tests: AX value placeholder fallback, root child attribute selection, child pointer dedupe semantics, and Chromium AX enablement cache planning.
- Chromium/Electron AX tree enablement is best-effort and adapter-scoped. The adapter may set `AXManualAccessibility`, fall back to `AXEnhancedUserInterface` only after unsupported modern attribute status, and wait once per pid after successful enablement. Failures fall back to ordinary AX traversal without changing host capabilities.
- Snapshot traversal reads `AXPlaceholderValue` only when `AXValue` is absent. Placeholder values are normal snapshot text and may affect tree text and digest.
- At the app root, traversal unions `AXChildren` and `AXWindows`; non-root nodes continue with `AXChildren` only. Duplicate child/window pointers must be deduped before enqueueing to preserve stable idx and cache alignment.
- Retain/release ownership remains unchanged: queued children are retained before enqueueing, refs stored in the snapshot cache are released when the pid snapshot is replaced, and unvisited queue entries are drained and released.
- 121E must not change `desktop_host.rs`, input injection, SkyLight, focus, Chromium click recipe, `macos_ax_ui` locate/ranking behavior, Web UI policy, core schemas, Windows behavior, or terminal behavior.

macOS AX pre-focus before text input contract:

- `src/apps/desktop/src/computer_use/macos_ax_write.rs` owns AX write primitives, including best-effort `AXFocused = true` before text input. AX focus failure is recoverable and must not bypass the existing event fallback.
- `src/apps/desktop/src/computer_use/desktop_host.rs` may remember an `app_type_text` `ClickTarget::NodeIdx` focus target and ask the AX writer to pre-focus the cached ref after the existing focus click/activation. It must not inline AX attribute names or change the final text dispatch route.
- Text insertion must continue through `bg_type_text_auto`; terminal/GVim route selection remains owned by `terminal_detect` and must not be replaced by AX text setting or a generic Unicode path.
- `ISSUE-121F1` must not change `macos_bg_input.rs`, key modifier parsing, key-chord routing, drag, right/middle click behavior, Windows behavior, Web UI policy, core tool schemas, terminal route tables, screenshot/click target resolution, or unrelated Computer Use state transitions.
- `ISSUE-121F2` owns any future Fn/no-auth key parity policy. `ISSUE-121F3` owns any future pointer parity or PID-scoped background drag policy.

macOS key parity contract:

- `src/apps/desktop/src/computer_use/macos_key_parity_plan.rs` owns pure policy for macOS key parity that can be tested on non-macOS hosts: modifier aliases, modifier flag kind, modifier keycode, default-host-parser eligibility, and authenticated vs no-auth post mode.
- `src/apps/desktop/src/computer_use/macos_bg_input.rs` owns the real CoreGraphics/SkyLight event construction. It may expose `BgModifier::Fn` and `bg_key_chord_no_auth` as adapter primitives, but it must not select no-auth implicitly.
- The default `app_key_chord` host path remains unchanged: parse through `parse_key_sequence` and dispatch through authenticated `bg_key_chord`.
- `Fn` is not accepted by the default host parser until a later issue records real macOS smoke and route policy. This keeps `Fn` available for adapter smoke/harnesses without turning it into a product-facing host action.
- 121F2 must not change terminal text routing, `bg_type_text_auto`, `terminal_detect`, Windows behavior, Web UI policy, core tool schemas, pointer/drag behavior, or private SPI boundaries.

macOS pointer parity contract:

- `src/apps/desktop/src/computer_use/macos_pointer_parity_plan.rs` owns pure policy for pointer parity that can be tested on non-macOS hosts: supported click/drag buttons, drag event sequencing, interpolation, and AXPress eligibility.
- `src/apps/desktop/src/computer_use/macos_bg_input.rs` owns the real CoreGraphics/SkyLight pointer event construction. It may expose `bg_drag` as a PID-scoped adapter primitive, but that primitive is not a product-facing host/tool action until a later route contract and macOS smoke are accepted.
- macOS `app_click(NodeIdx)` may use AXPress only for plain left single clicks with no modifiers. Right click, middle click, multi-click, and modifier clicks must bypass AXPress and use the background click path so button semantics are preserved.
- The existing `BgMouseButton::{Left, Right, Middle}` click path remains the click parity surface; do not add separate `bg_right_click` or `bg_middle_click` wrappers unless a future interface needs them.
- 121F3 must not change core tool schemas, Web UI behavior, Windows behavior, terminal routing, key parity routing, Chromium click route policy, or expose drag through host actions.

Flow Chat session-boundary virtual list contract:

- `VirtualMessageList` owns viewport-local state for scroll/follow rendering only. It may reset local at-bottom UI state, pending turn pin, bottom reservations, measured-height refs, scroll intent refs, anchor lock, collapse intent, and deferred follow reason when the active session id changes.
- `VirtualMessageList` virtual item keys must include active session identity plus stable item identity. Stable item identity is derived from the existing `VirtualItem` union: user/model item ids, explore group id, or image-analyzing turn id.
- The `Virtuoso` viewport is keyed by active session id so a session switch does not reuse the previous session's virtualized DOM/keyspace.
- 130D must not change `FlowChatStore.ts`, `modernFlowChatStore.ts`, history hydration, `VirtualItem` shape, subagent projection, AI media, AI short-drama, terminal behavior, `firstItemIndex`, `heightEstimates`, or history projection handoff.
- Later 130E/130F/130G work owns initial history windows, projection handoff overlays, and deferred hydration behavior.

Flow Chat initial history window contract:

- `virtualMessageListLayout.ts` may own pure math for choosing an initial latest-tail render window and mapping scrollTop when omitted history is expanded.
- `VirtualMessageList` may enable the 130E2 static initial-history scroller only for historical sessions selected by `selectInitialHistoryRenderWindow`. The static path renders full-session indexes into `VirtualItemRenderer`, uses an omitted-height spacer for hidden history, and expands to full `virtualItems` on upward reveal or omitted-target navigation.
- The static-scroller path must preserve `scrollToTurn`, `scrollToIndex`, `pinTurnToTop`, `ScrollAnchor`, `ScrollToLatestBar`, `StickyTaskIndicator`, visible turn measurement, and follow-output behavior with focused tests before further expansion.
- Index mapping must remain explicit: sliced `renderedInitialHistoryItems` use `renderedInitialHistoryStartIndex + localIndex` when rendering, and imperative navigation maps through full-session `virtualItems` / `userMessageItems` before touching the DOM scroller. UI code must not treat sliced local indexes as full-session indexes.
- 130E2 must not introduce Virtuoso `firstItemIndex`, `heightEstimates`, history projection handoff, or deferred hydration. Those require separate issues and tests.

Flow Chat history projection handoff contract:

- `historyProjectionHandoff.ts` may own pure snapshot types and session-open selection helpers. It must not mutate sessions, access `FlowChatStore`, schedule async work, or render UI.
- A handoff snapshot is session-scoped. Consumers must pass it through `activeSessionHistoryProjectionHandoff` or an equivalent active-session guard before rendering or acting on it.
- Session-open handoff selection may create only a bottom-tail snapshot for a real session switch into `historyState: "ready"` and non-partial history. It must not run when the initial-history static scroller is active, when the session already activated a handoff, or when another active handoff belongs to the same session.
- `VirtualMessageList` may render only the guarded `ISSUE-130F2` history handoff overlay as viewport-local, read-only DOM after active-session validation and bounded release behavior. Other projection handoff behavior, overlay filtering, store mutation, or navigation through overlay content still requires a separate UI gate.
- Deferred full-history projection and partial-history state belong to the store/API contract. UI must read explicit `historyState` plus `isPartial`/count fields instead of inferring from empty arrays, and deferred full projection must no-op if the active session has changed before completion.
- The 130G2 full-history follow-up scheduler belongs inside `FlowChatStore`. It may reuse existing restore fallbacks and `applyDeferredSessionHistoryProjection`, but it must not use UI state as a trigger, must not run for complete restores, ACP sessions, unsupported view-restore fallback paths, or legacy full restore paths, and must be testable without relying on real-time delays.
- 130F work must not introduce `heightEstimates`, Virtuoso `firstItemIndex`, startup trace expansion, previous-history boundary status UI, `FlowChatStore.ts` behavior changes, session API changes, terminal, AI media, or AI short-drama changes unless a later issue explicitly allows them.
- 130E work must not introduce history projection handoff, deferred full hydration, `FlowChatStore.ts`, `modernFlowChatStore.ts`, backend session API, subagent, AI media, AI short-drama, or terminal changes.

## 2026-07-03 Selective Upgrade Wave Boundaries

The current upstream reference is `upstream-bitfun/main@4da7ae5d8`. Upstream is a design and bug-fix source, not an ownership source. This wave preserves the existing Void module graph.

### Entry Points

- Flow Chat UI entry points may render and compose state only.
- Terminal UI entry points may display current service state only.
- Computer Use UI/tool entry points may request host actions only through existing core and desktop host seams.
- Theme entry points may consume tokens only; they must not infer product state.

### Interfaces

- Flow Chat changes must pass through `FlowChatStore`, `FlowChatManager`, `BtwThreadService`, or existing pure view helpers.
- Terminal changes must pass through terminal service/core DTOs and preserve flat-history compatibility unless a dedicated issue changes the contract.
- Computer Use changes must pass through `ComputerUseHost` or platform adapter modules, with explicit unsupported/error results.
- Image understanding changes must pass through the existing `AnalyzeImage` tool contract and workspace-scoped image resolution.
- AI short-drama image-understanding bridge work must stay in `src/web-ui/src/shared/services/short-drama`. `resolveShortDramaImageUnderstandingReference` may expose only low-context `ShortDramaProject` coordinates and prompt summary fields, while `createShortDramaImageContextForArtifact` is the explicit conversion boundary for analyzable local/relative image paths. UI, Main AI awareness export, generic `AnalyzeImage`, provider adapters, and media services must not infer short-drama media source details.
- BTW follow-up image-context delivery must pass through `MessageModule` -> `BtwThreadService`; UI components may compose selected images but must not decide backend/provider support.
- Image-understanding default-model governance belongs to `AIConfig` capability helpers and `ConfigService::reconcile_models`. The `image_understanding` default slot may point only to an enabled image-capable model (`ImageUnderstanding` capability or `Multimodal` category) and must be cleared rather than silently falling back to a text-only model.
- Runtime image-understanding model resolution may canonicalize saved `id` / `name` / `model_name` references, but must still return explicit disabled, unsupported-model, or not-configured errors. UI, AI media, AI short-drama, Flow Chat, and provider adapters must not duplicate this model-capability policy.
- Theme governance changes must pass through scripts, token files, and component-library contracts, not page-specific visual exceptions.

### Domain Ownership

- Multi-agent, subconversation, `/goal`, review-subagent, and background-result semantics remain core/runtime owned.
- AI media and AI short-drama remain local product-owned capabilities.
- Provider/service extraction remains deferred unless an issue identifies a single owner move and proves it with boundary checks.
- Upstream crate decomposition remains architecture guidance only until a separate crate-layout plan is accepted.

### Adapter and External Boundaries

- Desktop Computer Use adapters own WGC, HWND, Win32/UIA/MSAA, macOS AX/SkyLight, and platform smoke behavior.
- Remote MCP/tool runtime changes must return explicit `status/source/error` results and bounded timeout behavior.
- External provider calls must remain behind existing provider adapters and workspace permissions.

### Forbidden Coupling

- No business decisions in `ChatInput.tsx`, Flow Chat containers, sidebar/header, terminal panels, or large page components.
- No terminal replay facts inside Flow Chat transcript state.
- No Computer Use platform policy in Web UI.
- No image byte loading in UI.
- No theme token exceptions inside feature pages to make a local screen "look better".
