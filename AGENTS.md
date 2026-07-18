# Repository agent rules

## Scope

This file applies to the whole repository. A closer `AGENTS.md` overrides it
for its own directory.

Read [CONTEXT.md](CONTEXT.md) before changing architecture, shared state,
runtime, persistence, sessions, media, short-drama, desktop, or build systems.
Use [docs/README.md](docs/README.md) to distinguish current specifications from
historical evidence.

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
- Never delete a dated plan, audit, result, decision, or migration ledger merely
  because it is old. First prove it has no unique contract or evidence, update
  inbound links, and record the archival decision.

## Protected capabilities

- Flow Chat restore, BTW child sessions, subagent projections, Review Team,
  goals, multitask, and automation.
- AI media submission, polling, workspace save, gallery, preview, trash, and
  stable pending-to-ready tiles.
- AI short-drama project facts, stage agents, fixed Skill policies, attempts,
  revisions, change requests, media/image/video tools, and final preview.
- Desktop windows, compact chat, desktop pet, terminal, Computer Use,
  WebDriver, tray, updater, installer, and Void identity.

## Verification

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
[the current repository audit](docs/qa/repository-audit-2026-07-19.md); do not
silently describe those gates as passing.
