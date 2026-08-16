# Repository agent rules

## Scope

This file applies to the whole repository. A closer `AGENTS.md` overrides it
for its own directory.

Read [CONTEXT.md](CONTEXT.md) before changing architecture, shared state,
runtime, persistence, sessions, media, short-drama, desktop, or build systems.
Use [docs/README.md](docs/README.md) to distinguish current specifications from
historical evidence.

## Documentation governance

- Keep current collaboration state in `CONTEXT.md` and the document map in
  `docs/README.md`.
- Treat current specifications as authoritative Interfaces. Dated plans,
  audits, results, decisions, and migration ledgers are checkpoint evidence,
  not current status.
- When implementation supersedes a plan, update its status and link the merge
  or result evidence instead of silently leaving contradictory claims.
- A document is current **only if it is linked from `docs/README.md`**. Unlinked
  documents are deletable by default. The burden of proof is on retaining a
  document, not on deleting it.
- Before deleting, extract any unique contract into a current specification and
  confirm no runtime consumer. Then record the deletion in the `docs/README.md`
  cleanup record — record the decision, not the document.
- Keep **one append-only ledger per domain**. Never create a new dated plan,
  audit, or result file when an existing current document can be updated.
- Dated evidence is deleted once merged into a current specification. Stale
  documents cost every future agent session context and mislead it; that cost is
  real and recurring, while the evidence value of a completed checkbox is not.

## Change discipline

- Preserve user-owned and unrelated working-tree changes.
- Make one small, independently reviewable change at a time.
- Do not replace a working Module or bypass its Interface for presentation
  convenience.
- Keep dependency direction:
  `UI / route -> Module Interface -> Adapter / service -> external system`.
- UI renders explicit state. It must not infer session source, capability,
  error, or support status from empty arrays or raw strings.
- Do not call Tauri, filesystem, process, database, or provider transports
  directly from page and presentation components.
- Keep runtime, persistence, Skill policy, media routing, and session lifecycle
  out of visual-only changes.
- Treat `ChatInput.tsx`, `FlowChatStore.ts`, `ContentCanvas.tsx`, and
  `ShortDramaCenterPanel.tsx` as orchestration hotspots; do not add unrelated
  business rules to them.
- Generated files are changed only by their owning generator.

## Protected capabilities

- Flow Chat restore, BTW child sessions, subagent projections, Review Team,
  goals, multitask, and automation.
- AI media submission, polling, workspace save, gallery, preview, trash, and
  stable pending-to-ready tiles.
- AI short-drama project facts, stage agents, fixed Skill policies, attempts,
  revisions, change requests, media/image/video tools, and final preview.
- Desktop windows, compact chat, desktop pet, terminal, Computer Use,
  WebDriver, tray, updater, installer, and Void identity.
- Both workspace presentations. `WorkspacePresentation` is `'classic' |
  'minimal'` and both are supported; `minimal` is only the default. A
  `*.minimal.scss` file is an **overlay** scoped under `.void-ui--minimal` on top
  of its classic base, not a duplicate of it, and neither side may be deleted as
  "duplicated CSS". Do not merge the overlays, remove the presentation mode
  machinery in `app/presentation/workspacePresentation.ts`, drop the
  `minimalWorkspacePresentation.scss` aggregator, or delete the `void-ui--classic`
  branch. See the SCSS section of
  [the lightweighting program](docs/plans/lightweighting-program.md).

## Test policy

- Never write a test that reads a `.scss`, `.css`, or `.tsx` file as **text**
  and asserts on its contents. Reading a stylesheet with `readFileSync` /
  `readSource` / `readSibling` and matching class names, selectors, or tokens
  tests nothing: it restates the source, breaks on every refactor, and blocks
  style consolidation. 101 such files (14,001 lines) were deleted on 2026-08-16.
- Test rendered output and behaviour, not source strings. If a visual property
  genuinely needs a guard, use a rendering assertion or a screenshot test — and
  keep the number of screenshot tests in the single digits.
- Do not add a test whose failure would not indicate a real defect. Assertions
  on constants, i18n key existence, CSS class names, barrel exports, and
  "renders without crashing" are not coverage.

## Verification

Put temporary screenshots, logs, and verifier-specific build outputs under
`.codex-artifacts/` or the operating-system temp directory. Do not create
repository-root `target-*`, `artifacts/`, or `media/` directories. Remove
temporary verifier outputs after the relevant result has been recorded.

Choose the smallest matching checks, then widen in proportion to risk:

```powershell
pnpm run check:repo-hygiene
pnpm run check:core-boundaries
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
pnpm run i18n:contract:test
pnpm run i18n:audit
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
pnpm run build:web
cargo check --workspace
cargo test --locked -p void-core
```

E2E, desktop packaging, Rust formatting, and Clippy are scope-dependent gates.
Known baseline failures and coverage gaps are tracked in
[the current repository audit](docs/qa/repository-stability-audit-2026-07-28.md);
do not silently describe those gates as passing.
