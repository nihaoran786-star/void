import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SUBSCRIPTION_PROVIDERS,
  isSubscriptionAuthCapabilityError,
  type SubscriptionAccount,
  type SubscriptionAuthError,
  type SubscriptionAuthSession,
  type SubscriptionProvider,
} from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { desktopSubscriptionAuthService } from './subscriptionAuthService';
import { SubscriptionLoginCoordinator } from './subscriptionLoginCoordinator';
import type {
  SubscriptionAuthService,
  SubscriptionAuthState,
  SubscriptionAuthViewModel,
} from './subscriptionAuthTypes';

const SNAPSHOT_POLL_INTERVAL_MS = 1_000;

function errorFrom(error: unknown): SubscriptionAuthError {
  if (isSubscriptionAuthCapabilityError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  return {
    code: 'web_operation_failed',
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

function failedAccounts(error: SubscriptionAuthError): SubscriptionAccount[] {
  return SUBSCRIPTION_PROVIDERS.map(provider => ({
    provider,
    status: 'failed',
    accountHint: null,
    expiresAt: null,
    error,
  }));
}

const initialState: SubscriptionAuthState = {
  loadStatus: 'loading',
  accounts: [],
  session: null,
  activeProvider: null,
  actionProvider: null,
  error: null,
};

export function useSubscriptionAuth(
  service: SubscriptionAuthService = desktopSubscriptionAuthService,
  coordinatorFactory: () => SubscriptionLoginCoordinator = () => new SubscriptionLoginCoordinator(),
): SubscriptionAuthViewModel {
  const [state, setState] = useState<SubscriptionAuthState>(initialState);
  const mountedRef = useRef(true);
  const coordinatorRef = useRef<SubscriptionLoginCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = coordinatorFactory();
  }

  const reload = useCallback(async () => {
    setState(current => ({ ...current, loadStatus: 'loading', error: null }));
    try {
      const accounts = await service.listAccounts();
      if (mountedRef.current) {
        setState(current => ({ ...current, loadStatus: 'ready', accounts, error: null }));
      }
    } catch (error) {
      if (mountedRef.current) {
        const mapped = errorFrom(error);
        setState(current => ({
          ...current,
          loadStatus: 'failed',
          accounts: failedAccounts(mapped),
          error: mapped,
        }));
      }
    }
  }, [service]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
      const operation = coordinatorRef.current?.requestCancel();
      if (operation) {
        void service.cancel(operation.sessionId).catch(() => undefined);
      }
    };
  }, [reload, service]);

  useEffect(() => {
    const session = state.session;
    if (!session || session.status !== 'pending') {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = coordinatorRef.current?.current();
    if (
      !operation
      || !operation.startSettled
      || operation.sessionId !== session.sessionId
    ) {
      return;
    }

    const poll = async () => {
      try {
        const snapshot = await service.status(session.sessionId);
        if (
          !active
          || !mountedRef.current
          || !coordinatorRef.current?.owns(operation)
          || snapshot.sessionId !== operation.sessionId
          || snapshot.provider !== operation.provider
        ) {
          return;
        }
        setState(current => ({
          ...current,
          session: snapshot.status === 'pending' && current.session?.sessionId === snapshot.sessionId
            ? { ...snapshot, error: snapshot.error ?? current.session.error }
            : snapshot,
        }));
        if (snapshot.status === 'pending') {
          timer = setTimeout(() => void poll(), SNAPSHOT_POLL_INTERVAL_MS);
          return;
        }
        coordinatorRef.current.complete(operation);
        setState(current => ({ ...current, activeProvider: null }));
        if (snapshot.status === 'authorized') {
          await reload();
        }
      } catch (error) {
        if (!active || !mountedRef.current || !coordinatorRef.current?.owns(operation)) {
          return;
        }
        const mapped = errorFrom(error);
        coordinatorRef.current.complete(operation);
        setState(current => ({
          ...current,
          activeProvider: null,
          session: { ...session, status: 'failed', error: mapped },
        }));
      }
    };

    timer = setTimeout(() => void poll(), SNAPSHOT_POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [reload, service, state.session]);

  const openAuthorization = useCallback(async (url: string) => {
    try {
      await service.openAuthorization(url);
      if (mountedRef.current) {
        setState(current => ({
          ...current,
          session: current.session
            ? { ...current.session, error: null }
            : current.session,
        }));
      }
    } catch (error) {
      if (mountedRef.current) {
        const mapped = errorFrom(error);
        setState(current => ({
          ...current,
          session: current.session
            ? { ...current.session, error: mapped }
            : current.session,
        }));
      }
    }
  }, [service]);

  const startLogin = useCallback(async (provider: SubscriptionProvider) => {
    const operation = coordinatorRef.current?.begin(provider);
    if (!operation) {
      return;
    }
    const pending: SubscriptionAuthSession = {
      sessionId: operation.sessionId,
      provider,
      status: 'pending',
      authorizationUrl: null,
      userCode: null,
      error: null,
    };
    setState(current => ({
      ...current,
      activeProvider: provider,
      session: pending,
      error: null,
    }));
    try {
      const started = await service.start(provider, operation.sessionId);
      const shouldContinue = coordinatorRef.current?.settleStart(operation) === true;
      if (
        !shouldContinue
        || started.sessionId !== operation.sessionId
        || started.provider !== operation.provider
      ) {
        await service.cancel(operation.sessionId).catch(() => undefined);
        coordinatorRef.current?.complete(operation);
        return;
      }
      if (!mountedRef.current) {
        await service.cancel(operation.sessionId).catch(() => undefined);
        coordinatorRef.current?.complete(operation);
        return;
      }
      setState(current => ({ ...current, session: started }));
      if (started.status !== 'pending') {
        coordinatorRef.current?.complete(operation);
        setState(current => ({ ...current, activeProvider: null }));
        if (started.status === 'authorized') {
          await reload();
        }
        return;
      }
      if (started.authorizationUrl) {
        await openAuthorization(started.authorizationUrl);
      }
    } catch (error) {
      const mapped = errorFrom(error);
      if (!operation.startSettled) {
        coordinatorRef.current?.settleStart(operation);
      }
      await service.cancel(operation.sessionId).catch(() => undefined);
      if (coordinatorRef.current?.complete(operation) && mountedRef.current) {
        setState(current => ({
          ...current,
          activeProvider: null,
          session: operation.cancelled
            ? { ...pending, status: 'cancelled', error: null }
            : { ...pending, status: 'failed', error: mapped },
        }));
      }
    }
  }, [openAuthorization, reload, service]);

  const cancelLogin = useCallback(async () => {
    const operation = coordinatorRef.current?.requestCancel();
    if (!operation) {
      return;
    }
    try {
      const cancelled = await service.cancel(operation.sessionId);
      if (mountedRef.current && coordinatorRef.current?.owns(operation)) {
        setState(current => ({
          ...current,
          session: cancelled,
          activeProvider: null,
        }));
      }
    } catch (error) {
      if (mountedRef.current && coordinatorRef.current?.owns(operation)) {
        const mapped = errorFrom(error);
        setState(current => ({
          ...current,
          session: current.session
            ? { ...current.session, status: 'failed', error: mapped }
            : current.session,
          activeProvider: null,
        }));
      }
    } finally {
      // If start is still unresolved it owns final cleanup and releases the slot.
      if (operation.startSettled) {
        coordinatorRef.current?.complete(operation);
      }
    }
  }, [service]);

  const runAccountAction = useCallback(async (
    provider: SubscriptionProvider,
    action: () => Promise<unknown>,
  ) => {
    setState(current => ({ ...current, actionProvider: provider, error: null }));
    try {
      await action();
      await reload();
    } catch (error) {
      if (mountedRef.current) {
        setState(current => ({ ...current, error: errorFrom(error) }));
      }
    } finally {
      if (mountedRef.current) {
        setState(current => ({ ...current, actionProvider: null }));
      }
    }
  }, [reload]);

  const logout = useCallback(
    (provider: SubscriptionProvider) => runAccountAction(
      provider,
      () => service.logout(provider),
    ),
    [runAccountAction, service],
  );
  const refresh = useCallback(
    (provider: SubscriptionProvider) => runAccountAction(
      provider,
      () => service.refresh(provider),
    ),
    [runAccountAction, service],
  );
  return {
    ...state,
    reload,
    startLogin,
    cancelLogin,
    logout,
    refresh,
    openAuthorization,
  };
}
