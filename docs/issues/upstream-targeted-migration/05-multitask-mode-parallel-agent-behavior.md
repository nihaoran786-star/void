# Issue 5: Multitask Mode Parallel Agent Behavior

## What to build

Migrate upstream `Multitask` mode behavior that encourages orthogonal
decomposition and background subagent delegation while preserving existing
Task, subagent, media, and automation capabilities.

## Acceptance criteria

- [x] `Multitask` mode is available as a coding mode.
- [x] `Multitask` uses shared coding tools and shared cache-compatible base
      prompt identity.
- [x] First-entry and ongoing reminders steer the model toward background
      subagents for independent branches.
- [x] File modification batching is not represented as true parallelism.
- [x] Existing subagent visibility and Task behavior remain compatible.

## Implementation status

The local void tree already contained the upstream Multitask mode shape. This
slice keeps it as a coding mode using shared coding tools and shared prompt
cache identity, with reminder templates for first-entry and ongoing turns.
Focused verification:
`cargo test -p void-core shared_template_modes_share_system_prompt_cache_identity --quiet`.

## Blocked by

- Issue 4.
