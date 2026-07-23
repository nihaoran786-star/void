import { describe, expect, it, vi } from 'vitest';
import {
  AuthSessionAdapterError,
  createAuthSessionController,
} from './authSessionController';
import type { WebAuthorizationAdapter } from './authSessionTypes';

describe('AuthSessionController', () => {
  it('starts anonymous and completes a web authorization without exposing tokens', async () => {
    let resolveAuthorization:
      | ((value: Awaited<ReturnType<WebAuthorizationAdapter['beginAuthorization']>>) => void)
      | undefined;
    const adapter: WebAuthorizationAdapter = {
      availability: 'available',
      beginAuthorization: vi.fn(() => new Promise(resolve => {
        resolveAuthorization = resolve;
      })),
    };
    const controller = createAuthSessionController(adapter);

    expect(controller.getSnapshot().state).toEqual({ status: 'anonymous' });

    const authorization = controller.startWebAuthorization();
    expect(controller.getSnapshot().state.status).toBe('authorizing');

    resolveAuthorization?.({
      status: 'authenticated',
      account: {
        accountId: 'account-1',
        displayName: 'Lin',
        email: 'lin@example.com',
      },
      authenticatedAt: '2026-07-23T00:00:00.000Z',
    });
    await authorization;

    expect(controller.getSnapshot().state).toEqual({
      status: 'authenticated',
      account: {
        accountId: 'account-1',
        displayName: 'Lin',
        email: 'lin@example.com',
      },
      provider: 'web',
      authenticatedAt: '2026-07-23T00:00:00.000Z',
      expiresAt: undefined,
    });
    expect(JSON.stringify(controller.getSnapshot())).not.toMatch(/token|secret|verifier/i);
  });

  it('returns to anonymous when browser authorization is cancelled', async () => {
    const controller = createAuthSessionController({
      availability: 'available',
      beginAuthorization: async () => ({ status: 'cancelled' }),
    });

    await controller.startWebAuthorization();

    expect(controller.getSnapshot().state).toEqual({ status: 'anonymous' });
  });

  it('classifies adapter failures and can clear the error', async () => {
    const controller = createAuthSessionController({
      availability: 'available',
      beginAuthorization: async () => {
        throw new AuthSessionAdapterError('network', 'offline');
      },
    });

    await controller.startWebAuthorization();
    expect(controller.getSnapshot().state).toEqual({
      status: 'error',
      category: 'network',
    });

    controller.clearError();
    expect(controller.getSnapshot().state).toEqual({ status: 'anonymous' });
  });

  it('does not invoke an unavailable adapter', async () => {
    const beginAuthorization = vi.fn();
    const controller = createAuthSessionController({
      availability: 'unavailable',
      beginAuthorization,
    });

    await controller.startWebAuthorization();

    expect(beginAuthorization).not.toHaveBeenCalled();
    expect(controller.getSnapshot().state).toEqual({
      status: 'error',
      category: 'authorization_unavailable',
    });
  });

  it('completes local sign-out when provider revocation fails', async () => {
    const controller = createAuthSessionController({
      availability: 'available',
      beginAuthorization: async () => ({
        status: 'authenticated',
        account: {
          accountId: 'account-1',
          displayName: 'Lin',
        },
        authenticatedAt: '2026-07-23T00:00:00.000Z',
      }),
      signOut: async () => {
        throw new Error('raw provider response');
      },
    });
    await controller.startWebAuthorization();

    await expect(controller.signOut()).resolves.toBeUndefined();
    expect(controller.getSnapshot().state).toEqual({ status: 'anonymous' });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('raw provider response');
  });

  it('does not let a stale authorization overwrite a later sign-out', async () => {
    let resolveAuthorization:
      | ((value: Awaited<ReturnType<WebAuthorizationAdapter['beginAuthorization']>>) => void)
      | undefined;
    const controller = createAuthSessionController({
      availability: 'available',
      beginAuthorization: () => new Promise(resolve => {
        resolveAuthorization = resolve;
      }),
    });

    const authorization = controller.startWebAuthorization();
    await controller.signOut();
    resolveAuthorization?.({
      status: 'authenticated',
      account: {
        accountId: 'account-1',
        displayName: 'Lin',
      },
      authenticatedAt: '2026-07-23T00:00:00.000Z',
    });
    await authorization;

    expect(controller.getSnapshot().state).toEqual({ status: 'anonymous' });
  });
});
