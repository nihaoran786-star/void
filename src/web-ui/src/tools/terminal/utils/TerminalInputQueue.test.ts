import { describe, expect, it, vi } from 'vitest';

import { TerminalInputQueue } from './TerminalInputQueue';

function flushQueuedTasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('TerminalInputQueue', () => {
  it('batches synchronous input into one ordered write', async () => {
    const write = vi.fn((_data: string): Promise<void> => Promise.resolve());
    const onError = vi.fn();
    const queue = new TerminalInputQueue(write, onError);

    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('c');

    expect(write).not.toHaveBeenCalled();

    await flushQueuedTasks();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('abc');
    expect(onError).not.toHaveBeenCalled();
  });

  it('waits for the in-flight write before flushing later input', async () => {
    let resolveFirst: () => void = () => {};
    const write = vi.fn((data: string): Promise<void> => {
      if (data === 'first') {
        return new Promise(resolve => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    const onError = vi.fn();
    const queue = new TerminalInputQueue(write, onError);

    queue.enqueue('first');
    await flushQueuedTasks();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith('first');

    queue.enqueue('2');
    queue.enqueue('3');
    expect(write).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushQueuedTasks();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('23');
  });

  it('reports write errors and continues accepting later input', async () => {
    const write = vi.fn((_data: string): Promise<void> => Promise.resolve());
    write.mockRejectedValueOnce(new Error('write failed'));
    const onError = vi.fn();
    const queue = new TerminalInputQueue(write, onError);

    queue.enqueue('bad');
    await flushQueuedTasks();

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('write failed');

    queue.enqueue('ok');
    await flushQueuedTasks();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('ok');
  });

  it('preserves ordering across multiple flush cycles', async () => {
    const writes: string[] = [];
    const write = vi.fn((data: string): Promise<void> => {
      writes.push(data);
      return Promise.resolve();
    });
    const queue = new TerminalInputQueue(write, vi.fn());

    queue.enqueue('a');
    queue.enqueue('b');
    await flushQueuedTasks();

    queue.enqueue('c');
    queue.enqueue('d');
    await flushQueuedTasks();

    expect(writes).toEqual(['ab', 'cd']);
  });

  it('clear discards buffered input that has not started flushing', async () => {
    const write = vi.fn((_data: string): Promise<void> => Promise.resolve());
    const queue = new TerminalInputQueue(write, vi.fn());

    queue.enqueue('pending');
    queue.clear();
    await flushQueuedTasks();

    expect(write).not.toHaveBeenCalled();
  });

  it('clear does not cancel in-flight input but discards later buffered input', async () => {
    let resolveWrite: () => void = () => {};
    const write = vi.fn((_data: string): Promise<void> =>
      new Promise(resolve => {
        resolveWrite = resolve;
      }),
    );
    const queue = new TerminalInputQueue(write, vi.fn());

    queue.enqueue('in-flight');
    await flushQueuedTasks();

    expect(write).toHaveBeenCalledWith('in-flight');

    queue.enqueue('queued');
    queue.clear();
    resolveWrite();
    await flushQueuedTasks();

    expect(write).toHaveBeenCalledTimes(1);
  });
});
