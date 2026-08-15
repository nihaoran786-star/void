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
  command migration for Workspace Media/AI Short Drama, staged first-party
  expansion, stability gates, and bounded DeepSeek Harness compatibility
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
- [Quiet Directory design system](design/quiet-directory-design-system.md)
  — current entity-glyph (Agent orb / Skill sigil / Connector link) and
  hairline directory-row language for the Minimal presentation; covers the
  Agents, Skills, and Connectors catalogs plus the Automation chrome and list
  view, with the Automation calendar structure preserved
- [Porcelain Air navigation/chat execution prompt](handoffs/porcelain-graphite-nav-chat-prompt.md)
  — self-contained prompt for a fresh AI to implement only the approved first
  slice without relying on this conversation
- [Web UI performance boundaries](architecture/web-ui-performance-boundaries.md)
- [Core decomposition](architecture/core-decomposition.md)
- [i18n architecture](architecture/i18n.md)
- [Development i18n guide](development/i18n.md)
- [Minimal workspace parity checklist](qa/frontend-minimal-workspace-parity.md)

## Historical program ledgers

The following files are the frozen 2026-07 upstream migration ledger. They are
retained because they contain unique decisions, classifications, tests, and
protected contracts. New general project status must go in `CONTEXT.md`, not in
these ledgers.

- [Migration PRD](PRD.md)
- [Migration issues](ISSUES.md)
- [Migration decisions](DECISIONS.md)
- [Migration test plan](TEST_PLAN.md)
- [Migration progress](PROGRESS.md)

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
- `docs/superpowers/specs/` records accepted design specifications.
- `docs/superpowers/plans/` records implementation plans.
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
- `docs/obsidian/` is a historical 2026-06 collaboration snapshot.

## Cleanup record

The 2026-07-28 documentation review found no exact duplicate among 357 tracked
Markdown files. Dated plans, audits, results, decisions, completed issue
contracts, and migration ledgers were retained because they contain unique
acceptance criteria or evidence.

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
