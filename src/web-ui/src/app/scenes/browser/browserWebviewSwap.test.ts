import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserWebviewCommitCoordinator,
  createBrowserPendingNavigationController,
  swapBrowserWebview,
  type BrowserWebviewSlot,
} from './browserWebviewSwap';

interface FakeHandle {
  id: string;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function slot(id: string): BrowserWebviewSlot<FakeHandle> {
  return { handle: { id }, label: id };
}

function coordinator() {
  return createBrowserWebviewCommitCoordinator();
}

describe('swapBrowserWebview', () => {
  it('keeps the previous slot authoritative while a candidate is being created', async () => {
    const previous = slot('previous');
    const candidate = slot('candidate');
    const ready = deferred();
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    let requestIsCurrent = true;
    const close = vi.fn(async () => {});

    const swapping = swapBrowserWebview({
      commitCoordinator: coordinator(),
      commitCandidate: () => {},
      createCandidate: () => candidate,
      waitForCandidate: () => ready.promise,
      prepareCandidate: async () => {},
      activateCandidate: async () => true,
      isCurrentRequest: () => requestIsCurrent,
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close,
    });

    expect(current).toBe(previous);
    requestIsCurrent = false;
    ready.resolve();

    await expect(swapping).resolves.toEqual({ status: 'stale' });
    expect(current).toBe(previous);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(candidate);
  });

  it('rolls back the old handle, label, and polling slot when activation fails', async () => {
    const previous = slot('previous');
    const candidate = slot('candidate');
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    const publishedLabels: Array<string | null> = [];
    const close = vi.fn(async () => {});
    let authoritativeUrl = 'https://previous.example';
    let pollingLabel = 'previous';

    const swapping = swapBrowserWebview({
      commitCoordinator: coordinator(),
      commitCandidate: () => {
        authoritativeUrl = 'https://candidate.example';
        pollingLabel = 'candidate';
      },
      createCandidate: () => candidate,
      waitForCandidate: async () => {},
      prepareCandidate: async () => {},
      activateCandidate: async () => {
        throw new Error('show failed');
      },
      isCurrentRequest: () => true,
      readCurrent: () => current,
      publish: (next) => {
        current = next;
        publishedLabels.push(next?.label ?? null);
      },
      close,
    });

    await expect(swapping).rejects.toThrow('show failed');
    expect(current).toBe(previous);
    expect(publishedLabels).toEqual(['candidate', 'previous']);
    expect(authoritativeUrl).toBe('https://previous.example');
    expect(pollingLabel).toBe('previous');
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(candidate);
  });

  it('keeps the previous slot when candidate readiness fails', async () => {
    const previous = slot('previous');
    const candidate = slot('candidate');
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    const close = vi.fn(async () => {});

    const swapping = swapBrowserWebview({
      commitCoordinator: coordinator(),
      commitCandidate: () => {},
      createCandidate: () => candidate,
      waitForCandidate: async () => {
        throw new Error('create failed');
      },
      prepareCandidate: async () => {},
      activateCandidate: async () => true,
      isCurrentRequest: () => true,
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close,
    });

    await expect(swapping).rejects.toThrow('create failed');
    expect(current).toBe(previous);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(candidate);
  });

  it('publishes and activates the candidate before retiring the previous handle', async () => {
    const previous = slot('previous');
    const candidate = slot('candidate');
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    const events: string[] = [];

    const result = await swapBrowserWebview({
      commitCoordinator: coordinator(),
      commitCandidate: (committed) => {
        events.push(`committed:${committed.label}`);
      },
      createCandidate: () => candidate,
      waitForCandidate: async () => {
        events.push('ready');
      },
      prepareCandidate: async () => {
        events.push('prepared');
      },
      activateCandidate: async () => {
        events.push(`activated:${current?.label}`);
        return true;
      },
      isCurrentRequest: () => true,
      readCurrent: () => current,
      publish: (next) => {
        current = next;
        events.push(`published:${next?.label ?? 'none'}`);
      },
      close: async (retired) => {
        events.push(`closed:${retired.label}`);
      },
    });

    expect(result).toEqual({ status: 'committed', slot: candidate });
    expect(current).toBe(candidate);
    expect(events).toEqual([
      'ready',
      'prepared',
      'published:candidate',
      'activated:candidate',
      'committed:candidate',
      'closed:previous',
    ]);
  });

  it('rolls back a published candidate that becomes stale during show', async () => {
    const previous = slot('previous');
    const candidate = slot('candidate');
    const showing = deferred();
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    let requestIsCurrent = true;
    const close = vi.fn(async () => {});

    const swapping = swapBrowserWebview({
      commitCoordinator: coordinator(),
      commitCandidate: () => {},
      createCandidate: () => candidate,
      waitForCandidate: async () => {},
      prepareCandidate: async () => {},
      activateCandidate: async () => {
        await showing.promise;
        return true;
      },
      isCurrentRequest: () => requestIsCurrent,
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close,
    });

    await vi.waitFor(() => expect(current).toBe(candidate));
    requestIsCurrent = false;
    showing.resolve();

    await expect(swapping).resolves.toEqual({ status: 'stale' });
    expect(current).toBe(previous);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(candidate);
  });

  it('never rolls a failed latest overlap back to an already retired candidate', async () => {
    const previous = slot('previous');
    const firstCandidate = slot('first');
    const latestCandidate = slot('latest');
    const firstActivation = deferred();
    const commitCoordinator = coordinator();
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    let latestRequest = 'first';
    const closed: string[] = [];

    const firstSwap = swapBrowserWebview({
      commitCoordinator,
      commitCandidate: () => {},
      createCandidate: () => firstCandidate,
      waitForCandidate: async () => {},
      prepareCandidate: async () => {},
      activateCandidate: async () => {
        await firstActivation.promise;
        return true;
      },
      isCurrentRequest: () => latestRequest === 'first',
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close: async (retired) => {
        closed.push(retired.label);
      },
    });

    await vi.waitFor(() => expect(current).toBe(firstCandidate));
    latestRequest = 'latest';
    const latestSwap = swapBrowserWebview({
      commitCoordinator,
      commitCandidate: () => {},
      createCandidate: () => latestCandidate,
      waitForCandidate: async () => {},
      prepareCandidate: async () => {},
      activateCandidate: async () => {
        throw new Error('latest show failed');
      },
      isCurrentRequest: () => latestRequest === 'latest',
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close: async (retired) => {
        closed.push(retired.label);
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(current).toBe(firstCandidate);

    firstActivation.resolve();

    await expect(firstSwap).resolves.toEqual({ status: 'stale' });
    await expect(latestSwap).rejects.toThrow('latest show failed');
    expect(current).toBe(previous);
    expect(closed).toEqual(['first', 'latest']);
    expect(closed).not.toContain('previous');
  });

  it('classifies a false activation as stale after a newer failed request and leaves previous visible', async () => {
    const previous = slot('previous');
    const firstCandidate = slot('first');
    const latestCandidate = slot('latest');
    const firstActivation = deferred();
    const commitCoordinator = coordinator();
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    let latestRequest = 'first';
    let authoritativeUrl = 'https://previous.example';
    let pollingLabel = 'previous';
    const closed: string[] = [];
    const hideRestoredPrevious = vi.fn();

    const firstSwap = swapBrowserWebview({
      commitCoordinator,
      commitCandidate: () => {
        authoritativeUrl = 'https://first.example';
        pollingLabel = 'first';
      },
      createCandidate: () => firstCandidate,
      waitForCandidate: async () => {},
      prepareCandidate: async () => {},
      activateCandidate: async () => {
        await firstActivation.promise;
        return false;
      },
      isCurrentRequest: () => latestRequest === 'first',
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close: async (retired) => {
        closed.push(retired.label);
      },
    });

    await vi.waitFor(() => expect(current).toBe(firstCandidate));
    latestRequest = 'latest';

    const latestSwap = swapBrowserWebview({
      commitCoordinator,
      commitCandidate: () => {
        authoritativeUrl = 'https://latest.example';
        pollingLabel = 'latest';
      },
      createCandidate: () => latestCandidate,
      waitForCandidate: async () => {
        throw new Error('latest readiness failed');
      },
      prepareCandidate: async () => {},
      activateCandidate: async () => true,
      isCurrentRequest: () => latestRequest === 'latest',
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close: async (retired) => {
        closed.push(retired.label);
      },
    });

    await expect(latestSwap).rejects.toThrow('latest readiness failed');
    firstActivation.resolve();
    const firstResult = await firstSwap;

    // Mirrors the Scene/Panel restoration contract: only a genuinely blocked
    // current request hides the restored previous handle at zero-size bounds.
    if (firstResult.status === 'blocked') {
      hideRestoredPrevious();
    }

    expect(firstResult).toEqual({ status: 'stale' });
    expect(current).toBe(previous);
    expect(hideRestoredPrevious).not.toHaveBeenCalled();
    expect(authoritativeUrl).toBe('https://previous.example');
    expect(pollingLabel).toBe('previous');
    expect(closed).toEqual(['latest', 'first']);
    expect(closed).not.toContain('previous');
  });

  it('rolls back a bounds-blocked candidate without committing metadata or retiring previous', async () => {
    const previous = slot('previous');
    const candidate = slot('candidate');
    let current: BrowserWebviewSlot<FakeHandle> | null = previous;
    let authoritativeUrl = 'https://previous.example';
    let pollingLabel = 'previous';
    const close = vi.fn(async () => {});

    const result = await swapBrowserWebview({
      commitCoordinator: coordinator(),
      commitCandidate: () => {
        authoritativeUrl = 'https://candidate.example';
        pollingLabel = 'candidate';
      },
      createCandidate: () => candidate,
      waitForCandidate: async () => {},
      prepareCandidate: async () => {},
      activateCandidate: async () => false,
      isCurrentRequest: () => true,
      readCurrent: () => current,
      publish: (next) => {
        current = next;
      },
      close,
    });

    expect(result).toEqual({ status: 'blocked' });
    expect(current).toBe(previous);
    expect(authoritativeUrl).toBe('https://previous.example');
    expect(pollingLabel).toBe('previous');
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(candidate);
    expect(close).not.toHaveBeenCalledWith(previous);
  });

  it('keeps a blocked navigation pending until a visible-host retry commits', () => {
    const pending = createBrowserPendingNavigationController();

    pending.begin('https://next.example', 1);
    pending.suspend(1);
    expect(pending.retryUrl()).toBe('https://next.example');

    pending.begin('https://next.example', 2);
    expect(pending.retryUrl()).toBeNull();
    pending.clear(1);
    expect(pending.snapshot()).toEqual({
      inFlight: true,
      requestToken: 2,
      url: 'https://next.example',
    });

    pending.clear(2);
    expect(pending.snapshot()).toBeNull();
  });
});
