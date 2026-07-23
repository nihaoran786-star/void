export interface DailyTokenUsage {
  date: string;
  totalTokens: number;
}

export interface AccountUsageOverview {
  source: 'token_usage_records';
  generatedAt: string;
  totalTokens: number;
  peakDailyTokens: number;
  activeDays: number;
  currentStreakDays: number;
  longestStreakDays: number;
  daily: DailyTokenUsage[];
}

export type AccountUsageState =
  | { status: 'loading' }
  | { status: 'ready'; overview: AccountUsageOverview }
  | { status: 'empty'; overview: AccountUsageOverview }
  | { status: 'error'; category: 'unavailable' | 'invalid_data' };

export interface AccountUsageClient {
  loadOverview(): Promise<AccountUsageOverview>;
}
