# Issue 01: Add APIMart Media Token Settings

## What to build

Add a settings entry for the APIMart media token. The base URL is fixed internally as `https://api.apimart.ai` and must not be exposed as a required user input in the first phase. The setting should be readable by backend media tools and clearable by the user.

## Acceptance criteria

- [ ] Settings exposes a single APIMart media token field.
- [ ] The token is persisted through the existing config system.
- [ ] The fixed APIMart base URL is owned by backend media provider code, not the UI.
- [ ] Empty token is allowed in settings but media tools return `provider_not_configured`.
- [ ] Token value is not logged or shown in plain text after save.
- [ ] Config tests cover save/read/clear behavior.

## Blocked by

None - can start immediately.
