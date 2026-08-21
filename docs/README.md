# Documentation index

Use this page to distinguish current collaboration documents from historical
evidence. A dated file describes its recorded checkpoint; it is not
automatically the current source of truth.

## Current collaboration

- [Repository context](../CONTEXT.md)
- [Repository rules](../AGENTS.md)
- [Current repository stability audit](qa/repository-stability-audit-2026-07-28.md)
- [Repository architecture and coupling audit](qa/repository-audit-2026-07-19.md)
- [New-session and workspace-media stability review](qa/new-session-media-stability-2026-07-27.md)

## Current architecture and product specifications

- [Architecture](ARCHITECTURE.md) — long-lived contracts retained from the
  upstream migration program
- [Minimal workspace migration](architecture/frontend-minimal-workspace-migration.md)
- [Customization Center and active persona specification](features/customization-center-prd.md)
  — current Desktop/Tauri persona and compatible reusable-Team runtime status,
  with deferred policy and platform boundaries
- [Team Workspace product and architecture specification](features/team-workspace-prd.md)
  — current reusable-Team definition/runtime status, bounded member-to-worker
  delegation, recursive conversation projection, and staged expansion contract
- [Canvas plugin platform product and architecture specification](features/canvas-plugin-platform-prd.md)
  — current product north star for the central conversation plus right
  collapsible Content Canvas, typed surface/domain/Agent/Team/Workflow
  contribution boundaries, Canvas-based Agent Studio, hot configuration versus
  revision-frozen execution, the verified P0-A/P0-B Canvas registry and typed
  command migration for Workspace Media/AI Short Drama, the P1-A1 immutable
  Agent revision/catalog/runtime core, staged first-party expansion, stability
  gates, and bounded DeepSeek Harness compatibility
- [Interaction and theme governance specification](features/interaction-theme-governance.md)
  — current presentation-only rules for interaction states, theme ownership,
  responsive layout, accessibility, full-window evidence, and performance;
  includes the 2026-08-09 Porcelain Air implementation checkpoint, full
  parallel Web-suite result, and remaining release-evidence boundaries
- [Porcelain Air design system](design/porcelain-graphite-design-system.md)
  — selected light, friendly productivity direction; the current slice keeps
  the token architecture, permits scoped semantic-color correction, and now
  covers the shell, navigation, chat, tool calls, composer, customization
  markets, Canvas, Team Workspace, and Welcome/new-session presentation
- [Catalog and Sidebar design system](design/catalog-and-sidebar-design-system.md)
  — current shared directory top bar, three-line catalog card, entity-glyph
  table and Minimal sidebar rules (one icon column, one scroller with pinned
  section heads, remembered workspace fold); covers the Employees, Teams,
  Skills, and Connectors catalogs
- [Quiet Directory design system](design/quiet-directory-design-system.md)
  — current hairline-row language for the Automation chrome and list view, with
  the Automation calendar structure preserved; its catalog sections were
  superseded on 2026-08-18 by the Catalog and Sidebar design system
- [Porcelain Air navigation/chat execution prompt](handoffs/porcelain-graphite-nav-chat-prompt.md)
  — self-contained prompt for a fresh AI to implement only the approved first
  slice without relying on this conversation
- [Web UI performance boundaries](architecture/web-ui-performance-boundaries.md)
- [Core decomposition](architecture/core-decomposition.md)
- [i18n architecture](architecture/i18n.md)
- [Development i18n guide](development/i18n.md)
- [Minimal workspace parity checklist](qa/frontend-minimal-workspace-parity.md)

## Historical program ledgers

The frozen 2026-07 upstream migration ledger. New general project status must go
in `CONTEXT.md`, not in these files.

- [Ledger archive](ledger-archive.md) — the durable content of the former
  `ISSUES.md`, `TEST_PLAN.md` and `PROGRESS.md`: protected capabilities,
  permanently rejected decisions, and the acceptance criteria still asserted by
  live tests (every cited test path verified to exist).
- [Migration PRD](PRD.md)
- [Migration decisions](DECISIONS.md)

## Completed capability upgrade evidence

The BitFun-inspired capability work was implemented on isolated branches and
merged into this branch by `6c3e651a3` on 2026-07-26. These files remain as
dated implementation and decision evidence; they are not active work queues.

- [BitFun capability upgrade program](plans/2026-07-25-bitfun-capability-upgrade-program.md)
- [BitFun capability baseline](qa/bitfun-capability-baseline-2026-07-25.md)
- [BitFun Batch 1 Web UI results](qa/bitfun-web-ui-batch1-results-2026-07-25.md)
- [BitFun capability upgrade results](qa/bitfun-capability-upgrade-results-2026-07-26.md)
- [Agent runtime upgrade program](plans/2026-07-25-agent-runtime-upgrade-program.md)
- [Agent runtime migration decisions](decisions/2026-07-25-bitfun-runtime-migration-ledger.md)
- [Agent runtime Slice A result](results/2026-07-25-agent-runtime-upgrade-result.md)

## Long-lived engineering plans

- [Core decomposition plan](plans/core-decomposition-plan.md) — staged
  architecture work; completed checkboxes are evidence and remaining owner
  slices require their own risk review before execution.
- [Desktop fullscreen plan](plans/desktop-window-fullscreen-plan.md) — core
  capability is implemented; unchecked menu/settings and cross-platform manual
  checks are deferred follow-ups, not the current UI queue.

## Dated evidence and implementation records

- `docs/qa/*audit*.md` and `docs/architecture/*results.md` are checkpoint
  evidence.
- [Account and session usage design QA](qa/design-qa-account-session-usage-2026-07-24.md)
- [Theme normalization audit](qa/theme-normalization-audit-2026-07-25.md)
- `docs/plans/` records longer-lived engineering plans.
- [Agent draft debug chat implementation plan](plans/2026-08-07-agent-debug-chat.md)
  is completed implementation evidence; its current product contract is folded
  into the Customization Center specification.
- Feature PRDs not listed under “Current architecture and product
  specifications” are retained design or implementation records. In
  particular, the original UI-system foundation draft is superseded by the
  current interaction/theme governance specification; old Media, Automation,
  compact-chat, usage, and branding documents do not override `CONTEXT.md` or
  a newer current specification.

## Retention rule

A document is current **only if it is linked from this file**. Unlinked
documents are deletable by default — the burden of proof is on retaining a
document, not on deleting it.

Each domain keeps **one append-only ledger**. Do not create a new dated plan,
audit, or result file when an existing current document can be updated.

Evidence documents are deleted once their unique contract has been merged into
a current specification. Record the deletion here, not the document.

## Cleanup record

- **2026-08-20** — `plans/agent-hub-consolidation-plan.md` and
  `plans/staff-hq-refactor-handoff.md` were deleted after their contract was
  merged into
  [Catalog and Sidebar](design/catalog-and-sidebar-design-system.md) (new
  "AGENT — the single-page directory" section) and `CONTEXT.md`; the
  `assistant` scene was removed and assistant configuration now lives in the
  `profile` scene.
- **2026-08-18** — The catalog sections of the Quiet Directory design system
  (entity-glyph table, hairline directory-row language, per-catalog application
  rows) were removed rather than left contradicting the implementation: the
  Employees, Teams, Skills and Connectors catalogs now follow
  [Catalog and Sidebar](design/catalog-and-sidebar-design-system.md). Quiet
  Directory is retained for the Automation surface, which still uses it. The
  retired `skillSigil.ts` and `linkGlyph.ts` modules and their tests were
  deleted with their last consumer.
- **2026-08-17** — Repository-root design scaffolds `design-lab/` (26 tracked
  files), `design-demo/` (10 files), `demos/` (1 file) and five unreferenced
  `png/` marketing screenshots (~6 MB total) were deleted. None had inbound
  links from governance documents or code; the only mention was an incidental
  ignore-list example in a handoff prompt. The scaffold directories are now
  gitignored so disposable design experiments stay out of the index.
  `png/void-Logo.png` and `png/void_title.png` are retained as the source and
  output of `scripts/generate-void-logo-assets.mjs`.
- **2026-08-16** — `docs/superpowers/` (43 files), `docs/issues/` (44 files) and
  `docs/obsidian/` (5 files) were deleted: 92 files / ~7,800 lines, of which 79
  had zero inbound links from any governance document. The AI-customer-service
  design and presentation plan were held back in `docs/features/_incoming/`
  pending a contract merge into the Canvas plugin platform specification. See
  [the lightweighting program](plans/lightweighting-program.md).
- The 2026-07-28 review's retain-everything conclusion is superseded by the
  retention rule above; it was the direct cause of the orphan accumulation.

The disposable `docs/prototypes/aggressive-minimal-workspace/` prototype was
deleted after confirming it had no inbound link or runtime consumer. Its
accepted layout, progressive-disclosure, media-focus, and accessibility
constraints are preserved in the current Minimal workspace migration and Team
Workspace specifications. Nothing was deleted solely because of age.

The 2026-08-09 cleanup leaves 146 tracked Markdown files under `docs/` and 365
tracked Markdown files repository-wide. No historical
document was deleted: dated plans, audits, decisions, results, migration
ledgers, and the Obsidian snapshot still contain unique contracts or checkpoint
evidence. Current status was reconciled into `CONTEXT.md`; the documentation
map points to the current interaction/theme governance specification, and the
completed Agent debug-chat plan remains evidence rather than an active queue.
The rejected live OpenWork UI/code reference was removed from current guidance;
only the user-approved promotional image remains a visual reference.
