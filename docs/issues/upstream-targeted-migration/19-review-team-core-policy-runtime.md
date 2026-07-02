# Issue 19: Review Team Core Policy And Runtime Migration

## What to build

Migrate upstream Review Team / Deep Review core policy, queue, retry, judge, and
manifest behavior into the local core runtime, using the contract from Issue 18.
The core runtime should own Review Team decisions; UI and desktop APIs should
only request actions and render returned state.

## Acceptance criteria

- [x] Core Review Team policy, queue, retry, and judge behavior matches the
      accepted upstream contract.
- [x] Review Team work packets and manifests keep explicit status, source, error,
      and retry metadata.
- [x] Existing Task/subagent visibility remains compatible with Review Team
      launches.
- [x] Runtime event and goal-mode changes do not bypass token budget or
      usage-limited behavior.
- [x] Focused core tests cover accepted, rejected, retry, partial timeout, and
      judge-result paths.

## Implementation notes

- No source overwrite was accepted for this slice. Local core Review Team files
  match or exceed upstream behavior; remaining upstream differences are
  BitFun naming or would remove local tests.
- Goal-mode runtime/token-budget behavior is preserved from the local
  `usage-limited` accounting slice instead of taking the older upstream desktop
  thread-goal API diff.
- Verification is tracked in Issue 22.

## Blocked by

- Issue 18: Review Team Upstream Diff And Contract Audit.
