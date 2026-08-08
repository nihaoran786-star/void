# Porcelain Graphite Design System

Status: selected visual direction and current execution specification for the
next Void presentation-quality phase. This document refines, but does not
replace, the architecture and safety boundaries in
[Interaction And Theme Governance](../features/interaction-theme-governance.md).

Selected: 2026-08-08

Visual target:
`C:\Users\17949\.codex\generated_images\019fa901-0899-7370-865d-e999eb59bcd7\exec-4b53f3a0-dd4d-4165-a1a0-ff4c4f11f053.png`

## 1. Direction

**Porcelain Graphite / 瓷灰编辑台** is a compact, professional density and
interaction system. The current implementation keeps Void's existing theme
tone and applies this direction first to hierarchy, typography, borders,
spacing, navigation, conversation, tool activity, and the composer. It should
feel precise and calm rather than empty, decorative, or card-heavy.

The memorable qualities are:

- cool porcelain surfaces instead of pure white;
- graphite text instead of pure black;
- one restrained cobalt accent for focus, selection, and the primary action;
- thin separators, small radii, compact type, and exact alignment;
- a continuous working transcript instead of a stack of chat bubbles;
- one quiet shell shared by sibling Canvas pages and an optional Team panel.

This is not permission to copy generated text, invented nodes, or mock data
from the visual target. The image defines visual hierarchy and density only.

Current authorized implementation slice:

1. the collapsed and expanded left navigation;
2. AI output, user messages, and tool-call presentation;
3. the composer and its contextual controls;
4. focused token reuse and governance needed by those surfaces.

Global palette replacement, Canvas/Browser redesign, Team Workspace redesign,
catalog restyling, Settings restyling, and broad component migration are future
work and are not authorized by this slice.

## 2. Existing ownership

Extend the existing system instead of introducing a second theme layer:

- primitive and CSS-variable ownership:
  `src/web-ui/src/component-library/styles/tokens.scss`;
- Minimal composition entry:
  `src/web-ui/src/app/presentation/minimalWorkspacePresentation.scss`;
- theme infrastructure:
  `src/web-ui/src/infrastructure/theme/`;
- reusable components:
  `src/web-ui/src/component-library/components/`;
- typography and theme governance:
  `src/web-ui/src/app/presentation/*Governance.test.ts` and theme contract
  tests.

The selected direction should be expressed through existing primitive tokens,
`--workspace-*` semantic aliases, and feature-owned Minimal styles. Do not add
one giant global override, a page-local palette, or a second component library.

## 3. Color tokens

The values below describe an optional future light preset and help explain the
selected image. They are **not** a requirement for the current navigation/chat
slice. Current theme colors remain authoritative. The current slice reuses the
existing semantic tokens and may only fix undefined variables, raw duplicates,
or incorrect semantic mappings inside touched surfaces.

### 3.1 Primitive palette

| Token | Value | Use |
| --- | --- | --- |
| `porcelain-0` | `#FCFDFE` | raised controls and menus |
| `porcelain-25` | `#F8FAFC` | main Canvas and conversation |
| `porcelain-50` | `#F3F6F8` | panels and grouped regions |
| `porcelain-100` | `#E9EEF2` | selected-neutral and hover |
| `porcelain-200` | `#D9E0E6` | base border |
| `porcelain-300` | `#C4CED6` | strong border |
| `graphite-500` | `#66727D` | metadata and secondary text |
| `graphite-700` | `#3E4851` | secondary body text |
| `graphite-900` | `#1B2127` | primary text and icons |
| `cobalt-50` | `#EEF5FF` | selected background |
| `cobalt-100` | `#DCEAFF` | active hover background |
| `cobalt-300` | `#8DB7FF` | decorative selection handles |
| `cobalt-500` | `#4C86F7` | focus, selection, primary action |
| `cobalt-600` | `#2F6FE4` | primary hover/active |
| `cobalt-700` | `#2559B8` | high-contrast accent text |
| `sage-500` | `#3C9B72` | success and online |
| `amber-500` | `#B77A27` | warning and waiting |
| `red-500` | `#BF5757` | error and destructive |

### 3.2 Semantic surfaces

| Semantic token | Target value |
| --- | --- |
| `--workspace-surface-canvas` | `porcelain-25` |
| `--workspace-surface-panel` | `porcelain-50` |
| `--workspace-surface-raised` | `porcelain-0` |
| `--workspace-surface-hover` | `porcelain-100` |
| `--workspace-surface-active` | `cobalt-50` |
| `--workspace-surface-scrim` | `rgba(27, 33, 39, 0.28)` |
| `--workspace-text-primary` | `graphite-900` |
| `--workspace-text-secondary` | `graphite-700` |
| `--workspace-text-muted` | `graphite-500` |
| `--workspace-text-disabled` | `#939DA6` |
| `--workspace-accent` | `cobalt-500` |
| `--workspace-accent-strong` | `cobalt-600` |
| `--workspace-focus-ring` | `cobalt-500` |

Disabled text is never used for meaningful explanatory copy. Status meaning
must include an icon, label, or shape and may not rely on color alone.

### 3.3 Status tokens

Each status has text, background, and border tokens:

| Status | Text | Background | Border |
| --- | --- | --- | --- |
| success | `#287A57` | `#EAF7F0` | `#B9E3CE` |
| info | `#2559B8` | `#EEF5FF` | `#C9DCFF` |
| warning | `#8B5A1D` | `#FFF6E8` | `#E8CCA2` |
| error | `#993F3F` | `#FFF0F0` | `#E8BBBB` |

## 4. Typography

Retain the existing Chinese-capable family stack. Do not add a network font or
change editor/terminal monospace ownership in the first migration.

```text
UI sans: Noto Sans SC, PingFang SC, Microsoft YaHei, Segoe UI, sans-serif
Code: existing editor/terminal monospace stack
```

| Role | Size | Line height | Weight |
| --- | ---: | ---: | ---: |
| micro, nonessential | 11px | 16px | 400 |
| metadata | 12px | 18px | 400/500 |
| control and compact body | 13px | 20px | 400/500 |
| reading body | 14px | 22px | 400 |
| section title | 15px | 22px | 500/600 |
| scene title | 16px | 24px | 600 |
| rare lead title | 18px | 26px | 600 |

Rules:

- most desktop UI uses 12–13px; long AI output remains 14px;
- never shrink meaningful text below 12px;
- never use a large title when the active tab or breadcrumb already names the
  page;
- a description is normally one line and never more than two lines in a
  catalog card;
- headings use spacing and weight before larger size;
- Chinese, English, long filenames, and 200% zoom must remain usable.

## 5. Spacing and density

Use the existing four-pixel rhythm:

| Token | Value | Typical use |
| --- | ---: | --- |
| space-1 | 4px | icon/text micro gap |
| space-2 | 8px | compact controls and rows |
| space-3 | 12px | normal groups |
| space-4 | 16px | panel inset |
| space-5 | 20px | section separation |
| space-6 | 24px | major region separation |
| space-8 | 32px | sparse empty-state separation |

Avoid padding every element with 16px. Rows use 8–12px; panels use 12–16px;
only major composition boundaries use 24–32px.

## 6. Border, radius, shadow, and motion

### Borders

| Role | Definition |
| --- | --- |
| subtle divider | `1px solid #E9EEF2` |
| base control | `1px solid #D9E0E6` |
| strong/hover | `1px solid #C4CED6` |
| selected | `1px solid #4C86F7` |
| focus | `2px solid #4C86F7`, 2px offset where possible |

- use spacing first, divider second, tinted surface third, border fourth;
- do not border every row;
- dashed borders are reserved for true drop zones or create placeholders;
- selected and focus are separate states and must be able to coexist.

### Radius

| Role | Value |
| --- | ---: |
| small control | 6px |
| panel/node/composer | 8px |
| dialog | 10px maximum |
| avatar/status dot | full |

Pills are reserved for tags, compact status, and immutable persona identity.
Normal buttons, filters, search, inputs, tabs, and cards are not pills.

### Shadow

| Role | Value |
| --- | --- |
| normal content | `none` |
| floating toolbar/menu | `0 2px 8px rgba(27, 33, 39, 0.08)` |
| modal/drawer | `0 10px 28px rgba(27, 33, 39, 0.12)` |

No glow, glass, backdrop blur, inset highlight, or decorative elevation.

### Motion

- instant feedback: 100ms;
- hover/focus/state: 150ms;
- overlay enter/leave: 180ms;
- use opacity and transform only;
- no bounce, scale-on-hover, width/height animation, or staggered card entrance;
- `prefers-reduced-motion` removes all nonessential motion.

## 7. Icon system

- retain the current icon library; do not mix emoji, hand-drawn SVGs, and
  multiple stroke families;
- standard icon: 16px; prominent canvas tool: 18px; empty-state icon: 24px
  maximum;
- default stroke should read as approximately 1.5px;
- desktop icon target: 30–32px; coarse pointer target: at least 40px;
- collapsed navigation always provides tooltip and accessible name;
- use a filled or tinted background only for the active destination.

## 8. Component language

### 8.1 Buttons

- heights: 28px compact, 32px standard, 36px emphasized;
- one solid cobalt primary action per region;
- secondary button: raised surface + base border;
- tertiary button: text/icon only;
- destructive button remains neutral until confirmation context, then uses the
  semantic error treatment;
- no gradient, lift, glow, or universal rounded capsule.

### 8.2 Inputs and search

- standard height 32px; compact 28px;
- porcelain-raised background, base border, 6px radius;
- focus uses the shared focus token, not a second local blue;
- placeholder uses muted text and never substitutes for a visible label when a
  label is necessary;
- validation is inline, specific, and preserves input.

### 8.3 Menus, popovers, drawers, and dialogs

- menus and popovers use raised surface, one border, one light shadow;
- drawers use a divider when docked and a modal shadow only when overlaying;
- dialogs are reserved for decisions that block continuation;
- no nested dialog or card-in-dialog decoration;
- Escape closes temporary UI and focus returns to the invoker.

### 8.4 Cards and rows

Cards are reserved for independently actionable objects: Agent, Team, Skill,
Connector, media asset, file artifact, workflow node, approval, and error.
Navigation, settings, tool logs, ordinary chat, member status, and explanatory
copy use flat rows or text groups.

Card rules:

- flat raised or panel surface;
- 1px border only when needed;
- no normal-state shadow;
- no hover lift or scale;
- hover changes surface/border only;
- one primary activation target plus separate destructive action;
- description is limited to two lines.

## 9. Shell and navigation

### Collapsed rail

- width 48px;
- logo/brand at top, avatar/settings at bottom;
- 16px icons in 32px targets;
- active destination uses `cobalt-50`, a cobalt icon, and an optional 2px
  leading rail;
- tooltips appear after a short delay and expose keyboard shortcuts;
- current location is never communicated by color alone.

### Expanded navigation

- width 216px; user resizing may retain the existing bounded range;
- one primary create action;
- no more than five top-level groups;
- Agent, Skill, and Connector remain grouped under Customization;
- workspaces and conversations use flat rows with progressive disclosure;
- collapsed/expanded state persists and does not change session state.

### Top chrome

- 36–40px high;
- one breadcrumb/title, current state, and at most two visible actions;
- duplicate page titles and explanatory subtitles are removed;
- sibling Canvas pages use the same tab/chrome contract.

## 10. Conversation and composer

The main conversation becomes a continuous working transcript.

- AI output renders directly on the base surface without a bubble;
- user messages use one quiet `porcelain-100` quote block or compact surface;
- author/time metadata is shown only where it helps orientation;
- tool activity is a compact, keyboard-expandable status row;
- cards remain only for files, media, snapshots, approvals, significant tasks,
  recoverable errors, and other independently actionable artifacts;
- thinking and streaming do not animate layout or mount a second placeholder;
- readable text column stays near 62–72 Chinese characters at its widest;
- composer uses an 8px radius, low-profile border, and one primary send action;
- persona, Team, workspace, model, permission, and execution policy are quiet
  contextual controls, with uncommon actions behind `+` or overflow;
- a bound room identity cannot appear removable.

Do not change `ChatInput`, Flow Chat restore, persona binding, cache identity,
permissions, tool execution, or turn transport merely to restyle the composer.

## 11. Canvas and browser

Canvas pages are siblings. Infinite Canvas, Browser, code editor, document,
media, and AI Short Drama remain independent pages under one Canvas shell.

- one Canvas visible by default;
- optional split is limited to two surfaces;
- one 36–40px Canvas chrome owns tabs, breadcrumb, save/run status, and current
  contextual actions;
- Browser is a sibling Canvas page, not a node inside Infinite Canvas;
- Infinite Canvas may contain links/previews, but editing opens the appropriate
  sibling Canvas;
- Browser shows compact navigation/address controls by default and reveals
  advanced controls only when needed;
- closing a Canvas changes presentation only and never deletes artifacts,
  cancels work, detaches a Team, or clears session state.

### Infinite Canvas visual rules

- dotted or grid background is extremely subtle;
- workflow node width is approximately 160–184px;
- nodes use raised surface, 8px radius, and base border;
- selected node uses cobalt border and handles without shadow;
- connections use graphite/porcelain neutrals; active path alone uses cobalt;
- node toolbar appears on selection, not permanently;
- pan/zoom controls are one compact toolbar;
- minimap is optional and hidden when the graph fits.

## 12. Team Workspace

- Team lead remains the left parent conversation;
- the optional right panel is 264–300px when docked;
- closed Team presentation does not detach the Team or stop members;
- member list uses compact rows, avatar, role, and explicit status;
- no member card gallery and no duplicate lead entry;
- selecting a member opens the canonical member conversation, including the
  not-started state before its first dispatch;
- background refresh keeps usable content mounted and must not flash while the
  lead types or streams;
- narrow layouts use the existing bounded overlay contract.

## 13. Catalog, settings, and empty states

- Agent/Team, Skill, and Connector keep one shared command-row and catalog
  rhythm but retain their own actions and services;
- desktop catalogs may use compact cards because entries are independent
  objects; repeated metadata and explanatory banners are removed;
- settings use flat labeled rows and sections, not nested cards;
- empty states contain one short explanation and one primary action;
- loading, empty, error, unsupported, and stale-refresh are explicit and never
  inferred from an empty array.

## 14. Responsive and accessibility contract

- use container queries for feature surfaces and the existing physical-window
  composition for shell decisions;
- wide Team sessions may show conversation + Canvas + Team Workspace;
- medium layouts use the established bounded Team overlay;
- narrow layouts progressively disclose panels instead of shrinking text and
  targets below the approved scale;
- every action is keyboard reachable with visible `:focus-visible` treatment;
- zoom to 200%, Chinese/English long text, reduced motion, and coarse pointer
  are acceptance states;
- screenshot evidence must follow Per-Monitor-V2 DPI awareness and DWM physical
  bounds, including left sidebar, full top, rightmost content, bottom, and
  window controls.

## 15. Migration order

### Current authorized slice

1. Inventory the navigation, AI transcript, user message, tool activity, and
   composer consumers plus their current semantic tokens.
2. Add or update focused governance and behavior tests before changing
   presentation.
3. Implement the 48px collapsed rail and preserve the existing expanded mode,
   navigation behavior, accessibility, persistence, and scene ownership.
4. Flatten AI output, user messages, and tool activity into the selected compact
   information-flow language without changing transcript or tool-card data.
5. Compact the composer presentation without changing send, persona, Team,
   workspace, model, permission, execution-policy, or attachment behavior.
6. Verify full-window, responsive, keyboard, reduced-motion, i18n, performance,
   and protected-capability behavior; then make clean local commits.

### Deferred full-system roadmap

1. Inventory current primitive, semantic, component, and page-local values.
2. Add failing governance tests for the selected Porcelain Graphite contract.
3. Map light primitive and `--workspace-*` semantic tokens through existing
   owners; do not delete dark/Classic compatibility yet.
4. Migrate the desktop shell, collapsed/expanded navigation, typography, basic
   controls, overlays, and focus states.
5. Migrate Flow Chat transcript, user message, tool rows, artifact cards, and
   composer presentation without changing orchestration.
6. Migrate shared Canvas chrome, Browser presentation, Infinite Canvas, and
   Team Workspace.
7. Migrate Welcome, Agent/Team, Skill, Connector, Settings, Automation, media,
   Short Drama, and remaining feature surfaces in small reviewable slices.
8. Remove only proven dead presentation aliases after every consumer has moved
   and repository/theme/i18n/full-Web gates pass.

The first implementation target is the existing Minimal tone on the three
authorized surfaces. Existing theme values and Classic remain rollback paths.
The optional porcelain palette must not be introduced until the user separately
approves a palette migration.

## 16. Verification

Each slice runs focused tests first and then widens in proportion to risk:

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

Do not report repository-wide lint, E2E, Rust format, Clippy, packaging, or
cross-platform visual gates as passing unless they actually complete. Known
baseline gaps remain governed by the current repository audit.

## 17. Fresh-agent execution prompt

The only current self-contained execution prompt is
[Porcelain Graphite Navigation And Chat Execution Prompt](../handoffs/porcelain-graphite-nav-chat-prompt.md).
It preserves the existing theme tone and limits implementation to collapsed
navigation, AI/user message flow, tool-call presentation, and the composer.
