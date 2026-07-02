import { describe, expect, it, vi } from 'vitest';

import { ensureShortDramaStageAgentSessions } from './ShortDramaStageAgentBootstrap';
import type { Session } from '@/flow_chat/types/flow-chat';
import type { ShortDramaManifestAdapter, ShortDramaStageAgentSessionCandidate } from '@/shared/services/short-drama';

describe('ShortDramaStageAgentBootstrap', () => {
  it('creates five missing real stage subagent sessions and persists ready bindings', async () => {
    const files: Record<string, string> = {};
    const createSession = vi.fn(async (request: any) => ({
      sessionId: `${request.agentType.toLowerCase()}-session`,
      sessionName: request.sessionName,
      agentType: request.agentType,
    }));
    const addSessionToStore = vi.fn();

    const result = await ensureShortDramaStageAgentSessions({
      adapter: createMemoryAdapter(files),
      workspaceRoot: 'C:\\work',
      parentSession: createParentSession(),
      sessions: [],
      existingBindings: [],
      createSession,
      addSessionToStore,
    });

    expect(result.status).toBe('ready');
    expect(result.createdStages).toEqual(['script', 'assets', 'storyboards', 'video', 'post']);
    expect(createSession).toHaveBeenCalledTimes(5);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'ScriptAI',
      sessionKind: 'subagent',
      relationship: expect.objectContaining({
        kind: 'subagent',
        parentSessionId: 'media-parent',
        subagentType: 'ScriptAI',
      }),
    }));
    expect(addSessionToStore).toHaveBeenCalledTimes(5);
    const saved = JSON.parse(files['.void/short-drama/sessions/stage-agents.json']);
    expect(saved.bindings.script).toEqual(expect.objectContaining({
      childSessionId: 'scriptai-session',
      parentSessionId: 'media-parent',
      status: 'ready',
    }));
  });

  it('does not recreate already ready stage agents', async () => {
    const sessions: ShortDramaStageAgentSessionCandidate[] = [
      { childSessionId: 'script-live', parentSessionId: 'media-parent', subagentType: 'ScriptAI', workspacePath: 'C:/work' },
    ];
    const createSession = vi.fn(async (request: any) => ({
      sessionId: `${request.agentType.toLowerCase()}-session`,
      sessionName: request.sessionName,
      agentType: request.agentType,
    }));

    const result = await ensureShortDramaStageAgentSessions({
      adapter: createMemoryAdapter({}),
      workspaceRoot: 'C:/work',
      parentSession: createParentSession(),
      sessions,
      existingBindings: [{
        stage: 'script',
        agentName: 'ScriptAI',
        childSessionId: 'script-live',
        parentSessionId: 'media-parent',
        workspaceRoot: 'C:/work',
        status: 'ready',
        source: 'main_ai_wake',
      }],
      createSession,
      addSessionToStore: vi.fn(),
    });

    expect(result.status).toBe('ready');
    expect(createSession).toHaveBeenCalledTimes(4);
    expect(result.bindings.find(binding => binding.stage === 'script')).toEqual(expect.objectContaining({
      childSessionId: 'script-live',
      status: 'ready',
    }));
  });

  it('returns partial when one stage agent fails to create', async () => {
    const createSession = vi.fn(async (request: any) => {
      if (request.agentType === 'VideoAI') {
        throw new Error('provider unavailable');
      }
      return {
        sessionId: `${request.agentType.toLowerCase()}-session`,
        sessionName: request.sessionName,
        agentType: request.agentType,
      };
    });

    const result = await ensureShortDramaStageAgentSessions({
      adapter: createMemoryAdapter({}),
      workspaceRoot: 'C:/work',
      parentSession: createParentSession(),
      sessions: [],
      existingBindings: [],
      createSession,
      addSessionToStore: vi.fn(),
    });

    expect(result.status).toBe('partial');
    expect(result.errors).toEqual([expect.objectContaining({
      stage: 'video',
      code: 'stage_agent_create_failed',
    })]);
    expect(result.bindings.find(binding => binding.stage === 'video')).toEqual(expect.objectContaining({
      status: 'unbound',
    }));
  });
});

function createParentSession(): Session {
  return {
    sessionId: 'media-parent',
    title: 'Media',
    mode: 'Media',
    sessionKind: 'normal',
    config: { modelName: 'fast' },
    workspacePath: 'C:/work',
    workspaceId: 'workspace-1',
    dialogTurns: [],
    status: 'idle',
    createdAt: 1,
    lastActiveAt: 1,
    maxContextTokens: 128128,
    error: null,
    btwThreads: [],
  } as unknown as Session;
}

function createMemoryAdapter(files: Record<string, string>): ShortDramaManifestAdapter {
  return {
    kind: 'local',
    async read(key: string) {
      return files[key];
    },
    async write(key: string, value: string) {
      files[key] = value;
    },
  };
}
