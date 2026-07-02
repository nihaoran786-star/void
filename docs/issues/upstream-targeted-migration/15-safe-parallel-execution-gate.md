# Issue 15: Safe Parallel Execution Gate

## What to build

Promote the dry-run scheduler into a guarded execution decision. The runtime may
launch parallel branches only when branch independence, write scopes, context
dependencies, user settings, and mode policy all allow it.

## Acceptance criteria

- [x] Scheduler rejects parallel execution when write scopes overlap.
- [x] Scheduler rejects parallel execution when a branch depends on another
      unfinished branch.
- [x] Scheduler respects user or mode-level opt-in for forced multitask
      execution.
- [x] Rejected plans fall back to current prompt-guided Multitask behavior.
- [x] Tests cover accepted, rejected, and fallback plans.

## Blocked by

- Issue 14: Multitask Scheduler Dry Run.

## Implementation status

Completed in the runtime/domain slice:

- Added `MultitaskScheduler::decide()` with explicit fallback action.
- Forced execution is opt-in through scheduler options; default remains current
  prompt-guided Multitask behavior.
