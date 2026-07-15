import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolExecutionService, type ToolExecutionStartedEvent } from './tool-execution-service';

const runtimeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
}));

const tauriEventMock = vi.hoisted(() => ({
  importBarrier: null as Promise<void> | null,
  moduleLoads: 0,
  listen: vi.fn(),
}));

vi.mock('@/infrastructure/runtime/environment', () => runtimeMock);
vi.mock('@tauri-apps/api/event', async () => {
  tauriEventMock.moduleLoads += 1;
  if (tauriEventMock.importBarrier) {
    await tauriEventMock.importBarrier;
  }
  return { listen: tauriEventMock.listen };
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForListenCount(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(tauriEventMock.listen).toHaveBeenCalledTimes(count);
  });
}

function startedEvent(index: number): ToolExecutionStartedEvent {
  return {
    tool_use_id: `tool-${index}`,
    tool_name: 'bash',
    input: {},
    timestamp: index,
  };
}

describe('ToolExecutionService lifecycle', () => {
  beforeEach(() => {
    ToolExecutionService.destroyExistingInstance();
    runtimeMock.isTauriRuntime.mockReturnValue(true);
    tauriEventMock.importBarrier = null;
    tauriEventMock.moduleLoads = 0;
    tauriEventMock.listen.mockReset();
  });

  afterEach(() => {
    tauriEventMock.importBarrier = null;
    ToolExecutionService.destroyExistingInstance();
    vi.restoreAllMocks();
  });

  it('stays timer-free and never imports Tauri events in the Web runtime', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    runtimeMock.isTauriRuntime.mockReturnValue(false);

    ToolExecutionService.getInstance();
    await Promise.resolve();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(tauriEventMock.moduleLoads).toBe(0);
    expect(tauriEventMock.listen).not.toHaveBeenCalled();
  });

  it('does not register listeners if destroyed while the Tauri module import is pending', async () => {
    const importGate = deferred();
    tauriEventMock.importBarrier = importGate.promise;
    const service = ToolExecutionService.getInstance();

    await vi.waitFor(() => expect(tauriEventMock.moduleLoads).toBe(1));
    service.destroy();
    importGate.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(tauriEventMock.listen).not.toHaveBeenCalled();
    expect(service.getActiveExecutions()).toEqual([]);
  });

  it('registers four listeners and releases each exactly once on idempotent destroy', async () => {
    const unlisteners = Array.from({ length: 4 }, () => vi.fn());
    const callbacks: Array<(event: { payload: ToolExecutionStartedEvent }) => void> = [];
    tauriEventMock.listen.mockImplementation((_eventName, callback) => {
      callbacks.push(callback);
      return Promise.resolve(unlisteners[callbacks.length - 1]);
    });
    const service = ToolExecutionService.getInstance();

    await waitForListenCount(4);
    service.destroy();
    service.destroy();

    for (const unlisten of unlisteners) {
      expect(unlisten).toHaveBeenCalledTimes(1);
    }

    callbacks[0]?.({ payload: startedEvent(1) });
    expect(service.getActiveExecutions()).toEqual([]);
  });

  it('rolls back already registered listeners if a later registration fails', async () => {
    const firstUnlisten = vi.fn();
    tauriEventMock.listen
      .mockResolvedValueOnce(firstUnlisten)
      .mockRejectedValueOnce(new Error('second listener failed'));
    const service = ToolExecutionService.getInstance();

    await waitForListenCount(2);
    await vi.waitFor(() => expect(firstUnlisten).toHaveBeenCalledTimes(1));
    service.destroy();

    expect(firstUnlisten).toHaveBeenCalledTimes(1);
    expect(tauriEventMock.listen).toHaveBeenCalledTimes(2);
  });

  it('releases a listener that resolves after destroy and ignores its queued callback', async () => {
    const registration = deferred<() => void>();
    const unlisten = vi.fn();
    let callback: ((event: { payload: ToolExecutionStartedEvent }) => void) | undefined;
    tauriEventMock.listen.mockImplementation((_eventName, registeredCallback) => {
      callback = registeredCallback;
      return registration.promise;
    });
    const service = ToolExecutionService.getInstance();

    await waitForListenCount(1);
    service.destroy();
    callback?.({ payload: startedEvent(1) });
    registration.resolve(unlisten);

    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
    expect(service.getActiveExecutions()).toEqual([]);
    expect(tauriEventMock.listen).toHaveBeenCalledTimes(1);
  });

  it('immediately releases completed registrations while a later registration is pending', async () => {
    const secondRegistration = deferred<() => void>();
    const firstUnlisten = vi.fn();
    const secondUnlisten = vi.fn();
    tauriEventMock.listen
      .mockResolvedValueOnce(firstUnlisten)
      .mockImplementationOnce(() => secondRegistration.promise);
    const service = ToolExecutionService.getInstance();

    await waitForListenCount(2);
    service.destroy();

    expect(firstUnlisten).toHaveBeenCalledTimes(1);
    expect(secondUnlisten).not.toHaveBeenCalled();

    secondRegistration.resolve(secondUnlisten);
    await vi.waitFor(() => expect(secondUnlisten).toHaveBeenCalledTimes(1));
    service.destroy();

    expect(firstUnlisten).toHaveBeenCalledTimes(1);
    expect(secondUnlisten).toHaveBeenCalledTimes(1);
    expect(tauriEventMock.listen).toHaveBeenCalledTimes(2);
  });

  it('keeps the newest 1000 processed event keys in FIFO order', async () => {
    let startedCallback: ((event: { payload: ToolExecutionStartedEvent }) => void) | undefined;
    tauriEventMock.listen.mockImplementation((eventName, callback) => {
      if (eventName === 'backend-event-toolexecutionstarted') {
        startedCallback = callback;
      }
      return Promise.resolve(vi.fn());
    });
    const service = ToolExecutionService.getInstance();
    const handler = vi.fn();
    service.onToolEvent('tool_started', handler);
    await waitForListenCount(4);

    for (let index = 0; index <= 1000; index += 1) {
      startedCallback?.({ payload: startedEvent(index) });
    }
    startedCallback?.({ payload: startedEvent(1000) });
    expect(handler).toHaveBeenCalledTimes(1001);

    startedCallback?.({ payload: startedEvent(0) });
    expect(handler).toHaveBeenCalledTimes(1002);
  });

  it('does not let an old destroyed reference clear a newer singleton', () => {
    runtimeMock.isTauriRuntime.mockReturnValue(false);
    const oldService = ToolExecutionService.getInstance();
    oldService.destroy();
    const currentService = ToolExecutionService.getInstance();

    oldService.destroy();

    expect(ToolExecutionService.getInstance()).toBe(currentService);
  });

  it('allows HMR disposal to destroy only an existing instance without creating one', async () => {
    ToolExecutionService.destroyExistingInstance();
    tauriEventMock.listen.mockResolvedValue(vi.fn());

    ToolExecutionService.destroyExistingInstance();
    await Promise.resolve();

    expect(tauriEventMock.listen).not.toHaveBeenCalled();
  });
});
