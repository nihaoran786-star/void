// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlowChatFollowOutput } from './useFlowChatFollowOutput';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type FollowOutputController = ReturnType<typeof useFlowChatFollowOutput>;

function setScrollerMetrics(
  scroller: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
): void {
  Object.defineProperties(scroller, {
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollTop: { configurable: true, writable: true, value: metrics.scrollTop },
  });
}

function Harness({
  scroller,
  onController,
  performAutoFollowScroll,
  isActive = true,
  getAutoFollowDistanceFromBottom,
}: {
  scroller: HTMLElement;
  onController: (controller: FollowOutputController) => void;
  performAutoFollowScroll: () => void;
  isActive?: boolean;
  getAutoFollowDistanceFromBottom?: (scroller: HTMLElement) => number;
}) {
  const scrollerRef = React.useRef<HTMLElement | null>(scroller);
  scrollerRef.current = scroller;

  const controller = useFlowChatFollowOutput({
    isActive,
    activeSessionId: 'session-1',
    latestTurnId: 'turn-2',
    virtualItemCount: 20,
    isStreaming: true,
    scrollerRef,
    performUserFollowScroll: vi.fn(),
    performAutoFollowScroll,
    getAutoFollowDistanceFromBottom,
  });

  onController(controller);
  return <div data-following-output={String(controller.isFollowingOutput)} />;
}

describe('useFlowChatFollowOutput', () => {
  let container: HTMLDivElement;
  let root: Root;
  let controller: FollowOutputController | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    controller = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('exits output follow immediately when explicit user scroll intent is already away from bottom', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.enterFollowOutput('auto-follow');
    });

    expect(controller?.isFollowingOutput).toBe(true);

    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 600,
    });

    act(() => {
      controller?.handleUserScrollIntent();
    });

    expect(controller?.isFollowingOutput).toBe(false);
  });

  it('exits output follow for explicit upward intent before browser scroll metrics move', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.enterFollowOutput('auto-follow');
    });

    expect(controller?.isFollowingOutput).toBe(true);

    act(() => {
      controller?.handleUserScrollIntent();
    });

    expect(controller?.isFollowingOutput).toBe(false);
  });

  it('releases reader control at the effective bottom, past a synthetic tail reservation', () => {
    // A `collapse` bottom reservation is invisible tail space the reader can
    // never scroll past. Measured raw, the reader is permanently "away from the
    // bottom", so reader control never clears and the list stays frozen out of
    // follow for the rest of the session.
    const RESERVATION_PX = 400;
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500 + RESERVATION_PX,
      clientHeight: 500,
      scrollTop: 600,
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={vi.fn()}
          getAutoFollowDistanceFromBottom={target => Math.max(
            0,
            target.scrollHeight - target.clientHeight - target.scrollTop - RESERVATION_PX,
          )}
        />,
      );
    });

    act(() => {
      controller?.handleUserScrollIntent();
    });
    expect(controller?.isReaderControlledNow()).toBe(true);

    // Reader scrolls back down to the effective bottom (the top edge of the
    // reservation), which is 400px short of the raw maximum.
    setScrollerMetrics(scroller, {
      scrollHeight: 1500 + RESERVATION_PX,
      clientHeight: 500,
      scrollTop: 1000,
    });

    act(() => {
      controller?.handleScroll();
    });

    expect(controller?.isReaderControlledNow()).toBe(false);
  });

  it('keeps reader control while the reader is genuinely away from the effective bottom', () => {
    const RESERVATION_PX = 400;
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500 + RESERVATION_PX,
      clientHeight: 500,
      scrollTop: 200,
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={vi.fn()}
          getAutoFollowDistanceFromBottom={target => Math.max(
            0,
            target.scrollHeight - target.clientHeight - target.scrollTop - RESERVATION_PX,
          )}
        />,
      );
    });

    act(() => {
      controller?.handleUserScrollIntent();
    });

    setScrollerMetrics(scroller, {
      scrollHeight: 1500 + RESERVATION_PX,
      clientHeight: 500,
      scrollTop: 500,
    });

    act(() => {
      controller?.handleScroll();
    });

    expect(controller?.isReaderControlledNow()).toBe(true);
  });

  it('enters bottom-follow immediately for a new turn and still exits on upward intent', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.armFollowOutputForNewTurn();
    });

    // New turn contract: follow activates immediately and the viewport snaps
    // to the latest end position (no sticky pin-to-top phase anymore).
    expect(controller?.isFollowingOutput).toBe(true);
    expect(performAutoFollowScroll).toHaveBeenCalled();

    act(() => {
      controller?.handleUserScrollIntent();
    });

    expect(controller?.isFollowingOutput).toBe(false);

    let activated = true;
    act(() => {
      activated = controller?.activateArmedFollowOutput() ?? true;
    });

    expect(activated).toBe(false);
    expect(controller?.isFollowingOutput).toBe(false);
  });

  it('does not re-follow while the reader is looking back up the transcript', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.enterFollowOutput('auto-follow');
    });

    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 400,
    });

    act(() => {
      controller?.handleUserScrollIntent();
    });

    expect(controller?.isFollowingOutput).toBe(false);

    // Any later auto re-entry has to be refused: re-entering yanks the
    // viewport down, the reader scrolls up again, and the two fight at frame
    // rate, which is what reads as flickering.
    performAutoFollowScroll.mockClear();
    act(() => {
      controller?.enterFollowOutput('auto-follow');
      controller?.scheduleFollowToLatest('content-grew');
    });

    expect(controller?.isFollowingOutput).toBe(false);
    expect(performAutoFollowScroll).not.toHaveBeenCalled();

    // Asking to jump to the latest is the reader coming back on purpose.
    act(() => {
      controller?.enterFollowOutput('jump-to-latest');
    });

    expect(controller?.isFollowingOutput).toBe(true);
  });

  it('resumes following once the reader scrolls back to the bottom', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.enterFollowOutput('auto-follow');
    });

    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 400,
    });

    act(() => {
      controller?.handleUserScrollIntent();
      controller?.handleScroll();
    });

    expect(controller?.isFollowingOutput).toBe(false);

    // Back at the bottom under their own steam.
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });

    act(() => {
      controller?.handleScroll();
      controller?.enterFollowOutput('auto-follow');
    });

    expect(controller?.isFollowingOutput).toBe(true);
  });

  it('keeps the reader in control when a new turn starts', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.enterFollowOutput('auto-follow');
    });

    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 400,
    });

    act(() => {
      controller?.handleUserScrollIntent();
    });

    expect(controller?.isReaderControlled).toBe(true);

    // Sending a message while reading history must not teleport the reader.
    performAutoFollowScroll.mockClear();
    act(() => {
      controller?.armFollowOutputForNewTurn();
    });

    expect(controller?.isReaderControlled).toBe(true);
    expect(controller?.isFollowingOutput).toBe(false);
    expect(performAutoFollowScroll).not.toHaveBeenCalled();

    act(() => {
      controller?.enterFollowOutput('jump-to-latest');
    });

    expect(controller?.isReaderControlled).toBe(false);
    expect(controller?.isFollowingOutput).toBe(true);
  });

  it('takes reader control from plain upward scrolling with no recognised input gesture', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 1000,
    });
    const performAutoFollowScroll = vi.fn(() => {
      scroller.scrollTop = 1000;
    });

    act(() => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
        />,
      );
    });

    act(() => {
      controller?.handleScroll();
    });

    expect(controller?.isReaderControlled).toBe(false);

    // Momentum scrolling, find-in-page and extensions all move the scroller
    // without a wheel/touch/key event ever reaching us.
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 600,
    });

    act(() => {
      controller?.handleScroll();
    });

    expect(controller?.isReaderControlled).toBe(true);
  });

  it('cancels scheduled and continuous animation frames when the presentation becomes inactive', () => {
    const scroller = document.createElement('div');
    setScrollerMetrics(scroller, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 600,
    });
    const performAutoFollowScroll = vi.fn();
    const queuedFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      nextFrameId += 1;
      queuedFrames.set(nextFrameId, callback);
      return nextFrameId;
    });
    const cancelFrame = vi.fn((frameId: number) => {
      queuedFrames.delete(frameId);
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const renderHarness = (isActive: boolean) => {
      root.render(
        <Harness
          scroller={scroller}
          onController={nextController => {
            controller = nextController;
          }}
          performAutoFollowScroll={performAutoFollowScroll}
          isActive={isActive}
        />,
      );
    };

    act(() => {
      renderHarness(true);
    });
    act(() => {
      controller?.enterFollowOutput('auto-follow');
    });

    expect(queuedFrames.size).toBeGreaterThan(0);
    const queuedBeforeHide = Array.from(queuedFrames.values());
    const scrollCallsBeforeHide = performAutoFollowScroll.mock.calls.length;

    act(() => {
      renderHarness(false);
    });

    expect(cancelFrame).toHaveBeenCalled();
    expect(queuedFrames.size).toBe(0);

    act(() => {
      queuedBeforeHide.forEach(callback => callback(performance.now()));
    });
    expect(performAutoFollowScroll).toHaveBeenCalledTimes(scrollCallsBeforeHide);
  });
});
