# Review Team Upstream Audit

Date: 2026-06-02

## Upstream Reference

- Repository: `https://github.com/GCWing/BitFun`
- Commit inspected: `8318ab32286f750763c989cc84a97888c7490f19`
- Retrieval method: GitHub raw/API file download, because `git fetch` and sparse
  clone were intermittently blocked by network resets.

## Contract Decision

Do not whole-copy upstream Review Team files. The local void tree already
contains the upstream Review Team / Deep Review implementation plus void-specific
branding, additional UI fallbacks, action-bar/report/launch tests, and local
protected integrations. Accepted migration is therefore a no-op for source code:
keep the local implementation and verify it against the upstream contract.

## File-Level Map

| Surface | Local path | Upstream comparison | Decision |
|---|---|---|---|
| Core policy | `src/crates/core/src/agentic/deep_review_policy.rs` | Same behavior; upstream uses `BitFun*` error names and lacks local test coverage tail. | Keep local void names and tests. |
| Core runtime modules | `src/crates/core/src/agentic/deep_review/*` | Only behavior-neutral brand/type name differences in `report.rs`, `task_adapter.rs`, and `tool_measurement.rs`; local modules otherwise match or exceed upstream. | Keep local implementation. |
| Deep Review prompt | `src/crates/core/src/agentic/agents/prompts/deep_review_agent.md` | Upstream says BitFun; local correctly says void. | Keep local void prompt. |
| Review agent definitions | `src/crates/core/src/agentic/agents/definitions/review/*` | No accepted functional delta. | Keep local. |
| Desktop API | `src/apps/desktop/src/api/agentic_api.rs` | Review Team API is aligned; large upstream diff is mostly unrelated older goal/thread-goal and BitFun naming. | Keep local goal accounting/runtime contract. |
| Web service | `src/web-ui/src/shared/services/review-team/*` | Same service model; upstream installer path is `BitFun-Installer`, local correctly uses `Void-Installer`. | Keep local void path metadata. |
| Review Team page | `src/web-ui/src/app/scenes/agents/components/ReviewTeamPage.tsx` | Upstream removes `defaultValue` fallbacks; local retains fallbacks and void-safe text. | Keep local UI. |
| Flow-chat Deep Review UI | `src/web-ui/src/flow_chat/deep-review/*` | Local has more action-bar/report/launch modules and tests; upstream sampled file differs only in BitFun/defaultValue text. | Keep local. |
| Docs | `docs/architecture/deep-review.md` | No accepted functional delta. | Keep local. |

## Explicit Non-Goals

- Media sessions are out of scope.
- Workspace media preview and recently-deleted media are out of scope.
- Automation is out of scope.
- `/btw` side questions are out of scope.
- Installer branding and installed surfaces are out of scope.
- Void branding must not be replaced by upstream BitFun strings.

## Runtime Contract Check

- Review Team policy, queue, retry, judge, manifest, and report enrichment remain
  owned by core/domain modules.
- Web service builds launch manifests and maps state; UI renders returned state
  and dispatches actions.
- Desktop API keeps structured Tauri commands and does not require direct UI
  access to Rust internals.
- Current goal token accounting and `usage-limited` behavior must remain in
  place; the upstream desktop API diff is not accepted because it would regress
  the local goal runtime slice.
- Existing Task/subagent visibility remains local and compatible with Deep
  Review launches.

## Verification Plan

Run the focused Review Team checks plus cross-boundary acceptance:

- `cargo test -p void-core deep_review -- --nocapture`
- `cargo check -p void-desktop`
- `pnpm --dir src/web-ui run test:run src/shared/services/reviewTeamService.test.ts src/flow_chat/deep-review/action-bar/CapacityQueueNotice.test.tsx`
- `pnpm run type-check:web`
- `pnpm run brand:audit:strict`
- `git diff --check`

Installed-surface checks are not required for this slice because no installer or
packaging files are accepted for modification.
