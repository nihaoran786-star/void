# Frontend Minimal Workspace Capability Parity

## Purpose

This checklist is the release gate for the minimal workspace. A minimal slice
cannot replace its classic counterpart until every applicable item is
automatically or manually verified.

Legend:

- `[x]` verified on the checkpoint baseline;
- `[ ]` must be verified on the minimal presentation;
- `N/A` requires a written reason and reviewer approval.

## Baseline Evidence

Checkpoint commit: `0db5e70a4`

Verified on 2026-07-17:

- [x] Web UI: 310 test files, 1767 tests passed.
- [x] Script contracts: 97 tests passed.
- [x] Web TypeScript check passed.
- [x] Web ESLint passed.
- [x] Theme color audit passed.
- [x] Theme visual contract covered 8/8 required surfaces.
- [x] i18n contract passed 15/15; audit passed with the existing warning budget.
- [x] Core boundary check passed.
- [x] Rust workspace `cargo check --workspace` passed.
- [x] Protected files matched their recorded SHA-256 hashes.

Slice 2 additive-presentation evidence on 2026-07-17:

- [x] Short-drama presentation lifecycle and media-layout tests passed.
- [x] Workspace media gallery behavior tests passed.
- [x] Media preview image, video, audio, close, and URL fallback tests passed.
- [x] Minimal Slice 2 source contracts passed: scoped styles, no runtime view
  fork, one overlay mount, token-only colors, and no decorative GPU effects.
- [x] Web TypeScript check, ESLint, theme checks, core boundary check, and Web
  production build passed.
- [x] Real desktop baseline screenshots captured script, assets, storyboard,
  media gallery, and media preview without sending AI requests or generating
  assets.
- [x] Real desktop post-change screenshots captured the same five surfaces,
  plus keyboard focus on a media card.
- [x] Dedicated visual specialist sign-off reported zero P0 regressions and
  verified narrow-container rendering without clipping or horizontal overflow.
- [x] Media preview autofocus, Tab/Shift+Tab focus trap, close, and trigger
  focus restoration are covered by a focused regression test.
- [x] Real desktop E2E switched through ScriptAI, AssetAI, SplitAI, VideoAI,
  and EditorAI using their native session tabs.
- [x] Real desktop E2E preserved episode 100 when switching from post to video
  and kept the 30px episode rail free of horizontal overflow.
- [x] Real desktop E2E verified the lightweight media overlay receives focus,
  remains independent from BrowserPanel, captures a screenshot, and closes.
- [x] Full Web suite passed: 313 test files, 1780 tests.
- [x] Script contracts passed: 121 tests.
- [x] TypeScript, ESLint, theme color/visual contracts, and core boundaries
  passed.
- [x] Manifest production build and entry performance Gate passed: entry JS
  2,371,464 / 2,372,359 bytes (gzip 691,043); entry CSS
  665,090 / 672,720 bytes (gzip 94,272).
- [x] Slice 3 real-desktop E2E passed 2/2: the fixed five-agent rail measured
  44px collapsed and 298.5px open, while media preview and episode 10/100
  navigation remained functional.
- [x] Slice 3 screenshots captured the collapsed rail, open native session
  panel, and media preview; the dedicated visual specialist reported no P0/P1
  issue, clipping, or horizontal overflow.
- [x] Classic and minimal desktop L0 smoke each passed 9/9 with one controlled
  application window and no browser JavaScript error.
- [x] The full short-drama desktop fixture passed 2/2 in both classic and
  minimal presentations. Classic mode kept the native secondary agent panel
  visible and active; minimal mode kept the 44px/300px projection.
- [x] Minimal presentation restored native Tab traversal, and a single-window
  real-desktop short-drama run verified focus advances between adjacent team
  agent controls. Classic presentation and Monaco/xterm exceptions retain
  their existing keyboard policy.
- [x] Desktop `release-fast` Rust check passed for `void-desktop`.
- [x] Current-branch Vite watcher recheck returned HTTP 200 and, after a
  30-second dependency-prebundle stabilization window, recorded 0.000 seconds
  CPU time across the Vite/esbuild process tree during an 8-second sample
  (0% single-core CPU, 394.7 MB working set, no new process). The isolated
  diagnostic process tree stopped cleanly and released its port.
- [x] Minimal desktop settings L0 passed 5/5 and captured workspace, menu, and
  settings-scene screenshots without changing configuration; the settings
  scene remained responsive with 864 rendered elements.
- [x] Dedicated visual review of the settings path reported no P0/P1 issue,
  clipping, or horizontal overflow. The footer entry already has localized
  Tooltip/ARIA text, expanded state, and visible focus styling.
- [x] Focused no-side-effect module contracts passed: workspace media 4 files /
  65 tests; short-drama identity, recovery, and runtime state 9 files / 116
  tests; subagent Skill UI and bounded conversation rendering 5 files / 55
  tests; fixed short-drama Rust Skill policy 3/3 tests.
- [x] Minimal desktop narrow-window visual L0 passed 2/2. At an outer
  1024x720 window (668x472 WebView under system scaling), the 240px navigation,
  main workspace, and footer actions remained inside the viewport with no
  document-level horizontal overflow. Dedicated visual review found no P0/P1.
- [x] Desktop zoom is connected through an isolated Tauri WebView adapter and
  the existing `app.zoom_level` preference. Real desktop L0 passed 3/3 at
  100%, 125%, 150%, and 200%; the viewport narrowed from 1707 to 853 CSS px
  without document-level horizontal overflow or loss of critical shell
  actions, then restored the original preference. Dedicated visual review
  found no P0/P1.
- [x] The desktop E2E launcher now owns the application process behind an
  atomic cross-process lock, waits for the exact child PID to exit, and releases
  the lock only after cleanup. Parallel test commands fail before application
  startup instead of opening overlapping windows.
- [x] Development-origin zoom permission is limited to the `main` window,
  fixed local port 1422, and `core:webview:allow-set-webview-zoom`; no file,
  configuration, process, or general default capability is exposed remotely.
- [x] Zoom controller tests passed 5/5; Web TypeScript, ESLint, desktop Rust
  build, and the production performance Gate passed. Entry JS remained within
  budget at 2,371,672 / 2,372,359 bytes; all 47 required dynamic entries were
  preserved with zero unresolved static-graph imports.
- [x] Actionable global notifications remain inside the content edge at compact
  and zoomed desktop widths. Real 100%, 125%, 150%, and 200% captures kept the
  320px crash-recovery notice to the right of the 248px navigation edge, with
  both actions visible and no document-level horizontal overflow. The
  theme-aware primary action measured 21:1 contrast and remained reachable by
  Shift+Tab. Focused layout tests passed and dedicated visual review found no
  P0/P1/P2.
- [x] The minimal navigation renders an empty workspace list as transparent,
  muted metadata rather than a selected row. A real 1804x1204 physical-pixel
  single-window capture preserved the compact indent and row height with no
  clipping or overflow; dedicated visual review found no P0/P1/P2.
- [x] The navigation sections rail can shrink inside a 1024x720 outer window
  and owns vertical scrolling between fixed top and bottom controls. Desktop L0
  scrolled a real workspace card into view, captured the reachable workspace
  and session content, and restored scroll position. The full visual suite
  passed 3/3; dedicated review closed the prior narrow-window discoverability
  P2 and reported P0/P1/P2 all zero.
- [x] Final manifest production build and performance Gate passed at
  2,371,672 / 2,372,359 raw entry JS bytes and 666,125 / 672,720 raw entry CSS
  bytes. All 47 required dynamic entries remained dynamic with zero unresolved
  static-graph imports. JS gzip was 437 bytes above its reference warning line
  but raw hard limits passed; entry CSS gzip stayed 1,015 bytes below reference.
- [x] The recorded release-blocking subset passed and minimal became the
  verified default. Remaining unchecked items below are follow-up parity debt;
  they still require verification before deleting or replacing the
  corresponding classic capability.

## Application Shell and Navigation

- [x] Launch desktop application to a usable shell.
- [x] Open an existing project.
- [ ] Create a new project.
- [ ] Switch workspaces.
- [ ] Create and switch sessions.
- [ ] Restore historical sessions after restart.
- [x] Open the settings surface and keep the UI responsive.
- [ ] Open About, update, and workspace status surfaces.
- [ ] Preserve window close/save behavior.
- [ ] Preserve fullscreen and window-mode behavior.
- [ ] Preserve current scene/tab state.
- [ ] Navigate with keyboard only.
- [ ] Show visible focus for every interactive control.
- [x] Operate at narrow desktop width without losing critical actions.
- [x] Operate at 100%, 125%, 150%, and 200% zoom.
- [x] Minimal navigation keeps one 28px search icon in the session-launcher
  row; Classic keeps its labelled header trigger. Click and keyboard paths wait
  for the lazily loaded dialog, verify native input focus, close with Escape,
  and preserve one shared search implementation.
- [x] Minimal no longer mounts a redundant search text label or leading
  decorative icons for labelled top navigation rows. The localized search
  `aria-label`, tooltip, 28px focus target, text labels, Extensions
  `aria-expanded` state, and trailing chevron remain. Classic still mounts its
  visible search label and leading icons. Focused Vitest passed 13/13; one-worker
  desktop E2E passed 1/1 while retaining click, Mod+K, Alt+F, Escape, mode-menu,
  and Classic assertions. Evidence:
  `slice17-minimal-navigation-icon-only-light-wide.png` and
  `slice17-minimal-navigation-icon-only-dark-1024x720.png`.
- [x] Minimal navigation exposes one stable labelled create action, one 28px
  mode trigger, and one 28px search trigger instead of three persistent mode
  icons. The 168px lazy mode menu stays inside the navigation boundary,
  preserves `menuitemradio`, Arrow/Home/End/Escape/Tab behavior, and changes
  only the selected presentation mode. Classic retains its original three-mode
  selector and two-row create card.
- [x] Slice 19 Minimal navigation density keeps the create action text-only in
  the DOM, retains its mode-specific accessible name and create callback, and
  preserves all three Classic mode icons. Top actions remain 28px inside the
  240px rail with the footer reachable. Idle session mode icons are quiet while
  active, focused, hovered, and running states remain legible; attention and
  unread dots stay fully visible. This is a presentation-only CSS/launcher
  projection and does not change Sessions, Runtime, media, or short-drama data.
  The final single-window desktop run passes 6/6 and refreshes 25 wide/narrow,
  light/dark, focus, menu, and Classic-parity captures with visual
  P0/P1/P2 = 0. The production budget passes at 2,335,380 raw JavaScript bytes
  and 628,061 raw CSS bytes with 54 dynamic entries and 0 unresolved static
  imports; gzip reference deltas remain monitored warnings.
- [x] Minimal keeps only the labelled overflow and notification controls
  persistently visible in the footer. Shell, browser, and remote-connect remain
  reachable through the overflow menu and call their existing handlers;
  Classic retains its direct shell and browser buttons. The real desktop gate
  opens each path, restores URL/local-storage state, and records
  `slice7-minimal-footer-progressive-disclosure.png`.
- [x] Minimal settings pages share an 840px responsive content shell, sticky
  compact header, workspace typography/surface tokens, and symmetric
  floating-mini-chat clearance. Real desktop review covered MCP at wide width
  and Appearance at a 719x498 CSS-pixel viewport; header and content edges
  matched exactly, with zero document-level horizontal overflow. Classic
  settings markup and runtime behavior remain unchanged.
- [x] Minimal Skills removes the nested tab card and segmented capsule in
  favor of one 48px workspace header, narrows the category rail from 176px to
  152px, and progressively reveals file paths and secondary card actions.
  Installed and market cards retain pagination, detail, install, delete,
  filter, keyboard focus, and `content-visibility` behavior. Real desktop
  interaction covered installed/market switching, built-in/all filtering,
  card detail open/close, hover disclosure, and 719x498 narrow rendering with
  zero horizontal overflow. Three warm switch cycles remained within
  40.8–56.1ms over two animation frames.
- [x] Minimal Assistant and its retained editor share one bounded 1120px
  content axis instead of stretching cards and the editor across the full
  desktop canvas. The configuration module contracts from 112px to 96px at
  wide width, assistant cards from 132px to 116px, and long identity badges
  use a 24-character visual cap with a real ellipsis. Accent color is limited
  to the small identity target and primary marker; cards retain native
  identity data, keyboard focus, create-session/delete actions, and
  `content-visibility`. At the real 719x498 CSS-pixel viewport the configuration
  action becomes icon-only, the count remains on the section-heading row, and
  the editor stacks without horizontal overflow. Three warm Skills/Assistant
  switch cycles measured Assistant at 34.3–48.6ms over two animation frames;
  the surface retained 0 gradients, 0 backdrop filters, and the same 1,353 DOM
  elements as its measured baseline.
- [x] Minimal Professional Agents now uses the same bounded 1120px content
  axis, a flat divider header instead of a nested page card, four 274px columns
  at the 1707px CSS viewport, and 112px list cards. Core identity color is
  limited to the 28px icon target; capability data, filters, native detail
  modal, keyboard roles, and create actions remain unchanged. Real desktop
  verification covered the 1707x912 and 719x498 CSS-pixel viewports with zero
  document overflow, opened and closed a real core-agent detail modal, and
  expanded the search control from 28px to 240px. Three warm
  Assistant/Professional Agents switch cycles settled within 46.6–56.6ms over
  two animation frames after the initial lazy load. All three page zones retain
  `content-visibility: auto`; the rendered surface uses zero gradients and zero
  CSS/backdrop filters.

## Composer and Conversation

- [ ] Type and send a normal message.
- [ ] Stop an active turn.
- [ ] Retry or continue a failed/interrupted turn.
- [ ] Create Code, Cowork, Media, and agentic sessions.
- [ ] Select model and reasoning/effort options.
- [ ] Select modes and allowed Skills.
- [x] Preserve fixed short-drama subagent Skill isolation.
- [ ] Preserve permission/access controls.
- [ ] Attach files and images.
- [ ] Drag and drop supported context.
- [ ] Paste text, images, and large content.
- [ ] Undo/remove attached images and context.
- [ ] Navigate input history.
- [ ] Use mentions and suggestion selection.
- [ ] Use slash commands.
- [ ] Load and invoke MCP prompt commands.
- [ ] Use compact/context-compression actions.
- [ ] Display token usage and context limit.
- [ ] Preserve workspace/repository strip behavior.
- [ ] Preserve IME composition for Chinese input.
- [ ] Preserve multiline editing and keyboard shortcuts.
- [ ] Preserve voice/microphone entry where supported.
- [ ] Render streaming, completed, empty, and error conversation states.
- [ ] Preserve markdown, code, tool cards, and media result rendering.
- [ ] Preserve multi-agent and floating/subdialog entry points.

## Short-Drama Workspace

- [x] Open the short-drama entry from the expected project context.
- [ ] Recover an existing short-drama project.
- [x] Create or hydrate stage-agent sessions.
- [x] Preserve `workspaceId`, `workspacePath`, `sessionId`,
  `parentSessionId`, and `agentRole`.
- [ ] Select and navigate script episodes.
- [ ] Display global and per-episode script content.
- [ ] Extract assets with AssetAI.
- [ ] Generate character boards using the fixed character-board Skill format.
- [ ] Generate character and scene images using the cinematic Skill.
- [ ] Generate storyboard images using existing storyboard logic and the
  cinematic Skill.
- [ ] Generate video through the existing VideoAI path.
- [ ] Open EditorAI/editing flow.
- [x] Open every stage agent in its real native session/tab.
- [ ] Show pending generation placeholders.
- [ ] Refresh when generation artifacts arrive.
- [ ] Select artifacts and connect them to the correct stage/episode.
- [ ] Preserve generation errors and recovery actions.
- [ ] Preserve empty, loading, ready, restricted, unsupported, and error states.
- [ ] Preserve stage completion/progress/status indicators.
- [x] Preserve long-project scrolling and episode synchronization.
- [x] Post-production ready and empty states use the flat Minimal hierarchy
  without removing native media playback, status, progress, or artifact
  references. Real-desktop evidence covers both states.
- [x] The 30px episode rail uses one visible two-pixel keyboard-focus indicator
  instead of stacking an outer and inset ring.

## Media Library and Preview

- [x] Present media and AI short drama as one text mode switcher in Media
  sessions.
- [x] Keep the AI short-drama mode absent from non-Media sessions through the
  explicit `isShortDramaMediaSession` capability boundary.
- [x] Scan and refresh workspace media.
- [x] Show pending generations.
- [ ] Filter by media type/status.
- [x] Search by supported text fields.
- [x] Sort by supported order.
- [x] Select one, many, and all visible items.
- [x] Preview images.
- [ ] Preview videos with poster/thumbnail fallback.
- [x] Resolve media URLs through the existing resolver.
- [x] Handle missing/failed previews.
- [x] Reference media back into chat/context.
- [x] Delete selected media.
- [x] Open trash.
- [x] Select trash items.
- [x] Restore trash items.
- [x] Permanently purge trash items.
- [x] Preserve path-mismatch and operation-error feedback.
- [ ] Preserve lazy loading, virtualization, and thumbnail efficiency.

## Subagent Team

- [x] Open and close the team drawer through the real desktop application.
- [x] Keep only one team expansion action in rail mode and one dedicated panel
  collapse action while open; no duplicated chevron/control.
- [x] Keep Mission Control, hidden tabs, and close-all inside one consistently
  behaving ellipsis menu; the trigger never changes behavior with tab count.
- [ ] Keep the drawer collapsed by default without hiding active failure state.
- [x] Keep the drawer collapsed by default without reserving permanent canvas
  width; one compact on-demand control remains reachable.
- [x] Show each fixed short-drama agent by role.
- [ ] Show live, waiting, completed, cancelled, and failed status.
- [ ] Show current action without exposing unnecessary internal noise.
- [ ] Open detailed output/logs on demand.
- [x] Navigate to the real agent session.
- [x] Keep the native `EditorGroup`, five role sessions, and generic tab bar
  mounted while the Minimal short-drama selector owns visible role switching.
  Classic and non-short-drama groups retain unchanged generic tab management.
- [x] Preserve parent/child session relationships.
- [x] Preserve workspace and artifact association.
- [x] Preserve AssetAI and SplitAI fixed Skill policies.
- [x] Preserve empty Skill lists for agents that must not inherit global Skills.
- [ ] Preserve media/image/video/upload/status tool availability.
- [x] Pause the hidden `BtwSessionPanel` active lifecycle while the drawer is
  collapsed; no session UI is unmounted or recreated by the rail.
- [x] Navigate the open team listbox with Arrow keys, Home, End, and Escape;
  pointer selection delegates to the existing tab switch action, Escape
  restores trigger focus, and the drawer toggle exposes its expanded state.
- [x] Keep the active agent visible in one `Team / Agent` trigger instead of
  duplicating the generic agent tab row and nested session title.
- [x] Default-switch browser tests cover clean profile, denied storage,
  explicit classic query/config/storage rollback, and persistence of both
  presentation values.
- [x] The final single-window visual pass captured the same historical
  short-drama workspace and expanded team drawer in light, dark, and system
  themes, then restored the original light theme and collapsed state.
- [x] Headless Chromium emulated reduced motion and verified real computed
  styles for About progress, short-drama, workspace media, and media preview.
- [x] Final Web suite passed: 336 test files, 1886 tests. TypeScript, ESLint,
  theme, i18n, core-boundary, repository-hygiene, production build, Rust
  `release-fast`, protected hashes, and idle CPU checks passed.
- [x] Post-default short-drama stabilization (`0a4080d47`, `ef33d736f`)
  replaced the permanent icon rail with one on-demand control, kept the native
  agent `EditorGroup`, and verified close -> compact control -> reopen without
  deleting child sessions or creating closed-tab history.
- [x] The open Minimal team panel is a real non-overlapping column capped at
  360px / 32% above the 720px canvas boundary; narrower canvases retain a
  bounded overlay. Real-desktop geometry asserts the primary edge never crosses
  the secondary edge, and independent visual review reported P0/P1/P2 = 0.
- [x] The refreshed ready, empty, and team-open desktop captures keep one
  episode focus ring, preserve the full video controls and episode rail, and
  keep the team panel in its own column. A second independent visual pass again
  reported P0/P1/P2 = 0.

## Theme, Typography, and Accessibility

- [x] Minimal styling is scoped and does not change classic presentation.
- [x] Navigation/control text uses the compact 11/12/13/14/16px hierarchy.
- [x] Script and conversation text remains readable.
- [x] Scoped muted metadata meets `4.5:1` on all eight built-in theme surface
  fixtures; the child-agent composer boundary meets `3:1`. Global theme
  primitives and classic presentation remain unchanged.
- [x] Final dark desktop retest measured collapsed-thinking text/chevron at
  `4.61:1`-`4.99:1` and the resting child-agent composer boundary at `3.43:1`,
  then restored light theme, the original session, collapsed team state, and
  scroll position without creating or sending data.
- [x] Light-theme workspace, short-drama, media, menu, and settings surfaces
  remain readable in real-desktop screenshots.
- [x] System theme remains readable across the same surfaces.
- [x] Hover, active, selected, focus, disabled, loading, success, warning, and
  error states remain distinguishable.
- [x] No critical state relies only on color.
- [x] Reduced-motion disables non-essential motion.
- [x] No permanent glow, backdrop blur, or infinite decorative animation.
- [x] The canonical theme-token desktop visual contract runs in the standard
  sequential L0 suite for light and dark themes, then independently restores
  and verifies the original theme selection, URL, and window size.
- [x] The automation calendar projects priority colors, today/outside-month
  surfaces, grid borders, detail/tool states, failed-task rings, and dialog
  controls through workspace tokens in minimal mode. It runs last in the
  standard sequential L0 desktop suite (`pnpm --dir tests/e2e run test:l0:all`),
  passes wide, 1024x720, dark, and light captures, and restores the original
  theme selection, URL, and window size.
- [x] The export-only MCP resource browser uses canonical ThemeService-backed
  surfaces, text, borders, controls, typography, and reduced-motion behavior.
  Hover, selection, and MIME metadata remain distinct. Because it has no
  production mount consumer, evidence is the focused static visual contract,
  theme audit, and build gates rather than a fabricated settings screenshot.
- [x] Review strategy choices and font preferences use canonical control,
  surface, text, typography, spacing, radius, and paint-only motion tokens.
  Native buttons, steppers, and number inputs retain visible keyboard focus;
  review-team and font-preference behavior remain unchanged.
- [x] The standard sequential L0 suite reaches Appearance with `typography` and
  Deep Review with `deep review` through the real Settings search. Its dark and
  light contract records eight full/local screenshots, including complete
  UI-font rows and review-strategy groups without floating workspace controls.
  It checks canonical computed surfaces, selected and 2px keyboard-focus
  states, prevents horizontal overflow, and restores the previous theme, URL,
  and window size without changing any review or font preference.
- [x] Minimal Settings search is a labelled 28px header action with no idle
  search row. Real-desktop dark/light coverage clicks the action, verifies
  input focus, query-clear then close across two Escape presses, trigger focus
  restoration, result navigation, and closed-state screenshots. Classic
  parity keeps the original search field visible after Escape and result
  activation; search index, active-tab state, and persistence are unchanged.
- [x] Minimal Settings page headers, section rhythm, rows, and bottom inset use
  a compact presentation-only density layer; Classic config-page geometry and
  every settings control remain unchanged.
- [x] Deep Review strategy and overview grids use the named config-panel
  container boundary. Wide content keeps all three strategy cards on one row
  without horizontal overflow; containers at 640px or narrower stack to one
  column instead of producing a viewport-driven 2x2 layout.
- [x] Expanded Minimal Settings search uses the same labelled trigger with an X
  glyph and removes its redundant field-prefix icon. Slice 12 dark/light
  evidence covers the unfocused closed state, expanded search, Appearance, and
  Review without replacing Slice 11 captures.
- [x] Settings focus evidence begins at the trigger restored by result
  activation and traverses the real reverse tab order using only Shift+Tab. It
  preserves the `aria-pressed` signature and never programmatically focuses or
  activates a preference.
- [x] Editor errors, Git commit selection, file-search warnings, ACP confirmation
  controls, and recent-workspace hover consume canonical border, accent,
  warning-status, and control-state tokens. The first audit ratchet moved from
  33 to 27; the follow-up retires dead style consumers, migrates the remaining
  live consumers, exports the canonical CSS layer scale, and reaches 0 undefined
  variables without compatibility aliases or component behavior changes.
- [x] Minimal floating mini chat uses the existing labelled control as a
  25-by-40px right-edge tab while closed and a bounded 360-by-560px
  workspace-token panel while open. Settings content reserves a matching 24px
  trailing safe area so visible configuration rows remain unobscured. Its
  additive presentation layer does not
  modify the Flow Chat store, session, send/cancel, or conditional-mount
  contracts; Classic retains the original 44-by-44px inset launcher.
- [x] Slice 13 real-desktop coverage uses actual open and close clicks in dark
  and light Settings, records four closed/open screenshots, prevents visible
  configuration-row overlap and horizontal overflow, verifies a transform-free
  open surface without decorative images, then restores the original theme,
  URL, and window size.
- [x] Floating processing, error, and confirmation treatments use static
  two-pixel workspace status borders. All mini-chat controls expose a 2px
  focus-visible ring, and reduced-motion disables the slice's transitions and
  animations.
- [x] The Classic floating mini-chat stylesheet removes 43 literal fallbacks
  from 24 already-defined theme variables without changing standalone
  gradients, shadows, selectors, properties, Minimal overrides, or
  React/store/runtime behavior. Its static contract blocks fallback
  reintroduction, and the Slice 13 spec is registered exactly once in the
  standard L0 configuration.
- [x] Minimal Settings navigation uses 28-pixel items, 20-pixel category
  headers, and 16-pixel category separation without changing Classic sizes,
  the Settings store, routing, or the persistent footer.
- [x] Slice 14 dark/light desktop evidence starts at zero scroll offset and
  requires both MCP and ACP rows to remain visible with at least four pixels of
  clearance above the persistent footer at 1280 by 800. The developer category
  remains available through the existing scroll container.
- [ ] Before the MCP resource browser gains a production entry, give resource
  rows keyboard/list selection semantics and project MCP API failures as an
  explicit error state instead of an empty list.
- [x] Automation Day, Week, Month, and List use one compact shell and have
  matching real-desktop visual evidence.
- [x] The 1024x720 Minimal week view compresses all seven localized task-count
  labels to centered values while retaining the complete text in the DOM.
  Filters remain readable and the dismissible crash-diagnostic notice does not
  collide with them.
- [x] Automation typography uses nine semantic size roles and two semantic
  weights: 62 size declarations and 27 weight declarations now share one
  Classic source hierarchy plus a Minimal workspace-token projection. The
  scene-scoped reduced-motion contract remains presentation-only.
- [x] Every additive `*.minimal.scss` stylesheet uses workspace typography
  tokens; hard-coded pixel `font-size` declarations fell from 2 to 0.
- [x] Automation Classic color literals are centralized before component
  consumers, and Minimal remaps the aliases to workspace theme tokens. The
  focused contract rejects raw hex/RGB literals in consumer rules; wide,
  1024x720, Day/Week/Month/List, dark, and light desktop paths pass.
- [x] Slice 20 Automation uses a 40px quiet command bar, plain 28px view
  controls, one compact Create Task primary action, lighter calendar grid
  boundaries, a theme-safe Today marker, and a denser detail sheet. Wide header
  height stays at or below 44px and 1024x720 at or below 72px. The 64-alias
  compatibility bridge is frozen against expansion, long URL/Windows paths
  wrap safely, and all existing view/filter/dialog/detail interactions retain
  zero persisted mutation side effects. The final serial desktop matrix passes
  6/6 across wide, 1024x720, Day/Week/Month/List, light/dark themes, filters,
  dialog, keyboard focus, and populated detail states. Focused Vitest passes
  17/17; web type-check, the 8/8 visual-governance contract, theme color audit
  with zero undefined variables, production build, and the performance budget
  all pass. The build keeps all 54 required dynamic entries with zero unresolved
  imports (JS 2,335,380/2,337,259 bytes; CSS 628,061/633,915 bytes).
  Independent review of the refreshed captures scores the slice 19/20 with
  P0/P1/P2 = 0; its three P3 notes are non-blocking focus-ring and subtle-density
  polish rather than clipping, contrast, or interaction failures.
- [x] Slice 21 Minimal media uses one 40px command bar with a 28px idle search
  target that expands on focus or a retained query without width/layout
  animation. Existing media view, filter, sort, refresh, selection, and clear
  callbacks remain intact; Classic and media Runtime/service/store contracts
  are unchanged. At 460px and below, the toolbar wraps only when needed and
  the 260px refinement sheet is constrained by gallery container width rather
  than viewport width. The final serial real-desktop spec passes 3/3 across
  collapsed search, focus/query expansion, localized clear action, light
  theme, reloaded dark theme, keyboard focus, and narrow refinement geometry;
  all four media-type controls remain inside the gallery. Focused Vitest passes
  51/51; Web TypeScript, 15/15 i18n contracts, i18n audit, theme color audit
  with zero undefined variables, and the 8/8 visual-governance contract pass.
  The production build transforms 7,455 modules and keeps all 54 required
  dynamic entries with zero unresolved static imports. The performance budget
  passes at 2,335,434/2,337,259 raw JavaScript bytes and
  628,061/633,915 raw CSS bytes; gzip deltas of +1,636 JS and +296 CSS remain
  monitored warnings. Independent review scores the refreshed light and
  true-dark captures 18.5/20 with P0/P1/P2 = 0. Its two P3 notes—slightly faint
  search glyph and an isolated Audio row at extreme narrow width—do not block
  interaction or release.
- [x] Slice 22 Minimal creation navigation uses one quiet 28px Media/AI Short
  Drama switcher and a 36px short-drama top bar with five 28px stage controls.
  The stage strip remains horizontally reachable at narrow widths; keyboard
  focus scrolls the final stage fully into view with one focus boundary. The
  420px container refinement restores the script empty state's usable line
  length and raises the local inline-AI activation hint to an operational text
  color without changing the global editor. Classic geometry, existing surface
  and stage callbacks, Runtime, session, store, Skill, media generation, and
  short-drama business contracts remain unchanged. The serial real-desktop
  contract passes 2/2 across light 1280px and dark 720px, real Media/AI Short
  Drama switching, compact team rail, click and keyboard stage paths, visible
  Post content, zero document overflow, and deterministic screenshots. Focused
  Vitest passes 40/40; Web TypeScript, 15/15 i18n contracts, i18n audit, core
  boundaries, theme color audit with zero undefined variables, and the 8/8
  visual-governance contract pass. The production build transforms 7,455
  modules in 32.77 seconds and the performance budget passes at
  2,335,434/2,337,259 raw JavaScript bytes and 629,193/633,915 raw CSS bytes,
  with all 54 dynamic entries and zero unresolved static imports. The +1,647
  JavaScript and +510 CSS gzip deltas remain monitored warnings. Independent
  review scores the refreshed captures 18/20 with P0/P1/P2 = 0; the remaining
  label repetition, post-preview density, and episode-rail edge spacing are
  non-blocking P3 polish.
- [x] Slice 23 closes the episode-rail responsive collision without changing
  episode state or callbacks. In the dark 720px desktop fixture, all ten
  episode buttons are contained and vertically ordered; Episode 2 is
  pointer-clickable and becomes active. The compact switcher displays `短剧`
  while preserving the full accessible name, and the 420px final-preview
  projection keeps title, duration, open action, and status while removing only
  the technical media id. The screenshot driver records Episode 1's ready
  preview before the separate Episode 2 failed/pending state. Eight refreshed
  full/local captures use
  `.codex-artifacts/minimal-workspace/slice23-minimal-short-drama-navigation-*.png`.
  Independent visual review reports P0/P1/P2 = 0; one clipped ordinary-tab
  fragment at the extreme narrow header remains P3 and is not hidden with CSS
  because that would leave an invisible keyboard target. The serial desktop
  contract passes 2/2, including real Media/Short Drama clicks, keyboard access
  to Post, zero page overflow, and cleanup. The focused presentation suite
  passes 48/48; Web TypeScript, core boundaries, 15/15 i18n contracts, i18n
  audit, theme-color audit with zero undefined variables, and the 8/8 theme
  visual-governance contract pass. The production build transforms 7,455
  modules in 32.10 seconds. The performance budget passes at
  2,335,496/2,337,259 raw JavaScript bytes and 629,193/633,915 raw CSS bytes,
  with 54 required dynamic entries and zero unresolved static imports. The
  +1,667 JavaScript and +510 CSS gzip reference deltas remain monitored
  warnings. The audit baseline remains explicit rather than being declared
  solved: 1,567 unique colors, 72 fallback-only variables, 46 indistinguishable
  pairs, and 1,102 near pairs require later module-by-module cleanup.
- [x] Slice 24 removes only real media and short-drama surface tabs from the
  ordinary Minimal strip. Their canvas models remain mounted and reachable
  through the `+1` disclosure, which keeps the existing Fullscreen, Pin, Pop
  out, Close, and Close all handlers. Classic and ordinary sessions retain
  their prior strip. The compact navigation search icon, 32px media header,
  stage controls, and five-agent team remain fully visible in the final
  wide-light capture without creating a second agent pane.
- [x] Slice 24 responsive geometry reserves 216px for a real media/short-drama
  auxiliary surface at extreme narrow width while retaining a 400px chat
  minimum whenever space permits. Chat, session, and auxiliary content remain
  mounted; document, session, scene, and pane overflow are asserted within one
  pixel. Full-window screenshots are deliberately recorded before element
  captures because element capture can scroll the auxiliary pane and create a
  false crop. Final evidence is stored under
  `.codex-artifacts/minimal-workspace/slice24-minimal-short-drama-navigation-*.png`.
- [x] Slice 24 serial desktop interaction passes 2/2 across real Media/Short
  Drama switching, keyboard stage access, team open/collapse, overflow
  disclosure, pin/unpin, existing close action, Escape, Post, and Episode 2.
  Focused UI tests pass 16/16; Web TypeScript, 15/15 i18n contracts, theme
  color audit with zero undefined variables, 8/8 visual governance, shared
  theme-foundation contracts, and production build pass. Final visual and
  geometric inspection clears the prior narrow-pane crop. A follow-up keeps
  the full 1–10 episode rail visible after Episode 2 is selected and scrolled
  into view; the refreshed desktop contract and independent visual review
  report P0/P1/P2 = 0. The remaining numeric disclosure labels are
  non-blocking density polish.
- [x] Slice 25 centralizes Minimal Automation theme ownership in one 50-alias
  compatibility bridge, replacing 64 scattered inline aliases without changing
  provider, execution, Runtime, persistence, or task-state behavior. List rows
  and detail content use flat hierarchy; visually redundant priority, Bot,
  Repeat, and metadata glyphs are removed only where equivalent visible text
  or accessible-name information remains.
- [x] Automation view controls expose `aria-pressed`; populated task cards and
  List rows expose task, effective queued/status label, priority, agent, and
  time through one accessible name. Focused tests pass 22/22, the complete
  Automation test directory passes 43/43, and Web TypeScript passes.
- [x] Minimal Automation keeps its calendar as a full-width productivity
  surface while replacing the wide nested header card and secondary control
  capsule with one 64px flat divider bar. The title now uses the shared
  workspace title role rather than a viewport-scaled display size. Real
  desktop verification covered 1707x912 and 719x498 CSS-pixel viewports,
  Week/List switching, and a create-task dialog that autofocuses and stays
  within the narrow scene without persisted mutation. Three warm
  Assistant/Automation switch cycles rendered Automation within 30.8–52.2ms
  over two animation frames; the active surface retained zero gradients, zero
  CSS/backdrop filters, and zero document overflow.
- [x] Slice 25 real-desktop verification passes 6/6 serial cases across Week,
  Day, Month, List, filters, populated Prompt/Artifacts/Conversation detail,
  light/dark themes, focus, and cleanup. Independent visual review reports
  P0/P1/P2 = 0. A final presentation-only follow-up removes test-fixture status
  prefixes, repeated artifact glyphs, and redundant conversation avatars and
  bubble borders; refreshed independent review reports P0/P1/P2/P3 = 0.
- [x] Theme governance passes with zero undefined variables and eight required
  visual surfaces. Ratcheted limits record 1,555 repository unique colors,
  1,456 app-UI unique colors, and 1,101 near pairs; no raw color was added to
  the Minimal Automation bridge.
- [x] Slice 26 keeps navigation state and callbacks unchanged while replacing
  the Minimal search field with one named 28px icon target. Click,
  `Ctrl/Cmd+K`, `Alt+F`, Escape, and sequential Tab focus all remain reachable;
  Classic retains its full search field and three-mode creation card.
- [x] Navigation dropdowns and Portal menus share the Minimal raised-surface
  theme projection. Classic unknown-workspace status remains `#94a3b8`, while
  Minimal overrides the local alias with `--workspace-text-muted`; Runtime,
  persistence, session activation, media, and short-drama services are
  untouched.
- [x] Slice 26 focused navigation tests pass 28/28, Web TypeScript passes, and
  the real desktop navigation suite passes 6/6 across light/dark, 1024px,
  100–200% zoom, keyboard focus, optional dialogs, and Classic rollback.
  Independent visual review scores 19/20 with P0/P1/P2 = 0. One faint idle
  session-type icon remains recorded as non-blocking P3 rather than being
  removed without an information-hierarchy decision.
- [x] Navigation theme cleanup ratchets repository unique colors from 1,555 to
  1,549, app-UI unique colors from 1,456 to 1,450, indistinguishable pairs from
  46 to 44, and near pairs from 1,101 to 1,081. Fallback-only variables remain
  72 and undefined variables remain zero.
- [x] Slice 27 closes the dark 720px short-drama stage-strip crop. At a
  short-drama container width of 420px or less, the five existing stage
  buttons share the available width with compact insets; longer localized
  labels still retain intrinsic width and the existing horizontal overflow
  path. No stage, callback, state, agent, Skill, media, or Runtime behavior is
  hidden or forked.
- [x] The compressed desktop contract asserts both Script and Post inside the
  tab rail, residual scroll at no more than one pixel, the complete Post focus
  ring, 1–10 episode containment, and unchanged document/session overflow.
  Focused short-drama tests pass 49/49 and the serial real-desktop suite passes
  2/2. Independent review of the refreshed full/local dark screenshots reports
  P0/P1/P2/P3 = 0.
- [x] Modal entry motion never makes the surface or its children translucent.
  The shared backdrop animates its own background color, while the surface only
  translates. Fresh desktop captures for new-project and remote-connect close
  the prior background-text bleed finding; independent visual review reports
  P0/P1/P2 = 0 for this slice.
- [x] Minimal remote-connect replaces legacy centered stacks and decorative
  active treatments with a 440px token-backed surface, left-aligned tabs, and
  semantic status colors. Connection, bot, platform, mode, disclaimer, error,
  and disconnect behavior remain unchanged; Classic retains its existing
  presentation.
- [x] Minimal new-project removes decorative hero and label icons and compresses
  field/footer rhythm while preserving directory selection, validation, cancel,
  and create behavior. The concrete dialog remains a lazy dynamic entry.
- [x] Slice 7 real-desktop evidence opens both optional dialogs through their
  actual navigation actions, captures opaque compact surfaces, closes each with
  Escape, and verifies shell/browser progressive-disclosure actions remain
  reachable. Independent visual review reports P0/P1/P2 = 0 after the
  remote-connect surface was reduced from 520px to 440px.
- [x] Minimal About uses a compact 460px token-backed hierarchy while retaining
  version, update check, build/commit/branch metadata, copy, license, and close
  behavior. Slice 8 opens it through the real footer menu and closes it with
  Escape; independent visual review reports P0/P1/P2/P3 = 0.
- [x] `AppLayout` projects one mutually exclusive presentation class onto the
  shared body Portal root. About, update, navigation menus, tooltips, popovers,
  and fullscreen surfaces inherit it without leaf components reading
  presentation state. Daily update checking/store behavior is unchanged.
- [x] Populated automation task and task-detail states have matching
  real-desktop fixtures that do not persist test data. The real in-memory
  provider covers five execution states, four priorities, long multilingual
  paths, four artifact types, three conversation roles, Week/List surfaces,
  and Prompt/Artifacts/Conversation tabs in light 1280x800 and dark 1024x720.
  All mutation callback counters remain zero and fixture/root/theme/URL/window
  cleanup is asserted.
- [x] Automation task cards in month, compact, and default density expose a
  single name containing task, effective queued/status label, agent, and time.
  The task detail sheet has labelled/described dialog semantics, a named APG
  tablist, focus entry/containment/return, Escape/backdrop close, cyclic arrow
  navigation, Home/End, and safe focus restoration when the source unmounts.
- [ ] Screen-reader names exist for icon-only actions.
- [x] Toolbar Mode's high-frequency icon actions and both text inputs use
  existing localized accessible names. Session and overflow triggers reference
  stable listbox/menu ids, real sessions expose option/selected state, every
  native button has an explicit type, and decorative glyphs are hidden.
- [x] Toolbar Mode focus treatment uses the canonical two-pixel control-focus
  token for create, button, input, session, and menu controls. Its source
  contract rejects `transition: all`; no Provider, Store, Runtime, locale,
  media, or short-drama file is part of the slice.
- [x] Slice 18 single-window desktop execution enters through the real footer
  action, reaches the session trigger using Tab only, asserts its
  `:focus-visible` outline, and captures both the light-theme focus state and
  compact state. It must derive the restore label from the expanded overflow
  menu, collapse through the first menu item, find the uniquely labelled
  Maximize control with Tab, and prove Enter keydown/keyup reach that focused
  target. The embedded WebDriver does not synthesize the native button's
  default click from those synthetic key events, so the contract must assert
  zero clicks and the still-mounted Toolbar Mode before exactly one WebDriver
  pointer click verifies the existing restore path; it must not add a product
  `onKeyDown` workaround. Final cleanup must handle either expanded state,
  restore theme and URL before native state, preserve the sole window handle,
  and match physical position/size within two pixels plus
  maximized/decorated/resizable/always-on-top exactly. The serial desktop
  verifier passes 1/1 with no window, driver, lock, theme, or URL residue.
- [x] Branch selection, Quick Look, and editor breadcrumbs have dedicated
  Minimal token projections below the shared body Portal root. A single-process
  desktop spec mounts the real components, verifies native dialog/menu
  semantics, working-action counts, Tab/Arrow/Escape behavior, and focus
  entry/return, then records full-window and local-surface screenshots.
- [x] Legacy diff/full-snapshot viewers, remote file browsing, and status-bar
  popovers have dedicated Minimal token projections plus verified semantics and
  focus-entry/return behavior.
- [x] The single-process desktop spec mounts all four real surfaces in two
  sequential states: 1280x800 `void-light` and 1024x720 `void-dark` (8 tests,
  one worker, one desktop window). It verifies native status buttons and
  listbox navigation, remote row/context-menu keyboard behavior,
  dialog/Escape/focus restoration, snapshot Arrow isolation from Monaco,
  non-zero Monaco geometry, document/surface overflow, viewport containment,
  fully visible pointer-hit-testable controls, and non-transparent dark
  foreground/background colors.
- [x] The status bar retains its intentional 23px dense desktop geometry and
  19px internal action height; the Gate still requires action width >=28px,
  visibility, center pointer hit, and no overflow. The remote breadcrumb edit
  entry is an independent 28x28 icon target. Its long-path fixture caught and
  fixed both the prior 26px height and path-text bleed under the toolbar using
  only `RemoteFileBrowser.minimal.scss`; Diff, Snapshot, status-bar production
  styles, SSH API, Runtime, and stores were not changed by this follow-up.
- [x] Eight refreshed light full/local captures remain under
  `.codex-artifacts/minimal-workspace/slice10-minimal-legacy-*.png`; eight new
  narrow-dark captures are stored as
  `.codex-artifacts/minimal-workspace/slice11-minimal-legacy-*-dark-narrow*.png`.
  The top-level cleanup independently restores and verifies
  `themes.current`, source URL, original window size, temporary React roots and
  hosts, and the `sshApi.readDir` mock even when an individual case fails.
- [x] Media preview focus is trapped and restored correctly.
- [x] Minimal Flow Chat projects the existing composer as a compact two-row
  surface without changing send, upload/image, mention, model, permission,
  queue, retry, boost, workspace, Runtime, or Store behavior. Its four
  presentation stylesheets contain no raw colors, variable fallbacks,
  gradients, or business-state decisions; Classic retains the original
  presentation.
- [x] Icon-only Send, Retry, and Boost variants have explicit accessible names,
  and the legacy composer focus fallback resolves to the existing accent token.
  Focused composer/layout tests pass 17/17.
- [x] The strict desktop multiline case proves two Shift+Enter events, three
  exact text lines, three distinct rendered line positions, `pre-wrap`, and
  visual height expansion. The embedded-driver `<br>` fallback is isolated to
  the E2E page object and runs only when WebDriver omits the browser-default
  contenteditable mutation; production editor behavior is unchanged.
- [x] Minimal successful user messages use content width with a 620px cap and
  a common right edge. Short, multiline, image, steering, edit, copy, rollback,
  expansion, and preview behavior remain available; Classic is unchanged.
- [x] Message image thumbnails are native accessible buttons, icon-only
  actions expose accessible names, and the preview overlay has dialog
  semantics. The real desktop fixture reads the native image-button name from
  its child image when no redundant `aria-label` is present.
- [x] At 720px, a focused message disclosure sits below its bubble, stays
  inside the viewport, and retains at least 6.7px before the next message.
  Wide actions remain outside the left edge without changing bubble width.
- [x] Slice 30 visual evidence is stored as
  `.codex-artifacts/minimal-workspace/slice30-minimal-user-message-*.png`.
  The refreshed narrow capture resolves the independent review's single P2
  overlap finding.
- [x] Ordinary Base, Compact, and Default tool cards use a Minimal-only,
  token-driven shared shell inside `.virtual-message-list`. Completed and
  running compact rows, expanded content, static confirmation warning, error
  details, and the real expand-collapse interaction remain visible and usable.
- [x] The shared shell explicitly excludes `.task-tool-display` and
  `.media-generation-card`; the desktop computed-style contract proves those
  samples retain their dedicated presentation. No Runtime, Store, media,
  short-drama, or subagent component was edited.
- [x] Slice 31 focused presentation tests pass 8/8, Web TypeScript and Sass
  compilation pass, and its serial desktop contract passes 4/4 in one window.
  Light, dark, and 720px evidence is stored as
  `.codex-artifacts/minimal-workspace/slice31-minimal-tool-card-shell-*.png`.
- [x] Base and Compact roots stay ordinary containers; genuinely interactive
  built-in headers expose one sibling native button. Nested controls remain
  independently discoverable, selected text and nested pointer actions do not
  falsely activate the card, and no nested-button ARIA structure is introduced.
- [x] `aria-expanded` is present only for inline expansion. Open-right cards
  omit it, expanded Compact cards delegate to Base without ghost semantics,
  and loading shimmer coverage matches all 11 authoritative tool-card states.
- [x] Slice 32 focused keyboard tests pass 7/7, Web TypeScript and Sass
  compilation pass, and its serial desktop contract passes 5/5. It records
  visible tokenized focus rings in light and dark themes at
  `.codex-artifacts/minimal-workspace/slice32-minimal-tool-card-keyboard-focus-*.png`.
  The driver-only Tab-modality/direct-focus compensation does not alter product
  keyboard behavior.
- [x] Compact built-in headers default to inline Expand even when no
  `expandedContent` prop is present. Navigation callers opt into
  `open-panel-right`; ReadFile does so explicitly, while Git and Terminal retain
  inline expansion. Explicit header props win and custom headers remain
  untouched.
- [x] The affordance follow-up passes 12/12 focused component tests and 5/5
  serial desktop checks. The real no-content Compact fixture proves the default
  contract, the explicit fixture proves open-right ARIA omission, and the
  refreshed light/dark evidence remains at
  `.codex-artifacts/minimal-workspace/slice32-minimal-tool-card-keyboard-focus-*.png`.

- [x] Minimal Welcome uses one aggregator-owned, workspace-token projection
  while the existing component and Classic stylesheet remain byte-identical.
  It uses the 16/13/11 typography hierarchy, hides only decorative
  section/action glyphs, keeps a quiet recent-workspace folder cue, preserves
  date-to-delete hover/focus disclosure, and defines bounded 720px / 480px plus
  reduced-motion behavior. Workspace open/switch/remove and new-project
  callbacks are unchanged.

## Performance and Build

- [x] Slice 35's isolated verifier fresh manifest build transforms 7,456
  modules and passes at 2,334,842 raw JavaScript bytes against 2,337,259 and
  632,070 raw CSS bytes
  against 633,915. JavaScript gzip is 681,314 (`+1,272` monitored warning) and
  CSS gzip is 89,309 (`+791` monitored warning). All 55 required dynamic
  entries remain present, unresolved static imports remain zero, and no budget
  threshold changed.
- [x] At the typography-token checkpoint, the startup entry chunks were
  2,372,348 raw JavaScript bytes (11-byte budget headroom) and 645,249 raw CSS
  bytes, with 49 dynamic imports and 0 unresolved static imports. JavaScript
  gzip was a monitored warning at 692,241 bytes rather than a passing claim.
- [x] The collapsed team panel passes `isSceneActive={false}` into the hidden
  native session view, activating its existing subscription/timer guards.
- [x] Classic mode returns an explicit inactive projection before the minimal
  controls can mount or pause the native secondary session lifecycle.
- [x] Media remains lazy-loaded.
- [x] Long conversation histories retain their bounded initial render window and
  progressive round rendering.
- [ ] Other long lists remain virtualized where previously virtualized.
- [x] No new broad Store selector was added; the drawer consumes the existing
  canvas-group snapshot through a pure selector.
- [x] Vite watcher idle CPU remains within the optimized baseline.
- [x] Web test suite passes.
- [x] Script contract suite passes.
- [x] TypeScript and ESLint pass.
- [x] Theme and i18n gates pass.
- [x] Web production build passes.
- [x] Vite JS/CSS performance budget passes.
- [x] Slice 24 passes the current production budget at 2,336,720 raw
  JavaScript bytes against 2,337,259 and 633,618 raw CSS bytes against
  633,915. JavaScript gzip is 681,929 (`+1,887` monitored warning) and CSS
  gzip is 89,568 (`+1,050` monitored warning). All 54 required dynamic entries
  remain present with zero unresolved static imports. The active Vite watcher
  samples at 0% CPU over five idle seconds.
- [x] Slice 25 keeps the same raw entry sizes: 2,336,720 JavaScript bytes
  against 2,337,259 and 633,618 CSS bytes against 633,915. JavaScript gzip is
  681,933 (`+1,891` monitored warning) and CSS gzip remains 89,568 (`+1,050`
  monitored warning). The production build and performance budget pass with
  all 54 required dynamic entries and zero unresolved static imports.
- [x] Slice 26 passes the production budget at 2,336,720 raw JavaScript bytes
  against 2,337,259 and 633,304 raw CSS bytes against 633,915. JavaScript gzip
  is 681,936 (`+1,894` monitored warning) and CSS gzip is 89,509 (`+991`
  monitored warning). All 54 required dynamic entries remain present with
  zero unresolved static imports.
- [x] Slice 27 keeps the same production entry sizes: 2,336,720 raw JavaScript
  bytes and 633,304 raw CSS bytes. JavaScript gzip is 681,935 (`+1,893`
  monitored warning), CSS gzip is 89,509 (`+991` monitored warning), all 54
  required dynamic entries remain present, and unresolved static imports
  remain zero.
- [x] Slice 29's manifest build transforms 7,456 modules in 32.55 seconds and
  passes at 2,336,905 raw JavaScript bytes against 2,337,259 and 633,308 raw
  CSS bytes against 633,915. JavaScript gzip is 681,954 (`+1,912` monitored
  warning) and CSS gzip is 89,511 (`+993` monitored warning). All 54 required
  dynamic entries remain present, unresolved static imports stay at 0, and
  performance/layout Node contracts pass 39/39.
- [x] Slice 30's manifest build transforms 7,456 modules and passes at
  2,337,225 raw JavaScript bytes against 2,337,259 and 633,308 raw CSS bytes
  against 633,915. JavaScript gzip is 681,997 (`+1,955` monitored warning) and
  CSS gzip remains 89,511 (`+993` monitored warning). All 54 required dynamic
  entries remain present, unresolved static imports stay at 0, focused tests
  pass 13/13, and the serial desktop message contract passes 3/3.
- [x] Slice 32's manifest build transforms 7,456 modules and passes the
  unchanged budget at 2,337,258 raw JavaScript bytes against 2,337,259 and
  633,567 raw CSS bytes against 633,915. JavaScript gzip is 682,109 (`+2,067`
  monitored warning) and CSS gzip is 89,537 (`+1,019` monitored warning). All
  54 required dynamic entries remain present and unresolved static imports
  stay at 0. The one-byte raw-JavaScript headroom is tracked explicitly; no
  threshold was changed.
- [x] Slice 33's manifest build transforms 7,455 modules and passes at
  2,337,223 raw JavaScript bytes against 2,337,259 and 633,862 raw CSS bytes
  against 633,915. JavaScript gzip is 682,047 (`+2,005` monitored warning) and
  CSS gzip is 89,626 (`+1,108` monitored warning). All 54 required dynamic
  entries remain present, unresolved static imports stay at 0, and no budget
  threshold changed.
- [x] `NavSearchDialog` is a required dynamic manifest entry and is unreachable
  from the static startup graph. The measured entry changed from 2,377,510 to
  2,371,389 raw JavaScript bytes (-6,121), with 48 required dynamic entries and
  zero unresolved static imports; the existing budget remains unchanged.
- [x] Theme-debt cleanup reduces entry CSS to 645,246 raw bytes / 91,326 gzip
  bytes while preserving the 2,371,389-byte raw JavaScript entry. The manifest
  budget passes with 48 required dynamic entries and zero unresolved static
  imports.
- [x] The compact session mode menu is a required dynamic entry and remains
  unreachable from the static startup graph. The measured entry is 2,372,348
  raw JavaScript bytes / 692,215 gzip bytes and 645,249 raw CSS bytes / 91,324
  gzip bytes, with 49 required dynamic entries and zero unresolved imports.
  The existing raw JavaScript and CSS limits remain unchanged.
- [x] Final optional-dialog, navigation-density, and shared Portal-root build
  passes at 2,329,120 raw JavaScript bytes / 680,042 gzip bytes and 625,723 raw
  CSS bytes / 88,518 gzip bytes. The existing raw limits remain unchanged
  (2,337,259 JS and 633,915 CSS), leaving 8,139 JS bytes and 8,192 CSS bytes of
  headroom; both gzip references match the verified build. New-project,
  remote-connect, About, update-available, and
  update-progress are required dynamic entries, bringing the total to 54 with
  zero unresolved static imports.
- [x] Branch selection, editor breadcrumb, and Quick Look Portal projections
  pass the current production budget at 2,330,390 raw JavaScript bytes /
  680,453 gzip bytes and 625,853 raw CSS bytes / 88,578 gzip bytes. The 54
  required dynamic entries remain dynamic with zero unresolved static imports.
  Raw entry headroom remains 6,869 JS bytes and 8,062 CSS bytes; the +411 JS
  gzip and +60 CSS gzip reference deltas are monitored warnings, not hard-limit
  failures.
- [x] The independent Slice 10 production build passes after transforming 7,455
  modules in 34.79 seconds. Entry JavaScript is 2,334,390 raw bytes against the
  2,337,259-byte limit and 681,511 gzip bytes (`+1,469` reference warning).
  Entry CSS is 627,314 raw bytes against the 633,915-byte limit and 88,766 gzip
  bytes (`+248` reference warning). All 54 required dynamic entries remain,
  unresolved static imports stay at 0, and budget unit tests pass 34/34. The
  overall budget is `PASS`; both gzip deltas remain monitored `WARN` results,
  not no-regression claims.
- [x] The narrow-dark follow-up changes production CSS only in the remote
  breadcrumb Minimal projection. Its independent Slice 11 build transformed
  7,455 modules in 36.51 seconds and passed the current budget: entry JavaScript
  remained 2,334,390 raw / 681,522 gzip bytes (`+1,480` monitored warning);
  entry CSS remained 627,314 raw / 88,766 gzip bytes (`+248` monitored
  warning); all 54 required dynamic entries remained present, unresolved static
  imports stayed at 0, and budget unit tests passed 34/34. Protected generated
  version file hashes and modification times did not change. Sass compilation,
  Web TypeScript, 10 focused presentation tests, theme-color/visual contracts,
  core boundaries, and the final 8/8 desktop matrix also pass.
- [x] The populated automation/detail accessibility follow-up independently
  builds 7,455 modules in 34.53 seconds. Entry JavaScript remains 2,334,390 raw
  / 681,521 gzip bytes (`+1,479` monitored warning); entry CSS remains 627,314
  raw / 88,766 gzip bytes (`+248` monitored warning). All 54 required dynamic
  entries remain present, unresolved static imports stay at 0, budget tests
  pass 34/34, and the overall result is `PASS`. Protected generated version
  files and `MediaGenerationToolGroupCard.tsx` retain their hashes and
  modification times.
- [x] Desktop Release-fast Rust check passes.
- [x] Desktop application launches and completes the short-drama and media
  preview smoke paths.

## Cleanup Gate

- [x] Minimal presentation is the verified default.
- [x] Classic rollback completed the same L0 and short-drama desktop parity
  paths as minimal presentation.
- [ ] Removed selectors have zero consumers.
- [ ] Removed components have no imports or dynamic registry references.
- [ ] Removed tokens have zero consumers and pass the CSS variable contract.
- [x] Protected-file hashes remain unchanged.
- [x] Final diff contains no unrelated runtime, Skill, API, persistence, or
  generated-version changes.

## Slice 36 verification

- [x] Media refinement and Flow Chat header panels use the shared raised-shadow
  token.
- [x] Selected media cards preserve the accent border and use an inset semantic
  ring.
- [x] A recursive contract rejects hand-authored Minimal elevation and raw
  shadow colors.
- [x] Independent focused tests, theme gates, production build, and desktop
  light/dark interaction evidence.

## Slice 37 verification

- [x] The media toolbar desktop contract branches on the real gallery width:
  wide galleries must remain one row, narrow galleries must use the intended
  two-row layout, and both branches retain bounded row heights, containment,
  and zero overflow.
- [x] A real `WorkspaceMediaGallery` fixture uses deterministic ready image and
  audio items and the native Select action; it checks `aria-pressed`,
  `.is-selected`, semantic inset/accent styling, selection-bar visibility, and
  geometry without calling media generation or Runtime behavior.
- [x] A real `FlowChatHeader` fixture uses the exported workspace and
  presentation contexts; it checks the shared raised-shadow token, menu roles,
  first-item focus, ArrowDown navigation, Escape closure, and trigger-focus
  restoration.
- [x] The fixture owns and restores app-root style/ARIA/inert state, theme
  selection and document theme attributes, color scheme, URL, and window size;
  React unmount releases component intervals and document listeners.
- [x] Independent serial desktop run (`5/5`) and the four
  `slice37-minimal-{media-selection,flowchat-more-menu}-{light,dark}`
  screenshots.
- [x] Independent focused tests (`14/14`), theme gates (`8/8`), production
  build (`7,456` modules), performance
  budget, and protected-file hash verification.
- [x] Slice 38 implements the non-blocking P2 follow-up with a tokenized
  two-pixel `:focus` outline on enabled Flow Chat menu items, without changing
  menu behavior or Runtime state. Static contract coverage passes `37/37`; the
  `slice38-minimal-flowchat-menu-focus-{light,dark}` screenshots show a complete
  high-contrast ring with P0-P3 equal to zero, and independent desktop
  verification passes `5/5`. Theme gates, the `7,456`-module production build,
  55 dynamic entries, zero unresolved imports, strict performance budgets, and
  protected-file hashes all pass.

## Global typography contract

- [x] Theme application keeps `--font-family-sans` / `--font-sans` and
  `--font-family-mono` / `--font-mono` synchronized.
- [x] The Sass bootstrap UI stack and JS fallback constant are contract-tested
  as the same local Noto Sans SC-first value.
- [x] JS-rendered UI has one DOM-safe canonical font reader and a bounded Canvas
  declaration builder.
- [x] All page-level legacy Sass sans declarations and decorative UI stacks now
  consume `--font-family-sans`; all eight built-in presets share the same
  `DEFAULT_UI_FONT_FAMILY`, while custom-theme fonts remain configurable.
- [x] The recursive source ratchet keeps both cleared baselines at zero and
  locks the remaining nine non-DOM Canvas/Mermaid/widget declarations plus six
  static short-drama SVG declarations by exact normalized value. Literal mono,
  KaTeX, codicon, editor, terminal, diff, and code exceptions remain narrow.
- [x] Focused ThemeService, typography-helper, and governance tests pass
  (`27/27`), including custom 20px preference replay through
  `theme:after-change`, Canvas 6–96px bounds, and synthetic CSS, TS, Mermaid,
  Canvas, and non-whitelisted SVG failures. Web TypeScript and Sass compilation
  pass without changing FontPreference implementation.
- [x] The serial real-desktop typography model covers light/dark Workspace at
  100%, then light/dark Workspace, Automation, Settings, Media, and Short Drama
  at real desktop WebView 200%. Before every capture it closes the notification center, dismisses
  active transient notifications without clearing history, waits two animation
  frames, and proves the document and target surface have no horizontal
  overflow, the target and its critical header/toolbar remain in the viewport,
  and no visible notification intersects the capture. On the Automation scene,
  where the product actually mounts the floating mini-chat edge entry, it must
  keep at least a 24x24 CSS pixel viewport intersection; its button and SVG icon
  centers stay inside the viewport, the enabled pointer target is hit-testable
  through `elementFromPoint`, and it does not intersect the critical header. One
  side may remain intentionally outside the viewport. Agent scenes do not
  receive this selector contract because they intentionally do not mount the
  entry. The 200% gate first requests a 2800x1800 window, drives the product zoom
  controller through the persisted
  `app.zoom_level` contract, and checks `window.innerWidth >= 1024` plus
  `window.innerHeight >= 700` directly without multiplying by
  `devicePixelRatio`. If clamped, it resets to 100%, calculates one 3%-buffered
  proportional resize per axis bounded by the 3200x2200 maximum, then retries
  200% exactly once. No viewport growth or a still-insufficient retry fails
  explicitly with all request and measured metrics; it is never skipped.
  Cleanup restores the original
  zoom preference, notification presentation, the temporary Media session,
  theme, URL, and window size in that order and verifies the terminal state.
- [x] Short Drama's 41 and Workspace Media's 19 Classic font-size consumers
  use feature-local semantic tokens with their original computed values locked
  in ordered contract tests.
- [x] Minimal remaps both feature vocabularies at their roots to workspace
  meta, label, control, body, and title roles. The legacy micro role maps to
  workspace meta for readability; ProseMirror content and text glyph geometry
  remain explicit exceptions.
- [x] The asset-row disclosure is no longer grouped with micro metadata. Its
  16px glyph token and `line-height: 1` survive Minimal presentation, while
  media select/reference action glyphs remain separate from body copy and SVG
  sizing.
- [x] The scoped static ratchet rejects raw font-size consumers, direct Minimal
  workspace-role bypasses, and unknown Short Drama or Workspace Media feature
  tokens; its synthesized regression case and focused presentation suite pass
  `21/21`, and both owning Sass entrypoints compile.
- [ ] Refresh real-desktop light/dark Short Drama and Workspace Media captures
  at 100% and 200% after the independent verification run; confirm card,
  toolbar, editor, episode rail, and glyph geometry have no clipping or
  horizontal overflow.

## Global utility follow-up (2026-07-25)

- [x] Real desktop review covers the Mini Apps gallery and account usage page
  at maximized and 719px WebView widths. Mini Apps changes from five columns to
  one without horizontal overflow; account usage renders 370 real daily cells,
  reflows its metrics, and keeps the heatmap within its content axis.
- [x] At 720px and below, SceneBar removes the optional separator and subtitle
  before tabs become too narrow. Primary labels remain complete; wider windows
  continue to show contextual subtitles such as `Settings / Account`.
- [x] The Insights list restores a visible page title, keeps filters and report
  generation on one compact desktop command row, and uses a bounded two-row
  header on narrow windows. Empty and populated report states retain their
  existing store and generation paths.
- [x] These follow-ups remain presentation-only: no report generation, account
  usage, authentication, Mini App runtime, session, or persistence interfaces
  changed.
- [x] Opening Universal Canvas tools from an unpersisted New Task draft no
  longer leaves the canvas permanently collapsed. Draft entry performs its
  one-time cleanup, then the shared header control can hide and reopen Browser
  or other canvas tabs without creating a workspace or persisted session.
- [x] Real maximized and 719px WebView review covers New Task, Assistant
  Nursery, installed Skills, Professional Agents, and the MCP connector entry.
  New Task keeps its 315px by 31px creation-mode example strip independent of
  the centered heading and lower composer; Nursery, Skills, and Professional
  Agents retain their two/four-column wide layouts and single-column narrow
  projections with zero horizontal overflow.
- [x] The empty MCP connector entry now exposes one compact JSON configuration
  action instead of duplicating a header icon, explanatory copy, and a framed
  empty card. The existing JSON editor open/cancel path, MCP loading, server
  state, persistence, and API boundaries are unchanged; maximized and 719px
  desktop evidence confirms the action stays aligned to the content axis with
  zero horizontal overflow.
- [x] A read-only 719px settings matrix covers Account, Basic, Appearance,
  Models, Archived Sessions, Shortcuts, Personalization, Permissions, Quick
  Actions, Review, MCP, ACP Agent, and Editor. Every page keeps both the
  document and its config container within the viewport, with zero visible
  control bounds crossing the window edge.
- [x] Archived Sessions no longer repeats the same title across the page,
  section, and framed empty card. Its empty projection is one 40px status row
  with the existing refresh action; populated workspace groups and all restore,
  delete, bulk-delete, confirmation, session API, and loading paths remain
  unchanged. Maximized and 719px desktop checks show one visible page heading,
  successful refresh-to-empty behavior, and zero horizontal overflow.
- [x] Appearance keeps the page title as `Appearance / 外观` and gives its
  language-and-theme section the distinct `Interface / 界面` label in all three
  locales. The repeated section hint is removed without changing language,
  theme, or font preference state. Maximized and 719px desktop checks show the
  `外观 / 界面 / 字体大小` hierarchy with zero document overflow.
- [x] New Task office examples remain absolutely positioned outside the
  greeting and mode-switch layout. The supporting strip is capped at 460px,
  uses three 30px cards at both maximized and 719px widths, and truncates only
  overflowing card labels. Switching between Code and Office leaves the
  greeting and composer coordinates unchanged; the narrow document has zero
  horizontal overflow.
