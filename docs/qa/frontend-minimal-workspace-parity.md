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

## Application Shell and Navigation

- [ ] Launch desktop application to a usable shell.
- [ ] Open an existing project.
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

- [ ] Open the short-drama entry from the expected project context.
- [ ] Recover an existing short-drama project.
- [ ] Create or hydrate stage-agent sessions.
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
- [ ] Open every stage agent in its real native session/tab.
- [ ] Show pending generation placeholders.
- [ ] Refresh when generation artifacts arrive.
- [ ] Select artifacts and connect them to the correct stage/episode.
- [ ] Preserve generation errors and recovery actions.
- [ ] Preserve empty, loading, ready, restricted, unsupported, and error states.
- [ ] Preserve stage completion/progress/status indicators.
- [ ] Preserve long-project scrolling and episode synchronization.

## Media Library and Preview

- [ ] Scan and refresh workspace media.
- [ ] Show pending generations.
- [ ] Filter by media type/status.
- [ ] Search by supported text fields.
- [ ] Sort by supported order.
- [ ] Select one, many, and all visible items.
- [ ] Preview images.
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

- [ ] Open and close the team drawer.
- [ ] Keep the drawer collapsed by default without hiding active failure state.
- [ ] Show each fixed short-drama agent by role.
- [ ] Show live, waiting, completed, cancelled, and failed status.
- [ ] Show current action without exposing unnecessary internal noise.
- [ ] Open detailed output/logs on demand.
- [ ] Navigate to the real agent session.
- [ ] Preserve parent/child session relationships.
- [ ] Preserve workspace and artifact association.
- [ ] Preserve AssetAI and SplitAI fixed Skill policies.
- [ ] Preserve empty Skill lists for agents that must not inherit global Skills.
- [ ] Preserve media/image/video/upload/status tool availability.
- [ ] Avoid polling or repeated rendering while the drawer is hidden.

## Theme, Typography, and Accessibility

- [ ] Minimal styling is scoped and does not change classic presentation.
- [ ] Navigation/control text uses the compact 11/12/13/14/16px hierarchy.
- [ ] Script and conversation text remains readable.
- [ ] Text contrast meets the existing theme contract in dark mode.
- [ ] Light/system themes do not become unreadable even while dark minimal is
  the primary target.
- [ ] Hover, active, selected, focus, disabled, loading, success, warning, and
  error states remain distinguishable.
- [ ] No critical state relies only on color.
- [ ] Reduced-motion disables non-essential motion.
- [ ] No permanent glow, backdrop blur, or infinite decorative animation.
- [ ] Screen-reader names exist for icon-only actions.
- [ ] Focus is trapped/restored correctly in drawers and menus.

## Performance and Build

- [ ] Hidden views do not keep high-frequency subscriptions or timers active.
- [ ] Classic and minimal controllers are not mounted simultaneously.
- [ ] Media remains lazy-loaded.
- [ ] Long lists remain virtualized where previously virtualized.
- [ ] No new broad Store selector causes whole-app rerenders.
- [ ] Vite watcher idle CPU remains within the optimized baseline.
- [ ] Web test suite passes.
- [ ] Script contract suite passes.
- [ ] TypeScript and ESLint pass.
- [ ] Theme and i18n gates pass.
- [ ] Web production build passes.
- [ ] Vite JS/CSS performance budget passes.
- [ ] Desktop Release build/check passes.
- [ ] Desktop application launches and completes the critical smoke path.

## Cleanup Gate

- [ ] Minimal presentation is the verified default.
- [ ] Classic rollback has completed one final parity cycle.
- [ ] Removed selectors have zero consumers.
- [ ] Removed components have no imports or dynamic registry references.
- [ ] Removed tokens have zero consumers and pass the CSS variable contract.
- [ ] Protected-file hashes remain unchanged.
- [ ] Final diff contains no unrelated runtime, Skill, API, persistence, or
  generated-version changes.
