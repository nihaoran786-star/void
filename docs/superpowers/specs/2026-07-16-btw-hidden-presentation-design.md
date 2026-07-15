# BTW Hidden Presentation Lifecycle Design

## Problem

Retained editor tabs are hidden with `display: none`, so a mounted BTW panel must
not be treated as visible. Previously every mounted `BtwSessionPanel` subscribed
to the complete `FlowChatStore`. Hidden panels therefore received unrelated
session notifications and child-token updates, while their scroll effects,
animation frames, state-machine subscription, content timer, skills request,
resize observer, and nested FlowChat presentation effects stayed active.

Review completion and persisted-state restoration are different: those are
business lifecycle coordination and must continue while the panel is hidden.
Pausing them would lose completed, failed, cancelled, or interrupted transitions.

## Goals

- Freeze the BTW transcript and release presentation-only work while hidden.
- Resume from the latest child and parent sessions without an old-frame flash.
- Keep Review lifecycle transitions and history hydration live while hidden.
- Preserve mounted local state, including the composer draft, attachments,
  expanded tool cards, review minimization, and scroll-follow intent.
- Never cancel a session, history request, or manager operation because a tab is
  hidden or unmounted.

## Non-goals

- No transcript virtualization or panel unmounting in this change.
- No changes to `FlowChatManager`, the state machine, cancellation APIs,
  `DeepReviewActionBar` notification timing, Terminal, TaskDetail, short-drama,
  or media-generation modules.
- No changes to the desktop development process or generated version files.

## Module boundary

```text
EditorGroup visibility
  -> FlexiblePanel isActive
    -> BtwSessionPanel
       -> useBtwSessionSnapshots
          -> presentation snapshot (visible only)
          -> lifecycle snapshot (semantic changes only, always subscribed)
       -> FlowChatPresentationActivityProvider (message subtree only)

ReviewActionBar remains outside the presentation provider.
FlowChatManager / adapters / cancellation APIs remain unchanged.
```

`FlexiblePanel` only forwards visibility. It does not infer Review state or call
the chat store. `useBtwSessionSnapshots` is the only conversion layer between the
legacy store and the two BTW UI lifecycles.

## Snapshot model

### Presentation snapshot

The presentation snapshot contains only the child and parent `Session`
references. Initial and resume reads are direct `Map.get` operations. While
active, the hook subscribes to `FlowChatStore` and publishes only when either
session reference changes. While hidden, it unsubscribes and freezes the last
snapshot. An active render reads the current map synchronously, so resuming does
not paint the old session before the effect subscription is installed.

### Review lifecycle snapshot

The lifecycle subscription stays installed while hidden, but it must not use the
whole `Session` reference as its equality key. It publishes a new full-session
payload only when a compact semantic signal changes:

- requested session presence, ID, status, and error;
- turn count and last turn ID, status, and error;
- last-round count, ID, status, error, completion, and streaming state;
- last-item count, ID, type, status, and streaming state;
- last tool name/call ID/result success/error;
- a stable, cached fingerprint when the last tool is `submit_code_review`.

Text content is deliberately excluded. Streaming body-token updates therefore
return the previous lifecycle snapshot reference and do not re-render the BTW
panel. A terminal turn or last-item semantic transition samples the complete
session payload, so structured results that are not the final item remain
available to Review coordination. Result fingerprints, including JSON-string
reports, are compact hashes cached by the stable result/tool-item object in a
`WeakMap`, avoiding repeated O(n) hashing on unrelated store notifications.

The lifecycle payload is also the fallback for history hydration. This lets a
historical child that is created while the panel is hidden begin loading without
activating transcript presentation.

## Presentation effects

| Work | Hidden | Resume |
| --- | --- | --- |
| FlowChat presentation session refs | unsubscribe and freeze | synchronous current read, then subscribe |
| Nested transcript/tool-card effects | provider reports inactive | provider reports active |
| State-machine UI subscription | unsubscribe | read current execution state, then subscribe |
| Wheel/scroll listeners | remove | install and measure once |
| Auto-scroll animation frame | cancel pending frame | schedule once only when auto-follow is retained |
| Content-growth timeout | clear and do not schedule | derive current processing state and schedule if needed |
| Composer skills request | defer; an in-flight result is ignored by its existing cleanup | load current mode skills |
| Review action-bar `ResizeObserver` | disconnect | measure once and observe |
| History load / persisted Review load | continue; no visibility dependency | no duplicate visibility-triggered load |
| Review lifecycle coordination | continue through narrow signal | continue without replaying token updates |

`FlowChatPresentationActivityProvider` wraps only the message presentation
subtree. `ReviewActionBar` stays outside it so its existing long-running
notification and clock behavior is not accidentally paused.

## Safety invariants

- Visibility effects never call `agentAPI.cancelSession`, `btwAPI.cancel`, or a
  manager cancellation method.
- Hiding does not unmount `BtwSessionPanel`.
- History and persisted Review promises do not depend on `isActive` and do not
  receive hide-specific cleanup.
- `shouldAutoScrollRef` survives hiding; resume scrolls only when the user had
  not opted out of auto-follow.
- The optional `isActive` prop defaults to `true`, preserving the MiniApp caller
  that mounts BTW directly.

## Verification matrix

- Hidden panels have one lifecycle store subscription and no presentation store
  subscription, state-machine listener, RAF, content timeout, skills fetch, or
  `ResizeObserver`.
- Body-token changes keep the narrow lifecycle snapshot reference; terminal
  status, error, result, and missing-to-present child changes replace it.
- Resuming immediately renders the latest child/parent and execution state.
- The transcript provider reports inactive/active correctly, while
  `ReviewActionBar` remains outside and active.
- A child created while hidden can start history hydration.
- Hidden Review completion updates action state exactly once.
- Hide and unmount call no session cancellation API.
- `FlexiblePanel` contains no store, Review, or cancellation decisions.
