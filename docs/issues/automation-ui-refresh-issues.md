# Automation UI Refresh Issues

These issues formalize the calendar-style Automation UI migration from the provided React 18 + SCSS prototype. The implementation must preserve the existing Cron API behavior and must not migrate the Next.js/Tailwind/shadcn prototype stack.

## Issue 1: Introduce Automation view-model mapping

## What to build

Create a narrow mapping layer that converts existing scheduled jobs and main sessions into UI-ready automation task and agent models. The UI should not infer scheduler internals, session provenance, or raw Cron job status directly.

## Acceptance criteria

- [x] Existing Cron jobs can be projected into automation task cards with name, prompt, enabled state, schedule type, scheduled time, status, and agent label.
- [x] Main sessions can be projected into selectable automation agents.
- [x] Subagent or child sessions are excluded from first-version automation targets.
- [x] Mapping code has focused tests for status, schedule, and agent conversion.
- [x] The mapper performs no API calls and does not mutate backend state.

## Blocked by

None - can start immediately.

## Issue 2: Move prototype UI into reusable presentation components

## What to build

Port the React 18 + SCSS automation presentation layer into the target web UI as reusable components. Components should consume automation tasks, agents, filters, selected task state, and action callbacks from a host/context layer.

## Acceptance criteria

- [x] The Automation page has header controls for day, week, month, and list views.
- [x] Priority, status, and Agent filters are available in the header.
- [x] Week, month, day, and list views render from passed-in automation task state.
- [x] Task cards and detail panel render task metadata without calling Cron API directly.
- [x] Presentation components do not import Tauri APIs, `CronAPI`, workspace context, or `flowChatStore`.

## Blocked by

- Issue 1.

## Issue 3: Connect create, toggle, and delete actions to the existing Cron API

## What to build

Wire the new Automation UI actions into the existing Cron API adapter while keeping `AutomationScene` as the only host that knows about Cron jobs, workspace path, and main-session targets.

## Acceptance criteria

- [x] Creating a task uses the existing `CronAPI.createJob` contract.
- [x] Enabling and disabling a task uses the existing `CronAPI.updateJob` contract.
- [x] Deleting a task uses the existing `CronAPI.deleteJob` contract.
- [x] Created tasks target main sessions only.
- [x] UI callbacks refresh from the Cron API after success or failure so optimistic state does not drift.
- [x] No Rust service, scheduler, Cron schema, or Tauri command changes are made.

## Blocked by

- Issue 1.
- Issue 2.

## Issue 4: Replace the Automation scene layout with the calendar UI

## What to build

Replace the first Automation center layout with the calendar-style scene while preserving the existing data-loading, workspace handling, and safe empty/loading behavior.

## Acceptance criteria

- [x] The Automation scene renders the new header, calendar/list views, create dialog, and task detail panel.
- [x] Loading, no-workspace, no-agent, and empty task states remain visible and understandable.
- [x] The scene only orchestrates state and callbacks; it does not embed scheduler business rules in view components.
- [x] Schedule views use the current projected run time instead of expanding all recurring cron occurrences.
- [x] Existing assistant page demotion and left-navigation entry remain intact.

## Blocked by

- Issue 1.
- Issue 2.
- Issue 3.

## Issue 5: Safely downgrade unsupported detail-panel actions

## What to build

Keep the richer detail-panel surface from the prototype, but only enable behavior backed by current project APIs. Unsupported history and artifact features should render as clear empty states rather than fake actions.

## Acceptance criteria

- [x] The detail panel displays prompt, status, schedule, estimated duration, and Agent information.
- [x] Artifacts render as an empty state until backend run artifacts exist.
- [x] Conversation history renders as an empty state until automation run history exists.
- [x] Immediate run, rerun, artifact download, and continue-conversation actions are not wired unless a real adapter exists.
- [x] The panel supports only safe current actions: close, enable/disable, and delete.

## Blocked by

- Issue 4.

## Issue 6: Verify Automation UI refresh boundaries

## What to build

Run focused verification for the automation UI refresh and confirm the diff stays inside the agreed frontend boundary.

## Acceptance criteria

- [x] Automation-specific tests pass.
- [x] Web type-check passes.
- [x] Web lint passes or warnings are documented.
- [x] Full web test suite passes or blockers are documented.
- [x] Final review confirms no Rust, desktop API, Cron schema, subagent, or unrelated `flow_chat` changes are included.
- [x] The resulting diff can be reviewed as one small Automation UI refresh PR.

## Blocked by

- Issue 5.

## Completion evidence

- `pnpm --dir src/web-ui run test:run -- src/app/scenes/automation` passed: 3 files, 9 tests.
- `pnpm run type-check:web` passed.
- `pnpm run lint:web` passed with one existing Fast Refresh warning in `automation-context.tsx`.
- `pnpm --dir src/web-ui run test:run` passed: 142 files, 759 tests.
