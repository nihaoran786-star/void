# Scene presentation visibility design

## Goal

Mounted scenes preserve UI state, but a background tab or hidden desktop window
must not continue presentation-only subscriptions, shortcuts, polling, or global
media navigation listeners. Agent managers and running tasks remain untouched.

## Boundary

```text
SceneViewport tab activity + document visibility
  -> scene isActive
  -> ContentCanvas isSceneActive
  -> presentation hooks and effects
```

`SceneViewport` owns only the visibility signal. CSS classes and `aria-hidden`
continue to reflect the selected tab, while `isActive` passed to scene content
means `selected tab && visible document`. File viewer and detached panel scenes
forward that signal to their existing generic `ContentCanvas` boundary.

## ContentCanvas lifecycle

- Active: shortcuts, one FlowChat subscription, global media/short-drama open
  listeners, media discovery, optional short-drama restore, and BTW main-session
  navigation may run.
- Inactive: all of the above presentation work is stopped; canvas/store state is
  retained and manager-owned generation continues.
- Resume: the latest FlowChat state is read synchronously before one subscription
  is installed, then presentation work may restart.

No manager, task runner, session producer, route, adapter, or persistent business
state changes are included.

## Controls

- Document visibility is exposed through one `useSyncExternalStore` hook with a
  stable `visibilitychange` listener and an SSR-visible fallback.
- Existing active-tab CSS and accessibility semantics are tested separately from
  presentation activity.
- Tests assert zero hidden subscriptions/listeners through public effects and
  validate latest-state resume behavior.
