# Current collaboration context

Updated: 2026-07-28

## Product state

- Branch line: `codex/minimal-workspace-ui`.
- The `minimal` workspace is the clean-profile default; `classic` remains the
  rollback presentation.
- The short-drama workspace uses one real secondary `EditorGroup` for the fixed
  stage-agent team. Minimal presentation may collapse it to an on-demand,
  zero-reserved-width entry and open the existing group in a bounded overlay.
- Closing the short-drama team presentation must not delete child sessions or
  remove the only reopen control.
- Future Review, Finance, Short Drama, Customer Service, and other expert teams
  share one durable Team Workspace domain: reusable team definitions contain a
  lead, specialist members, workflow phases, and policy; session-bound team
  instances project into a dedicated coordination container beside Canvas.
  Teams are not ordinary Canvas tabs, and an individual member conversation
  remains an existing `/btw` child session. The active contract is
  [docs/features/team-workspace-prd.md](docs/features/team-workspace-prd.md).
- The session owns one stable outer canvas toggle on the chat/canvas divider.
  It hides the universal preview and any nested stage-agent presentation
  together without closing tabs or deleting child sessions, then remains at
  the scene edge as the one-click reopen action. The team control remains
  scoped to the nested stage-agent presentation.
- Runtime, persistence, Skill policy, media tool routing, session history, and
  desktop host behavior remain outside presentation-only changes.

## Architecture map

The main dependency direction is:

```text
UI / route -> Module Interface -> Adapter / service -> external system
```

- **Module:** Flow Chat owns chat state and conversation behavior.
  **Interface:** typed Flow Chat services, selectors, and view state.
- **Module:** Content Canvas owns tabs and layout state.
  **Interface:** canvas store actions and presentation selectors.
- **Module:** Team Workspace owns reusable team definitions, session-bound team
  instances, workflow/member projections, and coordination presentation state.
  **Interface:** team catalog, orchestration, and workspace projection
  contracts; adapters alone may access persistence or the subagent runtime.
- **Module:** Short Drama owns project facts and stage workflow.
  **Interface:** short-drama services, runtime bridge, workspace manifest, and
  explicit view models.
- **Module:** Workspace Media owns discovery, bounded preview scheduling, and
  media operations.
  **Interface:** `WorkspaceMediaLibraryService` and refresh signals.
- **Module:** desktop/native integration owns Tauri and OS behavior.
  **Interface:** infrastructure adapters consumed by UI Modules.

Keep each **Implementation** behind its Module Interface. Prefer a deep Module:
the Interface should remain small while its Implementation absorbs lifecycle
and compatibility complexity. Add a **Seam** only when it isolates a real
source of change. Use an **Adapter** at external-system boundaries. Favor
**Locality** and **Leverage**; broad changes to orchestration hotspots require
stronger evidence than their apparent convenience.

## Current quality state

Repository graph and automated review on 2026-07-28 covered 3,034 files,
54,239 structural nodes, repository governance checks, Web UI type/lint/tests,
core checks, theme contracts, i18n contracts, production build budgets, and
full-window desktop evidence.

High-confidence defects fixed in the current audit:

- three undefined minimal-workspace CSS tokens that broke the theme-color Gate
  and caused declarations to be ignored at runtime;
- reopening a tab after its split auto-merged could restore it into an invisible
  editor group;
- tertiary canvas operations incorrectly aliased the group to secondary, so a
  short-drama stage-agent open could report success without moving the real tab.
- BTW history hydration was globally serialized and could skip the newly
  selected child session while another child was still loading;
- background short-drama events could contaminate the active workspace;
- stale short-drama project loads could overwrite a newer workspace state;
- overlapping runtime-focus writes could persist an older stage or artifact;
- the team-rail E2E no longer adds errors to the strict TypeScript baseline.

Open baseline debt:

- the E2E project currently has strict TypeScript failures and CI does not type
  check it;
- Rust format and Clippy gates are not clean and are not fully represented in
  CI;
- test files are excluded from Web UI ESLint and TypeScript project checks;
- `ChatInput` remains a high-coupling orchestration hotspot;
- Browser UI still contains registered direct-Tauri lifecycle exceptions.
- stage-agent binding persistence and bounded retry still have a confirmed
  async state gap.

Evidence and exact commands are in
[docs/qa/repository-stability-audit-2026-07-28.md](docs/qa/repository-stability-audit-2026-07-28.md).

## Documentation policy

- [docs/README.md](docs/README.md) is the documentation index.
- Current specifications define active Interfaces and gates.
- Dated audits/results record checkpoint evidence and must not claim permanent
  authority.
- The 2026-07 upstream migration consensus files are retained as a frozen
  historical program ledger because they contain unique decisions and
  verification evidence.
- `docs/obsidian/` is a tracked historical snapshot, not a live external source.
- Untracked prototypes are user-owned until explicitly accepted or discarded.
