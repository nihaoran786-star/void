# Upstream Migration Issues

Date: 2026-07-02

Each issue must be independently implementable and independently testable. Only one implementation issue may be active at a time.

## Issue Template

```md
### ISSUE-NNN Title

Priority: P0 | P1 | P2 | P3 | Rejected
Status: Proposed | Active | Done | Blocked | Deferred | Split | Rejected
Goal:
Allowed files:
Forbidden files:
Affected module:
Preserved contracts:
Implementation rule:
Verification:
Docs to update:
Risk notes:
```

## P0 - Verify, Inventory, or No-Op

### ISSUE-000 Baseline and Protected Contract Audit

Priority: P0
Status: Done
Goal: Confirm current baseline, protected capabilities, and verification commands before code migration.
Allowed files: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, and consensus docs required to record audit findings.
Forbidden files: functional source files, installer source files, brand source files.
Affected module: migration governance.
Preserved contracts: baseline branch/tag remains the comparison point; no functional code migration occurs.
Verification: `git status --short --branch`; `git remote -v`; `git branch -r --list "origin/baseline/void-source-20260702"`; `git rev-parse --verify "origin/baseline/void-source-20260702"`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: untracked consensus docs are expected during planning but must be recorded.

### ISSUE-003 Upstream Capability Inventory and Classification

Priority: P0
Status: Done
Goal: Produce the complete upstream candidate inventory before functional migration.
Allowed files: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Forbidden files: functional source files.
Affected module: migration governance.
Preserved contracts: no upstream candidate remains unclassified; accepted candidates map to Void module boundaries.
Implementation rule: inventory only; no implementation.
Verification: upstream reference is recorded; no discovered candidate remains unclassified; BitFun branding, installer, crate layout, and whole-file replacement candidates are explicitly rejected or deferred.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: insufficient upstream history depth must be recorded rather than guessed.

Required inventory fields:

- upstream commit/path when available,
- capability description,
- classification: `P0`, `P1`, `P2`, `P3`, or `Rejected`,
- decision reason,
- affected Void module,
- protected contract,
- required verification.

#### ISSUE-003 Inventory - Upstream Reference and Coverage

Observed upstream references:

- Local upstream clone: `tmp/upstream-bitfun`
- Local upstream HEAD: `c2f6a3c91d9e3f3cc8df834a613acecd47134b32`
- Local upstream branch: `main`
- Local upstream package version: `0.2.11`
- GitHub release reference: `v0.2.11`, latest release observed by release inventory agent, published 2026-06-24.
- GitHub nightly reference: `0.2.11-nightly.20260702+029e9e7d`, commit `029e9e7`, published 2026-07-02 07:34.
- Local clone limitation: shallow clone. `git log` only exposes `c2f6a3c`; `git show HEAD` cannot be treated as a true delta because parents are missing.

Classification rule:

- `P0`: verification/protection gate before migration.
- `P1`: low-risk fix or governance improvement with clear Void rewrite path.
- `P2`: valuable but cross-module, platform, runtime, or state-model sensitive.
- `P3`: useful later, large, debug-only, or high operational risk.
- `Rejected`: conflicts with Void identity, local architecture, protected product contracts, or whole-file replacement policy.

#### ISSUE-003 Inventory - Frontend and Flow Chat

| Candidate | Upstream path/commit | Capability | Class | Void module | Protected contract | Verification |
|---|---|---|---|---|---|---|
| UF-001 | `c2f6a3c: RichTextInput.tsx` | IME-safe Escape/Enter handling | P1 | Chat input | IME owns composition; popup close must not cancel running tasks | RichTextInput tests; type-check |
| UF-002 | `c2f6a3c: RichTextInput.tsx` | `openMention()` spacing | P1 | Chat input | Existing mention/context tag semantics | RichTextInput tests |
| UF-003 | `c2f6a3c: RichTextInput.tsx` | `insertTagReplacingMention()` spacing | P1 | Chat input | Existing editor text and tag insertion | RichTextInput tests |
| UF-004 | `c2f6a3c: FileMentionPicker/slash popup code` | Mention/slash/skills popup viewport bounds | P1 | Chat input UI | No business logic in `ChatInput.tsx` | Component/style smoke; type-check |
| UF-005 | `c2f6a3c: chat image strip/paste/undo code` | Image context strip, paste, undo stability | P2 | Chat input/media context | Preserve `imageContextForBackend`, media references | Image paste tests; manual paste/undo |
| UF-006 | `c2f6a3c: popup Escape handling` | Popup active disables global Escape task cancel | P1 | Chat input/task controls | Running task cancellation remains explicit | Chat input Escape tests |
| UF-007 | `c2f6a3c: FlowChatStore/history restore` | `historyState` and `contextRestoreState` restore | P2 | Flow Chat session restore | Explicit history states; no `sessions: []` state shortcut | Session restore tests |
| UF-008 | `c2f6a3c: history diagnostics` | History restore placeholder and failure diagnostics | P2 | Flow Chat diagnostics | UI renders state only | Restore failure fixture |
| UF-009 | `c2f6a3c: VirtualMessageList` | Long-history initial windowing and scrollTop mapping | P2 | Flow Chat virtual list | Do not replace whole Flow Chat | Long-session layout tests |
| UF-010 | `c2f6a3c: scroll policy/autoscroll` | Follow-output, anchor lock, user-scroll exit | P2 | Flow Chat scroll | Preserve media/short-drama tiles | Scroll stability E2E |
| UF-011 | `c2f6a3c: model round rendering` | Progressive model-round rendering | P2 | Flow Chat rendering | Preserve model-round item ordering | Model round snapshot tests |
| UF-012 | `c2f6a3c: startupTrace.ts` | Startup API timing, payload estimate, concurrency observability | P1 | Startup trace | Use `VOID`/existing Void trace names only | startupTrace tests |
| UF-013 | `c2f6a3c: deferred startup systems` | Preload/deferred startup systems and perf contracts | P2 | Startup/session open | Do not alter startup order without decision | Startup perf smoke |
| UF-014 | `c2f6a3c: mobile-web` | Mobile web dev/build/preview UI improvements | P2 | Mobile web | Do not affect desktop Flow Chat state | Mobile type-check/smoke |
| UF-015 | `c2f6a3c: terminal frontend` | Lazy terminal output, resize repaint guard, paste queue | P2 | Terminal UI | Terminal domain stays in terminal service/core | Terminal targeted tests |
| UF-016 | `c2f6a3c: session nav metadata` | Startup defer, expand, selection tests for session nav | P1 | Sidebar/session nav | Explicit session metadata source | Session nav tests |
| UF-017 | `c2f6a3c: session restore API entrypoint` | Narrow API entrypoint for restore/startup hot paths | P1 | Session restore API | No business logic in page/header/sidebar | Restore tests |
| UF-018 | `c2f6a3c: i18n/theme/repo hygiene scripts` | i18n/theme/repo hygiene audits | P1 | Governance scripts | Void baselines and names only | Audit script tests |
| UF-019 | `c2f6a3c: Flow Chat replacement files` | Whole Flow Chat/store/virtual list replacement | Rejected | Flow Chat | Protect multi-agent, BTW, media, short-drama | N/A |
| UF-020 | `c2f6a3c: ContentCanvas/media/short-drama alternatives` | Replace local media/short-drama canvas with upstream | Rejected | Media/short-drama | Preserve local AI media and short drama modules | N/A |
| UF-021 | `c2f6a3c: package/installer/globals` | Root package, BitFun installer, startup globals | Rejected | Packaging/brand | Void identity only | Brand audit |

#### ISSUE-003 Inventory - Core, Runtime, Tools, Providers

| Candidate | Upstream path/commit | Capability | Class | Void module | Protected contract | Verification |
|---|---|---|---|---|---|---|
| C01 | `c2f6a3c: analyze_image_tool.rs` | Read-only `analyze_image` tool for local/remote workspace images | P2 | Core agent tools | `ToolUseContext` stays in core; readonly and path policy preserved | Tool schema/permission/remote path tests |
| C02 | `c2f6a3c: image_processing.rs` | MIME detection, provider limits, compression/downsampling, multimodal payloads | P2 | Core image analysis/adapters | Provider wire format stays in adapters | PNG/JPEG/WebP and provider payload tests |
| C03 | `c2f6a3c: processor.rs`, `enhancer.rs` | Pre-analyze uploaded images and inject structured analysis | P2 | Flow Chat to core image context | UI cannot infer image understanding results | JSON/fallback and E2E image-context smoke |
| C04 | `c2f6a3c: image_context.rs` | Temporary image context storage, expiry, lookup, cleanup | P2 | Core tool context | Do not move workspace services into portable contracts | Expiry and lookup tests |
| C05 | `c2f6a3c: tool_image_attachment.rs`, adapter converters | Tool result image attachments for OpenAI/Anthropic replay | P1 | Core types/AI adapters | Provider-neutral DTO in core; serialization in adapters | Adapter converter tests |
| C06 | `c2f6a3c: ai-adapters/src/client/sse.rs` | SSE retry with 429/408/409/425/5xx and `Retry-After`, cap 60s | P1 | AI adapters | Preserve auth failure and user cancel semantics | Retry-after mock tests |
| C07 | `c2f6a3c: tool_call_accumulator.rs` | Stream tool-call argument accumulation and truncated JSON safety | P1 | Agent stream/parser | Do not execute unsafe truncated tool calls | Tool accumulator fixtures |
| C08 | `c2f6a3c: responses.rs` | OpenAI Responses `function_call_arguments.delta`, tail fallback, incomplete handling | P1 | OpenAI adapter | Core consumes unified stream only | Responses fixture replay |
| C09 | `c2f6a3c: stream usage types` | Token usage split for cache read vs cache creation | P0 | AI adapters/core usage | Cache read and creation are distinct; adapter slices may implement as P1 sub-issues | Provider usage and token accounting tests |
| C10 | `c2f6a3c: prompt_cache.rs` | Prompt cache identity, TTL, restore prune/delete, scope invalidation | P0 | Core prompt cache | Explicit prompt-cache identity | Prompt cache contract tests |
| C11 | `c2f6a3c: thread_goal.rs`, `thread_goal_tools.rs` | Persistent `/goal`, budget, auto continuation, complete/blocked tools | P0 | Goal workflow | Goal state persisted; token accounting excludes cached reads; helper slices may be P1 | Goal contract tests |
| C12 | `c2f6a3c: multitask.rs` | Multitask mode, shared coding tools, parallel subagent tendency | P0 | Agent modes/subagents | Permission-gated parallel behavior; review readonly limits | Mode prompt/tool exposure tests |
| C13 | `c2f6a3c: assembly/execution/contracts layout` | Upstream crate decomposition | P3 | Architecture | Do not migrate upstream crate layout without a separate architecture decision | Core boundary audit |
| C14 | `c2f6a3c: BitFun naming/config` | BitFun installer/brand/provider defaults | Rejected | Brand/installer | Void identity only | Brand audit |

#### ISSUE-003 Inventory - Desktop, Computer Use, WebDriver, Terminal

| Candidate | Upstream path/commit | Capability | Class | Void module | Protected contract | Verification |
|---|---|---|---|---|---|---|
| DESK-STARTUP-TRACE | `c2f6a3c: src/apps/desktop/src/startup_trace.rs`, `lib.rs` | Native startup phase, Tauri command, tray/window timing snapshots | P1 | Desktop startup observability | Void names/events only; no startup order change | Desktop check; startup smoke |
| DESK-TRAY-TIMING | `c2f6a3c: tray.rs` | Tray menu/icon/refresh timing | P1 | Desktop tray | Tray integration only; preserve Void text/preferences | Desktop check; tray smoke |
| DESK-WINDOW-CLOSE | `c2f6a3c: lib.rs` | macOS close ack, timeout fallback, minimize-to-tray behavior | P2 | Window lifecycle | Void close event/labels; frontend owns close preference | macOS close/reopen smoke |
| DESK-REGISTRY-INSTALL-PATH | `c2f6a3c: lib.rs` | Windows NSIS install-location registry sync | P2 | Installer/desktop | Void registry path only; upstream BitFun registry names are rejected | Windows installer smoke; brand audit |
| CU-WIN-CAPTURE | `c2f6a3c: windows_capture.rs` | Windows `PrintWindow`, DWM crop, BitBlt fallback, occlusion flag | P2 | Computer Use capture adapter | Platform capture stays behind `ComputerUseHost` | Windows capture smoke |
| CU-WIN-BG-INPUT | `c2f6a3c: windows_bg_input.rs` | Background click/type/scroll/drag via PostMessage and fallback | P2 | Computer Use input adapter | Permission/tool policy not moved to Web UI | Windows input smoke |
| CU-WIN-MSAA | `c2f6a3c: windows_msaa.rs` | MSAA fallback for UIA gaps | P2 | Computer Use accessibility adapter | Map to existing interactive-view state | Windows app smoke |
| CU-TERMINAL-DETECT | `c2f6a3c: terminal_detect.rs` | Terminal/GVim detection routes `type_text` to key events | P2 | Computer Use input routing | Terminal domain not moved into desktop API | Pure function tests; terminal typing smoke |
| CU-MAC-SKYLIGHT | `c2f6a3c: macos_skylight.rs` | macOS private SkyLight background input and focus/menu shortcuts | P2 | Computer Use macOS adapter | Private API contained in desktop adapter; real macOS smoke remains the release gate | macOS gated smoke |
| CU-DEBUG-E2E | `c2f6a3c: debug_overlay.rs`, `integration_e2e.rs` | Computer Use debug overlay/e2e helpers | P3 | Devtools/test support | Debug-only feature gate; no release leakage | Devtools check |
| WEBDRIVER-EMBEDDED-FEATURE | `c2f6a3c: webdriver/src/lib.rs`, desktop Cargo | WebDriver starts under debug or `embedded` feature | P1 | WebDriver/desktop devtools | Void env names and feature gates only | WebDriver check/smoke |
| WEBDRIVER-BITFUN-ENV | `c2f6a3c: webdriver/src/lib.rs` | `BITFUN_WEBDRIVER_*` env names | Rejected | WebDriver identity | Must use `VOID_WEBDRIVER_*` | Brand grep |
| BRAND-DESKTOP-IDENTITY | `c2f6a3c: tauri.conf.json`, updater key, icons, tray | BitFun product, identifier, publisher, updater, registry, tray text | Rejected | Installer/brand | Preserve Void identity | ISSUE-006 brand audit |
| TERMINAL-CRATE-UPSTREAM | upstream lacks `src/crates/terminal`; current branch has it | No direct upstream terminal crate fix found | Rejected | Terminal crate | Terminal domain remains local; no upstream crate-layout migration applies | Local terminal tests when available |

#### ISSUE-003 Inventory - Build, Docs, CI, Release Governance

| Candidate | Upstream path/commit | Capability | Class | Void module | Protected contract | Verification |
|---|---|---|---|---|---|---|
| UBDI-001 | `c2f6a3c: package.json` | Root scripts for generate/build/desktop/installer/e2e/perf | P2 | Build orchestration | Void root layout and names; no BitFun package identity | Script dry run after Void rewrite |
| UBDI-002 | `c2f6a3c: package.json`, `.github/workflows/ci.yml` | i18n contract CI profile and audit integration gate | P1 | CI/i18n | `VOID_I18N_*` only | i18n contract test |
| UBDI-003 | `c2f6a3c: scripts/i18n-audit.mjs` and baselines | i18n dynamic key, fallback, locale, allowlist governance | P1 | i18n scripts | Void installer paths and reports only | i18n audit |
| UBDI-004 | `c2f6a3c: scripts/i18n-contract.test.mjs` | i18n generated-file and audit integration contract tests | P1 | i18n tests | Void generated paths only | Node test |
| UBDI-005 | `c2f6a3c: audit-theme-colors.mjs`, baselines | Web/mobile/installer theme color governance and CSS var contract | P2 | Theme/design tokens | Void surfaces and baselines only | Theme audit tests |
| UBDI-006 | `c2f6a3c: audit-cli-theme-colors.mjs` | CLI preset/fallback color audit | P1 | CLI theme | Void CLI names only | CLI theme audit |
| UBDI-007 | `c2f6a3c: validate-theme-visual-contract.mjs` | Visual governance contract for surfaces/form factors/evidence | P2 | Theme QA | Preserve media/short-drama contracts | Visual contract validation |
| UBDI-008 | `c2f6a3c: generate-startup-theme-bootstrap.mjs` | Startup theme bootstrap and prompt snapshot generation | P2 | Desktop startup/theme | Adapt to local crate layout | Generator tests |
| UBDI-009 | `c2f6a3c: check-core-boundaries.mjs`, rule dir | Rule-based core boundary checker | P2 | Architecture guardrails | Do not force upstream crate layout | Boundary checker tests |
| UBDI-010 | `c2f6a3c: check-repo-hygiene.mjs` | Repo hygiene scan for secrets, local paths, prompt temp files | P1 | Repo hygiene/CI | Avoid generated false positives | Hygiene script test |
| UBDI-011 | `c2f6a3c: cli-package-manual.yml` | Manual CLI package workflow | P1 | Release CI | Artifact/tap/repo names Void-only | Workflow review/YAML parse |
| UBDI-012 | `c2f6a3c: desktop-package.yml`, `nightly.yml` | Release/nightly matrix, updater manifest collection | P0 | Desktop packaging | No `BITFUN_*`, GCWing URLs, bitfun artifacts; artifact-only slices may be P1 | GitHub config check |
| UBDI-013 | `c2f6a3c: BitFun-Installer/*` | Installer app/package/Tauri config | Rejected | Installer | `Void-Installer`, Void registry, Void updater; only a separate Void rewrite could reopen this | Brand residue audit |
| UBDI-014 | `c2f6a3c: performance-trace helpers` | Startup/native/API/resource timing E2E helpers | P2 | E2E perf | `__VOID_*` trace contract only | Perf trace smoke |
| UBDI-015 | `c2f6a3c: run-startup-stability.mjs` | Release-fast startup stability runner | P2 | E2E perf | `VOID_E2E_*`; no `.bitfun` profile | Startup stability after rewrite |
| UBDI-016 | `c2f6a3c: long-session fixture/matrix scripts` | Long-session open/reopen/switch/scroll/resize matrix | P2 | Flow Chat perf | Preserve SessionHistoryState, BTW, media | Long-session perf after rewrite |
| UBDI-017 | `c2f6a3c: tests/e2e/specs/performance` | Startup/session input layout/editor performance specs | P2 | E2E perf | Void selectors and contracts | Targeted perf specs |
| UBDI-018 | `c2f6a3c: chat scroll/code preview specs` | Scroll whitespace and code preview regressions | P2 | Flow Chat rendering | Avoid implementation-coupled tests | Targeted E2E specs |
| UBDI-019 | local Void `brand-residue-audit.mjs` vs upstream BitFun residue | Brand audit protection | P0 verify | Brand governance | Reject BitFun names/envs/installer ids | Strict brand audit |
| UBDI-020 | `c2f6a3c: workflows/scripts/E2E` | `BITFUN_*` env and `__BITFUN_*` globals | Rejected | CI/E2E/startup trace | Must use `VOID_*`/`__VOID_*` or existing Void contract before any future rewrite | Brand grep |

#### ISSUE-003 Inventory - Release Notes and Product Capability Families

| Candidate | Source | Capability | Class | Void module | Protected contract | Verification |
|---|---|---|---|---|---|---|
| REL-001 | PR #1390 / `c2f6a3c` | Image understanding tool family | P2 | Agent tools/image analysis/adapters | Preserve Void media, APIMart, gallery, permissions | ISSUE-100A/B/C |
| REL-002 | `v0.2.11` release notes/files | Inline Skill references via `/` or `$` | P1 | Chat input/runtime skills | Do not break slash, mention, IME, media context; runtime expansion can be split later | RichTextInput and runtime parsing tests |
| REL-003 | `v0.2.11` release notes/files | Custom Agent/Mode management | P2 | Agent registry/settings | Do not overwrite Void multi-agent, Review Team, BTW, `/goal` | Custom agent contract tests |
| REL-004 | `v0.2.11` release notes/files | Background subagent activity panel/cancel | P2 | Flow Chat header/sidebar/runtime | Preserve parent-child subagent state | Background subagent tests |
| REL-005 | `v0.2.11` release notes/files | PPT Live generation enhancements | P3 | MiniApp/product domains | Do not affect short-drama/media canvas; lower priority unless current MiniApp scope reopens | MiniApp smoke/export tests |
| REL-006 | `v0.2.11` release notes/files | Terminal paste and resize stability | P2 | Terminal service/UI | Terminal logic remains in terminal service/core | Terminal tests/manual PowerShell smoke |
| REL-007 | `v0.2.11` release notes/files | flashgrep upgrade and remote search mapping | P2 | Workspace search/remote SSH | Core does not depend on flashgrep internals | Local/remote search tests |
| REL-008 | `v0.2.11` release notes/files | Open local HTML from file/tab menus | P1 | File explorer/command adapter | UI uses adapter; path escaping safe | htmlFilePreview tests/smoke |
| REL-009 | `v0.2.11` release notes/files | Computer-use `describe_screen` | P2 | Computer Use tools/platform adapters | Preserve `ComputerUseHost` contract | Schema tests and platform smoke |
| REL-010 | `v0.2.11` release notes/files | Startup and session responsiveness | P1 | Startup trace/session restore/tray | Preserve session restore model and tray lifecycle; risky UI slices stay separately gated | Startup/session perf tests |
| REL-011 | `v0.2.11` release notes/files | 429/TPM rate-limit retry fixes | P2 | AI adapters/stream runtime | Preserve provider fallback and error taxonomy | 429 HTTP/SSE mocks |
| REL-012 | `v0.2.11` release notes/files | Flow Chat retry/abnormal-end display fixes | P2 | Session/stream/Flow Chat | Preserve SessionHistoryState and BTW/subagent projection | Restore and abnormal-end fixtures |
| REL-013 | `v0.2.11` release notes/files | Flow Chat scroll/truncation/long diff stability | P2 | Virtual list/scroll/code preview | No whole Flow Chat replacement | Layout and long-session E2E |
| REL-014 | `v0.2.11` release notes/files | History session open/restore stability | P2 | Session history/sidebar/Flow Chat | Page components only compose/render | SessionOpenIntent tests |
| REL-015 | `v0.2.11` release notes/files | OpenAI response format and stream parsing fixes | P2 | AI adapters/agent stream | Provider-neutral stream events | Stream fixture tests |
| REL-016 | `v0.2.11` release notes/files | Remote workspace/ControlHub/SSH context prompts | P2 | Remote workspace/prompt builder | Remote/local source explicit | Prompt snapshots/remote tests |
| REL-017 | `v0.2.11` release notes/files | Relay server default listen docs/scripts consistency | P1 | Relay server/docs | Do not alter deployment semantics silently | Script dry run/docs check |
| REL-018 | `v0.2.11` release notes/files | Mobile session list loading stability | P1 | Mobile web | Do not affect desktop session state | Mobile type-check/smoke |
| REL-019 | `v0.2.11` release notes/files | Persona `IDENTITY.md` frontmatter preservation | P1 | Custom agent/persona/profile | Preserve user markdown frontmatter | Roundtrip tests |
| REL-020 | `v0.2.11` release notes/files | Prompt structure refresh after context compression | P2 | Compression/prompt cache/runtime | Preserve `/goal`, media, short-drama prompt contracts | Compression fixture tests |
| REL-021 | `v0.2.11` release notes/files | MiniApp development support | P1 | MiniApp/skills/docs | Do not replace current skills/plugin system | Skill catalog/demo smoke |
| REL-022 | README high-level capabilities | Agent workbench, office work, desktop execution, customization | P3 | Governance inventory | Product copy not migrated as feature; P0 only as protection inventory context | Use only as inventory index |

### ISSUE-001 ACP `omp` Preset Verification

Priority: P0
Status: Done
Goal: Verify locally migrated ACP `omp` behavior without copying upstream ACP structure.
Allowed files: tests only if missing coverage is found; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: upstream ACP directory structure; BitFun naming.
Affected module: ACP clients.
Preserved contracts: `omp` remains user-managed/native; no automatic upstream adapter installation is introduced.
Verification: targeted `void-acp` test if workspace cargo metadata is available; manual ACP verification if Rust workspace remains blocked.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing `void-acp` implementation and tests already preserve native `omp acp` behavior with no adapter or install package.

### ISSUE-002 CLI Slash Substring Matching Verification

Priority: P0
Status: Done
Goal: Verify locally migrated command matching behavior and add coverage only if missing.
Allowed files: `src/apps/cli/src/commands.rs` tests only if needed; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: unrelated CLI UI refactors.
Affected module: CLI command matching.
Preserved contracts: slash command matching remains case-insensitive; command matching stops at the command segment.
Verification: targeted `void-cli` command tests if workspace cargo metadata is available; manual CLI slash menu verification if Rust workspace remains blocked.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing `void-cli` command matching tests passed; no CLI source changes were required.

### ISSUE-004 Prompt Cache, Multitask, and Goal Workflow Verification

Priority: P0
Status: Done
Goal: Verify upstream prompt-cache, Multitask, and `/goal` workflow capabilities that are already present or partially present locally.
Allowed files: tests only if missing coverage is found; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`; `docs/DECISIONS.md` if runtime accounting scope changes.
Forbidden files: broad runtime rewrite; `/goal` UI rewrite.
Affected module: core runtime, goal workflow, Multitask.
Preserved contracts: prompt-cache identity and telemetry remain explicit; Multitask parallel behavior remains permission-gated; `/goal` status remains persisted and explicit.
Verification: local behavior evidence for prompt cache and Multitask; `/goal` persisted status and pause/resume/clear/edit behavior evidence; runtime token-budget accounting gap recorded as its own issue if still missing.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md` if scope changes.

Result: read-only verification completed. Prompt cache and Multitask capabilities are largely present; `/goal` has create, pause, resume, clear, edit, continuation, metadata persistence, and budget fields. Gaps are split below.

### ISSUE-004A Prompt Cache Verification and Coverage

Priority: P0
Status: Done
Goal: Verify prompt cache identity, TTL, restore prune/delete, clone, persistence, and scope invalidation after Rust workspace metadata is available.
Allowed files: prompt cache tests only if coverage is missing; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: prompt cache runtime rewrite; provider adapter rewrite.
Affected module: core prompt cache, session persistence, token usage.
Preserved contracts: `SystemPromptCacheIdentity`, `UserContextCacheIdentity`, `PromptCacheScope`, cache read/write token separation.
Verification: `cargo test -p void-core prompt_cache`; `cargo test -p void-core prompt_cache_telemetry`; `cargo test -p void-services-core token_usage_contracts`.
Result: restored current-layout root Cargo workspace metadata, aligned workspace dependency versions to current Void source compatibility, added precise `SystemPrompt` and `UserContext` invalidation tests, and verified targeted cache/token usage tests.
Risk notes: broad `cargo test -p void-core` still compiles the full product runtime and should remain targeted per issue to avoid unrelated migration scope.

### ISSUE-004B Multitask Scheduler and Subagent Gate Verification

Priority: P0
Status: Done
Goal: Verify Multitask mode, scheduler decisions, conflict/dependency rejection, permission gate, and recursive subagent blocking.
Allowed files: Multitask/runtime-ports tests only if coverage is missing; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: agent mode rewrite; scheduler rewrite; broad subagent runtime changes.
Affected module: core Multitask scheduler, runtime ports, Task tool.
Preserved contracts: `DelegationPolicy::top_level().spawn_child()` disables recursive spawn; forced execution remains permission-gated.
Verification: `cargo test -p void-runtime-ports delegation_policy_child_blocks_recursive_spawn_without_losing_depth`; `cargo test -p void-runtime-ports multitask_plan_serializes_scheduler_contract`; `cargo test -p void-core dry_run_accepts_independent_non_conflicting_branches`.
Risk notes: lacks full E2E evidence for prompt to scheduler decision to background subagent result merge.
Result: Existing targeted runtime/core tests passed for delegation depth, scheduler serialization, independent branch acceptance, dependency/write conflict rejection, permission-gated fallback, launcher failure recording, nested subagent rejection, and subagent fork wire compatibility. No runtime code changes were needed.

### ISSUE-004C Goal Workflow Status and Budget Semantics

Priority: P0
Status: Done
Goal: Define and implement only the missing `/goal` contract gaps: explicit complete/blocked persisted state if required, budget setting entrypoint, and billable token accounting.
Allowed files: goal workflow tests and minimal core/API/UI files after a separate implementation gate; `docs/DECISIONS.md`; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: broad runtime rewrite; unrelated `/goal` UI rewrite; subagent scheduler changes.
Affected module: core goal mode, runtime ports, desktop API, web goal services.
Preserved contracts: goal state is explicit and persisted; UI renders state only; token accounting must not treat cached reads as billable if budget semantics require billable usage.
Verification: goal core tests, web goal service tests, restore/continuation contract tests.
Risk notes: current code has `Blocked` and `Complete` status variants but no observed setter; current budget usage appears to accumulate total tokens, not billable tokens excluding cache reads.
Result: Implemented explicit complete/block/budget actions on current `GoalModeState`, persisted Complete/Blocked after verification success or continuation limit, counted billable goal tokens as uncached input plus output, and exposed minimal desktop/web service command plumbing without replacing the local `/goal` architecture.

### ISSUE-004D Review Readonly and Recursive Subagent Contract Tests

Priority: P0
Status: Done
Goal: Add or verify focused contract tests that Review/DeepReview cannot start non-readonly review subagents and child subagents cannot recursively spawn children.
Allowed files: review/subagent contract tests only; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: review agent rewrite; tool permission rewrite.
Affected module: review specialists, Task tool, runtime delegation policy.
Preserved contracts: review readonly tools only; ReviewFixer remains gated by user approval; recursive subagent delegation remains blocked.
Verification: targeted runtime-ports/core tests after Rust workspace metadata is available.
Result: Existing focused tests passed for readonly review specialists, DeepReview reviewer registration, DeepReview nested task rejection, ReviewFixer rejection in DeepReview policy, review/DeepReview/ReviewFixer tool boundaries, Task tool nested subagent rejection, and runtime delegation policy. No source changes were needed.

### ISSUE-005 Flow Chat, BTW, and Subagent Protected Contract Tests

Priority: P0
Status: Done
Goal: Add or verify tests that protect session restore, BTW parent-child state, transient child sends, subagent projection fields, and model-round item ordering.
Allowed files: Flow Chat, BTW, and subagent tests only; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: Flow Chat feature migration; whole-file replacement.
Affected module: Flow Chat/session/subagent.
Preserved contracts: `SessionHistoryState`; `SessionContextRestoreState`; `btwOrigin`; `parentSessionId`; `subagentType`; model round order.
Verification: targeted web tests or documented test gap.
Result: Existing targeted web tests passed for history placeholders, session metadata, subagent projection, BTW thread/opening contracts, dialog turn stability, model-round grouping, BTW panel child sends, DeepReview action bar state, store sync, FlowChatStore, SessionModule, PersistenceModule, and EventHandlerModule. No source changes were needed.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.

### ISSUE-006 Brand, Installer, and Desktop Identity Audit

Priority: P0
Status: Done
Goal: Verify Void brand, installer, updater, registry, window label, and URL parameter contracts before upstream migration touches desktop or packaging.
Allowed files: brand/installer audit tests or scripts only if needed; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: BitFun identity restoration; installer replacement.
Affected module: brand, installer, desktop identity.
Preserved contracts: `Void`; `Void-Installer`; `void-desktop.exe`; Void window labels and URL parameters.
Verification: brand audit script if available; manual audit for `BitFun`, `BITFUN_*`, installer ids, updater ids.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: No BitFun/GCWing identity residue was found in scoped source/config paths; desktop and installer configs preserve Void identity.

## P1 - Low-Risk Migration

### ISSUE-010A Chat Input Escape Handling

Priority: P1
Status: Done
Goal: Adapt upstream chat input Escape handling without breaking IME composition, slash popup, mention popup, or task cancellation behavior.
Allowed files: `RichTextInput.tsx`, `RichTextInput.test.tsx`, `FileMentionPicker.tsx`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Forbidden files: `FlowChatStore.ts`; session/history/sidebar/header files; Rust core; desktop; installer; brand files.
Affected module: Chat input UI.
Preserved contracts: IME Escape remains IME-owned; slash popup close does not cancel running tasks; mention popup close does not alter session state.
Implementation rule: tests first; no whole-file copy; no unrelated UI refactor.
Verification: targeted chat input tests; `pnpm --dir src/web-ui run type-check`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing local Escape/IME/popup-active behavior matches the upstream fix path; targeted tests and TypeScript passed with no source changes.

### ISSUE-010B Chat Input Mention Spacing

Priority: P1
Status: Done
Goal: Adapt upstream mention insertion spacing so `openMention()` and `insertTagReplacingMention()` add only necessary spaces.
Allowed files: `RichTextInput.tsx`, `RichTextInput.test.tsx`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Forbidden files: `ChatInput.tsx` unless only wiring is required; unrelated context/media services.
Affected module: Rich text input.
Preserved contracts: context tags; file mention insertion; current editor text.
Implementation rule: tests first; no whole-file copy.
Verification: targeted `RichTextInput` tests; `pnpm --dir src/web-ui run type-check`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added RichTextInput spacing contract tests; existing implementation already matched upstream behavior.

### ISSUE-010C Chat Input Popup Boundaries

Priority: P1
Status: Done
Goal: Prevent mention and slash popups from overflowing narrow viewports without adding business logic to `ChatInput.tsx`.
Allowed files: `FileMentionPicker.tsx`, `FileMentionPicker.scss`, `ChatInput.scss`, popup-boundary utility/tests if introduced, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Forbidden files: Flow Chat store/session files; workspace media/short-drama files.
Affected module: Chat input popup UI.
Preserved contracts: mention state remains owned by RichTextInput/FileMentionPicker; slash popup behavior remains unchanged except bounds.
Verification: pure popup-bound calculation tests if introduced; targeted component/style smoke; `pnpm --dir src/web-ui run type-check`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added CSS viewport bounds for mention and slash popups; TypeScript, RichTextInput tests, and direct Sass compilation passed.

### ISSUE-011 Chat Input Image Paste Undo Slice

Priority: P1
Status: Done
Goal: Adapt upstream image paste/undo stability while preserving local `imageContextForBackend` and media reference handling.
Allowed files: chat input image tests and minimal UI files; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: media backend service rewrite; image context backend flow rewrite.
Verification: targeted image paste tests; manual paste/undo smoke in dev server if practical.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added tested image undo stack helper and wired ChatInput undo to latest contexts; imageUtils and backend image context tests passed.

### ISSUE-020A Startup Trace API Timing Observability

Priority: P1
Status: Done
Goal: Add upstream-inspired API timing observability using Void naming and existing startup trace contracts.
Allowed files: `src/web-ui/src/shared/utils/startupTrace.ts`, `src/web-ui/src/shared/utils/startupTrace.test.ts`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md`.
Forbidden files: `__BITFUN_*` globals; replacing current startup trace implementation wholesale; startup order rewrites; media, short-drama, Flow Chat, desktop, installer, ACP, or CLI source changes.
Verification: `src/web-ui/src/shared/utils/startupTrace.test.ts`; `pnpm --dir src/web-ui run type-check`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added API boundary timing fields to the existing Void startup trace snapshot, including request/response payload estimate durations, adapter/transport/invoke durations, active request counts, and max concurrency. Kept `__VOID_STARTUP_TRACE__` and existing logging behavior; did not copy upstream `__BITFUN_*` globals or render profile scope.

### ISSUE-020B Startup Trace Concurrency Observability

Priority: P1
Status: Done
Goal: Add bounded concurrency diagnostics without exposing sensitive data.
Verification: `src/web-ui/src/shared/utils/startupTrace.test.ts`; `pnpm --dir src/web-ui run type-check`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Covered together with `ISSUE-020A` through bounded per-call `activeRequestsAtStart`, `activeRequestsAtEnd`, and `maxConcurrentRequests` fields in startup trace records.

### ISSUE-020C Startup Trace Render Observability

Priority: P1
Status: Done
Goal: Add render/startup phase diagnostics without changing startup order.
Allowed files: `src/web-ui/src/shared/utils/startupTrace.ts`, `src/web-ui/src/shared/utils/startupTrace.test.ts`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ISSUES.md`, `docs/DECISIONS.md`.
Forbidden files: Flow Chat render components, Markdown render components, startup order files, `__BITFUN_*` globals, media, short-drama, desktop, installer.
Verification: `src/web-ui/src/shared/utils/startupTrace.test.ts`; startup smoke if available.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added default-off Void render profile primitives `isStartupRenderTraceEnabled()` and `recordReactRenderProfile()` using `__VOID_RENDER_PROFILE_ENABLED__`. The helper records sanitized `react_render_profile` phase metrics only when explicitly enabled.

### ISSUE-020D Startup Trace Render Component Instrumentation

Priority: P2
Status: Split
Goal: Evaluate whether to wire the render profile primitive into Markdown, code highlighting, and model-round rendering without disturbing Flow Chat performance or media/short-drama rendering contracts.
Allowed files: component-specific tests and the minimal render components selected after a separate gate.
Forbidden files: whole Flow Chat replacement; default-on profiling; raw payload capture; `__BITFUN_*` globals.
Verification: targeted component tests, startupTrace tests, TypeScript, and browser startup/render smoke if implemented.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md`.
Reason: Local Markdown and model-round render paths diverge from upstream and include KaTeX, right-panel preview links, media tool grouping, subagent projection, and media/short-drama-adjacent rendering. Component instrumentation should wait for a browser startup/render smoke gate.
Split note: 020D is split after Startup-Trace-Agent review. `ISSUE-020D1` is limited to default-off `CodePreview` render profile instrumentation. `ISSUE-020D2` is limited to default-off `FlowTextBlock` render profile instrumentation. Markdown renderer internals, syntax-highlighter internals, and ModelRound instrumentation remain deferred until browser startup/render smoke is available.

### ISSUE-020D1 CodePreview Render Profile Instrumentation

Priority: P2
Status: Done
Goal: Wire the existing default-off startup render profile primitive into `CodePreview` only.
Allowed files: `src/web-ui/src/flow_chat/components/CodePreview.tsx`, `src/web-ui/src/flow_chat/components/CodePreview.test.tsx`, docs.
Forbidden files: Markdown renderer files, `ModelRoundItem.tsx`, `FlowTextBlock.tsx`, Flow Chat stores, backend/Tauri files, terminal/media/short-drama/subagent modules, `__BITFUN_*` globals.
Affected module: Flow Chat code preview presentation diagnostics.
Preserved contracts: profiling remains default-off behind `__VOID_RENDER_PROFILE_ENABLED__`; CodePreview final content remains complete; streaming viewport-tail and 6,000-character budget remain unchanged; no code content, file path, workspace path, model output, or raw payload is recorded.
Acceptance:
- RED/GREEN component test proves default-off profiling records nothing.
- RED/GREEN component test proves enabled profiling records sanitized CodePreview render metrics only.
- Existing CodePreview streaming-tail tests continue to pass.
- `startupTrace` helper tests and web type-check pass.
Result: Added default-off React Profiler wiring around `CodePreview` only when `__VOID_RENDER_PROFILE_ENABLED__` is true. Enabled profiling records sanitized metadata through `recordReactRenderProfile(startupTrace, ...)`: component id, render phase, rounded duration fields, content/display lengths, streaming flag, and `hasCodeBlock`. It does not record code content, file paths, workspace paths, model output, or raw payloads. Existing streaming viewport-tail behavior and completed content behavior remain unchanged. Markdown, syntax-highlighter internals, FlowTextBlock, ModelRoundItem, Flow Chat stores, terminal, media, short-drama, subagent, backend, and desktop modules were not changed.

### ISSUE-020D2 FlowTextBlock Render Profile Instrumentation

Priority: P2
Status: Done
Goal: Wire the existing default-off startup render profile primitive into `FlowTextBlock` only.
Allowed files: `src/web-ui/src/flow_chat/components/FlowTextBlock.tsx`, `src/web-ui/src/flow_chat/components/FlowTextBlock.autoPreview.test.tsx`, docs.
Forbidden files: Markdown renderer internals, syntax-highlighter internals, `ModelRoundItem.tsx`, Flow Chat stores/session/history/sidebar/header, terminal, media, short-drama, subagent, backend/Tauri, desktop, provider files, `__BITFUN_*` globals.
Affected module: Flow Chat text-block presentation diagnostics.
Preserved contracts: profiling remains default-off behind `__VOID_RENDER_PROFILE_ENABLED__`; `React.memo`, `useTypewriter`, raw `isStreaming` forwarding to `MarkdownRenderer`, streaming cursor class, auto-preview behavior, and runtime-status rendering remain unchanged; no raw content, URLs, workspace paths, file paths, model output, or raw payloads are recorded.
Acceptance:
- RED/GREEN component test proves enabled profiling records sanitized FlowTextBlock render metrics only.
- RED/GREEN component test proves default-off behavior records nothing.
- Existing auto-preview component tests continue to pass.
- `CodePreview`, `startupTrace`, web type-check, and web build validation pass.
- Browser startup/render smoke is recorded as unavailable if no Playwright, Puppeteer, or browser command exists in the local environment.
Result: Added default-off React Profiler wiring around `FlowTextBlock` only when `__VOID_RENDER_PROFILE_ENABLED__` is true. Enabled profiling records sanitized metadata through `recordReactRenderProfile(startupTrace, ...)`: component id, render phase, duration fields, item id, content/display lengths, streaming flag, `hasCodeBlock`, and `hasTable`. The default-off path returns the existing content before code/table scans, so normal rendering avoids extra profiling work. Markdown renderer internals, syntax-highlighter internals, ModelRoundItem, Flow Chat stores/session/history/sidebar/header, terminal, media, short-drama, subagent, backend, desktop, and provider modules were not changed.

### ISSUE-030A Workspace Media State Model Tests

Priority: P1
Status: Done
Goal: Add tests for workspace media availability/library states, path mismatch, and pending-to-ready stable slots.
Allowed files: workspace media tests; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: production media service changes unless a separate bug issue is created.
Verification: targeted workspace media tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing workspace media coverage already protected availability/library states, empty/error/path mismatch UI states, pending refresh events, and pending-to-ready slot replacement. Updated stale Gallery test selectors to match the current stable pending-slot id model; no production media code changed.

### ISSUE-030B Workspace Media Safety and Failure Tests

Priority: P1
Status: Done
Goal: Add tests for unsafe trash path rejection, save failure fallback, trash restore, and purge safety.
Allowed files: workspace media tests; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: production media service changes unless a separate bug issue is created.
Verification: targeted workspace media tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added tests for trash metadata write failure and unsafe restore/purge ids. Fixed a real safety gap by rejecting unsafe trash id path segments before restore or purge touches the filesystem adapter.

### ISSUE-040A Short Drama Project Fact Protection Tests

Priority: P1
Status: Done
Goal: Add tests for existing project protection, manifest/script source facts, and workspace mismatch.
Allowed files: short-drama service tests; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: short-drama production service changes unless a separate bug issue is created.
Verification: targeted short-drama tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing short-drama tests already protect existing project initialization/migration, manifest/source sidecar precedence, workspace mismatch, workspace mode, project view model, change event, and target resolution contracts. No source changes were required.

### ISSUE-040B Short Drama Agent Policy and Media Recovery Tests

Priority: P1
Status: Done
Goal: Add tests for stage-agent permission boundaries, artifact attempts/revisions/change requests, and artifact media recovery.
Allowed files: short-drama service tests; `docs/PROGRESS.md`; `docs/TEST_PLAN.md`.
Forbidden files: short-drama production service changes unless a separate bug issue is created.
Verification: targeted short-drama tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing short-drama tests already protect tool policy, stage mismatch boundaries, artifact revisions/attempts, optimization workflow, change requests, MainAI tools, stage workspace, and media recovery-related workflow contracts. No source changes were required.

### ISSUE-050 Provider Adapter Parsing and Retry Inventory

Priority: P1
Status: Done
Goal: Inventory upstream provider parsing and retry fixes and split accepted items by provider or adapter boundary.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Upstream `ai-adapters` differs substantially from current Void layout and adds a new fixture/harness test suite. Accepted follow-up slices are split below; no provider source was changed during inventory.

### ISSUE-050A AI Adapter Fixture Harness Baseline

Priority: P1
Status: Done
Goal: Add a Void-compatible adapter stream fixture harness before migrating parser behavior.
Allowed files: `src/crates/ai-adapters/tests/**`, fixture files, minimal test-only helpers.
Forbidden files: provider runtime changes unless a failing fixture proves a focused gap.
Verification: targeted `cargo test -p void-ai-adapters` fixture harness tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added a test-only Void SSE fixture harness under `src/crates/ai-adapters/tests` with OpenAI replay coverage for split tool arguments with usage and inline `<think>` text. No provider runtime source was changed.

### ISSUE-050B SSE Retry and Retry-After Semantics

Priority: P1
Status: Done
Goal: Adapt upstream SSE retry semantics for 408/409/425/429/5xx and capped `Retry-After` without changing auth failure or user-cancel semantics.
Allowed files: `src/crates/ai-adapters/src/client/sse.rs`, focused tests.
Forbidden files: provider message converters; core agent runtime; UI.
Verification: targeted SSE retry unit tests and any fixture server tests added in 050A.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md` if retry policy changes.
Result: Current Void already had retryable 408/409/425/429/5xx behavior and non-retryable auth/client errors. Migrated upstream's 60s `Retry-After` cap and richer transport error source diagnostics. TTFT first-effective-output semantics require stream-handler contract changes and are split into `ISSUE-050F`.

### ISSUE-050C OpenAI and Responses Tool Argument Stream Parsing

Priority: P1
Status: Done
Goal: Adapt upstream OpenAI Chat/Responses stream parsing fixes for split arguments, orphan id-only chunks, malformed arguments, function call argument deltas, and usage preservation.
Allowed files: OpenAI/Responses stream handlers, tool-call accumulator, focused fixtures/tests.
Forbidden files: Anthropic/Gemini handlers unless split separately; core tool execution.
Verification: OpenAI/Responses fixture replay tests; malformed argument tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing Void parser and accumulator behavior already covers the selected OpenAI/Responses upstream cases. Added fixture replay coverage for missing OpenAI tool `type`, id-only prelude reattachment, split arguments with usage, inline think text, and malformed Responses function-call arguments. No parser runtime source changed.

### ISSUE-050D Anthropic and Gemini Stream Parsing Regressions

Priority: P1
Status: Done
Goal: Adapt upstream Anthropic/Gemini stream parsing fixes for extended thinking, interleaved parallel tool use, malformed deltas, and Gemini string function args.
Allowed files: Anthropic/Gemini stream handlers and focused fixtures/tests.
Forbidden files: OpenAI/Responses handlers unless split separately; core tool execution.
Verification: Anthropic/Gemini fixture replay tests; malformed argument tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Existing Void Anthropic/Gemini parser behavior already covers the selected upstream cases. Added fixture replay coverage for Anthropic extended thinking signatures, interleaved parallel tool use, malformed tool arguments, and Gemini string function args. No provider runtime source changed.

### ISSUE-050E Model Selector and CLI Credential Inventory

Priority: P2
Status: Done
Goal: Evaluate upstream model selector and CLI credential helpers separately from stream parsing.
Allowed files: docs during inventory; adapter config files after separate gate.
Forbidden files: auth storage rewrites; provider default changes without decision.
Verification: model selector tests if accepted.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Current Void already contains CLI UI model selector and desktop/core CLI credential discovery/refresh paths. Upstream `ai-adapters` adds a small standalone `model_selector.rs` helper that current Void lacks; accepted as `ISSUE-050E1`. No code changed in inventory.

### ISSUE-050E1 AI Adapter Model Selector Helper

Priority: P2
Status: Done
Goal: Add a standalone Void `ai-adapters` model selector helper matching upstream behavior for `primary`, `fast`, explicit ids, named references, and cache fallback semantics.
Allowed files: `src/crates/ai-adapters/src/model_selector.rs`, `src/crates/ai-adapters/src/lib.rs`, focused tests.
Forbidden files: CLI UI model selector rewrites; auth storage changes; provider defaults; installer identity.
Verification: port/adapt upstream `model_selector.rs` tests with `void_ai_adapters` crate names.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added the standalone helper and exported it from `void_ai_adapters`. Ported upstream tests with Void crate names. No CLI UI, auth storage, provider default, or installer files changed.

### ISSUE-050F Stream TTFT First Effective Output Semantics

Priority: P1
Status: Done
Goal: Adapt upstream TTFT semantics so the timeout waits for the first effective stream output, not only HTTP response headers.
Allowed files: `src/crates/ai-adapters/src/client/sse.rs`, provider stream-handler signatures/call sites, focused fixture/harness tests.
Forbidden files: provider parser behavior changes unrelated to timeout flow; core agent runtime; UI.
Verification: delayed-body fixture test proving headers alone do not satisfy TTFT; existing provider fixture replay tests.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md` if stream handler contract changes.
Result: Added a stream timeout controller that keeps TTFT active until text, reasoning, or meaningful tool-call output is observed, then switches to idle timeout. Provider stream handler signatures and call sites now receive remaining TTFT. Added delayed-body OpenAI fixture coverage. Parser semantics were not changed.

### ISSUE-060 i18n, Theme, Repo Hygiene, and Brand-Safe Audit Inventory

Priority: P1
Status: Done
Goal: Inventory upstream i18n/theme/repo hygiene improvements and adapt only brand-safe checks.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Completed read-only inventory with i18n, theme, and repo hygiene explorer subagents. Current Void already has i18n contract/audit scripts, mobile-web, installer locales, repo hygiene scripts, and Void-branded CLI/theme presets. Upstream adds root Node workspace orchestration, stronger i18n governance baselines, theme color/visual audits, startup theme bootstrap generation, CLI package workflow, and E2E performance runners. Accepted work is split below and must be Void-rewritten; direct BitFun package names, `BITFUN_*` env vars, `__BITFUN_*` globals, `BitFun-Installer` paths, `bitfun-*` theme ids, upstream installer identity, and upstream release/tap targets remain rejected.

### ISSUE-060A Root Node Workspace and Void Script Entry Points

Priority: P1
Status: Done
Goal: Restore a Void-branded root Node workspace entry so existing CI/root commands can execute without copying upstream BitFun identity.
Allowed files: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, docs.
Forbidden files: functional app/runtime code, installer config identity, upstream `BitFun` package name/version, `BITFUN_*` env vars.
Affected module: build orchestration.
Preserved contracts: package identity remains Void; workspace paths use `Void-Installer`; root scripts delegate to existing module scripts.
Implementation rule: create the minimal root workspace manifest and scripts needed by current CI and already-existing scripts; do not migrate theme/i18n behavior in this issue.
Verification: `pnpm run i18n:contract:test`; `pnpm run i18n:audit`; `pnpm run check:repo-hygiene`; `pnpm run check:github-config`; `pnpm --dir src/mobile-web run type-check` if dependencies are available.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md` if root workspace policy changes.
Risk notes: pnpm may still require build-script approval in this local workspace; record that as environment failure if it blocks before scripts run.
Result: Added Void root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, and `pnpm-lock.yaml`. Root scripts delegate to existing Void paths including `Void-Installer`, `src/web-ui`, `src/mobile-web`, and `tests/e2e`; E2E root env names use `VOID_E2E_*`. Added project-level pnpm build approvals for known native/binary dependencies so frozen install works non-interactively. `pnpm install --frozen-lockfile`, `pnpm run check:github-config`, `pnpm run i18n:contract:test`, `pnpm run check:repo-hygiene`, and `pnpm --dir src/mobile-web run type-check` passed. `pnpm run i18n:audit` reached the script and failed on existing short-drama CJK source candidates; that is tracked by `ISSUE-060C`.

### ISSUE-060B Repo Hygiene Enhancements

Priority: P1
Status: Done
Goal: Port upstream repo hygiene scanner improvements into the current Void script.
Allowed files: `scripts/check-repo-hygiene.mjs`, focused script tests if added, docs.
Forbidden files: root package/CI changes unless separately selected; brand/installer identity files.
Affected module: repo hygiene governance.
Preserved contracts: Void brand audit remains separate; generated assets and local runtime folders are not false positives.
Implementation rule: port only scanner robustness such as scoped path detection, comment skipping, Rust inline-test handling, and ignore rules.
Verification: `node scripts/check-repo-hygiene.mjs`; targeted script test if introduced.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Ported upstream scanner robustness into the current Void script: narrower workspace/user-specific absolute path matching, relay static asset ignore, comment-only line skip, and Rust inline test block skip. `node --check`, direct script run, root `pnpm run check:repo-hygiene`, and `pnpm run i18n:audit` passed.

### ISSUE-060C i18n Governance Report and Baseline Layers

Priority: P1
Status: Done
Goal: Add upstream-inspired i18n governance report, `--report-json`, CI profile, and baseline/allowlist layers using Void data, including a reviewed treatment for current short-drama CJK source candidates.
Allowed files: `scripts/i18n-audit.mjs`, `scripts/i18n-contract.test.mjs`, `scripts/i18n-*.json`, docs.
Forbidden files: locale copy replacement, `BitFun-Installer`, `src/crates/assembly`, `BITFUN_*`, `bitfun-i18n-state`, deleting Void-only namespaces.
Affected module: i18n governance.
Preserved contracts: Void locale contract, `Void-Installer`, `src/crates/core`, `void-i18n-state`, and existing Web UI namespaces remain intact.
Implementation rule: migrate mechanisms only; baseline content must be generated/reviewed from current Void scan results, not copied from BitFun.
Verification: `node scripts/i18n-audit.mjs --report-json <tmp-report>`; `node scripts/i18n-audit.mjs`; `$env:VOID_I18N_CONTRACT_TEST_PROFILE='ci'; node --test scripts/i18n-contract.test.mjs`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added `--report-json` governance output with error/warning counts and hardcoded CJK budget status. Registered the existing 25 short-drama CJK source candidate lines as a reviewed no-growth `web-ui-source` baseline, so audit passes with a warning and still fails on any growth. Updated contract tests to assert the report option and current baseline. No locale resources or short-drama business code changed.

### ISSUE-060D Relay Homepage Shared i18n Terms

Priority: P2
Status: Done
Goal: Adapt upstream relay homepage `$shared` i18n mechanism and generated shared terms file to Void.
Allowed files: `scripts/generate-i18n-contract.mjs`, `src/apps/relay-server/static/homepage/**`, docs.
Forbidden files: BitFun homepage copy, BitFun product names, unrelated relay server runtime changes.
Affected module: relay homepage i18n.
Preserved contracts: shared terms resolve to Void product terms; generated files are checked by `--check`.
Implementation rule: add generation/check support first, then minimal homepage loader support.
Verification: `node scripts/generate-i18n-contract.mjs --check`; `node scripts/i18n-audit.mjs`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added generated `src/apps/relay-server/static/homepage/i18n.shared.json`, changed relay homepage `flowMobileSub` to `{ "$shared": "features.remoteControl" }`, taught the static loader to resolve `$shared`, and updated i18n audit/contract tests to keep the generated shared file and referenced Void shared term checked.

### ISSUE-060E Theme Color Audit Foundation

Priority: P2
Status: Done
Goal: Add Void-branded theme color audit and CSS variable contract scripts in observation/baseline mode.
Allowed files: `scripts/audit-theme-colors*.mjs`, `scripts/theme-*.json`, docs.
Forbidden files: replacing theme tokens, copying `bitfun-*` theme ids, changing visual identity, broad SCSS rewrites.
Affected module: Web/mobile/installer theme governance.
Preserved contracts: current `void-*` theme ids and Void visual identity remain source of truth.
Implementation rule: start with scanner/tests/baseline; do not rename token families or enforce upstream visual vocabulary in the same issue.
Verification: `node --test scripts/audit-theme-colors.test.mjs`; `node scripts/audit-theme-colors.mjs --root src/web-ui/src --baseline scripts/theme-color-governance-baseline.json`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added a Void theme color audit foundation with tests and no-growth baselines for Web UI, mobile-web, and installer roots. The scanner reports color literals, CSS var definitions/usages/fallbacks, fallback-only and undefined vars, and near-color pairs. No theme tokens, presets, SCSS, UI runtime, installer config, root package, or CI files changed.

### ISSUE-060F CLI Theme Color Audit

Priority: P1
Status: Done
Goal: Add upstream-inspired CLI theme preset/fallback color audit for Void CLI themes.
Allowed files: `scripts/audit-cli-theme-colors.mjs`, `scripts/audit-cli-theme-colors.test.mjs`, `scripts/theme-color-governance-baseline.cli.json`, docs.
Forbidden files: changing CLI theme preset names from `void-*`, CLI UI rewrites.
Affected module: CLI theme governance.
Preserved contracts: CLI presets remain Void-named and current UI behavior is unchanged.
Implementation rule: scanner and tests only unless a proven unsafe color value requires a separate fix.
Verification: `node --test scripts/audit-cli-theme-colors.test.mjs`; `node scripts/audit-cli-theme-colors.mjs`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added a Void CLI theme color audit script, behavior tests, and a no-growth baseline generated from current `void-*` presets and `theme.rs` fallback colors. The scanner reports preset color counts, Rust fallback color counts, near-color pairs, and budget drift. No CLI runtime files, preset names, or theme values changed.

### ISSUE-060G Startup Theme Bootstrap Manifest

Priority: P2
Status: Done
Goal: Generate Void startup theme bootstrap and theme prompt snapshot manifests from Web UI built-in themes.
Allowed files: `scripts/generate-startup-theme-bootstrap.mjs`, `src/web-ui/src/infrastructure/theme/presets/startupThemeBootstrap.ts`, `src/web-ui/src/infrastructure/theme/presets/themePromptSnapshots.ts`, focused tests, generated manifest files after separate review, docs.
Forbidden files: desktop `theme.rs` behavior rewrite in this issue, `__BITFUN_*` globals, `--bitfun-*` CSS vars, `src/crates/assembly` paths.
Affected module: theme bootstrap governance.
Preserved contracts: source of truth remains current `void-*` `builtinThemes`; generated paths use current Void crate layout.
Implementation rule: add manifest projection and generator check mode first; consuming the manifest from desktop Rust is separate.
Verification: `pnpm --dir src/web-ui run test:run src/infrastructure/theme/presets/startupThemeBootstrap.test.ts`; `node scripts/generate-startup-theme-bootstrap.mjs --check`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md` if generated artifacts become a contract.
Result: Added pure Web UI theme projection helpers, generated Void startup bootstrap and prompt snapshot JSON manifests under `src/web-ui/src/infrastructure/theme/presets/generated/`, and added a generator with `--check` mode. Verification passed with focused Vitest, Web UI type-check, generator check, repo hygiene, brand scan, and diff check. Desktop startup consumption remains separate.

### ISSUE-060H Theme Visual Governance Contract

Priority: P2
Status: Done
Goal: Add a Void visual governance contract for app shell, Flow Chat, terminal, markdown/mermaid, generated widgets, mobile web, and installer surfaces.
Allowed files: `scripts/validate-theme-visual-contract.mjs`, `scripts/theme-visual-governance-contract.json`, docs.
Forbidden files: visual redesign, product copy changes, BitFun token families.
Affected module: theme QA governance.
Preserved contracts: media, short-drama, Flow Chat, and terminal UI remain governed by their existing module boundaries.
Implementation rule: contract validation only; visual changes require separate UI issues.
Verification: `node scripts/validate-theme-visual-contract.mjs`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Added a Void-specific visual governance contract and validator covering app shell, Flow Chat, terminal, markdown/mermaid, generated widgets, AI media/short-drama, mobile web, and installer surfaces. Validation checks required surface coverage, existing ownership paths, allowed platform/form-factor/theme/evidence values, protected contracts, and upstream identity leakage. No UI, theme token, runtime, installer, CI, or product-copy changes were made.

### ISSUE-060I Manual CLI Package Workflow Inventory

Priority: P2
Status: Split
Goal: Evaluate and Void-rewrite upstream manual CLI packaging workflow.
Allowed files: `.github/workflows/cli-package-manual.yml`, docs after separate gate.
Forbidden files: upstream release URLs, GCWing/BitFun release targets, Homebrew tap dispatch without owner confirmation, `bitfun-cli` artifact names.
Affected module: release workflow.
Preserved contracts: artifacts and package names are Void-only; external release targets must be confirmed.
Implementation rule: keep as inventory/proposal until release targets are confirmed.
Verification: YAML parse/static review; `cargo build --release -p void-cli`; `target/release/void-cli --version`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md` if accepted.
Result: Inventory completed and workflow creation deferred. Upstream manual packaging adds useful non-release artifact capabilities: platform selection, Linux runner baseline selection, arbitrary ref checkout, dynamic matrix generation, read-only repository permission, and version/short-SHA artifact naming. It is not copied in this issue because the upstream workflow is tied to upstream CLI names and this repository's release targets, Homebrew tap ownership, and manual artifact policy need explicit confirmation before a new runnable workflow is added.
Split note: 060I remains deferred for release upload and Homebrew tap behavior, but `ISSUE-060I1` accepts an artifact-only manual workflow that does not depend on external release targets.

### ISSUE-060I1 Manual CLI Artifact-Only Workflow Draft

Priority: P2
Status: Done
Goal: Add a manual CLI packaging workflow that only builds and uploads GitHub Actions artifacts for Void CLI.
Allowed files: `.github/workflows/cli-package-manual.yml`, docs.
Forbidden files: CLI source code, Cargo manifests, desktop/nightly/release workflows, installer files, GitHub Release upload logic, Homebrew tap dispatch, upstream release URLs, GCWing/BitFun names, `bitfun-cli` artifact names.
Affected module: release workflow.
Preserved contracts: artifacts and package names are Void-only; workflow permissions stay `contents: read`; release upload and Homebrew dispatch remain outside this issue.
Acceptance:
- Workflow is `workflow_dispatch` only and supports ref, platform, Linux runner baseline, and retention-day inputs.
- Build matrix is generated from the selected platform and uses `void-cli` / `-p void-cli`.
- Each selected platform builds, smoke-tests `--version`/`--help`, creates a tarball and sha256 file, and uploads only an Actions artifact.
- Static checks prove no BitFun identity, release upload, Homebrew dispatch, or write permission is present.
- YAML config parse, local CLI build, version smoke, help smoke, and diff checks pass.
Result: Added `.github/workflows/cli-package-manual.yml` as an artifact-only manual workflow with read-only repository permissions, arbitrary ref checkout, platform selection, Linux x64 baseline selection, dynamic matrix generation, version/short-SHA artifact naming, tarball+sha256 staging, `void-cli --version`/`--help` smoke, and `actions/upload-artifact` retention selection. It does not upload GitHub Release assets, dispatch Homebrew tap updates, change release/nightly workflows, modify CLI source or Cargo manifests, or introduce upstream product identity.

## P2 - Medium-Risk Migration

### ISSUE-100A Image Understanding Architecture Decision

Priority: P2
Status: Done
Goal: Evaluate upstream image understanding tool and record architecture decision before any implementation.
Exit criteria before implementation: architecture decision recorded; tool schema reviewed; readonly and permission behavior defined; tests planned.
Docs to update: `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Result: Architecture decision recorded. Current Void already contains `src/crates/core/src/agentic/image_analysis/*`, image context storage, `ToolImageAttachment`, and provider multimodal conversion foundations. Directly copying upstream `analyze_image`/`view_image` and image upload flow is rejected because it crosses UI, desktop API, tool runtime, provider, and crate-layout boundaries. Follow-up work is split into schema/permission/manifest first, then runtime/tool implementation.

### ISSUE-100B Image Understanding Tool Schema and Permission Model

Priority: P2
Status: Done
Goal: Define a Void `AnalyzeImage` tool schema, explicit output states, readonly/path permission behavior, provider configuration contract, and tool manifest impact before runtime execution is wired.
Docs to update: `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Required boundaries: schema and manifest only; no provider calls; no UI wiring; no media or short-drama behavior changes.
Verification: `cargo test -p void-tool-packs`; `cargo test -p void-core analyze_image` after focused contract tests are added.
Result: Added `AnalyzeImage` to the product provider plan and core runtime materialization, implemented a readonly schema-only `AnalyzeImageTool`, and added contract tests for schema, source validation, output statuses, and explicit placeholder runtime state. Runtime image loading/provider execution remains deferred to `ISSUE-100C`.

### ISSUE-100C Image Understanding Runtime Adapter

Priority: P2
Status: Done
Goal: Implement `AnalyzeImage` runtime only after `ISSUE-100B` accepts the schema and permission contract.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Required boundaries: reuse `src/crates/core/src/agentic/image_analysis/*`, `ToolUseContext` path policy, and provider adapters' existing multimodal wire conversion; do not put provider calls in UI or media services.
Verification: `cargo test -p void-core image_analysis`; targeted `void-ai-adapters` multimodal conversion tests; existing workspace media and short-drama tests if touched.
Result: Replaced schema-only execution with a core-owned runtime adapter that resolves `data_url`, `image_id`, and workspace-scoped `image_path`, enforces workspace containment before file reads, maps expected failure classes to explicit statuses, reuses existing image processing/model/client infrastructure, and keeps provider wire conversion in existing AI adapter paths.

### ISSUE-110A Terminal Reliability Inventory

Priority: P2
Status: Done
Goal: Inventory upstream terminal reliability fixes and split each accepted behavior into one terminal service/core issue.
Forbidden: moving terminal domain logic into desktop API adapter.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Classified upstream terminal reliability work into focused follow-up issues. Accepted candidates are lazy terminal output rendering, frontend input queue, paste policy, resize repaint guard, structured terminal replay, and Computer Use terminal detection. Deferred direct upstream crate-layout migration and whole-file replacement of `Terminal.tsx`, `ConnectedTerminal.tsx`, `TerminalToolCard.tsx`, or `terminal_api.rs`. Rejected BitFun identity/import/path changes, duplicate `terminal-core` workspace entries, removal of local ACP/confirmation behavior, and pretending remote terminal history has structured replay support.

### ISSUE-110B Lazy Terminal Output Renderer

Priority: P2
Status: Done
Goal: Add a lazy terminal output renderer for Flow Chat terminal output without changing terminal service/core behavior.
Allowed files: `src/web-ui/src/tools/terminal/components/*`, `src/web-ui/src/flow_chat/tool-cards/TerminalToolCard.tsx`, focused tests.
Forbidden: changing PTY/session APIs, replacing `TerminalToolCard.tsx`, changing ACP permission actions, changing media/short-drama behavior.
Verification: `pnpm --dir src/web-ui run test:run src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx`; `pnpm run type-check:web`.
Result: Added a Suspense-based `LazyTerminalOutputRenderer` with a lightweight `<pre>` fallback that strips terminal control sequences, preserves terminal output class names, limits preview rows, and reserves bounded height while the xterm renderer chunk loads. Flow Chat terminal tool-card output now uses the lazy renderer for live, completed, and cancelled output. No terminal service/core, desktop adapter, ACP permission, media, or short-drama behavior was changed.

### ISSUE-110C Terminal Input Queue

Priority: P2
Status: Done
Goal: Add a frontend input queue so rapid terminal keystrokes and writes are batched in order before IPC write calls.
Allowed files: `src/web-ui/src/tools/terminal/utils/*`, `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`, focused tests.
Forbidden: backend write protocol changes, session/replay changes, terminal service replacement.
Verification: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/TerminalInputQueue.test.ts`; `pnpm run type-check:web`.
Result: Added a pure Web UI `TerminalInputQueue` that batches synchronous terminal input, keeps a single write in flight, reports write errors without killing the queue, and supports clearing unflushed buffered input. `ConnectedTerminal` now routes xterm `onData` and registered terminal action writes through the same queue, using refs to avoid stale `write` and exited-session writes. Backend write protocol, session/replay, terminal service/core, paste policy, and resize behavior were not changed.

### ISSUE-110D Terminal Paste Policy

Priority: P2
Status: Done
Goal: Extract terminal paste policy, preserve multiline confirmation, and add shell-aware PowerShell ReadLine paste handling.
Allowed files: `src/web-ui/src/tools/terminal/utils/*`, `src/web-ui/src/tools/terminal/components/Terminal.tsx`, `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`, focused tests.
Forbidden: bypassing user confirmation for multiline paste, moving paste policy into desktop API, changing global editor paste behavior.
Verification: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalPaste.test.ts`; `pnpm run type-check:web`.
Result: Added a pure Web UI terminal paste policy utility covering single-line paste, true multiline confirmation, bracketed paste mode, trailing-blank-line trimming, paste-as-single-line decisions, compact previews, and Windows PowerShell ReadLine paste detection. `Terminal.tsx` now supports paste decisions and a shell-owned paste shortcut hook. `ConnectedTerminal` keeps the existing `confirmWarning` UI while resolving paste through the policy and sends `\\x16` for Windows PowerShell/pwsh Ctrl+V. Backend write protocol, terminal-core, desktop API, TerminalToolCard, ACP, media, short-drama, and global editor paste behavior were not changed.

### ISSUE-110E Terminal Resize Repaint Guard

Priority: P2
Status: Done
Goal: Add a guard for resize-triggered repaint/cursor-position output so xterm history is not corrupted after ConPTY or shell resize events.
Allowed files: `src/web-ui/src/tools/terminal/utils/*`, `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`, `src/web-ui/src/tools/terminal/components/Terminal.tsx`, focused tests.
Forbidden: swallowing normal live output, changing backend PTY dimensions without xterm agreement, moving guard logic into desktop API.
Verification: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/resizeRepaintGuard.test.ts`; `pnpm run type-check:web`.
Result: Added a pure resize repaint guard utility that recognizes only standalone absolute cursor-position output, skips a short bounded burst after successful resize, expires quickly, and clears as soon as real output arrives. `ConnectedTerminal` now applies the guard at the backend-output-to-xterm boundary and clears it if backend resize fails. Normal live output, mixed cursor/content output, backend PTY dimensions, terminal-core, desktop API, TerminalToolCard, ACP, media, short-drama, and paste/input policies were not changed by this issue.

### ISSUE-110F Structured Terminal Replay

Priority: P2
Status: Done
Goal: Add ordered terminal replay events so restored history preserves data/resize ordering instead of replaying one flat string.
Allowed files: `src/crates/terminal/src/session/*`, `src/crates/terminal/src/api.rs`, `src/apps/desktop/src/api/terminal_api.rs`, `src/web-ui/src/tools/terminal/types/session.ts`, `src/web-ui/src/tools/terminal/hooks/useTerminal.ts`, `src/web-ui/src/tools/terminal/services/TerminalService.ts`, `src/web-ui/src/tools/terminal/components/ConnectedTerminal.tsx`, focused tests.
Forbidden: workspace crate layout migration, duplicate `terminal-core`, remote terminal history pretending to support replay, whole terminal service/UI replacement.
Verification: `cargo test -p terminal-core session::replay`; `cargo check -p terminal-core`; `cargo check -p void-desktop`; `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalReplay.test.ts`; `pnpm run type-check:web`.
Result: Added terminal-core replay history with ordered `{ cols, rows, data }` events while preserving legacy flat `data`. Resize markers are recorded in session replay history only when terminal dimensions change, and API/desktop/Web DTOs now expose `events` without removing old fields. Web history recovery normalizes old flat history and new structured events; `TerminalService` buffers pending live events when no session listener exists, `useTerminal` drains them through a replay-aware queue, and `ConnectedTerminal` replays resize/data queue items locally without sending replay resize back to the backend. Remote history continues to return empty replay events instead of pretending to support replay.

### ISSUE-120B Computer Use Terminal Detection Routing

Priority: P2
Status: Done
Goal: Add terminal/GVim detection for Computer Use `type_text` routing so terminal-like targets use key events instead of accessibility text insertion.
Allowed files: `src/apps/desktop/src/computer_use/*`, platform-specific Computer Use input adapters, focused tests.
Forbidden: moving this detection into `src/crates/terminal`, changing local terminal UI/service behavior, changing Computer Use permissions in Web UI.
Verification: `cargo test -p void-desktop terminal_detect`; `cargo check -p void-desktop`.
Result: Added a pure Computer Use `terminal_detect` route model with terminal/GVim positive coverage, regular-app negative coverage, platform normalization, and generic `terminal` false-positive protection. macOS `app_type_text` now calls a background-input `bg_type_text_auto` adapter that uses the route model to switch terminal-like targets to key-event typing while keeping normal apps on Unicode text injection. Windows/Linux detection is covered as pure routing only; Windows background/cloaked input remains a separate platform capability.

### ISSUE-120A Computer Use Platform Inventory

Priority: P2
Status: Done
Goal: Inventory upstream Computer Use platform improvements and split one issue per platform capability while preserving `ComputerUseHost` contract.
Allowed files: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Forbidden: runtime Computer Use implementation, Web UI permission changes, terminal crate changes, Flow Chat/media/short-drama changes.
Affected module: Desktop Computer Use platform adapters.
Preserved contracts: `ComputerUseHost` remains the platform boundary; `screenshot_display` and click-safety state semantics remain unchanged; unsupported platform actions remain explicit via existing capability/status paths.
Implementation rule: inventory only; no runtime source changes.
Verification: subagent platform inventory review; `node scripts/check-repo-hygiene.mjs`; scoped `git diff --check` for consensus docs.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Compared upstream Windows and macOS Computer Use platform additions with current Void. Split Windows work into module gates/app enumeration, UIA/MSAA snapshot, foreground capture, background input primitives, host app actions, and interactive/visual views. Split macOS work into SkyLight bridge, dual-post background input, window identity/focus-without-raise, Chromium/Electron background click, AX snapshot improvements, and AX pre-focus/input parity. Deferred core schema and DTO extraction candidates to separate issues.

### ISSUE-120C Windows Computer Use Module Gates and App Enumeration

Priority: P2
Status: Done
Goal: Add only the Windows Computer Use module-gate and app/window enumeration foundation needed by later Windows platform slices.
Allowed files: `src/apps/desktop/src/computer_use/mod.rs`, `src/apps/desktop/src/computer_use/windows_list_apps.rs`, `src/apps/desktop/src/computer_use/desktop_host.rs` limited to `DesktopComputerUseHost::list_apps`, focused tests, consensus docs.
Forbidden: capture implementation, background input implementation, Web UI permission changes, core tool schema changes, whole `desktop_host.rs` replacement.
Affected module: Desktop Computer Use Windows adapter.
Preserved contracts: `ComputerUseHost::list_apps` remains the host boundary; unsupported platform behavior remains explicit on non-Windows builds.
Implementation rule: keep enumeration pure and testable where possible; do not wire app actions, capture, or interactive views in this issue.
Verification: `cargo check -p void-desktop`; focused Windows enumeration tests or documented Windows smoke if platform APIs cannot be unit-tested on the current host.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md` if a new adapter boundary is added.
Risk notes: Windows-only APIs require careful `cfg(windows)` gating so Linux/macOS builds and current Windows desktop check remain stable.
Result: Added a Windows-only `windows_list_apps` adapter gated in `mod.rs` and wired `DesktopComputerUseHost::list_apps` to call it on Windows while preserving macOS and other-platform behavior. The adapter enumerates visible, non-minimized, titled top-level windows, groups by pid, resolves exe basenames through kernel32 FFI, falls back to window title, and returns `AppInfo` without enabling capture, background input, app actions, interactive view, or visual view behavior. Added focused `windows_app_enumeration` tests for exe suffix handling, path basename extraction, pid grouping, sorting, and `AppInfo` fields.

### ISSUE-120D Windows Computer Use UIA Snapshot and MSAA Fallback

Priority: P2
Status: Done
Goal: Add cached Windows UIA snapshot support and a narrow MSAA fallback for SAL/VCL-style apps while preserving existing locate/hit-test APIs.
Allowed files: `src/apps/desktop/Cargo.toml` limited to Windows accessibility features, `src/apps/desktop/src/computer_use/mod.rs`, `src/apps/desktop/src/computer_use/windows_ax_ui.rs`, `src/apps/desktop/src/computer_use/windows_msaa.rs`, `src/apps/desktop/src/computer_use/desktop_host.rs` limited to `get_app_state_inner` Windows snapshot routing, focused tests, consensus docs.
Forbidden: screenshot capture, input injection, interactive view wiring, Web UI policy changes.
Affected module: Desktop Computer Use Windows accessibility adapter.
Preserved contracts: UI state is returned through existing Computer Use state/status models; UI must not infer support from empty arrays.
Implementation rule: keep UIA and MSAA behind adapter functions; do not make `ComputerUseHost` own COM traversal details.
Verification: `cargo check -p void-desktop`; focused UIA/MSAA helper tests where portable; Windows app smoke for SAL/VCL fallback.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: COM apartment/lifetime and UIA cache traversal can hang or return partial trees; errors must be explicit.
Result: Implemented Windows foreground-window accessibility snapshot routing for `desktop.get_app_state`, added cached UIA tree traversal and conversion to `AppStateSnapshot/AxNode`, added a SAL/VCL MSAA fallback adapter, and kept screenshot/input/app-action/interactive/visual support disabled for later issues.

### ISSUE-120E Windows Computer Use Foreground Window Capture

Priority: P2
Status: Done
Goal: Add Windows foreground/window capture adapter using upstream `PrintWindow`/DWM crop/BitBlt fallback ideas without wiring input actions.
Allowed files: Windows-only Computer Use capture adapter files, focused tests, consensus docs, and minimal Windows API feature flags.
Forbidden: background input, app action wiring, screenshot safety-state changes, Web UI changes.
Affected module: Desktop Computer Use Windows capture adapter.
Preserved contracts: capture stays behind `ComputerUseHost`; occlusion/fallback status must be explicit.
Implementation rule: return enough metadata to distinguish full capture, fallback capture, and potentially occluded capture.
Verification: `cargo check -p void-desktop`; Windows smoke for a normal window and an occluded/minimized edge case where available.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: `BitBlt` fallback may capture occluded content incorrectly; this must not be reported as a guaranteed app snapshot.
Result: Added Windows-only `windows_capture.rs` adapter foundation with `PrintWindow(PW_RENDERFULLCONTENT)`, DWM extended-frame crop, mostly-black detection, WGC explicit-unimplemented stub, screen-region `BitBlt` fallback, and internal `WindowCaptureMetadata` carrying capture source, geometry, and occlusion uncertainty. The adapter is not wired into `desktop_host.rs` yet, so existing Windows `get_app_state` user-visible behavior and `screenshot_display` safety state remain unchanged.

### ISSUE-120F Windows Computer Use Background Input Primitives

Priority: P2
Status: Done
Goal: Add Windows background input primitives for click/type/scroll/drag as isolated adapter functions.
Allowed files: Windows-only Computer Use input adapter files, pure parsing/routing tests, consensus docs.
Forbidden: host app action wiring, interactive/visual flow enabling, Web UI permission changes, terminal crate changes.
Affected module: Desktop Computer Use Windows input adapter.
Preserved contracts: Computer Use permission and click-safety checks remain outside the adapter; terminal/GVim routing from 120B is preserved.
Implementation rule: implement and test primitives before connecting them to user-facing Computer Use actions.
Verification: `cargo check -p void-desktop`; focused key/text parsing tests; Windows smoke for a simple app if available.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: UIPI, DWM cloaking, foreground restoration, and SendInput fallback can produce misleading success; adapter result types must expose failures.
Result: Added Windows-only `windows_bg_input.rs` adapter primitives for PostMessage click/key/char/scroll/drag, cloaked SendInput text/key fallback, UIPI checks, DirectComposition/UWP heuristics, key chord parsing, and internal `WindowsInputOutcome` delivery status. Final review fixed cloaked input failure paths so SendInput/PostMessage errors are captured as explicit status while foreground restore and uncloaking still run. No `desktop_host.rs`, user-facing app action, interactive/visual, Web UI permission, terminal crate, or core schema wiring was added.

### ISSUE-120G Windows Computer Use Host App Actions

Priority: P2
Status: Done
Goal: Wire Windows `app_click`, `app_type_text`, `app_scroll`, and `app_key_chord` through the Windows capture/input/accessibility adapters after 120C-120F.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, Windows-only Computer Use adapter files, focused tests, consensus docs.
Forbidden: implementing new low-level primitives in this issue, Web UI permission changes, core tool schema changes.
Affected module: Desktop Computer Use host action wiring.
Preserved contracts: action routing remains behind `ComputerUseHost`; safety state and unsupported defaults remain explicit.
Implementation rule: only connect already-tested adapter primitives and keep each action's error/status explicit.
Verification: `cargo check -p void-desktop`; targeted host-action tests where possible; Windows smoke.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: should not start until adapter primitives have passed their own issue checks.
Result: Added Windows `ComputerUseHost` wiring for `app_click`, `app_type_text`, `app_scroll`, and `app_key_chord` using target HWND resolution, target-window UIA/MSAA snapshots, and existing `windows_bg_input` primitives. Adapter failures remain explicit through `WindowsInputOutcome` mapping; uncertain posted delivery is preserved as `loop_warning`. No new low-level input primitive, `supports_background_input` capability flip, interactive/visual/drag wiring, Web UI permission change, terminal behavior change, or core schema change was added.

### ISSUE-120H Windows Computer Use Interactive and Visual Views

Priority: P2
Status: Done
Goal: Enable Windows interactive and visual mark flows using previously accepted Windows snapshot/capture/input adapters.
Allowed files: Desktop Computer Use host/view adapter files, focused tests, consensus docs.
Forbidden: changing Web UI permission policy, replacing core Computer Use schemas, changing macOS behavior.
Affected module: Desktop Computer Use interactive/visual views.
Preserved contracts: UI receives explicit `supported/unsupported/error` state; empty arrays are not support signals.
Implementation rule: wire only after Windows app actions and snapshot/capture slices are stable.
Verification: `cargo check -p void-desktop`; Windows smoke for interactive view, visual marks, and unsupported app cases.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: this is a higher-integration issue and has been split into 120H1-120H5 after upstream/architecture/QA review.
Result: Completed through `ISSUE-120H1`-`ISSUE-120H5`. Windows Computer Use now attaches same-HWND screenshots for app state, enables interactive view construction and cached interactive actions through existing app actions, enables visual mark view/click through cached screenshot-backed marks, and keeps Windows `ClickTarget::VisualGrid` explicitly unsupported under `[WINDOWS_VISUAL_GRID_UNSUPPORTED]` until real Windows smoke covers DPI, occlusion, DirectComposition/UWP, same-process multi-window, and multi-monitor targets. Web UI permission policy, core Computer Use schemas, macOS behavior, drag, `app_wait_for`, terminal behavior, low-level input primitives, media, short-drama, and Flow Chat behavior remain unchanged.

### ISSUE-120H1 Windows AppState Screenshot Attachment

Priority: P2
Status: Done
Goal: Attach a same-HWND Windows screenshot to `get_app_state(..., capture_screenshot=true)` and register screenshot coordinate maps for later interactive/visual/image-click flows.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, focused tests, consensus docs.
Forbidden: enabling `supports_interactive_view`, enabling `supports_visual_mark_view`, changing Web UI permission policy, replacing core Computer Use schemas, changing macOS behavior, adding new low-level input primitives.
Affected module: Desktop Computer Use Windows app-state host attachment.
Preserved contracts: Windows capture uncertainty remains explicit; `BitBltScreenRegion` fallback is not treated as guaranteed current app state.
Implementation rule: use the target HWND already resolved for the Windows app-state snapshot; do not fall back to an unrelated foreground window.
Verification: `cargo test -p void-desktop windows_interactive_visual_views -- --nocapture`; adjacent Windows Computer Use regression tests; `cargo check -p void-desktop`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: automatic tests validate conversion and map registration seams only; real capture reliability still needs Windows smoke for occlusion, minimized windows, DPI, and multi-monitor cases.
Result: Added Windows host conversion from `WindowCapture` PNG/metadata to `ComputerScreenshot` plus `PointerMap`, registered maps by app pid and screenshot id, and wired Windows `get_app_state_inner(..., capture_screenshot=true)` to attach a same-HWND screenshot non-fatally. Final review added a post-capture HWND/pid revalidation before map registration so stale or reused HWNDs skip attachment instead of poisoning coordinate maps. `potentially_occluded` capture metadata is propagated as `[WINDOWS_CAPTURE_UNCERTAIN]` through `loop_warning` and composed with any existing warning. No interactive/visual support flag, Web UI, core schema, macOS behavior, terminal behavior, or low-level input primitive was changed.

### ISSUE-120H2 Windows Interactive View Enablement

Priority: P2
Status: Done
Goal: Enable Windows `build_interactive_view` and cache/index resolution using 120H1 screenshots plus existing `interactive_filter` and `som_overlay`.
Allowed files: Desktop Computer Use host interactive-view code, focused tests, consensus docs.
Forbidden: visual mark click support, Web UI permission changes, core schema changes, macOS behavior changes, new input primitives.
Affected module: Desktop Computer Use interactive view host integration.
Preserved contracts: stale digest and missing index errors remain explicit; empty element lists are not used as support signals.
Implementation rule: reuse existing snapshot/screenshot/cache interfaces and do not open `supports_interactive_view` until build/cache tests pass.
Verification: focused Windows interactive view tests; adjacent Windows Computer Use regression tests; `cargo check -p void-desktop`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: requires real Windows smoke for overlay readability and image-coordinate alignment.
Result: Enabled Windows `supports_interactive_view` after adding focused tests for build/cache/resolver behavior. Windows `build_interactive_view` now reuses 120H1 same-HWND app-state screenshots, existing `interactive_filter`, and existing `som_overlay`; it writes `interactive_view_cache` by pid and preserves snapshot `loop_warning`. Final review fixed empty filtered views to return explicit `[INTERACTIVE_VIEW_EMPTY]` without writing cache, so empty arrays are not treated as support success. Resolver helpers now support macOS/Windows while keeping the same `INTERACTIVE_VIEW_MISSING`, `STALE_INTERACTIVE_VIEW`, and `INTERACTIVE_INDEX_OUT_OF_RANGE` contracts. No Windows `interactive_click/type_text/scroll`, visual mark view/click, `supports_visual_mark_view`, `supports_background_input`, Web UI, core schema, macOS behavior, terminal behavior, or new input primitive was changed.

### ISSUE-120H3 Windows Interactive Actions

Priority: P2
Status: Done
Goal: Enable Windows `interactive_click`, `interactive_type_text`, and `interactive_scroll` by resolving cached interactive indices and delegating to 120G app actions.
Allowed files: Desktop Computer Use host interactive-action code, focused tests, consensus docs.
Forbidden: new low-level Windows input primitives, drag, app_wait_for, Web UI permission changes, core schema changes.
Affected module: Desktop Computer Use interactive action host integration.
Preserved contracts: action delivery uncertainty remains warning/error based on `WindowsInputOutcome`; stale digest can rebuild once but must not silently target a different HWND.
Implementation rule: reuse `app_click`, `app_type_text`, and `app_scroll`; Windows `clear_first` must use Windows key chords, not macOS command chords.
Verification: focused Windows interactive action seam tests; adjacent Windows Computer Use regression tests; `cargo check -p void-desktop`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: automatic tests cannot prove `PostMessageW`/`SendInput` delivery; Notepad and elevated-target smoke remain required.
Result: Windows `interactive_click`, `interactive_type_text`, and `interactive_scroll` now delegate through existing app actions. Cached interactive views store Windows HWND identity and fail closed with `[WINDOW_CHANGED]` if the current target window differs. `interactive_click` keeps a screenshot-id-bound `ImageXy` fallback from the cached interactive view; `clear_first` uses Windows `Ctrl+A`/`Delete`; `press_enter_after` uses Windows `Enter`. Visual marks, drag, `app_wait_for`, Web UI, core schema, and low-level primitives remain unchanged.

### ISSUE-120H4 Windows Visual Mark View and Click

Priority: P2
Status: Done
Goal: Enable Windows `build_visual_mark_view` and `visual_click` using 120H1 screenshot maps and existing visual mark/overlay helpers.
Allowed files: Desktop Computer Use host visual-view code, focused tests, consensus docs.
Forbidden: changing visual DTO schema, Web UI permission changes, macOS behavior changes, unrelated VisualGrid semantics.
Affected module: Desktop Computer Use visual mark host integration.
Preserved contracts: visual marks use the screenshot id and pointer map the model saw; stale/missing cache is explicit.
Implementation rule: click through existing `app_click(ImageXy)` and preserve `[WINDOWS_CAPTURE_UNCERTAIN]` warnings.
Verification: focused Windows visual mark tests; adjacent Windows Computer Use regression tests; `cargo check -p void-desktop`.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: needs real Windows smoke for DPI, occlusion, and DirectComposition surfaces.
Result: Windows `build_visual_mark_view` now builds regular visual marks from same-HWND app screenshots, stores cached `hwnd_raw` plus `screenshot_id`, and enables `supports_visual_mark_view`. Windows `visual_click` resolves cached marks, validates HWND identity, binds stale-rebuild clicks to the rebuilt view pid/cache, and delegates through existing `app_click(ImageXy)` with the cached screenshot id. VisualGrid, drag, `app_wait_for`, Web UI, core schema, macOS behavior, and low-level primitives remain unchanged.

### ISSUE-120H5 Windows VisualGrid Support Decision

Priority: P3
Status: Done
Goal: Decide whether Windows `ClickTarget::VisualGrid` should remain explicitly unsupported or be mapped through visual mark/grid logic after 120H4.
Allowed files: Desktop Computer Use host target-resolution tests and docs.
Forbidden: broad action rewrites, Web UI permission changes, core schema changes.
Affected module: Desktop Computer Use visual target contract.
Preserved contracts: unsupported states must be explicit and must not appear as empty-grid success.
Implementation rule: make a contract decision after visual mark smoke, not before.
Verification: focused contract tests and `cargo check -p void-desktop`.
Docs to update: `docs/ISSUES.md`, `docs/TEST_PLAN.md`.
Risk notes: premature support can mis-click on scaled or occluded Windows targets.
Result: Windows `ClickTarget::VisualGrid` remains explicitly unsupported under `[WINDOWS_VISUAL_GRID_UNSUPPORTED]` for 120H5. The error now points to ISSUE-120H5, explains that real Windows smoke for DPI, occlusion, DirectComposition, and multi-monitor targets is still missing, and recommends `build_visual_mark_view` plus `visual_click` or `ImageXy` with an explicit screenshot basis. `ImageGrid`, `ImageXy`, visual marks, macOS VisualGrid, Web UI, core schema, and low-level input primitives remain unchanged.

### ISSUE-121A macOS Computer Use SkyLight Bridge

Priority: P3
Status: Done
Goal: Add a macOS SkyLight bridge behind runtime availability checks as an adapter foundation, with no behavior change unless explicitly enabled by later slices.
Allowed files: macOS-only Computer Use adapter files, focused tests where possible, consensus docs.
Forbidden: broad macOS host rewrite, Web UI policy changes, BitFun private API naming leakage, Windows behavior changes.
Affected module: Desktop Computer Use macOS adapter.
Preserved contracts: private SPI remains contained and soft-fails; public API fallback remains available.
Implementation rule: isolate unsafe/private symbols in one module and keep callers independent of private structs.
Verification: `cargo check -p void-desktop`; macOS-target check or documented environment blocker; macOS smoke before release.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/DECISIONS.md`.
Risk notes: private API usage is high risk and must remain optional and observable.
Result: Added a contained `macos_skylight` foundation module with structured availability, diagnostics, default-disabled policy, and macOS runtime `dlopen`/`dlsym` probing for required SkyLight symbols. The module is compiled for macOS and tests only; it is not wired into host actions, background input, focus, click, scroll, Web UI, core schema, Windows behavior, or capability flags. Windows-local focused tests cover stable status messages, soft-fail behavior, default-disabled policy, and private-name containment. macOS target check is blocked in the current Windows environment because the `aarch64-apple-darwin` Rust target is not installed.

### ISSUE-121B macOS Computer Use Dual-Post Background Input

Priority: P3
Status: Done
Goal: Route macOS background mouse/keyboard posts through dual-post helpers using SkyLight plus public event fallback.
Allowed files: macOS-only Computer Use input adapter files, focused tests, consensus docs.
Forbidden: changing terminal detection semantics, replacing `desktop_host.rs`, Web UI permission changes.
Affected module: Desktop Computer Use macOS input adapter.
Preserved contracts: 120B terminal/GVim routing remains the route selector for `type_text`.
Implementation rule: only start after SkyLight bridge availability and fallback behavior are documented.
Verification: `cargo check -p void-desktop`; macOS smoke on normal app and terminal-like app.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: event-auth/no-auth mixing can silently fail or steal focus.
Result: Added a pure dual-post policy seam plus macOS SkyLight `SLEventPostToPid` wrapper and routed normal click, scroll, Unicode text, and key chord posts through SkyLight/public fallback helpers. Terminal-safe typing, terminal detection semantics, `desktop_host.rs`, focus/window behavior, Web UI policy, Windows behavior, and core schemas were not changed. Real macOS smoke remains required.

### ISSUE-121C macOS Computer Use Window Identity and Focus Without Raise

Priority: P2
Status: Done
Goal: Resolve pid-owned window ids and focus target windows without raising them before app actions.
Allowed files: macOS-only Computer Use window/focus adapter files, host wiring limited to target-window lookup, consensus docs.
Forbidden: broad window lifecycle changes, tray/window label changes, Web UI policy changes.
Affected module: Desktop Computer Use macOS window adapter.
Preserved contracts: foreground app/window state must not be stolen unless the existing action explicitly requires it.
Implementation rule: keep focus-without-raise separate from click/type/scroll behavior changes.
Verification: `cargo check -p void-desktop`; macOS smoke with foreground and background app windows.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: wrong window id mapping can target the wrong app; all failures must be explicit.
Result: Added a pure macOS focus activation plan, pid-owned on-screen layer-0 window id lookup, and a SkyLight focus-without-raise primitive with public activate fallback only through the existing explicit macOS activation entry point. Input event payloads, terminal routing, Web UI, core schema, Windows behavior, and broad host lifecycle were not changed. Real macOS compile and smoke remain required.

### ISSUE-121D macOS Chromium and Electron Background Click Recipe

Priority: P3
Status: Done
Goal: Add the upstream Chromium/Electron multi-event background click recipe as a narrow adapter path.
Allowed files: macOS-only Computer Use input adapter files, focused tests, consensus docs.
Forbidden: generic click behavior replacement, Web UI policy changes, Windows behavior changes.
Affected module: Desktop Computer Use macOS click adapter.
Preserved contracts: normal apps keep existing click path unless a targeted Chromium/Electron route is selected.
Implementation rule: select by app/window metadata, not by loose display text matching.
Verification: `cargo check -p void-desktop`; macOS smoke in a Chromium/Electron app.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: this depends on reliable window-local coordinates and window id resolution from earlier macOS issues.

### ISSUE-121E macOS Computer Use AX Snapshot Improvements

Priority: P2
Status: Done
Goal: Improve macOS AX snapshots by enabling Chromium AX tree support where safe, traversing `AXChildren` plus `AXWindows`, and using `AXPlaceholderValue` fallback.
Allowed files: macOS-only Computer Use accessibility adapter files, focused tests, consensus docs.
Forbidden: input injection changes, SkyLight behavior changes, Web UI policy changes.
Affected module: Desktop Computer Use macOS accessibility adapter.
Preserved contracts: snapshots return explicit supported/error state and must avoid duplicate/misowned nodes.
Implementation rule: keep AX tree enablement cached/per-pid and settled; dedupe `AXChildren`/`AXWindows`.
Verification: `cargo check -p void-desktop`; macOS smoke with Chromium/Electron and standard apps.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`.
Risk notes: enabling AX trees can change app accessibility behavior; failures must fall back safely.

### ISSUE-121F macOS Computer Use AX Pre-Focus and Input Parity

Priority: P2
Status: Done
Goal: Add AX pre-focus before text input plus small parity helpers such as Fn modifier, right/middle click, drag, and no-auth key chord where adapter support is clear.
Allowed files: macOS-only Computer Use input/accessibility adapter files, focused tests, consensus docs.
Forbidden: terminal route changes, Windows behavior changes, Web UI policy changes.
Affected module: Desktop Computer Use macOS input/accessibility adapter.
Preserved contracts: input routing still flows through `ComputerUseHost` and 120B terminal detection where applicable.
Implementation rule: split further if any helper requires a different platform contract.
Verification: `cargo check -p void-desktop`; macOS smoke for text focus and each accepted helper.
Docs to update: `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Risk notes: helper parity is easy to over-broaden; keep each behavior independently testable.
Outcome: Split after Architecture-Agent and QA/Risk-Agent review because AX focus, key parity, and pointer parity have different contracts.
Parent closure: `ISSUE-121F1`, `ISSUE-121F2`, and `ISSUE-121F3` are complete. Real macOS compile/smoke remains a release risk, and adapter-only primitives such as `bg_drag` and no-auth key chord routing are not product-facing host/tool behavior until later issues accept route policy and smoke evidence.

#### ISSUE-121F1 macOS AX Pre-Focus Before Text Input

Priority: P2
Status: Done
Goal: For explicit `NodeIdx` text input focus targets, attempt AX pre-focus before text dispatch while preserving existing click/activation and `bg_type_text_auto` routing.
Allowed files: `macos_ax_write.rs`, narrow `desktop_host.rs` `app_type_text` wiring, focused tests, consensus docs.
Forbidden: `macos_bg_input.rs` key/drag parity changes, terminal route changes, Windows behavior changes, Web UI policy changes, core schema changes.
Verification: `cargo test -p void-desktop terminal_detect -- --nocapture`; `cargo test -p void-desktop macos_ax_write -- --nocapture`; `cargo check -p void-desktop`; target-file rustfmt; macOS smoke pending.

#### ISSUE-121F2 macOS Key Parity

Priority: P3
Status: Done
Goal: Evaluate Fn modifier and no-auth key-chord route as a separate macOS keyboard adapter policy.
Allowed files: `macos_bg_input.rs`, optional pure key route plan, focused tests, consensus docs.
Forbidden: default `app_key_chord` route changes without explicit policy tests; terminal text route changes; Windows/Web UI/core schema changes.
Risk notes: `Fn` and no-auth event delivery are platform-sensitive and need macOS smoke before routing from host actions.
Outcome: Added a pure key parity plan and macOS adapter primitives for `Fn` flag/keycode and no-auth key chord. The default host parser still rejects `fn`, and `app_key_chord` still routes to authenticated `bg_key_chord`; exposing Fn/no-auth from host actions remains gated on later macOS smoke and policy.

#### ISSUE-121F3 macOS Pointer Parity

Priority: P3
Status: Done
Goal: Verify existing right/middle click coverage and evaluate PID-scoped background drag as a separate pointer gesture contract.
Allowed files: macOS pointer adapter files, optional host/tool contract only after explicit design, focused tests, consensus docs.
Forbidden: adding background drag to existing actions without a tool/host contract and macOS smoke plan.
Risk notes: right/middle click appears already present; drag needs event sequence, window-local routing, Chromium/Electron behavior, and accessibility permission review.
Outcome: Verified the existing right/middle click adapter path and fixed the macOS `NodeIdx` AXPress gate so only plain left single clicks may use AXPress; right/middle, multi-click, and modifier clicks now fall through to the background click path. Added `macos_pointer_parity_plan` and a PID-scoped `bg_drag` adapter primitive for future smoke, but did not route drag from host/tool actions.

### ISSUE-122A Computer Use `describe_screen` Contract Inventory

Priority: P2
Status: Done
Goal: Inventory upstream `describe_screen` capability as a core/tool-schema issue separate from platform adapter migration.
Allowed files: consensus docs only for this issue: `docs/ISSUES.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`, and product constraints in `docs/PRD.md`.
Forbidden: adding or changing core Computer Use schemas inside this docs-only inventory; adding platform adapter behavior; modifying `ComputerUseHost`; changing Web UI permission policy; changing Windows/macOS input/capture adapters; changing terminal behavior.
Affected module: Computer Use tool contract.
Preserved contracts: platform adapter migration must not alter core tool schema implicitly.
Implementation rule: this docs-only issue records product/tool contract acceptance only. Code implementation must happen in a later issue with schema, dispatch, result-shape, and host-default tests.
Contract inventory:
- User value: provide a low-cost observation summary for text-only or weak-vision Computer Use flows, especially when AX/UIA trees miss Canvas/WebView/WebGL content.
- Non-goals: do not replace `screenshot`, `get_app_state`, `build_interactive_view`, or `build_visual_mark_view`; do not add click/input capability; do not change click readiness, screenshot navigation state, or interaction-state semantics.
- First implementation direction: core action composes existing host seams such as `screenshot_peek_full_display`, `get_app_state`, and existing result envelopes; do not add `ComputerUseHost::describe_screen` unless a later issue proves existing seams are insufficient.
- Required output model: explicit `status`, `source`, `scope`, `description` or structured summary, warnings, and `error`/`error_code` for unsupported or failed states. Empty arrays, empty strings, or missing fields must not mean unsupported.
- Coordinate policy: do not output unbound clickable coordinates. Any future region hints must be tied to a `screenshot_id` or an explicit coordinate basis.
- Rejected shortcuts: schema-only action addition without dispatch; aliasing to `screenshot` while bypassing multimodal/provider gates; platform-specific screen-description logic in core; Web UI inference of platform state; broad DTO extraction.
Verification: docs-only validation now; future schema tests, action dispatch tests, result-shape tests, host default/unsupported tests, and platform smoke before product-facing implementation.
Docs to update: `docs/PRD.md`, `docs/ISSUES.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Risk notes: schema changes can affect agent prompts, runtime dispatch, provider capability gates, result rendering, and UI behavior, so they must be isolated from platform adapter work.

### ISSUE-122C Computer Use `describe_screen` Schema and Readonly Observation

Priority: P2
Status: Done
Goal: Implement the smallest product-facing `describe_screen` action after 122A contract acceptance, returning explicit readonly observation status without changing platform adapter behavior.
Allowed files: `src/crates/core/src/agentic/tools/implementations/computer_use_tool.rs`, `src/crates/core/src/agentic/tools/implementations/computer_use_actions.rs`, result/input helpers only if needed, focused core tests, and consensus docs.
Forbidden: Web UI changes; Windows/macOS adapter behavior changes; input injection changes; click/drag/focus changes; `ComputerUseHost::describe_screen` unless separately accepted; upstream DTO extraction; crate layout migration; platform smoke claims without evidence.
Affected module: Computer Use tool contract and runtime dispatch.
Preserved contracts: text-only vs multimodal schema exposure must be explicit; schema actions must not fall through to unknown action; screenshot bytes stay out of JSON; observation must not mutate screenshot readiness, pointer maps, or interactive/visual caches.
Verification: schema snapshot tests, runtime dispatch tests, result-shape tests, fake-host side-effect tests, `cargo test -p void-core computer_use --lib`, and platform smoke checklist recorded before enabling richer behavior.
Outcome: `ComputerUseTool` now exposes `describe_screen` in both text-only and multimodal schemas. Runtime dispatch returns either explicit `unsupported` without a desktop host or readonly JSON observation from existing host seams (`computer_use_session_snapshot`, `computer_use_interaction_state`, `enumerate_ui_tree_text`) without image attachments, screenshot calls, action-history mutation, or platform adapter changes.

### ISSUE-122B Computer Use Tool-Contracts DTO Extraction

Priority: P3
Status: Split
Goal: Evaluate upstream tool-contract DTO extraction only after current platform adapter work is stable.
Allowed files: consensus docs only until accepted.
Forbidden: upstream crate layout migration, portable DTO extraction during platform issues, whole core/desktop rewrites.
Affected module: Computer Use core/tool contract architecture.
Preserved contracts: current Void crate layout and `ComputerUseHost` boundary remain authoritative.
Implementation rule: architecture decision required before any code.
Verification: future boundary checker and targeted schema tests.
Docs to update: `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md`.
Risk notes: this is a broad architecture move and is not required for Windows/macOS platform parity slices.
Split note: Full DTO extraction remains deferred. `ISSUE-122B1` accepts only static boundary checks and documentation that protect the current `ComputerUseHost` seam and `describe_screen` readonly contract.

### ISSUE-122B1 Computer Use DTO Boundary Checker Guard

Priority: P3
Status: Done
Goal: Add static guardrails so Computer Use DTO extraction cannot be mixed into platform adapter or `describe_screen` follow-up work.
Allowed files: `scripts/check-core-boundaries.mjs`, consensus docs.
Forbidden files: Computer Use Rust source, desktop platform adapters, Web UI, provider adapters, tool runtime, Cargo manifests, new crates, new traits, new host methods.
Affected module: Computer Use architecture governance.
Preserved contracts: `ComputerUseHost` remains the core-to-desktop boundary; `describe_screen` uses only `computer_use_session_snapshot`, `computer_use_interaction_state`, and `enumerate_ui_tree_text`; no `ComputerUseHost::describe_screen` is introduced.
Acceptance:
- Boundary checker self-test fails before Computer Use anchors are added and passes after.
- Normal boundary checker passes.
- Existing `describe_screen` and `computer_use` core tests pass.
Result: Hardened `scripts/check-core-boundaries.mjs` with Computer Use owner anchors for the host seam and `describe_screen` readonly implementation/tests. No Computer Use Rust source, desktop adapter, Web UI, provider, tool runtime, Cargo, crate layout, or DTO extraction changes were made.

### ISSUE-130A Flow Chat Long-Session Performance Inventory

Priority: P2
Status: Done
Goal: Evaluate upstream long-session rendering and scrolling fixes before splitting implementation issues.
Docs to update: `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`.
Result: Accepted as a docs-only inventory. Local upstream snapshot `tmp/upstream-bitfun@c2f6a3c` contains Flow Chat long-session helpers and tests that are absent locally: `virtualMessageListLayout.ts`, `VirtualMessageList.layout.test.ts`, `VirtualMessageList.session-boundary.test.tsx`, `historyProjectionHandoff.ts`, `modelRoundProgressiveRender.ts`, and `modelRoundProgressiveRender.test.ts`. These must be migrated as small slices, not by replacing current Void Flow Chat files.
Protected local contracts: multi-agent/subagent projection, BTW child dialogs, floating/compact chat surfaces, current `SessionHistoryState` / `SessionContextRestoreState`, AI media grouping/cards, AI short-drama canvas/services, terminal service boundaries, and Void product identity.

### ISSUE-130B Flow Chat Model Round Progressive Render

Priority: P2
Status: Done
Goal: Adapt upstream `modelRoundProgressiveRender` so completed oversized model rounds render progressively while streaming rounds stay complete.
Allowed files: `src/web-ui/src/flow_chat/components/modern/modelRoundProgressiveRender.ts`, focused tests, minimal `ModelRoundItem.tsx` integration, docs.
Forbidden files: `src/web-ui/src/flow_chat/store/FlowChatStore.ts`, `src/web-ui/src/flow_chat/store/modernFlowChatStore.ts`, subagent projection internals, AI media services, AI short-drama modules.
Acceptance:
- RED test proves completed large rounds currently render all groups at once.
- GREEN behavior renders a bounded latest tail first, then increments on timer/frame without dropping group order.
- Streaming/running rounds are not clipped.
- Media generation groups and task/subagent projection groups remain visible.
Result: Added pure progressive-render helper and focused tests. `ModelRoundItem` now renders completed oversized rounds from the newest bounded tail first, then advances in small chunks with component-local timer state. Streaming rounds stay fully rendered. Rounds containing synthetic AI media groups or `Task` subagent groups render fully in this first slice to avoid hiding grouped media results or subagent projection. No store, session, subagent projection internals, terminal service/core, AI media services, or AI short-drama files were changed.

### ISSUE-130C Flow Chat Virtual Message Height Estimates

Priority: P2
Status: Done
Goal: Adapt upstream layout estimation helpers without enabling initial history windowing yet.
Allowed files: `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.ts`, focused layout tests, minimal `VirtualMessageList.tsx` estimate wiring, docs.
Forbidden files: `FlowChatStore.ts`, session history loading APIs, `modernFlowChatStore.ts` item-shape changes, AI media/short-drama modules.
Acceptance:
- RED tests cover default historical/user/model/explore/image height estimates.
- Live session estimate behavior remains compatible with current follow-output behavior.
- Historical compact-tail and model-round estimates use explicit pure helpers.
- No scroll follow/pin/session data semantics change.
Result: Added `virtualMessageListLayout.ts` pure helpers and focused tests for live default height, historical compact/default/model-round estimates, content-aware item estimates, projection classification, and the 130C/130E boundary. `VirtualMessageList` now derives Virtuoso `defaultItemHeight` from `activeSession.isHistorical` and current `virtualItems`. It does not enable `heightEstimates`, initial history render windows, `firstItemIndex`, handoff overlays, store changes, or session/history API changes.

### ISSUE-130D Flow Chat Stable Virtual Item Keys and Session Boundary Reset

Priority: P2
Status: Done
Goal: Prevent viewport-local scroll/follow state leaking across session switches by adapting upstream stable item-key and session-boundary reset patterns.
Allowed files: `VirtualMessageList.tsx`, `VirtualMessageList.session-boundary.test.tsx`, docs.
Forbidden files: `FlowChatStore.ts`, backend/session adapters, subagent/media/short-drama modules.
Acceptance:
- RED test proves session switch can retain stale at-bottom/follow state or stale visible range.
- `computeItemKey` includes session identity and stable item identity.
- Viewport-local state resets on active session boundary without changing virtual item data shape.
Result: Implemented in `VirtualMessageList.tsx` with session-scoped stable item keys, `Virtuoso` session remount key, and layout-effect viewport-local state reset. Added focused source-contract and jsdom behavior coverage in `VirtualMessageList.session-boundary.test.tsx`.

### ISSUE-130E Flow Chat Initial Historical Render Window

Priority: P2
Status: Done
Goal: Adapt upstream tail-window initial render for long historical sessions using spacer/height estimates after 130C and 130D.
Allowed files: `VirtualMessageList.tsx`, `virtualMessageListLayout.ts`, `VirtualMessageList.scss`, focused tests, docs.
Forbidden files: `FlowChatStore.ts` deferred hydration, backend session APIs, AI media/short-drama modules.
Acceptance:
- Long history initially renders the latest bounded window plus an omitted-height spacer.
- Upward reveal expands the window and preserves scrollTop mapping.
- `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` remain functional.
Split note: 130E is split because direct upstream static-scroller migration has P1 risk in current Void; `VirtualMessageList` still has many `virtuosoRef`-dependent scroll/pin/follow paths. `ISSUE-130E1` implements pure helper foundations. `ISSUE-130E2` must choose and prove the UI render strategy before enabling a bounded render window.
Result: Completed through `ISSUE-130E1` and `ISSUE-130E2`. The pure render-window helpers select a bounded latest historical tail and map upward-expansion scroll positions; `VirtualMessageList` now has a gated static-scroller path for historical sessions that renders the bounded tail plus omitted-height spacer, expands on upward intent or omitted-target navigation, and preserves `scrollToTurn`, `scrollToIndex`, `pinTurnToTop`, `ScrollAnchor`, `ScrollToLatestBar`, and `StickyTaskIndicator` behavior with focused tests. This parent closure does not add `heightEstimates`, Virtuoso `firstItemIndex`, history projection handoff, deferred hydration, store/API changes, media, short-drama, subagent, or terminal behavior.

### ISSUE-130E1 Flow Chat Initial History Window Helpers

Priority: P2
Status: Done
Goal: Adapt upstream pure initial-history window selection and scrollTop expansion mapping helpers without changing `VirtualMessageList` render behavior.
Allowed files: `virtualMessageListLayout.ts`, `virtualMessageListLayout.test.ts`, docs.
Forbidden files: `VirtualMessageList.tsx`, `VirtualMessageList.scss`, `FlowChatStore.ts`, `modernFlowChatStore.ts`, backend session APIs, AI media/short-drama/subagent/terminal modules.
Acceptance:
- `selectInitialHistoryRenderWindow` keeps a bounded latest tail for large historical item lists.
- User-only latest turns keep one extra previous turn.
- Small histories remain unwindowed.
- `mapInitialHistoryExpansionScrollTop` preserves top, spacer-ratio, visible-tail, and bottom-pinned positions.
- Component boundary tests prove no static scroller, `heightEstimates`, handoff, or deferred hydration is enabled yet.
Result: Implemented helper-only foundation with focused tests. UI behavior remains in `ISSUE-130E2`.

### ISSUE-130E2 Flow Chat Initial Historical Render Window UI Gate

Priority: P1
Status: Done
Goal: Enable the bounded initial historical render window in `VirtualMessageList` only after proving the render strategy preserves existing scroll/pin/follow APIs.
Allowed files: `VirtualMessageList.tsx`, `VirtualMessageList.scss`, focused jsdom/component tests, docs.
Forbidden files: `FlowChatStore.ts`, `modernFlowChatStore.ts`, backend session APIs, history projection handoff, deferred hydration, AI media/short-drama/subagent/terminal modules.
Acceptance:
- Chosen strategy is documented: static scroller, Virtuoso `firstItemIndex`, or another bounded-render adapter.
- `scrollToTurn`, `scrollToIndex`, `pinTurnToTop`, `ScrollAnchor`, `ScrollToLatestBar`, `StickyTaskIndicator`, visible turn measurement, and follow-output behavior have focused tests for the chosen strategy.
- Long historical sessions initially render only the bounded latest window plus omitted-height spacer or equivalent virtual offset.
- Upward reveal expands the window and preserves scrollTop mapping through `mapInitialHistoryExpansionScrollTop`.
- No `heightEstimates`, `firstItemIndex`, or static-scroller branch is added without tests covering index mapping and imperative navigation.
Result: Enabled a gated static-scroller render path for long historical sessions in `VirtualMessageList`. The path initially renders the bounded latest tail plus omitted-height spacer, expands on upward wheel intent, and adapts `scrollToTurn`, `scrollToIndex`, and `pinTurnToTop` through a DOM-scroller adapter before using the existing overlays (`ScrollAnchor`, `ScrollToLatestBar`, `StickyTaskIndicator`). Boundary tests continue to forbid `heightEstimates`, `firstItemIndex`, history projection handoff, deferred hydration, store/API changes, media/short-drama changes, and terminal changes.

### ISSUE-130F Flow Chat History Projection Handoff Overlay

Priority: P2
Status: Done
Goal: Adapt upstream session-open handoff overlay to reduce blank UI during historical session switching after boundary reset is in place.
Allowed files: `historyProjectionHandoff.ts`, `VirtualMessageList.tsx`, `VirtualMessageList.scss`, focused tests, docs.
Forbidden files: `FlowChatStore.ts`, history restore API, terminal/media/short-drama modules.
Acceptance:
- Overlay snapshots are guarded by source/target session identity.
- Overlay auto-releases after real session content is measured/rendered.
- Actual session data is not mutated or replaced by overlay data.
Split note: 130F is split because upstream overlay code is intertwined with partial history projection, startup trace, `heightEstimates`, `firstItemIndex`, previous-history boundary status, and session-open effects. `ISSUE-130F1` adds pure snapshot/session-open selection helpers only. `ISSUE-130F2` must separately gate any `VirtualMessageList` overlay UI and release behavior.
Result: Completed through `ISSUE-130F1` and `ISSUE-130F2`. The pure handoff helpers create session-scoped bottom-tail snapshots only for valid session switches, and `VirtualMessageList` renders a guarded, read-only overlay as a sibling of the real scroller. The overlay releases after real target content renders or after a bounded timeout, while visible-turn measurement, imperative navigation, store/session data, and `virtualItems` remain based on the real list. This parent closure does not change `FlowChatStore`, restore APIs, deferred hydration, `heightEstimates`, Virtuoso `firstItemIndex`, startup trace expansion, terminal, media, short-drama, or subagent behavior.

### ISSUE-130F1 Flow Chat History Projection Handoff Helpers

Priority: P2
Status: Done
Goal: Add the pure history projection handoff snapshot contract and session-open selection logic without rendering an overlay.
Allowed files: `historyProjectionHandoff.ts`, `historyProjectionHandoff.test.ts`, source-boundary tests, docs.
Forbidden files: `VirtualMessageList.tsx`, `VirtualMessageList.scss`, `FlowChatStore.ts`, history restore API, terminal/media/short-drama modules.
Acceptance:
- `activeSessionHistoryProjectionHandoff` returns a snapshot only when its session id matches the active session id.
- `selectSessionOpenHistoryProjectionHandoff` creates a bottom-tail snapshot only for a real session switch into ready, non-partial history without static initial-history windowing or duplicate activation.
- Tail selection keeps the latest user message visible when it falls before the normal tail budget.
- `VirtualMessageList` source-boundary tests prove no projection overlay or handoff state is wired yet.
Result: Added `historyProjectionHandoff.ts` pure helpers and focused tests. No UI overlay, release scheduler, startup trace, partial-history projection, store/API, media/short-drama, or terminal behavior was changed.

### ISSUE-130F2 Flow Chat History Projection Handoff Overlay UI Gate

Priority: P2
Status: Done
Goal: Wire the 130F1 helper into `VirtualMessageList` as a guarded overlay only after proving render/release behavior.
Allowed files: `VirtualMessageList.tsx`, `VirtualMessageList.scss`, focused jsdom/component tests, docs.
Forbidden files: `FlowChatStore.ts`, history restore API, deferred full hydration, `heightEstimates`, `firstItemIndex`, startup trace expansion, terminal/media/short-drama modules.
Acceptance:
- Overlay renders only for an active-session-matching snapshot.
- Overlay releases after real target content is rendered outside the overlay, or after an explicit bounded timeout.
- Overlay DOM is ignored by visible-turn measurement and imperative navigation target lookup.
- Actual session data and `virtualItems` are not mutated or replaced by overlay data.
Result: Added a session-scoped, read-only `VirtualMessageList` handoff overlay that renders the 130F1 bottom-tail snapshot as a scroller sibling, releases after the real target turn is present or after a bounded timeout, and leaves store/session data unchanged. No `FlowChatStore`, restore API, deferred hydration, `heightEstimates`, `firstItemIndex`, startup trace, terminal, AI media, or AI short-drama code was changed.

### ISSUE-130G Flow Chat Deferred Full History Hydration Inventory

Priority: P2
Status: Done
Goal: Evaluate upstream partial-history/deferred-full-hydration store behavior before any store changes.
Allowed files: docs and read-only comparisons of current/upstream `FlowChatStore.ts`.
Forbidden files: production code changes until a later implementation issue is approved.
Acceptance:
- Documents current Void `SessionHistoryState` and restore semantics.
- Identifies whether backend/adapter changes are required.
- Splits any implementation into separate store/API/test issues.
Split note: 130F Risk/Architecture-Agent found that projection overlay safety depends on partial/deferred full-history store semantics. `ISSUE-130G1` is the next proposed contract slice before any 130F2 UI overlay.
Result: Completed through `ISSUE-130G1` and `ISSUE-130G2`. Flow Chat now has explicit frontend partial-history fields (`isPartial`, `loadedTurnCount`, `totalTurnCount`), maps partial `restoreSessionView` responses through `FlowChatStore`, and schedules one store-local full-history follow-up that reuses existing restore capability and applies only through the active-session-guarded projection entry point. This parent closure does not change `AgentAPI.restoreSessionView` request shape, backend Tauri/Rust restore commands, virtual-list UI, terminal, media, short-drama, or subagent behavior.

### ISSUE-130G1 Flow Chat Deferred History Projection Store Contract

Priority: P1
Status: Done
Goal: Define and test the minimum store/API-facing state model for partial historical restore and deferred full-history projection before UI overlay work.
Allowed files: Flow Chat store tests and pure state helpers if accepted; docs.
Forbidden files: `VirtualMessageList.tsx`, projection overlay UI, terminal/media/short-drama modules, broad backend API rewrites without a separate adapter decision.
Acceptance:
- Store tests prove a partial historical restore has explicit `historyState`, `isPartial`, loaded count, and total count semantics instead of overloading empty arrays.
- Deferred full-history completion is session-scoped and cannot overwrite the active session after a session switch.
- Any required `AgentAPI.restoreSessionView` contract gaps are documented before implementation.
- No overlay UI or virtual-list handoff rendering is introduced.
Result: Added optional partial-history fields to `Session` and `RestoreSessionViewResponse`, mapped `restoreSessionView` partial responses through `FlowChatStore.loadSessionHistory`, and added a guarded `applyDeferredSessionHistoryProjection` store entry point that no-ops after active-session changes. No `VirtualMessageList`, overlay UI, backend invoke request, terminal, AI media, or AI short-drama code was changed.

### ISSUE-130G2 Flow Chat Deferred Full-History Hydration Scheduling

Priority: P1
Status: Done
Goal: Start a bounded frontend full-history hydration follow-up after a partial `restoreSessionView` response, using the existing restore API and guarded store projection entry point.
Allowed files: `src/web-ui/src/flow_chat/store/FlowChatStore.ts`, `src/web-ui/src/flow_chat/store/FlowChatStore.test.ts`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`, `docs/ISSUES.md`.
Forbidden files: `VirtualMessageList.tsx`, `VirtualMessageList.scss`, `modernFlowChatStore.ts`, backend Tauri/Rust restore commands, `AgentAPI.restoreSessionView` request shape, terminal/media/short-drama/subagent modules, startup trace expansion beyond existing marks.
Acceptance:
- A partial `restoreSessionView` response stores explicit partial state and schedules exactly one full-history follow-up for that session.
- The follow-up reuses existing full restore capability and applies through `applyDeferredSessionHistoryProjection`.
- If the active session changes before the follow-up completes, the projection does not overwrite the new active session or mutate the stale partial session into full state.
- Complete/non-partial restores, ACP sessions, unsupported view-restore fallbacks, and legacy restore paths do not start a duplicate deferred follow-up.
- The scheduler is testable without timers that make tests flaky; no UI component infers hydration state from empty arrays.
Result: Added a `FlowChatStore`-local in-flight scheduler that starts one `restoreSessionWithTurns` follow-up after partial `restoreSessionView`, applies results only through `applyDeferredSessionHistoryProjection`, and preserves stale partial state when the active session changes before completion. No UI, backend command, `AgentAPI` request shape, terminal, AI media, AI short-drama, or subagent code was changed.

### ISSUE-130H Flow Chat Terminal Output Preview Budget

Priority: P2
Status: Done
Goal: Evaluate/adapt upstream long terminal output preview clipping without changing terminal core/service behavior.
Allowed files: `TerminalToolCard.tsx`, terminal preview state/pure helpers, focused tests, docs.
Forbidden files: terminal backend/core, `FlowChatStore.ts`, `VirtualMessageList.tsx`, AI media/short-drama modules.
Acceptance:
- Live/final terminal output previews have explicit row/character budgets.
- Full output remains available in the terminal panel/replay path.
- ACP permission actions and terminal replay contracts do not regress.
Result: Added `terminalOutputPreview.ts` pure helper and focused tests, then wired `TerminalToolCard` to pass bounded live/final preview content into `LazyTerminalOutputRenderer`. The existing open-in-terminal-panel path, terminal replay/core, ACP permission actions, FlowChatStore, VirtualMessageList, AI media, and AI short-drama modules were not changed.

### ISSUE-130I Code Preview Long Streaming Performance

Priority: P2
Status: Done
Goal: Inventory and then adapt upstream CodePreview long-streaming performance harness and viewport-tail rendering if compatible with Void.
Allowed files: CodePreview component/tests/harness files only after an inventory confirms local file paths.
Forbidden files: Flow Chat store/session state, AI media/short-drama modules, terminal core.
Acceptance:
- RED test proves long streaming code currently renders or scroll-writes too much.
- GREEN behavior limits rendered tail/window without losing final complete code.
- Perf harness uses Void naming and contains no upstream product identity.
Result: Added `CodePreview.test.tsx`, adapted streaming CodePreview from fixed 60-line tail rendering to viewport-aware tail rendering with a 6,000-character cap, and added `codePreviewPerfHarness.tsx` with `void-code-preview-perf-probe` naming. No Flow Chat store/session, terminal, AI media, AI short-drama, Markdown, or tool-result schema code was changed.

### ISSUE-999 Split Parent Closeout Audit

Priority: P1
Status: Done
Goal: Reconcile remaining Split parents after accepted sub-issues are implemented, so the migration inventory does not imply hidden unimplemented low-risk work.
Allowed files: consensus docs only: `docs/PRD.md`, `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Web UI, Rust core, desktop/Tauri, terminal, media, short-drama, provider, workflow, script, Cargo, package, or generated source files.
Affected module: upstream migration governance.
Preserved contracts: no product behavior, runtime state, API shape, release workflow, crate layout, render hot path, Computer Use DTO boundary, brand identity, media, short-drama, multi-agent, subagent, terminal, or desktop behavior changes.
Closeout:
- `ISSUE-020D` remains Split: `020D1` and `020D2` implemented safe default-off render profiling for CodePreview and FlowTextBlock. Markdown renderer internals, syntax-highlighter internals, and ModelRoundItem profiling remain deferred until real browser startup/render smoke is available.
- `ISSUE-060I` remains Split: `060I1` implemented an artifact-only manual CLI workflow. GitHub Release upload and Homebrew tap dispatch remain deferred until repository owners explicitly confirm release policy and tap ownership.
- `ISSUE-122B` remains Split: `122B1` added static guardrails for the current Computer Use host seam and `describe_screen` readonly contract. Full upstream DTO extraction remains deferred behind a separate architecture decision.
- `ISSUE-900` remains Split: `900A` hardened runtime boundary checks for the current Void crate layout. Upstream-style crate reorganization remains deferred because it conflicts with current product runtime, multi-agent, terminal, Computer Use, media, and short-drama ownership.
Verification: issue-status scan, Split/Rejected rationale scan, docs diff check, trailing-whitespace scan, and consensus-doc cross-reference checks.
Result: Completed a docs-only parent closeout. No runtime code, workflow, script, or generated files were changed.

### ISSUE-999A Final Verification Test Snapshot Reconciliation

Priority: P1
Status: Done
Goal: Fix stale test snapshots found during final closeout verification without changing runtime behavior.
Allowed files: `src/crates/core/src/agentic/tools/registry.rs` test expectations, `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.test.ts`, consensus docs.
Forbidden files: tool registry runtime assembly, tool implementations, Flow Chat runtime components/store/API, media, short-drama, terminal, desktop, provider adapters, scripts, workflows, Cargo/package metadata.
Affected modules: core agent tool registry tests; Flow Chat virtual list boundary tests.
Preserved contracts: `AnalyzeImage` and `ShortDramaProject` remain explicit existing tool-manifest entries; Flow Chat initial history rendering still forbids `heightEstimates`/`firstItemIndex` while allowing the already-completed `ISSUE-130F` handoff overlay.
Verification: `cargo test -p void-core --lib`; `pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/virtualMessageListLayout.test.ts`; `pnpm --dir src/web-ui run test:run`; `git diff --check`.
Result: Updated test expectations only. No runtime registry logic, Flow Chat component code, store, API, media, short-drama, terminal, desktop, provider adapter, script, workflow, Cargo, or package behavior was changed.

## P3 - High-Risk or Deferred

### ISSUE-900 Runtime Crate Layout Reorganization

Priority: P3
Status: Split
Reason: High conflict with current flat crate layout and local product runtime.
Split note: Full upstream-style runtime crate reorganization remains deferred. `ISSUE-900A` accepts only a boundary inventory and checker-hardening slice that preserves the current crate layout.

### ISSUE-900A Runtime Crate Boundary Inventory and Checker Hardening

Priority: P3
Status: Done
Goal: Convert the upstream crate-layout migration pressure into explicit checks for the current Void runtime crate boundaries.
Allowed files: `scripts/check-core-boundaries.mjs`, consensus docs.
Forbidden files: `Cargo.toml`, `Cargo.lock`, Rust production code, Web UI, desktop, terminal, provider adapters, tool runtime, crate directory moves, crate renames.
Affected module: Rust workspace architecture governance.
Preserved contracts: current crate graph and flat local runtime layout remain authoritative; boundary enforcement is static and does not move code.
Acceptance:
- Existing core-boundary check still passes.
- Self-test covers slash-containing content anchors and runtime port/remote host contract anchors.
- Cargo metadata still resolves the current workspace without manifest edits.
Result: Hardened `scripts/check-core-boundaries.mjs` so self-test coverage matches current runtime boundaries, including dialog preempt policy usage, remote runtime host adapters, remote command handler traits, and initial-sync anchors. No Cargo manifests, Rust source files, crate directories, UI, desktop, terminal, provider, or tool-runtime files were changed.

### ISSUE-901 Installer and Brand Upstream Changes

Priority: Rejected
Status: Rejected
Reason: Would overwrite Void identity and installer contracts.

### ISSUE-902 Whole Flow Chat Replacement

Priority: Rejected
Status: Rejected
Reason: Would risk local session restore, multi-agent, media, and short-drama behavior.

## 2026-07-03 Selective Upgrade Wave

### ISSUE-1100 Upstream Incremental Inventory Refresh

Priority: P0
Status: Done
Goal: Refresh the upstream candidate inventory from `upstream-bitfun/main@ac16dcc18`, classify every recent capability in the user-approved priority list, and confirm what is already synchronized locally.
Allowed files: consensus docs only.
Forbidden files: production Web UI, Rust, desktop, terminal, media, short-drama, scripts except documentation references.
Affected module: upstream migration governance.
Acceptance:
- Current upstream head and theme-governance commit are recorded.
- Each candidate family has one of: synced, partially synced, planned, deferred, or rejected.
- No code is changed in this inventory issue.
Result:
- Upstream reference refreshed to `upstream-bitfun/main@ac16dcc18`.
- Latest theme-governance commit in this wave is `082cee447`.
- Candidate families were classified without production code changes:
  - Flow Chat history/navigation: partially synced through `ISSUE-130*`; `ISSUE-1110` audits remaining upstream delta.
  - Terminal replay/input: partially synced; `ISSUE-1120` audits replay/input/runtime-port separation.
  - Computer Use Windows: partially synced; `ISSUE-1130` audits WGC/D3D11/pointer/HWND fixes.
  - Image understanding/context: partially synced; `ISSUE-1140` audits `AnalyzeImage`, BTW image context, and media/short-drama image flows.
  - MCP/tool runtime: partially synced; `ISSUE-1150` audits timeout, readonly manifest, and output-contract gaps.
  - Theme/token governance: planned; `ISSUE-1160` adapts upstream near-color/token governance.
  - Provider/service boundary: planned study; `ISSUE-1170` maps one safe boundary improvement or defers.
  - Core crate decomposition: deferred; `ISSUE-1180` records architecture guidance only.
  - BitFun brand/installer/release identity: rejected by existing `ISSUE-901`.

### ISSUE-1110 Flow Chat History Navigation Delta Audit

Priority: P0
Status: Done
Goal: Compare recent upstream Flow Chat history/navigation fixes, especially `502270994`, against the current completed `ISSUE-130*` slices and identify any remaining low-risk gaps.
Allowed files: Flow Chat tests/docs first; implementation only after audit.
Forbidden files: wholesale `FlowChatStore.ts`, `VirtualMessageList.tsx`, or container replacement; AI media, short-drama, terminal, and subagent internals.
Acceptance:
- Remaining gaps are listed with file-level scope.
- Existing multi-agent, BTW, floating chat, AI media, and short-drama projections are protected by tests or explicit manual checks.
- Any implementation is split into a follow-up issue.
Risk notes: Highest risk is duplicating or weakening completed `ISSUE-130*` history/viewport behavior; audit must classify covered work before proposing code.
Result:
- Reviewed upstream `502270994 fix(flow-chat): stabilize history turn navigation`.
- Confirmed current Void only partially covers the upstream behavior through earlier `ISSUE-130*` work.
- Covered locally: explicit `SessionHistoryState`, history placeholders, base header turn navigation, session-keyed virtual-list remount, initial historical window helpers, partial-history store fields, deferred full-history scheduling, and existing initial-history/window tests.
- Missing or not proven locally:
  - Header turn pin RAF retry until `visibleTurnInfo.turnId` matches the requested turn.
  - User scroll intent cancelling pending header turn retry.
  - Static initial-history `pinTurnToTop` expansion/pin path for omitted targets.
  - Tail spacer/effective-bottom behavior after pinning older turns.
  - Release-level long-session turn-navigation E2E equivalent to upstream `l1-chat-turn-navigation-release.spec.ts`.
- Split follow-up implementation/testing work into `ISSUE-1110A`, `ISSUE-1110B`, and `ISSUE-1110C`.

### ISSUE-1110A Flow Chat Header Turn Pin Retry and User-Cancel Contract

Priority: P0
Status: Done
Goal: Adapt the low-risk container/virtual-list contract from upstream `502270994` so header turn selection retries until the real viewport reports the target turn, and manual user scroll cancels pending retry.
Allowed files: `src/web-ui/src/flow_chat/components/modern/ModernFlowChatContainer.tsx`, `src/web-ui/src/flow_chat/components/modern/ModernFlowChatContainer.history-state.test.tsx`, minimal `VirtualMessageList` prop surface if needed, docs.
Forbidden files: `FlowChatStore.ts`, backend/session APIs, AI media, AI short-drama, terminal, provider, Rust crates, whole-file replacement.
Acceptance:
- Header current turn remains derived from `visibleTurnInfo`, not optimistic pending state.
- `pinTurnToTop` accepted state continues retrying through RAF until `visibleTurnInfo.turnId` matches the target or bounded retry expires.
- A user scroll intent from `VirtualMessageList` clears queued/pending header turn pin state.
- Tests cover accepted-but-not-visible, retry-until-visible, and user-scroll-cancel cases.
Risk notes: The contract crosses container state and viewport callbacks; UI must not infer turn visibility from overlay DOM or transcript text.
Result: Completed by keeping header display derived from `visibleTurnInfo`, adding a bounded RAF retry loop for accepted header turn pins, retrying subsequent frames with `behavior: 'auto'`, and introducing `VirtualMessageList.onUserScrollIntent` so manual scroll intent clears pending header retry. Focused container tests cover accepted-but-not-visible, retry-until-visible, and user-scroll-cancel behavior.

### ISSUE-1110B Static Initial-History Turn Pin and Tail Spacer

Priority: P1
Status: Done
Goal: Adapt upstream static initial-history window fixes so omitted older targets can be expanded and pinned, while latest content remains reachable through a tail spacer/effective-bottom contract.
Allowed files: `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.tsx`, `src/web-ui/src/flow_chat/components/modern/virtualMessageListLayout.ts`, focused tests, docs.
Forbidden files: `FlowChatStore.ts`, `ModernFlowChatContainer.tsx` except if `1110A` requires a prop contract, backend/session APIs, AI media, AI short-drama, terminal, provider.
Acceptance:
- Static initial-history `pinTurnToTop` can request omitted targets without treating the sliced local index as the full-session index.
- Tail spacer or equivalent effective-bottom logic keeps latest content reachable after pinning older turns.
- Footer/input/collapse changes do not force the viewport back to bottom after user scroll or explicit turn pin.
- Tests cover omitted target expansion, tail reachability, and user-left-bottom preservation.
Risk notes: This is higher risk than `1110A` because it touches scroll geometry and static window behavior. It must not be bundled with store/API changes.
Result: Completed through `ISSUE-1110B1` and `ISSUE-1110B2`. Static omitted-turn pins now use an anchored target window with a tail spacer so latest remains reachable; explicit latest/navigation reveal paths clear stale anchors; static initial-history auto-bottom now uses effective bottom and preserves user-left-bottom state across item-count/layout changes. Release-level viewport evidence remains tracked separately in `ISSUE-1110C`.

### ISSUE-1110B1 Static Initial-History Omitted Pin Tail Spacer

Priority: P1
Status: Done
Goal: Keep latest content reachable after `pinTurnToTop` targets an omitted older turn in the static initial-history window.
Allowed files: `VirtualMessageList.tsx`, `virtualMessageListLayout.ts`, `VirtualMessageList.initial-history-window.test.tsx`, `virtualMessageListLayout.test.ts`, docs.
Forbidden files: `FlowChatStore.ts`, `ModernFlowChatContainer.tsx`, backend/session APIs, AI media, AI short-drama, terminal, provider, Rust crates.
Acceptance:
- `InitialHistoryRenderWindow` exposes `trailingOmittedEstimatedHeightPx`.
- A static-window `pinTurnToTop` for an omitted older turn renders an anchored target window instead of expanding the whole transcript.
- A tail spacer is rendered after the anchored target window so latest content remains reachable.
- The latest action clears the static anchor and returns to the default latest-tail window.
Result: Completed with focused tests covering anchored omitted pin, tail spacer rendering, latest-action recovery, and layout helper defaults.

### ISSUE-1110B2 Static Initial-History Effective-Bottom and User-Left-Bottom Guard

Priority: P1
Status: Done
Goal: Adapt the remaining upstream guard so static initial-history bottom management does not force the viewport back to bottom after user scroll, explicit pin, footer/input changes, or collapse compensation.
Allowed files: `VirtualMessageList.tsx`, focused static-window/session-boundary tests, docs.
Forbidden files: `FlowChatStore.ts`, backend/session APIs, AI media, AI short-drama, terminal, provider, Rust crates.
Acceptance:
- Static initial-history auto-bottom logic uses effective bottom, including footer/bottom reservations.
- User-left-bottom intent prevents background updates or footer/collapse changes from dragging the viewport back to bottom.
- Tests cover user-left-bottom preservation and explicit pin not being overridden by the initial bottom guard.
Result: Completed for the current static-window contract. The static scroller records whether the user has left effective bottom, auto-bottom uses `scrollHeight - clientHeight - bottomReservation`, and later item/layout key changes skip auto-bottom while user-left-bottom is active. Focused tests cover user-left-bottom preservation after item-count changes plus B1 explicit pin/anchor behavior. More detailed footer/collapse compensation edge cases can be expanded if future regressions appear.

### ISSUE-1110C Release Long-Session Turn Navigation E2E

Priority: P1
Status: Done
Goal: Recreate a Void-owned release-level regression for long-session header turn navigation, based on upstream `l1-chat-turn-navigation-release.spec.ts` but with Void naming, fixtures, and protected feature checks.
Allowed files: `tests/e2e/specs/*`, E2E helpers/fixtures if required, docs.
Forbidden files: production Flow Chat source, session store/runtime code, AI media/short-drama source, terminal, provider, Rust crates.
Acceptance:
- The E2E opens a persisted long-session fixture, selects an older turn from the header list, and asserts the real message scroller moves the target turn near the viewport top.
- The test avoids upstream BitFun naming and uses Void fixture/session identifiers.
- The test records skip/precondition behavior when the release fixture workspace is unavailable.
Risk notes: This test needs real browser/desktop evidence; jsdom unit tests cannot prove release viewport geometry.
Result: Added `tests/e2e/specs/l1-chat-turn-navigation-release.spec.ts` as a Void-owned release-compatible WDIO regression. The spec opens `E2E_TEST_WORKSPACE`, locates a session by `VOID_E2E_TURN_NAV_SESSION_TITLE`, reveals/selects `VOID_E2E_TURN_NAV_TARGET_TITLE` from the Flow Chat header turn list, and asserts the real message viewport pins the target user turn near the scroller top using DOM geometry. It avoids BitFun env names and skips explicitly when the fixture env is unavailable. It is intentionally not added to the default L1 aggregate because CI/local runs without the long-session fixture would only skip.

### ISSUE-1110D FlowChat History Session Open Intent Contract

Priority: P1
Status: Done
Goal: Add a FlowChat service-layer contract for historical session open diagnostics so pages/sidebar/header do not infer history state from empty session lists or raw store shape.
Allowed files: `src/web-ui/src/flow_chat/services/sessionOpenIntent.ts`, `src/web-ui/src/flow_chat/services/sessionOpenIntent.test.ts`, docs.
Forbidden files: `chat-screen.tsx`, sidebar/header components, `ModernFlowChatContainer.tsx`, `FlowChatStore.ts`, backend restore APIs, AI media, AI short-drama, terminal, Computer Use, provider, Rust crates.
Acceptance:
- Missing sessions, new empty runtime sessions, metadata-only history, in-flight history, failed history, missing workspace scope, partial history, and pending context restore are represented by explicit `status/source/action/error`.
- The helper accepts a single session or explicit missing selection; it does not inspect `sessions: []` or mutate store state.
- UI/entrypoint integration is deferred; future callers must consume this helper as the conversion layer instead of adding raw history/session-source inference in pages/sidebar/header.
- Focused tests cover the contract and `pnpm --dir src/web-ui run type-check` passes.
Result:
- Added `resolveSessionOpenIntent` as a pure FlowChat service helper returning explicit `status`, `source`, `action`, `error`, history state, context-restore state, and turn-count facts.
- Added focused tests for missing selection, new runtime empty session, metadata-only load request, in-flight load, history failure, workspace-missing unsupported state, partial history, and pending backend context restore.
- Did not wire UI, sidebar, header, FlowChat store, backend APIs, media, short-drama, terminal, Computer Use, provider, or Rust code in this slice.

### ISSUE-1110E FlowChat History Placeholder Intent Integration

Priority: P1
Status: Done
Goal: Use the `SessionOpenIntent` helper as the Flow Chat container conversion layer for history placeholder decisions without moving history business logic into page/sidebar/header components.
Allowed files: `src/web-ui/src/flow_chat/components/modern/ModernFlowChatContainer.tsx`, `src/web-ui/src/flow_chat/components/modern/ModernFlowChatContainer.history-state.test.tsx`, docs.
Forbidden files: `FlowChatStore.ts`, sidebar/header components, `chat-screen.tsx`, backend restore APIs, AI media, AI short-drama, terminal, Computer Use, provider, Rust crates.
Acceptance:
- `ModernFlowChatContainer` consumes `resolveSessionOpenIntent` for history placeholder decisions instead of directly branching on raw `historyState`.
- Existing metadata-only, hydrating, failed, and new-session placeholder behavior remains intact.
- Unsupported history scope from the helper maps to an error/retry placeholder rather than the new-session welcome.
- No store, backend API, sidebar/header, media, short-drama, terminal, Computer Use, provider, or Rust behavior changes.
Result:
- `ModernFlowChatContainer` now derives history placeholder visibility and placeholder state from `SessionOpenIntent`.
- Added a component test proving unsupported metadata-only history scope renders the history error placeholder and does not fall through to the welcome panel.
- Preserved existing history placeholder tests plus helper contract tests.

### ISSUE-1110F Session Nav List State Contract

Priority: P1
Status: Done
Goal: Give the session navigation list a pure state contract for empty/loading/ready/expand affordance so the nav component does not infer meaning from raw counts and metadata pagination flags inline.
Allowed files: `src/web-ui/src/app/components/NavPanel/sections/sessions/sessionNavSelection.ts`, `src/web-ui/src/app/components/NavPanel/sections/sessions/sessionNavSelection.test.ts`, `src/web-ui/src/app/components/NavPanel/sections/sessions/SessionsSection.tsx`, docs.
Forbidden files: `FlowChatStore.ts`, session API/load behavior, session open/switch behavior, sidebar/header outside SessionsSection, Flow Chat container, backend restore APIs, AI media, AI short-drama, terminal, Computer Use, provider, Rust crates.
Acceptance:
- Empty local list, metadata loading, ready local list, and metadata-page pagination are represented by explicit `status/source/action/showExpandToggle`.
- `SessionsSection` consumes the helper output for loading/empty and expand-toggle rendering while preserving current row rendering and metadata fetch behavior.
- Focused tests cover the helper contract and existing SessionsSection layout/automation smoke tests still pass.
Result:
- Added `resolveSessionNavListState` beside `isSessionNavRowActive`.
- `SessionsSection` now consumes the helper for list status and expand-toggle decisions.
- Did not change FlowChat store, metadata page loading, session switching, row active selection, archive/delete/rename behavior, or any protected media/short-drama/terminal/Computer Use/provider code.

### ISSUE-1120 Terminal Replay and Input Reliability Delta Audit

Priority: P0
Status: Done
Goal: Compare upstream terminal reliability and runtime-port work with current terminal replay buffering and decide the next safe terminal slice.
Allowed files: terminal service/core tests and docs first.
Forbidden files: upstream `src/crates/services/terminal` bulk migration, Flow Chat store changes, Computer Use policy changes.
Acceptance:
- Current flat and structured replay contracts are documented.
- Input reliability, paste policy, renderer lazy-load, and runtime-port work are separated.
- Follow-up implementation issue has one owner and one test surface.
Risk notes: Terminal replay facts must not move into Flow Chat preview code, and desktop DTO changes must not hide PTY/session errors.
Result:
- Refreshed `upstream-bitfun/main` to `65da1a082` and reviewed terminal-related upstream work.
- Confirmed local Void already has the main low-risk terminal reliability slices from upstream June work: structured terminal replay events, legacy flat replay fallback, resize repaint guard, terminal paste policy, PowerShell PSReadLine Ctrl+V delegation, terminal input write queue, and lazy terminal output renderer coverage.
- Separated upstream runtime-port/service-decomposition commits (`4077c1a8a`, `98f0f4113`, `bceded210`) from direct implementation. Those commits move exec/terminal ownership across runtime-port crates and are not safe to copy into current Void as part of terminal reliability.
- Identified the remaining safe follow-up as contract hardening, not bulk migration: document and test terminal API error/result shape around local vs remote write/resize/session-not-found paths, then consider stable test selectors or explicit DTOs in a narrow slice.
- Did not change terminal production code, Flow Chat, Computer Use, AI media, AI short-drama, provider, or Rust crate layout.

### ISSUE-1120A Terminal API Result Shape and Error Source Contract

Priority: P0
Status: Done
Goal: Harden the current terminal local/remote API contract so write/resize/history/session failures expose explicit `status/source/error` semantics at the module boundary without adopting upstream runtime-port migration.
Allowed files: terminal API tests/helpers, `src/apps/desktop/src/api/terminal_api.rs` only if an explicit DTO is accepted, focused Web terminal service tests, docs.
Forbidden files: Flow Chat previews/tool cards, AI media, AI short-drama, Computer Use, provider, upstream `runtime-ports` crate movement, terminal crate directory migration.
Acceptance:
- Local session-not-found and remote-manager-unavailable cases are represented by explicit source/error categories or are documented as deferred with a failing/proposed test.
- Web UI terminal input queue remains the only frontend write batching layer.
- Tests target the terminal API/service boundary, not `xterm.js` internals.
Risk notes: Avoid converting every Tauri command at once; a partial DTO must not break existing callers that expect `Result<(), String>`.
Result:
- Added `TerminalCommandError` and `classifyTerminalCommandError` at the Web `TerminalService` boundary.
- `write`, `resize`, and `getHistory` now rethrow readable `Error` instances carrying `status`, `operation`, `source`, `code`, and `rawMessage`.
- Covered local session-not-found, remote terminal manager unavailable, terminal API initialization failure, and generic operation failure classifications.
- Preserved `TerminalInputQueue` as the only frontend write batching layer; it continues to receive/retry Promise failures without knowing API source or status.
- Deferred backend Tauri DTO conversion because changing `Result<(), String>` command contracts would affect broader desktop callers.
- Did not change terminal UI components, Flow Chat, AI media, AI short-drama, Computer Use, provider, Rust terminal crates, or runtime-port ownership.

### ISSUE-1120B Terminal Runtime-Port Boundary Study

Priority: P2
Status: Done
Goal: Study upstream terminal/exec runtime-port commits and decide whether one small boundary checker or adapter seam can be added without moving crates or changing runtime behavior.
Allowed files: docs and static boundary checks first.
Forbidden files: Cargo crate moves, `src/crates/services/terminal` bulk migration, exec-command implementation rewrite, remote SSH rewrite, Flow Chat or terminal UI behavior changes.
Acceptance:
- Current owner chain for terminal exec/write/resize is mapped.
- One optional static rule or adapter seam is proposed, or the runtime-port migration is explicitly deferred.
- No runtime behavior is changed without a follow-up implementation issue.
Risk notes: Upstream runtime-port work is architecture-scale and crosses CLI, desktop, server, core assembly, tool runtime, remote SSH, and terminal service ownership.
Result:
- Added a focused terminal runtime boundary guard to `scripts/check-core-boundaries.mjs`.
- Mapped the current owner chain as Web terminal UI/service -> desktop `terminal_api.rs` DTO adapter -> `terminal-core` `TerminalApi`/`SessionManager`/session replay owner, with remote terminal history still explicit and unsupported until a separate remote replay issue.
- Guarded `terminal_api.rs` from owning `SessionManager`, replay history structs, or PTY internals.
- Guarded Flow Chat from owning `TerminalReplayEvent`, `TerminalReplayHistory`, or `SessionManager` facts.
- Deferred any real `TerminalRuntimePort` trait, `src/crates/services/terminal` migration, remote SSH rewrite, or terminal UI behavior change to separate issues.

### ISSUE-1120C Web Terminal Input and Lazy Renderer Delta

Priority: P1
Status: Done
Goal: Compare the remaining upstream Web terminal input/lazy-renderer deltas against current Void and implement only missing isolated fixes.
Allowed files: `src/web-ui/src/tools/terminal/components/Terminal.tsx`, `ConnectedTerminal.tsx`, `LazyTerminalOutputRenderer.tsx`, terminal utility tests, docs.
Forbidden files: Flow Chat store/tool-card ownership changes, RichTextInput unrelated polish, agent companion unread behavior, AI media, AI short-drama, Computer Use, Rust terminal crates, runtime-port migration.
Acceptance:
- IME/key rollover behavior from upstream `b8197bbb7` is classified as present, missing, or intentionally deferred with a focused test.
- `LazyTerminalOutputRenderer` `forwardRef`/fallback differences from upstream `970c33844` are classified and, if missing, patched without changing terminal output semantics.
- Existing `TerminalInputQueue`, paste policy, replay, and resize guard tests still pass.
Risk notes: Do not fold upstream companion unread or rich text scrollbar changes into this terminal issue; they are adjacent UI polish, not terminal replay/input reliability.

Result:
- Implemented the missing upstream `b8197bbb7` IME/key rollover safety net in the Web terminal input layer. `Terminal.tsx` now bypasses xterm key handling for `keydown` events with `keyCode === 229` and forwards composed `insertText` data from the helper textarea through a terminal utility.
- Kept existing `TerminalInputQueue`, PowerShell paste delegation, paste policy, replay normalization, and resize repaint guard unchanged.
- Classified the upstream `970c33844` lazy renderer `forwardRef` difference as intentionally deferred: current Void call sites use the renderer as read-only terminal output presentation and do not require an external imperative ref. The existing fallback behavior remains covered.
- Excluded companion unread behavior, RichTextInput scrollbar polish, Flow Chat tool-card ownership changes, runtime-port migration, Rust terminal crates, AI media, and AI short-drama.
- Verification: `pnpm --dir src/web-ui run test:run src/tools/terminal/utils/terminalImeInputSafetyNet.test.ts src/tools/terminal/utils/TerminalInputQueue.test.ts src/tools/terminal/components/LazyTerminalOutputRenderer.test.tsx src/tools/terminal/utils/terminalPaste.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/resizeRepaintGuard.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts` passed with 7 files / 33 tests. `pnpm --dir src/web-ui run type-check` passed.

### ISSUE-1120D Terminal Lifecycle, Ack, and History Integration Tests

Priority: P1
Status: Done
Goal: Add focused tests for the current terminal lifecycle and history pipeline gaps without changing runtime-port ownership.
Allowed files: `src/crates/terminal/src/**` tests, `src/apps/desktop/src/api/terminal_api.rs` tests/helpers if available, `src/web-ui/src/tools/terminal/services/*`, `src/web-ui/src/tools/terminal/hooks/*`, focused E2E terminal spec, docs.
Forbidden files: Flow Chat store/tool cards, multi-agent/subagent projection, AI media, AI short-drama, Computer Use, provider, runtime-port crate migration.
Acceptance:
- Natural PTY exit from shell EOF/child completion is covered or explicitly documented as unsupported with a failing/proposed test.
- Frontend output consumption either calls `TerminalService.acknowledge` or flow-control ack remains explicitly deferred with test evidence.
- Remote `terminal_get_history` empty-event behavior is documented and tested as an explicit remote status/source, not confused with local empty history.
- One integration-style test covers backend history events through frontend replay queue semantics where practical.
Risk notes: This issue is about observability and contract tests first; do not redesign PTY process management or remote terminal history in the same diff.

Progress:
- Added frontend hook-level integration coverage in `src/web-ui/src/tools/terminal/hooks/useTerminal.test.tsx` for structured `history.events` replay before live output queued during replay. This locks the current `getHistory -> onSessionEvent -> drainPendingSessionEvents -> normalizeTerminalReplay -> finishReplay` ordering without touching Flow Chat, tool cards, xterm rendering, runtime ports, or backend PTY management.
- Added backend PTY process coverage in `src/crates/terminal/src/pty/process.rs` for natural child completion emitting `PtyEvent::Exit { exit_code }`. The fix stays inside the existing command task/read-thread boundary and does not change session manager, desktop API, runtime-port, Flow Chat, or remote terminal history ownership.
- Confirmed `TerminalService.acknowledge()` is now called by the Web terminal hook after live output is delivered to the consumer. Backend flow-control ack is no longer deferred for the frontend consumption path.
- Added desktop/Web terminal history contract hardening: local empty history now reports `historyStatus: "ready"` and `historySource: "local"`, while remote unsupported history reports `historyStatus: "unsupported"`, `historySource: "remote"`, `errorCode: "remote_history_unsupported"`, and an explanatory `error`. `useTerminal` treats remote unsupported history as empty replay without breaking live events.
- Remote `historyStatus: "error"` is not claimed in this slice; local `get_history` failures still use the existing command error path.
- Verification so far: `cargo test -p terminal-core` passed with 28 tests. `rustfmt --edition 2021 --check src/crates/terminal/src/pty/process.rs` passed. `cargo test -p void-desktop terminal_api::tests -- --nocapture` passed with 2 tests. `rustfmt --edition 2021 --check src/apps/desktop/src/api/terminal_api.rs` passed. `pnpm --dir src/web-ui run test:run src/tools/terminal/hooks/useTerminal.test.tsx src/tools/terminal/services/TerminalService.test.ts src/tools/terminal/utils/terminalReplay.test.ts src/tools/terminal/utils/terminalReplayEventQueue.test.ts` now passes with 4 files / 19 tests, including live/pending output ack, history replay no-ack, ack failure, and replay handoff duplicate-event guard coverage. `pnpm --dir src/web-ui run type-check` passed.

### ISSUE-1120D1 Terminal Frontend Output Ack Integration

Priority: P1
Status: Done
Goal: Connect Web terminal live-output consumption to `TerminalService.acknowledge()` without changing terminal core, desktop API, xterm UI, or replay semantics.
Allowed files: `src/web-ui/src/tools/terminal/hooks/useTerminal.ts`, `src/web-ui/src/tools/terminal/hooks/useTerminal.test.tsx`, docs.
Forbidden files: terminal Rust core, Tauri terminal API, xterm component rendering, Flow Chat, AI media, AI short-drama, Computer Use, provider, runtime-port crate migration.
Acceptance:
- Live terminal output is acknowledged after the hook delivers it to the consumer.
- Pending live output drained during replay handoff is acknowledged after delivery.
- Replayed history output is not acknowledged as live consumption.
- Ack failures are logged without blocking terminal output rendering.
Result:
- `useTerminal` now calls `TerminalService.acknowledge(sessionId, data.length)` after delivering non-empty live output.
- Added hook tests for direct live output ack, pending-live ack, unsupported-history live ack, history-only no-ack, and ack failure not blocking delivered output.
- Added replay queue duplicate-event guard coverage so the same live event object cannot be flushed twice during the subscribe/drain handoff.
- Kept `TerminalService` as the backend ack adapter and kept xterm UI components unaware of flow-control details.

### ISSUE-1130 Computer Use Windows WGC and HWND Safety Audit

Priority: P0
Status: Done
Goal: Isolate upstream Windows Computer Use fixes for WGC D3D11 arguments, pointer coordinate types, and dropping HWND before await.
Allowed files: Windows desktop adapter tests/docs first; implementation only as platform-specific follow-up.
Forbidden files: core schema expansion, Web UI, terminal, macOS adapters, unrelated Computer Use DTO extraction.
Acceptance:
- Each Windows fix is mapped to current local file ownership or marked absent.
- Compile/test strategy is documented for Windows-specific code.
- Unsupported or untestable behavior is not claimed as fixed.
Risk notes: Windows API unsafe and async handle-lifetime changes require platform-specific proof; non-Windows checks are insufficient for release claims.
Result:
- Reviewed upstream Computer Use platform work from `acf0cdb03` and `63a7b8160`, with focus on Windows capture/input ownership.
- Confirmed local Windows capture had `screenshot_window_via_wgc` as a stub in `src/apps/desktop/src/computer_use/windows_capture.rs` during the audit; upstream adds a real `windows_wgc_capture.rs` implementation using D3D11, WinRT `GraphicsCaptureItem`, frame pool, staging texture copy, and timeout handling. `ISSUE-1130A` has since wired the adapter while keeping platform smoke as required evidence.
- Confirmed local desktop host already uses raw `isize` HWND handoff/revalidation patterns around async boundaries in several Windows paths, including PID validation tests for changed cached HWNDs; this is partial coverage, not proof that every upstream HWND lifetime fix is present.
- Confirmed local pointer/global movement paths include `mouse_move_global_f64`, but Windows pointer coordinate precision and app image-to-pointer mappings still need platform-specific tests before claiming parity.
- Confirmed local text-only Computer Use already supports `describe_screen` without screenshot attachment, and local image/pointer paths bind app screenshots through `PointerMap` and `screenshot_id`.
- Confirmed local Windows settings deep link still returns a not-wired error, and Windows visual grid is explicitly unsupported; these are UX/capability-gating gaps, not capture implementation gaps.
- Separated upstream platform UX and desktop-host module split from direct implementation. The upstream merge deletes/replaces `desktop_host.rs`, adds multiple host submodules, changes Computer Use tool cards/UI copy, and crosses Web UI/settings; that is too broad for this branch.
- Did not change Computer Use production code, Flow Chat, multi-agent/subagent, AI media, AI short-drama, terminal, provider, or Web UI.

### ISSUE-1130A Windows WGC Capture Implementation Gate

Priority: P0
Status: Done
Goal: Implement or explicitly defer the Windows Graphics Capture fallback for mostly-black `PrintWindow` results using a narrow adapter and Windows-only proof.
Allowed files: `src/apps/desktop/src/computer_use/windows_capture.rs`, optional `windows_wgc_capture.rs`, `src/apps/desktop/Cargo.toml` Windows feature additions, focused Windows tests/docs.
Forbidden files: desktop-host module split, Web UI tool cards/settings, macOS/Linux adapters, Computer Use tool schema expansion, Flow Chat, AI media, AI short-drama, terminal, provider.
Acceptance:
- `screenshot_window_via_wgc` either calls a real WGC adapter or remains explicitly deferred with a failing/proposed Windows test.
- D3D11 device creation covers hardware then WARP fallback, BGRA support, staging texture copy, row pitch, and frame timeout.
- Mostly-black `PrintWindow` recovery order is documented and tested where possible: WGC first, screen-region `BitBlt` fallback second.
- `BitBlt` fallback preserves `potentially_occluded`/source metadata so agents are not told an occluded screen-region capture is authoritative.
- Verification includes `cargo check -p void-desktop` on Windows and one manual/automated UWP/WinUI/DirectComposition capture smoke.
Risk notes: This cannot be claimed fixed from non-Windows checks. The adapter touches WinRT/D3D11 unsafe code and Cargo feature surface.
Result:
- Added a Windows-only `windows_wgc_capture.rs` adapter using D3D11 device creation with hardware then WARP fallback, WinRT `GraphicsCaptureItem`, `Direct3D11CaptureFramePool::CreateFreeThreaded`, frame timeout, staging texture copy, and row-pitch compaction to BGRA.
- Wired `screenshot_window_via_wgc` to the adapter and registered the module behind `#[cfg(target_os = "windows")]`.
- Added the required Windows crate feature flags without replacing local `Cargo.toml` dependency style or other local desktop features.
- Added a focused compile-level wiring test proving the WGC adapter symbol is present with the expected signature; existing `windows_foreground_capture` tests continue to cover mostly-black detection, DWM crop, and BitBlt uncertainty metadata.
- Preserved `desktop_host.rs`, Computer Use schemas, Web UI, macOS/Linux adapters, background input, Flow Chat, AI media, AI short-drama, terminal, provider, and upstream desktop-host module split boundaries.
- Verification: `cargo test -p void-desktop windows_wgc_adapter_is_wired_for_capture_fallback --lib -- --nocapture` passed, `cargo test -p void-desktop windows_foreground_capture --lib -- --nocapture` passed with 5 tests, and `cargo check -p void-desktop` passed with one unrelated existing `parse_clipboard_path_segments` dead-code warning.
- Manual UWP/WinUI/DirectComposition, occlusion, DPI/multi-monitor, timeout, minimized/stale-HWND, and WARP-fallback smoke remains required before claiming platform-verified WGC capture.

### ISSUE-1130B Windows HWND Lifetime and Revalidation Audit

Priority: P0
Status: Split
Goal: Prove all Windows Computer Use async paths avoid carrying `HWND` handles across `.await` and revalidate the target before using cached handles.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, Windows list/AX/input helper tests, docs.
Forbidden files: WGC implementation, Web UI, macOS/Linux adapters, runtime/service decomposition, Flow Chat, AI media, AI short-drama, terminal.
Acceptance:
- Each Windows path using `HWND` is classified: raw handle captured before await, reconstructed inside blocking closure, or unsafe/deferred.
- Cached interactive/visual-mark HWND validation is covered by tests or documented gaps.
- App click/type/scroll/key-chord paths revalidate PID/window identity before background input where practical.
- Tests include closed window, same-PID multi-window switch, HWND reuse, and capture-after-PID-change fail-closed cases.
Risk notes: Handle lifetime bugs are subtle; a compile pass is not enough. Tests must target stale/reused HWND behavior, not only happy path calls.
Result:
- Split after subagent review because real closed-window, HWND-reuse, same-PID multi-window, UIPI/elevated-window, and WGC/capture-race behavior cannot be honestly proven by pure unit tests.
- Completed the first safe implementation slice in `ISSUE-1130B1`.
- Remaining platform smoke and deeper capture/build-view race cases stay open for follow-up issues; do not claim full Windows HWND lifetime parity until those smoke checks pass.

### ISSUE-1130B1 Windows Input Action HWND Revalidation Slice

Priority: P0
Status: Done
Goal: Harden Windows input actions that previously resolved `hwnd_raw` without an expected-pid identity gate after focus/click awaits.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, docs.
Forbidden files: WGC implementation, Web UI, macOS/Linux adapters, runtime/service decomposition, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package files.
Acceptance:
- `app_type_text` records expected pid and revalidates the selected HWND before dispatching cloaked text input.
- `app_key_chord` records expected pid and revalidates the selected HWND before dispatching cloaked key input.
- Post-action snapshots for these input actions use the expected pid boundary instead of recomputing target pid from a possibly stale/reused HWND.
- Tests cover pid mismatch and pinned hwnd mismatch as explicit `[WINDOW_CHANGED]` failures.
Risk notes: This does not prove real HWND reuse, same-PID multi-window switches, UIPI/elevated-window behavior, or capture races. Those still require Windows smoke.
Result:
- Added a pure Windows host identity helper that fails closed when pid changes or a pinned `hwnd_raw` changes.
- Routed Windows `app_type_text` and `app_key_chord` through expected-pid HWND revalidation before dispatch and expected-pid snapshot validation after dispatch.
- Preserved `app_click`/`app_scroll` existing pre-dispatch revalidation and did not change WGC, Web UI, Computer Use schemas, AI media, AI short-drama, terminal, provider, macOS/Linux adapters, or crate layout.
- Verification: `cargo test -p void-desktop windows_hwnd_lifetime_revalidation --lib -- --nocapture` failed before implementation because the helper did not exist, then passed after implementation; `cargo test -p void-desktop windows_host_app_action_tests --lib -- --nocapture`, `windows_app_enumeration`, `windows_bg_input`, and `windows_foreground_capture` passed; `cargo check -p void-desktop` passed with one unrelated existing `parse_clipboard_path_segments` dead-code warning.

### ISSUE-1130C Windows Pointer Coordinate Precision and Background Input Tests

Priority: P1
Status: Done
Goal: Verify Windows pointer coordinate conversion and background input status semantics without changing cross-platform Computer Use contracts.
Allowed files: Windows background input helper tests, desktop host coordinate mapping tests, docs.
Forbidden files: Computer Use schema expansion, macOS/Linux behavior changes, Web UI, Flow Chat, AI media, AI short-drama, terminal.
Acceptance:
- `mouse_move_global_f64` and Windows app image/global coordinate paths are classified as present/missing for subpixel-safe movement.
- Background click/scroll/type/key outcomes preserve explicit status/path/warning semantics.
- Tests or manual matrix cover DPI scaling, multi-monitor origin offsets, foreground/occluded window, and UIPI/high-integrity denial.
- Image coordinate mappings cover DWM crop origin offsets, negative monitor coordinates, explicit `screenshot_id`, and missing pointer-map failure.
Risk notes: Pointer behavior must be tested on Windows with real DPI/display conditions; jsdom or non-Windows Rust tests cannot prove it.
Result:
- Completed through `ISSUE-1130C1` to `ISSUE-1130C9` as a split evidence and deferral track.
- Automated host tests now cover pointer-map math, negative-origin coordinate conversion, explicit `screenshot_id` precedence, missing pointer-map failure, and background input outcome status/warning contracts.
- Default-off Windows manual harness evidence now covers the current single-display 150% Notepad path for `get_app_state`, `app_type_text`, screenshot-basis `app_click`, focus-target `app_scroll`, `app_key_chord`, and stale explicit `screenshot_id` fail-closed behavior.
- Remaining hardware/permission scenarios are explicitly deferred in `DEC-123`: 100%/125% DPI, mixed-scale multi-monitor negative origin, occluded/non-foreground target behavior, high-integrity/UIPI denial, and capture-source consistency across WGC/DWM/PrintWindow/BitBlt.
- No Computer Use schema, Tauri API/routes, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, macOS/Linux behavior, Cargo/package/workflow/generated files, or product runtime behavior was changed by the closeout slice.

### ISSUE-1130C1 Windows Pointer Coordinate Contract Tests

Priority: P1
Status: Done
Goal: Lock the already-present Windows pointer coordinate contract with focused host tests while leaving real DPI, multi-monitor, foreground/occlusion, and UIPI proof to `ISSUE-1130C`.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, docs.
Forbidden files: production coordinate behavior, Windows input primitives, Computer Use schema, Web UI, Flow Chat, AI media, AI short-drama, terminal, macOS/Linux behavior.
Acceptance:
- Explicit `screenshot_id` pointer maps win over pid fallback maps for app image coordinate conversion.
- Pointer map math covers negative display origins plus content/crop offsets using subpixel center coordinates.
- Missing app/screenshot/global pointer basis fails explicitly instead of silently using an empty state.
Result:
- Added focused host tests for explicit screenshot-id map precedence, negative-origin/content-offset math, and missing pointer-map failure.
- Confirmed existing production behavior already satisfies this contract; no production code was changed.
- Kept `ISSUE-1130C` open because Windows DPI scaling, mixed-scale multi-monitor layouts, foreground/occluded targets, and UIPI/high-integrity denial still need real Windows smoke.

### ISSUE-1130C2 Windows Pointer/Input Manual Smoke Matrix

Priority: P1
Status: Done
Goal: Define the real Windows smoke matrix needed to close `ISSUE-1130C` without pretending unit tests prove DPI, monitor, occlusion, or UIPI behavior.
Allowed files: `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Computer Use production code, Computer Use schema, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, macOS/Linux behavior.
Acceptance:
- Manual smoke scenarios cover 100%/125%/150% DPI, mixed-scale multi-monitor negative origin, foreground input, occluded target input, high-integrity/UIPI denial, capture-source consistency, and stale/missing pointer maps.
- Each scenario records environment, target identity, capture source, `screenshot_id` where relevant, result `status/source/path/error/warning`, and evidence path.
- Parent `ISSUE-1130C` remains open until all manual scenarios have current evidence or explicit deferrals in `docs/DECISIONS.md`.
- No runtime behavior or automated test result is claimed from the matrix alone.
Result:
- Added `docs/qa/windows-computer-use-smoke-matrix.md` with required environment fields, scenario table, result-record template, automated baseline commands, and closure rule.
- Kept `ISSUE-1130C` open because this slice creates the evidence boundary; it does not execute real Windows smoke.

### ISSUE-1130C3 Windows Computer Use Automated Baseline Evidence

Priority: P1
Status: Done
Goal: Run and record the automated baseline commands from the Windows Computer Use smoke matrix before any manual hardware-dependent smoke.
Allowed files: `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Computer Use production code, Computer Use tests, Computer Use schema, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package/workflow/generated files.
Acceptance:
- Focused automated baseline commands are run and recorded with real pass/fail status.
- Failures, if any, are recorded as failures and do not get hidden behind `manual_pending`.
- Parent `ISSUE-1130C` remains open because automated baseline evidence does not prove real DPI, mixed-monitor, occlusion, capture-source, or UIPI behavior.
- Existing unrelated dirty files are not staged.
Result:
- Automated baseline passed: `windows_app_image_coordinate`, `windows_pointer_map_handles_negative_origin`, `windows_host_app_actions`, `windows_bg_input`, `windows_foreground_capture`, and `cargo check -p void-desktop`.
- `cargo check -p void-desktop` still reports one existing unrelated dead-code warning for `parse_clipboard_path_segments`.
- Real Windows smoke remains `manual_pending`; `ISSUE-1130C` is not closed.

### ISSUE-1130C4 Windows Computer Use Smoke Environment Preflight

Priority: P1
Status: Done
Goal: Record current Windows environment and available harness facts before attempting hardware-dependent `ISSUE-1130C` smoke.
Allowed files: `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: `src/**`, `tests/**`, Cargo/package/workflow/generated files, Computer Use runtime/schema/test code, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider.
Acceptance:
- Record OS, DPI, display topology, graphics adapter facts, and current product smoke harness availability.
- Mark the record as environment preflight only, not a real smoke pass.
- Do not execute or claim `app_click`, `app_type_text`, `app_scroll`, `app_key_chord`, drag, or other product app actions.
- Parent `ISSUE-1130C` remains open with manual smoke still `manual_pending`.
Result:
- Recorded current machine as Windows 11 Home Chinese edition build `26200`, one primary logical display at `1707x960`, and `AppliedDPI=144` / 150% scale.
- Recorded WMI video adapters including Intel UHD at `2560x1440`, NVIDIA RTX 4090 Laptop GPU, and two virtual adapters.
- Confirmed no product-level smoke harness command/script was identified in the inspected docs/scripts/desktop API/Computer Use scopes; no app actions were executed.
- Real Windows smoke remains `manual_pending`; `ISSUE-1130C` is not closed.

### ISSUE-1130C5 Windows Computer Use Manual Harness Gate

Priority: P1
Status: Done
Goal: Add a default-off manual Windows Computer Use harness that future smoke runs can execute explicitly without changing product runtime behavior.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Computer Use production logic outside the test gate, Computer Use schema, Tauri API/routes, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package/workflow/generated files.
Acceptance:
- The harness is `#[ignore]` so normal `cargo test` does not execute real app actions.
- The harness requires `VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE=1` before launching Notepad or calling `app_*` actions, so `--ignored` alone remains safe.
- The harness uses existing `DesktopComputerUseHost` / `ComputerUseHost` APIs rather than low-level Win32 primitives or new product routes.
- Default verification compiles/discovers the harness and proves the env gate skips without executing real actions.
- Parent `ISSUE-1130C` remains open because the real env-enabled manual smoke was not run.
Result:
- Added `windows_computer_use_manual_harness_notepad_app_input_gate` as a Windows-only ignored test in `desktop_host.rs`.
- The env-enabled path launches Notepad by pid, captures app state, types a unique `VOID-CU-SMOKE-{pid}` marker through `app_type_text`, and clicks via screenshot-basis `app_click`.
- Verified default run reports the test as ignored; verified `--ignored` without the env var prints a skip message and performs no app action.
- Real Windows smoke with `VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE=1` remains `manual_pending`; `ISSUE-1130C` is not closed.

### ISSUE-1130C6 Windows Notepad Single-Display Smoke Evidence

Priority: P1
Status: Done
Goal: Run the env-enabled Windows manual harness once on the current machine and record the limited evidence without claiming full `ISSUE-1130C` completion.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Computer Use schema, Tauri API/routes, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package/workflow/generated files.
Acceptance:
- If the manual harness fails, record the real failure and fix only harness assumptions that block valid evidence collection.
- The harness must avoid targeting existing user Notepad windows.
- The env-enabled run must be recorded as limited current-machine evidence, not as full DPI/multi-monitor/occlusion/UIPI/capture-source coverage.
- Parent `ISSUE-1130C` remains open until the rest of the manual matrix has evidence or explicit deferrals.
Result:
- First env-enabled run failed because Windows 11 Notepad did not expose a top-level window for the initial child pid.
- Fixed the harness to open a unique temporary `void-cu-smoke-*.txt` file and select the target window by that unique title instead of the launcher pid, avoiding existing user Notepad windows.
- Env-enabled run passed on the current single-display 150% environment: `get_app_state`, `app_type_text`, and `app_click` completed through `DesktopComputerUseHost`.
- Remaining manual coverage still excludes 100%/125% DPI, mixed-scale multi-monitor/negative origin, occluded windows, UIPI/high-integrity denial, capture-source consistency, and real stale-map behavior; `ISSUE-1130C` is not closed.

### ISSUE-1130C7 Windows Stale Screenshot Map Fail-Closed Evidence

Priority: P1
Status: Done
Goal: Ensure app image-coordinate actions with an explicit stale or missing `screenshot_id` fail closed instead of falling back to unrelated app/pid pointer maps.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Computer Use schema, Tauri API/routes, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package/workflow/generated files.
Acceptance:
- If `app_click` receives `ImageXy` or `ImageGrid` with an explicit `screenshot_id`, that id must resolve to a current pointer map.
- Missing explicit screenshot ids must fail with an actionable error mentioning `screenshot_id`.
- `screenshot_id: None` may still use the existing pid/app pointer-map fallback.
- Env-enabled Notepad smoke records real stale-map fail-closed evidence without claiming DPI/multi-monitor/occlusion/UIPI/capture-source completion.
Result:
- Tightened `map_app_image_coords_to_pointer_f64` so explicit `screenshot_id` lookup is authoritative and does not fall back to pid/app maps when stale or missing.
- Extended `windows_app_image_coordinate_maps_prefer_explicit_screenshot_id` to cover the fail-closed explicit-missing-id path while preserving pid fallback for `None`.
- Extended the env-enabled Notepad manual harness to attempt a stale `ImageXy` click and assert it fails before dispatching input.
- Current-machine smoke now covers `WIN-CU-STALE-MAP`; parent `ISSUE-1130C` remains open because 100%/125% DPI, mixed-scale multi-monitor/negative origin, occluded targets, UIPI/high-integrity denial, and capture-source consistency still need evidence or explicit deferrals.

### ISSUE-1130C8 Windows Foreground Scroll and Key Chord Smoke Evidence

Priority: P1
Status: Done
Goal: Extend the default-off Windows manual harness to record current-machine foreground `app_scroll` and `app_key_chord` evidence without claiming full parent `ISSUE-1130C` completion.
Allowed files: `src/apps/desktop/src/computer_use/desktop_host.rs`, `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: Computer Use schema, Tauri API/routes, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, Cargo/package/workflow/generated files.
Acceptance:
- Default ignored and env gates still prevent accidental Notepad launches or app actions.
- Env-enabled Notepad smoke covers `get_app_state`, `app_type_text`, `app_click`, `app_scroll`, `app_key_chord`, and stale-map fail-closed behavior on the current single-display 150% setup.
- Parent `ISSUE-1130C` remains open for 100%/125% DPI, mixed-scale multi-monitor/negative origin, occlusion, UIPI/high-integrity denial, and capture-source consistency.
Result:
- Extended the env-enabled Notepad manual harness to scroll the focused Notepad target and send `ctrl+end` through `app_key_chord` after the existing type/click path.
- Preserved the default-off harness gates and stale `screenshot_id` fail-closed assertion.
- Current-machine smoke now partially covers `WIN-CU-FOREGROUND`; parent `ISSUE-1130C` remains open for the remaining Windows matrix.

### ISSUE-1130C9 Windows Pointer Smoke Closeout and Deferral Decision

Priority: P1
Status: Done
Goal: Close parent `ISSUE-1130C` by recording the current single-display 150% evidence as bounded evidence and explicitly deferring the remaining hardware/permission scenarios.
Allowed files: `docs/qa/windows-computer-use-smoke-matrix.md`, `docs/DECISIONS.md`, `docs/ISSUES.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.
Forbidden files: `src/**`, `tests/**`, Computer Use schema, Tauri API/routes, Web UI, Flow Chat, AI media, AI short-drama, terminal, provider, macOS/Linux adapters, Cargo/package/workflow/generated files.
Acceptance:
- Scenario status summary distinguishes `passed`, `partially_passed`, and `deferred`.
- The current 150% single-display smoke is recorded as bounded evidence, not full Windows parity.
- Every unproven hardware/permission scenario has an explicit deferral rationale in `docs/DECISIONS.md`.
- Parent `ISSUE-1130C` can be marked done without claiming untested hardware behavior.
Result:
- Added `DEC-123` to document the deferral boundary for 100%/125% DPI, mixed-scale multi-monitor negative origin, occluded/non-foreground targets, UIPI/high-integrity denial, and capture-source consistency.
- Updated the smoke matrix with a scenario status summary and closeout record.
- Closed parent `ISSUE-1130C` based on current evidence plus explicit deferrals, while preserving the requirement that future platform parity claims need fresh machine-specific evidence.

### ISSUE-1130D Windows Computer Use Capability Gating and Settings Links

Priority: P2
Status: Done
Goal: Make Windows-only Computer Use unsupported capabilities explicit and actionable without changing core schemas or Web UI architecture.
Allowed files: Windows desktop Computer Use adapter, focused capability tests, docs.
Forbidden files: broad Computer Use schema expansion, Web UI tool-card redesign, desktop-host module split, Flow Chat, AI media, AI short-drama, terminal, provider.
Acceptance:
- Windows `computer_use_open_system_settings` maps supported settings categories to safe `ms-settings:` URIs or returns a typed, actionable unsupported result.
- Windows visual-grid unsupported behavior is either hidden earlier through capability gating or documented with a clear fallback to visual mark/image-coordinate flows.
- Unsupported capability responses preserve explicit status/source/error semantics instead of relying on generic string matching.
- Tests cover at least the adapter-level decision table; no desktop UI redesign is included.
Risk notes: This is a UX/capability-gating issue. It must not be bundled with WGC unsafe code or the upstream platform tool-card refactor.
Result:
- Completed through existing Windows visual-grid unsupported contracts plus `ISSUE-1130D1`.
- Windows settings links now have an adapter-owned decision table: `screen_capture` opens the documented Graphics Capture privacy URI, while `accessibility` and unknown panes return stable unsupported facts.
- Windows visual-grid `app_click` targets remain explicitly unsupported with `[WINDOWS_VISUAL_GRID_UNSUPPORTED]` and documented fallbacks to `build_visual_mark_view` + `visual_click` or explicit `ImageXy`/`ImageGrid` targets.
- No Web UI redesign, Computer Use schema expansion, desktop-host split, WGC/input adapter rewrite, Flow Chat, AI media, AI short-drama, terminal, provider, or crate-layout change was included.
Verification:
- `cargo test -p void-desktop computer_use_api --lib -- --nocapture` passed.
- `cargo test -p void-desktop windows_visual_grid --lib -- --nocapture` passed.
- `node scripts/check-core-boundaries.mjs` passed.
Remaining risk:
- Real Windows UX smoke is still required to prove that the launched Settings page is useful on each Windows version/SKU.
- VisualGrid remains intentionally unsupported until a separate Windows smoke-backed issue accepts it.

#### ISSUE-1130D1 Windows Settings Link Decision Table

Priority: P2
Status: Done
Goal: Make Windows `computer_use_open_system_settings` routing explicit for supported panes without pretending Windows has a macOS-equivalent Accessibility permission pane.
Allowed files: `src/apps/desktop/src/api/computer_use_api.rs`, docs.
Forbidden files: Web UI, Computer Use core schemas, desktop host/input/WGC adapters, Flow Chat, AI media, AI short-drama, terminal, provider.
Acceptance:
- `screen_capture` maps to the Microsoft-documented Graphics Capture privacy URI `ms-settings:privacy-graphicscaptureprogrammatic`.
- `accessibility` returns a stable actionable unsupported outcome on Windows instead of opening an unrelated Ease of Access page.
- Unknown panes return a stable error code and preserve the original pane name.
- Tests cover the adapter decision table before any UI redesign.
Progress:
- Added a pure Windows settings route helper returning either `Uri` or `Unsupported` with stable `error_code`, `platform`, `pane`, and optional `suggested_pane` facts.
- Wired the Windows Tauri command branch through the helper and `cmd /C start` for the supported `screen_capture` route.
- Kept the command return shape as `Result<(), String>` to avoid a Web UI contract migration in this slice.
- Did not change Computer Use schemas, Web UI tool cards/settings, desktop host, WGC/HWND/input adapters, Flow Chat, AI media, AI short-drama, terminal, provider, or crate layout.
- Verification: `cargo test -p void-desktop windows_settings_route --lib -- --nocapture`, `cargo test -p void-desktop computer_use_api --lib -- --nocapture`, `cargo check -p void-desktop`, `rustfmt --edition 2021 --check src/apps/desktop/src/api/computer_use_api.rs`, `node scripts/check-core-boundaries.mjs`, and targeted `git diff --check` passed. `cargo check -p void-desktop` still reports the existing unrelated `parse_clipboard_path_segments` dead-code warning.
Deferred:
- Hiding or reshaping visual-grid unsupported affordances remains a future separate issue; parent `ISSUE-1130D` closes with the current explicit unsupported contract.

### ISSUE-1140 Image Understanding and Image Context Completion Audit

Priority: P1
Status: Done
Goal: Verify local `AnalyzeImage`, image contexts, BTW image forwarding, and media/short-drama image flows against upstream image-understanding changes.
Allowed files: AnalyzeImage tests, BTW image-context tests, docs first.
Forbidden files: UI byte loading, provider adapter reorganization, media or short-drama service rewrites.
Acceptance:
- Local synced, partial, and missing image-understanding pieces are listed.
- Workspace-scoped path/data-url/image-id contracts remain explicit.
- Any runtime completion is split into one tool-contract issue.
Risk notes: Provider multimodal capability drift and workspace path permissions must stay inside the tool/runtime boundary.
Result:
- Reviewed upstream image-related work from `cf94e2f90`, `c2f6a3c91`, and `912111f6e`, including BTW image side questions, `analyze_image`, `view_image`, context upload, image-understanding default model config, provider capability checks, and tool registration.
- Confirmed local `AnalyzeImage` already exists in `src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs` with `image_id` / `image_path` / `data_url` exactly-one-source validation, workspace path containment, explicit status output, and runtime tests. Do not overwrite it with the simpler upstream assembly implementation.
- Confirmed local image context transport preserves `data_url`, local/URL paths, MIME, dimensions, and source metadata through `imageContextForBackend`, desktop payload refill, and coordinator image contexts.
- Confirmed local `/btw` initial side-question path supports image payloads, but transient `/btw` child-session second-turn messages still reject image attachments in `MessageModule.ts`.
- Confirmed local AI media tools resolve attached image ids/names into data URLs or provider URLs and local short-drama flows protect raw media by routing through short-drama project/tool policy; neither should be rewritten by generic image understanding.
- Confirmed `ToolImageAttachment` and provider adapter conversion foundations exist, but a Void-owned `ViewImage` tool still needs a separate contract gate before copying upstream behavior.
- Did not change production code, UI components, provider adapters, media services, short-drama services, Flow Chat runtime, or tool schemas in this audit.

### ISSUE-1140A AnalyzeImage Permission and Data URL Guard

Priority: P1
Status: Done
Goal: Align the `AnalyzeImage` status contract with actual behavior and harden inline `data_url` handling before any broader image-tool expansion.
Allowed files: `src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs`, `src/crates/core/src/agentic/image_analysis/*` tests/docs.
Forbidden files: Web UI, provider adapter rewrites, media tools, short-drama tools, Flow Chat pages, BTW panel logic.
Acceptance:
- `permission_denied` is either backed by a real permission path and tests or removed/deferred from the active status contract.
- `data_url` input has explicit MIME, size, and invalid-payload tests before provider runtime execution.
- `image_id` / `image_path` / `data_url` remains exactly-one-source.
- Verification includes `cargo test -p void-core analyze_image --lib`.
Risk notes: Readonly tools still enforce workspace/path policy. Do not represent permission or path failures with generic strings.
Result:
- Removed unreachable `permission_denied` from the active `AnalyzeImage` output status contract. The tool remains readonly and `needs_permissions()` remains false; path and workspace policy failures stay classified as `missing_workspace` or `path_denied`.
- Added `call_impl`-level exactly-one-source enforcement so direct runtime calls cannot bypass `validate_input` and silently choose the first image source.
- Hardened inline `data_url` request resolution before provider runtime execution: decoded payloads must be at most 1 MiB, use an allowed raster MIME type (`png/jpeg/gif/webp/bmp`), and contain bytes recognized as an image instead of relying on declared MIME fallback.
- Added tests proving oversized, unsupported MIME, non-image payload, invalid base64, and multi-source data URL inputs return structured `invalid_image` results before provider runtime.
- Deferred broader `image_context` scoping, provider image-context path containment, BTW follow-up image context, and media/short-drama bridge policy to their existing follow-up issues; no Web UI, provider adapter, media, short-drama, or Flow Chat files were changed.
- Verification: `cargo test -p void-core analyze_image --lib -- --nocapture` passed with 14 tests. `cargo test -p void-core image_analysis --lib -- --nocapture` passed with 0 matching tests. `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/implementations/analyze_image_tool.rs` passed.

### ISSUE-1140B BTW Child-Session Image Context Completion

Priority: P1
Status: Done
Goal: Complete `/btw` image context support beyond initial side-question creation, especially child-session follow-up messages.
Allowed files: `src/web-ui/src/flow_chat/services/flow-chat-manager/MessageModule.ts`, `src/web-ui/src/flow_chat/services/BtwThreadService.ts`, focused BTW tests, docs.
Forbidden files: provider adapters, UI byte loading, `BtwSessionPanel` provider/path policy, media services, short-drama services, core image-analysis runtime.
Acceptance:
- Initial `/btw` with image remains supported.
- Transient `/btw` child-session follow-up can either send image contexts through the existing backend path or returns a typed unsupported state documented at the service boundary.
- No provider, path, or model capability judgment is added to `ChatInput.tsx` or `BtwSessionPanel.tsx`.
- Tests cover initial `/btw` image payload, child follow-up with image, failure path preserving composer images, and no-image regression.
Risk notes: This is a Flow Chat service boundary issue, not an image byte loading or provider implementation issue.
Progress:
- Removed the transient `/btw` child-session image rejection from `MessageModule` and now build an explicit `imagePayload` from existing `options.imageContexts` plus `options.imageDisplayData`.
- Delegated image follow-up delivery through `BtwThreadService.sendMessageToTransientBtwSession`, preserving `BtwThreadService` as the only `btwAPI.askStream` caller/conversion layer for transient BTW sends.
- Preserved no-image transient BTW follow-up behavior and failure behavior: failed sends do not create/delete normal dialog turns, and the composer-owned image payload is still passed to the service boundary.
- No `ChatInput.tsx`, `BtwSessionPanel.tsx`, provider adapter, media service, short-drama service, core image-analysis runtime, or image-byte loading code was changed.
- Verification: RED `pnpm --dir src/web-ui run test:run src/flow_chat/services/flow-chat-manager/MessageModule.test.ts` failed before implementation on `Transient /btw sessions do not support image attachments yet`; GREEN focused Flow Chat BTW/image tests passed after implementation. Full commands are recorded in `docs/TEST_PLAN.md`.
- Deferred: backend stream echo/display metadata and deeper Rust-side BTW image consumption remain separate validation work; provider support remains governed by the existing backend image pipeline.

### ISSUE-1140C Image Context Scope and Media Path Leak Guards

Priority: P1
Status: Done
Goal: Prevent global temporary image-context ambiguity and avoid leaking local paths through media image-reference inputs.
Allowed files: `src/crates/core/src/agentic/tools/image_context.rs`, `src/apps/desktop/src/api/agentic_api.rs` tests, `src/crates/core/src/agentic/tools/implementations/media_tools.rs` tests/docs.
Forbidden files: Web UI rewrites, provider adapter reorganization, short-drama service rewrites, generic fallback string matching.
Acceptance:
- Tests document `image_id`, full filename, basename, expiration, and same-name collision behavior.
- `resolve_missing_image_payloads` behavior is covered when cache payloads are missing or expired.
- `GenerateImage` / `GenerateVideo` do not silently pass unmatched Windows/POSIX local paths as provider URLs.
- Valid `http(s)` and `data:` image references continue to work.
Risk notes: `image_context.rs` must stay a storage/lookup layer and must not start enforcing provider policy or workspace reads.
Progress:
- Added focused `image_context.rs` tests documenting exact `image_id` lookup, full filename lookup, basename lookup, expiration cleanup, and same-name collision behavior.
- Changed filename/basename fallback to require a unique match. Same-name collisions now return `None` instead of taking an arbitrary `DashMap` iteration result; exact `image_id` lookup remains stable.
- Preserved `image_context.rs` as storage/lookup only. No provider policy, workspace reads, Web UI, Flow Chat, media service, short-drama service, provider adapter, execution engine, or desktop API code changed.
- Verification so far: `cargo test -p void-core image_context --lib -- --nocapture` passed with 8 tests, including existing media image-reference tests matched by the filter. `cargo test -p void-core agentic::tools::image_context::tests --lib -- --nocapture --test-threads=1` passed with 3 tests. `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/image_context.rs` passed.
- Added media image-reference guard coverage for `GenerateImage` and `GenerateVideo`: unmatched Windows absolute paths, POSIX absolute paths, and relative local paths are filtered out of provider `image_urls` instead of being sent as provider URLs. Plain non-path references remain unchanged for compatibility, and valid `http(s)` / `data:image` references continue to pass through.
- Preserved registered image-context behavior: `image_id` and file-name references still resolve to `data_url` first, then provider-compatible `image_path` only. Local-path upload behavior remains owned by `UploadMediaImage`.
- Verification so far also includes `cargo test -p void-core media_image_reference_tests --lib -- --nocapture` passed with 15 tests, `rustfmt --edition 2021 --check src/crates/core/src/agentic/tools/implementations/media_tools.rs` passed after formatting, and `cargo check -p void-core --features product-full` passed.
- Added desktop API tests for `resolve_missing_image_payloads`: cache hit restores missing payload and annotates metadata, cache hit with no payload returns a clear error, and expired/removed cache entries return the same re-attach error as missing cache entries.
- Verification so far also includes `cargo test -p void-desktop resolve_missing_image_payloads --lib -- --nocapture` passed with 3 tests.

### ISSUE-1140D Void ViewImage Tool Contract Gate

Priority: P2
Status: Split
Goal: Evaluate and implement a Void-native `ViewImage` tool only after tool-image-attachment, provider capability, remote workspace, and manifest boundaries are proven.
Allowed files: tool contract tests, `void-tool-packs`, `product_runtime`, optional new ViewImage implementation under current Void core layout, docs.
Forbidden files: upstream `assembly` crate layout, broad agent mode rewrites, provider wire conversion outside adapters, Web UI upload flow rewrites.
Acceptance:
- Tool manifest/readonly registration tests prove the intended exposure.
- Provider capability tests prove only supported primary models receive tool image attachments.
- Workspace local and remote path resolution are covered before bytes are read.
- Image optimization uses existing image-processing helpers and reports width/height/size metadata.
Risk notes: Do not copy upstream `view_image` wholesale; current Void already has different tool runtime and provider boundaries.
Split note: `ISSUE-1140D1` records the contract gate and splits implementation into manifest/provider/path slices before any `ViewImage` runtime code. `ISSUE-1140D2` owns manifest/readonly exposure tests. `ISSUE-1140D3` owns provider image-attachment capability gating. `ISSUE-1140D4` owns workspace path resolution, image optimization, and the minimal tool implementation.

### ISSUE-1140D1 ViewImage Contract Gate and Slice Plan

Priority: P2
Status: Done
Goal: Turn upstream `view_image` into a Void-owned implementation plan without adding a broad image tool or changing provider/UI boundaries.
Allowed files: docs and read-only code inspection.
Forbidden files: concrete `ViewImage` implementation, `AnalyzeImage` rewrite, provider adapter rewrite, Web UI upload flow, AI media, AI short-drama, Flow Chat.
Acceptance:
- Current image attachment, manifest, provider, and workspace-path owners are identified.
- Direct upstream copy risks are recorded.
- Follow-up code slices are low-coupling and independently testable.
Result:
- Confirmed `ToolImageAttachment` is a core-type payload of `mime_type` and `data_base64`; provider conversion currently lives in `src/crates/ai-adapters`.
- Confirmed `AnalyzeImage` is already the authoritative analysis tool and remains registered through `void-tool-packs` plus `ProductToolRuntime`.
- Confirmed `ToolUseContext` already owns workspace identity, remote/local path resolution, and primary-model image capability facts.
- Split runtime implementation into `ISSUE-1140D2`, `ISSUE-1140D3`, and `ISSUE-1140D4` so manifest exposure, provider gating, and file/image processing are not bundled.

### ISSUE-1140D2 ViewImage Manifest and Readonly Exposure Contract

Priority: P2
Status: Done
Goal: Add or reject `ViewImage` manifest exposure through Void's existing tool-pack/product-runtime path with focused registry tests.
Allowed files: `src/crates/tool-packs/src/lib.rs`, `src/crates/core/src/agentic/tools/product_runtime.rs`, `src/crates/core/src/agentic/tools/registry.rs`, focused tests, docs.
Forbidden files: tool execution implementation, provider adapters, Web UI upload flow, media/short-drama services, upstream `assembly` crate layout.
Acceptance:
- Manifest/readonly/collapsed exposure is explicitly tested before tool execution exists.
- `AnalyzeImage` manifest behavior remains unchanged.
- `ViewImage` is exposed only if the follow-up implementation can preserve explicit `status/source/error` and image attachment gating.
Result:
- Rejected `ViewImage` manifest exposure until `ISSUE-1140D3` and `ISSUE-1140D4` prove provider image-attachment support and workspace path/image-processing behavior.
- Added `void-tool-packs` provider-plan coverage proving `ViewImage` is not planned while `AnalyzeImage` remains in the image-analysis group.
- Added core registry coverage proving `ViewImage` is not materialized, not builtin-manifest visible, not collapsed/GetToolSpec-discoverable, and not readonly-visible.
- Added product catalog facade coverage proving an allowed-tools list that includes `ViewImage` still cannot make it prompt-visible before runtime gates pass.
- No `ViewImage` runtime implementation, provider adapter, Web UI, AI media, AI short-drama, Flow Chat, or `AnalyzeImage` behavior was changed.

### ISSUE-1140D3 ViewImage Provider Image-Attachment Capability Gate

Priority: P2
Status: Done
Goal: Prove tool-result image attachments are sent only when the primary model/provider path supports them.
Allowed files: provider adapter tests, tool-context capability tests, docs.
Forbidden files: concrete `ViewImage` filesystem reads, Web UI upload flow, media/short-drama services, provider transport rewrites.
Acceptance:
- OpenAI/Responses and any supported adapter paths have focused tests for `ToolImageAttachment` conversion.
- Unsupported primary-model paths return a typed unsupported result rather than silently dropping images.
- Provider-specific wire logic stays in adapters, not core tool contracts.
Result:
- Added a core `ToolUseContext::tool_result_image_attachment_capability()` contract with explicit supported/unsupported status, source, and reason.
- Updated Computer Use screenshot gating to reuse that core capability contract while preserving existing user-facing errors.
- Added Anthropic adapter coverage for `ToolImageAttachment` conversion into `tool_result` image/text blocks.
- Added Gemini adapter coverage proving tool-result image attachments are not converted on the unsupported provider path; the core gate is responsible for preventing image-emitting tools from using that path.
- Kept `ViewImage` unimplemented and unchanged in manifests until the path/image-processing slice passes.

### ISSUE-1140D4 Minimal Void ViewImage Tool Implementation

Priority: P2
Status: Done
Goal: Implement the smallest Void-native `ViewImage` tool after manifest and provider gates pass.
Allowed files: new `ViewImage` tool implementation under current core tool layout, `product_runtime`, `void-tool-packs`, image-processing helper tests, docs.
Forbidden files: upstream `assembly` crate layout, Web UI upload flow rewrites, `AnalyzeImage` model-call behavior, AI media/short-drama source-of-truth changes.
Acceptance:
- `image_path` resolves through `ToolUseContext` before bytes are read for local and remote workspaces.
- Image MIME/size/dimensions are detected through existing image-processing helpers.
- Result includes explicit `status/source/error` plus width/height/size metadata.
- Tool result image attachment uses `ToolImageAttachment`; no raw file path or provider-specific payload leaks into UI.
Result:
- Added a minimal readonly, collapsed `ViewImage` tool that accepts only workspace `image_path`, calls no model, and returns a `ToolImageAttachment` plus explicit metadata.
- Reused `ToolUseContext` workspace/path and tool-result image attachment capability gates before reading image bytes.
- Covered local and remote workspace reads, workspace containment, missing workspace, unsupported model/provider, non-image payload, schema, registry, readonly, and manifest behavior with focused tests.
- Registered `ViewImage` in the image-analysis provider plan after `AnalyzeImage`; `AnalyzeImage` remains the model-based image-understanding tool.
- Kept Web UI, Flow Chat, provider adapters, AI media, AI short-drama, and upstream assembly/crate layout unchanged.

### ISSUE-1140E Short Drama Image Understanding Bridge Contract

Priority: P2
Status: Done
Goal: Define how AI short-drama workflows may consume image understanding summaries without exposing raw media or bypassing `ShortDramaProject`.
Allowed files: short-drama docs/tests first, optional service-level bridge tests.
Forbidden files: generic `AnalyzeImage` rewrites, raw media export into Main AI context, direct `.void/short-drama` UI mutation, media service rewrite.
Acceptance:
- Image summaries are represented as low-context artifact/reference metadata, not raw image bytes or raw URLs.
- `ShortDramaProject` remains the AI-facing source of truth for project state.
- Media result references and short-drama artifact coordinates continue to use existing media/short-drama tools.
- Tests prove raw media URLs/bytes are omitted from Main AI context export.
Risk notes: Short-drama image understanding must be a bridge contract, not a generic image tool reaching into the right-side page.
Result:
- Closed by `ISSUE-1140E1` and `ISSUE-1140E2`.
- `ISSUE-1140E1` locks Main AI export to low-context media metadata and proves raw media references, URLs, local paths, data URLs, and raw byte labels are omitted.
- `ISSUE-1140E2` adds a short-drama-owned bridge that resolves image artifact/media coordinates from `ShortDramaProject` and converts to generic `ImageContext` only through explicit local/relative image-path helpers.
- Generic `AnalyzeImage`, provider image wire conversion, media services, Flow Chat, and right-panel short-drama UI remain short-drama-agnostic.
- Image-summary generation, persistence, and model invocation remain future work; this parent closes the safe bridge contract only.

### ISSUE-1140E1 Short Drama Main AI Media Export Leak Guard

Priority: P2
Status: Done
Goal: Lock the current Main AI short-drama awareness export so image/media references remain low-context metadata and do not leak raw URLs, local paths, or data URLs.
Allowed files: `ShortDramaMainAIContextExport` tests and docs.
Forbidden files: `AnalyzeImage` rewrites, provider image wire conversion, media service rewrite, short-drama UI page behavior, direct `.void/short-drama` mutation.
Acceptance:
- Main AI context export still uses `ShortDramaProject` as the source object and does not read the right-side page directly.
- Export payload may include `mediaItemId`, `activeMedia`, and preview/playable availability flags.
- Export payload must not include `mediaReference`, `previewUrl`, `thumbnailUrl`, `localPath`, `filePath`, raw data URLs, raw CDN URLs, or raw media byte labels.
- Follow-up adapter work is split from this guard and must not make `AnalyzeImage` short-drama-aware.
Result:
- Added a focused test with a short-drama image artifact containing external CDN URL, data URL, Windows local path, and Unix-like file path metadata.
- Confirmed the Main AI export keeps low-context media metadata while omitting raw media references.
- Split the broader bridge adapter work into `ISSUE-1140E2`; the parent contract is now closed after that adapter slice.

### ISSUE-1140E2 Short Drama Image Context Bridge Adapter

Priority: P2
Status: Done
Goal: Add a short-drama-owned bridge that resolves image artifact references from `ShortDramaProject` without making UI or `AnalyzeImage` aware of short-drama internals.
Allowed files: short-drama service adapter/tests, short-drama service export, docs.
Forbidden files: generic `AnalyzeImage` rewrites, provider image wire conversion, media service rewrite, short-drama UI page behavior, direct `.void/short-drama` mutation.
Acceptance:
- A low-context image-understanding reference exposes only project/artifact/media coordinates and prompt summary fields, not raw media URLs, data URLs, local paths, file paths, or bytes.
- A separate explicit image-context bridge can convert a resolved short-drama image media reference into generic `ImageContext` only when a local or relative image path exists.
- Video/audio media, missing media references, remote-only image previews, and missing artifacts return explicit `status/source/error`.
- `ShortDramaProject` remains the source of truth, and `AnalyzeImage` remains short-drama-agnostic.
Result:
- Added `ShortDramaImageContextBridge` with `resolveShortDramaImageUnderstandingReference`, `createShortDramaImageContextForArtifact`, and `createShortDramaImageContextFromMediaReference`.
- Added focused tests for low-context reference output, local image path conversion, handle resolution, non-image rejection, remote/data URL rejection, and missing-artifact errors.
- Confirmed the bridge does not modify Main AI export behavior and does not touch UI, provider, media service, or generic image-analysis code.

### ISSUE-1150 MCP and Tool Runtime Reliability Delta Audit

Priority: P1
Status: Done
Goal: Compare upstream MCP/tool runtime and readonly manifest reliability changes with current Void runtime, request timeout, and tool manifest tests.
Allowed files: tool runtime tests/docs first.
Forbidden files: runtime crate reorganization, provider/service mass moves, release workflow changes.
Acceptance:
- Existing remote MCP timeout and POST-SSE coverage are checked.
- Readonly manifest gaps are listed.
- Any implementation preserves explicit `status/source/error` outputs.
Risk notes: Large outputs, timeouts, and readonly policy must not be represented by raw strings or hidden UI fallbacks.
Result:
- Reviewed upstream MCP/tool-runtime work from `d77093204`, `7dec5f489`, `8d69e5733`, `5df255a1a`, `cdfdd716d`, `4077c1a8a`, `d6b783967`, `29c78cfb9`, `8a7a54698`, and `65da1a082`.
- Confirmed local remote MCP Streamable HTTP already has a bounded 120s request timeout and POST-SSE regression coverage in `src/crates/core/tests/remote_mcp_streamable_http.rs`.
- Confirmed local MCP dynamic tool metadata preserves explicit provider identity (`providerId`, `providerKind`, MCP server id/name/tool name) instead of deriving provider ownership from registered names.
- Confirmed local `void-agent-tools` / `product_runtime` already own generic manifest, readonly-enabled filtering, GetToolSpec collapsed-tool contracts, and shared large-output preview/storage policy.
- Confirmed local gaps: MCP dynamic tool results still have a 12k adapter-level text truncation before shared storage; local stdio MCP ordinary requests do not have the same bounded timeout contract as remote requests; MCP elicitation still advertises schema validation; tool result `status/source/error` envelopes are not uniform; approval/rejection outcomes still rely on mixed string/result categories.
- Rejected direct copying of upstream runtime-owner/crate migrations, full approval-bar UI changes, and event ABI migrations because they cross core/services/agent-tools/Web UI/product runtime boundaries.
- Did not change production code, MCP adapters, tool pipeline, Web UI, provider adapters, AI media, AI short-drama, Flow Chat runtime, or crate layout in this audit.

### ISSUE-1150A MCP Large Output Storage Alignment

Priority: P1
Status: Done
Goal: Let MCP dynamic tool output flow into the shared large-output storage policy without pre-truncating assistant-visible text at the MCP adapter boundary.
Allowed files: `src/crates/core/src/service/mcp/adapter/tool.rs`, focused MCP adapter tests, shared output policy tests/docs.
Forbidden files: Web UI tool cards, Flow Chat runtime, provider adapters, media/short-drama services, crate owner migration.
Acceptance:
- MCP text output above the current 12k adapter threshold is not silently truncated before shared storage policy can decide preview/persistence.
- Text, structured content, resource, and mixed MCP results preserve source metadata where available.
- Shared storage preview/reference behavior remains owned by core runtime artifacts, not `void-agent-tools`.
- Tests prove the adapter no longer hides content before the central oversized-result policy runs.
Risk notes: Avoid double truncation. Do not move filesystem artifact writes into `void-agent-tools`.
Progress:
- Added a core MCP adapter storage-render path that preserves large MCP assistant-visible text for `ToolResult` storage while keeping regular UI result messages on the existing 12k bounded renderer.
- Added focused tests proving large MCP text is not marked `[Result truncated]` before shared storage, and that `tool_result_storage` persists the full MCP assistant text including tail content.
- Preserved raw MCP `data` including `_meta`; shared preview/reference/file writing remains owned by core `tool_result_storage`.

### ISSUE-1150B MCP Elicitation Legacy Compatibility

Priority: P1
Status: Done
Goal: Match upstream legacy MCP elicitation compatibility by avoiding unsupported schema-validation capability claims.
Allowed files: `src/crates/services-integrations/src/mcp/protocol/client_info.rs`, `src/crates/services-integrations/tests/mcp_contracts.rs`, docs.
Forbidden files: MCP manager lifecycle migration, desktop UI, Flow Chat, provider adapters, media/short-drama services.
Acceptance:
- Client capability output no longer advertises elicitation schema validation unless a supported contract is implemented.
- Existing roots/sampling/elicitation capability tests are updated with explicit expected JSON.
- Remote POST-SSE tests continue to pass without changing transport routing.
Risk notes: Keep Streamable HTTP, legacy SSE, and local stdio transport semantics separate.
Progress:
- Replaced the explicit `schema_validation: Some(true)` elicitation claim with the base `enable_elicitation()` capability used by upstream.
- Updated the MCP client-info contract test to require roots, sampling, and elicitation while serializing elicitation as `{}` with no `schemaValidation`.
- Verified remote POST-SSE behavior without changing Streamable HTTP, legacy SSE, local stdio, MCP manager lifecycle, UI, provider, media, or short-drama code.

### ISSUE-1150C MCP Request Timeout Contract

Priority: P1
Status: Done
Goal: Define bounded timeout behavior for MCP ordinary requests without confusing initialize timeout, remote request timeout, and local stdio behavior.
Allowed files: MCP protocol/runtime tests and minimal timeout configuration code, docs.
Forbidden files: UI fallback strings, tool pipeline broad rewrite, runtime owner migration, provider/service mass moves.
Acceptance:
- Remote MCP request timeout remains bounded and covered for tools/list, tools/call, resources/read, and prompts/get.
- Local stdio ordinary request timeout is either explicitly bounded or explicitly documented as delegated to tool pipeline timeout with focused tests.
- Pending waiter cleanup is verified for timeout paths.
- Timeout failures return typed error categories suitable for `status/source/error` mapping.
Risk notes: Do not apply initialize-only timeout semantics blindly to every request path.
Result:
- Completed through `ISSUE-1150C1`, `ISSUE-1150C2`, and `ISSUE-1150C3`.
- Remote Streamable HTTP request timeout is covered at the helper boundary and through the `tools/list`, `tools/call`, `resources/read`, and `prompts/get` method wrappers.
- Local stdio ordinary request timeout remains a distinct optional connection field; production local default stays delegated to the outer tool pipeline timeout until a separate config/default issue.
- Timeout failures remain typed as `MCPRuntimeErrorKind::Timeout`.

#### ISSUE-1150C1 Local Stdio Request Timeout Injection Contract

Priority: P1
Status: Done
Goal: Add a local stdio MCP ordinary-request timeout contract without changing production defaults or confusing it with initialize timeout.
Allowed files: `src/crates/services-integrations/src/mcp/server/connection.rs`, docs.
Forbidden files: UI fallback strings, MCP manager lifecycle, tool pipeline broad rewrite, remote request timeout behavior, provider adapters, media/short-drama services, runtime owner migration.
Acceptance:
- Local stdio `MCPConnection` has a distinct optional ordinary request timeout separate from `initialize_timeout`.
- Tests can inject a short ordinary request timeout and prove `call_tool` returns `MCPRuntimeErrorKind::Timeout`.
- Timeout path removes the pending response waiter.
- Existing initialize timeout behavior remains independently covered on Windows; existing Unix-only tests still cover the slow local tool call not inheriting initialize timeout in Unix CI.
Progress:
- Added optional `request_timeout` to local/remote `MCPConnection` state and routed local ordinary `send_request_and_wait` through it.
- Kept production local default as `None`; this slice documents local ordinary requests as delegated to the outer tool pipeline timeout until a later config/default issue.
- Added Windows-runnable tests for local ordinary request timeout cleanup and local initialize timeout.
- Did not change remote Streamable HTTP timeout behavior, MCP manager lifecycle, tool pipeline, UI, provider adapters, AI media, AI short-drama, Cargo features, or crate layout.
- Verification: `cargo test -p void-services-integrations --features mcp --lib mcp::server::connection -- --nocapture`, `cargo test -p void-services-integrations --features mcp`, `cargo test -p void-core --test remote_mcp_streamable_http -- --nocapture`, `rustfmt --edition 2021 --check src/crates/services-integrations/src/mcp/server/connection.rs`, and `node scripts/check-core-boundaries.mjs` passed.
Deferred:
- Any future production default/config for local stdio ordinary request timeout remains a separate compatibility issue.

#### ISSUE-1150C2 Remote MCP Timeout Helper Contract

Priority: P1
Status: Done
Goal: Lock the remote Streamable HTTP ordinary-request timeout helper contract without changing production timeout behavior.
Allowed files: `src/crates/services-integrations/src/mcp/protocol/transport_remote.rs`, docs.
Forbidden files: UI fallback strings, MCP manager lifecycle, tool pipeline broad rewrite, local stdio timeout defaults, provider adapters, media/short-drama services, runtime owner migration.
Acceptance:
- `RemoteMCPTransport::await_with_optional_timeout` allows unbounded futures when timeout is `None`.
- The helper allows fast futures when a timeout is configured.
- A pending future with a configured timeout returns `MCPRuntimeErrorKind::Timeout` and preserves the operation-specific timeout message.
- The slice does not claim full remote method coverage for `tools/list`, `tools/call`, `resources/read`, or `prompts/get`.
Progress:
- Added file-local unit tests for the remote timeout helper's unbounded, fast, and timeout paths.
- No production behavior changed; existing remote Streamable HTTP timeout routing remains intact.
- Did not change UI, MCP manager lifecycle, tool pipeline, local stdio defaults, provider adapters, AI media, AI short-drama, Cargo features, or crate layout.
- Verification: `cargo test -p void-services-integrations --features mcp remote_mcp_request_timeout_helper --lib -- --nocapture` passed.
Deferred:
- Remote multi-method timeout failure coverage was completed later in `ISSUE-1150C3`; any future local production default/config wiring remains a separate compatibility issue.

#### ISSUE-1150C3 Remote MCP Method Timeout Coverage

Priority: P1
Status: Done
Goal: Prove the remote Streamable HTTP request timeout reaches the ordinary MCP method wrappers required by `ISSUE-1150C`.
Allowed files: `src/crates/core/tests/remote_mcp_streamable_http.rs`, `src/crates/services-integrations/src/mcp/server/connection.rs`, docs.
Forbidden files: UI fallback strings, MCP manager lifecycle, tool pipeline broad rewrite, provider adapters, media/short-drama services, runtime owner migration, default remote timeout value changes.
Acceptance:
- `tools/list`, `tools/call`, `resources/read`, and `prompts/get` return `MCPRuntimeErrorKind::Timeout` when the remote server stalls past an injected request timeout.
- The default remote constructor continues to use the production request timeout.
- The explicit short-timeout constructor accepts `Duration`, not `Option<Duration>`, so it does not become a public no-timeout escape hatch.
- The test does not assert rmcp request ids, exact elapsed time, connection reuse internals, or all possible MCP methods.
Progress:
- Added `MCPConnection::new_remote_with_request_timeout` as a narrow explicit timeout injection constructor that delegates to the same remote constructor path as the default.
- Added a Streamable HTTP integration test that stalls one method per server instance and verifies typed timeout results for `tools/list`, `tools/call`, `resources/read`, and `prompts/get`.
- Did not change default 120s remote timeout behavior, MCP manager lifecycle, tool pipeline, UI, provider adapters, AI media, AI short-drama, Cargo features, or crate layout.
- Verification: `cargo test -p void-core --test remote_mcp_streamable_http remote_mcp_streamable_http_request_timeout_covers_method_wrappers -- --nocapture` and `cargo test -p void-core --test remote_mcp_streamable_http -- --nocapture` passed.
Deferred:
- Local stdio production default/config remains a separate compatibility decision.

### ISSUE-1150D Readonly Manifest and Dynamic Provider Metadata Contract

Priority: P1
Status: Done
Goal: Make readonly/tool-provider metadata expectations explicit for product tools and dynamic MCP tools without changing model-facing schema prematurely.
Allowed files: `void-agent-tools` contract tests, `void-core` registry/product runtime tests, `void-tool-packs` tests/docs.
Forbidden files: concrete tool implementations, Web UI, MCP manager lifecycle, provider adapters, media/short-drama services.
Acceptance:
- Registry snapshot tests cover `readonly`, `enabled`, provider kind/id, and MCP server/tool metadata.
- GetToolSpec detail and readonly-enabled filtering preserve existing ordering and collapsed-tool contracts.
- Current image/media readonly tools use Void names (`AnalyzeImage`, `GetMediaTaskStatus`) rather than upstream names.
- Any duplicate `GetToolSpec` allowed-list behavior is documented as current contract or split into a separate fix.
Risk notes: `readOnlyHint` from MCP servers is not by itself a complete safety policy for destructive/open-world tools.
Progress:
- Added a focused `void-agent-tools` registry snapshot test covering readonly+enabled filtering, disabled-readonly exclusion, explicit MCP `providerKind`, `serverId`, `serverName`, and `toolName` metadata, and current `DynamicToolDescriptor` providerId-only compatibility.
- Preserved the current runtime-port descriptor shape; richer MCP subtype metadata stays behind `get_dynamic_tool_info` instead of being added to `DynamicToolDescriptor` or model-facing tool schemas.
- Existing core/tool-pack tests already cover builtin readonly manifest ordering, `AnalyzeImage` / `GetMediaTaskStatus` Void names, dynamic provider metadata, and provider group ordering.
- No concrete tools, Web UI, MCP manager lifecycle, provider adapters, media services, short-drama services, runtime DTOs, or crate layout were changed.
- Verification: `cargo test -p void-agent-tools registry_snapshot_preserves_readonly_enabled_and_dynamic_mcp_metadata --test tool_contracts -- --nocapture` passed. Additional verification is recorded in `docs/TEST_PLAN.md`.
- Deferred: any future descriptor/schema expansion for MCP subtype metadata requires a separate compatibility issue.

### ISSUE-1150E Tool Approval and Rejection Typed Outcomes

Priority: P2
Status: Done
Goal: Classify approval/rejection/denial/timeout outcomes at the tool pipeline boundary before adding or redesigning UI states.
Allowed files: tool pipeline/state manager tests and small result-shape helpers, docs.
Forbidden files: ToolApprovalBar UI redesign, Flow Chat card rewrite, event ABI migration, media/short-drama service changes.
Acceptance:
- User rejection, confirmation timeout, runtime restriction denial, collapsed-tool gate, MCP runtime error, and tool timeout each map to stable categories.
- Assistant-visible result can be represented with explicit `status/source/error/error_code/retryable` or an equivalent typed contract.
- Existing cancellation and completed states are not conflated with rejected/denied outcomes.
- Tests cover pipeline behavior before Web UI rendering.
Risk notes: UI should render typed state; it should not infer rejection or timeout by string matching.
Result:
- Closed by `ISSUE-1150E1`.
- Added a pipeline-owned `ToolPipelineOutcome` contract for status, source, category, error code, and retryability.
- Covered the parent acceptance paths for user rejection, confirmation timeout, runtime restriction denial, collapsed-tool gate denial, MCP runtime error, ordinary tool timeout, cancellation, and legacy category string stability at the helper boundary.
- Kept `not-found`, invalid-arguments, and generic execution errors represented by the typed helper contract, but direct test coverage for those non-parent paths remains narrower than the core acceptance coverage.
- Preserved existing assistant-visible error result shape, Flow Chat cards, ToolApprovalBar UI, event ABI, MCP manager lifecycle, provider adapters, AI media, and AI short-drama behavior.
- Deferred any future Web UI rendering or event schema migration to separate issues; the parent goal was the pipeline classification boundary before UI work.

### ISSUE-1150E1 Tool Pipeline Outcome Classification Contract

Priority: P2
Status: Done
Goal: Add a pipeline-owned typed outcome helper that classifies tool rejection, confirmation timeout, runtime denial, collapsed-tool gate denial, MCP runtime error, ordinary timeout, cancellation, not-found, invalid-arguments, and generic execution errors without changing UI or event ABI.
Allowed files: `src/crates/core/src/agentic/tools/pipeline/types.rs`, `src/crates/core/src/agentic/tools/pipeline/tool_pipeline.rs`, docs.
Forbidden files: `ToolApprovalBar`, Flow Chat cards, `void_events` event fields, MCP manager lifecycle, provider adapters, media services, short-drama services, crate moves.
Acceptance:
- Pipeline errors map to stable category strings plus internal status/source/error_code/retryable facts.
- Existing model-facing error result shape is preserved; `category` now comes from the typed outcome helper.
- User rejection and confirmation timeout are not conflated with generic invalid arguments or ordinary tool timeout.
- Tests cover each category at the helper boundary before any Web UI rendering work.
Result:
- Added `ToolPipelineOutcome`, `ToolPipelineOutcomeCategory`, `ToolPipelineOutcomeStatus`, and `ToolPipelineOutcomeSource`.
- Routed the existing `classify_tool_error()` through the typed helper while preserving the current error presentation shape.
- Added focused unit tests for user rejection, confirmation timeout, runtime denial, collapsed-tool gate denial, MCP runtime error, tool timeout, cancellation, and legacy category string stability.

### ISSUE-1150F Tool Runtime Owner Migration Planning Gate

Priority: P2
Status: Done
Goal: Preserve useful upstream owner-migration ideas while deferring high-risk crate/runtime moves behind explicit equivalence tests.
Allowed files: architecture docs, boundary scripts/tests, optional focused contract tests.
Forbidden files: direct crate moves, MCP runtime state migration, ExecCommand policy migration, remote file helper migration, event ABI migration, Web UI changes.
Acceptance:
- MCP runtime state, ExecCommand policy, remote file helpers, MCP/ACP bridge DTOs, tool snapshot ABI, and event projection manifest are tracked as separate migration candidates.
- Each candidate lists owner, forbidden dependencies, product behavior equivalence tests, and protected surfaces.
- No runtime/crate migration occurs inside this audit issue.
Risk notes: These upstream changes are architecture-scale; they must not be batched with MCP timeout, large-output, or readonly-manifest fixes.
Result:
- Registered upstream `65da1a082 refactor: establish tool and event ABI contracts` and `4da7ae5d8 refactor(core): establish plugin runtime boundary` as planning inputs only.
- Confirmed current Void already has local equivalents for several boundary ideas: `ToolCatalogSnapshotProvider`, `RuntimeEventSink`, runtime-port DTOs, tool/provider metadata contracts, and `scripts/check-core-boundaries.mjs` owner anchors.
- Split future migration candidates into separate gates: tool snapshot ABI, event projection manifest, plugin runtime/capability boundary, MCP runtime owner, ExecCommand/tool-runtime owner, and remote file/helper owner.
- For each candidate, recorded that implementation requires behavior-equivalence tests before any crate move, event shape change, or runtime owner migration.
- Did not change Rust/TS production code, Cargo manifests, event ABI, MCP lifecycle, tool execution behavior, Web UI, Flow Chat, multi-agent/subagent, AI media, or AI short-drama.

### ISSUE-1160 Theme Token Governance Incremental Upgrade

Priority: P1
Status: Done
Goal: Adapt upstream `082cee447` theme-governance improvements, especially near-color decision tracking and Tabs/token audit tightening, without changing product branding.
Allowed files: theme governance scripts/tests, component-library token docs, `Tabs.scss`, focused theme tests, docs.
Forbidden files: page-specific visual exceptions, BitFun branding, broad visual redesign, AI media/short-drama page logic.
Acceptance:
- `theme-color-near-pair-decisions.json` or an equivalent Void-owned governance artifact exists.
- Theme audits pass.
- Component token changes are documented and do not introduce page-level business logic.
Risk notes: Do not copy upstream BitFun class names or broad `tokens.scss` rewrites; visual polish must remain token-governed.
Result:
- Confirmed `ISSUE-1160A` already implemented the first safe near-color governance slice: Void-owned near-pair decisions, audit validation, focused Tabs destructive-close token conformance, and theme governance checks.
- Reviewed upstream theme work after `082cee447`, including `958a06095`, `797c94ad1`, `cae512b9f`, `50d33d506`, and `4e8c9c897`.
- Confirmed current Void already has `check:theme-colors`, `check:theme-visual-contract`, `scripts/theme-visual-governance-contract.json`, `scripts/validate-theme-visual-contract.mjs`, and near-pair decision validation.
- Confirmed remaining gaps: no `theme-css-var-contract` runtime contract, no ThemeService dynamic-token whitelist, no generated-widget theme payload compatibility contract, limited visual-evidence structure, and no dedicated AI media/short-drama token-boundary cleanup.
- Rejected direct copying of upstream broad `tokens.scss` compression, large SCSS color rewrites, BitFun/installer/CLI/mobile cross-surface baseline changes, and legacy mixin deletion.
- Did not change production code, ThemeService, tokens, generated-widget payload, Flow Chat, AI media, AI short-drama, terminal, provider, MCP, Rust crates, or brand assets in this audit.

### ISSUE-1160B Theme CSS Variable Runtime Contract

Priority: P1
Status: Done
Goal: Introduce a Void-owned machine-readable CSS variable contract that ties together ThemeService runtime injection, component-library token exports, audit exceptions, and dynamic token domains.
Allowed files: new `scripts/theme-css-var-contract.*`, `scripts/audit-theme-colors.mjs`, focused script tests, docs.
Forbidden files: `ThemeService.ts`, presets, widget payload runtime, page/component SCSS rewrites, Flow Chat/media/short-drama logic.
Acceptance:
- Contract records required token domains, allowed dynamic prefixes, legacy aliases, and fallback exceptions.
- `audit-theme-colors` consumes the contract or validates it without changing visual output.
- Tests cover valid contract, malformed contract, stale/unknown dynamic prefix, and current baseline compatibility.
- `pnpm run check:theme-colors` continues to pass.
Risk notes: This is a governance artifact first; do not change runtime token values in this slice.
Progress:
- Added `scripts/theme-css-var-contract.json` with required token domains, allowed dynamic prefixes, legacy aliases, and fallback exceptions.
- Extended `audit-theme-colors` to expose defined CSS vars, validate the contract by default, and report contract failures without changing visual output.
- Added focused script tests for valid contract data, malformed contract data, unknown dynamic prefixes, and current baseline compatibility.
- Preserved ThemeService, presets, generated-widget payload runtime, Flow Chat, AI media, AI short-drama, and page/component SCSS behavior.

### ISSUE-1160C ThemeService Runtime Token Whitelist

Priority: P1
Status: Done
Goal: Prevent custom themes from injecting arbitrary runtime CSS variables by applying a contract-backed whitelist in ThemeService.
Allowed files: `src/web-ui/src/infrastructure/theme/core/ThemeService.ts`, `ThemeService.test.ts`, theme contract files/tests, docs.
Forbidden files: preset visual value rewrites, component SCSS batch changes, widget iframe behavior changes, Flow Chat/media/short-drama business logic.
Acceptance:
- Unknown dynamic theme keys are ignored or rejected according to an explicit contract.
- Built-in themes still inject required background, text, accent, semantic, border, element, card, tool-card, Flow Chat link, and primary RGB variables.
- Tests cover all built-in themes plus a custom theme containing unsupported token keys.
- `pnpm --dir src/web-ui run test:run src/infrastructure/theme/core/ThemeService.test.ts src/infrastructure/theme/presets/startupThemeBootstrap.test.ts` and `pnpm run type-check:web` pass.
Risk notes: ThemeService must stay a token injection layer and must not inspect session, provider, media, or short-drama state.
Progress:
- Added suffix-level allowlists for ThemeService dynamic CSS variable domains instead of treating the CSS contract as a full fixed-variable allowlist.
- Filtered custom theme dynamic keys for accent, purple, shadow, blur, radius, spacing, motion, easing, font weight, font size, and line height injection.
- Added ThemeService tests proving unsupported custom dynamic keys are ignored, built-in themes still inject required and fixed runtime variables, and runtime dynamic prefixes stay aligned with the CSS variable contract.
- Preserved preset values, component SCSS, widget payload runtime, Flow Chat, AI media, AI short-drama, and page/component styles.

### ISSUE-1160D Generated Widget Theme Payload Compatibility Contract

Priority: P1
Status: Done
Goal: Make generated-widget theme payload compatibility explicit before reducing or renaming host CSS variables.
Allowed files: `src/web-ui/src/tools/generative-widget/themePayload.ts`, optional `themePayloadCompatibility.ts`, focused widget theme payload tests, theme color governance baseline if verification improves it, docs.
Forbidden files: ThemeService runtime changes without 1160C, widget business logic, app store access, Flow Chat/media/short-drama state.
Acceptance:
- Required, optional, and legacy widget theme variables are documented and tested.
- Existing generated widgets keep fallback compatibility for known legacy aliases.
- Payload reader remains a pure host CSS-var reader; it does not infer app state.
- Focused tests cover missing vars, legacy aliases, current payload keys, and at least one dark/light theme sample.
Risk notes: Widget iframe compatibility is a boundary; do not delete or rename vars without a compatibility map.
Progress:
- Exported a generated-widget theme payload contract with required vars, optional vars, and known legacy aliases.
- Extended `readWidgetThemePayload` with `contractVersion`, `status`, `source`, `missingRequiredVars`, `appliedLegacyAliases`, and typed error metadata while preserving `id`, `type`, and `vars` compatibility.
- Added legacy alias backfill for `--color-border-default` and `--border-base` in both directions.
- Added focused tests for contract documentation, current keys, legacy fallback, missing required vars, unknown var isolation, and light/dark host theme samples.
- Tightened the theme color governance fallback-only baseline from 78 to 77 after the widget payload reader promoted one fallback-only token into the explicit payload contract.
- Preserved ThemeService, widget iframe business logic, MiniApp `--void-*` payloads, Flow Chat, AI media, and AI short-drama logic.

### ISSUE-1160E Theme Visual Governance Evidence Contract

Priority: P2
Status: Done
Goal: Strengthen the visual governance contract so theme-sensitive surfaces declare verifiable evidence beyond free-form review text.
Allowed files: `scripts/theme-visual-governance-contract.json`, `scripts/validate-theme-visual-contract.mjs`, focused validator tests, docs.
Forbidden files: screenshot tooling overhaul, page SCSS rewrites, runtime theme changes, product business logic.
Acceptance:
- Evidence entries can declare theme, viewport, state, command/artifact name, and whether evidence is automated, manual, or deferred.
- Existing surfaces remain covered: app shell, Flow Chat, terminal, markdown/Mermaid, generated widgets, media/short-drama, mobile web, installer.
- Validator rejects missing required paths, unknown evidence types, and BitFun branding strings.
- `pnpm run check:theme-visual-contract` passes.
Risk notes: This contract still does not prove screenshots passed; it only makes evidence expectations machine-checkable.
Progress:
- Added entry-level evidence metadata for every visual-governance surface: `mode`, `theme`, `viewport`, `state`, and `command` or `artifactName`.
- Extended the validator with `--contract <path>` support so focused tests can validate fixture contracts without mutating the real contract.
- Added validator checks for unknown evidence modes, missing evidence metadata, missing command/artifact declarations, unknown evidence types, and upstream branding strings.
- Added focused validator tests covering current contract metadata, malformed fixture contracts, unsupported modes/types, and BitFun branding rejection.
- Preserved screenshot tooling, page/component SCSS, ThemeService runtime behavior, Flow Chat, AI media, AI short-drama, installer/release workflow, and product business logic.

### ISSUE-1160F AI Media and Short-Drama Theme Token Boundary

Priority: P2
Status: Done
Goal: Define and gradually reduce theme-color debt in AI media and AI short-drama surfaces without changing their state models or workflows.
Allowed files: media/short-drama SCSS token wrappers, focused style tests or audit fixtures, docs.
Forbidden files: media/short-drama service logic, ShortDramaProject tool behavior, Flow Chat session logic, ThemeService runtime whitelist, broad baseline rewrite.
Acceptance:
- Media and short-drama surfaces use semantic local tokens that map to global theme tokens.
- Raw colors and `--void-*` fallback usage are audited before any visual change.
- Any visual cleanup is one domain at a time and lowers or preserves the theme-color baseline.
- Focused workspace-media and short-drama tests plus theme audit pass.
Risk notes: Do not encode artifact status, media availability, or stage ownership into theme governance scripts or global tokens.
Progress:
- Completed the entry-button token boundary slice for `WorkspaceMediaEntry.scss` and `ShortDramaEntry.scss`.
- Replaced direct `--void-*` dependencies in the entry buttons with local semantic tokens mapped to global theme tokens such as `--color-bg-primary`, `--color-text-*`, and `--border-base`.
- Added `scripts/media-short-drama-entry-theme.test.mjs` to lock the entry styles to local token prefixes and prevent reintroducing direct `--void-*` dependencies.
- Preserved Workspace Media availability behavior, Short Drama entry click behavior, Gallery/CenterPanel styles, services, Flow Chat session logic, ThemeService runtime behavior, and broad baselines.
- Completed the Workspace Media Gallery token wrapper slice: `WorkspaceMediaGallery.scss` now defines `--workspace-media-gallery-*` local tokens mapped to global theme tokens, and no longer directly uses `--void-*`.
- Added `scripts/workspace-media-gallery-theme.test.mjs` to lock the Gallery style boundary.
- Lowered the web theme-color governance baseline after the audit showed reduced `uniqueColors`, `cssVars.fallbackOnlyUnique`, and `nearPairs.nearTotal`.
- Preserved Workspace Media Gallery React state, pending generation, preview, selection, delete/restore/purge behavior, media services, Short Drama files, Flow Chat session logic, and ThemeService runtime behavior.
- Completed the Short Drama CenterPanel local-token boundary slice: `ShortDramaCenterPanel.scss` now maps local tokens to global theme tokens, consumes its local band token, and no longer directly uses `--void-*` or the undefined `--short-drama-text`.
- Added `scripts/short-drama-center-theme.test.mjs` to lock the CenterPanel style boundary.
- Lowered the web theme-color governance baseline after the audit showed reduced `cssVars.fallbackOnlyUnique` and `cssVars.undefinedUnique`.
- Preserved Short Drama CenterPanel TSX state, stage navigation, workspace manifest interpretation, stage-agent tabs, artifact/media recovery, Flow Chat/runtime coordination, media services, and ThemeService runtime behavior.
- Completed the Workspace Media Gallery pending/generator visual token slice: generator glow, dark surface, grid, beam, ring, and core colors now use `--workspace-media-generator-*` local tokens.
- Added `scripts/workspace-media-gallery-generator-theme.test.mjs` to lock the generator visual token boundary.
- Preserved Gallery TSX state, pending generation ownership, media availability, preview resolution, selection, delete/restore/purge behavior, media services, and ThemeService runtime behavior.
- Completed the Workspace Media Gallery card chrome visual token slice: fallback, placeholder, waveform, play/type badges, action buttons, overlay, unavailable text, and local divider colors now use `--workspace-media-card-chrome-*` tokens.
- Added `scripts/workspace-media-gallery-card-chrome-theme.test.mjs` to lock the card chrome visual token boundary.
- Preserved Gallery TSX state, media availability, previewability, pending generation ownership, selection, delete/restore/purge behavior, media services, and ThemeService runtime behavior.
- Completed the Workspace Media Gallery operation-error token slice: operation error border/text now use local Gallery error tokens.
- Added `scripts/workspace-media-gallery-operation-error-theme.test.mjs` to lock the operation-error token boundary.
- Preserved Gallery TSX operation state, failure source, delete/restore/purge behavior, media services, and ThemeService runtime behavior.
- Completed the ShortDramaCenterPanel status pill token slice: ready/done, generating/reviewing/revising, stale, and error/unsupported/needs-intervention indicator dots now use local `--short-drama-status-*` tokens.
- Added `scripts/short-drama-center-status-theme.test.mjs` to lock the status pill token boundary.
- Preserved CenterPanel TSX state, status ownership, stage navigation, artifact/media recovery, short-drama services, media services, Flow Chat coordination, and ThemeService runtime behavior.
- Completed the ShortDramaCenterPanel media-preview token slice: default preview backdrop, empty/missing/referenced state, generating state, media fallback, and caption overlay/text colors now use local `--short-drama-preview-*` tokens.
- Added `scripts/short-drama-center-media-preview-theme.test.mjs` to lock the media-preview token boundary.
- Preserved CenterPanel TSX preview resolution, media availability classification, artifact/media recovery, short-drama services, media services, Flow Chat coordination, and ThemeService runtime behavior.
- Completed the ShortDramaCenterPanel final-preview token slice: wrapper surface, frame border/background, media border, empty-frame background, and on-frame text now use local `--short-drama-final-preview-*` tokens.
- Added `scripts/short-drama-center-final-preview-theme.test.mjs` to lock the final-preview token boundary.
- Preserved CenterPanel TSX final preview readiness, empty-state classification, preview resolution, short-drama services, media services, Flow Chat coordination, and ThemeService runtime behavior.
- Completed the ShortDramaCenterPanel stage card token slice: card surface, poster default/stage gradients, notice accent, media-reference surface, and stage rail surface now use local `--short-drama-card-*` and `--short-drama-stage-rail-*` tokens.
- Added `scripts/short-drama-center-stage-card-theme.test.mjs` to lock the stage card token boundary.
- Preserved CenterPanel TSX stage ownership, stage navigation, artifact status, media references, stage-agent coordination, short-drama services, media services, Flow Chat coordination, and ThemeService runtime behavior.
- Result: `ISSUE-1160F` scoped selector-level media/short-drama token boundary cleanup is complete. Future rendered screenshot review, contrast tuning, or broader root-token consolidation should be separate issues.

### ISSUE-1160A Theme Near-Color Governance Slice

Priority: P1
Status: Done
Goal: Implement the first safe theme-governance slice by adding a Void-owned near-color decision artifact, focused audit coverage, and at most a small Tabs token conformance cleanup.
Allowed files: `scripts/audit-theme-colors.mjs`, `scripts/audit-theme-colors.test.mjs`, `scripts/theme-color-near-pair-decisions.json`, `src/web-ui/src/component-library/components/Tabs/Tabs.scss`, optional focused component token test, `docs/PROGRESS.md`, `docs/TEST_PLAN.md`, `docs/ISSUES.md`.
Forbidden files: `ThemeService.ts`, theme presets, mobile or installer theme files, Flow Chat, AI media, AI short-drama, terminal, Computer Use, provider/service, Rust crates, BitFun branding.
Acceptance:
- Near-color decision artifact validates shape and is checked by focused tests.
- `pnpm run check:theme-colors` and `pnpm run check:theme-visual-contract` pass.
- Any Tabs cleanup uses existing component-library tokens or CSS vars and does not create page-level exceptions.
Risk notes: Keep this as governance plus one component-library cleanup; generated widget compatibility and runtime ThemeService expansion remain separate issues.
Result:
- Added `scripts/theme-color-near-pair-decisions.json` as a Void-owned near-color governance artifact.
- Extended `scripts/audit-theme-colors.mjs` to validate near-pair decision shape and stale entries through the existing audit CLI.
- Added focused node tests for near-pair decision validation and Tabs destructive close styling token conformance.
- Replaced the Tabs close-hover raw destructive color with existing component-library red tokens.
- Did not change ThemeService runtime behavior, presets, generated widget payload compatibility, Flow Chat, AI media, AI short-drama, terminal, provider, Computer Use, Rust crates, or brand assets.

### ISSUE-1170 Provider Service Boundary Study

Priority: P2
Status: Done
Goal: Study upstream provider HTTP owner moves and identify one possible low-risk boundary improvement for current Void.
Allowed files: docs and static boundary checks first.
Forbidden files: provider adapter mass move, crate layout changes, runtime behavior changes without a follow-up issue.
Acceptance:
- Current provider ownership is mapped.
- One optional small boundary issue is proposed or the work is deferred.
Risk notes: UI catalog, core config, provider adapters, and stream usage tests must move together or not at all.
Result:
- Reviewed upstream provider/service boundary commits including `96cea08ca`, `629ced40a`, `47b5d6c94`, `a29bd63d2`, `4077c1a8a`, `545e81e23`, `01e067e97`, `314116874`, `94ed21559`, `d8ee47156`, `adaff67e7`, and `687ac8a51`.
- Confirmed upstream `96cea08ca` is primarily an owner-migration pattern: HTTP transport owners such as Web tools, CDP, debug-log, and review-platform clients move from assembly/core to `services-integrations`, while core keeps product semantics and facade contracts.
- Confirmed current Void already has `void-ai-adapters` as the provider request/response, HTTP/SSE, stream parsing, tool-call aggregation, model discovery, and health-check boundary.
- Confirmed current coupling points: `provider` and wire `format` are still mixed across UI/core/adapter config, request URL derivation exists in multiple places, provider catalogs are duplicated, adapter quirks still use URL/model string matching, and transport retry vs core business retry must remain distinct.
- Split follow-up work into `ISSUE-1170A` provider HTTP boundary static audit, `ISSUE-1170B` AI connection-test error classification, `ISSUE-1170C` OpenAI content-part array parser regression, `ISSUE-1170D` SSE handler cancellation contract, and `ISSUE-1170E` image-understanding capability reconcile.
- Preserved protected surfaces: no production code, provider adapter, Web UI config, core config, stream handler, runtime behavior, crate layout, Flow Chat, multi-agent/subagent, AI media, AI short-drama, terminal, MCP, or Computer Use files were changed in this audit.

### ISSUE-1170A Provider HTTP Boundary Static Audit

Priority: P2
Status: Done
Goal: Add a small static boundary check or documented rule that provider HTTP/SSE owners stay inside `void-ai-adapters` or an explicitly named service adapter.
Allowed files: boundary scripts/tests and docs only.
Forbidden files: provider implementation moves, crate layout changes, request/stream behavior changes.
Acceptance:
- Legal HTTP owner paths are listed in `docs/ARCHITECTURE.md`.
- Core/product paths are checked or documented as forbidden places for provider-specific HTTP ownership.
- Existing `void-ai-adapters` ownership stays unchanged.
- Static checking lives in `forbiddenContentUnderRules`; it is not a Cargo dependency, facade-only, or required-content rule.
Risk notes: This is governance only; it must not become a hidden crate migration.
Result:
- Added a focused `src/crates/core/src` guard in `scripts/check-core-boundaries.mjs` for provider-specific HTTP/SSE ownership signals.
- The rule forbids core-owned OpenAI/Anthropic/Gemini transport lines coupled to `reqwest` and direct provider SSE parser imports such as `eventsource_stream::` or `sse_stream::`.
- The rule intentionally does not ban all `reqwest::Client` usage, provider config strings, credential discovery URLs, APIMart media HTTP, web tools, remote bots, or review-platform HTTP clients.
- Added self-test coverage for the provider HTTP/SSE owner boundary.
- No provider implementation, crate layout, request behavior, stream behavior, Flow Chat, AI media, AI short-drama, terminal, MCP, Computer Use, or theme runtime code was changed.

### ISSUE-1170B AI Connection Test Error Classification

Priority: P2
Status: Done
Goal: Evaluate upstream connection-test refinements and add typed TLS/proxy/network/provider error classification if local tests prove a low-risk adapter/UI boundary.
Allowed files: focused `void-ai-adapters` health-check code, bridge result types, AI error presenter/config tests, docs.
Forbidden files: provider catalog redesign, model config schema migration, broad UI settings rewrite.
Acceptance:
- Connection-test failures return or map to explicit categories.
- User-facing errors remain readable and diagnostics do not leak API keys or raw secrets.
- Retry count changes are out of scope unless covered by a separate focused test.
Risk notes: Do not mix this with provider instance or URL catalog refactors.
Result:
- Added `ConnectionTestErrorCategory` in `void-ai-adapters` and attached it as an optional `error_category` on failed connection-test results.
- Classified auth, quota, proxy, TLS, timeout, network, provider, and unknown failures inside the adapter health-check boundary while preserving raw `error_details`.
- Propagated the optional category through core, desktop connection-test merge paths, installer bridge types, and Web/installer TypeScript result contracts without adding UI presentation logic.
- Added adapter tests for classifier behavior and legacy JSON compatibility when `error_category` is absent.

### ISSUE-1170C OpenAI Content-Part Array Parser Regression

Priority: P2
Status: Done
Goal: Port the upstream parser guard that only treats valid OpenAI content-part arrays as multimodal message parts.
Allowed files: OpenAI adapter message converter and focused adapter tests.
Forbidden files: tool schemas, Flow Chat message UI, media/short-drama context plumbing, non-OpenAI provider behavior.
Acceptance:
- Plain JSON arrays used as text/tool content remain text.
- Valid multimodal content-part arrays still serialize correctly.
- Regression tests cover tool JSON arrays, mixed invalid arrays, and valid content parts.
Risk notes: This must not weaken AI media or image-context attachment semantics.
Result:
- Added OpenAI Chat Completions content-part validation inside `OpenAIMessageConverter`.
- Plain JSON arrays and mixed invalid content-part arrays now stay string content instead of being passed as OpenAI multimodal arrays.
- Valid Chat Completions `text` and `image_url` content-part arrays still pass through unchanged.
- Existing Responses API image-content conversion and tool-image attachment behavior remain unchanged.

### ISSUE-1170D SSE Handler Cancellation Contract

Priority: P2
Status: Done
Goal: Evaluate upstream orphan-stream-handler cancellation and add a local contract test before changing handler ownership.
Allowed files: `void-ai-adapters` SSE/stream handler tests and minimal handler lifecycle code if proven necessary.
Forbidden files: core turn cancellation semantics, Flow Chat state, terminal, MCP, provider catalog/config.
Acceptance:
- Dropping/canceling a stream stops provider handler work.
- Completed streams still deliver usage/tool-call events.
- Core retry and adapter transport retry remain separate.
Risk notes: Incorrect cancellation can drop final usage, leak tasks, or multiply provider requests.
Result:
- Added an adapter-owned abort-on-drop wrapper for `StreamResponse.stream` so dropping the returned stream aborts the spawned provider handler task.
- Changed provider `spawn_handler` closures to return their `JoinHandle` to `execute_sse_request` without exposing handler handles through the public `StreamResponse` shape.
- Added the same receiver-closed cancellation path to OpenAI, Anthropic, Gemini, and Responses handlers so a closed event receiver stops waiting for more provider SSE bytes.
- Added TDD coverage for stream-drop abort and OpenAI handler receiver-drop cancellation; existing stream harness coverage proves completed streams still deliver usage/tool-call events.

### ISSUE-1170E Image Understanding Capability Reconcile

Priority: P2
Status: Done
Goal: Study and, if safe, implement a Void-native default-model reconcile so image-understanding defaults cannot silently point at text-only models.
Allowed files: focused config/capability helpers and tests after a separate implementation gate.
Forbidden files: generic image tool rewrites, upstream `view_image` copy, media/short-drama source-of-truth changes.
Acceptance:
- Image-understanding model capability checks are explicit.
- Default image-understanding selection ignores disabled or text-only models.
- Existing AI media and AI short-drama image semantics remain protected.
Risk notes: This belongs after `ISSUE-1140` image-context guard work if capability state is still ambiguous.
Result:
- Added `AIConfig` helpers for image-understanding capability checks and first enabled image-capable default selection.
- Extended `ConfigService::reconcile_models` so `ai.default_models.image_understanding` is repointed only to an enabled image-understanding-capable model, or cleared when none exists.
- Updated `resolve_vision_model_from_ai_config` to share the same capability predicate while preserving disabled/text-only error classification and allowing saved `name` / `model_name` references to resolve to canonical model ids.
- Preserved `AnalyzeImage` runtime behavior, provider multimodal wire conversion, AI media, AI short-drama, Flow Chat, Web UI, and upstream `view_image` boundaries.

### ISSUE-1180 Core Crate Decomposition Deferred Plan

Priority: P2
Status: Done
Goal: Extract useful architectural ideas from upstream crate decomposition while explicitly deferring directory migration.
Allowed files: docs and boundary checker references.
Forbidden files: Cargo manifests, crate moves, module renames, production code.
Acceptance:
- Deferred rationale is updated.
- Boundary checker gaps, if any, are proposed as separate small issues.
Risk notes: Crate movement is explicitly deferred; this issue may only improve documentation or static boundary checks.
Result:
- Reviewed upstream crate decomposition commits including `fb8333afa`, `ea5321d66`, `401b9e61a`, `8338441c`, `213299206`, `a7fc6dcd1`, `98f0f4113`, `bceded210`, `8d69e5733`, `96cea08ca`, `47b5d6c94`, and `a29bd63d2`.
- Confirmed upstream's useful pattern is staged ownership: first define product assembly/runtime-service contracts, then add boundary checks, then migrate concrete owners only behind focused evidence.
- Explicitly deferred upstream six-layer physical layout (`interfaces`, `assembly`, `adapters`, `services`, `execution`, `contracts`) because current Void uses a flat `src/crates/*` layout with existing protected local modules.
- Confirmed current Void already has meaningful crate boundaries and static checks: no owner crate may depend back on `void-core`, lightweight contract crates reject heavy/runtime deps, product entrypoints must use `product-full`, and legacy facades are checked as re-export/narrow mapping surfaces.
- Confirmed remaining blockers: `void-core` still owns full runtime assembly, service/agent coupling still needs ports, concrete tool and MiniApp runtimes remain in core, and static boundary checks do not prove product behavior equivalence.
- Split follow-up work into `ISSUE-1180A` conceptual layer mapping, `ISSUE-1180B` product assembly contract spike, `ISSUE-1180C` runtime-services gap audit, `ISSUE-1180D` high-risk migration registry, and `ISSUE-1180E` product-full guardrail audit.
- Preserved protected surfaces: no Cargo manifests, crate directories, module names, production code, boundary script behavior, Flow Chat, multi-agent/subagent, AI media, AI short-drama, terminal, Computer Use, MCP, provider, desktop, CLI, ACP, or installer files were changed.

### ISSUE-1180A Conceptual Layer Mapping

Priority: P2
Status: Done
Goal: Document how current flat `src/crates/*` maps to upstream's conceptual ownership layers without moving directories.
Allowed files: docs and, if necessary, boundary checker comments or docs-only references.
Forbidden files: Cargo workspace members, crate directory moves, module renames, production imports.
Acceptance:
- Current crates are mapped to conceptual assembly/contracts/execution/services/adapters/surfaces responsibilities.
- The mapping states that it is not a migration plan.
- Boundary checker behavior remains unchanged unless separately reviewed.
Risk notes: Do not turn conceptual labels into physical path requirements.
Result:
- Added a non-migration conceptual layer mapping to `docs/architecture/core-decomposition.md`.
- Mapped current Void flat crates and app surfaces to upstream-inspired `surfaces`, `assembly`, `contracts/interfaces`, `execution`, `services`, and `adapters` responsibilities, including crate-level notes for `void-core`, `void-tool-packs`, `void-acp`, `void-transport`, and provider/service owners.
- Recorded explicit prohibitions against mirroring upstream directories, moving workspace members, renaming crates/modules, treating `target`/`partial`/concept labels as migration status, or using conceptual labels to migrate concrete runtime owners.
- Reaffirmed DEC-073: upstream six-layer physical layout remains rejected as a directory structure.
- Kept boundary checker behavior unchanged; existing `scripts/check-core-boundaries.mjs` remains the active static guard.

### ISSUE-1180B Product Assembly Contract Spike

Priority: P2
Status: Done
Goal: Evaluate whether Void needs a docs-only equivalent of upstream `ProductAssemblyPlan` / `DeliveryProfile` / service availability reporting.
Allowed files: architecture docs and issue docs.
Forbidden files: new Rust APIs, product profile changes, feature graph changes, SDK profile implementation.
Acceptance:
- Product assembly responsibilities are described separately from agent runtime behavior.
- Any SDK/minimal runtime idea is deferred behind a future implementation issue.
- Existing desktop, CLI, ACP, server, relay, multi-agent, media, and short-drama assembly expectations remain unchanged.
Risk notes: A contract spike must not create a second product runtime path.
Result:
- Added a docs-only product assembly contract snapshot to `docs/architecture/core-decomposition.md`.
- Recorded that Void does not currently need a Rust `ProductAssemblyPlan`, `DeliveryProfile`, service availability API, or SDK/minimal runtime profile.
- Documented current assembly facts for desktop, CLI, server, relay, `void-core product-full`, tool packs/product tool runtime, product-domain runtime, and service/runtime-port bindings.
- Deferred any smaller delivery profile or service availability report behind a future product decision issue with snapshot/manifest/feature-graph evidence.
- Preserved existing desktop, CLI, ACP, server, relay, multi-agent, media, short-drama, terminal, Computer Use, provider, MCP, and installer expectations without code changes.

### ISSUE-1180C Runtime Services Gap Audit

Priority: P2
Status: Done
Goal: Compare current `void-runtime-ports`, `void-services-core`, and `void-services-integrations` against upstream runtime service boundaries and list only gaps.
Allowed files: docs and read-only inspection first.
Forbidden files: concrete service movement, manager extraction, scheduler/session restore changes.
Acceptance:
- Each gap says whether it is contract-only, service-helper, or concrete-runtime work.
- Concrete runtime work is split into separate implementation issues.
- Existing `void-core` compatibility ownership remains explicit.
Risk notes: Do not treat a port DTO as proof that runtime ownership migrated.
Result:
- Added a runtime services gap audit to `docs/architecture/core-decomposition.md`.
- Classified gaps as `contract-only`, `service-helper`, or `concrete-runtime` for agent/session ports, remote-connect helpers, filesystem operations, session/usage summaries, product-domain runtime bindings, MCP runtime slices, remote SSH/file watch/Git integrations, terminal runtime services, and product tool runtime.
- Kept `void-core` compatibility ownership explicit for scheduler/session restore, product dispatch, terminal pre-warm, remote image conversion, product-domain concrete adapters, and product tool materialization.
- Deferred all concrete runtime work behind separate issues with snapshot/equivalence tests; no service movement, manager extraction, scheduler/session restore, Cargo, or source changes were made.

### ISSUE-1180D High-Risk Migration Registry

Priority: P2
Status: Done
Goal: Register high-risk upstream owner migrations as candidates with required snapshot and focused-test prerequisites.
Allowed files: docs only.
Forbidden files: any implementation migration.
Acceptance:
- Candidate entries include commits such as `213299206`, `98f0f4113`, `bceded210`, `96cea08ca`, and `8d69e5733`.
- Each candidate lists protected local surfaces and required verification before code.
- Candidates are explicitly not approved for implementation by being registered.
Risk notes: This is a risk ledger, not a backlog permission slip.
Result:
- Added `High-risk migration registry（风险登记，不是迁移许可）` to `docs/architecture/core-decomposition.md`.
- Registered high-risk candidates for concrete runtime owner moves, terminal exec runtime ports, remote exec runtime ports, provider HTTP owner movement, MCP runtime state movement, product tool runtime owner split, and product-full/app assembly profile split.
- Listed protected local surfaces and required snapshot/focused-test evidence for each candidate before code.
- Recorded DEC-120 to state that registry entries are gates, not approvals; no implementation migration, Cargo, feature graph, app entrypoint, manager owner, scheduler/session restore, terminal, provider, MCP, AI media, AI short-drama, or product runtime changes were made.

### ISSUE-1180E Product-Full Guardrail Audit

Priority: P2
Status: Done
Goal: Verify current `product-full` guardrails and app entrypoint feature assembly before any future SDK/minimal runtime discussion.
Allowed files: docs, boundary check output notes, possibly focused boundary checker tests after separate approval.
Forbidden files: feature graph changes, new delivery profiles, app entrypoint changes.
Acceptance:
- Desktop, CLI, ACP, server, and relay assembly expectations are listed.
- `product-full` remains the supported full-capability path.
- Any SDK/no-product-full idea remains deferred.
Risk notes: Do not import upstream SDK profile until Void has an explicit product requirement.
Result:
- Added `Product-full guardrail audit（入口组装保护线）` to `docs/architecture/core-decomposition.md`.
- Recorded that desktop, CLI, and ACP explicitly depend on `void-core` with `default-features = false` and `features = ["product-full"]`.
- Recorded that server and relay are existing app surfaces, not SDK/minimal runtime profiles.
- Recorded that `void-core default = ["product-full"]` and `void-core/product-full` explicitly aggregates current owner feature groups.
- Recorded DEC-121; no `Cargo.toml`, feature graph, app entrypoint, `DeliveryProfile`, SDK/minimal runtime, service availability API, or runtime behavior changes were made.

### ISSUE-1190 Upstream Canvas and Turn-Ownership Incremental Inventory

Priority: P0
Status: Done
Goal: Refresh the upstream candidate inventory from `upstream-bitfun/main@ea14b2d42` and classify the new Canvas, Flow Chat ownership, CLI rich model-round persistence, miniapp icon, tool-card, and theme-governance deltas without changing production code.
Allowed files: consensus docs only.
Forbidden files: `src/**`, scripts, Cargo manifests, Web UI runtime, Flow Chat implementation, AI media, AI short-drama, terminal, provider, Computer Use, generated files.
Affected module: upstream migration governance.
Acceptance:
- The new upstream reference and commit range are recorded.
- Canvas is classified as a high-value but high-risk product-domain wave, not a direct merge candidate.
- Low-risk Flow Chat/governance follow-ups are split into small issues.
- Protected local surfaces are restated: multi-agent, subdialogs, floating chat, AI short-drama canvas, AI media, terminal, Computer Use, provider, and Void brand.
Result:
- Fetched `GCWing/BitFun main` into `refs/remotes/upstream-bitfun/main`, advancing the observed upstream wave from `4da7ae5d8` to `ea14b2d42`.
- Reviewed non-merge commits: `94409f3fe`, `b8f6335de`, `5f5ff9af8`, `4a989d7f8`, `6560c99c7`, `c457aa17b`, `9440f62ce`, `2e6b56bf9`, `aecab3b08`, `6fd87c11a`, `d455a6a74`, `0d195e947`, and `32e895dd4`.
- Classified the Canvas wave as valuable architecture input for persistent interactive artifacts, exact patch/update semantics, diagnostics, last-known-good compiled payloads, and SDK guidance, but rejected direct migration of `bitfun-canvas` runtime, iframe bridge, skills, desktop APIs, `core.canvas` exposure, and session-scoped Canvas storage into current Void.
- Split follow-up issues below for Flow Chat turn-navigation ownership tests, Canvas/artifact domain RFC, GenerativeUI/Canvas/miniapp boundary, Canvas runtime security review, tool-card/icon governance, theme domain governance, and CLI rich model-round persistence audit.
- No production code, scripts, Cargo manifests, Web UI runtime, Flow Chat, AI media, AI short-drama, terminal, provider, Computer Use, or generated files were changed.

### ISSUE-1190A Flow Chat Turn Navigation Ownership Parity Tests

Priority: P0
Status: Done
Goal: Compare upstream `32e895dd4` turn-navigation ownership semantics against current Void, add missing tests, and apply only the minimal Flow Chat interface-layer fixes needed by those tests before considering any `pinTurnToTop` status-model change.
Allowed files: Flow Chat header/follow-output tests, existing Flow Chat turn-navigation e2e spec, `FlowChatHeader.tsx`, `ModernFlowChatContainer.tsx`, `useFlowChatFollowOutput.ts`, docs.
Forbidden files: `FlowChatStore`, `modernFlowChatStore`, session restore/deferred hydration APIs, backend/Tauri/Rust history restore, terminal, AI media, AI short-drama, subagent/BTW internals, Canvas tool-card changes.
Acceptance:
- `FlowChatHeader` tests cover accepted turn selection closing the list and rejected selection keeping the list open.
- `useFlowChatFollowOutput` tests cover explicit user upward scroll intent exiting follow-output before scroll metrics move, and user intent canceling armed auto-follow.
- The release turn-navigation e2e includes a focused assertion that the header turn list disappears after a successful selection.
- No runtime ownership model is changed unless a failing test proves the current container-level retry contract is insufficient.
Result:
- Added `FlowChatHeader` coverage for accepted selection closing the list and rejected selection keeping it open.
- Added `useFlowChatFollowOutput` coverage for explicit user upward intent exiting follow-output before browser scroll metrics move and canceling armed auto-follow.
- Added the focused release e2e assertion that the header turn list disappears after successful selection.
- Kept the existing container-level retry contract and did not migrate to upstream `FlowChatTurnPinRequestStatus`.
Risk notes: Current Void already covers most user-visible behavior through `ISSUE-1110A/B/C`; this issue is test-first parity, not a wholesale migration to upstream `FlowChatTurnPinRequestStatus`.

### ISSUE-1190B Canvas Artifact Domain RFC

Priority: P1
Status: Done
Goal: Define a Void-owned persistent interactive artifact domain contract inspired by upstream Canvas without adopting BitFun runtime paths or session storage as a source of truth.
Allowed files: docs first; optional future domain contract tests after a separate implementation gate.
Forbidden files: Canvas runtime implementation, desktop Canvas APIs, iframe bridge, `core.canvas` tool exposure, skills registration, AI short-drama source-of-truth changes, AI media storage changes, Cargo feature graph changes.
Acceptance:
- The RFC distinguishes current `GenerativeUI`, miniapps, AI media artifacts, AI short-drama project artifacts, and any future persistent interactive artifact.
- Artifact state uses explicit `status/source/error/diagnostic` facts and does not rely on UI panel state as the source of truth.
- Short-drama project facts remain owned by `ShortDramaProject` / `.void/short-drama`; Canvas-like artifacts may only be projections unless a future issue changes ownership explicitly.
Result:
- Added `docs/architecture/canvas-artifact-domain-rfc.md`.
- Recorded existing ownership for `GenerativeUI`, MiniApps, AI media, AI short-drama artifacts, and future persistent interactive artifacts.
- Required Void-owned logical references, snapshot/source/state/diagnostic facts, exact unique patch semantics, and last-known-good compiled payload behavior for any future implementation.
- Added DEC-125 to require a Void-owned artifact interface before runtime code.
- No Canvas runtime, desktop API, iframe bridge, skills, `core.canvas` exposure, AI media storage, AI short-drama source-of-truth, or Cargo feature graph changed.
Risk notes: Directly importing upstream `CanvasArtifact`, `CanvasStoragePort`, or `bitfun-canvas://` identities would create dual source-of-truth risk.

### ISSUE-1190C GenerativeUI, Miniapp, and Canvas Boundary Decision

Priority: P1
Status: Done
Goal: Decide when Void should use one-shot generated widgets, existing miniapps, AI short-drama canvas, or a future persistent Canvas-like artifact.
Allowed files: docs and focused existing tests if they only lock current behavior.
Forbidden files: new Canvas runtime, generated-widget rewrite, miniapp registry rewrite, short-drama UI rewrite, media service rewrite, provider changes.
Acceptance:
- The decision names the single owner for each visual artifact type.
- Existing `GenerativeUI` behavior remains compatible.
- Any future Canvas-like route must avoid automatic promotion from generated widget to persistent artifact without explicit state ownership and tests.
- Future artifact work must prove it references rather than migrates MiniApp, AI media, and AI short-drama facts, and must test that artifact storage does not write their source-of-truth files.
Risk notes: Upstream Canvas overlaps with current `GenerativeUI` and AI short-drama surface area; boundary clarity must precede implementation.
Result:
- Added `docs/architecture/visual-artifact-boundary-decision.md`.
- Recorded `DEC-126` in `docs/DECISIONS.md`.
- Locked route owners for `GenerativeUI`, MiniApps, AI media, AI short-drama, and future persistent interactive artifacts.
- Recorded that generated-widget panel saves are session tool-result edits, not workspace artifact saves.
- Added allowed-reference constraints for MiniApp, AI media, AI short-drama, `GenerativeUI`, and `ContentCanvas`.
- Kept this slice documentation-only; no runtime, UI, provider, media, MiniApp, short-drama, desktop API, or generated-widget code changed.

### ISSUE-1190D Canvas Runtime Security Review

Priority: P1
Status: Done
Goal: Review upstream Canvas iframe/runtime/security model before any Void implementation of a generated interactive artifact runtime.
Allowed files: docs, security checklist, optional static policy tests after a separate gate.
Forbidden files: iframe runtime, `postMessage` bridge, auto-repair, workspace file opener, session opener, HTML export, React UMD/raw inline runtime, CSP changes, desktop APIs.
Acceptance:
- Review covers iframe sandbox, message origin/source validation, action allowlists, workspace file/session opening, state persistence, runtime diagnostics, auto-repair loops, CSP, bundle size, and user confirmation.
- Auto-repair and generated-content-initiated file/session opening remain rejected or separately gated.
- No runtime code is added in this review issue.
Risk notes: Upstream Canvas lets generated runtime actions affect host UI; Void must not copy that bridge before permission and loop controls exist.
Result:
- Added `docs/architecture/canvas-runtime-security-review.md`.
- Recorded `DEC-127` in `docs/DECISIONS.md`.
- Reviewed upstream Canvas desktop API, tools, product-domain contracts, compiler/runtime, skill, panel, runtime, tool card, and Web API surfaces as security inputs only.
- Recorded that current `GenerativeUI` iframe bridge is chat-scoped and that `sendPrompt` / `open-file` style actions must not become persistent artifact host actions without a future permission model and confirmation.
- Rejected upstream runtime, iframe bridge, desktop API, HTML export, skills, `core.canvas`, generated-content file/session opening, and auto-repair in this slice.
- Kept this slice documentation-only; no Web UI runtime, iframe bridge, desktop API, skills, provider, MiniApp, AI media, AI short-drama, or generated files changed.

### ISSUE-1190E Tool Card Metadata and Miniapp Icon Governance

Priority: P2
Status: Done
Goal: Borrow the low-risk upstream governance patterns for tool-card display names and builtin miniapp icon registration without adopting Canvas.
Allowed files: existing tool-card metadata tests, existing miniapp icon mapping tests, docs.
Forbidden files: CanvasToolCard, BitFun/Canvas runtime, generated-widget behavior changes, Flow Chat store/session logic, AI media, AI short-drama, terminal, provider.
Acceptance:
- Tool-card headers use a single metadata source for display names and tests cover at least one non-default tool name.
- Builtin miniapp icon mapping tests prove known icons resolve to non-fallback icons while unknown icons still fall back safely.
- Styles use existing theme tokens and do not add raw colors.
Risk notes: This is governance/test hardening only; missing icon additions should be driven by current Void miniapp metadata, not upstream Canvas needs.
Result:
- Added `src/web-ui/src/flow_chat/tool-cards/toolCardMetadata.ts` as the single light metadata source for display names, confirmation policy, MCP fallback naming, and unknown-tool fallback.
- Kept `src/web-ui/src/flow_chat/tool-cards/index.ts` as the component registry and compatibility re-export only.
- Added focused metadata tests covering non-default tool names, MCP parsed display names, unknown fallback, confirmation policy, and registered tool listing.
- Added MiniApp icon tests covering known upstream/current builtin icons and unknown fallback.
- Added builtin MiniApp icon mappings for `Aperture`, `Grid3x3`, `GitPullRequest`, `Presentation`, and `Regex`.
- Moved MiniApp icon gradients to `--miniapp-icon-gradient-*` variables under the MiniApp gallery surface instead of returning raw gradients from the helper.
- Did not copy Canvas tool cards, Canvas runtime, generated-widget behavior, Flow Chat session/store logic, AI media, AI short-drama, terminal, provider, or generated version files.

### ISSUE-1190F Theme Domain Governance for Generated Runtimes

Priority: P2
Status: Done
Goal: Evaluate upstream theme-domain isolation for generated runtimes and adapt only Void-named governance if it protects app UI budgets.
Allowed files: theme governance docs, theme audit script/tests, theme CSS variable contract files, docs.
Forbidden files: BitFun `bitfunCanvas` domain names, `--bitfun-canvas-*` variables, Canvas runtime, page SCSS rewrites, AI media/short-drama logic, ThemeService runtime changes without a separate issue.
Acceptance:
- Any new generated-runtime theme domain is Void-named, declares owner/reason/merge policy, and does not loosen app UI hardcoded-color budgets.
- Audit tests distinguish app UI color debt from generated-runtime-owned color surfaces.
- No visual redesign or runtime token injection behavior changes are included.
Risk notes: Upstream's domain isolation idea is useful; upstream names and Canvas-specific baselines are not.
Result:
- Added Void-owned `generated-runtime` color-domain governance to `scripts/theme-css-var-contract.json` with owner, reason, merge policy, and path prefixes.
- Extended `scripts/audit-theme-colors.mjs` to report `colorDomains[]` and stable `domainMetrics` while preserving global `uniqueColors` and near-pair budgets.
- Added baseline support for `domainMetrics.app-ui.uniqueColors` and `domainMetrics.generated-runtime.uniqueColors` so app UI and generated-runtime debt can be enforced independently.
- Tightened the Web UI baseline to the current audited values instead of loosening budgets.
- Added tests proving generated-runtime colors are reported separately, app UI budget enforcement does not count generated-runtime growth, generated-runtime can have its own budget, and upstream BitFun/Canvas-owned domain naming is rejected.
- Did not change ThemeService runtime behavior, page SCSS, Canvas runtime, AI media, AI short-drama logic, terminal, provider, or generated version files.

### ISSUE-1190G CLI Rich Model-Round Persistence Audit

Priority: P1
Status: Done
Goal: Audit upstream `6fd87c11a` rich model-round persistence for CLI execution messages against current Void session/model-round persistence before implementing any fix.
Allowed files: read-only audit docs first; focused core/session tests and `SessionManager`/coordinator wiring only after the missing persistence path is proven.
Forbidden files: Flow Chat UI, AI media, AI short-drama, terminal, provider, Canvas, broad session-manager rewrite, event ABI changes.
Acceptance:
- Current CLI execution message persistence path is mapped.
- Any missing rich model-round fields are identified with a focused failing test before code changes.
- Multi-agent/subagent projection and BTW session behavior are explicitly protected.
Risk notes: This may be a small high-value stability fix, but it touches persisted conversation structure and must not be bundled with Canvas.
Result:
- Upstream `6fd87c11a` was adapted as a focused Void session persistence fix, not a cherry-pick.
- `ConversationCoordinator` now passes `ExecutionResult.new_messages` into `SessionManager::complete_dialog_turn`.
- `SessionManager` builds fallback persisted `ModelRoundData` from execution messages only when the turn has no existing assistant text, preserving already-written rich rounds.
- The converter supports assistant text, assistant mixed reasoning/text/tool calls, assistant multimodal text, and following tool results matched by `tool_id`.
- Flow Chat UI, event ABI, Canvas, terminal, provider, AI media, AI short-drama, and broad session restore code were not changed.

### ISSUE-1191A CLI Rich Model-Round Replay Smoke

Priority: P1
Status: Done
Goal: Close the immediate replay gap after `ISSUE-1190G` by proving and preserving that persisted rich model rounds rebuild runtime messages with assistant tool calls and tool results during session restore.
Allowed files: `src/crates/core/src/agentic/session/session_manager.rs`, migration docs.
Forbidden files: CLI runtime execution, provider adapters, Flow Chat UI/store, event ABI, terminal, Canvas, AI media, AI short-drama, broad session restore API shape, upstream field/schema imports.
Acceptance:
- `build_messages_from_turns` restores persisted assistant thinking/text/tool calls from `DialogTurnData.model_rounds`.
- Following persisted `ToolResultData` entries are restored as tool result messages matched by `tool_id`.
- Existing rich model-round persistence coverage still passes.
- No real provider, CLI E2E, UI rendering, or event ABI changes are required.
Result:
- Updated the session restore conversion to rebuild one assistant message per persisted model round and append matching tool result messages after each round.
- Added focused replay coverage for user -> assistant mixed thinking/text/tool call -> tool result -> assistant follow-up.
- Preserved model-invisible turn filtering, Flow Chat UI, CLI execution, providers, terminal, Canvas, AI media, and AI short-drama behavior.
Risk notes:
- This still does not persist or replay upstream round timing/model metadata from `ModelRoundCompleted` events.
- A real CLI process-level E2E can remain a later smoke because the core restore/replay interface is now covered without provider dependency.

### ISSUE-1191B CLI Theme Truecolor Preset Fallback Governance

Priority: P2
Status: Done
Goal: Evaluate upstream `912cd7561` and, if still applicable, derive CLI truecolor default fallbacks from Void builtin presets instead of maintaining a second Rust RGB fallback table.
Allowed files: `src/apps/cli/src/ui/theme.rs`, CLI theme audit tests/baseline, docs.
Forbidden files: CLI preset visual values, Web UI ThemeService, installer/mobile themes, Canvas, Flow Chat, AI media, AI short-drama, Cargo/package script churn, BitFun naming.
Acceptance:
- `Theme::dark()` / `Theme::light()` derive from local `void-dark` / `void-light` preset tokens.
- Partial custom theme JSON still falls back to the base theme.
- CLI theme audit reduces or eliminates Rust fallback color debt without loosening budgets.
Result:
- `Theme::dark()` and `Theme::light()` now build from `void-dark` and `void-light` builtin preset tokens through a shared resolved-token conversion helper.
- Partial custom `theme.json` fallback behavior remains owned by `apply_opencode_theme_json` and still inherits missing values from the selected base theme.
- CLI theme audit baseline was tightened after Rust fallback debt dropped to zero: `rustFallbackUniqueColors: 0`, `rustFallbackNearPairs.nearTotal: 0`, `totalUniqueColors: 135`.
- Preset JSON visual values, Web UI ThemeService, installer/mobile themes, Canvas, Flow Chat, AI media, AI short-drama, Cargo/package scripts, and BitFun naming were not changed.
Risk notes:
- Builtin preset completeness now fails loudly during CLI theme construction instead of silently falling back to a second RGB table.
- `ISSUE-1191C` remains a separate proposed terminal DTO/status contract slice.

### ISSUE-1191C Terminal Core History Status/Source Contract

Priority: P2
Status: Done
Goal: Extend terminal core history response contracts with explicit status/source fields where local Web/desktop already expect them, without moving terminal ownership into runtime ports.
Allowed files: `src/crates/terminal/src/api.rs`, `src/apps/desktop/src/api/terminal_api.rs` conversion/tests, docs.
Forbidden files: terminal session internals, Web terminal runtime hooks/components, Flow Chat, MCP, provider, AI media, AI short-drama, runtime-port owner moves, Cargo/crate layout changes.
Acceptance:
- Terminal core get-history response exposes explicit history status/source values compatible with existing desktop/Web contracts.
- Focused terminal-core and desktop terminal API tests pass.
Result:
- Added terminal-core `TerminalHistoryStatus` and `TerminalHistorySource` DTO enums with Web-compatible serialized values.
- `TerminalApi::get_history` now returns `historyStatus: "ready"` and `historySource: "local"` from the core response instead of relying on desktop/Web inference.
- Desktop `GetHistoryResponse::from(CoreGetHistoryResponse)` now formats and passes through the core status/source fields; remote unsupported history remains desktop-owned.
- Web terminal types, terminal hooks/components, terminal session internals, remote terminal replay, runtime-port, Flow Chat, MCP, provider, AI media, and AI short-drama were not changed.
Risk notes:
- This slice does not implement remote terminal replay or `historyStatus: "error"` as a successful DTO; local core failures still use the existing error path.
- Byte-count ack semantics remain a separate terminal frontend/backend contract decision.

### ISSUE-1192A Remote Workspace File CRUD Connection Context

Priority: P1
Status: Done
Goal: Adapt upstream `1ab4d323f` remote workspace file CRUD fix so create/delete/rename operations carry explicit remote connection context through the existing Void WorkspaceAPI -> desktop command -> path target -> remote file service chain.
Allowed files: `src/web-ui/src/infrastructure/api/service-api/WorkspaceAPI.ts`, `src/web-ui/src/app/components/panels/FilesPanel.tsx`, `src/web-ui/src/shared/utils/pathUtils.ts`, focused tests, `src/apps/desktop/src/api/commands.rs`, `src/apps/desktop/src/api/path_target.rs`, `src/crates/core/src/service/remote_ssh/{remote_fs.rs,disabled.rs}`, `src/crates/services-integrations/src/remote_ssh/workspace_registry.rs`, docs.
Forbidden files: Flow Chat, AI media, AI short-drama, provider adapters, terminal, Canvas runtime, installer/brand, upstream directory migration, context-menu UI polish not needed for CRUD correctness.
Acceptance:
- Web WorkspaceAPI accepts optional `remoteConnectionId` for create/delete/rename file operations.
- FilesPanel passes the current remote workspace connection id without directly calling backend or remote services.
- Desktop command DTOs accept optional remote connection ids and pass them to `path_target`.
- `path_target` remains the only local/remote operation resolver for these CRUD commands.
- Remote registry only uses preferred connection id to disambiguate multiple path matches, not to discard an otherwise unique path match.
- Focused Rust and Web tests pass, plus desktop check/type-check when feasible.
Risk notes:
- This slice intentionally excludes upstream confirm-dialog, copy-path clipboard, paste shortcut, and Linux reveal-in-explorer UI changes.
- Real SSH CRUD still requires manual remote environment validation; automated coverage is contract-level.
Result:
- Added optional `remoteConnectionId` to Web WorkspaceAPI file create/delete/rename calls and desktop command request DTOs.
- FilesPanel now passes the current workspace connection id through WorkspaceAPI for create/delete/rename and normalizes remote paths with `normalizeRemoteWorkspacePath`.
- `path_target` now receives the preferred remote connection id for create/delete/rename and remains the only local/remote resolution layer for these operations.
- Added non-recursive `RemoteFileService::remove_dir` and kept recursive delete on `remove_dir_all`.
- Updated `RemoteWorkspaceRegistry` so preferred connection id only disambiguates multiple matching remote roots.
- Added focused registry and path normalization tests.

### ISSUE-1192B Desktop Reveal In Explorer Argument Contract

Priority: P1
Status: Done
Goal: Adapt the upstream `reveal_in_explorer` desktop OS integration fixes from `1ab4d323f` and `95441b782` without changing workspace resolution or remote file behavior.
Allowed files: `src/apps/desktop/src/api/commands.rs`, focused tests, migration docs.
Forbidden files: `path_target`, remote CRUD logic, Web UI file commands, Flow Chat, AI media, AI short-drama, provider adapters, terminal, Canvas runtime, installer/brand.
Acceptance:
- Windows file reveal passes `/select,<path>` as a single Explorer argument.
- Linux file reveal attempts freedesktop FileManager1 `ShowItems` with a valid encoded `file://` URI, then falls back to opening the parent directory.
- Directory reveal behavior remains `explorer/open/xdg-open` by directory path.
- Remote paths still fail before local explorer launch through existing `path_target` behavior.
- Focused desktop tests and desktop check pass.
Risk notes:
- Linux file-manager selection depends on the user's desktop environment supporting `org.freedesktop.FileManager1`; fallback keeps existing behavior.
Result:
- Added focused helpers for Windows Explorer file selection argument construction and Linux FileManager1 file URI construction.
- Windows file reveal now passes `/select,<path>` as one argument.
- Linux file reveal now tries `org.freedesktop.FileManager1.ShowItems` for file selection and falls back to opening the parent directory with `xdg-open`.
- Directory reveal behavior and remote-path rejection remain unchanged.

### ISSUE-1192C File Context Menu Path Utility Contract

Priority: P1
Status: Done
Goal: Adapt the low-risk path handling parts of upstream `1ab4d323f` for file context-menu commands without changing delete confirmation, paste shortcuts, remote CRUD, or file explorer state.
Allowed files: `src/web-ui/src/shared/context-menu-system/commands/builtin/file/{CopyPathCommand.ts,NewFileCommand.ts,NewFolderCommand.ts}`, `src/web-ui/src/shared/utils/pathUtils.ts`, focused tests, migration docs.
Forbidden files: `DeleteCommand.ts`, `FileExplorerMenuProvider.ts`, `FilesPanel.tsx`, `WorkspaceAPI.ts`, desktop APIs, remote/path_target, Flow Chat, AI media, AI short-drama, provider adapters, terminal, Canvas runtime, installer/brand.
Acceptance:
- Copy Path writes Windows drive and UNC-style paths to the clipboard with native backslashes.
- POSIX and remote-style paths remain unchanged when copied.
- New File/New Folder parent-path derivation uses the shared `dirnameAbsolutePath` helper rather than command-local string slicing.
- Focused path utility tests and Web type-check pass.
Risk notes:
- This slice intentionally leaves upstream confirm-dialog and paste-shortcut polish for separate issues.
Result:
- Added `formatPathForClipboard` to centralize Windows/UNC clipboard separator handling.
- `CopyPathCommand` now writes formatted clipboard paths while leaving POSIX/remote-style paths unchanged.
- `NewFileCommand` and `NewFolderCommand` now derive file parent paths through `dirnameAbsolutePath`.
- Added path utility coverage for Windows drive, UNC, POSIX, local rename, and remote normalization behavior.

### ISSUE-1192D File Delete Confirmation Service

Priority: P1
Status: Done
Goal: Adapt the upstream `DeleteCommand` confirmation improvement so file delete uses the shared danger confirm dialog instead of browser `window.confirm`.
Allowed files: `src/web-ui/src/shared/context-menu-system/commands/builtin/file/DeleteCommand.ts`, focused tests, migration docs.
Forbidden files: `FilesPanel.tsx`, `WorkspaceAPI.ts`, desktop APIs, remote/path_target, paste shortcut provider, Copy/New commands, Flow Chat, AI media, AI short-drama, provider adapters, terminal, Canvas runtime, installer/brand.
Acceptance:
- Delete confirmation uses `confirmDanger` with the existing delete title/message/action text.
- Cancelling confirmation does not emit `file:delete`.
- Confirming preserves the existing `file:delete` event payload.
- Focused command tests and Web type-check pass.
Risk notes:
- This is UI command confirmation only; actual delete execution and remote/local routing remain owned by existing file panel/API handlers.
Result:
- `DeleteFileCommand` now uses shared `confirmDanger` with the existing delete title/message/action text.
- Confirmed delete still emits `file:delete` with the existing `{ path, isDirectory }` payload.
- Cancelled delete returns a failure result and does not emit `file:delete`.
- Added focused command tests with mocked confirmation service.

### ISSUE-1192E File Explorer Paste Shortcut Label

Priority: P2
Status: Done
Goal: Adapt the upstream file explorer paste shortcut label fix so Apple platforms display `Cmd+V` and other platforms display `Ctrl+V`.
Allowed files: `src/web-ui/src/shared/context-menu-system/providers/FileExplorerMenuProvider.ts`, focused tests, migration docs.
Forbidden files: file operation handlers, `FilesPanel.tsx`, `WorkspaceAPI.ts`, desktop APIs, remote/path_target, file command behavior, Flow Chat, AI media, AI short-drama, provider adapters, terminal, Canvas runtime, installer/brand.
Acceptance:
- Paste menu items use a platform-aware shortcut label.
- Platform detection is testable without relying on global `navigator` during module import.
- Paste event payload and menu structure remain unchanged.
- Focused provider tests and Web type-check pass.
Risk notes:
- This is display metadata only; it does not change paste execution or keyboard handling.
Result:
- Added `getPasteShortcut()` as a testable provider helper.
- File explorer paste menu entries now show `Cmd+V` on Apple user agents and `Ctrl+V` elsewhere.
- Paste event payloads and menu structure remain unchanged.
- Added focused provider tests for Apple and non-Apple shortcut labels.
