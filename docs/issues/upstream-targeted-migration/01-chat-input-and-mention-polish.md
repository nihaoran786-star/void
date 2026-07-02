# Issue 1: Chat Input And Mention Polish

## What to build

Migrate the upstream chat-input polish that improves image paste undo, mention
triggering, popup Escape behavior, and placeholder stability while preserving
local media references and context handling.

## Acceptance criteria

- [ ] Ctrl+Z / Cmd+Z removes the most recently pasted image context without
      breaking normal text undo.
- [ ] Escape closes slash-command and mention popups before task cancellation.
- [ ] `@` mention only triggers at the start of input or after whitespace.
- [ ] Programmatic mention insertion adds a separating space when needed.
- [ ] Placeholder stays hidden when media/context chips exist.
- [ ] Existing media reference chips and workspace media flows still work.

## Blocked by

None - can start immediately.

