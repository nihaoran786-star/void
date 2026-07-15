# Hidden Panel Runtime Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop presentation-only background work in hidden media and short-drama panels without interrupting generation, streaming, subagents, persistence, or session state.

**Architecture:** Reuse the existing scene/tab visibility chain and pass a default-true `isActive` prop into the two heavy panels. Each panel owns its timers and async-generation guard; no global visibility state or backend contract changes are introduced.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, JSDOM, Vite.

---

用户明确要求快速实现且不采用 TDD，因此本计划先做最小边界实现，再立即补定向回归测试；每个改动仍须在提交前通过完整的最小验证集合。

### Task 1: Close the visibility propagation boundary

**Files:**
- Modify: `src/web-ui/src/app/components/panels/base/FlexiblePanel.tsx`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.tsx`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx`

- [ ] Add `isActive?: boolean` to both heavy-panel prop contracts and default it to `true`.
- [ ] Pass the existing `FlexiblePanel.isActive` value to both lazy panels:

```tsx
<WorkspaceMediaGallery workspacePath={resolvedWorkspacePath} isActive={isActive} />
<ShortDramaCenterPanel workspacePath={resolvedWorkspacePath} isActive={isActive} />
```

- [ ] Do not add a store, context, Tauri call, or new business status.

### Task 2: Suspend ContentCanvas auto-discovery while hidden

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/ContentCanvas.tsx`
- Test: `src/web-ui/src/app/components/panels/content-canvas/ContentCanvas.test.tsx`

- [ ] Add `!isSceneActive` to the media auto-open effect guard and dependency list.
- [ ] Keep an in-flight flag inside the effect so the immediate check and interval cannot overlap.
- [ ] Preserve the existing cancellation guard so an availability result from the previous visible period cannot call `handleOpenWorkspaceMedia`.
- [ ] Add fake-timer/deferred-promise tests for inactive, reactivation, non-overlap, and late-result behavior.
- [ ] Run:

```powershell
pnpm --dir src/web-ui exec vitest run src/app/components/panels/content-canvas/ContentCanvas.test.tsx
```

Expected: all ContentCanvas tests pass.

### Task 3: Suspend WorkspaceMediaGallery presentation work

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.tsx`
- Test: `src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx`

- [ ] Replace the single global scan lock with an activity-epoch-aware lock. A scan from epoch N may finish, but cannot commit into epoch N+1 or block epoch N+1 from scanning.
- [ ] Guard initial scan/trash refresh, 5-second polling, refresh-token retry timers, active preview resolution, and deleted-item preview resolution with `isActive`.
- [ ] Clear only stale `loading` preview markers on deactivation so they can be retried; retain ready preview URLs and all selection/filter/pending-generation state.
- [ ] Scope media pausing to the gallery root:

```ts
root.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => media.pause());
```

- [ ] Add regression tests for hidden inactivity, immediate activation, retained refresh token, stale async rejection, retryable previews, and pause-without-autoplay.
- [ ] Run:

```powershell
pnpm --dir src/web-ui exec vitest run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx
```

Expected: all WorkspaceMediaGallery tests pass.

### Task 4: Suspend ShortDramaCenterPanel presentation work only

**Files:**
- Modify: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx`
- Create: `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.presentation.test.tsx`

- [ ] Guard only the empty-project timeout/interval, display-only workspace media scan, pending scroll RAF, and script scroll listener with `isActive`.
- [ ] Add a panel-root ref and pause its `video`/`audio` elements when hidden; never call `play()` on activation.
- [ ] Preserve project loading, project-changed events, ToolRunBus, FlowChat subscriptions, agent bootstrap/bindings, runtime bridge, main-AI context export, runtime-focus persistence, generation, and asset writes.
- [ ] Add a focused presentation lifecycle test or a source-contract test if the full component harness would require mocking unrelated business services. The test must prove guarded presentation effects and must prove protected business effects are not gated by `isActive`.
- [ ] Run:

```powershell
pnpm --dir src/web-ui exec vitest run src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.presentation.test.tsx
```

Expected: the presentation lifecycle contract passes.

### Task 5: Verify the complete slice

**Files:**
- Verify all files listed above.

- [ ] Run the three focused test files together.
- [ ] Run `pnpm run type-check:web`.
- [ ] Run the production Web build using the repository's existing build command.
- [ ] Run `node scripts/check-web-performance-budget.mjs --dist=<production-dist>`.
- [ ] Run `git diff --check` and inspect that no generated build output is staged.
- [ ] Obtain an independent read-only review requiring no Critical or Important findings before commit.
