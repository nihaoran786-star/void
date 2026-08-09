# Interaction And Theme Governance Specification

Status: current specification for the next presentation-quality phase. This
document governs interaction consistency, theme ownership, responsive layout,
visual verification, and presentation performance. It does not authorize
changes to runtime, persistence, permissions, persona composition, Team
orchestration, media routing, or session lifecycle.

Updated: 2026-08-09

Selected direction: **Porcelain Air / 瓷白轻盈工作台**. Its concrete
typography, borders, components, shell rules, and migration contract are
defined in
[Porcelain Air Design System](../design/porcelain-graphite-design-system.md).
The current authorized presentation coverage keeps the existing token
architecture while allowing owned light-theme semantic values to move toward
the selected warm, airy tone. It includes the shell, collapsed navigation,
chat information flow, tool calls, user messages, composer, Welcome/new
session, customization catalogs, Content Canvas chrome, and the canonical Team
Workspace. Runtime and domain expansion remain outside this specification.

`different-ai/openwork` `dev` at
`71bc6e7fec974233f03a951aa4fe5b186bec12b8` is the implementation reference for
quiet density, compact chrome, whitespace, and progressive disclosure. It is
not a source of Void runtime semantics, product data, branding, or a second
component system.

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
The existing token pipeline is a technical contract; its current concrete
light values are not a visual contract when they conflict with Porcelain Air.

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
- no serious-enterprise fallback made from cold gray panels, heavy separators,
  repeated semibold labels, or large high-contrast controls;
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

## 2026-08-09 implementation checkpoint

Completed presentation slices:

- one inset physical-window shell and a 48 px collapsed navigation rail with
  compact action targets and preserved expanded-navigation behavior;
- one bounded reading/composer measure, flat AI output, quiet user messages,
  retained compact tool status rows, and explicit approval/error/expanded tool
  cards;
- shared four-column desktop rhythm for Agent, Team, installed Skill, Skill
  market, configured Connector, and Connector market scenes, with the existing
  actions and service owners preserved;
- one strict Team-session composition: lead conversation on the left, artifact
  Canvas in the middle, and the only durable specialist conversation surface
  on the right;
- Welcome/new-session spacing and composer continuity without changing draft,
  workspace, persona, permission, or first-send ownership;
- maximized Canvas stacking corrected at the workspace-shell boundary, and
  numeric Lucide dimensions used where CSS-variable strings caused invalid SVG
  width/height warnings.

Authoritative local evidence is stored under
`%USERPROFILE%\.codex\visualizations\2026\08\09\void-openwork-goal\`.
Accepted captures use `PrintWindow(PW_RENDERFULLCONTENT)`, Per-Monitor-V2 DPI
awareness, DPI 144, and the 1690×900 DWM extended-frame boundary with no
occlusion. The final market captures cover Agents, Teams, installed Skills,
Skill market, configured Connectors, and Connector market. The right-rail
captures cover Team overview, a selectable not-started member, and collapsed
Canvas. `content-canvas-maximized-z11-runtime-proof.png` records the corrected
maximized state, and `welcome-new-task-audit.png` covers the complete
new-session window.

The final fresh Desktop preview capture `openwork-final-full-window.png` uses the same
capture contract at DPI 144. Its 1804×1204 image exactly matches the physical
DWM extended-frame boundary and contains the complete left navigation, top
chrome, right edge, bottom region, and window controls; the adjacent JSON
sidecar records the bounds and capture method. The visible recovery notice
records the earlier intentionally stopped preview process during dependency
repair; the current preview itself launched successfully. This dark-theme image
is authoritative for geometry, density, and complete-window coverage, not for
the separate light-theme Porcelain Air visual-acceptance check.

Verification is intentionally split:

- passed: Web type checking, theme color and visual contracts, focused static
  presentation/source checks, repository hygiene, core boundaries, and diff
  checks;
- passed: focused presentation contracts, including the compact-tool six-file
  set (35 tests);
- passed after frozen-lockfile dependency repair: the complete controlled
  single-worker Web suite, 527/527 files and 3042/3042 tests with zero unhandled
  errors;
- passed: the production Web build, Monaco asset checks, and performance budget
  (JS raw 2,343,031 bytes; CSS raw 603,004 bytes; 54 dynamic entries, none
  unresolved);
- still separate release evidence: provider-backed Agent debug chat, packaging,
  cross-platform visuals, and a broad manual pass over every protected flow.

This checkpoint is not evidence that repository-wide lint, E2E, Rust format,
Clippy, packaging, cross-platform visuals, or provider-backed Agent debug chat
have passed.

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
