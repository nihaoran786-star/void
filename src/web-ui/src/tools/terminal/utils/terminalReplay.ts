import type { GetHistoryResponse, TerminalReplayEvent } from '../types';

export function normalizeTerminalReplay(history: GetHistoryResponse): TerminalReplayEvent[] {
  if (history.events?.length) {
    return history.events;
  }

  if (!history.data) {
    return [];
  }

  return [{
    cols: history.cols,
    rows: history.rows,
    data: history.data,
  }];
}
