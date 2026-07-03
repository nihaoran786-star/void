# Upstream Selective Upgrade Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectively adapt recent `GCWing/BitFun` upstream improvements into the current Void branch while preserving local multi-agent, subconversation, floating chat, AI short-drama, and AI media behavior.

**Architecture:** Upstream is a reference implementation only. Every accepted behavior must enter through the current Void module boundary: Flow Chat store/services, terminal service/core, Computer Use host/adapters, AnalyzeImage tool contract, theme governance scripts/tokens, or static boundary checks. Direct merge, crate migration, BitFun branding, and whole-file replacement are forbidden.

**Tech Stack:** TypeScript/React/Vitest for Web UI; Rust/Cargo/Tauri for core and desktop; pnpm scripts for repository governance.

---

## File Structure

- `docs/PRD.md`: wave goal, scope, non-goals, acceptance.
- `docs/ARCHITECTURE.md`: module boundaries and forbidden coupling for this wave.
- `docs/ISSUES.md`: issue list `ISSUE-1100` through `ISSUE-1180`.
- `docs/DECISIONS.md`: decision that this is a selective wave, not a sync.
- `docs/TEST_PLAN.md`: per-family test matrix.
- `docs/PROGRESS.md`: kickoff and per-issue progress.

Production files are touched only by later issue-specific tasks after audit.

## Task 1: Inventory Refresh

**Files:**
- Modify: `docs/ISSUES.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/TEST_PLAN.md`

- [x] **Step 1: Confirm upstream reference**

Run:

```powershell
git fetch https://github.com/GCWing/BitFun.git main:refs/remotes/upstream-bitfun/main
git rev-parse upstream-bitfun/main
git log --oneline --first-parent --since='2026-07-01' upstream-bitfun/main -40
```

Expected: upstream head is recorded, and recent capability commits are visible.

- [x] **Step 2: Classify each candidate family**

Record in `docs/ISSUES.md` whether each family is `synced`, `partial`, `planned`, `deferred`, or `rejected`:

```text
Flow Chat history/navigation:
Terminal replay/input:
Computer Use Windows:
Image understanding/context:
MCP/tool runtime:
Theme/token governance:
Provider/service boundary:
Core crate decomposition:
Brand/installer:
```

- [x] **Step 3: Verify docs-only change**

Run:

```powershell
git diff --check -- docs\ISSUES.md docs\PROGRESS.md docs\TEST_PLAN.md
```

Expected: no whitespace errors, except existing LF/CRLF warnings if present.

## Task 2: Theme Token Governance Slice

**Files:**
- Modify/Create only after Task 1: `scripts/theme-color-near-pair-decisions.json`
- Modify: theme audit tests/scripts if required
- Modify: `src/web-ui/src/component-library/styles/tokens.scss` only for token-level changes
- Modify: `src/web-ui/src/component-library/components/Tabs/Tabs.scss` only for component-library token conformance
- Modify: consensus docs

- [x] **Step 1: Compare upstream theme governance**

Run:

```powershell
git show --name-status 082cee447 --
git show 082cee447 -- scripts/theme-color-near-pair-decisions.json scripts/theme-color-governance-baseline.json
```

Expected: identify the governance artifact and baseline deltas before editing.

- [x] **Step 2: Add Void-owned governance artifact**

Create or adapt a Void-owned near-pair decision JSON. It must not contain BitFun branding or product identity.

- [x] **Step 3: Run theme checks**

Run:

```powershell
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
```

Expected: both pass before the issue is marked complete.

## Task 3: Flow Chat Delta Audit

**Files:**
- Modify docs first.
- Production code only in a follow-up issue after gaps are known.

- [x] **Step 1: Compare upstream `502270994`**

Run:

```powershell
git show --name-status 502270994 --
```

Expected: record whether local `ISSUE-130*` work already covers the fix.

- [x] **Step 2: Record targeted local protection tests for follow-up implementation**

Run:

```powershell
pnpm --dir src/web-ui exec vitest run src/flow_chat/components/modern/VirtualMessageList.session-boundary.test.tsx src/flow_chat/store/FlowChatStore.test.ts
```

Expected: current protections pass before any new Flow Chat implementation slice is marked complete.

Result: commands were recorded in `docs/TEST_PLAN.md` and deferred to `ISSUE-1110A` and `ISSUE-1110B` implementation slices. `ISSUE-1110` is docs-only and records that local coverage is partial; it does not claim Flow Chat behavior is fixed.

## Task 4: Terminal Delta Audit

**Files:**
- Modify docs first.
- Terminal implementation only in a follow-up issue.

- [ ] **Step 1: Compare upstream terminal reliability commits**

Run:

```powershell
git log --oneline --first-parent upstream-bitfun/main -- src/web-ui/src/tools/terminal src/crates/services/terminal src/crates/terminal
```

Expected: identify replay/input/runtime-port deltas.

- [ ] **Step 2: Run local terminal tests**

Run:

```powershell
pnpm --dir src/web-ui exec vitest run src/tools/terminal/services/TerminalService.test.ts
cargo test -p terminal-core
```

Expected: available terminal tests pass, or missing package/test names are recorded accurately.

## Task 5: Computer Use Windows Safety Audit

**Files:**
- Modify docs first.
- Windows adapter implementation only in follow-up issue.

- [ ] **Step 1: Inspect upstream Windows fixes**

Run:

```powershell
git show --name-status bcb25a995 --
git show --name-status be5b45abb --
```

Expected: WGC/D3D11/pointer/HWND changes are mapped to current local files.

- [ ] **Step 2: Run available Rust checks**

Run:

```powershell
cargo check -p void-desktop
```

Expected: desktop crate still checks after any future Windows-only patch.

## Task 6: Final Review and Commit

**Files:**
- All files changed by completed issue only.

- [ ] **Step 1: Run issue-specific checks**

Run the checks recorded in `docs/TEST_PLAN.md` for the issue being completed.

- [ ] **Step 2: Run coupling review**

Confirm:

```text
No business logic entered page/entry components.
State model is explicit.
UI only renders or coordinates state.
Adapters return explicit status/source/error where applicable.
No unrelated files changed.
Diff is reviewable as one small PR.
Tests cover module interfaces.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git status --short
git add <scoped files>
git commit -m "chore: plan upstream selective upgrade wave"
```

Expected: only scoped files are committed.
