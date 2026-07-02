# Issue 9: Runtime Event Contract For Goal Usage

## What to build

Clarify the runtime event contract that feeds goal accounting without changing
media panel, `/btw`, automation, or review team event semantics. Goal accounting
must consume structured token usage fields from the runtime event layer and keep
UI as a renderer of explicit state.

## Acceptance criteria

- [x] Runtime token events expose `sessionId`, `turnId`, `modelId`,
      `totalTokens`, `cachedTokens`, `tokenDetails`, and an explicit
      `isSubagent` flag.
- [x] Goal accounting only consumes events with an unambiguous source.
- [x] Existing web token usage handling keeps working from the same event.
- [x] Tests cover event-to-goal accounting boundaries.

## Implementation status

Kept the existing `TokenUsageUpdated` event shape and added a goal-domain
event conversion function. Existing token usage subscribers and web listeners
continue to consume the same event.

Focused verification:
`cargo test -p void-core goal_mode --quiet` and `pnpm run type-check:web`.

## Blocked by

- Issue 7: Goal Token Accounting.
