import { subscriptionAuthAPI } from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { systemAPI } from '@/infrastructure/api/service-api/SystemAPI';
import type { SubscriptionAuthService } from './subscriptionAuthTypes';

export const desktopSubscriptionAuthService: SubscriptionAuthService = {
  listAccounts: () => subscriptionAuthAPI.listAccounts(),
  start: (provider, sessionId) => subscriptionAuthAPI.start(provider, sessionId),
  status: sessionId => subscriptionAuthAPI.status(sessionId),
  cancel: sessionId => subscriptionAuthAPI.cancel(sessionId),
  logout: provider => subscriptionAuthAPI.logout(provider),
  refresh: provider => subscriptionAuthAPI.refresh(provider),
  openAuthorization: url => systemAPI.openExternal(url),
};
