import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserPresentationLifecycle,
  getBrowserHostTaskActivity,
  runBrowserPresentationSequence,
} from './browserPresentationLifecycle';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('createBrowserPresentationLifecycle', () => {
  it('invalidates active work immediately when presentation becomes hidden', () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const activeWork = lifecycle.snapshot();

    const hidden = lifecycle.update(false);

    expect(hidden.status).toBe('hidden');
    expect(lifecycle.isActive()).toBe(false);
    expect(lifecycle.isCurrent(activeWork)).toBe(false);
    expect(lifecycle.isCurrent(hidden)).toBe(true);
  });

  it('does not invalidate work for repeated updates to the same state', () => {
    const lifecycle = createBrowserPresentationLifecycle(false);
    const hiddenWork = lifecycle.snapshot();

    const repeated = lifecycle.update(false);

    expect(repeated).toEqual(hiddenWork);
    expect(lifecycle.isCurrent(hiddenWork)).toBe(true);
  });

  it('invalidates work on disposal and can revive for React strict-effect replay', () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const beforeDispose = lifecycle.snapshot();

    const disposed = lifecycle.dispose();
    const revived = lifecycle.update(true);

    expect(disposed.status).toBe('disposed');
    expect(lifecycle.isCurrent(beforeDispose)).toBe(false);
    expect(revived.status).toBe('active');
    expect(revived.revision).toBeGreaterThan(disposed.revision);
    expect(lifecycle.isCurrent(revived)).toBe(true);
  });

  it('prevents a stale show transition after a rapid hide/show cycle', () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const staleShow = lifecycle.snapshot();

    lifecycle.update(false);
    const currentShow = lifecycle.update(true);

    expect(lifecycle.isCurrent(staleShow)).toBe(false);
    expect(lifecycle.isCurrent(currentShow)).toBe(true);
  });

  it('treats overlay occlusion as a revisioned hidden state', () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const unobscured = lifecycle.snapshot();

    const occluded = lifecycle.setOccluded(true);

    expect(occluded).toMatchObject({ status: 'hidden', occluded: true });
    expect(lifecycle.canPresent()).toBe(false);
    expect(lifecycle.isCurrent(unobscured)).toBe(false);

    const restored = lifecycle.setOccluded(false);
    expect(restored).toMatchObject({ status: 'active', occluded: false });
    expect(lifecycle.canPresent()).toBe(true);
  });

  it('stops polling at zero bounds while retaining the resize recovery channel', () => {
    expect(getBrowserHostTaskActivity(true, false, false)).toEqual({
      polling: false,
      resizeRecovery: true,
    });
    expect(getBrowserHostTaskActivity(true, false, true)).toEqual({
      polling: true,
      resizeRecovery: true,
    });
  });

  it('stops polling and resize recovery while inactive or occluded', () => {
    expect(getBrowserHostTaskActivity(false, false, true)).toEqual({
      polling: false,
      resizeRecovery: false,
    });
    expect(getBrowserHostTaskActivity(true, true, true)).toEqual({
      polling: false,
      resizeRecovery: false,
    });
  });

  it('stops before show/focus when bounds report that the host is not presentable', async () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const calls: string[] = [];
    let hasVisibleBounds = false;

    const present = () => runBrowserPresentationSequence({
        lifecycle,
        snapshot: lifecycle.snapshot(),
        isTargetCurrent: () => true,
        steps: [
          async () => {
            calls.push('bounds');
            return hasVisibleBounds;
          },
          async () => {
            calls.push('show');
          },
          async () => {
            calls.push('focus');
          },
        ],
        onStale: async () => {
          calls.push('stale-hide');
        },
      });

    const presented = await present();
    expect(presented).toBe(false);
    expect(calls).toEqual(['bounds']);

    hasVisibleBounds = true;
    await expect(present()).resolves.toBe(true);
    expect(calls).toEqual(['bounds', 'bounds', 'show', 'focus']);
  });

  it('stops a queued show/focus sequence when an overlay appears during an await', async () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const transition = lifecycle.snapshot();
    const importing = deferred();
    const calls: string[] = [];

    const transitionPromise = runBrowserPresentationSequence({
      lifecycle,
      snapshot: transition,
      isTargetCurrent: () => true,
      steps: [
        async () => {
          calls.push('import');
          await importing.promise;
        },
        async () => {
          calls.push('show');
        },
        async () => {
          calls.push('focus');
        },
      ],
      onStale: async () => {
        calls.push('hide');
      },
    });

    lifecycle.setOccluded(true);
    importing.resolve();

    await expect(transitionPromise).resolves.toBe(false);
    expect(calls).toEqual(['import', 'hide']);
  });

  it('checks the gate after show resolves and never focuses a newly occluded handle', async () => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const showing = deferred();
    const calls: string[] = [];

    const transitionPromise = runBrowserPresentationSequence({
      lifecycle,
      snapshot: lifecycle.snapshot(),
      isTargetCurrent: () => true,
      steps: [
        async () => {
          calls.push('show');
          await showing.promise;
        },
        async () => {
          calls.push('focus');
        },
      ],
      onStale: async () => {
        calls.push('hide');
      },
    });

    lifecycle.setOccluded(true);
    showing.resolve();

    await expect(transitionPromise).resolves.toBe(false);
    expect(calls).toEqual(['show', 'hide']);
  });

  it.each([
    ['dynamic import', 0],
    ['double animation frame', 1],
    ['bounds update', 2],
    ['show', 3],
    ['focus', 4],
  ] as const)('checks the occlusion revision after %s awaits', async (_name, staleStep) => {
    const lifecycle = createBrowserPresentationLifecycle(true);
    const blocked = deferred();
    const calls: string[] = [];
    const labels = ['import', 'raf', 'bounds', 'show', 'focus'];

    const transitionPromise = runBrowserPresentationSequence({
      lifecycle,
      snapshot: lifecycle.snapshot(),
      isTargetCurrent: () => true,
      steps: labels.map((label, index) => async () => {
        calls.push(label);
        if (index === staleStep) {
          await blocked.promise;
        }
      }),
      onStale: async () => {
        calls.push('hide');
      },
    });

    await vi.waitFor(() => expect(calls).toContain(labels[staleStep]));
    lifecycle.setOccluded(true);
    blocked.resolve();

    await expect(transitionPromise).resolves.toBe(false);
    expect(calls).toEqual([...labels.slice(0, staleStep + 1), 'hide']);
  });
});
