# Short Drama Global Episode And Script Markdown Issues

## Risk Boundary

- Do not add upload/import buttons to the right panel. Script intake belongs to the left chat and main AI workflow.
- Do not put short-drama parsing, manifest, or file-management business logic into `ContentCanvas`, generic panel shells, or chat UI components.
- Keep the right panel as a product presentation and light-editing surface: stage tabs, continuous content, thin episode rail, and subagent chat entry only.
- Keep episode navigation global across stages. `activeEpisodeId` is short-drama-center state, not per-tab state.
- Reuse existing markdown/editor capability. Do not build a new editor or render script content with `<pre>`.
- No dropdown controls for stage or episode navigation. Navigation is by fixed tabs, page scroll, and thin numeric rail.

## Issue 1: Make episode navigation global across all short-drama stages

**Type:** AFK
**Blocked by:** None

### What to build

Make the active episode a global short-drama center state. When the user scrolls or clicks episode 2 in the script stage, switching to storyboards, video, or post should automatically land on episode 2 in that stage. The right episode rail should be shared by all stages and should update from visible content while the user scrolls.

### Acceptance criteria

- [ ] `activeEpisodeId` is owned by the short-drama center, not by individual stage components.
- [ ] Clicking a number in the right rail scrolls the current stage to that episode.
- [ ] Scrolling any stage updates the active number in the right rail.
- [ ] Switching stage preserves the active episode and scrolls to the matching episode anchor when available.
- [ ] If a stage has no matching episode anchor, it falls back to the nearest available episode without resetting global state unexpectedly.
- [ ] Tests cover stage switching after selecting episode 2.

### Blocked by

None - can start immediately.

## Issue 2: Replace script stage sections with one editable markdown document

**Type:** AFK
**Blocked by:** Issue 1

### What to build

The script stage should render one continuous editable markdown document instead of separate episode sections. The document should feel like a plain text writing surface, using the existing markdown editor stack with a minimal shell. Episode navigation should be derived from large episode headings in the document, such as `# 第1集`, `# 第 2 集`, `# EP03`, or `# Episode 4`.

### Acceptance criteria

- [ ] Script stage no longer renders per-episode cards or per-episode section dividers.
- [ ] Script content is shown in one editable markdown/text surface.
- [ ] The implementation reuses existing markdown/editor capability rather than introducing a new editor.
- [ ] The script editor hides preview/source toggle chrome, import/upload controls, and unrelated toolbar actions.
- [ ] Heading parsing recognizes Chinese and English episode headings and maps them to episode numbers.
- [ ] Right rail navigation scrolls to heading anchors inside the script document.
- [ ] Editing script text does not trigger agent runs automatically.
- [ ] Tests cover heading parsing and right-rail anchor generation.

### Blocked by

- Issue 1

## Issue 3: Treat script intake as a left-chat main-AI workflow, not a right-panel action

**Type:** HITL
**Blocked by:** Issue 2

### What to build

Define and wire the right-panel contract for scripts that have already been handled by the main AI. Users provide new scripts through the left chat composer as text or attachments. The main AI is responsible for recognizing the script, saving or organizing it in the workspace, and updating the short-drama project manifest or script file reference. The right panel only consumes the resulting structured state.

### Acceptance criteria

- [ ] The right panel contains no upload, import, replace-script, or file-management button.
- [ ] The short-drama project model can reference a script markdown document or embedded script markdown content.
- [ ] Empty or missing script content shows a minimal state directing the user to provide the script in chat, without a right-panel file picker.
- [ ] The right panel can refresh from updated manifest/project state after the main AI writes a new script reference.
- [ ] The contract is documented clearly enough for later main-AI orchestration work.
- [ ] No chat composer or file-system workflow is implemented in this issue unless a separate approved issue exists.

### Blocked by

- Issue 2

## Issue 4: Use weak episode separation for non-script stages

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Assets, storyboards, video, and post stages should remain continuous scroll pages, but episode boundaries should be visually weak and minimal. The pages should not feel like paginated screens or stacked heavy cards. Each episode should have a subtle anchor area that supports global episode navigation and future visible-thumbnail lazy loading.

### Acceptance criteria

- [ ] Non-script stages remain one continuous scroll surface per stage.
- [ ] Episode boundaries use light spacing or a subtle divider, not heavy card containers.
- [ ] Episode headers are small and scannable.
- [ ] Empty episode-stage areas stay compact and do not create large blank cards.
- [ ] Artifact cards remain media-first and visually lighter than the previous strong section layout.
- [ ] Tests or smoke checks verify each non-script stage still renders episode anchors.

### Blocked by

- Issue 1

## Issue 5: Convert the right episode rail to a thin Arabic-number navigator

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Replace the current right episode rail label/title style with a thin numeric navigator. It should show only Arabic numbers such as `1`, `2`, `3`, and use a quiet active state. It should not show episode titles, `Episode`, or other labels in the rail.

### Acceptance criteria

- [ ] Right rail width is reduced to a thin navigator, roughly 28-32px where practical.
- [ ] Rail items show Arabic episode numbers only.
- [ ] Active episode uses a restrained line, dot, or soft background.
- [ ] Episode titles are not shown in the rail.
- [ ] The rail remains sticky beside the scrollable content on desktop.
- [ ] Mobile behavior remains usable without introducing dropdowns.

### Blocked by

- Issue 1

## Issue 6: Keep stage tabs fixed, non-scrollable, and dropdown-free

**Type:** AFK
**Blocked by:** None

### What to build

The top stage tabs should be a fixed, minimal navigation row for script, assets, storyboards, video, and post. Remove any dropdown-like control or vertical scroll affordance from the tab row. Real scrolling should happen only in the content body.

### Acceptance criteria

- [ ] Stage tabs do not scroll vertically with the content body.
- [ ] Stage tabs do not show dropdowns, overflow menus, or hidden select controls.
- [ ] The tab row does not create a horizontal scrollbar in normal desktop widths.
- [ ] Stage switching keeps the global active episode behavior from Issue 1.
- [ ] The tab row remains visually minimal and does not reintroduce the removed production-plan header.

### Blocked by

None - can start immediately.

## Suggested Dependency Order

```text
Issue 1 global episode state
  -> Issue 2 script markdown document
      -> Issue 3 left-chat-owned script intake contract
  -> Issue 4 weak non-script episode separation
  -> Issue 5 thin numeric episode rail

Issue 6 fixed dropdown-free tabs can run in parallel with Issue 1.
```

## Notes For AFK Agents

- This is a refinement of the existing short-drama center, not a new module.
- The right panel should feel like a production surface, not a file manager.
- Script upload/replacement is intentionally excluded from the right panel. Later main-AI orchestration should own file intake and workspace organization.
- Prefer shared short-drama view-model tests for heading parsing and episode state synchronization.
