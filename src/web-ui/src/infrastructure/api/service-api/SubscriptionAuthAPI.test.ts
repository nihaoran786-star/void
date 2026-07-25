import { describe, expect, it } from 'vitest';
import {
  mapSubscriptionAccountsResponse,
  mapSubscriptionSessionResponse,
} from './SubscriptionAuthAPI';

describe('SubscriptionAuthAPI DTO mapping', () => {
  it('normalizes field naming only when every typed provider is present', () => {
    const accounts = mapSubscriptionAccountsResponse([
      {
        provider: 'codex',
        status: 'connected',
        account_hint: 'user@example.com',
        expires_at: 1_800_000_000,
      },
      {
        provider: 'opencode',
        status: 'disconnected',
      },
    ]);

    expect(accounts).toEqual([
      {
        provider: 'codex',
        status: 'connected',
        accountHint: 'user@example.com',
        expiresAt: 1_800_000_000,
        error: null,
      },
      {
        provider: 'opencode',
        status: 'disconnected',
        accountHint: null,
        expiresAt: null,
        error: null,
      },
    ]);
  });

  it('preserves explicit vault and typed session states', () => {
    const accounts = mapSubscriptionAccountsResponse([
      {
        provider: 'codex',
        status: 'disconnected',
      },
      {
        provider: 'opencode',
        status: 'vault_unavailable',
        error: {
          code: 'credential_store_failed',
          message: 'Vault is locked',
          retryable: true,
        },
      },
    ]);
    const session = mapSubscriptionSessionResponse({
      session_id: 'session-1',
      provider: 'opencode',
      status: 'pending',
      authorization_url: 'https://console.opencode.ai/device',
      user_code: 'ABCD-EFGH',
    });

    expect(accounts[1].status).toBe('vault_unavailable');
    expect(accounts[1].error?.retryable).toBe(true);
    expect(session).toMatchObject({
      sessionId: 'session-1',
      provider: 'opencode',
      status: 'pending',
      authorizationUrl: 'https://console.opencode.ai/device',
      userCode: 'ABCD-EFGH',
    });
  });

  it('rejects malformed session snapshots at the API boundary', () => {
    expect(() => mapSubscriptionSessionResponse({
      sessionId: '',
      provider: 'codex',
      status: 'authorized',
    })).toThrow('Subscription session response is invalid');
  });

  it('rejects missing, duplicate, and untyped account states', () => {
    expect(() => mapSubscriptionAccountsResponse([])).toThrow(
      'must contain every provider exactly once',
    );
    expect(() => mapSubscriptionAccountsResponse([
      { provider: 'codex', status: 'disconnected' },
      { provider: 'codex', status: 'connected' },
    ])).toThrow('duplicate provider');
    expect(() => mapSubscriptionAccountsResponse([
      { provider: 'codex' },
      { provider: 'opencode', status: 'disconnected' },
    ])).toThrow('status is invalid');
  });
});
