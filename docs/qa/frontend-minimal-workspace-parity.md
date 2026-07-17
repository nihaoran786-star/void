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
- [x] Full Web suite passed: 313 test files, 1779 tests.
- [x] Script contracts passed: 121 tests.
- [x] TypeScript, ESLint, theme color/visual contracts, and core boundaries
  passed.
- [x] Manifest production build and entry performance Gate passed: entry JS
  2,371,289 / 2,372,359 bytes (gzip 690,964); entry CSS
  665,090 / 672,720 bytes (gzip 94,272).
- [x] Slice 3 real-desktop E2E passed 2/2: the fixed five-agent rail measured
  44px collapsed and 298.5px open, while media preview and episode 10/100
  navigation remained functional.
- [x] Slice 3 screenshots captured the collapsed rail, open native session
  panel, and media preview; the dedicated visual specialist reported no P0/P1
  issue, clipping, or horizontal overflow.
- [ ] The remaining interactive/manual items below still gate default switch.

## Application Shell and Navigation

- [x] Launch desktop application to a usable shell.
- [x] Open an existing project.
- [ ] Create a new project.
- [ ] Switch workspaces.
- [ ] Create and switch sessions.
- [ ] Restore historical sessions after restart.
- [ ] Open settings, About, update, and workspace status surfaces.
- [ ] Preserve window close/save behavior.
- [ ] Preserve fullscreen and window-mode behavior.
- [ ] Preserve current scene/tab state.
- [ ] Navigate with keyboard only.
- [ ] Show visible focus for every interactive control.
- [ ] Operate at narrow desktop width without losing critical actions.
- [ ] Operate at 100%, 125%, 150%, and 200% zoom.

## Composer and Conversation

- [ ] Type and send a normal message.
- [ ] Stop an active turn.
- [ ] Retry or continue a failed/interrupted turn.
- [ ] Create Code, Cowork, Media, and agentic sessions.
- [ ] Select model and reasoning/effort options.
- [ ] Select modes and allowed Skills.
- [ ] Preserve fixed short-drama subagent Skill isolation.
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
- [ ] Preserve `workspaceId`, `workspacePath`, `sessionId`,
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

- [ ] Scan and refresh workspace media.
- [ ] Show pending generations.
- [ ] Filter by media type/status.
- [ ] Search by supported text fields.
- [ ] Sort by supported order.
- [ ] Select one, many, and all visible items.
- [x] Preview images.
- [ ] Preview videos with poster/thumbnail fallback.
- [ ] Resolve media URLs through the existing resolver.
- [ ] Handle missing/failed previews.
- [ ] Reference media back into chat/context.
- [ ] Delete selected media.
- [ ] Open trash.
- [ ] Select trash items.
- [ ] Restore trash items.
- [ ] Permanently purge trash items.
- [ ] Preserve path-mismatch and operation-error feedback.
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
- [ ] Preserve parent/child session relationships.
- [ ] Preserve workspace and artifact association.
- [ ] Preserve AssetAI and SplitAI fixed Skill policies.
- [ ] Preserve empty Skill lists for agents that must not inherit global Skills.
- [ ] Preserve media/image/video/upload/status tool availability.
- [x] Pause the hidden `BtwSessionPanel` active lifecycle while the drawer is
  collapsed; no session UI is unmounted or recreated by the rail.

## Theme, Typography, and Accessibility

- [x] Minimal styling is scoped and does not change classic presentation.
- [x] Navigation/control text uses the compact 11/12/13/14/16px hierarchy.
- [ ] Script and conversation text remains readable.
- [ ] Text contrast meets the existing theme contract in dark mode.
- [ ] Light/system themes do not become unreadable even while dark minimal is
  the primary target.
- [ ] Hover, active, selected, focus, disabled, loading, success, warning, and
  error states remain distinguishable.
- [ ] No critical state relies only on color.
- [ ] Reduced-motion disables non-essential motion.
- [x] No permanent glow, backdrop blur, or infinite decorative animation.
- [ ] Screen-reader names exist for icon-only actions.
- [x] Media preview focus is trapped and restored correctly.

## Performance and Build

- [x] The collapsed team panel passes `isSceneActive={false}` into the hidden
  native session view, activating its existing subscription/timer guards.
- [ ] Classic and minimal controllers are not mounted simultaneously.
- [x] Media remains lazy-loaded.
- [ ] Long lists remain virtualized where previously virtualized.
- [ ] No new broad Store selector causes whole-app rerenders.
- [ ] Vite watcher idle CPU remains within the optimized baseline.
- [x] Web test suite passes.
- [x] Script contract suite passes.
- [x] TypeScript and ESLint pass.
- [x] Theme and i18n gates pass.
- [x] Web production build passes.
- [x] Vite JS/CSS performance budget passes.
- [ ] Desktop Release build/check passes.
- [x] Desktop application launches and completes the short-drama and media
  preview smoke paths.

## Cleanup Gate

- [ ] Minimal presentation is the verified default.
- [ ] Classic rollback has completed one final parity cycle.
- [ ] Removed selectors have zero consumers.
- [ ] Removed components have no imports or dynamic registry references.
- [ ] Removed tokens have zero consumers and pass the CSS variable contract.
- [ ] Protected-file hashes remain unchanged.
- [ ] Final diff contains no unrelated runtime, Skill, API, persistence, or
  generated-version changes.
