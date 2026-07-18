# Frontend Minimal Workspace Migration

## Status

Default-switch slice complete on 2026-07-18. Minimal is now the clean-profile
default, while classic remains an explicit rollback presentation. The
migration stays active only for the separately recorded P2 debt; no remaining
P0/P1 release blocker is known.

Post-default stabilization on 2026-07-18 added the compact short-drama team
projection (`0a4080d47`) and preserved an explicit reopen control after collapse
(`ef33d736f`). The current presentation reserves no permanent rail width and
opens the existing secondary `EditorGroup` in a bounded 420px overlay.

Baseline checkpoint:

- Branch before the UI migration: `codex/performance-phase2`
- Verified checkpoint commit: `0db5e70a4`
- UI migration branch: `codex/minimal-workspace-ui`

## Goal

Turn the Void desktop Web UI into a compact, media-first workspace inspired by
the information density and typography discipline of Codex and ChatGPT without
changing short-drama generation, media calls, subagent behavior, session
history, desktop runtime behavior, or tool availability.

The remembered quality should be:

- compact typography with calm hierarchy;
- one dominant media or conversation surface;
- quiet navigation and secondary metadata;
- progressive disclosure instead of nested cards;
- reliable state feedback without glow, glass, or decorative motion.

## Non-Negotiable Invariants

1. No feature may disappear. A secondary action may move into a menu or drawer
   only when it remains keyboard reachable and covered by the parity checklist.
2. Runtime, API, Store, and persistence semantics do not change for a visual
   slice.
3. Only one controller/runtime subscription tree may be mounted. Classic and
   minimal views must never run duplicate effects, subscriptions, generation
   requests, or session initialization.
4. Existing ThemeService and component-library tokens remain the source of
   truth. The migration does not add another design system or another palette.
5. New presentation components must not import Tauri, filesystem/process APIs,
   `FlowChatManager`, `FlowChatStore`, or service API singletons.
6. Classic presentation is retained as a rollback path until all slices pass
   automated, desktop, performance, accessibility, and manual parity gates.
7. Old styles are deleted only after the corresponding minimal slice is the
   verified default.

## Current Risk Map

The current UI can be styled, but visual and runtime responsibilities are
interleaved in several large components:

- `AppLayout.tsx` owns shell rendering while also coordinating Tauri, workspace
  APIs, session startup, message dispatch, close behavior, and runtime events.
- `ChatInput.tsx` owns the composer markup together with attachments, paste,
  history, slash commands, mentions, MCP prompts, models, modes, skills,
  permissions, token usage, submit, compact, cancel, and multiple stores.
- `ShortDramaCenterPanel.tsx` combines short-drama orchestration, stage-agent
  bootstrap, project recovery, artifact selection, episode navigation, media
  derivation, preview resolution, and presentation.
- `WorkspaceMediaGallery.tsx` already has explicit loading/error states and view
  models, but selection, scan, preview resolution, trash, restore, purge, and
  rendering still share one component.
- `SubagentProjectionView.tsx` directly subscribes to `FlowChatStore`.

Therefore a big-bang component rewrite is explicitly rejected.

## Architecture

The migration uses a strangler presentation boundary:

```text
Existing runtime / API / Store
  -> existing or extracted feature controller
  -> explicit ViewState + Actions
  -> classic presentation OR minimal presentation
```

The controller is mounted once above the presentation choice. The presentation
choice selects markup and styles only.

### Dependency direction

```text
Minimal View
  -> feature presentation types
  -> existing component-library primitives
  -> scoped minimal semantic tokens
  -> existing ThemeService-owned variables
```

The reverse direction is forbidden. Runtime and Store code must not know that a
minimal presentation exists.

### Presentation variant

The frontend-only presentation selector has these properties:

- values: `classic | minimal`;
- clean-profile default: `minimal`;
- storage: frontend presentation preference only;
- no backend, workspace, session, or project persistence changes;
- no duplicate mounting of classic and minimal controllers;
- rollback priority: `?void-ui=classic`, then configured presentation, then
  stored presentation; an explicit classic value never falls through to the
  minimal default;
- test override available without changing runtime configuration.

The final implementation should scope new visual rules under
`.void-ui--minimal` (or an equivalent root data attribute). Existing global
tokens must not be remapped during migration.

Minimal presentation chrome is bundled in
`app/presentation/minimalWorkspacePresentation.scss` and loaded by
`workspacePresentationStyles.ts` before the first React paint only when the
resolved preference is `minimal`. This keeps classic startup CSS free of
inactive presentation rules without introducing a second component tree or a
runtime subscription. Feature-local styles for already-lazy short-drama and
media chunks remain with those chunks.

The presentation preference is resolved once during startup and the same value
is supplied to both the stylesheet loader and the startup keyboard policy.
Classic presentation preserves the existing application-wide Tab suppression,
including Monaco/xterm exceptions. Minimal presentation restores native browser
Tab traversal without adding feature-specific focus state or keyboard business
logic.

### Desktop zoom boundary

Desktop zoom is application capability, not presentation state. The main
bootstrap only schedules `initializeDesktopZoom()` after the first shell paint.
The isolated runtime controller owns keyboard interpretation and bounded zoom
levels, then calls a narrow Tauri WebView adapter. It persists the selected
scale through the existing `app.zoom_level` configuration path.

```text
Desktop key event
  -> DesktopZoomController
  -> DesktopZoomAdapter
  -> Tauri WebView.setZoom
```

React pages, short-drama components, media views, and the minimal/classic
presentation selector do not read the platform or infer zoom. Browser builds
skip the adapter. Desktop visual tests must snapshot and restore the original
zoom preference so accessibility verification never changes user data.

Debug desktop builds load the Web UI from the fixed Vite origin instead of a
bundled local URL. The dedicated `desktop-dev-zoom` capability grants only
`core:webview:allow-set-webview-zoom` to the `main` window at
`localhost:1422` / `127.0.0.1:1422`; the default capability is not exposed to
remote content.

### Desktop E2E lifecycle boundary

Desktop E2E ownership belongs to the WDIO launcher process, not an individual
worker. Before any application process starts, the launcher atomically acquires
a cross-process lock. The launcher starts exactly one desktop child, workers
connect to its embedded driver, and completion waits for that exact child to
exit before releasing the lock. A second runner fails at the lock instead of
opening another desktop window.

### Minimal overlay and navigation overflow boundary

Global notifications remain owned by the shared notification system and stay
outside `AppLayout`. The minimal presentation stylesheet may position that
sibling container against the content edge, but it must not interpret
notification type, source, recovery action, or runtime state. Classic
presentation keeps its existing positioning.

The navigation sections rail is the single vertical scroll owner between the
fixed top actions and bottom bar. It must use `min-height: 0` with
`overflow-y: auto`; workspace and session components continue to render their
existing data without viewport-specific business branches. Desktop L0 proves
reachability by scrolling a real workspace card into the rail viewport and
restoring the original scroll position afterward.

## State Contracts

New state contracts describe presentation facts. They do not create a second
business state store.

Shared asynchronous status:

```ts
type PresentationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'unsupported'
  | 'restricted';

interface PresentationResult<T> {
  status: PresentationStatus;
  data?: T;
  source: 'runtime' | 'workspace' | 'session' | 'derived';
  error?: {
    category: 'path' | 'permission' | 'network' | 'dependency' | 'runtime';
    message: string;
    recovery?: string;
  };
}
```

Feature contracts:

- `AppShellViewState` and `AppShellActions`
- `ComposerViewState` and `ComposerActions`
- `ShortDramaWorkspaceViewState` and `ShortDramaWorkspaceActions`
- `WorkspaceMediaViewState` and `WorkspaceMediaActions`
- `SubagentTeamViewState` and `SubagentTeamActions`

The contracts must carry existing identity fields when relevant:
`workspaceId`, `workspacePath`, `sessionId`, `parentSessionId`, `agentRole`, and
`artifactId`.

The UI renders explicit status and invokes callbacks. It must not infer runtime
source from an empty array, missing object, title string, agent label, or
filesystem path.

## Minimal Visual Contract

### Typography

Reuse the current bundled/local font stack. Do not add a web-font request.

| Role | Size | Line height | Weight |
| --- | ---: | ---: | ---: |
| Metadata and timestamps | 11px | 1.35 | 400/500 |
| Labels, stages, tertiary actions | 12px | 1.35 | 400/500 |
| Navigation, controls, composer chrome | 13px | 1.4 | 400/500 |
| Conversation and script reading | 14px | 1.55 | 400 |
| Panel title | 15-16px | 1.3 | 600 |

Use 10px only for exceptional compact badges. Use 18px or larger only for
empty-state or page-level headings.

### Surfaces and color

The minimal layer exposes semantic aliases derived from existing ThemeService
tokens:

- canvas, panel, and raised surfaces;
- primary, secondary, and muted text;
- subtle and strong borders;
- hover, active, focus, and disabled control states;
- one primary accent;
- existing info, success, warning, and error status families.

No new purple/cyan gradient, glow, glass blur, raw palette, or decorative
shadow family is allowed.

### Spacing and shape

- compact spacing scale based on existing spacing variables;
- controls generally 28-32px high;
- touch/primary targets retain an accessible hit area where necessary;
- restrained radii;
- no card-inside-card layout;
- borders and surface changes express hierarchy before shadows;
- transitions target `opacity`, `transform`, `background-color`,
  `border-color`, and `color`; never `transition: all`.

## Migration Slices

### Slice 0: Baseline and recovery

Deliverables:

- verified checkpoint commit;
- architecture document;
- capability parity checklist;
- protected-file hashes;
- test and performance baseline.

No product source changes are allowed in this slice.

### Slice 1: Theme, typography, navigation, and composer

Start with additive, scoped CSS. Do not rewrite `ChatInput.tsx`.

Allowed product files:

- `src/web-ui/src/component-library/styles/tokens.scss`
- `src/web-ui/src/app/layout/AppLayout.scss`
- `src/web-ui/src/app/components/NavPanel/**/*.scss`
- `src/web-ui/src/flow_chat/components/ChatInput.scss`
- focused presentation selector/module and tests
- `src/web-ui/src/main.tsx`, limited to awaiting the presentation stylesheet
  loader in the existing pre-render initialization phase

`AppLayout.tsx` may receive only the minimal root class/data attribute or a
pure presentation choice. Existing effects and event handlers may not change.

Exit gate:

- all composer controls and keyboard behavior remain reachable;
- no React/runtime behavior diff unless separately justified and tested;
- classic and minimal presentation selection works;
- focused theme contract, Web tests, build, and manual composer parity pass.

### Slice 2: Short-drama workspace and media preview

Extract view-state derivation and actions before changing structural markup.
Keep stage bootstrap, project recovery, generation, preview URL resolution, and
workspace media operations in the existing module/service layer.

The first Slice 2 change is intentionally presentation-only. The existing
short-drama and media-gallery markup already exposes stable semantic selectors,
so extracting runtime state solely to restyle those selectors would increase
risk without reducing coupling. This sub-slice therefore:

- adds only `.void-ui--minimal` SCSS layers for the short-drama center and
  workspace media gallery;
- keeps `ShortDramaCenterPanel.tsx` and `WorkspaceMediaGallery.tsx` free of
  presentation-mode branches;
- gives the sibling media-preview overlay one optional `className` presentation
  input, selected by the existing application-shell resolver;
- preserves the classic styles and all controller, Store, service, event,
  media-resolver, and native player behavior;
- removes decorative gradients, blur, glow, lift, and continuous generator
  animation only in minimal presentation.
- keeps the shared overlay's minimal chrome in the presentation-only CSS chunk
  so the static entry remains inside the frozen JS/CSS performance budget.

Structural gaps discovered by visual review are not patched with CSS-generated
copy or runtime conditions. In particular, the empty storyboard explanation
requires an explicit view state and localized recovery copy, while the
four-column short-drama layout and competing agent tabs belong to the Slice 3
team-drawer boundary.

Real-desktop parity testing found two pre-existing short-drama UI-state races
inside the already-owned module. They are fixed as isolated correctness changes,
not presentation branches:

- after hydrating all five native stage-agent tabs, the controller explicitly
  reactivates the agent for the currently selected stage;
- programmatic episode scrolling remains guarded until the WebView scroll event
  settles, so episode 100 cannot be overwritten by episode 99 during a stage
  switch.

The static E2E fixture also opts into demo media explicitly. Production project
loading, generation, Skill policy, session creation, media resolution, and
message sending remain unchanged.

Allowed product areas:

- `src/web-ui/src/app/components/panels/content-canvas/short-drama`
- `src/web-ui/src/app/components/panels/content-canvas/workspace-media`
- new feature-local presentation types, selectors/controllers, views, styles,
  and tests

Exit gate:

- every short-drama stage and media operation in the parity checklist passes;
- pending, empty, loading, selected, preview, restricted, and error states are
  explicit;
- image/video loading remains lazy and virtualized behavior is preserved;
- no generation request or preview resolver is duplicated.

### Slice 3: Subagent team drawer

Move subagent presentation behind a quiet, collapsed-by-default team entry.
Keep the existing session graph and Skill/runtime policy unchanged.

The first Slice 3 sub-slice is a presentation projection over the existing
canvas groups:

- a pure selector activates only when the resolved workspace presentation is
  `minimal`, the layout is horizontal, the primary tab is the short-drama
  center, and every visible secondary tab is a real `btw-session` stage-agent
  tab carrying `shortDramaStage` metadata;
- mixed secondary content, non-short-drama primary tabs, vertical/grid layouts,
  and classic presentation fall back to the unchanged editor layout;
- the collapsed presentation reserves zero canvas width and exposes one compact
  on-demand team control. Opening it reveals the native stage-agent tabs;
  selecting a role calls the existing `switchToTab` and `setActiveGroup`
  actions and does not create sessions, send messages, read Skill policy, or
  own agent state;
- the bounded 420px open overlay keeps the original `EditorGroup` and tab bar
  mounted.
  This deliberately preserves close, reorder, pin, drag, overflow, and pop-out
  operations instead of replacing them with a visually cleaner but incomplete
  custom tab implementation;
- collapsing the team is presentation-only: child sessions and native tabs
  remain mounted, and the compact team control remains available to reopen the
  overlay;
- the control strip is dynamically imported only after the short-drama team
  projection becomes eligible, keeping the normal workspace entry bundle
  inside the frozen performance budget;
- while collapsed, the hidden native agent panel receives
  `isSceneActive={false}`. Existing `BtwSessionPanel` lifecycle guards then
  pause execution-state subscriptions, scrolling frames, ResizeObserver work,
  and Skill-picker loading without unmounting the real session UI;
- the rail uses native buttons with role labels, pressed state, and normal DOM
  focus order; a real-desktop test verifies that Tab advances between adjacent
  agent controls rather than being intercepted by the classic keyboard policy;
- widths below 760px use a presentation-only overlay so the short-drama canvas
  does not collapse below a usable width.

The generic badge in the nested session header is hidden only in this open
presentation because it duplicates the surrounding agent tab. The real agent
title and every interactive header/tab action remain present.

The final parity cycle found and fixed a missing mode gate: scoped CSS kept the
classic layout visually unchanged, but the presentation selector still entered
rail mode and passed `isSceneActive={false}` to its visible native agent panel.
`WorkspacePresentation` is now an explicit selector input. Classic mode returns
`classic-presentation`, mounts no custom controls, and preserves the original
secondary panel lifecycle. The same real-desktop short-drama test now runs in
both classic and minimal modes so this isolation cannot regress silently.

Allowed product areas:

- `src/web-ui/src/flow_chat/components/subagent`
- `src/web-ui/src/app/components/panels/content-canvas/editor-area`, limited to
  the pure projection, controls, scoped minimal styles, and focused tests
- shell composition needed to mount the drawer presentation

Exit gate:

- live, completed, failed, cancelled, and waiting states remain visible;
- logs, output, and session navigation remain reachable;
- `parentSessionId`, role, workspace, and artifact association remain intact;
- hidden drawer does not create high-frequency rendering or polling.

Collapsed status projection now consumes the explicit
`ShortDramaTeamAgentStatusProjection` model. The editor-area Hook maps retained
tabs to `{ tabId, sessionId }`; a flow-chat service adapter is the only layer
allowed to read `FlowChatStore`, and it publishes changes only when the
semantic status projection changes. The UI control imports neither
`FlowChatStore`, session internals, agent services, nor Skill configuration.
Raw tool names and streamed content are intentionally excluded from the
presentation contract.

### Slice 1 remediation notes: portal focus and modal ownership

Portal menus use a single roving-focus marker in addition to DOM focus. The
marker is presentation evidence for the active menu item when the embedded
desktop WebDriver cannot retain operating-system document focus; it does not
change menu selection or workspace behavior. Arrow, Home, End, and focus
capture update the same marker, while Escape still closes the menu and returns
focus to its trigger.

When a modal is open in minimal presentation, the existing notification
container stays mounted but is hidden and non-interactive. The modal therefore
owns the visible focus layer without deleting, dismissing, or mutating queued
notifications; notification visibility returns after the modal closes. The
real-desktop gate captures both normal and 200% Workspace Status states after
the entry animation settles, and verifies the critical current-workspace
actions remain reachable.

### Slice 4: Default switch and debt cleanup

The minimal presentation becomes the default only after Slices 1-3 pass the
full gate. Classic fallback remains for one final verification cycle.

Delete only:

- selectors proven unused by source search and tests;
- classic markup already replaced by a verified pure view;
- legacy aliases whose consumers are zero and whose removal passes the theme
  contract.

Never delete a capability solely because it is visually secondary.

## Verification Gates

Every slice runs the smallest focused tests first, then:

```powershell
pnpm --dir src/web-ui run test:run
pnpm run type-check:web
pnpm run lint:web
node --test <all scripts/*.test.mjs>
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
pnpm run i18n:contract:test
pnpm run i18n:audit
pnpm run check:core-boundaries
pnpm run build:web
```

For final completion also run:

- desktop Release build/check;
- Vite entry performance budget;
- manual desktop parity in classic and minimal presentation;
- keyboard-only navigation, IME, focus-visible, zoom, narrow width, and
  reduced-motion review.

Failure of any required gate keeps the classic presentation as default and
blocks deletion of the corresponding legacy code.

### Default-switch release evidence — 2026-07-18

- Browser-startup tests cover a clean profile, denied storage, stored classic,
  configured classic, and query-string classic rollback.
- The dedicated single-window visual reviewer captured the same historical
  short-drama workspace in light, dark, and system themes, including the
  expanded five-agent drawer, then restored the original light theme and
  collapsed state.
- Automated semantic-state fixtures enforce 4.5:1 text contrast for loading,
  success, warning, and error states across primary, secondary, scene, and
  elevated surfaces. Focus rings enforce 3:1.
- A cached headless Chromium runtime test emulates
  `prefers-reduced-motion: reduce` and reads computed styles. It proves the
  About update indicator stops its infinite animation and short-drama, media
  gallery, and media-preview motion is reduced to one 0.01 ms iteration.
- The final front-end suite, TypeScript, ESLint, theme, i18n, core-boundary,
  repository-hygiene, production build, Rust `release-fast` check, entry
  performance budget, protected hashes, and five-second idle sample pass.
- Classic remains available and previously completed the same L0 and
  short-drama desktop parity paths. No classic stylesheet or runtime
  controller was deleted in the default-switch slice.

## Protected Files

These pre-existing user files are excluded from migration commits unless the
user explicitly changes their scope:

| File | SHA-256 |
| --- | --- |
| `src/web-ui/src/flow_chat/tool-cards/MediaGenerationToolGroupCard.tsx` | `1a215cd480b15df8010e5730c6fe8d76fa65dae13bf8c7edd07585c110596235` |
| `src/web-ui/public/version.json` | `6afe25034c78a236e5d3ecb9afd23108aecf53d888fb2e2e481698fc12a44482` |
| `src/web-ui/src/generated/version-injection.html` | `798c053ce72c0a63ef91e7e656878453024289ffc26b8e7e3e22f6e3c49a4775` |
| `src/web-ui/src/generated/version.ts` | `a9200ba73e501fe5ffcfd98dab8ef3b911d8d354ba4da876039baec7169179f6` |

## Commit and Review Policy

- one coherent commit per migration boundary;
- protected files remain unstaged;
- no unrelated refactor;
- no legacy deletion in the same commit that first introduces its replacement;
- each commit records the focused verification used;
- if a visual requirement requires runtime or persistence changes, stop the
  slice and open a separate architecture decision instead of crossing the
  boundary silently.
