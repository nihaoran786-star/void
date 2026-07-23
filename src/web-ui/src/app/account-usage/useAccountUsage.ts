import { useEffect, useState } from 'react';
import { desktopAccountUsageClient } from './accountUsageClient';
import type {
  AccountUsageClient,
  AccountUsageOverview,
  AccountUsageState,
} from './accountUsageTypes';

function isOverview(value: unknown): value is AccountUsageOverview {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const overview = value as Partial<AccountUsageOverview>;
  return overview.source === 'token_usage_records'
    && typeof overview.totalTokens === 'number'
    && typeof overview.peakDailyTokens === 'number'
    && Array.isArray(overview.daily);
}

export function useAccountUsage(
  client: AccountUsageClient = desktopAccountUsageClient,
): AccountUsageState {
  const [state, setState] = useState<AccountUsageState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    void client.loadOverview()
      .then(overview => {
        if (!active) {
          return;
        }
        if (!isOverview(overview)) {
          setState({ status: 'error', category: 'invalid_data' });
          return;
        }
        setState({
          status: overview.totalTokens === 0 && overview.activeDays === 0 ? 'empty' : 'ready',
          overview,
        });
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error', category: 'unavailable' });
        }
      });

    return () => {
      active = false;
    };
  }, [client]);

  return state;
}
