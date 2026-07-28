# Team Workspace Product And Architecture Specification

Status: accepted product direction; the first presentation-only entry slice is
implemented, while the reusable Team Module remains future work.

Updated: 2026-07-28

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

When a user selects a team in a compatible scenario, the team lead becomes the
parent conversation's active persona. The scenario workspace, execution policy,
permissions, Canvas, workspace context, and top-level history remain stable.
Specialist members run as isolated child conversations and return role-owned
results to the lead. This activation contract is defined by
[Customization Center and active persona](customization-center-prd.md).

The primary desktop composition remains:

```text
main conversation | working canvas | team workspace
```

Canvas shows artifacts and tools. Team Workspace shows participants, progress,
handoffs, and member conversations. Users must be able to inspect both at the
same time.

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

### Deferred mode eligibility

Team availability will eventually be explicit by conversation mode rather than
universal:

- Code owns software-development teams such as frontend, backend, review, and
  delivery;
- Cowork/Office owns finance, reporting, spreadsheet, and other office-work
  teams;
- Media owns image, video, short-drama, and creator-production teams.

That eligibility model is intentionally outside the first presentation slice.
The current implementation only relocates the existing Short Drama team
projection into the session capability rail. It does not add a cross-mode team
registry, infer eligibility from labels, or expose teams in unsupported modes.

Teams may be created by a user, assembled with AI assistance, or installed from
a future trusted package source. Those creation routes must produce the same
validated `TeamDefinition`.

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
- build a team manually or from supplied material;
- choose a lead and add specialist members;
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
- click opens or focuses the Team Workspace without replacing the current
  Canvas tab;
- secondary action opens a small menu for switch, detach presentation, inspect
  definition, or stop/cancel when the runtime explicitly permits it;
- hiding the Canvas keeps a one-click reopen control at the scene edge;
- presentation state is restored per parent session.

The rail is a launcher and status projection. It does not own team lifecycle,
session binding, retry, or cancellation rules.

### Team Workspace

Team Workspace is a dedicated coordination container beside Canvas. It is not
an ordinary Canvas tab.

Wide desktop:

```text
main conversation | active Canvas surface | Team Workspace
```

The Team Workspace is resizable, starts around 320 px, and has three visual
levels:

1. a quiet team header with identity, workflow, and overall status;
2. a compact member roster with role-owned status;
3. the selected member conversation using the same complete composer
   presentation contract as the main chat.

Selecting a member focuses that member's existing `/btw` child conversation
inside the Team Workspace. It does not replace the active Media, Short Drama,
Terminal, Browser, or other Canvas surface.

Medium desktop uses a bounded overlay on the right side of Canvas while keeping
the Canvas mounted. Narrow layouts may temporarily promote Team Workspace to a
single full surface, but that is a responsive fallback, not the primary desktop
model.

### Member conversation

The selected member conversation reuses the shared composer presentation and
versioned composer DTO. It restores text, file, image, media, Skill, permission,
and session references through existing Flow Chat interfaces.

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
that product contract. Existing Deep Review and AI Short Drama runtimes may use
their current child-orchestrator launch shape during migration, but adapters
must project the binding explicitly and must not make presentation code depend
on that compatibility detail.

## Non-goals for the first implementation slice

- no public team marketplace;
- no arbitrary downloaded scripts;
- no second agent runtime;
- no replacement of `/btw`;
- no direct UI filesystem or database access;
- no team business logic in `ChatInput.tsx`, `FlowChatStore.ts`,
  `ContentCanvas.tsx`, or `ShortDramaCenterPanel.tsx`;
- no team lifecycle inferred from transcript text;
- no automatic cancellation when the Team Workspace is closed.

## Implementation sequence

1. Freeze the DTOs, validation rules, and typed projection contract.
2. Build Team Center definition management around existing Agent, Skill, tool,
   model, and permission references.
3. Integrate Team selection with the shared persona-activation contract.
4. Adapt one existing fixed team, preferably Review Team or Short Drama, into a
   `TeamDefinition` without changing its runtime behavior.
5. Add the session capability entry and Team Workspace projection.
6. Reuse the complete BTW composer inside the selected-member area.
7. Add restart hydration, recovery, and responsive presentation tests.
8. Add import/export only after validation, trust, and permission policy are
   accepted.

## Acceptance gates

- Canvas and Team Workspace remain simultaneously usable on wide desktop.
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
