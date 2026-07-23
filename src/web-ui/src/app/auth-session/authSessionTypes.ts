export type AuthErrorCategory =
  | 'authorization_unavailable'
  | 'authorization_cancelled'
  | 'network'
  | 'invalid_callback'
  | 'session_expired'
  | 'unknown';

export interface AuthenticatedAccount {
  accountId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export type AuthSessionState =
  | {
      status: 'anonymous';
    }
  | {
      status: 'authorizing';
      flowId: string;
      startedAt: string;
    }
  | {
      status: 'authenticated';
      account: AuthenticatedAccount;
      provider: 'web';
      authenticatedAt: string;
      expiresAt?: string;
    }
  | {
      status: 'error';
      category: AuthErrorCategory;
    };

export interface AuthSessionCapabilities {
  webAuthorization: 'available' | 'unavailable';
}

export interface AuthSessionSnapshot {
  state: AuthSessionState;
  capabilities: AuthSessionCapabilities;
}

export type WebAuthorizationOutcome =
  | {
      status: 'authenticated';
      account: AuthenticatedAccount;
      authenticatedAt: string;
      expiresAt?: string;
    }
  | {
      status: 'cancelled';
    };

/**
 * Boundary for the future system-browser OAuth flow.
 *
 * The adapter will own browser launch, PKCE/state/nonce generation and callback
 * validation. Access and refresh tokens must remain inside the adapter's secure
 * storage boundary and must never be returned through this interface.
 */
export interface WebAuthorizationAdapter {
  readonly availability: AuthSessionCapabilities['webAuthorization'];
  beginAuthorization(input: { flowId: string }): Promise<WebAuthorizationOutcome>;
  signOut?(): Promise<void>;
}

export interface AuthSessionController {
  getSnapshot(): AuthSessionSnapshot;
  subscribe(listener: () => void): () => void;
  startWebAuthorization(): Promise<void>;
  clearError(): void;
  signOut(): Promise<void>;
}
