# Issue 12: Prompt Prefix Identity

## What to build

Define a domain-owned prompt prefix identity model for shared coding modes,
`/btw`, Task/fork subagents, and goal resume turns. The runtime should know when
two turns can safely reuse the same provider cache prefix.

## Acceptance criteria

- [x] Prompt prefix identity includes stable scope key, base prompt hash,
      toolset hash, user-context hash, and optional parent session linkage.
- [x] `agentic`, `Plan`, `debug`, and `Multitask` keep compatible coding prompt
      identities when their stable prefix is unchanged.
- [x] `/btw` and Task/fork subagents can clone parent prefix identity only when
      their prefix-safe fields match.
- [x] Tool or capability-list changes invalidate only the affected prefix
      identity.
- [x] Tests cover safe reuse and forced invalidation.

## Blocked by

- Issue 11: Cache Telemetry Contract.

## Implementation status

Completed in the runtime/domain slice:

- Added `PromptPrefixIdentity` in runtime ports.
- Added `Agent::prompt_prefix_identity()` default implementation using stable
  hashes for prompt scope, toolset, and user-context policy.
- Added tests for shared coding mode reuse and tool-list invalidation.
