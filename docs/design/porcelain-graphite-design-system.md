# Porcelain Air Design System

Status: selected visual direction and current execution specification for the
next Void presentation-quality phase. This document refines, but does not
replace, the architecture and safety boundaries in
[Interaction And Theme Governance](../features/interaction-theme-governance.md).

Selected: 2026-08-08

Direction corrected: 2026-08-08. The legacy filename is retained so existing
handoffs and inbound links do not break.

Implementation checkpoint: 2026-08-09. The selected tone is now applied beyond
the original navigation/chat slice to the current shell, Welcome/new session,
customization markets, Canvas chrome, and Team Workspace. The wider coverage
does not authorize runtime or domain changes.

Visual target:
`%USERPROFILE%\.codex\generated_images\019fa901-0899-7370-865d-e999eb59bcd7\exec-4b53f3a0-dd4d-4165-a1a0-ff4c4f11f053.png`

## 1. Direction

**Porcelain Air / 瓷白轻盈工作台** is a soft productivity-minimalism system.
It applies the visual target's warmth, openness, quiet confidence, and friendly
editorial rhythm to Void without weakening its professional capability. It
must feel like an approachable creative workspace, not an enterprise admin
console, financial control panel, or monochrome developer tool.

The existing theme architecture remains authoritative. Existing concrete
colors do not. The current implementation may tune the semantic colors used by
the authorized surfaces when that is required to reach the selected visual
tone. Changes still flow through the existing token owners and must not become
page-local overrides or an unrelated application-wide reskin.

The memorable qualities are:

- warm porcelain surfaces instead of pure white or cold blue-gray panels;
- soft graphite text instead of pure black or washed-out gray;
- small functional pastel accents for orientation, with calm blue reserved for
  focus, selection, and the primary action;
- hairline separators, gentle radii, compact type, exact alignment, and visible
  breathing room;
- a continuous working transcript instead of a stack of chat bubbles;
- one quiet, open shell shared by sibling Canvas pages and an optional Team
  panel.

This is not permission to copy generated text, invented nodes, or mock data
from the visual target. The image is authoritative for emotional tone, color
relationships, density, hierarchy, whitespace, edge softness, and interaction
quietness.

### Mood guardrails

The direction passes only when a full-window screenshot feels light, calm,
friendly, capable, and easy to enter. It fails when it resembles:

- a serious enterprise administration system;
- a dense IDE, operations console, or financial dashboard;
- a gray card wall with heavy borders and repeated section chrome;
- a toy-like pastel app whose decoration competes with the work.

Minimal does not mean cold or empty. Professional does not mean severe. Use
warmth, whitespace, typography, tiny functional color cues, and progressive
disclosure to make capability feel approachable.

Current authorized presentation coverage:

1. the collapsed and expanded left navigation;
2. AI output, user messages, and tool-call presentation;
3. the composer and its contextual controls;
4. Welcome and the unpersisted new-session draft;
5. Agent, Team, Skill, and Connector catalog presentation;
6. Content Canvas chrome and the canonical Team Workspace;
7. focused token reuse and governance needed by those surfaces.

Browser internals, Infinite Canvas, Settings, Automation, media authoring, and
remaining feature-specific surfaces still require their own reviewed slices.
The authorized surfaces may update the shared semantic tokens they genuinely
own; they may not recolor unrelated surfaces by accident.

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

The values below define the active light-direction targets for the authorized
navigation/chat slice. They must be introduced through the existing primitive
and semantic token pipeline. An implementation may map to an existing token
when it already produces the intended result, but it must not preserve a cold,
severe value merely because that value predates this specification. Dark and
Classic compatibility remain protected rollback paths.

### 3.1 Primitive palette

| Token | Value | Use |
| --- | --- | --- |
| `porcelain-0` | `#FFFDFC` | raised controls and menus |
| `porcelain-25` | `#FBFAF8` | main Canvas and conversation |
| `porcelain-50` | `#F6F4F1` | panels and grouped regions |
| `porcelain-100` | `#EFEEEB` | selected-neutral and hover |
| `porcelain-200` | `#E2E0DC` | base border |
| `porcelain-300` | `#D1CEC8` | strong border |
| `graphite-500` | `#70746E` | metadata and secondary text; AA-safe on porcelain surfaces |
| `graphite-700` | `#4D514C` | secondary body text |
| `graphite-900` | `#20231F` | primary text and icons |
| `cobalt-50` | `#EEF5FF` | selected background |
| `cobalt-100` | `#DCEAFF` | active hover background |
| `cobalt-300` | `#8DB7FF` | decorative selection handles |
| `cobalt-500` | `#4C86F7` | focus, selection, primary action |
| `cobalt-600` | `#2F6FE4` | primary hover/active |
| `cobalt-700` | `#2559B8` | high-contrast accent text |
| `sage-500` | `#479A73` | success, online, mint icon cue |
| `amber-500` | `#C38A32` | warning, waiting, amber icon cue |
| `lilac-500` | `#826AC2` | collaboration or creative icon cue |
| `red-500` | `#B95757` | error and destructive |

### 3.2 Semantic surfaces

| Semantic token | Target value |
| --- | --- |
| `--workspace-surface-canvas` | `porcelain-25` |
| `--workspace-surface-panel` | `porcelain-50` |
| `--workspace-surface-raised` | `porcelain-0` |
| `--workspace-surface-hover` | `porcelain-100` |
| `--workspace-surface-active` | `cobalt-50` |
| `--workspace-surface-scrim` | `rgba(32, 35, 31, 0.24)` |
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

Each status has text, background, and border tokens. Functional pastels are
small orientation cues, not large decorative surfaces:

| Status | Text | Background | Border |
| --- | --- | --- | --- |
| success | `#287A57` | `#EDF8F2` | `#C3E6D2` |
| info | `#2559B8` | `#EEF5FF` | `#C9DCFF` |
| warning | `#85591F` | `#FFF7EA` | `#EBD3AA` |
| error | `#923F3F` | `#FFF2F1` | `#E9C2C0` |

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
- favor regular and medium weights; repeated semibold labels make the product
  feel like a management console;
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
only major composition boundaries use 24–32px. Compact controls must be
surrounded by enough negative space that the workspace feels airy rather than
compressed.

## 6. Border, radius, shadow, and motion

### Borders

| Role | Definition |
| --- | --- |
| subtle divider | `1px solid #ECEAE6` |
| base control | `1px solid #E2E0DC` |
| strong/hover | `1px solid #D1CEC8` |
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
| floating toolbar/menu | `0 2px 10px rgba(32, 35, 31, 0.07)` |
| modal/drawer | `0 12px 30px rgba(32, 35, 31, 0.11)` |

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
- use a filled or tinted background for the active destination;
- small blue, mint, amber, and lilac icon tiles may distinguish meaningful
  object types or workflow roles. They must stay pale, compact, and consistent,
  never become decorative badges on every row.

## 8. Component language

### 8.1 Buttons

- heights: 28px compact, 32px standard, 36px emphasized;
- one calm blue primary action per region;
- secondary button: raised surface + base border;
- tertiary button: text/icon only;
- destructive button remains neutral until confirmation context, then uses the
  semantic error treatment;
- no gradient, lift, glow, severe black button treatment, or universal rounded
  capsule.

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
- AI and user content should feel editorial and conversational, not like a
  ticketing system or operator log;
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
- the optional right panel is 280–320px in the compact desktop layout and
  340–400px on wide CSS viewports;
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

### Implemented presentation slices

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

The shell/navigation, conversation/tool/composer, customization-market,
right-Team-workspace, and Welcome/new-session slices reached the 2026-08-09
visual checkpoint. The local dependency tree was repaired without manifest or
lockfile drift. Focused presentation contracts and the complete controlled Web
suite now pass (527/527 files, 3042/3042 tests, zero unhandled errors), together
with the production Web build and performance budget. Provider-backed manual
Agent chat, packaging, and cross-platform visual evidence remain separate
release checks rather than presentation-contract blockers.

### Remaining full-system roadmap

1. Inventory current primitive, semantic, component, and page-local values.
2. Add failing governance tests for the selected Porcelain Air contract.
3. Map light primitive and `--workspace-*` semantic tokens through existing
   owners; do not delete dark/Classic compatibility yet.
4. Continue the completed desktop shell, navigation, Flow Chat, composer,
   customization-market, Canvas-chrome, Team-Workspace, and Welcome language
   into only the remaining reviewed consumers.
5. Migrate Browser internals and Infinite Canvas without changing their
   ownership or making Browser a node inside another Canvas.
6. Migrate Settings, Automation, media authoring, Short Drama details, and
   remaining feature surfaces in small reviewable slices.
7. Remove only proven dead presentation aliases after every consumer has moved
   and repository/theme/i18n/full-Web gates pass.

Existing semantic-token architecture and Classic remain rollback paths;
existing light-theme values are not a visual acceptance target. Every
additional slice must introduce the specified porcelain targets through
existing owners while unrelated surfaces wait for their own review.

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
[Porcelain Air Navigation And Chat Execution Prompt](../handoffs/porcelain-graphite-nav-chat-prompt.md).
It applies the selected light, friendly tone while limiting implementation to
collapsed navigation, AI/user message flow, tool-call presentation, and the
composer.
