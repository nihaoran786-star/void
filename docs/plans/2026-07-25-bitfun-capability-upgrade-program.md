# BitFun capability upgrade program

Date: 2026-07-25
Status: Batch 1 Web UI complete; Batches 2 and 3 are outside this worktree's current scope
Reference: `GCWing/BitFun@21c0382d418424514f9a4db7ad3d232da6956886`

Batch 1 implementation evidence is recorded in
[the dated result](../qa/bitfun-web-ui-batch1-results-2026-07-25.md). The
HTTP/2 item was verified as not currently enabled and remains behind the
separate Rust dependency/lockfile approval gate.

## Objective and boundaries

Use current BitFun as implementation evidence, not as Void's source of truth.
Reproduce useful capabilities through Void's existing Modules and Interfaces;
do not merge the upstream tree, replace whole files, or import its crate and UI
layout. Keep the product lightweight and preserve all protected Flow Chat,
media, short-drama, desktop, BTW, subagent, Goal, multitask, and automation
capabilities.

All implementation must keep the dependency direction:

`UI / route -> Module Interface -> Adapter / service -> external system`

Pages and presentation components render explicit state only. They must not
call Tauri, the filesystem, processes, databases, providers, or upstream
transports directly.

## Delivery batches

### Batch 1 — visible reliability

1. Show image-tool results inline through the existing media/attachment
   projection instead of creating a second gallery path.
2. Project terminal failure, retry, and actionable diagnostics from runtime
   events into explicit session state and UI cards.
3. Adopt the proven provider HTTP/2 streaming fix at the relevant Adapter
   boundary, with focused transport regression tests.
4. Persist composer text, file/image references, Skill references, and session
   references per conversation; restore them without inference from empty
   arrays or raw labels.

### Batch 2 — short-drama multi-agent continuity

1. Complete deferred tool loading around the existing tool-spec capability;
   do not duplicate the current tool registry.
2. Persist subagent coordination and waiting facts behind a Module Interface.
3. Resume work after context compression from explicit recovery state.
4. Persist BTW child sessions and scope hydration epochs per session.
5. Expose Agent tools and Skills as lightweight derived groups rather than
   copying upstream's large configuration UI.

### Batch 3 — optional product expansion

1. Evolve the existing memory Module into opt-in, two-phase long-term memory.
2. Add local speech recognition as an optional Adapter with explicit model
   availability and download states.
3. Add in-app OAuth behind a subscription/auth Interface with replaceable
   provider Adapters.
4. Unify permission modes and migration through the existing permission
   Interface. Among the six commits ending at BitFun reference `21c0382d`,
   `4f4d572d4 fix(permission): honor full access for Bash commands` is the
   only permission fix. Use it as permission-fix evidence, but port only
   behavior proven missing in Void.
5. Read Claude, Codex, and OpenCode configuration through independent,
   read-only-by-default source Adapters and present a unified product model.

Long-term memory, speech, OAuth, and external configuration compatibility are
feature-gated. They must not become mandatory startup dependencies.

## Canvas ideas used only inside Short Drama

Do not migrate BitFun Canvas Runtime. Short Drama may borrow four bounded
ideas through its existing project/revision model:

- a complete snapshot immediately before an AI change;
- a recorded last-known-good preview version;
- structured diagnostics with category, severity, code, location, and
  suggested fix;
- rollback to the last-known-good version after preview failure.

The short-drama Module owns snapshots, diagnostics, and rollback decisions.
The preview UI only requests actions and renders state. Existing project
versions, attempts, revisions, change requests, pagination, generation,
workspace save, and stable pending-to-ready media tiles remain authoritative.

## Architecture gate

For every implementation slice, record before coding:

- **Module and owner:** the existing or new bounded Module that owns the fact;
- **Interface:** commands, queries, state, errors, and support status;
- **Adapter:** persistence, runtime, provider, speech, or configuration source;
- **allowed files:** Module implementation, Interface types, focused Adapter,
  derived UI projection, and tests;
- **forbidden owners:** route/page files and orchestration hotspots
  (`ChatInput.tsx`, `FlowChatStore.ts`, `ContentCanvas.tsx`,
  `ShortDramaCenterPanel.tsx`) may wire calls but must not acquire new business
  rules;
- **state model:** explicit idle/loading/ready/failed/unsupported/retrying or
  domain-equivalent states;
- **tests:** Interface contract, Adapter behavior, state projection, and the
  smallest relevant UI regression.

Crossing these boundaries requires a documented decision before editing.

## Isolation and integration

Implementation occurs in `D:\codex\void-bitfun-upgrades` on
`codex/bitfun-capability-upgrades`. `D:\codex\void-source` is an independently
changing main worktree and must not be modified, cleaned, reset, or used for
generated output. Its HEAD may advance while this program runs, so every
integration checkpoint must compare merge-base and working-tree state before
rebasing or merging. Integration, push, dependency installation, and generated
file updates remain separately authorized actions.

## Validation and completion

Each slice first runs its focused tests, then the smallest applicable repository
gates. Cross-batch checkpoints use:

```powershell
pnpm run check:repo-hygiene
pnpm run check:core-boundaries
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
pnpm run build:web
```

Add `cargo check --workspace` and focused Rust tests when a Rust Module or
Adapter changes. Theme and i18n gates are required for affected UI. Record
baseline failures as evidence; never relabel them as passing.

A batch is complete only when its capability is explicit at the Interface,
failure and unsupported states are visible, focused regression tests pass, and
the dated baseline is updated with evidence.

## Deferred scope

Defer Pages, HarmonyOS, SDK Host, multi-device cloud sync, full
Docker/ProxyJump, BitFun Canvas Runtime, and the upstream UI wholesale. Revisit
only after the three batches demonstrate a concrete product need.
