# Upstream Targeted Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectively migrate useful legacy-upstream changes into void while preserving void branding, automation, media sessions, and the right-side media preview panel.

**Architecture:** The migration is split into small vertical slices. Low-risk UI/CLI/ACP polish lands first; startup/performance lands next; prompt-cache, Multitask, and persisted thread goals land last behind explicit runtime boundaries.

**Tech Stack:** Rust workspace, React/TypeScript Web UI, Tauri desktop APIs, pnpm, Vitest, Cargo tests.

---

## Task 1: Knowledge Base And Issues

**Files:**
- Modify: `AGENTS.md`
- Modify: `AGENTS-CN.md`
- Create: `docs/obsidian/*.md`
- Create: `docs/issues/upstream-targeted-migration/*.md`

- [ ] Create the Obsidian vault and migration notes.
- [ ] Add the project rule requiring agents to read the vault before architecture-sensitive migrations.
- [ ] Write vertical-slice issues.
- [ ] Verify the working tree only contains knowledge-base and issue scaffolding before implementation starts.

## Task 2: Low-Risk Polish

**Files:** See Issues 1 and 2.

- [ ] Implement chat input and mention polish with focused tests.
- [ ] Implement CLI substring matching with command tests.
- [ ] Implement ACP `omp` preset with void-safe naming and tests.

## Task 3: Performance

**Files:** See Issue 3.

- [ ] Implement sanitized startup trace in void naming.
- [ ] Port safe flow-chat rendering optimizations.
- [ ] Verify startup and media panel behavior.

## Task 4: Runtime Cache And Agents

**Files:** See Issues 4 and 5.

- [ ] Implement shared coding mode prompt-cache identity.
- [ ] Add prompt-cache cloning for safe child sessions.
- [ ] Add or align `Multitask` mode and reminders.
- [ ] Verify Task/subagent behavior and cache telemetry.

## Task 5: Persisted Thread Goals

**Files:** See Issue 6.

- [ ] Move portable goal decisions into runtime/domain code.
- [ ] Implement `/goal` lifecycle and UI controller.
- [ ] Verify pause/resume/budget/continuation behavior.

## Task 6: Final Verification

- [ ] `pnpm run type-check:web`
- [ ] Focused Web UI tests for touched chat, startup, goal, and media surfaces.
- [ ] Focused Cargo tests for CLI, ACP, prompt cache, Multitask, and thread goals.
- [ ] `pnpm run i18n:audit`
- [ ] `pnpm run brand:audit:strict`
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-installed-void-surfaces.ps1 -Strict`
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\brand-final-acceptance-report.ps1 -Strict`
- [ ] `git diff --check`
