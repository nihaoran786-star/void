# Issue 22: Review Team Regression And Acceptance Checks

## What to build

Run the final Review Team migration acceptance pass after Issues 18-21. The goal
is to prove the upstream Review Team update works without regressing local void
features such as media, automation, `/btw`, installed surfaces, and branding.

## Acceptance criteria

- [x] Focused Review Team core tests pass.
- [x] Focused Review Team web/service tests pass.
- [x] `cargo check -p void-desktop` passes.
- [x] `pnpm run type-check:web` passes.
- [x] `pnpm run brand:audit:strict` reports 0 residue.
- [x] Installed surface verifier and final acceptance report are run when
      packaging or installed-surface files were touched.
- [x] Manual smoke notes cover Review Team launch/result UI plus unchanged media
      preview, automation, and `/btw` surfaces.

## Implementation notes

- Installed-surface verifier/final acceptance report are not required for this
  Review Team slice because installer and packaging files were not modified.
- Fresh verification:
  - `cargo test -p void-core deep_review -- --nocapture`: 143 passed, 0 failed.
  - `pnpm --dir src/web-ui run test:run src/shared/services/reviewTeamService.test.ts src/flow_chat/deep-review/action-bar/CapacityQueueNotice.test.tsx`:
    2 files passed, 63 tests passed.
  - `cargo check -p void-desktop`: passed with the existing
    `parse_clipboard_path_segments` unused warning.
  - `pnpm run type-check:web`: passed.
  - `pnpm run brand:audit:strict`: 0 occurrences.
  - `git diff --check`: passed.
- Smoke notes: no Review Team source files were changed because the upstream
  contract audit found the local void implementation already covers the accepted
  behavior. Protected media preview, media sessions, automation, `/btw`,
  installer, and branding files were not modified in this slice.

## Blocked by

- Issue 21: Review Team API And I18n Contract Migration.
