import { describe, expect, it, vi } from 'vitest';
import {
  startBrowserUrlPolling,
  type BrowserPollingTimers,
  type BrowserPollingVisibility,
} from './browserUrlPolling';

class TestVisibility implements BrowserPollingVisibility {
  hidden = false;

  private readonly listeners = new Set<() => void>();

  addEventListener(type: 'visibilitychange', listener: () => void): void {
    if (type === 'visibilitychange') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: 'visibilitychange', listener: () => void): void {
    if (type === 'visibilitychange') {
      this.listeners.delete(listener);
    }
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of this.listeners) {
      listener();
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

class TestTimers implements BrowserPollingTimers {
  private nextHandle = 1;

  private readonly intervals = new Map<ReturnType<typeof setInterval>, () => void>();

  setInterval(callback: () => void, _delayMs: number): ReturnType<typeof setInterval> {
    const handle = this.nextHandle++ as unknown as ReturnType<typeof setInterval>;
    this.intervals.set(handle, callback);
    return handle;
  }

  clearInterval(handle: ReturnType<typeof setInterval>): void {
    this.intervals.delete(handle);
  }

  activeCount(): number {
    return this.intervals.size;
  }

  tick(): void {
    for (const callback of [...this.intervals.values()]) {
      callback();
    }
  }
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe('startBrowserUrlPolling', () => {
  it('stops while the document is hidden and resumes when it becomes visible', () => {
    const visibility = new TestVisibility();
    const timers = new TestTimers();

    const stop = startBrowserUrlPolling({
      label: 'browser-1',
      intervalMs: 500,
      visibility,
      timers,
      readUrl: vi.fn(async () => 'https://example.com'),
      onUrl: vi.fn(),
    });

    expect(timers.activeCount()).toBe(1);
    expect(visibility.listenerCount()).toBe(1);

    visibility.setHidden(true);
    expect(timers.activeCount()).toBe(0);

    visibility.setHidden(false);
    expect(timers.activeCount()).toBe(1);

    stop();
    expect(timers.activeCount()).toBe(0);
    expect(visibility.listenerCount()).toBe(0);
  });

  it('does not start another URL read while the previous read is pending', () => {
    const visibility = new TestVisibility();
    const timers = new TestTimers();
    const deferred = createDeferred<string>();
    const readUrl = vi.fn(() => deferred.promise);

    const stop = startBrowserUrlPolling({
      label: 'browser-2',
      visibility,
      timers,
      readUrl,
      onUrl: vi.fn(),
    });

    timers.tick();
    timers.tick();

    expect(readUrl).toHaveBeenCalledTimes(1);
    expect(readUrl).toHaveBeenCalledWith('browser-2');

    stop();
  });

  it('is idempotent and ignores a URL result that arrives after cleanup', async () => {
    const visibility = new TestVisibility();
    const timers = new TestTimers();
    const deferred = createDeferred<string>();
    const onUrl = vi.fn();

    const stop = startBrowserUrlPolling({
      label: 'browser-3',
      visibility,
      timers,
      readUrl: () => deferred.promise,
      onUrl,
    });

    timers.tick();
    stop();
    stop();
    deferred.resolve('https://late.example.com');
    await deferred.promise;
    await Promise.resolve();

    expect(onUrl).not.toHaveBeenCalled();
    expect(timers.activeCount()).toBe(0);
    expect(visibility.listenerCount()).toBe(0);
  });
});
