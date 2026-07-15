# Hidden embedded presentation lifecycle implementation plan

## Scope

Allowed production areas:

- `src/web-ui/src/flow_chat/tool-cards`
- `src/web-ui/src/tools/generative-widget`
- `src/web-ui/src/flow_chat/components/modern`

No FlowChat manager, agent execution, tool production store, route, API adapter,
or shared business-state changes are permitted.

## Implementation

1. Stabilize MCP string result parsing and derive a primitive resource key.
2. Add a fixed-size successful-resource cache and same-key in-flight request
   coalescing.
3. Gate MCP iframe rendering and bridge registration on presentation activity.
4. Track and clear initialization timers, response timers, event-bus listeners,
   and all asynchronous bridge continuations.
5. Add the optional generic widget `isActive` contract and rebuild its iframe
   from retained code/theme state on resume.
6. Adapt the FlowChat widget card to the presentation context without importing
   FlowChat dependencies into the generic tools layer.
7. Replace three VirtualMessageList ChatInput selectors with one
   presentation-scoped external-store snapshot.
8. Add focused tests for active, inactive, resume, request reuse, listener
   cleanup, and script replay.

## Verification contract

Run focused tests for:

- MCP resource fetch stability and iframe bridge cleanup/resume;
- generic widget iframe/listener teardown and script replay;
- tool-card activity prop adaptation;
- ChatInput active/frozen/resumed subscription snapshots;
- affected existing FlowChat presentation and virtual-list tests.

Then run Web UI TypeScript `--noEmit` and `git diff --check`.

## Completion checks

- Hidden MCP and generative widget iframe counts are zero.
- Hidden ChatInput presentation listener count is zero.
- Resume uses the latest input snapshot.
- MCP resume does not refetch an already loaded resource.
- A new generative widget iframe reruns executable widget code once.
- Existing MCP bridge methods and tool confirmation actions remain unchanged.
- The diff contains no manager/store production-chain edits and no unrelated
  refactor.
