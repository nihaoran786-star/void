import { describe, expect, it } from 'vitest';
import { SubscriptionLoginCoordinator } from './subscriptionLoginCoordinator';

describe('SubscriptionLoginCoordinator', () => {
  it('uses an immutable client session id and permits only one active login', () => {
    const coordinator = new SubscriptionLoginCoordinator(
      () => '11111111-1111-4111-8111-111111111111',
    );

    const operation = coordinator.begin('codex');

    expect(operation?.sessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(coordinator.begin('opencode')).toBeNull();
    expect(coordinator.current()).toBe(operation);
  });

  it('keeps an early cancellation owned until start settles', () => {
    const coordinator = new SubscriptionLoginCoordinator(() => 'session-1');
    const operation = coordinator.begin('opencode')!;

    expect(coordinator.requestCancel()).toBe(operation);
    expect(coordinator.isCurrent(operation)).toBe(false);
    expect(coordinator.owns(operation)).toBe(true);
    expect(coordinator.settleStart(operation)).toBe(false);
    expect(coordinator.complete(operation)).toBe(true);
  });

  it('does not allow stale completion to clear a newer operation', () => {
    const ids = ['session-1', 'session-2'];
    const coordinator = new SubscriptionLoginCoordinator(() => ids.shift()!);
    const first = coordinator.begin('codex')!;
    coordinator.complete(first);
    const second = coordinator.begin('opencode')!;

    expect(coordinator.complete(first)).toBe(false);
    expect(coordinator.current()).toBe(second);
  });
});
