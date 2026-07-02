# Issue 13: Multitask Intent Model

## What to build

Introduce a runtime/domain model for multitask planning that can represent
independent branches, dependencies, write scopes, and risk before any automatic
parallel execution is attempted.

## Acceptance criteria

- [x] Runtime has a structured `MultitaskPlan` model with branch ids, goals,
      inputs, write scopes, dependencies, and risk levels.
- [x] The model can distinguish independent branches from serially dependent
      branches.
- [x] File write scope conflicts are represented explicitly.
- [x] The model is serializable for runtime events and debugging.
- [x] Tests cover independent, dependent, and conflicting branches.

## Blocked by

None - can start immediately.

## Implementation status

Completed in the runtime/domain slice:

- Added `MultitaskPlan`, `MultitaskBranch`, risk levels, write scopes, and
  dependencies in runtime ports.
- Added core scheduler tests for independent, dependent, and conflicting
  branch plans.
