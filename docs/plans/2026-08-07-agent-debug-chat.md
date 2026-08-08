# Agent Debug Chat Implementation Plan

> **Status: COMPLETE** — all Tasks 1–7 landed on `codex/minimal-workspace-ui`.
> Evidence: `8d0c71491` (T1), `d21054512`+`0978f0766` (T2), `08ef50814`+`50eaac545` (T3),
> `ab174cd1f` (T4), `709ccd2fd` (T5), `d53f10a1d`+`8e7feed5c` (T7 i18n), `16a9daf2a` (T6 sweeper).
> Follow-up stabilization: `f87a450aa` blocks sends during draft replacement,
> keeps the composer bound to the ready fingerprint/session, clears replacement
> feedback after a successful send, and fixes the remaining radius-token use.
> Task 6 also bumped the `AgentsScene.tsx` source-hash contract in
> `AgentsScene.minimal.test.ts` and added a runtime-service mock to `AgentsScene.test.tsx`.
> Verification gate passed: agents-scene tests (92), type-check, lint, build, repo-hygiene,
> core-boundaries.

> The task-by-task instructions below are retained as implementation evidence;
> they are not an active execution queue.

**Goal:** Turn the agent creation page into a two-column "character lab": a real streaming debug chat on the left that runs the current draft (prompt + tools) as a live persona, with the config editor (name / prompt / tools tabs) on the right.

**Architecture:** Reuse the existing custom-subagent runtime end-to-end. A debug "test" saves the current draft as a throwaway `user` subagent (`user::void::<id>`), reads back its content revision (`promptCacheScopeKey`), creates a normal chat session bound to that persona via the existing persona-binding path, and streams turns through the shared chat primitives. The runtime has one hard constraint discovered during research: the persona revision is content-derived and validated per turn (`persona_runtime.rs:442`), so editing the draft invalidates the current session. The panel therefore re-creates the debug session whenever the draft changes (replace semantics) and cleans up the subagent + session on unmount.

**Tech Stack:** TypeScript / React / Zustand (`flow_chat` store) / Tauri invoke (`SubagentAPI`, `AgentAPI`) / Vitest / SCSS design tokens.

---

## Context and verified contracts

These were confirmed by reading the source; do not re-derive during implementation.

- Persona binding for a parent (normal) session is `activePersonaBinding = { kind:'agent', personaId:'user::void::<id>', personaRevision:{ status:'known', value } }`, persisted via `FlowChatManager.updateChatSessionPersona(sessionId, { scenario, executionPolicy, activePersonaBinding })` (`flow_chat/services/FlowChatManager.ts:464`; same primitive used by `useComposerPersonaSelection`).
- Revision value must equal the backend-computed `promptCacheScopeKey`, which is exactly `{system_prompt_cache_identity.scope_key}||{user_context_cache_identity.scope_key}` (`agentic/agents/registry/types.rs:214` = `agentic/agents/registry/query.rs:103`). The web reads it from `SubagentInfo.promptCacheScopeKey` (`customization/adapters/ExistingAgentCatalogAdapter.ts:92`).
- `SubagentAPI.createSubagent({ level:'user', ... })` returns the bare runtime id (e.g. `custom-<uuid>`). When the id is auto-generated, `allowedParentAgentIds` must be non-empty (`apps/desktop/src/api/subagent_api.rs:403`); pass `['agentic']` (the default execution policy). Default tools when omitted are `LS/Read/Glob/Grep`; pass explicit `tools`. New custom subagents default to `Public` exposure, so `agentic` can activate them (`registry/visibility.rs:100`).
- The persona runtime re-resolves the subagent and its revision on **every** turn (`agentic/execution/persona_runtime.rs:406`, `coordination/coordinator.rs:3128`). Mismatch fails the turn. There is no API to rewrite a stored session revision, so a changed draft requires a fresh session.
- `BtwSessionPanel` is child-session-only (`useBtwSessionSnapshots` + `canComposeInChild`), so the debug chat must be a small dedicated panel that reuses the same building blocks: `sessionToVirtualItems`, `VirtualItemRenderer`, `ProcessingIndicator`, `ScrollToBottomButton`, and `ChatInput` (`flow_chat/components/ChatInput.tsx`, hotpot — do not modify it).
- Hotspots that must NOT be modified: `ChatInput.tsx`, `FlowChatStore.ts` (use its public API only), `ContentCanvas.tsx`, `ShortDramaCenterPanel.tsx`.
- `FlowChatManager` already exposes `createChatSession(config, mode)` (`:284`), `updateChatSessionPersona` (`:464`), `sendMessage` (`:567`), `deleteSession` (`:342`), and the store exposes `removeSession`.
- Branch: work continues on `codex/minimal-workspace-ui`. No worktree is used; user works directly on this branch.

## Constraints

- Left/right layout only. Do not change subagent runtime, session creation semantics, catalog, skill policy, or media routing.
- All subagent/session side effects go through `AgentDebugRuntimeService`; UI components never call Tauri APIs directly.
- Keep the debug subagent out of the user's permanent agent list: deterministic display-name marker + cleanup on unmount + a startup sweeper.
- i18n additions go into the `agentsOverview` namespace; run `pnpm run i18n:audit` after any locale change.

---

## Task 1: `computeAgentDraftFingerprint` (pure, TDD)

**Files:**
- Create: `src/web-ui/src/shared/services/customization/AgentDebugDraft.ts`
- Test: `src/web-ui/src/shared/services/customization/AgentDebugDraft.test.ts`

**Step 1: Write the failing test**

```ts
// AgentDebugDraft.test.ts
import { describe, expect, it } from 'vitest';
import { computeAgentDraftFingerprint, type AgentDebugDraft } from './AgentDebugDraft';

const base: AgentDebugDraft = {
  displayName: '测试智能体',
  description: 'desc',
  prompt: 'You are a helper.',
  tools: ['Read', 'Grep'],
  readonly: true,
  review: false,
};

describe('computeAgentDraftFingerprint', () => {
  it('is stable for identical drafts', () => {
    expect(computeAgentDraftFingerprint(base)).toBe(computeAgentDraftFingerprint(base));
  });
  it('changes when the prompt changes', () => {
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, prompt: 'You are a writer.' }),
    );
  });
  it('changes when tools, readonly, or displayName changes', () => {
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, tools: ['Read'] }),
    );
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, readonly: false }),
    );
    expect(computeAgentDraftFingerprint(base)).not.toBe(
      computeAgentDraftFingerprint({ ...base, displayName: '其他' }),
    );
  });
  it('ignores trailing whitespace differences', () => {
    expect(computeAgentDraftFingerprint(base)).toBe(
      computeAgentDraftFingerprint({ ...base, prompt: 'You are a helper.  ' }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir src/web-ui run test:run src/shared/services/customization/AgentDebugDraft.test.ts`
Expected: FAIL (module does not exist).

**Step 3: Write minimal implementation**

```ts
// AgentDebugDraft.ts
export interface AgentDebugDraft {
  displayName: string;
  description: string;
  prompt: string;
  tools: string[];
  readonly: boolean;
  review: boolean;
}

export function computeAgentDraftFingerprint(draft: AgentDebugDraft): string {
  const canonical = JSON.stringify({
    displayName: draft.displayName.trim(),
    description: draft.description.trim(),
    prompt: draft.prompt.trim(),
    tools: Array.from(new Set(draft.tools.map(t => t.trim()))).sort(),
    readonly: draft.readonly,
    review: draft.review,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --dir src/web-ui run test:run src/shared/services/customization/AgentDebugDraft.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/web-ui/src/shared/services/customization/AgentDebugDraft.ts src/web-ui/src/shared/services/customization/AgentDebugDraft.test.ts
git commit -m "feat(agents): add agent debug draft fingerprint"
```

---

## Task 2: `AgentDebugRuntimeService` (runtime bridge, TDD)

**Files:**
- Create: `src/web-ui/src/shared/services/customization/AgentDebugRuntimeService.ts`
- Test: `src/web-ui/src/shared/services/customization/AgentDebugRuntimeService.test.ts`

**Step 1: Write the failing test**

```ts
// AgentDebugRuntimeService.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  DEBUG_SUBAGENT_DISPLAY_PREFIX,
  createAgentDebugRuntime,
  type AgentDebugRuntimeDeps,
} from './AgentDebugRuntimeService';
import { computeAgentDraftFingerprint } from './AgentDebugDraft';

function deps(overrides: Partial<AgentDebugRuntimeDeps> = {}): AgentDebugRuntimeDeps {
  return {
    createSubagent: vi.fn(async () => 'custom-debug-1'),
    listSubagents: vi.fn(async () => [
      { id: 'custom-debug-1', key: 'user::void::custom-debug-1', displayName: '调试草稿·测试智能体', promptCacheScopeKey: 'scope-a||scope-b' } as any,
    ]),
    deleteSubagent: vi.fn(async () => {}),
    createChatSession: vi.fn(async () => 'session-debug-1'),
    persistPersona: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => {}),
    ...overrides,
  };
}

const draft = {
  displayName: '测试智能体',
  description: 'desc',
  prompt: 'You are a helper.',
  tools: ['Read'],
  readonly: true,
  review: false,
};

describe('AgentDebugRuntimeService', () => {
  it('creates a subagent then a persona-bound session and returns a handle', async () => {
    const d = deps();
    const runtime = createAgentDebugRuntime(d);
    const handle = await runtime.createDebugSession(draft, 'D:/ws');

    expect(d.createSubagent).toHaveBeenCalledWith(expect.objectContaining({
      level: 'user',
      displayName: expect.stringContaining(DEBUG_SUBAGENT_DISPLAY_PREFIX),
      allowedParentAgentIds: ['agentic'],
      tools: ['Read'],
    }));
    expect(d.createChatSession).toHaveBeenCalled();
    expect(d.persistPersona).toHaveBeenCalledWith('session-debug-1', {
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: {
        kind: 'agent',
        personaId: 'user::void::custom-debug-1',
        personaRevision: { status: 'known', value: 'scope-a||scope-b' },
      },
    });
    expect(handle).toEqual({
      sessionId: 'session-debug-1',
      subagentId: 'custom-debug-1',
      subagentKey: 'user::void::custom-debug-1',
      draftFingerprint: computeAgentDraftFingerprint(draft),
    });
  });

  it('fails closed when the revision cannot be read back', async () => {
    const d = deps({
      listSubagents: vi.fn(async () => [{ id: 'custom-debug-1', key: 'user::void::custom-debug-1' } as any]),
    });
    await expect(createAgentDebugRuntime(d).createDebugSession(draft, 'D:/ws'))
      .rejects.toThrow(/revision/i);
  });

  it('reuses the session when the draft fingerprint matches', async () => {
    const d = deps();
    const runtime = createAgentDebugRuntime(d);
    const first = await runtime.createDebugSession(draft, 'D:/ws');
    const next = await runtime.prepareForSend(first, draft);
    expect(next.sessionId).toBe(first.sessionId);
    expect(d.createSubagent).toHaveBeenCalledTimes(1);
  });

  it('replaces the session when the draft changed', async () => {
    const d = deps();
    const runtime = createAgentDebugRuntime(d);
    const first = await runtime.createDebugSession(draft, 'D:/ws');
    const changed = await runtime.prepareForSend(first, { ...draft, prompt: 'Now you are a writer.' });
    expect(changed.sessionId).not.toBe(first.sessionId);
    expect(d.deleteSubagent).toHaveBeenCalled();
    expect(d.deleteSession).toHaveBeenCalledWith(first.sessionId);
  });

  it('disposes subagent and session', async () => {
    const d = deps();
    const runtime = createAgentDebugRuntime(d);
    const handle = await runtime.createDebugSession(draft, 'D:/ws');
    await runtime.disposeDebugSession(handle);
    expect(d.deleteSubagent).toHaveBeenCalledWith({ subagentId: 'custom-debug-1', subagentKey: 'user::void::custom-debug-1', workspacePath: undefined });
    expect(d.deleteSession).toHaveBeenCalledWith('session-debug-1');
  });

  it('sweeper deletes only prefixed subagents that are not live', async () => {
    const d = deps({
      listSubagents: vi.fn(async () => [
        { id: 'custom-debug-1', displayName: '调试草稿·测试智能体' } as any,
        { id: 'custom-other', displayName: '我的智能体' } as any,
      ]),
    });
    await createAgentDebugRuntime(d).sweepOrphanedDebugSubagents([]);
    expect(d.deleteSubagent).toHaveBeenCalledTimes(1);
    expect(d.deleteSubagent).toHaveBeenCalledWith(expect.objectContaining({ subagentId: 'custom-debug-1' }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir src/web-ui run test:run src/shared/services/customization/AgentDebugRuntimeService.test.ts`
Expected: FAIL (module does not exist).

**Step 3: Write minimal implementation**

```ts
// AgentDebugRuntimeService.ts
import type { CreateSubagentPayload, DeleteSubagentPayload, SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import type { SessionConfig } from '@/flow_chat/types/flow-chat';
import type { SessionActivePersonaBinding } from '@/shared/types/session-history';
import { computeAgentDraftFingerprint, type AgentDebugDraft } from './AgentDebugDraft';

export const DEBUG_SUBAGENT_DISPLAY_PREFIX = '调试草稿·';
export const DEBUG_EXECUTION_POLICY = 'agentic';
export const DEBUG_SCENARIO = 'code' as const;

export interface AgentDebugSessionHandle {
  sessionId: string;
  subagentId: string;
  subagentKey: string;
  draftFingerprint: string;
}

export interface AgentDebugPersonaState {
  scenario: 'code' | 'cowork' | 'media';
  executionPolicy: string;
  activePersonaBinding: SessionActivePersonaBinding;
}

export interface AgentDebugRuntimeDeps {
  createSubagent: (payload: CreateSubagentPayload) => Promise<string>;
  listSubagents: () => Promise<Array<SubagentInfo & { promptCacheScopeKey?: string }>>;
  deleteSubagent: (payload: DeleteSubagentPayload) => Promise<void>;
  createChatSession: (config: SessionConfig, mode?: string) => Promise<string>;
  persistPersona: (sessionId: string, state: AgentDebugPersonaState) => Promise<void>;
  sendMessage: (sessionId: string, text: string, agentType: string) => Promise<unknown>;
  deleteSession: (sessionId: string) => Promise<unknown>;
}

export const defaultAgentDebugRuntimeDeps = (): AgentDebugRuntimeDeps => {
  const { SubagentAPI } = require('@/infrastructure/api/service-api/SubagentAPI') as typeof import('@/infrastructure/api/service-api/SubagentAPI');
  const { FlowChatManager } = require('@/flow_chat/services/FlowChatManager') as typeof import('@/flow_chat/services/FlowChatManager');
  return {
    createSubagent: payload => SubagentAPI.createSubagent(payload),
    listSubagents: () => SubagentAPI.listSubagents(),
    deleteSubagent: payload => SubagentAPI.deleteSubagent(payload),
    createChatSession: (config, mode) => FlowChatManager.getInstance().createChatSession(config, mode),
    persistPersona: (sessionId, state) => FlowChatManager.getInstance().updateChatSessionPersona(sessionId, state),
    sendMessage: (sessionId, text, agentType) => FlowChatManager.getInstance().sendMessage(sessionId, text, agentType),
    deleteSession: sessionId => FlowChatManager.getInstance().deleteSession(sessionId),
  };
};

function personaStateFor(handle: { subagentKey: string; personaRevision: string }): AgentDebugPersonaState {
  return {
    scenario: DEBUG_SCENARIO,
    executionPolicy: DEBUG_EXECUTION_POLICY,
    activePersonaBinding: {
      kind: 'agent',
      personaId: handle.subagentKey,
      personaRevision: { status: 'known', value: handle.personaRevision },
    },
  };
}

export function createAgentDebugRuntime(deps: AgentDebugRuntimeDeps) {
  async function createDebugSession(draft: AgentDebugDraft, workspacePath: string): Promise<AgentDebugSessionHandle> {
    const subagentId = await deps.createSubagent({
      level: 'user',
      displayName: `${DEBUG_SUBAGENT_DISPLAY_PREFIX}${draft.displayName}`,
      description: draft.description,
      prompt: draft.prompt,
      tools: draft.tools,
      allowedParentAgentIds: [DEBUG_EXECUTION_POLICY],
      readonly: draft.readonly,
      review: draft.review,
      workspacePath,
    });
    const subagents = await deps.listSubagents();
    const info = subagents.find(item => item.id === subagentId);
    const revision = info?.promptCacheScopeKey?.trim();
    if (!revision) {
      throw new Error('Agent debug revision unavailable; cannot bind the persona.');
    }
    const sessionId = await deps.createChatSession({}, DEBUG_EXECUTION_POLICY);
    const handle: AgentDebugSessionHandle = {
      sessionId,
      subagentId,
      subagentKey: `user::void::${subagentId}`,
      draftFingerprint: computeAgentDraftFingerprint(draft),
    };
    await deps.persistPersona(sessionId, personaStateFor({ subagentKey: handle.subagentKey, personaRevision: revision }));
    return handle;
  }

  async function prepareForSend(
    current: AgentDebugSessionHandle | null,
    draft: AgentDebugDraft,
    workspacePath: string,
  ): Promise<AgentDebugSessionHandle> {
    if (current && current.draftFingerprint === computeAgentDraftFingerprint(draft)) {
      return current;
    }
    if (current) {
      await disposeDebugSession(current);
    }
    return createDebugSession(draft, workspacePath);
  }

  async function disposeDebugSession(handle: AgentDebugSessionHandle): Promise<void> {
    try {
      await deps.deleteSession(handle.sessionId);
    } finally {
      await deps.deleteSubagent({
        subagentKey: handle.subagentKey,
        subagentId: handle.subagentId,
        workspacePath: undefined,
      });
    }
  }

  async function sweepOrphanedDebugSubagents(liveIds: string[]): Promise<number> {
    const live = new Set(liveIds);
    let removed = 0;
    const subagents = await deps.listSubagents();
    for (const item of subagents) {
      const name = item.displayName ?? item.name ?? '';
      if (name.startsWith(DEBUG_SUBAGENT_DISPLAY_PREFIX) && !live.has(item.id)) {
        await deps.deleteSubagent({ subagentId: item.id, subagentKey: item.key, workspacePath: undefined });
        removed += 1;
      }
    }
    return removed;
  }

  return { createDebugSession, prepareForSend, disposeDebugSession, sweepOrphanedDebugSubagents };
}
```

> Note: use static imports at the top of the real file instead of `require`; the injected `deps` are what make it testable. `require` appears here only to show the intended wiring shape.

**Step 4: Run test to verify it passes**

Run: `pnpm --dir src/web-ui run test:run src/shared/services/customization/AgentDebugRuntimeService.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/web-ui/src/shared/services/customization/AgentDebugRuntimeService.ts src/web-ui/src/shared/services/customization/AgentDebugRuntimeService.test.ts
git commit -m "feat(agents): add agent debug runtime service"
```

---

## Task 3: `useAgentDebugSession` hook (lifecycle)

**Files:**
- Create: `src/web-ui/src/app/scenes/agents/hooks/useAgentDebugSession.ts`
- Test: `src/web-ui/src/app/scenes/agents/hooks/useAgentDebugSession.test.tsx`

**Behavior**

State machine: `'idle' | 'creating' | 'ready' | 'stale' | 'error'`.

- `idle`: draft invalid (`organizeAgentDraft` not valid) → panel shows the empty state.
- On mount with a valid draft: create the debug session eagerly so the composer is live ("chat input directly triggers" — no extra button).
- When the draft becomes invalid after a session exists: dispose it, go `idle`.
- When the draft fingerprint changes (debounced ~800ms) and a session exists: dispose current, create a fresh one, transition `ready` (stale) → set `justReplaced = true` so the panel shows "草稿已更新，测试已重置". Keep `sessionId` pointing at the NEW empty session.
- `send(text)`: `runtime.prepareForSend(handle, draft, workspacePath)` then `runtime.deps.sendMessage(handle.sessionId, text, 'agentic')`. The hook owns the handle, so ChatInput simply renders against `handle.sessionId` and the store send path drives the turn.
- On unmount: `disposeDebugSession` for the live handle; registry of live subagent ids updated for the sweeper.
- On error: surface `error` state with a retry action.

**Step 1: Write the failing test**

```tsx
// useAgentDebugSession.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAgentDebugSession } from './useAgentDebugSession';

const validDraft = {
  displayName: 'A', description: 'd', prompt: 'p', tools: ['Read'],
  readonly: true, review: false,
};

function makeRuntime() {
  const createDebugSession = vi.fn(async (draft: unknown, ws: string) => ({
    sessionId: 's1', subagentId: 'custom-debug-1', subagentKey: 'user::void::custom-debug-1', draftFingerprint: 'f1',
  }));
  const prepareForSend = vi.fn(async (current: unknown, draft: unknown) => ({
    sessionId: current ? 's2' : 's1', subagentId: 'custom-debug-2', subagentKey: 'user::void::custom-debug-2', draftFingerprint: 'f2',
  }));
  const disposeDebugSession = vi.fn(async () => {});
  const sendMessage = vi.fn(async () => {});
  return { runtime: { createDebugSession, prepareForSend, disposeDebugSession, deps: { sendMessage } } as any, sendMessage, disposeDebugSession };
}

describe('useAgentDebugSession', () => {
  it('creates a session when the draft is valid', async () => {
    const { runtime } = makeRuntime();
    const { result } = renderHook(() => useAgentDebugSession({ draft: validDraft, workspacePath: 'D:/ws', runtime: runtime.runtime }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(runtime.runtime.createDebugSession).toHaveBeenCalled();
    expect(result.current.sessionId).toBe('s1');
  });
  it('replaces the session when the draft changes', async () => {
    const { runtime } = makeRuntime();
    const { result, rerender } = renderHook(({ draft }) => useAgentDebugSession({ draft, workspacePath: 'D:/ws', runtime: runtime.runtime }), { initialProps: { draft: validDraft } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ draft: { ...validDraft, prompt: 'changed' } });
    await waitFor(() => expect(result.current.sessionId).toBe('s2'));
    expect(runtime.disposeDebugSession).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir src/web-ui run test:run src/app/scenes/agents/hooks/useAgentDebugSession.test.tsx`
Expected: FAIL.

**Step 3: Implement the hook**

Use a `useRef`-based handle, `useEffect` watching the debounced fingerprint, `useCallback` for `send`, and a `useEffect` cleanup that disposes on unmount. Keep all orchestration here (not in `FlowChatStore`). Skip full listing — mirror the store patterns in the repo and the contract above; keep it under ~120 lines.

**Step 4: Run test to verify it passes**

Run: `pnpm --dir src/web-ui run test:run src/app/scenes/agents/hooks/useAgentDebugSession.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/web-ui/src/app/scenes/agents/hooks/useAgentDebugSession.ts src/web-ui/src/app/scenes/agents/hooks/useAgentDebugSession.test.tsx
git commit -m "feat(agents): add agent debug session lifecycle hook"
```

---

## Task 4: `AgentDebugChatPanel` (left panel view)

**Files:**
- Create: `src/web-ui/src/app/scenes/agents/components/AgentDebugChatPanel.tsx`
- Create: `src/web-ui/src/app/scenes/agents/components/AgentDebugChatPanel.scss`
- Test: `src/web-ui/src/app/scenes/agents/components/AgentDebugChatPanel.test.tsx`

**Structure** (reuse BtwSessionPanel patterns, not its child-session semantics):

```tsx
export interface AgentDebugChatPanelProps {
  session?: Session | null;
  status: 'idle' | 'creating' | 'ready' | 'stale' | 'error';
  draftFingerprint: string;
  justReplaced?: boolean;
  error?: string | null;
  onRetry?: () => void;
}
```

- Header: title (i18n `agentsOverview.debug.title`, e.g. "试炼场") + draft fingerprint badge + status pill.
- Body: `sessionToVirtualItems(session)` → `VirtualItemRenderer` list + `ProcessingIndicator` + `ScrollToBottomButton` (copy the scroll-affordance/auto-scroll logic from `BtwSessionPanel`; it is presentation-only).
- Empty state (`idle`): icon + "完成名称和提示词后，这里就可以和草稿对话测试了" (`agentsOverview.debug.empty`).
- `creating`: spinner + `agentsOverview.debug.creating`.
- `stale`/`justReplaced` banner: "草稿已更新，测试已重置，发送下一条消息将使用新草稿" (`agentsOverview.debug.stale`) — rendered above the conversation, auto-dismisses on first send.
- `error`: message + retry button (`agentsOverview.debug.error` / `.retry`).
- Composer: `<ChatInput sessionId={session.sessionId} className="void-chat-input--embedded" />` (shown only when `ready`/`stale` and `session` exists). Do NOT add props to ChatInput.

**Step 1: Write the failing test**

Render each state (idle/creating/ready/stale/error) with a mocked `sessionToVirtualItems`-friendly session object (mirror `BtwSessionPanel.presentation.test.tsx` session fixtures) and assert the expected testid/labels render. Assert the composer is absent in `idle` and present in `ready`.

**Step 2: Run test to verify it fails**

Run: `pnpm --dir src/web-ui run test:run src/app/scenes/agents/components/AgentDebugChatPanel.test.tsx`
Expected: FAIL.

**Step 3: Implement the panel + SCSS using design tokens (`--workspace-*`, `--flowchat-*`, `--border-*`, `--status-*`)**

**Step 4: Run test to verify it passes**

Run: `pnpm --dir src/web-ui run test:run src/app/scenes/agents/components/AgentDebugChatPanel.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/web-ui/src/app/scenes/agents/components/AgentDebugChatPanel.tsx src/web-ui/src/app/scenes/agents/components/AgentDebugChatPanel.scss src/web-ui/src/app/scenes/agents/components/AgentDebugChatPanel.test.tsx
git commit -m "feat(agents): add agent debug chat panel"
```

---

## Task 5: `CreateAgentPage` two-column refactor

**Files:**
- Modify: `src/web-ui/src/app/scenes/agents/components/CreateAgentPage.tsx`
- Modify: `src/web-ui/src/app/scenes/agents/components/CreateAgentPage.scss`
- Modify: `src/web-ui/src/app/scenes/agents/components/CreateAgentPage.test.tsx`

**Layout**

```
┌────────────────────────────────────┬─────────────────────────┐
│ AgentDebugChatPanel (left, 1fr)    │ Character sheet + tabs  │
│  real streaming chat vs draft      │  avatar / name / level  │
│                                    │  [名称|提示词|工具]      │
│                                    │  ...existing form       │
│                                    │  [保存智能体]            │
└────────────────────────────────────┴─────────────────────────┘
```

- Wrap the existing form sections (name/description/scenarios, prompt template editor, tool toggles, readonly/review) into tab panels. Add a minimal `activeTab` state: `'name' | 'prompt' | 'tools'`. Reuse existing section components as-is; do not rewrite validation logic.
- Character sheet header: current displayName (or placeholder), scenario chips, tool count as a "level" badge. Pure presentation, derived from existing state.
- Keep `handleSubmit` (create/update subagent) and navigation behavior unchanged.
- Wire `useAgentDebugSession` with the live draft state; pass session/status into `AgentDebugChatPanel`.
- On unmount (navigating back / after save), the hook disposes the debug subagent + session.
- Toggle: when `isEdit` mode is active, still show the debug panel (same flow; the draft is the editing form's state).

**Step 1: write/adjust failing tests**

Existing `CreateAgentPage.test.tsx` must keep passing; add a case that a valid draft yields a ready debug panel and that navigating back disposes (mock the runtime).

**Step 2-4: implement, run, verify**

Run: `pnpm --dir src/web-ui run test:run src/app/scenes/agents/components/CreateAgentPage.test.tsx src/app/scenes/agents/components/AgentDebugChatPanel.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/web-ui/src/app/scenes/agents/components/CreateAgentPage.tsx src/web-ui/src/app/scenes/agents/components/CreateAgentPage.scss src/web-ui/src/app/scenes/agents/components/CreateAgentPage.test.tsx
git commit -m "feat(agents): two-column character lab layout for agent creation"
```

---

## Task 6: Startup sweeper for orphaned debug subagents

**Files:**
- Modify: `src/web-ui/src/app/scenes/agents/AgentsScene.tsx` (or the agent overview page root)

On the agent overview page mount, call `runtime.sweepOrphanedDebugSubagents(liveIds)` (live ids from the debug-session registry) in a fire-and-forget promise, log the removed count via the repo logger, and surface nothing in the UI. This bounds crashes that leaked `调试草稿·*` subagents.

**Verify** by unit test on the service (already covered in Task 2) + a manual check that leftover `user_agents_dir` markdown files are removed on next app start.

**Commit**

```bash
git add src/web-ui/src/app/scenes/agents/AgentsScene.tsx
git commit -m "feat(agents): sweep orphaned debug subagents on startup"
```

---

## Task 7: i18n + verification gate

**Files:**
- Modify: `src/web-ui/src/locales/zh-CN/common.json` and `en-US/common.json` (namespace `agentsOverview`)

Add keys: `debug.title`, `debug.empty`, `debug.creating`, `debug.stale`, `debug.error`, `debug.retry`, `debug.tab.name`, `debug.tab.prompt`, `debug.tab.tools`.

**Verification (smallest matching checks, then widen):**

```powershell
pnpm run i18n:audit
pnpm run type-check:web
pnpm --dir src/web-ui run test:run src/shared/services/customization/AgentDebugDraft.test.ts src/shared/services/customization/AgentDebugRuntimeService.test.ts src/app/scenes/agents
pnpm --dir src/web-ui run lint
pnpm run build:web
pnpm run check:repo-hygiene
pnpm run check:core-boundaries
```

Manual gate (only if a Core/transport/desktop path changed, otherwise optional):
`pnpm run desktop:build:fast` then validate the two-column page with a Per-Monitor-V2 DWM screenshot (see repo screenshot guidance).

Do not claim E2E, desktop packaging, Clippy, or Rust formatting as passing unless actually run; known baseline gaps are in `docs/qa/repository-stability-audit-2026-07-28.md`.

**Commit**

```bash
git add src/web-ui/src/locales/zh-CN/common.json src/web-ui/src/locales/en-US/common.json
git commit -m "feat(agents): i18n labels for agent debug chat"
```

---

## Known limitations (documented, not silently hidden)

- **Skills / MCP are not testable at agent level.** Custom subagents expose prompt + tools + readonly/review + model only; skill keys and connector tool membership are team-level concepts. The "技能" tab maps to the tools picker; a disabled MCP tab with a hint is acceptable in this iteration.
- **Transient artifacts.** Each draft change writes one `{user_agents_dir}/{id}.md` and one empty session. They are disposed on replacement/unmount and swept at startup. A hard crash can still leak until the next app start.
- **Model override** for the debug subagent (via `update_subagent_config`) is out of scope for this iteration; the draft page does not yet set per-agent model.
- **Provider-backed manual response:** automated coverage verifies the real
  Flow Chat send path, temporary-persona binding, replacement races, cleanup,
  and startup sweeping. A manual model response still depends on a configured
  Desktop provider and remains part of full-window acceptance rather than a
  transport implementation gap.
