# Scene presentation visibility implementation plan

## Scope

Allowed areas are `app/hooks`, `app/scenes`, `ContentCanvas`, their focused tests,
and these performance documents. Browser and MiniApp runtimes, managers, task
execution, stores, routes, and external adapters are excluded.

## Steps

1. Add a document visibility hook backed by `visibilitychange`.
2. Combine document visibility with selected-tab activity in `SceneViewport`
   without changing its CSS or `aria-hidden` behavior.
3. Forward presentation activity through FileViewerScene and PanelViewScene to
   `ContentCanvas`.
4. Gate canvas shortcuts, FlowChat subscription, global open listeners, media
   polling, short-drama restore, and BTW navigation on `isSceneActive`.
5. On resume, read current FlowChat state before establishing one subscription.
6. Verify the visibility hook, viewport propagation, hidden listener release,
   resume behavior, and BTW navigation lifecycle with focused tests.

## Verification contract

- Focused Vitest files for the hook, viewport, and ContentCanvas pass.
- Web UI TypeScript and scoped ESLint pass.
- `git diff --check` reports no whitespace errors.
- The diff contains no manager/task-production changes and no Browser/MiniApp
  changes.
