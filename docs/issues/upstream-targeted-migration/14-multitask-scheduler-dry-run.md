# Issue 14: Multitask Scheduler Dry Run

## What to build

Add a dry-run scheduler path for Multitask mode that emits a proposed parallel
execution plan without launching subagents. This makes scheduling observable
before the runtime is allowed to force parallel execution.

## Acceptance criteria

- [x] Multitask mode can produce a scheduler dry-run event for independent
      branches.
- [x] Dry-run output includes planned branches, dependencies, rejection reasons,
      and estimated parallelism.
- [x] Dry-run does not alter session state, launch subagents, or mutate files.
- [x] UI may render the event later, but no UI component performs scheduling
      decisions.
- [x] Tests verify dry-run is non-mutating.

## Blocked by

- Issue 13: Multitask Intent Model.

## Implementation status

Completed in the runtime/domain slice:

- Added `MultitaskScheduler::dry_run()` and serializable dry-run DTOs.
- Dry run is pure and does not launch subagents or modify session state.
