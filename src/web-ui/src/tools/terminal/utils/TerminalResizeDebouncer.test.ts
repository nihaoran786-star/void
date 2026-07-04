import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';

import { TerminalResizeDebouncer } from './TerminalResizeDebouncer';

function createTerminal(cols: number, rows: number, bufferLength: number): Terminal {
  return {
    cols,
    rows,
    buffer: {
      normal: {
        length: bufferLength,
      },
    },
  } as unknown as Terminal;
}

describe('TerminalResizeDebouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs backend resize when immediate local xterm resize is accepted', async () => {
    vi.useFakeTimers();
    const terminal = createTerminal(120, 30, 20);
    const onXtermResize = vi.fn((_cols: number, _rows: number) => true);
    const onBackendResize = vi.fn();
    const onResizeComplete = vi.fn();

    const debouncer = new TerminalResizeDebouncer({
      getTerminal: () => terminal,
      isVisible: () => true,
      onXtermResize,
      onBackendResize,
      onResizeComplete,
    });

    debouncer.resize(100, 24, true);
    await vi.runAllTimersAsync();

    expect(onXtermResize).toHaveBeenCalledWith(100, 24);
    expect(onBackendResize).toHaveBeenCalledWith(100, 24);
    expect(onResizeComplete).toHaveBeenCalledTimes(1);
  });

  it('does not sync backend resize when immediate local xterm resize is rejected', async () => {
    vi.useFakeTimers();
    const terminal = createTerminal(120, 30, 20);
    const onXtermResize = vi.fn((_cols: number, _rows: number) => false);
    const onBackendResize = vi.fn();
    const onResizeComplete = vi.fn();

    const debouncer = new TerminalResizeDebouncer({
      getTerminal: () => terminal,
      isVisible: () => true,
      onXtermResize,
      onBackendResize,
      onResizeComplete,
    });

    debouncer.resize(80, 24, true);
    await vi.runAllTimersAsync();

    expect(onXtermResize).toHaveBeenCalledWith(80, 24);
    expect(onBackendResize).not.toHaveBeenCalled();
    expect(onResizeComplete).not.toHaveBeenCalled();
  });

  it('does not sync backend resize when row-only local xterm resize is rejected', async () => {
    vi.useFakeTimers();
    const terminal = createTerminal(120, 30, 500);
    const onXtermResize = vi.fn((_cols: number, _rows: number) => false);
    const onBackendResize = vi.fn();
    const onResizeComplete = vi.fn();

    const debouncer = new TerminalResizeDebouncer({
      getTerminal: () => terminal,
      isVisible: () => true,
      onXtermResize,
      onBackendResize,
      onResizeComplete,
    });

    debouncer.resize(120, 24);
    await vi.runAllTimersAsync();

    expect(onXtermResize).toHaveBeenCalledWith(120, 24);
    expect(onBackendResize).not.toHaveBeenCalled();
    expect(onResizeComplete).not.toHaveBeenCalled();
  });

  it('does not sync backend resize when flushed local xterm resize is rejected', async () => {
    vi.useFakeTimers();
    const terminal = createTerminal(120, 30, 500);
    const onXtermResize = vi.fn((_cols: number, _rows: number) => false);
    const onBackendResize = vi.fn();
    const onResizeComplete = vi.fn();

    const debouncer = new TerminalResizeDebouncer({
      getTerminal: () => terminal,
      isVisible: () => true,
      onXtermResize,
      onBackendResize,
      onResizeComplete,
    });

    debouncer.resize(100, 24);
    debouncer.flush();
    await vi.runAllTimersAsync();

    expect(onXtermResize).toHaveBeenCalledWith(100, 24);
    expect(onBackendResize).not.toHaveBeenCalled();
    expect(onResizeComplete).not.toHaveBeenCalled();
  });
});
