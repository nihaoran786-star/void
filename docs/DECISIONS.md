# Upstream Migration Decisions

Date: 2026-07-02

## DEC-001: Targeted Migration Only

Decision: Upstream changes must be migrated as targeted issues, never by whole-repository merge.

Reason: Current Void branch contains divergent product identity, installer, Flow Chat state, media, short-drama, and desktop contracts.

## DEC-002: Void Contracts Override Upstream Structure

Decision: Upstream directory layout and crate decomposition are reference material only.

Reason: Copying upstream layout would create broad conflicts and obscure local ownership.

## DEC-003: Documentation Before Implementation

Decision: PRD, architecture, issue list, test plan, decisions, and progress must exist before functional code changes.

Reason: The migration spans many modules and needs stable coordination across agents.

## DEC-004: One Issue at a Time

Decision: Only one implementation issue may be active at a time.

Reason: Chat/session/media/short-drama/desktop contracts overlap; parallel implementation would create integration risk.

## DEC-005: Brand and Installer Are Protected

Decision: Any upstream change that introduces BitFun product identity, installer identity, registry keys, icons, updater names, or bundle identifiers is rejected unless rewritten as Void identity.

Reason: Product identity is a protected local capability.

## DEC-006: Explicit State Models Are Required

Decision: Empty arrays or missing fields cannot represent business state for history, media, short-drama, or sync support.

Reason: Current UI depends on explicit `status/source/error/reason` states to avoid false success and workspace mismatch.

## DEC-007: Earlier Upstream Baseline for Initial Inventory

Decision: The initial migration inventory used local upstream clone `tmp/upstream-bitfun` at observed head `c2f6a3c` on `main`, with upstream package version `0.2.11`, as its fixed comparison target. Historical migration docs reference `09bf6d1f`; inventory must record any history-depth limitation. Later waves may record a newer upstream reference in a separate decision.

Reason: Each migration wave needs a fixed comparison target and traceability for accepted, deferred, and rejected candidates.

## DEC-008: Classification Changes Must Be Recorded

Decision: Every upstream candidate must be classified as `P0`, `P1`, `P2`, `P3`, or `Rejected`. Classification changes require updating `docs/ISSUES.md` and, when architecture-affecting, `docs/DECISIONS.md`.

Reason: "All upstream fixes" is only manageable if every candidate has a visible decision.

## DEC-009: Test Evidence Must Be Concrete

Decision: Test records must include the exact command, result, and failure summary or `not run` reason. No test may be reported as passing unless it actually ran in this workspace.

Reason: The current workspace has known Rust workspace metadata blockers, so inferred test success would be misleading.

## DEC-010: Adapter and Runtime Boundaries Stay Separate

Decision: Provider parsing/retry fixes belong in provider adapters or service boundaries, terminal reliability belongs in terminal service/core boundaries, and Computer Use platform behavior belongs behind `ComputerUseHost` and desktop platform adapters.

Reason: Copying upstream implementation into UI, portable contracts, or desktop command files would couple product logic to the wrong layer.

## DEC-011: Release Notes Are Inventory Hints, Not Local Deltas

Decision: GitHub release notes, nightly notes, and README capability claims may seed ISSUE-003 candidates, but local implementation deltas must be verified against actual files and paths before code migration.

Reason: The local upstream clone is shallow at `c2f6a3c`, while the latest observed nightly references commit `029e9e7`; treating release text as a direct patch would create false attribution.

## DEC-012: BitFun Identity Is Rejected Unless Void-Rewritten

Decision: `BitFun`, `bitfun-*`, `BITFUN_*`, `__BITFUN_*`, BitFun updater keys, BitFun registry paths, BitFun installer names, and BitFun window/event labels are rejected unless an issue explicitly rewrites them to existing Void contracts.

Reason: Brand, installer, updater, environment, and desktop identity are protected local product contracts.

## DEC-013: Verify P0 Runtime Capabilities Before Feature Migration

Decision: Prompt cache, Multitask, `/goal`, token accounting, brand identity, and protected Flow Chat/subagent contracts must be verified before migrating P1/P2 upstream features.

Reason: These capabilities protect the current branch's main value: multi-agent orchestration, subagent state, `/goal` workflow, media/short-drama extensions, and safe future upgrades.

## DEC-014: Split Oversized P0 Verification Issues

Decision: `ISSUE-004` is closed as a read-only verification and split into `ISSUE-004A` prompt cache, `ISSUE-004B` Multitask/subagent gate, `ISSUE-004C` goal workflow semantics, and `ISSUE-004D` review readonly/recursive subagent contracts.

Reason: Prompt cache, scheduling, goal persistence, and review permission contracts have different ownership and verification paths. Keeping them as one implementation issue would violate the one-issue-at-a-time migration rule.

## DEC-015: Restore Current-Layout Cargo Workspace Metadata

Decision: The root `Cargo.toml` is restored for the current Void crate layout only. It must list current `src/apps/*` and flat `src/crates/*` members, keep Void identity, and use dependency versions compatible with current source code.

Reason: Current crate manifests use workspace inheritance, so Rust verification cannot run without root workspace metadata. Copying upstream's `assembly/execution/contracts/adapters/services` crate layout would violate DEC-002 and break the current branch.

## DEC-016: Reuse Void GoalModeState for Goal Semantics

Decision: Do not import upstream `ThreadGoal` architecture in this migration slice. Recreate the necessary semantics on the existing Void `GoalModeState`: explicit Complete/Blocked persistence, token budget updates, and billable token accounting.

Reason: Upstream moved `/goal` into a broader ThreadGoal runtime. Copying that structure would cross session, scheduler, UI, and tool boundaries. The current branch already has a working `GoalModeState`; extending it preserves local behavior while adopting the upstream contract improvements.

## DEC-017: Startup Trace Keeps Void Diagnostic Surface

Decision: Startup trace migrations may add bounded timing, concurrency, and default-off render profile primitives to the existing Void trace snapshot, but must keep `__VOID_STARTUP_TRACE__`, use Void-only gates such as `__VOID_RENDER_PROFILE_ENABLED__`, and must not introduce `__BITFUN_*` globals or BitFun trace id names. Component render instrumentation remains separate from the startup trace primitive.

Reason: API timing and render metric primitives are useful and low-risk inside the existing `StartupTrace` model, but upstream's global names and component hooks cross brand and UI hot-path boundaries that need separate review.

## DEC-018: Defer Render Hot-Path Instrumentation Without Browser Smoke

Decision: Do not wire render profiling into Markdown, syntax highlighting, FlowTextBlock, or ModelRoundItem until the issue includes targeted component tests plus browser startup/render smoke.

Reason: Current Void render components diverge from upstream and include local KaTeX, preview, local image, media grouping, and subagent projection behavior. Even default-off instrumentation changes hook imports and render hot paths, so it needs visual/performance validation rather than a blind copy.

## DEC-019: Workspace Media Trash IDs Are Path Segments

Decision: Workspace media restore and purge operations must validate trash ids as safe path segments before constructing metadata, record directory, or delete paths.

Reason: Trash ids come through UI/service APIs and are later embedded in filesystem adapter paths. Rejecting unsafe ids at the service boundary prevents path traversal attempts from reaching read, rename, or delete adapter calls.

## DEC-020: Provider Adapter Fixes Require Fixture Harness First

Decision: Do not migrate upstream provider parser or retry behavior before a Void-compatible `ai-adapters` fixture harness exists.

Reason: Upstream adapter fixes are mostly stream-edge regressions across OpenAI, Responses, Anthropic, Gemini, and SSE retry behavior. Without fixture replay tests in the current crate layout, parser changes would be hard to verify and could silently break tool-call execution.

## DEC-021: Root Node Workspace Must Be Void-Branded Orchestration Only

Decision: Restoring root Node workspace metadata is allowed only as Void-branded build orchestration. It may expose scripts that delegate to existing `scripts/`, `src/web-ui`, `src/mobile-web`, `Void-Installer`, and `tests/e2e` commands, but it must not import upstream `BitFun` package identity, `BITFUN_*` env vars, `BitFun-Installer` paths, release targets, or installer identity.

Reason: Current CI and project docs already reference root `pnpm run` commands while the root `package.json` is missing. Restoring the entry point unblocks verification, but copying upstream package metadata would violate brand and installer contracts.

## DEC-022: i18n and Theme Governance Starts in Observation/Baseline Mode

Decision: Upstream i18n governance reports, baseline layers, theme color audits, visual contracts, and startup theme bootstrap generation must be migrated as mechanisms first. Baselines must be generated or reviewed from current Void output, not copied from BitFun.

Reason: Governance scripts are useful only if they describe the current Void product. Copying upstream baseline data, token families, theme ids, or installer paths would encode BitFun assumptions and create false positives or false confidence.

## DEC-023: Theme Color Audit Foundation Before Full Token Contracts

Decision: `ISSUE-060E` adds a foundational Void theme color scanner and no-growth baselines for Web UI, mobile-web, and installer surfaces. It intentionally does not import upstream's full CSS variable contract registry in the same issue.

Reason: The upstream registry is tightly coupled to upstream path ownership, token-family contracts, generated widget compatibility aliases, and BitFun-era source roots. A smaller scanner/baseline layer gives immediate regression protection without renaming tokens, changing visual identity, or crossing into UI/theme runtime code. Full token-domain contracts can be added later as a separate issue after Void-specific ownership is reviewed.

## DEC-024: Startup Theme Manifests Are Web UI Derived Artifacts First

Decision: `ISSUE-060G` generates startup theme bootstrap and prompt snapshot manifests from current Void Web UI `builtinThemes` into Web UI theme preset generated files. Desktop startup consumption, Rust generated paths, and prompt integration are deferred to separate issues.

Reason: Upstream writes generated JSON into desktop and `assembly` crate paths that do not match the current Void layout. Keeping generation inside the Web UI theme boundary proves the projection and check mode while preserving desktop startup behavior and avoiding upstream crate-layout assumptions.

## DEC-025: Visual Governance Contract Is Evidence-Only

Decision: `ISSUE-060H` adds a Void visual governance contract and validator as a QA gate only. The contract records required visual surfaces, ownership paths, evidence requirements, protected contracts, and risk notes, but it does not authorize UI redesign, token rewrites, product copy changes, or runtime behavior changes.

Reason: Upstream visual governance is useful for preventing unreviewed theme regressions, but current Void surfaces include local Flow Chat, multi-agent, AI media, short-drama, mobile-web, and installer contracts. A read-only contract gives future issues a common checklist without coupling theme QA to business modules.

## DEC-026: Manual CLI Packaging Workflow Requires Release Target Confirmation

Decision: `ISSUE-060I` records upstream manual CLI packaging as an inventory/deferred item and does not create `.github/workflows/cli-package-manual.yml` in this issue. A future implementation may add a Void-only manual artifact workflow, but only after confirming repository release targets, artifact retention policy, and Homebrew tap ownership.

Reason: The upstream manual workflow is useful for non-release single-platform artifact builds, Ubuntu baseline selection, arbitrary ref checkout, and short-SHA artifact naming. Direct migration would introduce upstream CLI crate/artifact names and could imply an unconfirmed release pipeline. Current Void already has `.github/workflows/cli-package.yml` for release-oriented CLI packaging, so the safe next step is an explicit decision gate rather than adding a second runnable packaging workflow now.

## DEC-027: Image Understanding Uses Void Tool Runtime Boundaries

Decision: `ISSUE-100A` accepts image understanding as a Void feature family, but rejects direct migration of upstream `AnalyzeImage`/`view_image` implementation and upload flow until the schema, permission, and runtime boundaries are split. Future work must use current Void modules: `src/crates/core/src/agentic/image_analysis/*` for image processing/model calls, `ToolUseContext` for workspace/path policy, `src/crates/core/src/agentic/tools/image_context.rs` for temporary image references, `void-tool-packs` for tool manifest membership, and `src/crates/ai-adapters` only for provider-specific multimodal wire conversion.

Reason: Current Void already has image analysis, ACP image contexts, tool image attachments, and provider multimodal conversion foundations, but upstream's tool flow spans assembly crate layout, desktop upload APIs, Flow Chat UI state, provider adapters, and upstream runtime URI/identity assumptions. A direct copy would bypass Void's protected workspace/media/short-drama and permission boundaries. Splitting `ISSUE-100B` and `ISSUE-100C` keeps schema/permission review ahead of runtime execution.

## DEC-028: AnalyzeImage Registers Schema Before Runtime Execution

Decision: `ISSUE-100B` registers `AnalyzeImage` in the product tool provider plan and core runtime with a readonly schema-only implementation. The tool validates exactly one image source (`image_id`, `image_path`, or `data_url`), exposes the required output statuses, and returns a structured `status: "error", source: "schema_only"` placeholder until `ISSUE-100C` wires image loading and provider execution.

Reason: Manifest/catalog behavior and model-facing contracts need stable tests before a tool can read workspace image bytes or send data to an external model. Keeping the initial implementation schema-only preserves Void media, short-drama, provider, and workspace permission boundaries while still allowing catalog and GetToolSpec integration to be verified.

## DEC-029: AnalyzeImage Runtime Stays Core-Owned and Workspace-Scoped

Decision: `ISSUE-100C` enables `AnalyzeImage` runtime execution inside the existing core tool implementation. The tool resolves `data_url`, `image_id`, and workspace-scoped `image_path`, rejects workspace-missing or workspace-escaping paths before reading bytes, reuses existing image-processing helpers and `AIClientFactory`, and returns explicit `completed`, `provider_not_configured`, `unsupported_model`, `missing_workspace`, `path_denied`, `invalid_image`, or `error` results.

Reason: Upstream's `analyze_image` accepts a single `path`, permits direct absolute local path handling, uses BitFun runtime URI names, and lives in a different crate layout. Void needs the same capability without weakening workspace isolation or crossing into Flow Chat, media, short-drama, desktop upload, or provider adapter ownership. Keeping runtime in the core tool preserves a small reviewable diff and lets later issues decide whether UI upload/context flows need additional work.

## DEC-030: Terminal Reliability Migrates as Separate Frontend, Core, and Computer Use Slices

Decision: Upstream terminal reliability work must be split by ownership: lazy renderer, input queue, paste policy, and resize repaint guard belong to Web UI terminal components/utilities; structured replay belongs to `terminal-core` plus explicit desktop/Web UI DTOs; terminal/GVim detection belongs to desktop Computer Use input routing.

Reason: The current branch already has a divergent terminal crate, terminal UI, ACP-aware Flow Chat tool cards, and Computer Use host contracts. Whole-file replacement or copying upstream `src/crates/services/terminal` would risk local terminal, multi-agent, media, and short-drama behavior.

## DEC-031: Terminal Replay Keeps Flat History Compatibility

Decision: Structured terminal replay uses ordered `{ cols, rows, data }` events while preserving legacy flat `data/historySize/cols/rows` history fields. Empty `data` is the replay resize marker. Web UI must normalize history at the terminal hook boundary, buffer live events that arrive before listener registration, and replay resize locally only.

Reason: Existing callers still depend on flat history, while resize-sensitive recovery needs ordered geometry/data facts. Keeping both contracts allows incremental migration without changing backend PTY protocol, remote terminal behavior, or terminal UI ownership.

## DEC-032: Computer Use Terminal Detection Is Pure Routing

Decision: Terminal/GVim detection for Computer Use `type_text` lives in a pure desktop Computer Use route model, not in the terminal crate or Web UI. The route returns `AxText` or `KeyEvent`; platform adapters decide how to deliver the selected route. Generic text containing `terminal` must not be enough to force key events.

Reason: The upstream fix addresses accessibility/UIA text channels that silently fail for terminal-like targets. Current Void terminal services are unrelated to Computer Use app input. Keeping detection pure and conservative preserves local terminal, Flow Chat, media, and short-drama behavior while enabling macOS `app_type_text` to avoid terminal Unicode-event drops.

## DEC-033: Computer Use Platform Migration Stays Adapter-Sliced

Decision: Upstream Windows and macOS Computer Use platform improvements are accepted only as separate desktop adapter slices. Windows work is split into module gates/app enumeration, UIA/MSAA snapshot, foreground capture, background input primitives, host app action wiring, and interactive/visual view enabling. macOS work is split into SkyLight bridge, dual-post input, window identity/focus-without-raise, Chromium/Electron click recipe, AX snapshot improvements, and AX pre-focus/input parity. Core schema additions such as `describe_screen` and upstream tool-contract DTO extraction are deferred to separate issues.

Reason: Upstream Computer Use changes span private macOS SPI, Windows UIA/MSAA/Win32 input, capture semantics, host action wiring, and tool contract evolution. Combining these would make failures hard to attribute and could weaken `ComputerUseHost`, click-safety, screenshot readiness, unsupported-platform, terminal-routing, Flow Chat, media, or short-drama contracts. Adapter-sliced migration keeps each capability independently testable and lets private or platform-specific behavior soft-fail without changing product-wide policy.

## DEC-034: Windows VisualGrid Remains Explicitly Unsupported

Decision: `ISSUE-120H5` keeps Windows `ClickTarget::VisualGrid` explicitly unsupported with `[WINDOWS_VISUAL_GRID_UNSUPPORTED]`. Callers should use Windows `build_visual_mark_view` plus `visual_click`, or explicit `ImageXy`/`ImageGrid` targets when they already have a screenshot basis. This decision does not change macOS VisualGrid, Windows visual marks, Web UI permission policy, core tool schemas, low-level input primitives, drag, `app_wait_for`, terminal behavior, or background-input capability flags.

Reason: Windows visual marks are now available, but real smoke coverage for self-detected regular grids is still missing across DPI scaling, occlusion/minimized windows, DirectComposition/UWP surfaces, same-process multi-window identity, and multi-monitor coordinates. Enabling automatic Windows VisualGrid detection before that evidence would create mis-click risk; a stable unsupported contract is safer and easier for agents to route around.

## DEC-035: SkyLight Starts as a Default-Disabled macOS Adapter Foundation

Decision: `ISSUE-121A` adds a contained macOS SkyLight bridge foundation with structured availability and diagnostics only. The foundation is default-disabled and is not wired into click, type, scroll, focus, drag, `app_wait_for`, background input, capability flags, Web UI, core schemas, Windows behavior, or terminal behavior. Runtime probing uses dynamic loading/symbol lookup on macOS and soft-fails when the private framework or required symbols are unavailable.

Reason: SkyLight is private SPI and can vary across macOS versions. A direct behavior change or static private framework dependency would risk startup failures, silent input failures, or platform-specific crashes. Keeping the bridge isolated gives later macOS slices a diagnostic foundation without weakening existing public fallback behavior.

## DEC-036: macOS Dual-Post Input Is Adapter-Scoped and Public-Fallback First

Decision: `ISSUE-121B` connects normal macOS background click, scroll, Unicode text, and key-chord posts to a dual-post helper that attempts SkyLight `SLEventPostToPid` and preserves public `CGEvent::post_to_pid` fallback. Mouse/scroll still public-post after a successful SkyLight post; keyboard skips duplicate public posts after SkyLight success to avoid duplicate characters. Terminal-safe typing remains on the existing public post path until real macOS terminal smoke is complete.

Reason: Upstream dual-post improves Chromium/Catalyst/Electron background delivery, but event-auth/no-auth behavior can silently fail or duplicate input. Keeping the policy in a pure testable seam and the private SPI in the macOS adapter preserves existing terminal routing, host boundaries, and fallback behavior.

## DEC-037: macOS Focus Without Raise Requires Explicit Public Fallback

Decision: `ISSUE-121C` adds pid-owned window id lookup and SkyLight focus-without-raise primitives inside the macOS Computer Use adapter. The pure focus plan requires an explicit `allow_raise_fallback` input before public `NSRunningApplication.activateWithOptions` is selected. The existing `activate_pid_macos(pid)` app-action entry point allows that fallback to preserve prior behavior, while future non-raising callers must opt out.

Reason: Focus-without-raise is safer for background automation, but wrong window ids or private SPI failures can target the wrong app or silently do nothing. Public activation may raise and steal focus, so it must be explicit in the plan rather than an implicit fallback hidden in unrelated action code.

## DEC-038: Chromium/Electron Click Recipe Is Metadata-Gated

Decision: `ISSUE-121D` adds the upstream Chromium/Electron background click recipe only as a metadata-gated macOS adapter path. Routing is decided by a pure plan using bundle id, left-button intent, pid-owned window id, window bounds, and the resolved global click point. Missing or unsupported metadata falls back to the existing generic `bg_click` path. The host may collect metadata and call the adapter, but it must not inline recipe details or use title/text matching.

Reason: Chromium/Electron can require a multi-event, window-local, private-field-stamped sequence to pass background user-activation gates, but applying that sequence broadly would risk normal Cocoa apps and non-left-button clicks. A pure route seam plus adapter-scoped SkyLight field wrappers keeps the behavior testable, conservative, and isolated from Web UI, core schema, Windows, terminal, and generic input paths.

## DEC-039: macOS AX Snapshot Improvements Stay Adapter-Only

Decision: `ISSUE-121E` accepts upstream macOS AX snapshot improvements only inside the macOS accessibility dump adapter. The adapter may enable Chromium/Electron accessibility best-effort per pid, wait once after successful enablement, use `AXPlaceholderValue` when `AXValue` is absent, and union root `AXChildren` with `AXWindows` while deduping child pointers. A pure `macos_ax_snapshot_plan` seam records the policy for Windows-local tests.

Reason: Chromium/Electron apps often hide web-content AX nodes until accessibility is explicitly requested, and background app snapshots can miss windows unless `AXWindows` is included. These are platform snapshot concerns, not host, input, UI, or schema concerns. Keeping them adapter-scoped preserves existing `ComputerUseHost` contracts and avoids coupling AX traversal to input injection, SkyLight, Web UI, Windows behavior, or terminal routing.

## DEC-040: macOS AX Pre-Focus Preserves Text Routing

Decision: `ISSUE-121F1` accepts AX pre-focus before macOS `app_type_text` only as a best-effort adapter hint for explicit `NodeIdx` focus targets. The host may click/activate as before, then ask `macos_ax_write::try_ax_focus` to set `AXFocused = true` on the cached AX ref. Final text insertion still flows through `macos_bg_input::bg_type_text_auto`, so terminal/GVim key-event routing remains unchanged. The original mixed `ISSUE-121F` is split: Fn/no-auth key parity belongs to `ISSUE-121F2`, and right/middle/drag pointer parity belongs to `ISSUE-121F3`.

Reason: Upstream improves text focus reliability and exposes small input parity helpers, but mixing focus, modifier parsing, key-route policy, and drag gestures into one host change would over-broaden the contract. Keeping AX focus recoverable and preserving `bg_type_text_auto` avoids regressing terminal typing. Keeping key parity and drag out of this issue avoids untested menu/gesture behavior until later policy seams and macOS smoke exist.

## DEC-041: macOS Key Parity Stays Adapter-Primitive Until Smoke

Decision: `ISSUE-121F2` accepts upstream Fn/no-auth key parity only as macOS adapter primitives. `macos_key_parity_plan` records pure policy for Fn aliasing, secondary-Fn flag kind, keycode 63, default host parser eligibility, and no-auth post mode. `macos_bg_input` may expose `BgModifier::Fn` and `bg_key_chord_no_auth`, but the default `app_key_chord` path still uses authenticated `bg_key_chord`, and the default host parser rejects `fn` until real macOS smoke and a route decision are recorded.

Reason: Fn and no-auth event delivery are platform-sensitive. Adding primitives improves parity and gives future smoke harnesses the needed adapter surface, but exposing them through host actions without macOS evidence could make normal key chords fail, duplicate, or trigger system shortcuts unexpectedly. Keeping terminal text routing and host key routing unchanged preserves current behavior while allowing the upstream capability to be validated safely.

## DEC-042: macOS Pointer Parity Preserves Button Semantics Before Drag Routing

Decision: `ISSUE-121F3` keeps right/middle click parity on the existing background click path and gates AXPress to plain left single clicks only. Non-left, multi-click, or modifier `NodeIdx` clicks must bypass AXPress so the requested button and click semantics are not swallowed by a generic accessibility press. PID-scoped `bg_drag` is accepted only as a macOS adapter primitive behind `macos_pointer_parity_plan`; it is not wired into host/tool actions.

Reason: AXPress does not carry mouse button, click count, or modifier semantics, so using it for every `NodeIdx` click can turn right/middle or modified clicks into ordinary left presses. Drag behavior is more platform-sensitive than click delivery because event order, window-local routing, Chromium/Electron behavior, Retina/multi-display coordinates, and Accessibility permission failures all need real macOS smoke before product exposure.

## DEC-043: `describe_screen` Is a Tool-Contract Issue Before Code

Decision: `ISSUE-122A` accepts upstream `describe_screen` only as a Computer Use tool-contract inventory and decision record. No core schema, runtime dispatch, host trait, desktop adapter, Web UI, or terminal code is changed in 122A. A future `ISSUE-122C` may implement the smallest readonly action only after schema exposure, dispatch, result shape, host-default behavior, and side-effect tests are defined.

Reason: `describe_screen` affects model-visible Computer Use schema, text-only vs multimodal exposure, provider gates, result envelopes, and UI rendering. Implementing it as a platform adapter patch or a screenshot alias would risk unknown-action drift, bypassed multimodal gates, mutated screenshot readiness, and ambiguous unsupported states. Recording the contract first keeps the migration aligned with the existing `ComputerUseHost` seam and separates it from broader DTO extraction.

## DEC-044: First `describe_screen` Implementation Is Readonly JSON Context

Decision: `ISSUE-122C` implements `describe_screen` as a `ComputerUseTool` schema and dispatch action in core only. It is exposed to both text-only and multimodal models, returns JSON/text observation only, and uses existing host seams for session context, interaction state, and optional UI tree text. It does not add `ComputerUseHost::describe_screen`, does not call screenshot capture or peek, does not attach images, and does not mutate screenshot readiness, action history, pointer maps, or platform adapter state.

Reason: The smallest useful upstream-compatible capability is to prevent schema/runtime drift and give the model an explicit readonly observation contract without crossing into platform behavior. Richer screen description, screenshots, app-state fusion, provider-specific rendering, and platform smoke remain future issues because they need separate gates and real desktop validation.

## DEC-045: Relay Static Homepage Shared Terms Are Page-Scoped Generated Artifacts

Decision: `ISSUE-060D` adapts upstream relay homepage `$shared` i18n by generating `src/apps/relay-server/static/homepage/i18n.shared.json` from existing Void shared terms. The static homepage may reference shared terms with `{ "$shared": "..." }` and resolve them at runtime from the generated page-local JSON. It must remain self-contained and must not import Web UI, mobile-web, installer, or core i18n runtime catalogs.

Reason: The relay homepage is a static self-contained surface, but duplicated shared terminology drifts across products. A page-scoped generated JSON keeps it aligned with Void terms while preserving deployment simplicity and avoiding BitFun homepage copy, product identity drift, and cross-surface runtime coupling.

## DEC-046: Flow Chat Long-Session Fixes Must Be Sliced Before Migration

Decision: `ISSUE-130A` accepts the upstream Flow Chat long-session performance work only as an inventory and issue split. The local upstream snapshot `tmp/upstream-bitfun@c2f6a3c` contains useful helpers and tests for virtual message layout, session-boundary reset, history projection handoff, and model-round progressive rendering, but current Void must not replace `VirtualMessageList.tsx`, `ModelRoundItem.tsx`, `modernFlowChatStore.ts`, or `FlowChatStore.ts` wholesale. Future work must start with RED tests and migrate pure presentation helpers before any store or history-hydration behavior.

Reason: Current Void has local product behavior that upstream does not own: multi-agent/subagent projection, BTW child dialogs, floating/compact chat surfaces, AI media grouping, AI short-drama canvas/services, terminal replay boundaries, and explicit session restore states. Long-session performance improvements are valuable, but bundling virtual-list layout, model-round chunking, handoff overlay, code preview, terminal preview, and deferred hydration would make regressions hard to attribute and could break protected local workflows.

## DEC-047: Model Round Progressive Rendering Is Presentation-Only

Decision: `ISSUE-130B` adapts upstream model-round progressive rendering as a pure helper plus `ModelRoundItem` presentation-layer state. Completed oversized rounds initially render the newest bounded group tail, then reveal older groups in timer chunks. Streaming rounds render all groups. Rounds containing synthetic AI media groups or `Task` subagent groups render fully until separate protected-group-aware slicing policies are designed and tested.

Reason: The upstream helper reduces initial render cost for long completed rounds without changing session state or virtual item shape. Keeping the count/timer local to `ModelRoundItem` avoids coupling to `FlowChatStore`, `modernFlowChatStore`, history hydration, terminal service/core, subagent projection internals, AI media services, or AI short-drama modules. Rendering protected media/subagent rounds fully is a conservative protection because synthetic media groups can aggregate results across text/tool boundaries and `Task` groups own subagent projection; hiding either group would make current local workflows appear missing.

## DEC-048: Virtual Message Height Estimates Do Not Enable History Windowing

Decision: `ISSUE-130C` adapts upstream virtual message layout estimates only as pure helper functions and `VirtualMessageList` `defaultItemHeight` wiring. Live sessions stay on the legacy `200px` estimate. Historical compact user/explore tails use a compact estimate, and historical tails containing model rounds use a taller model-round estimate. The issue does not enable `heightEstimates`, `firstItemIndex`, initial history render windows, history projection handoff, deferred hydration, or `VirtualItem` shape changes.

Reason: Better default height estimates reduce long-history layout misprediction without changing scroll/follow/pin state machines or session restore semantics. The broader upstream history windowing stack depends on partial history state and index mapping that current Void has not adopted. Keeping 130C to a pure helper and one Virtuoso prop preserves `SessionHistoryState`, `SessionContextRestoreState`, multi-agent/subagent, AI media, AI short-drama, and terminal boundaries while preparing for later 130D/130E slices.

## DEC-049: Flow Chat Session Boundary Reset Stays Viewport-Local

Decision: `ISSUE-130D` adapts upstream stable virtual item keys and session-boundary remount behavior only inside `VirtualMessageList`. Virtual item keys are scoped by active session id plus a stable item identity. `Virtuoso` remounts when the active session changes, and `VirtualMessageList` resets viewport-local state in a layout effect: at-bottom UI state, pending turn pin, bottom reservations, measured height/scroll refs, scroll-intent refs, anchor lock, collapse intent, and deferred follow reason.

Reason: Session switches must not inherit a previous session's viewport state or item-key identity, but the fix does not require changing session data, `VirtualItem` shape, history hydration, store contracts, subagent projection, AI media, AI short-drama, or terminal behavior. Keeping reset behavior local to `VirtualMessageList` preserves existing product-specific Flow Chat state while preparing for later 130E history-window work.

## DEC-050: Initial History Window UI Requires a Separate Gate

Decision: `ISSUE-130E1` accepts only the pure initial-history window helper foundation: `InitialHistoryRenderWindow`, `selectInitialHistoryRenderWindow`, and `mapInitialHistoryExpansionScrollTop`. It does not enable a static scroller, omitted-spacer DOM, Virtuoso `firstItemIndex`, `heightEstimates`, history projection handoff, or deferred hydration in `VirtualMessageList`.

Reason: Upstream's initial history UI path is not a standalone helper drop. Its static scroller branch bypasses `virtuosoRef`, while current Void's `scrollToTurn`, `scrollToIndex`, `pinTurnToTop`, sticky/latest follow, visible turn measurement, `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` still assume the existing virtualized scroller contract. Enabling the UI behavior without a dedicated index/navigation adapter would create P1 regression risk. Keeping 130E1 pure gives later 130E2 the tested math foundation while requiring an explicit UI strategy and focused navigation tests before render behavior changes.

## DEC-051: Initial History Window Uses a Gated Static Scroller Adapter

Decision: `ISSUE-130E2` enables the initial historical render window with a gated static-scroller branch in `VirtualMessageList`. The branch is used only for historical sessions selected by `selectInitialHistoryRenderWindow`, renders the latest bounded tail plus an omitted-height spacer, expands to full `virtualItems` on upward reveal or omitted-target navigation, and adapts `scrollToTurn`, `scrollToIndex`, and `pinTurnToTop` through the existing scroller DOM ref when `virtuosoRef` is absent. `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` remain outside the render branch and keep using the component-owned scroller ref.

Reason: A static-scroller gate gives Void the upstream long-history initial render benefit without adopting upstream `firstItemIndex`, `heightEstimates`, projection handoff, deferred full-history hydration, or store/API changes. Keeping the adapter local to `VirtualMessageList` preserves current session restore, multi-agent/subagent projection, AI media, AI short-drama, and terminal boundaries while focused jsdom tests cover bounded initial render, upward expansion, full-session index mapping, and imperative navigation compatibility.

## DEC-052: History Projection Handoff Starts as a Pure Snapshot Contract

Decision: `ISSUE-130F1` adapts only the pure `historyProjectionHandoff` contract: session-scoped snapshots, active-session filtering, and session-open bottom-tail snapshot selection. It does not wire projection overlay UI into `VirtualMessageList`, does not add release scheduling, and does not change `FlowChatStore`, session restore APIs, startup trace, `heightEstimates`, or Virtuoso `firstItemIndex`.

Reason: Upstream's handoff overlay is coupled to partial-history/deferred-full-history store behavior, startup tracing, previous-history boundary status, and virtual-list index/height migration. Current Void has just stabilized session-boundary reset and initial-history static windowing, and existing tests intentionally block `historyProjectionHandoff` inside `VirtualMessageList`. A pure helper gives later UI/store issues a typed contract while avoiding cross-session projection pollution and preserving current Flow Chat, media, short-drama, terminal, and session restore boundaries.

## DEC-053: Partial History Projection State Belongs to FlowChatStore

Decision: `ISSUE-130G1` adds only the frontend store/API-facing partial-history contract. `Session` and `RestoreSessionViewResponse` expose optional `isPartial`, `loadedTurnCount`, and `totalTurnCount`. `FlowChatStore.loadSessionHistory` maps partial `restoreSessionView` responses into `historyState: "ready"` with `isHistorical: true`, while complete restores clear partial fields. Deferred full-history completion is represented by `FlowChatStore.applyDeferredSessionHistoryProjection`, which applies only when the target session is still the active session.

Reason: The upstream projection overlay relies on partial history and delayed full-history completion, but current Void has protected local Flow Chat behaviors: multi-agent/subagent projection, BTW child sessions, floating chat surfaces, AI media grouping, AI short-drama modules, and terminal boundaries. Keeping the contract in `FlowChatStore` prevents UI components from inferring business state from empty arrays or raw transcript shape, and the active-session guard addresses the highest-risk cross-session pollution case without changing backend commands or rendering overlay UI.

## DEC-054: Terminal Output Budgeting Is a Flow Chat Preview Concern

Decision: `ISSUE-130H` adds terminal output row/character budgets only at the Flow Chat terminal tool-card preview boundary. `terminalOutputPreview.ts` creates bounded strings for live and completed previews, and `TerminalToolCard` passes those bounded strings to `LazyTerminalOutputRenderer`. The original tool result, terminal session id, open-in-panel action, terminal replay, and terminal services remain unchanged.

Reason: Long terminal output can make Flow Chat cards expensive even when the terminal panel/replay path is the authoritative full-output surface. Budgeting the preview input gives the chat transcript the upstream-style performance benefit without changing terminal core semantics, replay history, ACP permission actions, `FlowChatStore`, virtual-list behavior, AI media, or AI short-drama modules.

## DEC-055: CodePreview Streaming Optimization Is Display-Only

Decision: `ISSUE-130I` replaces the fixed 60-line streaming CodePreview tail with a viewport-aware tail window and 6,000-character cap. The optimization applies only while `isStreaming` is true. Completed previews continue to receive full content, line click handlers map displayed tail lines back to real file line numbers, and the optional performance probe uses `void-code-preview-perf-probe` naming without production entry wiring.

Reason: Prism highlighting and line-number rendering are synchronous costs in the Flow Chat transcript. A fixed 60-line tail still renders too much hidden content for small previews, while a viewport-aware tail gives the upstream performance benefit without truncating stored tool output, changing Flow Chat session state, touching terminal behavior, or affecting AI media/short-drama modules.

## DEC-056: History Projection Handoff Overlay Is Viewport-Local

Decision: `ISSUE-130F2` wires the pure `historyProjectionHandoff` snapshot into `VirtualMessageList` only as a viewport-local visual overlay. The overlay is selected on a real session switch into a ready, non-partial, non-static-window session, is guarded again by active session id before render, is rendered as a sibling of the real scroller, and releases once the real target turn is rendered or after a bounded timeout. It does not mutate `virtualItems`, session data, `FlowChatStore`, restore APIs, or deferred hydration state.

Reason: Upstream's projection overlay reduces blankness during long historical session switching, but the full upstream stack is tied to startup trace, partial/deferred full-history hydration, `heightEstimates`, and `firstItemIndex`. Keeping the overlay as read-only DOM outside the scroller gives the visual benefit while preserving current visible-turn measurement, imperative navigation, multi-agent/subagent projection, AI media, AI short-drama, and terminal boundaries.

## DEC-057: Deferred Full-History Hydration Is Store-Local

Decision: `ISSUE-130G2` starts a frontend full-history follow-up only after a partial `restoreSessionView` response. The scheduler lives inside `FlowChatStore`, dedupes in-flight requests by session/workspace/remote identity, reuses existing `restoreSessionWithTurns`, and applies successful results only through `applyDeferredSessionHistoryProjection`. It does not change `AgentAPI.restoreSessionView` request shape, backend commands, virtual-list UI, terminal, AI media, AI short-drama, or subagent modules.

Reason: The upstream projection stack needs partial history to become full history without blocking initial session open. Keeping scheduling in the store preserves the explicit `historyState`/`isPartial`/count model, prevents UI from inferring state from turn arrays, and keeps the existing active-session guard as the only write path for deferred full projections.

## DEC-058: CodePreview Render Profiling Is Default-Off and Sanitized

Decision: `ISSUE-020D1` wires React render profiling into `CodePreview` only when `__VOID_RENDER_PROFILE_ENABLED__` is true. The component delegates recording to `recordReactRenderProfile(startupTrace, ...)` and passes only sanitized metrics: component id, render phase, duration fields, content/display lengths, streaming flag, and `hasCodeBlock`. It does not record code content, file paths, workspace paths, model output, or raw payloads. Markdown, syntax-highlighter internals, FlowTextBlock, ModelRoundItem, Flow Chat stores, terminal, media, short-drama, subagent, backend, and desktop modules remain out of scope.

Reason: Upstream-style render profiling is useful for diagnosing long streaming code previews, but broad instrumentation across Markdown and model-round rendering risks touching KaTeX, right-panel preview links, media grouping, and subagent projection. Starting with the existing CodePreview performance boundary gives a measurable, testable slice while preserving default runtime behavior and sensitive-data boundaries.

## DEC-059: Manual CLI Packaging Starts as Artifact-Only

Decision: `ISSUE-060I1` adds a separate manual workflow for CLI packaging artifacts only. The workflow is `workflow_dispatch`-only, uses `permissions: contents: read`, supports arbitrary ref checkout, platform selection, Linux x64 runner baseline selection, dynamic matrix generation, version/short-SHA artifact names, `void-cli --version`/`--help` smoke, tarball plus sha256 staging, configurable artifact retention, and `actions/upload-artifact`. It does not upload GitHub Release assets, dispatch Homebrew tap updates, change release/nightly/desktop workflows, modify CLI source or Cargo manifests, or introduce upstream product identity.

Reason: Upstream's manual CLI packaging workflow contains useful artifact-build ergonomics, but release targets, Homebrew tap ownership, and artifact publication policy remain external decisions. An artifact-only workflow gives maintainers a safe manual build path while preserving Void naming, read-only repository permissions, and a hard boundary between manual CI artifacts and official release distribution.

## DEC-060: Runtime Crate Reorganization Remains Deferred Behind Boundary Checks

Decision: `ISSUE-900A` does not adopt upstream crate reorganization. Current Void keeps its existing Rust workspace crate graph and uses `scripts/check-core-boundaries.mjs` as a static governance check for runtime scheduling, dialog preempt policy, remote runtime host adapters, remote command handler traits, and initial-sync boundaries.

Reason: The local branch already carries product runtime, multi-agent, subagent, terminal, Computer Use, media, and short-drama behavior that upstream crate moves do not account for. Hardening the boundary checker captures useful architectural intent without touching Cargo manifests, moving crates, or risking broad runtime regressions.

## DEC-061: Computer Use DTO Extraction Is Guarded, Not Started

Decision: `ISSUE-122B1` keeps upstream Computer Use tool-contract DTO extraction deferred. It adds static boundary anchors for the current `ComputerUseHost` seam and the `describe_screen` readonly implementation/tests, requiring the action to keep using `computer_use_session_snapshot`, `computer_use_interaction_state`, and `enumerate_ui_tree_text` rather than a new `ComputerUseHost::describe_screen` method.

Reason: Computer Use platform work is still active and high-risk. A DTO extraction or new host method would couple core schema, desktop adapters, platform state, and result rendering. Static guardrails preserve the current safe contract while leaving any real DTO extraction for a separately accepted architecture issue.

## DEC-062: FlowTextBlock Render Profiling Is Default-Off and Sanitized

Decision: `ISSUE-020D2` wires React render profiling into `FlowTextBlock` only when `__VOID_RENDER_PROFILE_ENABLED__` is true. The component delegates recording to `recordReactRenderProfile(startupTrace, ...)` and passes only sanitized metrics: component id, render phase, duration fields, item id, content/display lengths, streaming flag, `hasCodeBlock`, and `hasTable`. It does not record raw content, URLs, workspace paths, file paths, model output, or raw payloads. Markdown renderer internals, syntax-highlighter internals, ModelRoundItem, Flow Chat stores/session/history/sidebar/header, terminal, media, short-drama, subagent, backend, desktop, and provider modules remain out of scope.

Reason: FlowTextBlock is a narrow presentation boundary that can be instrumented without changing Markdown rendering, model-round projection, auto-preview orchestration, or Flow Chat state. Keeping profiling default-off and returning before code/table scans on the disabled path preserves normal render cost while still enabling targeted diagnostics for long text-block renders.

## DEC-063: Split Parent Closeout Is Documentation-Only

Decision: `ISSUE-999` treats remaining Split parents as governance closeout, not as permission to copy the remaining upstream patches. `ISSUE-020D`, `ISSUE-060I`, `ISSUE-122B`, and `ISSUE-900` keep their Split status with explicit residual conditions: real browser startup/render smoke for deeper render instrumentation, owner-confirmed release/Homebrew policy, a separate Computer Use DTO architecture decision, and a separate crate-layout migration plan.

Reason: The accepted, independently testable sub-issues have already landed. Continuing into the residual parent scope without the named conditions would violate prior decisions, cross protected Void boundaries, or require external release/architecture choices. A docs-only closeout keeps the inventory honest while preserving current multi-agent, subagent, AI media, AI short-drama, terminal, Computer Use, desktop, and brand behavior.

## DEC-064: Post-Review Hardening Uses Targeted Fixes Only

Decision: The post-review hardening pass accepts only small, independently testable fixes found by subagent review: BTW image-context forwarding, `/goal budget` forwarding, deferred history hydration identity checks, initial historical window bottom positioning, selector-safe virtual item lookup, terminal live-event buffering, brand/CI guard wiring, and test harness alignment. Larger upstream deltas remain deferred behind dedicated gates: terminal crate/runtime-port migration, Computer Use WGC capture/shortcuts, AI adapter path reorganization, release/Homebrew orchestration, and Computer Use DTO extraction.

Reason: The working branch already preserves local multi-agent, subconversation, floating chat, AI media, AI short-drama, terminal, Computer Use, and Void brand contracts. Whole-module upstream adoption would create high rollback risk. Targeted fixes close concrete bugs without moving module ownership or mixing release policy, platform smoke, and architecture reorganization into the same commit.

## DEC-065: New Upstream Work Proceeds as a Selective Upgrade Wave

Decision: The post-`08591f906` upstream comparison starts a new selective upgrade wave from `upstream-bitfun/main@ac16dcc18`. The wave uses the user-approved priority order: Flow Chat stability, terminal reliability, Computer Use Windows safety, image understanding, MCP/tool runtime reliability, theme/token governance, provider/service boundaries, and finally crate decomposition study. Each area must start with an audit issue before implementation unless the missing change is already proven to be a small isolated fix.

Reason: Current Void and upstream BitFun are divergent histories. Direct merge or directory synchronization would threaten local multi-agent, subconversation, floating chat, AI media, AI short-drama, terminal, Computer Use, and brand contracts. A new wave keeps useful upstream fixes moving while preserving the earlier rule that upstream is a reference implementation, not the owner of Void module boundaries.

## DEC-066: Flow Chat Turn Navigation Stabilization Must Be Split

Decision: Upstream `502270994` is accepted as valuable but not copied wholesale. The migration is split into container retry/cancel behavior (`ISSUE-1110A`), static initial-history window geometry (`ISSUE-1110B`), and release-level E2E evidence (`ISSUE-1110C`). `ISSUE-1110` itself remains an audit/classification issue.

Reason: The upstream patch touches container state, virtual-list geometry, partial history behavior, and release E2E in one commit. Current Void already has local `ISSUE-130*` history-window, projection handoff, deferred hydration, multi-agent, BTW, AI media, AI short-drama, and compact chat behavior. Splitting prevents a large Flow Chat replacement and keeps each behavior testable without weakening protected local contracts.

## DEC-067: Terminal Reliability Uses Existing Terminal Boundaries

Decision: `ISSUE-1120` accepts upstream terminal replay/input reliability as valuable, but current Void already owns the low-risk primitives through terminal-local code: structured replay events, legacy flat replay fallback, resize repaint guard, terminal paste policy, PowerShell PSReadLine paste delegation, terminal input queue, and lazy terminal output renderer coverage. Remaining work must proceed as terminal API contract hardening (`ISSUE-1120A`), runtime-port boundary study (`ISSUE-1120B`), Web terminal input/lazy-renderer delta (`ISSUE-1120C`), or lifecycle/ack/history integration tests (`ISSUE-1120D`). Upstream runtime-port/service-decomposition commits are not copied directly.

Reason: Terminal replay and input facts belong to the terminal module and desktop terminal API boundary. Moving them into Flow Chat previews, session/sidebar/header UI, multi-agent/subagent projections, AI media, short-drama, Computer Use, provider, or a broad Rust crate migration would create cross-module coupling. Keeping runtime-port work behind a separate study preserves current Void behavior while still allowing explicit `status/source/error` hardening where the terminal API currently stringifies failures.

## DEC-068: Windows Computer Use Platform Fixes Require Platform Evidence

Decision: `ISSUE-1130` accepts upstream Windows Computer Use capture/input fixes as valuable but does not copy the upstream desktop-host platform UX refactor. Local WGC remains an explicit implementation gate (`ISSUE-1130A`), HWND lifetime/revalidation remains a focused audit (`ISSUE-1130B`), pointer coordinate/background-input behavior remains a Windows test matrix (`ISSUE-1130C`), and settings/visual-grid gaps remain a separate capability-gating issue (`ISSUE-1130D`). Until those land with Windows evidence, Void must not claim occlusion-proof WGC capture or full upstream parity.

Reason: The upstream Computer Use merge crosses D3D11/WinRT WGC capture, desktop-host module splitting, app shortcut/menu UX, Web UI tool-card/settings copy, and tool-contract changes. Current Void already has local multi-agent, subdialog, floating chat, AI media, AI short-drama, terminal, and Computer Use state contracts. WGC and HWND changes touch unsafe Windows handles, D3D resources, DPI/multi-monitor coordinates, and UIPI behavior; non-Windows builds or docs-only review cannot prove runtime safety.

## DEC-069: Image Understanding Completion Uses Void-Owned Tool Boundaries

Decision: `ISSUE-1140` accepts upstream image understanding, `view_image`, and `/btw` image side-question updates as valuable, but rejects direct migration of upstream assembly-path implementations. Current Void keeps `AnalyzeImage` as the authoritative image-understanding tool because it already has `image_id` / `image_path` / `data_url` exactly-one-source validation, workspace path containment, explicit status output, image-analysis helpers, and tool-pack/runtime registration. Follow-up work is split into `ISSUE-1140A` status/data-url guard, `ISSUE-1140B` BTW child-session image completion, `ISSUE-1140C` image-context/media path leak tests, `ISSUE-1140D` Void-native `ViewImage` contract gate, and `ISSUE-1140E` short-drama image-summary bridge.

Reason: Upstream image commits cross Web upload flow, desktop upload API, default model config, provider capability checks, agent prompts, tool registry, runtime materialization, and Flow Chat BTW session handling. Current Void also has protected AI media and AI short-drama flows that rely on data URL and media-reference semantics. Copying upstream path-based upload or tool implementations would risk losing media references, leaking provider policy into UI/components, or bypassing `ShortDramaProject` as the short-drama source of truth.

## DEC-070: MCP and Tool Runtime Fixes Stay Contract-First

Decision: `ISSUE-1150` accepts upstream MCP/tool-runtime reliability improvements as valuable, but keeps them split by runtime contract rather than copying upstream crate-owner migrations. Low-risk follow-ups are `ISSUE-1150A` MCP large-output storage alignment, `ISSUE-1150B` elicitation legacy compatibility, `ISSUE-1150C` MCP request timeout contract, `ISSUE-1150D` readonly/dynamic provider metadata contract, and `ISSUE-1150E` typed approval/rejection outcomes. Architecture-scale upstream changes remain gated behind `ISSUE-1150F` owner-migration planning.

Reason: Current Void already has `void-agent-tools` contract helpers, product runtime assembly, dynamic MCP provider metadata, Streamable HTTP timeout coverage, GetToolSpec collapsed-tool contracts, and shared oversized-result policy. Directly moving MCP runtime state, ExecCommand policy, remote file helpers, MCP/ACP bridge DTOs, tool snapshot ABI, or event projection manifests would cross core/services/runtime/Web UI boundaries and risk multi-agent, review readonly, AI media, AI short-drama, and Flow Chat behavior. Reliability fixes must preserve explicit `status/source/error` outputs and avoid adapter/UI string fallbacks.

## DEC-071: Theme Governance Continues Through Contracts, Not Broad Restyling

Decision: `ISSUE-1160` accepts upstream theme/token governance as valuable, but keeps broad token compression and SCSS rewrites deferred. Current Void has already shipped the near-color governance slice in `ISSUE-1160A`. The next safe work is split into `ISSUE-1160B` CSS variable runtime contract, `ISSUE-1160C` ThemeService token whitelist, `ISSUE-1160D` generated-widget payload compatibility, `ISSUE-1160E` visual-governance evidence contract, and `ISSUE-1160F` AI media/short-drama token-boundary cleanup.

Reason: Upstream theme commits mix governance scripts, runtime token injection, widget payload compatibility, `tokens.scss` cleanup, many SCSS token migrations, CLI/installer baseline compression, and BitFun-specific surfaces. Current Void must preserve product branding, Flow Chat, multi-agent/subdialog/floating chat, AI media, and AI short-drama behavior. Theme improvements should first make token contracts machine-checkable, then change visual tokens one small surface at a time.

## DEC-072: Provider Service Boundary Upgrades Stay Adapter-First

Decision: `ISSUE-1170` accepts upstream provider/service boundary work as valuable, but does not copy the upstream owner-migration commits or crate layout. Current Void keeps `void-ai-adapters` as the provider HTTP/SSE, request/response mapping, stream parsing, tool-call aggregation, model discovery, and health-check owner. Follow-up work is split into `ISSUE-1170A` provider HTTP boundary static audit, `ISSUE-1170B` connection-test error classification, `ISSUE-1170C` OpenAI content-part parser regression, `ISSUE-1170D` SSE handler cancellation contract, and `ISSUE-1170E` image-understanding capability reconcile.

Reason: Upstream commits such as `96cea08ca`, `629ced40a`, `47b5d6c94`, `a29bd63d2`, and `4077c1a8a` depend on upstream service crates and move HTTP, local runtime, IM bot, platform, and exec-command owners across a different crate graph. Direct migration would risk Void's multi-agent, subdialog, floating chat, AI media, AI short-drama, terminal, Computer Use, MCP, and provider behavior. The low-risk path is to preserve the adapter boundary, add static governance first, and only port focused provider fixes with tests at the adapter/config interface.

## DEC-073: Core Crate Decomposition Remains Conceptual Until Evidence Exists

Decision: `ISSUE-1180` accepts upstream crate decomposition as architecture guidance but rejects copying the six-layer physical layout or owner-migration commits. Current Void keeps its flat `src/crates/*` workspace and existing `scripts/check-core-boundaries.mjs` governance. Follow-up work is limited to `ISSUE-1180A` conceptual layer mapping, `ISSUE-1180B` product assembly contract spike, `ISSUE-1180C` runtime-services gap audit, `ISSUE-1180D` high-risk migration registry, and `ISSUE-1180E` product-full guardrail audit.

Reason: Upstream commits such as `401b9e61a`, `ea5321d66`, `213299206`, `98f0f4113`, `bceded210`, and `a7fc6dcd1` move Cargo members, directory layout, concrete runtime owners, terminal/remote exec ports, and SDK profile assembly across a different product graph. Current Void already has protected multi-agent, subdialog, floating chat, AI media, AI short-drama, terminal, Computer Use, MCP, provider, desktop, CLI, ACP, and installer boundaries. Static dependency checks are useful guardrails, but they do not prove runtime equivalence; any future crate move requires separate snapshot evidence and product-entrypoint verification.

## DEC-074: Web Terminal IME Safety Net Stays Utility-Owned

Decision: `ISSUE-1120C` ports the upstream `b8197bbb7` IME/key rollover fix as a terminal utility plus a narrow `Terminal.tsx` event binding. The utility owns the `keyCode === 229`, composed `insertText`, keypress de-duplication, and keyup reset decisions. `Terminal.tsx` may bypass xterm key handling for the utility-approved case and forward inserted text through `onData`, but it must not inline additional IME policy. The upstream `970c33844` lazy renderer `forwardRef` API expansion remains deferred until a Void call site needs an imperative output renderer ref.

Reason: Current Void already has terminal input queueing, paste policy, replay normalization, resize repaint guard, and lazy output fallback coverage. The missing behavior is a narrow Web terminal input reliability fix; expanding renderer refs or copying adjacent Flow Chat/companion/RichTextInput changes would increase interface surface without proving product need. Keeping the rollover decision in a pure utility gives focused tests and preserves terminal module ownership.

## DEC-075: Terminal Replay Ordering Is Hook-Owned

Decision: `ISSUE-1120D` first locks the frontend replay/live-event ordering at the `useTerminal` hook boundary. `useTerminal` is the conversion layer that fetches structured history, subscribes to session events, drains pending events into a replay-aware queue, emits replay events, then releases queued live events. Flow Chat cards, terminal panels, and xterm rendering must not infer history source or reorder replay/live data.

Reason: Current Void already has pure replay normalization and replay-aware event queue helpers. The missing evidence was hook-level integration coverage, not a UI or runtime-port rewrite. Backend `terminal_ack`, natural PTY exit propagation, and remote empty-history `status/source` remain separate `ISSUE-1120D` follow-up slices because each touches a different terminal boundary and needs its own focused proof.

## DEC-076: Natural PTY Exit Emits an Explicit Event

Decision: `ISSUE-1120D` accepts the natural child-completion fix inside `terminal-core` PTY process ownership. `pty/process.rs` now polls the spawned child in the existing command task and emits `PtyEvent::Exit { exit_code }` when the child exits without an explicit shutdown command. EOF observed by the reader thread routes through the same internal shutdown command path so exit-code collection remains owned by the command task.

Reason: Terminal lifecycle consumers should receive an explicit exit event rather than infer process completion from no output, closed readers, empty history, or UI state. The fix stays inside the existing PTY process boundary and reuses `PtyEvent::Exit`; it does not move runtime ports, redesign process management, change Flow Chat/tool-card state, or alter remote history semantics.

## DEC-077: Remote Terminal History Is Explicitly Unsupported

Decision: `ISSUE-1120D` hardens `terminal_get_history` so local empty history and remote unsupported history are different DTO states. Local history responses use `historyStatus: "ready"` and `historySource: "local"`. Known remote sessions return empty replay data with `historyStatus: "unsupported"`, `historySource: "remote"`, `errorCode: "remote_history_unsupported"`, and an explanatory `error`. Web `GetHistoryResponse` requires `historyStatus/historySource`, and `useTerminal` treats remote unsupported history as empty replay while continuing to subscribe and flush live events.

Reason: Empty terminal replay data is not a reliable business state. The desktop API adapter is the correct boundary to classify remote unsupported history, and the hook/type contract is the correct frontend boundary to preserve that classification. UI, Flow Chat cards, xterm rendering, multi-agent panels, AI media, AI short-drama, Computer Use, provider, and runtime-port code must not infer history source from `events.length`, `data`, or `historySize`. Local backend history failures still use the existing command error path; returning `historyStatus: "error"` from a successful DTO remains deferred.

## DEC-078: AnalyzeImage Owns Inline Image Input Hardening

Decision: `ISSUE-1140A` keeps image-understanding input hardening inside `AnalyzeImage`. The active output status contract removes unreachable `permission_denied` and keeps real states: `completed`, `unsupported_model`, `provider_not_configured`, `missing_workspace`, `path_denied`, `invalid_image`, and `error`. `AnalyzeImage.call_impl` enforces exactly one source even if callers bypass `validate_input`. Inline `data_url` inputs are decoded and rejected before provider runtime when they exceed 1 MiB, declare unsupported raster MIME, or contain bytes that are not recognized as an image.

Reason: `AnalyzeImage` is the tool boundary where image source, workspace path policy, and provider readiness become explicit tool output. Advertising unreachable states weakens downstream handling, and letting malformed inline images reach provider runtime couples provider behavior to input validation. Keeping this in the tool avoids adding MIME, size, provider, or path policy to Web UI, Flow Chat, BTW panels, media services, short-drama services, desktop upload APIs, or provider adapters. Broader `image_context` scoping and generic image-context path containment remain separate issues.

## DEC-079: Image Context Filename Fallback Must Be Unique

Decision: `ISSUE-1140C` starts with the narrow `image_context.rs` lookup contract. `find_image_context_by_reference` still prefers exact `image_id` lookup. Filename and basename fallback may return an image context only when exactly one stored image matches; same-name collisions return `None` instead of an arbitrary `DashMap` iteration result. Expiration cleanup remains storage-owned and does not move provider, workspace-read, or media policy into `image_context.rs`.

Reason: A global temporary image-context table can contain same-name images from different turns or sessions. Returning the first map entry is nondeterministic and can leak or analyze the wrong image. Failing closed on ambiguous filename fallback preserves stable `image_id` references while reducing cross-context confusion. This does not complete the broader 1140C media path-leak work; `resolve_missing_image_payloads`, `GenerateImage` / `GenerateVideo` unmatched local-path handling, and valid `http(s)` / `data:` reference regressions remain separate slices.

## DEC-080: Media Generation Image URLs Must Be Provider-Compatible

Decision: `ISSUE-1140C` hardens `GenerateImage` and `GenerateVideo` image-reference normalization in `media_tools.rs`. Provider `image_urls` may contain already provider-compatible `http(s)` URLs, `data:image` URLs, or registered image-context references that resolve to a data URL or provider-compatible URL. Unmatched Windows absolute paths, POSIX absolute paths, relative local paths, home-relative paths, and backslash paths are filtered out instead of being sent to APIMart as provider URLs. `UploadMediaImage` remains the explicit path for local image uploads.

Reason: A local filesystem path is not a provider image URL and may leak private machine paths when passed through generation payloads. Filtering only obvious local path forms preserves plain named references for compatibility while protecting `GenerateImage` / `GenerateVideo` from silently transmitting local paths. The rule belongs to the media tool input boundary, not Web UI, Flow Chat, provider adapters, short-drama services, APIMart clients, or image-context storage.

## DEC-081: Desktop Image Payload Refill Fails Closed on Missing Cache

Decision: `ISSUE-1140C` completes the desktop `resolve_missing_image_payloads` contract with tests only. When a request image has neither `image_path` nor `data_url`, the desktop API may refill it only from the upload cache by exact `image_id`. Cache misses and expired/removed cache entries return the existing re-attach error. Cache entries that still lack both payload fields return `missing image_path/data_url after cache resolution`. The core TTL cleanup function remains private to the image-context storage layer.

Reason: Normal dialog turns and `/btw` share this desktop conversion helper, so its failure mode must be explicit before submitting work to the coordinator. Treating expired cache as a missing-cache API outcome protects callers without adding test-only production APIs or moving storage policy into desktop endpoints. The boundary stays narrow: no Web UI, provider adapter, media generation, short-drama, multi-agent, or image-context storage production behavior changed.

## DEC-082: MCP Large Output Must Reach Shared Tool Result Storage Untruncated

Decision: `ISSUE-1150A` keeps MCP dynamic tool output persistence owned by core `tool_result_storage`. The MCP adapter now uses an unbounded storage render path for `ToolResult.result_for_assistant` created by `call_impl`, so large MCP text can be evaluated and persisted by the shared oversized-result policy. The existing bounded 12k renderer remains for regular MCP result messages.

Reason: Truncating MCP assistant-visible text in the adapter hides the full content from the central storage policy and can cause persisted tool output to contain only the adapter preview. The adapter should translate MCP content into a complete `ToolResult`; preview, reference, and filesystem artifact decisions belong to `tool_result_storage` and `ToolUseContext`. This avoids Web UI, Flow Chat, provider, AI media, AI short-drama, review, multi-agent, and crate owner changes.

## DEC-083: MCP Elicitation Must Not Claim Schema Validation Until Implemented

Decision: `ISSUE-1150B` keeps remote MCP client elicitation support enabled but removes the explicit `schemaValidation: true` claim from `create_mcp_client_info`. The client capability contract is now roots `{}`, sampling `{}`, and elicitation `{}`. Schema validation can be advertised only after a future issue implements and tests the actual validation behavior.

Reason: Upstream enables legacy-compatible elicitation without claiming schema validation. Advertising unsupported schema validation can make older or stricter MCP servers assume behavior Void does not provide. This decision is limited to the client-info protocol helper and contract tests; Streamable HTTP routing, legacy SSE support, local stdio initialize JSON, MCP manager lifecycle, Web UI, provider adapters, AI media, and AI short-drama are unchanged.

## DEC-084: CSS Variable Governance Is Audit-Owned Before Runtime Enforcement

Decision: `ISSUE-1160B` introduces `scripts/theme-css-var-contract.json` as the machine-readable source for required theme token domains, allowed dynamic CSS variable prefixes, legacy aliases, and fallback-only exceptions. `scripts/audit-theme-colors.mjs` validates this contract by default and reports failures through the existing theme-color audit path. Runtime injection remains unchanged.

Reason: Upstream theme governance is useful, but current Void must not mix governance with visual rewrites or runtime token filtering in one change. Keeping the first contract in audit scripts gives CI coverage for missing required tokens, stale dynamic prefixes, and unreviewed fallback exceptions while preserving ThemeService, presets, generated-widget payload runtime, Flow Chat, AI media, AI short-drama, and page/component SCSS behavior. Runtime whitelisting remains a separate `ISSUE-1160C` decision.

## DEC-085: ThemeService Whitelists Dynamic Token Suffixes Only

Decision: `ISSUE-1160C` applies runtime filtering only to ThemeService dynamic CSS variable domains that expand object keys into variable names. Allowed suffix sets are defined for accent, purple, shadow, blur, radius, spacing, motion, easing, font weight, font size, and line height. Fixed ThemeService variables such as button, window-control, card, overlay, scrollbar, font family, tool-card, Flow Chat link, and scene viewport tokens remain explicitly injected and are not derived from the CSS variable contract's required-token subset.

Reason: The CSS variable contract from `ISSUE-1160B` is a governance baseline, not a complete list of every runtime variable ThemeService writes. Treating it as a full allowlist would remove valid fixed runtime vars and break existing surfaces. Filtering only dynamic suffixes blocks custom-theme key injection while preserving ThemeService as a pure token injection layer and avoiding preset value rewrites, component SCSS changes, widget payload changes, Flow Chat logic, AI media logic, or AI short-drama logic.

## DEC-086: Generated Widget Theme Payload Contract Stays Host-CSS-Only

Decision: `ISSUE-1160D` makes the generated-widget theme payload contract explicit in `themePayload.ts`. The payload keeps the existing `{ id, type, vars }` shape and adds `contractVersion`, `status`, `source`, `missingRequiredVars`, `appliedLegacyAliases`, and typed missing-var error metadata. Required and optional widget variables are exported as a contract, and the known legacy alias `--color-border-default` is kept compatible with canonical `--border-base` in both directions.

Reason: Generated widgets run across an iframe/static-render boundary, so host CSS variable compatibility must be visible and testable before any future token reduction or rename. The reader remains a pure DOM CSS-var adapter with `source: host-css-vars`; it does not inspect app state, ThemeService internals, MiniApp `--void-*` payloads, Flow Chat, AI media, AI short-drama, providers, sessions, or widget business events.

## DEC-087: Visual Evidence Governance Is Metadata-Only

Decision: `ISSUE-1160E` extends the theme visual governance contract so each evidence entry declares `mode`, `theme`, `viewport`, `state`, and either `command` or `artifactName`. The validator now supports `--contract <path>` for fixture-based tests and rejects unsupported evidence modes, missing evidence metadata, missing evidence action pointers, unknown evidence types, missing required paths, and upstream branding strings.

Reason: Upstream-style theme governance is useful only if visual review expectations are explicit before token reductions or SCSS cleanup. This change makes evidence expectations machine-checkable without claiming screenshots, contrast review, or manual artifacts have already passed. The boundary remains scripts/docs only: no screenshot tooling overhaul, no page SCSS rewrite, no ThemeService runtime change, no Flow Chat/session logic, no AI media or short-drama state changes, and no installer/release workflow change.

## DEC-088: Media and Short-Drama Entry Tokens Are Local Semantic Wrappers

Decision: The first `ISSUE-1160F` code slice limits cleanup to the Workspace Media and Short Drama entry buttons. `WorkspaceMediaEntry.scss` and `ShortDramaEntry.scss` define local semantic tokens (`--workspace-media-entry-*` and `--short-drama-entry-*`) that map to global theme tokens, then consume those local tokens for border, surface, text, and hover styling. Direct `--void-*` dependencies are removed from the entry buttons only.

Reason: The entry buttons are a low-risk boundary: they expose navigation affordances but do not own media availability, artifact status, short-drama stage ownership, tab routing, or Flow Chat session state. Cleaning this domain first reduces theme debt without touching Gallery/CenterPanel styling, media or short-drama services, `ShortDramaProject` tool behavior, ThemeService runtime injection, or broad color baselines.

## DEC-089: Workspace Media Gallery Tokens Stay Local

Decision: The second `ISSUE-1160F` code slice removes direct `--void-*` dependencies from `WorkspaceMediaGallery.scss` by defining `--workspace-media-gallery-*` local semantic tokens that map to global theme tokens. The slice may lower the web theme-color governance baseline when the audit proves debt decreased, but it must not change Gallery React behavior, media service state, pending generation ownership, preview resolution, delete/restore/purge flows, or Short Drama state.

Reason: Gallery contains both low-risk chrome styling and high-risk media/pending visual language. Local wrappers let Gallery follow the global theme contract without encoding media availability, artifact status, or generation state into global tokens. Raw generator/overlay/waveform colors and Short Drama CenterPanel cleanup remain separate slices.

## DEC-090: Short Drama CenterPanel Tokens Stay Presentation-Local

Decision: The third `ISSUE-1160F` code slice keeps `ShortDramaCenterPanel.scss` as the only Short Drama CenterPanel owner touched. Its local tokens now map to global theme tokens, the undefined `--short-drama-text` reference is removed, and the existing band token is consumed locally. The slice may lower the web theme-color governance baseline when the audit proves debt decreased.

Reason: CenterPanel TSX owns stage selection, workspace manifest interpretation, stage-agent tabs, artifact references, media recovery, and Flow Chat/runtime coordination. Theme governance must not encode those business states into global tokens or scripts. Local presentation tokens reduce visual debt while preserving the short-drama state model and service/tool boundaries.

## DEC-091: Gallery Generator Visual Tokens Are Not State Tokens

Decision: The fourth `ISSUE-1160F` code slice keeps pending/generator visual cleanup inside `WorkspaceMediaGallery.scss`. The generator glow, dark surface, grid, beam, ring, and core colors are exposed only as `--workspace-media-generator-*` local tokens and consumed by the pending/generator selectors.

Reason: Pending media generation has business meaning, but this slice only names its presentation colors. Keeping these tokens local avoids coupling theme governance to media task ownership, media availability, preview resolution, or gallery state transitions.

## DEC-092: Gallery Card Chrome Visual Tokens Stay Presentation-Only

Decision: The fifth `ISSUE-1160F` code slice keeps fallback, placeholder, waveform, play/type badges, action buttons, overlay, unavailable text, and local divider colors as `--workspace-media-card-chrome-*` tokens inside `WorkspaceMediaGallery.scss`.

Reason: These colors describe card chrome presentation, not media availability, previewability, delete state, selection state, or pending ownership. Keeping them local reduces raw color debt without creating global product-state tokens or touching Gallery React/service behavior.

## DEC-093: Gallery Operation Error Colors Reuse Local Error Tokens

Decision: The sixth `ISSUE-1160F` code slice keeps operation-error styling inside `WorkspaceMediaGallery.scss` and reuses local Gallery error tokens for text and border color.

Reason: The visual error affordance should be theme-governed, but the operation failure source and recovery semantics belong to Gallery state/service code. Reusing local presentation tokens avoids encoding trash/delete/restore/purge business states into global theme tokens.

## DEC-094: Short Drama Status Pill Colors Stay Presentation-Local

Decision: The seventh `ISSUE-1160F` code slice keeps short-drama status pill indicator colors inside `ShortDramaCenterPanel.scss` as local `--short-drama-status-*` presentation tokens mapped to global success, warning, accent, and error tokens.

Reason: The pill variants reflect existing CenterPanel presentation for ready, active, stale, and error states, but status ownership and recovery behavior remain in the short-drama state/model code. Local tokens theme the dots without moving artifact status, stage ownership, media availability, or failure handling into global theme governance.

## DEC-095: Short Drama Media Preview Tokens Stay Visual-Only

Decision: The eighth `ISSUE-1160F` code slice keeps short-drama media-preview visuals inside `ShortDramaCenterPanel.scss` as local `--short-drama-preview-*` tokens for default preview backdrops, empty/missing/referenced states, generating state, media fallback, and caption overlay colors.

Reason: Media preview presentation must be theme-governed, but media availability, artifact references, generation progress, and recovery behavior belong to existing CenterPanel state and short-drama/media services. Local preview tokens reduce raw selector-level color debt without changing how previews are resolved or how missing/generated media states are classified.

## DEC-096: Short Drama Final Preview Tokens Stay Visual-Only

Decision: The ninth `ISSUE-1160F` code slice keeps short-drama final-preview visuals inside `ShortDramaCenterPanel.scss` as local `--short-drama-final-preview-*` tokens for wrapper surface, frame border, non-empty frame background, media border, empty-frame background, and on-frame text.

Reason: Final preview styling is a presentation concern, while final-video readiness, empty-state classification, and media resolution remain owned by existing CenterPanel state and short-drama/media services. Local final-preview tokens reduce selector-level raw color debt without changing post-stage workflow behavior.

## DEC-097: Short Drama Stage Card Tokens Stay Presentation-Local

Decision: The tenth `ISSUE-1160F` code slice keeps short-drama stage card, poster, notice, media-reference, and rail surface visuals inside `ShortDramaCenterPanel.scss` as local `--short-drama-card-*` and `--short-drama-stage-rail-*` tokens.

Reason: Stage card colors express presentation for existing stages, not stage ownership or workflow authority. Keeping these tokens local reduces selector-level raw color debt without changing stage navigation, artifact status, media references, stage-agent coordination, or short-drama service behavior.

## DEC-098: Provider HTTP/SSE Owner Guard Is Governance-Only

Decision: `ISSUE-1170A` adds a static provider HTTP/SSE ownership guard to `scripts/check-core-boundaries.mjs`. The legal default AI provider transport owner remains `src/crates/ai-adapters/src/**`, with provider replay expectations in `src/crates/ai-adapters/tests/**`. Core may retain provider config, credential, model-selection, and unified adapter consumption facts, but it must not add OpenAI/Anthropic/Gemini provider transport lines coupled to `reqwest` or direct provider SSE parser imports. A service adapter may become an AI provider HTTP/SSE owner only when a later issue and decision name it explicitly.

Reason: Upstream provider/service decomposition is useful as a boundary idea, but a direct crate or transport migration would be high risk for current Void. A focused static guard prevents provider HTTP/SSE ownership from drifting back into core without touching existing APIMart media HTTP, web tools, remote bots, review-platform HTTP, CLI credential discovery, Flow Chat, multi-agent workflows, AI media, AI short-drama, terminal, MCP, Computer Use, or crate layout.

## DEC-099: Connection-Test Error Classification Is Adapter-Owned

Decision: `ISSUE-1170B` adds `ConnectionTestErrorCategory` as an optional adapter result field. `void-ai-adapters` owns raw error-message classification for connection tests and emits `auth`, `quota`, `proxy`, `tls`, `timeout`, `network`, `provider`, or `unknown`. Core, desktop, installer, and Web API types may pass the field through, but UI entrypoints must not infer these categories by matching `error_details`.

Reason: Connection-test diagnostics need structured status for provider setup and future UI presentation, but the classification depends on transport/provider error text and belongs at the adapter health-check boundary. Keeping it optional preserves legacy JSON compatibility and avoids changing provider config schemas, retry behavior, Flow Chat, multi-agent/subagent flows, AI media, AI short-drama, MCP, terminal, or provider catalog ownership.

## DEC-100: SSE Handler Lifetime Is Adapter-Owned

Decision: `ISSUE-1170D` keeps provider stream handler lifecycle inside `void-ai-adapters`. `execute_sse_request` now receives each provider handler `JoinHandle` and wraps the returned parsed stream so dropping `StreamResponse.stream` aborts the handler task. Provider stream handlers also stop when their event receiver is closed while waiting for more SSE bytes. The public `StreamResponse` field shape is unchanged.

Reason: Adapter consumers should not need to own provider handler tasks directly, and core turn cancellation should remain separate from provider transport lifecycle. This prevents orphaned provider SSE work when a stream is dropped while preserving completed-stream usage/tool-call delivery, adapter transport retry, core/business retry, Flow Chat state, multi-agent flows, AI media, AI short-drama, MCP, terminal, provider config, and crate layout.

## DEC-101: Image Understanding Defaults Are Capability-Reconciled

Decision: `ISSUE-1170E` keeps image-understanding default selection inside the config/capability boundary. `AIConfig` owns the shared predicate for image-understanding support, and `ConfigService::reconcile_models` now repairs `ai.default_models.image_understanding` only to an enabled model with `ImageUnderstanding` capability or `Multimodal` category. If no enabled image-capable model exists, the slot is cleared rather than falling back to a text-only model. Runtime `resolve_vision_model_from_ai_config` reuses the same capability predicate and resolves saved `name` / `model_name` references to canonical ids while preserving explicit disabled and unsupported-model errors.

Reason: Upstream image-understanding improvements are valuable, but this branch already has a Void-owned `AnalyzeImage` tool, workspace-scoped image resolution, AI media, and AI short-drama image flows. Governing the default slot in config prevents silent text-only selection without moving image byte loading into UI, copying upstream `view_image`, changing provider multimodal wire conversion, or coupling AI media/short-drama behavior to the generic image-understanding model.

## DEC-102: Windows WGC Capture Stays Adapter-Only Until Smoke-Proven

Decision: `ISSUE-1130A` wires Windows Graphics Capture only inside the Windows desktop capture adapter. `windows_capture.rs` still owns the tiered capture chain, and the new `windows_wgc_capture.rs` provides the Direct3D/WinRT BGRA frame capture used by `screenshot_window_via_wgc` after mostly-black `PrintWindow` results. The slice adds only the required Windows crate features and a compile-level wiring test; it does not copy upstream desktop-host module splitting, Web UI/settings changes, tool schema changes, or Computer Use UX changes.

Reason: WGC is the right fallback for UWP/WinUI/DirectComposition black `PrintWindow` captures, but it is unsafe platform code that depends on real Windows graphics/runtime behavior. Automatic compile and pure metadata tests prove the adapter is wired, not that WGC is occlusion-proof in the field. Void must keep BitBlt uncertainty metadata, existing host state, pointer-map contracts, Flow Chat, AI media, AI short-drama, terminal, provider, macOS/Linux adapters, and Computer Use schemas unchanged until Windows smoke proves the platform behavior.

## DEC-103: Windows Input HWND Identity Is Host-Adapter Owned

Decision: `ISSUE-1130B1` keeps Windows HWND lifetime hardening inside `desktop_host.rs`. The host owns the expected-pid and optional pinned-`hwnd_raw` validation helper, and Windows `app_type_text` / `app_key_chord` now revalidate the selected HWND before cloaked input dispatch and validate the returned snapshot against the expected pid. The change does not alter Computer Use schemas, Web UI affordances, WGC capture, macOS/Linux adapters, terminal, provider, AI media, or AI short-drama behavior.

Reason: HWND lifetime is a platform adapter concern. UI and tool schemas should not infer stale-window state by string matching or by carrying raw handles across module boundaries. The first safe slice blocks pid changes and pinned HWND changes for text/key input while leaving real HWND reuse, same-PID multi-window switching, UIPI/elevated-window behavior, and capture races to Windows smoke rather than overstating unit-test evidence.

## DEC-104: BTW Follow-Up Images Stay Service-Owned

Decision: `ISSUE-1140B` keeps transient `/btw` child-session image follow-up support inside the Flow Chat service boundary. `MessageModule` converts existing composer options into an explicit `imagePayload`, and `BtwThreadService.sendMessageToTransientBtwSession` remains the only transient BTW layer that forwards image contexts to `btwAPI.askStream`.

Reason: Initial `/btw` image support already enters the backend through the Flow Chat/Btw service path. Child-session follow-up images should complete that same path without adding provider, path, or model capability judgment to `ChatInput.tsx`, `BtwSessionPanel.tsx`, media services, short-drama services, provider adapters, or core image-analysis runtime. Backend stream display metadata and deeper Rust-side image consumption checks remain separate validation work.

## DEC-105: Tool Provider Subtype Metadata Stays Registry-Owned

Decision: `ISSUE-1150D` locks the current tool metadata split instead of expanding model-facing or runtime-port descriptor schemas. `DynamicToolDescriptor` remains the existing provider-list wire shape with optional `providerId`; richer dynamic provider facts such as `providerKind` and MCP `serverId/serverName/toolName` stay in registry metadata through `DynamicToolInfo`. Readonly-enabled manifests are defined by `is_readonly() && is_enabled()`, and `void-tool-packs` remains a provider group plan/order owner only.

Reason: Upstream readonly/tool-provider metadata checks are useful, but copying richer MCP metadata into every descriptor or model-facing schema would be a compatibility change. The current safe upgrade is contract coverage: provider identity must come from explicit metadata, disabled readonly tools must not appear in readonly manifests, and current Void image/media tools keep their Void names (`AnalyzeImage`, `GetMediaTaskStatus`) without touching concrete tools, MCP manager lifecycle, provider adapters, Web UI, AI media, or AI short-drama services.

## DEC-106: Local MCP Request Timeout Is Independent From Initialize Timeout

Decision: `ISSUE-1150C1` adds an optional ordinary request timeout field to local stdio `MCPConnection` and keeps it separate from `initialize_timeout`. The production local default remains `None`, meaning ordinary local requests continue to rely on the outer tool pipeline timeout until a later configuration issue explicitly wires a default. Tests inject the request timeout to prove timeout errors are typed as `MCPRuntimeErrorKind::Timeout` and remove pending response waiters.

Reason: Upstream request-timeout hardening is valuable, but initialize timeout and ordinary tool/resource/prompt request timeout are different contracts. Reusing the initialize timeout would break slow local tool calls. This slice establishes the local connection boundary and cleanup behavior without changing MCP manager lifecycle, UI fallback strings, tool pipeline policy, remote Streamable HTTP semantics, provider adapters, media services, short-drama services, or crate layout.

## DEC-107: Remote MCP Timeout Helper Tests Are Not Full Method Coverage

Decision: `ISSUE-1150C2` locks `RemoteMCPTransport::await_with_optional_timeout` as the remote Streamable HTTP timeout conversion helper. Helper tests may prove unbounded, fast, and pending-future timeout behavior, including typed `MCPRuntimeErrorKind::Timeout` mapping and operation-specific timeout messages. They must not be recorded as full remote method coverage for `tools/list`, `tools/call`, `resources/read`, or `prompts/get`.

Reason: The helper is the narrowest boundary for timeout classification and can be tested without a live remote MCP service or rmcp peer. Full method coverage still needs separate tests that exercise the method wrappers and transport/service behavior. Keeping this distinction prevents overclaiming while preserving current remote Streamable HTTP production behavior, MCP manager lifecycle, UI rendering, tool pipeline policy, local stdio defaults, provider adapters, AI media, AI short-drama, and crate layout.

## DEC-108: Remote MCP Timeout Injection Must Not Change Defaults

Decision: `ISSUE-1150C3` adds `MCPConnection::new_remote_with_request_timeout` as an explicit `Duration`-based constructor for controlled remote timeout tests and callers. The default `new_remote` and `new_remote_with_data_dir` paths continue to use `REMOTE_MCP_REQUEST_TIMEOUT`. Remote timeout method coverage is limited to `tools/list`, `tools/call`, `resources/read`, and `prompts/get`.

Reason: The remote transport already owns bounded request timeout behavior, but the production 120s default makes failure-path tests impractical. A narrow explicit injection constructor avoids changing config/runtime behavior and avoids exposing a no-timeout public escape hatch. This keeps timeout classification in the MCP connection/transport boundary without changing MCP manager lifecycle, UI fallback strings, tool pipeline policy, provider adapters, AI media, AI short-drama, or crate layout.

## DEC-109: Windows Computer Use Settings Links Stay Adapter-Owned

Decision: `ISSUE-1130D1` keeps Windows Computer Use settings deep-link routing inside the desktop API adapter. The Windows `screen_capture` pane maps to the documented Graphics Capture privacy URI `ms-settings:privacy-graphicscaptureprogrammatic`. The Windows `accessibility` pane returns a stable actionable unsupported outcome instead of opening an unrelated Ease of Access page.

Reason: Windows Ease of Access settings are not equivalent to macOS Accessibility app permission approval. Pretending they are equivalent would make Computer Use permission troubleshooting misleading. Keeping routing in a pure adapter helper gives a tested decision table while preserving the existing Tauri command shape and avoiding Web UI, Computer Use schema, desktop host, WGC/input adapter, Flow Chat, AI media, AI short-drama, terminal, provider, and crate-layout changes.

## DEC-110: Windows Pointer Coordinate Evidence Is Split Between Contract Tests and Smoke

Decision: `ISSUE-1130C1` treats Windows pointer coordinate safety as a desktop-host contract plus a separate Windows smoke obligation. Focused Rust tests may lock `PointerMap` math, explicit `screenshot_id` map precedence, and missing pointer-basis failures. They must not be used to claim real DPI, mixed-scale multi-monitor, foreground/occluded target, WGC/PrintWindow/BitBlt, or UIPI/high-integrity delivery parity.

Reason: The current host already owns `mouse_move_global_f64`, app pid maps, screenshot-id maps, and Windows input outcome status. These are valuable upstream-aligned contracts that can be regression-tested without touching production behavior. Actual pointer hit-testing and delivery still depends on Windows display scaling, monitor layout, compositor behavior, foreground restoration, and target integrity; overclaiming from non-Windows or pure Rust tests would hide platform risk and could encourage UI or schema layers to infer coordinate trust from the wrong boundary.

## DEC-111: Short Drama Image Understanding Bridge Starts With Export Leak Guard

Decision: `ISSUE-1140E1` locks the Main AI short-drama context export as a low-context awareness package. The export may include `ShortDramaProject` ids, stage/episode state, media ids, active-media summaries, preview/playable booleans, and recommended `ShortDramaProject` tool reads. It must not include raw `mediaReference` objects, preview/thumbnail URLs, local paths, file paths, data URLs, public CDN URLs, raw media bytes, or provider payloads. A future image-understanding adapter may convert explicit short-drama image media into generic image contexts, but `AnalyzeImage` must remain short-drama-agnostic.

Reason: Upstream image-understanding work is useful for AI short-drama and media workflows, but the right-side short-drama panel is a projection, not the AI-facing source of truth. Starting with the export leak guard protects Main AI context size and privacy while preserving current media generation, artifact coordinates, stage-agent workflows, and the generic image-analysis boundary. The adapter step needs its own issue and tests so it does not smuggle raw media URLs into awareness or make `AnalyzeImage` depend on short-drama project internals.

## DEC-112: Terminal Runtime-Port Ideas Start With Static Owner Guards

Decision: `ISSUE-1120B` defers upstream-style terminal runtime-port or `src/crates/services/terminal` migration and instead records the current owner chain in the boundary checker. Web terminal UI/services own presentation and replay normalization, desktop `terminal_api.rs` owns Tauri DTO/command/event adaptation only, and `terminal-core` owns `TerminalApi`, `SessionManager`, PTY lifecycle, and replay/history facts. `void-runtime-ports` must remain DTO/trait-only and must not acquire terminal-core, PTY, Tauri, or remote SSH implementation dependencies through this issue.

Reason: Upstream terminal/runtime-port decomposition is valuable as an ownership idea, but moving terminal execution, replay, remote SSH, desktop commands, and service assembly at once would be architecture-scale. A static guard preserves the stable local chain already hardened by input, replay, and history slices while avoiding behavior changes to terminal UI, Flow Chat, multi-agent/subagent workflows, AI media, AI short-drama, Computer Use, provider adapters, or crate layout.

## DEC-113: Tool Outcome Classification Starts Inside Pipeline

Decision: `ISSUE-1150E1` adds `ToolPipelineOutcome` as a core tool-pipeline contract for status, source, category, error code, and retryability. The existing assistant-facing error result shape remains unchanged, but its `category` is now derived from the typed helper. User rejection, confirmation timeout, runtime restriction denial, collapsed-tool gate denial, MCP runtime error, ordinary tool timeout, cancellation, not-found, invalid-arguments, and generic execution errors have stable internal categories.

Reason: Upstream tool runtime hardening is useful, but changing Flow Chat tool cards or event ABI before the pipeline has stable outcome semantics would force UI to keep matching strings such as "User rejected" or "Confirmation timeout". Starting at the pipeline boundary gives future UI/rendering work an explicit contract while preserving current tool execution flow, event fields, MCP manager lifecycle, provider adapters, media services, AI short-drama services, multi-agent/subagent behavior, and crate ownership.

## DEC-114: Tool and Plugin Runtime Owner Moves Require Separate Gates

Decision: `ISSUE-1150F` records upstream `65da1a082` tool/event ABI contracts and `4da7ae5d8` plugin runtime boundary as migration candidates, not accepted code moves. Current Void keeps `ToolCatalogSnapshotProvider`, `RuntimeEventSink`, runtime-port DTOs, product-runtime tool assembly, MCP runtime state, ExecCommand/tool-runtime policy, remote file helpers, and event projection behavior in their existing owners until a candidate-specific issue supplies manifest checks, behavior-equivalence tests, and compatibility decisions.

Reason: These upstream commits are architecture-scale and cross tool manifests, runtime events, product capabilities, LSP/plugin boundaries, service assembly, and remote/runtime adapters. Treating registration as permission to migrate would risk Flow Chat tool cards, multi-agent/subagent scheduling, review readonly policy, AI media, AI short-drama, MCP timeout behavior, provider boundaries, and event consumers. A planning gate preserves the useful boundary ideas while keeping runtime behavior and crate layout unchanged.

## DEC-115: Short Drama Image Bridge Splits Low-Context References From ImageContext Conversion

Decision: `ISSUE-1140E2` keeps short-drama image-understanding bridge logic inside `src/web-ui/src/shared/services/short-drama`. `resolveShortDramaImageUnderstandingReference` returns only `ShortDramaProject` coordinates and prompt summary fields for an image artifact/media reference. `createShortDramaImageContextForArtifact` and `createShortDramaImageContextFromMediaReference` are separate explicit conversion helpers that produce generic `ImageContext` only when a local or relative image path exists. Remote preview URLs, data URLs, thumbnail URLs, raw bytes, video media, audio media, missing media, and missing artifacts return explicit status/error results instead of UI fallbacks or string inference.

Reason: Upstream image-context work is useful for AI short-drama, but Main AI awareness and UI surfaces must remain low-context projections. Splitting reference resolution from backend image-context conversion prevents raw media URLs or paths from entering awareness export while still giving future image-analysis workflows a typed adapter. This preserves `ShortDramaProject` as the AI-facing source of truth and keeps generic `AnalyzeImage`, provider adapters, media services, Flow Chat UI, and right-panel components short-drama-agnostic.

## DEC-116: Terminal Ack Is Hook-Consumption Owned

Decision: `ISSUE-1120D1` connects Web terminal flow-control acknowledgement at the `useTerminal` live-output consumption boundary. After the hook delivers non-empty live output to its consumer, it calls `TerminalService.acknowledge(sessionId, data.length)` and logs ack failures without blocking output rendering. Replayed history output is not acknowledged, while pending live output drained during replay handoff is acknowledged after delivery. The replay-aware event queue owns reference-level duplicate suppression for the same event object arriving through both listener and pending-drain paths.

Reason: `TerminalService` normalizes transport events and xterm components render queued output; neither layer should decide backend flow-control consumption. Keeping ack in the hook preserves replay-before-live ordering, avoids acknowledging history snapshots, and prevents xterm UI details from coupling to backend `terminal_ack` policy. The current character-count contract remains compatible with existing `terminal_ack`; byte-count semantics, if needed, require a separate backend/frontend contract issue.

## DEC-117: Upstream Crate Layers Are Vocabulary, Not Paths

Decision: `ISSUE-1180A` records an upstream-inspired conceptual mapping for current Void crates in `docs/architecture/core-decomposition.md`, but keeps the physical workspace flat and remains subordinate to DEC-073. `surfaces`, `assembly`, `contracts/interfaces`, `execution`, `services`, and `adapters` are discussion labels only. They do not authorize `Cargo.toml` member changes, mirrored upstream directories, module renames, production import rewrites, interpreting `target`/`partial` as migration status, or concrete owner migration.

Reason: Upstream decomposition ideas are useful for talking about ownership, but current Void already has protected multi-agent, subagent, Flow Chat, AI media, AI short-drama, terminal, Computer Use, provider, ACP, desktop, CLI, server, and installer behavior. Treating labels as migration permission would create architecture churn without behavior evidence. Concrete owner moves still require separate issues, snapshot tests, focused equivalence checks, and `scripts/check-core-boundaries.mjs` guard coverage.

## DEC-118: Product Assembly Snapshot Is Documentation Only

Decision: `ISSUE-1180B` records current product assembly facts in `docs/architecture/core-decomposition.md` and does not introduce a Rust `ProductAssemblyPlan`, `DeliveryProfile`, service availability API, SDK profile, or feature graph change. Desktop and CLI continue to depend on `void-core` with `product-full`; server and relay remain their existing app surfaces; tool provider plans stay in `void-tool-packs` while concrete tool materialization remains in core product runtime.

Reason: Upstream product assembly contracts are useful as audit vocabulary, but current Void already has a full-capability guardrail through `product-full` and protected local product surfaces. A second runtime path would risk multi-agent/subagent, `/goal`, Flow Chat, AI media, AI short-drama, terminal, Computer Use, provider, MCP, ACP, desktop, CLI, server, relay, and installer behavior without a product requirement. Any future SDK/minimal profile or availability report needs a separate issue with snapshot, manifest, feature-graph, and behavior-equivalence evidence.

## DEC-119: Runtime Services Gap Audit Is Not Migration Permission

Decision: `ISSUE-1180C` classifies the current runtime service gaps as `contract-only`, `service-helper`, or `concrete-runtime` without moving code. `void-runtime-ports` remains DTO/trait/decision-primitive only. `void-services-core` and `void-services-integrations` may own pure helpers, DTOs, wire assembly, presentation helpers, and focused integration slices, but those helpers do not prove that scheduler, session restore, workspace/persistence reads, terminal execution, remote-connect dispatch, product tool runtime, or product-domain runtime ownership has migrated out of `void-core` or the existing runtime crates.

Reason: Upstream runtime/service decomposition is useful for future low-coupling work, but treating ports or helpers as completed owner moves would hide high-risk behavior changes. Concrete runtime gaps still need separate issues with protected surfaces, old-path compatibility, snapshot evidence, focused equivalence tests, and rollback-safe boundaries before any manager extraction, scheduler/session restore change, product dispatch change, feature graph edit, or compatibility facade change.

## DEC-120: High-Risk Migration Registry Is A Gate, Not Approval

Decision: `ISSUE-1180D` records upstream owner/runtime migration commits as `registered-only` candidates in `docs/architecture/core-decomposition.md`. The registry may reference `213299206`, `98f0f4113`, `bceded210`, `96cea08ca`, `8d69e5733`, and related product assembly work, but it does not approve code movement, Cargo feature changes, crate layout changes, manager extraction, app entrypoint rewrites, scheduler/session restore changes, terminal execution changes, provider owner moves, MCP lifecycle moves, or product runtime changes.

Reason: A registry is useful only if it preserves friction before high-risk work. Current Void protects multi-agent/subagent, `/goal`, Flow Chat, AI media, AI short-drama, terminal, Computer Use, provider, MCP, desktop, CLI, ACP, server, relay, and installer behavior. Each registered candidate still needs a separate implementation issue with protected surfaces, snapshot evidence, focused equivalence tests, boundary checks, and rollback-safe owner seams before code can change.

## DEC-121: Product-Full Remains The Full Runtime Guardrail

Decision: `ISSUE-1180E` records the current product entrypoint guardrails without changing manifests or features. Desktop, CLI, and ACP must keep explicitly depending on `void-core` with `default-features = false` and `features = ["product-full"]`. `void-core` must keep `default = ["product-full"]` and `product-full` must explicitly aggregate the current owner feature groups. Server and relay remain existing app surfaces, not evidence of an SDK/minimal runtime profile.

Reason: Upstream product assembly and SDK profile ideas are useful for vocabulary, but Void does not yet have a product requirement for a second runtime path. Weakening `product-full`, adding `DeliveryProfile`, changing app entrypoints, or treating server/relay as a minimal profile would risk multi-agent/subagent, `/goal`, Flow Chat, AI media, AI short-drama, terminal, Computer Use, provider, MCP, desktop, CLI, ACP, server, relay, and installer behavior without behavior-equivalence evidence.

## DEC-122: ViewImage Starts With Manifest, Provider, and Path Gates

Decision: `ISSUE-1140D1` rejects direct upstream `view_image` copying and splits any Void-native `ViewImage` implementation into separate manifest/readonly exposure, provider image-attachment capability, and workspace path/image-processing slices. `ISSUE-1140D3` makes provider image-attachment support a `ToolUseContext` capability contract with explicit supported/unsupported status, source, and reason; tools such as Computer Use and `ViewImage` must use that contract instead of duplicating provider string checks. `ISSUE-1140D4` completes `ViewImage` only as a readonly, collapsed `image_path` tool that returns a tool-result image attachment plus explicit metadata. `ViewImage` must remain distinct from `AnalyzeImage`: `AnalyzeImage` performs model image understanding, while `ViewImage` only attaches a workspace image for the primary model to inspect.

Reason: Current Void already has `ToolImageAttachment`, provider-side tool-image conversion, `ToolUseContext` workspace/path/capability facts, `AnalyzeImage`, AI media, and AI short-drama image flows. Copying upstream `view_image` directly would couple core tool contracts to provider wire details, bypass remote/local workspace policy, or leak image file/source details through UI and media services. Splitting the work keeps tool registration, provider attachment support, and file/image processing independently reviewable; keeping the provider gate in `ToolUseContext` prevents unsupported paths such as Gemini tool-result image output from silently dropping attachments. Limiting `ViewImage` to workspace `image_path` avoids overlapping with attached image IDs, media references, short-drama artifacts, and `AnalyzeImage` model execution.

## DEC-123: Windows Pointer Smoke Closure Uses Explicit Hardware Deferrals

Decision: `ISSUE-1130C9` closes `ISSUE-1130C` with bounded evidence plus explicit deferrals. Current evidence is limited to automated host contracts and a Windows 11 single-display 150% Notepad manual harness path. The following smoke scenarios remain deferred until a machine/session with the required external condition is available: 100% DPI, 125% DPI, mixed-scale multi-monitor with negative origin, occluded or non-foreground target windows, high-integrity/UIPI denial, and capture-source consistency across WGC/DWM/PrintWindow/BitBlt.

Reason: These conditions depend on display topology, Windows session scaling, foreground/occlusion behavior, process integrity, and capture backend observability. They cannot be proven by unit tests or by expanding a single 150% foreground Notepad run. Recording them as deferred prevents false parity claims while allowing the accepted upstream Windows coordinate and input hardening slices to close with honest evidence. Future work may reopen targeted smoke issues for each condition, but must not change Computer Use schemas, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, or macOS/Linux behavior to satisfy documentation-only gaps.

## DEC-124: Upstream Canvas Is A Product-Domain Reference, Not A Direct Merge

Decision: `ISSUE-1190` accepts the upstream Canvas wave through `ea14b2d42` as a high-value reference for persistent interactive artifacts, patch/update semantics, diagnostics, last-known-good compiled payloads, and generated-runtime governance. Current Void must not directly merge `bitfun-canvas` runtime, skills, desktop APIs, `core.canvas` tool exposure, iframe bridge, auto-repair, workspace/session opener actions, or session-scoped Canvas storage. Follow-up work must start with Void-owned artifact domain, boundary, and security decisions before implementation.

Reason: Upstream Canvas spans product-domain contracts, tool runtime, session storage, compiler/runtime services, desktop APIs, Web UI panels, tool cards, skills, theme domains, and agent mode exposure. Current Void already has protected multi-agent/subagent behavior, subconversations, floating chat, `GenerativeUI`, miniapps, AI media, AI short-drama canvas/services, terminal, Computer Use, provider boundaries, and Void brand identity. A direct merge would create dual source-of-truth risks and generated-runtime security risks; small follow-up issues can still reuse the useful ideas safely.

## DEC-125: Persistent Interactive Artifacts Need A Void-Owned Interface Before Runtime Code

Decision: `ISSUE-1190B` accepts `docs/architecture/canvas-artifact-domain-rfc.md` as the documentation contract for any future Canvas-like persistent interactive artifact module. Existing `GenerativeUI`, MiniApps, AI media, and AI short-drama artifacts keep their current owners and sources of truth. A future artifact module must expose a Void-owned logical reference plus explicit `status/source/error/diagnostic`, snapshot, source/compiled revision, exact-patch, and last-known-good compiled payload facts through its own module interface before UI panels, tool cards, desktop APIs, skills, or runtime bridges are added.

Reason: Upstream Canvas provides useful ideas, but Void already has several artifact-like modules with different ownership and safety requirements. Starting with a Void-owned interface prevents a future Canvas runtime from becoming a second source of truth for `.void/short-drama`, media manifests, MiniApp storage, or chat-scoped `GenerativeUI` cards. It also keeps generated runtime security, host bridge scope, tool exposure, and theme governance as separate reviewable issues.

## DEC-126: Visual Artifact Routes Have Single Owners

Decision: `ISSUE-1190C` accepts `docs/architecture/visual-artifact-boundary-decision.md` as the route ownership contract for visual artifact surfaces. `GenerativeUI` remains a chat-scoped tool result rendered by Flow Chat generated-widget cards and panels. MiniApps remain owned by MiniApp manager/domain modules, APIs, source files, permissions, and runtime state. AI media remains owned by media tools, media-reference services, workspace media library behavior, media job manifests, and generated asset manifests. AI short-drama remains owned by `ShortDramaProject`, short-drama services, workspace manifest adapters, runtime bridge, and panel projections. A future persistent interactive artifact route must use an explicit save/promote/import command through a Void-owned artifact module before any artifact state exists.

Reason: Upstream Canvas combines concepts that Void already splits across several product domains. A single route matrix prevents chat widgets, MiniApps, media assets, and short-drama artifacts from being silently reclassified as Canvas-like state. It also keeps current `GenerativeUI` compatibility while forcing future persistent artifact work to name its owner, source of truth, status/error model, security boundary, and contract tests before runtime code changes.

## DEC-127: Canvas Runtime Requires A Security Gate Before Host Actions

Decision: `ISSUE-1190D` accepts `docs/architecture/canvas-runtime-security-review.md` as the security gate for any future persistent interactive artifact runtime. Void must not import upstream Canvas runtime, desktop Canvas API, iframe host bridge, generated-content initiated file/session opening, HTML export, skills, `core.canvas` exposure, or auto-repair loop until separate implementation issues define iframe/worker isolation, message validation, action allowlists, user confirmation, structured diagnostics, revision-aware state persistence, CSP/source/bundle policy, and contract tests.

Reason: Upstream Canvas gives generated content a broad host bridge and session-scoped state path. Current Void has protected Flow Chat, multi-agent/subagent, BTW child dialogs, generated widgets, MiniApps, AI media, AI short-drama, terminal, provider, and desktop boundaries. Treating upstream runtime code as a drop-in feature would risk host UI control, hidden file/session actions, dual source-of-truth storage, and unbounded repair loops. A documentation gate keeps useful ideas such as diagnostics and last-known-good behavior while blocking runtime coupling until permissions and tests exist.

## DEC-128: Tool Card And MiniApp Visual Metadata Stay In Narrow Helpers

Decision: `ISSUE-1190E` accepts the upstream governance pattern of separating lightweight metadata from heavy card/runtime registries, but applies it only to current Void surfaces. Flow Chat tool-card display names, confirmation policy, MCP fallback naming, and unknown-tool fallback are owned by `toolCardMetadata.ts`; `tool-cards/index.ts` remains the component registry and compatibility re-export. MiniApp icon-name resolution and fallback remain owned by `miniAppIcons.tsx`; Gallery/Card/Store surfaces only render helper output. MiniApp icon gradients are exposed as MiniApp-gallery CSS variables, not raw gradient strings returned from runtime helper logic.

Reason: Tool-card headers and MiniApp icons are low-risk upstream improvements, but copying Canvas tool cards or runtime ownership would bypass existing Void boundaries. A narrow metadata/icon helper keeps UI components from inferring backend tool identity or icon availability, preserves existing imports, and lets tests cover the module interface rather than card implementation details.

## DEC-129: Generated Runtime Theme Debt Is Separately Reported But Not Subtracted

Decision: `ISSUE-1190F` accepts a Void-owned `generated-runtime` color domain in theme governance only. The domain is declared in `theme-css-var-contract.json` with owner, reason, merge policy, and path prefixes, and `audit-theme-colors.mjs` reports both `colorDomains[]` and stable `domainMetrics`. Web UI baseline enforcement now includes global `uniqueColors`, `domainMetrics.app-ui.uniqueColors`, and `domainMetrics.generated-runtime.uniqueColors`; generated-runtime colors are visible and independently enforceable, but they are not subtracted from the global hardcoded-color budget.

Reason: Upstream domain-owned color budgeting is useful for iframe/generated-runtime fallbacks, but Void must not use domain separation to hide app UI color debt or import BitFun/Canvas naming. Keeping global and per-domain budgets together protects current app UI while still giving future generated runtime work a clear audit boundary.
