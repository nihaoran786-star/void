import { afterEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

import {
  classifyTerminalCommandError,
  TerminalCommandError,
  TerminalService,
} from './TerminalService';
import type { TerminalEvent } from '../types';

type TestableTerminalService = TerminalService & {
  handleTerminalEvent: (rawEvent: unknown) => void;
};

afterEach(() => {
  invokeMock.mockReset();
});

describe('TerminalService pending session events', () => {
  it('buffers session events when no session listener is registered', () => {
    const service = TerminalService.getInstance() as TestableTerminalService;
    service.clearPendingSessionEvents('session-1');

    service.handleTerminalEvent({
      type: 'Data',
      payload: {
        session_id: 'session-1',
        data: 'live-output',
      },
    });

    expect(service.drainPendingSessionEvents('session-1')).toEqual<TerminalEvent[]>([
      { type: 'output', sessionId: 'session-1', data: 'live-output' },
    ]);
    expect(service.drainPendingSessionEvents('session-1')).toEqual([]);
  });

  it('buffers session events even when another listener already exists', () => {
    const service = TerminalService.getInstance() as TestableTerminalService;
    service.clearPendingSessionEvents('session-1');
    const received: TerminalEvent[] = [];
    const unsubscribe = service.onSessionEvent('session-1', event => {
      received.push(event);
    });

    try {
      service.handleTerminalEvent({
        type: 'Data',
        payload: {
          session_id: 'session-1',
          data: 'live-output',
        },
      });
    } finally {
      unsubscribe();
    }

    const event = { type: 'output', sessionId: 'session-1', data: 'live-output' } as const;
    expect(received).toEqual<TerminalEvent[]>([event]);
    expect(service.drainPendingSessionEvents('session-1')).toEqual<TerminalEvent[]>([event]);
  });
});

describe('TerminalService terminal command errors', () => {
  it('classifies local session-not-found write failures at the service boundary', async () => {
    invokeMock.mockRejectedValueOnce('Failed to write: Session not found: missing-session');

    await expect(
      TerminalService.getInstance().write('missing-session', 'input')
    ).rejects.toMatchObject({
      status: 'error',
      operation: 'write',
      source: 'local',
      code: 'session_not_found',
      rawMessage: 'Failed to write: Session not found: missing-session',
    });

    expect(invokeMock).toHaveBeenCalledWith('terminal_write', {
      request: {
        sessionId: 'missing-session',
        data: 'input',
      },
    });
  });

  it('classifies remote-manager resize failures without changing the terminal input queue layer', async () => {
    invokeMock.mockRejectedValueOnce('Remote terminal manager not available');

    await expect(
      TerminalService.getInstance().resize('remote-session', 120, 30)
    ).rejects.toMatchObject({
      status: 'error',
      operation: 'resize',
      source: 'remote',
      code: 'remote_manager_unavailable',
      rawMessage: 'Remote terminal manager not available',
    });
  });

  it('classifies history lookup terminal API initialization failures', async () => {
    invokeMock.mockRejectedValueOnce(new Error('Terminal API not initialized: singleton missing'));

    await expect(
      TerminalService.getInstance().getHistory('session-1')
    ).rejects.toMatchObject({
      status: 'error',
      operation: 'getHistory',
      source: 'api',
      code: 'terminal_api_unavailable',
      rawMessage: 'Terminal API not initialized: singleton missing',
    });
  });

  it('keeps terminal command errors as Error instances with readable messages', () => {
    const error = classifyTerminalCommandError(
      'write',
      'Failed to write: provider-specific failure'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TerminalCommandError);
    expect(error.message).toBe('Failed to write: provider-specific failure');
    expect(error).toMatchObject({
      status: 'error',
      operation: 'write',
      source: 'local',
      code: 'operation_failed',
    });
  });
});
