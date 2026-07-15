# Web UI Performance Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop inactive browser polling and remove Monaco, editor panels, and the short-drama center from the Web UI startup dependency path without changing product behavior.

**Architecture:** Browser URL synchronization becomes a feature-local visibility-aware service controlled by explicit activity inputs. Monaco configuration moves from the application entry into the editor owner module, while concrete lazy imports replace heavyweight barrels. Static boundary tests protect the resulting dependency direction.

**Tech Stack:** React 18, TypeScript, Vitest, Vite 7, Tauri 2 APIs, Monaco Editor.

---

## File Map

- Create `src/web-ui/src/app/scenes/browser/browserUrlPolling.ts`: feature-local URL polling adapter and lifecycle scheduler.
- Create `src/web-ui/src/app/scenes/browser/browserUrlPolling.test.ts`: timer, visibility, overlap, and cleanup contract tests.
- Modify `src/web-ui/src/app/scenes/browser/BrowserScene.tsx`: render browser state and activate the polling service.
- Modify `src/web-ui/src/app/scenes/browser/BrowserPanel.tsx`: render panel state and activate the polling service.
- Create `src/web-ui/src/tools/editor/services/MonacoRuntimeBootstrap.ts`: editor-owned loader, worker, CSS, and diagnostics configuration.
- Create `src/web-ui/src/tools/editor/services/MonacoRuntimeBootstrap.test.ts`: loader and worker mapping contract tests.
- Modify `src/web-ui/src/tools/editor/services/MonacoInitManager.ts`: invoke editor-owned runtime bootstrap immediately before loader initialization.
- Modify `src/web-ui/src/main.tsx`: remove optional Monaco feature initialization.
- Modify `src/web-ui/src/infrastructure/theme/core/ThemeService.ts`: emit app theme state without importing Monaco.
- Modify `src/web-ui/src/infrastructure/theme/index.ts`: stop re-exporting the Monaco integration from the general theme barrel.
- Modify `src/web-ui/src/tools/editor/services/ThemeManager.ts`: keep Monaco theme synchronization inside the loaded editor feature.
- Modify `src/web-ui/src/infrastructure/theme/core/ThemeService.test.ts`: remove obsolete Monaco mock and preserve application-theme tests.
- Modify `src/web-ui/src/app/components/panels/base/FlexiblePanel.tsx`: lazy-load concrete editor, diff, and short-drama implementations.
- Modify `src/web-ui/src/app/components/panels/content-canvas/empty-state/EmptyState.tsx`: import only the lightweight short-drama entry.
- Modify `src/web-ui/src/app/components/panels/content-canvas/tab-bar/TabBar.tsx`: import only the lightweight short-drama entry.
- Create `src/web-ui/src/app/performance/performanceImportBoundaries.test.ts`: source-level regression checks for startup boundaries.
- Create `docs/architecture/web-ui-performance-boundaries.md`: durable dependency and lifecycle rules.

## Task 1: Visibility-aware browser URL polling

**Files:**

- Create: `src/web-ui/src/app/scenes/browser/browserUrlPolling.ts`
- Create: `src/web-ui/src/app/scenes/browser/browserUrlPolling.test.ts`
- Modify: `src/web-ui/src/app/scenes/browser/BrowserScene.tsx`
- Modify: `src/web-ui/src/app/scenes/browser/BrowserPanel.tsx`

- [ ] **Step 1: Write failing polling contract tests**

Define fake interval and visibility sources and verify this public contract:

```ts
const stop = startBrowserUrlPolling({
  label: 'browser-1',
  intervalMs: 500,
  visibility,
  timers,
  readUrl,
  onUrl,
});

expect(timers.activeCount()).toBe(1);
visibility.setHidden(true);
expect(timers.activeCount()).toBe(0);
visibility.setHidden(false);
expect(timers.activeCount()).toBe(1);
stop();
expect(timers.activeCount()).toBe(0);
```

Add separate tests proving a pending `readUrl` prevents a second request and a result resolved after `stop()` does not call `onUrl`.

- [ ] **Step 2: Run the new tests and confirm the missing-module failure**

Run:

```powershell
pnpm --dir src/web-ui test:run src/app/scenes/browser/browserUrlPolling.test.ts
```

Expected: FAIL because `browserUrlPolling.ts` does not exist.

- [ ] **Step 3: Implement the polling service**

Expose injected interfaces for tests and browser defaults for production:

```ts
export interface BrowserPollingVisibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface BrowserPollingTimers {
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

export interface StartBrowserUrlPollingOptions {
  label: string;
  intervalMs?: number;
  visibility?: BrowserPollingVisibility;
  timers?: BrowserPollingTimers;
  readUrl?: (label: string) => Promise<string>;
  onUrl: (url: string) => void;
}

export function startBrowserUrlPolling(options: StartBrowserUrlPollingOptions): () => void;
```

The default reader dynamically imports `@tauri-apps/api/core` and calls `browser_get_url`. The scheduler must maintain `disposed`, `inFlight`, and a nullable interval handle. `visibilitychange` stops or restarts the interval, cleanup is idempotent, and asynchronous completion checks `disposed` before calling `onUrl`.

- [ ] **Step 4: Run polling tests**

Run the command from Step 2.

Expected: all polling contract tests PASS.

- [ ] **Step 5: Integrate both browser surfaces**

In each component:

1. replace `urlPollTimerRef` with `pollingLabel` state;
2. set the current label after a WebView is successfully created;
3. remove interval creation from `loadUrl`;
4. add a stable URL-update callback preserving `currentUrlRef`, input state, current URL state, error clearing, and intercept-script refresh;
5. start the service from an Effect only when Tauri, the surface activity flag, and `pollingLabel` are all truthy;
6. clear `pollingLabel` when the owned WebView closes.

`BrowserScene` uses its existing `isActive`; `BrowserPanel` uses its existing `shouldShowWebview`. Do not read scene stores from the polling service.

- [ ] **Step 6: Run browser regression tests and type checking**

```powershell
pnpm --dir src/web-ui test:run src/app/scenes/browser/browserUrlPolling.test.ts src/app/scenes/browser/browserUrlCheck.test.ts src/app/scenes/browser/browserWebviewLabels.test.ts
pnpm --dir src/web-ui run type-check
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/web-ui/src/app/scenes/browser
git commit -m "perf(browser): suspend inactive URL polling"
```

## Task 2: Move Monaco bootstrap behind the editor boundary

**Files:**

- Create: `src/web-ui/src/tools/editor/services/MonacoRuntimeBootstrap.ts`
- Create: `src/web-ui/src/tools/editor/services/MonacoRuntimeBootstrap.test.ts`
- Modify: `src/web-ui/src/tools/editor/services/MonacoInitManager.ts`
- Modify: `src/web-ui/src/tools/editor/services/ThemeManager.ts`
- Modify: `src/web-ui/src/main.tsx`
- Modify: `src/web-ui/src/infrastructure/theme/core/ThemeService.ts`
- Modify: `src/web-ui/src/infrastructure/theme/core/ThemeService.test.ts`
- Modify: `src/web-ui/src/infrastructure/theme/index.ts`

- [ ] **Step 1: Write failing Monaco bootstrap and source-boundary tests**

Test `configureMonacoRuntime` with a fake loader and fake Worker constructor:

```ts
const result = configureMonacoRuntime({ loader, runtimeWindow, isDev: false });

expect(loader.config).toHaveBeenCalledWith({ paths: { vs: './monaco-editor/vs' } });
const worker = runtimeWindow.MonacoEnvironment.getWorker('', 'typescript');
expect(worker.url).toBe('./monaco-editor/vs/language/typescript/tsWorker.js');
expect(result.monacoPath).toBe('./monaco-editor/vs');
```

Also assert JSON and unknown labels map to their existing worker files. In the source-boundary test, read `main.tsx` and assert it contains none of:

```ts
['@monaco-editor/react', 'editor.main.css', 'MonacoEnvironment', 'getMonacoPath']
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --dir src/web-ui test:run src/tools/editor/services/MonacoRuntimeBootstrap.test.ts src/app/performance/performanceImportBoundaries.test.ts
```

Expected: FAIL because the new modules and boundary do not exist yet.

- [ ] **Step 3: Implement editor-owned runtime bootstrap**

Move the existing path configuration and worker map without changing paths:

```ts
const MONACO_WORKER_MAP: Record<string, string> = {
  json: 'language/json/jsonWorker.js',
  css: 'language/css/cssWorker.js',
  scss: 'language/css/cssWorker.js',
  less: 'language/css/cssWorker.js',
  html: 'language/html/htmlWorker.js',
  handlebars: 'language/html/htmlWorker.js',
  razor: 'language/html/htmlWorker.js',
  typescript: 'language/typescript/tsWorker.js',
  javascript: 'language/typescript/tsWorker.js',
};
```

`MonacoRuntimeBootstrap.ts` owns the Monaco CSS import, loader configuration, worker factory, and delayed production resource diagnostic. `MonacoInitManager.doInitialize()` calls it immediately before `loader.init()`.

Delete the corresponding imports and executable block from `main.tsx`; application startup must no longer log or check Monaco resources.

- [ ] **Step 4: Decouple application theme state from Monaco**

Remove the static `MonacoThemeSync` import and call from `ThemeService`, and remove its re-export from `infrastructure/theme/index.ts`.

Update the editor-owned `ThemeManager` event listener to invoke `monacoThemeSync.syncTheme(event.theme)` after the editor has loaded. Preserve custom-theme registration and update `currentThemeId` with `getTargetMonacoThemeId`.

Remove the obsolete Monaco mock from `ThemeService.test.ts`; do not weaken existing CSS-token assertions.

- [ ] **Step 5: Run focused tests and type checking**

```powershell
pnpm --dir src/web-ui test:run src/tools/editor/services/MonacoRuntimeBootstrap.test.ts src/tools/editor/services/MonacoStartupWarmup.test.ts src/infrastructure/theme/core/ThemeService.test.ts src/infrastructure/theme/presets/startupThemeBootstrap.test.ts src/app/performance/performanceImportBoundaries.test.ts
pnpm --dir src/web-ui run type-check
```

Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/web-ui/src/main.tsx src/web-ui/src/tools/editor/services src/web-ui/src/infrastructure/theme src/web-ui/src/app/performance
git commit -m "perf(editor): defer Monaco runtime bootstrap"
```

## Task 3: Restore editor and short-drama lazy boundaries

**Files:**

- Modify: `src/web-ui/src/app/components/panels/base/FlexiblePanel.tsx`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/empty-state/EmptyState.tsx`
- Modify: `src/web-ui/src/app/components/panels/content-canvas/tab-bar/TabBar.tsx`
- Modify: `src/web-ui/src/app/performance/performanceImportBoundaries.test.ts`
- Create: `docs/architecture/web-ui-performance-boundaries.md`

- [ ] **Step 1: Extend the boundary test and verify it fails**

Read the three consumers as text and assert:

```ts
expect(flexiblePanel).not.toContain("from '@/tools/editor'");
expect(flexiblePanel).not.toContain("content-canvas/short-drama').then");
expect(emptyState).toContain("from '../short-drama/ShortDramaEntry'");
expect(tabBar).toContain("from '../short-drama/ShortDramaEntry'");
```

Run:

```powershell
pnpm --dir src/web-ui test:run src/app/performance/performanceImportBoundaries.test.ts
```

Expected: FAIL on current barrel imports.

- [ ] **Step 2: Replace heavyweight imports with concrete lazy imports**

At module scope in `FlexiblePanel`, define stable lazy components:

```ts
const CodeEditor = React.lazy(() => import('@/tools/editor/components/CodeEditor'));
const MarkdownEditor = React.lazy(() => import('@/tools/editor/components/MarkdownEditor'));
const ImageViewer = React.lazy(() => import('@/tools/editor/components/ImageViewer'));
const DiffEditor = React.lazy(() =>
  import('@/tools/editor/components/DiffEditor').then(module => ({ default: module.DiffEditor }))
);
const GitDiffEditor = React.lazy(() =>
  import('@/tools/git/components/GitDiffEditor/GitDiffEditor').then(module => ({ default: module.GitDiffEditor }))
);
const ShortDramaCenterPanel = React.lazy(() =>
  import('@/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel').then(module => ({
    default: module.ShortDramaCenterPanel,
  }))
);
```

Remove static editor and GitDiffEditor imports. Wrap `renderContent()` in a local `React.Suspense` using the existing panel loading class and translated loading copy.

Import `ShortDramaEntry` directly in `EmptyState` and `TabBar`. Do not modify the short-drama feature barrel or any short-drama business file.

- [ ] **Step 3: Add durable architecture documentation**

Document these enforceable rules in `docs/architecture/web-ui-performance-boundaries.md`:

- application bootstrap cannot import optional feature runtimes;
- lightweight entry surfaces cannot import full feature barrels;
- inactive mounted scenes must stop timers, observers, streams, and media work;
- external-system access remains in feature adapters/services;
- production build warnings and entry-size budgets are reviewed before merging.

Include the exact verification commands from this plan and link the design specification.

- [ ] **Step 4: Run boundary and related feature tests**

```powershell
pnpm --dir src/web-ui test:run src/app/performance/performanceImportBoundaries.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
pnpm --dir src/web-ui run type-check
```

Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 5: Run production build comparison**

```powershell
pnpm --dir src/web-ui exec vite build --outDir D:\codex\void-source\.void\perf-phase1-after --emptyOutDir --manifest
```

Compare `.vite/manifest.json`, entry JS/CSS sizes, total JS, and Vite warnings with `.void/perf-phase1-before`. The short-drama barrel warning must disappear. If entry JS or CSS grows, inspect the manifest before committing.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/web-ui/src/app/components/panels src/web-ui/src/app/performance docs/architecture/web-ui-performance-boundaries.md
git commit -m "perf(web-ui): restore optional feature splits"
```

## Task 4: Independent verification and handoff

**Files:**

- Inspect only: all files changed since `a15316c28`

- [ ] **Step 1: Run complete scoped verification**

```powershell
pnpm --dir src/web-ui run type-check
pnpm --dir src/web-ui test:run src/app/scenes/browser/browserUrlPolling.test.ts src/app/scenes/browser/browserUrlCheck.test.ts src/app/scenes/browser/browserWebviewLabels.test.ts src/tools/editor/services/MonacoRuntimeBootstrap.test.ts src/tools/editor/services/MonacoStartupWarmup.test.ts src/infrastructure/theme/core/ThemeService.test.ts src/infrastructure/theme/presets/startupThemeBootstrap.test.ts src/app/performance/performanceImportBoundaries.test.ts
pnpm --dir src/web-ui exec vite build --outDir D:\codex\void-source\.void\perf-phase1-after --emptyOutDir --manifest
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform coupling review**

Verify:

1. no business decisions were added to `main.tsx` or large page components;
2. activity state is explicit and passed into the browser polling boundary;
3. UI no longer owns the repeated Tauri URL command schedule;
4. no short-drama generation, agent, skill, or backend file changed;
5. the diff is one coherent performance phase;
6. tests cover module contracts and dependency boundaries.

- [ ] **Step 3: Run an independent read-only code review**

Review `git diff a15316c28..HEAD` for regressions in WebView lifecycle, async cleanup, Monaco initialization ordering, theme synchronization, Suspense fallback behavior, and accidental feature coupling. Critical or important findings must be fixed and re-reviewed before completion.

- [ ] **Step 4: Clean diagnostic build outputs**

Resolve and verify both diagnostic paths remain inside `D:\codex\void-source\.void`, then remove only `perf-phase1-before` and `perf-phase1-after`. Do not delete source `dist` or unrelated `.void` content.

- [ ] **Step 5: Record final evidence**

Report exact before/after entry sizes, focused test counts, type-check result, build result, remaining AMD Monaco risk, and manual desktop checks for the user.
