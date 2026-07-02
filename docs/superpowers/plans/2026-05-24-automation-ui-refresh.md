# Automation UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first Automation center layout with the provided calendar-style UI while preserving the existing real Cron API behavior.

**Architecture:** Keep `AutomationScene` as the host that loads sessions and Cron jobs, then map them into UI view models. Presentation components render `AutomationTask` and `AutomationAgent` data and communicate through callbacks; they do not call Tauri, `CronAPI`, or mutate backend state directly.

**Tech Stack:** React 18, TypeScript, SCSS, lucide-react, existing `CronAPI`, existing component-library validation through TypeScript/lint/tests.

---

### Task 1: View-model mapper

**Files:**
- Create: `src/web-ui/src/app/scenes/automation/automationViewModel.ts`
- Test: `src/web-ui/src/app/scenes/automation/automationViewModel.test.ts`

- [ ] Test Cron job status mapping into pending/running/completed/failed.
- [ ] Test Cron job schedule mapping into once/hourly/daily/monthly/list display metadata.
- [ ] Test main-session conversion into selectable agents.
- [ ] Implement the mapper with no API calls.

### Task 2: Presentation components

**Files:**
- Create/modify files in `src/web-ui/src/app/scenes/automation/`

- [ ] Add calendar header, task card, day/week/month/list views, detail panel, and create dialog components.
- [ ] Keep them prop/callback driven.
- [ ] Do not import `CronAPI`, `flowChatStore`, or workspace context in presentation components.

### Task 3: Scene integration

**Files:**
- Modify: `src/web-ui/src/app/scenes/automation/AutomationScene.tsx`
- Modify: `src/web-ui/src/app/scenes/automation/AutomationScene.scss`

- [ ] Load Cron jobs and main sessions exactly as the current scene does.
- [ ] Use the mapper to produce UI tasks and agents.
- [ ] Route create/edit/delete/toggle actions through existing `CronAPI`.
- [ ] Render artifacts/conversation as empty states until backend run history exists.

### Task 4: Verification

**Commands:**
- `pnpm --dir src/web-ui run test:run -- src/app/scenes/automation`
- `pnpm run type-check:web`
- `pnpm run lint:web`
- `pnpm --dir src/web-ui run test:run`

- [ ] Confirm no Rust, desktop API, cron schema, subagent, or `flow_chat` files are staged.
