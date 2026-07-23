import { invoke } from '@tauri-apps/api/core';
import type { AccountUsageClient, AccountUsageOverview } from './accountUsageTypes';

export const desktopAccountUsageClient: AccountUsageClient = {
  loadOverview: () => invoke<AccountUsageOverview>('get_account_usage_overview'),
};
