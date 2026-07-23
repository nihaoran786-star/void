# Frontend Minimal Workspace Migration

## Status

Default-switch slice complete on 2026-07-18. Minimal is now the clean-profile
default, while classic remains an explicit rollback presentation. The
migration stays active only for the separately recorded P2 debt; no remaining
P0/P1 release blocker is known.

Post-default stabilization on 2026-07-18 added the compact short-drama team
projection (`0a4080d47`) and preserved an explicit reopen control after collapse
(`ef33d736f`). The current presentation reserves no permanent rail width and
opens the existing secondary `EditorGroup` as a non-overlapping column capped at
360px / 32% when its canvas is wider than 720px. Only narrower canvases use a
bounded presentation-only overlay.

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

Minimal navigation uses a zero-row search projection. `MainNav` owns one search
trigger and one `NavSearchDialog`; only their presentation location changes.
Classic keeps the labelled trigger in `brand-header`. Minimal omits that header
and places the same 28px trigger beside the existing create-session action,
outside the mode `radiogroup`. A presentation-only footer uses
`display: contents` in the base layer so Classic geometry remains unchanged,
then becomes a compact flex row in the scoped Minimal layer. Search state,
Mod+K / Alt+F bindings, session-mode state, and the create-session handler are
not duplicated or moved across a Module boundary.

The compact trigger is now icon-only by DOM contract rather than by hiding a
mounted text label. `MainNav` mounts the localized visible search label only for
Classic; Minimal keeps the same localized `aria-label`, tooltip, 28px target,
focus ring, click handler, and keyboard shortcuts. The scoped Minimal navigation
layer also suppresses decorative leading icons from labelled Assistant,
Automation, Agent, and Skill rows. Extensions keeps one trailing chevron with
the existing `aria-expanded` state while its redundant Blocks glyph is hidden.
Classic markup and icon presentation remain unchanged. This is a presentation
projection only: no session creation, scene opening, search, automation, media,
or short-drama callback moved or changed.

The single-window desktop contract captures the result at wide `void-light` and
1024x720 `void-dark`. It requires the Minimal search label to be absent, every
decorative top-action icon slot to be non-rendered, the Extensions chevron to
remain visible, and the Classic search label and leading icons to remain
visible. Existing click, Mod+K, Alt+F, Escape, mode selection, focus, overflow,
and Classic fallback assertions continue to run in the same workflow.

`NavSearchDialog` is an on-demand module owned by that same trigger boundary.
`MainNav` keeps only the lightweight trigger and local open state in the startup
graph, then mounts the dialog through `React.lazy` and `Suspense` after the user
opens it. The dialog remains the sole owner of workspace, assistant, and
session-search behavior. The performance manifest requires the dialog as a
dynamic entry and forbids it from becoming statically reachable again.

The real-desktop L0 gate verifies both presentations at wide and 1024x720
sizes. Minimal must have no `brand-header`, one 28x28 trigger, no overlap or
horizontal overflow, and no extra top row. Classic must retain one labelled
header trigger and no inline slot. Enter, Escape, Mod+K, and Alt+F continue to
open or close the single dialog and focus its input; the test restores the
original URL, presentation, and window size afterward.

The next presentation-only refinement collapses the Minimal session launcher
to one 28px split row: the current mode icon plus the labelled create action, a
28px mode-menu trigger, and the 28px search trigger. The other mode icons move
into a 168px `menuitemradio` popover that is loaded only after the user opens
it and is right-aligned inside the navigation boundary. `SessionCreateLauncher`
owns only the local presentation state; `SessionModeMenu` owns portal geometry,
focus movement, outside-click, and Escape handling. Existing Code, Cowork, and
Media creation handlers remain in `MainNav` and are passed through unchanged.
Classic retains its labelled two-row card.

The real-desktop gate checks both widths, mode selection, lazy-menu readiness,
keyboard focus visibility, navigation-contained geometry, and overflow without
creating a session. The same gate waits for the lazy search dialog, verifies
native input focus, closes it with Escape, and therefore covers both
asynchronous module boundaries rather than only checking source shape.

The following density pass is still presentation-only. Minimal removes the
selected-mode glyph from the create action DOM because the adjacent labelled
mode trigger already communicates and changes that state; the localized
mode-specific create `aria-label` and the existing `onCreate` callback remain
unchanged. Classic continues to mount its three labelled mode icons and original
two-row branch. Minimal top actions use 28px rows with an 8–12px section rhythm,
while the navigation rail remains 240px and the fixed footer remains reachable.
Session rows retain every mode/running icon and notification dot in the same
DOM. Scoped CSS quiets only idle mode glyphs, restores them on hover,
focus-within, or active state, and keeps running glyphs plus attention/unread
dots fully visible. Only the active row receives the active surface; hover uses
a weaker surface and ordinary rows stay transparent.

No session selector, projection, creation handler, row action, runtime event, or
store contract belongs to this density layer. `SessionCreateLauncher` may choose
Minimal versus Classic markup, and `NavPanel.minimal.scss` may project visual
state already expressed by the DOM; neither may infer session status or mutate
application data. The single-window desktop contract checks computed geometry
and synthetic presentation probes without creating, editing, or switching a
session.

The final navigation-density refinement keeps only the overflow and
notification controls persistently visible in the Minimal footer. Shell,
browser, and remote-connect remain available in the existing labelled overflow
menu and invoke the same handlers; Classic keeps its original direct shell and
browser buttons. This is CSS-scoped progressive disclosure, not a capability or
navigation-state rewrite.

New-project and remote-connect entry points now mount lightweight facades. A
closed facade returns `null` before `Suspense` and dynamic import, while the
original concrete dialog remains the only owner of validation, filesystem,
network, disclaimer, and error behavior. The production manifest treats both
concrete dialogs as required dynamic entries.

Modal surfaces remain opaque throughout entry motion. The shared backdrop may
animate its own background color, and the surface may translate, but parent or
surface opacity must not expose underlying browser text through dialog content.

Minimal dialog styling follows one shared portal boundary. Because modal,
menu, tooltip, and fullscreen portals mount outside the application layout,
`AppLayout` projects the resolved presentation class onto `document.body`.
Portal styles consume it as an ancestor, so navigation/footer callers and
concrete dialogs do not read or repeat presentation state. The generic
`overlayClassName` prop remains available for independently mounted consumers,
but is not the application theme propagation path. Validation, filesystem,
network, connection, disclaimer, and error behavior remain in the concrete
feature implementations. Classic receives no Minimal override.

The Minimal new-project projection removes only decorative hero and field
icons, compresses the field rhythm, and keeps directory selection, validation,
cancel, and create controls intact. The Minimal remote-connect projection uses
a 440px surface, left-aligned tabs, neutral active surfaces, and semantic status
tokens while retaining every relay, bot, platform, mode, connection, disclaimer,
error, and disconnect path. Focus-visible outlines remain 2px token-backed
controls rather than being removed for visual quietness.

About and update surfaces use the same portal projection. Minimal About is a
460px information hierarchy with decorative dots, divider motion, and oversized
branding removed; version, update check, build metadata, copy action, license,
and close behavior remain available. Update-available and update-progress
surfaces use compact workspace-token cards and semantic status treatments.
Their concrete components are lazy dynamic entries, so the daily check
controller remains active without placing closed dialog JavaScript or CSS in
the startup graph. The shared body projection also covers navigation menus,
tooltips, editor popovers, and fullscreen viewers without introducing feature
imports into the presentation module.

The body projection solves scope propagation, not every legacy surface's local
design debt. Branch selection, Quick Look, and editor breadcrumbs now have
dedicated workspace-token projections imported by the Minimal presentation
aggregator. Their Classic structural styles remain in the component
stylesheets, while each `*.minimal.scss` file exports a mixin and is applied
only below the shared body root. None of these components reads presentation
state or branches its Git, file-tree, editor, or preview behavior.

The branch dialog uses a native dialog contract, native branch-selection
buttons, trapped Tab navigation, initial search focus, and focus restoration.
The workspace launcher supplies an explicit close callback because its menu
item unmounts before the dialog can otherwise capture a stable return target.
Editor breadcrumbs expose native menu triggers and menu items, guard stale
directory requests, reposition on viewport changes, support
Arrow/Home/End/Escape, and return focus to the opening segment. Quick Look
keeps only its two working actions, provides a named dialog, restores focus,
and clears delayed pin work on teardown.

The single-process desktop fixture mounts all three real components below the
application-owned Portal root and records both full-window and local-surface
captures. Independent visual review found no P0/P1/P2 issue. Its three P3
observations were closed by deriving a neutral overlay scrim from the canonical
modal token, insetting the breadcrumb menu focus boundary, and flattening the
Quick Look content surface without changing its preview renderer.

Standalone/full-snapshot diff viewers, remote file browsing, editor status-bar
actions, and status-bar popovers now follow the same local projection boundary.
Their Classic structure remains in the existing component stylesheet; each
token-only `*.minimal.scss` mixin is applied once from
`minimalWorkspacePresentation.scss` below the shared body root. The
presentation aggregator imports no SSH, Monaco, snapshot, or editor runtime,
and none of the four surfaces reads presentation state.

The two fullscreen viewers use named native-dialog semantics, trapped Tab
navigation, initial close focus, Escape close, body-scroll restoration, and
launcher-focus return. Snapshot Arrow navigation is scoped to the file switcher,
so Monaco cursor movement no longer changes the selected file. Safe file-index
clamping is shared by rendering and file actions when an asynchronous snapshot
list shrinks. Legacy generic CSS selectors are nested below their viewer root
to prevent `header-actions`, `file-name`, and related class leakage.

Remote file browsing still delegates all listing, navigation, transfer, rename,
and delete work to `sshApi`. Its rows are keyboard reachable; Arrow keys move
between rows, Enter/Space preserve selection semantics, and ContextMenu /
Shift+F10 opens a bounded native menu with Arrow/Home/End/Escape behavior and
focus return. The editor status bar now exposes native labelled buttons, while
indent, encoding, and language popovers use listbox/option semantics, roving
keyboard focus, Escape close, and trigger-focus restoration.

One single-process real-desktop fixture mounts the real components without
persisting SSH data and runs the same four interaction paths sequentially at
1280 by 800 with `void-light` and 1024 by 720 with `void-dark`. Both Monaco
viewers must report non-zero editor geometry before capture. The fixture checks
document and local-surface overflow, viewport containment, computed dark-theme
foreground/background colors, pointer hit testing, keyboard behavior, and
close-focus return. It restores its temporary `sshApi.readDir` mock after every
case, then independently restores and verifies the original theme selection,
URL, window size, mounted roots, hosts, and mock residue.

The Welcome scene follows the same additive presentation boundary. Its existing
component and Classic stylesheet remain byte-identical; one token-only
`WelcomeScene.minimal.scss` mixin enters exclusively through
`minimalWorkspacePresentation.scss`. Minimal projects the landing content into
a left-aligned, upper-middle reading column with the canonical 16px title,
13px control, and 11px metadata scale. Decorative section/action glyphs are
suppressed while the recent-workspace folder glyph remains as a quiet location
cue. Recent workspaces use flat row separators rather than cards, and the
existing date-to-delete hover/focus disclosure remains intact. The projection
adds only 720px / 480px layout adaptations and reduced-motion rules; workspace
selection, removal, project creation, dialog loading, scene navigation, and
error logging remain owned by the unchanged component and its existing Module
Interfaces.

The isolated Slice 35 verifier fresh build transforms 7,456 modules and keeps
all 55 required dynamic entries with zero unresolved static imports. The
unchanged hard budget passes at 2,334,842 raw JavaScript bytes against
2,337,259 and
632,070 raw CSS bytes against 633,915. JavaScript gzip is 681,314
(`+1,272` monitored warning) and CSS gzip is 89,309 (`+791` monitored
warning); these warnings are not described as no-regression results.

The light evidence refreshes
`.codex-artifacts/minimal-workspace/slice10-minimal-legacy-*`; the narrow dark
evidence is stored separately as
`.codex-artifacts/minimal-workspace/slice11-minimal-legacy-*-dark-narrow*`.
The 23px editor status bar remains an explicit high-density desktop exception:
its native actions keep a 19px internal height while retaining at least 28px of
width, visible focus, center hit testing, and no horizontal overflow. Independent
icon-only actions remain at least 28 by 28. The long-path fixture exposed the
remote breadcrumb edit action at 26px and allowed overflowing path text to show
through the toolbar region. Only `RemoteFileBrowser.minimal.scss` changed: the
edit action is now pinned at 28 by 28 beside the existing toolbar, with a
token-backed non-interactive mask over the reserved control region. No SSH API,
Monaco, editor, snapshot, or presentation-state behavior changed.

The independent Slice 10 production build transformed 7,455 modules in 34.79
seconds and passed the existing performance budget. Entry JavaScript is
2,334,390 raw bytes against the 2,337,259-byte limit; gzip is 681,511 bytes and
remains a monitored `+1,469` reference warning. Entry CSS is 627,314 raw bytes
against the 633,915-byte limit; gzip is 88,766 bytes and remains a monitored
`+248` reference warning. All 54 required dynamic entries remain present, with
zero unresolved static imports, and the budget unit suite passes 34/34. The
overall result is `PASS`; the two gzip deltas are warnings and must not be
described as no-regression evidence.

The independent Slice 11 follow-up build verifies the narrow-dark remote
breadcrumb adjustment itself. It transformed 7,455 modules in 36.51 seconds.
Entry JavaScript remains 2,334,390 raw bytes against the 2,337,259-byte limit;
gzip is 681,522 bytes and remains a monitored `+1,480` reference warning.
Entry CSS remains 627,314 raw bytes against the 633,915-byte limit; gzip remains
88,766 bytes with a monitored `+248` reference warning. All 54 required dynamic
entries remain present, unresolved static imports remain at zero, and the
budget unit suite passes 34/34. The overall result is `PASS`; protected generated
version files retained their original hashes and modification times. The gzip
deltas remain warnings rather than no-regression claims.

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

Typography token debt follows a ratchet: consumers use the canonical token
instead of adding synonymous aliases, and the undefined-token audit baseline
may only decrease as debt is removed.

`--font-family-sans` and `--font-family-mono` are the canonical CSS APIs for
theme-aware UI and code typography. `--font-sans` and `--font-mono` remain
compatibility aliases only; `ThemeService` writes each alias pair to the same
resolved theme value. JS-rendered UI such as Canvas reads the canonical sans
token through `shared/utils/uiTypography` instead of embedding a platform font
stack. The local Noto Sans SC bootstrap stack remains available before theme
resolution. Editor, terminal, diff, code, KaTeX, and icon fonts remain explicit
semantic exceptions; user font-size preferences are outside this family
contract and continue to own only size variables.

The source ratchet records debt and explicit exceptions as a normalized
`path + declaration kind + exact family value` multiset, not only a per-file
count. This prevents an equal-count replacement with another UI stack from
silently passing. Page styles now consume `--font-family-sans` at runtime,
including the former decorative text exceptions, and all eight built-in presets
share `DEFAULT_UI_FONT_FAMILY`; custom-theme font configuration remains
supported. The legacy Sass and built-in-preset literal baselines are therefore
zero. The remaining bounded migration debt is nine non-DOM Canvas, Mermaid, and
embedded-widget declarations plus six static short-drama SVG declarations.
Literal mono, KaTeX, codicon, editor, terminal, diff, and code exceptions remain
validated independently and exactly.

The same ratchet applies to surface and semantic color tokens. Scene canvases
use ThemeService's canonical `--color-bg-primary`; base semantic error text uses
`--color-error`, while compact workspace status text uses the contrast-lifted
`--workspace-status-error-text`. Its Classic fallback applies the same
error-to-primary-text contrast lift instead of exposing small text directly to
the lower-contrast light-theme error primitive. Error borders use
`--color-error-border`. Consumers must not recreate the retired
`--color-bg-base` or `--color-semantic-error` aliases.
Floating surfaces use `--color-bg-elevated`; low-emphasis nested elements use
the `--element-bg-*` scale, with `base` reserved for unbordered controls that
must remain visibly distinct. Bordered form fields use the shared `--control-bg`
contract rather than inventing scene-local background aliases. Scrollbar thumbs
use the canonical border ramp: `--border-medium` at rest and `--border-strong`
on hover. Undefined surface aliases must not be reintroduced.

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

The canvas header now presents media and short drama as two modes of one media
workspace instead of unrelated icon actions. `ContentCanvas` remains the only
owner of session eligibility: it passes the short-drama callback only when
`isShortDramaMediaSession(activeSession)` is true. The lightweight
`WorkspaceMediaEntry` renders that explicit capability as a text switcher and
never reads session state, runtime policy, Skill configuration, or generation
services. Non-media sessions therefore cannot acquire a short-drama entry
through CSS or local component inference.

The static E2E fixture also opts into demo media explicitly. Production project
loading, generation, Skill policy, session creation, media resolution, and
message sending remain unchanged.

The post-production density pass remains presentation-only:

- the final preview removes its outer decorative card while the media element
  keeps one functional boundary;
- the result list removes its nested container chrome and uses a thumbnail,
  title/reference, and status/progress row without hiding generation state;
- ready, empty, and team-open real-desktop captures verify no horizontal
  overflow and preserve native playback controls;
- episode focus retains one two-pixel focus indicator instead of combining the
  same focus color as both an outer outline and inset ring.

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
  on-demand team control. Opening it reveals one compact team/agent selector;
  selecting a role calls the existing `switchToTab` and `setActiveGroup`
  actions and does not create sessions, send messages, read Skill policy, or
  own agent state;
- the open state keeps the original `EditorGroup`, agent sessions, and generic
  tab bar mounted in a non-overlapping column capped at 360px / 32%. In Minimal
  short-drama presentation only, the generic tab bar is visually suppressed
  and its five invariant role tabs are projected through the dedicated
  selector. Classic and every non-short-drama editor group retain the unchanged
  generic tab-management chrome;
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
- editor canvases at 720px or narrower use a presentation-only overlay so the
  short-drama canvas does not collapse below a usable width. Wider canvases use
  the real two-column flex layout and a desktop assertion verifies the primary
  and secondary rectangles do not overlap.

Header actions follow one interaction contract:

- the team summary is the only rail-to-panel action and contains status plus
  agent count; it has no competing chevron;
- once open, the dedicated 36-pixel team bar owns one named panel-collapse
  action, and the rail control is not duplicated over the panel;
- the current agent remains visible in the trigger even when all five roles
  cannot fit horizontally. Its listbox exposes every role, semantic status,
  and a non-color selected checkmark; Arrow keys, Home, End, Escape, pointer
  selection, and focus restoration are presentation-local behaviors;
- the primary tab-bar ellipsis always opens the same actions menu. Mission
  control never runs directly from the trigger, hidden tabs stay inside the
  menu, and the destructive close-all action is no longer a persistent icon;
- panel collapse and close-all use distinct presentation semantics even though
  both still delegate to the existing canvas callbacks.

The generic badge and repeated title in the nested session header are hidden
only in this open presentation because the dedicated trigger already names the
active agent. If the nested header has right-side review/origin actions, the
action container remains present; an empty header is removed entirely.

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

### Automation presentation theme bridge

Automation keeps one structural stylesheet and one additive minimal
presentation layer:

- `AutomationScene.scss` owns calendar geometry, task positioning, dialog
  structure, and portable classic defaults.
- `AutomationScene.minimal.scss` is the only layer allowed to project those
  structures onto `--workspace-*` typography, surface, border, status, focus,
  radius, and shadow tokens.
- Priority P0/P1/P2/P3 maps to error/warning/info/neutral semantics in minimal
  mode. The mapping changes presentation only; task priority values, filtering,
  scheduling, persistence, and agent targeting remain unchanged.
- Calendar today/outside-month surfaces, grid borders, detail prompts, tool
  messages, failed-task rings, dialog selections, and primary-button hover
  states explicitly override fixed light defaults in minimal mode. Dark and
  custom themes therefore do not inherit a light-only calendar palette.
- The filter disclosure continues to use native `details` semantics and the
  existing automation context. Escape closes it and restores focus without
  introducing a second filter state.

The real-desktop automation visual contract is registered in and runs as the
final spec of the standard sequential L0 suite
(`pnpm --dir tests/e2e run test:l0:all`). It captures wide, 1024x720,
dark-theme, and light-theme states. Its cleanup independently restores and
verifies the prior theme selection, URL, and window size.

Populated automation evidence uses the real `AutomationProvider`,
`AutomationHeader`, Week/List views, `TaskCard`, and `TaskDetailPanel` with an
in-memory fixture. It deliberately does not import or render
`AutomationScene.tsx`, invoke Cron/API adapters, or persist automation data.
Pending, queued, running, completed, and failed states; P0-P3 priorities; long
Chinese/English/URL/Windows-path content; all artifact types; and all
conversation roles are covered in light 1280x800 and dark 1024x720 desktop
paths. Callback counters must remain zero. Fixture cleanup restores the
original root style, `aria-hidden`, `inert`, theme, URL, and window size.

The follow-up presentation slices centralize the complete automation type
hierarchy:

- Nine scene-scoped semantic roles (`micro`, `meta`, `label`, `control`,
  `body`, `title`, `heading`, `lead`, and `display`) replace 62 disconnected
  `font-size` declarations. `medium` and `strong` replace 27 raw font-weight
  declarations.
- `AutomationScene.scss` keeps exact Classic pixel and weight defaults.
  `AutomationScene.minimal.scss` maps the same roles to the compact
  `--workspace-*` hierarchy. Calendar geometry, scheduling state, filters,
  dialogs, task data, and persistence do not infer presentation mode.
- All additive `*.minimal.scss` files now consume workspace typography tokens;
  no hard-coded pixel `font-size` declarations remain in that presentation
  layer.
- A scene-scoped `prefers-reduced-motion` contract collapses transitions and
  animations without introducing JavaScript media-query state.
- Real-desktop evidence now switches through Day, Week, Month, and List using
  the existing `AutomationContext` view controls and verifies each surface
  stays inside the shared compact shell.
- Week-view task counts stay on one line inside each of the seven columns. At
  1100px and below, Minimal shows the localized count value only while keeping
  the complete localized task-count text in the DOM; Classic, wider layouts,
  and calendar data remain unchanged.
- Classic color literals are defined once in the scene token block with their
  exact existing values. Component rules consume only `--as-*` aliases, while
  Minimal remaps those aliases to `--workspace-*` surfaces, text, borders,
  status colors, overlays, and shadows.

Populated task/detail evidence is closed without adding persistence or a
second state model. Task cards expose one complete accessible name in every
density. The detail sheet owns its local dialog focus lifecycle and APG tabs;
Escape/backdrop close, focus return, focus containment, Arrow keys, Home/End,
prompt/artifact/conversation switching, and task-switch tab reset are covered
against the existing provider interface.

The independent Slice 16 production build verifies that this semantic-only
production change does not widen the startup graph. It transforms 7,455 modules
in 34.53 seconds. Entry JavaScript remains 2,334,390 raw bytes against the
2,337,259-byte limit; gzip is 681,521 bytes and remains a monitored `+1,479`
reference warning. Entry CSS remains 627,314 raw bytes against the
633,915-byte limit; gzip remains 88,766 bytes with a monitored `+248` reference
warning. All 54 required dynamic entries remain present, unresolved static
imports remain at zero, and the budget unit suite passes 34/34. The overall
result is `PASS`; protected generated version files and the protected media
generation tool card retain their original hashes and modification times.

The Slice 20 density pass remains inside the same presentation adapter:

- Minimal automation uses a 40px quiet command bar. Wide desktop height is
  capped at 44px; the 1024x720 shell may wrap without hiding actions but is
  capped at 72px.
- Day, Week, Month, and List are plain 28px text controls without a second
  bordered container. Create Task remains the only compact primary action.
- Calendar grid contrast and Today emphasis are reduced without changing the
  56/64px time rows, seven-column geometry, task positioning, or date math.
  Today keeps normal theme text on an opaque workspace panel with a subtle
  inset boundary so both built-in themes retain at least 4.5:1 contrast.
- The detail sheet reduces presentation spacing only. Long localized text,
  URLs, and Windows paths use `overflow-wrap: anywhere`; dialog, tab, callback,
  and focus behavior remain owned by the existing components and provider.
- The Minimal bridge contains exactly 64 pre-existing `--as-*` compatibility
  declarations. The visual contract freezes that count: new automation
  presentation work must reuse the workspace contract or remove legacy aliases,
  never add synonymous local theme tokens.
- No global workspace token, Classic rule, Provider, Context, Runtime,
  persistence adapter, session, media, or short-drama module is changed by this
  slice.

The Slice 21 media command-bar pass remains inside the workspace-media
presentation adapter:

- Minimal media uses one 40px command bar. The idle search is a 28px
  icon-width target and expands only while focused or while a query exists;
  no width or layout transition is introduced.
- Media, Recently Deleted, and Media Filters retain their existing query,
  view, filter, sort, refresh, and selection callbacks. The only added state
  projection is the query-derived `has-query` presentation class; no second
  media state model is introduced.
- At 460px and below, the command bar wraps only when the focused/query search
  needs the full row. The refinement sheet is capped at 260px and uses the
  gallery container width (`100cqw`) rather than the viewport, preventing the
  panel and all four media-type controls from escaping a narrow right rail.
- Search and clear actions use localized accessible names. Typography, color,
  spacing, radius, motion, and focus treatment consume the existing
  `--workspace-*` contract; no local theme alias or raw color is added.
- Classic media styling is unchanged. Workspace media discovery, deletion,
  preview, generation refresh, session, Runtime, store, adapter, short-drama,
  and media-service contracts remain outside this slice.
- Serial desktop evidence creates and opens a real Media session, exercises
  the real toolbar in light and dark themes, reloads after theme persistence,
  and asserts the narrow refinement panel and its four controls remain inside
  gallery geometry. Cleanup restores the exact saved theme, URL, window size,
  and temporary session.

The Slice 22 media/short-drama creation-navigation pass remains inside the
workspace-media and short-drama presentation adapters:

- Minimal projects the existing Media and AI Short Drama surfaces through one
  quiet 28px text switcher. `WorkspaceMediaEntry.minimal.scss` owns the
  override, while the Classic 26px group and 20px options remain unchanged.
- The short-drama top bar is 36px and its five stage controls are 28px. At
  constrained widths the stage strip scrolls horizontally without a visible
  scrollbar. Keyboard focus scrolls the already selected native stage button
  into view and uses one continuous focus boundary; the stage model, selected
  value, click callbacks, and content switching remain unchanged.
- The supported narrow team state is the existing compact rail. The desktop
  contract closes an expanded team panel through its real toggle before
  measuring the short-drama primary column; it does not invent a second
  responsive state or hide any agent capability.
- At 420px short-drama container width and below, the script empty state uses
  the available content-column width. The inline AI activation hint is promoted
  locally to the existing secondary text token because it is an operational
  instruction. Global editor placeholder styling is unchanged.
- Serial desktop evidence creates a real Media session, opens the real
  short-drama center, switches Media and AI Short Drama through their existing
  callbacks, and reaches Post by keyboard in a 720px dark window. It also
  verifies five stages, horizontal overflow, full final-stage visibility,
  zero document overflow, single focus treatment, and the real post preview.
- Independent review of the refreshed light and dark captures scores 18/20
  with P0/P1/P2 = 0. Remaining P3 notes are limited to repeated AI Short Drama
  labelling, dense post-preview metadata, and the episode rail's tight right
  edge; none blocks interaction or content visibility.
- No Runtime, store, persistence adapter, session API, Skill, media-generation,
  preview service, or short-drama business contract is changed by this slice.

The Slice 23 narrow short-drama follow-up stays inside the same presentation
boundary and closes a responsive-rule collision discovered by real desktop
evidence:

- The base stylesheet changes the episode rail to horizontal layout at an
  860px application viewport, while Minimal is governed by the short-drama
  panel's inline size. Minimal now explicitly restores a 32px vertical grid and
  the matching two-column body, so viewport and component breakpoints cannot
  combine into a clipped 32px horizontal rail.
- The rail continues to render the existing episode buttons and selection
  callback. Serial desktop evidence requires all ten fixture buttons to remain
  inside the rail, in vertical order, and proves Episode 2 is clickable and
  becomes active.
- The media-session surface switcher keeps the full `AI 短剧` accessible name
  and tooltip, but projects the compact visible label `短剧`. This preserves
  the existing Media/Short Drama callbacks while removing repeated visible
  wording beside the active canvas tab.
- At a 420px short-drama container and below, the final preview keeps the
  title, duration, open action, and semantic status while omitting only the
  technical media id. Truncated title and preview labels expose their complete
  values through native titles. Media-id styling is separate from status-pill
  styling, so identifiers do not inherit a false status dot; status pills are
  non-wrapping.
- The refreshed screenshot sequence records Episode 1's ready final preview
  before selecting Episode 2, then records the failed/pending episode state
  separately. This is test-driver ordering only; fixtures, project state,
  preview selection, artifact focus, and media-open callbacks are unchanged.
- No new state, hook, store selector, Runtime branch, API, persistence adapter,
  Skill, generation service, media resolver, or short-drama domain rule is
  introduced. The remaining narrow-header tab fragment is documented as P3
  presentation debt; removing it requires a separate tab-header interaction
  contract rather than hiding a still-focusable tab with CSS.

### MCP resource-browser presentation tokens

The MCP resource browser remains an infrastructure/config presentation-owned
surface. Its stylesheet consumes only ThemeService-backed canonical background,
text, border, control, typography, radius, motion, and element-state tokens.
Hover uses the subtle element surface, selection uses the medium surface plus
the existing accent edge, and MIME metadata uses the neutral status surface;
these states must not collapse back onto one legacy tertiary-background alias.

`MCPResourceBrowser.tsx`, `MCPAPI`, resource loading, filtering, selection, and
content rendering remain outside this presentation slice. The component is
currently exported but has no production mount consumer, so its verification
is a static visual contract plus theme governance and build gates. Do not add a
temporary settings entry or claim a production screenshot until a real product
route owns the resource-browser capability.

Before a future production mount, resource rows also need explicit keyboard
semantics and MCP API failures need an explicit error state rather than an empty
resource projection. Those are behavior/state-model changes and must remain a
separate slice from token normalization.

### Settings control and typography tokens

Settings presentation uses the shared control-state scale instead of
component-local surface aliases: bordered choices rest on `--control-bg`,
hover on `--control-bg-hover`, and selected choices on
`--control-bg-active`. Native setting controls expose a 2px
`--control-focus-ring`; compact spacing and radii come from the component
library SCSS scale rather than one-off values.

Text and previews consume canonical ThemeService-backed
`--color-text-*`, `--color-bg-secondary`, and `--font-family-sans` tokens.
Motion lists only the paint property that changes; `transition: all` is not
allowed. These rules are presentation-only: review-team persistence, model
selection, font preferences, hooks, APIs, and settings state remain unchanged.

The real-desktop settings contract enters through `scene:open settings`, then
uses the actual `SettingsNav` search and result controls to reach Appearance and
Deep Review. It never calls the settings store directly and never activates a
strategy, font-size, reset, model, member, or save control. Dark and light runs
assert canonical computed surfaces, selected state, 2px keyboard-only focus,
and horizontal overflow, then capture the complete settings workspace, the
complete UI-font row, and the review-strategy group. Cleanup independently
restores and verifies the prior theme selection, URL, and window size.

Minimal Settings navigation progressively discloses that same search through
one labelled 28px header action. The query, index, debounce, result activation,
and active-tab ownership remain in the existing `SettingsNav`/settings-store
boundary; only the open/closed presentation state is component-local. Opening
focuses the native search input. Escape first clears a non-empty query, then a
second Escape closes the empty Minimal disclosure and restores focus to its
trigger. Activating a result follows the same close-and-restore path. Classic
keeps the search row permanently visible and preserves its clear-and-refocus
behavior, while CSS—not a second search implementation—selects the projection.
No height animation is allowed; workspace surface, text, radius, and 2px focus
tokens define the compact action and revealed field.

Minimal Settings content follows the same compact workspace rhythm without
changing the Classic config-page contract. Page headers use a 24px top inset,
20px trailing space, the canonical `--font-size-lg` title token, and compact
subtitle leading; containers at 520px or narrower retain a 20px/16px responsive
inset. Top-level sections are 24px apart, section headers and bodies are 12px
apart, and setting rows use 12px padding and gap. The shared config DOM, control
ownership, persistence, and page routing remain unchanged.

Deep Review keeps all three strategy choices on one row whenever the named
config-panel container is wider than 640px. Strategy and overview grids switch
to one column from that container boundary, not from the desktop viewport, so a
wide settings content area does not accidentally inherit a narrow 2x2 or
stacked projection. The compact search trigger swaps its Search glyph for an X
while expanded and hides only the redundant Search-component prefix in
Minimal; the same button, label, expanded state, and close handler remain.

The real-desktop gate starts keyboard traversal at the search trigger after
result activation restores focus, then follows the real reverse tab order with
Shift+Tab until the target control receives focus. It never programmatically
focuses or activates a preference. The gate also verifies three strategy cards
share one top edge, their grid has no horizontal overflow, and records new
Slice 12 closed, expanded-search, Appearance, and Review evidence without
overwriting earlier captures.

The Windows embedded WebDriver can move focus through synthetic Shift+Tab
without updating WebView2's `:focus-visible` input-modality flag. Desktop E2E
therefore proves that the real keyboard sequence reaches the intended native
button without changing its pressed state, and asserts the computed 2px ring
whenever WebView2 reports `:focus-visible`. Focus-ring selector and token
presence remain mandatory in the static visual contracts, so the driver
limitation cannot weaken the product CSS contract or create a flaky gate.

### Canonical theme consumer ratchet

Shared editor, Git graph, files, ACP settings, and welcome surfaces consume the
existing border, accent, warning-status, and control-state contracts directly.
They must not reintroduce the retired `--color-border-secondary`,
`--color-selected`, `--color-warning-*`, `--element-bg`, or
`--element-bg-muted` aliases. This is a stylesheet-only normalization: editor
errors, commit selection, file-search notices, ACP confirmation, and recent
workspace behavior remain owned by their existing components.

The first normalization slice reduced the undefined-token governance budget
from 33 to 27. The follow-up theme-debt slice reduces it from 27 to 0 without
adding fallback aliases:

- live consumers now use existing semantic status, surface, text, shadow, and
  tool-card contracts;
- unimported form, user-message, glass, glow, and shadow utility styles are
  retired only after source-consumer checks;
- the component-library layer scale exports canonical `--z-*` variables for
  plain CSS consumers, and numeric utility classes map to the semantic layer
  matching their intent.

The zero budget is now a hard ratchet. New undefined variables fail the theme
audit instead of being normalized through compatibility aliases.

### Minimal floating mini chat presentation

The floating mini chat keeps its existing React state, Flow Chat store
subscription, session switching, send/cancel events, and conditional mount.
`FloatingMiniChat.scss` remains the Classic structural contract.
`FloatingMiniChat.minimal.scss` is imported only by the Minimal presentation
aggregator and may override presentation properties, but it must not own chat
state or runtime decisions.

When closed, Minimal exposes the existing labelled launcher as a 24-by-40px
edge tab with no reserved content width, shadow, scaling, or decorative motion.
The Settings content wrapper adds the same 24px trailing safe area so visible
configuration rows do not sit beneath the edge action. The existing mini-app
customization collision modifier remains an explicit positioning exception.
When open, the existing panel is inset from the viewport and uses a bounded
360-by-560px workspace-token surface. Opening and closing use only opacity and
a small translation; the open computed transform is `none`. Processing, error,
and confirmation retain distinct semantics through static two-pixel status
borders. Header, picker, input, send, focus, surface, radius, and shadow values
come from canonical `--workspace-*` tokens, and reduced-motion removes every
transition and animation in the slice.

The Slice 13 desktop contract enters the real Settings scene, clicks the
existing launcher and close action in dark and light themes, checks that the
closed tab does not overlap visible configuration rows, and proves the open
panel stays inside the viewport without horizontal overflow or decorative
background images. It then switches to Classic and verifies the original
44-by-44px inset launcher before restoring the prior theme, URL, and window
size.

The base Classic stylesheet now consumes its 24 canonical variables without
duplicating 43 literal fallbacks. This is a token-consumer ratchet only:
standalone gradients, shadows, selectors, properties, the Minimal override,
and every React/store/runtime contract remain unchanged. A static contract
prevents literal color fallbacks from returning while preserving the existing
base send-button gradient as an explicit non-goal.

After independent review, the Slice 13 spec is registered once in the shared
L0 Webdriver configuration immediately after the Settings visual contract.
Direct execution still uses `--spec` so this slice can be verified without
running the entire sequential L0 suite.

### Settings navigation density boundary

Minimal Settings navigation owns a presentation-only density override so the
MCP and ACP entries remain visible above the persistent navigation footer in a
1280-by-800 desktop window. The override changes only the scroll-area padding,
category separation, category-header height, and item height. The shared
Settings configuration, search store, route selection, scene composition, and
persistent footer remain unchanged.

Classic keeps its original 32-pixel items, 24-pixel category headers, and
24-pixel category separation. Minimal uses 28-pixel items, 20-pixel category
headers, 16-pixel category separation, and a 4/12-pixel scroll-area safe edge.
The scroll container deliberately remains scrollable for the final developer
category instead of compressing all settings into a fixed-height menu.

Slice 14 desktop evidence reads real element geometry before capture. It
requires the MCP and ACP rows to remain in the unscrolled viewport with at
least four pixels of clearance from the persistent footer, while preserving
the existing overflow behavior for additional settings.

### Toolbar Mode accessibility boundary

Toolbar Mode keeps its existing single-window provider, native window
transitions, Flow Chat subscription, session switching, create/send/cancel
events, pending-tool actions, and expanded/compact state. The presentation
component now names its icon-only session, overflow, send, stop, input,
confirmation, rejection, expand, and restore actions with existing
`flow-chat` translations. Both text inputs also expose localized accessible
names. No locale, provider, store, runtime, media, or short-drama contract
changes in this slice.

The session disclosure owns one stable listbox id and projects every real
session as an option with explicit selected state. The overflow disclosure owns
one stable menu id; both triggers expose `aria-controls`, `aria-haspopup`, and
`aria-expanded` without changing their click handlers. Decorative Lucide
glyphs are hidden from the accessibility tree, while every native button keeps
an explicit `type="button"`.

Toolbar buttons, inputs, create-session control, session options, and overflow
items share the existing two-pixel `--control-focus-ring` contract.
`transition: all` is prohibited in this surface; the remaining transitions
list only background, color, transform, shadow, or opacity. A focused source
contract ratchets these semantics and styles. The Slice 18 desktop
specification uses the real footer action, asserts that the same single window
enters Toolbar Mode, and reaches the session trigger using only real Tab input.
It requires the trigger to match `:focus-visible` with a non-zero outline and
records that light-theme focus state. The expanded overflow menu supplies the
localized Restore Main Window label; the test then invokes its first item to
collapse, requires the unique collapsed restore control to carry the same label
and Maximize glyph, reaches it with Tab, records the compact state, and restores
the main window through its existing click path. No production focus call is
used.

The embedded WebDriver's synthetic Enter sequence delivers `keydown` and
`keyup` to the focused native restore button but does not synthesize the
browser's default button `click`. Slice 18 therefore asserts document focus,
the active and `:focus-visible` restore target, one Enter `keydown`, one Enter
`keyup`, zero synthetic clicks, and the exact event target while Toolbar Mode
remains mounted. It then performs exactly one WebDriver pointer click and
requires the click listener and existing Provider restoration path to complete.
This split is a driver-contract limitation, not a product keyboard workaround:
production must not add an `onKeyDown` compatibility handler that could
double-activate in real browsers.

Cleanup accepts either expanded or compact Toolbar Mode state, closes it through
its real UI, restores the exact saved theme and URL, and only then restores the
native window. The native snapshot includes the single WebDriver handle,
physical outer position and size, maximized, decorated, resizable, and
always-on-top state. Restoration clears the Toolbar Mode minimum size and
unmaximizes the current window before reapplying decoration, physical geometry,
resizability, and always-on-top state; it then clears skip-taskbar, restores
the saved maximize state, and focuses the original window. The final poll allows at most two
physical pixels of geometry variance and requires exact boolean state and the
same sole handle.

### Minimal media header and responsive pane boundary

Minimal media sessions now apply one presentation-only tab-strip selector.
`workspace-media-gallery` and `short-drama-center` tabs stay in the real canvas
model but leave the ordinary tab strip; the existing overflow menu projects
those same tabs and their Fullscreen, Pin, Pop out, Close, and Close all
handlers. Ordinary sessions and Classic presentation keep the previous tab
strip. The selector is a pure layout transformation and does not read or
mutate session, Runtime, media, short-drama, or persistence state.

The resulting 32px header uses canonical workspace tokens and explicit
background, color, opacity, transform, shadow, and border transitions only.
Legacy raw-color and `transition: all` contracts are prohibited. Deleted
`ShortDramaEntry.scss` aliases are not restored: their source contract now
targets the shared `WorkspaceMediaEntry.scss` plus its Minimal projection.

The responsive scene boundary preserves the mounted chat and auxiliary pane.
When a real media or short-drama surface is present, the chat keeps its 400px
minimum whenever space permits and the auxiliary surface receives the first
216px at narrow widths; only presentation width yields below that point.
Welcome and Flow Chat descendants explicitly allow flex shrinkage, preventing
the previous document-width overflow without changing callbacks or lifecycle.

Slice 24 records full-window evidence before element screenshots because the
embedded WebDriver may scroll an element into view while capturing it. The
desktop contract therefore asserts document, session, scene, chat, and
auxiliary-pane geometry before capture, then exercises real Media/Short Drama,
stage, team, overflow, pin, close-action, and episode paths. Light 1280px and
dark 720px runs complete without duplicate panes or horizontal scene overflow.
The Minimal episode rail is sticky on both scroll axes, so selecting and
programmatically revealing Episode 2 cannot scroll the real 1–10 navigation
out of view.

### Slice 25: Automation density and theme ownership

The Automation follow-up remains a presentation and accessibility slice. Its
provider, execution callbacks, persistence, Runtime integration, and task state
model are unchanged. `AutomationScene.theme.scss` is the single compatibility
bridge from the legacy `--as-*` vocabulary to canonical workspace tokens; the
Minimal stylesheet consumes that bridge instead of owning another token copy.
The bridge contains 50 aliases, down from the previous 64 inline aliases, and
introduces no raw color values.

Minimal task cards, List view, and the task-detail sheet use flat canvas
hierarchy, dividers, restrained semantic status color, and compact spacing.
Decorative Bot, Repeat, priority, and metadata glyphs may be visually removed
only when the same task, effective status, priority, agent, schedule, or time
information remains in visible text or the row's accessible name. View-mode
controls expose `aria-pressed`; decorative glyphs are hidden from assistive
technology. This keeps UI code rendering the existing state instead of
inferring task origin or execution behavior.

The theme audit ratchets only improved limits: repository unique colors
decrease from 1,567 to 1,555, app-UI unique colors from 1,468 to 1,456, and
near pairs from 1,102 to 1,101. Undefined variables remain zero. Serial
real-desktop verification covers Week, Day, Month, List, filters, populated
detail tabs, light/dark themes, keyboard focus, and cleanup in one window.
The final low-noise pass removes redundant artifact and conversation glyph
containers while preserving filenames, roles, timestamps, and tool semantics.
Independent visual review reports P0/P1/P2/P3 = 0.

### Slice 26: Navigation theme contract and compact search

The navigation follow-up keeps `MainNav`, session rows, and workspace rows as
composition and rendering layers. Session creation, mode selection, search
dispatch, workspace activation, Runtime integration, persistence, and all
media/short-drama services retain their existing state and callbacks. The
change is limited to a presentation contract: Minimal renders search as one
28px icon target and projects existing navigation surfaces through workspace
tokens, while Classic retains its full search field and mode card.

Guaranteed shared theme variables are consumed directly instead of repeating
feature-local raw fallbacks. The remaining unknown-workspace status value uses
one navigation alias: Classic keeps the existing `#94a3b8` value and Minimal
maps the alias to `--workspace-text-muted`. Mode, inline-session, workspace,
footer, and generic navigation popovers share the same raised-surface
projection in Minimal. Semantic success, warning, error, running, unread, and
focus states remain explicit; the navigation UI does not infer their source.

Theme governance ratchets only improved limits: repository unique colors fall
from 1,555 to 1,549, app-UI unique colors from 1,456 to 1,450,
indistinguishable pairs from 46 to 44, and near pairs from 1,101 to 1,081.
Fallback-only variables remain 72 and undefined variables remain zero. Focused
navigation contracts pass 28/28, Web TypeScript passes, and the serial desktop
contract passes 6/6 across click and shortcut search entry, Escape, Tab focus,
narrow geometry, 100–200% zoom, light/dark themes, and Classic rollback.
Independent visual review scores the refreshed evidence 19/20 with P0/P1/P2 =
0. The remaining P3 is the intentionally quiet idle session-type icon, which
stays visible until a later session-information hierarchy review proves it can
be removed without losing meaning.

### Slice 27: Short-drama narrow stage fit

The narrow short-drama follow-up is a container-level presentation rule, not a
stage-state fork. At a short-drama container width of 420px or less, the five
existing stage buttons may grow equally and use the compact workspace inset.
Chinese stage labels therefore fit together without leaving a partially
visible first label after keyboard focus reaches Post. Longer localized labels
retain the existing intrinsic width and horizontal overflow path; no stage is
hidden, truncated, reordered, or replaced.

The stage value, click callbacks, Tab order, five-agent team, 1–10 episode
state, media previews, generation services, Skill selection, Runtime,
persistence, and Classic presentation are unchanged. The real desktop
contract now asserts both the first and final stage rectangles, zero residual
stage scroll for the compressed Chinese fixture, and the existing focus and
overflow boundaries. Short-drama focused tests pass 49/49 and the serial
desktop contract passes 2/2. Refreshed dark 720px full and local screenshots
show all five stage labels, the complete Post focus ring, and the full episode
rail; independent visual review reports P0/P1/P2/P3 = 0.

### Slice 28: Compact composer presentation

The Flow Chat composer follow-up is a Minimal-only presentation projection.
`ChatInput`, `RichTextInput`, `FileMentionPicker`, and the workspace strip keep
their existing callbacks, upload/image invocation, mentions, model selection,
permission controls, queueing, retry, boost, and send state. The projection
only changes their visual hierarchy: a compact input row sits above a restrained
action row, attachment chips use workspace tokens, secondary controls remain
quiet until hover/focus, and Send stays the sole primary action.

The four Minimal composer stylesheets are imported through
`minimalWorkspacePresentation.scss`; they contain no raw colors, variable
fallbacks, gradients, or runtime state decisions. Classic continues to use the
original composer presentation. Icon-only Send, Retry, and Boost variants now
have explicit accessible names, and the legacy focus fallback references the
existing `--color-accent-600` token instead of an undefined alias.

### Slice 29: Multiline evidence and test-driver boundary

The multiline investigation confirmed that the product editor already
serializes real `<br>` nodes to newline characters. The embedded desktop
WebDriver delivered correct Shift+Enter keyboard events but did not apply the
browser-default `contenteditable` DOM mutation. The production component was
therefore left unchanged.

The E2E page object still dispatches real Shift+Enter first. Only when the
driver leaves the DOM unchanged does the test adapter insert the browser-
equivalent `<br>` and emit `insertLineBreak`. The desktop contract then requires
two Shift+Enter events, three exact `innerText` lines, three distinct rendered
line positions, `white-space: pre-wrap`, and an expanded composer screenshot.
This compensation belongs exclusively to the test driver and must never be
copied into Runtime, Store, service, hook, or product UI code.

The focused component/layout suite passes 17/17, Node performance and layout
contracts pass 39/39, TypeScript passes, and the strict multiline desktop case
passes 1/1. The manifest production build transforms 7,456 modules in 32.55
seconds and passes the entry budget at 2,336,905 / 2,337,259 raw JavaScript
bytes and 633,308 / 633,915 raw CSS bytes. All 54 required dynamic entries
remain dynamic and static-graph unresolved imports remain zero. JavaScript
gzip `+1,912` and CSS gzip `+993` remain monitored warnings rather than
no-regression claims. Independent visual review reports P0/P1/P2/P3 = 0; the
desktop test-only previous-session toast is cleanup noise, not product
presentation evidence.

### Slice 30: Compact user-message presentation

User messages now have a Minimal-only presentation projection in
`UserMessage.minimal.scss`. Short text uses content width, long text is capped
at 620px, all successful messages align to the same readable right edge, and
image attachments remain inside the same low-noise surface. Classic continues
to use the existing presentation. Message content, expansion, edit, copy,
rollback, steering, image-source resolution, lightbox lifecycle, Runtime,
Store, and service callbacks are unchanged.

The existing image thumbnail is now a native button and the icon-only message
actions expose accessible names through their existing localized text. The
preview overlay has dialog semantics. On wide layouts, actions remain outside
the bubble on its left; at the narrow breakpoint they move below the bubble.
Only while the disclosure is visible does the message reserve the required
30px, so keyboard focus cannot cover or reflow the following message while the
idle conversation remains compact. The stylesheet consumes workspace tokens
only and adds no raw colors, fallback variables, gradients, shadows, or
business-state inference.

The focused component and presentation suite passes 13/13 and Web TypeScript
and Sass compilation pass. The serial real-desktop contract mounts the real
message component with short, multiline, and image variants and passes 3/3.
It verifies accessible image naming, common right-edge alignment, unchanged
bubble width when actions appear, 720px containment, and a measured 6.7px
minimum gap between the focused disclosure and the next message. Independent
visual review found one narrow-layout P2 overlap in the first evidence set;
the reserved disclosure space removes it in the refreshed screenshot.

The manifest production build transforms 7,456 modules and passes at
2,337,225 / 2,337,259 raw JavaScript bytes and 633,308 / 633,915 raw CSS
bytes. All 54 required dynamic entries remain dynamic and static-graph
unresolved imports remain zero. JavaScript gzip `+1,955` and CSS gzip `+993`
remain monitored warnings. Theme color and visual governance pass with zero
undefined variables, i18n contract tests pass 15/15, and all protected hashes
remain unchanged.

### Slice 31: Shared tool-card shell projection

Ordinary Base, Compact, and Default tool cards now receive a Minimal-only
shared presentation projection inside `.virtual-message-list`. Completed and
running compact rows remain transparent and dense; expanded, confirmation,
and error cards use flat workspace-token surfaces with restrained borders.
The projection removes inherited blur, layered shadow, header highlight
gradient, hover scaling, confirmation pulse, and broad `transition: all`
behavior without changing status classes, header content, confirmation
actions, error content, or `SmoothHeightCollapse`.

The selector boundary explicitly excludes `.task-tool-display` and
`.media-generation-card`. Short-drama cards remain outside this projection by
their existing structural boundary. The slice does not edit Base/Compact/
Default component code, state, callbacks, Runtime, Store, media services,
short-drama services, or subagent lifecycle. The existing Base-card keyboard
semantics follow-up remains a separate interaction slice and is not hidden by
this visual change.

The source contract rejects raw colors, variable fallbacks, gradients,
`transition: all`, and infinite animation in the new stylesheet. Focused
presentation tests pass 8/8, Web TypeScript and Sass compilation pass, and the
serial real-desktop contract passes 4/4. It mounts the real shared components,
proves completed/running/expanded/confirmation/error states, clicks the actual
expand-collapse path, checks task/media exclusions, restores the original
theme, and records light, dark, and 720px screenshots without opening a second
desktop window.

### Slice 32: Shared tool-card keyboard semantics

Base and Compact roots remain ordinary presentation containers. A genuinely
interactive built-in header receives one independent native activation button,
kept as a sibling of real header actions so nested controls remain separately
discoverable. The existing mouse selection and nested-control guards remain
the single pointer boundary. Expanded Compact cards delegate to Base without
retaining a second interactive shell, so they cannot expose ghost focus or
duplicate activation semantics.

`aria-expanded` is limited to cards that own inline expandable content.
Open-right/navigation cards omit it. Loading shimmer classification is shared
against the authoritative 11-state `ToolCardStatus` union. Classic and Minimal
both use their existing focus-ring tokens; the Minimal projection only
overrides the ring color within its existing shared-shell selector boundary.
No Runtime, Store, persistence, media, short-drama, subagent, or service
contract changed.

Focused keyboard tests pass 7/7, Web TypeScript and Sass compilation pass, and
the serial real-desktop contract passes 5/5. The desktop contract verifies
trusted Enter/Space key delivery, pointer activation counts, nested-control
isolation, open-right ARIA omission, and visible tokenized focus rings in light
and dark themes. The embedded driver delivers keydown/keyup to the focused
native button but does not synthesize the browser's default click, so the test
records that boundary and uses a pointer click for exact callback evidence; no
product keydown workaround was added. Evidence is stored as
`.codex-artifacts/minimal-workspace/slice32-minimal-tool-card-keyboard-focus-*.png`.

The manifest production build transforms 7,456 modules and passes the unchanged
entry limits at 2,337,258 / 2,337,259 raw JavaScript bytes and 633,567 /
633,915 raw CSS bytes. All 54 required dynamic entries remain dynamic and
static-graph unresolved imports remain zero. JavaScript gzip `+2,067` and CSS
gzip `+1,019` remain monitored warnings. The one-byte JavaScript headroom is an
explicit follow-up risk; no budget threshold was raised.

### Slice 33: Explicit Compact header affordance

Compact's built-in header now defaults to the inline `expand` contract whenever
the card is interactive. It no longer guesses navigation from the absence of
`expandedContent`; callers that open another surface must declare
`affordanceKind="open-panel-right"`. Explicit header props retain priority and
custom headers remain untouched. `ReadFileDisplay` declares the open-right
contract because its completed action opens the editor, while Git and Terminal
retain the default inline-expand contract.

The focused component suite passes 12/12. It proves a no-content Compact card
still exposes `Expand details` with `aria-expanded="false"`, ReadFile exposes
exactly one open-right activation and calls `onOpenInEditor` once, Git changes
from Expand to Collapse after real activation, pending ReadFile permission
actions receive no generic activation button, and Terminal does not request
open-right behavior. Web TypeScript and Compact Sass compilation pass.

The serial desktop contract passes 5/5 in one window. Its real no-content
Compact fixture would fail under the removed inference, and the explicit
open-right fixture omits `aria-expanded`. Light and dark screenshots refresh
the existing Slice 32 evidence paths. The 7,455-module manifest build passes
the unchanged budget at 2,337,223 / 2,337,259 raw JavaScript bytes and 633,862 /
633,915 raw CSS bytes. JavaScript gzip is 682,047 (`+2,005` monitored warning)
and CSS gzip is 89,626 (`+1,108` monitored warning); all 54 required dynamic
entries remain dynamic and unresolved static imports remain zero.

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
| `src/web-ui/public/version.json` | `218c94d28cc41d11c971bc19b59a62af98e8e6e4288e18612b84ab05f9ee927c` |
| `src/web-ui/src/generated/version-injection.html` | `0ff5537ab472d6db0db213ee0bcffcfcb86066be7cc6009929f2f004f559491e` |
| `src/web-ui/src/generated/version.ts` | `e4f464672cc5caac313d1df16c50fae9e7986ace9d490610d48aa94bd62146a1` |

## Commit and Review Policy

- one coherent commit per migration boundary;
- protected files remain unstaged;
- no unrelated refactor;
- no legacy deletion in the same commit that first introduces its replacement;
- each commit records the focused verification used;
- if a visual requirement requires runtime or persistence changes, stop the
  slice and open a separate architecture decision instead of crossing the
  boundary silently.

### Slice 36: Minimal shadow ownership

Minimal elevation is now owned by the shared `--workspace-shadow-*` theme
contract instead of local color formulas. Media refinement and Flow Chat
header panels consume `--workspace-shadow-raised`; media-card selection keeps
its accent border and uses an inset semantic ring so selection does not alter
layout geometry. A recursive presentation test rejects new hand-authored
Minimal elevation and non-semantic shadow colors.

This slice changes presentation SCSS, its contract tests, and migration
evidence only. Runtime, session state, media routing, short-drama workflows,
stores, services, and generated files remain outside the boundary. Independent
focused tests, theme gates, production build, and the Slice 37 real-component
light/dark desktop evidence now verify the shared elevation and selected-card
contracts.

### Slice 37: Responsive media and elevation evidence

The media desktop contract now evaluates toolbar density against the real
gallery container instead of assuming every desktop window owns a wide
single-row toolbar. Galleries wider than 460 pixels must retain the compact
single-row geometry; galleries at or below that boundary must use the
intentional two-row geometry. Both branches independently prove row placement,
bounded heights, containment, and zero horizontal overflow, so the contract
cannot pass by merely increasing a height ceiling.

A separate desktop fixture mounts the real `WorkspaceMediaGallery` with a
deterministic in-memory `WorkspaceMediaLibraryService`, and mounts the real
`FlowChatHeader` through its exported workspace and presentation contexts. It
uses the components' native selection and menu controls to verify selected-card
ARIA/state geometry, the semantic accent ring, the selection bar, shared raised
elevation, menu roles, focus movement, Escape closure, and trigger-focus
restoration in light and dark themes. The fixture does not call generation,
model, Runtime, filesystem, persistence, or media transport behavior, and
unmounts the real components before restoring the app root, theme selection,
theme attributes, color scheme, URL, and window size.

Slice 37 changes only the desktop contract and migration evidence. Production
components and styles remain unchanged. Independent verification passed the
serial desktop contract (`5/5`), four real-component light/dark screenshots,
focused tests (`14/14`), Sass and TypeScript checks, theme visual governance
(`8/8`), the production build (`7,456` modules), Monaco asset validation, and
the strict performance budget. The final manifest contains 55 required dynamic
entries and zero unresolved imports; protected source hashes and the single
Vite development process were restored after verification. The screenshots
identified one non-blocking P2 follow-up: Flow Chat menu keyboard focus needed
a stronger presentation-only indicator. Slice 38 now implements and verifies
that indicator without changing menu behavior.

### Slice 38: Flow Chat menu focus visibility

Minimal Flow Chat menu items now render programmatically moved DOM focus with a
two-pixel `--workspace-focus-ring` inset outline, primary text, and the shared
hover surface. The selector applies only to focused, enabled menu items;
disabled items remain unchanged, while the header message and icon controls
retain their existing `:focus-visible` contract.

The real-component desktop fixture records `:focus-visible` only as a
diagnostic because embedded WebView modality is not deterministic. Its required
evidence instead proves ArrowDown lands on the Search action, the item matches
`:focus`, computed outline and background equal token probes, the focused
rectangle remains inside the menu, and Escape restores the trigger. Independent
desktop verification passes `5/5`; both light/dark focus captures show a
complete high-contrast two-pixel ring with P0-P3 equal to zero. Focused tests
pass `37/37`, theme visual governance passes `8/8`, and the production build
retains 55 dynamic entries, zero unresolved imports, and the strict JavaScript
and CSS budgets.

### Feature semantic typography boundary

Short Drama and Workspace Media own their Classic computed type scales as
feature-local semantic custom properties. Presentation consumers reference
only the feature vocabulary (`ui-micro`, `ui-meta`, `ui-label`, `ui-control`,
`ui-body`, content-editor roles, and glyph roles); they do not embed numeric
font sizes or consume workspace size tokens directly.

Minimal presentation remaps that vocabulary once at each feature root. The
legacy 10px micro role deliberately maps to the readable 11px workspace meta
role, while editor title/body content and icon-like text glyphs stay separate
from ordinary UI copy. In particular, disclosure and preview glyphs retain
their fixed geometry and one-line leading, and ProseMirror title/body text maps
to workspace title/body roles without changing the editor or workflow
implementation.

The static feature typography gate is intentionally limited to the four Short
Drama and Workspace Media presentation stylesheets. It rejects raw
`font-size: Npx` consumers, direct Minimal workspace-role bypasses, and unknown
feature token references. Classic token values and the ordered consumer role
maps are locked by feature tests, so a value change or semantic reassignment is
an explicit review decision rather than incidental cascade drift.

### Slice 39: Shared Gallery Minimal projection

Agents, Nursery customization, and Mini Apps now share one Minimal-only Gallery
projection loaded by the presentation aggregator. It applies the workspace
typography, compact spacing, flat semantic surfaces, 28px interaction targets,
a single focus ring, and short color/surface transitions while retaining the
existing sticky header and anchor geometry. Partial class consumers in Skills,
Insights, template configuration, and Portal surfaces stay outside the scoped
projection. Reduced motion disables scoped transitions, skeleton shimmer,
spinner, and item entrance.

The slice changes no Gallery React component, Classic stylesheet, Store, API,
Runtime, session, media, or subagent behavior. A source contract locks the
Minimal scope and import path, Classic hashes, token ownership, prohibited
effects, focus treatment, and reduced-motion behavior.

### Slice 40: Compact Gallery card projection

The shared Minimal Gallery projection now normalizes the feature-owned Agent,
Core Agent, Agent Team, Assistant, and Mini App cards without replacing their
React implementations. Cards use a responsive 288px grid floor, compact
workspace typography, flat semantic surfaces, one focus ring, and short
color/surface feedback. Fixed 360px widths, decorative hover lift, bounce,
staggered entrance, blur, glow, and gradient overlays remain available only in
Classic. Mini App run/customize dots retain their semantic status while losing
the continuous pulse and glow.

Nursery's template entry follows the same projection as a compact, flat
workspace action. Its brand mark is reduced on wide layouts and omitted at
narrow widths; decorative egg artwork is removed from Minimal presentation.
The projection is scoped below `.void-ui--minimal .gallery-layout`, so feature
detail modals, Review Team summaries, partial class consumers, and Classic
presentation do not inherit it. Feature state, click handlers, routing, data
loading, Runtime, media, sessions, and subagents remain unchanged.

### Slice 41: Skills workspace projection

Installed Skills, the fixed Skill suite, and Skill Market now share one
Minimal-only workspace projection. The scene uses the compact workspace
typography, a quiet top bar, a 176px category rail, 28px controls, responsive
260px card floors, and a common 136px card geometry. Duplicate category
headings and the persistent explanatory footer are omitted from Minimal while
the category labels, counts, search, filters, status badges, paths, details,
install, delete, refresh, pagination, and suite policy controls remain
available in their existing DOM and interaction paths.

Market and suite hero treatments are reduced to flat command surfaces.
Decorative gradients, blur, shadows, hover lift, scale, icon pop, staggered
entrance, and continuous loading rotation are removed from the Minimal
projection. Short surface/color feedback, a single inset focus ring, semantic
success/info/error states, narrow-layout category scrolling, and reduced-motion
coverage remain explicit.

The projection is loaded once by the feature-owned `SkillsScene.scss`, so the
lazy Skills route owns its CSS chunk and the startup Minimal aggregator does
not absorb page-only styles. The include adds only selectors scoped below
`.void-ui--minimal`; all pre-existing Classic rules remain byte-equivalent
after removing the two projection wiring lines. The slice changes no Skills
React component, hook, Store, workspace API, filesystem adapter,
install/delete behavior, or runtime policy. A source contract locks those
boundaries by hash and verifies scope, geometry, token ownership, prohibited
effects, focus treatment, reduced motion, and lazy CSS ownership.

The dedicated production artifact passes the web performance budget with
2,335,679 raw JavaScript bytes, 632,617 raw CSS bytes, all 54 required dynamic
entries present, and zero unresolved static imports. Gzip monitor references
remain non-blocking at +1,715 JavaScript bytes and +492 CSS bytes. The budget
ledger no longer requires the deleted `SessionModeMenu.tsx`; its replacement
is a statically imported launcher and therefore must not be presented as a
required dynamic boundary.

### Slice 42: Assistant gallery and detail projection

The Assistant gallery and Assistant detail page now use a feature-owned,
Minimal-only presentation projection. The gallery removes the duplicate brand
illustration, constrains the incubation template to a compact 720px command
card, and keeps all template statistics and configuration actions available.
Assistant instance cards continue to use the shared gallery card contract.

The detail page uses the workspace typography scale, compact gutters, a
single-border composer focus treatment, shorter document rows, and an
intrinsic-height information panel instead of a full-height empty frame. At
narrow widths the two columns become one scrollable flow without removing the
conversation list, document editor, or Automation handoff. Simplified Chinese,
Traditional Chinese, and English now provide the Assistant quick-message
placeholder and keyboard hint, removing the English fallback from Chinese UI.

The projection is loaded by the lazy `NurseryView.scss` owner and changes no
React component, Workspace state, Flow Chat sender, session creation, deletion,
persona document adapter, or Automation route. A source contract locks those
behavior owners by hash and verifies scoping, geometry, typography, focus,
localization, reduced motion, and the absence of gradients, blur, shadows,
stagger, lift, and scale.

The dedicated production artifact keeps the Nursery marker exclusively in the
dynamic `ProfileScene` CSS chunk, not the entry stylesheet. The performance
budget passes with 2,335,875 raw JavaScript bytes, 632,617 raw CSS bytes, all
54 required dynamic entries, and zero unresolved static imports. The monitored
gzip deltas remain non-blocking at +1,830 JavaScript bytes and +492 CSS bytes.

### Slice 43: Theme governance reconciliation

The full frontend suite exposed four stale presentation contracts from earlier
theme slices. The Skills dirty state now uses its semantic border without an
unapproved inset shadow. Account heatmap month labels use the shared 2xs type
token instead of a literal 10px value. The typography ledger removes the
already-retired literal monospace declaration from the session usage card.
The short-drama recovery integration mock now follows the shared BTW controls
container interface and verifies the rail mode on the owning EditorArea
projection instead of expecting a removed `mode` prop.

These corrections change no Account data, heatmap calculation, short-drama
recovery behavior, session lifecycle, or BTW controls. They reconcile
governance and integration tests with the current module interfaces and reduce
theme debt rather than raising a test baseline.

### Slice 44: Agents workspace and shared detail projection

The Agents workspace now has a feature-owned, Minimal-only projection. Its
title, short zone anchors, and icon-first search share one 52px header row;
search expands in place without reserving a permanent text field. Agent cards
use a 252px responsive floor, a fixed 120px geometry, one-line descriptions,
flat semantic surfaces, one focus ring, and color/surface-only feedback. This
produces two columns in the verified 1280-by-900 desktop window and five
columns in the maximized desktop window while retaining all counts, filters,
details, team configuration, creation, and management controls. Long zones use
`content-visibility: auto` with an intrinsic-size fallback so off-screen card
groups do not require immediate paint.

The existing Gallery detail component also receives one shared Minimal
projection for its Agents, Skills, and Mini Apps owners. It keeps the same
React component and event handlers while using the workspace type scale,
compact capability bars and segmented tabs, neutral chips, a 560px width, a
720px height ceiling, and a thin independent content scrollbar. The projection
is selected from the modal content class through the Minimal root, so Classic
and unrelated dialogs do not inherit it. Reduced motion disables the scoped
transitions. Runtime agent identities remain unchanged; only Simplified and
Traditional Chinese presentation labels and search copy are shortened.

This slice changes no Agents hook, Agent/Subagent API, Skill policy, Gallery
React implementation, session state, media or short-drama routing, Runtime,
filesystem adapter, persistence, or creation/deletion behavior. Source
contracts lock those owners by hash and verify Minimal scoping, responsive
geometry, token ownership, one-ring focus, containment, prohibited decorative
effects, reduced motion, localization, and shared-modal ownership.

Real desktop verification covered the maximized and 1280-by-900 layouts,
in-place search focus and text entry, detail opening, capability-tab switching,
long Skill-list scrolling, Escape closure, and responsive card reflow. The
frontend suite passes 399 files and 2,284 tests; TypeScript, repository hygiene,
core boundaries, theme colors, theme visual governance, and the 15-test i18n
contract pass. The dedicated production artifact transforms 7,468 modules and
passes the performance budget with 2,335,875 raw JavaScript bytes, 632,617 raw
CSS bytes, all 54 required dynamic entries, and zero unresolved imports. Gzip
monitor deltas remain non-blocking at +1,824 JavaScript bytes and +492 CSS
bytes.

### Slice 45: Automation workspace polish

The existing Automation Minimal projection now removes the page-local title
that duplicated the active desktop tab while retaining the semantic heading in
the DOM. Empty weekday counters are omitted and non-empty counters keep their
numeric projection, reducing repeated copy without changing task filtering or
calendar calculation. The week, day, month, and list controls remain in one
compact command row with the existing progressively disclosed filters.

The create-task surface is now a flat, workspace-scoped sheet. It uses compact
30px fields, a 72px prompt editor, 28px segmented choices and actions, explicit
single-layer active states, one subtle focus ring, a bounded internal
scrollbar, and no entrance animation, backdrop blur, or decorative shadow.
Secondary execution-mode and schedule explanations are omitted in Minimal;
the labels, icons, accessible roles, workspace-required error, and creation
validation remain available.

Real 1280-by-900 verification exposed an existing coordinate-system defect:
the viewport-centered fixed overlay could extend behind the navigation panel
and then be clipped by the Automation scene's overflow boundary. Minimal now
establishes the scene as the overlay containing block and positions the overlay
absolutely inside that workspace. The dialog is centered and bounded against
the real Automation area at both verified window sizes, while the navigation
and desktop title bar remain outside its scrim.

This slice changes only `AutomationScene.minimal.scss`, its visual contract,
and migration evidence. It does not change `AutomationScene.tsx`,
`AutomationHeader.tsx`, `CreateTaskDialog.tsx`, the Automation context, Flow
Chat state projection, cron adapters, session creation, task scheduling,
filtering, persistence, or Runtime. Manual interaction covered week/list view
switching, filter disclosure and Escape closure, dialog open/close, execution
mode selection, schedule selection, and responsive reflow. All 11 Automation
test files and 44 tests pass, along with TypeScript, theme colors, theme visual
governance, repository hygiene, and core boundaries.

The production artifact transforms 7,468 modules and passes the frozen
performance budget with 2,335,875 raw JavaScript bytes, 632,617 raw CSS bytes,
all 54 required dynamic entries, and zero unresolved imports. Gzip monitor
deltas remain non-blocking at +1,821 JavaScript bytes and +492 CSS bytes; the
Automation presentation remains in its lazy feature chunk.

### Slice 46: Mini App gallery projection

The Mini App gallery now owns a feature-local Minimal projection instead of
adding more selectors to the global entry stylesheet. Its page header uses the
same 52px command-row rhythm as the Agents workspace: the descriptive subtitle
is omitted in Minimal, search rests as one icon and expands in place on focus,
and folder import remains a separate 28px icon action with its existing
accessible title. Search state and filtering remain owned by
`MiniAppGalleryView`; the projection changes only how those controls consume
space.

An empty running-app zone now collapses into one line rather than reserving a
large blank section. Category controls stay horizontally reachable without
wrapping the zone header, and the known catalog identities `design`,
`developer`, `game`, and `lifestyle` receive localized presentation labels in
Simplified Chinese, Traditional Chinese, and English. The stored category
identities and filter comparisons are unchanged, and unknown future
categories continue to display their original value.

Mini App cards use a 252px responsive floor and a bounded 132px geometry.
Descriptions and the overview tag row are deliberately single-line and
truncated in the card, while all description and tag content remains available
through the existing shared detail dialog. Hover, active, and keyboard focus
feedback is flat and tokenized, with no lift, stagger, gradient, blur, or
decorative shadow. Off-screen zones retain `content-visibility` and an
intrinsic-size fallback. Reduced-motion mode removes the remaining scoped
search transitions.

This slice changes no Mini App store, worker API, bridge, import adapter,
permission handling, runner, customization session, preview, apply, rollback,
or delete behavior. Manual desktop verification covered maximized and
1280-by-900 layouts, search expansion and live filtering, category filtering,
detail opening, and Escape closure. The full frontend suite passes 400 files
and 2,292 tests; TypeScript, theme colors, theme visual governance, repository
hygiene, core boundaries, and the 15-test i18n contract also pass.

The broader `i18n:audit` remains blocked by an unrelated pre-existing mismatch:
31 hardcoded CJK candidates are currently reported in short-drama service
sources against the checked-in baseline of 25. This Mini App slice adds no CJK
source candidate and does not raise that budget. The production artifact
transforms 7,468 modules and passes the frozen performance budget with
2,335,875 raw JavaScript bytes, 632,617 raw CSS bytes, all 54 required dynamic
entries, and zero unresolved imports. Gzip monitor deltas remain non-blocking
at +1,804 JavaScript bytes and +492 CSS bytes, and the Mini App presentation
stays in the lazy `MiniAppGalleryView` feature chunk.

### Slice 47: Settings shell and shared scene titles

The Settings shell and its Account, Basics, Appearance, Models, archive,
shortcut, personalization, permission, quick-action, review, MCP, ACP, and
editor destinations were re-audited before making another visual projection.
The existing shell already follows the Minimal workspace scale, compact
navigation rhythm, bounded content width, semantic surfaces, and responsive
scroll ownership. Real maximized and 1280-by-900 desktop checks therefore
retain those components instead of adding duplicate selectors or presentation
layers.

The audit did expose one shared-shell inconsistency: several built-in scene
definitions still rendered their English fallback labels in Chinese
interfaces. Terminal, Git, Settings, File Viewer, and Profile now route their
titles through the existing `common.scenes` translation keys. `SceneBar`
remains the only presentation owner, and a locale contract verifies that all
five mappings are present in Simplified Chinese, Traditional Chinese, and
English.

This slice changes no Settings state, config adapter, account or authentication
state, model provider data, scene opening, closing, pinning, eviction, active
tab selection, navigation history, Runtime, persistence, or filesystem access.
Manual verification covered a maximized Appearance panel, a 1280-by-900 Models
panel, the shared More-menu route into Settings, responsive navigation
scrolling, and the localized `设置 / 外观` and `设置 / 模型` scene paths.
The focused registry contract passes four tests, and TypeScript, repository
hygiene, core boundaries, theme colors, theme visual governance, and the
15-test i18n contract all pass. The dedicated production artifact transforms
7,468 modules and passes the frozen performance budget with 2,336,013 raw
JavaScript bytes, 632,617 raw CSS bytes, all 54 required dynamic entries, and
zero unresolved imports. Gzip monitor deltas remain non-blocking at +1,838
JavaScript bytes and +492 CSS bytes.

### Slice 48: Insights workspace projection

The Insights list now owns a feature-local Minimal projection. The active
desktop tab remains the visible page identity while the duplicate in-page
heading stays available to assistive technology. Range choices and the single
Generate action share one 52px command row; the range strip remains
horizontally reachable at narrow widths instead of wrapping into a second
toolbar. The report-history zone follows immediately below with a compact
label and a small graphical empty state.

Existing reports are presented as flat rows in Minimal. Decorative lift,
shadow, persistent `will-change`, and page-entry animation are removed. Long
report lists use `content-visibility`, layout/paint containment, and an
intrinsic-size fallback. Report cards and conclusion surfaces keep semantic
borders and theme tokens without gradients or a second focus halo, and the
projection disables its remaining transitions for reduced-motion users.

This slice changes no `insightsStore`, report metadata, generation, cancellation,
loading, Tauri opener, notification, API adapter, report file, or retention
behavior. Manual desktop verification covered maximized and 1280-by-900
layouts plus a live 30-day-to-7-day range switch. The external Generate action
was deliberately not invoked during presentation verification, so no user
report or model usage was created.

The focused visual contract passes six tests, and TypeScript, repository
hygiene, core boundaries, theme colors, and theme visual governance pass. The
dedicated production artifact transforms 7,468 modules and passes the frozen
performance budget with 2,336,013 raw JavaScript bytes, 632,617 raw CSS bytes,
all 54 required dynamic entries, and zero unresolved imports. Gzip monitor
deltas remain non-blocking at +1,832 JavaScript bytes and +492 CSS bytes; the
Insights presentation remains in its lazy feature chunk.

### Slice 49: Git workspace projection and navigation restoration

The Git workspace now owns feature-local Minimal projections for its empty
repository state, working copy, scene navigation, branch history, and commit
graph. The commit composer uses the same compact two-row command geometry as
the rest of the workspace, and the projection targets the actual shared
textarea field rather than only its wrapper. Branch and commit rows are flat,
tokenized, and use `content-visibility` with intrinsic-size fallbacks. The
branch and graph toolbars preserve every existing operation while reducing
height, shadow, double focus feedback, and decorative motion.

Real desktop navigation testing also exposed a functional registry omission:
`GitNav` existed and `sceneStore` already requested a scene-specific navigation
surface, but the `git` entry was absent from `nav-registry.ts`. The registry now
returns the existing lazy `GitNav`, restoring direct access to Changes,
Branches, and Graph without adding a second route or changing Git state. A
focused registry contract prevents Settings, File Viewer, Shell, or Git
navigation from silently falling back to the main sidebar.

This slice changes no repository discovery, staging, commit, checkout, branch
creation or deletion, reset, push, pull, fetch, diff, history, filesystem,
notification, or persistence behavior. Manual verification covered the
repository working copy, a live filename filter, branch selection, the branch
history split view, graph navigation, and 1280-by-900 reflow. Destructive and
remote Git actions were deliberately not invoked.

The focused Git and navigation contracts pass 11 tests, and TypeScript,
repository hygiene, core boundaries, theme colors, and theme visual governance
pass. The dedicated production artifact transforms 7,470 modules and passes
the frozen performance budget with 2,336,228 raw JavaScript bytes, 632,617 raw
CSS bytes, all 54 required dynamic entries, and zero unresolved imports. Gzip
monitor deltas remain non-blocking at +1,927 JavaScript bytes and +492 CSS
bytes. Git remains a lazy scene chunk, and the temporary build artifact is
removed after verification.
