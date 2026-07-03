import { describe, expect, it } from 'vitest';
import { createReplayAwareTerminalEventHandler } from './terminalReplayEventQueue';
import type { TerminalEvent } from '../types';

describe('createReplayAwareTerminalEventHandler', () => {
  it('queues live events during replay and flushes them in order after replay', () => {
    const received: TerminalEvent[] = [];
    const replayAwareHandler = createReplayAwareTerminalEventHandler((event) => {
      received.push(event);
    });

    replayAwareHandler.handleEvent({ type: 'output', sessionId: 'session-1', data: 'live-1' });
    replayAwareHandler.handleEvent({ type: 'resize', sessionId: 'session-1', cols: 100, rows: 30 });

    expect(received).toEqual([]);

    replayAwareHandler.finishReplay();

    expect(received).toEqual([
      { type: 'output', sessionId: 'session-1', data: 'live-1' },
      { type: 'resize', sessionId: 'session-1', cols: 100, rows: 30 },
    ]);
  });

  it('dispatches immediately after replay has finished', () => {
    const received: TerminalEvent[] = [];
    const replayAwareHandler = createReplayAwareTerminalEventHandler((event) => {
      received.push(event);
    });

    replayAwareHandler.finishReplay();
    replayAwareHandler.handleEvent({ type: 'output', sessionId: 'session-1', data: 'live-2' });

    expect(received).toEqual([
      { type: 'output', sessionId: 'session-1', data: 'live-2' },
    ]);
  });

  it('does not queue the same live event object twice during replay handoff', () => {
    const received: TerminalEvent[] = [];
    const replayAwareHandler = createReplayAwareTerminalEventHandler((event) => {
      received.push(event);
    });
    const liveEvent: TerminalEvent = { type: 'output', sessionId: 'session-1', data: 'live-1' };

    replayAwareHandler.handleEvent(liveEvent);
    replayAwareHandler.handleEvent(liveEvent);
    replayAwareHandler.finishReplay();

    expect(received).toEqual([
      { type: 'output', sessionId: 'session-1', data: 'live-1' },
    ]);
  });
});
