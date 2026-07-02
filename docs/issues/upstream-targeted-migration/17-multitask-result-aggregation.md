# Issue 17: Multitask Result Aggregation And Resume

## What to build

Aggregate background branch results into the main session and produce clear
resume steering for Multitask and `/goal` sessions without breaking existing
Task, `/btw`, media, automation, or review team behavior.

## Acceptance criteria

- [x] Runtime records completed, failed, and cancelled branch results with
      branch identity.
- [x] Main session receives structured background results at safe turn
      boundaries.
- [x] Goal mode can consume multitask branch results without bypassing
      `usage-limited` state.
- [x] Partial failure produces explicit user-visible guidance.
- [x] Tests cover all-success, partial-failure, cancellation, and goal
      usage-limited interactions.

## Blocked by

- Issue 16: Background Subagent Scheduler.

## Implementation status

Completed in the runtime/domain slice:

- Added structured `MultitaskBranchResult` records.
- Existing background subagent delivery remains the safe turn-boundary injection
  path.
- Added `aggregate_branch_results()` guidance for all-success, partial failure,
  cancellation, and goal `usage-limited` handling.
