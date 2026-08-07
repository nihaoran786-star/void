import { describe, expect, it, vi } from 'vitest';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';

vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({}),
  },
}));

import {
  createAgentDebugRuntime,
  DEBUG_EXECUTION_POLICY,
  DEBUG_SUBAGENT_DISPLAY_PREFIX,
  type AgentDebugRuntimeDeps,
} from './AgentDebugRuntimeService';
import {
  computeAgentDraftFingerprint,
  type AgentDebugDraft,
} from './AgentDebugDraft';

const draft: AgentDebugDraft = {
  displayName: '测试智能体',
  description: 'desc',
  prompt: 'You are a helper.',
  tools: ['Read', 'Grep'],
  readonly: true,
  review: false,
};

function subagentEntry(
  id: string,
  promptCacheScopeKey: string = 'scope-a||scope-b',
): SubagentInfo & { promptCacheScopeKey: string } {
  return {
    key: `user::void::${id}`,
    id,
    name: `${DEBUG_SUBAGENT_DISPLAY_PREFIX}测试智能体`,
    description: 'desc',
    isReadonly: true,
    isReview: false,
    toolCount: 2,
    defaultTools: ['Read', 'Grep'],
    defaultEnabled: true,
    effectiveEnabled: true,
    promptCacheScopeKey,
  };
}

type DebugRuntimeMocks = {
  createSubagent: ReturnType<typeof vi.fn>;
  listSubagents: ReturnType<typeof vi.fn>;
  deleteSubagent: ReturnType<typeof vi.fn>;
  createChatSession: ReturnType<typeof vi.fn>;
  persistPersona: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
};

function createRuntime(overrides: Partial<DebugRuntimeMocks> = {}) {
  const createSubagent =
    overrides.createSubagent ?? vi.fn().mockResolvedValue('custom-debug-1');
  const listSubagents =
    overrides.listSubagents ?? vi.fn().mockResolvedValue([subagentEntry('custom-debug-1')]);
  const deleteSubagent = overrides.deleteSubagent ?? vi.fn().mockResolvedValue(undefined);
  const createChatSession =
    overrides.createChatSession ?? vi.fn().mockResolvedValue('session-1');
  const persistPersona = overrides.persistPersona ?? vi.fn().mockResolvedValue(undefined);
  const sendMessage = overrides.sendMessage ?? vi.fn().mockResolvedValue(undefined);
  const deleteSession = overrides.deleteSession ?? vi.fn().mockResolvedValue(undefined);

  const deps: AgentDebugRuntimeDeps = {
    createSubagent,
    listSubagents,
    deleteSubagent,
    createChatSession,
    persistPersona,
    sendMessage,
    deleteSession,
  };

  return {
    runtime: createAgentDebugRuntime(deps),
    createSubagent,
    listSubagents,
    deleteSubagent,
    createChatSession,
    persistPersona,
    sendMessage,
    deleteSession,
  };
}

describe('AgentDebugRuntimeService', () => {
  it('creates a subagent then a persona-bound session', async () => {
    const mocks = createRuntime();
    const workspacePath = 'D:/repo';

    const handle = await mocks.runtime.createDebugSession(draft, workspacePath);

    expect(mocks.createSubagent).toHaveBeenCalledWith({
      level: 'user',
      displayName: `${DEBUG_SUBAGENT_DISPLAY_PREFIX}测试智能体`,
      description: 'desc',
      prompt: 'You are a helper.',
      tools: ['Read', 'Grep'],
      allowedParentAgentIds: ['agentic'],
      readonly: true,
      review: false,
      workspacePath,
    });
    expect(mocks.createChatSession).toHaveBeenCalledWith({}, DEBUG_EXECUTION_POLICY);
    expect(mocks.persistPersona).toHaveBeenCalledWith('session-1', {
      scenario: 'code',
      executionPolicy: DEBUG_EXECUTION_POLICY,
      activePersonaBinding: {
        kind: 'agent',
        personaId: 'user::void::custom-debug-1',
        personaRevision: { status: 'known', value: 'scope-a||scope-b' },
      },
    });
    expect(handle).toEqual({
      sessionId: 'session-1',
      subagentId: 'custom-debug-1',
      subagentKey: 'user::void::custom-debug-1',
      draftFingerprint: computeAgentDraftFingerprint(draft),
    });
  });

  it('fails closed when the revision cannot be read back', async () => {
    const mocks = createRuntime({
      listSubagents: vi.fn().mockResolvedValue([subagentEntry('custom-debug-1')].map(entry => {
        const { promptCacheScopeKey, ...rest } = entry;
        return rest;
      })),
    });

    await expect(
      mocks.runtime.createDebugSession(draft, 'D:/repo'),
    ).rejects.toThrow('Agent debug revision unavailable; cannot bind the persona.');
    expect(mocks.createChatSession).not.toHaveBeenCalled();
    expect(mocks.persistPersona).not.toHaveBeenCalled();
  });

  it('reuses the session when the draft fingerprint matches', async () => {
    const mocks = createRuntime();

    const first = await mocks.runtime.createDebugSession(draft, 'D:/repo');
    const prepared = await mocks.runtime.prepareForSend(first, draft, 'D:/repo');

    expect(prepared.sessionId).toBe(first.sessionId);
    expect(mocks.createSubagent).toHaveBeenCalledTimes(1);
  });

  it('replaces the session when the draft changed', async () => {
    const createdIds: string[] = [];
    const mocks = createRuntime({
      createSubagent: vi.fn().mockImplementation(async () => {
        const id = `custom-debug-${createdIds.length + 1}`;
        createdIds.push(id);
        return id;
      }),
      listSubagents: vi.fn().mockImplementation(async () =>
        createdIds.map(id => subagentEntry(id)),
      ),
      createChatSession: vi
        .fn()
        .mockResolvedValueOnce('session-1')
        .mockResolvedValueOnce('session-2'),
    });

    const first = await mocks.runtime.createDebugSession(draft, 'D:/repo');
    const changedDraft: AgentDebugDraft = { ...draft, prompt: 'You are a writer.' };
    const prepared = await mocks.runtime.prepareForSend(first, changedDraft, 'D:/repo');

    expect(prepared.sessionId).toBe('session-2');
    expect(prepared.subagentId).toBe('custom-debug-2');
    expect(mocks.deleteSession).toHaveBeenCalledWith('session-1');
    expect(mocks.deleteSubagent).toHaveBeenCalledWith({
      subagentKey: 'user::void::custom-debug-1',
      subagentId: 'custom-debug-1',
      workspacePath: undefined,
    });
    expect(mocks.createSubagent).toHaveBeenCalledTimes(2);
  });

  it('disposes the session and the subagent', async () => {
    const mocks = createRuntime();

    const handle = await mocks.runtime.createDebugSession(draft, 'D:/repo');
    await mocks.runtime.disposeDebugSession(handle);

    expect(mocks.deleteSession).toHaveBeenCalledWith('session-1');
    expect(mocks.deleteSubagent).toHaveBeenCalledWith({
      subagentKey: 'user::void::custom-debug-1',
      subagentId: 'custom-debug-1',
      workspacePath: undefined,
    });
  });

  it('sweeps only prefixed non-live subagents', async () => {
    const mocks = createRuntime({
      listSubagents: vi.fn().mockResolvedValue([
        { ...subagentEntry('debug-1'), name: `${DEBUG_SUBAGENT_DISPLAY_PREFIX}Orphan` },
        { ...subagentEntry('debug-2'), name: `${DEBUG_SUBAGENT_DISPLAY_PREFIX}Live` },
        { ...subagentEntry('plain-1'), name: 'Plain agent' },
      ]),
    });

    const removed = await mocks.runtime.sweepOrphanedDebugSubagents(['debug-2']);

    expect(removed).toBe(1);
    expect(mocks.deleteSubagent).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSubagent).toHaveBeenCalledWith({
      subagentKey: 'user::void::debug-1',
      subagentId: 'debug-1',
      workspacePath: undefined,
    });
  });
});
