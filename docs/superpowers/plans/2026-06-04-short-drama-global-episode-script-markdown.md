# Short Drama Global Episode Script Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the short-drama right-panel refinement where episode navigation is global, the script stage is one editable markdown document, and the right panel remains a lightweight scaffold for future AI-agent orchestration.

**Architecture:** Keep all short-drama state derivation in `src/web-ui/src/shared/services/short-drama`. Keep `ShortDramaCenterPanel` as the UI entrypoint for stage tabs, scroll synchronization, numeric episode rail, markdown editor embedding, and artifact presentation. Do not add upload/import UI; future main-AI workflows will update the project/manifest consumed by this panel.

**Tech Stack:** React, TypeScript, Vitest, existing short-drama shared service, existing `MEditor` markdown editor.

---

### Task 1: Script Heading View Model

**Files:**
- Modify: `src/web-ui/src/shared/services/short-drama/ShortDramaTypes.ts`
- Modify: `src/web-ui/src/shared/services/short-drama/ShortDramaProjectViewModel.ts`
- Modify: `src/web-ui/src/shared/services/short-drama/ShortDramaStaticProject.ts`
- Test: `src/web-ui/src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts`

- [ ] Add optional `scriptDocument` data to `ShortDramaProject`.
- [ ] Add `createShortDramaScriptDocumentViewModel(project)` that returns markdown content and episode anchors parsed from headings.
- [ ] Recognize headings like `# 第1集`, `# 第 2 集`, `# EP03`, and `# Episode 4`.
- [ ] Add tests for heading parsing and fallback script content.

### Task 2: Global Episode Navigation State

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx`
- Test: `src/web-ui/src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts`

- [ ] Rename panel state to `activeEpisodeId` and keep it outside individual stage components.
- [ ] On stage change, scroll to the matching episode anchor for the new stage.
- [ ] On content scroll, update `activeEpisodeId` from the closest visible anchor.
- [ ] Keep fallback behavior stable when an anchor is missing.

### Task 3: One Editable Script Markdown Surface

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss`

- [ ] Replace script-stage per-episode sections with a single `MEditor` surface.
- [ ] Use edit mode, no toolbar, no upload/import controls, no preview/source dropdown.
- [ ] Register heading anchors in the script surface for right-rail navigation.
- [ ] Do not trigger agent work when script content changes.

### Task 4: Thin Numeric Episode Rail

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss`

- [ ] Render Arabic episode numbers only.
- [ ] Remove rail title and episode title text.
- [ ] Keep sticky desktop behavior.
- [ ] Keep mobile usable without dropdowns.

### Task 5: Weak Non-Script Episode Separation And Fixed Tabs

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss`

- [ ] Keep non-script stages continuous.
- [ ] Make episode separation subtle and compact.
- [ ] Keep tabs fixed at the top of the panel.
- [ ] Remove tab overflow/dropdown affordances and avoid vertical tab scrolling.

### Task 6: Verification And Commit

**Files:**
- Test: short-drama focused tests
- Test: content canvas focused test

- [ ] Run `pnpm --dir src/web-ui run test:run src/shared/services/short-drama/ShortDramaProjectViewModel.test.ts src/shared/services/short-drama/ShortDramaStaticProject.test.ts src/shared/services/short-drama/ShortDramaArtifactWorkflow.test.ts`.
- [ ] Run `pnpm --dir src/web-ui run test:run src/app/components/panels/content-canvas/ContentCanvas.test.tsx`.
- [ ] Run `pnpm run type-check:web`.
- [ ] Run `pnpm run i18n:audit`.
- [ ] Run `pnpm run lint:web`.
- [ ] Review `git diff --check` and `git status`.
- [ ] Commit locally with a scoped short-drama message.
