# FlowChat Scroll Stability

This document explains the scroll-stability mechanism used by `VirtualMessageList.tsx`.

Read this before changing any of the following:

- footer height / footer rendering in `VirtualMessageList.tsx`
- scroll compensation state or refs
- anchor-lock timing
- `ResizeObserver` / `MutationObserver` / transition listeners
- `flowchat:tool-card-collapse-intent`
- `tool-card-toggle`
- `overflow-anchor` styles in `VirtualMessageList.scss`

## Problem

FlowChat uses `react-virtuoso` for virtualization. When the user is already at or near the bottom, collapsing content near the end of the list can shrink total content height.

Without compensation, the browser clamps `scrollTop` downward immediately because the previous bottom position no longer exists. That causes the visible header/content above to drop.

If we compensate too late, the user sees a flash:

1. browser clamps `scrollTop`
2. code restores `scrollTop`
3. header appears to drop and jump back

If we restore without enough compensation, the final position is still wrong.

The goal of this mechanism is:

- keep the visible header/content vertically stable
- allow temporary invisible blank space at the bottom
- avoid the collapse flash

## High-Level Strategy

The fix is a two-stage approach:

1. Pre-compensate before a known collapse starts.
2. Reconcile with the real measured height delta after layout updates.

This prevents the "drop first, restore later" behavior while still using the actual measured shrink amount to settle on the correct final compensation.

## Core Building Blocks

## 1. Bottom Reservations

The footer uses a unified bottom-reservation model. Each reservation contributes
temporary tail space, but keeps its own semantics:

- `collapse`: shrink protection for height loss near the bottom
- `pin`: viewport positioning space for "pin turn to top" navigation

The rendered footer height is the sum of all active reservations.

Important details:

- the real footer height is `MESSAGE_LIST_FOOTER_HEIGHT + totalBottomReservationPx`
- reservation space is not real content height
- reservations may define a `floorPx`
- only reservation space above the floor is consumable
- all measurements that compare old vs new content height must use:

```ts
effectiveScrollHeight = scroller.scrollHeight - getTotalBottomCompensationPx()
```

If you forget to subtract reservation space, future shrink/growth calculations become wrong.

`pin` reservations use this extra metadata:

- `targetTurnId`: which user turn the viewport should align to
- `mode: 'transient' | 'sticky-latest'`
- `floorPx`: the minimum tail space needed to keep the pinned target stable

`sticky-latest` is used for explicit "align the latest turn's top with the
viewport top" navigation (session-open auto-pin, header jump to the latest
turn). Its floor can be reconciled from live DOM measurements as content grows
or shrinks.

Note: `sticky-latest` is NOT used for new streaming turns anymore. A new turn
enters bottom-follow immediately (see section C). While follow is active,
`pinTurnToTop` treats a `sticky-latest` request for the latest turn as already
handled and does not move the viewport, so pin alignment never fights the
continuous follow loop.

## 2. Synchronous Footer DOM Apply

React state alone is not enough here.

`applyFooterCompensationNow()` writes footer height directly to the DOM and forces layout reads:

- `footer.style.height`
- `footer.style.minHeight`
- `footer.offsetHeight`
- `scroller.scrollHeight`

This is intentional. It ensures the browser uses the new footer height in the same turn, before we restore the anchor.

If you move compensation back to "React render only", the flash can return because the DOM may still be one frame behind when `scrollTop` is restored.

## 3. Anchor Lock

`anchorLockRef` temporarily remembers the desired `scrollTop`.

It exists for two reasons:

- immediate restore right after compensation is applied
- follow-up enforcement during scroll events while the layout is still settling

The immediate restore handles the critical path. The scroll listener is the safety net.

## 4. Collapse Intent

Some collapses are predictable before layout actually shrinks.

`flowchat:tool-card-collapse-intent` is emitted before a known collapsible UI
shrinks. `VirtualMessageList` uses that event to:

- capture the pre-collapse anchor `scrollTop`
- capture the bottom distance before collapse
- estimate required compensation from current card height
- apply provisional compensation immediately

This pre-compensation is what avoids the flash.

If the list waits until `ResizeObserver` sees the shrink, the browser may already have clamped `scrollTop`.

## Runtime Flow

## A. Known Tool Card Collapse

When a helper-backed card or region is about to collapse:

1. it dispatches `flowchat:tool-card-collapse-intent` before the collapse state is applied
2. `VirtualMessageList` estimates the upcoming shrink using `cardHeight`
3. `VirtualMessageList` adds provisional footer compensation immediately
4. `VirtualMessageList` activates anchor lock using the current `scrollTop`
5. actual layout shrink happens
6. `ResizeObserver` / `MutationObserver` / transition listeners trigger `measureHeightChange()`
7. measured shrink reconciles the compensation to the real final value
8. anchor lock restores / enforces the final `scrollTop`

Common examples:

- `FileOperationToolCard`
- `ModelThinkingDisplay`
- `TerminalToolCard`
- `ExploreGroupRenderer`

## B. Unknown or Unsignaled Shrink

If a shrink happens without a collapse intent:

1. `measureHeightChange()` detects the negative height delta
2. compensation falls back to `shrinkAmount - distanceFromBottom`
3. anchor lock uses the previously known scroll position

This path is safer than doing nothing, but it is more likely to show visible movement than the pre-compensation path.

## Why Transition Tracking Exists

Some collapsible UI uses animated layout properties such as:

- `grid-template-rows`
- `height`
- `max-height`

During those transitions, the DOM may report intermediate sizes for multiple frames.

`layoutTransitionCountRef` prevents us from consuming compensation too early while the layout is still animating. If you remove this guard, compensation can disappear mid-transition and reintroduce vertical drift.

## C. Follow-Output Mode (continuous tail)

New-turn contract (deliberate product decision): when a new dialog turn
appears (user sends a message, or a streaming session mounts),
`armFollowOutputForNewTurn` enters follow mode immediately and snaps the
viewport to the latest end position. The live response stays pinned to the
BOTTOM of the viewport with text flowing upward (DSH-style). There is no
"pin the new turn's top to the viewport top, then activate follow once the
reserved floor collapses" phase anymore, and `MessageModule` no longer emits a
pin-to-top event on send. User scroll-up exits follow through the existing
intent detection, and the `ScrollToLatestBar` affordance returns the user to
the tail (re-entering follow) while not following.

When the viewport is in follow-output mode and the latest turn is still
streaming, the user's intent is "keep the tail visible". A naive
implementation that simply pins `scrollTop = maxScrollTop` every frame
produces a very visible "conversation sinks down" jitter every time a
tool card above the viewport auto-collapses: the browser clamps
`scrollTop` to the new (smaller) max, the loop re-pins to the new max
the next frame, and the upper content visibly drifts during the
320 ms collapse animation.

To eliminate that jitter, follow mode uses the same collapse-protection
path as the rest of the list during a known collapse, and only resumes
bottom-tracking once the animation settles:

1. `handleToolCardCollapseIntent` always writes `pendingCollapseIntent`,
   adds a `collapse` bottom reservation, and activates an anchor lock —
   regardless of whether follow mode is active. This freezes the upper
   visual anchor so the conversation does not appear to move while the
   card animates away.
2. The shrink branch of `measureHeightChange` runs the full compensation
   reconciliation even in follow mode, so the synthetic footer absorbs
   the real measured shrink.
3. The continuous RAF loop in `useFlowChatFollowOutput` honours
   `shouldSuspendAutoFollow`. While a collapse intent / layout
   transition is in flight, the loop keeps re-arming frames but skips
   the `performAutoFollowScroll` call, so it does not fight the anchor
   lock.
4. When the collapse transition finishes, `handleTransitionFinish`
   clears `pendingCollapseIntent` and dispatches the deferred follow
   reason via `scheduleFollowToLatest`. That single programmatic
   bottom-snap releases the collapse reservation and re-aligns the
   viewport with the live tail. Subsequent streaming tokens are
   followed normally by the continuous loop.
5. The loop is cancelled as soon as follow exits (user upward scroll,
   session change, streaming ends, or an explicit navigation).

Outside follow mode (user reading older content), all original
protections still apply unchanged.

## D. Reader-Controlled Mode

Everything above protects the *bottom* of the list. The moment the reader
scrolls up, that is the wrong goal — the right one is "keep the line they are
looking at exactly where it is" — and running the bottom-protection machinery
anyway is what produced the worst reported symptom: scrolling up during (or
just after) a response made the viewport teleport into the middle of the
transcript and then flicker violently.

Two mechanisms caused it:

1. `measureHeightChange` sees a negative height delta whenever `react-virtuoso`
   swaps an estimated item height for a real one — which happens constantly
   while scrolling up through unmeasured history. With the reader still close
   to the bottom, the shrink branch computed non-zero required compensation,
   activated an anchor lock and wrote `scrollTop` back. The reader kept
   scrolling, the next frame re-locked, and the two fought at frame rate.
2. `activateAnchorLock` merged its target with the previous one via
   `Math.max`, so a stale, further-down target could win long after it stopped
   describing anything on screen. Clamped against `maxScrollTop`, that restore
   landed anywhere.

The contract now is:

- `useFlowChatFollowOutput` owns a single authoritative latch, exposed as
  `isReaderControlled` / `isReaderControlledNow()`. It is set by any upward
  movement — the wheel/touch/keyboard/scrollbar listeners *and* a plain
  `scroll`-event fallback that covers momentum scrolling, find-in-page and
  anything else that moves the scroller without a recognised gesture. The
  fallback stands down while `shouldSuspendAutoFollow()` is true, because
  collapse compensation legitimately moves `scrollTop` upward.
- It clears in exactly two ways: the reader scrolls back to the bottom under
  their own steam, or they ask for the latest on purpose. **A new turn does not
  clear it** — sending a message while reading history leaves the viewport
  where it is and surfaces the "jump to latest" affordance instead.
- `canScrollProgrammatically()` in `VirtualMessageList` is the single choke
  point for every programmatic scroll. Anchor restores, shrink compensation and
  deferred follow all pass through it, so none of them can fight the reader.
- While reader-controlled, `measureHeightChange` and the scroll listener skip
  the compensation branches entirely and instead run
  `captureReaderAnchor()` / `restoreReaderAnchor()`: the topmost visible item is
  put back at the same offset inside the scroller after any measured layout
  change. This is independent of total content height, which is what makes it
  work against virtualization re-measurement — native `overflow-anchor` cannot
  see that at all.
- `overflow-anchor` stays `none` in reader-controlled mode too. See section E.
- `readerControlGate.ts` publishes the latch to the collapsible cards.
  **Automatic** collapses are queued instead of performed while the reader is in
  control, and flushed once control returns (viewport back at the bottom, where
  the normal collapse-intent compensation applies). Manual collapses always run.
  Without this, the burst of auto-collapses that fires when a response finishes
  would shrink content above the reader's eyes — the reliably reproducible
  "scroll up right after output ends" flicker.

## E. Bounded Tail Reservations (2026-08-22)

Reported defect: a turn containing a large markdown table (and/or an in-transcript
approval card) left a screen-sized blank region under the transcript; the blank
sat there, eventually collapsed, and scrolling up afterwards flickered violently.

Three causes, all in the shrink-protection path:

1. **The `collapse` reservation was unbounded.** A markdown table streams in as
   tall raw pipe-text and then lays out as a compact `<table>`; an approval card
   re-flows after mount. Both produce a single large *unsignalled* shrink. The
   fallback branch of `measureHeightChange` and the follow-mode clamp restore in
   `handleScroll` each reserved the whole shrink amount (the latter cumulatively,
   `px + clampAmount`, with no ceiling). The clamp restore also holds `scrollTop`
   above the effective bottom, which is what makes reserved space *visible*.
2. **Nothing ever gave the reservation back.** It is drained only by content
   growth. When the shrink lands at the end of a turn there is no more growth, so
   the blank persisted until some later navigation cleared it. Reader-controlled
   mode froze it harder: every drain path is skipped there by design.
3. **Reader control could never clear.** The follow controller tested the *raw*
   distance from the bottom, but the reservation is tail space the reader cannot
   scroll past, so the distance never reached the threshold. Once a reservation
   existed, the list stayed latched out of follow for the rest of the session.

The rules that now guard it:

- Every `collapse` reservation goes through `computeCollapseReservationPx`
  (`virtualMessageListLayout.ts`). It is capped at
  `MAX_COLLAPSE_RESERVATION_VIEWPORT_RATIO` of the viewport — past that the
  reservation has stopped protecting a visual anchor and *is* the blank region.
  When the cap blocks the clamp restore, we accept the browser's clamp instead of
  writing `scrollTop` into a footer that cannot absorb it; restoring without room
  guarantees a re-clamp on the next frame, i.e. flicker.
- An **unsignalled** shrink does not grow the reservation while follow-output is
  active. Follow mode's contract is "the tail stays at the bottom of the
  viewport", so there is no upper anchor to protect. This is *not* the forbidden
  follow-mode short-circuit: signalled collapses
  (`flowchat:tool-card-collapse-intent`) keep their full compensation + anchor
  lock in follow mode, which is what stops the conversation sinking down when a
  card above the viewport auto-collapses.
- `settleCollapseReservation()` hands tail space back once nothing can drain it —
  the turn stopped streaming, or the reader took the viewport over. While the
  reader is in control it only releases the part below the fold, so it never
  moves `scrollTop` and never violates the reader-control invariant.
- The "reader came back to the bottom" release in `useFlowChatFollowOutput`
  measures the **effective** bottom (`getAutoFollowDistanceFromBottom`), never the
  raw one.

## F. Tail Wobble While Thinking (2026-08-22)

Follow-up report: the viewport still jumped, specifically while the model was
*thinking* — no tokens landing in the transcript, nothing visibly changing.

The tail of a live turn is never geometrically still. A shimmering label
re-rasterises, the live elapsed counter in `loading-state.tsx` re-renders every
100 ms and grows a character (`9.9s` → `10.0s` → `1m 0.0s`), the bottom-anchored
reasoning preview in `thinking-state.tsx` grows a line at a time up to its
`max-height`. Each of those is one or two pixels, and `COMPENSATION_EPSILON_PX`
is 0.5px, so every one of them cleared the bar and ran the full unsignalled
shrink path — reservation, anchor lock, `scrollTop` write — several times a
second for the whole thinking phase. The machinery was the jitter.

A second contributor: `ModelThinkingDisplay` renders `null` while reasoning is
still streaming (`deferToPinnedActivity`), because the pinned bar already
reports the work. `estimateVirtualMessageItemHeight` still costed that item from
its text length — up to 3200px against a DOM box of zero — so Virtuoso's
placeholder for the round was wildly wrong and correcting it on mount was a
large tail shrink.

Rules now:

- **Unsignalled** tail changes inside
  `UNSIGNALLED_TAIL_OSCILLATION_DEAD_BAND_PX` are ignored outright
  (`shouldProtectUnsignalledShrink`), in both `measureHeightChange` and the
  follow-mode clamp restore in `handleScroll`. Accepting a one-pixel clamp is
  always cheaper than fighting it every tick. Signalled collapses
  (`flowchat:tool-card-collapse-intent`) are never subject to the dead band —
  they announce themselves and are compensated at any size.
- A live indicator rendered inside the scroller must occupy a **fixed outer
  height** while visible. Internal animation (shimmer, typewriter, elapsed text,
  wavefront) must not change the outer box. The reasoning live tail is a fixed
  `3.9em`; the elapsed timer reserves its width in `ch`.
- Height estimates must match what the component actually renders. An item that
  renders nothing must be estimated as nothing.

## G. Mutator Inventory (2026-08-22)

Sections E and F each closed one instance of the same defect class: *content
whose rendered height changes after mount fights the reservation machinery*.
This section is the systematic sweep of the rest of the render tree, so the
next instance is a lookup rather than a bug report.

Classification used below:

- **(a) signalled** — emits `flowchat:tool-card-collapse-intent` before a
  shrink and/or `tool-card-toggle` after a change, normally via
  `useToolCardHeightContract`
- **(b) dead band** — the change is smaller than
  `UNSIGNALLED_TAIL_OSCILLATION_DEAD_BAND_PX`, so ignoring it is correct
- **(c) fixed by CSS** — the outer box does not move
- **(d) unguarded** — was a live gap; all of these are now closed

| Surface | What moves | Was | Now |
| --- | --- | --- | --- |
| `FileOperationToolCard`, `TerminalToolCard`, `TodoWriteDisplay`, `GetFileDiffDisplay`, `GrepSearchDisplay`, `GlobSearchDisplay`, `LSDisplay`, `GitToolDisplay`, `MCPToolDisplay`, `TaskToolDisplay`, `WebSearchCard`, `CreatePlanDisplay`, `CodeReviewToolCard`, `AskUserQuestionCard`, `SessionControlToolCard`, `SessionMessageToolCard`, `MiniAppToolDisplay`, `DefaultToolCard` | expand / collapse, auto-collapse on completion | (a) | (a) |
| `ModelThinkingDisplay` | collapse on settle; renders `null` while reasoning streams | (a) + estimate defers to 0 (§F) | unchanged |
| `ExploreGroupRenderer` | region collapse | (a) | unchanged |
| `SmoothHeightCollapse` (`BaseToolCard` bodies) | animated `grid-template-rows` | (a) via transition tracking | unchanged |
| `ProcessingIndicator` / pinned activity bar | shimmer, elapsed timer | (c) fixed outer box, `ch`-reserved digits (§F) | unchanged |
| Streaming code blocks (`CodeBlockFallback` → Prism) | fallback/highlighter swap | (c) fallback deliberately matches Prism's gutter + line layout | unchanged |
| `ModelRoundItem` progressive render | renders more groups in 80-item chunks | growth only, drained by the consume branch | unchanged |
| Markdown tables | tall pipe-text → compact `<table>` | (a) since §E bounded the reservation | unchanged |
| `MediaGenerationToolCard` | media grid collapse; "show more" paging | **(d)** raw `setIsExpanded` toggle | (a) via `applyExpandedState` + toggle on paging |
| `ReviewSessionSummaryCard` | body collapse; async snapshot file list | **(d)** raw `setIsExpanded`, silent async growth | (a) via `applyExpandedState` + toggle on arrival |
| `GenerativeWidgetToolCard` | failure-panel toggle; self-sizing widget iframe | **(d)** raw toggle, `void-widget:resize` silent | (a) via `applyExpandedState` + `onHeightChange` bridge |
| `ViewImageToolCard` | preview box `112px` → up to `520px` on decode | **(d)** | (a) `notifyToolCardHeightChanged()` on load/error |
| `MermaidBlock` | streaming source text → spinner → SVG; source toggle | **(d)** — the largest unguarded shrink in the tree | (a) `transitionState()` announces before dropping source text |
| Markdown images | no intrinsic size until the bitmap decodes | **(d)** | (a) `notifyMarkdownHeightChanged()` on load/error |

Two rules generalise out of this sweep:

- **The contract is not tool-card-specific.** `VirtualMessageList` does not care
  who dispatched `flowchat:tool-card-collapse-intent` / `tool-card-toggle`, and
  markdown content in `component-library` announces itself with plain `window`
  events rather than importing `flow_chat` (which would invert the dependency).
  `notifyToolCardHeightChanged()` in `useToolCardHeightContract.ts` is the
  shared entry point for content that has no expand/collapse state of its own.
- **Announce a shrink *before* it lands, a growth *after*.** A collapse intent
  dispatched after `setState` is worthless: the browser has already clamped
  `scrollTop`. A growth notification is only a request to re-measure, so it is
  safe (and necessary) after the fact. An intent with a zero measured height is
  dropped — it reserves nothing and protects nothing.

### New invariants

- Every programmatic scroll uses `scrollScrollerTo()`. `Element.prototype.scrollTo`
  is universal in browsers but absent in jsdom, and three of the four call sites
  used to call it unguarded — which is why
  `perf/flowChatStreamingProfile.test.tsx` threw on mount for as long as it did.
- The "jump to latest" affordance is gated on `!isFollowingOutput`, not on
  Virtuoso's raw `atBottom` alone. Virtuoso measures against the *raw* bottom of
  the scroller, and the scroller's footer holds the synthetic tail reservation:
  while follow-output is active with a live reservation the viewport is exactly
  where the reader asked to be, yet the raw distance is the whole reservation.
  Gating on raw `atBottom` alone made the bar appear mid-stream and blink on
  every reservation grow/drain tick.
- A component that renders nothing must be estimated as nothing, and a
  component that re-renders with unchanged props must announce nothing.
  Announcing on every render turns the compensation machinery into the jitter
  (the §F failure mode).

## Why `overflow-anchor: none` Must Stay

`VirtualMessageList.scss` disables native browser scroll anchoring on:

- `[data-virtuoso-scroller]`
- `.message-list-footer`

This is required because the browser's built-in anchoring fights the manual compensation logic.

If you remove `overflow-anchor: none`, the browser may apply its own anchor correction on top of our compensation and produce unstable or inconsistent results.

This holds in reader-controlled mode as well. A `.virtual-message-list--reader-controlled`
override used to restore `overflow-anchor: auto` there, on the theory that our own
machinery was idle. It is not: `restoreReaderAnchor()` runs on every measured layout
change while the reader is in control. Two anchoring systems correcting the same
shift, each one's correction firing scroll events the other reacts to, is the
"scrolling up flickers violently" symptom. The override is gone; do not bring it back.

## Required Event Contract

`tool-card-toggle`

- dispatch after a generic expand/collapse action that changes height
- purpose: schedule a follow-up measurement

`flowchat:tool-card-collapse-intent`

- dispatch before a collapse that can reduce list height near the bottom
- include `cardHeight` when possible
- purpose: pre-compensate before the browser clamps scroll position

Current producers:

- `useToolCardHeightContract.ts` (and `notifyToolCardHeightChanged()` for
  content with no expand/collapse state of its own)
- `ModelThinkingDisplay.tsx`
- `ExploreGroupRenderer.tsx`
- `GenerativeWidgetToolCard.tsx` (self-sizing widget iframe)
- `component-library/components/Markdown/MermaidBlock.tsx`
- `component-library/components/Markdown/Markdown.tsx` (images)

Most tool cards now emit these events through `useToolCardHeightContract`.
Components that need more accurate collapse estimation can pass a custom
`getCardHeight` function to the helper.

If a future collapsible component shows the same "header drops" or "flash on collapse" symptom, it should likely emit `flowchat:tool-card-collapse-intent` before collapsing.

## Invariants To Preserve

- Footer compensation must remain additive temporary space, not real content.
- Effective height comparisons must subtract current compensation.
- Footer DOM compensation must be applied synchronously before anchor restore.
- Anchor restore must clamp against current `maxScrollTop`.
- Pre-collapse intent must capture the anchor before the component shrinks.
- Compensation must not be consumed too early during active layout transitions.
- Session changes and empty-list resets must clear compensation and anchor state.
- No code may write `scrollTop` or call `scrollToIndex` while the reader is in
  control, except `restoreReaderAnchor()`.
- Anchor-lock targets must always be this frame's value, never merged with an
  older one.
- Automatic collapses must be deferred, not performed, while the reader is in
  control.
- Tail reservations must be bounded and must be handed back once nothing can
  drain them.
- Unsignalled tail changes below the dead band must be ignored, not compensated.
- A live indicator inside the scroller must have a fixed outer height while
  visible, and its height estimate must match what it renders.
- Any content that changes its own height after mount must be in the section G
  inventory under (a), (b) or (c). A new one defaults to (d) and is a bug.
- Programmatic scrolls go through `scrollScrollerTo()`, never a raw
  `Element.scrollTo`.
- "Jump to latest" visibility is derived from follow-output state, never from
  raw distance to the physical bottom.

## Common Ways To Break This

- Replacing `applyFooterCompensationNow()` with state-only rendering.
- Measuring raw `scrollHeight` deltas without subtracting existing compensation.
- Removing `flowchat:tool-card-collapse-intent` from a helper-backed collapsible component.
- Dispatching collapse intent after `setState` instead of before it.
- Removing `overflow-anchor: none`.
- Removing transition-aware delayed measurement.
- Simplifying anchor restore to a one-shot restore without the scroll listener fallback.
- Re-introducing a follow-mode short-circuit in `handleToolCardCollapseIntent`
  or `measureHeightChange`. Without the collapse compensation + anchor lock,
  follow-output bottom-tracking causes the conversation to visibly "sink down"
  every time a tool card above the viewport auto-collapses.
- Removing the `shouldSuspendAutoFollow` gate from the continuous RAF follow
  loop. Without it, the loop will fight the anchor lock during the collapse
  animation and reintroduce the same jitter.
- Removing the continuous RAF follow loop. Event-driven follow alone cannot
  keep up with dense token streams without visible jitter outside collapse
  windows.
- Bypassing `canScrollProgrammatically()` in a new scroll path, or re-adding a
  `Math.max` merge to `activateAnchorLock`. Either one brings back the
  teleport-and-flicker described in section D.
- Letting a new turn clear reader control, or dispatching an auto-collapse
  without going through `applyExpandedState` with `reason: 'auto'`.
- Growing a `collapse` reservation without going through
  `computeCollapseReservationPx`, or reserving for an unsignalled shrink while
  follow-output is active. Either one brings back the screen-sized blank region
  under the transcript described in section E.
- Re-enabling native `overflow-anchor` while `restoreReaderAnchor()` is live.
- Measuring "the reader is back at the bottom" against the raw distance from the
  bottom instead of the effective one.

## If You Need To Change This Logic

Use this checklist:

1. Verify bottom collapse at the end of a conversation.
2. Verify manual collapse of a completed `Write` / `Edit` tool card.
3. Verify auto-collapse of file tool cards after streaming finishes.
4. Verify repeated expand/collapse near the bottom.
5. Verify thinking / explore / other collapsible sections still schedule measurements correctly.
6. Verify there is no visible "drop then snap back" flash.
7. Verify the final header position remains stable after collapse.

## Related Files

- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.tsx`
- `src/web-ui/src/flow_chat/components/modern/VirtualMessageList.scss`
- `src/web-ui/src/flow_chat/tool-cards/useToolCardHeightContract.ts`
- `src/web-ui/src/flow_chat/tool-cards/FileOperationToolCard.tsx`
- `src/web-ui/src/flow_chat/tool-cards/ModelThinkingDisplay.tsx`
- `src/web-ui/src/flow_chat/tool-cards/TerminalToolCard.tsx`
- `src/web-ui/src/flow_chat/components/modern/ExploreGroupRenderer.tsx`
