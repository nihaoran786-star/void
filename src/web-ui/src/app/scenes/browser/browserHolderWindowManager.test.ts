import { describe, expect, it, vi } from 'vitest';
import { createBrowserHolderWindowManager } from './browserHolderWindowManager';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('createBrowserHolderWindowManager', () => {
  it('shares one app-lifetime holder promise across concurrent callers', async () => {
    const manager = createBrowserHolderWindowManager<{ close: () => Promise<void>; id: string }>();
    const creating = deferred<{ close: () => Promise<void>; id: string }>();
    const close = vi.fn(async () => {});
    const create = vi.fn(() => creating.promise);

    const firstCaller = manager.acquire(create);
    const secondCaller = manager.acquire(create);
    creating.resolve({ close, id: 'shared' });

    const [first, second] = await Promise.all([firstCaller, secondCaller]);
    expect(first).toBe(second);
    expect(create).toHaveBeenCalledTimes(1);

    // Ordinary caller teardown has no release/close path. A later caller keeps
    // using the same holder because hidden WebViews may still be parented to it.
    await expect(manager.acquire(create)).resolves.toBe(first);
    expect(close).not.toHaveBeenCalled();
  });

  it('clears a failed creation promise so a later caller can retry', async () => {
    const manager = createBrowserHolderWindowManager<{ id: string }>();
    const firstAttempt = deferred<{ id: string }>();
    const create = vi
      .fn<() => Promise<{ id: string }>>()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockResolvedValueOnce({ id: 'retry' });

    const failed = manager.acquire(create);
    firstAttempt.reject(new Error('holder failed'));

    await expect(failed).rejects.toThrow('holder failed');
    await expect(manager.acquire(create)).resolves.toEqual({ id: 'retry' });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
