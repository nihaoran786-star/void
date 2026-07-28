# Customization Center And Active Persona Specification

Status: accepted product direction; implementation pending.

Updated: 2026-07-28

## Product decision

Void separates four concepts that the current product partly presents as one:

```text
scenario workspace
+ execution policy
+ active persona
+ Skills and context
```

- The **scenario workspace** is the stable task environment: Code, Cowork, or
  Media.
- The **execution policy** controls how the active persona may act, for example
  normal execution, planning, debugging, or multitask behavior.
- The **active persona** is the Agent or team lead currently speaking to the
  user and owning top-level task reasoning.
- **Skills and context** provide reusable instructions and task material
  without becoming a separate persona.

Selecting an Agent or team must not change the scenario workspace. Selecting a
team replaces the scenario's default persona with that team's lead persona for
subsequent top-level turns. It does not replace the global runtime contract,
the scenario capability envelope, the workspace, the Canvas, the permission
system, or conversation history.

The user-facing vocabulary is:

- **代码**、**办公**、**设计创作** for scenario workspaces;
- **智能体** for a single selectable persona;
- **团队** for a lead plus specialist members and workflows;
- **技能** for reusable operating instructions.

Avoid exposing `mode`, `agentType`, `subagent`, prompt filenames, or runtime IDs
as primary product language.

## Why the separation matters

The current runtime defines Agentic, Cowork, and Media with their own prompt and
tool configuration. This makes the default persona, scenario rules, and
capability envelope appear to be one indivisible Agent.

That shape does not support the intended product behavior:

- a Code conversation must be able to use a software-delivery lead, game
  studio lead, security reviewer, or review team without leaving Code;
- a Cowork conversation must be able to use finance, reporting, spreadsheet,
  legal, or operations personas without leaving Cowork;
- a Media conversation must be able to use short-drama, advertising-video,
  image-production, or game-art teams without leaving Media;
- selecting a team lead must not remove the scenario's tools, workspace, Canvas,
  permissions, or persistent artifacts.

Void therefore treats the existing scenario Agent prompt as a compatibility
composition that must be decomposed behind Module Interfaces. Presentation
code must not parse, rewrite, concatenate, or replace system prompts directly.

## Canonical runtime composition

The effective runtime instruction order is:

```text
1. global runtime and safety contract
2. scenario workspace contract
3. execution policy
4. active persona
5. resolved Skills
6. workspace, references, attachments, memory, and conversation history
```

### Global runtime and safety contract

This layer owns provider-independent runtime rules, tool protocol, safety,
memory behavior, permission enforcement, and session lifecycle. It is never
replaced by an Agent or team package.

### Scenario workspace contract

The scenario workspace owns the stable task environment:

| Scenario | Stable environment |
| --- | --- |
| Code | repository context, code editing, terminal, Git, development Canvas surfaces |
| Cowork | document, spreadsheet, PDF, office-file, and knowledge-work surfaces |
| Media | image, video, audio, media library, and domain production surfaces |

Scenario eligibility is explicit metadata. It must not be inferred from display
names, empty tool lists, prompt prose, or category labels.

### Execution policy

Execution policy is orthogonal to persona. In Code, existing Agentic, Plan,
Debug, and Multitask behavior belongs to this axis even if the current runtime
represents those behaviors as Agent modes.

Changing execution policy does not select another professional persona.
Changing persona does not silently change execution policy.

### Active persona

Every parent conversation has exactly one active persona:

```text
default persona | single Agent | team lead
```

- With no explicit selection, the scenario's default persona is active.
- Selecting a single Agent activates that Agent for subsequent top-level turns.
- Selecting a team activates its lead persona for subsequent top-level turns.
- The active persona remains selected until the user switches or clears it.
- Clearing the selection restores the scenario's default persona.

Only the persona layer changes. Existing top-level conversation history remains
available. The selected persona must be shown as a removable composer capsule
and recorded on each submitted turn as structured metadata.

### Skills and context

A Skill is an instruction package, not a person and not a child conversation.
An active persona may have default Skills, scenario-eligible Skills, and an
explicit Skill selected by the user for the current task.

Runtime Skill identity remains stable. The UI projects a localized display
name, concise purpose, category, and compatibility without renaming the runtime
key.

## Tool and permission resolution

An Agent or team package may request a bounded set of tools and Skills, but it
cannot expand beyond the scenario and user permission envelope.

Conceptually:

```text
effective capabilities
= scenario capability envelope
∩ active persona policy
∩ user and workspace permissions
```

The owning runtime Module performs this resolution and returns explicit
availability or denial facts. The UI must not calculate effective permissions
or infer them from missing tools.

## Persona switching semantics

Persona selection belongs to the parent conversation, not to the application
globally.

When the user switches persona:

1. the new persona becomes effective on the next accepted top-level turn;
2. prior top-level conversation history remains visible and available;
3. the scenario workspace, execution policy, workspace, Canvas, attachments,
   and permission settings remain unchanged;
4. previous team instances, member conversations, and completed work remain
   inspectable;
5. switching does not silently cancel a running Agent or team task;
6. the UI keeps running or attention-requiring work visible through the session
   capability rail.

The active selection state is explicit:

```text
resolving | available | incompatible | activating | active | blocked | error
```

Every non-active state includes a typed reason and recovery action. The UI does
not infer support from an empty catalog or a missing child session.

## Teams

A selected team lead becomes the parent conversation's active persona. The lead
speaks to the user, decomposes the task, dispatches specialist members, receives
member-owned results, and produces the synthesis.

Specialist members are real isolated child-agent conversations. The lead must
not simulate required member output or impersonate a member whose result is
missing.

```text
parent conversation with active team lead
├─ specialist child conversation
├─ specialist child conversation
└─ specialist child conversation
```

Existing fixed teams may initially retain their current runtime launch shape
behind compatibility adapters:

- Deep Review may continue to use its existing review session and manifest;
- AI Short Drama may continue to use its existing Media parent, persistent
  stage-agent sessions, runtime bridge, and dedicated Short Drama Canvas.

The presentation must project both as teams without moving their runtime rules
into the Customization Center or pretending that their specialized Canvas is a
generic team view.

The reusable Team Module and its persistence remain governed by
[Team Workspace](team-workspace-prd.md).

## Product surfaces

### Customization Center

The global navigation entry is **定制**. Its information architecture is:

```text
定制
├─ 智能体
│  ├─ 智能体
│  └─ 团队
├─ 技能
└─ 连接器
```

The first implementation may reuse the existing Agents and Skills scenes, but
the user-facing structure must converge on this model.

Agent and team discovery supports:

- recommended for the current scenario;
- recently used;
- built-in, user, project, and installed origins;
- explicit scenario compatibility;
- search by localized name, purpose, capability tag, and runtime alias;
- detail view with responsibilities, suggested prompts, Skills, tools,
  permissions, and team structure;
- one primary **召唤** action.

Cards show localized display information:

- Chinese display name;
- one concise purpose statement;
- at most three capability tags;
- compatible scenario;
- concise availability state.

Runtime IDs, file paths, package filenames, prompt filenames, and raw English
descriptions are secondary diagnostic information only.

### Composer selector

The shared composer exposes one entry named **选择智能体或团队**:

```text
最近使用
适合当前场景
  智能体
  团队
查看全部
```

After selection, the composer displays one removable localized capsule:

```text
[分镜设计智能体 ×]
[代码审查团队 · 7 名成员 ×]
```

The capsule represents a structured persona binding. It must not be implemented
as prompt text, an `@` mention, a Skill reference, a slash command, or a raw
display-name lookup.

Submitting a message records:

- parent conversation ID;
- scenario workspace;
- execution policy;
- active persona definition and revision;
- active team instance when applicable;
- explicit Skill references;
- existing attachment and context references.

The composer consumes a small persona-selection Interface. Persona activation,
team launch, prompt composition, permission resolution, and child-session
lifecycle remain outside `ChatInput.tsx`.

### Team detail and Team Workspace

Team detail shows:

- lead identity and responsibility;
- specialist members and role-owned outputs;
- workflow phases and serial/parallel relationships;
- Skills, tools, permissions, and scenario compatibility;
- dedicated Canvas or domain surface when applicable;
- current installation and validation state.

The global detail view manages a reusable definition. A live team continues to
use Team Workspace for participants, progress, handoffs, and member
conversations.

## Localization contract

Runtime identity and display identity are separate:

```text
stable runtime ID -> localized presentation metadata
```

Examples:

| Runtime ID | Chinese display name |
| --- | --- |
| `DeepReview` | 代码审查负责人 |
| `ReviewBusinessLogic` | 业务逻辑审查员 |
| `ReviewPerformance` | 性能审查员 |
| `ReviewSecurity` | 安全审查员 |
| `ReviewArchitecture` | 架构审查员 |
| `ReviewFrontend` | 前端体验审查员 |
| `ReviewJudge` | 审查质检员 |
| `ScriptAI` | 剧本智能体 |
| `AssetAI` | 角色与场景资产智能体 |
| `SplitAI` | 分镜设计智能体 |
| `VideoAI` | 视频生成智能体 |
| `EditorAI` | 后期制作智能体 |

The same rule applies to Skills. A localized name never changes a runtime key,
directory name, session binding, tool policy, or persisted package identity.

Custom definitions require both:

- an immutable generated runtime ID;
- an editable localized display name.

Users are not required to invent English identifiers.

## Creation and installation

Agent and Skill creation supports three user-facing routes:

1. describe the desired capability in natural language;
2. transform supplied prompts, documents, workflows, or examples;
3. configure manually.

All routes produce the same validated definition. Before saving or installing,
the UI previews:

- localized name and purpose;
- scenario eligibility;
- role instructions;
- suggested prompts;
- Skills and tools;
- permission and write scope;
- origin and installation scope;
- validation errors and warnings.

Team creation is added only after the reusable Team Interface is stable. It
must produce the validated `TeamDefinition` from the Team Workspace
specification instead of introducing another team format.

The Customization Center does not implement its own filesystem scanner,
marketplace registry, prompt loader, Skill resolver, permission engine, or team
runtime.

## Module ownership

```text
Customization Center / shared composer
  -> Capability Catalog and Persona Activation Interfaces
    -> Agent, Team, and Skill catalog services
    -> prompt-composition and runtime adapters
      -> existing Agent runtime / Team runtime / persistence
```

Expected Interface families:

- `CapabilityCatalog`: localized, scenario-aware Agent, Team, Skill, and
  connector discovery;
- `PersonaActivation`: resolve, activate, switch, clear, and restore the active
  persona for a parent conversation;
- `PersonaRuntimeAdapter`: bridge persona activation to existing mode and Agent
  runtime contracts;
- `TeamCatalog` and `TeamOrchestrator`: defined by Team Workspace;
- `SkillCatalog`: list, validate, create, install, remove, and resolve Skills
  without UI filesystem access.

Exact names may change, but the dependency direction remains:

```text
UI / route -> Module Interface -> Adapter / service -> external system
```

## Migration sequence

1. Freeze scenario, persona, localized catalog, compatibility, activation, and
   error DTOs.
2. Add a read-only localized capability catalog over existing Agent, Skill,
   Deep Review, and Short Drama sources.
3. Reorganize the Customization Center into 智能体 / 团队 / 技能 / 连接器.
4. Add the structured persona selector and capsule to the shared composer.
5. Add compatibility adapters for existing Deep Review and AI Short Drama
   without changing their runtime behavior.
6. Separate current scenario prompt composition from default-persona
   composition behind a runtime Interface.
7. Add natural-language and material-assisted Agent and Skill creation.
8. Add team creation, editing, installation, and packaging after Team
   Interface stabilization.

## Non-goals for the first implementation

- no second Agent or team runtime;
- no direct system-prompt editing in presentation code;
- no persona activation represented only as inserted prompt text;
- no renaming of stable runtime IDs;
- no generalization of the AI Short Drama Canvas into a generic team panel;
- no team creation before Team Interface stabilization;
- no public marketplace or arbitrary downloaded executable scripts;
- no business logic added to `ChatInput.tsx`, `FlowChatStore.ts`,
  `ContentCanvas.tsx`, or `ShortDramaCenterPanel.tsx`;
- no direct UI access to filesystem, Tauri, process commands, database, or
  provider transports.

## Acceptance gates

- Code, Cowork, and Media remain stable while personas switch within compatible
  scenarios.
- The active persona is visible, removable, restored per parent conversation,
  and recorded as structured turn metadata.
- Selecting a team makes its lead the user-facing active persona.
- Team specialists remain real isolated child conversations.
- Switching persona preserves top-level history, workspace, Canvas, execution
  policy, permissions, and running-task visibility.
- Runtime IDs remain stable while all primary Agent, team, and Skill names have
  localized presentation metadata.
- Incompatible, missing, activating, blocked, and failed states are explicit.
- Existing Flow Chat, BTW, Review Team, Media, AI Short Drama, Skills, session
  restore, permissions, and Canvas behavior remain protected.
- Customization and composer presentation consume Module Interfaces and contain
  no prompt, persistence, permission, or runtime orchestration logic.

## Reference application lesson

The reference application confirms a useful separation:

- office, development, and creative entries organize scenarios;
- execution permissions remain a separate axis;
- selecting a single expert replaces the default top-level persona;
- selecting a team makes its lead the top-level persona;
- team specialists are real isolated subagents;
- global runtime, tools, workspace, memory, and conversation history remain.

Void adopts the separation and user experience, not the reference
application's package format, fixed directories, registration scripts, or
validation quirks.
