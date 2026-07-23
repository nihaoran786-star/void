import type {
  AuthErrorCategory,
  AuthSessionController,
  AuthSessionSnapshot,
  WebAuthorizationAdapter,
} from './authSessionTypes';

const ANONYMOUS_STATE = { status: 'anonymous' } as const;

function createFlowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `auth-${Date.now()}`;
}

export class AuthSessionAdapterError extends Error {
  constructor(
    readonly category: AuthErrorCategory,
    message?: string,
  ) {
    super(message);
    this.name = 'AuthSessionAdapterError';
  }
}

function categoryFromError(error: unknown): AuthErrorCategory {
  if (error instanceof AuthSessionAdapterError) return error.category;
  return 'unknown';
}

export function createAuthSessionController(
  adapter: WebAuthorizationAdapter,
): AuthSessionController {
  let snapshot: AuthSessionSnapshot = {
    state: ANONYMOUS_STATE,
    capabilities: {
      webAuthorization: adapter.availability,
    },
  };
  const listeners = new Set<() => void>();
  let generation = 0;

  const updateState = (state: AuthSessionSnapshot['state']) => {
    snapshot = { ...snapshot, state };
    listeners.forEach(listener => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    startWebAuthorization: async () => {
      if (snapshot.state.status === 'authorizing') return;

      if (adapter.availability === 'unavailable') {
        updateState({ status: 'error', category: 'authorization_unavailable' });
        return;
      }

      const flowId = createFlowId();
      const flowGeneration = ++generation;
      const isCurrentFlow = () => {
        const state = snapshot.state;
        return (
          generation === flowGeneration
          && state.status === 'authorizing'
          && state.flowId === flowId
        );
      };
      updateState({
        status: 'authorizing',
        flowId,
        startedAt: new Date().toISOString(),
      });

      try {
        const outcome = await adapter.beginAuthorization({ flowId });
        if (!isCurrentFlow()) return;
        if (outcome.status === 'cancelled') {
          updateState({ status: 'anonymous' });
          return;
        }
        updateState({
          status: 'authenticated',
          account: outcome.account,
          provider: 'web',
          authenticatedAt: outcome.authenticatedAt,
          expiresAt: outcome.expiresAt,
        });
      } catch (error) {
        if (!isCurrentFlow()) return;
        updateState({
          status: 'error',
          category: categoryFromError(error),
        });
      }
    },
    clearError: () => {
      generation += 1;
      if (snapshot.state.status === 'error') updateState(ANONYMOUS_STATE);
    },
    signOut: async () => {
      generation += 1;
      updateState(ANONYMOUS_STATE);
      try {
        await adapter.signOut?.();
      } catch {
        // Local sign-out is authoritative. Provider revocation failures stay
        // behind the adapter boundary and must not leak into renderable state.
      }
    },
  };
}

export function createUnavailableWebAuthorizationAdapter(): WebAuthorizationAdapter {
  return {
    availability: 'unavailable',
    beginAuthorization: async () => {
      throw new AuthSessionAdapterError('authorization_unavailable');
    },
  };
}
