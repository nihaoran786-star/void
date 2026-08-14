# Current collaboration context

Updated: 2026-08-13

## Product state

- Active customization integration branch: `codex/minimal-workspace-ui`.
- The Quiet Directory design system is the current entity-glyph and catalog
  language: Agent orbs (animated when selected/running), Skill sigils (static
  runes), and Connector link glyphs (route state: solid/broken/pulse/error)
  sit on hairline directory rows with mono chips, mono right-aligned meta,
  hover-collected operations, one quiet primary action, and underline search.
  It is applied to the Agents, Skills, and Connectors (installed + market)
  catalogs and to the Automation chrome/list view; the Automation calendar
  grid and scheduling logic are intentionally unchanged. The active contract
  is [docs/design/quiet-directory-design-system.md](docs/design/quiet-directory-design-system.md).
- The `minimal` workspace is the clean-profile default; `classic` remains the
  rollback presentation.
- Bound Teams use one floating presentation path: the Team Workspace is a
  bordered 9:16 portrait panel floating above the full-width scene at every
  desktop width. It reserves no column, drags by a thin hover grabber, and
  dims to 50% opacity on outside interaction instead of hiding. Team member
  conversations never become sibling Canvas tabs, and closing the presentation
  must not delete or cancel child sessions. The panel switches in place
  between the operations map and the selected member conversation; the member
  conversation chrome is one slim strip with a back-to-map action and a member
  switcher.
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
- Team creation now uses a minimal roster builder instead of exposing the full
  `TeamDefinition` schema. Users provide a Team name and one-line goal, then
  select two to twelve available user/project Agents like a game lineup. The
  first selection becomes lead, lead changes and removals rebuild canonical
  member/workflow references in `TeamAuthoringService`, and only source-qualified
  raw Agent IDs are persisted. Common room eligibility is derived from the
  selected Agents; incompatible rosters fail closed, and any project Agent
  forces project-scoped persistence. Catalog loading, empty, retry, and save
  failure states are explicit and never fall back to runtime modes.
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
- Prompt-orchestrated Team execution keeps Team orchestration authority on the
  parent lead while allowing bounded member delegation through the shared Task
  runtime. Every non-lead member has an explicit `disabled` or `bounded`
  delegation policy; new and legacy definitions resolve to a default of eight
  workers with at most three active in parallel unless the member is explicitly
  disabled. A member may create only one worker level, and those workers deny
  both `Task` and `Team`. Durable launch authority records the exact Team,
  Team run, member run, direct parent, root parent, depth, and budget facts, so
  recovery never widens an older launch. Member and worker permissions remain
  intersections of the scenario, workspace, user, Agent, Skill, and Team
  policies. Every durable member request still carries a concise positive
  workflow-phase assignment rather than copying a lead-style command or
  repeating natural-language authority warnings. The member Agent's own persona
  defines its professional identity; the phase assignment defines the current
  deliverable; typed runtime restrictions, not prompt obedience, enforce the
  delegation boundary.
  Reconciliation closes
  cancelled or interrupted runs, releases the active-run lock, and
  automatically dispatches dependency-ready successor phases. A successful
  `Team start` reports only the specialists dispatched at that moment; it must
  never be described as every member already running.
- Team Workspace refresh is presentation-stable. Only the first read for a new
  binding may replace the panel with a loading state. Polling, parent-turn
  updates, and equivalent snapshots keep the last usable projection mounted;
  semantically unchanged snapshots are no-ops, and typing or streaming in the
  left lead conversation must not remount or flash the selected member panel.
- The canonical Team Workspace now presents the durable Team as an operations
  map rather than a second member list. It supports bounded pan/zoom, semantic
  orbit sizing, constant-screen-size member nodes, explicit selection, and the
  existing member-conversation projection. This is a presentation over the
  same typed Team snapshot; it does not create another runtime, roster, or
  child-session path. The map is free of prose (no header bar, mission
  briefing, or zoom readout); team identity and run status remain available to
  assistive technology. The panel floats at every layout width.
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
  presentation. Configured Connectors and the curated market use the shared
  compact four-column desktop gallery and collapse responsively on narrower
  containers. A
  deliberately small audited catalog offers six fixed local-command templates
  plus the fixed Context7 remote endpoint. Templates use argument arrays rather
  than user-authored shell snippets; required runtime/path inputs are validated.
  Desktop installation validates the MCP config, performs transactional
  initialize/verification, and rolls configuration back on failure. The true
  empty state still explains local-command and remote-URL paths and preserves
  the JSON add action. Connector loading and installation failures are explicit
  and retryable. This is not an online or arbitrary remote connector store.
- Agent authoring now includes a live draft debug chat beside the configuration
  form. A typed runtime service installs a temporary user Agent, creates a
  persona-bound temporary session, sends through the existing Flow Chat path,
  and disposes or sweeps orphaned debug artifacts. Draft replacement is
  fail-closed: the composer is available only when the current fingerprint and
  temporary session are ready, so a stale persona cannot receive the next
  message. Replacement notices clear after the first successful send. This is
  a real Agent conversation path, not a local prompt preview; per-Agent model
  override and Agent-level Skill/MCP selection remain outside the current
  contract.
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

The next presentation phase is governed by
[docs/features/interaction-theme-governance.md](docs/features/interaction-theme-governance.md).
It covers interaction consistency, theme tokens, responsive layout,
accessibility, full-window evidence, and presentation performance without
authorizing runtime or domain changes.

The selected visual direction is **Porcelain Air / 瓷白轻盈工作台**. The
reference image is authoritative for warmth, openness, hierarchy, whitespace,
edge softness, and interaction quietness. The current navigation/chat slice
keeps the existing token architecture but may correct the concrete light-theme
semantic values it owns; preserving a cold or severe existing value is not a
design goal. Enterprise-admin, finance-console, dense-IDE, and gray-card-wall
results fail visual acceptance even when functional checks pass.

For Flow Chat activity presentation, the user accepted all 19 source components
from Beautiful UI as the production visual baseline on 2026-08-14. Production
bindings map the existing transcript, composer, navigation, tool, approval,
task, table, loading, and thinking surfaces to those source patterns. Loading,
task status, and thinking mount the source components directly; Flow Chat no
longer adds a second typewriter, loader, completion ring, auto-collapse, or
hidden-group animation around them. Existing model summaries and typed tool
events remain the only content source. Permissions, Team runtime, session
lifecycle, routing, persistence, and the tool-card registry remain unchanged.

The user-approved promotional workspace image, not OpenWork's live application
or source code, is the visual reference for density, whitespace, translucent
navigation, and quiet interaction. An OpenWork checkout was evaluated on
2026-08-09 and rejected as a product-level UI reference; its historical name
must not drive new implementation or test terminology. The compact shell,
48 px collapsed navigation, bounded conversation measure, flat transcript,
compact tool rows, composer, customization markets, Content Canvas, and Team
Workspace share the Porcelain Air language while retaining every existing
Module Interface.

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

Current verified baseline on 2026-08-14:

- the default parallel Web suite passes 536/536 files and 3117/3117 tests with
  zero unhandled errors;
- the Flow Chat Beautiful UI production binding, standalone 19-case/26-mode
  preview, responsive widths, pause/replay, keyboard behavior, and reduced
  motion pass the final interaction and full-window visual review;
- Desktop Rust tests pass 197 tests with one explicit manual smoke ignored;
- Web type checking, theme contracts, core boundaries, repository hygiene,
  production build, Monaco assets, and performance budgets pass;
- the 1690×900 physical DWM evidence uses Per-Monitor-V2 awareness at 144 DPI
  and covers the complete window boundary;
- measured scene switching remains within the current performance budgets.

Exact historical commands and checkpoint evidence belong in
[the repository stability audit](docs/qa/repository-stability-audit-2026-07-28.md),
[design QA](design-qa.md), and the active feature specifications, not in this
collaboration summary.

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
- Agent draft debug chat currently validates the real transport and lifecycle
  through automated tests and Desktop runtime wiring. A provider-backed manual
  response still depends on the user's configured model/provider and should be
  included in the next full-window Desktop acceptance pass.
- final release evidence still needs one broad full-window pass over Welcome,
  ordinary sessions, all customization tabs, Team authoring, Team member
  conversations, and protected Code/Cowork/Media flows after a clean restart.

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
