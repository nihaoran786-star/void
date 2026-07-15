# Compact Chat Presentation Lifecycle Design

## Goal

Make Compact Chat presentation work demand-driven. When the floating window is
not open, closed, or minimized, the main window must not subscribe to chat
presentation stores, build mirrored turns, or emit cross-WebView snapshots.

## Boundaries

- `FlowChatStore` and `FlowChatManager` remain the business source of truth.
- `CompactChatPresentationPublisher` owns only presentation activity,
  coalescing, and async publication ordering.
- `CompactChatDesktopBridge` translates floating-window requests into
  publisher lifecycle commands and keeps the existing send/cancel path.
- `CompactChatWindowService` exposes native window activity; it does not read
  sessions or decide chat behavior.
- `App.tsx` and `main.tsx` only choose dynamic entrypoints. They contain no
  session or presentation derivation.

## State model

The publisher starts `suspended` and has no store subscription.

1. A mounted or restored floating window requests a presentation.
2. The main bridge activates the publisher, subscribes to legacy and modern
   presentation sources, and schedules one latest snapshot.
3. Repeated synchronous updates collapse into one cancelable microtask. This
   does not depend on the main WebView's rendering frames, which can pause when
   the main window is minimized or hidden.
4. Only one async publication may be in flight. Updates received during it
   schedule one follow-up publication.
5. Close or minimize increments the generation, removes the source
   subscription, cancels scheduled work, and prevents an unfinished snapshot
   build from emitting after suspension.
6. Reactivation publishes current source state instead of replaying hidden
   intermediate updates.
7. The floating window adapter intercepts native close requests (including
   Alt+F4), prevents WebView destruction, suspends publication, and routes the
   existing layout-close request through the main window.

## Window protocol

- `request-presentation`: activate/resume and publish current state.
- `suspend-presentation`: stop presentation work before minimizing.
- `close-request`: suspend immediately, restore the main layout, then destroy
  the floating WebView through the existing command.
- Native focus restoration requests a fresh presentation. A focus loss only
  suspends when the native window reports that it is minimized.
- Native close is intercepted by the window adapter and follows the same
  suspension-first close route as the visible close control.

## Entry closure

The floating UI is loaded only by the `?voidWindow=compact-chat` branch in
`main.tsx`. The main-window bridge is loaded lazily only in Tauri. Both paths
are required dynamic entries in the Web performance budget so they cannot
silently return to the default static entry.

## Preserved behavior

Message sending, cancellation, generation, subagents, session updates,
floating-window creation/reveal/resize/drag, and the 12-turn payload bound are
unchanged.
