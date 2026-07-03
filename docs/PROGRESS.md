# Upstream Migration Progress

Date: 2026-07-02

## Current Goal

Inventory every upstream `GCWing/BitFun` fix and optimization, classify it, and migrate accepted items into the current Void branch without breaking protected local capabilities.

## Baseline

- Remote repository: `nihaoran786-star/void`
- Baseline branch: `baseline/void-source-20260702`
- Baseline commit: `6b0476ea269cf69ddf512c3ec427655ec25fd731`
- Baseline tag: `baseline-20260702-void-source`

## Phase Status

- [x] Baseline branch and tag uploaded.
- [x] Main goal created in Codex.
- [x] Initial PRD created.
- [x] Initial architecture document created.
- [x] Initial issue list created.
- [x] Initial decisions document created.
- [x] Initial test plan created.
- [x] Subagents assigned and initial findings summarized.
- [x] Upstream inventory subagents completed.
- [x] ISSUE-003 inventory recorded in `docs/ISSUES.md`.
- [x] ISSUE-004 read-only verification completed and split into smaller P0 issues.
- [x] First implementation issue selected as a verification-first sub-issue.
- [x] First issue tests written.
- [x] First issue implementation complete.
- [x] First issue verification complete.
- [x] Second verification issue complete.
- [x] Third implementation issue complete.
- [x] Fourth verification issue complete.
- [x] Fifth verification issue complete.
- [x] Computer Use platform inventory complete.

## Subagent Summary

Initial role coverage:

- Product-Agent: PRD must define "complete" as full upstream inventory plus classified decisions, not copying every patch.
- Architecture-Agent: architecture doc needed harder boundaries for Flow Chat, BTW/subagent, workspace media, short drama, desktop adapter, terminal, Computer Use, and `void-agent-tools`.
- Issue-Agent: issue list needed an upstream inventory issue and smaller slices for chat input, startup trace, workspace media, short drama, image understanding, terminal, Computer Use, and Flow Chat performance.
- Implementation-Agent: first implementation-style candidate can be chat input polish, but only after P0 audit/inventory gates.
- Integration-Agent: protected events/fields must be preserved, especially `ContentCanvas`, `BtwThreadService`, `FlowChatStore`, workspace media, and short drama state models.
- QA-Agent: Rust tests are currently blocked by missing root workspace manifests; this must be recorded rather than treated as passing.
- Refactor-Guard-Agent: patches must map to one issue, avoid whole-file replacement, and keep business logic out of big UI/adapter files.
- Risk-Agent: highest risk areas are brand/installer identity, Flow Chat session model, media/short-drama facts, image understanding permissions, terminal/Computer Use adapters, crate layout, root scripts, and BitFun test baselines.
- Documentation-Agent: every issue needs traceable progress/test result entries and consistent decision records.
- Final-Review-Agent: implementation should not start until active issue, subagent summary, allowed files, forbidden files, preserved contracts, and verification are recorded.

## Active Issue

`ISSUE-1100 Upstream Incremental Inventory Refresh` is complete for the new 2026-07-03 selective upgrade wave.

Current upstream wave reference: `upstream-bitfun/main@ac16dcc18`.

Next candidate issue: `ISSUE-1110C Release Long-Session Turn Navigation E2E`.

Allowed files:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/ISSUES.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`
- `tests/e2e/specs/*`
- E2E helpers/fixtures if required
- docs

Forbidden files for next candidate:

- AI media and workspace media modules
- AI short-drama modules
- terminal/provider/Rust crates
- whole-file replacement
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-07-03-upstream-selective-upgrade-wave.md`

Forbidden:

- Web UI runtime files,
- Rust core or desktop/Tauri files,
- terminal, media, short-drama, provider, workflow, script, Cargo, package, or generated files,
- release upload/Homebrew behavior, crate layout, Computer Use DTO extraction, or render hot-path instrumentation.
- runtime registry assembly, Flow Chat runtime components/store/API, media, short-drama, terminal, desktop, provider adapter, script, workflow, Cargo, or package behavior.

Verification completed:

- Upstream ref confirmed at `ac16dcc1857331c53ced97671528a4e5dc51d310`.
- Recent upstream log includes `082cee447 refactor(theme): tighten extension color governance`.
- Scoped docs `git diff --check` passed with LF/CRLF warnings only.
- Theme baseline checks run by QA for readiness passed: `node --test scripts/audit-theme-colors.test.mjs`, `pnpm run check:theme-colors`, and `pnpm run check:theme-visual-contract`.

Next issue:

- Resolve remaining documentation consistency notes, then start exactly one scoped implementation issue.

Note: older issue sections below are historical snapshots. Current status is governed by this Active Issue section plus the latest issue-specific entries near the end of the file.

## ISSUE-999 Split Parent Closeout Audit

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Split-Parent-Risk-Agent and Documentation-Consistency-Agent review

Completed:

- Added a docs-only closeout issue for the remaining Split parents.
- Reconciled `ISSUE-020D`, `ISSUE-060I`, `ISSUE-122B`, and `ISSUE-900` as parent scopes whose safe accepted sub-issues are complete.
- Recorded the residual conditions for each parent: browser startup/render smoke, release/Homebrew owner policy, Computer Use DTO architecture decision, and crate-layout migration plan.
- Updated the PRD completion matrix so final migration success is measured by classified decisions, implemented accepted sub-issues, explicit deferrals, and rejected unsafe upstream changes rather than by whole-repo copying.
- Recorded `DEC-063`.

Files changed:

- `docs/PRD.md`
- `docs/ISSUES.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- Passed: issue-status scan for `Done`, `Split`, and `Rejected` issue states.
- Passed: Split/Rejected rationale scan covering browser smoke, release/Homebrew policy, DTO architecture, and crate-layout planning.
- Passed: `git diff --check -- docs/PRD.md docs/ISSUES.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/TEST_PLAN.md docs/PROGRESS.md`.
- Passed: explicit trailing-whitespace scan across closeout consensus docs.

Risk notes:

- This issue intentionally changes no runtime code, workflow, script, generated source, package metadata, or Cargo metadata.
- Final goal completion still requires a separate completion audit; this closeout only removes ambiguity around remaining Split parents.

## ISSUE-020D2 FlowTextBlock Render Profile Instrumentation

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus FlowTextBlock-Profiler-Agent review

Completed:

- Split `ISSUE-020D` into a FlowTextBlock-only profiling slice after subagent review.
- Added RED component tests proving enabled profiling was absent and default-off behavior records nothing.
- Wrapped `FlowTextBlock` in React Profiler only when `__VOID_RENDER_PROFILE_ENABLED__` is true.
- Recorded only sanitized render metrics through the existing `recordReactRenderProfile(startupTrace, ...)` helper.
- Kept the default-off path free of code/table regex scans by returning existing content before profiling work.
- Preserved `React.memo`, `useTypewriter`, raw `isStreaming` forwarding, auto-preview behavior, streaming cursor class, and runtime-status rendering.
- Recorded `DEC-062`.

Files changed:

- `src/web-ui/src/flow_chat/components/FlowTextBlock.tsx`
- `src/web-ui/src/flow_chat/components/FlowTextBlock.autoPreview.test.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Verification summary:

- RED confirmed missing FlowTextBlock profiling before implementation.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/FlowTextBlock.autoPreview.test.tsx`, 4 tests.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/CodePreview.test.tsx src/shared/utils/startupTrace.test.ts`, 18 tests.
- Passed: `pnpm run type-check:web`.
- Passed: `pnpm run build:web`, including Monaco asset verification.

Risk notes:

- Browser startup/render smoke was not run because `playwright`, `puppeteer`, `msedge`, `chrome`, and `chromium` commands were unavailable in this environment.
- Markdown renderer internals, syntax-highlighter internals, and ModelRound instrumentation remain deferred.
- Runtime profile recording stays default-off and developer-controlled through `__VOID_RENDER_PROFILE_ENABLED__`.

## ISSUE-122B1 Computer Use DTO Boundary Checker Guard

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus ComputerUse-DTO-Boundary-Agent review

Completed:

- Split high-risk `ISSUE-122B` so full Computer Use tool-contract DTO extraction remains deferred.
- Reproduced the boundary-checker self-test failure before adding Computer Use anchors.
- Added static owner anchors for `ComputerUseHost`, `computer_use_session_snapshot`, `computer_use_interaction_state`, and `enumerate_ui_tree_text`.
- Added static owner anchors for `describe_screen_result`, its existing seam usage, no-screenshot guard, schema exposure test, dispatch test, and readonly side-effect test.
- Recorded `DEC-061`.

Files changed:

- `scripts/check-core-boundaries.mjs`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- RED confirmed checker self-test failure before Computer Use anchors were added.
- Passed: `node scripts\check-core-boundaries.mjs`.
- Passed: `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts\check-core-boundaries.mjs`.
- Passed: `cargo test -p void-core describe_screen_ --lib -- --nocapture`, 5 tests.
- Passed: `cargo test -p void-core computer_use --lib -- --nocapture`, 27 tests.

Risk notes:

- This issue intentionally does not extract DTOs, add crates, add host methods, or move Computer Use behavior.
- Future DTO extraction still needs a separate architecture decision and migration test plan.

## ISSUE-900A Runtime Crate Boundary Inventory and Checker Hardening

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Runtime-crate-agent review

Completed:

- Split high-risk `ISSUE-900` so full crate reorganization remains deferred.
- Reproduced the failing boundary-checker self-test before implementation.
- Hardened `scripts/check-core-boundaries.mjs` self-test coverage for slash-containing content anchors.
- Added static anchors for dialog preempt policy usage, remote runtime host adapters, remote command handler traits, and initial-sync handlers.
- Documented the current Rust crate graph as authoritative until a later issue explicitly accepts a manifest/crate move.
- Recorded `DEC-060`.

Files changed:

- `scripts/check-core-boundaries.mjs`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- RED confirmed checker self-test failure before hardening.
- Passed: `node scripts\check-core-boundaries.mjs`.
- Passed: `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts\check-core-boundaries.mjs`.
- Passed: `cargo metadata --no-deps --format-version 1`.
- Passed: scoped `git diff --check` with LF/CRLF warning only.
- Passed: explicit trailing-whitespace scan.

Risk notes:

- This issue intentionally does not move crates or reduce runtime coupling by itself.
- Future crate reorganization still needs a dedicated plan covering Cargo manifests, dependency graph, tests, and protected local behavior.

## ISSUE-020D1 CodePreview Render Profile Instrumentation

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Startup-Trace-Agent review

Completed:

- Split deferred `ISSUE-020D` into a first CodePreview-only slice after subagent review.
- Added RED component tests proving enabled profiling was absent and default-off behavior records nothing.
- Wrapped `CodePreview` in React Profiler only when `__VOID_RENDER_PROFILE_ENABLED__` is true.
- Recorded only sanitized render metrics through the existing `recordReactRenderProfile(startupTrace, ...)` helper.
- Preserved existing streaming viewport-tail rendering and completed content behavior.
- Recorded `DEC-058`.

Files changed:

- `src/web-ui/src/flow_chat/components/CodePreview.tsx`
- `src/web-ui/src/flow_chat/components/CodePreview.test.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Verification summary:

- RED confirmed missing CodePreview profiling before implementation.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/CodePreview.test.tsx`.
- Passed: `pnpm --dir src/web-ui exec vitest run src/shared/utils/startupTrace.test.ts`.
- Passed: `pnpm run type-check:web`.

Risk notes:

- No browser startup/render smoke was run in this pass.
- Markdown, syntax-highlighter internals, FlowTextBlock, and ModelRound instrumentation remain deferred.
- Runtime profile recording stays default-off and developer-controlled through `__VOID_RENDER_PROFILE_ENABLED__`.

## ISSUE-060I1 Manual CLI Artifact-Only Workflow Draft

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Release-Workflow-Agent review

Completed:

- Split `ISSUE-060I` so release upload and Homebrew tap behavior remain deferred, while artifact-only manual packaging can move forward.
- Added `.github/workflows/cli-package-manual.yml` with `workflow_dispatch` only and `contents: read`.
- Added inputs for build ref, selected platform, Linux x64 runner baseline, and artifact retention days.
- Added dynamic matrix generation for Linux x64, Linux arm64, macOS arm64, macOS x64, or all.
- Built `void-cli` with `cargo build --release --target ... -p void-cli`, smoke-tested `--version` and `--help`, staged tarball plus sha256, and uploaded only GitHub Actions artifacts.
- Kept GitHub Release upload, Homebrew tap dispatch, desktop/nightly/release workflows, CLI source, and Cargo manifests unchanged.

Files changed:

- `.github/workflows/cli-package-manual.yml`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Verification summary:

- RED confirmed the manual artifact-only workflow was missing before implementation.
- Passed: `node scripts/check-github-config.mjs`.
- Passed: prohibited identity/release/Homebrew scan.
- Passed: required workflow contract scan.
- Passed: `cargo build --release -p void-cli`.
- Passed: `.\target\release\void-cli.exe --version`.
- Passed: `.\target\release\void-cli.exe --help`.

Risk notes:

- Workflow execution on GitHub runners was not run locally.
- macOS/Linux arm runner availability and cost remain operational concerns for manual users.
- Release upload and Homebrew tap dispatch remain deferred until explicit owner/release-policy confirmation.

## ISSUE-130E1 Flow Chat Initial History Window Helpers

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130E Architecture/Risk-Agent

Completed:

- Added `InitialHistoryRenderWindow`, `selectInitialHistoryRenderWindow`, and `mapInitialHistoryExpansionScrollTop` to `virtualMessageListLayout.ts`.
- Added tests for large historical tail window selection, latest user-only turn retention, small-history no-op behavior, and scrollTop mapping across omitted spacer expansion.
- Kept `VirtualMessageList` on the existing Virtuoso render path.
- Added docs splitting 130E into helper foundation and a later UI gate.

Files changed:

- `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.ts`
- `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts` failed before implementation because `selectInitialHistoryRenderWindow` and `mapInitialHistoryExpansionScrollTop` were missing and `VirtualMessageList` had no initial-history window integration.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts` passed, 22 tests.

Subagent review:

- 130E Architecture/Risk-Agent found no P0 in current code.
- It identified P1 risk for directly migrating upstream static scroller because current `scrollToTurn`, `scrollToIndex`, pin, follow, visible-turn, `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` behavior still assumes the existing Virtuoso contract.
- It recommended keeping this slice helper-only and requiring a separate 130E2 UI strategy gate.
- 130E1 Final-Review-Agent accepted the helper-only slice and found no P0/P1/P2.

Remaining risk:

- 130E1 does not yet reduce real `VirtualMessageList` initial render cost.
- 130E2 must choose a bounded-render strategy and prove imperative navigation/follow compatibility before changing UI render behavior.

Next issue:

- `ISSUE-130E2 Flow Chat Initial Historical Render Window UI Gate`

## ISSUE-130E2 Flow Chat Initial Historical Render Window UI Gate

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130E2 Risk/Architecture-Agent findings from the current thread

Completed:

- Enabled a gated static-scroller render path for long historical `VirtualMessageList` sessions selected by `selectInitialHistoryRenderWindow`.
- Initial render now uses the bounded latest history window plus an omitted-height spacer, while passing full-session indexes into `VirtualItemRenderer`.
- Upward wheel intent expands the window to the full historical item list.
- Added static-scroller navigation adapters for `scrollToTurn`, `scrollToIndex`, and `pinTurnToTop` so omitted historical targets expand before scrolling.
- Kept `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` wired outside the render branch against the same scroller ref.
- Added minimal SCSS for the static scroller, spacer, and static item container.
- Updated source-boundary tests to allow the 130E2 gated static scroller while continuing to forbid `heightEstimates`, `firstItemIndex`, history projection handoff, deferred hydration, store/API changes, media/short-drama changes, and terminal changes.

Files changed:

- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.tsx`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.scss`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
- `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `VirtualMessageList.initial-history-window.test.tsx` failed before static UI implementation because long historical sessions rendered through mocked Virtuoso instead of a bounded static window.
- RED: the same test failed before navigation adapters because `scrollToTurn`, `scrollToIndex`, and `pinTurnToTop` returned early without `virtuosoRef.current`.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx` passed, 5 tests.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/useFlowChatNavigation.test.ts src/flow_chat/components/modern/modelRoundItemGrouping.test.ts` passed, 5 files / 40 tests.
- GREEN: `pnpm run type-check:web` passed.

Remaining risk:

- No browser or packaged desktop long-history smoke was run, so real wheel/touchpad behavior, long-session frame time, and overlay geometry still need manual validation.
- The static path intentionally does not introduce Virtuoso `firstItemIndex`, `heightEstimates`, projection handoff, or deferred full hydration.

Next issue:

- Choose the next Flow Chat long-session slice from `ISSUE-130F`, `ISSUE-130G`, `ISSUE-130H`, or `ISSUE-130I` after a new Architecture Gate.

## ISSUE-130F1 Flow Chat History Projection Handoff Helpers

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130F Risk/Architecture-Agent

Completed:

- Added `historyProjectionHandoff.ts` with pure `HistoryProjectionHandoffSnapshot`, `activeSessionHistoryProjectionHandoff`, and `selectSessionOpenHistoryProjectionHandoff`.
- Added focused tests for active-session guarding, session-open bottom-tail snapshot creation, latest-user-message retention, duplicate prevention, partial-history exclusion, and static-initial-history exclusion.
- Updated `VirtualMessageList.session-boundary.test.tsx` to keep projection overlay/handoff state out of `VirtualMessageList` for this helper-only slice.
- Split 130F into 130F1 helper foundation and 130F2 UI gate.

Files changed:

- `src/web-ui/src/flow_chat/components/modern/historyProjectionHandoff.ts`
- `src/web-ui/src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts` failed before implementation because `./historyProjectionHandoff` did not exist.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts` passed, 4 tests.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts` passed, 4 files / 36 tests.
- GREEN: `pnpm run type-check:web` passed.

Subagent review:

- 130F Risk/Architecture-Agent recommended not directly implementing full upstream `historyProjectionHandoff` UI.
- The agent identified cross-session deferred projection pollution as the P0 risk and noted current Void `restoreSessionView` lacks upstream tail-limit/partial-history API support.
- It recommended store/API partial/deferred history contract work before overlay UI.

Remaining risk:

- 130F2 now renders a bounded visual overlay, but browser/desktop handoff timing remains unverified.
- Backend tail-limit request parameters and real background full-history hydration are still unimplemented.

Next issue:

- Prefer a backend/deferred full-history hydration scheduling slice if continuing the projection stack.

## ISSUE-130G1 Flow Chat Deferred History Projection Store Contract

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130G1 Risk/Architecture-Agent

Completed:

- Added optional `isPartial`, `loadedTurnCount`, and `totalTurnCount` to `Session`.
- Added the same optional partial-history contract fields to `RestoreSessionViewResponse`.
- Updated `FlowChatStore.loadSessionHistory` so partial `restoreSessionView` responses become `historyState: "ready"`, keep `isHistorical: true`, and retain explicit loaded/total counts.
- Added `FlowChatStore.applyDeferredSessionHistoryProjection` as a guarded store entry point that applies full projection only while the target session is still active.
- Kept virtual-list overlay UI, backend restore request changes, terminal, AI media, and AI short-drama modules out of scope.

Files changed:

- `src/web-ui/src/flow_chat/store/FlowChatStore.ts`
- `src/web-ui/src/flow_chat/store/FlowChatStore.test.ts`
- `src/web-ui/src/flow_chat/types/flow-chat.ts`
- `src/web-ui/src/infrastructure/api/service-api/AgentAPI.ts`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/store/FlowChatStore.test.ts` failed before implementation because partial restore was marked complete and the deferred projection store method did not exist.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/store/FlowChatStore.test.ts` passed, 30 tests.
- GREEN: `pnpm run type-check:web` passed.

Subagent review:

- 130G1 Risk/Architecture-Agent confirmed the slice should stay in Flow Chat store/API-facing state and must not change UI overlay, AI short-drama/media, terminal, child-dialog rendering, backend command parameters, or broad store structure.
- The agent recommended `historyState: "ready" + isPartial === true` for renderable partial history and keeping `contextRestoreState` separate from history turn state.

Remaining risk:

- 130G1 does not implement real background full-history hydration or backend tail-limit request parameters.
- Real backend/deferred full-history hydration scheduling and browser/desktop overlay smoke remain separate work.

Next issue:

- Choose a backend/deferred hydration scheduling slice or another accepted upstream issue after a new Architecture Gate.

## ISSUE-130H Flow Chat Terminal Output Preview Budget

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130H Risk/Architecture-Agent

Completed:

- Added `terminalOutputPreview.ts` with explicit row and character preview budgets.
- Added helper tests for short-output preservation and long-output latest-tail budgeting.
- Added `TerminalToolCard.preview-budget.test.tsx` to prove live and completed terminal cards pass bounded preview strings into `LazyTerminalOutputRenderer`.
- Wired `TerminalToolCard` to budget live output to 4 rows / 8,000 characters and completed/cancelled output to 15 rows / 24,000 characters.
- Preserved full terminal panel access through the existing terminal session id and open-in-panel action.
- Kept terminal backend/core, replay services, ACP permission actions, `FlowChatStore`, `VirtualMessageList`, AI media, and AI short-drama modules out of scope.

Files changed:

- `src/web-ui/src/flow_chat/tool-cards/TerminalToolCard.tsx`
- `src/web-ui/src/flow_chat/tool-cards/TerminalToolCard.preview-budget.test.tsx`
- `src/web-ui/src/flow_chat/tool-cards/terminalOutputPreview.ts`
- `src/web-ui/src/flow_chat/tool-cards/terminalOutputPreview.test.ts`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalOutputPreview.test.ts` failed before implementation because the helper did not exist.
- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/TerminalToolCard.preview-budget.test.tsx` failed before wiring because full live/final output was passed to the renderer.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalOutputPreview.test.ts src/flow_chat/tool-cards/TerminalToolCard.preview-budget.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts` passed, 3 files / 8 tests.
- GREEN: `pnpm run type-check:web` passed.

Subagent review:

- 130H Risk/Architecture-Agent confirmed the slice should stay in Flow Chat terminal tool-card presentation and pure helper tests.
- The agent explicitly rejected terminal backend/core, replay/history, `ConnectedTerminal`, `Terminal`, terminal service, `FlowChatStore`, `VirtualMessageList`, ACP permission action, AI media, and AI short-drama changes for this issue.

Remaining risk:

- No browser/desktop visual smoke was run for the terminal output card.
- Full terminal replay performance remains outside 130H and should be handled only by a separate terminal issue if needed.

Next issue:

- Choose a backend/deferred hydration scheduling slice or another accepted upstream issue after a new Architecture Gate.

## ISSUE-130I Code Preview Long Streaming Performance

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130I Risk/Architecture-Agent

Completed:

- Added `CodePreview.test.tsx` with focused streaming-tail tests.
- Replaced fixed 60-line streaming tail rendering in `CodePreview.tsx` with viewport-aware tail rendering, overscan, max-line bounds, and a 6,000-character cap.
- Preserved completed/non-streaming CodePreview full-content rendering.
- Preserved real line-number mapping for tail-rendered streaming previews.
- Added `codePreviewPerfHarness.tsx` as a manually callable streaming perf probe using `void-code-preview-perf-probe` naming.
- Kept Flow Chat store/session state, `VirtualMessageList`, terminal core/replay, AI media, AI short-drama, Markdown rendering, and tool-result schema out of scope.

Files changed:

- `src/web-ui/src/flow_chat/components/CodePreview.tsx`
- `src/web-ui/src/flow_chat/components/CodePreview.test.tsx`
- `src/web-ui/src/flow_chat/components/codePreviewPerfHarness.tsx`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/CodePreview.test.tsx` failed before implementation because fixed 60-line streaming tail rendered too much hidden code.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/CodePreview.test.tsx` passed, 3 tests.
- GREEN: `pnpm run type-check:web` passed.
- Brand scan on 130I files found no `bitfun`, `BitFun`, `BITFUN`, or `__BITFUN` matches.

Subagent review:

- 130I Risk/Architecture-Agent recommended adapting the upstream viewport-aware tail and character budget while keeping completed content full.
- The agent rejected changes to Flow Chat store/session state, AI media, AI short-drama, terminal core/replay, `VirtualMessageList`, Markdown rendering, tool-result schema, and production wiring for the perf harness.

Remaining risk:

- No browser/desktop performance smoke was run for the optional perf probe.
- The perf harness is intentionally not wired into a command or production entry point.

Next issue:

- Choose a backend/deferred hydration scheduling slice or another accepted upstream issue after a new Architecture Gate.

## ISSUE-130D Flow Chat Stable Virtual Item Keys and Session Boundary Reset

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130D Risk/Architecture-Agent

Completed:

- Added `getVirtualItemStableKey` and `computeVirtualMessageItemKey` in `VirtualMessageList.tsx`.
- Scoped virtualized item keys with `activeSessionId` plus stable item identity.
- Added `virtualListSessionKey` and `key={virtualListSessionKey}` to remount `Virtuoso` across active session changes.
- Added `resetViewportStateForSessionBoundary` using `React.useLayoutEffect` to clear viewport-local state before paint.
- Added `VirtualMessageList.session-boundary.test.tsx` with source-contract checks and a jsdom behavior test proving at-bottom UI state does not leak from session A to session B.

Files changed:

- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.tsx`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx` failed before implementation for missing stable key helper, missing session remount key, and missing viewport reset.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx` passed, 5 tests.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts src/flow_chat/components/modern/useFlowChatNavigation.test.ts src/flow_chat/components/modern/modelRoundItemGrouping.test.ts` passed, 4 files / 28 tests.
- GREEN: `pnpm run type-check:web` passed.

Subagent review:

- 130D Risk/Architecture-Agent found no P0/P1 risk.
- It flagged P2 test-strength and one-frame-stale UI concerns; the final slice added a jsdom behavior test and moved reset to `React.useLayoutEffect`.
- 130D Final-Review-Agent found one P2 for incomplete streaming follow priming reset. The reset now clears mounted streaming follow priming and latest-turn follow tracking while leaving the existing session-change effect to handle unread completed-session scroll.
- Final re-review accepted the P2 fix and found no remaining P0/P1/P2.

Remaining risk:

- No packaged desktop or real browser scroll physics smoke was run.
- Initial history render windows, projection handoff, and deferred hydration remain out of scope for 130D.

Next issue:

- `ISSUE-130E Flow Chat Initial Historical Render Window`

## ISSUE-130C Flow Chat Virtual Message Height Estimates

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130C Architecture/Risk-Agent

Completed:

- Added `virtualMessageListLayout.ts` with pure default-height, item-height estimate, and historical projection classification helpers.
- Added focused tests for live legacy height, historical compact tails, historical model-round tails, content-aware user/model/explore/image estimates, and 130C/130E boundary protection.
- Wired `VirtualMessageList` `defaultItemHeight` to a helper derived from `activeSession.isHistorical` and current `virtualItems`.
- Kept `heightEstimates`, initial history windows, `firstItemIndex`, handoff overlays, deferred hydration, store/API changes, and virtual item shape changes out of scope.

Files changed:

- `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.ts`
- `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.tsx`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- RED: layout test failed before helper implementation because `virtualMessageListLayout` did not exist.
- RED: layout test failed again until session-level default-height resolver was added.
- Passed: focused `virtualMessageListLayout.test.ts` with 15 tests.
- Passed: combined focused Flow Chat command with 3 files / 23 tests.
- Passed: `pnpm run type-check:web`.
- Final-Review-Agent found one P2 where the exported low-level height helper did not self-gate live sessions; after RED test and fix, focused tests and type-check pass.

Remaining risk:

- No browser scroll-performance or packaged desktop long-history smoke was run.
- The integration boundary test is source-level; it does not render Virtuoso.
- Initial history render-window and concrete `heightEstimates` arrays remain future issues.

Next issue:

- `ISSUE-130D Flow Chat Stable Virtual Item Keys and Session Boundary Reset`

## ISSUE-130B Flow Chat Model Round Progressive Render

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 130B Architecture/Risk-Agent

Completed:

- Added `modelRoundProgressiveRender.ts` as a pure Flow Chat render helper.
- Added helper tests covering completed bounded initial tail rendering, streaming full rendering, chunk advancement, no shrink after streaming completion, and visible start/end index calculations.
- Added `ModelRoundItem` presentation-layer progressive rendering with component-local rendered-group count and timer state.
- Kept streaming rounds fully rendered.
- Added timer-driven reveal of deferred completed groups.
- Rendered rounds containing synthetic AI media groups or `Task` subagent groups fully to preserve grouped media visibility and subagent projection.
- Added component tests proving completed large rounds initially render only the newest 80 groups, streaming rounds render all groups, and media grouped rounds render fully.

Files changed:

- `src/web-ui/src/flow_chat/components/modern/modelRoundProgressiveRender.ts`
- `src/web-ui/src/flow_chat/components/modern/modelRoundProgressiveRender.test.ts`
- `src/web-ui/src/flow_chat/components/modern/ModelRoundItem.tsx`
- `src/web-ui/src/flow_chat/components/modern/ModelRoundItem.progressive-render.test.tsx`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- RED: helper test failed before implementation because `modelRoundProgressiveRender` did not exist.
- RED: component test failed before integration because completed large rounds rendered 105 items instead of 80.
- Passed: focused helper test.
- Passed: focused `ModelRoundItem` progressive-render test with initial tail, streaming full render, timer reveal, media full-render, and Task/subagent full-render coverage.
- Passed: existing `modelRoundItemGrouping.test.ts`.
- Passed: combined focused Flow Chat test command with 3 files / 19 tests.
- Passed: `pnpm run type-check:web`.
- Final-Review-Agent initially found a P1 where Task/subagent projection could be hidden by initial slicing; after RED test and fix, final re-review found no P0/P1/P2.

Remaining risk:

- No browser frame-rate or packaged desktop long-session smoke was run.
- Protected-group-aware partial slicing is deferred; current media and Task/subagent rounds render fully by design.
- Current worktree still contains prior issue changes, so any future commit must isolate 130B hunks carefully.

Next issue:

- `ISSUE-130C Flow Chat Virtual Message Height Estimates`

## ISSUE-120G Windows Computer Use Host App Actions

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 120G-Upstream-Host-Agent, 120G-Architecture-Agent, and 120G-QA-Risk-Agent

Scope completed:

- Added Windows target HWND resolution for `AppSelector` in `windows_list_apps`.
- Added target-window snapshot entrypoint, window PID, and window center helpers in `windows_ax_ui`.
- Wired Windows `app_click`, `app_type_text`, `app_scroll`, and `app_key_chord` through `ComputerUseHost` to existing `windows_bg_input` primitives.
- Preserved `WindowsInputOutcome` semantics: blocking/Win32/restore/unsupported failures fail closed; uncertain posted delivery is surfaced as `loop_warning`.
- Final review fixed same-HWND consistency: dispatch revalidates the target HWND before input and post-action snapshots are taken from that same raw HWND instead of re-resolving `AppSelector`.
- Kept Web UI permission policy, core tool schema, terminal behavior, macOS/Linux behavior, drag, `app_wait_for`, interactive/visual views, and `supports_background_input` unchanged.

Verification summary:

- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture` (2 tests).
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture` (4 tests).
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture` (10 tests).
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture` (5 tests).
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture` (2 tests).
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` (8 tests).
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed after final review fix: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`, `cargo test -p void-desktop windows_app_enumeration -- --nocapture`, `cargo test -p void-desktop windows_bg_input -- --nocapture`, `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`, and `cargo check -p void-desktop`.
- Scope scan found no new Web UI, core schema, permission UI, interactive/visual, or Windows capability flag wiring.
- Passed: scoped `git diff --check` for 120G files and docs; Git printed existing LF-to-CRLF warnings.

Risk notes:

- Automated tests prove host/adaptor state mapping and compilation, not real `PostMessageW`/`SendInput` delivery.
- Manual Windows smoke remains required for Notepad/Edit, Calculator/Settings/DirectComposition, elevated UIPI targets, scroll/drag-like surfaces, multi-display/DPI, foreground restore, and OCR target resolution.
- Windows `visual_grid`, drag, `app_wait_for`, interactive/visual view support, and capability advertisement remain deferred.

## ISSUE-120F Windows Computer Use Background Input Primitives

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus 120F-Upstream-Input-Agent, 120F-Architecture-Agent, 120F-QA-Risk-Agent, and 120F-Final-Review-Agent

Scope completed:

- Added `src/apps/desktop/src/computer_use/windows_bg_input.rs` as a Windows-only input adapter foundation.
- Added PostMessage-based primitives for click, screen-coordinate click, key, char, scroll, and drag.
- Added cloaked SendInput text/key primitives with foreground serialization and best-effort foreground restore reporting.
- Added UIPI integrity checks so lower-integrity processes do not treat input messages to higher-integrity windows as delivered.
- Added DirectComposition/UWP heuristics based on `WS_EX_NOREDIRECTIONBITMAP`, known XAML host class names, and known packaged app executable basenames.
- Added key/modifier parsing and mouse modifier flag helpers.
- Added internal `WindowsInputOutcome` and `InputDeliveryStatus` so posted, sent, blocked, foreground-fallback, restore-failure, unsupported, and Win32-error states remain explicit before host wiring.
- Final review fixed cloaked input failure handling so SendInput/PostMessage errors are converted to explicit `Win32Error` outcomes after restore/uncloak runs, and restore failure still takes precedence.
- Kept `desktop_host.rs`, user-facing app actions, interactive/visual views, Web UI permission policy, terminal crate behavior, `supports_background_input`, and core schema unchanged.

Verification summary:

- RED failed as expected before implementation: `cargo test -p void-desktop windows_bg_input -- --nocapture` reported missing 120F constants, helpers, parser, and outcome types.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture` (10 tests).
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture` (5 tests).
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture` (2 tests).
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` (8 tests).
- Scope scan of 120F files found only the existing `DesktopComputerUseHost` re-export in `mod.rs`; no app action, interactive/visual, schema, permission, or `supports_background_input` wiring was added.
- Passed: scoped `git diff --check` for 120F files and docs; Git printed existing LF-to-CRLF warnings.

Risk notes:

- 120G later wired this adapter into Windows `app_click`, `app_type_text`, `app_scroll`, and `app_key_chord`; this 120F section remains the adapter-foundation record.
- `PostMessageW` success is only queued/unknown delivery; high-integrity targets, DirectComposition/UWP targets, and framework-specific input managers can still ignore it.
- Cloaked SendInput can still affect foreground if cloak or restore fails; 120F exposes explicit restore failure status but does not yet surface it through user-facing tools.
- Manual Windows smoke remains required for classic Notepad/Edit, elevated target UIPI, modern Notepad/Calculator/Settings, scroll/drag targets, multi-display/DPI, and foreground restore behavior.

## ISSUE-120E Windows Computer Use Foreground Window Capture

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 120E-Upstream-Capture-Agent, 120E-Architecture-Agent, and 120E-QA-Risk-Agent

Scope completed:

- Added `src/apps/desktop/src/computer_use/windows_capture.rs` as a Windows-only adapter foundation.
- Implemented `capture_foreground_window` and `capture_window` entrypoints behind the adapter, without connecting them to current user-visible host paths.
- Added `PrintWindow(PW_RENDERFULLCONTENT)` capture, DWM extended-frame crop helpers, mostly-black detection, WGC explicit-unimplemented stub, and screen-region `BitBlt` fallback.
- Added internal `CaptureSource`, `WindowCaptureMetadata`, `CaptureRect`, and `WindowCapture` types so fallback and occlusion uncertainty stay explicit before any future host attachment.
- Added minimal Windows API features for DWM, GDI, and XPS `PrintWindow` bindings.
- Kept `desktop_host.rs`, `get_app_state`, `screenshot_display`, background input, app actions, interactive/visual views, Web UI policy, and core schema unchanged for this issue.

Verification summary:

- RED failed as expected before implementation: `cargo test -p void-desktop windows_foreground_capture -- --nocapture` reported missing adapter functions/types.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture` (5 tests).
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture` (2 tests).
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` (8 tests).
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: scoped scan of 120E files for input/action/interactive/visual/schema/Web UI patterns; no matches.
- Passed: scoped `git diff --check` for 120E files; Git printed existing LF-to-CRLF warnings.

Risk notes:

- The adapter is not yet wired into `desktop_host.rs`, so Windows `get_app_state` still returns `screenshot: None` and user-visible screenshot behavior is unchanged.
- `BitBlt` fallback captures current desktop pixels and can include occluding windows; future host attachment must surface this warning explicitly.
- Final review found that `BitBlt` fallback metadata should remain uncertain even when obstruction sampling does not observe a covering window; fixed by marking every `BitBltScreenRegion` result as `potentially_occluded` and adding a focused regression test.
- WGC remains unimplemented and must not be treated as available UWP/DirectComposition capture.
- Manual Windows smoke remains required for Notepad/Calculator, occluded windows, minimized windows, multi-display negative coordinates, DPI scaling, and elevated-window/UIPI behavior.

## ISSUE-120D Windows Computer Use UIA Snapshot and MSAA Fallback

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 120D-Architecture-Agent, 120D-Upstream-Implementation-Agent, 120D-QA-Risk-Agent, 120D-Final-Review-Agent, and 120D-QA-Review-Agent

Scope completed:

- Added cached Windows UIA foreground-window snapshot traversal in `windows_ax_ui.rs` using `IUIAutomationCacheRequest`, `TreeScope_Subtree`, `ControlViewCondition`, cached properties/patterns, and `BuildUpdatedCache` retry.
- Converted Windows accessibility nodes into the existing `AppStateSnapshot` and `AxNode` model.
- Added stable tree text rendering, dense reindexing, and SHA1 digest helpers for Windows snapshot output.
- Added a Windows MSAA fallback adapter for SAL/VCL-style windows when UIA fails or returns an empty tree.
- Added Windows-only `get_app_state_inner` routing in `desktop_host.rs`.
- Added required Windows crate features for MSAA `Ole` and `Variant` bindings.
- Kept screenshot capture, background input, app actions, interactive view, visual mark view, Web UI policy, and core schema changes out of this issue.

Verification summary:

- RED failed as expected before implementation: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`.
- RED failed as expected before implementation: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture` (2 tests).
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture` (3 tests).
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` (8 tests).
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: `node scripts/check-repo-hygiene.mjs`; Git printed existing LF-to-CRLF warnings.
- Passed: scoped `git diff --check` for touched files and docs; Git printed existing LF-to-CRLF warnings.
- Scope scan found only existing `desktop_host.rs` host/macOS method names and comments, plus one existing Windows locate message mentioning screenshot fallback; no new Windows capture/input implementation was added.

Risk notes:

- Windows `get_app_state` currently targets the foreground window; app selector targeting remains a later host-routing issue.
- Windows snapshot returns `screenshot: None`; foreground/window capture remains `ISSUE-120E`.
- SAL/VCL MSAA fallback needs manual smoke on LibreOffice/OpenOffice-style apps.
- UIA traversal can still return partial provider trees depending on app framework, privilege/UIPI, or provider health.

## ISSUE-110F Structured Terminal Replay

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 110F-Rust-Architecture-Agent, 110F-Desktop-API-Agent, and 110F-Web-Replay-Agent

Scope completed:

- Added `TerminalReplayHistory` and `TerminalReplayEvent` in `terminal-core` session ownership.
- Preserved legacy flat history via `get_history()` while adding ordered replay events via `get_replay_events()`.
- Recorded resize markers only when session dimensions change, so replay can apply geometry before later output without inflating flat `data`.
- Updated terminal-core API and desktop Tauri DTOs to return `events` alongside existing `data/historySize/cols/rows`.
- Kept remote terminal history explicit: remote history returns empty `events` and empty `data` rather than pretending replay is supported.
- Added Web `normalizeTerminalReplay` utility and `TerminalReplayEvent` type.
- Added a pure replay-aware live event queue helper so live events arriving after history fetch but before replay completion are not dropped.
- Updated `useTerminal` to prefer ordered replay events and keep old flat fallback behavior.
- Added bounded pending session-event buffering in `TerminalService` for events that arrive before a session listener is registered.
- Updated `ConnectedTerminal` to replay ordered resize/data queue items locally without calling backend resize during replay.

Files changed:

- `src/crates/terminal/src/session/replay.rs`
- `src/crates/terminal/src/session/mod.rs`
- `src/crates/terminal/src/session/serializer.rs`
- `src/crates/terminal/src/api.rs`
- `src/crates/terminal/src/lib.rs`
- `src/apps/desktop/src/api/terminal_api.rs`
- `src/web-ui/src/tools/terminal/types/session.ts`
- `src/web-ui/src/tools/terminal/hooks/useTerminal.ts`
- `src/web-ui/src/tools/terminal/services/TerminalService.ts`
- `src/web-ui/src/tools/terminal/services/TerminalService.test.ts`
- `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`
- `src/web-ui/src/tools/terminal/utils/terminalReplay.ts`
- `src/web-ui/src/tools/terminal/utils/terminalReplay.test.ts`
- `src/web-ui/src/tools/terminal/utils/terminalReplayEventQueue.ts`
- `src/web-ui/src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
- `src/web-ui/src/tools/terminal/utils/index.ts`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- Legacy `GetHistoryResponse.data`, `historySize`, `cols`, and `rows` remain available.
- Replay resize applies only to local xterm during recovery; it does not call backend `terminal_resize`.
- Live terminal events received by `TerminalService` before listener registration are buffered per session with a bounded queue, then drained into the replay-aware queue.
- No PTY process/platform resize implementation, data buffering, shell integration, crate layout, TerminalToolCard, Flow Chat, media, short-drama, ACP permission, installer, theme, i18n, CLI, or provider runtime behavior was intentionally changed for this issue.
- `Terminal.tsx` and `TerminalResizeDebouncer.ts` were not changed for this issue.
- Serialized sessions without `replay_events` remain readable via `#[serde(default)]`.
- The wider working tree still contains earlier issue and pre-existing changes; 110F's intentional code delta is limited to terminal session/API/DTO/Web replay paths and docs.

Verification summary:

- RED failed as expected: `cargo test -p terminal-core session::tests::replay_events_preserve_data_resize_data_order`.
- GREEN passed: `cargo test -p terminal-core session::tests::replay_events_preserve_data_resize_data_order`.
- Passed: `cargo test -p terminal-core session::replay`.
- Passed: `cargo test -p terminal-core session::`.
- RED failed as expected: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts`.
- GREEN passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts`.
- Passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`.
- Passed: `cargo check -p terminal-core`.
- Passed: `cargo check -p void-desktop` with one pre-existing unused function warning in `clipboard_file_api.rs`.
- Passed: `pnpm run type-check:web`.

Risk notes:

- Replay events use the upstream-compatible `{ cols, rows, data }` shape; empty `data` represents a resize marker.
- Full remote terminal replay remains unsupported and explicit.
- Broader upstream terminal animation/resize suspension improvements remain separate from 110F unless later issues accept them.
- Final code review flagged legacy serialized-session compatibility and a live-event replay window; both were fixed before final verification.

## ISSUE-110E Terminal Resize Repaint Guard

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 110E-Spec-Risk-Agent and 110E-Code-Explorer

Scope completed:

- Added pure `resizeRepaintGuard` utilities and focused tests.
- Recognized only standalone absolute cursor-position output (`ESC[row;colH` / `ESC[row;colf`) as resize repaint artifact candidates.
- Added a short bounded post-resize artifact counter and expiration window so resize repaint bursts do not run indefinitely.
- Cleared the guard on the first normal or mixed live output to avoid swallowing shell, TUI, or command output.
- Moved guard activation to successful backend resize completion and clear it on resize failure.
- Integrated the guard in `ConnectedTerminal.handleOutput`, the Web UI boundary where backend output enters live xterm.

Files changed:

- `src/web-ui/src/tools/terminal/utils/resizeRepaintGuard.ts`
- `src/web-ui/src/tools/terminal/utils/resizeRepaintGuard.test.ts`
- `src/web-ui/src/tools/terminal/utils/index.ts`
- `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No backend PTY/session/write/resize protocol, terminal-core, desktop terminal API, structured replay, TerminalToolCard, ACP permission, media, short-drama, installer, theme, i18n, CLI, or provider runtime files were changed for this issue.
- `Terminal.tsx` and `TerminalResizeDebouncer.ts` remained responsible only for xterm lifecycle, fit, resize, and refresh; they do not inspect ConPTY output protocol.
- Normal live output and mixed cursor/content output are not skipped.
- 110B lazy renderer, 110C input queue, and 110D paste policy behavior were preserved.
- The wider working tree still contains earlier issue and pre-existing changes; 110E's intentional code delta is limited to `resizeRepaintGuard.*`, `utils/index.ts`, and `ConnectedTerminal.tsx`.

Verification summary:

- RED failed as expected: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts`.
- GREEN passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts`.
- Passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`.
- Passed: `pnpm run type-check:web`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check -- src/web-ui/src/tools/terminal docs/PROGRESS.md docs/TEST_PLAN.md docs/ISSUES.md`.

Risk notes:

- The guard intentionally handles only standalone cursor-position repaint artifacts. Broader replay ordering and mixed historical data/resize event ordering remain `ISSUE-110F`.
- Cursor-position sequences from full-screen TUI programs are preserved when mixed with content or when no resize guard is active.
- Final reviewers flagged the initial default guard window as too broad; it was reduced to a short two-artifact, time-limited window and now clears on resize failure.

## ISSUE-110D Terminal Paste Policy

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 110D-Spec-Agent and 110D-QA-Risk-Agent

Scope completed:

- Added pure `terminalPaste` policy utilities and focused tests.
- Added single-line, multiline, trailing blank line, bracketed paste, warning mode, preview, paste-as-single-line, and Windows PowerShell ReadLine detection coverage.
- Extended `Terminal.tsx` paste callback handling so paste policy can block or replace pasted text.
- Added a terminal paste shortcut hook so `ConnectedTerminal` can delegate Windows PowerShell/pwsh Ctrl+V to PSReadLine via `\\x16`.
- Updated `ConnectedTerminal` to keep the existing `confirmWarning` UI while resolving paste decisions through the new utility.

Files changed:

- `src/web-ui/src/tools/terminal/utils/terminalPaste.ts`
- `src/web-ui/src/tools/terminal/utils/terminalPaste.test.ts`
- `src/web-ui/src/tools/terminal/utils/index.ts`
- `src/web-ui/src/tools/terminal/components/Terminal.tsx`
- `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No desktop API, terminal-core, PTY/session, replay, backend write protocol, TerminalToolCard, ACP permission, media, short-drama, installer, theme, i18n, CLI, or provider runtime files were changed for this issue.
- `confirmWarning` remains the visible multiline paste confirmation UI.
- Global editor paste behavior was not changed.
- `TerminalActionManager` paste behavior remains out of scope because it is not listed in 110D allowed files.

Verification summary:

- RED failed as expected: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts`.
- GREEN passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts`.
- Passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`.
- Passed: `pnpm run type-check:web`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check -- docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md src/web-ui/src/tools/terminal src/web-ui/src/flow_chat/tool-cards/TerminalToolCard.tsx`.

Risk notes:

- Global `TerminalActionManager` paste still has its own legacy policy; syncing it should be a separate allowed issue if needed.
- `pasteAsSingleLine` is supported by the pure policy, but current `confirmWarning` UI exposes only Paste/Cancel.

Next issue:

- `ISSUE-110E Terminal Resize Repaint Guard`

## ISSUE-110C Terminal Input Queue

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 110C-Spec-Agent and 110C-QA-Risk-Agent

Scope completed:

- Added `TerminalInputQueue` under Web UI terminal utilities.
- Added focused queue tests for synchronous batching, in-flight serialization, error recovery, multi-cycle ordering, and clear behavior.
- Exported the utility from `src/web-ui/src/tools/terminal/utils/index.ts`.
- Updated `ConnectedTerminal` so xterm `onData` and registered terminal action writes use the same queue.
- Added exited-session guards and queue clearing so pending buffered input is not written after terminal exit.

Files changed:

- `src/web-ui/src/tools/terminal/utils/TerminalInputQueue.ts`
- `src/web-ui/src/tools/terminal/utils/TerminalInputQueue.test.ts`
- `src/web-ui/src/tools/terminal/utils/index.ts`
- `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No backend write protocol, desktop API, terminal-core, PTY/session, or replay code was changed.
- No paste policy, PowerShell ReadLine behavior, resize repaint guard, lazy renderer, TerminalToolCard, ACP permission, media, or short-drama behavior was changed.
- Queue state is private to the Web UI terminal connection and is not exposed as global app state.

Verification summary:

- RED failed as expected: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts`.
- GREEN passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts`.
- Passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`.
- Passed: `pnpm run type-check:web`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check`.

Risk notes:

- Terminal action writes now enqueue and return before the batched write completes; this matches the async batching goal but is not a completion acknowledgement.
- E2E terminal typing remains useful before release, but was not required for this focused Web UI utility slice.

Next issue:

- `ISSUE-110D Terminal Paste Policy`

## ISSUE-110B Lazy Terminal Output Renderer

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 110B-Spec-Agent and 110B-QA-Risk-Agent

Scope completed:

- Added `LazyTerminalOutputRenderer` as a Web UI terminal component wrapper around the existing read-only xterm renderer.
- Added `TerminalOutputFallback` for Suspense loading, with control-sequence stripping, terminal class preservation, bounded height, and optional last-row preview.
- Exported the lazy renderer from the terminal components barrel.
- Swapped Flow Chat `TerminalToolCard` live, completed, and cancelled output rendering to the lazy renderer.
- Kept terminal service/core, desktop `terminal_api.rs`, PTY/session APIs, ACP permission actions, media, short-drama, installer, theme, i18n, and provider behavior unchanged.

Files changed:

- `src/web-ui/src/tools/terminal/components/LazyTerminalOutputRenderer.tsx`
- `src/web-ui/src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`
- `src/web-ui/src/tools/terminal/components/index.ts`
- `src/web-ui/src/flow_chat/tool-cards/TerminalToolCard.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- `TerminalToolCard.tsx` remains a presentation layer and did not gain PTY/session/source business logic.
- The existing `TerminalOutputRenderer` implementation was not replaced or broadened with upstream replay/scroll handle changes.
- No 110C/110D/110E behavior was mixed into this issue.

Verification summary:

- RED failed as expected: `pnpm --dir src/web-ui run test:run src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`.
- GREEN passed: `pnpm --dir src/web-ui run test:run src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`.
- Passed: `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalToolCardState.test.ts`.
- Passed: `pnpm run type-check:web`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check`.

Risk notes:

- The fallback is a plain-text preview, not an xterm-equivalent renderer; this is intentional for loading only.
- A future preload strategy or visible-text imperative handle remains out of scope for 110B.

Next issue:

- `ISSUE-110C Terminal Input Queue`

## ISSUE-110A Terminal Reliability Inventory

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus Upstream-Terminal-Agent and Local-Terminal-Boundary-Agent

Scope completed:

- Inventoried upstream terminal reliability files under `tmp/upstream-bitfun`.
- Compared local terminal boundaries across `src/crates/terminal`, desktop `terminal_api.rs`, Web UI `tools/terminal`, Flow Chat `TerminalToolCard`, Bash tool, and TerminalControl tool.
- Classified accepted terminal improvements into small follow-up issues: `ISSUE-110B`, `ISSUE-110C`, `ISSUE-110D`, `ISSUE-110E`, `ISSUE-110F`, and `ISSUE-120B`.
- Deferred upstream crate-layout migration and whole terminal UI/service replacement.
- Rejected BitFun identity/import/path changes, duplicate `terminal-core`, and removal of local ACP/confirmation behavior.

Files changed:

- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Terminal domain logic remains in `terminal-core` and terminal service boundaries.
- `terminal_api.rs` remains an adapter boundary for future DTO/command/event mapping.
- Flow Chat `TerminalToolCard` remains a presentation layer and must not infer PTY/session internals.
- Computer Use terminal/GVim detection is split to `ISSUE-120B`, not folded into terminal service.
- No runtime code, UI behavior, provider logic, media, short-drama, installer, i18n, theme, or CLI files were changed in this inventory issue.

Verification summary:

- Passed by read-only upstream inventory: upstream terminal candidates and tests were identified.
- Passed by read-only local boundary inventory: local terminal ownership and tests were identified.
- Passed by subagent review: upstream and local terminal conclusions agreed on boundaries and risk.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check`.

Risk notes:

- Structured terminal replay is the highest-risk follow-up because it crosses Rust terminal core, desktop DTOs, and Web UI hooks/types.
- Paste/input queue and resize repaint guard can change live terminal input/output behavior and require focused tests before integration.
- Remote terminal history support remains separate; 110A does not claim remote structured replay support.

Next issue:

- `ISSUE-110B Lazy Terminal Output Renderer`

## ISSUE-100C Image Understanding Runtime Adapter

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus Upstream-Image-Runtime-Agent and Local-Image-Boundary-Agent

Scope completed:

- Replaced the 100B schema-only placeholder with a minimal `AnalyzeImage` runtime adapter.
- Resolved supported sources: inline `data_url`, stored `image_id`/file-name references, and workspace-scoped `image_path`.
- Enforced workspace presence and workspace containment before reading local or remote image paths.
- Reused existing image processing helpers, configured image-understanding model resolution, and `AIClientFactory`.
- Kept provider-specific multimodal wire behavior in existing image-processing/adapter paths; no provider adapter files were changed.
- Kept Flow Chat, workspace media, AI media, short-drama, desktop upload APIs, and frontend behavior unchanged.

Files changed:

- `src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- `AnalyzeImage` remains readonly, concurrency-safe, collapsed, and provider-plan registered from 100B.
- `image_path` does not bypass workspace containment even for local absolute paths.
- `image_id` lookup uses the existing core image context store instead of frontend/media state.
- Errors are returned as structured statuses instead of raw provider/path exceptions.
- No upstream BitFun URI, crate layout, installer identity, CLI rendering, or UI upload flow was copied.

Verification summary:

- Passed: `cargo test -p void-core analyze_image --lib`.
- Passed: `cargo test -p void-core product_runtime --lib`.
- Passed: `cargo test -p void-core image_analysis --lib` with 0 matching tests.
- Passed: `cargo check -p void-core`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check`.

Risk notes:

- Live provider verification still depends on user configuration for `default_models.image_understanding` and credentials.
- Remote workspace image reads depend on injected `WorkspaceServices`; missing services are reported as `missing_workspace`.
- UI upload/context improvements remain separate future work, not part of 100C.

Next issue:

- `ISSUE-110A Terminal Reliability Inventory`

## ISSUE-100B Image Understanding Tool Schema and Permission Model

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added `AnalyzeImage` to the product tool provider plan and core product runtime materialization path.
- Added a core-owned `AnalyzeImageTool` with readonly/collapsed exposure, explicit JSON schema, exactly-one-source validation, and required output statuses.
- Kept execution schema-only: the tool returns `status: "error"` with `source: "schema_only"` until `ISSUE-100C`.
- Fixed a repository hygiene false positive by changing Bash tool documentation examples from absolute paths to relative placeholder paths.

Files changed:

- `src/crates/tool-packs/src/lib.rs`
- `src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs`
- `src/crates/core/src/agentic/tools/implementations/mod.rs`
- `src/crates/core/src/agentic/tools/product_runtime.rs`
- `src/crates/core/src/agentic/tools/implementations/bash_tool.rs`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No provider request, image loading, desktop upload, Flow Chat, workspace media, short-drama, or AI media behavior was wired.
- `ToolUseContext` remains the future owner for workspace/path/capability facts.
- `void-tool-packs` only owns provider group membership; concrete tool behavior stays in `void-core`.
- `void-agent-tools` remains provider-neutral and was not modified.

Verification summary:

- Passed: `cargo test -p void-core analyze_image --lib`.
- Passed: `cargo test -p void-tool-packs`.
- Passed: `cargo check -p void-core`.
- Passed: `cargo test -p void-core product_runtime --lib`.
- Passed after documentation example correction: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check`.

Risk notes:

- `AnalyzeImage` is now visible in the product tool catalog but intentionally cannot analyze images until `ISSUE-100C`.
- Runtime path policy, provider configuration, model capability checks, and image byte handling remain the next implementation risk.
- The Bash tool edit is documentation-only and was required to keep the repo hygiene gate green.

Next issue:

- `ISSUE-100C Image Understanding Runtime Adapter`

## ISSUE-100A Image Understanding Architecture Decision

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus Upstream-Image-Agent and Local-Boundary-Agent

Scope completed:

- Compared upstream image context upload, multimodal prompt, `analyze_image`, `view_image`, provider conversion, and UI card paths against current Void.
- Confirmed current Void already has `src/crates/core/src/agentic/image_analysis/*`, image context storage, `ToolImageAttachment`, provider multimodal conversion, and `void-tool-packs` image-analysis feature scaffolding.
- Rejected direct copy of upstream assembly crate layout, upstream runtime URI assumptions, and UI/desktop/provider-spanning implementation.
- Split follow-up work into `ISSUE-100B` schema/permission/manifest and `ISSUE-100C` runtime/tool execution.

Files changed:

- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No runtime, provider, UI, desktop API, media, short-drama, or workflow code changed.
- Workspace media and short-drama remain separate from generic image understanding.
- Provider adapters remain wire-conversion boundaries, not tool policy owners.
- `ToolUseContext` remains the owner for workspace/path and capability facts.

Verification summary:

- Passed: targeted static inventory of upstream image understanding paths.
- Passed: targeted static inventory of local image analysis, tool context, image context, provider conversion, and tool-pack boundaries.
- Passed: Upstream-Image-Agent and Local-Boundary-Agent read-only reviews.
- Final hygiene checks are recorded in `docs/TEST_PLAN.md`.

Risk notes:

- Runtime behavior remains unimplemented in this issue by design.
- `AnalyzeImage` can read files and send image bytes to a provider, so `readonly` must still enforce workspace read/path policy and explicit external-provider error states.
- Live provider/image tests remain for later runtime implementation.

Next issue:

- `ISSUE-100B Image Understanding Tool Schema and Permission Model`

## ISSUE-060I Manual CLI Package Workflow Inventory

Status: Deferred
Date: 2026-07-02
Owner/session: main orchestrator plus Release-Risk-Agent

Scope completed:

- Compared upstream `tmp/upstream-bitfun/.github/workflows/cli-package-manual.yml` with local `.github/workflows/cli-package.yml`.
- Identified useful upstream capabilities: manual platform selection, Ubuntu runner baseline selection, arbitrary ref checkout, dynamic matrix generation, read-only contents permission, and artifact names containing version plus short SHA.
- Confirmed local `.github/workflows/cli-package.yml` already provides Void-branded release-oriented CLI packaging and release upload behavior.
- Deferred creating `.github/workflows/cli-package-manual.yml` until release targets, artifact policy, and Homebrew tap ownership are explicitly confirmed.

Files changed:

- `docs/ISSUES.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No workflow file was created or modified.
- No upstream CLI crate name, binary name, artifact name, release target, repository dispatch, or Homebrew tap target was migrated.
- Void CLI package identity remains `void-cli`.

Verification summary:

- Passed: static comparison of upstream manual workflow and local CLI package workflow.
- Passed: Release-Risk-Agent read-only review agreed with deferring workflow creation.
- Passed: `cargo build --release -p void-cli`.
- Passed: `.\target\release\void-cli.exe --version`.
- Passed: `.\target\release\void-cli.exe --help`.
- Passed: repo hygiene and diff whitespace checks with LF/CRLF warnings only.

Risk notes:

- A future manual workflow can be useful for non-release artifact generation, but it must remain read-only, Void-branded, and separate from release upload/Homebrew dispatch unless owner approval is recorded.
- GitHub Actions behavior still needs live manual-run verification if a future issue adds the workflow.

Next issue:

- `ISSUE-100A Image Understanding Architecture Decision`

## ISSUE-060H Theme Visual Governance Contract

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added a Void-specific visual governance contract for required theme-sensitive surfaces.
- Added a validator that checks contract shape, required surface coverage, ownership path existence, allowed platform/form-factor/theme/evidence values, protected contracts, and upstream identity leakage.
- Kept the contract as QA governance only; no UI, theme token, runtime, installer, release, or product-copy changes were made.

Files changed:

- `scripts/theme-visual-governance-contract.json`
- `scripts/validate-theme-visual-contract.mjs`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Flow Chat state and multi-agent/subdialog/floating-window behavior were not touched.
- AI media and short-drama modules were referenced only as visual-review surfaces.
- Terminal UI/runtime boundaries were not changed.
- Mobile web and installer files were not changed.
- No upstream identity, globals, installer paths, or token families were introduced.

Verification summary:

- Passed: `node --check scripts/validate-theme-visual-contract.mjs`
- Passed after one contract path correction: `node scripts/validate-theme-visual-contract.mjs`
- Passed: `node scripts/validate-theme-visual-contract.mjs --json`
- Additional hygiene checks are recorded in `docs/TEST_PLAN.md`.

Risk notes:

- The contract is not a substitute for screenshots, contrast checks, type-check, build, or manual UI review when a later issue changes actual visuals.
- Installer and release workflow identity remain protected and must be handled in separate issues.

Next issue:

- `ISSUE-060I Manual CLI Package Workflow Inventory`

## Issue Progress Template

```md
## ISSUE-NNN Title

Status: Done | Blocked | Deferred | Rejected
Date: YYYY-MM-DD
Owner/session:
Scope completed:
Files changed:
Preserved contracts checked:
Verification summary:
Risk notes:
Next issue:
```

## ISSUE-000 Baseline and Protected Contract Audit

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Confirmed active branch tracks remote baseline branch.
- Confirmed remote origin.
- Confirmed remote baseline branch exists.
- Confirmed remote baseline branch resolves to baseline commit.
- Recorded that the only current working tree changes are consensus docs.

Files changed:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/ISSUES.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Preserved contracts checked:

- No functional source files changed.
- No upstream code migration started.
- Baseline branch/tag remains the comparison point.

Verification summary:

- Passed: `git status --short --branch`
- Passed: `git remote -v`
- Passed: `git branch -r --list "origin/baseline/void-source-20260702"`
- Passed: `git rev-parse --verify "origin/baseline/void-source-20260702"`

Risk notes:

- Rust package tests remain blocked until root workspace metadata is available.
- Consensus docs are untracked and should be committed before or with the first migration planning checkpoint.

Next issue:

- `ISSUE-003 Upstream Capability Inventory and Classification`

## ISSUE-003 Upstream Capability Inventory and Classification

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus inventory subagents

Scope completed:

- Inventory upstream candidates by domain.
- Record classification, affected Void module, protected contract, and verification.
- Do not implement functional changes.
- Recorded upstream shallow clone limitation and release/nightly reference mismatch.
- Recorded frontend/Flow Chat, core/runtime/tools/providers, desktop/Computer Use/WebDriver/terminal, build/docs/CI/release governance, and release-note capability families.
- Explicitly rejected BitFun identity, installer, env/global names, upstream crate layout, and whole Flow Chat/media/short-drama replacement candidates.

Files changed:

- `docs/ISSUES.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No functional source files changed.
- No upstream code migration started.
- Void brand/installer identity remains protected.
- Flow Chat, BTW/subagent, workspace media, short-drama, terminal, and Computer Use boundaries remain documentation-only contracts.

Verification summary:

- Passed by documentation review: every returned subagent candidate is represented in `docs/ISSUES.md`.
- Passed by documentation review: each candidate has a classification, affected module, protected contract, and verification path.
- Not run: functional tests, because ISSUE-003 is inventory-only and no source behavior changed.

Risk notes:

- Upstream local clone is shallow at `c2f6a3c`; missing history depth must be recorded.
- GitHub release `v0.2.11` and nightly `0.2.11-nightly.20260702+029e9e7d` were used only as release inventory references; they are not treated as local HEAD deltas.

Next issue:

- Recommended: `ISSUE-004 Prompt Cache, Multitask, and Goal Workflow Verification`, then `ISSUE-006 Brand, Installer, and Desktop Identity Audit`.

## ISSUE-004 Prompt Cache, Multitask, and Goal Workflow Verification

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus ISSUE-004 verification subagents

Scope completed:

- Verified by read-only inspection that prompt cache identity, TTL, restore prune/delete, clone/persistence, and cache read/write usage separation are largely present locally.
- Verified by read-only inspection that `/goal` has create, pause, resume, clear, edit, continuation, metadata persistence, and budget fields.
- Verified by read-only inspection that Multitask mode, scheduler, permission gate, recursive subagent blocking, and review readonly foundations are largely present locally.
- Split remaining gaps into `ISSUE-004A`, `ISSUE-004B`, `ISSUE-004C`, and `ISSUE-004D`.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No functional source files changed.
- `/goal`, prompt cache, Multitask, subagent, and review contracts remain in core/runtime boundaries.
- UI remains a state renderer; no UI business logic was added.

Verification summary:

- Blocked: Rust targeted tests cannot run because root `Cargo.toml` and `src/Cargo.toml` were missing while crate manifests inherit workspace metadata.
- Blocked: Web goal service tests did not reach Vitest because pnpm dependency validation first required non-interactive module purge handling, then stopped on ignored build scripts requiring build approval.
- Passed by read-only code inspection: subagents and main session located local implementations and tests for prompt cache, `/goal`, Multitask, delegation policy, and review readonly foundations.

Risk notes:

- `/goal` has `Blocked` and `Complete` status variants but no observed setter path.
- `/goal` budget appears to count total tokens rather than billable tokens excluding cache reads.
- Prompt cache scope-specific invalidation tests may need finer coverage for `SystemPrompt` and `UserContext`.
- Multitask lacks confirmed end-to-end coverage from prompt to scheduler decision to background result merge.

Next issue:

- `ISSUE-004A Prompt Cache Verification and Coverage`

## ISSUE-004A Prompt Cache Verification and Coverage

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Restored a root `Cargo.toml` matching the current Void crate layout so Rust workspace-inherited manifests can be verified.
- Kept workspace package identity Void-only: version `0.2.8`, authors `Void`, current members only, no upstream `BitFun` layout.
- Adjusted workspace dependency versions to current source compatibility for `reqwest`, `git2`, `axum`, and `tokio-tungstenite`.
- Added precise prompt cache scope invalidation tests for `SystemPrompt` and `UserContext`.
- Verified prompt cache identity, TTL, expiry eviction, all-scope invalidation, exact-scope invalidation, telemetry, and token usage contracts.

Files changed:

- `Cargo.toml`
- `Cargo.lock`
- `src/crates/core/src/agentic/session/prompt_cache.rs`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- `SystemPromptCacheIdentity` remains required for system prompt cache hits.
- `UserContextCacheIdentity` and user-context expiry eviction remain intact.
- `PromptCacheScope::SystemPrompt` and `PromptCacheScope::UserContext` now have explicit non-overlap tests.
- Cache read/write telemetry remains separated through provider usage and services-core token usage contracts.
- No runtime prompt cache behavior was changed; only test coverage and workspace verification metadata changed.

Verification summary:

- Passed: `cargo metadata --no-deps --format-version 1`
- Passed: `cargo test -p void-core --lib default_prompt_cache_policy_uses_one_day_persistence_ttl`
- Passed: `cargo test -p void-core --lib system_prompt_cache_requires_matching_identity`
- Passed: `cargo test -p void-core --lib expired_user_context_is_evicted_on_read`
- Passed: `cargo test -p void-core --lib invalidate_scope_can_clear_all_cached_prompt_parts`
- Passed: `cargo test -p void-core --lib invalidate_system_prompt_preserves_user_context`
- Passed: `cargo test -p void-core --lib invalidate_user_context_preserves_system_prompt`
- Passed: `cargo test -p void-core --lib prompt_cache_telemetry_reports_provider_partial_hit`
- Passed: `cargo test -p void-core --lib prompt_cache_telemetry_reports_unavailable_when_provider_omits_cache_fields`
- Passed: `cargo test -p void-services-core --test token_usage_contracts`

Risk notes:

- Root Rust workspace metadata is new in this branch and should be reviewed as build infrastructure restoration, not an upstream crate-layout migration.
- Broad workspace tests are not yet claimed; validation stayed targeted to `ISSUE-004A`.

Next issue:

- `ISSUE-004B Multitask Scheduler and Subagent Gate Verification`

## ISSUE-004B Multitask Scheduler and Subagent Gate Verification

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified runtime-port delegation policy prevents recursive spawn while preserving child depth.
- Verified Multitask plan serialization contract.
- Verified scheduler dry-run accepts independent non-conflicting branches.
- Verified scheduler rejects unfinished dependencies and write-scope conflicts.
- Verified scheduler falls back when forced execution is disabled by policy.
- Verified approved branch launching uses the launcher and records branch failures.
- Verified Task tool rejects nested subagent delegation.
- Verified subagent context mode preserves fork wire compatibility.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- `DelegationPolicy::top_level().spawn_child()` disables recursive spawn without losing depth metadata.
- Multitask plans keep scheduler-facing branch/dependency/write-scope fields serializable.
- Permission-gated forced execution remains disabled unless explicitly allowed.
- Nested subagent delegation remains blocked at the Task tool boundary.
- No Multitask, scheduler, Task tool, or runtime-port source behavior was changed.

Verification summary:

- Passed: `cargo test -p void-runtime-ports delegation_policy_child_blocks_recursive_spawn_without_losing_depth`
- Passed: `cargo test -p void-runtime-ports multitask_plan_serializes_scheduler_contract`
- Passed: `cargo test -p void-core --lib dry_run_accepts_independent_non_conflicting_branches`
- Passed: `cargo test -p void-core --lib dry_run_rejects_unfinished_dependencies_and_write_scope_conflicts`
- Passed: `cargo test -p void-core --lib decision_falls_back_when_forced_execution_is_disabled`
- Passed: `cargo test -p void-core --lib launch_approved_branches_uses_launcher_and_records_failures`
- Passed: `cargo test -p void-core --lib call_impl_rejects_nested_subagent_delegation`
- Passed: `cargo test -p void-runtime-ports subagent_context_mode_preserves_fork_wire_value`

Risk notes:

- No full desktop/web E2E was run for prompt-to-scheduler-to-background-result merge; current confidence is from targeted core/runtime contracts.
- Review-specific readonly contracts remain separate in `ISSUE-004D`.

Next issue:

- `ISSUE-004C Goal Workflow Status and Budget Semantics`

## ISSUE-004C Goal Workflow Status and Budget Semantics

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added explicit `Complete`, `Block`, and `SetTokenBudget` transitions to the current `GoalModeUpdateAction`.
- Kept existing Void `GoalModeState` instead of importing upstream `ThreadGoal` architecture.
- Persisted `GoalModeStatus::Complete` after goal verification succeeds.
- Persisted `GoalModeStatus::Blocked` when the auto-continuation limit is reached.
- Changed goal budget accounting from raw `total_tokens` to billable tokens: uncached input plus output.
- Exposed minimal desktop API actions for complete/block/set-budget/clear-budget.
- Extended front-end goal command parsing and service plumbing for complete/block/budget commands without changing Flow Chat page components.
- Adapted crash diagnostics to upstream-compatible `zip 4.6` `SimpleFileOptions`, fixing the desktop compile uncovered by 004C verification.

Files changed:

- `src/crates/core/src/agentic/goal_mode/mod.rs`
- `src/crates/core/src/agentic/coordination/coordinator.rs`
- `src/apps/desktop/src/api/agentic_api.rs`
- `src/apps/desktop/src/crash_diagnostics.rs`
- `src/web-ui/src/infrastructure/api/service-api/AgentAPI.ts`
- `src/web-ui/src/flow_chat/services/goalCommandParser.ts`
- `src/web-ui/src/flow_chat/services/goalCommandParser.test.ts`
- `src/web-ui/src/flow_chat/services/goalService.ts`
- `src/web-ui/src/flow_chat/services/goalService.test.ts`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- UI remains a command/service layer only; no Flow Chat page or history/session UI business logic was added.
- Goal state changes remain centralized in core `goal_mode`.
- Desktop API maps wire actions to core actions and returns explicit `status`, `active`, `tokenBudget`, and `tokensUsed`.
- Cached prompt reads no longer consume goal budget; subagent token usage remains ignored by default.
- Upstream `ThreadGoal` structure and BitFun identity were not imported.

Verification summary:

- Passed: `cargo test -p void-core --lib goal_mode` (30 tests).
- Passed: `cargo test -p void-desktop goal_mode_status_wire_uses_stable_kebab_case_for_usage_limited`.
- Passed: `cargo test -p void-desktop update_session_goal_response_serializes_goal_accounting_fields`.
- Passed: direct `node_modules/.bin/vitest run src/flow_chat/services/goalCommandParser.test.ts src/flow_chat/services/goalService.test.ts` from `src/web-ui`.
- Passed: direct `node_modules/.bin/tsc --noEmit` from `src/web-ui`.
- Passed: `git diff --check`.

Risk notes:

- `pnpm --dir src/web-ui run test:run ...` still fails before Vitest because pnpm requires build-script approval for `@parcel/watcher` and `esbuild`; direct Vitest and direct TypeScript checks passed using existing `node_modules`.
- `cargo fmt --check` reports many pre-existing formatting differences outside the active issue; it is not a clean whole-repo gate yet.

Next issue:

- `ISSUE-004D Review Readonly and Recursive Subagent Contract Tests`

## ISSUE-004D Review Readonly and Recursive Subagent Contract Tests

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified review specialists are readonly and use isolated instruction context.
- Verified built-in DeepReview reviewers are registered as review agents.
- Verified DeepReview policy rejects nested DeepReview task launches.
- Verified DeepReview policy always rejects ReviewFixer as a reviewer launch target.
- Verified CodeReview, DeepReview, and ReviewFixer agent tool boundaries.
- Verified Task tool rejects nested subagent delegation.
- Verified runtime delegation policy blocks recursive subagent spawn without losing depth metadata.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Review specialists remain readonly review subagents.
- DeepReview orchestration can launch configured review team members but rejects nested DeepReview and ReviewFixer misuse.
- ReviewFixer remains a separate remediation agent with edit/verify tools, not a readonly reviewer.
- Child subagents cannot spawn further subagents through Task.
- No review agent, Task tool, or delegation policy source behavior was changed.

Verification summary:

- Passed: `cargo test -p void-core --lib specialist_reviewers_use_isolated_instruction_context`
- Passed: `cargo test -p void-core --lib built_in_deep_review_reviewers_are_marked_as_review_agents`
- Passed: `cargo test -p void-core --lib classify_rejects_deep_review_nested_task`
- Passed: `cargo test -p void-core --lib classify_always_rejects_review_fixer`
- Passed: `cargo test -p void-core --lib code_review_agent_has_review_and_user_approved_remediation_tools`
- Passed: `cargo test -p void-core --lib deep_review_agent_has_team_orchestration_tools`
- Passed: `cargo test -p void-core --lib review_fixer_agent_has_edit_and_verify_tools`
- Passed: `cargo test -p void-core --lib call_impl_rejects_nested_subagent_delegation`
- Passed: `cargo test -p void-runtime-ports delegation_policy_child_blocks_recursive_spawn_without_losing_depth`

Risk notes:

- No full DeepReview UI flow was run; current confidence is from targeted core/runtime contracts.
- Flow Chat/BTW/subagent projection protection remains separate in `ISSUE-005`.

Next issue:

- `ISSUE-005 Flow Chat, BTW, and Subagent Protected Contract Tests`

## ISSUE-005 Flow Chat, BTW, and Subagent Protected Contract Tests

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified history placeholder/state contract coverage.
- Verified BTW/session metadata preserves `btwOrigin`, `parentSessionId`, and subagent fields.
- Verified subagent projection fields and parent-tool linkage.
- Verified BTW thread/opening contracts and transient child sends.
- Verified dialog turn stability and model-round item grouping.
- Verified BTW panel child sends and DeepReview action bar state.
- Verified Flow Chat store sync, session module, persistence module, and event handler module tests.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- `SessionHistoryState`/history placeholders remain explicit.
- `btwOrigin`, `parentSessionId`, `parentToolCallId`, and `subagentType` round-trip through session metadata/projection.
- Child BTW/subagent sends target the child session without switching the active parent session.
- Model-round grouping/order stability remains covered.
- No Flow Chat source behavior was changed.

Verification summary:

- Passed: direct Vitest for `ModernFlowChatContainer.history-state`, `sessionMetadata`, `subagentProjection`, `BtwThreadService`, `openBtwSession`, `dialogTurnStability`, and `modelRoundItemGrouping` (7 files, 41 tests).
- Passed: direct Vitest for `BtwSessionPanel.review-action`, `DeepReviewActionBar`, `storeSync`, `FlowChatStore`, `SessionModule`, `PersistenceModule`, and `EventHandlerModule` (7 files, 107 tests).

Risk notes:

- `pnpm --dir src/web-ui run test:run ...` remains blocked by pnpm build-script approval policy; direct Vitest was used.
- No browser E2E was run for visual panel layout.

Next issue:

- `ISSUE-006 Brand, Installer, and Desktop Identity Audit`

## ISSUE-006 Brand, Installer, and Desktop Identity Audit

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified scoped source/config paths do not contain `BitFun`, `bitfun`, `BITFUN`, `__BITFUN`, or `GCWing` identity residue.
- Verified desktop Tauri config preserves `Void` product identity and `com.void.desktop` bundle identifier.
- Verified installer Tauri/package config preserves `void Installer`, `com.void.installer`, and `void-installer` package identity.
- Verified installer scripts reference Void executable/artifact names such as `void-desktop.exe`, `void_installer.pdb`, and `void-installer.exe`.
- Confirmed the only broad `bitfun` match was the intentional `tmp/upstream-bitfun` workspace exclude in root `Cargo.toml`.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Void product and installer identity remain protected before desktop/packaging upstream migration.
- No BitFun identity, upstream updater identity, or GCWing ownership string was introduced into scoped source/config files.
- No desktop or installer runtime source behavior was changed.

Verification summary:

- Passed: scoped identity residue search across `src`, `Void-Installer`, `resources`, `scripts`, `.github`, and `brand`.
- Passed: manual config inspection for desktop Tauri identity, installer Tauri identity, installer package metadata, desktop crate metadata, and installer artifact names.

Risk notes:

- This was a static audit only; installer packaging and updater runtime smoke tests remain deferred until a packaging-specific issue.
- Upstream desktop/installer patches still require Void-specific rewrite, not direct copy.

Next issue:

- ``ISSUE-001 ACP `omp` Preset Verification``

## ISSUE-001 ACP `omp` Preset Verification

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified `omp` is registered as a built-in ACP client preset.
- Verified `omp` launches through native `omp acp`.
- Verified `omp` remains user-managed with no install package, adapter package, or adapter binary.
- Verified default config for built-in ACP clients still works.
- Confirmed no upstream ACP directory structure or BitFun identity was introduced.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- ACP client behavior remains owned by `src/crates/acp`.
- `AcpClientConfig` remains the stable config model.
- UI, desktop, installer, core, and runtime-port modules were not changed.

Verification summary:

- Passed: `cargo test -p void-acp -- --list` found `omp_is_a_native_user_managed_preset` and related ACP tests.
- Passed: `cargo test -p void-acp omp_is_a_native_user_managed_preset`.
- Passed: `cargo test -p void-acp returns_default_config_for_builtin_client`.
- Passed: `cargo check -p void-acp`.

Risk notes:

- No manual ACP UI launch was performed; this issue is covered by ACP crate-level configuration and compile checks.
- Remote ACP probing was not changed and remains protected by existing ACP module boundaries.

Next issue:

- `ISSUE-002 CLI Slash Substring Matching Verification`

## ISSUE-002 CLI Slash Substring Matching Verification

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified CLI command tests include empty query, exact command, and case-insensitive substring matching.
- Verified `/USA` matches `/usage`.
- Verified empty query and `/` do not return command matches.
- Verified CLI crate compiles with restored root workspace metadata.
- Confirmed no CLI source changes were required.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Slash command matching remains case-insensitive.
- Matching behavior remains isolated to `src/apps/cli/src/commands.rs`.
- CLI UI/TUI rendering, sessions, agent logic, desktop, Flow Chat, and installer modules were not changed.

Verification summary:

- Passed: `cargo test -p void-cli -- --list`.
- Passed: `cargo test -p void-cli substring_command_matches_case_insensitively`.
- Passed: `cargo test -p void-cli exact_command_matches`.
- Passed: `cargo test -p void-cli empty_query_returns_empty`.
- Passed: `cargo check -p void-cli`.

Risk notes:

- Manual interactive CLI slash-menu verification was not run; crate-level matching behavior is covered.
- Startup and chat UI consumers were not changed and remain outside this issue.

Next issue:

- `ISSUE-010A Chat Input Escape Handling`

## ISSUE-010A Chat Input Escape Handling

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified `RichTextInput` keeps Escape and Enter owned by IME composition and does not forward them to parent `onKeyDown`.
- Verified `FileMentionPicker` captures Escape, prevents default, stops propagation, and closes the picker.
- Verified `ChatInput` sets `chatPopupActive` while slash or mention popup is open and cleans it up on unmount/state change.
- Verified `ModernFlowChatContainer` disables global Escape task cancel while `chatPopupActive` is true.
- Compared upstream Escape/IME/popup-active logic and confirmed current Void implementation already contains the relevant behavior.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- IME Escape remains IME-owned.
- Slash and mention popup Escape handling does not cancel running tasks.
- Mention popup close does not mutate session/history/sidebar/header state.
- FlowChatStore, Rust core, desktop, installer, and brand files were not changed.

Verification summary:

- Passed: direct Vitest for `src/flow_chat/components/RichTextInput.test.tsx` (3 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.
- Passed: static upstream comparison for Escape/composition handling in `RichTextInput.tsx`, `FileMentionPicker.tsx`, and `ChatInput.tsx`.

Risk notes:

- No browser E2E was run for visual popup state; confidence comes from component tests, TypeScript, and code-path inspection.
- Broader mention insertion spacing is intentionally left to `ISSUE-010B`.

Next issue:

- `ISSUE-010B Chat Input Mention Spacing`

## ISSUE-010B Chat Input Mention Spacing

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared local and upstream `openMention()` spacing behavior; local implementation already inserts `@` after whitespace and ` @` after non-whitespace.
- Compared local and upstream `insertTagReplacingMention()` behavior; local implementation already replaces only the mention token, preserves preceding text, inserts one tag, and leaves one trailing space.
- Added RichTextInput tests for `openMention()` leading-space behavior and mention replacement spacing.
- Kept product source unchanged because existing implementation matched upstream's spacing behavior.

Files changed:

- `src/web-ui/src/flow_chat/components/RichTextInput.test.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Context tag rendering remains unchanged.
- File mention insertion remains routed through `RichTextInput` public methods.
- `ChatInput.tsx`, FlowChatStore, context/media services, session/history/sidebar/header, desktop, and installer files were not changed.

Verification summary:

- Passed: direct Vitest for `src/flow_chat/components/RichTextInput.test.tsx` (5 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- Tests cover DOM/text contracts but not a browser visual picker flow.
- Popup viewport bounds are intentionally left to `ISSUE-010C`.

Next issue:

- `ISSUE-010C Chat Input Popup Boundaries`

## ISSUE-010C Chat Input Popup Boundaries

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added viewport-based width and height constraints to the file mention picker.
- Allowed mention picker footer hints to wrap on narrow viewports.
- Added viewport-based width and height constraints to the slash command picker.
- Added slash command name/label truncation so long command text does not resize or overflow the popup.
- Kept popup state and behavior unchanged; this issue only changed styles.

Files changed:

- `src/web-ui/src/flow_chat/components/FileMentionPicker.scss`
- `src/web-ui/src/flow_chat/components/ChatInput.scss`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Mention state remains owned by RichTextInput/FileMentionPicker.
- Slash popup behavior and item selection logic remain unchanged.
- Flow Chat store/session files, workspace media, and short-drama files were not changed.

Verification summary:

- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.
- Passed: direct Vitest for `src/flow_chat/components/RichTextInput.test.tsx` (5 tests).
- Passed: direct Sass compilation for `src/flow_chat/components/FileMentionPicker.scss`.
- Passed: direct Sass compilation for `src/flow_chat/components/ChatInput.scss`.

Risk notes:

- No Playwright/browser screenshot was run; visual verification remains recommended before release.
- CSS constraints protect narrow viewport overflow but do not dynamically flip the popup to the right/left based on caret position.

Next issue:

- `ISSUE-011 Chat Input Image Paste Undo Slice`

## ISSUE-011 Chat Input Image Paste Undo Slice

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified current image paste flow already creates clipboard image contexts and pushes pasted image ids onto an undo stack.
- Added a pure `popLastExistingImageUndoId` helper to make stale undo-entry behavior testable.
- Wired ChatInput Ctrl/Cmd+Z image undo through the helper and a latest `contextsRef`, matching the upstream stale-context guard while preserving local workspace-path handling.
- Preserved `imageContextForBackend` behavior and workspace media input copy/write semantics.

Files changed:

- `src/web-ui/src/flow_chat/components/ChatInput.tsx`
- `src/web-ui/src/flow_chat/utils/chatInputImageUndo.ts`
- `src/web-ui/src/flow_chat/utils/chatInputImageUndo.test.ts`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Clipboard images still use `createImageContextFromClipboard(file, { workspacePath })`.
- Backend image context DTOs still preserve data URLs and local/URL image paths.
- Media backend service, image context backend flow, workspace media, and short-drama services were not changed.

Verification summary:

- Passed: direct Vitest for `chatInputImageUndo`, `imageUtils`, `imageContextForBackend`, and `chatInputImageStrip` (4 files, 11 tests).
- Passed: direct Vitest for `src/flow_chat/components/RichTextInput.test.tsx` (5 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- No manual browser paste/undo smoke was run.
- Full ChatInput component integration was not mounted because existing test coverage is utility-focused; the change is isolated to the keydown undo branch.

Next issue:

- `ISSUE-020A Startup Trace API Timing Observability`

## ISSUE-020A Startup Trace API Timing Observability

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared current Void startup trace with upstream API timing observability fields.
- Added bounded API boundary timing fields to the existing Void startup trace call model.
- Added request/response payload estimate duration fields and derived total payload estimate duration when only split timings are provided.
- Added adapter init, transport, invoke, active request start/end, and max concurrent request fields to recorded API call snapshots.
- Added `getSnapshot()` as a compatibility alias while preserving existing `snapshot()` diagnostics.
- Preserved existing `__VOID_STARTUP_TRACE__` diagnostic surface and current logging behavior.

Files changed:

- `src/web-ui/src/shared/utils/startupTrace.ts`
- `src/web-ui/src/shared/utils/startupTrace.test.ts`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- No `__BITFUN_*`, `BITFUN_*`, or BitFun trace names were introduced.
- Startup order, desktop startup code, Flow Chat, media, short-drama, ACP, CLI, and installer files were not changed.
- Trace records still expose sanitized metrics only and no raw payloads.

Verification summary:

- Passed: direct Vitest for `src/shared/utils/startupTrace.test.ts` (1 file, 12 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- No browser startup performance smoke was run.
- Render profiling from upstream remains separate and is not migrated in this issue.

Next issue:

- `ISSUE-020C Startup Trace Render Observability`

## ISSUE-020C Startup Trace Render Observability

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added `ReactRenderProfileTrace` as a sanitized render-profile input model.
- Added `isStartupRenderTraceEnabled()` gated by `__VOID_RENDER_PROFILE_ENABLED__`.
- Added `recordReactRenderProfile()` to record `react_render_profile` phase metrics only when explicitly enabled.
- Kept render profiling default-off.
- Split component instrumentation into `ISSUE-020D` instead of touching Markdown or model-round render components in the same issue.

Files changed:

- `src/web-ui/src/shared/utils/startupTrace.ts`
- `src/web-ui/src/shared/utils/startupTrace.test.ts`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- No `__BITFUN_*`, `BITFUN_*`, or BitFun trace names were introduced.
- No Markdown, ModelRoundItem, Flow Chat store, media, short-drama, desktop, or installer files were changed.
- Render profile records are sanitized through `markPhase()` and do not retain raw payload fields.

Verification summary:

- Passed: direct Vitest for `src/shared/utils/startupTrace.test.ts` (1 file, 13 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- The render profile primitive is not yet wired into components, so it only enables safe future instrumentation.
- Browser startup/render smoke remains for `ISSUE-020D` if component hooks are added.

Next issue:

- `ISSUE-020D Startup Trace Render Component Instrumentation`

## ISSUE-020D Startup Trace Render Component Instrumentation

Status: Deferred
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared upstream Markdown/code/model-round render instrumentation with current Void components.
- Confirmed current Void Markdown includes local KaTeX, right-panel preview links, local image handling, and context-menu differences.
- Confirmed current Void ModelRoundItem includes local media tool grouping and subagent projection rendering paths that diverge from upstream.
- Deferred component instrumentation until a browser startup/render smoke gate is available.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- No Markdown, AsyncPrismSyntaxHighlighter, FlowTextBlock, ModelRoundItem, Flow Chat store, media, short-drama, desktop, or installer source files were changed.
- The default-off render profile primitive from `ISSUE-020C` remains available for future instrumentation.

Verification summary:

- Passed by read-only comparison and scope review.
- Not run: component tests or browser smoke, because no component source was changed.

Risk notes:

- Component instrumentation can still be useful, but should be implemented with browser screenshots/perf smoke because it touches render hot paths.

Next issue:

- `ISSUE-030A Workspace Media State Model Tests`

## ISSUE-030A Workspace Media State Model Tests

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Located workspace media service, gallery, entry, and tile view-model tests.
- Verified existing service tests cover availability, ready/empty/error library states, generated manifests, pending jobs, and pending-to-ready generated identity slots.
- Verified existing Gallery tests cover explicit empty/error states, path mismatch state, pending signals before mount, refresh-driven pending jobs, and retry after media refresh events.
- Updated two stale Gallery test selectors to match the current stable pending-slot id model.
- Kept production workspace media service and UI behavior unchanged.

Files changed:

- `src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Workspace media state remains explicit: `idle`, `scanning`, `ready`, `empty`, `unsupported`, and `error`.
- Path mismatch remains represented by a dedicated UI state, not by empty data.
- Pending event signals and manifest pending jobs preserve stable slot behavior.
- AI media, short-drama, Flow Chat store/session, desktop, installer, ACP, CLI, and provider adapter files were not changed.

Verification summary:

- Initial targeted media Vitest run failed in two Gallery tests because selectors expected older pending ids.
- Root cause: current pending signal ids intentionally include workspace/tool/batch/kind/slot data; after retry scan, manifest-provided pending ids are used.
- Passed after test correction: direct Vitest for workspace media library, entry, gallery, and tile view-model tests (4 files, 53 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- No browser visual media-gallery smoke was run.
- Safety/failure paths for trash operations remain tracked by `ISSUE-030B`.

Next issue:

- `ISSUE-030B Workspace Media Safety and Failure Tests`

## ISSUE-030B Workspace Media Safety and Failure Tests

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified existing tests already cover unsafe delete selections, restore conflict handling, selected purge, and expired purge.
- Added trash metadata write failure coverage for delete operations.
- Added unsafe restore id and unsafe purge id tests.
- Fixed a real safety gap by rejecting unsafe trash id path segments before restore or purge reaches the filesystem adapter.

Files changed:

- `src/web-ui/src/shared/services/workspace-media/WorkspaceMediaLibrary.ts`
- `src/web-ui/src/shared/services/workspace-media/WorkspaceMediaLibrary.test.ts`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- Successful delete, restore, purge, purge-expired, and list-trash behavior remains unchanged.
- Unsafe restore/purge ids now return explicit `unsafe_path` errors.
- AI media generation, short-drama, Flow Chat store/session, desktop, installer, ACP, CLI, and provider adapter files were not changed.

Verification summary:

- Initial new unsafe restore/purge tests failed, confirming the safety gap.
- Passed after fix: direct Vitest for `WorkspaceMediaLibrary.test.ts` (1 file, 21 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.
- Passed: direct Vitest for workspace media library, entry, gallery, and tile view-model tests (4 files, 56 tests).

Risk notes:

- No browser visual media-gallery smoke was run.
- The fix validates trash id path segments but does not add transactional rollback if metadata write fails after a file rename; current behavior now has explicit error coverage, and rollback can be considered as a separate issue if needed.

Next issue:

- `ISSUE-040A Short Drama Project Fact Protection Tests`

## ISSUE-040A Short Drama Project Fact Protection Tests

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Located short-drama project fact, workspace binding, workspace mode, view model, change event, and target resolver tests.
- Verified existing project initialization and legacy migration are protected unless overwrite is explicit.
- Verified manifest, script, artifact, revision, and attempt sidecars remain source-of-truth over stale manifest inline data.
- Verified derived index caches are rebuildable and not treated as source-of-truth.
- Verified workspace mismatch is explicit and normalized by `ShortDramaWorkspaceBinding`.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No short-drama production service source was changed.
- Existing project facts, sidecar precedence, workspace mismatch, project view model, and target resolution remain covered.
- Media generation, Flow Chat store/session, desktop, installer, ACP, CLI, and provider adapter files were not changed.

Verification summary:

- Passed: direct Vitest for `ShortDramaStaticProject`, `ShortDramaWorkspaceBinding`, `ShortDramaWorkspaceMode`, `ShortDramaProjectViewModel`, `ShortDramaProjectChangedEvent`, and `ShortDramaTargetResolver` (6 files, 64 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- No browser short-drama panel smoke was run.
- Stage-agent policy and artifact media recovery are tracked separately in `ISSUE-040B`.

Next issue:

- `ISSUE-040B Short Drama Agent Policy and Media Recovery Tests`

## ISSUE-040B Short Drama Agent Policy and Media Recovery Tests

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Verified stage-agent permission and write boundaries through tool policy tests.
- Verified stage mismatch behavior, actor write scopes, and cross-stage change request behavior.
- Verified artifact revision, optimization, attempts, change requests, MainAI tools, and stage workspace workflow coverage.
- No short-drama source changes were needed.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Stage agents cannot write outside authorized stage/policy boundaries.
- Artifact attempts, revisions, optimization metadata, and change requests remain covered.
- Media recovery-related workflow contracts remain covered by existing service tests.
- Media generation, Flow Chat store/session, desktop, installer, ACP, CLI, and provider adapter files were not changed.

Verification summary:

- Passed: direct Vitest for `ShortDramaToolPolicy`, `ShortDramaArtifactRevisionWorkflow`, `ShortDramaArtifactOptimizationWorkflow`, `ShortDramaArtifactWorkflow`, `ShortDramaChangeRequest`, `ShortDramaMainAITools`, and `ShortDramaStageWorkspace` (7 files, 110 tests).
- Passed: direct TypeScript check from `src/web-ui` with `node_modules\\.bin\\tsc.cmd --noEmit`.

Risk notes:

- No browser short-drama panel smoke was run.
- Provider adapter parsing/retry migration remains separate in `ISSUE-050`.

Next issue:

- `ISSUE-050 Provider Adapter Parsing and Retry Inventory`

## ISSUE-050 Provider Adapter Parsing and Retry Inventory

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared current `src/crates/ai-adapters` with upstream `tmp/upstream-bitfun/src/crates/adapters/ai-adapters`.
- Confirmed upstream adds new tests, fixtures, stream harnesses, model selector, trace helpers, CLI credential helpers, SSE retry changes, and stream parser changes.
- Confirmed current Void tree has no equivalent `ai-adapters/tests` fixture suite yet.
- Split accepted follow-up work into `ISSUE-050A` through `ISSUE-050E`.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- No provider adapter runtime source changed during inventory.
- No upstream crate layout was copied.
- Provider changes remain split by adapter/test boundary.

Verification summary:

- Passed by diff/inventory review: upstream fixture/test inventory and changed adapter paths were classified into follow-up issues.
- Not run: provider tests, because this issue is inventory-only and no provider source changed.

Risk notes:

- Upstream adapter fixture tests reference upstream crate names and event types, so they require Void-compatible harness adaptation before parser fixes.
- Directly copying upstream `tool_call_accumulator.rs` is rejected because upstream now re-exports from a different crate layout.

Next issue:

- `ISSUE-050A AI Adapter Fixture Harness Baseline`

## ISSUE-050A AI Adapter Fixture Harness Baseline

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added a Void-compatible `ai-adapters` integration fixture harness.
- Added a minimal local SSE fixture server using `tokio::net::TcpListener`, avoiding new test dependencies.
- Added fixture loading helpers and two OpenAI replay fixtures adapted from upstream.
- Verified fixture replay through the public `void_ai_adapters::stream::handle_openai_stream` API.

Files changed:

- `src/crates/ai-adapters/tests/common/mod.rs`
- `src/crates/ai-adapters/tests/common/fixture_loader.rs`
- `src/crates/ai-adapters/tests/common/sse_fixture_server.rs`
- `src/crates/ai-adapters/tests/stream_test_harness.rs`
- `src/crates/ai-adapters/tests/fixtures/stream/openai/tool_args_split_with_usage.sse`
- `src/crates/ai-adapters/tests/fixtures/stream/openai/inline_think_text.sse`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/ARCHITECTURE.md`

Preserved contracts checked:

- Provider runtime source was not changed.
- Upstream crate layout, `bitfun_*` symbols, and upstream event crate contracts were not copied.
- The harness uses the current Void public adapter stream interface as the boundary.
- Flow Chat, media, short-drama, desktop, installer, ACP, and CLI files were not touched.

Verification summary:

- Passed: `cargo test -p void-ai-adapters --test stream_test_harness` (2 tests).

Risk notes:

- The harness currently covers OpenAI stream replay only; Anthropic, Gemini, Responses, and retry timing remain separate follow-up slices.
- It does not yet assert agent-stream processor behavior because the current Void crate boundary differs from upstream.

Next issue:

- `ISSUE-050B SSE Retry and Retry-After Semantics`

## ISSUE-050B SSE Retry and Retry-After Semantics

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared current SSE retry behavior with upstream.
- Confirmed Void already retries 408/409/425/429/5xx and preserves non-retryable auth/client errors.
- Increased `Retry-After` cap from 10s to 60s to respect provider TPM/capacity windows.
- Added test coverage preserving a sub-cap 45s `Retry-After` value.
- Added transport error source-chain formatting for better retry diagnostics.
- Split TTFT first-effective-output semantics into `ISSUE-050F` because it changes stream-handler contracts across providers.

Files changed:

- `src/crates/ai-adapters/src/client/sse.rs`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Provider message converters and parser behavior were not changed.
- Auth and non-retryable client errors remain non-retryable.
- Flow Chat, media, short-drama, desktop, installer, ACP, and CLI files were not touched.

Verification summary:

- Passed: `cargo test -p void-ai-adapters client::sse::tests` (5 tests).
- Passed: `cargo test -p void-ai-adapters --test stream_test_harness` (2 tests).

Risk notes:

- TTFT still measures response-header arrival in current Void; `ISSUE-050F` tracks the upstream contract change to first effective stream output.

Next issue:

- `ISSUE-050C OpenAI and Responses Tool Argument Stream Parsing`

## ISSUE-050C OpenAI and Responses Tool Argument Stream Parsing

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared current OpenAI/Responses parser files with upstream and separated TTFT-only differences into `ISSUE-050F`.
- Confirmed Void's local `tool_call_accumulator` is richer than upstream's re-export and must be preserved.
- Added fixture replay coverage for OpenAI missing tool `type` field.
- Added fixture replay coverage for OpenAI id-only tool-call prelude followed by payload chunk.
- Added fixture replay coverage for malformed Responses function-call arguments remaining invalid.
- Kept parser runtime source unchanged because targeted fixtures passed.

Files changed:

- `src/crates/ai-adapters/tests/stream_test_harness.rs`
- `src/crates/ai-adapters/tests/fixtures/stream/openai/tool_call_missing_type_field.sse`
- `src/crates/ai-adapters/tests/fixtures/stream/openai/tool_id_prelude_then_payload_without_id.sse`
- `src/crates/ai-adapters/tests/fixtures/stream/responses/malformed_function_call_arguments.sse`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- OpenAI/Responses runtime parser source was not changed.
- `tool_call_accumulator.rs` was not replaced with upstream's external re-export.
- Anthropic/Gemini, SSE retry/TTFT, core tool execution, UI, Flow Chat, media, short-drama, desktop, installer, ACP, and CLI files were not touched.

Verification summary:

- Passed: `cargo test -p void-ai-adapters --test stream_test_harness` (5 tests).
- Passed before adding fixtures: OpenAI type unit tests, Responses handler unit tests, and tool-call accumulator unit tests.

Risk notes:

- Fixture harness validates adapter/accumulator behavior, not upstream `bitfun_agent_stream` event emission.
- Anthropic/Gemini parser regressions remain separate in `ISSUE-050D`.

Next issue:

- `ISSUE-050D Anthropic and Gemini Stream Parsing Regressions`

## ISSUE-050D Anthropic and Gemini Stream Parsing Regressions

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Compared current Anthropic/Gemini stream handlers and types with upstream.
- Confirmed upstream handler diffs are primarily TTFT controller changes, already split into `ISSUE-050F`.
- Added fixture replay coverage for Anthropic extended thinking with signature and text.
- Added fixture replay coverage for Anthropic interleaved parallel tool use.
- Added fixture replay coverage for Anthropic malformed tool arguments remaining invalid.
- Added fixture replay coverage for Gemini string function-call args preserving JSON string semantics.
- Kept Anthropic/Gemini runtime parser source unchanged because targeted fixtures passed.

Files changed:

- `src/crates/ai-adapters/tests/stream_test_harness.rs`
- `src/crates/ai-adapters/tests/fixtures/stream/anthropic/extended_thinking.sse`
- `src/crates/ai-adapters/tests/fixtures/stream/anthropic/interleaved_parallel_tool_use.sse`
- `src/crates/ai-adapters/tests/fixtures/stream/anthropic/malformed_tool_arguments_extra_brace.sse`
- `src/crates/ai-adapters/tests/fixtures/stream/gemini/function_call_string_args.sse`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Anthropic/Gemini runtime parser source was not changed.
- OpenAI/Responses, SSE retry/TTFT, core tool execution, UI, Flow Chat, media, short-drama, desktop, installer, ACP, and CLI files were not touched.

Verification summary:

- Passed: `cargo test -p void-ai-adapters --test stream_test_harness` (9 tests).
- Passed: `cargo test -p void-ai-adapters stream::types::anthropic::tests` (4 tests).
- Passed: `cargo test -p void-ai-adapters stream::types::gemini::tests` (8 tests).

Risk notes:

- TTFT first-effective-output behavior remains separate in `ISSUE-050F`.
- Harness validates adapter/accumulator behavior, not upstream `bitfun_agent_stream` event emission.

Next issue:

- `ISSUE-050E Model Selector and CLI Credential Inventory`

## ISSUE-050E Model Selector and CLI Credential Inventory

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Inventoried upstream `ai-adapters` model selector helper and tests.
- Confirmed current Void CLI UI model selector file matches upstream at the compared path.
- Confirmed current Void desktop commands expose `discover_cli_credentials` and `refresh_cli_credential`.
- Confirmed current Void core has `infrastructure/cli_credentials` resolver modules.
- Accepted a focused follow-up `ISSUE-050E1` for the missing standalone `ai-adapters` model selector helper.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No CLI UI code changed.
- No auth storage or provider defaults changed.
- No installer branding or BitFun identity introduced.

Verification summary:

- Passed by read-only inventory: upstream model selector helper and tests identified.
- Passed by read-only inventory: current CLI credential discovery/refresh paths exist in Void.

Risk notes:

- Upstream crate layout differs; any implementation must use `void_ai_adapters` names and current crate exports.

Next issue:

- `ISSUE-050E1 AI Adapter Model Selector Helper`

## ISSUE-050E1 AI Adapter Model Selector Helper

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added standalone `model_selector` helper module to `void-ai-adapters`.
- Exported helper functions and types from `void_ai_adapters`.
- Ported upstream model selector tests with Void crate names.

Files changed:

- `src/crates/ai-adapters/src/model_selector.rs`
- `src/crates/ai-adapters/src/lib.rs`
- `src/crates/ai-adapters/tests/model_selector.rs`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No CLI UI model selector code changed.
- No auth storage, CLI credential resolver, provider defaults, or installer branding changed.
- Existing stream fixture harness still passes.

Verification summary:

- Passed: `cargo test -p void-ai-adapters --test model_selector` (4 tests).
- Passed: `cargo test -p void-ai-adapters --test stream_test_harness` (9 tests).

Risk notes:

- The helper is not wired into higher-level config flows in this issue; future usage must be separately gated.

Next issue:

- `ISSUE-050F Stream TTFT First Effective Output Semantics`

## ISSUE-050F Stream TTFT First Effective Output Semantics

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added `StreamTimeoutController` and `StreamTimeoutStage` to shared stream handler internals.
- TTFT now remains active until the first effective output: non-empty text, non-empty reasoning, or meaningful tool-call data.
- Added remaining TTFT calculation in SSE transport after response headers arrive.
- Passed remaining TTFT into OpenAI, Responses, Anthropic, and Gemini stream handlers.
- Updated provider stream call sites to pass the new timeout argument.
- Added delayed-body OpenAI fixture coverage proving HTTP 200 alone does not satisfy TTFT.

Files changed:

- `src/crates/ai-adapters/src/client/sse.rs`
- `src/crates/ai-adapters/src/stream/stream_handler/mod.rs`
- `src/crates/ai-adapters/src/stream/stream_handler/openai.rs`
- `src/crates/ai-adapters/src/stream/stream_handler/responses.rs`
- `src/crates/ai-adapters/src/stream/stream_handler/anthropic.rs`
- `src/crates/ai-adapters/src/stream/stream_handler/gemini.rs`
- `src/crates/ai-adapters/src/providers/openai/chat.rs`
- `src/crates/ai-adapters/src/providers/openai/responses.rs`
- `src/crates/ai-adapters/src/providers/openai/codex_chatgpt.rs`
- `src/crates/ai-adapters/src/providers/anthropic/request.rs`
- `src/crates/ai-adapters/src/providers/gemini/request.rs`
- `src/crates/ai-adapters/src/providers/gemini/code_assist.rs`
- `src/crates/ai-adapters/tests/stream_test_harness.rs`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Provider parser content semantics were not changed.
- Tool execution/core runtime, UI, CLI, Flow Chat, media, short-drama, desktop, installer, and brand identity files were not touched.
- Existing adapter fixture coverage still passes.

Verification summary:

- Passed: `cargo test -p void-ai-adapters --test stream_test_harness` (10 tests).
- Passed: `cargo test -p void-ai-adapters stream::stream_handler::tests` (2 tests).
- Passed: `cargo test -p void-ai-adapters client::sse::tests` (6 tests).
- Passed: `cargo test -p void-ai-adapters stream::stream_handler::responses::tests` (6 tests).
- Passed: `cargo test -p void-ai-adapters` (168 unit tests, 4 model selector tests, 10 stream harness tests, doc-tests).
- Passed: `git diff --check` with LF/CRLF warnings only.

Risk notes:

- Upstream also wraps handler tasks with cancellation tokens; that is not required for first-effective-output TTFT and was not copied to avoid adding a new dependency/contract.

Next issue:

- `ISSUE-060 i18n, Theme, Repo Hygiene, and Brand-Safe Audit Inventory`

## ISSUE-060 i18n, Theme, Repo Hygiene, and Brand-Safe Audit Inventory

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus i18n/theme/repo-hygiene explorer subagents

Scope completed:

- Completed read-only inventory of upstream i18n, theme, repo hygiene, root scripts, mobile-web, installer locale, CLI theme, and visual governance changes.
- Confirmed current Void already has i18n contract generation, i18n contract tests, i18n audit, installer locales, mobile-web package, repo hygiene scripts, Void CLI theme presets, and brand audit scripts.
- Confirmed current root `package.json` is missing while CI/root docs reference `pnpm run i18n:*`, `check:*`, web, mobile-web, and build commands.
- Confirmed upstream adds root package orchestration, i18n governance report/baselines/allowlists, theme color/visual audit scripts, startup theme bootstrap generation, CLI package workflow, and E2E performance runners.
- Split accepted follow-up work into `ISSUE-060A` through `ISSUE-060I`.
- Rejected direct copy of BitFun package names, env vars, globals, installer paths, theme ids, release targets, and visual identity.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- No functional source files changed during inventory.
- No BitFun identity, `BITFUN_*`, `__BITFUN_*`, `BitFun-Installer`, `bitfun-*` theme ids, upstream updater/release targets, or installer identity were introduced.
- Current Void-only i18n namespaces, mobile-web package identity, CLI `void-*` presets, `Void-Installer`, and `src/crates/core` path contract remain protected.

Verification summary:

- Passed by scoped read-only inventory: current and upstream scripts were compared without scanning `node_modules` or `target`.
- Passed by explorer review: i18n, theme, and repo hygiene findings were independently classified.
- Not run: functional tests, because `ISSUE-060` is inventory-only and no runtime behavior changed.

Risk notes:

- Root workspace restoration is now the highest-priority build/governance gap because current CI references root `pnpm run` commands.
- Theme and i18n governance should start in observation/baseline mode; copying upstream baselines would encode BitFun-specific assumptions into Void.
- Manual CLI packaging workflow remains deferred until external release/tap targets are confirmed.

Next issue:

- `ISSUE-060A Root Node Workspace and Void Script Entry Points`

## ISSUE-060A Root Node Workspace and Void Script Entry Points

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added a Void-branded root Node package entry with root scripts that delegate to existing Void modules and scripts.
- Added `pnpm-workspace.yaml` for `src/web-ui`, `src/mobile-web`, `Void-Installer`, and `tests/e2e`.
- Added `.npmrc` matching upstream workspace install behavior without BitFun paths.
- Generated `pnpm-lock.yaml` for the current Void workspace.
- Added project-level pnpm build approvals for known native/binary dependencies required by the current workspace.
- Kept `generate-all` limited to existing `generate-version`; startup theme bootstrap remains a separate issue.
- Kept root E2E env names as `VOID_E2E_*`; no `BITFUN_*` or BitFun paths were introduced.

Files changed:

- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `pnpm-lock.yaml`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Root package identity is `void`, version `0.2.8`, private.
- Workspace installer path is `Void-Installer`.
- Root scripts delegate to existing module commands; no functional UI, desktop, installer, provider, media, short-drama, CLI, or theme code changed.
- Brand scan over new root workspace files found no BitFun/GCWing residue.

Verification summary:

- Passed: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"`
- Passed: brand grep over `package.json`, `pnpm-workspace.yaml`, `.npmrc`, and `pnpm-lock.yaml`.
- Passed after project-level build approvals: `pnpm install --frozen-lockfile`.
- Passed: `pnpm run check:github-config`.
- Passed: `pnpm run i18n:contract:test` (14 tests).
- Passed: `pnpm run check:repo-hygiene`.
- Passed: `pnpm --dir src/mobile-web run type-check`.
- Failed as expected for a pre-existing audit gap: `pnpm run i18n:audit`.
- Passed: `git diff --check` with LF/CRLF warnings only.

Risk notes:

- `pnpm install --frozen-lockfile` prints warnings about `wdio-edgedriver-service` bin creation, but exits 0 after allowed build scripts run.
- `pnpm run i18n:audit` now reaches the script and fails on 25 existing short-drama CJK source candidate lines while the checked-in budget is 0. This should be handled in `ISSUE-060C`, not hidden in root package work.
- Generated `pnpm-lock.yaml` is new and should be reviewed as build infrastructure metadata.

Next issue:

- `ISSUE-060C i18n Governance Report and Baseline Layers`

## ISSUE-060C i18n Governance Report and Baseline Layers

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added `--report-json` parsing to `scripts/i18n-audit.mjs`.
- Added a machine-readable governance report with error/warning counts and hardcoded CJK source budget statuses.
- Registered current short-drama CJK source candidates as a reviewed no-growth `web-ui-source` baseline of 25 lines.
- Updated i18n contract tests to assert the report option and current baseline.
- Left locale resources and short-drama business/source behavior unchanged.

Files changed:

- `scripts/i18n-audit.mjs`
- `scripts/i18n-hardcoded-baseline.json`
- `scripts/i18n-contract.test.mjs`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No `BitFun`, `BITFUN_*`, `__BITFUN_*`, `BitFun-Installer`, or upstream locale namespace deletion was introduced.
- Current short-drama service behavior is unchanged; the issue only records existing CJK source debt in the i18n governance layer.
- New CJK source lines remain blocked because the baseline is no-growth.

Verification summary:

- Passed: `pnpm run i18n:audit`; result now passes with 1 grandfathered warning for 25 short-drama CJK lines.
- Passed: `node scripts/i18n-audit.mjs --report-json scripts/.tmp-i18n-governance-report.json`.
- Passed: inspected generated report JSON structure; temporary report file was removed.
- Passed: `pnpm run i18n:contract:test` (14 tests).
- Passed: `pnpm run check:repo-hygiene`.

Risk notes:

- This does not translate or relocate the short-drama Chinese text; it makes the existing debt explicit and prevents growth.
- Full upstream dynamic-key/l10n-identical/literal-fallback baseline layers are still possible future extensions, but this issue fixed the current CI-blocking audit gap first.

Next issue:

- `ISSUE-060B Repo Hygiene Enhancements`

## ISSUE-060D Relay Homepage Shared i18n Terms

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Product/Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added generator support for `src/apps/relay-server/static/homepage/i18n.shared.json`.
- Generated relay homepage shared terms from Void shared resources with a narrow allowlist: `features.remoteControl`.
- Changed relay homepage `flowMobileSub` values to `{ "$shared": "features.remoteControl" }` instead of duplicating the term per locale.
- Updated the static homepage loader to fetch `i18n.shared.json` and resolve `$shared` dotted paths with English fallback.
- Updated i18n audit so relay homepage `$shared` objects count as their parent `data-i18n` key and referenced shared terms are validated.
- Added contract tests proving the generated shared file exists, generator owns relay shared terms, and the homepage loader resolves `$shared`.

Files changed:

- `scripts/generate-i18n-contract.mjs`
- `scripts/i18n-contract.test.mjs`
- `scripts/i18n-audit.mjs`
- `src/apps/relay-server/static/homepage/i18n.json`
- `src/apps/relay-server/static/homepage/index.html`
- `src/apps/relay-server/static/homepage/i18n.shared.json`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

Preserved contracts checked:

- No BitFun homepage copy, BitFun product name, upstream URL, or upstream installer identity was introduced.
- No relay server runtime, Web UI runtime, mobile-web, installer, core Fluent resource, or broader i18n surface behavior was changed.
- The shared term source remains `src/shared/i18n/resources/shared/**/terms.json`.

Verification summary:

- RED: `node --test scripts/i18n-contract.test.mjs` failed before implementation because `i18n.shared.json` and relay shared generator ownership were missing.
- Passed: `node --test scripts/i18n-contract.test.mjs` with 15 tests.
- Passed: `node scripts/generate-i18n-contract.mjs --check`.
- Passed: `node scripts/i18n-audit.mjs` with the existing short-drama CJK grandfathered warning.
- Passed: `pnpm run i18n:contract:test`.
- Passed: `pnpm run i18n:audit`.
- Passed: `pnpm run i18n:generate`.
- Passed: scoped `git diff --check` with LF/CRLF warnings only.

Risk notes:

- No browser/service smoke was run for the static relay homepage fetch path.
- Deployment inclusion of `i18n.shared.json` is inferred from static file placement and generator check, not proven by packaging smoke.

Next issue:

- `ISSUE-060B Repo Hygiene Enhancements`

## ISSUE-060B Repo Hygiene Enhancements

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Ported upstream repo hygiene scanner robustness into the current Void script.
- Added relay static asset ignore.
- Narrowed local absolute path matching to workspace/user-specific paths instead of any drive path.
- Skipped local path checks for comment-only lines.
- Skipped token/local path checks inside Rust inline `#[cfg(test)]` modules and `#[test]` functions.
- Added a short script header documenting scan rules.

Files changed:

- `scripts/check-repo-hygiene.mjs`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No brand, installer, root package, CI, app behavior, or source module files changed.
- Hygiene scanner still checks sensitive filenames, private key markers, token-like secrets, and local absolute paths in non-test changed text files.

Verification summary:

- Passed: `node --check scripts/check-repo-hygiene.mjs`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `pnpm run check:repo-hygiene`.
- Passed: `pnpm run i18n:audit`.

Risk notes:

- This is still a heuristic scanner; broader secret scanning remains out of scope.
- The local path regex is intentionally narrower to reduce false positives in examples/comments while still catching user/workspace-specific absolute paths.

Next issue:

- `ISSUE-060F CLI Theme Color Audit`

## ISSUE-060F CLI Theme Color Audit

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added a Void CLI theme color audit script based on upstream behavior, with the shared utility logic inlined to keep this issue independent.
- Added tests for hex normalization, alpha blending, preset JSON parsing, `theme.rs` fallback extraction, near-color detection, baseline drift, report writing, and JSON CLI output.
- Generated a current Void CLI no-growth baseline from `src/apps/cli/themes/presets/void-*.json` and `src/apps/cli/src/ui/theme.rs`.

Files changed:

- `scripts/audit-cli-theme-colors.mjs`
- `scripts/audit-cli-theme-colors.test.mjs`
- `scripts/theme-color-governance-baseline.cli.json`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No CLI runtime files, preset names, theme values, root package scripts, CI files, installer files, or app behavior changed.
- Script output and tests use Void names only.

Verification summary:

- RED: `node --test scripts/audit-cli-theme-colors.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before the script existed.
- Passed: `node --check scripts/audit-cli-theme-colors.mjs`.
- Passed: `node --test scripts/audit-cli-theme-colors.test.mjs` with 10 tests.
- Passed: `node scripts/audit-cli-theme-colors.mjs --top=5`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: `git diff --check` with LF/CRLF warnings only.

Risk notes:

- The CLI audit is not wired into root `package.json` or CI in this issue to avoid crossing the root-package boundary.
- Current baseline intentionally freezes existing color debt: preset unique colors 135, preset near pairs 24, Rust fallback unique colors 35, Rust fallback near pairs 4, total unique colors 168.

Next issue:

- `ISSUE-060E Theme Color Audit Foundation`

## ISSUE-060E Theme Color Audit Foundation

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added a Void theme color audit foundation for Web UI, mobile-web, and installer source roots.
- Added tests for color literal parsing, comment stripping, CSS var definition/usage/fallback detection, ignored test/generated files, near-color pair reporting, baseline drift, report writing, and JSON CLI output.
- Generated no-growth baselines for `src/web-ui/src`, `src/mobile-web/src`, and `Void-Installer/src`.

Files changed:

- `scripts/audit-theme-colors.mjs`
- `scripts/audit-theme-colors.test.mjs`
- `scripts/theme-color-governance-baseline.json`
- `scripts/theme-color-governance-baseline.mobile-web.json`
- `scripts/theme-color-governance-baseline.installer.json`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- No Web UI theme tokens, mobile theme tokens, installer theme values, SCSS files, UI runtime, root package scripts, CI files, or installer config files changed.
- New scripts and baselines use Void naming only and remain observation/baseline governance.

Verification summary:

- RED: `node --test scripts/audit-theme-colors.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before the script existed.
- Intermediate failure: first GREEN run had one incorrect test expectation for fallback-only vars; corrected test to match intended fallback classification.
- Passed: `node --check scripts/audit-theme-colors.mjs`.
- Passed: `node --test scripts/audit-theme-colors.test.mjs` with 8 tests.
- Passed: `node scripts/audit-theme-colors.mjs --root src/web-ui/src --baseline scripts/theme-color-governance-baseline.json --top=3`.
- Passed: `node scripts/audit-theme-colors.mjs --root src/mobile-web/src --baseline scripts/theme-color-governance-baseline.mobile-web.json --top=3`.
- Passed: `node scripts/audit-theme-colors.mjs --root Void-Installer/src --baseline scripts/theme-color-governance-baseline.installer.json --top=3`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: brand-residue scan over new 060E files.
- Passed: `git diff --check` with LF/CRLF warnings only.

Risk notes:

- This is a foundation scanner, not the full upstream `theme-css-var-contract.mjs` registry; deeper token-domain contracts remain future work.
- Web UI current baseline is intentionally high: unique colors 1655, fallback-only vars 78, undefined vars 51, indistinguishable pairs 53, near pairs 1279.
- The audit is not wired into root scripts or CI in this issue to avoid crossing the root/CI boundary.

Next issue:

- `ISSUE-060G Startup Theme Bootstrap Manifest`

## ISSUE-060G Startup Theme Bootstrap Manifest

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added pure startup bootstrap and prompt snapshot projection helpers from current Void Web UI `builtinThemes`.
- Added focused Vitest coverage for entry and manifest projection.
- Added `scripts/generate-startup-theme-bootstrap.mjs` with write and `--check` modes.
- Generated Web UI scoped JSON manifests under `src/web-ui/src/infrastructure/theme/presets/generated/`.

Files changed:

- `scripts/generate-startup-theme-bootstrap.mjs`
- `src/web-ui/src/infrastructure/theme/presets/startupThemeBootstrap.ts`
- `src/web-ui/src/infrastructure/theme/presets/themePromptSnapshots.ts`
- `src/web-ui/src/infrastructure/theme/presets/startupThemeBootstrap.test.ts`
- `src/web-ui/src/infrastructure/theme/presets/generated/startup-theme-bootstrap.json`
- `src/web-ui/src/infrastructure/theme/presets/generated/theme-prompt-snapshots.json`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- Source of truth remains current Void `builtinThemes`.
- Generated theme ids are `void-*`; no BitFun globals, env vars, CSS vars, installer paths, upstream `assembly` paths, or desktop startup behavior changes were introduced.
- Desktop consumption is explicitly deferred.

Verification summary:

- RED: focused Vitest failed because projection helper modules did not exist.
- Passed: `pnpm --dir src/web-ui exec vitest run src/infrastructure/theme/presets/startupThemeBootstrap.test.ts` with 4 tests.
- Passed: `node scripts/generate-startup-theme-bootstrap.mjs`.
- Passed: `node scripts/generate-startup-theme-bootstrap.mjs --check`.
- Passed: `node scripts/generate-startup-theme-bootstrap.mjs --json --check`.
- Passed: `pnpm --dir src/web-ui run type-check`.
- Passed: `node --check scripts/generate-startup-theme-bootstrap.mjs`.
- Passed: `node scripts/check-repo-hygiene.mjs`.
- Passed: brand-residue scan over new 060G files.
- Passed: `git diff --check` with LF/CRLF warnings only.

Risk notes:

- Root `package.json` generate scripts were not changed in this issue because root script/CI wiring is a separate boundary.
- Generated manifests are currently Web UI scoped artifacts; desktop startup consumption needs a separate adapter/runtime issue.

Next issue:

- `ISSUE-060H Theme Visual Governance Contract`

## ISSUE-120C Windows Computer Use Module Gates and App Enumeration

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 120C-Architecture-Agent, 120C-Upstream-Windows-ListApps-Agent, 120C-QA-Risk-Agent, 120C-Spec-Reviewer, and 120C-Code-Quality-Reviewer

Scope completed:

- Added `windows_list_apps` as a Windows-only Computer Use adapter module.
- Implemented Windows app/window enumeration for visible, non-minimized, titled top-level windows.
- Grouped windows by owning pid and returned one `AppInfo` per pid.
- Resolved executable image paths through kernel32 FFI and used exe basename as app name when available.
- Fell back to the first window title when executable path resolution fails.
- Wired `DesktopComputerUseHost::list_apps` to call the Windows adapter under `#[cfg(target_os = "windows")]`.
- Kept macOS `list_apps` behavior and non-macOS/non-Windows empty-list behavior unchanged.
- Added focused `windows_app_enumeration` tests for suffix stripping, basename extraction, pid grouping, sorting, and `AppInfo` fields.

Files changed:

- `src/apps/desktop/src/computer_use/windows_list_apps.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- `ComputerUseHost::list_apps` remains the only host boundary exposed by this issue.
- No Windows capture, background input, app action, interactive view, visual view, Web UI permission, terminal crate, or core tool schema behavior was intentionally changed in 120C.
- `AppInfo` shape is unchanged; Windows app entries use `bundle_id: None`, `pid: Some(pid)`, `running: true`, `last_used_ms: None`, and `launch_count: 0`.
- `get_app_state`, `app_click`, `app_type_text`, `app_scroll`, `app_key_chord`, interactive flow, and visual flow remain out of scope for Windows.

Verification summary:

- RED failed as expected: `cargo test -p void-desktop windows_app_enumeration -- --nocapture`.
- GREEN passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo check -p void-desktop`.
- Passed: `rustfmt --edition 2024 src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/windows_list_apps.rs src/apps/desktop/src/computer_use/desktop_host.rs`.
- Passed by 120C spec review: no capture, background input, app action, interactive/visual, Web UI, terminal crate, or core schema wiring was introduced by 120C.
- Code-quality review found the current dirty worktree still contains prior 120B `terminal_detect` and macOS `bg_type_text_auto` changes in the same files. Those are recorded as prior issue scope, not 120C's intentional delta.

Risk notes:

- Real `EnumWindows` behavior still needs a Windows desktop smoke with visible apps such as Notepad/Calculator.
- The adapter intentionally ignores `include_hidden` on Windows because this slice only targets visible top-level windows.
- Current app names come from executable basenames when available; richer metadata and recency signals remain future work.
- `exe_path_for_pid` uses a fixed 1024 UTF-16 buffer and falls back to the window title if image path resolution fails; dynamic buffer retry can be considered later if long paths prove common.
- The wider working tree contains earlier issue and unrelated changes; 120C's intentional source delta is limited to Windows app enumeration and the `list_apps` routing point.

Next issue:

- `ISSUE-120D Windows Computer Use UIA Snapshot and MSAA Fallback`

## ISSUE-120A Computer Use Platform Inventory

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator plus 120A-macOS-Platform-Inventory-Agent, 120A-Windows-Platform-Inventory-Agent, and 120A-Contract-Risk-Agent

Scope completed:

- Compared upstream Computer Use platform files against current Void Computer Use boundaries.
- Identified Windows platform gaps: module gates, app/window enumeration, cached UIA snapshot, MSAA fallback, foreground/window capture, background input primitives, host app actions, and interactive/visual views.
- Identified macOS platform gaps: SkyLight bridge, dual-post background input, window id resolution, focus-without-raise, Chromium/Electron background click recipe, AX snapshot improvements, AX pre-focus, and input parity helpers.
- Preserved 120B terminal/GVim routing as an already-completed pure routing slice.
- Split follow-up work into `ISSUE-120C` through `ISSUE-120H`, `ISSUE-121A` through `ISSUE-121F`, and deferred `ISSUE-122A`/`ISSUE-122B`.
- Recorded that `describe_screen` and upstream tool-contract DTO extraction are not platform-adapter prerequisites.

Files changed:

- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Preserved contracts checked:

- `ComputerUseHost` remains the only platform boundary between core tools and desktop OS adapters.
- Computer Use policy, permission, and click-safety state remain outside Web UI and outside platform input primitives.
- `screenshot_display`, readiness state, `ComputerUseInteractionState`, and unsupported-platform semantics are not changed by this inventory issue.
- Terminal/GVim detection remains in desktop Computer Use route selection and is not moved into the terminal crate.
- Flow Chat, media, short-drama, provider adapters, terminal service/UI, installer, i18n, theme, and release files were not changed in 120A.

Verification summary:

- Passed by read-only upstream/local inventory from the macOS platform subagent.
- Passed by read-only upstream/local inventory from the Windows platform subagent.
- Passed by contract/risk subagent review.
- Functional tests were not required because 120A changed docs only.

Risk notes:

- macOS SkyLight uses private SPI and must remain isolated, soft-failing, and separately smoke-tested.
- Windows background input can fail due to UIPI, DWM cloak, foreground restoration, or SendInput fallback behavior; host wiring must wait for isolated primitive tests.
- Windows capture fallback can be occluded or stale and must surface uncertainty explicitly.
- AX/UIA/MSAA tree traversal can hang or return partial data; adapter results must distinguish unsupported, partial, and error states.
- `describe_screen` and DTO extraction are deferred because they change core/tool contracts rather than platform adapters.

Next issue:

- `ISSUE-120C Windows Computer Use Module Gates and App Enumeration`

## ISSUE-120B Computer Use Terminal Detection Routing

Status: Done
Date: 2026-07-02
Owner/session: main orchestrator

Scope completed:

- Added pure Computer Use terminal/GVim route detection under desktop Computer Use.
- Added focused Rust tests for terminal positives, GVim, normal app negatives, platform normalization, and generic `terminal` false-positive protection.
- Wired macOS `app_type_text` through `bg_type_text_auto`, which chooses terminal-safe key-event typing for terminal-like targets and preserves Unicode text injection for normal apps.
- Added macOS terminal key mapping for common shell text and punctuation so terminal-like targets do not fall back to Unicode events for typical commands.
- Kept Windows/Linux work to pure detection coverage; Windows background input remains a later platform slice.

Files changed:

- `src/apps/desktop/src/computer_use/terminal_detect.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `src/apps/desktop/src/computer_use/macos_bg_input.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop terminal_detect -- --nocapture` failed before implementation because terminal targets still routed to `AxText`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` with 8 focused tests.
- Passed: `cargo check -p void-desktop`.
- Passed: `rustfmt --edition 2024` on 120B Rust files.
- Blocked by environment: `cargo check -p void-desktop --target x86_64-apple-darwin` after target install, because no macOS-capable `cc` toolchain is available on this Windows machine.

Risk notes:

- macOS-specific adapter code should be compiled on macOS or a configured cross toolchain before release.
- `Terminal.app` detection is intentionally conservative: known bundle ids, terminal-keyword bundle ids, and known terminal names/classes route to key events, but generic text containing `terminal` does not.
- macOS terminal-safe key mapping covers common shell ASCII and newline/tab/space; non-ASCII still falls back to Unicode events and should be smoke-tested on real Terminal/iTerm/Ghostty before release.
- Windows cloaked/background input, MSAA, Windows capture, and macOS Skylight remain out of scope for this issue.

Next issue:

- `ISSUE-120D Windows Computer Use UIA Snapshot and MSAA Fallback`

## Next Active Issue Candidate

`ISSUE-120E Windows Computer Use Foreground Window Capture`

Reason:

- 120D completed cached Windows UIA snapshot and SAL/VCL MSAA fallback foundations for foreground-window app state.
- 120E is the next Windows platform foundation needed before input, app actions, or interactive/visual views.
- It keeps terminal UI, media, short-drama, Flow Chat, and provider/runtime work under their existing module boundaries.

Allowed files if selected:

- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`
- `docs/ISSUES.md`
- `docs/DECISIONS.md`
- `docs/ARCHITECTURE.md`
- `src/apps/desktop/src/computer_use/*` limited to Windows accessibility snapshot and MSAA fallback adapters

Forbidden:

- terminal crate or Web UI terminal behavior changes,
- Computer Use permission UI changes,
- Windows capture or background input implementation,
- host app action wiring,
- interactive/visual view enabling,
- BitFun identity introduction,
- whole-file upstream Computer Use host replacement,
- unrelated Flow Chat, media, short-drama, ACP, CLI, provider, i18n, installer, or theme token changes.

## Notes

- Direct upstream merge remains disallowed.
- Functional runtime code has not been changed in this migration phase.
- Build verification metadata and focused tests have been added for `ISSUE-004A`.
- `ISSUE-004B` required documentation/test-result updates only; no scheduler or subagent source changes were needed.
- `ISSUE-004C` implemented goal status/budget semantics in the current Void architecture and fixed the `zip 4.6` desktop compile compatibility found during verification.
- `ISSUE-004D` required documentation/test-result updates only; existing review/subagent contract tests were sufficient.
- `ISSUE-005` required documentation/test-result updates only; existing Flow Chat/BTW/subagent contract tests were sufficient.
- `ISSUE-006` required documentation/test-result updates only; scoped brand and installer identity audit passed.
- `ISSUE-001` required documentation/test-result updates only; existing ACP `omp` preset implementation and tests were sufficient.
- `ISSUE-002` required documentation/test-result updates only; existing CLI command matching implementation and tests were sufficient.
- `ISSUE-010A` required documentation/test-result updates only; local Escape/IME/popup-active behavior already matched upstream's fix path.
- `ISSUE-010B` added RichTextInput spacing contract tests; no product source change was needed.
- `ISSUE-010C` added CSS viewport bounds for chat input popups without changing popup behavior/state.
- `ISSUE-011` added a tested image undo helper and latest-context guard while preserving local image backend/media contracts.
- `ISSUE-020A` added bounded API timing and concurrency fields to Void startup trace snapshots without copying BitFun globals or render profiling.
- `ISSUE-020B` is closed as a traceable sub-slice of `ISSUE-020A`; bounded concurrency diagnostics are covered by the same startup trace implementation and tests.
- `ISSUE-020C` added a default-off Void render profile primitive and split component instrumentation into `ISSUE-020D`.
- `ISSUE-020D` was deferred after read-only comparison because local Markdown/model-round render paths diverge and need browser smoke before instrumentation.
- `ISSUE-030A` verified workspace media state-model coverage and updated stale pending-slot test selectors without changing production media code.
- `ISSUE-030B` added workspace media trash failure/safety tests and rejected unsafe restore/purge trash ids before filesystem adapter calls.
- `ISSUE-040A` verified short-drama existing project protection, source-of-truth sidecars, workspace mismatch, and project fact coverage with no source changes.
- `ISSUE-040B` verified short-drama stage-agent policy, artifact workflow, change request, and media recovery contracts with no source changes.
- `ISSUE-050` split upstream provider adapter parsing/retry changes into fixture harness, SSE retry, OpenAI/Responses parsing, Anthropic/Gemini parsing, and model-selector/credential follow-up issues.
- `ISSUE-050A` added a test-only Void SSE fixture harness for ai-adapters without changing provider runtime source.
- `ISSUE-050B` migrated upstream's 60s Retry-After cap and richer transport diagnostics; TTFT first-effective-output semantics were split into `ISSUE-050F`.
- `ISSUE-050C` added OpenAI/Responses fixture replay coverage and required no parser runtime source changes.
- `ISSUE-050D` added Anthropic/Gemini fixture replay coverage and required no provider runtime source changes.
- `ISSUE-050E` inventoried model selector and CLI credential helpers; accepted `ISSUE-050E1` for the missing adapter helper.
- `ISSUE-050E1` added the standalone adapter model selector helper and tests without touching CLI UI or auth storage.
- `ISSUE-050F` migrated first-effective-output TTFT semantics for adapter streams without changing parser behavior.
- `ISSUE-060F` added Void CLI theme color governance with tests and a no-growth baseline; it did not change CLI runtime behavior.
- `ISSUE-060E` added Web/mobile/installer theme color governance with tests and no-growth baselines; it did not change theme runtime behavior or token values.
- `ISSUE-060G` added Web UI scoped startup theme bootstrap and prompt snapshot manifest generation without changing desktop startup behavior.
- `ISSUE-120B` added conservative Computer Use terminal/GVim route detection and macOS `app_type_text` auto routing without touching terminal crate/Web UI terminal behavior.
- `ISSUE-120A` completed the Computer Use platform inventory and split Windows/macOS upstream parity work into adapter-scoped follow-up issues without runtime code changes.
- `ISSUE-120C` added Windows Computer Use app/window enumeration behind `ComputerUseHost::list_apps` without enabling Windows capture, background input, app actions, or interactive/visual views.

## ISSUE-120H1 Windows AppState Screenshot Attachment

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator

Scope completed:

- Split `ISSUE-120H` into smaller Windows interactive/visual prerequisites after upstream, architecture, and QA subagent review.
- Added Windows host conversion from `windows_capture::WindowCapture` PNG/metadata into `ComputerScreenshot` and `PointerMap`.
- Wired Windows `get_app_state_inner(..., capture_screenshot=true)` to attach a screenshot from the same target HWND used for the UIA/MSAA snapshot.
- Registered the attached screenshot's coordinate map by app pid and screenshot id for later image-coordinate app actions and visual flows.
- Preserved `potentially_occluded` capture uncertainty as `[WINDOWS_CAPTURE_UNCERTAIN]` in `AppStateSnapshot.loop_warning`.
- Addressed final review by revalidating the target HWND/pid after capture and before map registration, and by composing capture warnings with existing snapshot warnings.

Files changed:

- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ARCHITECTURE.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture` failed before implementation because `windows_screenshot_from_window_capture` did not exist.
- GREEN: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture` passed with 2 focused tests.
- Final review retest: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture` passed with 3 focused tests after adding warning-composition coverage.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo check -p void-desktop`.
- Passed: scoped `git diff --check` with only an LF/CRLF working-copy warning.
- Final review retest passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`, `cargo check -p void-desktop`, and scoped `git diff --check`.

Risk notes:

- Automatic tests validate conversion, coordinate mapping, and uncertainty propagation seams; they do not prove real Windows capture reliability.
- Manual Windows smoke remains required for Notepad/Calculator/Settings, occluded windows, minimized windows, elevated targets, DPI, and multi-monitor coordinates.
- `supports_interactive_view`, `supports_visual_mark_view`, `supports_background_input`, drag, and `app_wait_for` remain unchanged.

Next issue:

- `ISSUE-120H2 Windows Interactive View Enablement`

## ISSUE-120H2 Windows Interactive View Enablement

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator

Scope completed:

- Reused existing subagents for 120H2 architecture and QA/risk review after the thread hit the subagent creation limit.
- Added Windows interactive view RED/GREEN coverage for support flags, snapshot-to-view construction, cache population, digest prefix matching, stale digest errors, missing-cache errors, out-of-range errors, image-center lookup, tree text opt-out, screenshot retention, and warning propagation.
- Added a host helper that builds an `InteractiveView` from an `AppStateSnapshot` and writes `interactive_view_cache` by pid.
- Enabled Windows `build_interactive_view` using 120H1 `get_app_state_inner(..., capture_screenshot=true)` screenshots and existing `interactive_filter`/`som_overlay`.
- Extended `resolve_interactive_index` and `cached_interactive_image_center` to macOS/Windows while keeping their existing error contracts.
- Enabled `supports_interactive_view` on Windows.
- Addressed final review by returning `[INTERACTIVE_VIEW_EMPTY]` without writing cache when filtering finds no interactive elements.

Files changed:

- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ARCHITECTURE.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture` failed before implementation because the expected build/cache resolver helpers did not exist.
- GREEN: `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture` passed with 3 focused tests.
- Final review RED: `cargo test -p void-desktop windows_interactive_view_enablement_empty_elements_are_explicit_error -- --nocapture` failed because empty filtered views returned success.
- Final review GREEN: `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture` passed with 4 focused tests after adding `[INTERACTIVE_VIEW_EMPTY]`.
- Passed: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo check -p void-desktop`.
- Passed: scoped `git diff --check` with only an LF/CRLF working-copy warning.
- Final review retest passed: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`, `cargo test -p void-desktop windows_host_app_actions -- --nocapture`, and `cargo check -p void-desktop`.

Risk notes:

- Real Windows smoke remains required for overlay readability, DPI/multi-monitor alignment, occluded BitBlt fallback warnings, minimized/closed windows, and same-process multi-window cache behavior.
- `interactive_click`, `interactive_type_text`, and `interactive_scroll` are intentionally still Windows-unsupported until 120H3.
- Core action hints may still suggest interactive actions after view construction even though Windows actions remain 120H3; this is documented risk for the next issue.
- Pid-keyed cache is acceptable for 120H2 view-only work, but same-process multi-window ownership should be revisited before Windows interactive actions in 120H3.
- `supports_visual_mark_view`, visual click, drag, `app_wait_for`, Web UI permission policy, core schema, macOS behavior, and terminal behavior remain unchanged.

Next issue:

- `ISSUE-120H3 Windows Interactive Actions`

## ISSUE-120H3 Windows Interactive Actions

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator

Scope completed:

- Reused existing Architecture-Agent and QA/Risk-Agent for 120H3 read-only review; no new subagent was spawned because the thread had already reached the subagent limit.
- Added HWND and screenshot-id ownership to the host's internal `interactive_view_cache` so Windows actions fail closed if the target window changes and image-coordinate fallbacks can target the same screenshot basis returned by `build_interactive_view`.
- Enabled Windows `interactive_click` through cached `i -> node_idx` resolution, cached HWND validation, existing `app_click(NodeIdx)`, one stale-view rebuild retry, and screenshot-id-bound `ImageXy` fallback.
- Enabled Windows `interactive_type_text` through cached focus resolution, existing `app_click`, `app_type_text`, and `app_key_chord`; `clear_first` uses `Ctrl+A` then `Delete`, and `press_enter_after` uses `Enter`.
- Enabled Windows `interactive_scroll` through cached focus resolution and existing `app_scroll`.
- Kept visual marks, visual grid, drag, `app_wait_for`, Web UI permission changes, core schema, terminal behavior, low-level Windows input primitives, and macOS behavior out of scope.

Files changed:

- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ARCHITECTURE.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- Passed: `cargo test -p void-desktop windows_interactive_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo check -p void-desktop`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Failed: `cargo fmt -p void-desktop --check` reported package-wide pre-existing formatting diffs across many files outside 120H3 scope; not auto-fixed to avoid unrelated churn.
- Final review passed after follow-up fixes for HWND identity validation and single-HWND view construction.

Risk notes:

- Automated tests validate host orchestration seams and regressions; they do not prove real `PostMessageW`/cloaked input delivery to every Windows app.
- Manual Windows smoke remains required for Notepad text entry, scrollable windows, stale digest after window switch/close, same-process multi-window apps, occluded/minimized windows, elevated targets, DPI, and multi-monitor coordinates.
- The cache still keys by pid but stores HWND identity for action-time validation; manual same-process multi-window smoke remains required.

Next issue:

- `ISSUE-120H4 Windows Visual Mark View and Click`

## ISSUE-120H4 Windows Visual Mark View and Click

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator

Scope completed:

- Reused existing Architecture-Agent and QA/Risk-Agent for 120H4 read-only review before code changes.
- Added Windows `build_visual_mark_view` using one resolved HWND, same-HWND app-state screenshot attachment, existing regular visual mark generation, existing overlay rendering, and `visual_mark_cache`.
- Added Windows `visual_click` using cached mark resolution, cached HWND validation, cached `screenshot_id`, and existing `app_click(ImageXy)`.
- Fixed final-review P1: stale auto-rebuild now binds the click target to the rebuilt view pid/cache so the mark coordinates and `screenshot_id` come from the same screenshot basis.
- Extended `CachedVisualMarkView` to store `hwnd_raw` so stale same-pid/multi-window marks fail closed with `[WINDOW_CHANGED]`.
- Enabled `supports_visual_mark_view` on Windows after focused tests passed.
- Kept VisualGrid, drag, `app_wait_for`, Web UI permission policy, core schema, low-level Windows input primitives, terminal behavior, and macOS behavior out of scope.

Files changed:

- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ARCHITECTURE.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop windows_visual_mark -- --nocapture` failed before implementation because the Windows visual-mark helper/cache/resolver methods did not exist.
- GREEN: `cargo test -p void-desktop windows_visual_mark -- --nocapture` passed with 5 focused tests.
- Passed: `cargo test -p void-desktop windows_visual_mark_rebuilt_view_target_uses_rebuilt_pid_screenshot_id -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_app_enumeration -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo check -p void-desktop`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Failed: `cargo fmt -p void-desktop --check` reported package-wide pre-existing formatting diffs across many files outside 120H4 scope; not auto-fixed to avoid unrelated churn.

Risk notes:

- Automated tests validate host orchestration seams and adjacent regressions; they do not prove real Windows `visual_click` delivery or all DPI/multi-monitor coordinate behavior.
- Manual Windows smoke remains required for Notepad visual mark view/click, scrollable windows, same-process multi-window HWND mismatch, stale digest after window changes, occluded/minimized windows, elevated targets, DPI, and multi-monitor coordinates.
- VisualGrid remains explicitly deferred to 120H5.
- Final-Review-Agent P1 on stale rebuild pid/screenshot-id binding was fixed and retested.

Next issue:

- `ISSUE-120H5 Windows VisualGrid Support Decision`

## ISSUE-120H5 Windows VisualGrid Support Decision

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Decided Windows `ClickTarget::VisualGrid` remains explicitly unsupported until real Windows smoke covers DPI scaling, occlusion/minimized windows, DirectComposition/UWP surfaces, same-process multi-window identity, and multi-monitor coordinates.
- Added stable `[WINDOWS_VISUAL_GRID_UNSUPPORTED]` helper text that points to ISSUE-120H5 and suggests `build_visual_mark_view` plus `visual_click`, or explicit `ImageXy` with a screenshot basis.
- Added focused tests proving Windows VisualGrid remains explicit unsupported and existing explicit `ImageGrid` coordinate conversion still works.
- Kept Windows visual marks, `ImageGrid`, `ImageXy`, macOS VisualGrid, Web UI policy, core schema, low-level Windows input primitives, drag, `app_wait_for`, terminal behavior, and background input capability unchanged.

Files changed:

- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop windows_visual_grid -- --nocapture` failed before implementation because `windows_visual_grid_unsupported_error` did not exist.
- GREEN: `cargo test -p void-desktop windows_visual_grid -- --nocapture` passed with 2 focused tests.
- Passed: `cargo test -p void-desktop windows_visual_mark -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_actions -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_foreground_capture -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.

Risk notes:

- Windows VisualGrid remains unavailable by design; this is a stable unsupported contract, not a hidden failure.
- Real Windows smoke is still required before any future issue can safely consider enabling self-detected VisualGrid.

Next issue:

- `ISSUE-121A macOS Computer Use SkyLight Bridge`

## ISSUE-121A macOS Computer Use SkyLight Bridge

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_skylight` as an isolated Computer Use adapter foundation compiled for macOS and tests.
- Added `SkyLightStatus`, `SkyLightAvailability`, `SkyLightDiagnostics`, and `SkyLightPolicy` with stable soft-fail messages and default-disabled behavior policy.
- Fixed final-review P2 so available diagnostics use `[SKYLIGHT_AVAILABLE]` instead of the unavailable prefix.
- Added macOS runtime probing through dynamic framework/symbol lookup for the contained SkyLight foundation.
- Kept SkyLight disconnected from `ComputerUseHost`, macOS background input, app click/type/scroll/key paths, focus, drag, `app_wait_for`, Web UI, core schema, Windows behavior, terminal behavior, and capability flags.

Files changed:

- `src/apps/desktop/src/computer_use/macos_skylight.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop macos_skylight -- --nocapture` failed before implementation because the SkyLight status/policy/diagnostics types did not exist.
- GREEN: `cargo test -p void-desktop macos_skylight -- --nocapture` passed with 4 focused tests.
- Passed after final-review fix: `cargo test -p void-desktop macos_skylight -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Blocked by environment: `cargo check -p void-desktop --target aarch64-apple-darwin` failed because the `aarch64-apple-darwin` Rust target is not installed in this Windows environment.

Risk notes:

- Real macOS target compile and smoke remain required before any later issue connects SkyLight to behavior.
- 121A intentionally does not prove private SkyLight behavior works; it only provides a soft-failing diagnostic foundation.

Next issue:

- `ISSUE-121B macOS Computer Use Dual-Post Background Input`

## ISSUE-121B macOS Computer Use Dual-Post Background Input

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_dual_post` as a pure, platform-independent policy seam for macOS post attempt ordering.
- Extended `macos_skylight` with a runtime-loaded `SLEventPostToPid` wrapper and optional keyboard authentication-message attachment.
- Routed normal macOS `bg_click`, `bg_scroll`, `bg_type_text`, and `bg_key_chord` posts through dual-post helpers.
- Preserved existing event construction, click counts, modifiers, scroll deltas, Unicode buffers, key ordering, `supports_background_input`, and public fallback behavior.
- Kept `bg_type_text_terminal_safe`, `bg_type_text_auto`, terminal/GVim detection semantics, `desktop_host.rs`, focus/window behavior, Chromium-specific click recipe, drag, `app_wait_for`, Web UI, core schema, and Windows behavior out of this issue.

Files changed:

- `src/apps/desktop/Cargo.toml`
- `src/apps/desktop/src/computer_use/macos_bg_input.rs`
- `src/apps/desktop/src/computer_use/macos_dual_post.rs`
- `src/apps/desktop/src/computer_use/macos_skylight.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop macos_dual_post -- --nocapture` failed before implementation because the dual-post policy types/functions did not exist.
- GREEN: `cargo test -p void-desktop macos_dual_post -- --nocapture` passed with 4 focused policy tests.
- Passed: `cargo test -p void-desktop macos_skylight -- --nocapture` with 5 tests.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: target-file `rustfmt --edition 2024 --check`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Blocked by environment: `cargo check -p void-desktop --target aarch64-apple-darwin` failed because the `aarch64-apple-darwin` Rust target is not installed in this Windows environment.

Risk notes:

- Real macOS compile and smoke remain required for normal app click/type/scroll/key chord, Chromium/Electron background delivery, Terminal/iTerm/GVim terminal-safe typing, Accessibility-denied behavior, and SkyLight-unavailable fallback.
- SkyLight availability diagnostics are still foundation-level diagnostics; post-level symbol diagnostics for `SLEventPostToPid` and auth attachment should be improved in a later macOS adapter issue.
- 121B intentionally does not implement focus-without-raise, window id resolution, Chromium/Electron click recipe, drag, no-auth menu key chord routing, or Web UI/core capability changes.

Next issue:

- `ISSUE-121C macOS Computer Use Window Identity and Focus Without Raise`

## ISSUE-121C macOS Computer Use Window Identity and Focus Without Raise

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_focus_plan` as a pure policy seam for focus-without-raise vs public activation fallback.
- Added SkyLight focus record construction plus `_SLPSGetFrontProcess`, `GetProcessForPID`, and `SLPSPostEventRecordTo` runtime wrappers with non-macOS soft-fail stubs.
- Added pid-owned on-screen layer-0 window id lookup in the macOS input/focus adapter.
- Updated `activate_pid_macos(pid)` to resolve the target pid's window id and try focus-without-raise before preserving the existing public activation fallback.
- Kept click/type/scroll/key event payload construction, terminal/GVim route selection, `supports_background_input`, Chromium/Electron click recipe, drag, `app_wait_for`, Web UI, core schema, Windows behavior, and broad host lifecycle out of this issue.

Files changed:

- `src/apps/desktop/src/computer_use/macos_bg_input.rs`
- `src/apps/desktop/src/computer_use/macos_focus_plan.rs`
- `src/apps/desktop/src/computer_use/macos_skylight.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop macos_focus_plan -- --nocapture` and `cargo test -p void-desktop macos_skylight_focus -- --nocapture` failed before implementation because the focus plan and SkyLight focus primitive APIs did not exist.
- RED: `cargo test -p void-desktop macos_focus_plan_does_not_raise_without_explicit_fallback_permission -- --nocapture` failed until `allow_raise_fallback` became explicit.
- GREEN: `cargo test -p void-desktop macos_focus_plan -- --nocapture` passed with 5 focused tests.
- Passed: `cargo test -p void-desktop macos_skylight_focus -- --nocapture`.
- Passed: `cargo test -p void-desktop macos_skylight -- --nocapture`.
- Passed: `cargo test -p void-desktop macos_dual_post -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: target-file `rustfmt --edition 2024 --check`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Blocked by environment: `cargo check -p void-desktop --target aarch64-apple-darwin` failed because the `aarch64-apple-darwin` Rust target is not installed in this Windows environment.

Risk notes:

- Real macOS compile and smoke remain required for pid-owned window id resolution, focus-without-raise, public fallback behavior, same-pid multi-window ordering, Accessibility-denied behavior, and SkyLight-unavailable fallback.
- Window id filtering is currently verified by implementation review and macOS smoke requirements; a later issue should extract the `CGWindowList` dictionary selection rule into a pure helper with same-pid multi-window, non-target pid, non-zero layer, and zero-window-id tests.
- Public activation fallback may raise/steal focus; 121C makes it explicit in the plan, but existing `activate_pid_macos(pid)` still allows it to preserve prior app-action behavior.
- 121C intentionally does not implement Chromium/Electron click recipes, window-local event stamping, drag, no-auth menu shortcut routing, Web UI/core capability changes, or Windows behavior changes.

Next issue:

- `ISSUE-121D macOS Chromium and Electron Background Click Recipe`

## ISSUE-121D macOS Chromium and Electron Background Click Recipe

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_chromium_click_plan` as a pure route and recipe seam for Chromium/Electron background click decisions.
- Added stable bundle-id based Chromium/Electron classification, explicit default reasons, window-local point derivation, and fixed recipe event ordering tests.
- Added SkyLight wrappers for `SLEventSetIntegerValueField` and `CGEventSetWindowLocation`, with non-macOS soft-fail tests.
- Added `bg_click_chromium` in the macOS input adapter. It posts the upstream-style sequence: target move, off-screen primer down/up, then up to two target down/up click pairs, all through the existing mouse dual-post layer.
- Added narrow macOS `app_click` host routing that collects bundle id, pid-owned window id, and AX window bounds; non-left clicks, metadata gaps, unsupported bundle ids, invalid bounds, or outside-window points keep the existing generic `bg_click` path.
- Added Chromium recipe failure fallback to the existing generic click path.
- Tightened final-review findings so required SkyLight event-field and window-local stamping failures return an error and trigger host fallback instead of reporting a false success.
- Kept generic `bg_click`, type/scroll/key input, terminal/GVim routing, Windows behavior, Web UI, core schemas, drag, `app_wait_for`, and screenshot target resolution out of this issue.

Files changed:

- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `src/apps/desktop/src/computer_use/macos_bg_input.rs`
- `src/apps/desktop/src/computer_use/macos_chromium_click_plan.rs`
- `src/apps/desktop/src/computer_use/macos_skylight.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop macos_chromium_click_plan -- --nocapture` initially failed because the Edge bundle-id variant was not classified.
- Final review fix: required Chromium event field values are now planned per event and reused by the adapter; required stamping failure now returns `[CHROMIUM_CLICK_STAMP_UNAVAILABLE]` so host fallback can run.
- GREEN: `cargo test -p void-desktop macos_chromium_click_plan -- --nocapture` passed with 6 focused tests.
- Passed: `cargo test -p void-desktop macos_skylight -- --nocapture` with 8 tests.
- Passed: `cargo test -p void-desktop macos_focus_plan -- --nocapture`.
- Passed: `cargo test -p void-desktop macos_dual_post -- --nocapture`.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_bg_input -- --nocapture`.
- Passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: target-file `rustfmt --edition 2024 --check`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Blocked by environment: `cargo check -p void-desktop --target aarch64-apple-darwin` failed because the `aarch64-apple-darwin` Rust target is not installed in this Windows environment.

Risk notes:

- Real macOS compile and smoke remain required for `bundle_id_for_pid`, `CGEventSetWindowLocation`, `SLEventSetIntegerValueField`, Chromium/Electron background click delivery, Retina/multi-display window-local coordinates, same-pid multi-window behavior, Accessibility-denied behavior, and SkyLight-unavailable fallback.
- Bundle-id classification is deliberately conservative and may need expansion after real app smoke, but must remain metadata-based.
- The route uses AX window bounds from the current app window; stale bounds or wrong same-pid window selection remain macOS smoke risks.

Next issue:

- `ISSUE-121E macOS Computer Use AX Snapshot Improvements`

## ISSUE-121E macOS Computer Use AX Snapshot Improvements

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_ax_snapshot_plan` as a pure policy seam for AX value placeholder fallback, root child attribute selection, child pointer dedupe, and Chromium AX enablement cache planning.
- Added best-effort Chromium/Electron AX tree enablement in `macos_ax_dump`: try `AXManualAccessibility`, fall back to `AXEnhancedUserInterface` only when the modern attribute is unsupported, then settle once per pid after successful enablement.
- Updated AX snapshot value extraction to use `AXPlaceholderValue` only when `AXValue` is absent.
- Updated root snapshot traversal to union `AXChildren` and `AXWindows`; non-root traversal remains `AXChildren` only.
- Added duplicate child/window pointer filtering before enqueueing so `AXChildren` and `AXWindows` overlap does not duplicate nodes or break idx/cache alignment.
- Tightened final-review findings so focused-window roots do not read `AXWindows`, and production dedupe now goes through the pure snapshot plan helper.
- Kept `desktop_host.rs`, input injection, SkyLight, focus, Chromium click recipe, `macos_ax_ui` locate/ranking behavior, Web UI, core schemas, Windows behavior, terminal behavior, drag, and `app_wait_for` out of this issue.

Files changed:

- `src/apps/desktop/src/computer_use/macos_ax_dump.rs`
- `src/apps/desktop/src/computer_use/macos_ax_snapshot_plan.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- RED: `cargo test -p void-desktop macos_ax_snapshot_plan -- --nocapture` failed before implementation because the plan functions and types did not exist.
- GREEN: `cargo test -p void-desktop macos_ax_snapshot_plan -- --nocapture` passed with 5 focused tests.
- Final review fix: `focus_window_only` root semantics now distinguish app roots from focused-window roots; only app roots union `AXChildren + AXWindows`, and child pointer dedupe uses the pure plan helper.
- Passed: `cargo test -p void-desktop macos_ax_dump -- --nocapture` on Windows with 0 tests, confirming the macOS FFI module remains cfg-gated.
- Passed: `cargo test -p void-desktop macos_ax_ui -- --nocapture` on Windows with 0 tests, confirming no locator/ranking code was compiled or changed in this environment.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: target-file `rustfmt --edition 2024 --check`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Blocked by environment: `cargo check -p void-desktop --target aarch64-apple-darwin` failed because the `aarch64-apple-darwin` Rust target is not installed in this Windows environment.

Risk notes:

- Real macOS compile and smoke remain required for `AXUIElementSetAttributeValue`, `AXManualAccessibility`, `AXEnhancedUserInterface`, first-snapshot settle timing, background Chromium/Electron `AXWindows` traversal, placeholder capture in real controls, AX ref retain/release behavior, and Accessibility-denied behavior.
- `macos_ax_dump.rs` is cfg-gated on macOS, so Windows-local tests prove the pure policy seam and non-macOS boundaries but not the real FFI code path.
- `macos_ax_ui` app-specific locator/ranking cleanup mentioned by QA is adjacent risk and should be split into a later issue if accepted.

Next issue:

- `ISSUE-121F macOS Computer Use AX Pre-Focus and Input Parity`

## ISSUE-121F1 macOS AX Pre-Focus Before Text Input

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `try_ax_focus` in the macOS AX writer adapter as a best-effort `AXFocused = true` primitive with null-ref fallback behavior.
- Wired macOS `app_type_text` to remember `ClickTarget::NodeIdx` focus targets, perform the existing click, activate the pid, then best-effort AX-focus the cached node before dispatching text.
- Preserved `bg_type_text_auto` as the only final text dispatch path, so terminal/GVim routing remains owned by the existing 120B terminal detector.
- Split the original mixed `ISSUE-121F` into `121F1` AX pre-focus, `121F2` key parity, and `121F3` pointer parity after subagent review.
- Confirmed right/middle click support appears already present, but left validation/documentation for `121F3`.
- Deferred Fn, no-auth key chord routing, and background drag because they require separate adapter/host policies and real macOS smoke.
- Scope note: the repository worktree still contains earlier issue changes in adjacent files. `121F1` should be reviewed or committed only through scoped hunks for the AX focus code and the consensus-doc updates below.

Files changed:

- `src/apps/desktop/src/computer_use/macos_ax_write.rs`
- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` with 8 tests.
- Passed on Windows with 0 compiled tests: `cargo test -p void-desktop macos_bg_input -- --nocapture`.
- Passed on Windows with 0 compiled tests: `cargo test -p void-desktop macos_ax_write -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: target-file `rustfmt --edition 2024 --check`.

Risk notes:

- Real macOS compile and smoke remain required for `AXUIElementSetAttributeValue(AXFocused)` and text insertion into focused Chromium/Electron/Cocoa controls.
- `Fn`, no-auth key chord routing, and PID-scoped background drag remain deferred to `121F2`/`121F3`.
- Final review found no blocking issue in the AX pre-focus code path, but flagged that the dirty worktree is not a clean standalone 121F1 package. Any future commit must isolate 121F1 hunks and must not stage unrelated earlier issue changes.

Next issue:

- `ISSUE-121F2 macOS Key Parity`

## ISSUE-121F2 macOS Key Parity

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_key_parity_plan` as a pure policy seam for macOS keyboard parity.
- Recorded Fn support as policy data: alias `fn`, secondary-Fn flag kind, and virtual keycode 63.
- Added default-host-parser eligibility policy so Fn remains unavailable through `app_key_chord` until real macOS smoke and an explicit route decision.
- Added `bg_key_chord_no_auth` in the macOS background input adapter as a distinct primitive that uses the existing no-auth post path.
- Preserved default macOS `app_key_chord` behavior: it still parses through `parse_key_sequence` and dispatches authenticated `bg_key_chord`.
- Preserved terminal/GVim text routing, Windows behavior, Web UI policy, core schemas, pointer/drag behavior, and private SPI boundaries.
- Scope note: the repository worktree still contains earlier issue changes in adjacent files. `121F2` should be reviewed or committed only through scoped hunks for the key parity files and consensus-doc updates below.

Files changed:

- `src/apps/desktop/src/computer_use/macos_key_parity_plan.rs`
- `src/apps/desktop/src/computer_use/macos_bg_input.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- Passed: `cargo test -p void-desktop macos_key_parity_plan -- --nocapture` with 4 tests.
- Passed: `cargo test -p void-desktop macos_dual_post -- --nocapture` with 4 tests.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` with 8 tests.
- Passed on Windows with 0 compiled tests: `cargo test -p void-desktop macos_bg_input -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed: target-file `rustfmt --edition 2024 --check`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.

Risk notes:

- Real macOS compile and smoke remain required for `CGEventFlagSecondaryFn`, Fn virtual keycode 63, no-auth key chord delivery, Accessibility-denied behavior, SkyLight-unavailable fallback, and AppKit menu-equivalent behavior.
- Fn is intentionally not product-facing through the default host parser in this issue; enabling it from `app_key_chord` requires later macOS smoke and an explicit route policy.
- `bg_key_chord_no_auth` is not routed from `app_key_chord`; enabling route selection for menu equivalents should be a separate issue with policy tests and smoke evidence.
- Final review should treat this as a scoped hunk because `macos_bg_input.rs` also contains earlier issue changes.

Next issue:

- `ISSUE-121F3 macOS Pointer Parity`

## ISSUE-121F3 macOS Pointer Parity

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Architecture-Agent and QA/Risk-Agent

Scope completed:

- Added `macos_pointer_parity_plan` as a pure policy seam for pointer button support, drag event sequencing, point interpolation, and AXPress eligibility.
- Verified right/middle click should stay on the existing `BgMouseButton::{Left, Right, Middle}` background click path rather than adding redundant button-specific wrappers.
- Fixed macOS `app_click(NodeIdx)` so AXPress is attempted only for plain left single clicks with no modifiers. Right/middle, multi-click, and modifier clicks now bypass AXPress and preserve their requested semantics through background click dispatch.
- Added PID-scoped `bg_drag` as a macOS adapter primitive using the pure drag plan. It is deliberately not connected to host/tool actions until a separate route contract and real macOS smoke exist.
- Fixed final-review P2 by requiring `click_count == 1` for AXPress eligibility and adding a pure test that rejects `click_count == 0`.
- Preserved core tool schemas, Web UI policy, Windows behavior, terminal routing, key parity routing, Chromium click route policy, and public drag exposure.
- Scope note: `desktop_host.rs` was touched only for the narrow AXPress eligibility gate after QA identified that the previous AXPress-first path could swallow right/middle and modifier click semantics.

Files changed:

- `src/apps/desktop/src/computer_use/macos_pointer_parity_plan.rs`
- `src/apps/desktop/src/computer_use/macos_bg_input.rs`
- `src/apps/desktop/src/computer_use/desktop_host.rs`
- `src/apps/desktop/src/computer_use/mod.rs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- Passed: `cargo test -p void-desktop macos_pointer_parity_plan -- --nocapture` with 5 tests.
- Passed: `cargo test -p void-desktop macos_dual_post -- --nocapture` with 4 tests.
- Passed: `cargo test -p void-desktop macos_chromium_click_plan -- --nocapture` with 6 tests.
- Passed: `cargo test -p void-desktop terminal_detect -- --nocapture` with 8 tests.
- Passed on Windows with 0 compiled tests: `cargo test -p void-desktop macos_bg_input -- --nocapture`.
- Passed: `cargo check -p void-desktop` with one pre-existing `parse_clipboard_path_segments` unused warning.
- Passed after formatting: target-file `rustfmt --edition 2024 --check`.
- Passed: `git diff --check` with only LF/CRLF working-copy warnings.
- Blocked by environment: `cargo check -p void-desktop --target aarch64-apple-darwin` failed because the `aarch64-apple-darwin` Rust target is not installed in this Windows environment.

Risk notes:

- Real macOS compile and smoke remain required because the new `bg_drag` CoreGraphics path is cfg-gated away on Windows.
- Drag is adapter-only in 121F3. Exposing it through host/tool actions requires a later issue with explicit route policy, Chromium/Electron coverage, coordinate smoke, and permission-failure handling.
- The repository worktree still contains earlier issue changes in adjacent files. Any future commit should isolate 121F3 hunks rather than stage broad dirty files.

Next issue:

- `ISSUE-122A Computer Use describe_screen Contract Inventory`

## ISSUE-121F Parent Closure Results

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator

Completed:

- Reconciled `ISSUE-121F` after confirming `ISSUE-121F1`, `ISSUE-121F2`, and `ISSUE-121F3` are Done.
- Marked the parent issue Done as documentation-only closure.
- Preserved the existing risk boundary: real macOS compile/smoke is still required, and adapter-only primitives such as `bg_drag` and no-auth key chord are not product-facing host/tool routes without later route policy.

Files changed:

- `docs/ISSUES.md`
- `docs/PROGRESS.md`
- `docs/TEST_PLAN.md`

Verification summary:

- Documentation review confirmed all three child issues are Done.
- No runtime tests were rerun for this parent closure because no source code changed in this pass.

Risk notes:

- macOS platform behavior remains gated by real macOS compile and smoke results already recorded under the child issues.
- Future commits must still isolate scoped hunks because the worktree contains many earlier issue changes.

## ISSUE-122A Computer Use `describe_screen` Contract Inventory

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Product-Agent, Architecture-Agent, and QA/Risk-Agent

Scope completed:

- Accepted `describe_screen` as a Computer Use tool-contract/core-schema inventory issue, separate from platform adapter migration.
- Recorded that 122A is docs-only and must not change core schema, runtime dispatch, `ComputerUseHost`, desktop adapters, Web UI, Windows/macOS behavior, terminal behavior, or provider gates.
- Defined the contract questions for future implementation: text-only vs multimodal schema exposure, source/scope, side-effect-free observation, output `status/source/error`, coordinate-basis policy, and unsupported-state handling.
- Rejected convenient but unsafe implementations: screenshot alias without provider gate, schema-only enum addition, platform-specific description logic in core, Web UI inference, empty output as unsupported, and broad DTO extraction.
- Split the next code slice as `ISSUE-122C Computer Use describe_screen Schema and Readonly Observation`.

Files changed:

- `docs/PRD.md`
- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- Passed: docs-only `git diff --check` scoped to consensus docs.
- Passed: `Select-String` cross-reference check for `ISSUE-122A`, `describe_screen`, `ComputerUseHost`, `schema`, `unsupported`, and `smoke`.

Risk notes:

- No product-facing `describe_screen` behavior exists yet; that is intentional for 122A.
- Future implementation must prove schema/dispatch consistency, result shape, host default behavior, and side-effect-free observation before code can be considered complete.
- Platform smoke remains required before claiming real macOS/Windows/Linux screen-description behavior.

Next issue:

- `ISSUE-122C Computer Use describe_screen Schema and Readonly Observation`

## ISSUE-122C Computer Use `describe_screen` Schema and Readonly Observation

Status: Done
Date: 2026-07-03

Completed:

- Added `describe_screen` to the `ComputerUseTool` text-only schema while keeping `screenshot` hidden from text-only models.
- Added `describe_screen` to the multimodal schema without aliasing it to `screenshot`.
- Added runtime dispatch before desktop-host enforcement so no-host/headless contexts return structured `unsupported` instead of a generic desktop-only error.
- Added readonly observation output using existing host seams: session snapshot, interaction state, and optional UI tree text.
- Added focused tests for schema exposure, dispatch, explicit unsupported result, no image bytes/attachments, and fake-host side-effect counters.

Preserved:

- No platform adapter changes.
- No Web UI changes.
- No input injection, click, drag, focus, screenshot navigation, screenshot hash, pointer-map, or action-history mutation.
- No `ComputerUseHost::describe_screen` method.
- No upstream DTO extraction or crate layout migration.

Verification:

- RED confirmed missing schema and dispatch before implementation.
- Passed `cargo test -p void-core computer_use_schema_exposes_describe_screen --lib -- --nocapture`.
- Passed `cargo test -p void-core computer_use_describe_screen --lib -- --nocapture`.
- Passed `cargo test -p void-core describe_screen_ --lib -- --nocapture`.
- Passed `cargo test -p void-core computer_use --lib -- --nocapture` with 27 tests.
- Passed `cargo check -p void-core`.
- Passed `git diff --check -- src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs` with LF/CRLF warning only.

Remaining risk:

- `describe_screen` is intentionally a lightweight core JSON observation, not a rich visual description engine.
- Real platform smoke for macOS, Windows, and Linux remains future work before claiming richer desktop screen-description behavior.
- `rustfmt --edition 2024 --check` still reports existing unrelated formatting differences in `computer_use_tool.rs`; the file was not bulk-formatted in this issue.

## ISSUE-130A Flow Chat Long-Session Performance Inventory

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Product/Architecture-Agent and QA/Risk-Agent

Completed:

- Inventoried local upstream snapshot `tmp/upstream-bitfun@c2f6a3c` for Flow Chat long-session rendering and scrolling improvements.
- Confirmed current Void lacks upstream helper/test files such as `virtualMessageListLayout.ts`, `VirtualMessageList.layout.test.ts`, `VirtualMessageList.session-boundary.test.tsx`, `historyProjectionHandoff.ts`, and `modelRoundProgressiveRender.ts`.
- Recorded that current Void must not wholesale-copy upstream Flow Chat files because local behavior protects multi-agent/subagent projection, BTW child dialogs, floating/compact chat, AI media grouping, AI short-drama canvas/services, terminal boundaries, and session restore states.
- Split the work into small follow-up issues: `ISSUE-130B` through `ISSUE-130I`.

Files changed:

- `docs/ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TEST_PLAN.md`
- `docs/PROGRESS.md`

Verification summary:

- Product/Architecture-Agent completed read-only inventory and recommended pure-helper-first migration.
- QA/Risk-Agent completed read-only test/risk review and identified RED tests required before implementation slices.
- Passed: scoped `git diff --check` for tracked consensus-doc diffs; these docs remain untracked, so explicit whitespace scan was also required.
- Passed: explicit trailing-whitespace scan across consensus docs.
- Passed: consensus-doc keyword checks for Flow Chat long-session terms and protected AI media/short-drama/terminal boundaries.

Remaining risk:

- No runtime performance improvement has been implemented yet; 130A intentionally produced only inventory and issue split.
- Real browser/desktop long-session scroll behavior is still unverified.
- Upstream E2E/perf scripts need Void branding/path compatibility review before use.

Next issue:

- `ISSUE-130B Flow Chat Model Round Progressive Render`

## ISSUE-130F2 Flow Chat History Projection Handoff Overlay UI Gate

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Risk/Architecture subagent Hume

Completed:

- Added RED component tests for session-scoped handoff overlay rendering, partial-session exclusion, and release after real target content renders.
- Wired 130F1 pure handoff helpers into `VirtualMessageList` as viewport-local state.
- Rendered the handoff overlay as a sibling of the real scroller so visible-turn measurement and imperative navigation keep using real list DOM.
- Added bounded release behavior and minimal non-interactive overlay styling.
- Updated `ISSUE-130F2` status and recorded `DEC-056`.

Verification summary:

- RED confirmed missing helper import, overlay DOM, and release behavior before implementation.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/historyProjectionHandoff.test.ts src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`.
- Passed: `pnpm run type-check:web`.

Remaining risk:

- No browser/desktop long-history visual smoke was run for overlay timing or real Virtuoso geometry.
- 130F2 does not implement upstream deferred full-history hydration, startup trace, `heightEstimates`, or `firstItemIndex`.

## ISSUE-130G2 Flow Chat Deferred Full-History Hydration Scheduling

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Kepler Risk/Architecture explorer

Completed:

- Added `ISSUE-130G2` and architecture boundaries before code changes.
- Added store-level RED tests for partial restore scheduling and active-session-change safety.
- Added a `FlowChatStore`-local in-flight scheduler for partial `restoreSessionView` results.
- Reused `restoreSessionWithTurns` for the full follow-up and applied results through `applyDeferredSessionHistoryProjection`.
- Recorded `DEC-057`.

Verification summary:

- RED confirmed missing follow-up scheduling before implementation.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/store/FlowChatStore.test.ts`.
- Passed: `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/historyProjectionHandoff.test.ts src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`.
- Passed: `pnpm run type-check:web`.

Remaining risk:

- No backend command shape or tail-limit parameter was added.
- No browser/desktop long-history smoke was run for real backend latency or perceived switch performance.

## ISSUE-1000 Post-Review Upstream Hardening and Local Commit Prep

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Upstream-Diff, Architecture-Coupling, Web-FlowChat, Build-CI-Docs, QA, and Computer-Use subagents

Completed so far:

- Re-ran multi-agent review against upstream and current working tree.
- Fixed BTW image side questions so `imageContexts` flow from `ChatInput` through `BtwThreadService`, `BtwAPI`, desktop `btw_api`, and `ConversationCoordinator`.
- Fixed `/goal budget N` so parsed `tokenBudget` reaches `runGoalManagementCommandSafely`.
- Fixed deferred full-history hydration so a same-session result can update a non-active session while checking workspace and remote identity before applying.
- Fixed initial historical static-window mount to scroll to the latest rendered tail content.
- Replaced unsafe `data-turn-id="${id}"` selector interpolation with DOM dataset matching for virtual-list lookups.
- Fixed terminal live replay gap by buffering session events even when another listener already exists.
- Restored nightly Cargo version marker, root governance scripts, CI guard steps, strict brand audit coverage for untracked files, and documented upstream-reference allowlisting.
- Fixed Web component tests to mock the FlowChat store boundary instead of importing the real async store in `ContentCanvas.test.tsx`.
- Fixed Rust stream replay test harness calls after AI adapter stream handler signature changes.
- Added a bounded default remote MCP request timeout and aligned the Streamable HTTP regression test with the currently supported POST-SSE response path.
- Reviewed Computer Use subagent warning and confirmed the named Windows tests already live under `#[cfg(all(test, target_os = "windows"))]`; no source change was needed for that item.
- Recorded `DEC-064`.

Deferred by design:

- Terminal crate/runtime-port migration remains a separate architecture gate.
- Computer Use WGC capture, Windows/macOS shortcut files, and real platform smoke remain separate platform gates.
- AI adapter path reorganization, trace/CLI credential migration, and release/Homebrew orchestration remain separate decisions.

Current verification snapshot:

- Passed: targeted Web Vitest for BTW, FlowChatStore, VirtualMessageList initial history, and TerminalService.
- Passed: strict brand residue audit.
- Passed: `git diff --check` with LF/CRLF warnings only.
- Passed: `pnpm install --frozen-lockfile`.
- Passed: i18n contract test, i18n generate check, i18n audit with one existing short-drama hardcoded-source budget warning.
- Passed: repo hygiene, core boundary check, boundary self-test, theme color audit, and theme visual contract.
- Passed: `pnpm --dir src/web-ui run test:run`, 239 files / 1412 tests.
- Passed: `pnpm run build:web`.
- Passed: `cargo metadata --no-deps --format-version 1`.
- Passed: `cargo check --workspace`.
- Passed: `cargo check -p void-desktop` with one existing `parse_clipboard_path_segments` dead-code warning.
- Passed: `cargo test -p void-core --test remote_mcp_streamable_http`.
- Passed: `cargo test --workspace` with existing warnings only.
- Passed: `pnpm run desktop:build:fast`, producing `target\debug\void-desktop.exe`.

Remaining risk:

- Upstream terminal crate/runtime-port migration, Computer Use WGC/platform smoke, AI adapter path reorganization, and release/Homebrew orchestration remain separate gates.
- Full end-user manual smoke of the AI short-drama canvas was not run in this pass.

## 2026-07-03 Selective Upgrade Wave Kickoff

Status: Done
Owner/session: main orchestrator with Product-Agent, Architecture-Agent, Issue-Agent, Risk-Agent, Implementation-Agent, Integration-Agent, QA-Agent, Refactor-Guard-Agent, Documentation-Agent, and Final-Review-Agent roles.

Goal:

- Start a new selective upgrade wave from `upstream-bitfun/main@ac16dcc18`.
- Preserve current Void-only features: multi-agent collaboration, subconversations, floating chat, AI short-drama canvas, AI media, terminal, Computer Use, and Void brand identity.
- Process upstream changes by small issues, not by direct merge.

Completed in kickoff:

- Reconfirmed current branch and upstream reference.
- Reconfirmed that the working tree contains generated version-file changes from the running desktop project.
- Added the new wave to PRD, architecture boundaries, issues, decisions, and test strategy.
- Dispatched read-only Product, Architecture, Issue, Risk, Implementation, Integration, QA, Refactor-Guard, Documentation, and Final-Review subagents before implementation.

Next:

- Resolve documentation consistency findings from Documentation-Agent and Final-Review-Agent.
- `ISSUE-1160A` has completed. Start the next issue only after a fresh Architecture Gate for that issue.

## ISSUE-1100 Upstream Incremental Inventory Refresh

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Product-Agent, Architecture-Agent, Issue-Agent, and Risk-Agent

Completed:

- Read current migration PRD, architecture, decisions, issues, test plan, and progress documents.
- Fetched and compared upstream `GCWing/BitFun` `main`; current reference is `ac16dcc18`.
- Confirmed the latest in-scope theme-governance commit is `082cee447`.
- Classified the next wave into Flow Chat, Terminal, Computer Use Windows, Image understanding/context, MCP/tool runtime, Theme/token governance, Provider/service boundary, and Core crate decomposition issues.
- Recorded subagent findings and converted them into `ISSUE-1100` through `ISSUE-1180`.

Verification:

- Docs-only diff check is required before final closeout of this turn.

Remaining risk:

- `ISSUE-1100` is inventory only. It does not implement upstream fixes.
- Working tree still contains generated version-file diffs from the running desktop project; they must not be included in an upstream-migration commit unless explicitly intended.

## ISSUE-1160A Theme Near-Color Governance Slice

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus Implementation-Agent, Integration-Agent, QA-Agent, Refactor-Guard-Agent, Documentation-Agent, and Final-Review-Agent

Completed:

- Added a Void-owned near-color decision artifact at `scripts/theme-color-near-pair-decisions.json`.
- Added `checkNearPairDecisions` to the Web theme color audit so the artifact is validated during `pnpm run check:theme-colors`.
- Added node tests for valid decisions, malformed/stale decisions, and Tabs destructive close styling token conformance.
- Replaced the Tabs close-hover raw destructive color with existing component-library red tokens.
- Preserved the agreed boundaries: no ThemeService runtime change, no theme preset rewrite, no generated widget compatibility migration, no Flow Chat, AI media, AI short-drama, terminal, Computer Use, provider, Rust, or brand changes.

Verification:

- Passed: `node --test scripts\audit-theme-colors.test.mjs`, 11 tests.
- Passed: `pnpm run check:theme-colors`.
- Passed: `pnpm run check:theme-visual-contract`.
- Passed: `node --test scripts\audit-theme-colors.test.mjs scripts\audit-cli-theme-colors.test.mjs`, 21 tests.
- Passed: `pnpm run type-check:web`.

Remaining risk:

- No browser or desktop visual smoke was run for Tabs. The style change is token-only and covered by theme governance tests.
- Generated widget payload compatibility and broader ThemeService/runtime token contracts remain separate follow-up issues.
- Generated version-file diffs from the running desktop project remain unrelated and must be excluded from any scoped commit for this issue.

## ISSUE-1110 Flow Chat History Navigation Delta Audit

Status: Done
Date: 2026-07-03
Owner/session: main orchestrator plus FlowChat-Upstream-Agent, FlowChat-Local-Agent, and FlowChat-QA-Risk-Agent

Completed:

- Compared upstream `502270994 fix(flow-chat): stabilize history turn navigation` against current local Flow Chat code and the completed `ISSUE-130*` slices.
- Confirmed local coverage is partial, not complete.
- Recorded covered behavior: explicit history states, history placeholders, base header turn navigation, session-keyed virtual list, initial history window helpers, partial-history store fields, and deferred full-history scheduling.
- Recorded missing behavior: header turn pin RAF retry until real viewport match, user-scroll cancellation of pending retry, static initial-history omitted-target pin path, tail spacer/effective-bottom behavior, and release long-session turn-navigation E2E.
- Split follow-up work into `ISSUE-1110A`, `ISSUE-1110B`, and `ISSUE-1110C`.

Verification:

- Read-only upstream diff review completed for `502270994`.
- Local marker search confirmed upstream stabilization markers are absent in current local Flow Chat files.
- Subagent reviews independently converged on the same partial-sync conclusion.
- Docs-only verification remains required before commit.

Remaining risk:

- No Flow Chat production behavior was changed in this audit.
- `ISSUE-1110A` and `ISSUE-1110B` are required before claiming local parity with upstream `502270994`.
- `ISSUE-1110C` or equivalent manual release smoke is required before claiming real long-session viewport behavior in release/desktop conditions.

## ISSUE-1110A Flow Chat Header Turn Pin Retry and User-Cancel Contract

Status: Done

Completed:

- Removed the header's optimistic pending-turn projection; the visible header turn now remains tied to `visibleTurnInfo`.
- Added a bounded RAF retry loop for accepted header turn pins so the container keeps asking `VirtualMessageList.pinTurnToTop` until the target turn is actually reported visible, the target disappears, the request is rejected, or the retry bound expires.
- Guarded retry frames with the active session id so stale retry work cannot pin a newly mounted session after a session switch.
- Kept the initial user action smooth while forcing subsequent retry frames to `behavior: 'auto'`.
- Added `VirtualMessageList.onUserScrollIntent` as the narrow cancel interface from viewport user intent back to the container.
- Added container tests for accepted-but-not-visible, retry-until-visible, and user-scroll-cancel behavior.

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/ModernFlowChatContainer.history-state.test.tsx` failed before implementation on optimistic header state, missing retry, and missing scroll-intent prop.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/ModernFlowChatContainer.history-state.test.tsx` passed after implementation.

Remaining risk:

- This issue does not solve static initial-history geometry or tail reachability; those remain in `ISSUE-1110B`.
- Release/desktop long-session evidence remains deferred to `ISSUE-1110C`.

## ISSUE-1110B1 Static Initial-History Omitted Pin Tail Spacer

Status: Done

Completed:

- Added `trailingOmittedEstimatedHeightPx` to the initial-history render-window contract.
- Changed static-window `pinTurnToTop` for omitted older turns to render a target anchored window instead of expanding the whole transcript.
- Rendered a tail spacer after the anchored target window so latest content remains reachable.
- Cleared the static anchor through the latest/end-position action so the list returns to the default latest-tail window.
- Left full-window expansion behavior intact for upward user reveal, `scrollToTurn`, and `scrollToIndex`.
- Separated the render-window key from the session-scoped expansion key so upward reveal and navigation expansion still expand all history after an anchored omitted-turn pin, even when item count changes.

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx` failed before implementation because omitted-target pin expanded all 16 items and no tail spacer existed.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts` passed after implementation.
- Regression: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx` passed.
- Regression: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts` passed.
- Type check: `pnpm run type-check:web` passed.

Remaining risk:

- `ISSUE-1110B2` is still required for upstream's effective-bottom/user-left-bottom guard around footer/input/collapse changes.
- `ISSUE-1110C` is still required for release-level long-session viewport evidence.

## ISSUE-1110B2 Static Initial-History Effective-Bottom and User-Left-Bottom Guard

Status: Done

Completed:

- Added static-window user-left-bottom tracking based on the effective bottom position.
- Changed static initial-history auto-bottom to use effective bottom (`scrollHeight - clientHeight - bottom reservation`) instead of physical bottom.
- Preserved the user's non-bottom scroll position across static-window item-count/layout key changes.
- Preserved the user's non-bottom scroll position across footer/input height-only changes.
- Kept explicit omitted-turn anchor/pin behavior from `ISSUE-1110B1` intact.

Verification:

- RED: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx` failed before implementation because appending a static-window item after user scroll forced `scrollTop` back to the new bottom.
- GREEN: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx` passed after implementation.
- Added regression coverage for footer/input height-only changes and omitted-turn pin after user-left-bottom.
- Regression: `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/historyProjectionHandoff.test.ts` passed.
- Type check: `pnpm run type-check:web` passed.

Remaining risk:

- `ISSUE-1110C` is still required for release-level long-session viewport evidence in desktop/release conditions.

## ISSUE-1110C Release Long-Session Turn Navigation E2E

Status: Done

Completed:

- Added a Void-owned release-compatible WDIO spec at `tests/e2e/specs/l1-chat-turn-navigation-release.spec.ts`.
- Kept the test outside the default L1 aggregate because it depends on a persisted long-session fixture.
- Required fixture env is explicit: `E2E_TEST_WORKSPACE`, `VOID_E2E_TURN_NAV_SESSION_TITLE`, and `VOID_E2E_TURN_NAV_TARGET_TITLE`; `VOID_E2E_TURN_NAV_TARGET_TURN_ID` is optional.
- The spec selects an older turn through the Flow Chat header turn list and verifies the real message viewport moves the target user turn near the scroller top.
- It uses current Void DOM contracts and avoids BitFun env names, BitFun session id defaults, and Vite-only source imports.

Verification:

- `pnpm --dir tests/e2e exec tsc --noEmit` failed on the existing E2E type environment because `@wdio/globals/types` cannot be resolved from `tests/e2e/tsconfig.json`.
- `pnpm --dir tests/e2e exec wdio run ./config/wdio.conf.ts --spec "./specs/l1-chat-turn-navigation-release.spec.ts" --help` passed.
- `pnpm --dir tests/e2e exec wdio run ./config/wdio.conf.ts --spec "./specs/l1-chat-turn-navigation-release.spec.ts" --dry-run` passed with 1 skipped test. The runner started the debug desktop app, loaded the spec, and followed the intended skip path because fixture env was not provided.

Remaining risk:

- No full persisted long-session fixture run was performed, so this issue adds release-level coverage but does not by itself prove a real fixture session passes on this machine.
- Current session nav and turn list items still lack stable `data-testid`/id attributes; the spec uses visible titles to avoid production changes in this slice.
- The next selective-upstream candidate is `ISSUE-1120 Terminal Replay and Input Reliability Delta Audit`.

## ISSUE-1120 Terminal Replay and Input Reliability Delta Audit

Status: Done

Completed:

- Refreshed `upstream-bitfun/main` to `65da1a082`.
- Reviewed upstream terminal reliability commits: paste policy (`00ee4622b`), resize/replay stabilization (`8fdd0828c`, `73c417c71`), output copy/scroll polish (`a68cf1603`), and recent runtime-port/exec ownership commits (`4077c1a8a`, `98f0f4113`, `bceded210`).
- Confirmed current Void already carries the low-risk terminal reliability primitives: structured replay events, legacy flat replay fallback, resize repaint guard, terminal paste policy, PowerShell PSReadLine Ctrl+V delegation, terminal input write queue, lazy terminal output renderer tests, and focused utility tests.
- Classified upstream runtime-port/service-decomposition as architecture-scale and unsafe to copy directly into this branch.
- Split remaining work into `ISSUE-1120A` for terminal API result/source/error contract hardening, `ISSUE-1120B` for a runtime-port boundary study, `ISSUE-1120C` for Web terminal input/lazy-renderer delta, and `ISSUE-1120D` for lifecycle/ack/history integration tests.
- Preserved protected surfaces: Flow Chat store, multi-agent/subagent projection, BTW child sessions, floating chat, AI media, AI short-drama, Computer Use, provider, and Rust crate layout were not changed.

Verification:

- `git fetch https://github.com/GCWing/BitFun.git main:refs/remotes/upstream-bitfun/main` passed.
- Upstream terminal commit search passed and identified the relevant commits above.
- Local file/test inspection confirmed existing terminal replay, paste, resize guard, and input queue tests.
- QA/Risk subagent produced the test matrix and coupling prohibitions for follow-up implementation.

Remaining risk:

- No production terminal test was run in this docs-only audit because no terminal behavior changed.
- Desktop terminal Tauri commands still stringify local/remote write/resize/session errors; whether to introduce explicit DTOs is deferred to `ISSUE-1120A`.
- Runtime-port migration remains deferred to `ISSUE-1120B`; direct upstream crate movement is still prohibited.
- Upstream IME/key rollover and lazy renderer ref/fallback differences require a separate `ISSUE-1120C` comparison before any Web terminal patch.
- Natural PTY exit, frontend flow-control ack, remote empty history, and backend-to-frontend replay integration evidence remain open in `ISSUE-1120D`.
- The next selective-upstream candidate is `ISSUE-1130 Computer Use Windows WGC and HWND Safety Audit`.

## ISSUE-1120A Terminal API Result Shape and Error Source Contract

Status: Done

Completed:

- Added a terminal service boundary error type, `TerminalCommandError`, with `status`, `operation`, `source`, `code`, and `rawMessage`.
- Added `classifyTerminalCommandError` so `TerminalService.write`, `TerminalService.resize`, and `TerminalService.getHistory` normalize backend `String`/`Error` failures before rethrowing.
- Covered local `Session not found`, `Remote terminal manager not available`, `Terminal API not initialized`, and generic operation failures.
- Kept `TerminalInputQueue` as a batching-only layer; it still receives ordinary Promise failures and does not infer source/status.
- Deferred backend Tauri command DTO conversion to avoid broad changes to existing `Result<_, String>` command callers.
- Preserved protected surfaces: terminal UI components, Flow Chat tool cards, AI media, AI short-drama, Computer Use, provider, Rust terminal crates, runtime-port ownership, and crate layout were not changed.

Verification:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts` passed: 2 files, 12 tests.
- `pnpm --dir src/web-ui run type-check` passed.
- Subagents reviewed desktop terminal API string error sources, Web terminal service boundaries, and queue ownership.

Remaining risk:

- Desktop Tauri commands still return `Result<_, String>`; full backend DTO conversion remains deferred.
- Remote `terminal_get_history` still returns empty history for known remote sessions and falls back to local lookup for unknown sessions; richer remote status/source is deferred to `ISSUE-1120D`.
- Runtime-port migration remains deferred to `ISSUE-1120B`.

## ISSUE-1130 Computer Use Windows WGC and HWND Safety Audit

Status: Done

Completed:

- Reviewed upstream Computer Use platform/capture commits from `acf0cdb03`, `63a7b8160`, `918894f10`, `4a88374fc`, and `aab1032da`.
- Mapped upstream WGC work to current local ownership: local `src/apps/desktop/src/computer_use/windows_capture.rs` still has a `screenshot_window_via_wgc` stub, while upstream adds a real `windows_wgc_capture.rs` D3D11/WinRT frame-pool adapter.
- Mapped HWND lifetime work: local `desktop_host.rs` already uses raw `isize` HWND handoff and PID revalidation in several Windows paths, including cached HWND validation tests, but full parity is not proven for every async path.
- Mapped pointer/background-input work: local Windows input returns explicit `WindowsInputOutcome { status, path, delivery_uncertain, warning }`, and local host exposes `mouse_move_global_f64`; DPI/multi-monitor precision still needs Windows proof.
- Confirmed local text-only Computer Use already has read-only `describe_screen`, prompt/schema image-removal behavior, and screenshot-bound `PointerMap` flows; those should be protected during Windows platform work.
- Split follow-up work into `ISSUE-1130A` WGC implementation gate, `ISSUE-1130B` HWND lifetime/revalidation audit, `ISSUE-1130C` pointer coordinate/background-input tests, and `ISSUE-1130D` Windows capability gating/settings links.
- Preserved protected surfaces: Flow Chat, multi-agent/subagent, BTW, floating chat, AI media, AI short-drama, terminal, provider, and Web UI were not changed.

Verification:

- Upstream merge/file diff inspection completed for Computer Use platform/capture commits.
- Local Windows capture/background input/desktop host files were inspected for WGC stub, raw HWND patterns, pointer movement, and input result status.
- Subagent reviews were launched for upstream, local, and QA/risk perspectives.

Remaining risk:

- No Windows platform build or capture smoke was run in this docs-only audit.
- WGC is not implemented locally and must not be claimed fixed until `ISSUE-1130A` lands with Windows evidence.
- HWND raw/revalidation is partially present but still requires full-path audit in `ISSUE-1130B`.
- Pointer precision and background input semantics require real Windows DPI/multi-monitor/UIPI testing in `ISSUE-1130C`.
- Windows settings deep links and visual-grid capability gating remain separate from capture/input unsafe work in `ISSUE-1130D`.
- The next selective-upstream candidate is `ISSUE-1140 Image Understanding and Image Context Completion Audit`.

## ISSUE-1140 Image Understanding and Image Context Completion Audit

Status: Done

Completed:

- Reviewed upstream image-related commits `cf94e2f90`, `c2f6a3c91`, and `912111f6e`.
- Compared upstream `analyze_image`, `view_image`, context upload, image-understanding model config, and `/btw` image side-question flow against current Void.
- Confirmed current Void already owns a stronger `AnalyzeImage` contract with `image_id` / `image_path` / `data_url`, workspace path containment, explicit statuses, image-analysis helpers, and tool runtime registration.
- Confirmed local `/btw` initial side-question path supports image payloads, while transient child-session follow-up still rejects image attachments in `MessageModule.ts`.
- Confirmed AI media tools use image-context references for `GenerateImage` / `GenerateVideo`, and AI short-drama flows protect raw media through project/tool policy rather than generic image understanding.
- Split follow-up work into `ISSUE-1140A` status/data-url guard, `ISSUE-1140B` BTW child-session image completion, `ISSUE-1140C` image-context/media path leak tests, `ISSUE-1140D` Void `ViewImage` contract gate, and `ISSUE-1140E` short-drama image-summary bridge.
- Preserved protected surfaces: no production code, UI component, provider adapter, media service, short-drama service, Flow Chat runtime, or tool schema was changed in this audit.

Verification:

- Upstream commit/file diff inspection completed for image understanding, `view_image`, and BTW image side-question commits.
- Local code inspection covered `AnalyzeImage`, image-analysis helpers, image context store, desktop image payload refill, BTW API/service flow, media image reference resolution, provider tool image attachments, and short-drama media policy.
- Subagent QA reported the current targeted checks passed: `cargo test -p void-core analyze_image --lib`, `cargo test -p void-tool-packs`, and `pnpm --dir src/web-ui run test:run src/flow_chat/utils/imageContextForBackend.test.ts src/flow_chat/services/BtwThreadService.test.ts src/flow_chat/components/btw/BtwSessionPanel.review-action.test.tsx`.

Remaining risk:

- Main session did not rerun the targeted checks after this docs-only update; no production behavior changed.
- `permission_denied` and `data_url` guard semantics still need explicit implementation/testing in `ISSUE-1140A`.
- `/btw` child-session second-turn images are still incomplete until `ISSUE-1140B`.
- Image context global lookup collisions and local path leak guards remain open in `ISSUE-1140C`.
- `ViewImage` and short-drama image-summary integration remain gated behind `ISSUE-1140D` and `ISSUE-1140E`.
- The next selective-upstream candidate is `ISSUE-1150 MCP and Tool Runtime Reliability Delta Audit`.

## ISSUE-1150 MCP and Tool Runtime Reliability Delta Audit

Status: Done

Completed:

- Reviewed upstream MCP/tool-runtime commits including `d77093204`, `7dec5f489`, `8d69e5733`, `5df255a1a`, `cdfdd716d`, `4077c1a8a`, `d6b783967`, `29c78cfb9`, `8a7a54698`, and `65da1a082`.
- Confirmed current Void already has Streamable HTTP remote MCP with bounded 120s request timeout, POST-SSE regression coverage, explicit MCP dynamic provider metadata, GetToolSpec collapsed-tool contracts, readonly-enabled filtering, runtime restrictions, and shared oversized-result policy.
- Confirmed gaps: MCP adapter still has an adapter-level 12k text truncation before shared storage; local stdio ordinary MCP requests lack a clear bounded timeout contract; elicitation still advertises schema validation; tool results do not yet share a uniform `status/source/error` envelope; approval/rejection categories are still mixed across strings and pipeline states.
- Split follow-up work into `ISSUE-1150A` MCP large-output storage alignment, `ISSUE-1150B` elicitation legacy compatibility, `ISSUE-1150C` MCP request timeout contract, `ISSUE-1150D` readonly/dynamic provider metadata contract, `ISSUE-1150E` typed approval/rejection outcomes, and `ISSUE-1150F` tool-runtime owner migration planning gate.
- Preserved protected surfaces: no production code, MCP adapter, tool pipeline, Web UI, provider adapter, AI media, AI short-drama, Flow Chat runtime, or crate layout was changed in this audit.

Verification:

- Upstream commit/file inspection completed for MCP large output, elicitation compatibility, tool approvals, GetToolSpec tightening, MCP runtime owner migration, ExecCommand/tool-runtime migration, bridge contracts, and event/tool ABI work.
- Local code inspection covered remote MCP transport, POST-SSE tests, MCP dynamic tool metadata, `void-agent-tools` contracts, product runtime manifest/GetToolSpec, shared tool-result storage, tool pipeline approval/rejection, runtime restrictions, and desktop/Web MCP boundary notes.
- No production tests were run in the main session because this was a docs-only audit.

Remaining risk:

- MCP adapter large output, elicitation capability compatibility, local stdio timeout, typed result envelopes, and readonly/provider metadata tests remain follow-up work.
- Review readonly, multi-agent, AI media, AI short-drama, and Flow Chat must only consume MCP/tool-runtime facts through typed contracts, not MCP-specific UI or page logic.
- Runtime owner migrations remain deferred behind `ISSUE-1150F`.
- The next selective-upstream candidate is `ISSUE-1160 Theme Token Governance Incremental Upgrade`.

## ISSUE-1160 Theme Token Governance Incremental Upgrade

Status: Done

Completed:

- Reviewed upstream theme-governance commits including `082cee447`, `958a06095`, `797c94ad1`, `cae512b9f`, `50d33d506`, and `4e8c9c897`.
- Confirmed `ISSUE-1160A` already shipped the first safe slice: near-pair decision artifact, audit validation, Tabs close-hover token conformance, and theme governance checks.
- Confirmed local theme governance already includes `check:theme-colors`, `check:theme-visual-contract`, `scripts/theme-visual-governance-contract.json`, `scripts/validate-theme-visual-contract.mjs`, and near-pair decisions.
- Confirmed gaps: no runtime CSS variable contract file, no ThemeService dynamic-token whitelist, no generated-widget payload compatibility contract, visual governance evidence is mostly declarative, and AI media/short-drama still need token-boundary cleanup.
- Split follow-up work into `ISSUE-1160B` CSS var runtime contract, `ISSUE-1160C` ThemeService runtime token whitelist, `ISSUE-1160D` generated-widget payload compatibility contract, `ISSUE-1160E` visual-governance evidence contract, and `ISSUE-1160F` AI media/short-drama token boundary.
- Preserved protected surfaces: no production code, ThemeService, tokens, widget payload, Flow Chat, AI media, AI short-drama, terminal, provider, MCP, Rust crates, or brand assets were changed in this audit.

Verification:

- Upstream commit/file inspection completed for theme audit, runtime token contract, visual governance contract, widget payload compatibility, Tabs/token cleanup, and broad color baseline compression.
- Local code inspection covered theme audit scripts, near-pair decisions, visual governance contract, ThemeService, component-library tokens, generated widget theme payload, and media/short-drama theme-sensitive surfaces.
- Subagents reported current theme checks passed, including `pnpm run check:theme-colors`, `pnpm run check:theme-visual-contract`, focused ThemeService tests, and focused Flow Chat/media/short-drama regression tests.

Remaining risk:

- Main session did not rerun the broader theme/Flow Chat/media/short-drama tests after this docs-only update; no production behavior changed.
- Current theme audit baselines still allow historical color debt; passing audits mean no growth, not complete visual quality.
- Theme visual contract is a coverage checklist, not screenshot or contrast proof.
- The next selective-upstream candidate is `ISSUE-1170 Provider Service Boundary Study`.

## ISSUE-1170 Provider Service Boundary Study

Status: Done

Completed:

- Reviewed upstream provider/service boundary commits including `96cea08ca`, `629ced40a`, `47b5d6c94`, `a29bd63d2`, `4077c1a8a`, `545e81e23`, `01e067e97`, `314116874`, `94ed21559`, `d8ee47156`, `adaff67e7`, and `687ac8a51`.
- Confirmed upstream provider/service work is mostly architecture owner migration: HTTP, runtime, platform, IM bot, and exec/tool owners move into services crates behind boundary rules.
- Confirmed current Void already has `void-ai-adapters` as the provider HTTP/SSE, request/response mapping, stream parsing, tool-call aggregation, model discovery, and health-check owner.
- Confirmed local provider boundary gaps: provider id vs wire format are mixed, URL derivation is repeated, provider catalogs are duplicated, provider quirks still use URL/model string matching, and adapter transport retry must remain separate from core business retry.
- Split follow-up work into `ISSUE-1170A` provider HTTP boundary static audit, `ISSUE-1170B` AI connection-test error classification, `ISSUE-1170C` OpenAI content-part array parser regression, `ISSUE-1170D` SSE handler cancellation contract, and `ISSUE-1170E` image-understanding capability reconcile.
- Preserved protected surfaces: no production code, provider adapter, Web UI config, core config, stream handler, runtime behavior, crate layout, Flow Chat, multi-agent/subagent, AI media, AI short-drama, terminal, MCP, or Computer Use files were changed in this audit.

Verification:

- Upstream commit/file inspection completed for provider HTTP owners, local runtime providers, platform providers, IM bot providers, exec-command policy, shared AI adapter extraction, provider grouping, connection testing, stream handler cancellation, OpenAI content-part parsing, and image-understanding capability reconcile.
- Local code inspection covered `void-ai-adapters`, core AI config mapping/client factory, Web UI provider catalog/model config, stream consumption, existing adapter/agent-stream tests, and provider error presentation tests.
- Three subagents independently reviewed upstream deltas, local provider boundaries, and QA/risk coverage.
- No production tests were run in the main session because this was a docs-only audit.

Remaining risk:

- Static review did not exercise real user provider configuration migrations.
- Provider id vs wire format ambiguity remains until a future compatibility-first issue addresses it.
- URL derivation, duplicated catalogs, adapter quirks, and retry boundary tests remain open follow-up work.
- Upstream owner migrations remain deferred; direct crate layout synchronization is still forbidden.
- The next selective-upstream candidate is `ISSUE-1180 Core Crate Decomposition Deferred Plan`.

## ISSUE-1180 Core Crate Decomposition Deferred Plan

Status: Done

Completed:

- Reviewed upstream crate-decomposition and owner-migration commits including `fb8333afa`, `ea5321d66`, `401b9e61a`, `8338441c`, `213299206`, `a7fc6dcd1`, `98f0f4113`, `bceded210`, `8d69e5733`, `96cea08ca`, `47b5d6c94`, and `a29bd63d2`.
- Confirmed upstream's most useful idea is staged ownership: product assembly/service contracts first, boundary checks second, concrete owner migration only after focused evidence.
- Explicitly deferred upstream six-layer physical layout and concrete owner migrations because current Void already has protected local multi-agent, subdialog, floating chat, AI media, AI short-drama, terminal, Computer Use, MCP, provider, desktop, CLI, ACP, and installer behavior.
- Confirmed current Void already has meaningful crate guardrails in `scripts/check-core-boundaries.mjs`: no owner crate may depend back on `void-core`, lightweight crates reject heavy deps, product entrypoints must use `product-full`, feature groups stay default-light, and legacy facades are checked.
- Confirmed blockers: `void-core` still owns full runtime assembly, service/agent coupling needs ports, concrete tool and MiniApp runtime owners remain in core, and static dependency checks do not prove behavior equivalence.
- Split follow-up work into `ISSUE-1180A` conceptual layer mapping, `ISSUE-1180B` product assembly contract spike, `ISSUE-1180C` runtime-services gap audit, `ISSUE-1180D` high-risk migration registry, and `ISSUE-1180E` product-full guardrail audit.
- Preserved protected surfaces: no Cargo manifests, crate directories, module names, production code, boundary script behavior, or product runtime files were changed.

Verification:

- Upstream commit/file inspection completed for six-layer layout, product assembly contract, services runtime owner migration, product SDK assembly boundary, terminal/remote exec runtime ports, MCP runtime owner movement, provider HTTP owner movement, platform providers, and IM bot providers.
- Local code inspection covered current crate list, `Cargo.toml`, `docs/architecture/core-decomposition.md`, `docs/plans/core-decomposition-plan.md`, `scripts/check-core-boundaries.mjs`, and crate-level AGENTS/README ownership notes.
- Three subagents independently reviewed upstream architecture, local crate boundaries, and QA/risk verification.
- No production tests were run in the main session because this was a docs-only audit.

Remaining risk:

- Current static checks prove dependency/anchor constraints, not runtime behavior equivalence.
- Future physical crate moves still require Cargo graph baselines, product-entrypoint checks, focused owner-crate tests, and protected-surface regression tests.
- SDK/minimal runtime profile remains a product decision, not an implementation target.
- The selective-upstream audit wave is now complete through the listed P0-P3 priority inventory; implementation should continue from the proposed follow-up issues one at a time.

## ISSUE-1120C Web Terminal Input and Lazy Renderer Delta

Status: Done

Completed:

- Compared upstream `b8197bbb7` terminal input reliability against current Void and confirmed local Void already had `TerminalInputQueue` integration, paste policy, replay, resize guard, and lazy fallback coverage.
- Added `terminalImeInputSafetyNet` as the Web terminal utility boundary for IME/key rollover handling: `keyCode === 229` bypass, composed `insertText` forwarding, keypress de-duplication, and keyup reset.
- Wired `Terminal.tsx` to the utility through xterm custom key handling and the helper textarea input listener, leaving paste behavior, input queueing, replay, resize, Flow Chat, AI media, AI short-drama, Computer Use, runtime ports, and Rust terminal crates unchanged.
- Classified upstream `970c33844` lazy renderer `forwardRef` as intentionally deferred because current Void call sites do not need an imperative renderer ref; existing fallback semantics remain unchanged.
- Updated `docs/ARCHITECTURE.md`, `docs/ISSUES.md`, `docs/DECISIONS.md`, and `docs/TEST_PLAN.md`.

Verification:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalImeInputSafetyNet.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed, 7 test files / 33 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed.

Remaining risk:

- No manual/browser IME smoke was run in this session.
- Lazy renderer `forwardRef` stays deferred until a real Void consumer needs it.
- Generated version-file diffs from the running desktop project remain unrelated and must be excluded from the scoped commit.

## ISSUE-1120D Terminal Lifecycle, Ack, and History Integration Tests

Status: Active

Completed in this slice:

- Ran parallel read-only subagent review for backend terminal lifecycle/history and frontend terminal ack/replay ordering.
- Confirmed frontend `TerminalService.acknowledge()` exists but is not called by output consumption paths; ack integration remains deferred rather than silently assumed.
- Added [useTerminal.test.tsx](D:/codex/void-source/src/web-ui/src/tools/terminal/hooks/useTerminal.test.tsx) to cover structured history replay before live output queued during replay.
- Updated architecture and decision docs to keep replay/live ordering owned by the `useTerminal` hook boundary.

Verification:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/hooks/useTerminal.test.tsx src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed, 4 test files / 13 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed.

Remaining risk:

- Backend natural PTY exit/EOF/child completion still lacks Rust coverage and likely needs a separate RED/GREEN slice.
- Remote `terminal_get_history` empty events still lack explicit `status/source` distinction from local empty history.
- Backend `terminal_ack` flow-control semantics remain unconnected to frontend output consumption.
- Generated version-file diffs from the running desktop project remain unrelated and must be excluded from scoped commits.
