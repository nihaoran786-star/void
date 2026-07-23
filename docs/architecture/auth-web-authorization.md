# Web authorization boundary

Status: skeleton implemented, external authorization not connected.

## Ownership and dependency direction

```text
Settings Account UI
  -> AuthSessionController public interface
  -> WebAuthorizationAdapter
  -> system browser / OAuth provider / secure credential storage
```

`app/auth-session` owns the explicit authentication state and orchestration
interface. The Settings page renders its snapshot and invokes public actions;
it does not open browsers, validate callbacks, store credentials, or infer login
state from profile fields.

The existing `ProfileScene` remains the AI assistant/companion experience. It
is not a user-account surface and is not reused by authentication.

## State model

`AuthSessionState` is a discriminated union:

- `anonymous`: production default before an adapter is connected;
- `authorizing`: a web flow has started and the app awaits a validated result;
- `authenticated`: contains display-safe account metadata only;
- `error`: contains only a classified error category; raw diagnostics stay
  behind the adapter boundary.

The UI also receives an explicit `webAuthorization` capability. An unavailable
adapter leaves the production page anonymous with the sign-in action disabled;
there is no demo-account toggle or simulated successful login.

## Future browser flow

The production adapter must:

1. Generate a cryptographically random PKCE verifier/challenge, `state`, and
   OpenID Connect `nonce`.
2. Keep verifier and correlation values in an in-memory, bounded flow record.
3. Open the authorization URL in the system browser.
4. Receive a loopback or registered deep-link callback.
5. Validate scheme, host, path, `state`, `nonce`, issuer, audience, and expiry
   before accepting the result.
6. Exchange the authorization code through the trusted adapter/backend.
7. Store access and refresh credentials in OS-backed secure storage.
8. Return only display-safe account metadata to `AuthSessionController`.

The adapter must classify cancellation, network failure, invalid callbacks, and
expired sessions rather than exposing raw provider errors to the UI.

Local sign-out is authoritative: the controller always clears the renderable
session even when remote provider revocation fails. Raw revocation errors remain
inside the adapter boundary and never become an unhandled UI promise or state.
Authorization completion is latest-wins: sign-out or error reset invalidates
the active flow generation, so a late browser callback cannot restore a stale
authenticated state.

## Credential rule

Access tokens, refresh tokens, authorization codes, PKCE verifiers, client
secrets, and provider cookies must never enter React props, Zustand,
`localStorage`, `sessionStorage`, logs, or analytics. `AuthSessionState` is safe
to render and intentionally has no credential fields.

## Current verification

- Controller tests cover anonymous, authorizing, authenticated, cancellation,
  unavailable authorization, and classified errors.
- Account view tests render anonymous, authorizing, authenticated, and error
  states through pure props.
- The startup import-boundary test keeps Account Settings lazy and prevents
  direct Tauri or browser-storage access in its presentation component.
