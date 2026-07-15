import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseLiveElapsedTimeResult {
  elapsedMs: number;
  remainingMs: number | null;
}

/**
 * Live elapsed time tracker for running subagent/tool cards.
 *
 * @param startTime - Tool start timestamp (ms). If undefined, returns 0.
 * @param isRunning - Whether the tool is currently running.
 * @param timeoutMs - Current effective timeout in ms. 0 or undefined = no timeout.
 * @param isTimeoutDisabled - Whether the timeout has been disabled by user.
 * @param presentationActive - Whether the mounted timer is currently visible.
 */
export function useLiveElapsedTime(
  startTime: number | undefined,
  isRunning: boolean,
  timeoutMs: number | undefined,
  isTimeoutDisabled: boolean,
  presentationActive = true,
): UseLiveElapsedTimeResult {
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const computeElapsed = useCallback(() => {
    if (!startTime) return 0;
    return Math.max(0, Date.now() - startTime);
  }, [startTime]);

  useEffect(() => {
    if (!presentationActive) {
      return;
    }

    if (!isRunning) {
      setElapsedMs(computeElapsed());
      return;
    }

    // Running: update immediately then start interval.
    const update = () => {
      const elapsed = computeElapsed();
      setElapsedMs(elapsed);
    };
    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [computeElapsed, isRunning, presentationActive]);

  const remainingMs = isTimeoutDisabled || !timeoutMs || timeoutMs <= 0
    ? null
    : Math.max(0, timeoutMs - elapsedMs);

  return { elapsedMs, remainingMs };
}
