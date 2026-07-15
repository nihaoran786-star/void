import { describe, expect, it, vi } from 'vitest';
import {
  CompactChatPresentationPublisher,
  type CompactChatPresentationPublisherDeps,
} from './CompactChatPresentationPublisher';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness(publish = vi.fn()): {
  publisher: CompactChatPresentationPublisher;
  deps: CompactChatPresentationPublisherDeps;
  sourceHandler: () => void;
  flushScheduled: () => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  cancelScheduled: ReturnType<typeof vi.fn>;
} {
  let sourceHandler = () => undefined;
  let scheduledCallback: (() => void) | null = null;
  const unsubscribe = vi.fn();
  const cancelScheduled = vi.fn();
  const deps: CompactChatPresentationPublisherDeps = {
    subscribe: vi.fn(handler => {
      sourceHandler = handler;
      return unsubscribe;
    }),
    publish,
    schedule: vi.fn(callback => {
      scheduledCallback = callback;
      return cancelScheduled;
    }),
  };
  return {
    publisher: new CompactChatPresentationPublisher(deps),
    deps,
    get sourceHandler() {
      return sourceHandler;
    },
    flushScheduled: () => {
      const callback = scheduledCallback;
      scheduledCallback = null;
      callback?.();
    },
    unsubscribe,
    cancelScheduled,
  };
}

describe('CompactChatPresentationPublisher', () => {
  it('starts suspended without subscribing or scheduling work', () => {
    const harness = createHarness();

    harness.publisher.requestUpdate();

    expect(harness.deps.subscribe).not.toHaveBeenCalled();
    expect(harness.deps.schedule).not.toHaveBeenCalled();
    expect(harness.deps.publish).not.toHaveBeenCalled();
  });

  it('subscribes on activation and coalesces source updates in one frame', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const harness = createHarness(publish);

    harness.publisher.activate();
    harness.sourceHandler();
    harness.sourceHandler();

    expect(harness.deps.subscribe).toHaveBeenCalledTimes(1);
    expect(harness.deps.schedule).toHaveBeenCalledTimes(1);
    harness.flushScheduled();
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  });

  it('keeps one publication in flight and emits one latest follow-up', async () => {
    const first = deferred();
    const publish = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const harness = createHarness(publish);

    harness.publisher.activate();
    harness.flushScheduled();
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));

    harness.sourceHandler();
    harness.sourceHandler();
    expect(harness.deps.schedule).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.waitFor(() => expect(harness.deps.schedule).toHaveBeenCalledTimes(2));
    harness.flushScheduled();
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
  });

  it('cancels queued work and invalidates an in-flight build on suspend', async () => {
    const first = deferred();
    let isCurrent: (() => boolean) | undefined;
    const publish = vi.fn((check: () => boolean) => {
      isCurrent = check;
      return first.promise;
    });
    const harness = createHarness(publish);

    harness.publisher.activate();
    harness.flushScheduled();
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(isCurrent?.()).toBe(true);

    harness.publisher.suspend();

    expect(isCurrent?.()).toBe(false);
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    harness.sourceHandler();
    first.resolve();
    await Promise.resolve();
    expect(harness.deps.schedule).toHaveBeenCalledTimes(1);
  });

  it('reactivates once and publishes current state instead of hidden updates', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const harness = createHarness(publish);

    harness.publisher.activate();
    harness.publisher.suspend();
    harness.sourceHandler();
    harness.publisher.activate();

    expect(harness.deps.subscribe).toHaveBeenCalledTimes(2);
    expect(harness.deps.schedule).toHaveBeenCalledTimes(2);
    harness.flushScheduled();
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  });

  it('destroys idempotently and cannot reactivate', () => {
    const harness = createHarness();
    harness.publisher.activate();

    harness.publisher.destroy();
    harness.publisher.destroy();
    harness.publisher.activate();

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.deps.subscribe).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled publication before it starts', () => {
    const harness = createHarness();
    harness.publisher.activate();

    harness.publisher.suspend();
    harness.flushScheduled();

    expect(harness.cancelScheduled).toHaveBeenCalledTimes(1);
    expect(harness.deps.publish).not.toHaveBeenCalled();
  });
});
