# Issue 6: Persisted Thread Goals

## What to build

Migrate upstream persisted thread-goal runtime and `/goal` workflow in a way
that supports resumable long tasks without breaking sessions, automation,
media flows, or current chat behavior.

## Acceptance criteria

- [x] `/goal` supports create, edit, clear, pause, resume, and multiline
      objectives.
- [x] Thread goals persist in session state with explicit status and budget
      fields.
- [x] Cancelled active goals pause instead of silently disappearing.
- [x] Resuming a paused/blocked/usage-limited goal schedules clear steering
      instead of relying on UI inference.
- [x] Token-budget accounting decisions live in runtime/domain code, not
      page components.
- [x] Existing media sessions and right-side preview behavior still work.

## Implementation status

Implemented the low-risk persisted-goal surface against the existing void
`goal_mode` metadata model:

- Added explicit `GoalModeStatus`, `tokenBudget`, and `tokensUsed` metadata
  fields while preserving the existing legacy `active` field.
- Added domain-level pause/resume/edit/clear transitions and resume steering.
- Added desktop adapter command `update_session_goal`.
- Added frontend parser and service support for `/goal pause`, `/goal resume`,
  `/goal clear`, and `/goal edit <objective>`, including multiline edit text.
- Active goal cancellation now persists paused status and updates the frontend
  active flag through the goal verification event channel.

Runtime/domain token budget accounting is now connected to
`TokenUsageUpdated` events through a goal token-usage subscriber. Goal state
persists `tokensUsed`, transitions budget exhaustion to `usage-limited`, and
frontend services receive `tokenBudget/tokensUsed` without deriving them from
page-level token indicators.

Focused verification:
`cargo test -p void-core goal_mode --quiet`,
`cargo test -p void-runtime-ports goal_mode --quiet`, and
`pnpm --dir src/web-ui run test:run src/flow_chat/services/goalCommandParser.test.ts`.

## Blocked by

- Issue 4.
- Issue 5 can proceed before or after this issue, but final verification must
  cover both together.
