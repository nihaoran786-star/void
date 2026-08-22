/**
 * Follow-output controller for the modern virtualized FlowChat list.
 *
 * Keeps follow state local to the viewport layer while separating the
 * "when should we follow" policy from the low-level list scroll mechanics.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const PROGRAMMATIC_SCROLL_GUARD_MS = 160;
const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 24;
const USER_SCROLL_DIRECTION_EPSILON_PX = 0.5;
const USER_SCROLL_INTENT_WINDOW_MS = 450;

export type FollowOutputEnterReason = 'jump-to-latest' | 'auto-follow';
export type FollowOutputExitReason =
  | 'session-changed'
  | 'user-scroll-up'
  | 'scroll-to-turn'
  | 'scroll-to-index'
  | 'pin-turn-to-top';

interface UseFlowChatFollowOutputOptions {
  isActive?: boolean;
  activeSessionId?: string;
  latestTurnId: string | null;
  virtualItemCount: number;
  isStreaming: boolean;
  scrollerRef: RefObject<HTMLElement | null>;
  performUserFollowScroll: () => void;
  performAutoFollowScroll: () => void;
  /**
   * Returns true when auto-follow should be suspended for layout-protection
   * reasons (collapse animation, layout transition, pending collapse intent).
   * Both the event-driven `scheduleFollowToLatest` and the continuous follow
   * loop honour this signal: while a known collapse animation is in flight we
   * must not fight the anchor-lock + bottom-reservation machinery, otherwise
   * the conversation visibly "sinks down" each time content above shrinks.
   * The continuous loop keeps requesting frames while suspended and resumes
   * bottom-tracking on the next frame after the suspension clears.
   */
  shouldSuspendAutoFollow?: () => boolean;
  getAutoFollowDistanceFromBottom?: (scroller: HTMLElement) => number;
  /**
   * Optional per-frame hook invoked from inside the continuous follow loop.
   * Used to reconcile sticky-latest pin floor in lockstep with the scroll
   * adjustment so the pin reservation never lags behind a shrinking layout.
   */
  onContinuousFollowFrame?: () => void;
}

interface UseFlowChatFollowOutputResult {
  isFollowingOutput: boolean;
  /**
   * True while the reader has taken the viewport over by scrolling up. Every
   * programmatic scroll in the list must be gated on this being false.
   */
  isReaderControlled: boolean;
  isReaderControlledNow: () => boolean;
  enterFollowOutput: (reason: FollowOutputEnterReason) => void;
  exitFollowOutput: (reason: FollowOutputExitReason) => void;
  armFollowOutputForNewTurn: () => void;
  activateArmedFollowOutput: () => boolean;
  cancelPendingAutoFollowArm: () => void;
  scheduleFollowToLatest: (reason: string) => void;
  handleUserScrollIntent: () => void;
  handleScroll: () => void;
}

function getDistanceFromBottom(scroller: HTMLElement): number {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
}

export function useFlowChatFollowOutput({
  isActive = true,
  activeSessionId,
  latestTurnId,
  virtualItemCount,
  isStreaming,
  scrollerRef,
  performUserFollowScroll,
  performAutoFollowScroll,
  shouldSuspendAutoFollow,
  getAutoFollowDistanceFromBottom,
  onContinuousFollowFrame,
}: UseFlowChatFollowOutputOptions): UseFlowChatFollowOutputResult {
  const [isFollowingOutput, setIsFollowingOutput] = useState(false);
  const [isReaderControlled, setIsReaderControlled] = useState(false);

  const isFollowingOutputRef = useRef(isFollowingOutput);
  /**
   * "The reader took the viewport over."
   *
   * Exiting follow once is not enough: several paths can re-enter it while the
   * same turn is still streaming, and each re-entry yanks the viewport back to
   * the bottom. The reader scrolls up again, and the two fight at frame rate,
   * which reads as the whole conversation flickering. While this latch is set
   * the viewport belongs to the reader: nothing may auto-follow, and no
   * programmatic scroll of any kind is allowed (see `canScrollProgrammatically`
   * in VirtualMessageList).
   *
   * It clears in exactly two ways: the reader scrolls back to the bottom under
   * their own steam, or they ask for the latest on purpose. A new turn does NOT
   * clear it — sending a message while reading history must not teleport them.
   */
  const readerControlledRef = useRef(false);
  const followFrameRef = useRef<number | null>(null);
  const programmaticScrollUntilMsRef = useRef(0);
  const explicitUserScrollIntentUntilMsRef = useRef(0);
  const lastObservedScrollTopRef = useRef(0);
  const previousSessionIdRef = useRef<string | undefined>(activeSessionId);
  const armedAutoFollowTurnIdRef = useRef<string | null>(null);
  const continuousFollowFrameRef = useRef<number | null>(null);
  const isActiveRef = useRef(isActive);
  const isStreamingRef = useRef(isStreaming);
  const performAutoFollowScrollRef = useRef(performAutoFollowScroll);
  const onContinuousFollowFrameRef = useRef(onContinuousFollowFrame);
  const getAutoFollowDistanceFromBottomRef = useRef(getAutoFollowDistanceFromBottom);
  const shouldSuspendAutoFollowRef = useRef(shouldSuspendAutoFollow);

  isActiveRef.current = isActive;
  isStreamingRef.current = isStreaming;
  performAutoFollowScrollRef.current = performAutoFollowScroll;
  onContinuousFollowFrameRef.current = onContinuousFollowFrame;
  getAutoFollowDistanceFromBottomRef.current = getAutoFollowDistanceFromBottom;
  shouldSuspendAutoFollowRef.current = shouldSuspendAutoFollow;

  const setReaderControlled = useCallback((nextValue: boolean) => {
    readerControlledRef.current = nextValue;
    setIsReaderControlled(prev => (prev === nextValue ? prev : nextValue));
  }, []);

  const isReaderControlledNow = useCallback(() => readerControlledRef.current, []);

  const setFollowingOutput = useCallback((nextValue: boolean) => {
    isFollowingOutputRef.current = nextValue;
    setIsFollowingOutput(prev => (prev === nextValue ? prev : nextValue));
    if (!nextValue && continuousFollowFrameRef.current !== null) {
      cancelAnimationFrame(continuousFollowFrameRef.current);
      continuousFollowFrameRef.current = null;
    }
  }, []);

  const cancelScheduledFollow = useCallback(() => {
    if (followFrameRef.current !== null) {
      cancelAnimationFrame(followFrameRef.current);
      followFrameRef.current = null;
    }
  }, []);

  const stopContinuousFollowLoop = useCallback(() => {
    if (continuousFollowFrameRef.current !== null) {
      cancelAnimationFrame(continuousFollowFrameRef.current);
      continuousFollowFrameRef.current = null;
    }
  }, []);

  /**
   * Continuous RAF-driven follow loop.
   *
   * Why this exists:
   *  - Streaming text + auto-collapsing tool cards generate dense bursts of
   *    DOM mutations and CSS transitions. Event-driven follow (via observers)
   *    is gated by `shouldSuspendAutoFollow` during transitions, which makes
   *    the viewport visibly stall and then jump after the transition ends.
   *  - This loop runs every animation frame while follow + streaming is
   *    active, pushing scrollTop toward the latest token regardless of any
   *    intermediate layout shrink. The result is a smooth, continuous tail.
   *
   * Safety:
   *  - Programmatic scrolls inside this loop bump
   *    `programmaticScrollUntilMsRef` so the user-intent detector does not
   *    misclassify them as upward scrolls.
   *  - The loop bails out as soon as follow is exited, streaming ends, the
   *    scroller disappears, or the viewport is already pinned to the bottom.
   */
  const runContinuousFollowFrame = useCallback(() => {
    continuousFollowFrameRef.current = null;

    if (
      !isActiveRef.current ||
      !isFollowingOutputRef.current ||
      !isStreamingRef.current ||
      readerControlledRef.current
    ) {
      return;
    }

    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    onContinuousFollowFrameRef.current?.();

    // While a known collapse animation / layout transition is in flight, the
    // VirtualMessageList anchor-lock + bottom-reservation footer is preserving
    // the upper visual anchor. Issuing a programmatic scroll-to-bottom from
    // this loop would fight that machinery and re-introduce the "sink-down"
    // jitter the user reported. We simply re-arm the next frame and resume on
    // the first frame after the suspension clears.
    const isSuspended = shouldSuspendAutoFollowRef.current?.() === true;
    const measuredDistance = getAutoFollowDistanceFromBottomRef.current?.(scroller)
      ?? getDistanceFromBottom(scroller);
    if (!isSuspended && measuredDistance > AUTO_FOLLOW_BOTTOM_THRESHOLD_PX) {
      programmaticScrollUntilMsRef.current = performance.now() + PROGRAMMATIC_SCROLL_GUARD_MS;
      explicitUserScrollIntentUntilMsRef.current = 0;
      performAutoFollowScrollRef.current();
      lastObservedScrollTopRef.current = scroller.scrollTop;
    }

    if (!isActiveRef.current || !isFollowingOutputRef.current || !isStreamingRef.current) {
      return;
    }

    continuousFollowFrameRef.current = requestAnimationFrame(runContinuousFollowFrame);
  }, [scrollerRef]);

  const startContinuousFollowLoop = useCallback(() => {
    if (continuousFollowFrameRef.current !== null) {
      return;
    }
    if (!isActiveRef.current || !isFollowingOutputRef.current || !isStreamingRef.current) {
      return;
    }
    continuousFollowFrameRef.current = requestAnimationFrame(runContinuousFollowFrame);
  }, [runContinuousFollowFrame]);

  const cancelPendingAutoFollowArm = useCallback(() => {
    armedAutoFollowTurnIdRef.current = null;
  }, []);

  const runProgrammaticScroll = useCallback((scrollAction: () => void) => {
    programmaticScrollUntilMsRef.current = performance.now() + PROGRAMMATIC_SCROLL_GUARD_MS;
    explicitUserScrollIntentUntilMsRef.current = 0;
    scrollAction();
    const scroller = scrollerRef.current;
    if (scroller) {
      lastObservedScrollTopRef.current = scroller.scrollTop;
    }
  }, [scrollerRef]);

  const enterFollowOutput = useCallback((reason: FollowOutputEnterReason) => {
    if (!isActiveRef.current) return;
    // Jumping to the latest is the reader asking to come back; anything else
    // must not overrule them while they are reading further up.
    if (reason === 'jump-to-latest') {
      setReaderControlled(false);
    } else if (readerControlledRef.current) {
      return;
    }
    cancelPendingAutoFollowArm();
    cancelScheduledFollow();
    explicitUserScrollIntentUntilMsRef.current = 0;
    setFollowingOutput(true);
    const followAction = reason === 'jump-to-latest'
      ? performUserFollowScroll
      : performAutoFollowScroll;
    runProgrammaticScroll(followAction);
  }, [
    cancelPendingAutoFollowArm,
    cancelScheduledFollow,
    performAutoFollowScroll,
    performUserFollowScroll,
    runProgrammaticScroll,
    setFollowingOutput,
    setReaderControlled,
  ]);

  const exitFollowOutput = useCallback((_reason: FollowOutputExitReason) => {
    cancelPendingAutoFollowArm();
    cancelScheduledFollow();
    explicitUserScrollIntentUntilMsRef.current = 0;
    setFollowingOutput(false);
    const scroller = scrollerRef.current;
    if (scroller) {
      lastObservedScrollTopRef.current = scroller.scrollTop;
    }
  }, [cancelPendingAutoFollowArm, cancelScheduledFollow, scrollerRef, setFollowingOutput]);

  const armFollowOutputForNewTurn = useCallback(() => {
    if (!isActiveRef.current) return;
    if (!latestTurnId) {
      cancelPendingAutoFollowArm();
      return;
    }

    // New turn = immediate bottom-follow (DSH-style). The live response stays
    // pinned to the bottom of the viewport with text flowing upward, instead
    // of pinning the new turn's top to the viewport top and activating follow
    // later. The armed ref is still recorded so scroll-intent handlers can
    // cancel it, but follow enters right away and the viewport snaps to the
    // latest end position via the same path the "jump to latest" affordance
    // uses. User scroll-up still exits follow through handleScroll /
    // handleUserScrollIntent.
    // A new turn does NOT release reader control. Someone reading further up
    // while a message is sent stays exactly where they are; the "jump to
    // latest" affordance is how they come back. Record the arm so scroll-intent
    // handlers can still cancel it, but move nothing.
    if (readerControlledRef.current) {
      armedAutoFollowTurnIdRef.current = latestTurnId;
      return;
    }

    armedAutoFollowTurnIdRef.current = latestTurnId;
    cancelScheduledFollow();
    explicitUserScrollIntentUntilMsRef.current = 0;
    setFollowingOutput(true);
    runProgrammaticScroll(performAutoFollowScroll);
  }, [
    cancelPendingAutoFollowArm,
    cancelScheduledFollow,
    latestTurnId,
    performAutoFollowScroll,
    runProgrammaticScroll,
    setFollowingOutput,
  ]);

  const activateArmedFollowOutput = useCallback(() => {
    if (!isActiveRef.current) return false;
    const armedTurnId = armedAutoFollowTurnIdRef.current;
    const isAlreadyFollowing = isFollowingOutputRef.current;
    const isArmedForLatestTurn = Boolean(latestTurnId && armedTurnId === latestTurnId);
    const isAutoFollowSuspended = shouldSuspendAutoFollow?.() === true;

    if (!latestTurnId || !isArmedForLatestTurn || isAlreadyFollowing) {
      return false;
    }

    if (readerControlledRef.current) {
      return false;
    }

    if (isAutoFollowSuspended) {
      return false;
    }

    cancelPendingAutoFollowArm();
    cancelScheduledFollow();
    setFollowingOutput(true);
    runProgrammaticScroll(performAutoFollowScroll);
    return true;
  }, [
    cancelPendingAutoFollowArm,
    cancelScheduledFollow,
    latestTurnId,
    performAutoFollowScroll,
    runProgrammaticScroll,
    setFollowingOutput,
    shouldSuspendAutoFollow,
  ]);

  const handleUserScrollIntent = useCallback(() => {
    // Latch first, unconditionally: the reader is moving up, and that has to
    // hold even when follow is currently inactive and nothing is armed yet.
    setReaderControlled(true);

    if (!isFollowingOutputRef.current && armedAutoFollowTurnIdRef.current === null) {
      return;
    }

    const now = performance.now();
    explicitUserScrollIntentUntilMsRef.current = now + USER_SCROLL_INTENT_WINDOW_MS;

    if (isFollowingOutputRef.current) {
      exitFollowOutput('user-scroll-up');
      return;
    }

    cancelPendingAutoFollowArm();
  }, [cancelPendingAutoFollowArm, exitFollowOutput, setReaderControlled]);

  const scheduleFollowToLatest = useCallback((_reason: string) => {
    if (
      readerControlledRef.current ||
      !isActiveRef.current ||
      !isFollowingOutputRef.current ||
      !isStreaming ||
      virtualItemCount === 0 ||
      shouldSuspendAutoFollow?.() === true
    ) {
      return;
    }

    if (followFrameRef.current !== null) {
      return;
    }

    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = null;

      if (!isActiveRef.current || !isFollowingOutputRef.current || !isStreaming || virtualItemCount === 0) {
        return;
      }

      if (shouldSuspendAutoFollow?.() === true) {
        return;
      }

      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }

      const rawDistanceFromBottom = getDistanceFromBottom(scroller);
      const distanceFromBottom = getAutoFollowDistanceFromBottom?.(scroller) ?? rawDistanceFromBottom;
      if (distanceFromBottom <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX) {
        return;
      }

      runProgrammaticScroll(performAutoFollowScroll);
    });
  }, [getAutoFollowDistanceFromBottom, isStreaming, performAutoFollowScroll, runProgrammaticScroll, scrollerRef, shouldSuspendAutoFollow, virtualItemCount]);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const currentScrollTop = scroller.scrollTop;
    const previousScrollTop = lastObservedScrollTopRef.current;
    lastObservedScrollTopRef.current = currentScrollTop;

    // Coming back down to the bottom under their own steam means the reader is
    // done looking back, so live output may track the tail again.
    //
    // Measured against the EFFECTIVE bottom (synthetic tail reservation
    // subtracted), not the raw one. A leftover collapse reservation is invisible
    // tail space the reader can never scroll past, so testing the raw distance
    // meant reader control could never clear once one existed — the list stayed
    // frozen out of follow for the rest of the session.
    const distanceFromBottomNow = getAutoFollowDistanceFromBottomRef.current?.(scroller)
      ?? getDistanceFromBottom(scroller);
    if (
      readerControlledRef.current &&
      currentScrollTop >= previousScrollTop &&
      distanceFromBottomNow <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
    ) {
      setReaderControlled(false);
    }

    const isWithinProgrammaticGuard = performance.now() <= programmaticScrollUntilMsRef.current;
    const upwardDelta = previousScrollTop - currentScrollTop;

    // Fallback latch. The dedicated wheel / touch / keyboard / scrollbar
    // listeners miss real upward movement from momentum scrolling, browser
    // find-in-page, extensions and anything else that moves the scroller
    // without one of those inputs. Any upward movement outside a programmatic
    // scroll window is the reader's, so take it at face value.
    // The one exception is a layout transition in flight: collapse
    // compensation legitimately moves `scrollTop` upward to hold the visual
    // anchor, and that is not the reader asking for anything.
    if (
      !isWithinProgrammaticGuard &&
      !readerControlledRef.current &&
      upwardDelta > USER_SCROLL_DIRECTION_EPSILON_PX &&
      shouldSuspendAutoFollow?.() !== true
    ) {
      setReaderControlled(true);
    }

    if (!isFollowingOutputRef.current && armedAutoFollowTurnIdRef.current === null) {
      return;
    }

    if (isWithinProgrammaticGuard) {
      return;
    }

    if (upwardDelta > USER_SCROLL_DIRECTION_EPSILON_PX) {
      const now = performance.now();
      const hasRecentExplicitUserIntent = now <= explicitUserScrollIntentUntilMsRef.current;
      const distanceFromBottom = getDistanceFromBottom(scroller);
      if (!hasRecentExplicitUserIntent) {
        if (
          isFollowingOutputRef.current &&
          distanceFromBottom <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
        ) {
          return;
        }
        return;
      }

      if (shouldSuspendAutoFollow?.() === true) {
        if (isFollowingOutputRef.current && hasRecentExplicitUserIntent) {
          exitFollowOutput('user-scroll-up');
        }
        explicitUserScrollIntentUntilMsRef.current = 0;
        return;
      }

      explicitUserScrollIntentUntilMsRef.current = 0;

      if (!isFollowingOutputRef.current) {
        cancelPendingAutoFollowArm();
        return;
      }

      exitFollowOutput('user-scroll-up');
    }
  }, [cancelPendingAutoFollowArm, exitFollowOutput, scrollerRef, setReaderControlled, shouldSuspendAutoFollow]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      lastObservedScrollTopRef.current = scroller.scrollTop;
    }
  }, [scrollerRef]);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    if (previousSessionId === activeSessionId) {
      return;
    }

    previousSessionIdRef.current = activeSessionId;
    cancelPendingAutoFollowArm();
    cancelScheduledFollow();
    explicitUserScrollIntentUntilMsRef.current = 0;
    // Reading position does not carry across conversations.
    setReaderControlled(false);
    const nextFollowState = Boolean(activeSessionId && virtualItemCount === 0);

    if (nextFollowState) {
      setFollowingOutput(true);
      return;
    }

    setFollowingOutput(false);
  }, [
    activeSessionId,
    cancelPendingAutoFollowArm,
    cancelScheduledFollow,
    latestTurnId,
    setFollowingOutput,
    setReaderControlled,
    virtualItemCount,
  ]);

  useEffect(() => {
    if (!isActive || !isFollowingOutput || !isStreaming) {
      stopContinuousFollowLoop();
      if (!isActive) cancelScheduledFollow();
      return;
    }

    scheduleFollowToLatest('streaming-started');
    startContinuousFollowLoop();
  }, [cancelScheduledFollow, isActive, isFollowingOutput, isStreaming, scheduleFollowToLatest, startContinuousFollowLoop, stopContinuousFollowLoop]);

  useEffect(() => {
    return () => {
      cancelScheduledFollow();
      stopContinuousFollowLoop();
    };
  }, [cancelScheduledFollow, stopContinuousFollowLoop]);

  return {
    isFollowingOutput,
    isReaderControlled,
    isReaderControlledNow,
    enterFollowOutput,
    exitFollowOutput,
    armFollowOutputForNewTurn,
    activateArmedFollowOutput,
    cancelPendingAutoFollowArm,
    scheduleFollowToLatest,
    handleUserScrollIntent,
    handleScroll,
  };
}
