import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import {
  SUBSCRIPTION_PROVIDERS,
  type SubscriptionProvider,
} from '@/shared/contracts/subscriptionAuth';

export { SUBSCRIPTION_PROVIDERS };
export type { SubscriptionProvider };
export type SubscriptionAccountStatus =
  | 'connected'
  | 'disconnected'
  | 'vault_unavailable'
  | 'failed';
export type SubscriptionLoginStatus =
  | 'pending'
  | 'authorized'
  | 'failed'
  | 'cancelled';

export interface SubscriptionAuthError {
  code: string;
  message: string;
  retryable: boolean;
}

export const SUBSCRIPTION_AUTH_DESKTOP_UPDATE_REQUIRED = 'desktop_update_required';

export class SubscriptionAuthCapabilityError extends Error {
  readonly code = SUBSCRIPTION_AUTH_DESKTOP_UPDATE_REQUIRED;
  readonly retryable = false;

  constructor() {
    super('Subscription login requires a current desktop host. Restart Void to finish the update.');
    this.name = 'SubscriptionAuthCapabilityError';
  }
}

export function isSubscriptionAuthCapabilityError(
  error: unknown,
): error is SubscriptionAuthCapabilityError {
  return error instanceof SubscriptionAuthCapabilityError;
}

export interface SubscriptionAccount {
  provider: SubscriptionProvider;
  status: SubscriptionAccountStatus;
  accountHint: string | null;
  expiresAt: number | null;
  error: SubscriptionAuthError | null;
}

export interface SubscriptionAuthSession {
  sessionId: string;
  provider: SubscriptionProvider;
  status: SubscriptionLoginStatus;
  authorizationUrl: string | null;
  userCode: string | null;
  error: SubscriptionAuthError | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readField(record: UnknownRecord, camelCase: string, snakeCase: string): unknown {
  return record[camelCase] ?? record[snakeCase];
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isProvider(value: unknown): value is SubscriptionProvider {
  return SUBSCRIPTION_PROVIDERS.some(provider => provider === value);
}

function isMissingSubscriptionAuthCommand(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('unknown command')
    || normalized.includes('command not found')
    || (normalized.includes('command') && normalized.includes('not found'));
}

function subscriptionAuthCommandError(
  command: string,
  error: unknown,
  request?: unknown,
): Error {
  return isMissingSubscriptionAuthCommand(error)
    ? new SubscriptionAuthCapabilityError()
    : createTauriCommandError(command, error, request);
}

function mapError(value: unknown): SubscriptionAuthError | null {
  if (!isRecord(value)) {
    return typeof value === 'string' && value.trim()
      ? { code: 'failed', message: value, retryable: false }
      : null;
  }
  const message = readNullableString(value.message);
  if (!message) {
    return null;
  }
  return {
    code: readNullableString(value.code) ?? 'failed',
    message,
    retryable: value.retryable === true,
  };
}

function mapAccountStatus(value: unknown): SubscriptionAccountStatus {
  if (
    value === 'connected'
    || value === 'disconnected'
    || value === 'vault_unavailable'
    || value === 'failed'
  ) {
    return value;
  }
  throw new Error('Subscription account status is invalid');
}

export function mapSubscriptionAccountResponse(value: unknown): SubscriptionAccount {
  if (!isRecord(value) || !isProvider(value.provider)) {
    throw new Error('Subscription account response is invalid');
  }
  return {
    provider: value.provider,
    status: mapAccountStatus(value.status),
    accountHint: readNullableString(readField(value, 'accountHint', 'account_hint')),
    expiresAt: readNullableNumber(readField(value, 'expiresAt', 'expires_at')),
    error: mapError(value.error),
  };
}

export function mapSubscriptionAccountsResponse(value: unknown): SubscriptionAccount[] {
  if (!Array.isArray(value) || value.length !== SUBSCRIPTION_PROVIDERS.length) {
    throw new Error('Subscription account response must contain every provider exactly once');
  }
  const byProvider = new Map<SubscriptionProvider, SubscriptionAccount>();
  for (const item of value) {
    const account = mapSubscriptionAccountResponse(item);
    if (byProvider.has(account.provider)) {
      throw new Error('Subscription account response contains a duplicate provider');
    }
    byProvider.set(account.provider, account);
  }
  return SUBSCRIPTION_PROVIDERS.map(provider => {
    const account = byProvider.get(provider);
    if (!account) {
      throw new Error(`Subscription account response is missing ${provider}`);
    }
    return account;
  });
}

export function mapSubscriptionSessionResponse(value: unknown): SubscriptionAuthSession {
  if (!isRecord(value)) {
    throw new Error('Subscription session response must be an object');
  }
  const sessionId = readNullableString(readField(value, 'sessionId', 'session_id'));
  const provider = value.provider;
  const status = value.status;
  if (
    !sessionId
    || !isProvider(provider)
    || !['pending', 'authorized', 'failed', 'cancelled'].includes(String(status))
  ) {
    throw new Error('Subscription session response is invalid');
  }
  return {
    sessionId,
    provider,
    status: status as SubscriptionLoginStatus,
    authorizationUrl: readNullableString(
      readField(value, 'authorizationUrl', 'authorization_url'),
    ),
    userCode: readNullableString(readField(value, 'userCode', 'user_code')),
    error: mapError(value.error),
  };
}

export class SubscriptionAuthAPI {
  async listAccounts(): Promise<SubscriptionAccount[]> {
    try {
      const response = await api.invoke<unknown>('subscription_auth_list_accounts', {});
      return mapSubscriptionAccountsResponse(response);
    } catch (error) {
      throw subscriptionAuthCommandError('subscription_auth_list_accounts', error);
    }
  }

  async start(
    provider: SubscriptionProvider,
    sessionId: string,
  ): Promise<SubscriptionAuthSession> {
    try {
      const response = await api.invoke<unknown>('subscription_auth_start', {
        request: { provider, sessionId },
      });
      return mapSubscriptionSessionResponse(response);
    } catch (error) {
      throw subscriptionAuthCommandError(
        'subscription_auth_start',
        error,
        { provider, sessionId },
      );
    }
  }

  async status(sessionId: string): Promise<SubscriptionAuthSession> {
    try {
      const response = await api.invoke<unknown>('subscription_auth_status', {
        request: { sessionId },
      });
      return mapSubscriptionSessionResponse(response);
    } catch (error) {
      throw subscriptionAuthCommandError('subscription_auth_status', error, { sessionId });
    }
  }

  async cancel(sessionId: string): Promise<SubscriptionAuthSession> {
    try {
      const response = await api.invoke<unknown>('subscription_auth_cancel', {
        request: { sessionId },
      });
      return mapSubscriptionSessionResponse(response);
    } catch (error) {
      throw subscriptionAuthCommandError('subscription_auth_cancel', error, { sessionId });
    }
  }

  async logout(provider: SubscriptionProvider): Promise<void> {
    try {
      await api.invoke('subscription_auth_logout', { request: { provider } });
    } catch (error) {
      throw subscriptionAuthCommandError('subscription_auth_logout', error, { provider });
    }
  }

  async refresh(provider: SubscriptionProvider): Promise<SubscriptionAccount> {
    try {
      const response = await api.invoke<unknown>('subscription_auth_refresh', {
        request: { provider },
      });
      const account = mapSubscriptionAccountResponse(response);
      if (account.provider !== provider) {
        throw new Error('Subscription refresh returned a mismatched provider');
      }
      return account;
    } catch (error) {
      throw subscriptionAuthCommandError('subscription_auth_refresh', error, { provider });
    }
  }
}

export const subscriptionAuthAPI = new SubscriptionAuthAPI();
