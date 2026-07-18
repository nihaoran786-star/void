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
- [ ] The remaining interactive/manual items below still gate default switch.

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

## Media Library and Preview

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
- [ ] Keep the drawer collapsed by default without hiding active failure state.
- [x] Keep the drawer collapsed by default at a measured 44px width.
- [x] Show each fixed short-drama agent by role.
- [ ] Show live, waiting, completed, cancelled, and failed status.
- [ ] Show current action without exposing unnecessary internal noise.
- [ ] Open detailed output/logs on demand.
- [x] Navigate to the real agent session.
- [x] Keep native close, reorder, pin, drag, overflow, and pop-out tab actions
  available in the 300px open panel.
- [x] Preserve parent/child session relationships.
- [x] Preserve workspace and artifact association.
- [x] Preserve AssetAI and SplitAI fixed Skill policies.
- [x] Preserve empty Skill lists for agents that must not inherit global Skills.
- [ ] Preserve media/image/video/upload/status tool availability.
- [x] Pause the hidden `BtwSessionPanel` active lifecycle while the drawer is
  collapsed; no session UI is unmounted or recreated by the rail.
- [x] Navigate between adjacent fixed-agent controls with native Tab order;
  agent controls expose role labels and pressed state, while the drawer toggle
  exposes its expanded state.
- [x] Default-switch browser tests cover clean profile, denied storage,
  explicit classic query/config/storage rollback, and persistence of both
  presentation values.
- [x] The final single-window visual pass captured the same historical
  short-drama workspace and expanded team drawer in light, dark, and system
  themes, then restored the original light theme and collapsed state.
- [x] Headless Chromium emulated reduced motion and verified real computed
  styles for About progress, short-drama, workspace media, and media preview.
- [x] Final Web suite passed: 336 test files, 1870 tests. TypeScript, ESLint,
  theme, i18n, core-boundary, repository-hygiene, production build, Rust
  `release-fast`, protected hashes, and idle CPU checks passed.

## Theme, Typography, and Accessibility

- [x] Minimal styling is scoped and does not change classic presentation.
- [x] Navigation/control text uses the compact 11/12/13/14/16px hierarchy.
- [x] Script and conversation text remains readable.
- [ ] Text contrast meets the existing theme contract in dark mode.
- [x] Light-theme workspace, short-drama, media, menu, and settings surfaces
  remain readable in real-desktop screenshots.
- [x] System theme remains readable across the same surfaces.
- [x] Hover, active, selected, focus, disabled, loading, success, warning, and
  error states remain distinguishable.
- [x] No critical state relies only on color.
- [x] Reduced-motion disables non-essential motion.
- [x] No permanent glow, backdrop blur, or infinite decorative animation.
- [ ] Screen-reader names exist for icon-only actions.
- [x] Media preview focus is trapped and restored correctly.

## Performance and Build

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
