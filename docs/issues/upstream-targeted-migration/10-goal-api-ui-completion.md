# Issue 10: Goal API And UI Completion

## What to build

Expose the runtime-owned goal accounting state through existing API and web
services so `/goal` users can inspect budget status without UI components
guessing from unrelated token indicators.

## Acceptance criteria

- [x] `update_session_goal` and related web service types preserve
      `status`, `tokenBudget`, and `tokensUsed`.
- [x] `/goal resume` user-visible messaging distinguishes paused, blocked, and
      usage-limited failures.
- [x] Chat UI does not calculate goal budget state from current context token
      usage.
- [x] Focused frontend tests cover parser/service behavior.

## Implementation status

Desktop `update_session_goal` now returns stable status strings plus
`tokenBudget/tokensUsed`. Web API and `goalService` preserve these fields.
Chat UI continues to call the service and does not infer budget state from
context token indicators.

Focused verification:
`cargo test -p void-desktop goal_mode_status_wire --quiet`,
`pnpm --dir src/web-ui run test:run src/flow_chat/services/goalService.test.ts src/flow_chat/services/goalCommandParser.test.ts`,
and `pnpm run type-check:web`.

## Blocked by

- Issue 8: Goal Budget State Machine.
