import type { TerminalEvent } from '../types';

export function createReplayAwareTerminalEventHandler(
  dispatch: (event: TerminalEvent) => void,
) {
  let replaying = true;
  const queuedEvents: TerminalEvent[] = [];

  return {
    handleEvent(event: TerminalEvent) {
      if (replaying) {
        queuedEvents.push(event);
        return;
      }
      dispatch(event);
    },
    finishReplay() {
      if (!replaying) {
        return;
      }
      replaying = false;
      queuedEvents.splice(0).forEach(dispatch);
    },
  };
}
