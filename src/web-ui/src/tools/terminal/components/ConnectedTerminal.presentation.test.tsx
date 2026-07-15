// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const terminalHarness = vi.hoisted(() => {
  const harness = {
    props: null as Record<string, unknown> | null,
    mountCount: 0,
    unmountCount: 0,
    deferXtermCallbacks: false,
    xtermCallbacks: [] as Array<() => void>,
    write: vi.fn(),
    fit: vi.fn(),
    forceRedraw: vi.fn(),
    clear: vi.fn(),
    xtermWrite: vi.fn(),
    xtermResize: vi.fn(),
  };
  harness.xtermWrite.mockImplementation((_data: string, callback?: () => void) => {
    if (!callback) {
      return;
    }
    if (harness.deferXtermCallbacks) {
      harness.xtermCallbacks.push(callback);
    } else {
      callback();
    }
  });
  return harness;
});

const useTerminalHarness = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  write: vi.fn().mockResolvedValue(undefined),
  resize: vi.fn().mockResolvedValue(undefined),
  sendCtrlC: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
}));

const actionHarness = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock('./Terminal', async () => {
  const ReactModule = await import('react');
  const MockTerminal = ReactModule.forwardRef((props: Record<string, unknown>, ref) => {
    terminalHarness.props = props;
    ReactModule.useEffect(() => {
      terminalHarness.mountCount += 1;
      return () => {
        terminalHarness.unmountCount += 1;
      };
    }, []);
    ReactModule.useImperativeHandle(ref, () => ({
      write: terminalHarness.write,
      writeln: vi.fn(),
      clear: terminalHarness.clear,
      reset: vi.fn(),
      focus: vi.fn(),
      fit: terminalHarness.fit,
      flushResize: vi.fn(),
      forceRedraw: terminalHarness.forceRedraw,
      getTerminal: () => ({
        rows: 24,
        cols: 80,
        resize: terminalHarness.xtermResize,
        write: terminalHarness.xtermWrite,
        buffer: {
          active: {
            cursorX: 3,
            cursorY: 4,
          },
        },
      }),
      getSize: () => ({ cols: 80, rows: 24 }),
    }));
    return ReactModule.createElement('div', { 'data-terminal': 'mounted' });
  });
  MockTerminal.displayName = 'MockTerminal';
  return { default: MockTerminal };
});

vi.mock('../hooks/useTerminal', () => ({
  useTerminal: (options: Record<string, unknown>) => {
    useTerminalHarness.options = options;
    return {
      session: {
        id: 'session-1',
        name: 'Session 1',
        shellType: 'PowerShell',
        cwd: 'D:\\workspace',
        status: 'Running',
        cols: 80,
        rows: 24,
        source: 'manual',
      },
      isLoading: false,
      error: null,
      write: useTerminalHarness.write,
      resize: useTerminalHarness.resize,
      sendCtrlC: useTerminalHarness.sendCtrlC,
      close: useTerminalHarness.close,
      refresh: useTerminalHarness.refresh,
    };
  },
}));

vi.mock('../services/TerminalActionManager', () => ({
  registerTerminalActions: actionHarness.register,
  unregisterTerminalActions: actionHarness.unregister,
}));

vi.mock('@/component-library', () => ({
  confirmWarning: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

import ConnectedTerminal from './ConnectedTerminal';

type TerminalCallbacks = {
  onOutput: (data: string) => void;
  onReplay: (events: Array<{ cols: number; rows: number; data: string }>) => void;
};

function callbacks(): TerminalCallbacks {
  return useTerminalHarness.options as unknown as TerminalCallbacks;
}

describe('ConnectedTerminal presentation activity', () => {
  let container: HTMLDivElement;
  let root: Root;
  let nextFrameId: number;
  let frames: Map<number, FrameRequestCallback>;

  const render = (isActive?: boolean, autoFocus = true) => {
    act(() => {
      root.render(
        <ConnectedTerminal
          sessionId="session-1"
          autoFocus={autoFocus}
          {...(isActive === undefined ? {} : { isActive })}
        />,
      );
    });
  };

  const ready = () => {
    act(() => {
      (terminalHarness.props?.onReady as () => void)();
    });
  };

  const flushFrames = () => {
    const pending = [...frames.entries()];
    frames.clear();
    pending.forEach(([, callback]) => callback(0));
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    nextFrameId = 0;
    frames = new Map();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
      frames.delete(frameId);
    }));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    terminalHarness.props = null;
    terminalHarness.mountCount = 0;
    terminalHarness.unmountCount = 0;
    terminalHarness.deferXtermCallbacks = false;
    terminalHarness.xtermCallbacks = [];
    useTerminalHarness.options = null;
  });

  it('defaults to active for existing callers', () => {
    render();

    expect(terminalHarness.props?.autoFocus).toBe(true);
    expect(terminalHarness.props?.onResize).toEqual(expect.any(Function));
    expect(useTerminalHarness.options).toMatchObject({
      sessionId: 'session-1',
      autoConnect: true,
    });
  });

  it('keeps the terminal mounted and restores history before one coalesced live write', () => {
    render(false);
    callbacks().onReplay([{ cols: 100, rows: 30, data: 'history' }]);
    callbacks().onOutput('live-1');
    callbacks().onOutput('live-2');
    ready();

    expect(terminalHarness.write).not.toHaveBeenCalled();
    expect(terminalHarness.mountCount).toBe(1);
    expect(actionHarness.register).toHaveBeenCalledTimes(1);

    render(true);
    act(flushFrames);

    expect(terminalHarness.write.mock.calls.map(([data]) => data)).toEqual([
      'history',
      'live-1live-2',
    ]);
    expect(terminalHarness.xtermResize).toHaveBeenCalledWith(100, 30);
    expect(terminalHarness.fit).toHaveBeenCalledTimes(1);
    expect(terminalHarness.forceRedraw).toHaveBeenCalledTimes(1);
    expect(terminalHarness.mountCount).toBe(1);
    expect(terminalHarness.unmountCount).toBe(0);
  });

  it('batch-drains hidden history and live output after the ready 1 MiB threshold', () => {
    render(false);
    ready();
    callbacks().onReplay([{ cols: 80, rows: 24, data: 'history' }]);
    const live = 'x'.repeat(1024 * 1024 - 'history'.length);

    callbacks().onOutput(live);

    expect(terminalHarness.write.mock.calls.map(([data]) => data)).toEqual([
      'history',
      live,
    ]);
  });

  it('batch-drains 2048 hidden micro-events without waiting for the character threshold', () => {
    render(false);
    ready();

    for (let index = 0; index < 2048; index += 1) {
      callbacks().onOutput('x');
    }

    expect(terminalHarness.write).toHaveBeenCalledTimes(1);
    expect(terminalHarness.write.mock.calls[0][0]).toBe('x'.repeat(2048));
  });

  it('does not drain a pre-ready threshold batch until the terminal becomes ready', () => {
    render(false);
    callbacks().onReplay([{ cols: 80, rows: 24, data: 'h'.repeat(1024 * 1024) }]);

    expect(terminalHarness.write).not.toHaveBeenCalled();

    ready();

    expect(terminalHarness.write).toHaveBeenCalledTimes(1);
    expect(terminalHarness.write.mock.calls[0][0]).toHaveLength(1024 * 1024);
  });

  it('does not establish post-history cursor semantics for a live-only threshold drain', () => {
    render(false);
    ready();
    callbacks().onOutput('x'.repeat(1024 * 1024));
    callbacks().onOutput('\x1b[1;1H');

    render(true);
    act(flushFrames);

    expect(terminalHarness.write).toHaveBeenCalledTimes(2);
    expect(terminalHarness.write.mock.calls[1][0]).toBe('\x1b[1;1H');
    expect(terminalHarness.xtermWrite).not.toHaveBeenCalled();
  });

  it('does not let a delayed history marker restore an obsolete cursor after real live content', () => {
    terminalHarness.deferXtermCallbacks = true;
    render(false);
    callbacks().onReplay([{ cols: 80, rows: 24, data: 'history' }]);
    callbacks().onOutput('real-live');
    callbacks().onOutput('\x1b[1;1H');
    ready();

    render(true);
    act(flushFrames);

    expect(terminalHarness.write.mock.calls.map(([data]) => data)).toEqual([
      'history',
      'real-live\x1b[1;1H',
    ]);
    expect(terminalHarness.xtermCallbacks).toHaveLength(1);

    act(() => {
      terminalHarness.xtermCallbacks.splice(0).forEach(callback => callback());
    });
    act(() => {
      callbacks().onOutput('\x1b[2;2H');
    });

    expect(terminalHarness.write.mock.calls[2][0]).toBe('\x1b[2;2H');
    expect(terminalHarness.xtermWrite).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending history marker valid across cursor-only output', () => {
    terminalHarness.deferXtermCallbacks = true;
    render(true);
    ready();
    callbacks().onReplay([{ cols: 80, rows: 24, data: 'history' }]);
    callbacks().onOutput('\x1b[1;1H');

    expect(terminalHarness.xtermCallbacks).toHaveLength(1);
    act(() => {
      terminalHarness.xtermCallbacks.shift()?.();
    });
    act(() => {
      callbacks().onOutput('\x1b[2;2H');
    });

    expect(terminalHarness.xtermWrite.mock.calls[1][0]).toBe('\x1b[2;2H');
    expect(terminalHarness.xtermCallbacks).toHaveLength(1);

    act(() => {
      terminalHarness.xtermCallbacks.shift()?.();
    });
    expect(terminalHarness.xtermWrite.mock.calls[2][0]).toBe('\x1b[5;4H');
  });

  it('releases replay-width protection only after every invalidated marker settles', () => {
    terminalHarness.deferXtermCallbacks = true;
    render(true);
    ready();
    callbacks().onReplay([{ cols: 100, rows: 30, data: 'history-1' }]);
    callbacks().onReplay([{ cols: 120, rows: 40, data: 'history-2' }]);
    const widthGuard = terminalHarness.props?.preventShrinkBelowColsRef as { current: number };

    expect(terminalHarness.xtermCallbacks).toHaveLength(2);
    expect(widthGuard.current).toBe(120);

    callbacks().onOutput('real-live');
    const [firstMarker, secondMarker] = terminalHarness.xtermCallbacks.splice(0);
    act(() => {
      firstMarker?.();
    });
    expect(widthGuard.current).toBe(120);
    expect(terminalHarness.fit).not.toHaveBeenCalled();

    act(() => {
      secondMarker?.();
    });
    expect(widthGuard.current).toBe(0);
    expect(terminalHarness.fit).toHaveBeenCalledTimes(1);
    expect(terminalHarness.forceRedraw).toHaveBeenCalledTimes(1);
  });

  it('defers a hidden width-release refresh to the next activation frame', () => {
    terminalHarness.deferXtermCallbacks = true;
    render(true);
    ready();
    callbacks().onReplay([{ cols: 100, rows: 30, data: 'history' }]);
    render(false);
    callbacks().onOutput('real-live');

    act(() => {
      terminalHarness.xtermCallbacks.shift()?.();
    });

    expect(terminalHarness.fit).not.toHaveBeenCalled();
    expect(terminalHarness.forceRedraw).not.toHaveBeenCalled();

    render(true);
    act(flushFrames);

    expect(terminalHarness.fit).toHaveBeenCalledTimes(1);
    expect(terminalHarness.forceRedraw).toHaveBeenCalledTimes(1);
  });

  it('skips the activation refresh when a stale marker refreshes before the frame runs', () => {
    terminalHarness.deferXtermCallbacks = true;
    render(false);
    ready();
    callbacks().onReplay([{
      cols: 100,
      rows: 30,
      data: 'h'.repeat(1024 * 1024),
    }]);
    callbacks().onOutput('real-live');

    render(true);
    act(() => {
      terminalHarness.xtermCallbacks.shift()?.();
    });

    expect(terminalHarness.fit).toHaveBeenCalledTimes(1);
    expect(terminalHarness.forceRedraw).toHaveBeenCalledTimes(1);

    act(flushFrames);

    expect(terminalHarness.fit).toHaveBeenCalledTimes(1);
    expect(terminalHarness.forceRedraw).toHaveBeenCalledTimes(1);
  });

  it('does not refresh repeatedly when live output arrives without a width guard', () => {
    render(true);
    ready();

    callbacks().onOutput('live-1');
    callbacks().onOutput('live-2');
    callbacks().onOutput('live-3');

    expect(terminalHarness.fit).not.toHaveBeenCalled();
    expect(terminalHarness.forceRedraw).not.toHaveBeenCalled();
  });

  it('disables hidden resize and autofocus, including stale resize callbacks', () => {
    render(true);
    const activeResize = terminalHarness.props?.onResize as (cols: number, rows: number) => void;

    render(false);
    act(() => {
      activeResize(120, 40);
    });

    expect(terminalHarness.props?.autoFocus).toBe(false);
    expect(terminalHarness.props?.onResize).toBeUndefined();
    expect(useTerminalHarness.resize).not.toHaveBeenCalled();
  });

  it('cancels stale activation frames and never writes a deferred batch twice', () => {
    render(false);
    ready();
    callbacks().onOutput('deferred');

    render(true);
    render(false);
    act(flushFrames);

    expect(terminalHarness.write).not.toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();

    render(true);
    act(flushFrames);
    act(flushFrames);

    expect(terminalHarness.write).toHaveBeenCalledTimes(1);
    expect(terminalHarness.write).toHaveBeenCalledWith('deferred');
  });
});
