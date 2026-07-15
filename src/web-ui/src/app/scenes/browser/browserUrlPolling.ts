export interface BrowserPollingVisibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface BrowserPollingTimers {
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

export interface StartBrowserUrlPollingOptions {
  label: string;
  intervalMs?: number;
  visibility?: BrowserPollingVisibility;
  timers?: BrowserPollingTimers;
  readUrl?: (label: string) => Promise<string>;
  onUrl: (sourceLabel: string, url: string) => void;
}

const defaultTimers: BrowserPollingTimers = {
  setInterval(callback, delayMs) {
    return setInterval(callback, delayMs);
  },
  clearInterval(handle) {
    clearInterval(handle);
  },
};

async function defaultReadUrl(label: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('browser_get_url', { request: { label } });
}

export function startBrowserUrlPolling(options: StartBrowserUrlPollingOptions): () => void {
  const {
    label,
    intervalMs = 500,
    visibility = document,
    timers = defaultTimers,
    readUrl = defaultReadUrl,
    onUrl,
  } = options;

  let disposed = false;
  let generation = 0;
  let inFlightGeneration: number | null = null;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let isHidden = visibility.hidden;

  const poll = async () => {
    const pollGeneration = generation;
    if (
      disposed
      || isHidden
      || visibility.hidden
      || inFlightGeneration === pollGeneration
    ) {
      return;
    }

    inFlightGeneration = pollGeneration;
    try {
      const url = await readUrl(label);
      if (
        !disposed
        && !isHidden
        && !visibility.hidden
        && generation === pollGeneration
      ) {
        onUrl(label, url);
      }
    } catch {
      // URL polling is best-effort; the next interval can retry.
    } finally {
      if (inFlightGeneration === pollGeneration) {
        inFlightGeneration = null;
      }
    }
  };

  const stopInterval = () => {
    if (intervalHandle === null) {
      return;
    }

    timers.clearInterval(intervalHandle);
    intervalHandle = null;
  };

  const startInterval = () => {
    if (disposed || isHidden || visibility.hidden || intervalHandle !== null) {
      return;
    }

    intervalHandle = timers.setInterval(() => {
      void poll();
    }, intervalMs);
  };

  const invalidatePendingRead = () => {
    generation += 1;
    inFlightGeneration = null;
  };

  const startVisibleCycle = () => {
    invalidatePendingRead();
    void poll();
    startInterval();
  };

  const handleVisibilityChange = () => {
    const nextHidden = visibility.hidden;
    if (nextHidden === isHidden) {
      return;
    }

    isHidden = nextHidden;
    if (isHidden) {
      invalidatePendingRead();
      stopInterval();
    } else {
      startVisibleCycle();
    }
  };

  visibility.addEventListener('visibilitychange', handleVisibilityChange);
  if (!isHidden) {
    startVisibleCycle();
  }

  return () => {
    if (disposed) {
      return;
    }

    disposed = true;
    invalidatePendingRead();
    stopInterval();
    visibility.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
