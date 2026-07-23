import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettingsView } from './AccountSettings';
import type { AuthSessionSnapshot } from '@/app/auth-session';
import type { AccountUsageState } from '@/app/account-usage';

const t = (key: string) => key;
const handlers = {
  onStartWebAuthorization: vi.fn(),
  onClearError: vi.fn(),
  onSignOut: vi.fn(),
  t,
};

const usageState: AccountUsageState = {
  status: 'ready',
  overview: {
    source: 'device_token_usage_records',
    generatedAt: '2026-07-23T00:00:00.000Z',
    recordCount: 779,
    firstRecordedAt: '2026-05-23T00:00:00.000Z',
    lastRecordedAt: '2026-07-23T00:00:00.000Z',
    totalTokens: 288_100_000,
    peakDailyTokens: 16_900_000,
    activeDays: 23,
    currentStreakDays: 7,
    longestStreakDays: 47,
    daily: [
      { date: '2026-07-22', totalTokens: 1200 },
      { date: '2026-07-23', totalTokens: 2400 },
    ],
  },
};

function render(snapshot: AuthSessionSnapshot) {
  return renderToStaticMarkup(
    <AccountSettingsView snapshot={snapshot} usageState={usageState} {...handlers} />,
  );
}

describe('AccountSettingsView', () => {
  it('renders anonymous production state without a fake account switch', () => {
    const html = render({
      state: { status: 'anonymous' },
      capabilities: { webAuthorization: 'unavailable' },
    });

    expect(html).toContain('data-auth-status="anonymous"');
    expect(html).toContain('account.states.unavailableHint');
    expect(html).toContain('disabled=""');
  });

  it('renders authorizing state from explicit view props', () => {
    const html = render({
      state: {
        status: 'authorizing',
        flowId: 'flow-1',
        startedAt: '2026-07-23T00:00:00.000Z',
      },
      capabilities: { webAuthorization: 'available' },
    });

    expect(html).toContain('data-auth-status="authorizing"');
    expect(html).toContain('account.states.authorizingHint');
  });

  it('renders authenticated identity without credentials', () => {
    const html = render({
      state: {
        status: 'authenticated',
        provider: 'web',
        authenticatedAt: '2026-07-23T00:00:00.000Z',
        account: {
          accountId: 'account-1',
          displayName: 'Lin',
          email: 'lin@example.com',
        },
      },
      capabilities: { webAuthorization: 'available' },
    });

    expect(html).toContain('data-auth-status="authenticated"');
    expect(html).toContain('Lin');
    expect(html).toContain('lin@example.com');
    expect(html).not.toMatch(/refresh[_-]?token|access[_-]?token|client[_-]?secret/i);
  });

  it('renders classified authorization errors', () => {
    const html = render({
      state: {
        status: 'error',
        category: 'invalid_callback',
      },
      capabilities: { webAuthorization: 'available' },
    });

    expect(html).toContain('data-auth-status="error"');
    expect(html).toContain('account.errors.invalid_callback');
  });

  it('renders aggregate metrics and activity cells for all local sessions', () => {
    const html = render({
      state: { status: 'anonymous' },
      capabilities: { webAuthorization: 'unavailable' },
    });

    expect(html).toContain('data-usage-status="ready"');
    expect(html).toContain('account.usage.metrics.totalTokens');
    expect(html).toContain('account.usage.provenance.device');
    expect(html).toContain('account.usage.provenance.recordCount');
    expect(html).toContain('account-settings__heat-cell--');
    expect(html).toContain('2026-07-23');
  });
});
