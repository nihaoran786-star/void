# Deep Review Hidden Presentation Lifecycle Design

## Problem

`BtwSessionPanel` is retained while its editor tab is hidden. The Review action
bar previously treated every retained instance as visible:

- its one-second interval updated React state while hidden;
- the same interval polled `FlowChatStore` indirectly because progress was read
  with `getState()` during each elapsed-time render;
- the three-minute notification shared the interval and reset its start time
  after the notification state changed;
- BTW selected the complete per-session action state, so queue-only updates
  rerendered the whole retained panel;
- every action-store commit cloned completion sets, and persistence compared set
  references, so queue-only updates rearmed the persistence debounce.

The Review phase coordinator, persisted-state hydration, and long-running notice
are business lifecycle work. They must continue while hidden. Elapsed text,
progress rendering, height observation, and the transcript are presentation work
and may be frozen.

## Goals

- Keep exactly one three-minute deadline for each continuous running lifecycle,
  including while its tab is hidden or its action bar is minimized.
- Run the one-second elapsed clock only while the action bar is visible and has
  progress text to accompany it.
- Preserve the original start time across hide/show and across non-terminal
  updates; entering a terminal phase clears both timer classes.
- Make reviewer progress update from an explicit presentation session or an
  active-aware store subscription, never from elapsed-clock polling.
- Prevent queue-only updates from rerendering a hidden BTW panel or rearming the
  review-state persistence debounce.
- Preserve per-session state, hidden Review completion, persistence loading,
  phase coordination, and all existing action handlers.

## Non-goals

- No changes to `FlowChatManager`, `AgentAPI`, Review event handling, cancellation
  APIs, Rust, Terminal, media generation, or generated version files.
- No transcript virtualization or unmount-on-hide behavior.
- No change to notification copy or the three-minute threshold.

## Module boundary

```text
Editor visibility
  -> BtwSessionPanel isActive
     -> explicit presentationSession + isActive
        -> ReviewActionBar presentation snapshot

Review action store
  -> narrow phase/session lifecycle subscription (always live)
     -> one long-running deadline
  -> active-only presentation subscription
     -> controls, progress, elapsed text

FlowChatStore
  -> Btw presentation snapshot, passed explicitly
  -> direct ActionBar fallback subscription (active only)
```

`BtwSessionPanel` remains the composition boundary. It passes the already-frozen
presentation session from `useBtwSessionSnapshots`; it does not move Review
business decisions into the page. Direct action-bar callers that do not pass a
session use an explicit, active-aware `FlowChatStore` subscription so progress
does not become stale after the old elapsed polling is removed.

Minimizing hides the action-bar wrapper instead of unmounting it. The retained
bar receives `isActive=false`, so its business deadline remains mounted while
its presentation subscription and elapsed interval stop. A memoized boundary
and a frozen session prop prevent active transcript updates from rerendering the
minimized action-bar subtree. Restore forwards the newest session immediately.

## Timer model

A continuous running lifecycle is any uninterrupted sequence of
`review_running`, `fix_running`, or `resume_running` phases. It owns one stable
`startedAt` value.

- A single timeout is scheduled for `startedAt + 3 minutes`.
- The timeout remains scheduled while hidden and notifies at most once.
- Queue updates, translations, elapsed ticks, and transitions between running
  phases do not reset `startedAt`.
- A non-running phase clears the deadline and elapsed interval and resets the
  lifecycle for the next run.
- The one-second interval exists only when `isActive` is true and a progress
  summary is rendered. On resume, elapsed time is derived from `Date.now()` and
  the stable start instead of replaying missed ticks.

## Snapshot model

The action bar has two subscriptions:

1. A lifecycle selector reads only the scoped session ID and phase and remains
   subscribed while hidden. It exists solely for deadline correctness.
2. A presentation snapshot subscribes only while active and freezes while
   hidden. Activation reads the latest store snapshot synchronously.

Reviewer progress uses `presentationSession`. BTW supplies it explicitly. The
direct-caller fallback subscribes to the requested session reference in
`FlowChatStore` only while active. No timer callback reads session progress.

BTW's own action-bar selector returns shallow primitive values only: phase,
minimized state, owner ID, submitted action, and precomputed counts. Set and
array references never escape that selector, so queue-only clones compare equal.

## Persistence model

Persistence compares the logical fields it stores:

- phase;
- minimized state;
- custom instructions;
- completed-remediation set contents.

Set order and object identity are irrelevant. A queue-only commit therefore
leaves an existing debounce deadline untouched and does not schedule a new one.
Debounces are stored in a per-session map: a real pending change for session A
cannot be cancelled or delayed by a queue update or a real change for session B.
Each timeout captures the logical state that caused it.

## Safety invariants

- Hiding never calls a cancel or stop API.
- Hidden Review completion and persisted-state hydration remain live.
- Minimizing retains the action lifecycle and never cancels its deadline.
- `ReviewActionBar` keeps `isActive=true` as its compatibility default.
- Direct callers still receive live progress while active.
- Multiple scoped action bars own independent timers and snapshots.
- No business policy is added to `FlexiblePanel` or page composition code.

## Verification matrix

- Hidden running action bar: zero elapsed intervals, one notification deadline.
- Hide/show: elapsed derives from the original start and does not reset.
- Three minutes: one notification only; later ticks never jump backward.
- Terminal phase: deadline and elapsed interval are cleared.
- Explicit session and direct fallback: progress updates without elapsed polling.
- Hidden queue-only action update: BTW render count is unchanged.
- Minimized action bar: retained with inactive presentation; session churn does
  not rerender it, and restore receives the latest session.
- Reactivation: latest presentation session is rendered immediately.
- Queue-only store update: an existing persistence debounce is not rearmed.
- Concurrent session persists: independent deadlines complete without
  cross-session cancellation.
- Two scoped sessions: phase/timer updates remain isolated.
