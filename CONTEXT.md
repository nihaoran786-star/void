# Current collaboration context

Updated: 2026-08-02

## Product state

- Active customization integration branch: `codex/customization-unification`.
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
- Code, Cowork, and Media are stable **scenario workspaces**, not professional
  personas. A parent conversation separately owns one **active persona**:
  its scenario default, a selected single Agent, or a selected team lead.
  Switching persona preserves the scenario, execution policy, workspace,
  permissions, Canvas, and top-level history. The active contract is
  [docs/features/customization-center-prd.md](docs/features/customization-center-prd.md).
- The Desktop/Tauri customization slice now provides one localized
  Agent/Team/Skill catalog, per-parent single-Agent selection in the composer,
  Agent and Skill authoring, and validated user/project Team definition
  create/edit/install/delete flows. Deep Review and AI Short Drama remain
  adapters over their existing fixed runtimes. General user-authored Team
  activation/orchestration and browser/server parity remain explicit deferred
  capabilities rather than simulated behavior.
- The Agent catalog is presented as a localized AI employee market: the
  existing left-side Customization navigation remains the only section
  navigation, the duplicate in-page top navigation is removed, and Agent cards
  show a stable generated portrait, Chinese-facing name, professional role,
  short responsibility description, capability tags, and one detail action.
  Portrait assignment is deterministic and presentation-only; it does not
  change runtime identity, persona composition, cache keys, permissions, Team
  execution, or session state.
- The Skills and Connectors entries follow the same standalone catalog pattern.
  Skills keeps authoring, import, suite visibility, local/market install and
  detail behavior behind its existing services, while presenting eight cards
  per page in a four/two/one-column responsive grid. The 45 standard user
  Skills discovered from the exact `user::home.codex::{dirName}` identity have
  localized names and purpose copy in Simplified Chinese, English, and
  Traditional Chinese; project Skills, other sources, custom display names,
  raw runtime keys, and marketplace install identity remain unchanged.
  Connectors opens a
  dedicated scene instead of redirecting into Settings; that scene selects a
  catalog presentation on the existing MCP infrastructure component, so JSON
  configuration, lifecycle controls, deletion, remote authentication and OAuth
  still use the established adapter. Settings retains the original MCP
  presentation. Connector loading failures are explicit and retryable; no
  online connector marketplace or unsupported one-click install is simulated.
- An **execution policy** controls how the active persona may act; a **Skill**
  is reusable operating guidance. Neither term is a synonym for scenario or
  persona.
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
- **Module:** Customization Center owns localized Agent, Team, Skill, and
  connector discovery plus parent-conversation persona selection.
  **Interface:** capability catalog and persona activation contracts; adapters
  alone may compose runtime prompts, resolve permissions, or activate Agents.
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

The 2026-07-30 customization integration additionally passed the complete Web
UI test suite, type and lint checks, repository/theme/i18n contracts, production
Web build and bundle budgets, focused persona/Skill/Team contract tests, and the
full `void-core` test suite. Desktop Team API and workspace checks are recorded
in the current customization specification. The known baseline debt below is
not reclassified as passing.

The 2026-08-02 Desktop visual and performance pass added authoritative
full-window capture metadata, keyboard/retry/error-state coverage for Welcome,
Skills, and Connectors, and measured scene-switch gates. Priority surfaces plus
Agent, Team, and the session composer were reviewed at the complete DWM window
boundary. Narrow store selectors, retained memoized scene slots, inactive-scene
refresh gating, and navigation-intent preload reduced measured hot-switch p95 to
62.0 ms, cold-switch p95 to 197.1 ms, and data-ready p95 to 513.7 ms without
resetting scene state or widening permissions. Exact evidence and commands are
recorded in [design-qa.md](design-qa.md).

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
- The BitFun-inspired capability branches were integrated by `6c3e651a3`;
  their plans, decisions, and results are completed evidence rather than active
  queues.
- The disposable aggressive-Minimal A/B/C prototype was removed on 2026-07-28
  after its accepted constraints were incorporated into the current Minimal
  workspace and Team Workspace specifications.
- `docs/obsidian/` is a tracked historical snapshot, not a live external source.
- Untracked prototypes are user-owned until explicitly accepted or discarded.
