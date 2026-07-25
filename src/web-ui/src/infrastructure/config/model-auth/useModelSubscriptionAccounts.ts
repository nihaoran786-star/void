import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type SubscriptionAccount,
} from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { desktopSubscriptionAuthService } from '@/app/subscription-auth';
import {
  mapSubscriptionAccountReadState,
  type SubscriptionAccountReadState,
} from './modelSubscriptionAuth';

export interface SubscriptionAccountReader {
  listAccounts(): Promise<SubscriptionAccount[]>;
}

export interface ModelSubscriptionAccounts {
  state: SubscriptionAccountReadState;
  reload(): Promise<void>;
}

export function useModelSubscriptionAccounts(
  reader: SubscriptionAccountReader = desktopSubscriptionAuthService,
): ModelSubscriptionAccounts {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [accounts, setAccounts] = useState<SubscriptionAccount[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();

  const reload = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(undefined);
    try {
      setAccounts(await reader.listAccounts());
      setStatus('ready');
    } catch (error) {
      setAccounts([]);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  }, [reader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    state: useMemo(
      () => mapSubscriptionAccountReadState(status, accounts, errorMessage),
      [accounts, errorMessage, status],
    ),
    reload,
  };
}
