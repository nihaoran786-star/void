# Upstream Capability Migration PRD

Date: 2026-07-02

> Historical program ledger: the upstream migration program is closed. Retain
> this document for scope and acceptance evidence; use
> [the repository context](../CONTEXT.md) for current project state.

## Goal

Inventory every upstream `GCWing/BitFun` fix, optimization, stability improvement, observability improvement, compatibility improvement, and feature-adjacent repair, then migrate accepted items into this Void branch while preserving all current Void-only capabilities.

The migration must be complete as a capability program, not a whole-repository merge. "Complete" means every upstream candidate enters the inventory and receives a decision. It does not mean every upstream patch is copied. Every upstream change must be classified, accepted or rejected with reasons, and implemented only through small independently verifiable issues.

## Background

The current project has diverged from upstream and contains protected local capabilities:

- Void brand, desktop identity, updater identity, and `Void-Installer`.
- Flow Chat session restore, BTW child conversations, subagent projections, multi-agent workflows, Review Team, `/goal`, and automation flows.
- AI media mode, APIMart media tools, workspace media gallery, media preview, media trash, pending-to-ready stable tiles, and media references.
- AI short drama canvas, stage agents, `.void/short-drama` project facts, change requests, attempts, revisions, derived indexes, and stage-specific tool policies.
- Desktop host features including compact chat floating window, desktop pet, terminal integration, Computer Use host, WebDriver bridge, tray, and window lifecycle.

Direct upstream merge is out of scope because it risks overwriting brand, installer, crate layout, Flow Chat state models, and media/short-drama features.

## Upstream Baseline

The current local upstream clone is `tmp/upstream-bitfun`.

Earlier observed upstream head for the initial migration baseline:

- repository: `GCWing/BitFun`
- branch: `main`
- commit: `c2f6a3c`
- commit summary: `Merge pull request #1390 from wgqqqqq/codex/image-understanding-tool`
- upstream package version: `0.2.11`

Historical migration documents reference older upstream commit `09bf6d1f`. The new inventory must cover the effective delta from that historical reference through the current upstream head where local clone and GitHub data allow it. If history depth is insufficient, the inventory must record the limitation and use release notes, upstream file comparison, and targeted source inspection.

## Task Type

This is a mixed migration program:

- Feature addition for upstream capabilities not present locally.
- Bug fix migration for upstream stability fixes.
- Performance optimization for startup, Flow Chat, terminal, and rendering changes.
- Test completion for protected local behavior and migrated slices.
- Refactoring only when required to isolate a migration behind an existing module boundary.

## Scope

In scope:

- Build a complete upstream capability inventory from the current upstream baseline.
- Classify each candidate as `P0 no-op/verify`, `P1 low-risk`, `P2 medium-risk`, `P3 high-risk/defer`, or `Rejected`.
- Implement accepted items one issue at a time.
- Preserve existing Void behavior through tests and explicit review gates.
- Update consensus documents after each issue.

Candidate capability families:

- Chat input and mention polish.
- Startup trace and Flow Chat performance observability.
- Flow Chat long-session, streaming, scroll, and restore stability fixes.
- CLI and ACP polish already present locally, validated as no-op.
- Image understanding tool, if adapted through current tool runtime and permission model.
- Terminal reliability improvements.
- Computer Use host improvements, platform by platform.
- Computer Use tool-contract additions such as `describe_screen`, only after product/schema contract acceptance and without bundling them into platform adapter work.
- Provider/adapter parsing and retry fixes.
- Provider/service boundary governance, starting with static owner checks that keep AI provider HTTP/SSE transport in `void-ai-adapters` unless a later issue names a service adapter explicitly.
- i18n, theme, repo hygiene, and brand-safe audit improvements.
- Prompt cache, Multitask, and persisted `/goal` workflow verification where local behavior is already present.
- Runtime token-budget accounting as a separate runtime-accounting candidate.
- Tests that protect media, short drama, multi-agent, session restore, desktop, and brand surfaces.

The candidate families are not an upper bound. Any additional upstream change discovered by inventory must still be classified.

## Classification Rules

- `P0 no-op/verify`: behavior already exists locally or is intentionally equivalent; only verification or documentation is needed.
- `P1 low-risk`: small change behind an existing interface, limited files, clear automated or manual verification, no protected contract expansion.
- `P2 medium-risk`: valuable change touching runtime, adapter, provider, terminal, Computer Use, image understanding, or performance paths; requires architecture decision and focused tests before implementation.
- `P3 high-risk/defer`: broad rewrite, crate layout shift, large rendering/runtime replacement, or ambiguous behavior that cannot be safely isolated yet.
- `Rejected`: conflicts with Void identity, installer, protected state models, module boundaries, security, or product direction.

## Non-Goals

- No direct merge from upstream `main`.
- No replacement of Void root layout with upstream root layout.
- No crate directory reorganization copied from upstream.
- No BitFun naming, bundle id, installer identity, registry key, icon, updater, or global variable.
- No replacement of `Void-Installer`.
- No broad rewrite of Flow Chat, Content Canvas, ShortDramaCenterPanel, or WorkspaceMediaLibrary.
- No migration that weakens media, short-drama, BTW, subagent, automation, or Review Team contracts.
- No dependency additions unless a single issue proves the dependency is necessary and safer than local implementation.
- No `describe_screen` implementation that aliases to screenshot without preserving multimodal gates, side-effect-free observation semantics, and explicit `status/source/error` output.

## Constraints

- Main session acts as orchestrator.
- Subagents may investigate, plan, implement a single issue, test, review, or document.
- The main session must synthesize subagent output before code changes.
- Each issue must be independently testable.
- Every issue must update `docs/PROGRESS.md` and `docs/TEST_PLAN.md`.
- Architecture-affecting issues must update `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`.
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ISSUES.md`, `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, and `docs/PROGRESS.md` are the active migration consensus documents.
- `docs/obsidian/*` remains historical context unless explicitly updated by a documentation issue.
- Failed tests must be analyzed, fixed, rerun, and recorded.

## Acceptance Criteria

- `docs/ISSUES.md` contains a complete staged issue list for upstream migration.
- `docs/ISSUES.md` includes an upstream inventory issue and records, for each candidate, upstream commit/path when available, capability description, classification, decision reason, affected Void module, protected contract, and verification.
- Each implemented issue has:
  - clear scope,
  - affected files,
  - preserved contracts,
  - tests or verification commands,
  - progress entry,
  - risk notes.
- No issue introduces BitFun branding or overwrites Void identity.
- No issue bypasses established module interfaces.
- The final migration state can be compared against the baseline branch/tag:
  - branch `baseline/void-source-20260702`
  - tag `baseline-20260702-void-source`
- Verification includes the smallest relevant checks per issue and broader checks before final completion.
- Final completion includes a matrix showing `Accepted implemented`, `P0 verified`, `P2/P3 deferred with reason`, and `Rejected with reason`, with no unclassified upstream candidate.

## Closeout Matrix

Current closeout status is tracked in `ISSUE-999 Split Parent Closeout Audit`.

- Accepted implemented / P0 verified: all concrete child issues in `docs/ISSUES.md` are marked `Done`.
- Split with residual gated scope: `ISSUE-020D`, `ISSUE-060I`, `ISSUE-122B`, and `ISSUE-900`.
- Rejected with reason: `ISSUE-901` installer/brand upstream changes and `ISSUE-902` whole Flow Chat replacement.
- No direct upstream patch copying is required for the Split residuals until their gates are satisfied: browser startup/render smoke, release/Homebrew owner policy, Computer Use DTO architecture decision, or crate-layout migration plan.

## Success Metrics

- Upstream capability coverage is explicit rather than guessed.
- Low-risk migrated fixes land without regressions in existing media, short-drama, multi-agent, desktop, and brand behavior.
- High-risk upstream changes are either decomposed into safe slices or documented as deferred/rejected.

## 2026-07-03 Selective Upgrade Wave

Upstream has advanced beyond the earlier migration baseline. The current observed upstream reference is:

- repository: `GCWing/BitFun`
- branch: `main`
- commit: `ac16dcc18`
- latest theme-governance commit in scope: `082cee447 refactor(theme): tighten extension color governance`

This wave is not a whole-repository synchronization. It is a selective capability upgrade program for the following priority order:

1. Flow Chat history, navigation, and long-session stability.
2. Terminal input, replay, and session recovery reliability.
3. Computer Use Windows capture, WGC, HWND, and platform safety fixes.
4. Image understanding and image-context capability completion.
5. MCP/tool runtime reliability and readonly manifest coverage.
6. Theme and token governance, including upstream near-color decisions.
7. Provider/service ownership boundaries.
8. Core crate decomposition ideas as deferred architecture guidance only.

Non-goals for this wave:

- Do not directly merge upstream `main`.
- Do not adopt BitFun branding, installer, release assets, or package identity.
- Do not reorganize the Rust crate layout.
- Do not replace large Flow Chat, terminal, Computer Use, media, or short-drama files wholesale.
- Do not weaken current multi-agent, BTW/subconversation, floating chat, AI media, or AI short-drama behavior.

Acceptance for this wave:

- Every candidate above is represented by a small issue or an explicit deferred/rejected decision.
- Implementation proceeds one issue at a time.
- Each issue has a module owner, allowed files, forbidden files, tests, and rollback/risk notes.
- Any upstream patch is adapted through the current Void interface, not copied as an owner replacement.
