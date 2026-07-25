import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionAccountsPanelView } from './SubscriptionAccountsPanel';
import type { SubscriptionAuthViewModel } from './subscriptionAuthTypes';

const t = (key: string, options?: Record<string, unknown>) => (
  options?.status ? `${key}:${String(options.status)}` : key
);

function model(): SubscriptionAuthViewModel {
  return {
    loadStatus: 'ready',
    accounts: [
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
    ],
    session: {
      sessionId: 'session-1',
      provider: 'opencode',
      status: 'pending',
      authorizationUrl: 'https://console.opencode.ai/device',
      userCode: 'ABCD-EFGH',
      error: null,
    },
    activeProvider: 'opencode',
    actionProvider: null,
    error: null,
    reload: vi.fn(),
    startLogin: vi.fn(),
    cancelLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    openAuthorization: vi.fn(),
  };
}

describe('SubscriptionAccountsPanelView', () => {
  it('renders explicit account and login states without exposing credentials', () => {
    const html = renderToStaticMarkup(
      <SubscriptionAccountsPanelView model={model()} t={t} />,
    );

    expect(html).toContain('aria-label="account.subscriptions.listAriaLabel"');
    expect(html).toContain('data-account-status="connected"');
    expect(html).toContain('data-account-status="disconnected"');
    expect(html).toContain('ABCD-EFGH');
    expect(html).toContain('account.subscriptions.actions.open');
    expect(html).toContain('account.subscriptions.actions.cancel');
    expect(html).not.toMatch(/access[_-]?token|refresh[_-]?token|client[_-]?secret/i);
  });

  it('uses an alert for typed failures and exposes a retry action', () => {
    const failed = model();
    failed.error = {
      code: 'network',
      message: 'Subscription backend unavailable',
      retryable: true,
    };
    const html = renderToStaticMarkup(
      <SubscriptionAccountsPanelView model={failed} t={t} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Subscription backend unavailable');
    expect(html).toContain('account.subscriptions.actions.retry');
  });

  it('keeps the manual authorization action and exposes opener failures', () => {
    const failedOpen = model();
    failedOpen.session = {
      ...failedOpen.session!,
      error: {
        code: 'web_operation_failed',
        message: 'System opener unavailable',
        retryable: true,
      },
    };
    const html = renderToStaticMarkup(
      <SubscriptionAccountsPanelView model={failedOpen} t={t} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('account.subscriptions.login.openFailed');
    expect(html).toContain('account.subscriptions.actions.open');
  });
});
