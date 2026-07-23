import {
  createAuthSessionController,
  createUnavailableWebAuthorizationAdapter,
} from './authSessionController';

/**
 * Production remains anonymous until a real web-authorization adapter is
 * injected. No demo account or fake sign-in transition is exposed.
 */
export const defaultAuthSessionController = createAuthSessionController(
  createUnavailableWebAuthorizationAdapter(),
);
