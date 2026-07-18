# Repository quality and coupling audit — 2026-07-19

## Scope and method

This is a checkpoint audit of tracked product code, configuration, tests, and
documentation. It combines a structural graph (2,934 files, 52,762 nodes),
repository scripts, Web UI checks, Rust/CLI checks, link and document metadata
scans, and focused source review. It does not claim that every executable path
was manually exercised or that no undiscovered defect exists.

Protected user changes, generated version files, `.codex-artifacts/`, the
untracked `docs/prototypes/` directory, and the user-owned media tool-card
working-tree change were not modified or included in this audit change.

## Fixed defects

### P0 — undefined minimal-workspace theme tokens

Three token names introduced in the minimal Flow Chat styles were not defined
by the shared theme contract:

- `--workspace-surface-base`
- `--workspace-radius-card`
- `--workspace-surface-subtle`

CSS declarations using them were ignored at runtime, and
`pnpm run check:theme-colors` failed with 53 undefined unique variables against
the 50-variable baseline. The styles now reuse the existing canvas, panel, and
panel-radius tokens. The theme-color Gate returns to the 50-variable baseline.

### P1 — reopened canvas tab could remain invisible

`closeTab` auto-merges an empty split, but `reopenClosedTab` previously restored
the tab to its historical group without checking whether that group exists in
the current layout. Closing the final secondary tab and pressing
Ctrl+Shift+T therefore produced `activeGroupId=secondary` while
`splitMode=none`; the reopened tab existed in state but was not rendered.

The canvas store now maps the historical group to a group visible in the
current layout. Focused tests cover secondary-to-primary restoration after an
auto-merge and tertiary-to-secondary restoration after a grid downgrade.

### P1 — tertiary canvas group was aliased to secondary

`moveTabToGroup`, `useGroupTabs`, and `useActiveTabId` handled `primary` versus
"everything else", so `tertiary` reads and moves were silently redirected to
`secondary`. The short-drama stage-agent orchestrator could then find an
existing tertiary tab, fail to move it, switch a non-existent secondary tab,
and still return `status: ready`.

The store now resolves every `EditorGroupId` through the existing group helper,
keeps tertiary move targets visible by enabling grid layout, and has focused
store plus short-drama integration coverage. The older `CanvasContext` and
`AuxPane` Interfaces still expose only primary/secondary groups; tertiary
support there remains explicit follow-up debt rather than being silently
claimed as complete.

## Coupling review

### High priority

- **Module:** Flow Chat composer. **Interface:** the `ChatInput` component
  currently has very high structural fan-out. Its **Implementation** combines
  several concerns behind a large view Interface, reducing **Locality** and
  increasing change risk. Future work should extract feature-owned behavior at
  proven **Seams**, not perform a broad rewrite.
- **Module:** E2E verification. **Interface:** runnable WebDriver suites.
  Strict TypeScript currently reports 73 errors, including unresolved modules,
  async values used as sync numbers, nullable values, WebdriverIO API typing,
  and implicit `any`. CI does not run this Gate, so some tests can compile
  through Vitest/Webdriver tooling without a reliable type contract.
- **Module:** Short Drama project state. The global project-changed event lacks
  session/owner identity, while `ShortDramaCenterPanel` can convert an unrelated
  workspace event into an active-session mismatch. The event **Adapter** needs
  an explicit `match | ignore | mismatch` result; unrelated background events
  must not mutate the visible workspace.
- The short-drama event reload path lacks a request epoch. A slow load for
  workspace A can overwrite a completed load for workspace B or write after
  unmount. The panel's initial-load path already demonstrates the required
  cancelled guard; event reload should use the same latest-wins **Seam**.
- Runtime-focus persistence uses fire-and-forget writes. Rapid A -> B focus can
  leave A on disk when A completes last. A workspace-scoped writer **Module**
  must serialize/coalesce writes or enforce a monotonic revision.

### Medium priority

- **Module:** Rust workspace quality. `cargo fmt --all -- --check` reports 145
  files and 382 diff blocks; Clippy with warnings denied reports 19 diagnostics
  across multiple crates. These are existing repository-wide debts. A mechanical
  all-workspace rewrite would cross too many Modules for this focused audit.
- Web UI tests are excluded from the ESLint and TypeScript project inputs.
  Vitest can execute them, but their source does not receive the same static
  contract as product code.
- Browser panel/scene direct-Tauri lifecycle calls remain an explicitly
  registered legacy exception. Do not add more external-system decisions there;
  the next safe step is a tested browser controller **Adapter**.
- Stage-agent binding persistence errors are flattened into ordinary partial
  validation and the bootstrap attempt key can suppress retry. The bootstrap
  Interface needs explicit persistence status plus a bounded retry state that
  does not recreate existing sessions.
- `BtwSessionPanel` uses one loading boolean across child session IDs. Switching
  from child A to B while A hydrates can skip B permanently. Hydration needs a
  session-scoped in-flight identity/epoch behind `BtwThreadService`.
- `ShortDramaCenterPanel` derives a session signature that includes ordinary
  activity and can repeat binding I/O at streaming update frequency. A
  memoized, stage-identity-only subscription would improve **Locality** without
  pausing background runtime correctness.
- The short-drama team close control currently passes through a shared
  close-all tab action Interface even when minimal presentation uses the action
  to collapse the team. This is a shallow semantic mismatch. It is contained in
  composition and covered by recovery tests; changing the shared Interface now
  would have lower **Leverage** than preserving the stable behavior.

## Documentation audit

- 337 tracked Markdown files were inspected; 124 are under `docs/`.
- No exact duplicate tracked documents were found.
- No tracked document was safe to delete solely because of age.
- The root collaboration entry was missing, causing broken `AGENTS.md` links
  from E2E and module instructions.
- Minimal workspace documents contained stale 44px/300px geometry and
  contradictory default-switch statements.
- The 2026-07 migration consensus files contain unique contracts and evidence.
  They are now classified as a frozen historical ledger rather than current
  general project status.
- `docs/obsidian/` is historical context, not a live machine-local source.

## Verification snapshot

Passed before or during this audit:

- `pnpm run check:repo-hygiene`
- `pnpm run check:github-config`
- `pnpm run check:core-boundaries`
- `pnpm run check:brand-residue`
- `pnpm run check:theme-colors`
- `pnpm run check:theme-visual-contract`
- `pnpm run i18n:contract:test`
- `pnpm run i18n:audit` with the existing warning budget
- `pnpm run type-check:web`
- `pnpm run lint:web`
- Web UI final broad suite: 342 files / 1,942 tests
- Mobile Web type check
- `cargo check --workspace --exclude void-cli`
- `cargo test --locked -p void-core` with two ignored tests
- `cargo check -p void-cli`
- `cargo test -p void-cli`: 7/7

Known failing baseline Gates:

- `pnpm --dir tests/e2e exec tsc --noEmit -p tsconfig.json`: 73 errors
- `cargo fmt --all -- --check`: 145 files / 382 diff blocks
- `cargo clippy --workspace --exclude void-cli --all-targets -- -D warnings`:
  19 diagnostics

## Follow-up order

1. Make the E2E type contract runnable, then add it to CI.
2. Introduce Rust formatting in bounded crate batches; do not mix 145-file
   formatting churn with product behavior changes.
3. Resolve Clippy diagnostics Module by Module and add the Gate only after its
   baseline is clean.
4. Extend lint/type coverage to test sources with an explicit test tsconfig.
5. Decompose `ChatInput` only through behavior-preserving, test-backed Seams.
