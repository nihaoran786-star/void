# Web UI Performance Phase 1 Design

## Context

The desktop Web UI currently pays for heavyweight features before they are used and keeps some background work alive after the related scene becomes inactive.

Measured production-build baseline before this phase:

- entry JavaScript: approximately 8.29 MB uncompressed;
- entry CSS: approximately 1.31 MB uncompressed;
- total JavaScript: approximately 13.5 MB;
- `public/monaco-editor`: approximately 13.30 MB;
- browser URL synchronization: one Tauri command every 500 ms per mounted browser surface, including inactive surfaces.

The Vite file-watcher CPU regression was fixed separately in commit `0b0d85bc9`. This design addresses application startup and runtime work, not development-server watching.

## Goals

1. Stop browser URL polling whenever its browser surface or the desktop document is inactive.
2. Preserve browser WebView state across scene switches.
3. Remove Monaco runtime, loader, and CSS dependencies from the application entry path.
4. Keep Monaco initialization behavior intact when an editor is opened.
5. Restore an effective lazy boundary for the short-drama center and editor panels.
6. Add automated boundary tests so later barrel exports cannot silently undo the split.
7. Keep the change reviewable as an isolated frontend performance patch.

## Non-goals

- Removing the packaged Monaco AMD assets. The application currently mixes an AMD loader with ESM editor consumers; converting that runtime is a separate high-risk phase.
- Upgrading React or introducing React 19 `Activity`.
- Changing Tauri commands, browser backend behavior, short-drama generation, agent sessions, skills, or media persistence.
- Replacing every polling loop in the application. This phase establishes the browser pattern and leaves media indexing for a backend-aware phase.
- Redesigning UI appearance.

## Considered Approaches

### A. Vite-only chunk configuration

Add `manualChunks` rules for Monaco and short drama. This is low effort but does not solve static imports, entry CSS, hidden timers, or eager module evaluation. It may create named files without reducing startup work.

### B. Full scene and Monaco runtime rewrite

Introduce a four-state scene lifecycle and replace the AMD Monaco runtime with ESM workers immediately. This has the largest theoretical payoff but couples two high-risk migrations and expands the regression surface across editor, LSP, diff, terminal, and WebView behavior.

### C. Boundary-first extraction (selected)

Keep current product behavior, but move work behind the boundaries that already exist:

- browser polling becomes a feature-local service controlled by explicit activity state;
- Monaco bootstrap moves from `main.tsx` into the editor module;
- `ThemeService` emits application theme state but no longer imports Monaco;
- editor and short-drama consumers import concrete files instead of heavyweight barrels.

This approach provides measurable startup and idle-runtime gains without changing backend contracts or persisted state.

## Architecture

### Browser URL polling

Owner: `src/web-ui/src/app/scenes/browser`.

The browser UI remains responsible for rendering state and deciding whether its surface is active. A feature-local polling service owns scheduling, document visibility, overlap prevention, and the Tauri URL read.

```text
BrowserScene / BrowserPanel
        | enabled + webview label + onUrl
        v
browserUrlPolling service
        | visibility-aware 500 ms schedule
        v
dynamic Tauri invoke(browser_get_url)
```

The service exposes a single start function returning a cleanup function. Starting with an inactive surface is not allowed; components call it only from an Effect whose dependencies include activity and the current WebView label. The service stops its interval when `document.hidden` becomes true, restarts when visible, prevents concurrent requests, and suppresses callbacks after disposal.

The WebView itself is still reparented to the existing hidden holder window. Only URL synchronization sleeps; browsing state is preserved.

### Monaco startup boundary

Owner: `src/web-ui/src/tools/editor`.

`main.tsx` must remain an application bootstrap and may not configure an optional editor runtime. Monaco loader paths, worker mapping, production resource diagnostics, and Monaco CSS move into an editor-owned runtime bootstrap invoked by `MonacoInitManager` immediately before `loader.init()`.

`ThemeService` continues to own application theme state and emits `theme:after-change`. It must not import `MonacoThemeSync`. The already editor-owned `ThemeManager` consumes theme events and applies Monaco-specific theme behavior after the editor module exists.

```text
main.tsx -> ThemeService -> CSS variables + theme event

lazy editor component
    -> MonacoInitManager
    -> MonacoRuntimeBootstrap
    -> AMD loader/workers + Monaco CSS
    -> ThemeManager / MonacoThemeSync
```

This design deliberately retains the existing loader strategy so editor behavior stays stable. Removing the AMD distribution belongs to a later design with editor/LSP integration tests.

### Feature import boundaries

Owner: each feature entry point.

- `FlexiblePanel` dynamically imports concrete editor components and `GitDiffEditor`; it does not import the `@/tools/editor` barrel.
- `FlexiblePanel` dynamically imports `ShortDramaCenterPanel.tsx` directly.
- `EmptyState` and `TabBar` import `ShortDramaEntry.tsx` directly.
- The short-drama public barrel remains available for external compatibility, but it is not used by the lightweight entry surfaces.
- A local Suspense boundary in `FlexiblePanel` owns the loading state for optional panel content.

These rules prevent a lightweight entry icon from statically reaching the complete short-drama center and prevent a common panel shell from statically reaching Monaco.

## State Model

No persisted state is added.

Browser polling uses explicit transient inputs:

```ts
type BrowserPollingState = {
  enabled: boolean;
  label: string | null;
  documentVisible: boolean;
  requestInFlight: boolean;
  disposed: boolean;
};
```

The component owns `enabled` and `label`. The polling service owns the remaining scheduling state. Empty labels never represent activity and do not start a timer.

## Error Handling

- URL polling keeps the existing best-effort behavior: transient IPC failures do not replace the visible page with an error.
- Only one URL read may be in flight. A slow backend cannot build an unbounded request queue.
- Cleanup is idempotent and prevents late asynchronous results from updating unmounted or inactive UI.
- Monaco initialization remains retryable through the existing `MonacoInitManager` promise reset.
- Monaco resource diagnostics run only when the editor runtime is requested and remain non-blocking.

## Testing

1. Unit-test the polling service with injected timers, visibility source, and URL reader:
   - starts while visible;
   - stops while hidden and resumes when visible;
   - prevents overlapping reads;
   - suppresses callbacks after cleanup.
2. Add source-boundary tests asserting:
   - `main.tsx` has no Monaco loader, worker, or CSS import;
   - `ThemeService` has no Monaco integration import;
   - `FlexiblePanel` has no editor or short-drama barrel import;
   - lightweight short-drama entry surfaces import `ShortDramaEntry` directly.
3. Run existing theme, browser, Monaco warmup, and short-drama tests.
4. Run Web UI type checking.
5. Run a production build and compare entry JS/CSS, chunk graph, and Vite static/dynamic-import warnings against the baseline.

## Coupling Constraints

- No Tauri command is added to a page, route, or shared generic hook.
- `main.tsx` receives no product or feature decision.
- `ThemeService` remains editor-agnostic.
- Browser polling cannot import scene stores; activity is passed explicitly by the component.
- Short-drama generation, assets, skills, subagents, and backend services remain untouched.
- No new dependency or package script is introduced.

## Rollback Conditions

Revert the relevant task before continuing if any of these occurs:

- browser WebView state is lost on scene switching;
- URL changes no longer synchronize after returning to an active browser scene;
- an editor opens without its current theme, workers, or production CSS;
- production build moves additional heavyweight code into the entry chunk;
- existing focused tests or type checking regress outside the changed boundary.

## Acceptance Criteria

- Inactive or document-hidden browser surfaces issue zero URL polling commands.
- Reactivate resumes URL synchronization without recreating a healthy WebView.
- `main.tsx` and `ThemeService` are statically independent of Monaco.
- The short-drama center is no longer made static by `ShortDramaEntry` imports.
- Editor panels remain functional and lazy.
- Focused tests, type checking, and production build pass.
- The final report includes before/after build evidence and remaining risks.
