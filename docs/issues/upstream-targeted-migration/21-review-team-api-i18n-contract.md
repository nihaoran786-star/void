# Issue 21: Review Team API And I18n Contract Migration

## What to build

Migrate upstream Review Team desktop/API wire fields and user-visible copy with
void-safe naming. This slice keeps API and locale changes explicit so Review Team
state remains stable across desktop, web, and remote surfaces.

## Acceptance criteria

- [x] Desktop/Tauri Review Team APIs expose structured request and response
      contracts for queue, retry, policy, manifest, and result state.
- [x] Web API adapters preserve Review Team fields without direct Tauri calls
      from UI components.
- [x] Locale updates use void naming and do not reintroduce legacy upstream brand
      strings.
- [x] i18n keys are present for all supported locales touched by Review Team UI.
- [x] Contract and i18n verification commands pass.

## Implementation notes

- No API or i18n source overwrite was accepted. Upstream Review Team API
  behavior is already present locally, while unrelated upstream goal/thread-goal
  diffs would regress the local goal accounting contract.
- Local UI keeps void-safe default text and uses existing i18n keys.
- Verification is tracked in Issue 22.

## Blocked by

- Issue 19: Review Team Core Policy And Runtime Migration.
- Issue 20: Review Team Web Service And UI Migration.
