import type {
  SubscriptionAccount,
  SubscriptionAuthError,
  SubscriptionAuthSession,
  SubscriptionProvider,
} from '@/infrastructure/api/service-api/SubscriptionAuthAPI';

export interface SubscriptionAuthService {
  listAccounts(): Promise<SubscriptionAccount[]>;
  start(provider: SubscriptionProvider, sessionId: string): Promise<SubscriptionAuthSession>;
  status(sessionId: string): Promise<SubscriptionAuthSession>;
  cancel(sessionId: string): Promise<SubscriptionAuthSession>;
  logout(provider: SubscriptionProvider): Promise<void>;
  refresh(provider: SubscriptionProvider): Promise<SubscriptionAccount>;
  openAuthorization(url: string): Promise<void>;
}

export type SubscriptionAccountsLoadStatus = 'loading' | 'ready' | 'failed';

export interface SubscriptionAuthState {
  loadStatus: SubscriptionAccountsLoadStatus;
  accounts: SubscriptionAccount[];
  session: SubscriptionAuthSession | null;
  activeProvider: SubscriptionProvider | null;
  actionProvider: SubscriptionProvider | null;
  error: SubscriptionAuthError | null;
}

export interface SubscriptionAuthActions {
  reload(): Promise<void>;
  startLogin(provider: SubscriptionProvider): Promise<void>;
  cancelLogin(): Promise<void>;
  logout(provider: SubscriptionProvider): Promise<void>;
  refresh(provider: SubscriptionProvider): Promise<void>;
  openAuthorization(url: string): Promise<void>;
}

export type SubscriptionAuthViewModel = SubscriptionAuthState & SubscriptionAuthActions;
