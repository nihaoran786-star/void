# Current collaboration context

Updated: 2026-08-06

## Product state

- Active customization integration branch: `codex/minimal-workspace-ui`.
- The `minimal` workspace is the clean-profile default; `classic` remains the
  rollback presentation.
- Bound Teams use one presentation path: wide desktop renders
  `main conversation | working Canvas | Team Workspace`; medium layouts use a
  bounded right overlay. Team member conversations never become sibling Canvas
  tabs, and closing the presentation must not delete or cancel child sessions.
  Restored Canvas widths shrink within the three-column contract rather than
  pushing the Team Workspace outside the physical desktop window.
- The right Team Workspace is reserved for durable Team members. Ordinary Task
  and `/btw` temporary child conversations keep their existing compatibility
  presentation and are not promoted into the formal Team member surface.
  The Team lead remains the active persona in the left parent conversation and
  is never repeated as a right-side child. Every specialist is selectable from
  the roster before its first runtime dispatch; an explicit not-started
  conversation is shown until the durable child session exists.
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
  Persona selection is editable only while composing an unpersisted new-session
  draft. The first send freezes that binding as the identity of the created
  conversation; its capsule becomes read-only, and using another Agent or Team
  requires a new conversation. Scenario, execution policy, workspace,
  permissions, Canvas, and top-level history remain separate from this binding.
  A trusted fixed Team may still upgrade its own pinned revision in place; it
  cannot be replaced by a different persona. The active contract is
  [docs/features/customization-center-prd.md](docs/features/customization-center-prd.md).
- The Desktop/Tauri customization slice now provides one localized
  Agent/Team/Skill catalog, per-parent Agent or Team-lead selection in the
  composer, Agent and Skill authoring, and validated user/project Team
  definition create/edit/install/delete flows. Compatible reusable
  `prompt_orchestrated` Teams create durable `TeamInstance`s, activate their
  lead as the parent persona through a trusted `Team` tool, expose typed
  start/observe/recover/message/stop paths, and project live Team Workspace
  state plus BTW member conversations.
- Reusable-Team policy remains deliberately narrow. A lead Skill allowlist can
  only intersect the scenario/workspace/user effective Skill set, and an
  explicit lead tool policy is supported only when it retains `Task`.
  Team members now persist a typed `no_policy` or `restricted` Skill policy
  bound to the pinned definition/revision, instance, member, and Agent. Skill
  listing and direct invocation enforce the same effective intersection, while
  dynamic cache identity includes the policy hash and effective Skill
  key/revision set. Team-tagged recovery performs Team-side preflight before
  generic child recovery; eligible legacy empty-policy records migrate to an
  explicit `no_policy` marker through compare-and-swap. The Web composer now
  admits otherwise-compatible ordinary Teams with member Skill allowlists.
  Definitions requesting specialist tool narrowing, specialist readonly
  behavior, a readonly lead, or an explicit lead tool set without `Task`
  remain visible but fail closed as `definition_only`. Typed Team pause/resume
  is implemented across the Core runtime, trusted Team tool, Desktop commands,
  and Web runtime gateway; direct Team Workspace pause/resume controls,
  browser/server runtime and persistence parity, and future flagship-adapter
  expansion remain deferred.
- Deep Review remains an adapter over its dedicated fixed runtime. AI Short
  Drama now ships as a trusted, read-only `prompt_orchestrated` Team definition:
  its lead uses the shared durable Team runtime and its five member sessions
  remain the existing `ScriptAI`, `AssetAI`, `SplitAI`, `VideoAI`, and
  `EditorAI` personas. Their fixed policies, `ShortDramaProject` tools, media
  routing, project state, and dedicated Canvas remain owned by Short Drama.
  Team-bound short-drama sessions do not run the legacy five-session bootstrap.
  The retired stage-agent Canvas composer is never reopened. After creation the
  AI Short Drama Team chip is a locked room-identity badge, so the Team cannot
  be detached from that conversation. The Canvas remains artifact-only and
  member chat uses the canonical right Team Workspace. Existing child sessions
  and project data are preserved during this presentation cleanup.
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
  detail behavior behind its existing services, while presenting twenty cards
  per page in a compact four/two/one-column responsive grid with 36 px
  icon-forward cards, two-line purpose copy, and lightweight management
  actions. The 45 standard user
  Skills discovered from the exact `user::home.codex::{dirName}` identity have
  localized names and purpose copy in Simplified Chinese, English, and
  Traditional Chinese; project Skills, other sources, custom display names,
  raw runtime keys, and marketplace install identity remain unchanged.
  Connectors opens a
  dedicated scene instead of redirecting into Settings; that scene selects a
  catalog presentation on the existing MCP infrastructure component, so JSON
  configuration, lifecycle controls, deletion, remote authentication and OAuth
  still use the established adapter. Settings retains the original MCP
  presentation. Configured Connectors use a two-column desktop gallery of
  wide horizontal cards and collapse to one column on narrow containers. A
  deliberately small audited catalog offers six fixed local-command templates
  plus the fixed Context7 remote endpoint. Templates use argument arrays rather
  than user-authored shell snippets; required runtime/path inputs are validated.
  Desktop installation validates the MCP config, performs transactional
  initialize/verification, and rolls configuration back on failure. The true
  empty state still explains local-command and remote-URL paths and preserves
  the JSON add action. Connector loading and installation failures are explicit
  and retryable. This is not an online or arbitrary remote connector store.
- An **execution policy** controls how the active persona may act; a **Skill**
  is reusable operating guidance. Neither term is a synonym for scenario or
  persona.
- The session owns one stable Canvas toggle and one Team Workspace control.
  Team binding opens the right workspace by default; a persisted AI Short Drama
  binding also restores the short-drama Canvas automatically. Both controls are
  presentation-only and never cancel a run, delete a child, or clear Canvas
  state.
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
  Agent and Team market details dispatch through a typed application service:
  it opens a compatible unpersisted new-session draft with a removable target
  capsule and leaves workspace choice and task text to the user. The first send
  creates the parent, awaits canonical Agent or reusable Team-lead activation,
  freezes the persona snapshot, and only then sends. The created session shows
  the same capsule as a non-removable identity badge; selecting a different
  Agent or Team is rejected and requires a new-session draft. Failed activation
  removes the empty parent and leaves the draft retryable. Fixed Deep Review
  continues
  to delegate to its dedicated Code flow; AI Short Drama binds its trusted Team
  lead and restores the dedicated Media Canvas from the durable session facts.
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
- legacy non-Team short-drama stage-agent binding persistence and bounded retry
  still have a confirmed async state gap; Team-bound short-drama sessions no
  longer use that bootstrap path.

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
