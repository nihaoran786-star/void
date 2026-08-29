# Documentation index

What this is: the map of every document under `docs/`. A document is current
**only if this page links it**; unlinked documents are deletable by default. A
dated file records the checkpoint in its title — it is never automatically the
current source of truth.

Start with [`CONTEXT.md`](../CONTEXT.md), then the one specification that owns
the area you are changing.

## Start here

- [Repository context](../CONTEXT.md) — current product state, architecture map,
  quality baseline
- [Repository rules](../AGENTS.md) — how to work in this repository
- [Repository stability audit — 2026-07-28](qa/repository-stability-audit-2026-07-28.md)
  — the named current gate audit
- [New-session and workspace-media stability review — 2026-07-27](qa/new-session-media-stability-2026-07-27.md)

## Current product and architecture specifications

- [Canvas plugin platform](features/canvas-plugin-platform-prd.md) — the product
  north star: central conversation plus right collapsible Content Canvas, typed
  surface/domain/Agent/Team/Workflow contribution boundaries, Agent Studio, hot
  configuration versus revision-frozen execution, and the P0-A/P0-B/P1-A staged
  plan
- [Infinite Canvas and media tools contracts](features/infinite-canvas-and-media-tools-prd.md)
  — the K0 contracts: style-preset asset catalog (MIT kunpeng data), phase-2
  image-tool and media-provider placeholders, and the infinite canvas
  document/persistence rules; staged by the
  [phase-1 plan](plans/2026-08-22-infinite-canvas-plugin-phase1.md), the
  [phase-2 K2 plan](plans/2026-08-23-infinite-canvas-k2-image-tools.md), and the
  [phase-3 P3 plan](plans/2026-08-24-infinite-canvas-p3-agent-canvas.md)
- [Infinite Canvas visual language](design/infinite-canvas-visual-language.md) —
  the presentation contract for the canvas panel: cards are the media, the
  generator is anchored to the selected card, one floating stage for every
  enlarged picture, compact anchored popovers, and a card that holds many
  pictures. Code references its section numbers directly; read it before
  touching this panel's presentation. Later phases are staged by the
  [phase-4 P4 plan](plans/2026-08-25-infinite-canvas-p4-workbench.md), the
  [phase-5 P5 plan](plans/2026-08-26-infinite-canvas-p5-creation.md), and the
  [short-drama bridge plan](plans/2026-08-28-canvas-short-drama-bridge.md)
- [Infinite Canvas capability gap](features/infinite-canvas-capability-gap.md) —
  what the shipped canvas can and cannot do measured against the kunpeng
  reference product, the P1/P2/P3 and explicitly-rejected backlog, the proposed
  phase-4 slice, and the known trade-offs (an instruction-driven five-piece set
  rather than dedicated models, and no asset protocol so previews are data URLs)
- [Customization Center and active persona](features/customization-center-prd.md)
  — Agent/Team/Skill catalogs, per-conversation persona binding, and the
  Desktop/Tauri reusable-Team runtime status
- [Team Workspace](features/team-workspace-prd.md) — reusable Team definitions,
  the prompt-orchestrated runtime, bounded member-to-worker delegation, and the
  Team desktop-window presentation
- [Interaction and theme governance](features/interaction-theme-governance.md) —
  presentation-only rules for interaction states, theme ownership, responsive
  layout, accessibility, full-window evidence, and performance
- [Architecture](ARCHITECTURE.md) — long-lived contracts retained from the
  upstream migration program
- [Minimal workspace migration](architecture/frontend-minimal-workspace-migration.md)
- [Minimal workspace parity checklist](qa/frontend-minimal-workspace-parity.md)
- [Core decomposition](architecture/core-decomposition.md)
- [Web UI performance boundaries](architecture/web-ui-performance-boundaries.md)
- [Web authorization boundary](architecture/auth-web-authorization.md)
- [Deep Review architecture](architecture/deep-review.md)
- Canvas artifact ownership, visual artifact route boundaries, and the
  generated-runtime security gate are specified in the
  [Canvas plugin platform PRD](features/canvas-plugin-platform-prd.md); the three
  2026-07-04 pre-implementation gate documents were retired on 2026-08-25.
- [i18n architecture](architecture/i18n.md) and the
  [development i18n guide](development/i18n.md)

## Current design systems

- [Porcelain Air](design/porcelain-graphite-design-system.md) — the selected
  light, friendly direction; covers shell, navigation, chat, tool calls,
  composer, Canvas, Team Workspace, and Welcome
- [Catalog and Sidebar](design/catalog-and-sidebar-design-system.md) — the
  directory language (shared top bar, cards, rows, static identity marks, AGENT
  single page) and the Minimal sidebar
- [Quiet Directory](design/quiet-directory-design-system.md) — hairline-row
  language for the Automation chrome and list view only; its catalog sections
  were superseded on 2026-08-18

## Active plans

- [Infinite Canvas plugin — phase 1](plans/2026-08-22-infinite-canvas-plugin-phase1.md)
- [Infinite Canvas K2 — image creation loop](plans/2026-08-23-infinite-canvas-k2-image-tools.md)
  — approved (B1): image tools go live over the reused APIMart media pipeline
  with `infinite_canvas` binding backflow
- [Infinite Canvas P3 — AI-commanded canvas and video cards](plans/2026-08-24-infinite-canvas-p3-agent-canvas.md)
  — approved (B1): CanvasRead/CanvasOp tool surface with an ops journal and
  `appliedSeq` watermark, video-card schema, and the GenerateVideo
  `infinite_canvas` binding
- [Core decomposition plan](plans/core-decomposition-plan.md) — staged
  architecture work; ticked boxes are evidence, remaining slices need their own
  risk review
- [Desktop fullscreen plan](plans/desktop-window-fullscreen-plan.md) — core
  capability shipped; unchecked menu/settings and cross-platform manual checks
  are deferred follow-ups
- [Lightweighting program](plans/lightweighting-program.md) — the 2026-08-16
  documentation and dependency reduction record, referenced by `AGENTS.md`

## Frozen historical ledgers

The 2026-07 upstream migration consensus. New status goes in `CONTEXT.md`, never
in these files.

- [Ledger archive](ledger-archive.md) — the durable content of the former
  `ISSUES.md`, `TEST_PLAN.md` and `PROGRESS.md`: protected capabilities,
  permanently rejected decisions, and the acceptance criteria still asserted by
  live tests
- [Migration PRD](PRD.md)
- [Migration decisions](DECISIONS.md)

## Completed capability upgrade evidence

The BitFun-inspired capability work was merged by `6c3e651a3` on 2026-07-26.
These are dated implementation records, not active queues.

- [BitFun capability upgrade program](plans/2026-07-25-bitfun-capability-upgrade-program.md)
- [BitFun capability baseline](qa/bitfun-capability-baseline-2026-07-25.md)
- [BitFun Batch 1 Web UI results](qa/bitfun-web-ui-batch1-results-2026-07-25.md)
- [BitFun capability upgrade results](qa/bitfun-capability-upgrade-results-2026-07-26.md)
- [Agent runtime upgrade program](plans/2026-07-25-agent-runtime-upgrade-program.md)
- [Agent runtime migration decisions](decisions/2026-07-25-bitfun-runtime-migration-ledger.md)
- [Agent runtime Slice A result](results/2026-07-25-agent-runtime-upgrade-result.md)

## Dated evidence

- [Web UI performance phase 1 results](architecture/web-ui-performance-phase1-results.md)
- [Web UI performance phase 2 audit](architecture/web-ui-performance-phase2-audit.md)
- [Web UI performance phase 2 results](architecture/web-ui-performance-phase2-results.md)
- [Account and session usage design QA — 2026-07-24](qa/design-qa-account-session-usage-2026-07-24.md)
- [Windows computer-use smoke matrix](qa/windows-computer-use-smoke-matrix.md)

## Design and implementation records

Retained for their unique design content. None of them overrides `CONTEXT.md` or
a current specification above.

- [Session runtime usage report design](features/session-runtime-usage-report-design.md)
- [Workspace media gallery](features/workspace-media-gallery-prd.md)
- [APIMart media tools](features/apimart-media-tools-prd.md) — also carries the
  landed media result persistence, preview, and reference rules that were
  previously kept as two separate small-change records
- [Automation phase A behaviour](features/automation-phase-a-behavior.md)
- [Compact chat floating window](features/agent-companion-shaped-compact-chat-floating-window-prd.md)
  — the compact chat is a protected capability
- [Void brand replacement](features/void-brand-replacement-prd.md)
- [AI customer service design](features/_incoming/2026-07-22-ai-customer-service-design.md)
  and its
  [presentation plan](features/_incoming/2026-07-22-ai-customer-service-presentation-plan.md)
  — held in `_incoming/` until their contract merges into the Canvas plugin
  platform specification
- [Feishu bot setup](remote-connect/feishu-bot-setup.md)
  ([中文](remote-connect/feishu-bot-setup.zh-CN.md))

## Retention rule

Each domain keeps **one** append-only ledger. Do not create a new dated plan,
audit, or result file when an existing current document can be updated. An
evidence document is deleted once its unique contract has been merged into a
current specification; record the deletion below, not in the deleted file.

## Cleanup record

- **2026-08-22** — Deleted seven superseded documents:
  `plans/agent-surface-style-unification.md` (its S1–S4 was executed
  differently by `a43079079`, which shipped
  `component-library/styles/agent-surface.scss` and removed the animated orb
  avatars); `plans/2026-08-07-agent-debug-chat.md` (implemented; the contract
  lives in the Customization Center and Canvas plugin platform specifications);
  `features/ui-system-foundation-prd.md` (self-declared superseded on
  2026-08-08 by interaction and theme governance);
  `handoffs/porcelain-graphite-nav-chat-prompt.md` (a one-shot execution prompt
  for a slice that shipped on 2026-08-09); `qa/theme-normalization-audit-2026-07-25.md`
  (1,245 lines whose own "next actions" it disclaimed as stale);
  `qa/repository-audit-2026-07-19.md` and
  `qa/frontend-minimal-workspace-audit-2026-07-18.md` (both superseded by the
  2026-07-28 stability audit; their surviving conclusions are in `CONTEXT.md`'s
  open baseline debt). `CONTEXT.md` was rewritten for current truth, and the
  Catalog/Sidebar and Team Workspace documents were corrected where they still
  described animated orbs, a removed `CatalogPagination` re-export, deleted
  scene files, and permitted status animation.
- **2026-08-20** — `plans/agent-hub-consolidation-plan.md` and
  `plans/staff-hq-refactor-handoff.md` were deleted after their contract was
  merged into [Catalog and Sidebar](design/catalog-and-sidebar-design-system.md)
  and `CONTEXT.md`; the `assistant` scene was removed and assistant
  configuration now lives in the `profile` scene.
- **2026-08-18** — The catalog sections of the Quiet Directory design system
  were removed rather than left contradicting the implementation. Quiet
  Directory is retained for the Automation surface. The retired `skillSigil.ts`
  and `linkGlyph.ts` modules and their tests were deleted with their last
  consumer.
- **2026-08-17** — Repository-root design scaffolds `design-lab/` (26 files),
  `design-demo/` (10), `demos/` (1) and five unreferenced `png/` marketing
  screenshots (~6 MB) were deleted and the scaffold directories gitignored.
  `png/void-Logo.png` and `png/void_title.png` are retained as the source and
  output of `scripts/generate-void-logo-assets.mjs`.
- **2026-08-16** — `docs/superpowers/` (43 files), `docs/issues/` (44) and
  `docs/obsidian/` (5) were deleted: 92 files / ~7,800 lines, 79 of them with
  zero inbound links. See [the lightweighting program](plans/lightweighting-program.md).
- **2026-07-28** — The disposable `docs/prototypes/aggressive-minimal-workspace/`
  prototype was deleted; its accepted layout, progressive-disclosure,
  media-focus and accessibility constraints live in the Minimal workspace
  migration and Team Workspace specifications. That review's
  retain-everything conclusion is superseded by the retention rule above; it was
  the direct cause of the orphan accumulation.
