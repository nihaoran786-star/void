import { describe, expect, it } from 'vitest';

import {
  shortDramaProjectLockKey,
  withShortDramaProjectLock,
} from './ShortDramaProjectSaveQueue';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

describe('short drama project save queue', () => {
  it('keys on the file, not on the adapter object', () => {
    const left = shortDramaProjectLockKey({ kind: 'local', scope: 'C:/work' }, 'p1');
    const right = shortDramaProjectLockKey({ kind: 'local', scope: 'C:/work' }, 'p1');
    expect(left).toBe(right);
    expect(shortDramaProjectLockKey({ kind: 'local', scope: 'D:/other' }, 'p1')).not.toBe(left);
    expect(shortDramaProjectLockKey({ kind: 'local', scope: 'C:/work' }, 'p2')).not.toBe(left);
  });

  it('does not let a second writer start inside the first one\'s window', async () => {
    const key = shortDramaProjectLockKey({ kind: 'local', scope: 'C:/w1' }, 'p');
    const order: string[] = [];
    const firstRead = deferred();

    const first = withShortDramaProjectLock(key, async () => {
      order.push('canvas:read');
      await firstRead.promise;
      order.push('canvas:write');
    });
    const second = withShortDramaProjectLock(key, async () => {
      order.push('panel:write');
    });

    // The panel's save is queued, not interleaved: it must not appear between
    // the canvas's read and its write.
    firstRead.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['canvas:read', 'canvas:write', 'panel:write']);
  });

  it('lets different projects run at the same time', async () => {
    const order: string[] = [];
    const gate = deferred();

    const left = withShortDramaProjectLock(
      shortDramaProjectLockKey({ kind: 'local', scope: 'C:/a' }, 'p'),
      async () => { order.push('a:start'); await gate.promise; order.push('a:end'); },
    );
    const right = withShortDramaProjectLock(
      shortDramaProjectLockKey({ kind: 'local', scope: 'C:/b' }, 'p'),
      async () => { order.push('b:done'); },
    );

    await right;
    gate.resolve();
    await left;

    expect(order).toEqual(['a:start', 'b:done', 'a:end']);
  });

  it('runs a re-entrant call inline instead of deadlocking on itself', async () => {
    const key = shortDramaProjectLockKey({ kind: 'local', scope: 'C:/w2' }, 'p');
    const order: string[] = [];

    await withShortDramaProjectLock(key, async () => {
      order.push('outer');
      // The canvas path holds the lock and then calls the manifest writer,
      // which takes the same lock.
      await withShortDramaProjectLock(key, async () => { order.push('inner'); });
      order.push('outer-end');
    });

    expect(order).toEqual(['outer', 'inner', 'outer-end']);
  });

  it('does not wedge the queue when a writer throws', async () => {
    const key = shortDramaProjectLockKey({ kind: 'local', scope: 'C:/w3' }, 'p');

    const failing = withShortDramaProjectLock(key, async () => {
      throw new Error('disk full');
    });
    const after = withShortDramaProjectLock(key, async () => 'written');

    await expect(failing).rejects.toThrow('disk full');
    await expect(after).resolves.toBe('written');
  });
});
