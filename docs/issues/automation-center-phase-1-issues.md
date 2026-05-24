# Automation Center Phase 1 Issues

## Issue 1: Add the Automation top-level entry and empty scene

## What to build

Add a first-level "Automation" entry in the left navigation that opens a standalone Automation scene. The scene should be reachable without entering the assistant configuration page.

## Acceptance criteria

- [ ] The left navigation exposes an Automation entry.
- [ ] Clicking the entry opens a singleton Automation scene tab.
- [ ] The scene has a safe empty/loading shell and does not depend on assistant configuration state.
- [ ] No Rust cron service, scheduler, or job schema changes are made.

## Blocked by

None - can start immediately.

## Issue 2: Show existing scheduled jobs in Automation

## What to build

Use the existing Cron API to load and render scheduled jobs in the Automation scene.

## Acceptance criteria

- [ ] Jobs are loaded through the existing `CronAPI.listJobs` adapter.
- [ ] The list shows name, enabled state, schedule summary, next run, and last status.
- [ ] Loading, empty, and error states are visible.
- [ ] UI consumes existing cron fields and does not infer scheduler internals.

## Blocked by

Issue 1.

## Issue 3: Create jobs with main-session targets and schedule presets

## What to build

Add a create/edit modal for scheduled jobs that targets only main sessions and converts friendly schedule presets into existing cron schedules.

## Acceptance criteria

- [ ] The scene has a Create task action.
- [ ] The target selector lists main sessions only, excluding child/subagent sessions.
- [ ] The form supports one-time, future date, hourly, daily, interval, and advanced cron options.
- [ ] Submitted data uses the existing `CronAPI.createJob` and `CronAPI.updateJob` contracts.

## Blocked by

Issue 2.

## Issue 4: Add management actions

## What to build

Allow users to edit, enable/disable, and delete existing scheduled jobs from Automation.

## Acceptance criteria

- [ ] Users can edit name, prompt, target main session, enabled state, and schedule.
- [ ] Users can enable or disable a job.
- [ ] Users can delete a job with confirmation.
- [ ] The implementation does not bypass the Cron API adapter.

## Blocked by

Issue 3.

## Issue 5: Add a lightweight schedule view

## What to build

Add a compact schedule panel that groups upcoming jobs by their next known run time.

## Acceptance criteria

- [ ] Jobs are grouped by today, tomorrow, upcoming, and unscheduled.
- [ ] The schedule view uses only `pendingTriggerAtMs`, `retryAtMs`, and `nextRunAtMs`.
- [ ] The first version does not expand recurring cron jobs into a full calendar.
- [ ] Dense days remain readable through time-ordered grouping.

## Blocked by

Issue 2.

## Issue 6: Demote the assistant-page schedule surface

## What to build

Stop presenting full schedule management as assistant configuration. Keep a safe path from the assistant page to the Automation scene.

## Acceptance criteria

- [ ] The assistant page no longer hosts the full scheduled-job manager.
- [ ] A short entry explains that automation is managed in the Automation center.
- [ ] Existing tasks and Cron API behavior are unchanged.
- [ ] Users can open Automation from the assistant page.

## Blocked by

Issue 1 and Issue 2.

## Issue 7: Verify and document phase 1 risk boundaries

## What to build

Add focused tests for the frontend schedule projection and run the matching web verification commands.

## Acceptance criteria

- [ ] Schedule projection and preset conversion have tests.
- [ ] Web lint, type-check, and frontend tests are run or any blocker is documented.
- [ ] The final review confirms no core cron schema, scheduler, or subagent target changes were made.

## Blocked by

Issues 1-6.
