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

export function terminalReplayHasScreenText(events: Array<Pick<TerminalReplayEvent, 'data'>>): boolean {
  return events.some((event) => hasPrintableScreenText(event.data));
}

function hasPrintableScreenText(data: string): boolean {
  return stripTerminalControls(data).trim().length > 0;
}

function stripTerminalControls(data: string): string {
  return data
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '');
}
