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
  onUrl: (url: string) => void;
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
  let inFlight = false;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const poll = async () => {
    if (disposed || inFlight || visibility.hidden) {
      return;
    }

    inFlight = true;
    try {
      const url = await readUrl(label);
      if (!disposed) {
        onUrl(url);
      }
    } catch {
      // URL polling is best-effort; the next interval can retry.
    } finally {
      inFlight = false;
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
    if (disposed || visibility.hidden || intervalHandle !== null) {
      return;
    }

    intervalHandle = timers.setInterval(() => {
      void poll();
    }, intervalMs);
  };

  const handleVisibilityChange = () => {
    if (visibility.hidden) {
      stopInterval();
    } else {
      startInterval();
    }
  };

  visibility.addEventListener('visibilitychange', handleVisibilityChange);
  startInterval();

  return () => {
    if (disposed) {
      return;
    }

    disposed = true;
    stopInterval();
    visibility.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
