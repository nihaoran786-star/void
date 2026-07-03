// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GetHistoryResponse,
  SessionResponse,
  TerminalEvent,
  TerminalReplayEvent,
} from '../types';

const terminalServiceMock = vi.hoisted(() => ({
  connect: vi.fn(),
  isConnected: vi.fn(),
  getSession: vi.fn(),
  getHistory: vi.fn(),
  onSessionEvent: vi.fn(),
  drainPendingSessionEvents: vi.fn(),
  clearPendingSessionEvents: vi.fn(),
  acknowledge: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  sendCtrlC: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../services', () => ({
  getTerminalService: () => terminalServiceMock,
  TerminalService: class TerminalService {},
}));

import { useTerminal } from './useTerminal';

const session: SessionResponse = {
  id: 'session-1',
  name: 'Session 1',
  shellType: 'PowerShell',
  cwd: 'D:\\workspace',
  status: 'Running',
  cols: 80,
  rows: 24,
  source: 'manual',
};

function flushAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function UseTerminalHarness({
  onReplay,
  onOutput,
}: {
  onReplay: (events: TerminalReplayEvent[]) => void;
  onOutput: (data: string) => void;
}) {
  useTerminal({
    sessionId: 'session-1',
    onReplay,
    onOutput,
  });
  return null;
}

describe('useTerminal replay ordering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    terminalServiceMock.connect.mockResolvedValue(undefined);
    terminalServiceMock.isConnected.mockReturnValue(true);
    terminalServiceMock.getSession.mockResolvedValue(session);
    terminalServiceMock.clearPendingSessionEvents.mockReturnValue(undefined);
    terminalServiceMock.drainPendingSessionEvents.mockReturnValue([]);
    terminalServiceMock.onSessionEvent.mockReturnValue(() => {});
    terminalServiceMock.acknowledge.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('replays structured history events before flushing live events queued during replay', async () => {
    const historyEvents: TerminalReplayEvent[] = [
      { cols: 80, rows: 24, data: 'history-1' },
      { cols: 100, rows: 30, data: 'history-2' },
    ];
    const historyResponse: GetHistoryResponse = {
      sessionId: 'session-1',
      events: historyEvents,
      data: 'history-1history-2',
      historySize: 18,
      historyStatus: 'ready',
      historySource: 'local',
      cols: 100,
      rows: 30,
    };
    const order: string[] = [];

    terminalServiceMock.getHistory.mockResolvedValue(historyResponse);
    terminalServiceMock.onSessionEvent.mockImplementation((
      _sessionId: string,
      callback: (event: TerminalEvent) => void,
    ) => {
      callback({ type: 'output', sessionId: 'session-1', data: 'live-1' });
      return () => {};
    });

    await act(async () => {
      root.render(
        <UseTerminalHarness
          onReplay={(events) => {
            order.push(`replay:${events.map(event => event.data).join('|')}`);
          }}
          onOutput={(data) => {
            order.push(`output:${data}`);
          }}
        />,
      );
      await flushAsyncWork();
    });

    expect(order).toEqual([
      'replay:history-1|history-2',
      'output:live-1',
    ]);
    expect(terminalServiceMock.clearPendingSessionEvents).toHaveBeenCalledWith('session-1');
    expect(terminalServiceMock.getHistory).toHaveBeenCalledWith('session-1');
    expect(terminalServiceMock.onSessionEvent).toHaveBeenCalledWith('session-1', expect.any(Function));
  });

  it('replays structured history events before flushing drained pending session events', async () => {
    const historyEvents: TerminalReplayEvent[] = [
      { cols: 80, rows: 24, data: 'history-1' },
    ];
    const historyResponse: GetHistoryResponse = {
      sessionId: 'session-1',
      events: historyEvents,
      data: 'history-1',
      historySize: 9,
      historyStatus: 'ready',
      historySource: 'local',
      cols: 80,
      rows: 24,
    };
    const order: string[] = [];

    terminalServiceMock.getHistory.mockResolvedValue(historyResponse);
    terminalServiceMock.drainPendingSessionEvents.mockReturnValue([
      { type: 'output', sessionId: 'session-1', data: 'pending-live-1' },
    ]);

    await act(async () => {
      root.render(
        <UseTerminalHarness
          onReplay={(events) => {
            order.push(`replay:${events.map(event => event.data).join('|')}`);
          }}
          onOutput={(data) => {
            order.push(`output:${data}`);
          }}
        />,
      );
      await flushAsyncWork();
    });

    expect(order).toEqual([
      'replay:history-1',
      'output:pending-live-1',
    ]);
    expect(terminalServiceMock.drainPendingSessionEvents).toHaveBeenCalledWith('session-1');
    expect(terminalServiceMock.acknowledge).toHaveBeenCalledWith('session-1', 'pending-live-1'.length);
  });

  it('treats remote unsupported history as empty replay without breaking live events', async () => {
    const historyResponse: GetHistoryResponse = {
      sessionId: 'session-1',
      events: [],
      data: '',
      historySize: 0,
      historyStatus: 'unsupported',
      historySource: 'remote',
      errorCode: 'remote_history_unsupported',
      error: 'Remote terminal history replay is not supported yet',
      cols: 120,
      rows: 30,
    };
    const order: string[] = [];

    terminalServiceMock.getHistory.mockResolvedValue(historyResponse);
    terminalServiceMock.drainPendingSessionEvents.mockReturnValue([
      { type: 'output', sessionId: 'session-1', data: 'live-after-unsupported-history' },
    ]);

    await act(async () => {
      root.render(
        <UseTerminalHarness
          onReplay={(events) => {
            order.push(`replay:${events.length}`);
          }}
          onOutput={(data) => {
            order.push(`output:${data}`);
          }}
        />,
      );
      await flushAsyncWork();
    });

    expect(order).toEqual(['output:live-after-unsupported-history']);
    expect(terminalServiceMock.getHistory).toHaveBeenCalledWith('session-1');
    expect(terminalServiceMock.onSessionEvent).toHaveBeenCalledWith('session-1', expect.any(Function));
    expect(terminalServiceMock.drainPendingSessionEvents).toHaveBeenCalledWith('session-1');
    expect(terminalServiceMock.acknowledge).toHaveBeenCalledWith('session-1', 'live-after-unsupported-history'.length);
  });

  it('does not acknowledge replayed history output as live terminal consumption', async () => {
    const historyEvents: TerminalReplayEvent[] = [
      { cols: 80, rows: 24, data: 'history-only' },
    ];
    const historyResponse: GetHistoryResponse = {
      sessionId: 'session-1',
      events: historyEvents,
      data: 'history-only',
      historySize: 12,
      historyStatus: 'ready',
      historySource: 'local',
      cols: 80,
      rows: 24,
    };

    terminalServiceMock.getHistory.mockResolvedValue(historyResponse);

    await act(async () => {
      root.render(
        <UseTerminalHarness
          onReplay={() => {}}
          onOutput={() => {}}
        />,
      );
      await flushAsyncWork();
      await flushAsyncWork();
    });

    expect(terminalServiceMock.acknowledge).not.toHaveBeenCalled();
  });

  it('acknowledges live output after delivering it to the consumer', async () => {
    const historyResponse: GetHistoryResponse = {
      sessionId: 'session-1',
      events: [],
      data: '',
      historySize: 0,
      historyStatus: 'ready',
      historySource: 'local',
      cols: 80,
      rows: 24,
    };
    const order: string[] = [];

    terminalServiceMock.getHistory.mockResolvedValue(historyResponse);
    terminalServiceMock.onSessionEvent.mockImplementation((
      _sessionId: string,
      callback: (event: TerminalEvent) => void,
    ) => {
      callback({ type: 'output', sessionId: 'session-1', data: 'live-output' });
      return () => {};
    });
    terminalServiceMock.acknowledge.mockImplementation(async (_sessionId: string, _charCount: number) => {
      order.push('ack');
    });

    await act(async () => {
      root.render(
        <UseTerminalHarness
          onReplay={() => {
            order.push('replay');
          }}
          onOutput={(data) => {
            order.push(`output:${data}`);
          }}
        />,
      );
      await flushAsyncWork();
      await flushAsyncWork();
    });

    expect(order).toEqual(['output:live-output', 'ack']);
    expect(terminalServiceMock.acknowledge).toHaveBeenCalledWith('session-1', 'live-output'.length);
  });

  it('keeps delivered live output when acknowledgement fails', async () => {
    const historyResponse: GetHistoryResponse = {
      sessionId: 'session-1',
      events: [],
      data: '',
      historySize: 0,
      historyStatus: 'ready',
      historySource: 'local',
      cols: 80,
      rows: 24,
    };
    const output: string[] = [];

    terminalServiceMock.getHistory.mockResolvedValue(historyResponse);
    terminalServiceMock.onSessionEvent.mockImplementation((
      _sessionId: string,
      callback: (event: TerminalEvent) => void,
    ) => {
      callback({ type: 'output', sessionId: 'session-1', data: 'live-output' });
      return () => {};
    });
    terminalServiceMock.acknowledge.mockRejectedValue(new Error('ack failed'));

    await act(async () => {
      root.render(
        <UseTerminalHarness
          onReplay={() => {}}
          onOutput={(data) => {
            output.push(data);
          }}
        />,
      );
      await flushAsyncWork();
      await flushAsyncWork();
    });

    expect(output).toEqual(['live-output']);
    expect(terminalServiceMock.acknowledge).toHaveBeenCalledWith('session-1', 'live-output'.length);
  });
});
