// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountUsageClient, AccountUsageOverview } from './accountUsageTypes';
import { useAccountUsage } from './useAccountUsage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function overview(generatedAt: string, lastDate: string): AccountUsageOverview {
  return {
    source: 'device_token_usage_records',
    generatedAt,
    recordCount: 1,
    firstRecordedAt: generatedAt,
    lastRecordedAt: generatedAt,
    totalTokens: 1,
    peakDailyTokens: 1,
    activeDays: 1,
    currentStreakDays: 1,
    longestStreakDays: 1,
    daily: [{ date: lastDate, totalTokens: 1 }],
  };
}

function Harness({ client }: { client: AccountUsageClient }) {
  const state = useAccountUsage(client);
  return (
    <output data-testid="usage">
      {state.status === 'ready' ? state.overview.daily.at(-1)?.date : state.status}
    </output>
  );
}

describe('useAccountUsage day rollover', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 23, 23, 59, 59));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('reloads silently after local midnight and schedules the next rollover', async () => {
    const loadOverview = vi.fn()
      .mockResolvedValueOnce(overview('2026-07-23T23:59:59.000Z', '2026-07-23'))
      .mockResolvedValueOnce(overview('2026-07-24T00:00:01.000Z', '2026-07-24'));
    const client: AccountUsageClient = { loadOverview };

    await act(async () => {
      root.render(<Harness client={client} />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="usage"]')?.textContent).toBe('2026-07-23');
    expect(loadOverview).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(container.querySelector('[data-testid="usage"]')?.textContent).toBe('2026-07-24');
    expect(loadOverview).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });
});
