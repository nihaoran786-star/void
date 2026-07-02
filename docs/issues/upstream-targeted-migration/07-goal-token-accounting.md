# Issue 7: Goal Token Accounting

## What to build

Connect model-round token usage to persisted thread-goal state so `/goal`
runtime accounting is owned by the runtime/domain layer rather than inferred
from UI token indicators.

## Acceptance criteria

- [x] Active goal state increments `tokensUsed` from model usage events for the
      parent session.
- [x] Subagent token events do not double-count against the parent goal unless
      a later contract explicitly marks them as parent-goal usage.
- [x] Accounting is persisted in `goal_mode` custom metadata.
- [x] Missing token usage leaves goal state unchanged.
- [x] Tests cover the domain/accounting interface, not UI implementation.

## Implementation status

Implemented with `apply_goal_token_usage`,
`apply_goal_token_usage_event`, and `GoalTokenUsageSubscriber`. The subscriber
listens to existing `TokenUsageUpdated` events and persists changed goal state
through session custom metadata.

Focused verification:
`cargo test -p void-core goal_mode --quiet`.

## Blocked by

None - can start immediately.
