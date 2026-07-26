import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionAccount } from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { ModelAuthSourceField } from './ModelAuthSourceField';
import {
  accountStatusFor,
  authFromOption,
  mapSubscriptionAccountReadState,
  normalizeModelAuthForPersistence,
} from './modelSubscriptionAuth';

vi.mock('@/component-library', async () => {
  const ReactRuntime = await import('react');
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      ReactRuntime.createElement('button', props, children)
    ),
    Select: ({ value }: { value: string }) => (
      ReactRuntime.createElement('div', { 'data-select-value': value })
    ),
  };
});

const accounts: SubscriptionAccount[] = [
  {
    provider: 'codex',
    status: 'connected',
    accountHint: 'user@example.test',
    expiresAt: 1_900_000_000,
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

const t = (key: string, options?: Record<string, unknown>) => (
  options?.account ? `${key}:${String(options.account)}` : key
);

describe('model subscription auth mapping', () => {
  it('creates typed provider auth and removes stale API keys before persistence', () => {
    const auth = authFromOption('subscription:codex');
    expect(auth).toEqual({ type: 'subscription', provider: 'codex' });
    expect(normalizeModelAuthForPersistence(auth, 'must-not-persist')).toEqual({
      auth,
      apiKey: '',
    });
  });

  it('does not infer disconnected from an empty or failed account load', () => {
    const failed = mapSubscriptionAccountReadState('failed', [], 'backend unavailable');
    expect(accountStatusFor(failed, 'codex')).toBe('load_failed');

    const incomplete = mapSubscriptionAccountReadState('ready', [], undefined);
    expect(accountStatusFor(incomplete, 'codex')).toBe('unsupported');
  });

  it('renders a connected account and explicit Account-settings guidance', () => {
    const ready = mapSubscriptionAccountReadState('ready', accounts);
    const connectedHtml = renderToStaticMarkup(
      <ModelAuthSourceField
        auth={{ type: 'subscription', provider: 'codex' }}
        discoveredCli={[]}
        subscriptions={ready}
        onChange={vi.fn()}
        onOpenAccountSettings={vi.fn()}
        t={t}
      />,
    );
    expect(connectedHtml).toContain('data-auth-source-status="connected"');
    expect(connectedHtml).toContain('user@example.test');
    expect(connectedHtml).not.toContain('must-not-persist');

    const disconnectedHtml = renderToStaticMarkup(
      <ModelAuthSourceField
        auth={{ type: 'subscription', provider: 'opencode' }}
        discoveredCli={[]}
        subscriptions={ready}
        onChange={vi.fn()}
        onOpenAccountSettings={vi.fn()}
        t={t}
      />,
    );
    expect(disconnectedHtml).toContain('data-auth-source-status="disconnected"');
    expect(disconnectedHtml).toContain('subscriptionAuth.openAccountSettings');
  });
});
