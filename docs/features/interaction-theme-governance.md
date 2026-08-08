# Interaction And Theme Governance Specification

Status: current specification for the next presentation-quality phase. This
document governs interaction consistency, theme ownership, responsive layout,
visual verification, and presentation performance. It does not authorize
changes to runtime, persistence, permissions, persona composition, Team
orchestration, media routing, or session lifecycle.

Updated: 2026-08-08

## Goal

Make Void feel like one coherent desktop product while preserving every
working capability. The next phase focuses on the left navigation, Welcome,
Agent and Team catalogs, Agent authoring and debug chat, Skills, Connectors,
the session composer, Canvas, and the right Team Workspace.

The target is not a one-time recolor. It is a governed system in which:

- the same state has the same visual and interaction meaning everywhere;
- layout adapts to the physical window without clipping or hidden controls;
- theme changes are token-driven and cannot silently introduce raw colors or
  undefined variables;
- switching scenes, typing, streaming, and background refresh do not remount or
  flash unrelated surfaces;
- visual work remains presentation-only unless a separately reviewed product
  change explicitly crosses a Module Interface.

## Product boundaries

The dependency direction remains:

```text
UI / route -> Module Interface -> Adapter / service -> external system
```

Allowed in this phase:

- component composition, spacing, typography, icons, color, focus, hover,
  selected, disabled, loading, empty, error, and responsive presentation;
- shared theme tokens and narrowly owned presentation selectors;
- render stabilization, scene retention, lazy loading, and measurement that do
  not change domain semantics;
- accessibility names, keyboard navigation, focus restoration, reduced motion,
  and full-window visual evidence.

Not allowed without a separate architecture review:

- moving runtime or persistence logic into pages, routes, `ChatInput.tsx`,
  `FlowChatStore.ts`, `ContentCanvas.tsx`, or `ShortDramaCenterPanel.tsx`;
- changing Agent/Team identity, prompt composition, cache identity,
  permissions, Skill authority, tool policy, Team workflow, or child-session
  lifecycle for visual convenience;
- replacing typed loading/error/support states with inference from empty arrays
  or strings;
- creating a second Agent, Team, Skill, Connector, Canvas, or member-chat path
  only to simplify styling.

## Canonical interaction states

Every governed surface must render explicit states:

```text
loading | ready | empty | error | unsupported | stale-refresh
```

Interactive controls must distinguish:

```text
rest | hover | focus-visible | active | selected | disabled | destructive
```

Rules:

- background refresh keeps the last usable content mounted and adds a bounded
  stale/retry indication; it must not replace a working surface with a loading
  skeleton;
- a true identity change, such as switching session or Team binding, must not
  expose the previous identity for even one render;
- destructive actions are separate controls and never hide inside a card-wide
  activation target;
- card, row, tab, menu, dialog, and composer behavior must be keyboard complete;
- focus returns to the invoking control when a temporary surface closes;
- reduced-motion mode removes non-essential transitions and all layout motion.

## Theme ownership

Theme values flow from shared semantic tokens into feature-owned presentation
styles. Feature CSS may compose tokens but must not invent a parallel palette.

Required token groups:

- background and elevated surface;
- primary, secondary, muted, success, warning, danger, and information text;
- neutral, active, focus, selected, warning, and danger borders;
- spacing, type scale, line height, radius, icon size, elevation, and motion;
- density variants for standard, compact, and touch/coarse-pointer contexts.

Governance rules:

- no undefined CSS custom property;
- no raw product color when a semantic token exists;
- no gradient, blur, decorative shadow, lift, scale, or looping motion unless a
  current specification explicitly owns it;
- a state may not rely on color alone;
- Chinese and English text must fit the same component contract without font
  scaling hacks or hidden overflow;
- Classic remains a rollback presentation. Minimal changes must be scoped and
  must not leak into Classic unless the shared token is intentionally global.

## Layout contract

The desktop shell is one physical-window composition:

```text
left navigation | active scene or parent conversation | optional Canvas |
optional Team Workspace
```

- Wide Team sessions use the established three-column contract: lead
  conversation on the left, working Canvas in the middle, Team Workspace on
  the right.
- Medium layouts use the bounded Team Workspace overlay. Narrow layouts use
  progressive disclosure instead of squeezing all columns below usable width.
- Closing Canvas or Team Workspace changes presentation only; it never removes
  the bound persona, cancels work, deletes child sessions, or clears artifacts.
- Agent/Team, Skills, and Connectors catalogs share the same command-row,
  icon-forward card, pagination, details, loading, empty, and error language,
  while preserving their different actions and data owners.
- The Agent authoring page keeps the form and live draft debug chat as one
  responsive composition. The chat composer is available only when its current
  draft persona and temporary session are ready.

## Current baseline

The following behavior is already implemented and is the regression baseline:

- Minimal is the clean-profile default and Classic is the rollback option;
- the left navigation uses the compact Minimal hierarchy and one active rail;
- Agent and Team, Skills, and Connectors are standalone localized catalogs;
- Agent authoring has a real temporary-persona debug chat with lifecycle
  cleanup and stale-session send protection;
- Team Workspace uses one canonical right-side member surface, stable
  background refresh, selectable not-started members, and an operations-map
  presentation with pan/zoom and semantic member-node sizing;
- AI Short Drama retains its dedicated Canvas while member conversations use
  the canonical Team Workspace;
- scene retention and preload keep hot switching within the current measured
  performance budget.

## Delivery sequence

1. Inventory shared tokens, undefined variables, raw colors, typography
   literals, duplicated control patterns, and layout ownership.
2. Freeze interaction state contracts and capture current full-window evidence
   before changing presentation.
3. Normalize the left navigation and desktop shell without changing route or
   session ownership.
4. Normalize Welcome and the three customization catalogs.
5. Normalize Agent authoring/debug chat, composer identity capsule, Canvas, and
   Team Workspace as one session experience.
6. Verify wide, medium, narrow, keyboard, reduced-motion, loading, empty,
   error, stale-refresh, long-text, and high-DPI states.
7. Measure scene switching, first useful paint, rerenders, layout shift, and
   bundle budgets; optimize only after a reproducible measurement identifies a
   bottleneck.

Each slice must be independently reviewable and retain the previous working
path until its focused tests and applicable repository gates pass.

## Acceptance gates

Code and contract gates, selected in proportion to the change:

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
```

Visual evidence is valid only when captured with Per-Monitor-V2 DPI awareness
and the DWM physical window boundary. Every accepted screenshot must contain
the left sidebar, complete top edge, rightmost content, bottom area, and window
controls. A crop, logical-size capture, fixed-resolution substitute, or output
whose dimensions do not match the physical window is invalid.

Release criteria:

- no undefined token, unapproved raw theme value, or unscoped Classic leak;
- no horizontal document overflow or inaccessible control at supported widths;
- no unrelated remount, flicker, duplicate command, or lost input while typing,
  streaming, refreshing, switching scenes, or opening Team Workspace;
- no regression to Flow Chat restore, BTW, Team runtime, Review, AI Short
  Drama, media, automation, desktop windows, or permission behavior;
- known repository baseline failures remain explicitly reported rather than
  being described as passing.
