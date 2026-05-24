# Automation Center Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-level Automation center that reuses existing Cron jobs and targets only main sessions.

**Architecture:** Keep the existing Rust cron service, job schema, Tauri commands, and Cron API contracts unchanged. Add a frontend Automation scene that consumes `CronAPI`, derives display state in local helpers, and opens from navigation or assistant profile.

**Tech Stack:** React, TypeScript, Zustand scene store, existing component library, existing `CronAPI`.

---

### Task 1: Frontend schedule projection helpers

**Files:**
- Create: `src/web-ui/src/app/scenes/automation/automationSchedule.ts`
- Test: `src/web-ui/src/app/scenes/automation/automationSchedule.test.ts`

- [ ] Add tests for schedule next-run selection, day grouping, main-session filtering, and schedule preset conversion.
- [ ] Implement the minimal helper functions to pass those tests.

### Task 2: Automation scene shell and registry wiring

**Files:**
- Modify: `src/web-ui/src/app/components/SceneBar/types.ts`
- Modify: `src/web-ui/src/app/scenes/registry.ts`
- Modify: `src/web-ui/src/app/scenes/SceneViewport.tsx`
- Create: `src/web-ui/src/app/scenes/automation/AutomationScene.tsx`
- Create: `src/web-ui/src/app/scenes/automation/AutomationScene.scss`

- [ ] Add `automation` as a singleton scene.
- [ ] Render the new Automation scene in the scene viewport.

### Task 3: Navigation entry

**Files:**
- Modify: `src/web-ui/src/app/components/NavPanel/MainNav.tsx`
- Modify: `src/web-ui/src/locales/en-US/common.json`
- Modify: `src/web-ui/src/locales/zh-CN/common.json`
- Modify: `src/web-ui/src/locales/zh-TW/common.json`

- [ ] Add a first-level Automation button to the left navigation.
- [ ] Add scene and nav translations.

### Task 4: Cron job list, schedule view, and editor

**Files:**
- Modify: `src/web-ui/src/app/scenes/automation/AutomationScene.tsx`
- Modify: `src/web-ui/src/app/scenes/automation/AutomationScene.scss`
- Modify: locale files from Task 3

- [ ] Load jobs with `CronAPI.listJobs`.
- [ ] Show loading, empty, error, list, and lightweight schedule grouping.
- [ ] Add create/edit modal using main sessions only.
- [ ] Add enable/disable and delete actions through `CronAPI`.

### Task 5: Assistant page demotion

**Files:**
- Modify: `src/web-ui/src/app/scenes/profile/views/AssistantConfigPage.tsx`
- Modify: locale files from Task 3 if needed

- [ ] Replace the embedded scheduled-job manager with a compact Automation center entry.
- [ ] Dispatch `scene:open` for the automation scene.

### Task 6: Verification

**Commands:**
- `pnpm --dir src/web-ui run test:run -- automationSchedule`
- `pnpm run lint:web`
- `pnpm run type-check:web`
- `pnpm --dir src/web-ui run test:run`

- [ ] Confirm tests pass or record blockers.
- [ ] Confirm no Rust cron service, schema, or subagent target files changed.
