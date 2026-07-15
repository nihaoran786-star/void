# Hidden embedded presentation lifecycle design

## Goal

Mounted but hidden FlowChat scenes must not keep MCP Apps, generative widget
iframes, window listeners, timers, or ChatInput layout subscriptions alive.
Hiding presentation work must not pause agent execution, tool results, stores,
message delivery, confirmation, rejection, or any manager-owned workflow.

## Boundary

The dependency direction remains:

```text
FlowChat presentation context
  -> FlowChat tool card
  -> generic iframe component isActive prop
```

`src/tools/generative-widget` is reusable infrastructure and must not import
FlowChat context or store modules. Tool cards are the adapter between FlowChat
presentation activity and generic embedded UI. No manager or store production
logic changes are part of this design.

## State model

- **active**: presentation selectors subscribe, iframe bridges and theme
  listeners are installed, and the sandbox is mounted.
- **inactive**: selectors expose their last stable snapshot without a Zustand
  listener; iframe DOM and all per-iframe listeners/timers are removed.
- **resume**: selectors read the latest store snapshot once; sandboxes are
  rebuilt from cached source data and repeat their own initialization protocol.

The activity signal is presentation-only. It never represents whether an
agent, tool call, or generation task is running.

## MCP App resource and bridge lifecycle

String tool results are parsed with `useMemo` using the raw result identity.
The first `ui://` URI is derived from that stable result. Resource identity is:

```text
serverId + "\0" + uiResourceUri
```

Successful resource loads are retained by the mounted card and also kept in a
module-local 16-entry LRU cache with a five-minute freshness window. Concurrent
requests for the same identity share one in-flight promise. Errors are not
cached, so a later active render can retry. Cached data includes only injected
HTML, metadata, and CSP; the unused duplicate raw HTML copy is not retained.
The component-local copy guarantees hide/resume does not refetch, while the
freshness window prevents a newly mounted card from using same-URI content
indefinitely after the server updates it. This is presentation data only; it
does not become application business state.

When presentation becomes inactive, the MCP iframe is unmounted and its bridge
disposes:

- the outer `window.message` listener;
- pending zero-delay post-initialization notifications;
- five-second `ui/message` response timeouts;
- pending `mcp-app:message-response` listeners;
- all late writes after awaited MCP calls or external-link operations.

On resume, the iframe is rebuilt without another resource fetch and completes
its own `ui/initialize` handshake. Tool input and completed tool result are sent
again to the new sandbox. Existing `tools/call`, `resources/read`, `ping`,
`ui/message`, `ui/open-link`, size, wheel, image/resource rendering, and
confirmation/rejection behavior remains available.

## Generative widget lifecycle

`GenerativeWidgetFrame` accepts `isActive?: boolean`, defaulting to `true` for
all existing callers. Inactive frames unmount their iframe and release outer
window and theme listeners. Widget code, measured height, and the latest theme
payload remain in React state. A new iframe resets its per-sandbox executed HTML
marker so `executeScripts` content runs once for that new sandbox.

`GenerativeWidgetToolCard` reads the FlowChat presentation context and passes it
to the generic frame. It also releases its Escape document listener and closes
an active selection menu when hidden.

## ChatInput layout snapshot

`VirtualMessageList` consumes one presentation-scoped snapshot containing
`isActive`, `isExpanded`, and `inputHeight`. While visible it uses one Zustand
listener and shallow field comparison. While hidden it has no listener and
retains the last snapshot. Resume synchronously reads the latest values before
re-subscribing.

## Risks and controls

- A resumed iframe is a new JavaScript realm, so ephemeral state inside the old
  sandbox is intentionally lost. Source and protocol state are replayed.
- The MCP cache is deliberately bounded to cap retained HTML memory.
- Disposed guards are required after every awaited bridge operation so an old
  iframe cannot receive a response intended for a resumed iframe.
- Tests assert lifecycle boundaries and public messages rather than internal
  cache implementation details.
