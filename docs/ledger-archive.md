# Ledger Archive

This archive replaces `docs/TEST_PLAN.md`, `docs/PROGRESS.md`, and `docs/ISSUES.md` (the frozen upstream-migration bookkeeping). It keeps only the durable contracts: protected capabilities, permanently rejected decisions, and acceptance criteria still asserted by live tests. All completed checkboxes, ISSUE-XXXX progress entries, dated status updates, and "verified on <date>" logs were dropped.

---

## 1. Protected capabilities

These are must-not-break contracts. This list merges the AGENTS.md "Protected capabilities" section with the protected contracts recorded in the three ledgers.

### Flow Chat, sessions, and multi-agent

- Flow Chat session restore (`SessionHistoryState`, `SessionContextRestoreState`) — never restored via an empty-array shortcut.
- BTW child sessions and parent-child state (`btwOrigin`, `parentSessionId`).
- Subagent projection fields (`subagentType`); multi-agent and Review Team behavior.
- Goals (`/goal`), multitask, and automation workflows.
- Partial/deferred history hydration (`isPartial`, `loadedTurnCount`, `totalTurnCount`); no UI infers history state from `sessions: []`.
- Model-round item ordering, progressive render, virtual-list session-boundary reset.

### AI media

- AI media submission, polling, workspace save, gallery, preview, trash, and stable pending-to-ready tiles.
- Trash path safety: unsafe ids rejected before touching the filesystem adapter.
- Image reference guard: local/absolute paths are never sent to providers as URLs.

### AI short-drama

- Project facts owned by `ShortDramaProject` / `.void/short-drama`; manifest/script source precedence.
- Stage agents, fixed Skill policies, attempts, revisions, change requests.
- Media/image/video tools and final preview.
- Main AI export leaks no raw media URLs, local paths, or data URLs.

### Desktop and platform

- Desktop windows, compact chat, desktop pet, terminal, Computer Use, WebDriver, tray, updater, installer.
- `ComputerUseHost` remains the core-to-desktop platform boundary.
- Computer Use screenshot/click-safety state semantics remain explicit; unsupported platform actions are explicit via capability/status paths (never inferred from empty arrays).
- `AnalyzeImage`/`ViewImage` stay core-owned readonly tools; provider multimodal wire conversion stays in `void-ai-adapters`; image-context storage is a lookup layer, not a provider-policy layer.
- Void identity only: no BitFun/GCWing product, identifier, publisher, updater, registry, tray, or `BITFUN_*` residue.

### Terminal

- Terminal domain stays in terminal service/core; not moved into desktop API, Flow Chat preview, or runtime ports.
- Structured replay events plus legacy flat fallback; remote terminal history returns explicit `unsupported`, not fake replay.

### Governance and boundaries

- `UI / route -> Module Interface -> Adapter / service -> external system` dependency direction.
- UI renders explicit state; must not infer session source, capability, error, or support status from empty arrays or raw strings.
- No Tauri/filesystem/process/database/provider transport called from page or presentation components.
- Core boundary checker (`scripts/check-core-boundaries.mjs`) and brand audit (`scripts/brand-residue-audit.mjs`) remain active.

---

## 2. Permanently rejected decisions

Anything recorded as "will not do" / "rejected" / "out of scope forever". Do not re-propose these.

### Flow Chat and media/short-drama

- Whole Flow Chat / store / virtual-list replacement (UF-019, ISSUE-902) — would break session restore, multi-agent, BTW, media, short-drama.
- Replacing local media/short-drama canvas with upstream `ContentCanvas` (UF-020) — local AI media and short-drama modules are the source of truth.
- Whole-file replacement of `Terminal.tsx`, `ConnectedTerminal.tsx`, `TerminalToolCard.tsx`, `terminal_api.rs` (ISSUE-110A) — terminal domain remains local.
- Direct copy of upstream `analyze_image`/`view_image` plus image-upload flow (ISSUE-100A) — crosses UI, desktop API, tool runtime, provider, crate-layout boundaries.
- Direct migration of `bitfun-canvas` runtime, iframe bridge, skills, desktop APIs, `core.canvas` exposure, or session-scoped Canvas storage (ISSUE-1190) — creates dual source-of-truth risk.
- Canvas auto-repair and generated-content-initiated file/session opening (ISSUE-1190D, DEC-127) — no permission/loop control exists.

### Brand, installer, and identity

- BitFun product/identifier/publisher/updater/registry/tray text (BRAND-DESKTOP-IDENTITY) — Void identity only.
- BitFun naming/config and installer/globals (C14, UF-021) — Void identity only.
- `BitFun-Installer/*` and upstream installer/package/Tauri config (UBDI-013) — only a separate Void rewrite could reopen this.
- Installer and brand upstream changes (ISSUE-901) — would overwrite Void identity and installer contracts.
- `BITFUN_WEBDRIVER_*` env names (WEBDRIVER-BITFUN-ENV) — must use `VOID_WEBDRIVER_*`.
- `BITFUN_*` env vars and `__BITFUN_*` globals in CI/E2E/startup trace (UBDI-020) — must use `VOID_*`/`__VOID_*`.

### Architecture and crate layout

- Upstream six-layer physical crate layout (`interfaces`/`assembly`/`adapters`/`services`/`execution`/`contracts`) as a directory structure (DEC-073, ISSUE-1180A) — current flat `src/crates/*` remains authoritative.
- Upstream crate decomposition and runtime-owner migrations (C13, ISSUE-900, ISSUE-1150, ISSUE-1180) — cross core/services/agent-tools/Web UI/product-runtime boundaries; needs behavior-equivalence evidence first.
- Provider HTTP/SSE owner moves into core; direct provider SSE parser imports in core (ISSUE-1170A) — provider ownership stays in `void-ai-adapters`.
- Upstream terminal crate fix / runtime-port owner moves (TERMINAL-CRATE-UPSTREAM, ISSUE-1120) — terminal exec/ownership must not move into runtime ports.
- Event ABI migrations and full approval-bar UI changes (ISSUE-1150) — cross-layer; rejected as part of the migration.

### Theme, i18n, and provider internals

- Direct copy of upstream broad `tokens.scss` compression, large SCSS color rewrites, BitFun/installer/CLI/mobile cross-surface baselines, legacy mixin deletion (ISSUE-1160) — visual identity is Void-owned.
- Upstream BitFun homepage copy/product names and `bitfun-*` theme ids (ISSUE-060D, ISSUE-060E).
- `bitfun-i18n-state` and upstream release/tap targets (ISSUE-060) — `void-i18n-state`, Void installer paths only.

### Migration policy

- Upstream whole-file replacement of any Flow Chat, terminal, or canvas component (ISSUE-003 policy) — migration is slice-by-slice, never wholesale; each slice must be independently testable.
- Automatic installation of an upstream ACP adapter/install package (ISSUE-001) — `omp` stays user-managed/native; no adapter is auto-installed.

### Tools and Computer Use

- `describe_screen` shortcuts: schema-only action without dispatch, aliasing to `screenshot` bypassing multimodal/provider gates, platform-specific screen description in core, Web UI inferring platform state (ISSUE-122A).
- `ViewImage` manifest exposure before provider image-attachment and path-processing gates prove themselves (ISSUE-1140D2) — rejected until then, not forever.
- Windows `ClickTarget::VisualGrid` support (ISSUE-120H5) — remains explicitly unsupported until real Windows smoke covers DPI/occlusion/DirectComposition/multi-monitor.
- Duplicate `terminal-core` workspace entries; removal of local ACP/confirmation behavior; pretending remote terminal history has structured replay (ISSUE-110A).

---

## 3. Acceptance criteria still asserted by live tests

Only criteria tied to a test file that still exists in `src/` are listed. Each cites its test path.

### Flow Chat, session, and subagent projection

- Explicit `SessionHistoryState` / `SessionContextRestoreState`; partial restore exposes `isPartial`/`loadedTurnCount`/`totalTurnCount`; deferred full-history projection is session-scoped and cannot overwrite a switched session.
  Tests: `src/web-ui/src/flow_chat/store/FlowChatStore.test.ts`, `src/web-ui/src/flow_chat/services/sessionOpenIntent.test.ts`
- History-projection handoff snapshots are session-scoped, release after real content, and never mutate store/session data.
  Tests: `src/web-ui/src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
- Virtual-list stable item keys include session identity; viewport-local scroll/follow state resets on session boundary.
  Tests: `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
- Initial historical render window keeps a bounded latest tail, expands upward, and preserves scrollTop mapping without `heightEstimates`/`firstItemIndex`.
  Tests: `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.test.ts`, `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
- Completed oversized model rounds render progressively from the newest tail; streaming rounds stay complete; media/subagent projection groups remain visible; model-round ordering preserved.
  Tests: `src/web-ui/src/flow_chat/components/modern/modelRoundProgressiveRender.test.ts`, `src/web-ui/src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`, `src/web-ui/src/flow_chat/components/modern/ModelRoundItem.progressive-render.test.tsx`
- Follow-output exits on explicit user upward-scroll intent; user intent cancels armed auto-follow.
  Tests: `src/web-ui/src/flow_chat/components/modern/useFlowChatFollowOutput.test.tsx`
- BTW child-session state (`btwOrigin`, `parentSessionId`) and transient child sends; DeepReview action-bar state.
  Tests: `src/web-ui/src/flow_chat/components/btw/BtwSessionPanel.presentation.test.tsx`, `src/web-ui/src/flow_chat/components/btw/BtwSessionPanel.review-action.test.tsx`, `src/web-ui/src/flow_chat/components/btw/useBtwSessionSnapshots.test.tsx`
- Subagent projection fields (`subagentType`) are preserved in session-nav projection.
  Tests: `src/web-ui/src/app/components/NavPanel/sections/sessions/sessionNavProjection.test.ts`
- Session nav list state (empty/loading/ready/expand) is explicit via `status`/`source`/`showExpandToggle`, not inferred from raw counts.
  Tests: `src/web-ui/src/app/components/NavPanel/sections/sessions/sessionNavSelection.test.ts`
- CodePreview streaming uses viewport-aware tail rendering with a 6,000-character cap; final content stays complete.
  Tests: `src/web-ui/src/flow_chat/components/CodePreview.test.tsx`
- `RichTextInput` forwards `data-*`/`aria-*`/standard div attributes while owning IME, mention, paste, and tag behavior.
  Tests: `src/web-ui/src/flow_chat/components/RichTextInput.test.tsx`, `src/web-ui/src/flow_chat/components/richTextInputSync.test.ts`

### AI media

- Workspace media availability/library states, path mismatch, empty/error UI states, and stable pending-to-ready slot replacement.
  Tests: `src/web-ui/src/shared/services/workspace-media/WorkspaceMediaLibrary.test.ts`, `src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx`, `src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaTileViewModel.test.ts`
- Trash path safety: unsafe trash id path segments are rejected before restore/purge; save-failure fallback and trash-restore/purge safety covered.
  Tests: `src/web-ui/src/shared/services/workspace-media/WorkspaceMediaLibrary.test.ts`
- Media image-reference guard: unmatched Windows/POSIX/relative local paths are filtered out of provider `image_urls`; valid `http(s)`/`data:image` pass through.
  Tests: `src/crates/core/src/agentic/tools/implementations/media_tools.rs` (`mod media_image_reference_tests`)

### AI short-drama

- Project facts, manifest/script source precedence, workspace mismatch, workspace mode, project view model, change events, target resolution.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaStaticProject.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaWorkspaceMode.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaWorkspaceBinding.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaTargetResolver.test.ts`
- Stage-agent tool policy and stage-mismatch boundaries; artifact attempts/revisions/change requests and optimization workflow.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaToolPolicy.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaArtifactRevisionWorkflow.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaChangeRequest.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaArtifactOptimizationWorkflow.test.ts`
- Main AI export leaks no `mediaReference`, `previewUrl`, `thumbnailUrl`, `localPath`, `filePath`, raw data/CDN URLs, or byte labels.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaMainAIContextExport.test.ts`
- Image-context bridge resolves short-drama image references without exposing raw media and rejects non-image/remote/data-URL references.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaImageContextBridge.test.ts`
- Short-drama stage workspace resolves per-stage artifacts; canvas open is gated by a single short-drama-owned policy.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaStageWorkspace.test.ts`, `src/web-ui/src/app/components/panels/content-canvas/registry/ShortDramaCanvasOpenPolicy.test.ts`

### Media generation and Flow Chat tool cards

- Synthetic AI media generation groups render fully (never hidden by progressive render or grouping); media tool grouping preserved.
  Tests: `src/web-ui/src/flow_chat/tool-cards/MediaGenerationToolCard.test.tsx`, `src/web-ui/src/flow_chat/tool-cards/mediaToolGrouping.test.ts`, `src/web-ui/src/flow_chat/tool-cards/mediaResult.test.ts`
- Workspace media events and preview resolution stay owned by workspace-media services.
  Tests: `src/web-ui/src/shared/services/workspace-media/WorkspaceMediaEvents.test.ts`, `src/web-ui/src/shared/services/workspace-media/WorkspaceMediaPreviewResolver.test.ts`

### Provider adapters

- SSE retry for 408/409/425/429/5xx; `Retry-After` capped at 60s; RFC 2822 past HTTP-date and invalid `Retry-After` fall back to exponential delay; 401/400/404 not retried.
  Tests: `src/crates/ai-adapters/src/client/sse.rs` (inline)
- OpenAI content-part arrays: plain JSON arrays used as text/tool content remain text; only valid multimodal parts serialize as parts.
  Tests: `src/crates/ai-adapters/` OpenAI message converter tests
- Standalone model-selector helper (`primary`, `fast`, explicit ids, cache fallback) ported to `void_ai_adapters`.
  Tests: `src/crates/ai-adapters/tests/model_selector.rs`
- Tool-call argument accumulation and truncated-JSON safety for OpenAI/Anthropic/Gemini streams.
  Tests: `src/crates/agent-stream/tests/stream_processor_tool_arguments.rs`, `src/crates/agent-stream/tests/stream_replay_regressions.rs`
- Connection-test failures map to typed categories without leaking API keys/secrets.
  Tests: `src/crates/ai-adapters/` health-check classifier tests
- SSE fixture harness replays OpenAI split tool arguments (with usage and inline `<think>`), Anthropic extended-thinking, interleaved parallel tool use, malformed deltas, and Gemini string args.
  Tests: `src/crates/ai-adapters/tests/stream_test_harness.rs`, `src/crates/ai-adapters/tests/common/sse_fixture_server.rs`, `src/crates/agent-stream/tests/stream_test_harness.rs`

### Terminal

- Frontend input queue batches writes and keeps one write in flight.
  Tests: `src/web-ui/src/tools/terminal/utils/TerminalInputQueue.test.ts`
- Lazy terminal output renderer keeps a lightweight `<pre>` fallback that strips control sequences and bounds preview rows while xterm chunks load.
  Tests: `src/web-ui/src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`
- Paste policy: single-line paste, true multiline confirmation, PowerShell ReadLine Ctrl+V delegation.
  Tests: `src/web-ui/src/tools/terminal/utils/terminalPaste.test.ts`
- Resize repaint guard recognizes only standalone cursor-position output; normal live output passes through.
  Tests: `src/web-ui/src/tools/terminal/utils/resizeRepaintGuard.test.ts`
- Structured replay events (`{ cols, rows, data }`) plus legacy flat fallback; remote history returns empty replay / explicit `unsupported` instead of fake replay.
  Tests: `src/web-ui/src/tools/terminal/utils/terminalReplay.test.ts`, `src/web-ui/src/tools/terminal/services/TerminalService.test.ts`, `src/web-ui/src/tools/terminal/hooks/useTerminal.test.tsx`
- Local resize rejection (`onXtermResize -> false`) blocks backend resize; accepted resizes still synchronize.
  Tests: `src/web-ui/src/tools/terminal/utils/TerminalResizeDebouncer.test.ts`
- IME/key rollover safety net (keyCode 229) and composed `insertText` forwarding.
  Tests: `src/web-ui/src/tools/terminal/utils/terminalImeInputSafetyNet.test.ts`
- Replay screen-text width guard: resize/OSC/cursor/control-only replay does not enable the shrink guard.
  Tests: `src/web-ui/src/tools/terminal/utils/terminalReplay.test.ts`
- Terminal core get-history returns explicit `historyStatus`/`historySource` (`ready`/`local`) instead of relying on desktop/Web inference; remote unsupported history stays desktop-owned.
  Tests: `src/apps/desktop/src/api/terminal_api.rs` (inline)

### Computer Use

- `ComputerUseHost` stays the core-to-desktop boundary; `describe_screen` is readonly and uses only `computer_use_session_snapshot`, `computer_use_interaction_state`, `enumerate_ui_tree_text`.
  Tests: `src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs`, `src/apps/desktop/src/computer_use/desktop_host.rs`
- Windows `ClickTarget::VisualGrid` remains explicitly unsupported (`[WINDOWS_VISUAL_GRID_UNSUPPORTED]`); settings links use an adapter-owned decision table.
  Tests: `src/apps/desktop/src/computer_use/desktop_host.rs` (`windows_visual_grid`), `src/apps/desktop/src/api/computer_use_api.rs` (`windows_settings_route`)
- Windows pointer coordinate math: explicit `screenshot_id` maps win over pid fallback; missing/stale map fails closed.
  Tests: `src/apps/desktop/src/computer_use/desktop_host.rs` (`windows_app_image_coordinate`)
- Windows platform adapters (capture, background input, app enumeration, interactive filter) stay behind `ComputerUseHost` and carry explicit status/uncertainty.
  Tests: `src/apps/desktop/src/computer_use/windows_capture.rs`, `src/apps/desktop/src/computer_use/windows_bg_input.rs`, `src/apps/desktop/src/computer_use/windows_list_apps.rs`, `src/apps/desktop/src/computer_use/interactive_filter.rs`
- macOS background-input/route-model adapters keep terminal-like targets on key events and normal apps on text injection.
  Tests: `src/apps/desktop/src/computer_use/macos_bg_input.rs`, `src/apps/desktop/src/computer_use/desktop_host.rs` (`terminal_detect`)

### Core tools, goal, multitask

- `AnalyzeImage` is readonly; `image_id`/`image_path`/`data_url` exactly-one-source; workspace containment before reads; `data_url` payload ≤ 1 MiB, allowed raster MIME, recognized image bytes.
  Tests: `src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs` (`mod tests`)
- Prompt cache identity, TTL, restore prune/delete, scope invalidation; cache-read vs cache-creation token separation.
  Tests: `src/crates/core/src/agentic/session/prompt_cache.rs`, `src/crates/services-core/tests/token_usage_contracts.rs`
- Session usage and service contracts (usage accounting, service boundaries) hold at the services-core boundary.
  Tests: `src/crates/services-core/tests/session_usage_contracts.rs`, `src/crates/services-core/tests/service_contracts.rs`
- Goal state persisted and explicit (complete/blocked); billable tokens exclude cached reads.
  Tests: `src/crates/core/src/agentic/goal_mode/mod.rs` (inline)
- Multitask parallel behavior is permission-gated; recursive subagent spawn is blocked without losing depth.
  Tests: `src/crates/core/src/agentic/agents/definitions/custom/subagent.rs` (`DelegationPolicy`), `src/crates/core/src/agentic/multitask/mod.rs`
- Tool pipeline outcomes (rejection, confirmation timeout, runtime denial, collapsed-tool gate, MCP error, timeout, cancellation) map to stable typed categories; rejection is not conflated with invalid args.
  Tests: `src/crates/core/src/agentic/tools/pipeline/types.rs`, `src/crates/core/src/agentic/tools/pipeline/tool_pipeline.rs`
- `ViewImage` is a readonly, collapsed tool: workspace `image_path` only, no model call, returns `ToolImageAttachment` plus width/height/size metadata; resolves through `ToolUseContext` before reading bytes.
  Tests: `src/crates/core/src/agentic/tools/implementations/view_image_tool.rs` (inline)
- Image context storage/lookup: exact `image_id` lookup stable, filename/basename fallback requires a unique match (same-name collisions return `None`), expiration cleanup.
  Tests: `src/crates/core/src/agentic/tools/image_context.rs` (inline)

### MCP and services-integrations

- Remote MCP Streamable HTTP ordinary requests have a bounded 120s timeout; `tools/list`, `tools/call`, `resources/read`, `prompts/get` return typed `MCPRuntimeErrorKind::Timeout` on stall.
  Tests: `src/crates/core/tests/remote_mcp_streamable_http.rs`, `src/crates/services-integrations/src/mcp/server/connection.rs` (inline)
- Local stdio ordinary-request timeout is a distinct optional field from `initialize_timeout`; pending waiter is removed on timeout.
  Tests: `src/crates/services-integrations/src/mcp/server/connection.rs` (inline)
- MCP elicitation no longer advertises `schema_validation`; roots/sampling/elicitation capability JSON is explicit.
  Tests: `src/crates/services-integrations/tests/mcp_contracts.rs`
- Large MCP tool output is not truncated before the shared storage policy runs; raw `data`/`_meta` preserved.
  Tests: `src/crates/core/src/service/mcp/adapter/tool.rs` (inline)

### Session, tool, and product-domain contracts

- Session contracts (restore, model-round data) hold at the `core-types` boundary.
  Tests: `src/crates/core-types/tests/session_contracts.rs`, `src/crates/core-types/tests/surface_contracts.rs`
- Tool permission contracts (readonly, permission-gated) hold at the product-domain boundary.
  Tests: `src/crates/product-domains/tests/tool_permission_contracts.rs`, `src/crates/product-domains/tests/function_agent_contracts.rs`, `src/crates/product-domains/tests/miniapp_contracts.rs`
- Tool-catalog registry snapshot preserves readonly+enabled filtering and dynamic MCP provider metadata.
  Tests: `src/crates/agent-tools/tests/tool_contracts.rs`

### Stage agents and short-drama sessions

- Short-drama stage-agent session binding, hydration, and real-agent resolution stay short-drama-owned.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaStageAgentSessionBinding.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaRealStageAgentSessionResolver.test.ts`, `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentSessionHydration.test.ts`

### Terminal replay handoff

- Replay event queue duplicate-event guard prevents the same live event flushing twice across subscribe/drain handoff.
  Tests: `src/web-ui/src/tools/terminal/utils/terminalReplayEventQueue.test.ts`

### Theme and visual governance

- Theme color audit + CSS variable contract + near-pair decision governance; no BitFun/Canvas-owned domain naming.
  Tests: `scripts/audit-theme-colors.test.mjs`, `scripts/validate-theme-visual-contract.test.mjs`, `scripts/audit-cli-theme-colors.test.mjs`
- Media and short-drama surfaces use local semantic tokens mapped to global tokens (no direct `--void-*` or raw colors).
  Tests: `scripts/workspace-media-gallery-theme.test.mjs`, `scripts/short-drama-center-theme.test.mjs`, `scripts/media-short-drama-entry-theme.test.mjs`, `scripts/workspace-media-gallery-card-chrome-theme.test.mjs`, `scripts/workspace-media-gallery-generator-theme.test.mjs`, `scripts/workspace-media-gallery-operation-error-theme.test.mjs`, `scripts/short-drama-center-status-theme.test.mjs`, `scripts/short-drama-center-media-preview-theme.test.mjs`, `scripts/short-drama-center-final-preview-theme.test.mjs`, `scripts/short-drama-center-stage-card-theme.test.mjs`

### Review Team and deep review

- Review Team and DeepReview action-bar state, review actions, and service contracts remain protected; ReviewFixer stays gated by user approval.
  Tests: `src/web-ui/src/flow_chat/components/btw/DeepReviewActionBar.test.tsx`, `src/web-ui/src/flow_chat/services/DeepReviewService.test.ts`, `src/web-ui/src/app/scenes/agents/components/ReviewTeamPage.test.tsx`

### Git and context contracts

- Git operation contracts hold at the core and services-integrations boundaries.
  Tests: `src/crates/core/tests/git_contracts.rs`, `src/crates/services-integrations/tests/git_contracts.rs`
- Context-profile (prompt construction) contracts hold at the core boundary.
  Tests: `src/crates/core/tests/context_profile.rs`

### Remote workspace, services, and identity

- Remote SSH workspace/file contracts hold at the services-integrations boundary; diagnostic logs redact secrets.
  Tests: `src/crates/services-integrations/tests/remote_ssh_contracts.rs`, `src/crates/services-integrations/tests/remote_connect_contracts.rs`, `src/crates/services-integrations/tests/file_watch_contracts.rs`, `src/crates/services-core/tests/diagnostic_log_redaction.rs`
- `IDENTITY.md` frontmatter: unknown fields, comments, and relative order survive My Agent identity edits; known fields remain editor-owned.
  Tests: `src/web-ui/src/app/scenes/my-agent/identityDocument.test.ts`
- Short-drama project load, view model, and change-event contracts stay short-drama-owned.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaProjectLoadCoordinator.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaProjectChangedEvent.test.ts`
- Short-drama Main AI tools and runtime focus/bridge stay short-drama-agnostic toward generic image analysis.
  Tests: `src/web-ui/src/shared/services/short-drama/ShortDramaMainAITools.test.ts`, `src/web-ui/src/shared/services/short-drama/ShortDramaRuntimeFocus.test.ts`

### Brand, governance, and boundaries

- No BitFun/GCWing identity residue; Void installer/registry/updater identity preserved.
  Tests: `scripts/brand-residue-audit.mjs`, `scripts/check-github-config.mjs`
- Core never owns provider-specific HTTP/SSE transport; provider ownership stays in `void-ai-adapters`.
  Tests: `scripts/check-core-boundaries.mjs` (self-test), `scripts/check-core-boundaries.mjs` provider HTTP/SSE guard
- Theme color audit, CSS variable contract, and near-pair decision governance.
  Tests: `scripts/audit-theme-colors.mjs`, `scripts/theme-css-var-contract.json`
- i18n dynamic-key/fallback/locale/allowlist governance and generated-file contract.
  Tests: `scripts/i18n-contract.test.mjs`, `scripts/i18n-audit.mjs`
