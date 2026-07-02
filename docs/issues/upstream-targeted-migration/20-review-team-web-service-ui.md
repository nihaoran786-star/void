# Issue 20: Review Team Web Service And UI Migration

## What to build

Migrate upstream Review Team web service and UI behavior after the core runtime
contract is updated. The web layer should remain a renderer and action
dispatcher, not the owner of Review Team policy decisions.

## Acceptance criteria

- [x] Review Team web service consumes explicit core/API status, source, error,
      retry, and queue fields.
- [x] `ReviewTeamPage` and flow-chat Deep Review UI render Review Team state
      without inferring policy from strings or missing arrays.
- [x] User actions such as pause, continue, retry, skip optional, and inspect
      result are routed through service/API boundaries.
- [x] Existing media preview panel, media sessions, automation, and `/btw` UI
      behavior are unchanged.
- [x] Focused web tests cover service mapping and critical UI states.

## Implementation notes

- No web source overwrite was accepted. Local Review Team UI/service already
  carries the upstream model and keeps additional void-safe i18n fallback text.
- The upstream `BitFun-Installer` path metadata is rejected; local
  `Void-Installer` mapping is required for brand and installer correctness.
- Protected media preview, media sessions, automation, and `/btw` files were not
  modified.
- Verification is tracked in Issue 22.

## Blocked by

- Issue 19: Review Team Core Policy And Runtime Migration.
