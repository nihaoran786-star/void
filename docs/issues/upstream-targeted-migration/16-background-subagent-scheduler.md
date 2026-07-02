# Issue 16: Background Subagent Scheduler

## What to build

Use the existing Task/subagent runtime to launch scheduler-approved Multitask
branches in the background, with concurrency limits, cancellation, and failure
handling owned by runtime code.

## Acceptance criteria

- [x] Scheduler launches approved branches through existing subagent runtime
      APIs instead of creating a parallel executor.
- [x] Runtime enforces a configurable concurrency limit.
- [x] User cancellation stops pending and running scheduled branches.
- [x] Failed branches are recorded without hiding successful branch results.
- [x] Existing Task/subagent visibility remains compatible.

## Blocked by

- Issue 15: Safe Parallel Execution Gate.

## Implementation status

Completed in the runtime/domain slice:

- Added `MultitaskBranchLauncher` and `MultitaskCoordinatorLauncher`.
- Approved branches are launched through existing
  `ConversationCoordinator::start_background_subagent`.
- The scheduler records per-branch start failures and does not hide successes.
