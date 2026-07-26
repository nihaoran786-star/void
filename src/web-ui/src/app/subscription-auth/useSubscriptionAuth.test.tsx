// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SubscriptionAccount,
  SubscriptionAuthSession,
} from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { SubscriptionLoginCoordinator } from './subscriptionLoginCoordinator';
import type {
  SubscriptionAuthService,
  SubscriptionAuthViewModel,
} from './subscriptionAuthTypes';
import { useSubscriptionAuth } from './useSubscriptionAuth';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const disconnected: SubscriptionAccount[] = [
  {
    provider: 'codex',
    status: 'disconnected',
    accountHint: null,
    expiresAt: null,
    error: null,
  },
  {
    provider: 'opencode',
    status: 'disconnected',
    accountHint: null,
    expiresAt: null,
    error: null,
  },
];

function session(status: SubscriptionAuthSession['status']): SubscriptionAuthSession {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    provider: 'opencode',
    status,
    authorizationUrl: status === 'pending'
      ? 'https://console.opencode.ai/device'
      : null,
    userCode: status === 'pending' ? 'ABCD-EFGH' : null,
    error: null,
  };
}

describe('useSubscriptionAuth', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: SubscriptionAuthViewModel;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('passes a client UUID, opens the browser, and polls only backend snapshots', async () => {
    const connected = disconnected.map(account => (
      account.provider === 'opencode'
        ? { ...account, status: 'connected' as const, accountHint: 'user@example.com' }
        : account
    ));
    const service: SubscriptionAuthService = {
      listAccounts: vi.fn()
        .mockResolvedValueOnce(disconnected)
        .mockResolvedValueOnce(connected),
      start: vi.fn().mockResolvedValue(session('pending')),
      status: vi.fn().mockResolvedValue(session('authorized')),
      cancel: vi.fn().mockResolvedValue(session('cancelled')),
      logout: vi.fn(),
      refresh: vi.fn(),
      openAuthorization: vi.fn(),
    };

    function Harness() {
      latest = useSubscriptionAuth(
        service,
        () => new SubscriptionLoginCoordinator(
          () => '11111111-1111-4111-8111-111111111111',
        ),
      );
      return <output>{latest.session?.status ?? latest.loadStatus}</output>;
    }

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    await act(async () => {
      await latest.startLogin('opencode');
    });

    expect(service.start).toHaveBeenCalledWith(
      'opencode',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(service.openAuthorization).toHaveBeenCalledWith(
      'https://console.opencode.ai/device',
    );
    expect(service.status).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(service.status).toHaveBeenCalledTimes(1);
    expect(latest.session?.status).toBe('authorized');
    expect(latest.accounts.find(account => account.provider === 'opencode')).toMatchObject({
      status: 'connected',
      accountHint: 'user@example.com',
    });
  });

  it('keeps a pending session and its URL when the system opener fails', async () => {
    const openAuthorization = vi.fn()
      .mockRejectedValueOnce(new Error('System opener unavailable'))
      .mockResolvedValueOnce(undefined);
    const service: SubscriptionAuthService = {
      listAccounts: vi.fn().mockResolvedValue(disconnected),
      start: vi.fn().mockResolvedValue(session('pending')),
      status: vi.fn().mockResolvedValue(session('pending')),
      cancel: vi.fn().mockResolvedValue(session('cancelled')),
      logout: vi.fn(),
      refresh: vi.fn(),
      openAuthorization,
    };

    function Harness() {
      latest = useSubscriptionAuth(
        service,
        () => new SubscriptionLoginCoordinator(
          () => '11111111-1111-4111-8111-111111111111',
        ),
      );
      return <output>{latest.session?.error?.code ?? latest.loadStatus}</output>;
    }

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    await act(async () => {
      await latest.startLogin('opencode');
    });

    expect(latest.session).toMatchObject({
      status: 'pending',
      authorizationUrl: 'https://console.opencode.ai/device',
      error: {
        code: 'web_operation_failed',
        message: 'System opener unavailable',
        retryable: true,
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(latest.session?.error?.message).toBe('System opener unavailable');

    await act(async () => {
      await latest.openAuthorization('https://console.opencode.ai/device');
    });
    expect(latest.session?.error).toBeNull();
  });

  it('does not poll before start settles and preserves an early cancellation', async () => {
    let resolveStart!: (value: SubscriptionAuthSession) => void;
    const startResult = new Promise<SubscriptionAuthSession>(resolve => {
      resolveStart = resolve;
    });
    const cancelled: SubscriptionAuthSession = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      provider: 'codex',
      status: 'cancelled',
      authorizationUrl: null,
      userCode: null,
      error: null,
    };
    const service: SubscriptionAuthService = {
      listAccounts: vi.fn().mockResolvedValue(disconnected),
      start: vi.fn().mockReturnValue(startResult),
      status: vi.fn(),
      cancel: vi.fn().mockResolvedValue(cancelled),
      logout: vi.fn(),
      refresh: vi.fn(),
      openAuthorization: vi.fn(),
    };

    function Harness() {
      latest = useSubscriptionAuth(
        service,
        () => new SubscriptionLoginCoordinator(
          () => '11111111-1111-4111-8111-111111111111',
        ),
      );
      return <output>{latest.session?.status ?? latest.loadStatus}</output>;
    }

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    let startTask!: Promise<void>;
    await act(async () => {
      startTask = latest.startLogin('codex');
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(service.status).not.toHaveBeenCalled();

    await act(async () => {
      await latest.cancelLogin();
    });
    await act(async () => {
      resolveStart({
        ...cancelled,
        status: 'pending',
        authorizationUrl: 'https://auth.openai.com/oauth/authorize',
      });
      await startTask;
    });

    expect(service.cancel).toHaveBeenCalledTimes(2);
    expect(latest.session?.status).toBe('cancelled');
    expect(service.openAuthorization).not.toHaveBeenCalled();
  });
});
