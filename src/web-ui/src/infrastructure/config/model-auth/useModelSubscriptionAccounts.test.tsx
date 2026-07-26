// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelSubscriptionAccounts } from './useModelSubscriptionAccounts';
import {
  type SubscriptionAccountReader,
  useModelSubscriptionAccounts,
} from './useModelSubscriptionAccounts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useModelSubscriptionAccounts', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ModelSubscriptionAccounts;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads an explicit provider snapshot through the account reader', async () => {
    const reader: SubscriptionAccountReader = {
      listAccounts: vi.fn().mockResolvedValue([
        {
          provider: 'codex',
          status: 'connected',
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
      ]),
    };
    function Probe() {
      latest = useModelSubscriptionAccounts(reader);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });

    expect(latest!.state.status).toBe('ready');
    if (latest!.state.status === 'ready') {
      expect(latest!.state.accounts.get('codex')?.status).toBe('connected');
      expect(latest!.state.accounts.get('opencode')?.status).toBe('disconnected');
    }
  });

  it('keeps backend failures distinct from disconnected accounts', async () => {
    const reader: SubscriptionAccountReader = {
      listAccounts: vi.fn().mockRejectedValue(new Error('desktop unavailable')),
    };
    function Probe() {
      latest = useModelSubscriptionAccounts(reader);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });

    expect(latest!.state).toEqual({
      status: 'failed',
      message: 'desktop unavailable',
    });
  });
});
