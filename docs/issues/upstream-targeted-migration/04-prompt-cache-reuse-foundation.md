# Issue 4: Prompt Cache Reuse Foundation

## What to build

Migrate upstream prompt-cache reuse concepts for shared coding modes, `/btw`,
forked subagents, and capability-list hot updates without changing void
branding or media behavior.

## Acceptance criteria

- [x] `agentic`, `Plan`, `debug`, and `Multitask` can share compatible system
      prompt cache identity.
- [x] `/btw` child sessions clone the parent session prompt cache when safe.
- [x] `Task` fork-context subagents clone parent prompt cache and reject fields
      that would drift from the parent prefix.
- [x] Skill/subagent listing updates avoid unnecessary base prompt invalidation.
- [x] Provider cache telemetry remains observable.

## Implementation status

Verified in the local codebase rather than reimported wholesale from upstream:
shared coding prompt cache identities, user-context cache scope keys, parent
prompt-cache cloning for forked subagents, dynamic tool listing reminders, and
startup diagnostics remain present. Focused verification:
`cargo test -p void-core shared_template_modes_share_system_prompt_cache_identity --quiet`.

## Blocked by

- Issue 2 is independent.
- Issue 5 depends on this foundation for `Multitask` cache behavior.
- Issue 6 depends on this foundation for long-running goal efficiency.
