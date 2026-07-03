import { describe, expect, it } from 'vitest';
import { normalizeTerminalReplay } from './terminalReplay';
import type { GetHistoryResponse } from '../types';

describe('normalizeTerminalReplay', () => {
  it('preserves ordered structured replay events', () => {
    const history: GetHistoryResponse = {
      sessionId: 'session-1',
      events: [
        { cols: 80, rows: 24, data: 'first' },
        { cols: 100, rows: 30, data: '' },
        { cols: 100, rows: 30, data: 'second' },
      ],
      data: 'firstsecond',
      historySize: 11,
      cols: 100,
      rows: 30,
    };

    expect(normalizeTerminalReplay(history)).toEqual(history.events);
  });

  it('falls back to flat history when structured events are absent', () => {
    const history: GetHistoryResponse = {
      sessionId: 'session-1',
      data: 'legacy',
      historySize: 6,
      cols: 90,
      rows: 25,
    };

    expect(normalizeTerminalReplay(history)).toEqual([
      { cols: 90, rows: 25, data: 'legacy' },
    ]);
  });

  it('returns no replay events for empty history', () => {
    const history: GetHistoryResponse = {
      sessionId: 'session-1',
      data: '',
      historySize: 0,
      cols: 80,
      rows: 24,
    };

    expect(normalizeTerminalReplay(history)).toEqual([]);
  });
});
