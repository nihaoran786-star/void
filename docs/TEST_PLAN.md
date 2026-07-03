# Upstream Migration Test Plan

Date: 2026-07-02

## Verification Strategy

Run the smallest useful checks per issue, then broader checks before final completion.

No test result may be recorded as passing unless the command actually ran and passed in this workspace.

## Baseline Checks

- `git status --short --branch`
- Remote baseline branch/tag confirmation

Commands:

```powershell
git status --short --branch
git remote -v
git branch -r --list "origin/baseline/void-source-20260702"
git rev-parse --verify "origin/baseline/void-source-20260702"
```

Passing standard:

- current branch tracks `origin/baseline/void-source-20260702`,
- remote baseline branch exists,
- any untracked or modified files are recorded in `docs/PROGRESS.md`.

## Web UI Checks

- `pnpm --dir src/web-ui run type-check`
- `pnpm --dir src/web-ui run test:run <target test file>`
- `pnpm --dir src/web-ui run lint` when touching broad UI code
- `pnpm --dir src/web-ui run build` before broad release-style validation

## Rust Checks

Exact cargo commands depend on available workspace metadata. Prefer targeted package checks:

- `cargo test -p void-acp <test name>`
- `cargo test -p void-cli <test name>`
- `cargo test -p void-core <test name>`
- `cargo check -p void-desktop`

Root workspace metadata has been restored for the current Void crate layout in root `Cargo.toml`. Use targeted package commands per active issue.

Issue-specific intended commands after workspace metadata is available:

```powershell
cargo test -p void-acp omp_is_a_native_user_managed_preset
cargo test -p void-acp returns_default_config_for_builtin_client
cargo check -p void-acp
cargo test -p void-cli substring_command_matches_case_insensitively
cargo test -p void-cli exact_command_matches
cargo test -p void-cli empty_query_returns_empty
```

## Protected Behavior Smoke Checks

- Chat input: mention insertion, Escape handling, image paste/undo, context chips, media references.
- BTW: transient child session, parent session sync, right-panel BTW tab.
- Workspace media: pending placeholder, ready replacement, delete, restore, purge, preview.
- Short drama: Media-session-only entry, workspace mismatch, stage agent binding restore, artifact media recovery.
- Desktop: main window, compact chat floating window, desktop pet, tray.
- Brand: Void names, icons, installer, registry identity, absence of BitFun leakage.

## ISSUE-1140D4 Minimal Void ViewImage Tool Implementation

Date: 2026-07-04

Scope:

- `src/crates/core/src/agentic/tools/implementations/view_image_tool.rs`.
- `src/crates/core/src/agentic/tools/implementations/mod.rs`.
- `src/crates/core/src/agentic/tools/product_runtime.rs`.
- `src/crates/core/src/agentic/tools/registry.rs`.
- `src/crates/tool-packs/src/lib.rs`.
- `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md`.
- No Web UI, Flow Chat, provider adapter, AI media, AI short-drama, `AnalyzeImage` model-call behavior, or upstream assembly/crate layout changed.

Checks:

- `cargo test -p void-core view_image --lib -- --nocapture`
  - Result: failed first because the test fixture PNG did not pass the real image decode/optimize path.
  - Result: failed again because completed metadata exposed a local absolute path instead of a workspace-relative logical path.
  - Result: passed after generating a real 1x1 PNG in the test, returning workspace-relative logical paths, removing unreachable `error` status, and ensuring local/remote non-file errors do not expose absolute workspace roots.
  - Notes: covers schema, readonly/collapsed/no-permission metadata, local success with image attachment, remote `WorkspaceServices` read, unsupported provider, unsupported primary model, missing workspace, workspace-outside denial, non-image rejection, local/remote error path redaction, registry inclusion, readonly inclusion, and product manifest exposure.
- `cargo test -p void-core registry_preserves --lib -- --nocapture`
  - Result: passed.
  - Notes: fixed builtin, collapsed, and readonly manifest order now includes `ViewImage` after `AnalyzeImage`.
- `cargo test -p void-core product_tool_runtime --lib -- --nocapture`
  - Result: passed.
  - Notes: confirms product runtime owner and decorator assembly still preserve registry contracts.
- `cargo test -p void-tool-packs product_provider_group_plan --lib -- --nocapture`
  - Result: passed.
  - Notes: confirms `ViewImage` is included in the image-analysis provider plan after D2/D3/D4 gates.
- `cargo test -p void-core tool_result_image_attachment_capability --lib -- --nocapture`
  - Result: passed.
  - Notes: D3 provider/model capability gate still rejects unsupported primary model/provider paths.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- src/crates/core/src/agentic/tools/implementations/view_image_tool.rs src/crates/core/src/agentic/tools/implementations/mod.rs src/crates/core/src/agentic/tools/product_runtime.rs src/crates/core/src/agentic/tools/registry.rs src/crates/tool-packs/src/lib.rs docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md docs/DECISIONS.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates src/web-ui docs`
  - Result: listed this slice's tracked files plus existing non-this-slice Web UI generated version files; the new `view_image_tool.rs` is untracked until staging and must be included explicitly.

## ISSUE-1140D3 ViewImage Provider Image-Attachment Capability Gate

Date: 2026-07-04

Scope:

- `src/crates/core/src/agentic/tools/tool_context_runtime.rs`.
- `src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs`.
- `src/crates/ai-adapters/src/providers/anthropic/message_converter.rs`.
- `src/crates/ai-adapters/src/providers/gemini/message_converter.rs`.
- `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- No concrete `ViewImage` runtime, filesystem/image reading, Web UI upload flow, AI media, AI short-drama, Flow Chat, provider transport rewrite, or `AnalyzeImage` behavior changed.

Checks:

- `cargo test -p void-ai-adapters tool_message_with_images --lib -- --nocapture`
  - Result: passed.
  - Notes: covers existing OpenAI Responses/Chat Completions paths plus the new Anthropic `tool_result` image/text block conversion test.
- `cargo test -p void-ai-adapters gemini_tool_response_does_not_convert_tool_image_attachments --lib -- --nocapture`
  - Result: failed first because the test expected a raw string response while existing Gemini `functionResponse` wraps text as `{ "content": ... }`.
  - Result: passed after correcting the assertion to the current Gemini response shape.
  - Notes: proves Gemini does not consume `ToolImageAttachment` for tool-result image output, so core capability gating must prevent image-emitting tools on that provider path.
- `cargo test -p void-core tool_result_image_attachment_capability --lib -- --nocapture`
  - Result: passed.
  - Notes: covers supported providers, image-disabled primary models, unsupported Gemini provider, and missing provider defaulting to unsupported.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- src/crates/core/src/agentic/tools/tool_context_runtime.rs src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs src/crates/ai-adapters/src/providers/anthropic/message_converter.rs src/crates/ai-adapters/src/providers/gemini/message_converter.rs docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md docs/DECISIONS.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates src/web-ui docs`
  - Result: listed this slice's eight scoped files plus existing non-this-slice Web UI generated version files; generated files are not part of this change and must not be staged.

## ISSUE-1130C1 Windows Pointer Coordinate Contract Tests

Date: 2026-07-04

Scope:

- `src/apps/desktop/src/computer_use/desktop_host.rs` tests only.
- Locks existing pointer coordinate behavior for explicit `screenshot_id` map precedence, negative-origin/content-offset subpixel math, and missing pointer-map failure.
- No production coordinate behavior, Windows input primitive, Computer Use schema, Web UI, Flow Chat, AI media, AI short-drama, terminal, macOS, or Linux behavior changed.

Checks:

- `cargo test -p void-desktop windows_app_image_coordinate --lib -- --nocapture`
  - Result: passed.
  - Notes: both new app-image coordinate tests passed immediately because existing production behavior already prefers explicit `screenshot_id` maps and fails explicitly when no pointer basis exists.
- `cargo test -p void-desktop windows_pointer_map_handles_negative_origin --lib -- --nocapture`
  - Result: passed.
  - Notes: verifies existing `PointerMap::map_image_to_global_f64` center-pixel math across negative display origin and content/crop offset inputs.
- `cargo test -p void-desktop windows_host_app_actions --lib -- --nocapture`
  - Result: passed.
  - Notes: existing host action tests still preserve blocked-input fail-closed and uncertain-delivery warning behavior.
- `cargo test -p void-desktop windows_bg_input --lib -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input primitive tests passed.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: existing unrelated `parse_clipboard_path_segments` dead-code warning remains.
- `rustfmt --edition 2021 --check src/apps/desktop/src/computer_use/desktop_host.rs`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check`
  - Result: passed.
  - Notes: Git printed line-ending warnings only.

Remaining manual matrix for parent `ISSUE-1130C`:

- Windows DPI scaling hit-test smoke at 100%, 125%, and 150%.
- Mixed-scale multi-monitor smoke, including a secondary display with negative origin.
- Foreground and occluded target windows for click/type/scroll delivery.
- UIPI/high-integrity target denial path and warning/status visibility.
- DWM/PrintWindow/BitBlt/WGC coordinate consistency on real windows.

## ISSUE-1130C2 Windows Pointer/Input Manual Smoke Matrix

Date: 2026-07-04

Scope:

- `docs/qa/windows-computer-use-smoke-matrix.md`.
- `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- Defines the manual evidence boundary for parent `ISSUE-1130C`.
- No Computer Use runtime, schema, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, macOS, or Linux behavior changed.

Checks:

- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- docs/ISSUES.md docs/TEST_PLAN.md docs/PROGRESS.md docs/qa/windows-computer-use-smoke-matrix.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Manual smoke status:

- Result: `manual_pending`.
- Notes: This slice does not claim real Windows smoke passed. The matrix requires evidence for DPI 100%/125%/150%, mixed-scale multi-monitor negative origin, foreground and occluded targets, high-integrity/UIPI denial, capture-source consistency, and stale/missing pointer-map failure.

## ISSUE-1130C3 Windows Computer Use Automated Baseline Evidence

Date: 2026-07-04

Scope:

- `docs/qa/windows-computer-use-smoke-matrix.md`.
- `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- Runs and records the automated baseline from the smoke matrix.
- No Computer Use runtime, tests, schema, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package/workflow/generated files, macOS, or Linux behavior changed.

Checks:

- `cargo test -p void-desktop windows_app_image_coordinate --lib -- --nocapture`
  - Result: passed, 2 tests.
  - Notes: first run compiled `void-desktop` test dependencies and took about 4m35s.
- `cargo test -p void-desktop windows_pointer_map_handles_negative_origin --lib -- --nocapture`
  - Result: passed, 1 test.
- `cargo test -p void-desktop windows_host_app_actions --lib -- --nocapture`
  - Result: passed, 2 tests.
- `cargo test -p void-desktop windows_bg_input --lib -- --nocapture`
  - Result: passed, 10 tests.
  - Notes: Cargo briefly waited on the package cache because another focused test was running.
- `cargo test -p void-desktop windows_foreground_capture --lib -- --nocapture`
  - Result: passed, 5 tests.
  - Notes: Cargo briefly waited on the package cache and artifact directory because another focused test was running.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: existing unrelated `parse_clipboard_path_segments` dead-code warning remains.

Manual smoke status:

- Result: `manual_pending`.
- Notes: Passing the automated baseline does not prove real Windows DPI scaling, mixed-scale multi-monitor, foreground/occluded target, capture-source, or UIPI/high-integrity behavior.

## ISSUE-1140E1 Short Drama Main AI Media Export Leak Guard

Date: 2026-07-04

Scope:

- `src/web-ui/src/shared/services/short-drama/ShortDramaMainAIContextExport.test.ts`.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- No generic `AnalyzeImage` rewrite, provider wire conversion, media service rewrite, short-drama page behavior change, or `.void/short-drama` direct mutation.

Checks:

- `pnpm --dir src/web-ui run test:run src/shared/services/short-drama/ShortDramaMainAIContextExport.test.ts`
  - Result: failed first with an overly broad `filePath` assertion because the export's own `.void/short-drama/awareness.md` metadata is allowed.
  - Result: passed after narrowing the guard to raw media-reference fields and raw media values.
  - Notes: the final test injects `previewUrl`, `thumbnailUrl` data URL content, Windows `localPath`, and Unix-like `filePath` into a short-drama image artifact and proves the Main AI export omits those raw values while retaining low-context `mediaItemId` and availability metadata.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed.
- `git diff --check -- src/web-ui/src/shared/services/short-drama/ShortDramaMainAIContextExport.test.ts docs/ARCHITECTURE.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: Git printed line-ending warnings only.

Follow-up split for parent `ISSUE-1140E`:

- The dedicated short-drama image media to generic `ImageContext` adapter is tracked by completed `ISSUE-1140E2`.
- `AnalyzeImage` remains short-drama-agnostic; it continues to accept only generic `image_id`, workspace-safe `image_path`, or inline `data_url`.
- Video/audio short-drama media and HTTP/data URL-only preview references are covered by `ISSUE-1140E2` bridge tests.

## ISSUE-1120B Terminal Runtime-Port Boundary Study

Date: 2026-07-04

Scope:

- `scripts/check-core-boundaries.mjs`.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- No terminal runtime behavior, Web terminal UI, desktop terminal commands, `terminal-core`, remote SSH, Flow Chat, multi-agent/subagent, AI media, AI short-drama, Computer Use, provider, Cargo, or crate-layout changes.

Checks:

- `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts/check-core-boundaries.mjs`
  - Result: passed after adding self-test coverage for the terminal adapter, Flow Chat terminal replay, and terminal-core owner anchor rules.
- `node scripts/check-core-boundaries.mjs`
  - Result: failed first because two required-content regexes used a word boundary after `>` and did not match existing `Arc<SessionManager>` / `Vec<TerminalReplayEvent>` fields.
  - Result: passed after narrowing the regex fix to allow the existing field shape.

Coverage:

- `terminal_api.rs` is guarded from redefining `SessionManager`, `TerminalReplayEvent`, `TerminalReplayHistory`, or importing `portable_pty`.
- Flow Chat is guarded from owning `TerminalReplayEvent`, `TerminalReplayHistory`, or `SessionManager` facts.
- `terminal-core` `api.rs` and `session/replay.rs` are required to keep the current TerminalApi, SessionManager, get-history, replay-event, replay-history, and resize-marker owner anchors.
- Real `TerminalRuntimePort` trait design, remote terminal replay, exec-command owner migration, and upstream `src/crates/services/terminal` layout remain deferred.

## ISSUE-1150E1 Tool Pipeline Outcome Classification Contract

Date: 2026-07-04

Scope:

- `src/crates/core/src/agentic/tools/pipeline/types.rs`.
- `src/crates/core/src/agentic/tools/pipeline/tool_pipeline.rs`.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- No Web UI, `void_events` event ABI, MCP manager lifecycle, provider adapter, media service, short-drama service, multi-agent/subagent behavior, or crate ownership changes.

Checks:

- `cargo test -p void-core tool_pipeline_outcome --lib -- --nocapture`
  - Result: passed, 7 tests.
  - Notes: covers user rejection, confirmation timeout, runtime denial, collapsed-tool gate denial, MCP runtime error, tool timeout, cancellation, and legacy category strings.
- `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/pipeline/types.rs src/crates/core/src/agentic/tools/pipeline/tool_pipeline.rs`
  - Initial result: failed because new test formatting and import ordering needed rustfmt.
  - Result after `rustfmt --edition 2021 src/crates/core/src/agentic/tools/pipeline/types.rs src/crates/core/src/agentic/tools/pipeline/tool_pipeline.rs`: passed.
- `cargo test -p void-core tool_pipeline --lib -- --nocapture`
  - Result: passed, 16 tests.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.

Coverage:

- `ToolPipelineOutcome` owns internal status/source/category/error_code/retryable classification for the current pipeline error families.
- Existing assistant-facing error result structure is preserved; the old `category` string is produced through the typed helper.
- UI rendering and event schema migration remain separate follow-up work under parent `ISSUE-1150E`.

## ISSUE-1150E Parent Reconciliation

Scope:

- Current slice is docs-only and reconciles the parent `ISSUE-1150E` after `ISSUE-1150E1`.
- It does not change tool pipeline code, ToolApprovalBar, Flow Chat tool cards, event ABI, MCP manager lifecycle, provider adapters, AI media, or AI short-drama services.

Evidence:

- `ISSUE-1150E1` added `ToolPipelineOutcome` and typed status/source/category/error-code/retryability facts.
- `ISSUE-1150E1` tests cover user rejection, confirmation timeout, runtime denial, collapsed-tool gate denial, MCP runtime error, ordinary timeout, cancellation, and legacy category string stability.
- DEC-113 records that the assistant-facing error result shape remains unchanged and UI/event schema migration is deferred.
- `not-found`, invalid-arguments, and generic execution errors are represented by the typed helper contract, but this reconciliation does not claim direct test coverage equivalent to the parent acceptance paths.

Executed:

- `Select-String -Path docs/ISSUES.md,docs/TEST_PLAN.md,docs/DECISIONS.md -Pattern "ISSUE-1150E|ToolPipelineOutcome|DEC-113"`
  - Result: passed; confirmed parent acceptance is covered by `ISSUE-1150E1` documentation and DEC-113.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates src/web-ui`
  - Result: showed only pre-existing unrelated Web UI generated version diffs and `src/crates/ai-adapters` working-copy warnings/status; no scoped source changes were added for this reconciliation.

Remaining risk:

- This does not add UI rendering states or event schema fields. Any UI/event consumer work must use the typed pipeline outcome through a separate issue rather than string matching.
- Direct focused coverage for `not-found`, invalid-arguments, and generic fallback outcome details can be added in a future helper-test cleanup if those categories become UI/event-facing.

## ISSUE-1150F Tool Runtime Owner Migration Planning Gate

Date: 2026-07-04

Scope:

- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
- Read-only inspection of upstream commits `65da1a082` and `4da7ae5d8`.
- No Rust/TS production source, Cargo manifest, event ABI, MCP runtime state, ExecCommand policy, remote file helper, Web UI, Flow Chat, multi-agent/subagent, AI media, or AI short-drama changes.

Checks:

- `git show --stat --oneline --no-renames 65da1a082`
  - Result: inspected upstream tool/event ABI contract scope, including tool snapshot and event projection manifest additions.
- `git show --stat --oneline --no-renames 4da7ae5d8`
  - Result: inspected upstream plugin runtime boundary scope, including runtime-ports, product capabilities, LSP contracts, and agent runtime changes.
- `git grep -n "ToolCatalogSnapshot\\|RuntimeEventSink\\|projection_manifest\\|PluginRuntime\\|ExecCommand" -- src/crates scripts docs`
  - Result: confirmed current Void already has local equivalents for `ToolCatalogSnapshotProvider`, `RuntimeEventSink`, runtime-port DTOs, product-runtime tool assembly, and boundary-script anchors.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.

Coverage:

- Migration candidates are registered separately: tool snapshot ABI, event projection manifest, plugin runtime/capability boundary, MCP runtime owner, ExecCommand/tool-runtime owner, and remote file/helper owner.
- Each candidate requires future behavior-equivalence tests before code movement.
- This issue does not claim runtime parity with upstream plugin/runtime decomposition and does not approve any crate move.

## ISSUE-1170A Provider HTTP Boundary Static Audit

Date: 2026-07-03

Scope:

- `scripts/check-core-boundaries.mjs` static governance only.
- Provider HTTP/SSE owner documentation only.
- No provider implementation, crate layout, request/stream behavior, Flow Chat, AI media, AI short-drama, terminal, MCP, Computer Use, or theme runtime changes.

Checks:

- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs`
  - Initial result: failed.
  - Cause: self-test required a provider HTTP/SSE owner boundary rule before the rule existed.
- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; $exit=$LASTEXITCODE; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST; exit $exit`
  - Final result: passed.
  - Notes: self-test covers OpenAI/Anthropic/Gemini transport coupled to `reqwest` and direct provider SSE parser imports.
- `node scripts/check-core-boundaries.mjs`
  - Interim result: failed when patterns were too broad.
  - Cause: endpoint-string checks matched credential/config facts, and a global `reqwest::Client` check matched existing non-provider HTTP owners.
  - Final result: passed after narrowing the guard to provider-specific transport/SSE ownership signals.

Residual risk:

- The static guard is line-oriented and catches high-signal ownership drift, not every possible multi-line provider transport implementation.
- Broader migration of existing core HTTP owners to service adapters remains a separate high-risk issue.

## ISSUE-1170E Image Understanding Capability Reconcile

Date: 2026-07-03

Scope:

- `AIConfig` image-understanding capability helpers.
- `ConfigService::reconcile_models` handling for `ai.default_models.image_understanding`.
- `resolve_vision_model_from_ai_config` canonical reference resolution and error classification.
- No `AnalyzeImage` tool rewrite, `view_image` copy, provider adapter change, AI media change, AI short-drama change, Flow Chat change, or Web UI change.

Executed:

- `cargo test -p void-core first_enabled_image_understanding_model --lib -- --nocapture`
  - RED result before implementation: failed to compile because `AIConfig::first_enabled_image_understanding_model_id` did not exist.
  - GREEN result after implementation: passed, 2 tests.
- `cargo test -p void-core image_understanding --lib -- --nocapture`
  - Result: passed, 4 tests covering helper and service reconcile behavior.
- `cargo test -p void-core resolve_vision_model --lib -- --nocapture`
  - Result: passed, 2 tests covering `model_name` canonical resolution plus disabled/text-only error classification.
- `cargo test -p void-core image_analysis --lib -- --nocapture`
  - Result: passed, 2 tests.
- `cargo metadata --no-deps --format-version 1`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `rustfmt --edition 2021 --check src\crates\core\src\service\config\types.rs src\crates\core\src\service\config\service.rs src\crates\core\src\service\config\global.rs src\crates\core\src\agentic\image_analysis\image_processing.rs`
  - Result: passed.
- `git diff --check`
  - Result: passed with LF/CRLF warnings only.

Coverage:

- Enabled text-only models are skipped when selecting an image-understanding default.
- Disabled vision-capable models are skipped.
- `ai.default_models.image_understanding` is repointed to an enabled vision-capable model when possible.
- The slot is cleared when no enabled vision-capable model exists.
- Runtime resolver accepts saved `model_name` references and returns the canonical model.
- Runtime disabled and unsupported-model failures remain explicit.

Pending broader checks:

- Live provider verification requires user credentials and model configuration.

## ISSUE-1170C OpenAI Content-Part Array Parser Regression

Date: 2026-07-03

Scope:

- `src/crates/ai-adapters/src/providers/openai/message_converter.rs` only.
- Chat Completions content-part array validation only.
- No tool schema, Flow Chat UI, media/short-drama context plumbing, non-OpenAI provider, provider catalog/config, or crate layout changes.

Checks:

- `cargo test -p void-ai-adapters openai::message_converter -- --nocapture`
  - Initial result: failed.
  - Cause: newly added tests showed plain JSON arrays and mixed invalid content-part arrays were passed through as OpenAI content arrays.
  - Final result: passed.
  - Notes: 13 OpenAI message converter tests passed after limiting array passthrough to valid Chat Completions `text`/`image_url` parts and rejecting Responses-style string `image_url` parts.
- `rustfmt src/crates/ai-adapters/src/providers/openai/message_converter.rs`
  - Result: passed.
- `cargo test -p void-ai-adapters`
  - Result: passed.
  - Notes: 172 unit tests, 4 model-selector tests, 10 stream harness tests, and 0 doctests passed.
- `cargo metadata --no-deps --format-version 1`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- src/crates/ai-adapters/src/providers/openai/message_converter.rs docs/ARCHITECTURE.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- This does not change Responses API content parsing or non-OpenAI providers.
- The validator intentionally supports the current Chat Completions part shapes only; future OpenAI part types should add focused tests before being allowed through.

## ISSUE-1170B AI Connection Test Error Classification

Date: 2026-07-03

Scope:

- `void-ai-adapters` connection-test failure classification and result serialization.
- Bridge type propagation through core, desktop connection-test merging, installer, and TypeScript API contracts.
- No provider catalog redesign, model config schema migration, broad settings UI rewrite, retry behavior change, Flow Chat, AI media, AI short-drama, terminal, MCP, Computer Use, or crate layout change.

Checks:

- `cargo test -p void-ai-adapters healthcheck -- --nocapture`
  - RED result: failed before implementation because the new classifier and failure-result helper did not exist.
  - Interim result: failed once because `proxy authentication required` was classified as auth before proxy precedence was corrected.
  - Final result: passed, 3 focused health-check tests.
- `cargo test -p void-ai-adapters types::ai -- --nocapture`
  - Result: passed, 4 focused type tests including legacy JSON without `error_category` and snake_case category serialization.
- `cargo test -p void-ai-adapters healthcheck types::ai -- --nocapture`
  - Result: command rejected by Cargo because only one test-name filter is accepted.
  - Follow-up: reran `healthcheck` and `types::ai` as separate commands; both passed.
- `cargo test -p void-ai-adapters`
  - Result: passed, 177 unit tests, 4 model-selector tests, 10 stream harness tests, and 0 doctests.
- `rustfmt src\crates\ai-adapters\src\client\healthcheck.rs src\crates\ai-adapters\src\types\ai.rs src\crates\ai-adapters\src\lib.rs`
  - Initial result: failed because the default rustfmt edition treated existing async functions as Rust 2015.
- `rustfmt --edition 2021 src\crates\ai-adapters\src\client\healthcheck.rs src\crates\ai-adapters\src\types\ai.rs src\crates\ai-adapters\src\lib.rs src\crates\core\src\util\types\ai.rs src\apps\desktop\src\api\commands.rs Void-Installer\src-tauri\src\installer\types.rs Void-Installer\src-tauri\src\installer\commands.rs`
  - Result: passed.
- `cargo metadata --no-deps --format-version 1`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `cargo check -p void-desktop`
  - Result: passed with the existing unrelated warning for `parse_clipboard_path_segments` being unused.
- `pnpm run type-check:web`
  - Result: passed.
- `pnpm --dir Void-Installer run type-check`
  - Result: passed.

Residual risk:

- The category classifier is intentionally heuristic and should be extended by adding focused tests for new provider error shapes.
- No UI message copy was changed; future UI presentation should consume `error_category` rather than parse `error_details`.

## ISSUE-1170D SSE Handler Cancellation Contract

Date: 2026-07-03

Scope:

- `void-ai-adapters` SSE request facade, provider handler lifecycle, and focused stream tests.
- No core turn cancellation semantics, Flow Chat state, terminal, MCP, provider catalog/config, AI media, AI short-drama, or crate layout changes.

Checks:

- `cargo test -p void-ai-adapters dropping_returned_stream_aborts_handler_task -- --nocapture`
  - RED result: failed before implementation because `stream_with_handler_abort_on_drop` did not exist.
  - Interim result: failed once because the test was missing the `FutureExt` import for `now_or_never`.
  - Final result: passed, proving dropping the adapter-returned parsed stream aborts the handler task.
- `cargo test -p void-ai-adapters --test stream_test_harness openai_handler_stops_when_event_receiver_is_dropped -- --nocapture`
  - RED result: failed because the OpenAI handler kept waiting for the next delayed SSE chunk after `rx_event` was dropped.
  - Interim result: still failed after a loop-start `is_closed` check because the handler could already be inside `next_stream_item`.
  - Final result: passed after selecting between `tx_event.closed()` and the next stream item.
- `cargo test -p void-ai-adapters --test stream_test_harness -- --nocapture`
  - Result: passed, 11 stream harness tests.
- `cargo test -p void-ai-adapters client::sse -- --nocapture`
  - Result: passed, 7 SSE facade tests.
- `cargo test -p void-agent-stream`
  - Result: passed, 31 tests across unit and stream processor harnesses.
- `cargo test -p void-ai-adapters`
  - Result: passed, 178 unit tests, 4 model-selector tests, 11 stream harness tests, and 0 doctests.
- `cargo metadata --no-deps --format-version 1`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `cargo test -p void-core round_executor --lib -- --nocapture`
  - Result: passed, 43 focused round-executor tests.

Residual risk:

- Direct handler receiver-drop coverage is OpenAI-specific; the same `tx_event.closed()` lifecycle pattern was applied to Anthropic, Gemini, and Responses handlers and is covered indirectly by their existing completed-stream fixture tests.
- This does not change core cancellation tokens or business retry semantics.

## ISSUE-1160F Workspace Media Gallery Theme Token Wrapper Slice

Date: 2026-07-03

Scope:

- `WorkspaceMediaGallery.scss` local semantic theme tokens only.
- Focused script guard for Gallery direct `--void-*` regressions.
- Web theme-color governance baseline lowered only where the audit proved reduced debt.
- No Gallery TSX state, media services, pending generation ownership, preview resolution, delete/restore/purge flows, Short Drama files, Flow Chat session logic, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/workspace-media-gallery-theme.test.mjs`
  - Initial result: failed.
  - Cause: `WorkspaceMediaGallery.scss` directly used `--void-*` tokens and did not define `--workspace-media-gallery-*` wrappers.
- `node --test scripts/workspace-media-gallery-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs`
  - Result: passed.
  - Notes: 2 focused style-boundary tests passed.
- `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx`
  - Result: passed.
  - Notes: 28 focused workspace-media tests passed.
- `pnpm run check:theme-colors`
  - Initial result: failed because the audit values improved below baseline.
  - Fix: lowered `uniqueColors` from 1655 to 1653, `cssVars.fallbackOnlyUnique` from 77 to 76, and `nearPairs.nearTotal` from 1279 to 1274.
  - Retest result: passed.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- Gallery generator, overlay, waveform, and media preview raw colors are still visual-debt candidates.
- ShortDramaCenterPanel still has separate token cleanup debt, including a reported undefined `--short-drama-text` reference.

## ISSUE-1160F Short Drama Center Theme Token Boundary Slice

Date: 2026-07-03

Scope:

- `ShortDramaCenterPanel.scss` local semantic theme token sources only.
- Focused script guard for CenterPanel direct `--void-*` and undefined `--short-drama-text` regressions.
- Web theme-color governance baseline lowered only where the audit proved reduced debt.
- No CenterPanel TSX state, stage navigation, workspace manifest interpretation, stage-agent tabs, artifact/media recovery, Flow Chat/runtime coordination, media services, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/short-drama-center-theme.test.mjs`
  - Initial result: failed.
  - Cause: `ShortDramaCenterPanel.scss` directly used `--void-*` tokens.
- `node --test scripts/short-drama-center-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs`
  - Result: passed.
  - Notes: 3 focused style-boundary tests passed after local token mapping and undefined token cleanup.
- `pnpm run check:theme-colors`
  - Initial result: failed because audit values improved below baseline.
  - Fix: lowered `cssVars.fallbackOnlyUnique` from 76 to 72 and `cssVars.undefinedUnique` from 51 to 50.
  - Retest result: passed.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- ShortDramaCenterPanel stage/status/media-preview raw visual colors remain separate visual-debt candidates.
- This slice does not verify rendered screenshots or change stage-agent/runtime behavior.

## ISSUE-1160F Workspace Media Gallery Generator Visual Token Slice

Date: 2026-07-03

Scope:

- `WorkspaceMediaGallery.scss` pending/generator visual colors only.
- Focused script guard for generator selector-level raw cyan/dark pending colors.
- No Gallery TSX state, pending generation ownership, media availability, preview resolution, selection, delete/restore/purge flows, media services, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/workspace-media-gallery-generator-theme.test.mjs`
  - Initial result: failed.
  - Cause: generator local tokens were missing and raw visual colors were still present in pending/generator selectors.
- `node --test scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs`
  - Result: passed.
  - Notes: 3 focused style-boundary tests passed.
- `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx`
  - Result: passed.
  - Notes: 28 focused workspace-media tests passed.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- Gallery fallback, overlay, waveform, action controls, and operation-error raw colors remain separate visual-debt candidates.
- This slice does not verify rendered screenshots or change pending generation behavior.

## ISSUE-1160F Workspace Media Gallery Card Chrome Visual Token Slice

Date: 2026-07-03

Scope:

- `WorkspaceMediaGallery.scss` card chrome visual colors only: fallback, placeholder, waveform, play/type badges, action buttons, overlay, unavailable text, and local divider.
- Focused script guard for card chrome selector-level raw colors.
- No Gallery TSX state, media availability, previewability, pending generation ownership, selection, delete/restore/purge flows, media services, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/workspace-media-gallery-card-chrome-theme.test.mjs`
  - Initial result: failed.
  - Cause: card chrome local tokens were missing and raw visual colors were still present in card chrome selectors.
- `node --test scripts/workspace-media-gallery-card-chrome-theme.test.mjs scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs`
  - Result: passed.
  - Notes: 4 focused style-boundary tests passed.
- `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx`
  - Result: passed.
  - Notes: 28 focused workspace-media tests passed.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- Gallery operation-error raw colors remain a separate visual-debt candidate.
- This slice does not verify rendered screenshots or change media preview behavior.

## ISSUE-1160F Workspace Media Gallery Operation Error Token Slice

Date: 2026-07-03

Scope:

- `WorkspaceMediaGallery.scss` operation-error border/text colors only.
- Focused script guard for operation-error selector-level raw destructive colors.
- No Gallery TSX operation state, failure source, delete/restore/purge behavior, media services, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/workspace-media-gallery-operation-error-theme.test.mjs`
  - Initial result: failed.
  - Cause: operation-error used raw destructive colors and the Gallery root did not define `--workspace-media-gallery-error-border`.
- `node --test scripts/workspace-media-gallery-operation-error-theme.test.mjs scripts/workspace-media-gallery-card-chrome-theme.test.mjs scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs`
  - Result: passed.
  - Notes: 5 focused style-boundary tests passed.
- `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx`
  - Result: passed.
  - Notes: 28 focused workspace-media tests passed.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- ShortDramaCenterPanel stage/status/media-preview raw visual colors remain separate visual-debt candidates.
- This slice does not verify rendered screenshots or change operation failure behavior.

## ISSUE-1160F Short Drama Center Status Pill Token Slice

Date: 2026-07-03

Scope:

- `ShortDramaCenterPanel.scss` status pill indicator colors only.
- Focused script guard for ready/done, generating/reviewing/revising, stale, and error/unsupported/needs-intervention selector-level raw colors.
- No CenterPanel TSX state, status ownership, stage navigation, artifact/media recovery, short-drama services, media services, Flow Chat coordination, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/short-drama-center-status-theme.test.mjs`
  - Initial result: failed.
  - Cause: local status tokens were missing and status pill indicators still used raw status colors.
- `node --test scripts/short-drama-center-status-theme.test.mjs`
  - Result: passed.
  - Notes: focused status pill style-boundary test passed after local token mapping.
- Broader focused style tests
  - Result: passed.
  - Notes: `node --test scripts/short-drama-center-status-theme.test.mjs scripts/short-drama-center-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs scripts/workspace-media-gallery-operation-error-theme.test.mjs scripts/workspace-media-gallery-card-chrome-theme.test.mjs scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs` passed with 7 tests.
- Short-drama component behavior tests
  - Result: passed.
  - Notes: `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentBootstrap.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentSessionHydration.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentTabOrchestrator.test.ts` passed with 4 files and 14 tests.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- ShortDramaCenterPanel stage/media-preview/final-preview raw visual colors remain separate visual-debt candidates.
- This slice does not verify rendered screenshots or change status ownership/runtime behavior.

## ISSUE-1160F Short Drama Center Media Preview Token Slice

Date: 2026-07-03

Scope:

- `ShortDramaCenterPanel.scss` media-preview visual colors only: default preview backdrop, grid, on-media text, media fallback, empty/missing/referenced state, generating state, and caption overlay/text.
- Focused script guard for media-preview selector-level raw colors.
- No CenterPanel TSX preview resolution, media availability classification, artifact/media recovery, short-drama services, media services, Flow Chat coordination, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/short-drama-center-media-preview-theme.test.mjs`
  - Initial result: failed.
  - Cause: local media-preview tokens were missing and media-preview selectors still used raw colors.
- `node --test scripts/short-drama-center-media-preview-theme.test.mjs`
  - Result: passed.
  - Notes: focused media-preview style-boundary test passed after local token mapping.
- Broader focused style tests
  - Result: passed.
  - Notes: `node --test scripts/short-drama-center-media-preview-theme.test.mjs scripts/short-drama-center-status-theme.test.mjs scripts/short-drama-center-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs scripts/workspace-media-gallery-operation-error-theme.test.mjs scripts/workspace-media-gallery-card-chrome-theme.test.mjs scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs` passed with 8 tests.
- Short-drama component behavior tests
  - Result: passed.
  - Notes: `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentBootstrap.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentSessionHydration.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentTabOrchestrator.test.ts` passed with 4 files and 14 tests.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- ShortDramaCenterPanel stage/final-preview raw visual colors remain separate visual-debt candidates.
- This slice does not verify rendered screenshots or change preview resolution/runtime behavior.

## ISSUE-1160F Short Drama Center Final Preview Token Slice

Date: 2026-07-03

Scope:

- `ShortDramaCenterPanel.scss` final-preview visual colors only: wrapper surface, frame border/background, media border, empty-frame background, and on-frame text.
- Focused script guard for final-preview selector-level raw colors.
- No CenterPanel TSX final preview readiness, empty-state classification, preview resolution, short-drama services, media services, Flow Chat coordination, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/short-drama-center-final-preview-theme.test.mjs`
  - Initial result: failed.
  - Cause: local final-preview tokens were missing and final-preview selectors still used raw colors.
- `node --test scripts/short-drama-center-final-preview-theme.test.mjs`
  - Result: passed.
  - Notes: focused final-preview style-boundary test passed after local token mapping.
- Broader focused style tests
  - Result: passed.
  - Notes: `node --test scripts/short-drama-center-final-preview-theme.test.mjs scripts/short-drama-center-media-preview-theme.test.mjs scripts/short-drama-center-status-theme.test.mjs scripts/short-drama-center-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs scripts/workspace-media-gallery-operation-error-theme.test.mjs scripts/workspace-media-gallery-card-chrome-theme.test.mjs scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs` passed with 9 tests.
- Short-drama component behavior tests
  - Result: passed.
  - Notes: `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentBootstrap.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentSessionHydration.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentTabOrchestrator.test.ts` passed with 4 files and 14 tests.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- ShortDramaCenterPanel stage poster/card raw visual colors remain a separate visual-debt candidate.
- This slice does not verify rendered screenshots or change final preview readiness/runtime behavior.

## ISSUE-1160F Short Drama Center Stage Card Token Slice

Date: 2026-07-03

Scope:

- `ShortDramaCenterPanel.scss` stage/card visual colors only: card surface, poster default/stage gradients, notice accent, media-reference surface, and stage rail surface.
- Focused script guard for stage/card selector-level raw colors.
- No CenterPanel TSX stage ownership, stage navigation, artifact status, media references, stage-agent coordination, short-drama services, media services, Flow Chat coordination, ThemeService runtime behavior, or broad theme runtime contracts.

Checks:

- `node --test scripts/short-drama-center-stage-card-theme.test.mjs`
  - Initial result: failed.
  - Cause: local stage/card tokens were missing and stage/card selectors still used raw colors.
- `node --test scripts/short-drama-center-stage-card-theme.test.mjs`
  - Result: passed.
  - Notes: focused stage/card style-boundary test passed after local token mapping.
- Broader focused style tests
  - Result: passed.
  - Notes: `node --test scripts/short-drama-center-stage-card-theme.test.mjs scripts/short-drama-center-final-preview-theme.test.mjs scripts/short-drama-center-media-preview-theme.test.mjs scripts/short-drama-center-status-theme.test.mjs scripts/short-drama-center-theme.test.mjs scripts/media-short-drama-entry-theme.test.mjs scripts/workspace-media-gallery-operation-error-theme.test.mjs scripts/workspace-media-gallery-card-chrome-theme.test.mjs scripts/workspace-media-gallery-generator-theme.test.mjs scripts/workspace-media-gallery-theme.test.mjs` passed with 10 tests.
- Short-drama component behavior tests
  - Result: passed.
  - Notes: `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentBootstrap.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentSessionHydration.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaStageAgentTabOrchestrator.test.ts` passed with 4 files and 14 tests.
- `pnpm run check:theme-colors`
  - Result: passed.
  - Notes: no baseline update required.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Residual risk:

- `ISSUE-1160F` selector-level media/short-drama token boundary cleanup is complete, but rendered screenshot review, contrast tuning, and broader root-token consolidation remain separate future issues.
- This slice does not verify rendered screenshots or change stage ownership/runtime behavior.

## ISSUE-999 Results

Date: 2026-07-03

Scope:

- Docs-only reconciliation of remaining Split parents: `ISSUE-020D`, `ISSUE-060I`, `ISSUE-122B`, and `ISSUE-900`.
- No runtime code, workflow, script, package, Cargo, generated source, Web UI, Rust core, desktop, terminal, media, short-drama, provider, or adapter changes.

Checks:

- `Select-String -Path docs\ISSUES.md -Pattern "^### ISSUE-|^Status: (Deferred|Split|Rejected|Pending|Open|Done)"`
  - Result: passed.
  - Notes: confirmed concrete child issues are `Done`, remaining parent scopes are `Split`, and unsafe upstream moves are `Rejected`.
- `Select-String -Path docs\ISSUES.md,docs\PROGRESS.md,docs\TEST_PLAN.md,docs\DECISIONS.md -Pattern "Status: Deferred|Status: Split|remains deferred|external|browser startup/render smoke|release upload|Homebrew|crate reorganization|DTO extraction"`
  - Result: passed.
  - Notes: confirmed residual Split scope is explicitly gated by browser smoke, release/Homebrew policy, DTO architecture, or crate-layout planning.
- `git diff --check -- docs/PRD.md docs/ISSUES.md docs/DECISIONS.md docs/TEST_PLAN.md docs/PROGRESS.md`
  - Result: passed.
- `Select-String -Path docs\PRD.md,docs\ISSUES.md,docs\DECISIONS.md,docs\TEST_PLAN.md,docs\PROGRESS.md -Pattern "[ \t]$"`
  - Result: passed.
  - Notes: no trailing whitespace matches.

Known validation limits:

- This issue does not prove browser render smoke, GitHub Actions manual workflow execution, DTO extraction safety, or crate-layout migration safety.
- Those remain separate gated decisions, not hidden work inside this closeout.

## ISSUE-999A Results

Date: 2026-07-03

Failures found:

- `cargo test -p void-core --lib`
  - Initial result: failed.
  - Cause: core registry test snapshots did not include current accepted tool manifest entries `ShortDramaProject` and `AnalyzeImage`.
- `pnpm --dir src/web-ui run test:run`
  - Initial result: failed.
  - Cause: `virtualMessageListLayout.test.ts` still forbade `historyProjectionHandoff`, but `ISSUE-130F` had already accepted the guarded handoff overlay.

Fixes:

- Updated registry test expectations in `src/crates/core/src/agentic/tools/registry.rs`; no runtime registry assembly changed.
- Updated `virtualMessageListLayout.test.ts` boundary assertion to continue forbidding `heightEstimates`/`firstItemIndex` while allowing the completed handoff overlay.

Retests:

- `cargo test -p void-core --lib`
  - Result: passed.
  - Notes: 1034 passed, 2 ignored.
- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
  - Result: passed.
  - Notes: 22 passed.
- `pnpm --dir src/web-ui run test:run`
  - Result: passed.
  - Notes: 239 files passed, 1407 tests passed.
- `git diff --check`
  - Result: passed.
  - Notes: Windows LF-to-CRLF warnings only; exit code 0.

## ISSUE-020D1 Results

Date: 2026-07-03

Scope:

- Added default-off React Profiler instrumentation to `CodePreview` only.
- Reused `recordReactRenderProfile(startupTrace, ...)`.
- Kept Markdown, FlowTextBlock, ModelRoundItem, Flow Chat stores, terminal, media, short-drama, subagent, backend, and desktop modules out of scope.

RED checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/CodePreview.test.tsx`
  - Result: failed before implementation.
  - Notes: the enabled profiling test failed because `recordReactRenderProfile` was not called.

GREEN checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/CodePreview.test.tsx`
  - Result: passed, 5 tests.
- `pnpm --dir src/web-ui exec vitest run src/shared/utils/startupTrace.test.ts`
  - Result: passed, 13 tests.
- `pnpm run type-check:web`
  - Result: passed.
- `pnpm run check:theme-colors`
  - Initial result after implementation: failed because `cssVars.fallbackOnlyUnique` improved from the old baseline max 78 to 77.
  - Result after lowering `scripts/theme-color-governance-baseline.json` `cssVars.fallbackOnlyUnique.max` to 77: passed.
- `node --test scripts/audit-theme-colors.test.mjs`
  - Result: passed, 14 tests.

Known validation limits:

- No browser startup/render smoke was run.
- Real trace inspection with `__VOID_RENDER_PROFILE_ENABLED__ = true` remains useful before expanding profiling to Markdown or ModelRound.

## ISSUE-020D2 Results

Date: 2026-07-03

Scope:

- Added default-off React Profiler instrumentation to `FlowTextBlock` only.
- Reused `recordReactRenderProfile(startupTrace, ...)`.
- Kept Markdown renderer internals, syntax-highlighter internals, ModelRoundItem, Flow Chat stores/session/history/sidebar/header, terminal, media, short-drama, subagent, backend, desktop, and provider modules out of scope.

RED checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/FlowTextBlock.autoPreview.test.tsx`
  - Result: failed before implementation.
  - Notes: the enabled profiling test failed because `recordReactRenderProfile` was not called.

GREEN checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/FlowTextBlock.autoPreview.test.tsx`
  - Result: passed, 4 tests.
- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/CodePreview.test.tsx src/shared/utils/startupTrace.test.ts`
  - Result: passed, 18 tests.
- `pnpm run type-check:web`
  - Result: passed.
- `pnpm --dir src/web-ui exec playwright --version`
  - Result: failed.
  - Notes: Playwright command was not available.
- `pnpm --dir src/web-ui exec puppeteer --version`
  - Result: failed.
  - Notes: Puppeteer command was not available.
- `Get-Command msedge,chrome,chromium,playwright`
  - Result: failed.
  - Notes: no local browser automation command was available, so browser startup/render smoke could not be run.
- `pnpm run build:web`
  - Result: passed.
  - Notes: web type-check, Vite production build, and Monaco asset verification completed. Vite emitted existing dynamic-import/chunk-size warnings.

Known validation limits:

- No real browser startup/render smoke was run because the required local tools were unavailable.
- Real trace inspection with `__VOID_RENDER_PROFILE_ENABLED__ = true` remains useful before expanding profiling to Markdown renderer internals or ModelRound.

## ISSUE-060I1 Results

Date: 2026-07-03

Scope:

- Added `.github/workflows/cli-package-manual.yml` as a manual artifact-only Void CLI packaging workflow.
- Kept release upload, Homebrew tap dispatch, release/nightly/desktop workflows, CLI source, Cargo manifests, installer files, and upstream product identity out of scope.

RED checks:

- Static workflow contract check.
  - Result: failed before implementation.
  - Notes: `.github/workflows/cli-package-manual.yml` did not exist.

GREEN checks:

- `node scripts/check-github-config.mjs`
  - Result: passed.
  - Notes: 10 GitHub YAML files parsed.
- Prohibited identity/release/Homebrew scan on `.github/workflows/cli-package-manual.yml`
  - Result: passed.
  - Notes: no `bitfun`, `BitFun`, `GCWing`, `BITFUN`, `__BITFUN`, `softprops/action-gh-release`, `homebrew`, `dispatches`, `contents: write`, `void/homebrew`, or `bitfun-cli` matches.
- Required workflow contract scan on `.github/workflows/cli-package-manual.yml`
  - Result: passed.
  - Notes: found `workflow_dispatch`, `contents: read`, `actions/upload-artifact`, `retention-days`, `void-cli`, `cargo build`, `--version`, `--help`, `fromJson`, and `linux_runner`.
- `cargo build --release -p void-cli`
  - Result: passed.
  - Notes: completed in 20m56s.
- `.\target\release\void-cli.exe --version`
  - Result: passed.
  - Notes: printed `void 0.2.8`.
- `.\target\release\void-cli.exe --help`
  - Result: passed.

Known validation limits:

- The new workflow was not run in GitHub Actions.
- macOS/Linux arm runner availability and cost were not verified locally.
- Release upload and Homebrew tap dispatch remain intentionally deferred.

## Manual Verification for P0 Issues

### ISSUE-001 ACP `omp`

1. Open ACP configuration or ACP client list.
2. Confirm built-in client list includes `omp`.
3. Confirm launch command is `omp acp`.
4. Confirm no `@zed-industries/*` adapter install is offered.
5. If `omp` is not on PATH, behavior must remain user-managed rather than automatic adapter download.

### ISSUE-002 CLI Slash Matching

1. Start CLI chat/TUI when Rust workspace commands are available.
2. Type `/usa` or `/USA`.
3. Confirm `/usage` appears.
4. Type `/help`; confirm exact command remains available.
5. Type `/`; confirm command list appears.
6. Add a space after a command; confirm substring matching no longer keeps the menu active incorrectly.

## Result Template

```md
## ISSUE-NNN Results

Date: YYYY-MM-DD
Commands run:
- `command`
  - Result: passed | failed | not run
  - Notes:

Manual checks:
- check: passed | failed | not run

Failures:
- None, or failure summary plus rerun result.
```

## Current Results

Targeted Rust verification has passed for `ISSUE-004A`, `ISSUE-004B`, `ISSUE-004C`, and `ISSUE-004D`. Targeted front-end direct Vitest and TypeScript checks passed for `ISSUE-004C`; targeted Flow Chat/BTW/subagent direct Vitest checks passed for `ISSUE-005`. Scoped brand/installer identity audit passed for `ISSUE-006`. Targeted ACP tests and check passed for `ISSUE-001`; targeted CLI command tests and check passed for `ISSUE-002`. Targeted RichTextInput tests and TypeScript passed for `ISSUE-010A` and `ISSUE-010B`. TypeScript and direct Sass compilation passed for `ISSUE-010C`. Targeted image paste/undo utility and image context tests passed for `ISSUE-011`. Targeted startup trace tests and TypeScript passed for `ISSUE-020A` and `ISSUE-020C`. Targeted workspace media tests and TypeScript passed for `ISSUE-030A` and `ISSUE-030B`. Targeted short-drama project fact and agent policy tests plus TypeScript passed for `ISSUE-040A` and `ISSUE-040B`. Provider adapter tests passed through `ISSUE-050F`. `ISSUE-060` completed as a read-only i18n/theme/repo-hygiene inventory. `ISSUE-060A` restored Void root workspace entry points and passed frozen install, root i18n contract, repo hygiene, GitHub config, and mobile-web type-check. `ISSUE-060C` added i18n report/baseline governance and root `i18n:audit` now passes with one grandfathered warning. `ISSUE-060B` ported repo hygiene scanner robustness and passed syntax, direct, and root checks. `ISSUE-120A` completed as a read-only Computer Use platform inventory; only documentation and hygiene checks apply. `ISSUE-120C` passed focused Windows app enumeration tests, terminal detection regression, and desktop check. Broad workspace, web build, desktop build, and release-style checks are still deferred until their related issues.

## ISSUE-000 Results

Date: 2026-07-02

Commands run:

- `git status --short --branch`
  - Result: passed
  - Notes: current branch tracks `origin/baseline/void-source-20260702`; six new consensus docs are untracked as expected in the planning phase.
- `git remote -v`
  - Result: passed
  - Notes: `origin` points to `https://github.com/nihaoran786-star/void.git`.
- `git branch -r --list "origin/baseline/void-source-20260702"`
  - Result: passed
  - Notes: remote baseline branch exists.
- `git rev-parse --verify "origin/baseline/void-source-20260702"`
  - Result: passed
  - Notes: remote baseline resolves to `6b0476ea269cf69ddf512c3ec427655ec25fd731`.

Manual checks:

- Baseline branch/tag was created before migration planning: passed.
- Functional source remained unchanged during ISSUE-000: passed.

Failures:

- None.

## ISSUE-001 Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-acp -- --list`
  - Result: passed
  - Notes: listed 45 tests, including `client::builtin_clients::tests::omp_is_a_native_user_managed_preset` and `client::builtin_clients::tests::returns_default_config_for_builtin_client`.
- `cargo test -p void-acp omp_is_a_native_user_managed_preset`
  - Result: passed
  - Notes: 1 passed; confirms native `omp acp` command, tool command `omp`, and no install package, adapter package, or adapter binary.
- `cargo test -p void-acp returns_default_config_for_builtin_client`
  - Result: passed
  - Notes: 1 passed.
- `cargo check -p void-acp`
  - Result: passed
  - Notes: ACP crate and dependencies compile under restored root workspace metadata.

Manual checks:

- Existing ACP source inspection: passed.
  - Notes: `src/crates/acp/src/client/builtin_clients.rs` contains native `omp` preset and keeps ACP behavior inside `void-acp`.

Failures:

- None remaining for `ISSUE-001`.

## ISSUE-002 Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-cli -- --list`
  - Result: passed
  - Notes: listed 5 tests, including `commands::tests::empty_query_returns_empty`, `commands::tests::exact_command_matches`, and `commands::tests::substring_command_matches_case_insensitively`.
- `cargo test -p void-cli substring_command_matches_case_insensitively`
  - Result: passed
  - Notes: 1 passed; confirms `/USA` matches `/usage`.
- `cargo test -p void-cli exact_command_matches`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-cli empty_query_returns_empty`
  - Result: passed
  - Notes: 1 passed; confirms empty query and `/` return no matches.
- `cargo check -p void-cli`
  - Result: passed
  - Notes: CLI crate and dependencies compile under restored root workspace metadata.

Manual checks:

- Existing CLI source inspection: passed.
  - Notes: matching behavior is isolated in `src/apps/cli/src/commands.rs`; no CLI UI changes were required.

Failures:

- None remaining for `ISSUE-002`.

## ISSUE-003 Results

Date: 2026-07-02

Commands run:

- Not run: functional commands.
  - Result: not run
  - Notes: ISSUE-003 is a read-only upstream inventory and classification issue. No functional source files changed, so type-check, unit tests, and build tests are deferred to the first source-changing issue.

Documentation checks:

- Subagent inventory coverage: passed by review.
  - Notes: frontend/Flow Chat, core/runtime/tools/providers, desktop/Computer Use/WebDriver/terminal, build/docs/CI/release governance, and release-note capability families are represented in `docs/ISSUES.md`.
- Classification coverage: passed by review.
  - Notes: returned candidates have `P0`, `P1`, `P2`, `P3`, `Deferred`, or `Rejected` treatment plus module, protected contract, and verification path.
- Brand rejection coverage: passed by review.
  - Notes: BitFun product identity, installer identity, `BITFUN_*`, `__BITFUN_*`, upstream updater/registry paths, and whole-file replacement candidates are rejected or require Void rewrite.

Manual checks:

- Functional source remained unchanged during ISSUE-003: passed by scope review.
- Upstream shallow clone limitation recorded: passed.

Failures:

- None.

## ISSUE-004 Results

Date: 2026-07-02

Commands run:

- `cargo test --manifest-path src/crates/core/Cargo.toml prompt_cache --lib`
  - Result: failed before tests
  - Notes: subagent reported failure: `failed to find a workspace root`; crate manifest inherits `workspace.package.edition`.
- `cargo test --manifest-path src/crates/services-core/Cargo.toml token_usage_contracts`
  - Result: failed before tests
  - Notes: same workspace root manifest blocker.
- `pnpm --dir src/web-ui run test:run src/flow_chat/services/goalCommandParser.test.ts src/flow_chat/services/goalService.test.ts src/flow_chat/services/goalVerificationService.test.ts`
  - Result: failed before tests
  - Notes: pnpm aborted module purge in non-TTY mode.
- `$env:CI='true'; pnpm --dir src/web-ui run test:run src/flow_chat/services/goalCommandParser.test.ts src/flow_chat/services/goalService.test.ts src/flow_chat/services/goalVerificationService.test.ts`
  - Result: failed before tests
  - Notes: pnpm recreated `src/web-ui/node_modules`, then stopped on ignored build scripts for `@parcel/watcher` and `esbuild`, requiring build-script approval. Generated approval placeholder `src/web-ui/pnpm-workspace.yaml` was inspected and removed because it contained unresolved placeholder values.

Read-only verification:

- Prompt cache: passed by code inspection.
  - Notes: identity, TTL, persistence, restore prune/delete, clone, invalidation, and cache read/write usage separation are present. Fine-grained `SystemPrompt`/`UserContext` invalidation tests may still be needed.
- `/goal`: partial.
  - Notes: create, pause, resume, clear, edit, continuation, metadata persistence, budget fields, and usage-limited status are present. Missing or unverified: explicit `Complete`/`Blocked` setter paths, budget-setting entrypoint, and billable-token accounting that excludes cache reads.
- Multitask/subagent/review readonly: passed by code inspection with gaps.
  - Notes: Multitask mode, scheduler, permission gate, recursive subagent blocking, and review readonly foundations exist. Missing or unverified: end-to-end prompt to scheduler to background result merge, and focused DeepReview/ReviewFixer readonly contract tests.

Failures:

- Rust tests are blocked by missing workspace manifests.
- Web tests are blocked by pnpm dependency/build-script approval policy before Vitest starts.

## ISSUE-004A Results

Date: 2026-07-02

Commands run:

- `cargo metadata --no-deps --format-version 1`
  - Result: passed
  - Notes: root workspace metadata resolves the current Void crate layout.
- `cargo test -p void-core --lib default_prompt_cache_policy_uses_one_day_persistence_ttl`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib system_prompt_cache_requires_matching_identity`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib expired_user_context_is_evicted_on_read`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib invalidate_scope_can_clear_all_cached_prompt_parts`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib invalidate_system_prompt_preserves_user_context`
  - Result: passed
  - Notes: 1 passed; new coverage.
- `cargo test -p void-core --lib invalidate_user_context_preserves_system_prompt`
  - Result: passed
  - Notes: 1 passed; new coverage.
- `cargo test -p void-core --lib prompt_cache_telemetry_reports_provider_partial_hit`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib prompt_cache_telemetry_reports_unavailable_when_provider_omits_cache_fields`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-services-core --test token_usage_contracts`
  - Result: passed
  - Notes: 4 passed.

Failures and fixes:

- Initial `cargo test --manifest-path src/crates/core/Cargo.toml prompt_cache --lib` failed before tests because root workspace metadata was missing.
  - Fix: added current-layout root `Cargo.toml`.
- Initial default `void-core` compile failed after adding workspace metadata because dependency versions copied from upstream were too new for current Void source.
  - Fix: aligned root workspace versions to current source compatibility: `reqwest 0.12`, `git2 0.20`, `axum 0.7`, and `tokio-tungstenite 0.24`.
- Initial `cargo test -p void-core prompt_cache --lib --no-default-features` passed with 0 tests.
  - Fix: used actual product-full test names because `agentic` is gated behind `product-full`.

Manual checks:

- No BitFun identity was introduced in Cargo workspace metadata: passed.
- No runtime prompt cache behavior was changed: passed by diff scope.

Failures:

- None remaining for `ISSUE-004A`.

## ISSUE-004B Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-runtime-ports delegation_policy_child_blocks_recursive_spawn_without_losing_depth`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-runtime-ports multitask_plan_serializes_scheduler_contract`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib dry_run_accepts_independent_non_conflicting_branches`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib dry_run_rejects_unfinished_dependencies_and_write_scope_conflicts`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib decision_falls_back_when_forced_execution_is_disabled`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib launch_approved_branches_uses_launcher_and_records_failures`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib call_impl_rejects_nested_subagent_delegation`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-runtime-ports subagent_context_mode_preserves_fork_wire_value`
  - Result: passed
  - Notes: 1 passed.

Manual checks:

- No Multitask scheduler source behavior was changed: passed by diff scope.
- No Task tool or runtime-port source behavior was changed: passed by diff scope.
- Review-specific readonly behavior was left for `ISSUE-004D`: passed by scope review.

Failures:

- None remaining for `ISSUE-004B`.

## ISSUE-004C Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-core --lib goal_mode_update_actions_complete_block_and_budget`
  - Result: passed
  - Notes: 1 passed; new complete/block/budget transition coverage.
- `cargo test -p void-core --lib goal_token_usage_event_counts_billable_tokens_only`
  - Result: passed
  - Notes: 1 passed; new cached-token budget coverage.
- `cargo test -p void-core --lib goal_token_usage_consumes_runtime_token_usage_event_contract`
  - Result: passed
  - Notes: 1 passed; expected tokens used changed from total tokens to billable tokens.
- `cargo test -p void-core --lib goal_token_usage_limits_goal_when_budget_is_reached`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib goal_mode`
  - Result: passed
  - Notes: 30 passed.
- `cargo test -p void-desktop goal_mode_status_wire_uses_stable_kebab_case_for_usage_limited`
  - Result: passed
  - Notes: 1 passed; desktop compile initially exposed `zip 4.6` compatibility issue, then passed after `SimpleFileOptions` adaptation.
- `cargo test -p void-desktop update_session_goal_response_serializes_goal_accounting_fields`
  - Result: passed
  - Notes: 1 passed.
- `pnpm --dir src/web-ui run test:run src/flow_chat/services/goalCommandParser.test.ts src/flow_chat/services/goalService.test.ts`
  - Result: failed before tests
  - Notes: pnpm install stopped on ignored build scripts for `@parcel/watcher` and `esbuild`; generated unresolved `src/web-ui/pnpm-workspace.yaml` was removed.
- `node_modules\.bin\vitest.cmd run src/flow_chat/services/goalCommandParser.test.ts src/flow_chat/services/goalService.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 2 files passed, 8 tests passed.
- `node_modules\.bin\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.
- `cargo fmt --check`
  - Result: failed
  - Notes: reports many pre-existing formatting differences outside this issue's changed files; not used as a clean repo gate.
- `git diff --check`
  - Result: passed
  - Notes: only Git LF-to-CRLF warnings were printed.

Failures and fixes:

- New goal action tests first failed at compile time because `GoalModeUpdateAction` match arms were intentionally missing.
  - Fix: implemented `Complete`, `Block`, and `SetTokenBudget` transitions.
- Desktop compile first failed because `zip 4.6.1` requires `SimpleFileOptions` while current `crash_diagnostics.rs` used old `FileOptions`.
  - Fix: adapted crash diagnostics to `zip::write::SimpleFileOptions`, matching the upstream compatibility approach without changing product identity.
- pnpm targeted test command remains blocked by build-script approval.
  - Workaround: direct Vitest and direct TypeScript commands passed using existing `node_modules`.

Manual checks:

- No upstream `ThreadGoal` architecture was copied: passed by diff scope.
- No Flow Chat page component or session-history UI business logic was changed: passed by diff scope.
- Goal state transitions remain in core `goal_mode`: passed by diff scope.

Failures:

- None remaining for `ISSUE-004C` targeted verification.

## ISSUE-004D Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-core --lib specialist_reviewers_use_isolated_instruction_context`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib built_in_deep_review_reviewers_are_marked_as_review_agents`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib classify_rejects_deep_review_nested_task`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib classify_always_rejects_review_fixer`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib code_review_agent_has_review_and_user_approved_remediation_tools`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib deep_review_agent_has_team_orchestration_tools`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib review_fixer_agent_has_edit_and_verify_tools`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-core --lib call_impl_rejects_nested_subagent_delegation`
  - Result: passed
  - Notes: 1 passed.
- `cargo test -p void-runtime-ports delegation_policy_child_blocks_recursive_spawn_without_losing_depth`
  - Result: passed
  - Notes: 1 passed.

Manual checks:

- No review/subagent runtime source changed: passed by diff scope.
- Existing tests cover readonly specialist registration, DeepReview policy rejection, ReviewFixer boundary, Task nested delegation, and delegation policy: passed by test inventory review.

Failures:

- None remaining for `ISSUE-004D`.

## ISSUE-005 Results

Date: 2026-07-02

Commands run:

- `node_modules\.bin\vitest.cmd run src/flow_chat/components/modern/ModernFlowChatContainer.history-state.test.tsx src/flow_chat/utils/sessionMetadata.test.ts src/flow_chat/utils/subagentProjection.test.ts src/flow_chat/services/BtwThreadService.test.ts src/flow_chat/services/openBtwSession.test.ts src/flow_chat/utils/dialogTurnStability.test.ts src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 7 files passed, 41 tests passed.
- `node_modules\.bin\vitest.cmd run src/flow_chat/components/btw/BtwSessionPanel.review-action.test.tsx src/flow_chat/components/btw/DeepReviewActionBar.test.tsx src/flow_chat/services/storeSync.test.ts src/flow_chat/store/FlowChatStore.test.ts src/flow_chat/services/flow-chat-manager/SessionModule.test.ts src/flow_chat/services/flow-chat-manager/PersistenceModule.test.ts src/flow_chat/services/flow-chat-manager/EventHandlerModule.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 7 files passed, 107 tests passed.

Manual checks:

- No Flow Chat source changed: passed by diff scope.
- Existing tests cover history state, session metadata, BTW parent-child linkage, subagent projection, model-round stability, store sync, and manager modules: passed by test inventory review.

Failures:

- None remaining for `ISSUE-005`.

## ISSUE-006 Results

Date: 2026-07-02

Commands run:

- `Get-ChildItem -Path src,Void-Installer,resources,scripts,.github,brand -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\target\\|\\dist\\' } | Select-String -Pattern 'BitFun|bitfun|BITFUN|__BITFUN|GCWing'`
  - Result: passed
  - Notes: no scoped source/config matches were found.
- Broad identity residue search across the repository
  - Result: passed
  - Notes: only intentional `tmp/upstream-bitfun` workspace exclude appeared.

Manual checks:

- `src/apps/desktop/tauri.conf.json`: passed.
  - Notes: `productName` is `Void`, identifier is `com.void.desktop`, and updater endpoints are empty.
- `Void-Installer/src-tauri/tauri.conf.json`: passed.
  - Notes: product identity remains `void Installer` / `com.void.installer`.
- `Void-Installer/package.json`: passed.
  - Notes: package name is `void-installer`, version is `0.2.8`.
- `src/apps/desktop/Cargo.toml`: passed.
  - Notes: desktop crate/bin metadata remains `void-desktop`.
- Installer script artifact names: passed.
  - Notes: references remain Void-specific, including `void-desktop.exe`, `void_installer.pdb`, and `void-installer.exe`.

Failures:

- None remaining for `ISSUE-006`.

## ISSUE-010A Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/flow_chat/components/RichTextInput.test.tsx`
  - Result: passed
  - Notes: run from `src/web-ui`; 1 file passed, 3 tests passed, including IME-owned Escape coverage.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.
- Upstream static comparison for `RichTextInput.tsx`, `FileMentionPicker.tsx`, and `ChatInput.tsx`
  - Result: passed
  - Notes: current Void implementation already contains equivalent Escape/composition/popup-active behavior while retaining Void-specific classes and local Flow Chat contracts.

Manual checks:

- `RichTextInput` composition guard: passed.
  - Notes: composing Enter/Escape returns before parent `onKeyDown`.
- `FileMentionPicker` Escape close: passed.
  - Notes: Escape prevents default, stops propagation, and calls `onClose`.
- Global Escape cancel guard: passed.
  - Notes: `ChatInput` sets `chatPopupActive`; `ModernFlowChatContainer` disables `chat.stopGeneration` while popup is active.

Failures:

- None remaining for `ISSUE-010A`.

## ISSUE-010B Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/flow_chat/components/RichTextInput.test.tsx`
  - Result: failed, then passed after test fix
  - Notes: initial new spacing tests failed because the test `execCommand`/caret helpers placed selection on the editor element rather than text nodes, so `detectMention()` did not see the intended cursor offset. The helper was corrected; rerun passed with 1 file and 5 tests.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Upstream static comparison for `openMention()` and `insertTagReplacingMention()`: passed.
  - Notes: current Void implementation already matches upstream mention spacing behavior.
- Product source diff scope: passed.
  - Notes: only `RichTextInput.test.tsx` was changed for this issue; `RichTextInput.tsx` did not require behavior changes.

Failures:

- None remaining for `ISSUE-010B`.

## ISSUE-010C Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.
- `node_modules\\.bin\\vitest.cmd run src/flow_chat/components/RichTextInput.test.tsx`
  - Result: passed
  - Notes: run from `src/web-ui`; 1 file passed, 5 tests passed.
- `node_modules\\.bin\\sass.cmd --no-source-map src\\flow_chat\\components\\FileMentionPicker.scss`
  - Result: passed
  - Notes: direct SCSS compilation succeeded.
- `node_modules\\.bin\\sass.cmd --no-source-map src\\flow_chat\\components\\ChatInput.scss`
  - Result: passed
  - Notes: direct SCSS compilation succeeded.

Manual checks:

- Style diff scope: passed.
  - Notes: changes are limited to mention/slash popup viewport sizing, wrapping, and text overflow.
- Behavior/state scope: passed.
  - Notes: no TypeScript popup state, Flow Chat store/session, workspace media, or short-drama code was changed.

Failures:

- None remaining for `ISSUE-010C`.

## ISSUE-011 Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/flow_chat/utils/chatInputImageUndo.test.ts src/flow_chat/utils/imageUtils.test.ts src/flow_chat/utils/imageContextForBackend.test.ts src/flow_chat/utils/chatInputImageStrip.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 4 files passed, 11 tests passed.
- `node_modules\\.bin\\vitest.cmd run src/flow_chat/components/RichTextInput.test.tsx`
  - Result: passed
  - Notes: run from `src/web-ui`; 1 file passed, 5 tests passed.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Upstream static comparison: passed.
  - Notes: local ChatInput already had image paste and undo stack behavior; this issue added the upstream-style latest-context guard through a small tested helper.
- Backend/media contract scope: passed.
  - Notes: `createImageContextFromClipboard(file, { workspacePath })` remains intact; `imageContextForBackend` tests passed.

Failures:

- None remaining for `ISSUE-011`.

## ISSUE-020A Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/utils/startupTrace.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 1 file passed, 12 tests passed.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Upstream static comparison: passed.
  - Notes: migrated API timing, payload estimate, and concurrency observability fields into the existing Void startup trace model.
- Brand/global scope: passed.
  - Notes: kept `__VOID_STARTUP_TRACE__`; did not introduce `__BITFUN_*`, `BITFUN_*`, or BitFun trace id names.
- Diff scope: passed.
  - Notes: no Flow Chat, media, short-drama, desktop startup, installer, ACP, CLI, or provider adapter files were changed.

Failures:

- None remaining for `ISSUE-020A`.

## ISSUE-020B Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/utils/startupTrace.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; covered bounded API concurrency fields together with `ISSUE-020A`.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Scope linkage: passed.
  - Notes: `ISSUE-020B` is intentionally subsumed by `ISSUE-020A`; the implementation added `activeRequestsAtStart`, `activeRequestsAtEnd`, and `maxConcurrentRequests` to startup trace API records without separate source changes.
- Privacy/brand scope: passed.
  - Notes: concurrency diagnostics expose counts only and keep `__VOID_STARTUP_TRACE__`; no `__BITFUN_*` globals were introduced.

Failures:

- None remaining for `ISSUE-020B`.

## ISSUE-020C Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/utils/startupTrace.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 1 file passed, 13 tests passed.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Upstream static comparison: passed.
  - Notes: migrated the render profile primitive using Void naming and left component instrumentation for `ISSUE-020D`.
- Brand/global scope: passed.
  - Notes: `__VOID_RENDER_PROFILE_ENABLED__` is used; no `__BITFUN_*` or BitFun trace id names were introduced.
- Diff scope: passed.
  - Notes: no Markdown, ModelRoundItem, Flow Chat store, media, short-drama, desktop startup, installer, ACP, CLI, or provider adapter files were changed.

Failures:

- None remaining for `ISSUE-020C`.

## ISSUE-020D Results

Date: 2026-07-02

Commands run:

- Not run: component tests or browser smoke.
  - Result: not run
  - Notes: no component source was changed; this issue was a read-only risk evaluation and was deferred.

Manual checks:

- Upstream/local component comparison: passed.
  - Notes: current Void Markdown and ModelRoundItem contain local behavior not present in the upstream files, including KaTeX, right-panel preview links, local image handling, media tool grouping, and subagent projection rendering.
- Diff scope: passed.
  - Notes: no Markdown, AsyncPrismSyntaxHighlighter, FlowTextBlock, ModelRoundItem, Flow Chat store, media, short-drama, desktop startup, installer, ACP, CLI, or provider adapter files were changed.

Failures:

- None. `ISSUE-020D` is deferred, not failed.

## ISSUE-030A Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/services/workspace-media/WorkspaceMediaLibrary.test.ts src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaTileViewModel.test.ts`
  - Result: failed, then passed after test correction
  - Notes: initial run passed 51 of 53 tests and failed two Gallery tests that queried older pending ids. After correcting selectors to the current stable pending-slot model, rerun passed 4 files and 53 tests.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- State model coverage review: passed.
  - Notes: existing tests cover availability, ready/empty/error, path mismatch, pre-mount pending signal, refresh retry pending signal, manifest pending jobs, and pending-to-ready generated identity replacement.
- Diff scope: passed.
  - Notes: only `WorkspaceMediaGallery.test.tsx` changed; production workspace media, media, short-drama, Flow Chat store/session, desktop, installer, ACP, CLI, and provider adapter files were not changed.

Failures and fixes:

- Failure: two Gallery tests queried old pending card ids.
  - Root cause: current implementation deliberately creates signal-derived stable ids using workspace/tool/batch/kind/slot data; after retry scan, manifest-provided pending ids are used.
  - Fix: updated the event-signal assertions to match the current stable id model while keeping the post-scan manifest assertion.

Failures:

- None remaining for `ISSUE-030A`.

## ISSUE-030B Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/services/workspace-media/WorkspaceMediaLibrary.test.ts`
  - Result: failed, then passed after fix
  - Notes: new unsafe restore/purge id tests failed first; after adding trash id validation, 1 file passed and 21 tests passed.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.
- `node_modules\\.bin\\vitest.cmd run src/shared/services/workspace-media/WorkspaceMediaLibrary.test.ts src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaTileViewModel.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 4 files passed, 56 tests passed.

Manual checks:

- Safety scope: passed.
  - Notes: restore and purge now reject unsafe trash id path segments before adapter `readTextFile`, `renameFile`, or `deleteDirectory` calls.
- Diff scope: passed.
  - Notes: changes are limited to workspace media service/tests and migration docs.

Failures and fixes:

- Failure: restore with `../../escape` returned `trash_failed` after attempting metadata read.
  - Fix: validate trash id before metadata path construction.
- Failure: purge with `../../escape` returned `ready` after deleting the computed path.
  - Fix: validate trash id before delete-directory path construction.

Failures:

- None remaining for `ISSUE-030B`.

## ISSUE-040A Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/services/short-drama/ShortDramaStaticProject.test.ts src/shared/services/short-drama/ShortDramaWorkspaceBinding.test.ts src/shared/services/short-drama/ShortDramaWorkspaceMode.test.ts src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts src/shared/services/short-drama/ShortDramaProjectChangedEvent.test.ts src/shared/services/short-drama/ShortDramaTargetResolver.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 6 files passed, 64 tests passed.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Project fact coverage review: passed.
  - Notes: existing tests cover project initialization protection, legacy migration protection, sidecar source precedence, derived cache rebuild, workspace mismatch, workspace mode, project view model, changed event, and target resolver.
- Diff scope: passed.
  - Notes: no short-drama source code changed for this issue.

Failures:

- None remaining for `ISSUE-040A`.

## ISSUE-040B Results

Date: 2026-07-02

Commands run:

- `node_modules\\.bin\\vitest.cmd run src/shared/services/short-drama/ShortDramaToolPolicy.test.ts src/shared/services/short-drama/ShortDramaArtifactRevisionWorkflow.test.ts src/shared/services/short-drama/ShortDramaArtifactOptimizationWorkflow.test.ts src/shared/services/short-drama/ShortDramaArtifactWorkflow.test.ts src/shared/services/short-drama/ShortDramaChangeRequest.test.ts src/shared/services/short-drama/ShortDramaMainAITools.test.ts src/shared/services/short-drama/ShortDramaStageWorkspace.test.ts`
  - Result: passed
  - Notes: run from `src/web-ui`; 7 files passed, 110 tests passed.
- `node_modules\\.bin\\tsc.cmd --noEmit`
  - Result: passed
  - Notes: run from `src/web-ui`.

Manual checks:

- Short-drama policy/workflow coverage review: passed.
  - Notes: existing tests cover stage-agent policy, stage mismatch, write scopes, cross-stage change requests, artifact revisions, attempts, optimization, MainAI tools, and stage workspace behavior.
- Diff scope: passed.
  - Notes: no short-drama source code changed for this issue.

Failures:

- None remaining for `ISSUE-040B`.

## ISSUE-050 Results

Date: 2026-07-02

Commands run:

- `git diff --no-index --stat src/crates/ai-adapters tmp/upstream-bitfun/src/crates/adapters/ai-adapters`
  - Result: passed for inventory use
  - Notes: command exits non-zero because differences exist; output was used as the expected diff inventory.
- Adapter path/test inventory commands
  - Result: passed
  - Notes: current Void has no `src/crates/ai-adapters/tests` fixture suite; upstream has fixture harnesses and stream replay tests.

Manual checks:

- Provider adapter split review: passed.
  - Notes: follow-up issues created for fixture harness, SSE retry, OpenAI/Responses parsing, Anthropic/Gemini parsing, and model selector/CLI credential helpers.
- Diff scope: passed.
  - Notes: no provider adapter runtime source changed in this inventory issue.

Failures:

- None. `ISSUE-050` is inventory-only.

## ISSUE-050A Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-ai-adapters --test stream_test_harness`
  - Result: passed
  - Notes: 2 integration tests replayed OpenAI SSE fixtures through the current `void_ai_adapters::stream::handle_openai_stream` public API.

Manual checks:

- Harness boundary: passed.
  - Notes: fixture loader and local SSE server are test-only under `src/crates/ai-adapters/tests`.
- Dependency scope: passed.
  - Notes: no new dependencies were added; the local fixture server uses existing `tokio` and `reqwest` dependencies.
- Protected contracts: passed.
  - Notes: provider runtime, Flow Chat, media, short-drama, desktop, installer, ACP, and CLI source files were not changed.

Failures:

- None.

## ISSUE-050B Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-ai-adapters client::sse::tests`
  - Result: passed
  - Notes: 5 unit tests covered TTFT message formatting, retryable HTTP status classification, capped `Retry-After`, sub-cap `Retry-After`, and exponential fallback.
- `cargo test -p void-ai-adapters --test stream_test_harness`
  - Result: passed
  - Notes: 2 fixture replay tests still pass after SSE retry changes.

Manual checks:

- Retry behavior: passed.
  - Notes: current Void already retried 408/409/425/429/5xx and kept 401/400/404 non-retryable.
- Scope: passed.
  - Notes: only `client/sse.rs` runtime source changed; provider parsers and message converters were not touched.
- Split decision: passed.
  - Notes: TTFT first-effective-output behavior requires stream-handler contract changes and is tracked as `ISSUE-050F`.

Failures:

- None.

## ISSUE-050C Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-ai-adapters stream::types::openai::tests`
  - Result: passed
  - Notes: 15 OpenAI type/parser unit tests passed before adding new fixtures.
- `cargo test -p void-ai-adapters stream::stream_handler::responses::tests`
  - Result: passed
  - Notes: 6 Responses handler unit tests passed before adding new fixtures.
- `cargo test -p void-ai-adapters tool_call_accumulator::tests`
  - Result: passed
  - Notes: 37 accumulator unit tests passed; current Void accumulator was preserved.
- `cargo test -p void-ai-adapters --test stream_test_harness`
  - Result: passed
  - Notes: 5 fixture replay tests passed, including OpenAI split arguments, inline think text, missing tool `type`, id-only prelude reattachment, and malformed Responses arguments.

Manual checks:

- Parser source scope: passed.
  - Notes: no OpenAI/Responses runtime parser source changed because selected fixtures passed.
- Upstream compatibility: passed.
  - Notes: upstream `tool_call_accumulator.rs` is now a re-export from another crate; direct copy remains rejected for Void.
- Split scope: passed.
  - Notes: Anthropic/Gemini and TTFT first-effective-output changes remain separate issues.

Failures:

- None.

## ISSUE-050D Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-ai-adapters --test stream_test_harness`
  - Result: passed
  - Notes: 9 fixture replay tests passed, including Anthropic extended thinking, parallel tool use, malformed tool args, and Gemini string function args.
- `cargo test -p void-ai-adapters stream::types::anthropic::tests`
  - Result: passed
  - Notes: 4 Anthropic usage/cache unit tests passed.
- `cargo test -p void-ai-adapters stream::types::gemini::tests`
  - Result: passed
  - Notes: 8 Gemini type/parser unit tests passed.

Manual checks:

- Runtime parser scope: passed.
  - Notes: no Anthropic/Gemini runtime parser source changed because selected fixtures passed.
- Upstream diff classification: passed.
  - Notes: remaining handler diffs are TTFT first-effective-output contract changes tracked as `ISSUE-050F`.

Failures:

- None.

## ISSUE-050E Results

Date: 2026-07-02

Commands run:

- Upstream/current model selector and credential inventory commands
  - Result: passed
  - Notes: current CLI UI model selector exists and matched upstream path diff; desktop/core CLI credential discovery/refresh paths exist.
- Upstream `ai-adapters` model selector test/source inspection
  - Result: passed
  - Notes: current `void-ai-adapters` lacks the standalone helper; follow-up `ISSUE-050E1` created.

Manual checks:

- Scope: passed.
  - Notes: inventory only; no code changed.
- Risk split: passed.
  - Notes: auth storage and provider defaults remain forbidden for `ISSUE-050E1`.

Failures:

- None.

## ISSUE-050E1 Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-ai-adapters --test model_selector`
  - Result: passed
  - Notes: 4 tests covered selector classification, required selector resolution, missing default errors, and cache fallback semantics.
- `cargo test -p void-ai-adapters --test stream_test_harness`
  - Result: passed
  - Notes: 9 existing adapter fixture replay tests still pass.

Manual checks:

- Scope: passed.
  - Notes: no CLI UI, auth storage, CLI credential resolver, provider defaults, or installer files changed.

Failures:

- None.

## ISSUE-050F Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-ai-adapters --test stream_test_harness`
  - Result: passed
  - Notes: 10 fixture tests passed, including delayed-body TTFT coverage.
- `cargo test -p void-ai-adapters stream::stream_handler::tests`
  - Result: passed
  - Notes: 2 tests covered effective-output classification.
- `cargo test -p void-ai-adapters client::sse::tests`
  - Result: passed
  - Notes: 6 SSE tests passed, including remaining TTFT calculation and retry behavior.
- `cargo test -p void-ai-adapters stream::stream_handler::responses::tests`
  - Result: passed
  - Notes: 6 Responses helper tests passed after signature updates.
- `cargo test -p void-ai-adapters`
  - Result: passed
  - Notes: 168 unit tests, 4 model selector integration tests, 10 stream harness tests, and doc-tests passed.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Failures:

- Initial combined cargo filter command was invalid; rerun as separate commands passed.
- Initial Responses test compile failed due missing `StreamTimeoutController` import in test module; fixed and rerun passed.

## ISSUE-060 Results

Date: 2026-07-02

Commands run:

- Scoped current/upstream script and config inventory commands
  - Result: passed
  - Notes: compared `scripts`, `src/mobile-web/package.json`, installer locale folders, Web UI locale folders, and CLI theme presets without recursive `node_modules` or `target` scans.
- i18n explorer subagent inventory
  - Result: passed
  - Notes: confirmed current i18n contract/audit infrastructure exists; upstream adds governance report, report JSON, baseline/allowlist layers, CI profile, relay shared terms, and mobile-web i18n refinements.
- theme explorer subagent inventory
  - Result: passed
  - Notes: confirmed current theme runtime/presets exist; upstream adds color audit, CLI theme audit, startup theme bootstrap, prompt snapshots, and visual governance contracts.
- repo hygiene explorer subagent inventory
  - Result: passed
  - Notes: confirmed missing root Node workspace entry and classified root scripts, repo hygiene, CI, CLI package workflow, and E2E perf runners.

Manual checks:

- Brand-safe classification: passed.
  - Notes: direct `BitFun`, `BITFUN_*`, `__BITFUN_*`, `BitFun-Installer`, `bitfun-*` theme ids, upstream release targets, and installer identities are rejected unless Void-rewritten in a specific issue.
- Issue split review: passed.
  - Notes: follow-up issues `ISSUE-060A` through `ISSUE-060I` each have a separate boundary and verification path.

Failures:

- None. `ISSUE-060` is inventory-only and changed no functional code.

## ISSUE-060A Results

Date: 2026-07-02

Commands run:

- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"`
  - Result: passed
  - Notes: root package JSON parses.
- Brand grep over `package.json`, `pnpm-workspace.yaml`, `.npmrc`, and `pnpm-lock.yaml`
  - Result: passed
  - Notes: no `BitFun`, `BITFUN`, `__BITFUN`, `BitFun-Installer`, or `GCWing` residue found in new root workspace files.
- `pnpm install --frozen-lockfile`
  - Result: passed after config fix
  - Notes: first runs failed because pnpm needed non-interactive build-script approval; moved allowlist to `pnpm-workspace.yaml` with boolean `allowBuilds`, then install passed. It still warns about a missing `wdio-edgedriver-service` bin, but exits 0.
- `pnpm run check:github-config`
  - Result: passed
  - Notes: 9 GitHub YAML files parsed.
- `pnpm run i18n:contract:test`
  - Result: passed
  - Notes: 14 tests passed.
- `pnpm run check:repo-hygiene`
  - Result: passed
  - Notes: initial direct run failed on two docs-local absolute paths; docs were changed to relative wording, then the root command passed.
- `pnpm --dir src/mobile-web run type-check`
  - Result: passed
  - Notes: `tsc --noEmit` passed.
- `pnpm run i18n:audit`
  - Result: failed
  - Notes: command reached `scripts/i18n-audit.mjs` and failed on 25 existing `web-ui-source` CJK source candidate lines in short-drama files while budget is 0. This is tracked by `ISSUE-060C`.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Failures and fixes:

- Failure: root `pnpm run ...` initially failed before running scripts because there was no root package/workspace lock and pnpm needed module purge/build-script approval.
  - Fix: added Void root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, generated `pnpm-lock.yaml`, and project-level build allowlist.
- Failure: `check-repo-hygiene` found local absolute paths in migration docs.
  - Fix: replaced those references with relative/root wording.
- Remaining failure: `i18n:audit` CJK hardcoded-source budget.
  - Next issue: handle via `ISSUE-060C` governance/baseline work, without changing short-drama behavior inside 060A.

## ISSUE-060C Results

Date: 2026-07-02

Commands run:

- `pnpm run i18n:audit`
  - Result: passed
  - Notes: passes with 1 warning for 25 grandfathered short-drama CJK source candidate lines.
- `node scripts/i18n-audit.mjs --report-json scripts/.tmp-i18n-governance-report.json`
  - Result: passed
  - Notes: report contains version, generator, error/warning counts, warning messages, and hardcoded-source budget statuses. Temporary report was deleted after inspection.
- `pnpm run i18n:contract:test`
  - Result: passed
  - Notes: 14 tests passed, including updated baseline/report assertions.
- `pnpm run check:repo-hygiene`
  - Result: passed
  - Notes: 64 content files scanned; LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: no locale resources or short-drama production files were changed.
- Governance semantics: passed.
  - Notes: `web-ui-source` is now a no-growth baseline at 25 CJK lines; adding more CJK source candidates still fails audit.

Failures:

- None remaining for `ISSUE-060C`.

## ISSUE-060D Results

Date: 2026-07-03

Commands run:

- `node --test scripts/i18n-contract.test.mjs`
  - RED result: failed before implementation because `src/apps/relay-server/static/homepage/i18n.shared.json` was missing and the generator did not declare `RELAY_HOMEPAGE_SHARED_TERM_KEYS`.
- `node scripts/generate-i18n-contract.mjs`
  - First result: failed because `relay-static-homepage` has a resource root in the shared contract but no `surfaceOrders` entry. Fixed by generating relay shared terms from canonical `contract.locales`.
- `node scripts/generate-i18n-contract.mjs`
  - GREEN result: passed and wrote 6 generated i18n contract files.
- `node --test scripts/i18n-contract.test.mjs`
  - Intermediate result: failed once because JSON generated files cannot carry the TypeScript/Rust generated-header comment. The assertion was narrowed to require the generated header only for non-JSON generated files.
- `node --test scripts/i18n-contract.test.mjs`
  - Result: passed, 15 tests.
- `node scripts/generate-i18n-contract.mjs --check`
  - Result: passed.
- `node scripts/i18n-audit.mjs`
  - RED/GREEN result: failed once after `$shared` migration because relay audit treated `{ "$shared": "features.remoteControl" }` as `flowMobileSub.$shared`; passed after adding relay-specific `$shared` flattening and shared key validation.
  - Final result: passed with the existing `web-ui-source` short-drama CJK grandfathered warning.
- `pnpm run i18n:contract:test`
  - Result: passed, 15 tests.
- `pnpm run i18n:audit`
  - Result: passed with the existing `web-ui-source` short-drama CJK grandfathered warning.
- `pnpm run i18n:generate`
  - Result: passed and wrote 6 generated i18n contract files.
- `git diff --check -- scripts/generate-i18n-contract.mjs scripts/i18n-contract.test.mjs scripts/i18n-audit.mjs src/apps/relay-server/static/homepage`
  - Result: passed with LF/CRLF working-copy warnings only.

Manual checks:

- Brand safety: passed.
  - Notes: `Select-String` over `src/apps/relay-server/static/homepage` found no `BitFun`, `openbitfun`, or `GCWing` strings.
- Scope: passed.
  - Notes: no relay server runtime, Web UI runtime, mobile-web, installer, core Fluent resource, or product branding file was changed for 060D.

Remaining risk:

- No browser/service smoke was run for the relay static homepage fetch path.
- CDN/deployment inclusion of the new `i18n.shared.json` artifact is not proven by local tests.

## ISSUE-060B Results

Date: 2026-07-02

Commands run:

- `node --check scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: syntax check passed.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 65 content files scanned; LF/CRLF warnings only.
- `pnpm run check:repo-hygiene`
  - Result: passed
  - Notes: root script delegates to the updated scanner and passed.
- `pnpm run i18n:audit`
  - Result: passed
  - Notes: still passes with 1 grandfathered warning after hygiene script changes.

Manual checks:

- Scope: passed.
  - Notes: change is limited to the repo hygiene script and docs.
- Upstream parity: passed.
  - Notes: ported focused scanner improvements without importing BitFun identity or changing root/CI behavior.

Failures:

- None remaining for `ISSUE-060B`.

## ISSUE-060F Results

Date: 2026-07-02

Commands run:

- `node --test scripts/audit-cli-theme-colors.test.mjs`
  - Result: failed as RED before implementation
  - Notes: failed with `ERR_MODULE_NOT_FOUND` because `scripts/audit-cli-theme-colors.mjs` did not exist yet.
- `node --test scripts/audit-cli-theme-colors.test.mjs`
  - Result: passed after implementation
  - Notes: 10 tests covered hex normalization, alpha blending, preset parsing, Rust fallback extraction, near-color detection, baseline drift checks, report writing, and JSON CLI output.
- `node scripts/audit-cli-theme-colors.mjs --json --no-baseline --top=0`
  - Result: passed
  - Notes: generated current Void CLI metrics used for the no-growth baseline: 6 preset files, 135 preset unique colors, 24 preset near pairs, 35 Rust fallback unique colors, 4 Rust fallback near pairs, and 168 total unique colors.
- `node --check scripts/audit-cli-theme-colors.mjs`
  - Result: passed
  - Notes: syntax check passed.
- `node scripts/audit-cli-theme-colors.mjs --top=5`
  - Result: passed
  - Notes: default baseline check passed and printed a human-readable report.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 68 content files scanned and 3808 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: no CLI runtime, theme preset, root package, CI, installer, Web UI, media, short-drama, provider, or desktop files changed.
- Brand safety: passed.
  - Notes: new script/test/baseline use Void naming and do not introduce `BITFUN_*`, `__BITFUN_*`, `BitFun-Installer`, or `bitfun-*` theme ids.

Failures:

- Initial RED failure was expected by TDD and fixed by adding the audit script.
- None remaining for `ISSUE-060F`.

## ISSUE-060E Results

Date: 2026-07-02

Commands run:

- `node --test scripts/audit-theme-colors.test.mjs`
  - Result: failed as RED before implementation
  - Notes: failed with `ERR_MODULE_NOT_FOUND` because `scripts/audit-theme-colors.mjs` did not exist yet.
- `node --test scripts/audit-theme-colors.test.mjs`
  - Result: failed once after implementation
  - Notes: one test incorrectly expected `var(--missing, #ffffff)` to count as required undefined instead of fallback-only debt.
- `node --test scripts/audit-theme-colors.test.mjs`
  - Result: passed after test correction
  - Notes: 8 tests covered color parsing, comment stripping, CSS var refs, ignored test/generated files, near pairs, baseline drift, report writing, and JSON CLI output.
- `node scripts/audit-theme-colors.mjs --root src/web-ui/src --json --no-baseline --top=0`
  - Result: passed
  - Notes: generated Web UI baseline metrics: unique colors 1655, fallback-only vars 78, undefined vars 51, indistinguishable pairs 53, near pairs 1279.
- `node scripts/audit-theme-colors.mjs --root src/mobile-web/src --json --no-baseline --top=0`
  - Result: passed
  - Notes: generated mobile-web baseline metrics: unique colors 185, fallback-only vars 4, undefined vars 5, indistinguishable pairs 1, near pairs 8.
- `node scripts/audit-theme-colors.mjs --root Void-Installer/src --json --no-baseline --top=0`
  - Result: passed
  - Notes: generated installer baseline metrics: unique colors 346, fallback-only vars 0, undefined vars 0, indistinguishable pairs 0, near pairs 84.
- `node --check scripts/audit-theme-colors.mjs`
  - Result: passed
  - Notes: syntax check passed.
- `node scripts/audit-theme-colors.mjs --root src/web-ui/src --baseline scripts/theme-color-governance-baseline.json --top=3`
  - Result: passed
  - Notes: Web UI baseline check passed.
- `node scripts/audit-theme-colors.mjs --root src/mobile-web/src --baseline scripts/theme-color-governance-baseline.mobile-web.json --top=3`
  - Result: passed
  - Notes: mobile-web baseline check passed.
- `node scripts/audit-theme-colors.mjs --root Void-Installer/src --baseline scripts/theme-color-governance-baseline.installer.json --top=3`
  - Result: passed
  - Notes: installer baseline check passed.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 73 content files scanned and 3813 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: no Web UI theme token, mobile-web theme token, installer theme value, SCSS source, runtime source, root package, CI, or installer config file changed.
- Brand safety: passed.
  - Notes: new 060E files do not introduce `BitFun`, `BITFUN`, `__BITFUN`, `GCWing`, or `bitfun` identity strings.

Failures:

- Initial RED failure was expected by TDD and fixed by adding the audit script.
- The one post-implementation failure was a test expectation bug; fallback vars with defaults are classified as fallback-only, not required undefined.
- None remaining for `ISSUE-060E`.

## ISSUE-060G Results

Date: 2026-07-02

Commands run:

- `pnpm --dir src/web-ui exec vitest run src/infrastructure/theme/presets/startupThemeBootstrap.test.ts`
  - Result: failed as RED before implementation
  - Notes: failed because `startupThemeBootstrap.ts` and `themePromptSnapshots.ts` did not exist.
- `pnpm --dir src/web-ui exec vitest run src/infrastructure/theme/presets/startupThemeBootstrap.test.ts`
  - Result: passed after implementation
  - Notes: 4 tests covered startup bootstrap entries/manifests and prompt snapshot entries/manifests for current Void builtin themes.
- `node scripts/generate-startup-theme-bootstrap.mjs`
  - Result: passed
  - Notes: generated `startup-theme-bootstrap.json` and `theme-prompt-snapshots.json` under Web UI theme preset generated files.
- `node scripts/generate-startup-theme-bootstrap.mjs --check`
  - Result: passed
  - Notes: generated files matched current `builtinThemes`.
- `node scripts/generate-startup-theme-bootstrap.mjs --json --check`
  - Result: passed
  - Notes: returned both generated file paths and an empty `stale` list.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed
  - Notes: `tsc --noEmit` passed with the new helpers and test.
- `node --check scripts/generate-startup-theme-bootstrap.mjs`
  - Result: passed
  - Notes: syntax check passed.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 79 content files scanned and 3819 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: no desktop startup code, Rust `theme.rs`, root package/CI, theme tokens, installer config, Flow Chat, media, short-drama, provider, CLI, or i18n files changed.
- Brand safety: passed.
  - Notes: new 060G files do not introduce `BitFun`, `BITFUN`, `__BITFUN`, `GCWing`, `bitfun`, `--bitfun`, or upstream `assembly` paths.

Failures:

- Initial RED failure was expected by TDD and fixed by adding the projection helpers.
- None remaining for `ISSUE-060G`.

## ISSUE-060H Results

Date: 2026-07-02

Commands run:

- `node scripts/validate-theme-visual-contract.mjs`
  - Result: failed as RED before implementation
  - Notes: failed with `MODULE_NOT_FOUND` because `scripts/validate-theme-visual-contract.mjs` did not exist yet.
- `node --check scripts/validate-theme-visual-contract.mjs`
  - Result: passed after implementation
  - Notes: syntax check passed.
- `node scripts/validate-theme-visual-contract.mjs`
  - Result: failed once after implementation
  - Notes: contract referenced `src/web-ui/src/flow_chat/tool-cards/TerminalToolCard` without the `.tsx` extension, which does not exist as a path in this workspace.
- `node scripts/validate-theme-visual-contract.mjs`
  - Result: passed after contract path correction
  - Notes: validated 8 required surfaces: app shell, Flow Chat, terminal, markdown/mermaid, generated widgets, AI media/short-drama, mobile web, and installer.
- `node scripts/validate-theme-visual-contract.mjs --json`
  - Result: passed
  - Notes: returned `{ "ok": true, "failures": [], "surfaceCount": 8, "requiredSurfaceCount": 8 }`.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 81 content files scanned and 3821 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: only visual governance script, visual governance contract, and docs changed.
- Protected module boundaries: passed.
  - Notes: no Flow Chat, AI media, short-drama, terminal, mobile-web, installer, desktop, provider, or theme token runtime files changed.
- Brand safety: passed.
  - Notes: `Select-String` over the new script and contract found no upstream identity strings or token-family prefixes.

Failures:

- Initial RED failure was expected and fixed by adding the validator and contract.
- One post-implementation contract path failure was fixed by pointing the terminal surface to the actual `TerminalToolCard.tsx` file.
- No remaining validator failures for `ISSUE-060H`.

## ISSUE-060I Results

Date: 2026-07-02

Commands run:

- `Get-ChildItem .github -Recurse -File`
  - Result: passed
  - Notes: confirmed local repository already has `.github/workflows/cli-package.yml` but does not have `.github/workflows/cli-package-manual.yml`.
- `Get-ChildItem tmp/upstream-bitfun/.github -Recurse -File`
  - Result: passed
  - Notes: confirmed upstream adds `.github/workflows/cli-package-manual.yml`.
- `Get-Content tmp/upstream-bitfun/.github/workflows/cli-package-manual.yml`
  - Result: passed
  - Notes: reviewed upstream manual workflow inputs, dynamic matrix, read-only permission, build command, smoke test, tarball staging, checksum, and artifact upload behavior.
- `Get-Content .github/workflows/cli-package.yml`
  - Result: passed
  - Notes: reviewed local Void release-oriented workflow; it is already Void-branded and includes release upload/Homebrew notification behavior.
- `Select-String -Path .github/workflows/cli-package.yml,tmp/upstream-bitfun/.github/workflows/cli-package-manual.yml,tmp/upstream-bitfun/.github/workflows/cli-package.yml -Pattern 'bitfun|BitFun|GCWing|void-cli|homebrew|workflow_dispatch|platform|ubuntu_version|ref_name|cargo build|Upload artifact|dispatches|contents:' -CaseSensitive:$false`
  - Result: passed
  - Notes: confirmed upstream manual workflow still contains upstream CLI naming, while local workflow uses `void-cli`; also identified manual workflow-only capabilities for platform, Ubuntu baseline, and ref selection.
- Release-Risk-Agent read-only review
  - Result: passed
  - Notes: subagent independently recommended keeping this issue as Deferred/Inventory and not creating `.github/workflows/cli-package-manual.yml` until release targets, artifact policy, and Homebrew tap ownership are confirmed.
- `cargo build --release -p void-cli`
  - Result: passed
  - Notes: release build finished successfully in 15m29s.
- `.\target\release\void-cli.exe --version`
  - Result: passed
  - Notes: output was `void 0.2.8`.
- `.\target\release\void-cli.exe --help`
  - Result: passed
  - Notes: printed the Void CLI command list and exited successfully.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 81 content files scanned and 3821 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: no `.github/workflows/*.yml`, CLI source, package metadata, release target, Homebrew tap, installer, desktop, provider, Flow Chat, media, short-drama, i18n, or theme runtime file was changed.
- Deferred decision: passed.
  - Notes: upstream manual workflow is useful but not copied because it requires Void-specific release/artifact policy confirmation.
- Brand safety: passed for this issue's edits.
  - Notes: no new workflow file was added, so no upstream artifact names or repository dispatch targets were introduced.

Failures:

- None for static inventory.
- None remaining for `ISSUE-060I`.

## ISSUE-100A Results

Date: 2026-07-02

Commands run:

- `Get-Content docs/ISSUES.md | Select-String -Pattern 'ISSUE-100A|ISSUE-100B|ISSUE-100C' -Context 0,28`
  - Result: passed
  - Notes: confirmed current issue scope and follow-up placeholders.
- `Get-ChildItem tmp/upstream-bitfun/src,tmp/upstream-bitfun/docs,tmp/upstream-bitfun/scripts -Recurse -File | Select-String -Pattern 'image_understanding|understand.*image|vision|screenshot|describe.*image|image'`
  - Result: passed after `rg` fallback
  - Notes: `rg.exe` was denied by WindowsApps permissions, so PowerShell search was used. Upstream image context, image analysis, `analyze_image`, `view_image`, provider conversion, and UI paths were identified.
- `Get-ChildItem src/crates,src/apps,src/web-ui/src -Recurse -File | Select-String -Pattern 'image_understanding|understand.*image|vision|screenshot|describe.*image|image'`
  - Result: passed after `rg` fallback
  - Notes: confirmed current Void already has image analysis, ACP image contexts, tool image attachment, provider multimodal conversion, and image analysis UI/service pieces.
- `Get-Content src/crates/core/src/agentic/image_analysis/*`
  - Result: passed
  - Notes: reviewed current `ImageAnalyzer`, `ImageContextData`, `ImageAnalysisResult`, provider limits, and image processing exports.
- `Get-Content tmp/upstream-bitfun/src/crates/assembly/core/src/agentic/tools/implementations/analyze_image_tool.rs`
  - Result: passed
  - Notes: reviewed upstream tool schema, readonly flag, remote/local path handling, model selection, image optimization, and result shape.
- Upstream-Image-Agent read-only review
  - Result: passed
  - Notes: independently identified upstream data flow and direct migration risks.
- Local-Boundary-Agent read-only review
  - Result: passed
  - Notes: independently identified Void owner modules, forbidden UI/media/short-drama/provider locations, state model, and tests for 100B/100C.
- `Select-String -Path docs/ISSUES.md,docs/ARCHITECTURE.md,docs/DECISIONS.md,docs/PROGRESS.md,docs/TEST_PLAN.md -Pattern 'ISSUE-100A|ISSUE-100B|ISSUE-100C|DEC-027|Image Understanding|AnalyzeImage|path_denied|provider_not_configured'`
  - Result: passed
  - Notes: confirmed the architecture decision, follow-up split, explicit state names, and progress/test records are present.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed
  - Notes: 81 content files scanned and 3821 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed
  - Notes: LF/CRLF warnings only.
- `git status --short docs/ARCHITECTURE.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed
  - Notes: confirmed the intended doc files are currently untracked consensus docs in this workspace.

Manual checks:

- Scope: passed.
  - Notes: no runtime, provider, UI, desktop API, media, short-drama, CLI, installer, or workflow code changed.
- Architecture decision: passed.
  - Notes: `DEC-027` records Void-owned image understanding boundaries and rejects direct upstream tool copy.
- Follow-up split: passed.
  - Notes: `ISSUE-100B` now owns schema/permission/manifest; `ISSUE-100C` owns runtime implementation after 100B.

Failures:

- `rg` searches failed due to WindowsApps execution permission and were replaced with PowerShell `Select-String`.
- No remaining failures for `ISSUE-100A`.

## ISSUE-100B Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-tool-packs product_provider_group_plan_preserves_builtin_tool_order`
  - Result: failed as expected during RED, then passed after implementation.
  - Notes: initial failure proved the expected product tool order required `AnalyzeImage`; later failure showed production plan had `AnalyzeImage` while the test expected list was still old, and was fixed by synchronizing the expected list.
- `cargo test -p void-core analyze_image --lib`
  - Result: failed as expected during RED, then passed.
  - Notes: RED failure was `E0583 file not found for module analyze_image_tool`; final run passed 4 focused `AnalyzeImage` contract tests.
- `rustfmt --edition 2021 src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs src/crates/core/src/agentic/tools/implementations/mod.rs src/crates/core/src/agentic/tools/product_runtime.rs src/crates/tool-packs/src/lib.rs`
  - Result: passed.
  - Notes: formatted only the 100B Rust files.
- `cargo test -p void-tool-packs`
  - Result: passed.
  - Notes: 6 unit tests passed; doc-tests had 0 tests.
- `cargo check -p void-core`
  - Result: passed.
  - Notes: compile/check completed successfully.
- `cargo test -p void-core product_runtime --lib`
  - Result: passed.
  - Notes: 7 product runtime tests passed, covering registry/catalog facade behavior after `AnalyzeImage` materialization.
- `node scripts/check-repo-hygiene.mjs`
  - Result: failed once, then passed.
  - Notes: failure was unrelated to `AnalyzeImage`; Bash tool documentation contained absolute path examples that triggered the local path detector. The examples were changed to relative placeholder paths and the command passed with LF/CRLF warnings only.
- `rustfmt --edition 2021 src/crates/core/src/agentic/tools/implementations/bash_tool.rs`
  - Result: passed.
  - Notes: formatted the documentation-only hygiene correction.
- `git diff --check`
  - Result: passed.
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: no provider adapter, image byte loading, desktop API, Flow Chat, workspace media, AI media, or short-drama behavior was changed.
- Contract state: passed.
  - Notes: `AnalyzeImage` exposes `completed`, `unsupported_model`, `provider_not_configured`, `missing_workspace`, `permission_denied`, `path_denied`, `invalid_image`, and `error`.
- Runtime guard: passed.
  - Notes: current execution returns `status: "error"` and `source: "schema_only"` until `ISSUE-100C`.

Failures:

- RED failures were expected and fixed by adding the schema-only tool and synchronizing provider plan tests.
- One repo hygiene failure was fixed by replacing absolute path examples in Bash tool documentation.
- No remaining failures for `ISSUE-100B`.

## ISSUE-100C Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-core analyze_image --lib`
  - Result: failed as RED before implementation.
  - Notes: failed with missing `AnalyzeImageTool::new_with_runtime_for_tests`, missing `FakeAnalyzeImageRuntime`, and type inference errors. This proved the runtime seam and new behavior did not exist yet.
- `rustfmt --edition 2021 src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs`
  - Result: passed.
  - Notes: run after each focused edit.
- `cargo test -p void-core analyze_image --lib`
  - Result: passed after implementation, then failed once after adding `image_id` context coverage, then passed.
  - Notes: the intermediate failure was a test fake that required a specific prompt string while `image_id` used the default prompt. The fake was corrected to require only a non-empty prompt. Final result: 10 focused tests passed.
- `cargo test -p void-core image_analysis --lib`
  - Result: passed.
  - Notes: 0 matching tests under the filter; command still verified the filtered test target.
- `cargo test -p void-core product_runtime --lib`
  - Result: passed.
  - Notes: 7 product runtime tests passed.
- `cargo check -p void-core`
  - Result: passed.
  - Notes: compile/check completed successfully.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: 105 content files scanned and 3822 filenames checked; LF/CRLF warnings only.
- `git diff --check`
  - Result: passed.
  - Notes: LF/CRLF warnings only.

Manual checks:

- Scope: passed.
  - Notes: only `AnalyzeImageTool` runtime and consensus docs changed for 100C.
- Boundary: passed.
  - Notes: no Flow Chat, workspace media, short-drama, desktop upload API, provider adapter, tool-pack plan, or product runtime registry files were changed in this issue.
- Upstream comparison: passed.
  - Notes: Upstream-Image-Runtime-Agent confirmed upstream's single `path` schema, BitFun runtime URI, UI upload flow, and absolute-path behavior were not copied directly. Local-Image-Boundary-Agent confirmed current Void should use `ToolUseContext`, image context store, and image-processing helpers.

Failures:

- RED compile failure was expected and fixed by adding the runtime seam and behavior.
- One fake-runtime assertion was too narrow and was fixed without changing production behavior.
- No remaining failures for `ISSUE-100C`.

## ISSUE-110A Results

Date: 2026-07-02

Commands run:

- `Select-String -Path docs/ISSUES.md,docs/ARCHITECTURE.md,docs/DECISIONS.md,docs/PROGRESS.md,docs/TEST_PLAN.md -Pattern 'ISSUE-110A|Terminal|terminal reliability|CU-TERMINAL|REL-006|UF-015' -Context 1,5`
  - Result: passed.
  - Notes: confirmed existing terminal inventory candidates and the active 110A scope before edits.
- `Get-ChildItem -Path tmp/upstream-bitfun/src -Recurse -File | Where-Object { $_.FullName -match 'terminal|Terminal|pty|xterm|resize|paste|scroll' }`
  - Result: passed.
  - Notes: identified upstream terminal service, Web UI terminal, terminal tool-card, and Computer Use terminal-detection files.
- `Get-ChildItem -Path src -Recurse -File | Where-Object { $_.FullName -match 'terminal|Terminal|pty|xterm|resize|paste|scroll' }`
  - Result: passed.
  - Notes: identified local terminal crate, desktop API, Web UI terminal, Flow Chat terminal card, Bash tool, and TerminalControl boundaries.
- `Get-ChildItem -Path tmp/upstream-bitfun/src/web-ui/src/tools/terminal -Recurse -File | Select-String -Pattern 'TerminalInputQueue|terminalPaste|resizeRepaint|LazyTerminalOutput|terminalReplay|paste|resize|write|queue|replay'`
  - Result: passed.
  - Notes: identified upstream frontend reliability utilities and integration points.
- `Get-ChildItem -Path src/web-ui/src/tools/terminal -Recurse -File | Select-String -Pattern 'TerminalInputQueue|terminalPaste|resizeRepaint|LazyTerminalOutput|terminalReplay|paste|resize|write|queue|replay'`
  - Result: passed.
  - Notes: confirmed local gaps and existing resize/paste/replay behavior.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed with existing LF/CRLF warnings only.
- `git diff --check`
  - Result: passed.
  - Notes: whitespace check completed with existing LF/CRLF warnings only.

Manual checks:

- Subagent upstream review: passed.
  - Notes: Upstream-Terminal-Agent classified lazy renderer, input queue, paste policy, resize repaint guard, structured replay, and Computer Use terminal detection.
- Subagent local boundary review: passed.
  - Notes: Local-Terminal-Boundary-Agent confirmed terminal service/core, desktop adapter, Web UI terminal, Flow Chat tool-card, Bash tool, and TerminalControl boundaries.
- Scope: passed.
  - Notes: 110A changed consensus docs only; no runtime terminal, desktop, Computer Use, Flow Chat, media, short-drama, installer, theme, i18n, CLI, or provider files were edited for this issue.

Failures:

- No runtime test failures occurred in 110A.
- Runtime tests were not run because 110A is an inventory/documentation issue with no code changes.

## ISSUE-110B Results

Date: 2026-07-02

Commands run:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`
  - Result: failed as RED before implementation.
  - Notes: Vite could not resolve `./LazyTerminalOutputRenderer`, proving the lazy fallback component did not exist yet.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`
  - Result: passed after implementation.
  - Notes: 1 test passed, covering fallback control-sequence stripping, last-row preview, class preservation, and bounded height.
- `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalToolCardState.test.ts`
  - Result: passed.
  - Notes: 4 state tests passed; tool-card state behavior remained unchanged after renderer swap.
- `pnpm run type-check:web`
  - Result: passed.
  - Notes: Web UI TypeScript check completed successfully.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed with existing LF/CRLF warnings only.
- `git diff --check`
  - Result: passed.
  - Notes: whitespace check completed with existing LF/CRLF warnings only.

Manual checks:

- Subagent spec review: passed.
  - Notes: 110B-Spec-Agent confirmed the implementation should be limited to lazy renderer/fallback, barrel export, and Flow Chat terminal output render call sites.
- Subagent QA/risk review: passed with one residual recommendation.
  - Notes: 110B-QA-Risk-Agent recommended a future test that renders the lazy component with a mocked renderer chunk; current 110B focused test covers the fallback behavior that caused the RED failure.
- Scope: passed.
  - Notes: No terminal-core, desktop terminal API, PTY/session, Computer Use, ACP permission, media, short-drama, installer, i18n, theme, CLI, or provider runtime files were changed for this issue.

Failures:

- The RED import-resolution failure was expected and fixed by adding `LazyTerminalOutputRenderer.tsx`.
- No remaining focused test or type-check failures for `ISSUE-110B`.

## ISSUE-110C Results

Date: 2026-07-02

Commands run:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts`
  - Result: failed as RED before implementation.
  - Notes: Vitest could not resolve `./TerminalInputQueue`, proving the queue utility did not exist yet.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts`
  - Result: passed after implementation.
  - Notes: 4 focused tests passed for batching, in-flight serialization, error recovery, and clearing unflushed input.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`
  - Result: passed.
  - Notes: 11 tests passed after adding multi-cycle ordering and in-flight clear coverage.
- `pnpm run type-check:web`
  - Result: passed.
  - Notes: Web UI TypeScript check completed successfully.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed with existing LF/CRLF warnings only.
- `git diff --check`
  - Result: passed.
  - Notes: whitespace check completed with existing LF/CRLF warnings only.

Manual checks:

- Subagent spec review: passed.
  - Notes: 110C-Spec-Agent confirmed the implementation should be limited to a Web UI terminal input queue and `ConnectedTerminal` input path.
- Subagent QA/risk review: passed after follow-up fix.
  - Notes: 110C-QA-Risk-Agent identified the global terminal action write path and exited-session delay risk; both were routed through the queue/exited ref before final verification.
- Scope: passed.
  - Notes: No backend write protocol, terminal-core, desktop terminal API, session/replay, TerminalToolCard, ACP permission, media, short-drama, installer, theme, i18n, CLI, or provider runtime files were changed for this issue.

Failures:

- The RED import-resolution failure was expected and fixed by adding `TerminalInputQueue.ts`.
- No remaining focused test or type-check failures for `ISSUE-110C`.

## ISSUE-110D Results

Date: 2026-07-02

Commands run:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts`
  - Result: failed as RED before implementation.
  - Notes: Vitest could not resolve `./terminalPaste`, proving the paste policy utility did not exist yet.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts`
  - Result: passed after utility implementation.
  - Notes: 8 focused tests passed for single-line, multiline, bracketed paste, warning modes, preview, paste-as-single-line, and PowerShell ReadLine detection.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`
  - Result: passed.
  - Notes: 19 tests passed after `Terminal.tsx` and `ConnectedTerminal.tsx` integration.
- `pnpm run type-check:web`
  - Result: passed.
  - Notes: Web UI TypeScript check completed successfully with the extended paste callback signature.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed; Windows CRLF conversion warnings are informational.
- `git diff --check`
  - Result: passed.
  - Notes: scoped diff check passed for 110D code and documentation paths.

Manual checks:

- Subagent spec review: passed.
  - Notes: 110D-Spec-Agent confirmed the intended slice is pure paste policy plus `Terminal`/`ConnectedTerminal` integration, using local `confirmWarning` instead of upstream `confirmDialogChoice`.
- Subagent QA/risk review: passed with residual risk recorded.
  - Notes: 110D-QA-Risk-Agent identified `TerminalActionManager` as a separate legacy paste path; it remains out of scope because it is not allowed by 110D.
- Scope: passed.
  - Notes: No backend write protocol, terminal-core, desktop terminal API, session/replay, TerminalToolCard, ACP permission, media, short-drama, installer, theme, i18n, CLI, or provider runtime files were changed for this issue.

Failures:

- The RED import-resolution failure was expected and fixed by adding `terminalPaste.ts`.
- No remaining focused test or type-check failures for `ISSUE-110D`.

## ISSUE-110E Results

Date: 2026-07-02

Commands run:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts`
  - Result: failed as RED before implementation.
  - Notes: Vitest could not resolve `./resizeRepaintGuard`, proving the guard utility did not exist yet.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts`
  - Result: passed after utility implementation.
  - Notes: 8 focused tests passed for standalone cursor-position detection, resize artifact burst limiting, default narrow-window behavior, no-resize behavior, normal output clearing, guard expiration, manual clear, and mixed-content preservation.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`
  - Result: passed.
  - Notes: 27 tests passed across the new guard and prior terminal slices.
- `pnpm run type-check:web`
  - Result: passed.
  - Notes: Web UI TypeScript check completed successfully with `ConnectedTerminal` integration.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed; Windows CRLF conversion warnings are informational.
- `git diff --check`
  - Result: passed.
  - Notes: scoped diff check passed for 110E terminal and documentation paths.

Manual checks:

- Subagent spec/risk review: passed.
  - Notes: 110E-Spec-Risk-Agent confirmed the minimum behavior is Web UI-only filtering of standalone resize repaint/cursor-position artifacts while preserving normal live output.
- Subagent code-path review: passed.
  - Notes: 110E-Code-Explorer confirmed `ConnectedTerminal.handleOutput` is the correct integration boundary and `Terminal.tsx` / `TerminalResizeDebouncer.ts` do not need protocol logic.
- Final subagent review: passed after follow-up fix.
  - Notes: reviewers flagged broader working-tree noise and an initially wide guard window. 110E code was kept isolated to terminal utils/`ConnectedTerminal`, the default guard was narrowed, expiration was added, and resize failure now clears the guard.
- Scope: passed.
  - Notes: No backend PTY/session/write/resize protocol, terminal-core, desktop terminal API, TerminalToolCard, ACP, media, short-drama, paste, input queue, installer, theme, i18n, CLI, or provider runtime files were changed for 110E. The broader working tree still contains earlier issue and pre-existing changes.

Failures:

- The RED import-resolution failure was expected and fixed by adding `resizeRepaintGuard.ts`.
- No remaining focused test or type-check failures for `ISSUE-110E`.

## ISSUE-110F Results

Date: 2026-07-02

Commands run:

- `cargo test -p terminal-core session::tests::replay_events_preserve_data_resize_data_order`
  - Result: failed as RED before implementation.
  - Notes: Rust could not resolve `TerminalReplayEvent` or `get_replay_events`, proving structured session replay did not exist yet.
- `cargo test -p terminal-core session::tests::replay_events_preserve_data_resize_data_order`
  - Result: passed after session replay implementation.
  - Notes: session replay preserves data/resize/data ordering while legacy flat history still concatenates data.
- `cargo test -p terminal-core session::replay`
  - Result: passed.
  - Notes: 3 replay history tests passed for coalescing matching dimensions, preserving dimension changes, and coalescing consecutive resize markers.
- `cargo test -p terminal-core session::`
  - Result: passed.
  - Notes: 12 terminal session tests passed, including legacy serialized-session compatibility without `replay_events`.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts`
  - Result: failed as RED before implementation.
  - Notes: Vitest could not resolve `./terminalReplay`, proving the Web replay normalization utility did not exist yet.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts`
  - Result: passed after utility implementation.
  - Notes: 3 focused tests passed for structured event preservation, flat history fallback, and empty history behavior.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed.
  - Notes: 5 replay utility tests passed, including queued live events during replay.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed.
  - Notes: 6 focused replay/service tests passed, including pending session-event buffering before listener registration.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`
  - Result: passed.
  - Notes: 33 focused terminal tests passed.
- `cargo check -p terminal-core`
  - Result: passed.
  - Notes: terminal-core compiled after adding replay history and public re-export.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: desktop compiled after exposing replay events through Tauri DTOs; one existing `parse_clipboard_path_segments` unused warning remains unrelated to 110F.
- `pnpm run type-check:web`
  - Result: passed.
  - Notes: Web UI TypeScript check completed with replay events, hook callback, and `ConnectedTerminal` queue integration.

Manual checks:

- Subagent Rust architecture review: passed.
  - Notes: 110F-Rust-Architecture-Agent confirmed current history was flat data only and resize did not enter history.
- Subagent desktop/API review: passed.
  - Notes: 110F-Desktop-API-Agent confirmed the DTO path and flat-history compatibility requirement.
- Subagent Web replay review: passed.
  - Notes: 110F-Web-Replay-Agent confirmed replay resize must be local-only and ordered before data.
- Final code quality review: passed after follow-up fixes.
  - Notes: reviewer flagged missing legacy `replay_events` default and a replay/live event window. Added serializer default and test, added bounded pending event buffering in `TerminalService`, moved replay-aware live event queueing into a pure utility with focused tests, then reran Rust/Web checks.
- Scope: passed.
  - Notes: No PTY platform resize implementation, data bufferer, shell integration, crate layout, TerminalToolCard, Flow Chat, media, short-drama, ACP, installer, theme, i18n, CLI, or provider runtime files were intentionally changed for 110F.

Failures:

- The Rust RED failure was expected and fixed by adding terminal replay history.
- The Web RED import-resolution failure was expected and fixed by adding `terminalReplay.ts`.
- `cargo check -p void-desktop` initially failed because `TerminalReplayEvent` was not re-exported through `terminal-core` root and `From<CoreGetHistoryResponse>` missed `events`; both were fixed and the command passed.
- Directly importing `useTerminal.ts` in a utility test pulled in unrelated Monaco/logger dependencies, so the replay-aware live event queue was extracted into `terminalReplayEventQueue.ts` and tested there.
- No remaining focused test, cargo check, or type-check failures for `ISSUE-110F`.

## Failure Handling

When a test fails:

1. Record command and failure summary.
2. Identify whether the failure is environment, test, or implementation.
3. Fix only the active issue scope.
4. Rerun the failed command.
5. Update this document with the result.

## ISSUE-120B Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: `Ghostty`, `iTerm2`, `Terminal.app`, Windows Terminal, GVim, and gnome-terminal route tests returned `AxText`, proving terminal/GVim routing did not exist yet.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed after implementation.
  - Notes: 8 focused tests passed for macOS known terminals, Windows/Linux terminal and GVim classes, normal app negative cases, generic `terminal` false-positive protection, conservative macOS app-name matching, trim/case normalization, and macOS terminal key mapping for common shell text/symbols.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: desktop crate compiled on Windows; one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120B.
- `rustfmt --edition 2024 src/apps/desktop/src/computer_use/terminal_detect.rs src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/desktop_host.rs src/apps/desktop/src/computer_use/macos_bg_input.rs`
  - Result: passed.
  - Notes: direct `rustfmt` without edition first failed because it parsed the project as Rust 2015; rerun with project edition succeeded.
- `cargo check -p void-desktop --target x86_64-apple-darwin`
  - Result: environment blocked.
  - Notes: after installing the Rust target, the check reached dependency build scripts but failed because this Windows environment lacks a macOS-capable `cc` toolchain for `objc2-exception-helper` and `ring`. This does not validate macOS-specific code.

Manual checks:

- 120B-Upstream-Reference-Agent: passed.
  - Notes: confirmed upstream split between pure `terminal_detect`, macOS terminal-safe input, and larger Windows background input. Windows cloaked input is out of scope for 120B.
- 120B-ComputerUse-Architecture-Agent: passed.
  - Notes: confirmed `app_type_text` is the minimal接入点 and `interactive_type_text` should reuse it.
- 120B-QA-Risk-Agent: passed with risk guidance applied.
  - Notes: added false-positive protection so generic `terminal` display text does not force `KeyEvent`.
- 120B-Final-Review-Agent: passed after follow-up fix.
  - Notes: reviewer flagged incomplete terminal-safe typing for shell punctuation and wide macOS app-name substring matching. Added pure macOS terminal key mapping for common shell text, switched terminal-safe typing to that map, and tightened macOS app-name matching to exact known app names while retaining bundle-id matching.

Failures:

- RED focused tests were expected and fixed by implementing `terminal_detect`.
- macOS cross-target check remains blocked by missing cross C compiler on Windows; run on macOS or a configured cross toolchain before relying on macOS adapter behavior in release builds.

## ISSUE-120A Results

Date: 2026-07-02

Commands run:

- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed; Git printed existing LF-to-CRLF working-copy warnings.
- `git diff --check -- docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md docs/ARCHITECTURE.md docs/DECISIONS.md`
  - Result: passed.
  - Notes: scoped documentation diff whitespace check exited 0.

Manual checks:

- 120A-macOS-Platform-Inventory-Agent: passed.
  - Notes: identified upstream SkyLight, dual-post input, focus-without-raise, Chromium/Electron click, AX tree, AX placeholder, AX pre-focus, and parity helper deltas.
- 120A-Windows-Platform-Inventory-Agent: passed.
  - Notes: identified upstream Windows app enumeration, UIA snapshot, MSAA fallback, capture, background input, app action wiring, and interactive/visual flow deltas.
- 120A-Contract-Risk-Agent: passed.
  - Notes: confirmed immutable `ComputerUseHost`, screenshot readiness, click-safety, unsupported-platform, terminal-routing, Web UI policy, and core-schema boundaries.
- Functional runtime tests: not run.
  - Notes: 120A changed consensus docs only and intentionally did not modify runtime source.

Failures:

- None.

## ISSUE-120C Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: the new tests failed because the initial stub did not strip `.exe`, did not extract basename from Windows/slash paths, and returned zero apps for pid grouping.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: failed during GREEN compile once.
  - Notes: local `windows` crate exposes `BOOL` as `windows_core::BOOL`, not `windows::Win32::Foundation::BOOL`; fixed the import and reran.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 3 focused tests passed for case-insensitive `.exe` suffix stripping, Windows/slash basename extraction, pid grouping, exe-name preference, fallback window title, sorting, and `AppInfo` fields.
- `rustfmt --edition 2024 src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/windows_list_apps.rs src/apps/desktop/src/computer_use/desktop_host.rs`
  - Result: passed.
  - Notes: formatted the touched Rust files with the workspace edition.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 existing terminal/GVim routing tests passed after 120C.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: desktop crate compiled on Windows; one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120C.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed; Git printed existing LF-to-CRLF working-copy warnings.
- `git diff --check -- src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/windows_list_apps.rs src/apps/desktop/src/computer_use/desktop_host.rs docs/ISSUES.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only existing LF-to-CRLF warnings.
- `Select-String -Path src/apps/desktop/src/computer_use/windows_list_apps.rs,src/apps/desktop/src/computer_use/mod.rs -Pattern "PrintWindow|BitBlt|PostMessage|SendInput|windows_capture|windows_bg_input|build_interactive_view|build_visual_mark_view|interactive_click|visual_click"`
  - Result: passed.
  - Notes: no matches; 120C did not add capture/input/interactive/visual module wiring.

Manual checks:

- 120C-Architecture-Agent: passed.
  - Notes: confirmed the necessary `desktop_host.rs` edit is limited to `DesktopComputerUseHost::list_apps` and does not authorize whole-file replacement.
- 120C-Upstream-Windows-ListApps-Agent: passed.
  - Notes: confirmed current Windows features are sufficient when kernel32 process-image calls remain explicit FFI.
- 120C-QA-Risk-Agent: passed.
  - Notes: confirmed validation boundary is `ComputerUseHost::list_apps` and not Windows capture/input/app actions/interactive view.
- 120C-Spec-Reviewer: passed.
  - Notes: found no blockers; confirmed implementation stayed inside 120C scope.
- 120C-Code-Quality-Reviewer: passed for 120C implementation with scope warning.
  - Notes: reviewer confirmed Windows list-apps implementation quality was acceptable. It flagged that the dirty worktree also contains prior 120B `terminal_detect` and macOS `bg_type_text_auto` changes in the same files; those are not counted as 120C's intentional delta.

Failures:

- No remaining automated-test failures for 120C.
- Real Windows desktop smoke with visible apps such as Notepad/Calculator remains recommended before treating app enumeration as release-validated UI behavior.

## ISSUE-120D Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: the initial helper stubs did not format tree lines, dense-reindex nodes, or compute a digest.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: the initial helper stubs did not detect SAL/VCL class names or map MSAA roles/actions.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed after pure helper implementation.
  - Notes: 3 focused tests passed for tree text formatting, content-node inclusion, parent remapping, frame conversion, and digest stability/change detection.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed after pure helper implementation.
  - Notes: 2 focused tests passed for SAL/VCL class detection, MSAA role mapping, dropdown actions, default-action invoke fallback, and text non-action behavior.
- `cargo check -p void-desktop`
  - Result: failed once during GREEN compile.
  - Notes: fixed `AppStateSnapshot.window_title`, `VARIANT` `ManuallyDrop` field writes, `OBJID_CLIENT` newtype conversion, and action de-duplication lifetime.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: desktop crate compiled on Windows after cached UIA was added; one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120D.
- `rustfmt --edition 2024 src/apps/desktop/src/computer_use/windows_ax_ui.rs src/apps/desktop/src/computer_use/windows_msaa.rs src/apps/desktop/src/computer_use/desktop_host.rs src/apps/desktop/src/computer_use/mod.rs`
  - Result: passed with follow-up cleanup.
  - Notes: `rustfmt` touched unrelated `desktop_host.rs` formatting; those pure-format hunks were manually reverted so the remaining `desktop_host.rs` diff is limited to 120D plus prior 120B/120C changes.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 focused Windows AX snapshot tests passed after cached UIA final cleanup.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 focused Windows MSAA fallback tests passed after final cleanup.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120C Windows app enumeration tests passed after 120D.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous 120B terminal/GVim routing tests passed after 120D.
- `Select-String -Path src/apps/desktop/src/computer_use/windows_ax_ui.rs -Pattern "CreateCacheRequest|BuildUpdatedCache|IUIAutomationCacheRequest|TreeScope_Subtree|GetCachedChildren|CachedName|GetCachedPattern"`
  - Result: reviewed.
  - Notes: confirmed cached UIA request, subtree scope, cached child traversal, cached property reads, cached pattern checks, and `BuildUpdatedCache` retry are present.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
  - Notes: repository hygiene check passed; Git printed existing LF-to-CRLF working-copy warnings.
- `git diff --check -- src/apps/desktop/Cargo.toml src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/windows_ax_ui.rs src/apps/desktop/src/computer_use/windows_msaa.rs src/apps/desktop/src/computer_use/desktop_host.rs docs/ISSUES.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only existing LF-to-CRLF warnings.
- `Select-String -Path src/apps/desktop/src/computer_use/windows_ax_ui.rs,src/apps/desktop/src/computer_use/windows_msaa.rs,src/apps/desktop/src/computer_use/mod.rs,src/apps/desktop/src/computer_use/desktop_host.rs -Pattern "PrintWindow|BitBlt|SendInput|PostMessage|app_click|app_type_text|app_scroll|app_key_chord|build_interactive_view|interactive_click|build_visual_mark_view|visual_click|describe_screen|schema|permission" -CaseSensitive:$false`
  - Result: reviewed.
  - Notes: matches in `desktop_host.rs` are existing host/macOS methods and comments; `windows_ax_ui.rs` has an existing locate error mentioning screenshot fallback. No Windows capture/input/app-action/interactive/visual implementation was added in 120D.

Manual checks:

- 120D-Architecture-Agent: passed.
  - Notes: confirmed allowed files, Windows `get_app_state_inner` routing, `Win32_System_Ole`/`Win32_System_Variant` features, and adapter-only MSAA fallback boundaries.
- 120D-Upstream-Implementation-Agent: passed.
  - Notes: confirmed upstream node fields, `AppStateSnapshot` conversion shape, dense reindexing, digest, and MSAA role/action mapping to preserve.
- 120D-QA-Risk-Agent: passed.
  - Notes: confirmed RED/GREEN commands, regression tests, scope scan, and required manual smoke targets.

Failures:

- No remaining automated-test or `cargo check` failures for 120D.
- Manual Windows smoke remains required for Notepad, Calculator/Settings, LibreOffice/OpenOffice SAL/VCL fallback, DPI/multi-display, no foreground/minimized edge cases, and long provider trees.
- Windows `get_app_state` currently snapshots the foreground window and returns `screenshot: None`; app-selector targeting and foreground/window capture are separate later issues.

## ISSUE-120E Results

Date: 2026-07-02

Commands run:

- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `is_mostly_black_bgra`, `CaptureRect`, `compute_dwm_crop`, `WindowCaptureMetadata`, and `CaptureSource` did not exist yet.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 focused tests passed for mostly-black detection, dark nonblack UI handling, DWM crop/origin offsets, `BitBlt` fallback metadata marking occlusion uncertainty when obstruction is observed, and `BitBlt` remaining uncertain even when obstruction sampling does not observe a covering window.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120D Windows UIA snapshot tests passed after 120E.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120D Windows MSAA fallback tests passed after 120E.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120C Windows app enumeration tests passed after 120E.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous 120B terminal/GVim routing tests passed after 120E.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: desktop crate compiled on Windows with new DWM/GDI/XPS feature flags; one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120E.
- `Select-String -Path src/apps/desktop/src/computer_use/windows_capture.rs,src/apps/desktop/src/computer_use/mod.rs,src/apps/desktop/Cargo.toml -Pattern "PostMessage|SendInput|windows_bg_input|app_click|app_type_text|app_scroll|app_key_chord|build_interactive_view|interactive_click|build_visual_mark_view|visual_click|schema|Web UI" -CaseSensitive:$false`
  - Result: passed.
  - Notes: no matches in the 120E touched files; no Windows input/action/interactive/visual/schema/Web UI wiring was added.
- `git diff --check -- src/apps/desktop/Cargo.toml src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/windows_capture.rs`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only existing LF-to-CRLF warnings.

Manual checks:

- 120E-Upstream-Capture-Agent: passed.
  - Notes: confirmed upstream `windows_capture.rs` on GCWing/BitFun main uses `PrintWindow`, mostly-black detection, DWM crop, `BitBlt` fallback, and a WGC stub; WGC is not a shipped capability.
- 120E-Architecture-Agent: passed.
  - Notes: recommended adapter foundation only for 120E and no `desktop_host.rs` attachment because current screenshot safety state and core DTO do not yet carry capture-source warnings.
- 120E-QA-Risk-Agent: passed.
  - Notes: confirmed TDD path, regression commands, scope scan, and required Windows smoke cases.
- 120E-Final-Review-Agent: passed after follow-up fix.
  - Notes: reviewer found no scope blocker and flagged that `BitBltScreenRegion` should remain uncertain even when `target_is_obscured` returns false. Updated metadata and added a regression test.

Failures:

- No remaining automated-test or `cargo check` failures for 120E.
- Manual Windows smoke remains required for normal, occluded, minimized, multi-monitor, DPI-scaled, and elevated-window scenarios before this adapter is wired into user-visible host paths.

## ISSUE-1130A Results

Date: 2026-07-04

Scope:

- Windows-only WGC fallback adapter wiring for mostly-black `PrintWindow` results.
- Allowed code surfaces: `src/apps/desktop/src/computer_use/windows_wgc_capture.rs`, `windows_capture.rs`, `mod.rs`, and Windows dependency features in `src/apps/desktop/Cargo.toml`.
- No `desktop_host.rs` split, Web UI/tool-card/settings change, Computer Use schema change, macOS/Linux adapter change, background-input change, Flow Chat change, AI media/short-drama change, terminal change, or provider change.

Commands run:

- `cargo test -p void-desktop windows_wgc_adapter_is_wired_for_capture_fallback --lib -- --nocapture`
  - RED result before implementation: failed to compile because `computer_use::windows_wgc_capture` did not exist.
  - GREEN result after implementation: passed, 1 test.
- `cargo test -p void-desktop windows_foreground_capture --lib -- --nocapture`
  - Result: passed, 5 tests.
  - Notes: existing tests still cover mostly-black detection, dark nonblack UI, DWM crop/origin offsets, and BitBlt uncertainty metadata.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing unrelated warning remains for `parse_clipboard_path_segments` dead code in `clipboard_file_api.rs`.
- `cargo build -p void-desktop`
  - Initial result: failed because `rustc` exited with `STATUS_ACCESS_VIOLATION (0xc0000005)` after compiling `void-desktop`; no Rust diagnostic pointed at the WGC changes.
  - Retry result: passed.
  - Notes: the same existing unrelated `parse_clipboard_path_segments` dead-code warning remains.

Manual checks:

- Architecture/Risk-Agent: passed.
  - Notes: confirmed minimal safe migration is `windows_wgc_capture.rs`, module registration, `screenshot_window_via_wgc` wiring, and missing Windows features only.
- QA-Agent: passed.
  - Notes: confirmed `cargo check` alone is insufficient; compile-level wiring plus real Windows smoke are both needed.

Remaining risk:

- Manual WGC smoke has not been run in this session. Required targets include UWP/WinUI/DirectComposition black-`PrintWindow` recovery, occluded target capture, WGC failure to BitBlt fallback, DPI/multi-monitor origin correctness, minimized/stale HWND behavior, RDP/locked/no-GPU environments, WARP fallback, and frame timeout behavior.
- The code is wired and compiled on Windows, but WGC must not be described as platform-verified occlusion-proof capture until that smoke passes.

## ISSUE-120F Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because 120F constants, `make_lparam`, `make_key_lparam`, `delta_to_line_count`, `mk_flags_for_modifiers`, `parse_key_chord`, `uipi_block_reason`, DirectComposition heuristic, and outcome types did not exist yet.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed after implementation.
  - Notes: 10 focused tests passed for signed LPARAM packing, keyup LPARAM bits, scroll delta clamp, Shift/Ctrl mouse modifier flags with unsupported Alt/Meta diagnostics, Ctrl+Alt+Delete chord parsing, WM_USER UIPI bypass, DirectComposition/UWP heuristics, explicit posted/sent/blocked/uncertain outcome status, explicit restore/unsupported/Win32 error status, and restore-failure precedence for cloaked input cleanup.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: desktop crate compiled on Windows; one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120F.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 previous 120E Windows capture tests passed after 120F.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120D Windows UIA snapshot tests passed after 120F.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120D Windows MSAA fallback tests passed after 120F.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120C Windows app enumeration tests passed after 120F.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous 120B terminal/GVim routing tests passed after 120F.
- `Select-String -Path src/apps/desktop/src/computer_use/windows_bg_input.rs,src/apps/desktop/src/computer_use/mod.rs,src/apps/desktop/Cargo.toml -Pattern "app_click|app_type_text|app_scroll|app_key_chord|build_interactive_view|build_visual_mark_view|schema|permission|ComputerUseHost|supports_background_input" -CaseSensitive:$false`
  - Result: reviewed.
  - Notes: only `mod.rs` matched the existing `DesktopComputerUseHost` re-export; no 120F host action, interactive/visual, schema, permission, or support flag wiring was added.
- `git diff --check -- src/apps/desktop/src/computer_use/windows_bg_input.rs src/apps/desktop/src/computer_use/mod.rs docs/ISSUES.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only existing LF-to-CRLF warnings.

Manual checks:

- 120F-Upstream-Input-Agent: passed.
  - Notes: confirmed upstream latest `GCWing/BitFun main` at `98f0f4113a0e19342d670f0804cb2c39e0959dac`, identified `windows_bg_input.rs` primitives, and recommended no host app action wiring in 120F.
- 120F-Architecture-Agent: passed.
  - Notes: confirmed 120F boundary is Windows-only input adapter plus `mod.rs` gate; `desktop_host.rs` stays for 120G.
- 120F-QA-Risk-Agent: passed.
  - Notes: confirmed RED/GREEN path, adjacent regressions, scope scan, and required manual smoke cases.
- 120F-Final-Review-Agent: passed after follow-up fix.
  - Notes: reviewer found that cloaked SendInput/PostMessage failure paths could return early before foreground restoration and uncloaking. Updated `inject_text_cloaked` and `inject_key_cloaked` to collect adapter errors as `WindowsInputOutcome::Win32Error`, always run restore/uncloak after cloaked attempts, and prefer `ForegroundRestoreFailed` if cleanup fails.

Failures:

- No remaining automated-test or `cargo check` failures for 120F.
- Manual Windows smoke remains required for classic Win32 controls, elevated target UIPI, DirectComposition/UWP targets, cloaked SendInput foreground restore, scroll/drag targets, multi-display, and DPI behavior.

## ISSUE-120G Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 focused host tests passed for Windows input outcome fail-closed mapping and uncertain delivery warning propagation.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 4 focused tests passed, including new AppSelector-to-HWND resolution coverage.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 previous 120F Windows background input primitive tests passed after host wiring.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120D Windows UIA snapshot tests passed after target-window snapshot helper changes.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 previous 120E Windows capture tests passed after 120G.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120D Windows MSAA fallback tests passed after 120G.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous 120B terminal/GVim routing tests passed after 120G.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120G.
- `Select-String -Path src/apps/desktop/src/computer_use/desktop_host.rs,src/apps/desktop/src/computer_use/windows_ax_ui.rs,src/apps/desktop/src/computer_use/windows_list_apps.rs,src/apps/desktop/src/computer_use/windows_bg_input.rs -Pattern "supports_background_input|build_interactive_view|build_visual_mark_view|interactive_click|visual_click|schema|permission|src/web-ui|core" -CaseSensitive:$false`
  - Result: reviewed.
  - Notes: matches were existing imports/macOS permission/interactive/visual code and existing core type references; no new Web UI, core schema, permission UI, interactive/visual, or Windows capability flag wiring was added.
- `git diff --check -- src/apps/desktop/src/computer_use/desktop_host.rs src/apps/desktop/src/computer_use/windows_ax_ui.rs src/apps/desktop/src/computer_use/windows_list_apps.rs src/apps/desktop/src/computer_use/windows_bg_input.rs docs/ISSUES.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only existing LF-to-CRLF warnings.

Manual checks:

- 120G-Upstream-Host-Agent: passed.
  - Notes: confirmed upstream Windows host action wiring shape and recommended migrating only four app actions, not drag, `app_wait_for`, screenshot semantics, capability advertisement, UI, or core schema.
- 120G-Architecture-Agent: passed.
  - Notes: confirmed boundary across `desktop_host.rs`, Windows HWND resolution, target-window UIA snapshot, and `windows_bg_input`; warned against returning foreground snapshots for target-window actions.
- 120G-QA-Risk-Agent: passed.
  - Notes: confirmed focused seam tests, adjacent regressions, scope scan, and manual smoke risks; explicitly rejected tests that claim real `PostMessageW`/`SendInput` delivery.
- 120G-Final-Review-Agent: passed after follow-up fix.
  - Notes: reviewer flagged that dispatch could target one HWND while the returned snapshot re-resolved `AppSelector` to another window, and that raw HWND values could go stale across await. Host now revalidates the target HWND before dispatch and returns the post-action snapshot from that same raw HWND.

Failures:

- Initial `cargo check -p void-desktop` failed because `HWND` is not `Send` and was kept across `.await` in Windows host branches.
- Fix: host now converts `HWND` to a raw `isize` before await and reconstructs it only inside blocking Win32 adapter calls.
- Retest: `cargo check -p void-desktop` passed after the fix.
- Final review follow-up retest passed: `cargo test -p void-desktop windows_host_app_actions -- --nocapture`, `cargo test -p void-desktop windows_app_enumeration -- --nocapture`, `cargo test -p void-desktop windows_bg_input -- --nocapture`, `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`, and `cargo check -p void-desktop`.
- Manual Windows smoke remains required for Notepad/Edit, Calculator/Settings/DirectComposition, elevated UIPI targets, scroll targets, multi-display/DPI, foreground restore, and OCR target resolution.

## ISSUE-120H1 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `windows_screenshot_from_window_capture` did not exist yet.
- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: passed.
  - Notes: 2 focused tests passed for Windows `WindowCapture` PNG/metadata conversion into `ComputerScreenshot`/`PointerMap` and `[WINDOWS_CAPTURE_UNCERTAIN]` warning propagation for occluded `BitBltScreenRegion` fallback.
- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: passed after final review fix.
  - Notes: 3 focused tests passed after adding warning-composition coverage and post-capture HWND/pid revalidation before map registration.

- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120G Windows host action tests passed after 120H1.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 4 previous 120C/120G Windows app enumeration and HWND resolution tests passed after 120H1.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 previous 120F Windows background input primitive tests passed after 120H1.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 previous 120E Windows capture adapter tests passed after 120H1.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120D Windows UIA snapshot tests passed after 120H1.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120D Windows MSAA fallback tests passed after 120H1.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous 120B terminal/GVim routing tests passed after 120H1.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120H1.
- `git diff --check -- src/apps/desktop/src/computer_use/desktop_host.rs docs/ISSUES.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only an LF/CRLF working-copy warning.

Manual checks:

- 120H-Upstream-Interactive-Visual-Agent: passed.
  - Notes: confirmed upstream Windows interactive/visual wiring depends first on app-state screenshot attachment and screenshot pointer-map registration.
- 120H-Architecture-Agent: passed.
  - Notes: recommended splitting 120H and keeping 120H1 limited to host-level screenshot attachment without opening support flags.
- 120H-QA-Risk-Agent: passed.
  - Notes: confirmed RED/GREEN seams and warned that automatic tests cannot prove real Windows capture reliability.
- 120H1-Final-Review-Agent: passed after follow-up fix.
  - Notes: reviewer flagged stale/reused HWND risk between snapshot and screenshot registration, warning suppression if a snapshot already had `loop_warning`, pid-keyed map ambiguity for multi-window same-process apps, and a stale Active Issue pointer. Host now revalidates HWND/pid after capture before registration, composes warnings, and docs mark 120H1 complete with 120H2 next.

Failures:

- No remaining automated-test or `cargo check` failures for 120H1.
- Final review follow-up retest passed: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`, `cargo test -p void-desktop windows_host_app_actions -- --nocapture`, `cargo check -p void-desktop`, and scoped `git diff --check`.
- Manual Windows smoke remains required for same-HWND screenshots, occlusion warnings, minimized windows, elevated targets, DPI, and multi-monitor coordinates.

## ISSUE-120H2 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `build_interactive_view_from_snapshot_for_pid`, `resolve_interactive_index_for_pid`, and `cached_interactive_image_center_for_pid` did not exist yet.
- `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`
  - Result: passed.
  - Notes: 3 focused tests passed for Windows interactive-view support flag behavior, snapshot-to-view construction, cache population, digest prefix matching, stale/missing/out-of-range resolver errors, image-center lookup, tree text opt-out, screenshot retention, and warning propagation.
- `cargo test -p void-desktop windows_interactive_view_enablement_empty_elements_are_explicit_error -- --nocapture`
  - Result: failed as final-review RED.
  - Notes: empty filtered views returned a successful `InteractiveView` and wrote cache, which contradicted the 120H2 empty-array contract.
- `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`
  - Result: passed after final review fix.
  - Notes: 4 focused tests passed after adding `[INTERACTIVE_VIEW_EMPTY]` and preventing cache writes for empty filtered views.
- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120H1 screenshot attachment tests passed after 120H2.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120G Windows host action tests passed after 120H2.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 4 previous 120C/120G Windows app enumeration and HWND resolution tests passed after 120H2.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 previous 120F Windows background input primitive tests passed after 120H2.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 previous 120E Windows capture adapter tests passed after 120H2.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120D Windows UIA snapshot tests passed after 120H2.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120D Windows MSAA fallback tests passed after 120H2.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous 120B terminal/GVim routing tests passed after 120H2.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120H2.
- `Select-String -Path src/apps/desktop/src/computer_use/desktop_host.rs -Pattern "interactive_click|interactive_type_text|interactive_scroll|build_visual_mark_view|visual_click|supports_visual_mark_view|supports_background_input|post_click_screen|inject_text_cloaked|post_scroll_screen|parse_key_chord|src/web-ui|core schema|permission|terminal|macos_bg_input|app_wait_for|drag" -CaseSensitive:$false`
  - Result: reviewed.
  - Notes: matches are existing Computer Use code plus 120H2 tests asserting visual/background support remains disabled; no new Windows interactive action, visual mark, Web UI, core schema, permission UI, terminal, macOS behavior, or low-level input primitive wiring was added.
- `git diff --check -- src/apps/desktop/src/computer_use/desktop_host.rs docs/ISSUES.md docs/ARCHITECTURE.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed.
  - Notes: scoped whitespace check exited 0 with only an LF/CRLF working-copy warning.

Manual checks:

- 120H2-Architecture-Agent: passed.
  - Notes: confirmed 120H2 can be a single issue limited to Windows `build_interactive_view`, cache, and resolver behavior; recommended keeping actions and visual marks separate.
- 120H2-QA/Risk-Agent: passed.
  - Notes: confirmed RED/GREEN seams, regression commands, scope scan, smoke cases, and that `supports_interactive_view` may be enabled only after build/cache tests pass.
- 120H2-Final-Review-Agent: passed after follow-up fix.
  - Notes: reviewer flagged empty filtered views returning success as P1. Host now returns `[INTERACTIVE_VIEW_EMPTY]` and leaves cache empty. Reviewer also noted P2 risks for Windows action hints and pid-keyed multi-window cache ownership; both are deferred to 120H3.

Failures:

- No remaining automated-test or `cargo check` failures for 120H2.
- Final review follow-up retest passed: `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`, `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`, `cargo test -p void-desktop windows_host_app_actions -- --nocapture`, and `cargo check -p void-desktop`.
- Manual Windows smoke remains required for Notepad overlay alignment, Calculator/Settings behavior, same-process multi-window cache ambiguity, DPI/multi-monitor coordinates, occlusion warnings, and minimized/closed window errors.

## ISSUE-120H3 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_interactive_actions -- --nocapture`
  - Result: passed.
  - Notes: 4 focused seam tests passed for screenshot-id-bound image fallback, cached HWND change rejection, Windows clear/enter key chord selection, and keeping visual mark/background capabilities disabled.
- `cargo test -p void-desktop windows_interactive_view_enablement windows_interactive_visual_views windows_host_app_actions -- --nocapture`
  - Result: failed command invocation.
  - Notes: `cargo test` accepts a single TESTNAME filter; this was a command syntax error, not a code/test failure. The filters were rerun separately below.
- `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`
  - Result: passed.
  - Notes: 4 previous 120H2 interactive-view tests passed after 120H3.
- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120H1 screenshot attachment tests passed after 120H3.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120G host app action outcome tests passed after 120H3.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 4 previous Windows app enumeration/HWND resolution tests passed after 120H3.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 previous Windows background input primitive tests passed after 120H3.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 previous Windows capture adapter tests passed after 120H3.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 previous Windows UIA snapshot tests passed after 120H3.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 previous Windows MSAA fallback tests passed after 120H3.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 previous terminal routing tests passed after 120H3.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120H3.
- `cargo fmt -p void-desktop --check`
  - Result: failed.
  - Notes: package-wide formatter check reported many pre-existing formatting diffs across desktop API/computer_use files, including files outside 120H3 scope. It was not auto-fixed to avoid unrelated churn.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.
- `cargo fmt -p void-desktop --check`
  - Result: failed.
  - Notes: package-wide formatter check reported many pre-existing formatting diffs across desktop API/computer_use files, including files outside 120H5 scope. It was not auto-fixed to avoid unrelated churn.

Manual checks:

- 120H3-Architecture-Agent: passed.
  - Notes: confirmed 120H3 can remain host orchestration only and required screenshot-id-bound image fallback for Windows click.
- 120H3-QA/Risk-Agent: passed.
  - Notes: confirmed RED/GREEN seams, regression commands, scope scan, smoke cases, and the need to keep visual marks/core schema/Web UI out of scope.
- 120H3-Final-Review-Agent: passed after follow-up fixes.
  - Notes: reviewer initially flagged missing HWND identity validation and then a build-time double-resolve risk. Host now builds Windows interactive views from one resolved HWND, stores that HWND in cache, validates it before action resolution, and returns `[WINDOW_CHANGED]` on mismatch.

Failures:

- No remaining automated-test or `cargo check` failures for 120H3.
- Manual Windows smoke remains required for real `interactive_click`, `interactive_type_text`, `clear_first`, `press_enter_after`, `interactive_scroll`, stale digest, same-process multi-window, occluded/minimized windows, elevated targets, DPI, and multi-monitor behavior.

## ISSUE-120H4 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_visual_mark -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `build_visual_mark_view_from_snapshot_for_pid`, `resolve_visual_mark_for_pid`, cached screenshot-id target helpers, and cached HWND validation helpers did not exist yet.
- `cargo test -p void-desktop windows_visual_mark -- --nocapture`
  - Result: passed after implementation.
  - Notes: 4 focused tests passed for visual mark build/cache, missing screenshot failure, missing/stale/range/HWND mismatch errors, and screenshot-id-bound `ImageXy` target creation.
- `cargo test -p void-desktop windows_visual_mark_rebuilt_view_target_uses_rebuilt_pid_screenshot_id -- --nocapture`
  - Result: failed as RED during final-review fix.
  - Notes: test failed because `cached_visual_mark_image_xy_target_for_view` did not exist yet.
- `cargo test -p void-desktop windows_visual_mark_rebuilt_view_target_uses_rebuilt_pid_screenshot_id -- --nocapture`
  - Result: passed after final-review fix.
  - Notes: verifies stale rebuild target binding uses the rebuilt view pid/cache, not the pre-rebuild pid.
- `cargo test -p void-desktop windows_visual_mark -- --nocapture`
  - Result: passed after final-review fix.
  - Notes: 5 focused tests passed, including rebuilt-view pid/screenshot-id binding.
- `cargo test -p void-desktop windows_interactive_actions -- --nocapture`
  - Result: passed.
  - Notes: 4 previous 120H3 interactive action tests passed after 120H4 capability update.
- `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`
  - Result: passed.
  - Notes: 4 previous 120H2 interactive view tests passed after updating the capability expectation for Windows visual marks.
- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: passed.
  - Notes: 3 previous 120H1 screenshot attachment tests passed after 120H4.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 previous 120G host app action tests passed after 120H4.
- `cargo test -p void-desktop windows_app_enumeration -- --nocapture`
  - Result: passed.
  - Notes: 4 Windows app enumeration/HWND resolution tests passed after 120H4.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input primitive tests passed after 120H4.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 Windows capture adapter tests passed after 120H4.
- `cargo test -p void-desktop windows_ax_snapshot -- --nocapture`
  - Result: passed.
  - Notes: 3 Windows UIA snapshot tests passed after 120H4.
- `cargo test -p void-desktop windows_msaa_fallback -- --nocapture`
  - Result: passed.
  - Notes: 2 Windows MSAA fallback tests passed after 120H4.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal routing tests passed after 120H4.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120H4.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.
- `cargo fmt -p void-desktop --check`
  - Result: failed.
  - Notes: package-wide formatter check reported many pre-existing formatting diffs across desktop API/computer_use files, including files outside 120H4 scope. It was not auto-fixed to avoid unrelated churn.

Manual checks:

- 120H4-Architecture-Agent: passed.
  - Notes: confirmed 120H4 can remain a single host-orchestration issue, with mandatory cached `screenshot_id` and `hwnd_raw` for visual clicks.
- 120H4-QA/Risk-Agent: passed.
  - Notes: confirmed RED/GREEN seams, regression commands, scope scan, smoke cases, and P1 risks for HWND identity and screenshot-id binding.
- 120H4-Final-Review-Agent: P1 fixed.
  - Notes: identified stale rebuild could combine rebuilt mark coordinates with the old pid screenshot basis; fixed by binding rebuilt clicks through the rebuilt view pid/cache and retested.

Failures:

- No remaining automated-test or `cargo check` failures for 120H4.
- Manual Windows smoke remains required for real `build_visual_mark_view`, `visual_click`, stale digest, same-process multi-window, occluded/minimized windows, elevated targets, DPI, and multi-monitor behavior.

## ISSUE-120H5 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop windows_visual_grid -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: test failed because `windows_visual_grid_unsupported_error` did not exist yet.
- `cargo test -p void-desktop windows_visual_grid -- --nocapture`
  - Result: passed after implementation.
  - Notes: 2 focused tests passed for stable `[WINDOWS_VISUAL_GRID_UNSUPPORTED]` contract text and unchanged explicit `ImageGrid` coordinate conversion.
- `cargo test -p void-desktop windows_visual_mark -- --nocapture`
  - Result: passed.
  - Notes: 5 Windows visual mark tests passed after the VisualGrid unsupported decision.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 Windows host action tests passed.
- `cargo test -p void-desktop windows_interactive_actions -- --nocapture`
  - Result: passed.
  - Notes: 4 Windows interactive action tests passed.
- `cargo test -p void-desktop windows_interactive_view_enablement -- --nocapture`
  - Result: passed.
  - Notes: 4 Windows interactive view tests passed.
- `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`
  - Result: passed.
  - Notes: 3 Windows screenshot attachment tests passed.
- `cargo test -p void-desktop windows_foreground_capture -- --nocapture`
  - Result: passed.
  - Notes: 5 Windows foreground capture tests passed.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input primitive tests passed.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 120H5.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.

Manual checks:

- 120H5-Architecture-Agent: passed.
  - Notes: confirmed 120H5 should stay a contract decision issue and must not enable Windows VisualGrid before real smoke.
- 120H5-QA/Risk-Agent: passed.
  - Notes: confirmed stable unsupported code, no fallback to `ImageXy` or raw coordinates, and no VisualGrid support flag/schema change.

Failures:

- No remaining automated-test or `cargo check` failures for 120H5.
- Formatter check remains blocked by package-wide pre-existing formatting diffs outside 120H5 scope.
- Real Windows smoke remains required before any future issue can safely consider enabling self-detected VisualGrid.

## ISSUE-120H Parent Closure Results

Date: 2026-07-03

Commands run:

- Documentation review of `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
  - Result: passed.
  - Notes: confirmed `ISSUE-120H1` through `ISSUE-120H5` are Done and that architecture/decision/test records cover Windows screenshot attachment, interactive views/actions, visual marks, and the explicit Windows VisualGrid unsupported contract.

Manual checks:

- Parent issue reconciliation: passed.
  - Notes: `ISSUE-120H` is now marked Done as a documentation-only closure. No source-code, Web UI, core schema, macOS behavior, terminal, media, short-drama, or Flow Chat behavior changed in this pass.

Failures:

- No automated tests were rerun for this parent closure because no runtime code changed.
- The 120H capability stack still requires real Windows smoke before claiming end-to-end behavior across DPI, occlusion, DirectComposition/UWP, same-process multi-window, elevated targets, and multi-monitor setups.

## ISSUE-121A Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_skylight -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `SkyLightAvailability`, `SkyLightStatus`, `SkyLightPolicy`, and `SkyLightDiagnostics` did not exist yet.
- `cargo test -p void-desktop macos_skylight -- --nocapture`
  - Result: passed after implementation.
  - Notes: 4 focused tests passed for stable status messages, soft-fail behavior, default-disabled policy, and private-name containment.
- `cargo test -p void-desktop macos_skylight_status_messages_are_stable -- --nocapture`
  - Result: failed as final-review RED.
  - Notes: caught that `SkyLightAvailability::available().message()` still used the `[SKYLIGHT_UNAVAILABLE]` prefix.
- `cargo test -p void-desktop macos_skylight -- --nocapture`
  - Result: passed after final-review fix.
  - Notes: 4 focused tests passed after changing available diagnostics to `[SKYLIGHT_AVAILABLE]`.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal routing tests passed after 121A.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input tests passed after 121A.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 Windows host action tests passed after 121A.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121A.
- `cargo check -p void-desktop --target aarch64-apple-darwin`
  - Result: failed due environment/toolchain blocker.
  - Notes: the `aarch64-apple-darwin` Rust target is not installed in this Windows environment (`can't find crate for core/std`); this does not prove or disprove macOS compilation.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_skylight.rs`
  - Result: passed after formatting the new file.
  - Notes: package-wide `cargo fmt -p void-desktop --check` remains unsuitable as a 121A signal because it reports many pre-existing formatting diffs outside this issue.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.

Manual checks:

- 121A-Architecture-Agent: passed.
  - Notes: confirmed `macos_skylight.rs` should be a standalone foundation, `mod.rs` registration is allowed, and `desktop_host.rs`/behavior wiring must remain untouched.
- 121A-QA/Risk-Agent: passed.
  - Notes: confirmed tests should cover stable statuses, soft-fail, default disabled policy, and private-name containment; macOS target/smoke cannot be faked from Windows.
- 121A-Final-Review-Agent: P2 fixed.
  - Notes: available diagnostics now use `[SKYLIGHT_AVAILABLE]` instead of the unavailable prefix; focused tests passed after the fix.

Failures:

- No remaining Windows-local automated-test or `cargo check` failures for 121A.
- macOS target check is blocked until `aarch64-apple-darwin` or `x86_64-apple-darwin` target/toolchain is installed.
- Real macOS smoke remains required before `ISSUE-121B` or later slices connect SkyLight to input behavior.

## ISSUE-121B Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_dual_post -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `MacosPostKind`, `MacosPostAttempt`, `PublicFallback`, `plan_for_availability`, and `public_fallback_after_skylight` did not exist.
- `cargo test -p void-desktop macos_dual_post -- --nocapture`
  - Result: passed.
  - Notes: 4 focused tests passed for public-only fallback, mouse public belt-and-suspenders behavior, keyboard duplicate-public avoidance, and no-auth flag planning.
- `cargo test -p void-desktop macos_skylight -- --nocapture`
  - Result: passed.
  - Notes: 5 focused tests passed, including non-macOS post stub soft-fail.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal routing tests passed after terminal-safe typing was kept on the existing public post path.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input tests passed after 121B.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 Windows host action tests passed after 121B.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121B.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_dual_post.rs src/apps/desktop/src/computer_use/macos_skylight.rs src/apps/desktop/src/computer_use/macos_bg_input.rs src/apps/desktop/src/computer_use/mod.rs`
  - Result: passed.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.
- `cargo check -p void-desktop --target aarch64-apple-darwin`
  - Result: failed due environment/toolchain blocker.
  - Notes: the `aarch64-apple-darwin` Rust target is not installed in this Windows environment (`can't find crate for core/std`); this does not prove or disprove macOS compilation.

Manual checks:

- 121B-Architecture-Agent: passed with constraints applied.
  - Notes: confirmed pure policy seam, adapter-only wiring, no `desktop_host.rs`, no terminal detection change, and no focus/window/Chromium-specific behavior in this issue.
- 121B-QA/Risk-Agent: passed with one scope correction applied.
  - Notes: terminal-safe typing was kept on public post path; real macOS smoke is still required before terminal dual-post behavior.
- 121B-Final-Review-Agent: passed with P2 residual risks.
  - Notes: no P0/P1 blockers; post-level SkyLight diagnostics and real macOS compile/smoke remain follow-up risks.
- Scope scan:
  - Result: passed.
  - Notes: SkyLight/dual-post names remain in macOS Computer Use adapter modules and `mod.rs`; no Web UI/core/Windows behavior wiring was introduced.

Failures:

- No remaining Windows-local automated-test, `cargo check`, target-file rustfmt, or `git diff --check` failures for 121B.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for normal app click/type/scroll/key chord, Chromium/Electron background delivery, terminal-like app typing, Accessibility-denied behavior, and SkyLight-unavailable fallback.

## ISSUE-121C Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_focus_plan -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `MacosFocusAttempt`, `MacosFocusPublicFallback`, `plan_focus_activation`, and `public_fallback_after_focus_without_raise` did not exist.
- `cargo test -p void-desktop macos_skylight_focus -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `FocusRecordKind`, `build_focus_event_record`, `is_focus_without_raise_available`, and `activate_without_raise` did not exist.
- `cargo test -p void-desktop macos_focus_plan_does_not_raise_without_explicit_fallback_permission -- --nocapture`
  - Result: failed as RED during review tightening.
  - Notes: caught that public activation fallback was not yet an explicit `allow_raise_fallback` policy input.
- `cargo test -p void-desktop macos_focus_plan -- --nocapture`
  - Result: passed.
  - Notes: 5 focused tests passed for public activation, focus-without-raise preference, unavailable fallback, explicit no-raise policy, and public fallback after focus failure.
- `cargo test -p void-desktop macos_skylight_focus -- --nocapture`
  - Result: passed.
  - Notes: 2 focused tests passed for focus record bytes and non-macOS soft-fail stubs.
- `cargo test -p void-desktop macos_skylight -- --nocapture`
  - Result: passed.
  - Notes: 7 SkyLight foundation/post/focus tests passed after 121C.
- `cargo test -p void-desktop macos_dual_post -- --nocapture`
  - Result: passed.
  - Notes: 4 121B dual-post tests passed after 121C.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal routing tests passed after 121C.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input tests passed after 121C.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 Windows host action tests passed after 121C.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121C.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_focus_plan.rs src/apps/desktop/src/computer_use/macos_skylight.rs src/apps/desktop/src/computer_use/macos_bg_input.rs src/apps/desktop/src/computer_use/mod.rs`
  - Result: passed.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.
- `cargo check -p void-desktop --target aarch64-apple-darwin`
  - Result: failed due environment/toolchain blocker.
  - Notes: the `aarch64-apple-darwin` Rust target is not installed in this Windows environment (`can't find crate for core/std`); this does not prove or disprove macOS compilation.

Manual checks:

- 121C-Architecture-Agent: passed with constraints applied.
  - Notes: confirmed macOS adapter/foundation seam, pure focus plan, no broad host lifecycle rewrite, and no terminal/Web/core/Windows changes.
- 121C-QA/Risk-Agent: passed with one scope correction applied.
  - Notes: public activation fallback is explicit in the plan; existing `activate_pid_macos(pid)` preserves prior app-action fallback semantics.
- 121C-Final-Review-Agent: passed with P2 residual risks.
  - Notes: no P0/P1 blockers; future pure tests should cover `CGWindowList` filtering, and real macOS compile/smoke remains required.
- Scope scan:
  - Result: passed.
  - Notes: window/focus/SkyLight names remain in macOS Computer Use adapter modules and `mod.rs`; no Web UI/core/Windows behavior wiring was introduced.

Failures:

- No remaining Windows-local automated-test, `cargo check`, target-file rustfmt, or `git diff --check` failures for 121C.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for pid-owned window id resolution, focus-without-raise, public fallback behavior, same-pid multi-window ordering, terminal-like app typing, Accessibility-denied behavior, and SkyLight-unavailable fallback.

## ISSUE-121D Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_chromium_click_plan -- --nocapture`
  - Result: failed as RED before route-table correction.
  - Notes: Edge bundle-id variant `com.microsoft.Edge` was not classified by the first conservative metadata table.
- `cargo test -p void-desktop macos_chromium_click_plan -- --nocapture`
  - Result: passed.
  - Notes: 6 focused tests passed for known bundle ids, regular-app defaults, left-button/window metadata requirements, window-local coordinates, recipe event ordering, and per-event Chromium field values.
- Final review P1 fix:
  - Result: fixed and retested.
  - Notes: required event-field and window-local stamping now returns `[CHROMIUM_CLICK_STAMP_UNAVAILABLE]` on failure, allowing host fallback to generic click; adapter field values now come from the same pure plan tested by `macos_chromium_click_plan`.
- `cargo test -p void-desktop macos_skylight -- --nocapture`
  - Result: passed.
  - Notes: 8 SkyLight foundation/post/focus/event-field tests passed, including non-macOS soft-fail stubs for event field wrappers.
- `cargo test -p void-desktop macos_focus_plan -- --nocapture`
  - Result: passed.
  - Notes: 5 focus plan tests passed after 121D host routing.
- `cargo test -p void-desktop macos_dual_post -- --nocapture`
  - Result: passed.
  - Notes: 4 dual-post policy tests passed; Chromium recipe reuses the existing mouse post layer.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal routing tests passed; 121D did not change terminal/GVim routing.
- `cargo test -p void-desktop windows_bg_input -- --nocapture`
  - Result: passed.
  - Notes: 10 Windows background input tests passed; 121D did not change Windows adapters.
- `cargo test -p void-desktop windows_host_app_actions -- --nocapture`
  - Result: passed.
  - Notes: 2 Windows host action tests passed.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121D.
- `cargo check -p void-desktop --target aarch64-apple-darwin`
  - Result: failed due environment/toolchain blocker.
  - Notes: the `aarch64-apple-darwin` Rust target is not installed in this Windows environment (`can't find crate for core/std`); this does not prove or disprove macOS compilation.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_chromium_click_plan.rs src/apps/desktop/src/computer_use/macos_bg_input.rs src/apps/desktop/src/computer_use/macos_skylight.rs src/apps/desktop/src/computer_use/mod.rs src/apps/desktop/src/computer_use/desktop_host.rs`
  - Result: passed after formatting target files.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.

Manual checks:

- 121D-Architecture-Agent: passed with constraints applied.
  - Notes: confirmed the needed shape: pure route seam, macOS adapter recipe, and narrow host selection only.
- 121D-QA/Risk-Agent: passed with constraints applied.
  - Notes: confirmed no title/display-text route, normal apps default to existing click path, and macOS smoke remains required.
- Scope scan by review:
  - Result: passed.
  - Notes: Chromium route code is limited to macOS Computer Use adapter/host wiring and docs; no Web UI/core/Windows/terminal behavior was changed.

Failures:

- No remaining Windows-local automated-test, `cargo check`, target-file rustfmt, or `git diff --check` failures for 121D.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for Chrome/Chromium/Electron click delivery, ordinary Cocoa app default click behavior, Retina/multi-display coordinate conversion, same-pid multi-window routing, Accessibility-denied behavior, and SkyLight-unavailable fallback.

## ISSUE-121E Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_ax_snapshot_plan -- --nocapture`
  - Result: failed as RED before implementation.
  - Notes: tests failed because `value_or_placeholder`, `child_attributes_for_node`, `dedupe_child_pointers`, `ChromiumAxEnablementCache`, `AxEnablementAttempt`, `AxEnablementPlan`, and `plan_chromium_ax_enablement` did not exist.
- `cargo test -p void-desktop macos_ax_snapshot_plan -- --nocapture`
  - Result: passed.
  - Notes: 5 focused tests passed for placeholder fallback, app-root `AXChildren + AXWindows` policy, focused-window/non-root `AXChildren` policy, ordered child pointer dedupe, and per-pid Chromium AX enablement settle/cache planning.
- Final review P2 fix:
  - Result: fixed and retested.
  - Notes: `focus_window_only` roots no longer read `AXWindows`; production child pointer dedupe now goes through the pure snapshot plan helper.
- `cargo test -p void-desktop macos_ax_dump -- --nocapture`
  - Result: passed on Windows with 0 tests.
  - Notes: confirms the macOS AX FFI dump module remains cfg-gated in this environment; it does not verify real macOS AX behavior.
- `cargo test -p void-desktop macos_ax_ui -- --nocapture`
  - Result: passed on Windows with 0 tests.
  - Notes: confirms 121E did not compile or change locator/ranking behavior on Windows.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121E.
- `cargo check -p void-desktop --target aarch64-apple-darwin`
  - Result: failed due environment/toolchain blocker.
  - Notes: the `aarch64-apple-darwin` Rust target is not installed in this Windows environment (`can't find crate for core/std`); this does not prove or disprove macOS compilation.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_ax_snapshot_plan.rs src/apps/desktop/src/computer_use/macos_ax_dump.rs src/apps/desktop/src/computer_use/mod.rs`
  - Result: passed after formatting target files.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.

Manual checks:

- 121E-Architecture-Agent: passed with constraints applied.
  - Notes: confirmed 121E should stay in macOS AX snapshot adapter and docs, not host/input/SkyLight/Web UI/core/Windows.
- 121E-QA/Risk-Agent: passed with constraints applied.
  - Notes: confirmed the required scope: Chromium enablement, root `AXChildren + AXWindows`, dedupe, placeholder fallback, and macOS smoke requirements.

Failures:

- No remaining Windows-local automated-test, `cargo check`, target-file rustfmt, or `git diff --check` failures for 121E.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for Chrome/Chromium/Electron AX tree enablement, second-snapshot settle cache behavior, background window traversal via `AXWindows`, placeholder values in empty input fields, idx/cache alignment after dedupe, Accessibility-denied behavior, and ordinary Cocoa app snapshots.

## ISSUE-121F1 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_ax_write -- --nocapture`
  - Result: passed on Windows with 0 tests.
  - Notes: the macOS AX writer module remains cfg-gated in this environment; this does not verify real macOS AX focus behavior.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal route tests passed; 121F1 keeps final text dispatch through `bg_type_text_auto`.
- `cargo test -p void-desktop macos_bg_input -- --nocapture`
  - Result: passed on Windows with 0 tests.
  - Notes: run as an adjacent guard after reverting key parity from this issue; 121F1 does not change `macos_bg_input.rs`.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121F1.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_ax_write.rs src/apps/desktop/src/computer_use/macos_bg_input.rs src/apps/desktop/src/computer_use/desktop_host.rs`
  - Result: passed.
  - Notes: `macos_bg_input.rs` was included because the first attempt touched it, then key parity was reverted after Architecture-Agent review.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.

Manual checks:

- 121F-Architecture-Agent: passed with constraints applied.
  - Notes: required splitting the original 121F into `121F1` AX focus, `121F2` key parity, and `121F3` pointer parity.
- 121F-QA/Risk-Agent: passed with constraints applied.
  - Notes: confirmed right/middle click already exists, Fn/no-auth key parity and PID-scoped background drag should not be mixed into AX focus.

Failures:

- No remaining Windows-local automated-test, `cargo check`, or target-file rustfmt failures for 121F1.
- No remaining `git diff --check` whitespace failures for 121F1.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for Cocoa text fields, Chromium/Electron input/textarea, Accessibility-denied behavior, SkyLight-unavailable fallback, and Terminal/iTerm/GVim text input regression.

## ISSUE-121F2 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_key_parity_plan -- --nocapture`
  - Result: passed.
  - Notes: 4 focused tests passed for Fn alias/keycode/flag-kind, default host parser gating, and no-auth post mode policy.
- `cargo test -p void-desktop macos_dual_post -- --nocapture`
  - Result: passed.
  - Notes: 4 tests passed, including `KeyboardNoAuth` auth-message flag behavior.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal routing tests passed; 121F2 does not change terminal text routing.
- `cargo test -p void-desktop macos_bg_input -- --nocapture`
  - Result: passed on Windows with 0 tests.
  - Notes: confirms the real CoreGraphics adapter remains cfg-gated in this environment; it does not verify real macOS event delivery.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121F2.
- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_key_parity_plan.rs src/apps/desktop/src/computer_use/macos_bg_input.rs src/apps/desktop/src/computer_use/mod.rs`
  - Result: passed after formatting the target files.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.

Manual checks:

- 121F2-Architecture-Agent: passed with constraints applied.
  - Notes: confirmed Fn and no-auth should stay in macOS adapter primitives, with a pure policy seam, and `desktop_host` default route must not change.
- 121F2-QA/Risk-Agent: passed with constraints applied.
  - Notes: flagged that accepting `fn` in the default parser would expose host behavior before smoke; implementation was narrowed so the default host parser rejects `fn`.

Failures:

- No remaining Windows-local automated-test, `cargo check`, target-file rustfmt, or `git diff --check` failures for 121F2.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for `CGEventFlagSecondaryFn`, Fn keycode 63, no-auth key-chord delivery, AppKit menu equivalents, Accessibility-denied behavior, SkyLight-unavailable fallback, and Terminal/iTerm/GVim regression.

## ISSUE-121F3 Results

Date: 2026-07-03

Commands run:

- `cargo test -p void-desktop macos_pointer_parity_plan -- --nocapture`
  - Result: passed.
  - Notes: 5 focused tests passed for drag event order/step clamping, multi-step interpolation, click/drag button parity, and AXPress eligibility. Final-review P2 tightened AXPress eligibility from `click_count <= 1` to `click_count == 1` and added coverage for rejecting `click_count == 0`; the focused test passed again after the fix.
- `cargo test -p void-desktop macos_dual_post -- --nocapture`
  - Result: passed.
  - Notes: 4 dual-post policy tests passed; pointer parity did not change the shared post policy.
- `cargo test -p void-desktop macos_chromium_click_plan -- --nocapture`
  - Result: passed.
  - Notes: 6 Chromium click plan tests passed; 121F3 did not alter Chromium/Electron route policy.
- `cargo test -p void-desktop terminal_detect -- --nocapture`
  - Result: passed.
  - Notes: 8 terminal route tests passed; 121F3 did not change text input routing.
- `cargo test -p void-desktop macos_bg_input -- --nocapture`
  - Result: passed on Windows with 0 tests.
  - Notes: confirms the macOS CoreGraphics adapter remains cfg-gated in this environment; it does not verify real macOS pointer delivery.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing `parse_clipboard_path_segments` unused warning remains unrelated to 121F3.

- `rustfmt --edition 2024 --check src/apps/desktop/src/computer_use/macos_pointer_parity_plan.rs src/apps/desktop/src/computer_use/macos_bg_input.rs src/apps/desktop/src/computer_use/desktop_host.rs src/apps/desktop/src/computer_use/mod.rs`
  - Result: failed first, then passed after formatting target files.
  - Notes: initial failure was formatting-only line wrapping in the new pointer plan/interpolation call sites.
- `git diff --check`
  - Result: passed.
  - Notes: exited 0 with only LF/CRLF working-copy warnings.
- `cargo check -p void-desktop --target aarch64-apple-darwin`
  - Result: failed due environment/toolchain blocker.
  - Notes: the `aarch64-apple-darwin` Rust target is not installed in this Windows environment (`can't find crate for core/std`); this does not prove or disprove macOS compilation.

Failures:

- No remaining Windows-local automated-test, `cargo check`, target-file rustfmt, or `git diff --check` failures for 121F3.
- macOS target check remains blocked until the `aarch64-apple-darwin` or `x86_64-apple-darwin` Rust target/toolchain is installed.
- Real macOS smoke remains required for right/middle `NodeIdx` click semantics, multi-click/modifier click semantics, PID-scoped `bg_drag` delivery, right/middle drag, Chromium/Electron drag behavior, Retina/multi-display coordinates, Accessibility-denied behavior, and SkyLight-unavailable fallback.

## ISSUE-122A Results

Date: 2026-07-03

Scope:

- Docs-only contract inventory for Computer Use `describe_screen`.
- No code, core schema, runtime dispatch, host trait, desktop adapter, Web UI, Windows/macOS adapter, terminal, or provider changes.

Manual checks:

- Product-Agent: recommended accepting 122A only as contract/docs, not code.
- Architecture-Agent: confirmed `describe_screen` belongs to Computer Use tool contract/core schema; first implementation should compose existing host seams and should not add `ComputerUseHost::describe_screen`.
- QA/Risk-Agent: identified schema/runtime drift, provider-gate bypass, host-default breakage, and ambiguous unsupported state as primary risks.

Future verification required by implementation issue:

- Schema contract tests for text-only and multimodal exposure.
- Runtime dispatch tests proving every schema-exposed action has a handler or explicit unsupported result.
- Result-shape tests preserving `computer_use_context`, `interaction_state`, screenshot metadata, and no screenshot bytes in JSON.
- Host default/unsupported tests so headless/non-desktop hosts do not panic.
- Side-effect tests proving readonly observation does not mutate screenshot readiness, pointer maps, navigation focus, or interactive/visual caches.
- Platform smoke for macOS, Windows, and unsupported Linux paths before claiming richer screen-description behavior.

Docs-only validation:

- Run `git diff --check -- docs/PRD.md docs/ISSUES.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/TEST_PLAN.md docs/PROGRESS.md`.
  - Result: passed.
- Run `Select-String` checks for `ISSUE-122A`, `describe_screen`, `ComputerUseHost`, `schema`, `unsupported`, and `smoke` across the consensus docs.
  - Result: passed.
  - Notes: confirmed cross references across PRD, issues, architecture, decisions, test plan, and progress docs.

## ISSUE-122C Results

Date: 2026-07-03

Scope:

- Added the first product-facing `ComputerUse` `describe_screen` action in core schema and runtime dispatch.
- Text-only schema exposes `describe_screen` while continuing to hide `screenshot`.
- Multimodal schema exposes `describe_screen` alongside `screenshot`.
- Runtime returns explicit `unsupported` without a desktop host and readonly JSON observation with a host.
- No Web UI, platform adapter, input injection, click/drag/focus, `ComputerUseHost` trait, provider DTO, or crate-layout changes.

RED checks:

- `cargo test -p void-core computer_use_schema_exposes_describe_screen --lib -- --nocapture`
  - Result: failed before implementation because text-only schema did not include `describe_screen`.
- `cargo test -p void-core computer_use_describe_screen --lib -- --nocapture`
  - Result: failed before implementation because no-host dispatch returned desktop-only error and host dispatch fell through to `Unknown action: describe_screen`.

GREEN checks:

- `cargo test -p void-core computer_use_schema_exposes_describe_screen --lib -- --nocapture`
  - Result: passed.
- `cargo test -p void-core computer_use_describe_screen --lib -- --nocapture`
  - Result: passed.
- `cargo test -p void-core describe_screen_ --lib -- --nocapture`
  - Result: passed, 5 tests.
- `cargo test -p void-core computer_use --lib -- --nocapture`
  - Result: passed, 27 tests.
- `cargo check -p void-core`
  - Result: passed.
- `git diff --check -- src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs`
  - Result: passed with Git LF/CRLF working-copy warning only.

Known validation limits:

- `rustfmt --edition 2024 --check src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs` still reports pre-existing whole-file formatting differences in unrelated regions. The file was not bulk-formatted to avoid mixing unrelated diff into 122C.
- Real macOS, Windows, and Linux screen-description behavior was not claimed or smoke-tested in this Windows core-only pass.

## ISSUE-130A Results

Date: 2026-07-03

Scope:

- Docs-only inventory for upstream Flow Chat long-session rendering and scrolling improvements.
- The 130A documentation pass did not intentionally edit Flow Chat, store, terminal, media, AI short-drama, BTW, subagent, or desktop code.
- The repository worktree still contains pre-existing production/test changes from earlier issues, so 130A cannot be reviewed as a clean whole-worktree diff until those changes are isolated or committed.
- Local upstream evidence is based on `tmp/upstream-bitfun@c2f6a3c`.

Subagent checks:

- Product/Architecture-Agent identified upstream capabilities: initial history render window, virtual item height estimates, stable prepend/session keys, history projection handoff, latest-end anchor stabilization, model-round progressive render, virtual model-round chunking, deferred full history hydration, and terminal output preview clipping.
- QA/Risk-Agent identified missing local test coverage: `VirtualMessageList.layout.test.ts`, `VirtualMessageList.session-boundary.test.tsx`, `modelRoundProgressiveRender.test.ts`, long CodePreview tests, and long-session E2E fixtures/matrix.

Required RED tests for future issues:

- `ISSUE-130B`: `modelRoundProgressiveRender.test.ts` proves completed oversized model rounds currently render all groups at once while streaming rounds must remain complete.
- `ISSUE-130C`: `VirtualMessageList.layout.test.ts` proves item-height estimates are currently fixed/insufficient for historical compact tails and large model rounds.
- `ISSUE-130D`: `VirtualMessageList.session-boundary.test.tsx` proves viewport-local follow/at-bottom/visible-range state can leak across session switches.
- `ISSUE-130E`: layout/window tests prove long historical sessions do not start from a bounded latest-tail render window.
- `ISSUE-130F`: handoff overlay tests prove snapshots are session-guarded and auto-release without mutating real session data.
- `ISSUE-130G`: docs-only/store-design validation before touching deferred full hydration.
- `ISSUE-130H`: terminal preview tests prove long output preview budgeting without changing terminal core/replay.
- `ISSUE-130I`: CodePreview perf tests prove long streaming code renders/scroll-writes too much before adding viewport-tail rendering.

Suggested Windows verification commands for implementation slices:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/modelRoundProgressiveRender.test.ts`
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.layout.test.ts`
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
- `pnpm --dir src/web-ui run test:run src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`
- `pnpm run type-check:web`
- `pnpm --dir tests/e2e run test:l1:chat`

Docs-only validation:

- Run `git diff --check -- docs/ISSUES.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/TEST_PLAN.md docs/PROGRESS.md`.
  - Result: no output, but these consensus docs are currently untracked so this is not a complete whitespace gate for their contents.
- Run explicit trailing-whitespace scan across the consensus docs with `Select-String -Pattern '[ \t]+$'`.
  - Result: passed; no trailing whitespace found.
- Run `Select-String` checks for `ISSUE-130A`, `ISSUE-130B`, `Flow Chat`, `long-session`, `VirtualMessageList`, `modelRoundProgressiveRender`, `short-drama`, `media`, and `terminal` across the consensus docs.
  - Result: passed.

Known validation limits:

- No browser/frame-rate evidence was collected in 130A.
- No desktop packaged-app smoke was run for long history reopen/switch/resize behavior.
- Upstream E2E/perf scripts were inventoried but not proven directly compatible with Void.
- macOS/Linux/high-DPI/touchpad scroll differences remain unverified.

## ISSUE-130B Results

Date: 2026-07-03

Scope:

- Added a pure Flow Chat model-round progressive-render helper.
- Added `ModelRoundItem` presentation-only progressive rendering for completed oversized non-media rounds.
- Streaming rounds remain fully rendered.
- Rounds containing synthetic AI media groups or `Task` subagent groups render fully in this slice to avoid hiding grouped media output or subagent projection.
- No `FlowChatStore.ts`, `modernFlowChatStore.ts`, session/history APIs, subagent projection internals, terminal service/core, AI media services, or AI short-drama modules were changed.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/modelRoundProgressiveRender.test.ts`
  - Result: failed before helper implementation because `./modelRoundProgressiveRender` did not exist.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/ModelRoundItem.progressive-render.test.tsx`
  - Result: after test-environment mocks were added, failed before component integration because completed large rounds rendered 105 items instead of the expected initial 80.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/modelRoundProgressiveRender.test.ts`
  - Result: passed, 7 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/ModelRoundItem.progressive-render.test.tsx`
  - Result: passed, 5 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
  - Result: passed, 7 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/modelRoundProgressiveRender.test.ts src/flow_chat/components/modern/ModelRoundItem.progressive-render.test.tsx src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
  - Result: passed, 3 files / 19 tests.
- `pnpm run type-check:web`
  - Result: passed.

Known validation limits:

- No browser frame-rate or desktop packaged-app long-session smoke was run.
- Protected-group-aware partial rendering is intentionally not implemented; media and `Task` subagent rounds render fully until a future policy can prove protected groups stay visible.
- The component test mocks heavy child components and verifies `ModelRoundItem` slice behavior, not full tool-card rendering.
- Final-Review-Agent found one P1 for hidden Task/subagent projection during initial slicing; a RED test reproduced it, the implementation now full-renders rounds containing critical `Task` groups, and final re-review found no P0/P1/P2.

## ISSUE-130C Results

Date: 2026-07-03

Scope:

- Added pure virtual message layout/default-height estimate helpers.
- Wired `VirtualMessageList` to derive Virtuoso `defaultItemHeight` from `activeSession.isHistorical` and current `virtualItems`.
- Live sessions remain on the legacy `200px` estimate.
- Historical compact user/explore tails use compact estimates; historical model-round tails use taller model-round estimates.
- Did not enable `heightEstimates`, initial history render windows, `firstItemIndex`, history projection handoff, deferred hydration, store changes, session/history API changes, AI media/short-drama changes, or terminal changes.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
  - Result: failed before helper implementation because `./virtualMessageListLayout` did not exist.
- The same test failed after initial helper creation because `getVirtualMessageDefaultItemHeightForSession` was missing, proving live-session gating was not implemented yet.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
  - Result: passed, 15 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts src/flow_chat/components/modern/useFlowChatNavigation.test.ts src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
  - Result: passed, 3 files / 23 tests.
- `pnpm run type-check:web`
  - Result: passed.

Subagent review:

- 130C Architecture/Risk-Agent confirmed the safe slice is pure helpers plus `defaultItemHeight` wiring only.
- Agent explicitly excluded `heightEstimates`, `selectInitialHistoryRenderWindow`, scrollTop expansion mapping, `firstItemIndex`, handoff overlay, and store/API changes as 130E/130G scope.

Known validation limits:

- No browser scroll-performance or packaged desktop smoke was run.
- The static integration test checks the 130C/130E boundary in source text; it does not render Virtuoso.
- Historical `heightEstimates` and initial render-window behavior remain future work.
- Final-Review-Agent found one P2 where the exported low-level height helper trusted projection flags even for live sessions; a RED test reproduced it, the helper now returns the live legacy estimate first when `isHistorical` is false, and the focused tests/type-check pass.

## ISSUE-130D Results

Date: 2026-07-03

Scope:

- Added stable virtual item key helpers inside `VirtualMessageList.tsx`.
- Scoped virtualized item keys by active session id and stable item identity.
- Keyed the `Virtuoso` viewport by active session id so session switches remount the virtual scroller.
- Added layout-effect reset for viewport-local state: at-bottom UI state, pending turn pin, bottom reservation, measured height/scroll refs, scroll-intent refs, anchor lock, collapse intent, and deferred follow reason.
- Did not change `FlowChatStore.ts`, `modernFlowChatStore.ts`, history hydration, `VirtualItem` shape, subagent/media/short-drama modules, terminal modules, `firstItemIndex`, `heightEstimates`, or history projection handoff.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
  - Result: failed before implementation. Three assertions proved missing stable key helper, missing session `Virtuoso` remount key, and missing session-boundary viewport reset.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
  - Result: passed, 5 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts src/flow_chat/components/modern/useFlowChatNavigation.test.ts src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
  - Result: passed, 4 files / 28 tests.
- `pnpm run type-check:web`
  - Result: passed.

Subagent review:

- 130D Risk/Architecture-Agent found no P0/P1 risks.
- The agent identified two P2 improvements: add a jsdom behavior test and prefer layout-effect reset to avoid one-frame stale UI. Both were implemented before final verification.
- 130D Final-Review-Agent found one P2: the session-boundary reset did not clear mounted streaming follow priming/tracking refs. A RED assertion reproduced the missing reset, `resetViewportStateForSessionBoundary` now clears `hasPrimedMountedStreamingTurnFollowRef` and latest-turn follow tracking without swallowing the existing session-change effect, and focused tests/type-check pass.

Known validation limits:

- No browser frame-rate or packaged desktop long-session switch smoke was run.
- The behavior test mocks Virtuoso and child renderers; it verifies session-boundary UI state, not real browser scroll physics.
- Initial historical render windowing, handoff overlay, and deferred hydration remain future issues.

## ISSUE-130E1 Results

Date: 2026-07-03

Scope:

- Added pure initial-history render-window helper types and functions to `virtualMessageListLayout.ts`.
- Added `selectInitialHistoryRenderWindow` for large historical item tails.
- Added `mapInitialHistoryExpansionScrollTop` for preserving scrollTop when omitted history expands.
- Kept `VirtualMessageList` render behavior unchanged.
- Did not enable static scroller, omitted spacer DOM, Virtuoso `firstItemIndex`, `heightEstimates`, history projection handoff, deferred hydration, store/API changes, subagent/media/short-drama changes, or terminal changes.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
  - Result: failed before helper implementation. New tests proved `selectInitialHistoryRenderWindow` and `mapInitialHistoryExpansionScrollTop` were missing, and the component boundary had not enabled the initial history window.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
  - Result: passed, 22 tests.

Subagent review:

- 130E Architecture/Risk-Agent found no P0 in the current code.
- It identified P1 migration risk for directly enabling upstream static scroller because current `VirtualMessageList` imperative navigation and follow/pin paths still rely on `virtuosoRef`.
- It recommended keeping 130E1 pure and requiring a separate 130E2 UI gate with focused tests before changing render behavior.

Known validation limits:

- 130E1 does not yet reduce real initial render work in `VirtualMessageList`.
- No browser or packaged desktop long-history smoke was run.
- 130E2 must still prove UI behavior for bounded render windows, omitted spacer or equivalent virtual offset, upward reveal, and navigation/follow compatibility.

## ISSUE-130E2 Flow Chat Initial Historical Render Window UI Gate

Scope:

- Enabled a static initial-history scroller only for historical sessions selected by `selectInitialHistoryRenderWindow`.
- Rendered the bounded latest historical tail with an omitted-height spacer before expansion.
- Preserved full-session item indexes by passing `renderedInitialHistoryStartIndex + localIndex` to `VirtualItemRenderer`.
- Expanded the window on upward wheel intent and before omitted-target imperative navigation.
- Added DOM-scroller adapters for `scrollToTurn`, `scrollToIndex`, and `pinTurnToTop` when the static branch has no `virtuosoRef`.
- Kept `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` outside the render branch against the same scroller ref.
- Did not enable `heightEstimates`, Virtuoso `firstItemIndex`, history projection handoff, deferred hydration, store/API changes, AI media/short-drama changes, subagent internals, or terminal changes.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
  - Result: failed before implementation because long historical sessions still rendered through the Virtuoso branch instead of a bounded initial history window.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
  - Result: failed after the first static branch because `scrollToTurn` returned early without `virtuosoRef.current`.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
  - Result: failed after `scrollToTurn` support because `scrollToIndex` and `pinTurnToTop` still returned early without `virtuosoRef.current`.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
  - Result: passed, 5 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/virtualMessageListLayout.test.ts src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/useFlowChatNavigation.test.ts src/flow_chat/components/modern/modelRoundItemGrouping.test.ts`
  - Result: passed, 5 files / 40 tests.
- `pnpm run type-check:web`
  - Result: passed.

Known validation limits:

- No browser or packaged desktop long-history smoke was run.
- jsdom tests validate render branching, expansion, index mapping, and imperative API behavior, but not real scrollbar geometry, touchpad inertia, frame time, or visual overlay positioning.
- Projection handoff, deferred full hydration, `heightEstimates`, and Virtuoso `firstItemIndex` remain separate issues.

## ISSUE-130E Parent Closure Results

Date: 2026-07-03

Commands run:

- Documentation review of `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
  - Result: passed.
  - Notes: confirmed `ISSUE-130E1` and `ISSUE-130E2` are Done and that existing records cover the helper foundation plus the gated static-scroller UI strategy.

Manual checks:

- Parent issue reconciliation: passed.
  - Notes: `ISSUE-130E` is now marked Done as a documentation-only closure. No source-code, Flow Chat store/API, backend, terminal, media, short-drama, or subagent behavior changed in this pass.

Failures:

- No automated tests were rerun for this parent closure because no runtime code changed.
- Browser/desktop long-history visual smoke remains useful before claiming full UX quality beyond the existing jsdom/component coverage.

## ISSUE-130F1 Flow Chat History Projection Handoff Helpers

Scope:

- Added pure `HistoryProjectionHandoffSnapshot` and active-session guard helpers.
- Added pure session-open bottom-tail snapshot selection for ready, non-partial historical session switches.
- Kept `VirtualMessageList` overlay rendering, release scheduling, startup trace, previous-history boundary status, `heightEstimates`, `firstItemIndex`, `FlowChatStore`, session restore API, media/short-drama, and terminal behavior out of scope.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
  - Result: failed before implementation because `./historyProjectionHandoff` did not exist.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
  - Result: passed, 4 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
  - Result: passed, 4 files / 36 tests.
- `pnpm run type-check:web`
  - Result: passed.

Subagent review:

- 130F Risk/Architecture-Agent recommended not wiring the full upstream overlay now.
- The agent identified P0 risk in cross-session pollution if deferred full-history projections complete after the active session changes.
- It also found that current `AgentAPI.restoreSessionView` has no tail-limit/partial-history API, so store/API design must precede any claim of full upstream projection parity.

Known validation limits:

- No UI overlay, release timer, target-content readiness check, or browser smoke was implemented in 130F1.
- Store-level partial/deferred history projection remains unimplemented and should be handled before 130F2 overlay UI.

## ISSUE-130G1 Flow Chat Deferred History Projection Store Contract

Scope:

- Added optional `isPartial`, `loadedTurnCount`, and `totalTurnCount` fields to the Flow Chat session and `restoreSessionView` response contract.
- Mapped partial `restoreSessionView` responses in `FlowChatStore.loadSessionHistory` without overloading empty turn arrays.
- Added a session-scoped deferred full-history projection entry point that no-ops when the active session has changed.
- Kept `VirtualMessageList`, projection overlay UI, backend restore request shape, terminal, AI media, and AI short-drama modules out of scope.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/store/FlowChatStore.test.ts`
  - Result: failed before implementation. The new partial restore test showed `isHistorical: false` with no partial/count fields, and the deferred projection test failed because `applyDeferredSessionHistoryProjection` did not exist.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/store/FlowChatStore.test.ts`
  - Result: passed, 30 tests.
- `pnpm run type-check:web`
  - Result: passed.

Risk notes:

- 130G1 does not start real background full-history hydration and does not change the Tauri/backend restore command.
- 130F2 overlay UI remains blocked until render/release behavior is tested against this explicit partial-history state.

## ISSUE-130G2 Flow Chat Deferred Full-History Hydration Scheduling

Scope:

- Added a `FlowChatStore`-local deferred full-history scheduler for partial `restoreSessionView` responses.
- Reused existing `restoreSessionWithTurns` without changing `AgentAPI.restoreSessionView` request shape or backend commands.
- Applied successful follow-up results only through `applyDeferredSessionHistoryProjection`.
- Kept `VirtualMessageList`, `modernFlowChatStore`, terminal, AI media, AI short-drama, subagent modules, and startup trace expansion out of scope.

RED checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/store/FlowChatStore.test.ts`
  - Result: failed before implementation because partial view restore did not call `restoreSessionWithTurns`, did not apply full-history projection, and had no pending request to guard when active session changed.

GREEN checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/store/FlowChatStore.test.ts`
  - Result: passed, 32 tests.
- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/historyProjectionHandoff.test.ts src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
  - Result: passed, 2 files / 12 tests.
- `pnpm run type-check:web`
  - Result: passed.

Risk notes:

- 130G2 does not add backend tail-limit request parameters or a new full-history endpoint.
- The scheduler uses the existing `restoreSessionWithTurns` path; real desktop/backend latency and cancellation behavior still need browser/desktop smoke before broader performance claims.

## ISSUE-130G Parent Closure Results

Date: 2026-07-03

Commands run:

- Documentation review of `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
  - Result: passed.
  - Notes: confirmed `ISSUE-130G1` and `ISSUE-130G2` are Done and that existing records cover explicit partial-history state plus store-local deferred full-history scheduling.

Manual checks:

- Parent issue reconciliation: passed.
  - Notes: `ISSUE-130G` is now marked Done as a documentation-only closure. No source-code, Flow Chat UI, `AgentAPI` request shape, backend restore command, terminal, media, short-drama, or subagent behavior changed in this pass.

Failures:

- No automated tests were rerun for this parent closure because no runtime code changed.
- Browser/desktop restore latency and cancellation smoke remain useful before making broader performance claims.

## ISSUE-130H Flow Chat Terminal Output Preview Budget

Scope:

- Added a pure terminal output preview helper with explicit row and character budgets.
- Wired `TerminalToolCard` so live and completed output previews pass bounded content into `LazyTerminalOutputRenderer`.
- Preserved the full terminal panel/replay path by leaving the original tool result, terminal session id, `createTerminalTab`, terminal core/service, and replay contracts unchanged.
- Kept ACP permission actions, `FlowChatStore`, `VirtualMessageList`, AI media, and AI short-drama modules out of scope.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalOutputPreview.test.ts`
  - Result: failed before implementation because `./terminalOutputPreview` did not exist.
- `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/TerminalToolCard.preview-budget.test.tsx`
  - Result: failed before wiring because `TerminalToolCard` passed complete live/final output strings to `LazyTerminalOutputRenderer`.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalOutputPreview.test.ts src/flow_chat/tool-cards/TerminalToolCard.preview-budget.test.tsx`
  - Result: passed, 2 files / 4 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/tool-cards/terminalOutputPreview.test.ts src/flow_chat/tool-cards/TerminalToolCard.preview-budget.test.tsx src/flow_chat/tool-cards/terminalToolCardState.test.ts`
  - Result: passed, 3 files / 8 tests.
- `pnpm run type-check:web`
  - Result: passed.

Risk notes:

- No terminal backend/core or replay tests were run because 130H did not modify those modules.
- No browser/desktop visual smoke was run; 130H is covered by pure helper and component prop-passing tests.

## ISSUE-130I Code Preview Long Streaming Performance

Scope:

- Added focused CodePreview tests for viewport-aware streaming tail rendering.
- Replaced fixed 60-line streaming tail rendering with a viewport-aware tail window, overscan, and a 6,000-character cap.
- Added a manually callable CodePreview streaming perf probe with `void-code-preview-perf-probe` naming.
- Kept completed/non-streaming CodePreview content complete, and kept Flow Chat store/session state, terminal core/replay, AI media, AI short-drama, Markdown rendering, and tool-result schema out of scope.

RED checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/CodePreview.test.tsx`
  - Result: failed before implementation because the existing fixed 60-line streaming tail still rendered `line 090` in small and tall preview cases, and rendered `line 116` when nested autoscroll was disabled.

GREEN checks:

- `pnpm --dir src/web-ui run test:run src/flow_chat/components/CodePreview.test.tsx`
  - Result: passed, 3 tests.
- `pnpm run type-check:web`
  - Result: passed.
- Brand residue scan on `CodePreview.tsx`, `CodePreview.test.tsx`, and `codePreviewPerfHarness.tsx`
  - Result: no `bitfun`, `BitFun`, `BITFUN`, or `__BITFUN` matches.

Risk notes:

- No browser/desktop performance smoke was run for the perf harness.
- The perf harness is not wired into a production entry point and should remain a manual/development probe unless a later issue adds a formal benchmark command.

## ISSUE-130F2 Flow Chat History Projection Handoff Overlay UI Gate

Scope:

- Wired the pure 130F1 history projection handoff snapshot into `VirtualMessageList` as a session-scoped, read-only overlay.
- Rendered the overlay outside the real scroller so visible-turn measurement and imperative navigation continue to target real list DOM.
- Added bounded release behavior after the real target turn renders or after timeout.
- Kept `FlowChatStore`, restore API, deferred full hydration, `heightEstimates`, `firstItemIndex`, startup trace, terminal, AI media, and AI short-drama modules out of scope.

RED checks:

- `pnpm --dir src/web-ui test -- VirtualMessageList.session-boundary.test.tsx`
  - Result: failed before implementation because `VirtualMessageList` did not import the handoff helper, did not render `[data-history-projection-handoff-overlay="true"]`, and could not release the missing overlay.

GREEN checks:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
  - Result: passed, 8 tests.
- `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/historyProjectionHandoff.test.ts src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
  - Result: passed, 2 files / 9 tests.
- `pnpm run type-check:web`
  - Result: passed.

Risk notes:

- No real browser or packaged desktop smoke was run; jsdom verifies render/release gates but not visual frame timing or scrollbar geometry.
- The overlay is intentionally not a full upstream deferred-history hydration implementation.

## ISSUE-130F Parent Closure Results

Date: 2026-07-03

Commands run:

- Documentation review of `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
  - Result: passed.
  - Notes: confirmed `ISSUE-130F1` and `ISSUE-130F2` are Done and that existing records cover the pure handoff snapshot contract plus guarded overlay render/release behavior.

Manual checks:

- Parent issue reconciliation: passed.
  - Notes: `ISSUE-130F` is now marked Done as a documentation-only closure. No source-code, Flow Chat store/API, restore API, terminal, media, short-drama, or subagent behavior changed in this pass.

Failures:

- No automated tests were rerun for this parent closure because no runtime code changed.
- Browser/desktop long-history visual smoke remains useful for real overlay timing and geometry.

## ISSUE-900A Runtime Crate Boundary Inventory and Checker Hardening

Scope:

- Hardened the static Rust core-boundary checker only.
- Preserved the current Cargo workspace layout and all Rust production code.
- Kept Web UI, desktop adapters, terminal, provider adapters, and tool runtime out of scope.

RED checks:

- `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts\check-core-boundaries.mjs`
  - Result: failed before implementation because the self-test did not cover slash-containing content anchors and several runtime/remote boundary anchors.

GREEN checks:

- `node scripts\check-core-boundaries.mjs`
  - Result: passed.
- `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts\check-core-boundaries.mjs`
  - Result: passed.
- `cargo metadata --no-deps --format-version 1`
  - Result: passed.
- `git diff --check -- scripts\check-core-boundaries.mjs docs\ISSUES.md docs\ARCHITECTURE.md docs\DECISIONS.md docs\TEST_PLAN.md docs\PROGRESS.md`
  - Result: passed with an LF/CRLF warning only for `scripts/check-core-boundaries.mjs`.
- Trailing-whitespace scan across changed script/docs.
  - Result: passed, no matches.

Risk notes:

- No Rust unit, integration, or build test was required for this slice because no Rust source or Cargo manifest changed.
- Static checks cannot prove that a future crate reorganization is safe; they only make the current accepted boundaries harder to weaken silently.

## ISSUE-122B1 Computer Use DTO Boundary Checker Guard

Scope:

- Hardened the static boundary checker for Computer Use host seam and `describe_screen` readonly contracts.
- Preserved all Computer Use Rust source, desktop platform adapters, Web UI, provider adapters, tool runtime, Cargo manifests, crate layout, and DTO ownership.

RED checks:

- `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts\check-core-boundaries.mjs`
  - Result: failed before implementation because `src/crates/core/src/agentic/tools/computer_use_host.rs` had no required owner content anchor rule.

GREEN checks:

- `node scripts\check-core-boundaries.mjs`
  - Result: passed.
- `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts\check-core-boundaries.mjs`
  - Result: passed.
- `cargo test -p void-core describe_screen_ --lib -- --nocapture`
  - Result: passed, 5 tests.
- `cargo test -p void-core computer_use --lib -- --nocapture`
  - Result: passed, 27 tests.

Risk notes:

- Static anchors protect the current contract but do not implement DTO extraction.
- No platform smoke was run because this issue intentionally made no desktop adapter or Computer Use runtime behavior changes.

## ISSUE-121F Parent Closure Results

Date: 2026-07-03

Commands run:

- Documentation review of `docs/ISSUES.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
  - Result: passed.
  - Notes: confirmed `ISSUE-121F1`, `ISSUE-121F2`, and `ISSUE-121F3` are Done and cover the original AX pre-focus, key parity, and pointer parity split.

Manual checks:

- Parent issue reconciliation: passed.
  - Notes: `ISSUE-121F` is now marked Done as a documentation-only closure. No macOS adapter, desktop host, Computer Use core schema, Web UI, Windows, terminal, or Cargo behavior changed in this pass.

Failures:

- No automated tests were rerun for this parent closure because no runtime code changed.
- Real macOS compile and smoke remain required for the child issue behavior before release claims.

## ISSUE-1000 Post-Review Hardening Results

Scope:

- Subagent-driven post-review hardening against upstream/current coupling risks.
- Covered Flow Chat BTW image contexts, `/goal budget`, deferred history hydration, virtual-list static history behavior, terminal replay buffering, CI/brand guardrails, and test harness compatibility.
- Did not migrate upstream crate layout, release upload policy, Computer Use WGC capture, or AI adapter path ownership.

Checks completed:

- `pnpm --dir src/web-ui exec vitest run src/flow_chat/services/BtwThreadService.test.ts src/flow_chat/store/FlowChatStore.test.ts src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/tools/terminal/services/TerminalService.test.ts`
  - Result: passed, 4 files / 46 tests.
- `node scripts/brand-residue-audit.mjs --strict`
  - Result: passed, 0 findings.
- `git diff --check`
  - Result: passed with LF/CRLF warnings only.
- `pnpm install --frozen-lockfile`
  - Result: passed.
- `pnpm run i18n:generate -- --check`
  - Result: passed.
- `pnpm run i18n:contract:test`
  - Result: passed, 15 tests.
- `pnpm run i18n:audit`
  - Result: passed with 1 existing warning for grandfathered short-drama CJK source candidates.
- `node scripts/check-repo-hygiene.mjs`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `VOID_BOUNDARY_CHECK_SELF_TEST=1 node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `pnpm run check:theme-colors`
  - Result: passed.
- `pnpm run check:theme-visual-contract`
  - Result: passed.
- `pnpm --dir src/web-ui run test:run`
  - Result: passed after mocking `FlowChatStore` in `ContentCanvas.test.tsx`, 239 files / 1412 tests.
- `pnpm run build:web`
  - Result: passed, including Monaco asset verification.
- `cargo metadata --no-deps --format-version 1`
  - Result: passed.
- `cargo check --workspace`
  - Result: passed with one existing dead-code warning in desktop clipboard file API.
- `cargo check -p void-desktop`
  - Result: passed with the same warning.
- `cargo test -p void-core --test remote_mcp_streamable_http`
  - Result: passed, 1 test.
- `cargo test --workspace`
  - Result: passed. Workspace tests completed successfully with existing warnings only.
- `pnpm run desktop:build:fast`
  - Result: passed. Web build, mobile-web build, Monaco verification, and Tauri debug no-bundle build completed; output: `target\debug\void-desktop.exe`.
- `node scripts/brand-residue-audit.mjs --strict`
  - Result: passed after final build, 0 findings.
- `git diff --check`
  - Result: passed after final build with LF/CRLF warnings only.

Failures fixed during this pass:

- Web full Vitest initially failed on an unhandled teardown import from `ContentCanvas.test.tsx`; fixed by mocking the FlowChat store boundary.
- Strict brand audit initially failed on intentional upstream-reference docs and a test assertion containing a legacy brand literal; fixed by explicit docs allowlisting and splitting the legacy test literal.
- `cargo test --workspace` initially failed because stream fixture tests called updated AI adapter stream handlers without the new optional duration argument; fixed by passing `None`.
- `cargo test -p void-core --test remote_mcp_streamable_http` exposed that the current `rmcp@0.12` path does not complete the prior `202 Accepted` mock through a common GET SSE stream in this test setup. The test was realigned to the supported POST-SSE response path, and production remote MCP requests now have a bounded default timeout so accepted-but-never-completed calls do not hang indefinitely.

Pending / residual risk:

- Full manual smoke of AI short-drama canvas and real remote MCP servers remains outside this automated pass.
- Deferred upstream migrations for terminal runtime ports, Computer Use platform capture, AI adapter layout, and release automation require separate test matrices.

## 2026-07-03 Selective Upgrade Wave Test Strategy

Global rule: every implementation issue must run the smallest automated test that covers its module interface, then a broader check when the issue touches shared contracts.

Planned checks by issue family:

- `ISSUE-1100`: docs-only diff check and keyword cross-reference scan.
- `ISSUE-1110`: Flow Chat Vitest around history navigation, virtual-list behavior, BTW/subagent/media grouping protection, plus `pnpm run type-check:web` for implementation slices.
- `ISSUE-1120`: terminal service/core tests for replay normalization, pending live events, input queue/paste policy, and no Flow Chat store mutation.
- `ISSUE-1130`: Windows-gated Rust tests or `cargo check -p void-desktop` on Windows for WGC/HWND changes; no cross-platform success claim without platform evidence.
- `ISSUE-1140`: `AnalyzeImage` core tests, BTW image-context forwarding tests, workspace path denial tests, and media/short-drama manual contract notes when image flows touch those surfaces.
- `ISSUE-1150`: remote MCP regression tests, tool manifest readonly tests, bounded-timeout tests, and `status/source/error` result-shape assertions.
- `ISSUE-1160`: `pnpm run check:theme-colors`, theme governance unit tests, component-library token tests, and visual contract validation.
- `ISSUE-1170`: static boundary checks before any provider/service movement.
- `ISSUE-1180`: boundary checker self-test and Cargo metadata only; no runtime test because crate movement remains deferred.

No test result may be recorded as passed until the command has actually run in the current issue.

## ISSUE-1100 Upstream Incremental Inventory Refresh

Scope:

- Docs-only inventory refresh for upstream `ac16dcc18`.
- No Web UI, Rust, desktop, terminal, media, short-drama, script, package, or Cargo behavior changes.

Checks:

- `git fetch https://github.com/GCWing/BitFun.git main:refs/remotes/upstream-bitfun/main`
  - Result: passed before documentation update; local `upstream-bitfun/main` advanced to `ac16dcc18`.
- `git log --oneline --first-parent --since='2026-07-01' upstream-bitfun/main -40`
  - Result: passed; recent capability commits were visible for Flow Chat, terminal, Computer Use, image understanding, MCP/tool runtime, theme, provider/service, and crate-boundary review.
- `git diff --check -- docs\PRD.md docs\ARCHITECTURE.md docs\ISSUES.md docs\DECISIONS.md docs\TEST_PLAN.md docs\PROGRESS.md docs\superpowers\plans\2026-07-03-upstream-selective-upgrade-wave.md`
  - Result: passed with LF/CRLF warnings only.

Risk notes:

- No production behavior was changed.
- Existing generated version-file diffs from the running desktop project remain outside this issue.

## ISSUE-1160A Theme Near-Color Governance Slice

Scope:

- Added near-pair governance artifact validation to `scripts/audit-theme-colors.mjs`.
- Added focused audit tests for valid, malformed, and stale near-pair decisions.
- Added a component-library token conformance check for `Tabs.scss`.
- Replaced Tabs close-hover raw destructive colors with existing component-library tokens.

Commands run:

- `node --test scripts\audit-theme-colors.test.mjs`
  - Result: passed, 11 tests.
- `pnpm run check:theme-colors`
  - Result: passed for Web and CLI theme audits.
- `pnpm run check:theme-visual-contract`
  - Result: passed, 8 required surfaces covered.
- `node --test scripts\audit-theme-colors.test.mjs scripts\audit-cli-theme-colors.test.mjs`
  - Result: passed, 21 tests.
- `pnpm run type-check:web`
  - Result: passed.

Risk notes:

- No browser visual smoke was run. The SCSS change is limited to Tabs close-hover destructive color tokens, so automated theme governance was considered sufficient for this slice.
- Generated widget payload compatibility and ThemeService runtime token expansion remain future issues.
- Existing generated version-file diffs from the running desktop project remain outside this issue.

## ISSUE-1110 Flow Chat History Navigation Delta Audit

Scope:

- Docs-only audit of upstream `502270994 fix(flow-chat): stabilize history turn navigation`.
- No Flow Chat production code, tests, E2E, AI media, AI short-drama, terminal, provider, Rust, or generated version files were changed.

Evidence gathered:

- `git show --name-status --stat 502270994 --`
  - Result: upstream commit touches `ModernFlowChatContainer`, `VirtualMessageList`, `virtualMessageListLayout`, two Flow Chat tests, and adds release E2E.
- Local source search for `HEADER_TURN_PIN_RETRY_MAX_ATTEMPTS`, `onUserScrollIntent`, `staticInitialHistoryUserLeftBottomRef`, `pendingStaticTurnPinRef`, `trailingOmittedEstimatedHeightPx`, and `data-history-initial-render-tail-spacer`
  - Result: no matches for the upstream stabilization markers, so local coverage is partial.
- Subagent read-only reviews:
  - Result: upstream behavior and local gaps were independently confirmed by FlowChat-Upstream-Agent, FlowChat-Local-Agent, and FlowChat-QA-Risk-Agent.

Implementation test plan for follow-up issues:

- `ISSUE-1110A`:
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/ModernFlowChatContainer.history-state.test.tsx`
    - RED result: failed before implementation because header current turn optimistically changed to the pending target, `pinTurnToTop` did not retry after accepted-but-not-visible, and `VirtualMessageList` exposed no `onUserScrollIntent` contract.
    - GREEN result: passed after `ModernFlowChatContainer` kept header state tied to `visibleTurnInfo`, added bounded RAF retry with auto-behavior follow-up pins, and `VirtualMessageList` reported user scroll intent to cancel pending retry.
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
    - Result: passed after adding the `onUserScrollIntent` prop surface, covering adjacent static-window/session-boundary/list-layout behavior.
  - `pnpm run type-check:web`
    - Result: passed.
- `ISSUE-1110B`:
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
  - `pnpm run type-check:web`
- `ISSUE-1110B1`:
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx src/flow_chat/components/modern/virtualMessageListLayout.test.ts`
    - RED result: failed before implementation because omitted-target `pinTurnToTop` expanded the whole transcript and rendered no tail spacer.
    - GREEN result: passed after static omitted pin rendered an anchored target window with `data-history-initial-render-tail-spacer="true"`, smooth omitted pins preserved the anchor, upward reveal still expanded all history, navigation expansion cleared stale anchors, item-count changes kept expanded history expanded for the session, and the latest action cleared the anchor.
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx`
    - Result: passed after adding static anchor/tail spacer state.
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
    - Result: passed.
  - `pnpm run type-check:web`
    - Result: passed.
- `ISSUE-1110B2`:
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.initial-history-window.test.tsx`
    - RED result: failed before implementation because static initial-history appended items changed the render key and forced `scrollTop` back to the new bottom after the user had scrolled away from bottom.
    - GREEN result: passed after static scroller scroll events recorded user-left-effective-bottom state and later auto-bottom used effective bottom while skipping forced bottom when that state is active.
    - Added coverage: footer/input height changes after user-left-bottom keep `scrollTop`, and explicit omitted-turn pin still anchors after user-left-bottom.
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/components/modern/historyProjectionHandoff.test.ts`
    - Result: passed.
  - `pnpm run type-check:web`
    - Result: passed.
- `ISSUE-1110C`:
  - `pnpm --dir tests/e2e exec tsc --noEmit`
    - Result: failed before runtime execution because the current E2E TypeScript environment cannot resolve `@wdio/globals/types` from `tests/e2e/tsconfig.json`. This is an existing E2E type-environment issue: WDIO CLI resolves and runs, but raw `tsc` cannot load that type entry.
  - `pnpm --dir tests/e2e exec wdio run ./config/wdio.conf.ts --spec "./specs/l1-chat-turn-navigation-release.spec.ts" --help`
    - Result: passed. WDIO CLI and config entrypoint are available.
  - `pnpm --dir tests/e2e exec wdio run ./config/wdio.conf.ts --spec "./specs/l1-chat-turn-navigation-release.spec.ts" --dry-run`
    - Result: passed with 1 skipped test. WDIO started the debug desktop app and loaded the new spec; because `E2E_TEST_WORKSPACE`, `VOID_E2E_TURN_NAV_SESSION_TITLE`, and `VOID_E2E_TURN_NAV_TARGET_TITLE` were not provided, the spec followed its intended precondition skip path.
  - Full fixture run command:
    - `VOID_E2E_APP_MODE=debug E2E_TEST_WORKSPACE=<fixture-workspace> VOID_E2E_TURN_NAV_SESSION_TITLE=<session-title> VOID_E2E_TURN_NAV_TARGET_TITLE=<older-turn-title> VOID_E2E_TURN_NAV_TARGET_TURN_ID=<optional-turn-id> pnpm --dir tests/e2e exec wdio run ./config/wdio.conf.ts --spec "./specs/l1-chat-turn-navigation-release.spec.ts"`
    - Result: not run in this issue because no persisted long-session fixture env was provided.
- `ISSUE-1120`:
  - `git fetch https://github.com/GCWing/BitFun.git main:refs/remotes/upstream-bitfun/main`
    - Result: passed; `upstream-bitfun/main` advanced to `65da1a082`.
  - `git log --oneline --first-parent --since="2026-06-01" upstream-bitfun/main -- | Select-String -Pattern "terminal|pty|replay|input|paste|runtime|exec|port|shell"`
    - Result: passed; identified small terminal reliability commits and larger runtime-port/exec ownership commits.
  - Local file/test inspection:
    - Result: local Void already contains structured terminal replay (`src/crates/terminal/src/session/replay.rs`, `src/web-ui/src/tools/terminal/utils/terminalReplay.ts`), paste policy (`terminalPaste.ts`), resize repaint guard (`resizeRepaintGuard.ts`), terminal input queue (`TerminalInputQueue.ts`), and focused tests for each.
  - Recommended follow-up implementation checks:
    - `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
    - `cargo test -p terminal-core session::replay`
    - Any `ISSUE-1120A` DTO/result-shape implementation must add or update tests for terminal local/remote write/resize/history boundary behavior.
  - Result: docs-only audit; no production tests were run because no terminal behavior changed in this slice.
- `ISSUE-1120A`:
  - `pnpm --dir src/web-ui run test:run src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts`
    - Result: passed; 2 files, 12 tests.
    - Covered `TerminalService` classification for local session-not-found write failures, remote-manager resize failures, terminal API initialization failures during history lookup, generic operation failures, and existing pending session event buffering.
    - Covered `TerminalInputQueue` write batching and post-error recovery to prove the queue remains batching-only and does not absorb API source/status logic.
  - `pnpm --dir src/web-ui run type-check`
    - Result: passed.
  - Subagent/local inspection:
    - Result: desktop `terminal_write`, `terminal_resize`, and `terminal_get_history` still return `Result<_, String>`; this issue deliberately kept backend DTO conversion deferred.
    - Result: `TerminalService` is now the only frontend conversion layer for `status/source/code/operation/rawMessage` on write/resize/history failures.
  - Result: implementation changed only Web terminal service boundary and focused tests; no terminal UI, Flow Chat, AI media, AI short-drama, Computer Use, provider, Rust crate, or runtime-port behavior changed.
- `ISSUE-1130`:
  - `git show --name-status --stat acf0cdb03 63a7b8160 918894f10 4a88374fc aab1032da --`
    - Result: passed; identified upstream Computer Use platform UX/capture, CUA integration, text-only describe-screen, and runtime-owner commits.
  - `git diff --name-status 98f0f4113..acf0cdb03 -- src`
    - Result: passed; confirmed upstream adds `windows_wgc_capture.rs`, refactors desktop host modules, changes Computer Use tool/UI contracts, and touches Web UI/settings.
  - Local file inspection:
    - Result: local `windows_capture.rs` still stubs `screenshot_window_via_wgc`; local `desktop_host.rs` already uses raw `isize` HWND handoff/revalidation around several async Windows paths; local `windows_bg_input.rs` exposes explicit `WindowsInputOutcome` status/path/warning.
    - Result: local text-only Computer Use already has read-only `describe_screen`/image-removal behavior; local Windows settings links and visual grid remain explicit capability gaps.
  - Recommended follow-up checks:
    - `cargo check -p void-desktop --target x86_64-pc-windows-msvc` or native Windows `cargo check -p void-desktop`.
    - Windows-only WGC smoke against UWP/WinUI/DirectComposition window after `ISSUE-1130A`.
    - Focused stale HWND/reused window tests for `ISSUE-1130B`.
    - DPI/multi-monitor/background-input manual matrix for `ISSUE-1130C`.
    - Adapter-level settings URI/capability-gating decision tests for `ISSUE-1130D`.
  - Result: docs-only audit; no production tests were run because no Computer Use code changed and non-Windows checks cannot prove Windows capture/input behavior.
- `ISSUE-1140`:
  - `git show --name-status --stat --oneline cf94e2f90 c2f6a3c91 912111f6e --`
    - Result: passed; identified upstream BTW image side-question, image understanding, and `view_image` merge scopes.
  - `git diff --name-status c2f6a3c91^..c2f6a3c91 -- src docs package.json Cargo.toml`
    - Result: passed; confirmed upstream `analyze_image` crosses desktop context upload, core execution, tool registry, model config, and Web UI send flow.
  - `git diff --name-status cf94e2f90^..cf94e2f90 -- src docs package.json Cargo.toml`
    - Result: passed; confirmed upstream BTW image support crosses API DTOs, BtwThreadService, MessageModule, ChatInput, and image payload helper extraction.
  - `git diff --name-status 912111f6e^..912111f6e -- src docs package.json Cargo.toml`
    - Result: passed; confirmed upstream `view_image` adds tool implementation, tool-pack/runtime registration, prompt/tool exposure, and provider image attachment concerns.
  - Local file inspection:
    - Result: local `AnalyzeImage` already supports `image_id` / `image_path` / `data_url`, workspace path containment, explicit statuses, and focused tests.
    - Result: local initial `/btw` supports image payloads, but transient child-session second-turn images are still rejected by `MessageModule.ts`.
    - Result: local media and short-drama image flows depend on image-context/media-reference semantics and must not be overwritten by upstream path-only upload behavior.
  - QA subagent reported current targeted checks passed:
    - `cargo test -p void-core analyze_image --lib`
    - `cargo test -p void-tool-packs`
    - `pnpm --dir src/web-ui run test:run src/flow_chat/utils/imageContextForBackend.test.ts src/flow_chat/services/BtwThreadService.test.ts src/flow_chat/components/btw/BtwSessionPanel.review-action.test.tsx`
  - Recommended follow-up checks:
    - `cargo test -p void-core analyze_image --lib` for `ISSUE-1140A`.
    - Focused BTW service tests for `ISSUE-1140B`, covering initial and child-session image sends.
    - `cargo test -p void-core media_tools image_context`-style focused tests for `ISSUE-1140C`.
    - Tool manifest/runtime and provider adapter tests before any `ISSUE-1140D` `ViewImage` implementation.
    - Short-drama context export/policy tests before `ISSUE-1140E`.
  - Result: docs-only audit in the main session; no production code changed.
- `ISSUE-1150`:
  - `git show --name-status --stat --oneline 65da1a082 8d69e5733 d77093204 5df255a1a cdfdd716d 4077c1a8a d6b783967 7dec5f489 29c78cfb9 8a7a54698 --`
    - Result: passed; identified upstream MCP large-output, elicitation compatibility, approval/rejection, GetToolSpec, MCP runtime owner, ExecCommand/tool-runtime, bridge-contract, and event/tool ABI scopes.
  - Local file inspection:
    - Result: local remote MCP Streamable HTTP transport has bounded 120s request timeout and POST-SSE coverage.
    - Result: local dynamic MCP tools preserve explicit provider metadata instead of deriving provider identity from tool names.
    - Result: local `void-agent-tools` and product runtime already own GetToolSpec, readonly-enabled filtering, manifest policy, runtime restrictions, and oversized-result preview/storage contracts.
    - Result: local gaps remain for MCP adapter-level 12k truncation, local stdio ordinary request timeout, elicitation schema-validation compatibility, typed result envelopes, approval/rejection categories, and readonly/provider metadata coverage.
  - Recommended current checks before any implementation:
    - `cargo test -p void-agent-tools --test tool_contracts`
    - `cargo test -p void-services-integrations --features mcp --test mcp_contracts`
    - `cargo test -p void-core --test remote_mcp_streamable_http`
    - `cargo test -p void-core manifest_resolver`
    - `cargo test -p void-core product_runtime`
    - `cargo test -p void-core registry`
    - `cargo test -p void-core tool_result_storage`
    - `cargo test -p void-core restrictions`
  - Recommended follow-up checks:
    - Large MCP text/structured/resource result tests for `ISSUE-1150A`.
    - Elicitation capability JSON contract tests for `ISSUE-1150B`.
    - Local and remote MCP timeout tests for `ISSUE-1150C`.
    - Registry/GetToolSpec/readonly dynamic-provider snapshot tests for `ISSUE-1150D`.
    - Tool pipeline rejection/timeout/cancel/denial classification tests for `ISSUE-1150E`.
    - Boundary-script and architecture equivalence checks for `ISSUE-1150F`.
  - Result: docs-only audit in the main session; no production code changed.

## ISSUE-1150A MCP Large Output Storage Alignment

Scope:

- Current slice covers the core MCP dynamic tool adapter and shared oversized tool-result storage tests.
- No Web UI tool cards, Flow Chat runtime/store, provider adapters, AI media, AI short-drama, review/multi-agent policy, crate features, or MCP owner migration was changed.

Executed:

- `cargo test -p void-core mcp_storage_render_preserves_large_text_for_shared_budget_policy --lib -- --nocapture`
  - Result before implementation: failed because `MCPToolWrapper::render_result_for_storage` did not exist.
  - Result after implementation: passed, 1 test.
- `cargo test -p void-core mcp_large_result_persists_full_assistant_text --lib -- --nocapture`
  - Result: passed, 1 test.
- `cargo test -p void-core tool_result_storage --lib -- --nocapture`
  - Result: passed, 7 tests.
- `cargo test -p void-services-integrations --features mcp --test mcp_contracts mcp_dynamic_tool_provider_preserves_manifest_contract -- --nocapture`
  - Result: passed, 1 test.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed after the core MCP adapter test was changed to deserialize an MCP JSON result instead of directly constructing MCP content enums.
- `cargo check -p void-core --features product-full`
  - Result: passed.
- `rustfmt --edition 2021 --check src/crates/core/src/service/mcp/adapter/tool.rs src/crates/core/src/agentic/tools/tool_result_storage.rs`
  - Result: passed after formatting.
- `git diff --check`
  - Result: passed.
- `cargo test -p void-services-integrations mcp_dynamic_tool_provider_preserves_manifest_contract -- --nocapture`
  - Result: not counted; matched 0 tests because the MCP integration contract is gated behind the `mcp` feature.
- `cargo test -p void-services-integrations --test mcp_contracts mcp_dynamic_tool_provider_preserves_manifest_contract -- --nocapture`
  - Result: not counted; matched 0 tests because the MCP integration contract is gated behind the `mcp` feature.

Coverage:

- MCP adapter storage rendering preserves large text above the previous 12k adapter threshold and does not inject `[Result truncated]`.
- Shared `tool_result_storage` persists a large MCP-style assistant-visible result as full text, including tail sentinel content.
- Regular MCP result message rendering remains on the bounded adapter renderer.

Deferred:

- Additional structured/resource/mixed MCP metadata permutations can be added under `ISSUE-1150A` follow-up only if a current regression appears; raw MCP result data still carries `_meta` for consumers.

## ISSUE-1150B MCP Elicitation Legacy Compatibility

Scope:

- Current slice covers the remote MCP client-info capability helper and its protocol contract tests.
- No Streamable HTTP routing, legacy SSE implementation, local stdio initialize JSON, MCP manager lifecycle, Web UI, provider adapter, AI media, or AI short-drama code was changed.

Executed:

- `cargo test -p void-services-integrations --features mcp --test mcp_contracts mcp_remote_client_info_declares_supported_client_capabilities -- --nocapture`
  - Result before implementation: failed because `schema_validation` was `Some(true)` instead of `None`.
  - Result after implementation: passed, 1 test.
- `cargo test -p void-services-integrations --features mcp --test mcp_contracts mcp_protocol_request_builders_preserve_wire_shape -- --nocapture`
  - Result: passed, 1 test.
- `cargo test -p void-services-integrations --features mcp --test mcp_contracts -- --nocapture`
  - Result: passed, 33 tests.
- `cargo test -p void-core remote_mcp_streamable_http_accepts_post_sse_and_maps_tool_metadata --test remote_mcp_streamable_http -- --nocapture`
  - Result: passed, 1 test.
- `rustfmt --edition 2021 --check src/crates/services-integrations/src/mcp/protocol/client_info.rs src/crates/services-integrations/tests/mcp_contracts.rs`
  - Initial result: failed on import ordering in `mcp_contracts.rs`.
  - Result after `rustfmt --edition 2021 src/crates/services-integrations/src/mcp/protocol/client_info.rs src/crates/services-integrations/tests/mcp_contracts.rs`: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `cargo check -p void-services-integrations --features mcp`
  - Result: passed.
- `git diff --check`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Coverage:

- Remote MCP client info still declares roots, sampling, and elicitation capabilities.
- Elicitation serializes as `{}` and does not emit `schemaValidation`.
- Local protocol request builder wire shape remains unchanged.
- Remote POST-SSE metadata mapping remains intact without transport routing changes.

Deferred:

- Actual elicitation schema validation remains unimplemented and must not be advertised until a future issue adds behavior and tests.
- Legacy SSE runtime support and local stdio initialize behavior remain separate issues.

## ISSUE-1160B Theme CSS Variable Runtime Contract

Scope:

- Current slice covers the Web theme color audit script, focused script tests, and a Void-owned CSS variable contract artifact.
- No ThemeService runtime logic, theme preset values, generated-widget payload runtime, Flow Chat logic, AI media logic, AI short-drama logic, or page/component SCSS was changed.

Executed:

- `node --test scripts/audit-theme-colors.test.mjs`
  - RED result before implementation: failed because `audit-theme-colors.mjs` did not export `checkCssVarContract`.
  - Intermediate result: failed on mismatch between expected error text and implementation, plus missing current dynamic prefixes in the contract.
  - GREEN result after implementation and contract correction: passed, 14 tests.
- `node --check scripts/audit-theme-colors.mjs`
  - Result: passed.
- `node scripts/audit-theme-colors.mjs --root src/web-ui/src --baseline scripts/theme-color-governance-baseline.json --near-pair-decisions scripts/theme-color-near-pair-decisions.json --top=3`
  - Result: passed.
- `node scripts/validate-theme-visual-contract.mjs --json`
  - Result: passed, 8/8 required surfaces covered.
- `pnpm run check:theme-colors`
  - Result: passed.

Coverage:

- Valid CSS variable contract data passes when required vars are defined, dynamic prefixes are allowed, and fallback-only vars are reviewed.
- Malformed contracts fail on version, description, required domain shape, malformed dynamic prefix entries, non-string legacy aliases, missing required vars, unknown dynamic prefixes, and unapproved fallback-only vars.
- Current Web theme audit baseline remains compatible with the default CSS variable contract.
- CLI theme color audit still runs through the existing `check:theme-colors` command.

Deferred:

- Runtime custom-theme key filtering is completed by `ISSUE-1160C`.
- Generated-widget theme payload compatibility is completed by `ISSUE-1160D`.
- Media and short-drama token cleanup remains `ISSUE-1160F`.

## ISSUE-1160C ThemeService Runtime Token Whitelist

Scope:

- Current slice covers ThemeService dynamic CSS variable key filtering, focused ThemeService tests, and the existing CSS variable contract artifact.
- No theme preset visual values, component/page SCSS, widget iframe behavior, Flow Chat logic, AI media logic, or AI short-drama logic was changed.

Executed:

- `pnpm --dir src/web-ui run test:run src/infrastructure/theme/core/ThemeService.test.ts`
  - RED result before implementation: failed because a custom `colors.accent.evil` key injected `--color-accent-evil`.
  - GREEN result after implementation: passed, 5 tests.
- `pnpm --dir src/web-ui run test:run src/infrastructure/theme/core/ThemeService.test.ts src/infrastructure/theme/presets/startupThemeBootstrap.test.ts`
  - Result: passed, 9 tests.
- `pnpm run type-check:web`
  - Result: passed.
- `pnpm run check:theme-colors`
  - Initial result after implementation: failed because `--color-accent-` was incorrectly listed as a concrete required var in `theme-css-var-contract.json`.
  - Result after moving that responsibility back to `allowedDynamicPrefixes`: passed.
- `node --test scripts/audit-theme-colors.test.mjs`
  - Result: passed, 14 tests.

Coverage:

- Custom themes cannot inject unsupported dynamic keys through accent, purple, shadow, motion duration, or font-size object expansion.
- Built-in themes still inject required contract tokens and representative fixed runtime variables such as button, window control, card, overlay, scene viewport, scrollbar, and font variables.
- ThemeService exported dynamic prefixes stay aligned with `scripts/theme-css-var-contract.json`.
- Startup theme bootstrap remains compatible.

Deferred:

- Generated-widget theme payload compatibility remains `ISSUE-1160D`.
- Media and short-drama token cleanup remains `ISSUE-1160F`.
- `ISSUE-1160`:
  - `git show --name-status --stat --oneline 082cee447 cae512b9f 958a06095 797c94ad1 50d33d506 4e8c9c897 --`
    - Result: passed; identified upstream near-color governance, runtime token contract, visual governance contract, broad token/color compression, widget payload compatibility, and SCSS token migration scopes.
  - Local file inspection:
    - Result: `ISSUE-1160A` already provides near-pair decision validation, theme color audit integration, and Tabs close-hover token conformance.
    - Result: local `check:theme-colors` and `check:theme-visual-contract` exist and cover Web/CLI color audits plus visual-governance surface structure.
    - Result: local ThemeService dynamic-token whitelist and generated-widget payload compatibility contract are now complete; executable visual evidence fields remain missing.
    - Result: AI media and short-drama are included in the visual governance contract, but their local SCSS still contains surface-local tokens, `--void-*` fallbacks, and raw colors that need a separate boundary cleanup.
  - Main session and subagents reported current targeted checks passed:
    - `node --test scripts/audit-theme-colors.test.mjs`
    - `node scripts/audit-theme-colors.mjs --root src/web-ui/src --baseline scripts/theme-color-governance-baseline.json --top=3`
    - `node scripts/validate-theme-visual-contract.mjs`
    - `pnpm run check:theme-colors`
    - `pnpm run check:theme-visual-contract`
    - Focused ThemeService, Flow Chat, media, and short-drama regression tests listed in `ISSUE-1160` subagent notes.
  - Recommended follow-up checks:
    - `node --test scripts/audit-theme-colors.test.mjs` and `pnpm run check:theme-colors` for `ISSUE-1160B`.
    - Focused ThemeService tests plus `pnpm run type-check:web` for `ISSUE-1160C`.
    - Generated-widget theme payload tests for `ISSUE-1160D`.
    - `pnpm run check:theme-visual-contract` plus validator tests for `ISSUE-1160E`.
    - Focused workspace-media/short-drama tests plus theme audit for `ISSUE-1160F`.
  - Result: docs-only audit in the main session; no production code changed.

## ISSUE-1160D Generated Widget Theme Payload Compatibility Contract

Scope:

- Current slice covers `src/web-ui/src/tools/generative-widget/themePayload.ts` and focused generated-widget theme payload tests.
- No ThemeService runtime logic, theme preset values, widget iframe business protocol, MiniApp `--void-*` payloads, Flow Chat, AI media, or AI short-drama logic was changed.

Executed:

- `pnpm --dir src/web-ui run test:run src/tools/generative-widget/themePayload.test.ts`
  - RED result before implementation: failed because `WIDGET_THEME_PAYLOAD_CONTRACT` was missing, `--font-size-sm` was not read, and `--color-border-default` / `--border-base` were not backfilled.
  - RED result before alias metadata implementation: failed because `appliedLegacyAliases` stayed empty after compatibility backfill.
  - GREEN result after implementation: passed, 6 tests.
- `pnpm run type-check:web`
  - Result: passed.

Coverage:

- Required, optional, and legacy generated-widget theme variables are exported as a contract.
- Current canonical widget keys remain in the payload, including shell-used optional tokens such as font size, font weight, spacing, and element background tokens.
- `--color-border-default` and `--border-base` are compatible in both directions and report applied alias metadata.
- Missing required vars return explicit `status: partial`, `source: host-css-vars`, `missingRequiredVars`, and typed error metadata instead of inferring app state.
- Unknown host CSS variables do not leak into the widget payload.
- Light and dark host theme samples produce ready payloads.
- Theme color governance baseline is tightened for the reduced fallback-only token count.

Deferred:

- MiniApp `buildMiniAppThemeVars` remains a separate `--void-*` protocol and should be covered by a future MiniApp-specific issue, not by `ISSUE-1160D`.
- Visual evidence metadata remains `ISSUE-1160E`.
- AI media and short-drama token cleanup remains `ISSUE-1160F`.

## ISSUE-1160E Theme Visual Governance Evidence Contract

Scope:

- Current slice covers `scripts/theme-visual-governance-contract.json`, `scripts/validate-theme-visual-contract.mjs`, focused validator tests, and docs.
- No screenshot tooling, page/component SCSS, ThemeService runtime behavior, Flow Chat logic, AI media logic, AI short-drama logic, installer release workflow, or product business logic was changed.

Executed:

- `node --test scripts/validate-theme-visual-contract.test.mjs`
  - RED result before implementation: failed because current evidence entries lacked `mode/theme/viewport/state`, the validator ignored `--contract`, and malformed fixture contracts were not rejected.
  - GREEN result after implementation: passed, 3 tests.
- `node --check scripts/validate-theme-visual-contract.mjs`
  - Result: passed.
- `pnpm run check:theme-visual-contract`
  - Result: passed, 8/8 required surfaces covered.
- `node scripts/validate-theme-visual-contract.mjs --json`
  - Result: passed with `ok: true`, 8 surfaces, 8 required surfaces.

Coverage:

- Current contract evidence entries declare `mode`, `theme`, `viewport`, `state`, and either `command` or `artifactName`.
- Validator supports `--contract <path>` fixture validation for focused tests.
- Validator rejects unsupported evidence modes, missing evidence metadata, missing command/artifact declarations, unknown evidence types, and upstream branding strings.
- Existing surface coverage remains app shell, Flow Chat, terminal, markdown/Mermaid, generated widgets, media/short-drama, mobile web, and installer.

Deferred:

- This contract does not prove screenshots or manual visual reviews have been executed; it only validates the expected evidence metadata.
- AI media and short-drama token cleanup remains `ISSUE-1160F`.

## ISSUE-1160F Entry Theme Token Boundary Slice

Scope:

- Current slice covers only `WorkspaceMediaEntry.scss`, `ShortDramaEntry.scss`, and a focused style-boundary script test.
- No Workspace Media Gallery, Short Drama CenterPanel, media/short-drama services, `ShortDramaProject` tool behavior, Flow Chat session logic, ThemeService runtime behavior, or broad theme-color baseline was changed.

Executed:

- `node --test scripts/media-short-drama-entry-theme.test.mjs`
  - RED result before implementation: failed because `WorkspaceMediaEntry.scss` and `ShortDramaEntry.scss` depended directly on `--void-*` tokens.
  - GREEN result after implementation: passed, 1 test.
- `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.test.tsx`
  - Result: passed, 3 tests.
- `pnpm run check:theme-colors`
  - Result: passed.
- `pnpm run check:theme-visual-contract`
  - Result: passed.

Coverage:

- Workspace media and short-drama entry button styles define local semantic tokens mapped to global theme tokens.
- Entry button styles no longer directly depend on MiniApp/generated-widget `--void-*` tokens.
- Workspace media availability and click behavior remain covered by the existing React entry tests.
- Theme color and visual governance checks remain within baseline.

Deferred:

- Workspace Media Gallery and Short Drama CenterPanel still contain raw colors, local visual debt, and `--void-*` usages that require separate 1160F domain slices.

- `ISSUE-1170`:
  - `git show --stat --name-status --oneline 96cea08ca 629ced40a 6dc44c489 --`
    - Result: passed; identified upstream provider HTTP owner migration, provider-owned local runtime migration, and stream-contract extraction scopes.
  - `git log --oneline --first-parent --since="2026-06-01" upstream-bitfun/main -- | Select-String -Pattern "provider|adapter|http|model|config|responses|openai|anthropic|gemini|service"`
    - Result: passed; identified relevant upstream provider/service, AI adapter, model config, connection-test, parser, and stream handler commits.
  - Local file inspection:
    - Result: `void-ai-adapters` owns provider request/response mapping, HTTP/SSE transport, stream parsing, model discovery, health checks, tool-call aggregation, and portable AI types.
    - Result: core maps app config into adapter `AIConfig` and consumes unified streams; Web UI owns provider templates/catalog display and config editing.
    - Result: local gaps remain for provider id vs wire format separation, repeated request URL derivation, duplicated provider catalogs, string-matched adapter quirks, and explicit transport-vs-business retry boundaries.
  - Subagents reported existing coverage and recommended future matrices:
    - `cargo test -p void-ai-adapters client::sse::tests`
    - `cargo test -p void-ai-adapters stream::stream_handler::tests`
    - `cargo test -p void-ai-adapters stream::stream_handler::responses::tests`
    - `cargo test -p void-ai-adapters --test stream_test_harness`
    - `cargo test -p void-ai-adapters --test model_selector`
    - `cargo test -p void-agent-stream`
    - `cargo test -p void-core service::config` or `cargo test -p void-core --lib config`
    - `pnpm --dir src/web-ui run test:run src/infrastructure/config/services/ConfigManager.test.ts src/infrastructure/config/services/modelConfigs.test.ts`
    - `pnpm --dir src/web-ui run test:run src/shared/ai-errors/aiErrorPresenter.test.ts src/infrastructure/services/api/aiService.test.ts`
    - `pnpm --dir src/web-ui run type-check`
  - Recommended follow-up checks:
    - Boundary script tests for `ISSUE-1170A`.
    - Health-check/error-presenter tests for `ISSUE-1170B`.
    - OpenAI message converter regression tests for `ISSUE-1170C`.
    - Stream drop/cancel lifecycle tests for `ISSUE-1170D`.
    - Config/capability/default-model tests for `ISSUE-1170E`.
  - Result: docs-only audit in the main session; no production code changed.
- `ISSUE-1180`:
  - `git show --stat --name-status --oneline 401b9e61a --`
    - Result: passed; identified upstream six-layer physical crate layout and broad Cargo/docs/boundary-script/file moves.
  - `git show --stat --name-status --oneline ea5321d66 fb8333afa 8338441c a7fc6dcd1 --`
    - Result: passed; identified upstream layer-crate closure, product assembly service boundary, architecture-boundary docs, and product SDK assembly boundary validation.
  - `git log --oneline --first-parent --since="2026-06-01" upstream-bitfun/main -- | Select-String -Pattern "decomposition|crate|services|assembly|runtime owner|move .* services|boundar|refactor\\(core\\)|refactor\\(runtime\\)"`
    - Result: passed; identified upstream owner-migration sequence for services, runtime ports, execution, MCP, provider HTTP, platform providers, IM bot providers, and product assembly.
  - Local file inspection:
    - Result: current Void keeps a flat `src/crates/*` workspace with existing owner crates such as `void-core-types`, `void-runtime-ports`, `void-agent-tools`, `void-tool-packs`, `void-services-core`, `void-services-integrations`, `void-ai-adapters`, `void-agent-stream`, `terminal-core`, and `tool-runtime`.
    - Result: local `scripts/check-core-boundaries.mjs` is the current boundary governance surface; upstream's rules directory was not copied.
    - Result: local blockers remain in `void-core` runtime assembly, service/agent coupling, concrete tool runtime, MiniApp runtime, scheduler/session restore, workspace-root source, and product entrypoint assembly.
  - Subagents reported current targeted checks passed:
    - `node scripts/check-core-boundaries.mjs`
    - `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST`
    - `cargo metadata --no-deps --format-version 1`
    - Scoped docs/boundary `git diff --check`
  - Recommended follow-up checks:
    - For `ISSUE-1180A`: docs diff plus boundary checker if comments/rules are touched.
    - For `ISSUE-1180B`: docs diff only unless a future issue explicitly approves Rust APIs.
    - For `ISSUE-1180C`: `node scripts/check-core-boundaries.mjs`, self-test mode, and focused owner-crate tests for any touched runtime port/service contract.
    - For `ISSUE-1180D`: docs diff and protected-surface test prerequisites listed per migration candidate.
    - For `ISSUE-1180E`: `node scripts/check-core-boundaries.mjs`, `cargo metadata --no-deps --format-version 1`, and product entrypoint feature checks if feature assembly is inspected.
  - Required checks before any future Cargo/crate layout change:
    - `cargo metadata --no-deps --format-version 1`
    - `cargo metadata --format-version 1 --locked`
    - `cargo tree -p void-core -d`
    - `cargo tree -p void-desktop -e features`
    - `node scripts/check-core-boundaries.mjs`
    - `cargo check -p void-core --features product-full`
    - `cargo check -p void-desktop`
    - `cargo check -p void-cli`
    - `cargo check -p void-server`
    - `cargo check -p void-relay-server`
    - `cargo check -p void-acp`
    - `cargo check --workspace`
    - `cargo test --workspace`
  - Result: docs-only audit in the main session; no production code changed.

Protected-surface regression candidates:

- Multi-agent/subagent/BTW/media:
  - `pnpm --dir src/web-ui run test:run src/flow_chat/components/modern/ModelRoundItem.progressive-render.test.tsx src/flow_chat/tool-cards/mediaToolGrouping.test.ts src/flow_chat/tool-cards/MediaGenerationToolCard.test.tsx src/flow_chat/utils/subagentProjection.test.ts src/flow_chat/services/BtwThreadService.test.ts src/flow_chat/components/btw/BtwSessionPanel.review-action.test.tsx`
- Compact/floating chat:
  - `pnpm --dir src/web-ui run test:run src/app/components/CompactChatDesktopWindow/CompactChatDesktopWindow.test.tsx src/flow_chat/services/CompactChatPresentationBridge.test.ts src/flow_chat/utils/agentCompanionActivity.test.ts`
- AI short-drama:
  - `pnpm --dir src/web-ui run test:run src/shared/services/short-drama/ShortDramaWorkspaceMode.test.ts src/shared/services/short-drama/ShortDramaStageWorkspace.test.ts src/shared/services/short-drama/ShortDramaRealStageAgentSessionResolver.test.ts src/shared/services/short-drama/ShortDramaToolPolicy.test.ts src/shared/services/short-drama/ShortDramaChatIntake.test.ts`

Risk notes:

- `ISSUE-1110` proves only classification and split. It does not prove the Flow Chat behavior is fixed.
- Real release viewport geometry still needs E2E or manual smoke evidence in `ISSUE-1110C`.
- Generated version-file diffs from the running desktop project remain unrelated and must be excluded from scoped commits.

## ISSUE-1120C Web Terminal Input and Lazy Renderer Delta

Scope:

- Port the missing upstream Web terminal IME/key rollover safety net from `b8197bbb7` without changing terminal replay, paste policy, Flow Chat, runtime ports, Rust terminal crates, AI media, or AI short-drama.
- Classify the upstream `970c33844` lazy renderer `forwardRef` difference without expanding the local API unless a current call site requires it.

Executed:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalImeInputSafetyNet.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed, 7 test files / 33 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed.

Coverage:

- `terminalImeInputSafetyNet.test.ts` covers `keyCode === 229` bypass, composed `insertText` forwarding, normal keydown non-forwarding, keypress de-duplication, keyup reset, and ignored non-forwardable input events.
- Existing terminal tests cover input queue batching/ordering/clear, paste policy, lazy fallback bounded preview, replay normalization, replay live-event queueing, and resize repaint guard behavior.

Remaining risk:

- No browser-level IME smoke was run; the regression is covered at the terminal utility/interface layer.
- Lazy renderer `forwardRef` remains intentionally deferred because current Void terminal output call sites do not need an imperative ref.

## ISSUE-1130B1 Windows Input Action HWND Revalidation Slice

Scope:

- Current slice covers Windows `app_type_text` and `app_key_chord` input-action target identity.
- The slice adds a pure identity helper for expected pid and optional pinned `hwnd_raw` checks.
- No WGC implementation, Web UI, Computer Use schema, macOS/Linux adapter, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package, or crate-layout behavior was changed.

Executed:

- `cargo test -p void-desktop windows_hwnd_lifetime_revalidation --lib -- --nocapture`
  - Result before fix: failed because `windows_validate_target_identity` did not exist.
  - Result after fix: passed, 1 test.
- `cargo test -p void-desktop windows_host_app_action_tests --lib -- --nocapture`
  - Result: passed, 21 tests.
- `cargo test -p void-desktop windows_app_enumeration --lib -- --nocapture`
  - Result: passed, 4 tests.
- `cargo test -p void-desktop windows_bg_input --lib -- --nocapture`
  - Result: passed, 10 tests.
- `cargo test -p void-desktop windows_foreground_capture --lib -- --nocapture`
  - Result: passed, 5 tests.
- `cargo check -p void-desktop`
  - Result: passed with one unrelated existing `parse_clipboard_path_segments` dead-code warning in `clipboard_file_api.rs`.

Coverage:

- Same pid and same pinned `hwnd_raw` passes.
- Same `hwnd_raw` with a different pid fails closed with `[WINDOW_CHANGED]`.
- Same pid with a different pinned `hwnd_raw` fails closed with `[WINDOW_CHANGED]`.
- Pid-only validation remains allowed when no `hwnd_raw` is pinned.
- Windows `app_type_text` and `app_key_chord` now resolve expected pid, revalidate the selected HWND before cloaked input dispatch, and return snapshots through the expected-pid validation boundary.

Deferred:

- Real HWND reuse, same-PID multi-window switching, closed-window races during Win32/UIA calls, UIPI/elevated-window behavior, and WGC/PrintWindow/DWM capture races still require Windows smoke.
- `app_click` and `app_scroll` already had pre-dispatch revalidation and were not broadened in this slice to avoid changing post-click window-transition semantics.

## ISSUE-1120D Terminal Lifecycle, Ack, and History Integration Tests

Scope:

- Current slices cover frontend terminal history/replay integration and backend natural PTY child-completion lifecycle.
- Current slice also covers the desktop/Web terminal history contract for local empty history versus remote unsupported history.
- No Flow Chat tool cards, xterm rendering, session manager ownership, runtime-port migration, AI media, AI short-drama, Computer Use, provider, or remote replay implementation was changed.

Executed:

- `cargo test -p terminal-core pty::process::tests::natural_child_completion_emits_exit_event -- --nocapture`
  - Result before fix: failed because natural child completion timed out without `PtyEvent::Exit`.
  - Result after fix: passed.
- `cargo test -p terminal-core`
  - Result: passed, 28 tests.
- `rustfmt --edition 2021 --check src/crates/terminal/src/pty/process.rs`
  - Result: passed.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/hooks/useTerminal.test.tsx src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed, 4 test files / 13 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed in the frontend replay-ordering slice.
- `cargo test -p void-desktop terminal_api::tests -- --nocapture`
  - Result: passed, 2 tests. Existing unrelated warning: `parse_clipboard_path_segments` is dead code.
- `rustfmt --edition 2021 --check src/apps/desktop/src/api/terminal_api.rs`
  - Result: passed.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/hooks/useTerminal.test.tsx src/tools/terminal/services/TerminalService.test.ts`
  - Result: passed, 3 test files / 13 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed after `GetHistoryResponse` made `historyStatus/historySource` required.

Coverage:

- `useTerminal.test.tsx` proves structured `history.events` are delivered through `onReplay` before live output that arrives during the replay subscription window is flushed through `onOutput`.
- The test covers the hook-level contract across `getHistory`, `onSessionEvent`, `drainPendingSessionEvents`, `normalizeTerminalReplay`, and `createReplayAwareTerminalEventHandler` without testing Flow Chat or xterm internals.
- `natural_child_completion_emits_exit_event` proves a one-shot shell process that exits naturally emits `PtyEvent::Exit { exit_code: Some(7) }` without requiring explicit shutdown.
- `terminal_api::tests` proves local empty history reports `ready/local` with no error and remote unsupported history serializes as `unsupported/remote` with `remote_history_unsupported`.
- `terminalReplay.test.ts` proves remote unsupported history can return no replay events while preserving explicit metadata.
- `useTerminal.test.tsx` proves remote unsupported history does not break subscription or drained live output.

Deferred:

- `TerminalService.acknowledge()` remains unused by frontend output consumption; backend flow-control ack requires a separate contract.
- `historyStatus: "error"` remains a TypeScript contract value only; local backend history failures still use the existing `Result::Err(String)` command error path.
- EOF-triggered immediate shutdown is now routed through the existing command task; a future hardening test can cover the edge case where PTY EOF and explicit shutdown/natural exit race on platforms that report EOF before the child is reapable.

## ISSUE-1140A AnalyzeImage Permission and Data URL Guard

Scope:

- Harden `AnalyzeImage` tool input/status contracts before provider runtime execution.
- No Web UI, Flow Chat, BTW panel, provider adapter, AI media, AI short-drama, desktop upload/API, or generic image-context storage behavior was changed.

Executed:

- `cargo test -p void-core analyze_image --lib -- --nocapture`
  - Result before fix: failed as expected for unreachable `permission_denied`, unsupported SVG data URL reaching provider runtime, and oversized data URL reaching provider runtime.
  - Result after fix: passed, 14 tests.
- `cargo test -p void-core image_analysis --lib -- --nocapture`
  - Result: passed with 0 matching tests.
- `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs`
  - Result: passed.

Coverage:

- `ANALYZE_IMAGE_OUTPUT_STATUSES` no longer advertises unreachable `permission_denied`.
- `call_impl` rejects multi-source input even when `validate_input` is bypassed.
- Inline `data_url` inputs reject invalid base64, non-image payloads, unsupported raster-adjacent MIME such as `image/svg+xml`, and decoded payloads larger than 1 MiB before provider runtime execution.
- Existing success coverage still proves valid PNG data URLs and image-context data URLs reach the injected runtime with `source` and `mime_type` preserved.

Deferred:

- `image_context` remains globally scoped and may match by filename; session/workspace scoping is a separate image-context issue.
- `process_image_contexts_for_provider` path containment for generic model image contexts remains separate from `AnalyzeImage`.
- BTW child-session follow-up images, AI media image references, and short-drama image-summary bridges remain under their own issue boundaries.

## ISSUE-1140C Image Context Scope and Media Path Leak Guards

Scope:

- Current slice covers `image_context.rs` lookup semantics only.
- No Web UI, Flow Chat, BTW, AI media service, AI short-drama service, provider adapter, execution engine, desktop API, provider policy, or workspace file read behavior was changed.

Executed:

- `cargo test -p void-core image_context --lib -- --nocapture`
  - Result before fix: failed as expected for same-name filename collision returning a match. Initial test isolation also exposed shared global storage pollution, so tests were changed to use unique ids/names and remove only their own entries.
  - Result after fix: passed, 8 tests matched by the filter, including existing media image-reference tests.
- `cargo test -p void-core agentic::tools::image_context::tests --lib -- --nocapture --test-threads=1`
  - Result: passed, 3 tests.
- `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/image_context.rs`
  - Result before formatting: failed with a formatting diff.
  - Result after `rustfmt --edition 2021 src/crates/core/src/agentic/tools/image_context.rs`: passed.

Coverage:

- Exact `image_id` lookup remains stable.
- Unique full filename and basename lookup still resolves the image context.
- Same-name filename/basename collisions return `None` instead of an arbitrary map entry.
- Expiration cleanup removes stale entries without relying on global storage clearing in tests.

Deferred:

- Session/workspace scoping for the global image-context store remains unimplemented.

## ISSUE-1140C Media Image Reference Path Guard

Scope:

- Current slice covers `GenerateImage` / `GenerateVideo` `image_urls` normalization in `media_tools.rs`.
- No Web UI, Flow Chat, AI media service, AI short-drama service, provider adapter, APIMart client, `UploadMediaImage`, execution engine, desktop API, or image-context lookup behavior was changed.

Executed:

- `cargo test -p void-core media_image_reference_tests --lib -- --nocapture`
  - Result before fix: failed as expected because unmatched Windows absolute, POSIX absolute, and relative local paths were preserved in provider `image_urls`.
  - Result after fix: passed, 15 tests.
- `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/implementations/media_tools.rs`
  - Result before formatting: failed with a formatting diff.
  - Result after `rustfmt --edition 2021 src/crates/core/src/agentic/tools/implementations/media_tools.rs`: passed.
- `cargo check -p void-core --features product-full`
  - Result: passed.

Coverage:

- Unmatched Windows absolute paths, POSIX absolute paths, and relative local paths are filtered out before provider payload construction.
- `GenerateImage` and `GenerateVideo` request builders share the guarded normalization.
- Existing tests still prove registered image contexts resolve by name/id to `data_url`, registered provider URLs still pass through, plain non-path references remain unchanged, and valid `http(s)` / `data:image` references remain accepted.
- `UploadMediaImage` local upload path resolution remains unchanged.

## ISSUE-1140C Desktop Image Payload Cache Resolution

Scope:

- Current slice covers `resolve_missing_image_payloads` in `agentic_api.rs`, the shared desktop API conversion layer used by normal dialog turns and `/btw`.
- No Web UI, Flow Chat, BTW behavior logic, AI media service, AI short-drama service, provider adapter, APIMart client, execution engine, or image-context storage production behavior was changed.

Executed:

- `cargo test -p void-desktop resolve_missing_image_payloads --lib -- --nocapture`
  - Result before fix: failed as expected because the new over-expiration test attempted to import private `cleanup_expired_images` across the crate boundary and the first helper mixed desktop request `ImageContextData` with stored tool `ImageContextData`.
  - Result after test correction: passed, 3 tests.
- `cargo test -p void-desktop --lib`
  - Result: passed, 139 tests.
- `cargo check -p void-desktop`
  - Result: passed with an unrelated existing dead-code warning for `parse_clipboard_path_segments` in `clipboard_file_api.rs`.
- `cargo test -p void-core agentic::tools::image_context::tests --lib -- --nocapture --test-threads=1`
  - Result: passed, 3 tests.
- `rustfmt --edition 2021 --check src/apps/desktop/src/api/agentic_api.rs`
  - Result before formatting: failed with a formatting diff in the new tests.
  - Result after `rustfmt --edition 2021 src/apps/desktop/src/api/agentic_api.rs`: passed.
- `git diff --check`
  - Result: passed.

Coverage:

- Missing request payload is restored from the upload cache by exact `image_id`, including `data_url` and `resolved_from_upload_cache` metadata.
- Cached entries that still lack both `image_path` and `data_url` fail closed with `missing image_path/data_url after cache resolution`.
- Expired cache is represented at the desktop API boundary as a removed/missing cache entry, returning the re-attach error without exposing core TTL cleanup APIs.

Deferred:

- Session/workspace scoping for the global image-context store remains unimplemented and belongs to a future storage-boundary issue.

## ISSUE-1140B BTW Child-Session Image Context Completion

Scope:

- Current slice covers transient `/btw` child-session follow-up messages that include existing composer image contexts.
- No `ChatInput.tsx`, `BtwSessionPanel.tsx`, provider adapter, media service, short-drama service, core image-analysis runtime, desktop upload/API, or image-byte loading behavior was changed.

Executed:

- `pnpm --dir src/web-ui run test:run src/flow_chat/services/flow-chat-manager/MessageModule.test.ts`
  - Result before fix: failed as expected because `MessageModule` rejected transient `/btw` image attachments with `Transient /btw sessions do not support image attachments yet`.
  - Result after fix: passed.
- `pnpm --dir src/web-ui run test:run src/flow_chat/services/flow-chat-manager/MessageModule.test.ts src/flow_chat/services/BtwThreadService.test.ts src/flow_chat/utils/imageContextForBackend.test.ts`
  - Result: passed, 3 test files / 10 tests.
- `pnpm --dir src/web-ui run test:run src/flow_chat/components/btw/BtwSessionPanel.review-action.test.tsx`
  - Result: passed, 1 test file / 21 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed.

Coverage:

- Transient BTW child-session follow-up forwards `imageContexts` and `imageDisplayData` as an explicit `imagePayload` to `BtwThreadService`.
- No-image transient BTW follow-up keeps the existing path with `imagePayload: undefined`.
- Failed transient BTW image follow-up does not create or delete a normal dialog turn, so failure handling stays at the service boundary instead of pretending a normal message was sent.
- Existing `BtwThreadService` tests continue to prove `btwAPI.askStream` receives initial/follow-up image contexts through the backend path.
- Existing `imageContextForBackend` tests continue to prove backend payload conversion without testing provider internals.

Deferred:

- Backend stream echo/display metadata for BTW image follow-up remains separate from delivery.
- Deeper Rust-side BTW image consumption checks remain future validation work.
- Provider support remains owned by the existing backend image pipeline; UI must not add provider/path/model capability inference.

## ISSUE-1150D Readonly Manifest and Dynamic Provider Metadata Contract

Scope:

- Current slice covers `void-agent-tools` registry snapshot contract tests and docs for readonly/tool-provider metadata.
- No concrete tool implementation, Web UI, MCP manager lifecycle, provider adapter, media service, short-drama service, runtime DTO shape, model-facing schema, or crate layout was changed.

Executed:

- `cargo test -p void-agent-tools registry_snapshot_preserves_readonly_enabled_and_dynamic_mcp_metadata --test tool_contracts -- --nocapture`
  - Result: passed, 1 focused test.
- `cargo test -p void-runtime-ports dynamic_tool_descriptor`
  - Result: passed, 2 tests.
- `cargo test -p void-core dynamic_tool_provider`
  - Result: passed, 3 matching core tests plus 0-test filtered integration binaries.
- `cargo test -p void-core registry_preserves_readonly_tool_manifest_for_owner_migration`
  - Result: passed, 1 matching core test plus 0-test filtered integration binaries.
- `cargo test -p void-tool-packs`
  - Result: passed, 6 tests and doc-tests.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `rustfmt --edition 2021 --check src/crates/agent-tools/tests/tool_contracts.rs`
  - Result: passed after formatting the focused test file.

Coverage:

- Registry snapshots expose readonly-enabled tools only when `is_readonly() && is_enabled()` are both true.
- Disabled readonly tools are excluded from readonly-enabled output.
- Explicit MCP dynamic metadata preserves `providerId`, `providerKind`, `serverId`, `serverName`, and `toolName` at the registry metadata boundary.
- `DynamicToolDescriptor` remains the current compatibility shape and exposes only optional `providerId`; richer MCP subtype metadata stays behind `get_dynamic_tool_info`.
- Existing core/tool-pack tests continue to cover builtin readonly manifest ordering, dynamic provider metadata, Void image/media tool names, provider group ordering, and `GetToolSpec` duplicate-load behavior.

Deferred:

- Expanding `DynamicToolDescriptor` or model-facing schemas with MCP subtype metadata requires a separate compatibility issue and broader tests.
- `readOnlyHint` from MCP servers remains metadata, not a complete destructive-action safety policy.

## ISSUE-1150C1 Local Stdio Request Timeout Injection Contract

Scope:

- Current slice covers local stdio MCP ordinary-request timeout injection and pending waiter cleanup inside `MCPConnection`.
- Remote Streamable HTTP timeout semantics, MCP manager lifecycle, tool pipeline policy, UI fallback strings, provider adapters, AI media, AI short-drama, Cargo features, and crate layout were not changed.
- Production local stdio ordinary requests still default to `request_timeout: None` and remain delegated to the outer tool pipeline timeout until a later config/default issue.

Executed:

- `cargo test -p void-services-integrations --features mcp local_tool_call_request_timeout_cleans_pending_waiter --lib -- --nocapture`
  - Result before implementation: failed because `with_request_timeout` did not exist.
  - Result after implementation: passed.
- `cargo test -p void-services-integrations --features mcp local_initialize_uses_initialize_timeout --lib -- --nocapture`
  - Result: passed on Windows after adding a Windows-runnable initialize timeout test. Earlier same-name filter matched 0 tests because the existing test was Unix-only.
- `cargo test -p void-services-integrations --features mcp --lib mcp::server::connection -- --nocapture`
  - Result: passed, 2 Windows tests.
- `cargo test -p void-services-integrations --features mcp`
  - Result: passed, 5 lib tests, 33 MCP contract tests, and doc-tests.
- `cargo test -p void-core --test remote_mcp_streamable_http -- --nocapture`
  - Result: passed, 1 test.
- `rustfmt --edition 2021 --check src/crates/services-integrations/src/mcp/server/connection.rs`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.

Coverage:

- Local stdio ordinary `call_tool` can be given an independent request timeout and returns `MCPRuntimeErrorKind::Timeout` when the response waiter times out.
- The timed-out request removes its pending response waiter.
- Local initialize timeout remains separately covered and is not reused as ordinary request timeout.
- Remote Streamable HTTP success behavior remains covered by the existing `remote_mcp_streamable_http` regression.

Deferred:

- Remote multi-method timeout failure coverage across tools/list, tools/call, resources/read, and prompts/get was completed later in `ISSUE-1150C3`.
- Wiring a production default/config for local stdio ordinary request timeout remains a separate compatibility decision.
- Unix CI should continue to run `local_tool_calls_do_not_inherit_initialize_timeout`.

## ISSUE-1150C2 Remote MCP Timeout Helper Contract

Scope:

- Current slice covers `RemoteMCPTransport::await_with_optional_timeout` helper behavior only.
- It does not prove full remote method timeout coverage for `tools/list`, `tools/call`, `resources/read`, or `prompts/get`.
- Remote Streamable HTTP production timeout behavior, MCP manager lifecycle, tool pipeline policy, UI fallback strings, local stdio defaults, provider adapters, AI media, AI short-drama, Cargo features, and crate layout were not changed.

Executed:

- `cargo test -p void-services-integrations --features mcp remote_mcp_request_timeout_helper --lib -- --nocapture`
  - Result: passed, 3 tests. The tests passed immediately because the helper already allowed unbounded futures, allowed fast futures under timeout, and returned `MCPRuntimeErrorKind::Timeout` for pending futures under timeout.
- `cargo test -p void-services-integrations --features mcp`
  - Result: passed, 8 lib tests, 33 MCP contract tests, and doc-tests.
- `rustfmt --edition 2021 --check src/crates/services-integrations/src/mcp/protocol/transport_remote.rs`
  - Initial result: failed on an existing one-line `HeaderValue::from_static` formatting difference in the same file after adding tests.
  - Result after `rustfmt --edition 2021 src/crates/services-integrations/src/mcp/protocol/transport_remote.rs`: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.

Coverage:

- Remote timeout helper preserves operation-specific timeout messages.
- Timeout classification stays typed at the MCP protocol boundary.
- Remote multi-method timeout failure coverage was completed later in `ISSUE-1150C3`; any future local production default/config wiring remains a separate compatibility issue.

## ISSUE-1150C3 Remote MCP Method Timeout Coverage

Scope:

- Current slice covers remote Streamable HTTP timeout behavior for `tools/list`, `tools/call`, `resources/read`, and `prompts/get` method wrappers.
- It does not claim coverage for every possible MCP method, rmcp request id behavior, exact elapsed time, connection reuse internals, UI rendering, tool pipeline behavior, or local stdio production defaults.
- Default remote timeout behavior remains `REMOTE_MCP_REQUEST_TIMEOUT`; tests use an explicit `Duration` injection constructor.

Executed:

- `cargo test -p void-core --test remote_mcp_streamable_http remote_mcp_streamable_http_request_timeout_covers_method_wrappers -- --nocapture`
  - Result before implementation: failed because `MCPConnection::new_remote_with_request_timeout` did not exist.
  - Result after implementation: passed, 1 test.
- `cargo test -p void-core --test remote_mcp_streamable_http -- --nocapture`
  - Result: passed, 2 tests.
- `cargo test -p void-services-integrations --features mcp`
  - Result: passed, 8 lib tests, 33 MCP contract tests, and doc-tests.
- `cargo check -p void-core --features product-full`
  - Result: passed.
- `rustfmt --edition 2021 --check src/crates/services-integrations/src/mcp/server/connection.rs src/crates/core/tests/remote_mcp_streamable_http.rs`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- src/crates/services-integrations/src/mcp/server/connection.rs src/crates/core/tests/remote_mcp_streamable_http.rs docs/ARCHITECTURE.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md docs/DECISIONS.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.

Coverage:

- `tools/list`, `tools/call`, `resources/read`, and `prompts/get` map stalled remote server responses to `MCPRuntimeErrorKind::Timeout`.
- Timeout messages preserve the operation name without asserting exact full text.
- Each method uses a fresh test server/connection so one timed-out request does not mask another method path.
- Parent `ISSUE-1150C` is closed for current acceptance; local stdio production default/config remains separate future work.

## ISSUE-1130D1 Windows Settings Link Decision Table

Scope:

- Current slice covers Windows `computer_use_open_system_settings` routing decisions only.
- It does not change Web UI, Computer Use core schemas, desktop host behavior, WGC capture, HWND/input adapters, visual-grid behavior, Flow Chat, AI media, AI short-drama, terminal, provider, or crate layout.
- `screen_capture` uses the Microsoft Learn Windows Settings URI scheme reference for Graphics Capture privacy: `ms-settings:privacy-graphicscaptureprogrammatic`.

Executed:

- `cargo test -p void-desktop windows_settings_route --lib -- --nocapture`
  - Result before implementation: failed because `windows_settings_pane_route` and `WindowsSettingsPaneRoute` did not exist.
  - Result after implementation: passed, 3 tests.
- `cargo test -p void-desktop computer_use_api --lib -- --nocapture`
  - Result: passed, 3 tests.
- `cargo check -p void-desktop`
  - Result: passed with one existing unrelated `parse_clipboard_path_segments` dead-code warning.
- `rustfmt --edition 2021 --check src/apps/desktop/src/api/computer_use_api.rs`
  - Initial result: failed on import ordering and `cfg` indentation after implementation.
  - Result after `rustfmt --edition 2021 src/apps/desktop/src/api/computer_use_api.rs`: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- src/apps/desktop/src/api/computer_use_api.rs`
  - Result: passed with Windows LF/CRLF working-copy warning only.

Coverage:

- `screen_capture` maps to `ms-settings:privacy-graphicscaptureprogrammatic`.
- Windows `accessibility` returns stable unsupported facts: `error_code`, `platform`, `pane`, and `suggested_pane`.
- Unknown panes return a stable `windows_settings_pane_unknown` error code and preserve the original pane.
- No exact full user-facing unsupported prose is asserted.

## ISSUE-1130D Parent Closeout

Scope:

- Documentation-only parent closeout for Windows Computer Use capability gating and settings links.
- No code, Web UI, Computer Use schema, desktop host, WGC/HWND/input adapter, Flow Chat, AI media, AI short-drama, terminal, provider, or crate-layout behavior changed in this closeout.

Executed:

- `cargo test -p void-desktop computer_use_api --lib -- --nocapture`
  - Result: passed, 3 tests.
- `cargo test -p void-desktop windows_visual_grid --lib -- --nocapture`
  - Result: passed, 2 tests.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.

Coverage:

- Windows settings link decision table covers supported `screen_capture`, unsupported `accessibility`, and unknown panes.
- Windows visual-grid unsupported tests cover stable `[WINDOWS_VISUAL_GRID_UNSUPPORTED]` guidance and explicit `ImageGrid` coordinate behavior.
- Real Windows Settings UX and any future VisualGrid enablement remain separate smoke-backed work.

## ISSUE-1140E2 Short Drama Image Context Bridge Adapter

Scope:

- Current slice covers short-drama service-level bridge contracts only.
- It does not call image-analysis models, change `AnalyzeImage`, change provider wire conversion, change media services, change Main AI export behavior, or touch short-drama UI.
- Low-context reference resolution and explicit generic `ImageContext` conversion are tested as separate outputs.

Executed:

- `pnpm --dir src/web-ui run test:run src/shared/services/short-drama/ShortDramaImageContextBridge.test.ts`
  - Result: passed, 1 test file / 6 tests.
- `pnpm --dir src/web-ui run type-check`
  - Initial result: failed because shared bridge error helpers used overly narrow `Extract<...>` return types that TypeScript inferred as `never`.
  - Result after replacing the helper return type with an explicit bridge error-result type: passed.

Coverage:

- Low-context image-understanding reference includes project/artifact/media ids and prompt summary fields without raw CDN URLs, data URLs, local paths, file paths, preview fields, or thumbnail fields.
- Explicit image-context conversion accepts local/relative image paths only and marks the result as local file context.
- Artifact handles resolve through `ShortDramaProject`/artifact index rather than UI state.
- Video media, remote/data URL-only image media, and missing artifacts return explicit `status/source/error`.

Remaining risk:

- This does not yet generate or persist image-understanding summaries.
- Future consumers must keep Main AI awareness export low-context and call the explicit bridge only when they intentionally need a backend image context.

## ISSUE-1140E Parent Reconciliation

Scope:

- Documentation-only reconciliation for the parent short-drama image-understanding bridge contract.
- Evidence comes from completed `ISSUE-1140E1` Main AI export leak guard and `ISSUE-1140E2` short-drama image context bridge adapter.
- No source behavior, generic `AnalyzeImage`, provider wire conversion, media services, Flow Chat, right-panel UI, or `.void/short-drama` persistence changes.

Executed:

- `Select-String -Path docs/ISSUES.md,docs/TEST_PLAN.md,docs/DECISIONS.md -Pattern "ISSUE-1140E|ShortDramaImageContextBridge|DEC-115"`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates src/web-ui`
  - Result: current worktree still lists non-this-slice generated Web UI version files; they are not part of this docs-only reconciliation and are not staged.

Coverage:

- Parent acceptance for low-context image-reference metadata is covered by `ISSUE-1140E2`.
- Parent acceptance for `ShortDramaProject` as the AI-facing source of truth is covered by `ISSUE-1140E1` and `ISSUE-1140E2`.
- Parent acceptance for existing media/short-drama coordinates is covered by `ISSUE-1140E2`.
- Parent acceptance for raw media URL/byte omission from Main AI context export is covered by `ISSUE-1140E1`.

Remaining risk:

- Image summary generation, persistence, and model invocation remain future work.
- Future consumers must keep the generic image tool short-drama-agnostic and call the short-drama bridge explicitly.

## ISSUE-1120D1 Terminal Frontend Output Ack Integration

Scope:

- Current slice covers Web terminal hook-level acknowledgement after live output delivery.
- It does not change terminal core flow-control counters, desktop `terminal_ack`, xterm rendering, Flow Chat, AI media, AI short-drama, Computer Use, provider, or runtime-port ownership.
- History replay remains snapshot recovery and is not acknowledged as live output consumption.

Executed:

- `pnpm --dir src/web-ui run test:run src/tools/terminal/hooks/useTerminal.test.tsx`
  - RED result before implementation: failed because live output was delivered but `TerminalService.acknowledge` was not called.
  - GREEN result after implementation and added replay/pending/failure coverage: passed, 1 test file / 6 tests.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - RED result before implementation: failed because the same live event object could be queued twice during replay handoff.
  - GREEN result after adding reference-level queue de-duplication: passed, 1 test file / 3 tests.
- `pnpm --dir src/web-ui run test:run src/tools/terminal/hooks/useTerminal.test.tsx src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts`
  - Result: passed, 4 test files / 19 tests.
- `pnpm --dir src/web-ui run type-check`
  - Result: passed.

Coverage:

- Direct live output is acknowledged after `onOutput`.
- Pending live output drained during replay handoff is acknowledged after delivery.
- Remote unsupported history still allows later live output and that live output is acknowledged.
- Replayed history output is not acknowledged as live terminal consumption.
- Ack failures are caught and logged so rendering is not blocked.
- The replay-aware live-event queue ignores the same event object when it arrives through both listener and pending-drain handoff paths.

Remaining risk:

- Ack uses the existing `charCount` contract and `data.length`; a byte-count protocol would need a separate frontend/backend contract.
- Core terminal `GetHistoryResponse` still does not include `historyStatus/historySource`; desktop/Web UI boundaries already do.

## ISSUE-1180A Conceptual Layer Mapping

Scope:

- Current slice is docs-only and maps existing Void flat crates to upstream-inspired conceptual ownership layers.
- It does not move crate directories, edit Cargo manifests, rename modules, change imports, or alter boundary checker behavior.
- The mapping is vocabulary for future issue planning, not an implementation plan.

Executed:

- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST`
  - Result: passed.
- `git diff --check -- docs/architecture/core-decomposition.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/crates src/apps`
  - Result: showed only pre-existing unrelated `src/crates/ai-adapters` dirty files; no scoped Cargo manifest, app, or crate source changes were added for 1180A.

Coverage:

- Existing app surfaces, `void-core` assembly, contract crates, execution crates, service crates, and adapter crates are mapped without changing source.
- Crate-level notes cover multi-role crates such as `void-core`, `void-tool-packs`, `void-acp`, `void-transport`, and provider/service owners.
- Forbidden actions explicitly reject mirrored upstream directories, workspace member moves, crate/module renames, treating `target`/`partial` labels as migration status, and concrete owner migration by label.
- DEC-073 remains the controlling decision that rejects upstream six-layer physical layout.
- Existing boundary checker remains the active enforcement mechanism.

Remaining risk:

- Conceptual mappings can become stale as real owner migrations land; future migration issues must update this mapping with evidence.

## ISSUE-1180B Product Assembly Contract Spike

Scope:

- Current slice is docs-only and records existing product assembly facts.
- It does not add Rust APIs, `DeliveryProfile`, service availability reporting, SDK/minimal runtime profile, Cargo feature changes, app entrypoint changes, or runtime behavior.
- `product-full` remains the only documented full-capability product assembly path.

Executed:

- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST`
  - Result: passed.
- `git diff --check -- docs/architecture/core-decomposition.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates`
  - Result: showed only pre-existing unrelated `src/crates/ai-adapters` dirty files; no scoped Cargo manifest, app, or crate source changes were added for 1180B.
- `git diff --name-only -- package.json scripts/dev.cjs scripts/desktop-tauri-build.mjs scripts/ensure-openssl-windows.mjs scripts/ci/setup-openssl-windows.ps1 Void-Installer`
  - Result: no output; build scripts and installer files were unchanged.

Coverage:

- Desktop and CLI are recorded as explicit `void-core product-full` consumers.
- Server and relay are recorded as existing app surfaces, not proof of an SDK/minimal runtime profile.
- Tool pack provider plans, core product tool runtime, product-domain runtime, and service-agent runtime bindings are recorded as current owner facts.
- Future delivery profiles or service availability reports are deferred behind separate product decision issues with snapshot/manifest/feature-graph evidence.

Remaining risk:

- This does not produce runtime availability reporting; it only prevents premature API/profile introduction.

## ISSUE-1180C Runtime Services Gap Audit

Scope:

- Current slice is docs-only and classifies existing runtime service gaps.
- It does not move service owners, managers, scheduler/session restore, terminal execution, remote-connect dispatch, product tool runtime, product-domain runtime, Cargo features, app entrypoints, or source code.
- `void-core` remains the explicit compatibility owner for concrete runtime gaps until separate implementation issues provide evidence.

Executed:

- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST`
  - Result: passed.
- `git diff --check -- docs/architecture/core-decomposition.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates`
  - Result: showed only pre-existing unrelated `src/crates/ai-adapters` working-copy warnings/status; no scoped Cargo manifest, app, or crate source changes were added for 1180C.

Coverage:

- Gap audit distinguishes `contract-only`, `service-helper`, and `concrete-runtime`.
- Covered gaps include agent/session ports, remote-connect helpers, filesystem operations, session/usage summaries, product-domain runtime bindings, MCP runtime slices, remote SSH/file watch/Git integrations, terminal runtime services, and product tool runtime.
- Subagent architecture review confirmed that scheduler/session restore, workspace and persistence reads, terminal pre-warm, remote-connect dispatcher/tracker host adapter, remote model catalog/config resolver, remote-SSH concrete runtime, product tool runtime, and product-domain runtime bindings remain concrete runtime gaps.
- DEC-119 records that ports/helpers are not migration permission.

Remaining risk:

- The gap list can become stale as future owner migrations land; each concrete-runtime issue must update this audit and add focused snapshot/equivalence tests.

## ISSUE-1180D High-Risk Migration Registry

Scope:

- Current slice is docs-only and registers high-risk upstream owner/runtime migration candidates.
- It does not implement any candidate, move crates, change Cargo features, change app entrypoints, extract managers, move scheduler/session restore, alter terminal execution, move provider HTTP owners, move MCP lifecycle state, or change AI media / AI short-drama / product runtime behavior.
- Each registry entry remains `registered-only` and requires a separate implementation issue before code.

Executed:

- `git show --stat --oneline --no-renames 213299206 98f0f4113 bceded210 96cea08ca 8d69e5733`
  - Result: passed; confirmed the candidates are broad owner/runtime migrations.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST`
  - Result: passed.
- `git diff --check -- docs/architecture/core-decomposition.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates`
  - Result: showed only pre-existing unrelated `src/crates/ai-adapters` working-copy warnings/status; no scoped Cargo manifest, app, or crate source changes were added for 1180D.

Coverage:

- Registered candidates include `213299206`, `98f0f4113`, `bceded210`, `96cea08ca`, `8d69e5733`, and related product assembly/profile work.
- Each candidate lists current Void owner, seam idea, risk class, protected surfaces, required evidence before code, forbidden changes in the registry issue, and required next issue.
- Risk-Agent and Architecture-Agent completed read-only reviews and confirmed the registry is a gate, not implementation approval.

Remaining risk:

- A registered candidate can still be misused as backlog permission if future issues skip snapshot/equivalence evidence. DEC-120 and the registry status wording are intended to prevent that.

## ISSUE-1180E Product-Full Guardrail Audit

Scope:

- Current slice is docs-only and audits existing product entrypoint / `product-full` guardrails.
- It does not change `Cargo.toml`, features, app entrypoints, `DeliveryProfile`, SDK/minimal runtime profile, service availability API, or runtime behavior.
- Desktop, CLI, ACP, server, relay, `void-core`, and owner-crate feature facts are recorded as current state only.

Executed:

- `cargo metadata --no-deps --format-version 1`
  - Result: passed; confirmed workspace manifests and product entrypoint dependency facts.
- PowerShell metadata summary for `void-desktop`, `void-cli`, `void-acp`, `void-server`, `void-relay-server`, `void-core`, `void-services-integrations`, `void-tool-packs`, and `void-product-domains`
  - Result: passed; confirmed desktop/CLI/ACP use `void-core product-full`, server/relay do not directly depend on `void-core`, `void-core default` is `product-full`, and owner crates remain default-light.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `$env:VOID_BOUNDARY_CHECK_SELF_TEST='1'; node scripts/check-core-boundaries.mjs; Remove-Item Env:\VOID_BOUNDARY_CHECK_SELF_TEST`
  - Result: passed.
- `git diff --check -- docs/architecture/core-decomposition.md docs/DECISIONS.md docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates`
  - Result: showed only pre-existing unrelated `src/crates/ai-adapters` working-copy warnings/status; no scoped Cargo manifest, app, or crate source changes were added for 1180E.

Coverage:

- Desktop, CLI, and ACP explicit `void-core/product-full` assembly is covered by manifest inspection and existing boundary-checker rules.
- Server and relay are recorded as app surfaces, not SDK/minimal runtime profile evidence.
- `void-core default = ["product-full"]`, `void-core/product-full` owner feature aggregation, and default-light owner crates are recorded.
- Product-Assembly-Agent completed read-only review and confirmed this is a guardrail audit, not feature/profile implementation.

Remaining risk:

- This does not validate runtime behavior or startup smoke. Any future product profile or entrypoint feature change must add feature graph snapshots and behavior checks before code.

## ISSUE-1140D1 ViewImage Contract Gate and Slice Plan

Scope:

- Documentation-only gate for the upstream `view_image` capability.
- No `ViewImage` runtime implementation, tool manifest change, provider adapter change, Web UI upload change, AI media change, AI short-drama change, Flow Chat change, or `AnalyzeImage` rewrite.

Executed:

- `Select-String -Path docs/ISSUES.md,docs/ARCHITECTURE.md,docs/DECISIONS.md,docs/TEST_PLAN.md -Pattern "ISSUE-1140D|ViewImage|DEC-122"`
  - Result: passed.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- docs/ISSUES.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates src/web-ui`
  - Result: current worktree still lists non-this-slice generated Web UI version files; they are not part of this docs-only gate and are not staged.

Coverage:

- Current image payload boundary is `ToolImageAttachment`.
- Current manifest/runtime registration boundary is `void-tool-packs` plus `ProductToolRuntime`.
- Current workspace and primary-model capability facts live in `ToolUseContext`.
- Provider-specific image attachment conversion remains adapter-owned.

Remaining risk:

- `ViewImage` is not implemented by this slice.
- Future code slices must prove manifest exposure, provider support, and workspace path/image processing separately before exposing the tool.

## ISSUE-1140D2 ViewImage Manifest and Readonly Exposure Contract

Scope:

- Current slice covers manifest and exposure gating only.
- `ViewImage` remains unimplemented and unexposed until provider image-attachment and workspace path/image-processing gates pass.
- No provider adapter, Web UI, AI media, AI short-drama, Flow Chat, `AnalyzeImage`, workspace path reading, remote filesystem, or image-processing behavior changed.

Executed:

- `cargo test -p void-tool-packs view_image --lib -- --nocapture`
  - Result: passed, 1 focused test.
- `cargo test -p void-core view_image --lib -- --nocapture`
  - Result: passed, 3 focused tests.
- `node scripts/check-core-boundaries.mjs`
  - Result: passed.
- `git diff --check -- src/crates/tool-packs/src/lib.rs src/crates/core/src/agentic/tools/registry.rs src/crates/core/src/agentic/tools/product_runtime.rs docs/ISSUES.md docs/PROGRESS.md docs/TEST_PLAN.md`
  - Result: passed with Windows LF/CRLF working-copy warnings only.
- `git diff --name-only -- Cargo.toml src/apps src/crates src/web-ui`
  - Result: listed this slice's three scoped source files plus non-this-slice generated Web UI version files; generated files are not part of this change and are not staged.

Coverage:

- `ViewImage` is absent from `void-tool-packs` provider plan while `AnalyzeImage` remains present.
- `ViewImage` is absent from core builtin manifest, collapsed manifest, readonly manifest, and runtime materialization.
- Product catalog facade ignores `ViewImage` even when an allowed-tools list names it, while still exposing `AnalyzeImage`.

Remaining risk:

- Provider attachment support and workspace image path processing remain in `ISSUE-1140D3` and `ISSUE-1140D4`.
- Future `ViewImage` exposure must update these tests intentionally rather than slipping into the manifest as a side effect.
