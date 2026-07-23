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
  const dailyIsValid = Array.isArray(overview.daily)
    && overview.daily.every(day => (
      typeof day?.date === 'string'
      && typeof day.totalTokens === 'number'
      && Number.isFinite(day.totalTokens)
      && day.totalTokens >= 0
    ));
  const countersAreValid = [
    overview.totalTokens,
    overview.peakDailyTokens,
    overview.activeDays,
    overview.currentStreakDays,
    overview.longestStreakDays,
  ].every(counter => (
    typeof counter === 'number'
    && Number.isFinite(counter)
    && Number.isInteger(counter)
    && counter >= 0
  ));
  const datesAreValid = (
    typeof overview.generatedAt === 'string'
    && (overview.firstRecordedAt === null || typeof overview.firstRecordedAt === 'string')
    && (overview.lastRecordedAt === null || typeof overview.lastRecordedAt === 'string')
  );
  return overview.source === 'device_token_usage_records'
    && typeof overview.recordCount === 'number'
    && Number.isInteger(overview.recordCount)
    && overview.recordCount >= 0
    && countersAreValid
    && datesAreValid
    && dailyIsValid;
}

export function useAccountUsage(
  client: AccountUsageClient = desktopAccountUsageClient,
): AccountUsageState {
  const [state, setState] = useState<AccountUsageState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let rolloverTimer: ReturnType<typeof setTimeout> | undefined;
    setState({ status: 'loading' });

    const loadOverview = async () => {
      try {
        const overview = await client.loadOverview();
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
      } catch {
        if (active) {
          setState({ status: 'error', category: 'unavailable' });
        }
      }
    };

    const scheduleLocalDayRollover = () => {
      if (!active) {
        return;
      }
      const now = new Date();
      const nextLocalMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).getTime();
      const delay = Math.max(1_000, nextLocalMidnight - now.getTime() + 1_000);
      rolloverTimer = setTimeout(() => {
        void loadOverview().finally(scheduleLocalDayRollover);
      }, delay);
    };

    void loadOverview().finally(scheduleLocalDayRollover);

    return () => {
      active = false;
      if (rolloverTimer !== undefined) {
        clearTimeout(rolloverTimer);
      }
    };
  }, [client]);

  return state;
}
