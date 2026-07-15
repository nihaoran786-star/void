# Hidden terminal presentation boundary

## Goal

Keep terminal sessions, backend subscriptions, acknowledgements, exit/error handling,
and registered terminal actions alive while removing per-event xterm rendering and
backend resize traffic from hidden editor tabs.

## Boundary

- `FlexiblePanel` only forwards its existing `isActive` presentation signal.
- `ConnectedTerminal` is the sole conversion layer from presentation activity to
  xterm work. It defaults `isActive` to `true` for callers outside `FlexiblePanel`.
- `Terminal`, `useTerminal`, and `TerminalService` retain their connection,
  acknowledgement, replay, input, exit, and error semantics.
- Hiding a tab never unmounts or closes the terminal session.

## Output state model

`ConnectedTerminal` owns two independent ref-backed queues:

1. The history replay queue contains replay resize/data events. Only draining this
   queue may establish the post-history cursor guard and replay-width protection.
2. The hidden live queue contains live output received before xterm is ready or
   while the panel is inactive. Small events are coalesced into one xterm write.

Every drain atomically exchanges the current queue for a new empty queue before
writing. Events arriving during an in-flight drain therefore enter the next batch.
Whenever both queues are drained, replay is always written before live output.
A generation token prevents a delayed history marker callback from reinstalling an
obsolete cursor after real live content has advanced the terminal. Hidden live queue
items therefore record whether they contain real non-cursor content. Raw cursor-only
events and already transformed cursor/restore sequences preserve a pending marker so
later cursor updates can still use the restored history position. A live-only drain
cannot advance post-history cursor semantics.

Replay-width protection has a separate lifetime from the cursor generation. Every
scheduled marker generation is tracked in a pending set. Real live content invalidates
the cursor generation immediately, but the width lock remains until every pending
marker callback confirms that its preceding replay has been parsed. The last stale
marker releases the width lock only when no valid post-history cursor guard exists.
All positive-to-zero width-lock transitions use one release path. If the terminal is
active, that transition performs one `fit()` and `forceRedraw()` after marker parsing;
subsequent live events see an already-cleared lock and do not repeat layout work. If
the terminal is hidden, release performs no layout work and the next activation frame
provides the single fit/redraw. Activation captures the presentation refresh version
when its frame is scheduled, so a marker refresh that runs before the frame or during
its drain prevents a duplicate refresh in that frame.

Hidden output is batch-drained once xterm is ready and either the combined payload
reaches 1 MiB or the combined history/live queue reaches 2048 items. These are soft
batching thresholds, not hard memory limits: one backend event can exceed the
character threshold, and detached/in-flight batches overlap with newly arriving
data. Without xterm parser backpressure and coordinated backend acknowledgement,
this layer does not claim a strict memory bound.

## Activation and layout

On activation, a cancellable animation frame drains history then live output, then
runs `fit()` and `forceRedraw()`. A generation check and frame cancellation prevent
rapid tab switches from running stale work or writing a batch twice. Active live
output drains any pending queues before direct writes.

`autoFocus` and the resize callback are supplied to `Terminal` only while active.
`handleResize` also checks the current activity ref, so a stale callback cannot send
a backend resize after the tab becomes hidden.

## Deliberate non-goals

- Do not disconnect `useTerminal`, suppress acknowledgements, unregister actions,
  or cancel a session on hide.
- Do not change `Terminal` visibility observers or backend transport behavior.
- Do not claim a hard memory cap without xterm backpressure and acknowledgement
  coordination; the current thresholds only limit batching cadence.
