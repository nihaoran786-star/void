# AI Short Drama Media Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make short-drama image and video previews complete, uncluttered, and responsive to the actual dragged panel width without changing pagination.

**Architecture:** Keep selection and pagination state untouched. Add a presentation-only media stage inside `MediaPreview`, isolate the explicit open-preview action from native video controls, and use container queries scoped to `.short-drama-center` for layout adaptation. Protect the result with focused source/style contract tests and the existing short-drama state tests.

**Tech Stack:** React, TypeScript, SCSS Container Queries, Vitest

---

### Task 1: Lock the media and pagination contracts

**Files:**
- Create: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts`
- Read-only contract: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.ts`
- Read-only contract: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts`

- [ ] **Step 1: Write the failing layout contract test**

Add tests that read `ShortDramaCenterPanel.scss` and `ShortDramaCenterPanel.tsx`, then assert that the center is an inline-size container, main/final media use `contain`, rail media use `cover`, responsive rules use `@container`, captions are outside the stage, and video controls stop click propagation.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts
```

Expected: FAIL because the current stylesheet uses `object-fit: cover`, has no container query, and the caption is rendered inside the clickable preview.

- [ ] **Step 3: Record the unchanged pagination baseline**

Run:

```powershell
pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
```

Expected: PASS before implementation. Do not modify either pagination file.

### Task 2: Separate media canvas, metadata, and preview action

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx:1752`
- Test: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts`

- [ ] **Step 1: Implement the media-stage structure**

Inside ready previews, render a `.short-drama-media-preview__canvas` around image/video/audio content. Render `MediaPreviewCaption` as `.short-drama-media-preview__meta` after the canvas for non-rail images, so metadata never overlays pixels.

- [ ] **Step 2: Isolate video controls from opening the overlay**

Move the clickable/keyboard open-preview behavior to an explicit `.short-drama-media-preview__open` button for non-rail image/video previews. Add `onClick={event => event.stopPropagation()}` to the native video controls wrapper so play, seek, and volume interactions do not open the global preview.

- [ ] **Step 3: Run the focused test**

Run the Task 1 layout test. Expected: interaction/source assertions pass; style assertions remain RED until Task 3.

### Task 3: Implement container-driven, non-cropping layout

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss:1`
- Test: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts`

- [ ] **Step 1: Make the panel a layout container**

Add `container-name: short-drama-panel` and `container-type: inline-size` to `.short-drama-center`, plus `min-width: 0` and overflow guards on the media layout children.

- [ ] **Step 2: Make main media complete and thumbnails compact**

Set the main/final canvas to a bounded 16:9 stage with `max-height`, remove conflicting fixed `min-height`, and apply `object-fit: contain` to main image/video elements. Preserve `object-fit: cover` only for rail and row thumbnails.

- [ ] **Step 3: Move metadata below the canvas**

Replace the absolute caption style with a compact grid row outside the media canvas. Use ellipsis for long titles and collapse secondary metadata at the narrowest container size.

- [ ] **Step 4: Adapt the video stage to dragged width**

At a content-driven medium breakpoint, change `.short-drama-center__video` to one column and `.short-drama-center__rail` to a horizontally scrolling grid with fixed-size items. At a narrow breakpoint, reduce gaps/padding while retaining media selection and pagination.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
```

Expected: both test files PASS.

### Task 4: Regression verification

**Files:**
- Verify only: all files changed above

- [ ] **Step 1: Run short-drama service and navigation tests**

```powershell
pnpm --dir src/web-ui run test:run src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts
```

Expected: PASS with no unhandled warnings.

- [ ] **Step 2: Run Web UI type checking**

```powershell
pnpm run type-check:web
```

Expected: exit code 0.

- [ ] **Step 3: Review coupling and diff scope**

Confirm that pagination files, backend adapters, stores, generated version files, and unrelated user changes are absent from the implementation diff. Confirm UI renders only the existing preview state and does not infer filesystem or media source behavior.

- [ ] **Step 4: Commit the implementation**

Stage only the short-drama component, SCSS, focused layout test, spec, and plan. Use commit message:

```text
refactor(ui): simplify short drama media preview
```
