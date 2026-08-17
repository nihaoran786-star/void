# Repository stability audit — 2026-07-28

## Scope and limits

This checkpoint reviewed the active `codex/minimal-workspace-ui` line after the
session capability rail and Team Workspace entry landed. It covered the Web UI
type/lint/test/build gates, core boundaries, theme and i18n contracts, the Rust
workspace check and core tests, strict E2E TypeScript, repository hygiene, and
full-window evidence for the compact and expanded team layouts.

The review did not modify Rust, the subagent delivery state machine, or the
user-owned untracked `media/` directory. It does not claim that every provider,
desktop window, or authenticated account state was manually exercised.

## Fixed defects

### P1 — BTW history hydration was globally serialized

`BtwSessionPanel` used one loading boolean for every child session. Switching
from historical child A to B while A was still loading skipped B's hydration
and could leave the selected BTW conversation empty.

The in-flight identity is now scoped by child session ID. Duplicate loads for
one child remain suppressed, while different children hydrate independently.
A regression test keeps A pending, switches to B, and verifies both histories
are requested.

### P1 — short-drama events could contaminate another workspace

An event from a background workspace could be interpreted as a mismatch for
the visible workspace and replace its project UI. Event resolution now returns
an explicit `match | ignore | mismatch` result. Different workspaces are
ignored; only a malformed event belonging to the active workspace produces a
mismatch state.

### P1 — stale short-drama loads could overwrite newer state

Initial and event-triggered project loads had independent asynchronous
lifecycles. A slow older load could resolve after a newer workspace/event load
or after unmount and still update the panel.

Both call sites now use one typed latest-wins coordinator. Results are
`ready | stale | failed`; stale results are never applied, and failures remain
explicit presentation state.

### P1 — runtime focus writes could persist the wrong selection

Rapid stage or artifact changes issued overlapping writes to
`.void/short-drama/focus.json`. A slower older write could finish last and
leave agent tools focused on the wrong artifact.

Focus writes are now ordered per manifest Adapter in the short-drama service.
The UI remains a typed consumer and does not own the queue. A regression test
holds the first write open, issues a newer selection, and verifies the newer
focus is persisted last.

### Gate regressions — capability rail tokens and E2E typing

- Raw micro-font pixels introduced by the capability rail now use the existing
  semantic workspace typography tokens.
- The Minimal header contract now explicitly rejects the removed duplicate
  media action; media remains recoverable from the session capability rail.
- The new team-rail desktop E2E no longer adds unresolved WebView-import or
  implicit-`any` errors to the strict E2E TypeScript baseline.

## Visual and performance evidence

The real desktop E2E evidence uses a 2582×1390 window:

- compact rail:
  `.codex-artifacts/team-capability-rail/slice-team-team-rail-compact-full.png`
- three-part layout:
  `.codex-artifacts/team-capability-rail/slice-team-team-coordination-open-full.png`

The compact rail remains 36px wide. Opening Team Workspace preserves the main
conversation, working canvas, and team coordination pane simultaneously. The
E2E contract verifies usable canvas/team widths and no document or scene
horizontal overflow.

Scoped UI score: **18/20**.

- Accessibility: 3/4 — semantic buttons, focus states, labels, and keyboard
  paths are covered; no new comprehensive screen-reader pass was performed.
- Performance: 4/4 — production build and Web performance budget pass.
- Theming: 4/4 — color and visual contracts pass; no undefined variables.
- Responsive behavior: 3/4 — wide desktop and bounded split behavior pass;
  narrow-screen team fallback remains future product work.
- Anti-pattern avoidance: 4/4 — async ordering stays in services, and UI does
  not access persistence directly.

## Remaining blockers and debt

### P1 — E2E strict TypeScript baseline

`pnpm --dir tests/e2e exec tsc --noEmit -p tsconfig.json` still reports 117
historical errors outside the team-rail spec. They include unresolved embedded
browser imports, WebdriverIO promise/value mismatches, nullability, and implicit
`any`. The Gate must be repaired in bounded suites and then added to CI; it
must not be hidden with relaxed compiler options.

### P1 — stage-agent bootstrap retry

Stage-agent creation can return partial bindings, while the current attempt key
can suppress another identical automatic attempt. The safe follow-up is a
bounded retry state with explicit persistence status and no recreation of
already-ready sessions. This belongs to the stage-agent bootstrap Interface,
not the panel or the delivery runtime state machine.

### P2 — repository-wide baseline gates

Remeasured 2026-08-17 (append-only update to this ledger):

- `cargo fmt --check` is now **clean (0 diff blocks)**, down from 388. The
  i18n contract generator formats its generated Rust through rustfmt at
  emission time, so regeneration no longer dirties the gate.
- Web test files are now **inside** the product ESLint input: the
  `*.test.*` / `*.spec.*` ignores were removed from
  `src/web-ui/eslint.config.mjs` after fixing the only 5 pre-existing errors.
  Test files remain outside `type-check:web` (tsconfig excludes); measuring
  and closing that half is still open.
- `cargo clippy --workspace --all-targets` reports **326 warnings and 0
  errors**; a large share is auto-appliable via `cargo clippy --fix`. Adding
  `-D warnings` to CI stays blocked until that batch lands.
- Strict E2E TypeScript now reports **127 errors** (was 117). Two dominant
  classes: `/src/...` absolute imports inside `browser.execute` snippets that
  tsconfig cannot resolve, and strict-null violations in older specs.
- i18n audit passes with the existing grandfathered CJK warning budget
  (26 lines).
- Desktop `cargo test -p void-desktop --lib` is restored: four Team fixtures
  missing `delegation_policy` had blocked compilation since the bounded
  member delegation change. Reviving the gate exposed a real
  backward-compatibility defect that the compile break had masked: the
  delegation change added `memberRunId` to the expected durable member launch
  context, so every pre-delegation interrupted member task failed recovery
  preflight with `InvalidLaunchSpec`. The adapter now requires `memberRunId`
  exactly when the persisted record carries it and tolerates its absence only
  for records without typed launch authority. Desktop 199/199 (1 ignored) and
  void-core 1433/0 pass.

## Verification snapshot

Passed:

- `pnpm run type-check:web`
- `pnpm run lint:web`
- `pnpm --dir src/web-ui run test:run` — 468 files / 2608 tests
- `pnpm run check:core-boundaries`
- `pnpm run check:theme-colors`
- `pnpm run check:theme-visual-contract`
- `pnpm run i18n:contract:test` — 15 tests
- `pnpm run i18n:audit` — passed with the existing warning budget
- `pnpm run build:web` — Web performance budget passed
- `cargo check --workspace`
- `cargo test --locked -p void-core` — 1221 passed / 2 ignored across unit and
  integration suites

Known failing baselines (updated 2026-08-17):

- strict E2E TypeScript — 127 errors; repair in bounded suites, then add to CI
- Clippy — 326 warnings / 0 errors; not yet enforced in CI
- Rust formatting and repository hygiene are clean as of 2026-08-17; test
  files are now inside the Web ESLint gate
