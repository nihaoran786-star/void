# Browser hidden presentation lifecycle

## Goal

Keep the Browser scene and Browser panel mounted so their native Webview or
iframe state survives tab switches, while stopping host-side work whenever the
scene, panel, or document is not presented.

## Ownership and data flow

`SceneViewport` owns scene/document visibility and passes the final boolean to
`BrowserScene`. `EditorGroup` already combines scene visibility and active-tab
state before passing `isActive` through `FlexiblePanel` to `BrowserPanel`.
Neither browser component reads `sceneStore`; the explicit prop is the only
presentation source.

```text
SceneViewport / EditorGroup
  -> final isActive
  -> BrowserScene / BrowserPanel
  -> browserPresentationLifecycle
  -> browserHolderWindowManager / browserWebviewSwap
  -> native Webview presentation + host listeners
```

## State contract

- `active`: the existing Webview is attached to the main window. URL polling,
  bounds observation, overlay observation, toolbar listener, and panel inspector
  may run. URL polling additionally requires confirmed non-zero host bounds.
- `collapsed`: CSS may reduce an otherwise-active Browser panel/scene host to
  zero bounds without changing upstream `isActive`. The current Webview is hidden,
  URL polling and panel inspector work stop immediately, while only the
  ResizeObserver/window-resize recovery channel remains mounted. A successful
  non-zero bounds sync restores presentation and polling.
- `hidden`: the same Webview is hidden/reparented. Host polling, observers,
  listeners, queued animation frames, and inspector listeners/scripts stop.
  Hiding never calls `close()`.
- `occluded`: a modal, mission-control view, or toolbar-mode transition changes
  the same presentation revision to hidden. The observer performs an immediate
  initial check, and `.void-toolbar-mode` is included alongside modal selectors.
  Toolbar mode publishes paired `activating` and `activation-failed` events. A
  pre-render activation failure therefore triggers immediate overlay
  reconciliation even when no toolbar DOM mutation ever occurs; a follow-up
  animation-frame check covers removal of toolbar DOM that had already mounted.
  Toolbar transitions are single-flight. Entering commits the toolbar React
  layout only after every native window mutation settles successfully; leaving
  keeps the toolbar layout mounted until native window restoration settles and
  commits the main layout in `finally`. Browser presentation can therefore
  never remount in the middle of a native resize/reposition operation.
  A component-local boolean mirrors this narrow status into React so polling,
  ResizeObserver/window listeners, and queued bounds RAF work are stopped and
  restored without subscribing to a broad global store.
- `disposed`: component teardown invalidates asynchronous work. Existing explicit
  teardown behavior remains unchanged in this batch.

The lifecycle gate assigns a revision to each state change. Every asynchronous
bounds or presentation operation captures a snapshot and rechecks it before and
after every dynamic import, double animation frame, bounds update, show, and
focus await. Overlay occlusion bumps the same revision before hiding. A rapid
active/hidden/active or modal transition therefore cannot let an older show,
focus, or bounds update win. A transition failure logs and best-effort hides the
handle; it never destroys page history as recovery.

## Native ownership

`browserHolderWindowManager` owns one module-level, app-lifetime holder Promise.
Scene and panel instances share the same native holder label. Concurrent callers
reuse the in-flight Promise, and failed creation is cleared for retry. React
cleanup has no holder release/close path because another hidden Webview may still
be parented to it; native application exit performs final reclamation.

URL navigation uses `browserWebviewSwap` as a two-phase transaction:

1. Keep the current handle, label, and polling identity authoritative.
2. Create the candidate inside the hidden holder, await creation, and hide it.
3. Candidate preparation may overlap, but a per-browser commit coordinator
   serializes publication, activation, rollback, and previous-handle retirement.
   A newer request can therefore never use an uncommitted/dead candidate as its
   rollback target.
4. Recheck the request and presentation revision, then atomically publish only
   the candidate handle/label. The authoritative URL and polling label remain on
   the previous page during activation.
5. Reparent, size, show, focus, and initialize the candidate under revision
   checks. Zero-size bounds return a blocked result and stop before show/focus.
   The transaction restores the previous slot, closes only the hidden candidate,
   and keeps the requested URL pending. ResizeObserver or the next presentation
   frame retries the whole navigation once the host has non-zero bounds; this
   also lets an initial navigation with no previous handle recover from blank.
6. Commit `currentUrlRef`, rendered current URL, and polling identity together
   only after successful activation.
7. Only after successful activation close the previous handle. Any stale or
   failed activation restores the previous slot and closes only the candidate.
   If a newer request supersedes a bounds-blocked activation while it is pending,
   the old transaction is classified as stale after rollback; consumers therefore
   do not hide the restored, still-visible previous page as a blocked host.

If hiding wins immediately after publication, the committed current handle is
hidden/reparented rather than destroyed. A rolled-back previous handle is also
parked according to the latest presentation snapshot.

## Preservation rules

- The non-Tauri iframe stays in the React tree; `src` and node identity are not
  changed by visibility.
- A hidden native Webview is retained and reparented to the holder window.
- URL navigation never closes the old Webview before its candidate is ready and
  successfully active.
- EditorGroup retains every open, non-hidden Browser tab outside the ordinary
  five-entry content LRU. Only a tab explicitly marked hidden or removed is
  unmounted/disposed, so switching among open tabs preserves browser state.
- No short-drama, FlowChat, Tauri native, or global scene semantics are changed
  here.

## Deferred debt

True hidden/removed tabs still dispose their component and Webview by design.
Persisting a browser after explicit removal would require a separate product
decision and a native registry keyed by stable tab id; it is not cache-retention
debt in this batch.

## Verification

- Pure lifecycle tests cover every asynchronous presentation boundary, overlay
  revisions, stale snapshots, repeated state, disposal/revival, switching, and
  the distinct zero-bounds polling versus resize-recovery gates.
- Pure holder/swap tests cover concurrent acquisition, retry, stale/failed or
  bounds-blocked candidates, pending-navigation token safety, overlapping
  latest-wins transactions, URL/polling commit rollback, atomic publication, and
  previous-handle retirement.
- Rendered component tests prove iframe node/src identity survives hidden renders;
  source contracts pin module wiring, the no-holder-close boundary, and host
  zero-size pending-navigation retry wiring.
- Focused Vitest, Web UI typecheck, scoped ESLint, and diff checks cover this
  batch before integration.
