# AI Short Drama Video Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the first video being remounted during playback and replace the video page with a single-player filmstrip review layout.

**Architecture:** Keep the existing artifact selection state and media URL resolver. Stabilize the main `<video>` by keying it only by media URL, remove asynchronous/offscreen video frame extraction, and make rail previews image-or-placeholder only. Recompose `VideoStage` as one main player followed by a horizontally scrolling filmstrip, with container-query sizing.

**Tech Stack:** React, TypeScript, SCSS Container Queries, Vitest

---

### Task 1: Lock the playback lifecycle regression

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts`
- Read only: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.ts`

- [ ] **Step 1: Add failing lifecycle assertions**

Assert that the source contains `key={mediaUrl}`, does not contain ``key={`${mediaUrl}:${thumbnailUrl ?? 'no-poster'}`}``, does not define `useVideoFirstFrameThumbnail`, and does not render a `<video>` inside `VideoRailThumbnail`.

- [ ] **Step 2: Add failing filmstrip assertions**

Assert that `VideoStage` renders `role="tablist"`, each scene uses `role="tab"` and `aria-selected`, and the stylesheet defines a one-column video stage with a horizontal auto-flow rail.

- [ ] **Step 3: Verify RED**

```powershell
pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts
```

Expected: FAIL on the unstable video key, frame extractor, rail video fallback, and missing tab semantics.

### Task 2: Stabilize the single player

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx:1752`
- Test: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts`

- [ ] **Step 1: Use a stable player identity**

Change the main video element to `key={mediaUrl}`. Keep `poster={thumbnailUrl}` as a normal mutable attribute so thumbnail resolution cannot replace the player node.

- [ ] **Step 2: Remove redundant frame extraction**

Delete `useVideoFirstFrameThumbnail` and its call. Resolve video posters from the existing thumbnail and storyboard-poster URLs only.

- [ ] **Step 3: Make rail previews static**

Remove `mediaUrl` from `VideoRailThumbnail`. Render its image when available and the existing empty placeholder otherwise; never render `<video>` in the rail.

- [ ] **Step 4: Verify the lifecycle assertions pass**

Run the focused layout test. Expected: lifecycle assertions PASS while filmstrip layout assertions remain RED.

### Task 3: Recompose the video page as a filmstrip reviewer

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx:1518`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss:690`
- Test: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts`

- [ ] **Step 1: Put the active player first**

Render the current scene marker, the existing large `MediaPreview`, and the prompt inside the main stage. Remove the duplicate standalone `<h3>` because media metadata already displays the title.

- [ ] **Step 2: Put the rail after the player**

Render the scene rail after the main stage with `role="tablist"`. Give each button `role="tab"`, `aria-selected`, and its existing click/focus behavior.

- [ ] **Step 3: Implement horizontal filmstrip styles**

Make `.short-drama-center__video` one column at all widths. Make `.short-drama-center__rail` a horizontal `grid-auto-flow: column` strip with bounded item widths, snap alignment, and overflow scrolling. Use the existing 620px and 420px container queries to reduce item size and secondary copy without hiding core controls.

- [ ] **Step 4: Verify GREEN**

```powershell
pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
```

Expected: all focused tests PASS and pagination tests remain unchanged.

### Task 4: Verify and ship

**Files:**
- Verify only: the component, stylesheet, and focused test above

- [ ] **Step 1: Run short-drama regression tests**

```powershell
pnpm --dir src/web-ui run test:run src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type check and production build**

```powershell
pnpm run type-check:web
pnpm run build:web
```

Expected: both commands exit 0.

- [ ] **Step 3: Review coupling and commit scope**

Confirm pagination files, ViewModels, stores, adapters, backend files, and generated version files are absent from the implementation diff.

- [ ] **Step 4: Commit and push**

Stage only the short-drama component, stylesheet, focused test, spec, and plan. Commit with `fix(ui): stabilize short drama video stage` and push the current branch.
