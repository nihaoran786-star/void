# Customization Center And Active Persona Specification

Status: Desktop/Tauri first implementation complete; general Team runtime and
browser/server parity deferred.

Updated: 2026-08-01

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

## Current source baseline

The following statements describe the repository as it exists before this
specification is implemented. They are compatibility facts, not completion
claims.

- The Web UI session currently stores one `mode` value in
  `src/web-ui/src/flow_chat/types/flow-chat.ts`, and
  `src/web-ui/src/flow_chat/services/flow-chat-manager/MessageModule.ts`
  derives the submitted `agentType` from the explicit argument or that mode.
  The desktop request and persisted backend session continue to use
  `agent_type` in `src/apps/desktop/src/api/agentic_api.rs`. Scenario and
  execution-policy identity are therefore still projected through one field.
- The accepted turn path is currently:

  ```text
  ChatInput / useMessageSender
    -> MessageModule.sendMessage
    -> AgentAPI.startDialogTurn
    -> desktop start_dialog_turn / DialogScheduler
    -> ConversationCoordinator
    -> AgentRegistry
    -> ExecutionEngine
    -> resolve_tool_manifest
    -> provider adapter
  ```

  The relevant implementation landmarks are
  `src/web-ui/src/flow_chat/hooks/useMessageSender.ts`,
  `src/web-ui/src/flow_chat/services/flow-chat-manager/MessageModule.ts`,
  `src/web-ui/src/infrastructure/api/service-api/AgentAPI.ts`,
  `src/apps/desktop/src/api/agentic_api.rs`,
  `src/crates/core/src/agentic/coordination/coordinator.rs`,
  `src/crates/core/src/agentic/agents/registry/mod.rs`,
  `src/crates/core/src/agentic/execution/execution_engine.rs`, and
  `src/crates/core/src/agentic/tools/manifest_resolver.rs`.
- The platform and transport contract for the first implementation is
  Desktop/Tauri Module Interface support for Customization Center authoring and
  active-persona turn execution. The shared Web UI has a WebSocket adapter, but
  the currently reachable `void-server` WebSocket command surface supports only
  `ping`; `bootstrap` does not route commands through `rpc_dispatcher`. Browser
  or server authoring and runtime mutation are therefore explicitly
  unsupported and deferred for this Goal. This scope does not mean that the
  entire Web UI is unsupported; it applies only to this Goal's authoring,
  persona mutation, and active-persona runtime path.
- Future server parity is a separate, complete delivery. It must reuse the
  canonical Agent key and cover the server Module/dependency boundary plus
  workspace, session, permission, provider, and event isolation with tests
  against the actually reachable runtime path.
- `MessageModule` already forwards arbitrary `userMessageMetadata` through
  `AgentAPI.startDialogTurn`. This is the transport seam for a typed persona
  snapshot, but the runtime does not yet treat such a snapshot as an active
  persona contract.
- Code modes `agentic`, `Plan`, `debug`, and `Multitask` already share
  `SHARED_CODING_MODE_PROMPT_TEMPLATE`, `shared_coding_mode_tools`, and one
  context policy in `src/crates/core/src/agentic/agents/mod.rs`; their
  differences are added by the mode implementations in
  `src/crates/core/src/agentic/agents/definitions/modes/` through reminders.
  Cowork and Media retain separate prompt and tool definitions in
  `cowork.rs` and `media.rs`.
- The existing Agent and Skill scenes still render runtime-facing names in
  `src/web-ui/src/app/scenes/agents/AgentsScene.tsx` and
  `src/web-ui/src/app/scenes/skills/SkillsScene.tsx`. The Connectors entry
  currently routes to the existing MCP surface in
  `src/web-ui/src/infrastructure/config/components/McpToolsConfig.tsx`.
- No reusable `TeamCatalog`, `TeamOrchestrator`, or general team persistence
  implementation exists yet. The Team Interface in
  [Team Workspace](team-workspace-prd.md) remains a specification dependency.

## Target module boundaries

All names in this section are proposed Interfaces until their source files are
introduced. Implementations may refine the names without changing ownership or
dependency direction.

| Owner | Small Interface | Implementation / Adapter responsibility | Forbidden responsibility |
| --- | --- | --- | --- |
| Customization Catalog | `CapabilityCatalogService` | Merge existing Agent, Skill, connector, Deep Review, and Short Drama sources into localized, scenario-aware projections | Prompt composition, child-session launch, filesystem access from scene components |
| Parent session persona | `ActivePersonaSessionService` | Resolve, select, clear, restore, and report typed activation state per parent session | Rendering controls, modifying scenario or execution policy, cancelling active work |
| Composer presentation | `PersonaSelectorViewModel` | Render compatible choices and one active localized capsule | Looking up raw IDs by display name, editing prompts, computing permissions |
| Runtime composition | `PersonaRuntimeAdapter` and a runtime-owned composition service | Validate the persona snapshot, compose scenario/policy/persona/Skills, resolve the effective manifest, and create cache identity | UI imports, presentation state, direct marketplace behavior |
| Existing team compatibility | Deep Review and Short Drama adapters | Project fixed teams into the catalog and delegate launch/open behavior to their existing services | Reimplementing review orchestration, short-drama lifecycle, or specialized Canvas |
| Reusable teams | `TeamCatalog` and `TeamOrchestrator` from Team Workspace | Definition persistence, validation, instance launch, workflow and member projections | A second team schema owned by Customization Center |

The first catalog DTO is:

```text
CatalogIdentity {
  id                 // immutable runtime identity
  version            // definition revision used for activation and cache safety
  displayName        // localized primary name
  description        // localized concise purpose
  aliases[]          // searchable legacy/runtime aliases
}
```

Agent, Team, and Skill catalog records extend this identity with typed origin,
scenario eligibility, tags, availability, validation, and permission facts.
Presentation code never falls back from an unknown runtime ID to a guessed
persona or Skill.

The runtime target is:

```text
RuntimeComposition {
  scenario
  executionPolicy
  persona
  skills
}
```

The parent session persists `scenario`, `executionPolicy`, and
`activePersonaBinding` separately. During migration, existing `mode` and
`agent_type` remain a compatibility projection so restore, rollback, ACP,
subagents, and older stored sessions keep working. New code must not add
another meaning to those legacy fields.

`StartDialogTurn` gains one structured, immutable-for-the-turn persona
snapshot:

```text
PersonaTurnSnapshot {
  personaId
  personaRevision
  kind                 // default | agent | team_lead
  teamDefinitionId?
  teamInstanceId?
  resolvedSkillRefs[]
}
```

The composer writes the snapshot through the existing
`userMessageMetadata` transport. The runtime validates it against the parent
session binding and catalog before prompt composition; it never trusts a
localized label or arbitrary client prompt text as identity.

### Required data flow

```text
Agents / Teams / Skills / Connectors scenes
  -> CapabilityCatalogService
  -> source adapters
  -> existing Agent registry, Skill services, MCP config, fixed-team services

Composer selector
  -> PersonaSelectorViewModel
  -> ActivePersonaSessionService
  -> parent-session binding persistence

Message submission
  -> useMessageSender adds PersonaTurnSnapshot
  -> MessageModule forwards structured metadata
  -> StartDialogTurn validates snapshot
  -> runtime composition resolves scenario + policy + persona + Skills
  -> resolve_tool_manifest applies the bounded effective tool policy
  -> ExecutionEngine submits the final request
```

`ChatInput.tsx` only renders the selector ViewModel and invokes its commands.
It does not own catalog queries, activation lifecycle, prompt construction,
cache keys, Skill resolution, team launch, or persistence.

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

## Prompt and KV-cache safety

Persona switching changes model-visible instructions. Reusing a complete
prompt/KV cache entry across two persona revisions would risk role leakage, so
cache correctness takes priority over hit rate.

### Current cache facts

- `SessionPromptCache`, `SystemPromptCacheIdentity`, and their persistence are
  implemented in
  `src/crates/core/src/agentic/session/prompt_cache.rs`,
  `src/crates/core/src/agentic/session/session_manager.rs`, and
  `src/crates/core/src/agentic/persistence/manager.rs`.
- `PromptPrefixIdentity` exists in
  `src/crates/runtime-ports/src/lib.rs`, and Agent implementations construct it
  in `src/crates/core/src/agentic/agents/mod.rs` from a stable scope, base
  prompt hash, toolset hash, and user-context hash.
- This specification does not assume that `PromptPrefixIdentity` is already
  supplied to every provider request; that end-to-end provider integration has
  not been proven by the current source audit.
- Provider-side KV/prompt caching remains controlled by the upstream provider.
  Void owns safe prompt ordering and cache identity, not a promise that a
  provider will return a cache hit.

### Target prompt regions

```text
stable cache region
  global runtime and safety contract
  + scenario contract
  + execution-policy base
  + scenario tool definitions and permission envelope

dynamic role region
  active persona definition
  + resolved Skills
  + turn/workspace context and conversation messages
```

Code Agentic, Plan, Debug, and Multitask continue to share the existing stable
Code prefix. Their policy-specific reminder remains explicit and versioned.
Cowork and Media keep their own stable scenario prefixes. A persona may narrow
the effective manifest, so a final effective-tool hash is still part of the
complete identity even when the scenario tool envelope is cached.

The minimum signatures are:

```text
stableSignature =
  scenarioVersion
  + executionBaseVersion
  + toolConfigVersion
  + permissionConfigVersion

dynamicSignature =
  personaId
  + personaRevision
  + resolvedSkillSetHash

completeRuntimeIdentity =
  stableSignature
  + dynamicSignature
  + effectiveToolManifestHash
  + workspaceInstructionHash
  + model/provider prompt-format version
```

`resolvedSkillSetHash` is order-stable and includes each Skill's immutable ID
and revision. `permissionConfigVersion` and `effectiveToolManifestHash` reflect
the resolved runtime/user/workspace permission envelope, not UI assumptions.

Until provider-prefix segmentation is proven end to end, every full prompt
cache identity must include the complete runtime identity. The first request
after a persona, Skill, tool, or permission change may miss the cache; it must
never reuse a stale complete entry. Cache optimization may later reuse the
stable prefix only after tests prove that the provider receives the same safe
prefix boundary.

Required cache tests cover:

- same scenario, policy, persona revision, Skill set, tools, and permissions:
  identity matches;
- persona switch or persona revision: dynamic identity changes;
- Skill add, remove, reorder, or revision: semantic set changes invalidate
  correctly while pure ordering does not;
- scenario, execution base, tool config, or permission change: stable identity
  changes;
- two persona IDs with identical display text never share a complete identity;
- restore and branch operations preserve only cache entries whose identities
  still match;
- a cache miss affects latency/token usage only and does not remove tools,
  history, workspace context, or Canvas state.

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

## Existing capability reuse and stability rules

The implementation adapts existing capabilities; it does not rebuild them.

| Capability | Existing authority to reuse | Compatibility projection | Must remain unchanged |
| --- | --- | --- | --- |
| Code | `SHARED_CODING_MODE_*` and mode definitions in `src/crates/core/src/agentic/agents/` | Code scenario plus Agentic / Plan / Debug / Multitask execution policy | Repository context, tools, reminders, AGENTS/workspace instructions, Git and terminal behavior |
| Cowork | `src/crates/core/src/agentic/agents/definitions/modes/cowork.rs` | Cowork scenario default persona and capability envelope | Office/document capability and current permission behavior |
| Media | `src/crates/core/src/agentic/agents/definitions/modes/media.rs` | Media scenario default persona and capability envelope | Media tools, task polling, workspace media save/preview/gallery behavior |
| Deep Review | `launchDeepReviewSession` in `src/web-ui/src/flow_chat/deep-review/launch/DeepReviewService.ts`, manifest services under `src/web-ui/src/shared/services/review-team/`, Deep Review prompt and reviewer definitions under `src/crates/core/src/agentic/agents/` | Catalog team with `leadBinding = child_orchestrator` | Existing BTW child launch, run Manifest, parallel specialist packets, concurrency handling and recovery/report behavior. Analysis reviewers and `ReviewJudge` remain read-only; the Deep Review orchestrator and `ReviewFixer` after explicit user approval retain their existing controlled write paths. |
| AI Short Drama | services under `src/web-ui/src/shared/services/short-drama/`, including `ShortDramaRuntimeBridge.ts`, `ShortDramaStageAgentSessionBinding.ts`, `ShortDramaToolPolicy.ts`, and the existing `ShortDramaCenterPanel.tsx` | Catalog team with `leadBinding = parent_persona_compatibility` | Media parent session, five real stage sessions (`ScriptAI`, `AssetAI`, `SplitAI`, `VideoAI`, `EditorAI`), bindings, fixed Skill/tool policies, attempts/revisions/change requests, runtime bridge, media routing, dedicated Canvas |
| BTW | existing Flow Chat child-session services and projections | Team member conversation link | Restore, isolation, navigation, history, child identity and parent linkage |
| Skills | existing Skill listing, validation, install, resolution, and `Skill` runtime tool | Localized `SkillCatalog` projection | Stable runtime key, resolution precedence, validation, policy, install/remove behavior |
| Permissions and tools | Agent tool policy plus `resolve_tool_manifest` in `src/crates/core/src/agentic/tools/manifest_resolver.rs` | Scenario/persona/runtime permission intersection | Role cannot enlarge access; UI cannot calculate or bypass effective policy |

The effective tool rule is:

```text
effective tools
= scenario-allowed tools
∩ persona-allowed tools
∩ runtime, user, and workspace permissions
```

The existing `resolve_tool_manifest` path remains the authoritative manifest
resolver. The persona layer supplies an additional narrowing policy; it does
not replace the resolver or grant tools directly.

Switching persona or team must not:

- cancel a running task or queued reviewer;
- delete, detach, or silently recreate BTW or specialist child sessions;
- clear top-level or child history;
- close or reset the universal Canvas, short-drama Canvas, media gallery, or
  workspace artifacts;
- overwrite the parent scenario, execution policy, model, workspace, or
  permission mode;
- widen any write scope or bypass a confirmation;
- register a second Deep Review or short-drama runtime.

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

The implementation reuses the existing Agents, Skills, and MCP surfaces through
catalog adapters, but the user-facing structure must converge on this model.

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

The existing `[[void-skill:...]]` token parser in
`src/web-ui/src/flow_chat/utils/skillPromptReference.ts` remains a legacy
compatibility input. New persona and Skill selections are submitted as
structured metadata. No new feature serializes a persona as
`[[void-skill:...]]`, prompt prose, or another hidden text token.

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

## File-level implementation and verification sequence

Each phase is independently reviewable and keeps legacy projection available
until the replacement path is verified. Proposed new paths below are planning
targets, not existing implementation.

### Phase 0 — characterization and rollback baseline

Read and characterize without changing behavior:

- Web UI session/send contracts:
  `src/web-ui/src/flow_chat/types/flow-chat.ts`,
  `src/web-ui/src/flow_chat/store/FlowChatStore.ts`,
  `src/web-ui/src/flow_chat/hooks/useMessageSender.ts`, and
  `src/web-ui/src/flow_chat/services/flow-chat-manager/MessageModule.ts`;
- desktop/core path:
  `src/apps/desktop/src/api/agentic_api.rs`,
  `src/crates/core/src/agentic/coordination/`,
  `src/crates/core/src/agentic/agents/`, and
  `src/crates/core/src/agentic/execution/execution_engine.rs`;
- protected integrations: Deep Review launch/manifest tests, BTW restore tests,
  short-drama binding/runtime/tool-policy tests, media tests, and Canvas tests.

Verification: record the focused test commands and current baseline failures;
do not use unrelated baseline debt as evidence that the feature passes.

### Phase 1 — DTOs and read-only localized catalog

Add a UI Module Interface under a new
`src/web-ui/src/shared/services/customization/` boundary for
`CatalogIdentity`, scenario compatibility, availability, origin, persona
summary, and catalog query results. Add adapters over existing Agent, Skill,
MCP, Deep Review, and Short Drama sources. Add Chinese presentation metadata
without changing runtime IDs.

Then migrate:

- `src/web-ui/src/app/scenes/agents/AgentsScene.tsx`;
- `src/web-ui/src/app/scenes/skills/SkillsScene.tsx`;
- the Connectors projection that routes to
  `src/web-ui/src/infrastructure/config/components/McpToolsConfig.tsx`.

Verification: catalog contract/unit tests, alias and locale completeness tests,
unknown-ID/error-state tests, existing Agent/Skill/MCP tests, Web UI type check,
i18n contract, and accessibility assertions. No activation behavior changes in
this phase.

### Phase 2 — parent-session active persona state

Add `ActivePersonaSessionService` and its typed persistence adapter outside
`FlowChatStore.ts`. Extend the parent-session DTOs and persistence schema with
separate scenario, execution policy, and active persona binding. Keep
`mode`/`agent_type` serialization and restore as a backward-compatible
projection for old sessions.

Likely touch points are:

- shared session DTOs in
  `src/web-ui/src/shared/types/session-history.ts` and
  `src/web-ui/src/infrastructure/api/service-api/AgentAPI.ts`;
- desktop request/response DTOs in
  `src/apps/desktop/src/api/agentic_api.rs`;
- core session and persistence Modules under
  `src/crates/core/src/agentic/session/` and
  `src/crates/core/src/agentic/persistence/`.

Verification: create/list/restore/rollback/branch tests for legacy and new
sessions; per-parent selection isolation; clearing restores the scenario
default; no Canvas, model, workspace, permission, or child-session mutation.

### Phase 3 — selector and structured turn snapshot

Add a small selector/capsule component and hook that consume only catalog and
activation Interfaces. Integrate it into `ChatInput.tsx` as presentation.
Extend `useMessageSender` and `MessageModule` to submit
`PersonaTurnSnapshot` through `userMessageMetadata`; extend `StartDialogTurn`
DTOs and coordinator validation to accept the typed snapshot.

Verification: selection, removal, incompatible/blocked/error states, pending
queue metadata preservation, retry preservation, ACP support decision, session
restore, and proof that display-name changes cannot change runtime identity.
Existing `[[void-skill:...]]` tests remain green as compatibility coverage.

### Phase 4 — runtime composition, permissions, and cache identity

Introduce the runtime-owned composition seam near
`src/crates/core/src/agentic/agents/` and
`src/crates/core/src/agentic/execution/`; do not compose prompts in Web UI or
desktop route code. Separate scenario base, execution reminder, persona
definition, and resolved Skills while retaining the legacy Agent implementation
as a rollback adapter.

Extend:

- Agent registration/lookup without renaming existing IDs;
- `resolve_tool_manifest` inputs with a persona narrowing policy;
- `SystemPromptCacheIdentity`, persisted `SessionPromptCache`, and the
  end-to-end provider prefix identity with the signatures in this
  specification.

Verification: prompt ordering snapshots; effective-tool intersection tests;
write/confirmation denial tests; cache match/invalidation matrix; provider
request inspection proving persona A never reuses persona B's complete
identity; Code shared-prefix tests; Cowork/Media scenario tests; restore and
branch cache tests.

### Phase 5 — fixed-team adapters

Register catalog projections and activation adapters only:

- Deep Review delegates to `launchDeepReviewSession` and the existing Manifest
  pipeline with `leadBinding = child_orchestrator`;
- AI Short Drama delegates to the existing Media parent, stage-session
  bindings, runtime bridge, policy, and dedicated Canvas with
  `leadBinding = parent_persona_compatibility`.

Verification: existing Deep Review and short-drama suites plus integration
tests proving selection/opening does not change Manifest content, concurrency,
judge order, readonly policy, stage bindings, five-stage sessions, fixed
Skills, media routing, running-task state, or Canvas contents.

### Phase 6 — Agent and Skill creation

Add natural-language, supplied-material, and manual authoring flows over one
validated draft Interface. Reuse current Agent/Skill validation and installation
services through adapters; do not write files from pages. Generate immutable
runtime IDs internally while keeping the Chinese display name editable.

Verification: all three routes produce the same canonical definition; invalid
permissions/scenarios fail with typed diagnostics; install/remove rollback is
recoverable; existing custom Agent and Skill precedence remains unchanged.

### Phase 7 — reusable team definition authoring

After the `TeamDefinition` schema, validation rules, and `TeamCatalog`
persistence Interface are stable, add team create, edit, validate, install,
delete, and bounded package UI. The UI writes that canonical definition and
does not introduce a second package format. This definition-management slice
does not imply a general `TeamInstance` or `TeamOrchestrator` runtime.

Verification: lead/member/workflow identity, serial/parallel dependencies,
scenario compatibility, permission narrowing, optimistic revision conflicts,
user/project isolation, read-only installed definitions, installation rollback,
partial-load diagnostics, and fixed-team compatibility adapters. General team
activation, real child-session orchestration, and runtime restore remain gated
until `TeamInstance` and `TeamOrchestrator` are implemented and tested.

### Phase 8 — full regression and visual acceptance

Run the smallest focused suites after every phase, then widen to the applicable
repository gates:

```powershell
pnpm run check:repo-hygiene
pnpm run check:core-boundaries
pnpm run i18n:contract:test
pnpm run i18n:audit
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
pnpm run build:web
cargo check --workspace
cargo test --locked -p void-core
```

Add scenario/persona/team switch E2E coverage and capture Code, Cowork, Media,
Customization Center, Agent detail, Team detail, and composer-selector
screenshots in both normal and constrained window sizes. Compare against the
accepted visual target while treating the protected-capability regression
tests, not visual similarity alone, as the release gate.

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

## Source-grounded implementation contract

This section is the implementation handoff derived from current source
behavior. It does not state that the proposed Interfaces or product behavior
already exist.

### 1. Runtime data flow

Current compatible path:

```text
ChatInput
  -> useMessageSender(userMessageMetadata)
  -> MessageModule
  -> AgentAPI.startDialogTurn
  -> desktop start_dialog_turn
  -> DialogScheduler / ConversationCoordinator
  -> AgentRegistry
  -> ExecutionEngine
  -> resolve_tool_manifest
  -> provider
```

Target addition:

```text
CapabilityCatalogService
  -> PersonaSelectorViewModel
  -> ActivePersonaSessionService
  -> PersonaTurnSnapshot in userMessageMetadata
  -> runtime-owned composition validation
  -> scenario + executionPolicy + persona + resolved Skills
  -> effective tool intersection
  -> existing ExecutionEngine
```

The runtime, not the UI, validates the persona ID/revision, resolves Skills,
builds prompts, computes cache identity, and narrows tools. Existing
`mode`/`agent_type` remains a compatibility projection until separate
`scenario`, `executionPolicy`, and `activePersonaBinding` persistence is proven
for create, send, restore, rollback, and branch flows.

### 2. Module boundary and suggested file tree

```text
src/web-ui/src/shared/services/customization/        # proposed
  CapabilityCatalogService.ts                       # Interface
  ActivePersonaSessionService.ts                    # Interface
  PersonaSelectorViewModel.ts                       # presentation DTO
  adapters/
    ExistingAgentCatalogAdapter.ts
    ExistingSkillCatalogAdapter.ts
    ExistingConnectorCatalogAdapter.ts
    DeepReviewTeamAdapter.ts
    ShortDramaTeamAdapter.ts

src/web-ui/src/app/scenes/agents/
src/web-ui/src/app/scenes/skills/
src/web-ui/src/infrastructure/config/components/McpToolsConfig.tsx
                                                    # existing presentation

src/crates/core/src/agentic/                         # existing runtime owner
  agents/                                            # registry and composition
  execution/                                         # execution boundary
  tools/manifest_resolver.rs                         # final tool resolver
  session/                                           # session/cache state
  persistence/                                       # durable state
```

Dependency direction is always:

```text
scene / ChatInput
  -> catalog or activation Interface
  -> adapter / runtime service
  -> existing Agent, Skill, Team, persistence, or provider boundary
```

`ChatInput.tsx`, `FlowChatStore.ts`, `ContentCanvas.tsx`, and
`ShortDramaCenterPanel.tsx` remain orchestration hotspots. They may render or
delegate but must not own catalog merging, prompt composition, cache keys,
permission resolution, team lifecycle, filesystem, or provider calls.

### 3. Stable and dynamic prompt-cache identity

Safe prompt order:

```text
stable region
  global contract
  + scenarioVersion
  + executionBaseVersion
  + scenario tool configuration
  + permission envelope

dynamic region
  personaId + personaRevision
  + resolved Skill IDs and revisions
  + current workspace/turn context
```

Minimum identities:

```text
stableSignature =
  scenarioVersion
  + executionBaseVersion
  + toolConfigVersion
  + permissionConfigVersion

dynamicSignature =
  personaId
  + personaRevision
  + resolvedSkillSetHash

completeRuntimeIdentity =
  stableSignature
  + dynamicSignature
  + effectiveToolManifestHash
  + workspaceInstructionHash
  + model/provider prompt-format version
```

The existing `SessionPromptCache` and `SystemPromptCacheIdentity` are preserved
and extended safely. `PromptPrefixIdentity` is not treated as provider cache
proof until its complete path into provider requests is verified. Before that
proof, every complete cache identity includes persona, Skills, effective tools,
permissions, and workspace instructions. A switch may cause one correct cache
miss; it must never reuse the prior persona's complete entry. Code
Agentic/Plan/Debug/Multitask continues to reuse the shared Code base prefix,
while Cowork and Media retain separate scenario prefixes.

### 4. Fixed-team adapters

| Team projection | Existing implementation reused | Lead binding | Invariants |
| --- | --- | --- | --- |
| 代码审查团队 | `launchDeepReviewSession`, Review Team Manifest services, Deep Review prompt, read-only reviewer definitions, `ReviewJudge` | `child_orchestrator` | Preserve Manifest, independent/parallel reviewer packets, concurrency and recovery, quality gate and BTW child session. Analysis reviewers and `ReviewJudge` remain read-only; the orchestrator and user-approved `ReviewFixer` retain their existing controlled writes. |
| AI 短剧团队 | Media parent, `ShortDramaRuntimeBridge`, `ShortDramaStageAgentSessionBinding`, `ShortDramaToolPolicy`, `ShortDramaCenterPanel` | `parent_persona_compatibility` | Preserve five real stage sessions, fixed Skill/tool policy, project facts, attempts/revisions/change requests, media routing and dedicated Canvas |

Both are catalog and activation adapters over existing runtime behavior. Persona
switching cannot cancel work, delete or recreate child sessions, clear history
or Canvas, reset project/media state, or widen permissions.

### 5. Canonical implementation sequence

The only implementation order and gate definition is
[Phase 0 through Phase 8](#file-level-implementation-and-verification-sequence).
The source-grounded contracts in this section refine those phases without
creating a second delivery sequence. Each phase keeps the previous working path
as a rollback route until its focused tests and applicable repository gates
pass; stability failures block visual or authoring expansion.

### 6. Implementation status

As of this specification update:

- the current turn transport, Agent registry/execution path, tool resolver,
  local prompt cache, fixed Deep Review runtime, fixed short-drama runtime,
  BTW, Skill services, permission system, and Canvas behavior exist;
- localized catalog Interfaces, separate parent-session persona persistence,
  the composer persona selector, and structured single-Agent runtime persona
  composition are implemented for the Desktop/Tauri path;
- the Desktop Agent catalog now uses one simplified AI employee-market
  presentation: it preserves the existing left Customization navigation,
  removes the duplicate in-page Agent/Skill/Connector navigation, and renders
  localized employee cards with deterministic reusable portrait assets,
  professional roles, concise descriptions, capability tags, keyboard
  activation, and a detail action. This presentation consumes the existing
  catalog projection and does not own or alter runtime identity, persona
  composition, cache policy, permissions, Team orchestration, or session
  lifecycle;
- the Skills scene removes the duplicate in-page Customization navigation,
  large market hero, and installed-skill side rail. Installed and marketplace
  Skills share a compact toolbar, localized cards, eight-item pagination, and
  a four-column desktop grid that collapses to two and one columns. Existing
  create, import, suite, detail, install, edit, delete, capability-gate, and
  service boundaries remain unchanged. Presentation metadata localizes the 45
  standard user Skills only when their full identity matches
  `user::home.codex::{dirName}`, the raw name still equals the known directory
  ID, they are non-builtin user Skills, and no custom display name exists.
  Project Skills, other source slots, renamed frontmatter, unknown packages,
  raw keys, paths, and marketplace installation matching keep their original
  values;
- Connectors is a registered standalone scene opened directly from the existing
  left navigation. It selects a catalog presentation on the existing
  `McpToolsConfig` infrastructure component instead of routing through
  Settings. The catalog provides search, status filtering, eight-item
  pagination, responsive four/two/one-column cards, configuration details,
  JSON add/configure, server lifecycle actions, deletion, remote auth, OAuth,
  explicit loading/empty/error states, and retry. The default Settings
  presentation remains the compatibility path, and no unavailable remote
  connector store or one-click installation behavior is claimed;
- local cache identity now includes the selected persona key and revision plus
  effective tools and the resolved Skill-set revision. Persona or Skill changes
  therefore miss the complete local system-prompt cache entry safely. The
  rendered request still keeps the scenario/model base before the persona
  overlay, so a provider may reuse an identical byte prefix, but Void neither
  controls nor promises that provider-side KV cache hit.
  Runtime tool exposure remains the intersection of scenario and persona
  policies, then every call is checked again against runtime restrictions and
  the current user permission policy. Skills provide instructions and cannot
  grant tools; neither a persona nor a Skill can widen authority. Permission
  configuration intentionally stays out of the local system-prompt text cache
  key because it does not change that text and is re-read for each execution
  round. Provider KV cache behavior remains provider-owned, so the release
  contract promises identity isolation and correctness rather than a hit rate;
- browser customization runtime support is explicitly gated as unsupported:
  the Agents scene, Agent authoring page, and composer persona selector do not
  call the WebSocket transport while the reachable Server runtime remains
  deferred. This is a capability state, not an implementation of Server
  parity;
- Agent and Skill authoring are implemented behind typed services, including
  validation, immutable runtime IDs, installation/removal rollback, scenario
  eligibility, and structured errors;
- Team definition management is implemented for Desktop/Tauri behind the Team
  Interface: user/project isolation, validated create/edit/install/delete,
  optimistic revision checks, atomic replacement/recovery, bounded packages,
  read-only installed records, and partial diagnostics for corrupt records;
- fixed Deep Review and AI Short Drama teams are catalog/launch adapters over
  their existing runtimes; their manifests, child sessions, Skills, permissions,
  media routing, project state, and Canvas behavior are not reimplemented;
- general user-authored Team activation, `TeamInstance`,
  `TeamOrchestrator`, Team Workspace live-run projection, and Server parity are
  not implemented. Such definitions are explicitly `definition_only` and
  cannot be selected in the composer;
- no provider KV-cache hit rate is promised; correctness and role isolation are
  the release gate.
