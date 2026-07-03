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
      historyStatus: 'ready',
      historySource: 'local',
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
      historyStatus: 'ready',
      historySource: 'local',
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
      historyStatus: 'ready',
      historySource: 'local',
      cols: 80,
      rows: 24,
    };

    expect(normalizeTerminalReplay(history)).toEqual([]);
  });

  it('keeps remote unsupported history explicit while returning no replay events', () => {
    const history: GetHistoryResponse = {
      sessionId: 'remote-session',
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

    expect(normalizeTerminalReplay(history)).toEqual([]);
    expect(history.historyStatus).toBe('unsupported');
    expect(history.historySource).toBe('remote');
    expect(history.errorCode).toBe('remote_history_unsupported');
  });
});
