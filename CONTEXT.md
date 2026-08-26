# Current collaboration context

What this is: the single current-truth summary of Void's product state,
architecture boundaries, and quality baseline. Read it first in any new session,
before touching code. Dated evidence and per-domain detail live under `docs/`;
this file never duplicates them.

Updated: 2026-08-22 (head `d0904e0ea`)

## Repository and references

- Work happens on `main`. On 2026-08-17 the owner promoted this line to
  `origin/main`; the previous remote main was an unrelated 2026-02..05 showcase
  history, preserved as `legacy/main-20260525`.
- Void is the product and implementation repository. BitFun is a capability/fix
  reference; DeepSeek Harness (a clone kept outside this repository) is a
  plugin-architecture reference. Neither replaces Void's product identity or its
  stable runtime contracts.

## Product state

### North star

A conversation-centered workspace. The main AI conversation stays in the centre;
the right Content Canvas is the stable collapsible host for typed plugin
surfaces (AI Short Drama, Workspace Media, Agent Studio, AI Customer Service, a
future Infinite Canvas). Scenario presets and installable bundles may compose
Agent, Team, Workflow, Skill, Tool, Provider, and Canvas contributions, but must
reuse the existing session, permission, workspace, Team, and tool runtimes.
Canvas owns presentation layout and references only; every domain still writes
through its own Module Interface. Active contract:
[docs/features/canvas-plugin-platform-prd.md](docs/features/canvas-plugin-platform-prd.md).

### Canvas plugin platform

- **P0-A / P0-B (landed).** A typed registry/service/workspace-facts layer opens
  first-party Canvas surfaces through a context-bound host adapter and renderer
  registry. `CanvasSurfaceCommandService` and
  `CanvasCapabilityContributionRegistry` are the typed opening/contribution
  seams; Session rail, Team restore, and the Short Drama composer action emit no
  business DOM events. Stable workspace identity is `WorkspaceInfo.id`; delivery
  idempotency is separate from surface instance identity. Team restore
  activation facts carry `scopeId`, semantic `revision`, and a unique
  `activationId`, so stale deliveries cannot regain mutation authority.
- **P1-A1 (landed).** The platform-neutral Agent revision core: user and
  local-project catalogs, opaque definition/draft/revision identities, exact
  compare-and-swap, bounded idempotency receipts, revision-bound validation
  evidence, separate publish/default commands, and atomic recovery. Legacy Agent
  source files import non-destructively and stay a compatibility authority; if
  the old source changes after import, catalog authoring fails closed instead of
  dual-writing.
- **P1-A2 (landed).** A read-only `agent-studio` Canvas contribution,
  `AgentDebugSessionBinding` (an isolated debug session pinned to one exact
  draft revision), and `AgentRevisionActivation` (publish a validated draft and
  apply exactly one action — continue, fork, or future-default — none of which
  rebinds the source conversation).
- Remote project authoring is explicitly unavailable. Workspace Media stays
  unavailable for remote workspaces until `remoteConnectionId` is carried
  through its real file IO Module Interface.
- **Infinite Canvas phase 1 (landed, owner-verified 2026-08-23).** The fourth
  first-party Canvas surface: an infinite node canvas (text/image nodes, edges,
  pan/zoom, per-workspace document with CAS-persisted truth in
  `shared/services/infinite-canvas/`, reactflow lazy-chunked out of the entry
  bundle), a read-only `style-preset` catalog of 317 kunpeng-derived presets
  (MIT, recorded in `THIRD-PARTY-NOTICES.md`), and typed phase-2 placeholders
  for the five image tools. Plan:
  [docs/plans/2026-08-22-infinite-canvas-plugin-phase1.md](docs/plans/2026-08-22-infinite-canvas-plugin-phase1.md);
  contracts:
  [docs/features/infinite-canvas-and-media-tools-prd.md](docs/features/infinite-canvas-and-media-tools-prd.md).
  Landing it surfaced and fixed real session-platform defects: capability-rail
  opens now bind to the session's own workspace (resolving and activating it
  when the shell has none), open failures toast their typed reason instead of
  dying silently, and session hydration no longer maps `workspaceHostname:
  localhost` into `remoteSshHost` (which had made every restored local session
  look like a disconnected SSH remote and fail-closed all canvas capabilities).
- **Infinite Canvas K2 + P3 (landed 2026-08-24, awaiting owner acceptance).**
  K2 wires the full image-creation loop through the existing media pipeline
  (no new providers or keys): blank-card text-to-image, edge-order reference
  images (`@图一/@图二`), the five image tools as derive-only operations, an
  `infinite_canvas` binding echoed by GenerateImage/GenerateVideo and attached
  on job completion, `InfiniteCanvasMediaBridge` backflow, and journal-based
  pending reconciliation. **The canvas buttons no longer route through the main
  conversation AI** (2026-08-24 owner decision, superseding the K2 §2 path-A
  choice): generate / regenerate / the five tools call the desktop command
  `submit_infinite_canvas_media_job` through `DirectImageGenerationGateway`,
  which reuses the GenerateImage/GenerateVideo submit orchestration and returns
  over `infinite-canvas://media-job-event`; the session path is retained only
  for the AI generating on the user's behalf. P3 adds agent-driven canvas
  (`CanvasRead`/`CanvasOp` Rust tools + `.ops.json` journal with an `appliedSeq`
  watermark, frontend `InfiniteCanvasOpsBridge` applying batches through the
  document service) and video cards over GenerateVideo. Known trade-off worth
  re-reading before touching previews: this app does **not** enable Tauri's
  `assetProtocol`, so `convertFileSrc` streaming URLs are refused by the webview
  — canvas cards must resolve media with `forceDataUrl: true` through
  `resolveWorkspaceMediaPreviewUrl` (the same lane as the Workspace Media
  gallery, images in its bounded thumbnail cache). "Optimising" that back to a
  streaming URL blanks every card. Capability gap versus the kunpeng reference
  product and the proposed phase-4 scope:
  [docs/features/infinite-canvas-capability-gap.md](docs/features/infinite-canvas-capability-gap.md).
  Plans:
  [K2](docs/plans/2026-08-23-infinite-canvas-k2-image-tools.md),
  [P3](docs/plans/2026-08-24-infinite-canvas-p3-agent-canvas.md). Two
  adversarial review passes fixed nine confirmed defects; the critical shared
  lesson, twice: collapsed tools invoke through the `CallDeferredTool` gateway,
  so any frontend filter on raw `toolName` drops their events — match on
  receipt shape instead (`EventHandlerModule` late-media pairing and
  `InfiniteCanvasOpsBridge`). Short-drama runtime behavior is untouched; the
  same gateway lesson likely applies to
  `useWorkspaceMediaToolRefreshBridge.ts` (flagged, not yet fixed).
- **Infinite Canvas P4 "workbench" (landed 2026-08-25, awaiting owner
  acceptance).** Twelve slices turning the canvas from "can generate" into
  "usable as a workbench", per
  [the P4 plan](docs/plans/2026-08-25-infinite-canvas-p4-workbench.md):
  full-screen viewer and save-a-copy; a generation parameter popover over a
  model capability table (model / aspect ratio / resolution / video duration —
  fields the backend already accepted but nothing surfaced) with the direct
  command extended to pass them; batch `n > 1` fanning one submission into
  sibling cards through `outputMediaItems`, with card and edge ids derived
  from `operationId` + item index so replays and reconciliation stay
  idempotent; in-memory undo/redo (capped at 50, cleared on close) scoped to
  user edits only — landed media, agent-applied batches, and in-flight
  generations are deliberately not undoable; multi-select, marquee, batch move,
  and a delete confirmation that keeps the never-delete-files rule explicit;
  copy/paste as reference copies (no second file on disk); and a task queue
  panel whose "stop waiting" wording states plainly that the job keeps running
  and the credits are still spent. Backend cancellation does not exist and was
  not built — `start_media_job_polling` has no handle or token, so real
  cancellation needs its own project. Alignment guides derive canvas→panel
  coordinates from the panel's own viewport ref rather than a
  `ReactFlowProvider`; W6/W7 reuse that trick, so the panel still has no
  provider.
- **Infinite Canvas visual language (reworked 2026-08-26, owner-driven).** The
  canvas was rebuilt against the owner's reference product, and the contract
  for how it looks and behaves is
  [docs/design/infinite-canvas-visual-language.md](docs/design/infinite-canvas-visual-language.md)
  — read it before touching this panel's presentation. The shape: cards are the
  media itself (no file name, no on-card controls, type label outside above);
  the prompt lives in a generator **anchored under the selected card**, never a
  global composer; a click selects (full screen is a double click or the pill
  toolbar); popovers are compact and anchored, dismissed by clicking outside or
  Esc through one shared `useInfiniteCanvasDismiss`; the model list and the
  parameter groups are separate popovers; the board follows the app theme in
  both directions. Two coordinate-space lessons are worth keeping, because both
  shipped as visible bugs: an ancestor of the canvas is transformed, so
  `position: fixed` resolves against the panel — popover maths must be
  converted into panel coordinates; and any surface placed from a measured card
  box must stay invisible until the measurement arrives, or it flickers from
  guess to truth. `WorkspaceMediaLibrary.thumbnailUrl` is `convertFileSrc`
  output and must never be used inside the canvas (see the assetProtocol note
  above). Owner acceptance of P4's manual checklist — including a real n>1
  spend — is still outstanding.

### AGENT hub and catalogs

- `app/scenes/agent-hub` is the only catalogue door. The `assistant` scene and
  its tab are gone; assistant configuration lives in the `profile` scene
  (`openScene('profile')` after `setSelectedAssistantWorkspaceId`). Agent, Team,
  Skill and Connector creation/editing pages are hosted full-page inside AGENT
  through the `hubPage` mechanism. MCP has one door and it is here, not
  Settings.
- `component-library/styles/agent-surface.scss` is the shared style system for
  the AGENT scene and every page it hosts: token-only mixins, zero cards,
  borders and shadows, one type scale, hairline separators only. Animated orb
  avatars were removed on 2026-08-22 (`orbAvatarEngine.ts` deleted); avatars are
  now static deterministic marks.
- `CreateAgentPage` fronts three fields (name, description, prompt) with one
  `高级设置` disclosure for everything else, plus a `试一试` debug panel beside
  the form.
- `TeamAuthoringPage` is a one-screen three-step flow — identity, roster, save —
  with inline one-sentence edge states. `TeamAuthoringService` semantics are
  unchanged: a name plus a one-line goal, then two to twelve user/project
  Agents, the first of which becomes lead. Only source-qualified raw Agent IDs
  are persisted, any project Agent forces project-scoped persistence, and
  incompatible rosters fail closed.
- The Skills catalog keeps authoring, import, suite visibility, and local/market
  install behind its existing services; the 45 standard user Skills discovered
  from the exact `user::home.codex::{dirName}` identity are localized in zh-CN,
  en-US, and zh-TW.
- Connectors open a dedicated view over the existing MCP infrastructure
  component, so JSON configuration, lifecycle, deletion, remote authentication
  and OAuth keep the established adapter, and Settings retains the original MCP
  presentation. The audited catalog is six fixed local-command templates
  (argument arrays, not shell snippets) plus the fixed Context7 endpoint — not
  an arbitrary remote connector store.
- Design contracts:
  [catalog and sidebar](docs/design/catalog-and-sidebar-design-system.md) for the
  directory language and Minimal sidebar;
  [quiet directory](docs/design/quiet-directory-design-system.md) for the
  Automation chrome and list view only (its catalog sections were superseded on
  2026-08-18; the Automation calendar grid and scheduling logic are unchanged).

### Persona binding

- Code, Cowork, and Media are **scenario workspaces**, not personas. A parent
  conversation separately owns one **active persona**: its scenario default, a
  selected single Agent, or a selected team lead.
- The composer persona picker is one click-to-open popover with search on top
  and two flat text sections (智能体 / 团队). Before the first send the selection
  shows as a pure-text capsule; after the first send the composer returns to
  empty and the identity appears as a quiet label in the chat header. Persona
  selection is editable only while composing an unpersisted new-session draft;
  the first send freezes the binding as the conversation's identity, and using
  another Agent or Team requires a new conversation.
- Scenario, execution policy, workspace, permissions, Canvas, and top-level
  history remain separate from this binding. A running Team instance/run also
  freezes its semantic Team definition revision; the current trusted-fixed-Team
  in-place revision path is migration debt and must not be generalized. Active
  contract:
  [docs/features/customization-center-prd.md](docs/features/customization-center-prd.md).

### Team Workspace

- Bound Teams use one desktop presentation path: a second system window
  (resizable, not always-on-top, taskbar-visible), opened from the Team capsule
  in the session capability rail. The two windows open as one paired layout —
  centred and inset, main window left two thirds, Team window right third, edges
  aligned; a display too narrow to split keeps the previous maximized startup.
  The Team window has no native title bar and draws the same top bar as the main
  window. The in-app floating Team panel was removed. It reuses the compact-chat
  multi-window pipeline (Tauri window, `?voidWindow=team-workspace` route, event
  bridge); the compact chat entry in the titlebar overflow menu is a protected
  capability and is unchanged.
- It is a host, not a mirror: the main window publishes only the typed Team
  binding identity, and the window resolves the projection through the same
  typed reader while member transcripts stay on the existing `/btw`
  child-session interface. Equivalent binding snapshots are not republished, so
  typing or streaming in either window cannot remount or flash the other. Only
  the first read for a new binding may show a loading state.
- The map is quiet: static deterministic member marks (never human portraits),
  hairline wires from a lead spine, four display states — not started / in
  progress / done / error — and zero surface animation. Delegated workers
  collapse behind a per-card expander. It supports bounded pan/zoom and explicit
  selection, stays free of prose, and is a presentation over the same typed Team
  snapshot; team identity and run status remain available to assistive
  technology.
- The window switches in place between the map and the selected member
  conversation; that chrome is one slim strip with back-to-map and a member
  switcher. Closing the window — including a native close — collapses the
  presentation only and must never delete or cancel child sessions or stop the
  Team. The Canvas control and the Team presentation are independent.
- The workspace is reserved for durable Team members. Ordinary Task and `/btw`
  temporary child conversations keep their existing compatibility presentation.
  The Team lead is the active persona in the left parent conversation and is
  never repeated as a right-side child. Every specialist is selectable before
  its first dispatch, showing an explicit not-started conversation. Active
  contract:
  [docs/features/team-workspace-prd.md](docs/features/team-workspace-prd.md).

### Team runtime

- Compatible reusable `prompt_orchestrated` Teams create durable
  `TeamInstance`s, activate their lead as the parent persona through a trusted
  `Team` tool, and expose typed start/observe/recover/message/stop paths.
- Orchestration authority stays on the parent lead while members delegate
  through the shared Task runtime. Every non-lead member has an explicit
  `disabled` or `bounded` delegation policy (default: eight workers, at most
  three in parallel); a member may create only one worker level, and those
  workers deny both `Task` and `Team`. Durable launch authority records the
  exact Team, run, member run, parents, depth, and budget, so recovery never
  widens an older launch. Reconciliation closes cancelled runs, releases the
  active-run lock, and dispatches dependency-ready successor phases; a
  successful `Team start` reports only the specialists dispatched at that
  moment.
- Member and worker permissions are intersections of the scenario, workspace,
  user, Agent, Skill, and Team policies. Each durable member request carries a
  concise positive workflow-phase assignment rather than a lead-style command;
  typed runtime restrictions, not prompt obedience, enforce the boundary.
- Reusable-Team policy is deliberately narrow and fails closed. Definitions
  asking for specialist tool narrowing, specialist readonly behaviour, a
  readonly lead, or a lead tool set without `Task` stay visible but resolve as
  `definition_only`. Typed pause/resume exists across Core, the trusted Team
  tool, Desktop commands, and the Web runtime gateway; Team Workspace
  pause/resume controls and browser/server runtime parity are deferred. Exact
  policy-intersection rules live in the Team Workspace PRD.
- Deep Review remains an adapter over its dedicated fixed runtime. AI Short
  Drama ships as a trusted, read-only `prompt_orchestrated` Team definition: its
  lead uses the shared durable Team runtime and its five member sessions remain
  `ScriptAI`, `AssetAI`, `SplitAI`, `VideoAI`, `EditorAI`, whose fixed policies,
  `ShortDramaProject` tools, media routing, project state, and dedicated Canvas
  it still owns. Team-bound short-drama sessions do not run the legacy
  five-session bootstrap; the retired stage-agent Canvas composer is never
  reopened. After creation the Short Drama Team chip is a locked room-identity
  badge.

### Platform rules

- Void's plugin contract is **stable core + open capability layer**. The
  configuration plane hot-edits, but a started session/Team execution is
  revision-frozen: only layout, theme, tab, surface-display, and
  presentation-metadata changes apply hot. Agent prompt/Skills/tools/model
  policy and Team/workflow semantics require a published revision and a new
  session/run; permission expansion requires confirmation; permission
  revocation, emergency stop, and quarantine apply immediately. Session logs,
  agent loop, lineage, recovery, checkpoints, plugin isolation, and domain write
  boundaries are not runtime-replaceable plugins.
- An **execution policy** controls how the active persona may act; a **Skill**
  is reusable operating guidance. Neither is a synonym for scenario or persona.
- The session owns one stable Canvas toggle and one Team Workspace control. Team
  binding opens the right workspace by default; a persisted Short Drama binding
  restores its Canvas content in the background while the Canvas stays
  collapsed. Canvas tabs and restored content never expand the right pane. Both
  controls are presentation-only.
- The `minimal` workspace is the clean-profile default; `classic` remains the
  rollback presentation.
- Runtime, persistence, Skill policy, media tool routing, session history, and
  desktop host behaviour stay outside presentation-only changes.

### Visual direction

- The selected direction is **Porcelain Air / 瓷白轻盈工作台**: warm, open,
  quiet, generous whitespace, soft edges, colour only from existing theme
  tokens. Enterprise-admin, finance-console, dense-IDE, and gray-card-wall
  results fail visual acceptance even when functional checks pass. The
  owner-approved promotional workspace image is the visual reference; an
  OpenWork checkout was evaluated on 2026-08-09 and rejected as a product-level
  UI reference, and its name must not appear in implementation or test
  terminology.
- Presentation work is governed by
  [docs/features/interaction-theme-governance.md](docs/features/interaction-theme-governance.md)
  (interaction states, theme tokens, responsive layout, accessibility,
  full-window evidence, performance) — it authorizes no runtime or domain
  change.
- Flow Chat activity presentation mounts the 19 Beautiful UI source components
  accepted on 2026-08-14; Flow Chat adds no second typewriter, loader,
  completion ring, auto-collapse, or hidden-group animation, and existing model
  summaries plus typed tool events remain the only content source.
- **Flow Chat scroll stability is a hard contract:**
  [src/web-ui/src/flow_chat/components/modern/FLOWCHAT_SCROLL_STABILITY.md](src/web-ui/src/flow_chat/components/modern/FLOWCHAT_SCROLL_STABILITY.md),
  current through section G. Every transcript height mutator must announce
  height changes through the collapse-intent contract via
  `notifyToolCardHeightChanged`. Read it before changing the message list, tool
  cards, or scroll anchoring.

## Architecture map

The main dependency direction is:

```text
UI / route -> Module Interface -> Adapter / service -> external system
```

- **Module:** Flow Chat owns chat state and conversation behavior.
  **Interface:** typed Flow Chat services, selectors, and view state.
- **Module:** Content Canvas owns tabs and layout state.
  **Interface:** `CanvasSurfaceRegistry`, `CanvasSurfaceService`, typed workspace
  facts and `CanvasHostPort`; the Zustand-backed host adapter alone translates
  those requests into canvas store actions. Surface runtime and renderers load
  behind the right-pane boundary; SessionScene keeps the central conversation
  independent and queues typed capability/restore intent until AuxPane reports
  ready.
- **Module:** Team Workspace owns reusable team definitions, session-bound team
  instances, workflow/member projections, and coordination presentation state.
  **Interface:** team catalog, orchestration, and workspace projection
  contracts; adapters alone may access persistence or the subagent runtime.
- **Module:** Customization Center owns localized Agent, Team, Skill, and
  connector discovery plus parent-conversation persona selection.
  **Interface:** capability catalog and persona activation contracts; adapters
  alone may compose runtime prompts, resolve permissions, or activate Agents.
  Agent and Team market details dispatch through a typed application service: it
  opens a compatible unpersisted new-session draft with a removable target
  capsule and leaves workspace choice and task text to the user. The first send
  creates the parent, awaits canonical Agent or reusable Team-lead activation,
  freezes the persona snapshot, and only then sends. Failed activation removes
  the empty parent and leaves the draft retryable.
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

Verified on 2026-08-22 at `d0904e0ea`:

- the full parallel Web suite is 100% green: **476 files / 2963 tests**;
- `pnpm run type-check:web`, `pnpm run build:web`, and `pnpm run lint:web` all
  pass with zero errors;
- Web test files are inside the ESLint gate; core boundaries, repository
  hygiene, i18n contract (15/15) and i18n audit pass;
- `cargo check --workspace`, `cargo test --locked -p void-core`, and
  `cargo fmt --check` pass on the `src/crates/<layer>/<crate>` layout;
- the Flow Chat Beautiful UI production binding and the 2026-08-14 full-window
  visual review remain the accepted presentation baseline.

Open baseline debt:

- the E2E project has 127 strict TypeScript errors (measured 2026-08-17) and CI
  does not type check it;
- Clippy reports 326 warnings / 0 errors workspace-wide and is not enforced in
  CI;
- test files are inside Web UI ESLint but still excluded from TypeScript project
  checks;
- `ChatInput` remains a high-coupling orchestration hotspot;
- Browser UI still contains registered direct-Tauri lifecycle exceptions;
- Workspace Media remote IO is intentionally fail-closed: its Canvas identity
  carries the typed remote route, but the real Media file adapter is still
  path-only and must not be described as remote-safe;
- legacy non-Team short-drama stage-agent binding persistence and bounded retry
  still have a confirmed async state gap;
- the Agent draft debug chat validates transport and lifecycle through automated
  tests and Desktop wiring; a provider-backed manual response still depends on
  the owner's configured model/provider;
- final release evidence still needs one broad full-window pass over Welcome,
  ordinary sessions, all AGENT tabs, Team authoring, Team member conversations,
  and protected Code/Cowork/Media flows after a clean restart.

Exact historical commands and checkpoint evidence belong in
[the repository stability audit](docs/qa/repository-stability-audit-2026-07-28.md),
[design QA](design-qa.md), and the active feature specifications — not here.

## Documentation policy

- [docs/README.md](docs/README.md) is the documentation index. A document is
  current only if that index links it; unlinked documents are deletable by
  default.
- Current specifications define active Interfaces and gates. Dated audits and
  results record checkpoint evidence and must not claim permanent authority.
- One fact, one home. Do not restate a specification here; link it.
- The 2026-07 upstream migration consensus files
  ([ledger archive](docs/ledger-archive.md),
  [migration PRD](docs/PRD.md), [migration decisions](docs/DECISIONS.md)) are a
  frozen historical program ledger and are retained deliberately.
- Evidence documents are deleted once their unique contract has been merged into
  a current specification; record the deletion in `docs/README.md`, not in the
  deleted document.
- Untracked prototypes are owner-owned until explicitly accepted or discarded.
