import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessingStatusManager } from './ProcessingStatusManager';

function status(sessionId = 'session-1', overrides: Record<string, unknown> = {}) {
  return {
    sessionId,
    status: 'processing' as const,
    message: 'Working',
    ...overrides,
  };
}

describe('ProcessingStatusManager timer lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not start a cleanup interval on module import or while idle', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    vi.resetModules();
    const module = await import('./ProcessingStatusManager');
    module.processingStatusManager.startCleanupTimer();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    module.processingStatusManager.stopCleanupTimer();
  });

  it('starts once on first registration and stops after the last immediate removal', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const manager = new ProcessingStatusManager();

    const first = manager.registerStatus(status());
    const second = manager.registerStatus(status('session-2'));
    vi.advanceTimersByTime(3_000);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    manager.removeStatus(first);
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    manager.removeStatus(second);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the minimum display delay and stops after the delayed last removal', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const listener = vi.fn();
    const manager = new ProcessingStatusManager();
    manager.addListener(listener);
    const id = manager.registerStatus(status('session-1', {
      status: 'completing',
      message: 'completed successfully',
    }));

    manager.removeStatus(id);
    expect(manager.hasActiveStatus()).toBe(true);
    expect(manager.getCompletedSteps()).toHaveLength(1);

    vi.advanceTimersByTime(1_499);
    expect(manager.hasActiveStatus()).toBe(true);
    vi.advanceTimersByTime(1);

    expect(manager.hasActiveStatus()).toBe(false);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith([]);
  });

  it('stops when clearSessionStatus or clearAll removes the final status', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const manager = new ProcessingStatusManager();

    manager.registerStatus(status('session-1'));
    manager.registerStatus(status('session-2'));
    manager.clearSessionStatus('session-1');
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    manager.clearSessionStatus('session-2');
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    manager.registerStatus(status());
    manager.clearAll();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
  });

  it('stops when cleanupOldStatuses expires the final status', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const manager = new ProcessingStatusManager();
    manager.registerStatus(status());

    vi.advanceTimersByTime(5 * 60 * 1_000 + 1);
    manager.cleanupOldStatuses();

    expect(manager.hasActiveStatus()).toBe(false);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
