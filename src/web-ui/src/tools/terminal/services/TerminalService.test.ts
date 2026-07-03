import { describe, expect, it } from 'vitest';
import { TerminalService } from './TerminalService';
import type { TerminalEvent } from '../types';

type TestableTerminalService = TerminalService & {
  handleTerminalEvent: (rawEvent: unknown) => void;
};

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
