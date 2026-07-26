# BitFun capability baseline — 2026-07-25

Reference inspected: `GCWing/BitFun@21c0382d418424514f9a4db7ad3d232da6956886`
Void implementation workspace: `codex/bitfun-capability-upgrades`

This is a dated comparison checkpoint, not a promise to copy upstream code.
Classifications are: **present**, **partial**, **missing**, **borrow pattern**,
and **deferred**.

Among the six commits ending at BitFun reference `21c0382d`,
`4f4d572d4 fix(permission): honor full access for Bash commands` is the only
permission fix.

| Batch | Capability | Void baseline | Decision and owning boundary | Required evidence |
| --- | --- | --- | --- | --- |
| 1 | Image tool inline preview | Partial: core image tool and attachment rendering exist; no complete inline tool-result projection | Extend existing media/attachment Interface and derived card; no second gallery | tool event-to-attachment contract and image-card regression |
| 1 | Terminal failure and retry UI | Partial: cards expose failures, but session-level diagnostic/retry facts are incomplete | Runtime event Adapter -> session Interface -> derived UI | failed/retrying states and retry regression |
| 1 | HTTP/2 streaming stability | Missing behavior not yet proven at Void provider boundary | Port behavior only inside provider Adapter | focused stream success/failure test |
| 1 | Per-session composer restore | Partial: persistence pieces exist; text and references are not one explicit session model | conversation composer Interface; UI wires only | cross-session restore for text, file, image, Skill, and session refs |
| 2 | Deferred tool loading | Partial: tool specification/collapse foundation exists | Complete missing execution loop through tool registry Interface | deferred discovery and execution tests |
| 2 | Persistent subagent coordination | Partial | coordination Module Interface plus persistence Adapter | restart/wait/terminal-state tests |
| 2 | Resume after context compression | Partial | recovery state owned by runtime/session Module | compression-to-resume integration test |
| 2 | BTW persistence and hydration | Partial: child-session service exists; hydration gap remains | session-scoped persistence and hydration epoch | restart and stale-hydration regression |
| 2 | Agent tool / Skill groups | Partial | lightweight derived configuration view | grouping and policy projection test |
| 3 | Long-term memory | Partial: simple memory capability exists | opt-in two-phase evolution of memory Module | consent, stage, commit, and deletion tests |
| 3 | Local speech recognition | Missing | optional speech Module and local Adapter | unavailable/downloading/ready/failed states |
| 3 | In-app OAuth | Missing or provider-specific | auth/subscription Interface with replaceable Adapters | callback, cancellation, expiry, and failure tests |
| 3 | Unified permissions | Partial | reuse permission Interface; use only `4f4d572d4 fix(permission): honor full access for Bash commands` as upstream permission-fix evidence | mode migration and deny/ask/allow matrix |
| 3 | Claude/Codex/OpenCode config | Missing unified product view | independent read-only source Adapters | absent/invalid/supported-source tests |
| — | Short-drama version and incremental revisions | Present | preserve existing project/revision Module | existing attempt/revision/change-request tests |
| — | Pre-change snapshot | Borrow pattern | add to short-drama revision Interface, not Canvas Runtime | snapshot creation and linkage test |
| — | Last-known-good preview and rollback | Borrow pattern | short-drama preview state and rollback command | crash-to-rollback test |
| — | Structured generation/preview diagnostics | Borrow pattern | explicit short-drama diagnostic value object | category/severity/code/location/fix projection |
| — | Pages, Canvas Runtime, HarmonyOS, SDK Host, cloud sync, full Docker/ProxyJump, upstream UI | Deferred | no implementation in this program | revisit decision only |

## Dependency and state contract

Every row must preserve:

`UI / route -> Module Interface -> Adapter / service -> external system`.

The Interface owns support status and domain errors. Adapters translate
transport, persistence, process, provider, and local-model failures. UI renders
explicit state and never determines support, source, or failure from an empty
collection or raw error string.

Expected state families are:

- asynchronous operations: `idle`, `loading`, `ready`, `failed`;
- retryable operations: add `retrying` and retry metadata;
- optional capabilities: add `unsupported` or `unavailable`;
- version recovery: `current`, `lastKnownGood`, `failedPreview`, and
  `rollbackPending`.

## Allowed and forbidden ownership

Allowed implementation locations are the owning Module, its Interface, focused
Adapters/services, state projections, small presentation components, and
tests. Route/page files and orchestration hotspots may connect the Interface
but must not own retry, persistence, hydration, snapshot, rollback, permission,
or provider rules. UI must not directly access Tauri, filesystem, process,
database, or provider transports.

## Isolation risk

The upgrade worktree is isolated from the primary worktree. The primary
worktree is actively changing, so an apparently clean upgrade diff does not
prove easy integration. Before integration, compare merge-base, commits added
on both branches, generated-file ownership, and overlapping hotspot changes.
Never clean or reset the primary worktree to make integration easier.

## Verification ledger

This checkpoint records classification and required tests only. Implementation
results must append dated evidence in a later QA record, including the exact
commands, pass/fail status, relevant commit, and known baseline failures.
No capability above is marked complete merely because BitFun contains it.
