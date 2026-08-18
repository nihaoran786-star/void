# Team Workspace Product And Architecture Specification

Status: reusable Team definition management, prompt-orchestrated Team-lead
activation, typed Team-member Skill authority, and the unified right-side Team
Workspace are implemented for Desktop/Tauri. AI Short Drama uses a trusted
built-in definition over the shared Team runtime while retaining its dedicated
project tools and Canvas. Deep Review remains adapter-owned, and specialist
tool/readonly expansion remains staged.

Updated: 2026-08-09

## Product decision

Void treats a **team** as a durable, user-manageable collaboration capability,
not as a decorative group of subagent cards and not as another Canvas tab.

A team is:

```text
team lead + specialist members + workflow definitions + collaboration policy
```

The team lead coordinates work, specialist members produce role-owned results,
and workflows describe the allowed serial and parallel phases. A running team
uses existing child sessions and subagent runtime contracts; the Team Workspace
adds a reusable definition, typed projection, and presentation container around
those contracts.

Professional identity, current assignment, and execution authority are three
separate layers. A member Agent's own persona/role instructions define what kind
of specialist it is. A Team launch adds only the current member, workflow phase,
acceptance rule, Team objective, and lead handoff target as a concise positive
assignment. It must not repeatedly inject natural-language warnings as a
substitute for authorization. Whether the child may invoke `Task`, `Team`, or
another privileged tool is enforced by typed runtime restrictions and the
effective scenario/workspace/user permission intersection. Team members always
fail closed for `Team`. Their `Task` authority is defined by an explicit member
delegation policy and durable launch snapshot rather than prompt wording. A
bounded member can create one level of temporary workers; workers fail closed
for both `Task` and `Team`. A disabled member and every legacy in-flight launch
keep the previous no-delegation behavior.

When a user selects a team in a compatible scenario, the team lead becomes the
parent conversation's active persona. The scenario workspace, execution policy,
permissions, Canvas, workspace context, and top-level history remain stable.
Specialist members run as isolated child conversations and return role-owned
results to the lead. This activation contract is defined by
[Customization Center and active persona](customization-center-prd.md).

The primary desktop composition puts the Team in its own system window:

```text
main window : main conversation | working canvas   (full-width scene)
Team window : operations map / member conversation (second OS window)
```

Canvas shows artifacts and tools. The Team window shows participants,
progress, handoffs, and member conversations. Users must be able to inspect
both at the same time: the main window's scene is never overlapped, and a
second-display user can move the Team window to the other screen. Opening,
moving, and closing the Team window is presentation-only.

The right workspace uses stale-while-revalidate presentation semantics. A new
Team binding may show an initial loading state, but background polling,
parent-turn lifecycle changes, and manual refresh retain the last usable
snapshot until a materially different projection is ready. Equivalent
snapshots must not be republished. Composer typing and lead streaming are not
Team Workspace identity changes and must not remount, blank, or flash the
selected member conversation.

## Why this is a separate product concept

`/btw` is one child conversation. A team is an organized collection of roles,
child sessions, workflow phases, and shared goals. Treating a team as a sibling
Canvas tab would force users to switch away from the artifact being produced
and would collapse two different concepts into one navigation level.

Examples of future reusable teams include:

- review team;
- finance research team;
- short-drama production team;
- customer-service operations team;
- software delivery team.

### Scenario eligibility

Team definitions declare explicit conversation-scenario eligibility rather
than relying on labels:

- Code owns software-development teams such as frontend, backend, review, and
  delivery;
- Cowork/Office owns finance, reporting, spreadsheet, and other office-work
  teams;
- Media owns image, video, short-drama, and creator-production teams.

The catalog stores and validates this eligibility. Fixed Deep Review exposes
only Code. The trusted AI Short Drama definition exposes only Media and
activates its lead through the same durable `prompt_orchestrated` contract as a
compatible reusable Team. Incompatible definitions remain visible and fail
closed.

The primary Team authoring flow is a roster builder: the user names the Team,
writes one concise goal, and selects existing user/project Agents. The first
selected Agent becomes lead, and the user may switch the lead before saving.
Advanced workflow editing and bounded package installation remain separate
management paths. Every path still produces the same validated
`TeamDefinition`.

## Domain model

### Team definition

`TeamDefinition` is a reusable template independent of any one chat session.
It owns:

- stable `teamDefinitionId`;
- display name, description, emblem, accent, category, and capability tags;
- `leadMemberId`;
- a `members` collection that includes the lead exactly once;
- workflow definitions;
- collaboration and permission policies;
- referenced Skills, tools, and optional knowledge sources;
- schema version, origin, revision, and validation status.

The lead is referenced explicitly by `leadMemberId`. Void must not introduce
two arrays whose inclusion rules differ implicitly. Derived projections such
as “specialist members excluding the lead” are computed by the owning Module,
not persisted as a second source of truth.

### Team member definition

`TeamMemberDefinition` describes one role:

- stable `memberId`;
- display name and professional role;
- role instructions and output responsibility;
- referenced Agent profile;
- allowed Skills and tools;
- model and permission policy references;
- optional avatar or emblem treatment.

Member definitions do not contain runtime child-session IDs.

### Team workflow definition

`TeamWorkflowDefinition` describes a common job-to-be-done. It contains
explicit phases, dependencies, assigned member IDs, entry conditions, expected
outputs, and completion rules.

A phase may be:

- `serial`: waits for declared dependencies;
- `parallel`: starts independent member work together;
- `decision`: requires the lead or user to choose the next branch;
- `review`: requires structured acceptance, revision, or rejection.

The workflow is a validated graph. Presentation code must not infer ordering
from array position, status strings, or transcript text.

### Team instance

`TeamInstance` binds one definition revision to a workspace and a parent
session. It owns:

- `teamInstanceId`;
- `teamDefinitionId` and revision;
- `workspaceId` and canonical workspace context;
- `parentSessionId`;
- an explicit lead runtime binding whose kind is `parent_persona` or a
  compatibility `child_orchestrator`;
- specialist member child-session bindings;
- active workflow and phase facts;
- explicit lifecycle status and error facts;
- creation source and timestamps.

A team instance may survive UI collapse, tab changes, application restart, and
history hydration. Closing its presentation must never delete or cancel it.

### Team run and member run

Execution state is explicit:

- team run: `queued | running | waiting_user | blocked | completed | failed |
  interrupted | cancelled`;
- member run: `idle | queued | running | waiting | completed | failed |
  interrupted | cancelled`;
- workflow phase: `pending | ready | running | blocked | completed | failed |
  skipped`.

Every failure projection carries typed `source`, `error`, `retryable`, and
recovery-action facts. UI must not derive these states from empty child lists,
missing messages, color, or prose.

## Collaboration policy

The safe default is `lead_mediated`:

1. the lead is activated as the parent conversation's active persona and
   creates or activates the team instance;
2. the lead starts members according to the selected workflow;
3. members own their specialist output;
4. member results return through the lead;
5. the lead coordinates, resolves dependencies, and produces the synthesis;
6. the lead does not silently impersonate a member whose required result is
   missing.

Future teams may use another validated routing policy, but direct member
communication must be explicit in the definition rather than an accidental
runtime behavior. The UI displays the selected policy; it does not enforce or
simulate it.

## Product surfaces

### Team Center

Team Center is the global management surface for reusable definitions. It will
replace the current assumption that every custom Agent is a single role.
Its discovery, localization, and creation entry live in the unified
Customization Center rather than a separate top-level product silo.

It supports:

- create a single expert or a team;
- build a Team by selecting two to twelve existing, currently available custom
  Agents; runtime modes are not silently substituted when the Agent catalog is
  empty or unavailable;
- make the first selection the default lead, switch the lead explicitly, and
  prevent duplicate Agent references;
- store source-qualified Agent IDs while showing localized names and stable
  avatars;
- derive the common conversation-scenario eligibility of the selected Agents;
  a roster with no common room fails closed;
- force project scope when any selected Agent is project-scoped so a user-level
  Team cannot retain a dangling project Agent reference;
- generate the default specialist-execution and lead-review workflow through
  the Team authoring service rather than in the page component;
- arrange serial, parallel, decision, and review phases;
- assign Skills, tools, model policy, and permissions per role;
- validate, version, duplicate, archive, export, and later install teams;
- preview the team structure before attaching it to a session.

Team Center is definition management. It must not become the live run monitor.

### Session capability rail

The compact session capability rail is the primary reopen entry for live
teams. It also remains the reopen entry for persistent session capabilities
such as Media and AI Short Drama.

Team entry rules:

- a session with no attached or previously used team reserves no permanent
  team width;
- attaching or invoking a team adds one small persistent team capsule;
- collapsed capsules show only a team emblem, member stack, and status dot;
- pointer hover or keyboard focus expands the capsule to reveal the team name
  and concise state;
- click opens or focuses the Team Workspace — on the desktop host that is the
  Team window — without replacing the current Canvas tab; the capsule is the
  only entry, and the window-titlebar overflow menu (preview-first chat window
  and main-session floating window) is a separate protected capability that
  this control never changes;
- the capsule's `aria-expanded` reflects whether the Team window is open, and
  a native window close writes that state back and returns focus to the
  capsule; it carries no `aria-controls`, because the presentation it opens is
  another window rather than an element in this document;
- secondary action may open a small menu to start a new conversation with
  another Team, hide this presentation, inspect the definition, or stop/cancel
  when the runtime explicitly permits it; it never unbinds or replaces the
  Team identity of the current parent conversation;
- hiding the Canvas keeps a one-click reopen control at the scene edge;
- presentation state is restored per parent session.

The rail is a launcher and status projection. It does not own team lifecycle,
session binding, retry, or cancellation rules.

### Team Workspace

Team Workspace is a dedicated coordination container. It is not an ordinary
Canvas tab, and on the desktop host it is not inside the main window at all.

The desktop presentation is a second system window:

```text
main window : main conversation | active Canvas surface  (left 2/3)
Team window : operations map / member conversation       (right 1/3)
```

The Team window reuses the existing multi-window desktop pipeline — the same
Tauri window creation, `?voidWindow=` route, and event bridge as the compact
chat floating window — so no new runtime or data channel exists. It is
resizable, is not always-on-top, and appears in the taskbar. Its position is
remembered and clamped back onto a visible display when the screen layout
changes.

The two windows open as one **paired layout**: the pair is centred and inset
from the screen edges, the main window takes the left two thirds and the Team
window the right third, and both share the same top and bottom edges and the
same outer margin. The Team window derives its frame from the main window's
actual frame, so the pair stays symmetric wherever the main window is. A
display too narrow to split keeps the previous maximized main window instead.
Once the user moves or resizes either window, that geometry is kept for the
rest of the run.

The Team window has no native system title bar. It draws the same top bar as
the main window — same height, same window controls, same quietness — so the
pair reads as one application. Its close control routes through the same native
close path the desktop host already intercepts, so closing stays
presentation-only.

The window is a presentation host, not a mirror. The main window publishes only
the typed Team binding identity; the Team window resolves the projection itself
through the same `TeamWorkspaceProjection` reader, and member transcripts still
come from the existing `/btw` child-session interface. Equivalent binding
snapshots are not republished, so composer typing and lead streaming in the main
window cannot remount or flash the Team window, and input in either window does
not disturb the other.

The window has two in-place views:

1. an operations map — a 36px top bar (member count with an accent live
   marker), the lead as one solid dot anchoring a spine on the left, each
   specialist as one member card joined to that spine by a right-angle
   hairline, and a hairline phase progress line. A member card carries a
   status-coloured corner badge, the member's Agent orb, its name, its
   professional role and its output responsibility. Delegated workers are
   collapsed behind an explicit per-card expander and open as rows inside their
   own member's card, so a busy Team stays readable. Cards scale with the
   camera; the map stays free of prose, and team identity, run status, member
   status and delegation state remain available to assistive technology;
2. the selected member conversation behind a text-tab strip — a plain
   back-to-map arrow and member tabs whose active state is one 1px accent
   underline, sharing the 36px chrome-height contract with the Canvas topbar,
   and the same complete composer presentation contract as the main chat.

While any member or run is active the panel root carries `data-running`.

The lead is not a member-workspace entry: it is the active AI in the left
parent conversation. The right roster contains specialists and quality-gate
members only. Every roster member remains selectable before a runtime child
session exists. Selecting such a member opens its explicit not-started
conversation state; after the lead dispatches work and the durable child
session is bound, the same route upgrades in place to the real conversation.

This surface is exclusively the formal, durable Team-member workspace.
Ordinary Task launches and `/btw` temporary child conversations remain separate
compatibility features; they must not create a second Team-member UI or occupy
the right Team Workspace unless the durable Team projection proves the member
binding.

Selecting a member focuses that member's route inside the Team Workspace. If a
durable `/btw` child conversation exists it is restored there; otherwise the
route shows an explicit not-started state instead of disabling the member. It
does not replace the active Media, Short Drama, Terminal, Browser, or other
Canvas surface.

The Team window is sized and moved by the user like any other system window;
the main window's layout is unaffected at every width, because the Team
presentation no longer occupies or overlaps the scene.

### Member conversation

Once the durable child session exists, the selected member conversation reuses
the shared composer presentation and versioned composer DTO. It restores text,
file, image, media, Skill, permission, and session references through existing
Flow Chat interfaces. A pre-dispatch member route is presentation-only and does
not manufacture an unscoped ordinary session or bypass the lead-mediated Team
runtime.

It must not copy `ChatInput.tsx`, create another message Store, parse display
text to rebuild references, or change BTW parent-child lifecycle semantics.

## Visual language

Teams need a recognizable identity without turning the workspace into an avatar
dashboard.

- Use one compact team emblem as the primary identity.
- Show at most three overlapping member portraits in the collapsed entry, then
  a `+N` count.
- Use a thin status ring or a single semantic dot; avoid multiple competing
  badges.
- Keep the default capsule approximately icon-sized and expand only on hover,
  focus, or active use.
- Use the current Minimal presentation typography, neutral surfaces, thin
  dividers, and token-backed focus treatment.
- Give each team one restrained accent for recognition; status colors remain
  semantic and must not be replaced by team accent colors.
- Running state may use a subtle progress stroke or quiet pulse that respects
  reduced-motion settings. Avoid glow, glass, mascots, and decorative motion.
- The selected member receives one clear active treatment. Idle members remain
  visually quiet.

## Module ownership and dependency direction

```text
Team Center / capability rail / Team Workspace
  -> Team Module Interface
    -> team definition and orchestration services
      -> persistence and agent-runtime adapters
        -> filesystem / database / subagent runtime
```

Expected Interface families:

- `TeamCatalog`: list, validate, create, revise, duplicate, and archive team
  definitions;
- `TeamOrchestrator`: attach, start, observe, message, pause, resume, stop, and
  recover team instances through typed commands;
- `TeamWorkspaceProjection`: map definitions, instances, runs, members, and
  child sessions into explicit view state;
- `TeamPackageAdapter`: future import/export boundary;
- `TeamRuntimeAdapter`: the only bridge to existing subagent spawning,
  delivery, and recovery contracts.

Team selection and lead activation use the `PersonaActivation` boundary from
the Customization Center specification. Team presentation code must not compose
prompts or mutate the parent conversation's persona directly.

The exact names may change during implementation, but the ownership boundaries
must not.

## Isolation and persistence

All team runtime operations carry:

- `workspaceId`;
- canonical workspace context;
- `parentSessionId`;
- `teamDefinitionId`;
- `teamInstanceId`;
- `memberId`;
- `childSessionId` when a member session exists.

Definition persistence, runtime instance persistence, child-session history,
and presentation preferences are separate records. A UI width or selected
member ID must never be stored inside the team definition or agent runtime
state.

### Team member Skill authority contract

Specialist Skill policy extends the existing Team child-session path; it does
not create another Skill registry, subagent runtime, or persona snapshot. The
Team service resolves the exact definition revision already pinned by the
`TeamInstance`, finds the requested `memberId`, and creates one typed,
discriminated member Skill policy envelope. Every new Team-member launch writes
one of these explicit states:

- `no_policy`: the pinned member has an empty allowlist, so existing child-agent
  Skill behavior remains unchanged. This is a typed marker, not an absent field;
- `restricted`: the pinned member has a non-empty allowlist and the child must
  use only its intersection with the current effective Skill set.

Both states contain, at minimum:

- a policy schema version and source kind of `team_member`;
- `teamDefinitionId`, its pinned definition revision, `teamInstanceId`, and
  `memberId`;
- normalized `allowedSkillKeys` with whitespace removed, duplicates removed,
  and deterministic ordering (`no_policy` records an empty normalized set);
- a deterministic policy hash over the discriminator, version,
  definition/member identity, and normalized allowlist.

The typed authority may reuse `PersonaSkillFacts` for normalization and
filtering or use an equivalent child-session-specific value object. It must not
be encoded as arbitrary user-controlled string context, inferred from a prompt,
or represented by copying the parent Team-lead persona snapshot into the child.
Only the validated Team runtime adapter may attach it to a Team member launch.

The effective Skill rules are:

- an empty member allowlist writes `no_policy`, preserves the existing
  child-agent behavior, and applies no narrowing authority;
- a non-empty allowlist only computes
  `scenario/workspace/user effective Skills ∩ allowedSkillKeys`;
- member policy cannot install, enable, reveal, or otherwise restore a Skill
  that the scenario, workspace, user, permission system, or Skill catalog has
  disabled, hidden, removed, or rejected;
- Skill listing and direct invocation use the same resolved intersection. A
  direct request for a key absent from that intersection fails closed even when
  the model names it explicitly;
- an unavailable allowlisted key remains unavailable and produces an explicit
  diagnostic; it never widens the effective set through fallback behavior.

The policy envelope and hash are persisted as typed facts in the member's
durable subagent launch specification and covered by the same launch equality
check. Reusing a task ID with another definition revision, member, normalized
allowlist, discriminator, or policy hash is rejected. An absent policy field is
not the current representation of an empty allowlist. It may be accepted as
legacy `no_policy` only when both conditions hold: the persisted launch schema
predates this field, and the Team service/adapter has loaded the `TeamInstance`,
its pinned definition revision, and the exact member and proved that the pinned
member allowlist is empty. A new-schema record with a missing field, or any
record whose pinned member has a non-empty allowlist but whose policy is absent,
partial, malformed, or mismatched, fails closed and is never coerced to an empty
allowlist. An accepted legacy recovery should persist the explicit `no_policy`
marker before or atomically with resume so the ambiguity is not repeated.

Team recovery owns the cross-record validation boundary. Before a Team-tagged
launch may enter the coordinator's generic resume path, the Team service/adapter
loads the Team runtime record, resolves the `TeamInstance`'s pinned definition
and member, recomputes the expected policy envelope, and compares it with the
persisted launch. Only then may it pass a call-scoped typed authority or
validation ticket, bound to that task and policy identity, to the coordinator.
The coordinator validates only the launch's internal schema/hash/equality and
the supplied ticket's exact match; it must not read the Team store, resolve the
latest Team definition, or reconstruct Team policy. A Team-tagged launch without
successful Team-side preflight remains blocked/recoverable instead of being
silently resumed. Ordinary non-Team Task and `/btw` recovery omits this policy
and keeps the existing generic coordinator path.

Prompt-cache identity keeps the stable scenario/tool/permission prefix while
the dynamic member suffix includes the policy version/hash and every resolved
effective Skill key plus revision. Identical member policy and Skill revisions
may reuse that suffix. Changing the Team definition revision, member, allowlist,
or an effective Skill revision invalidates it, so two members cannot share a
persona/Skill cache entry accidentally.

Ordinary Task launches, ordinary `/btw` conversations, and Deep Review omit
this Team-member authority and retain their current behavior. AI Short Drama
uses the same Team-member authority as other durable Teams while its fixed
stage personas and project tools remain unchanged. The Team-only coordinator
path continues to inherit the complete parent
`SessionConfig`, including `workspaceId`, local/remote backend facts,
`remoteConnectionId`, and remote host identity; member Skill policy must never
reconstruct a workspace from `workspacePath` alone.

## Reference application lessons

The mature expert-manager model usefully demonstrates:

- one validated package shape for single experts and teams;
- lead plus specialist roles;
- explicit SOP phases with serial and parallel work;
- validation before registration;
- reusable, shareable definitions.

Void adopts those product principles, not its implementation details. Void
does not copy fixed WorkBuddy directories, Python registration scripts,
marketplace manifests, exact field-count restrictions, naming traps, or whole
files. Team definitions must be adapted to Void's Module Interfaces, workspace
isolation, permission system, Skill catalog, session persistence, and existing
subagent runtime.

The reference also clarifies that a selected team's lead is the user-facing
top-level persona while specialist members remain real subagents. Void adopts
that product contract. Deep Review may use its current child-orchestrator launch
shape during migration. AI Short Drama already uses a trusted reusable-Team
binding while retaining its dedicated stage personas and project runtime.
Presentation code must not depend on either compatibility detail.

## Non-goals for the first implementation slice

- no public team marketplace;
- no arbitrary downloaded scripts;
- no second agent runtime;
- no replacement of `/btw`;
- no direct UI filesystem or database access;
- no team business logic in `ChatInput.tsx`, `FlowChatStore.ts`,
  `ContentCanvas.tsx`, or `ShortDramaCenterPanel.tsx`;
- no team lifecycle inferred from transcript text;
- no automatic cancellation when the Team Workspace is closed, including a
  native close of the Team window: closing collapses the presentation only and
  never stops a Team run or deletes a member child session.

## Current implementation status

The Desktop/Tauri reusable-Team slice implements:

- one canonical `TeamDefinition` with stable Team, member, workflow, and phase
  IDs plus required member Agent IDs;
- typed list/get/create/update/install/delete Interfaces for user and project
  scope;
- optimistic revision checks, serialized writes, atomic replacement and
  recovery, bounded package reads, read-only installed definitions, and
  per-record diagnostics instead of clearing a catalog when one file is bad;
- Team Center cards, detail, minimal roster-based creation, advanced edit,
  package selection, installation, and deletion through Web Module Interfaces;
- a fixed Deep Review catalog adapter plus a trusted, read-only AI Short Drama
  definition that reuses the durable Team runtime, fixed stage personas, and
  dedicated short-drama project runtime;
- durable reusable Team instances, parent-persona lead activation, and a typed
  Team tool path that preserves the scenario, workspace, permissions, Canvas,
  and top-level history. The exact Team tool call is checkpointed after the
  provider stream closes but before side effects run; only the latest model
  round of the still-active dialog turn may receive that checkpoint, while
  older rounds and completed turns remain fail-closed;
- Team-lead tool narrowing and optional Skill-key narrowing. An empty lead
  Skill allowlist preserves the scenario/workspace/user effective Skill set;
  a non-empty allowlist can only intersect that set. Skill listing and direct
  invocation share the same fail-closed policy, and cache identity includes the
  normalized allowlist plus the resolved effective Skill revisions;
- typed Team-member `no_policy` and `restricted` Skill authority bound to the
  pinned definition/revision, instance, member, and Agent. Skill listing and
  direct invocation use one effective intersection, and the dynamic cache
  identity includes the policy hash plus every effective Skill key/revision;
- Team-side recovery preflight before the coordinator's generic child-recovery
  path, strict identity/hash validation, and compare-and-swap migration of only
  eligible legacy empty-policy launches to explicit `no_policy`;
- runtime-enforced lead/member/worker separation: the lead retains Team
  orchestration; a member with typed bounded delegation may call `Task` but not
  `Team`; its depth-two workers can call neither. New non-lead members default
  to eight total workers and three parallel workers, with validated per-member
  overrides. Launch authority persists Team instance, Team run, member run,
  direct/root session lineage, depth, and budgets. A member that delegated work
  remains waiting until every worker is terminal and the member explicitly
  completes its synthesis; worker failure is visible but does not independently
  advance or fail the workflow. Member launches still receive a concise positive
  phase assignment with the expected output, completion rule, and Team goal,
  while the member Agent definition remains the sole owner of its professional
  persona. Completed prerequisites automatically dispatch successor phases,
  and cancelled or interrupted members terminalize the current run so a new run
  can start instead of remaining falsely active;
- Web composer activation for otherwise-compatible ordinary Teams with member
  Skill allowlists;
- one Team Workspace presentation for all durable Team members, hosted on the
  desktop in a second system window opened from the session capability rail's
  Team capsule, Task-card routing into that workspace, and automatic
  restoration of the short-drama Canvas from session binding. The window reuses
  the compact-chat multi-window pipeline and publishes binding identity only;
  the main window's floating Team panel has been removed, and the Canvas
  expand/collapse control no longer has to collapse the Team presentation;
- the Team Workspace roster is presented as one operations map with bounded
  pan/zoom, semantic orbit sizing, constant-screen-size member nodes, status,
  selection, and entry into the existing member conversation. It is a view of
  the typed Team snapshot, not a second Team model or runtime path;
- stable Team Workspace background refresh: only a new binding uses the initial
  loading presentation, equivalent snapshots preserve their references and do
  not republish member indexes, and parent-turn refresh keeps the selected
  member conversation mounted;
- no fallback to the retired short-drama stage-agent Canvas composer. The
  created parent keeps its locked Team identity, the artifact Canvas remains
  available, and member chat always opens in Team Workspace.

The current slice intentionally does not broaden specialist tool narrowing or
readonly policy, replace dedicated Deep Review or Short Drama business tools,
expose direct pause/resume controls in the Team Workspace presentation, or add
browser/server persistence.
Typed pause/resume is implemented behind the Core runtime, trusted Team tool,
Desktop commands, and Web runtime gateway. Definitions that request specialist tool
narrowing, specialist readonly behavior, a readonly lead, or an explicit lead
tool set without `Task` remain visible and fail closed as `definition_only` in
the composer.

Further interaction and theme normalization follows
[Interaction And Theme Governance Specification](interaction-theme-governance.md)
and must not change Team identity, workflow, runtime authority, persistence, or
member-session ownership.

The 2026-08-09 presentation checkpoint verified the strict three-column
composition at a 1690×900 physical DWM boundary, Per-Monitor-V2, DPI 144. The
lead conversation, artifact Canvas, and 281 px specialist workspace remained
simultaneously visible; a member with no child session could be selected into
the explicit not-started state. Closing and reopening the right presentation
preserved the selected member and did not duplicate either composer. Canvas
collapse/maximize was exercised, and the maximized Canvas stacking fix stays in
the workspace shell rather than this domain module. The missing local dependency
was subsequently repaired without manifest or lockfile drift; focused Team and
presentation contracts plus the complete controlled Web suite now pass. This
evidence still does not replace provider-backed manual execution, packaging, or
cross-platform Desktop acceptance.

## Delivery sequence and status

1. Freeze the DTOs, validation rules, and typed projection contract.
   **Implemented for the current Desktop/Tauri slice, including typed member
   Skill authority.**
2. Build Team Center definition management around existing Agent, Skill, tool,
   model, and permission references. **Implemented for Desktop/Tauri.**
3. Integrate fixed-team selection with the shared persona-activation contract
   and activate compatible reusable Team leads. **Implemented for
   Desktop/Tauri prompt-orchestrated Teams.**
4. Adapt one existing fixed team, preferably Review Team or Short Drama, into a
   `TeamDefinition` without changing its runtime behavior. **Implemented for AI
   Short Drama as a trusted built-in definition over the shared Team runtime;
   its stage Agent policies, project runtime, media routing, and Canvas remain
   unchanged. Deep Review remains adapter-owned.**
5. Add the session capability entry and Team Workspace projection.
   **Implemented for Desktop/Tauri, including the fixed wide-desktop third
   column and bounded medium-layout overlay.**
6. Reuse the complete BTW composer inside the selected-member area.
   **Implemented for persisted Team member child sessions.**
7. Add restart hydration, recovery, and responsive presentation tests.
   **Durable Team-instance hydration, member-task recovery, projection reload,
   and BTW relationship recovery are implemented; complete responsive visual
   regression coverage remains staged.**
8. Add import/export only after validation, trust, and permission policy are
   accepted. **Bounded local package installation is implemented; general
   import/export remains staged.**

## Implemented slice: Team member Skill authority

This slice was delivered runtime-first. The Web adapter stopped classifying a
member Skill allowlist as `definition_only` only after the core authority and
recovery gates passed; that compatibility decision remains outside page and
composer components.

Implementation files and ownership:

- `src/crates/core-types/src/subagent_task.rs`: add an optional discriminated
  policy envelope to the durable launch specification. New Team launches always
  serialize `no_policy` or `restricted`; absence is reserved for old schemas
  and ordinary non-Team launches, not used as a permissive default;
- `src/crates/core/src/agentic/team_orchestrator.rs` and
  `src/crates/core/src/agentic/team_runtime_service.rs`: carry the policy in the
  existing `RuntimeRequest`, resolve it from the pinned definition/member, and
  perform the Team-instance cross-check for launch and recovery before invoking
  the adapter/coordinator boundary;
- `src/crates/core/src/agentic/team_runtime_adapter.rs`: pass only the validated
  typed policy or call-scoped validation result into Team member launch/resume
  while preserving the full parent session configuration;
- `src/crates/core/src/agentic/coordination/coordinator.rs`: persist the policy
  envelope in `SubagentTaskLaunchSpec`, include it in idempotent launch matching,
  require Team-side validation before a Team-tagged resume, and project it into
  the child execution context. Coordinator code validates only durable-launch
  internal consistency and must not depend on the Team store;
- `src/crates/core/src/agentic/persona_skill_runtime.rs`,
  `src/crates/core/src/agentic/tools/tool_context_runtime.rs`, and
  `src/crates/core/src/agentic/tools/implementations/skill_tool.rs`: reuse or
  extend the trusted normalization/filtering path so Skill discovery and direct
  invocation enforce the same member intersection;
- `src/crates/core/src/agentic/execution/execution_engine.rs`: add the member
  policy and resolved Skill revisions to the dynamic prompt-cache identity
  without changing the stable scenario/tool/permission prefix;
- after the core and recovery tests passed,
  `src/web-ui/src/shared/services/customization/adapters/ExistingTeamCatalogAdapter.ts`
  stopped classifying otherwise-supported member Skill allowlists as
  `definition_only`. No page or composer component owns that decision.

Accepted test matrix:

1. normalize, sort, deduplicate, hash, serialize, and restore both explicit
   `no_policy` and `restricted` states; prove every new empty-allowlist Team
   launch persists `no_policy` rather than omitting the field;
2. prove non-empty policy can only intersect the current effective Skill set,
   and that disabled, hidden, missing, or unparseable Skills cannot be listed or
   directly invoked;
3. prove two members with different allowlists cannot reuse one launch or
   prompt-cache identity, while identical policy and Skill revisions remain
   cache-stable;
4. accept a missing policy field only for an old launch schema after Team-side
   validation proves the pinned member allowlist is empty; reject a missing
   field for a new schema or non-empty pinned member, plus forged, partial,
   wrong-member, wrong-definition-revision, and wrong-policy-hash facts before
   Skill execution;
5. round-trip the policy through the persisted launch spec, reuse an exact retry
   idempotently, reject a mismatched retry, and recover using the pinned
   definition rather than the latest catalog revision. Prove Team service/
   adapter preflight occurs before coordinator resume, the coordinator never
   reads the Team store, and ordinary non-Team recovery keeps its current path;
6. verify local and remote Team member launches preserve the complete inherited
   workspace/session identity and never fall back to the foreground workspace;
7. regress ordinary Task and `/btw` launches, Team-lead Skill narrowing, Deep
   Review, AI Short Drama, Skill listing/direct invocation, child-session
   recovery, and existing prompt-cache revision tests;
8. keep `cargo test --locked -p void-core-types`, focused `void-core` Team,
   coordinator, persona-Skill, Skill-tool, and prompt-cache tests, followed by
   `cargo check --workspace`, repository boundary checks, and the existing Web
   adapter tests as the widening gates.

## Acceptance gates

- Canvas and Team Workspace remain simultaneously usable, and the Team window
  never overlaps the main window's scene.
- The Team window survives close/reopen and a moved or removed display, and the
  Team keeps running while it is closed.
- Each parent session restores its own attached teams and presentation state.
- Team collapse and application restart do not delete child sessions.
- A member conversation remains an existing BTW child session.
- Team Center and Team Workspace consume typed interfaces and never access
  persistence or runtime directly.
- Lead, member, workflow, permission, and failure states are explicit.
- Selecting a team makes its lead the active top-level persona without changing
  the scenario workspace or execution policy.
- Keyboard focus, reduced motion, narrow layouts, long names, many members,
  offline restore, denied access, and failed recovery have designed states.
- Existing Flow Chat, BTW, Review Team, Media, Short Drama, Terminal, Browser,
  and Canvas behavior remains protected.
