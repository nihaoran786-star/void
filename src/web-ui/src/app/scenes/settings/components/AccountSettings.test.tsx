import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettingsView } from './AccountSettings';
import type { AuthSessionSnapshot } from '@/app/auth-session';

const t = (key: string) => key;
const handlers = {
  onStartWebAuthorization: vi.fn(),
  onClearError: vi.fn(),
  onSignOut: vi.fn(),
  t,
};

function render(snapshot: AuthSessionSnapshot) {
  return renderToStaticMarkup(<AccountSettingsView snapshot={snapshot} {...handlers} />);
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
    expect(html).not.toMatch(/token|refresh|secret/i);
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
});
