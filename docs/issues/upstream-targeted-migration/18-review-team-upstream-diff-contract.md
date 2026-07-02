# Issue 18: Review Team Upstream Diff And Contract Audit

## What to build

Audit the current upstream Review Team / Deep Review implementation against the
local void tree and produce a narrow migration contract before editing code. This
slice defines which upstream Review Team behavior is allowed to replace local
behavior and which local product surfaces must remain untouched.

## Acceptance criteria

- [x] Fetch or otherwise inspect the latest upstream Review Team / Deep Review
      changes.
- [x] Produce a file/path-level migration map for Review Team core, desktop API,
      web service, UI, and i18n surfaces.
- [x] Explicitly mark media sessions, workspace media preview, automation,
      `/btw`, installer, and void branding as out of scope.
- [x] Identify any upstream Review Team behavior that conflicts with current
      runtime event, subagent, or goal-mode contracts.
- [x] Record the verification plan needed before and after migration.

## Implementation notes

- Upstream commit inspected:
  `8318ab32286f750763c989cc84a97888c7490f19`.
- Contract and file-level map:
  `docs/issues/upstream-targeted-migration/review-team-upstream-audit.md`.
- Decision: no source overwrite accepted. The local void implementation already
  contains the Review Team behavior and has additional void branding, goal
  accounting, action-bar/report/launch modules, and tests. Upstream BitFun
  strings, `BitFun-Installer` path metadata, and older thread-goal API deltas
  are rejected.

## Blocked by

None - can start immediately.
