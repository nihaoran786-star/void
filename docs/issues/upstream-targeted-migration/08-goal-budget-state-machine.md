# Issue 8: Goal Budget State Machine

## What to build

Promote goal token budget enforcement into the goal-mode state machine. When an
active goal reaches its token budget, runtime/domain code must mark it
`usage-limited` and stop treating it as an active continuation target until the
user edits, clears, or resumes with available budget.

## Acceptance criteria

- [x] `GoalModeStatus` includes an explicit `usage-limited` state.
- [x] Token accounting transitions active goals to `usage-limited` when
      `tokensUsed >= tokenBudget`.
- [x] `GoalModeState::is_active()` is false for `usage-limited`.
- [x] `resume` from `usage-limited` is rejected unless the budget allows more
      usage or the budget is cleared/raised by an edit path.
- [x] Tests cover active, paused, blocked, complete, and usage-limited states.

## Implementation status

Implemented `GoalModeStatus::UsageLimited`, usage-limit transition during
runtime accounting, and resume rejection while the budget remains exhausted.

Focused verification:
`cargo test -p void-core goal_mode --quiet` and
`cargo test -p void-runtime-ports goal_mode --quiet`.

## Blocked by

- Issue 7: Goal Token Accounting.
