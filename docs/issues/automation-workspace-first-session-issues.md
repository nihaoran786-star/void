# Automation Workspace-First Session Issues

## Risk isolation

- Keep this phase inside existing frontend automation, FlowChat session creation, and Cron job APIs.
- Do not change Rust CronService schema, jobs persistence format, scheduler policy, subagent lifecycle, or session state machine.
- Remove user-facing session picking from automation creation. Session id remains an internal implementation detail produced by the creation flow.
- UI components should render the automation draft state only. Target/session creation decisions should live in automation helpers or the scene integration layer.
- Automation-created sessions should be distinguishable with a minimal marker, preferably a title prefix, without introducing new persisted session metadata in this phase.
- Calendar visibility fixes must stay presentation-only unless a layout helper is needed for testability.

## Issue 1: Replace session target model with workspace-first automation draft

## What to build

Represent the create task target as workspace, execution mode, prompt, and schedule. Remove the concrete target session from the user-facing draft. The selected session id should become an internal result of creating a dedicated automation session.

## Acceptance criteria

- [x] Create task draft contains workspace id/path, execution mode (`code` or `cowork`), task prompt, and schedule.
- [x] User-facing create dialog no longer requires or displays a target session selector.
- [x] Existing `CronJob -> AutomationTask` mapping remains compatible with current jobs that already have `sessionId`.
- [x] Recovered sessions are not selectable or auto-selected by the create task flow.
- [x] Unit tests cover workspace filtering and draft validation without relying on existing sessions.

## Blocked by

None - can start immediately.

## Issue 2: Add code/cowork execution mode slider

## What to build

Replace the current execution mode cards with a compact segmented slider for `编码会话` and `办公会话`. This remains a visual/control change only: `code` maps to `agentic`, and `cowork` maps to `Cowork` when the internal session is created.

## Acceptance criteria

- [x] Create task dialog shows a polished two-option slider for `编码会话` and `办公会话`.
- [x] Slider is keyboard-accessible and exposes the selected mode clearly.
- [x] `code` mode creates/binds an `agentic` session internally.
- [x] `cowork` mode creates/binds a `Cowork` session internally.
- [x] No assistant/subagent mode is exposed in this phase.

## Blocked by

- Issue 1.

## Issue 3: Create a dedicated automation session when creating a task

## What to build

When the user creates an automation task, create a new FlowChat session in the selected workspace using the selected execution mode, give it a minimal automation title, then create the Cron job against that session id.

## Acceptance criteria

- [x] Creating a task creates a new code/cowork session for the selected workspace before calling `CronAPI.createJob`.
- [x] The Cron job uses the newly created session id and selected workspace path.
- [x] The dedicated session title is visibly marked, for example `自动化 · <任务名称>`.
- [x] If session creation fails, the Cron job is not created and the user sees a clear error.
- [x] If Cron job creation fails after session creation, the user sees a clear error and the task list refreshes; no scheduler/core behavior is changed.
- [x] Tests cover the create flow ordering: create session first, then create job.

## Blocked by

- Issue 1.
- Issue 2.

## Issue 4: Make run-now feedback truthful and avoid first-click confusion

## What to build

Adjust the frontend run-now flow so the UI reports the returned Cron job state accurately after `runJobNow`. The fix should clarify queued/running/error states and avoid implying that a queued turn is already executing.

## Acceptance criteria

- [x] `立即执行` refreshes the returned job state immediately and then reloads the task list.
- [x] Success message reflects actual state, such as queued/running, instead of always saying it executed.
- [x] If the job remains queued because the target session is busy, the task detail shows that state.
- [x] No scheduler policy or Rust CronService schema is changed in this slice.
- [x] Tests cover adapter/UI handling for queued and error responses where practical.

## Blocked by

- Issue 3.

## Issue 5: Keep automation-created sessions distinguishable in the sidebar

## What to build

Use the minimal title marker from task creation so automation-created sessions are easy to distinguish from normal chats in the existing sidebar, without changing sidebar data contracts.

## Acceptance criteria

- [x] Automation-created sessions display with a clear title prefix in the existing session list.
- [x] Sidebar grouping, selection, rename, delete, unread, and running indicators keep working unchanged.
- [x] No new sidebar-specific automation business logic is added.
- [x] If the user renames the session, existing rename behavior remains authoritative.

## Blocked by

- Issue 3.

## Issue 6: Fix calendar task visibility in day and week views

## What to build

Make tasks in day/week calendar views reliably visible when multiple jobs share the same time window or appear near the bottom of the day.

## Acceptance criteria

- [x] Day view does not fully hide overlapping tasks.
- [x] Week view does not fully hide overlapping tasks.
- [x] Late-day tasks are clamped or laid out so their cards remain reachable inside the scroll area.
- [x] Month view continues to show the `+N 更多` overflow indicator for crowded days.
- [x] Layout behavior is covered by a small pure helper test or a source-level safety test.

## Blocked by

- Issue 1.

## Issue 7: Document phase-B conversation and artifact history

## What to build

Document the next phase for automation run history: conversation record, turn lookup, and artifacts. This phase should explicitly explain why full artifact support needs either a stable run record or a reliable turn/artifact projection.

## Acceptance criteria

- [x] Document that phase A can open or identify the bound automation session, but does not yet provide full run artifact history.
- [x] Document the minimum future model for run history: job id, session id, turn id, status, timestamps, and artifact references.
- [x] Explain that full artifact history is out of scope for the workspace-first creation fix.
- [x] No runtime code is changed for artifacts in this issue.

## Blocked by

None - can start immediately.
