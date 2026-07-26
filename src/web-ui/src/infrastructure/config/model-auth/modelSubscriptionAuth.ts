import type {
  SubscriptionAccount,
  SubscriptionAccountStatus,
} from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import type { SubscriptionProvider } from '@/shared/contracts/subscriptionAuth';
import type { AuthConfig } from '../types';

export type ModelAuthOption =
  | 'api_key'
  | 'codex_cli'
  | 'gemini_cli'
  | `subscription:${SubscriptionProvider}`;

export type SubscriptionAccountReadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; accounts: ReadonlyMap<SubscriptionProvider, SubscriptionAccount> };

export interface PersistedModelAuth {
  auth: AuthConfig;
  apiKey: string;
}

export function mapSubscriptionAccountReadState(
  status: 'loading' | 'ready' | 'failed',
  accounts: readonly SubscriptionAccount[],
  errorMessage?: string,
): SubscriptionAccountReadState {
  if (status === 'loading') {
    return { status: 'loading' };
  }
  if (status === 'failed') {
    return {
      status: 'failed',
      message: errorMessage?.trim() || 'Subscription accounts could not be loaded',
    };
  }
  return {
    status: 'ready',
    accounts: new Map(accounts.map(account => [account.provider, account])),
  };
}

export function authOptionValue(auth?: AuthConfig): ModelAuthOption {
  if (auth?.type === 'subscription') {
    return `subscription:${auth.provider}`;
  }
  return auth?.type ?? 'api_key';
}

export function authFromOption(value: string): AuthConfig {
  if (value === 'subscription:codex') {
    return { type: 'subscription', provider: 'codex' };
  }
  if (value === 'subscription:opencode') {
    return { type: 'subscription', provider: 'opencode' };
  }
  if (value === 'codex_cli' || value === 'gemini_cli') {
    return { type: value };
  }
  return { type: 'api_key' };
}

export function normalizeModelAuthForPersistence(
  auth: AuthConfig | undefined,
  apiKey: string | undefined,
): PersistedModelAuth {
  const resolved = auth ?? { type: 'api_key' };
  return {
    auth: resolved,
    apiKey: resolved.type === 'subscription' ? '' : apiKey ?? '',
  };
}

export function accountStatusFor(
  state: SubscriptionAccountReadState,
  provider: SubscriptionProvider,
): SubscriptionAccountStatus | 'loading' | 'load_failed' | 'unsupported' {
  if (state.status === 'loading') {
    return 'loading';
  }
  if (state.status === 'failed') {
    return 'load_failed';
  }
  return state.accounts.get(provider)?.status ?? 'unsupported';
}
