import { describe, expect, it } from 'vitest';

import {
  readShortDramaStageAgentBindings,
  registerShortDramaStageAgentBindingsFromSessions,
  validateShortDramaStageAgentBindingsAgainstSessions,
  type ShortDramaStageAgentBinding,
} from './ShortDramaStageAgentSessionBinding';
import type { ShortDramaManifestAdapter } from './ShortDramaTypes';

describe('ShortDramaStageAgentSessionBinding', () => {
  it('returns unbound bindings when the workspace has no binding file yet', async () => {
    const result = await readShortDramaStageAgentBindings(createMemoryAdapter({}), 'C:\\workspace\\drama');

    expect(result).toEqual(expect.objectContaining({
      status: 'unbound',
      workspaceRoot: 'C:/workspace/drama',
      projectPath: 'C:/workspace/drama/.void/short-drama',
    }));
    expect(result.status !== 'error' ? result.bindings.map(binding => [binding.stage, binding.status]) : [])
      .toEqual([
        ['script', 'unbound'],
        ['assets', 'unbound'],
        ['storyboards', 'unbound'],
        ['video', 'unbound'],
        ['post', 'unbound'],
      ]);
  });

  it('reports structured errors for corrupted binding JSON', async () => {
    const result = await readShortDramaStageAgentBindings(createMemoryAdapter({
      '.void/short-drama/sessions/stage-agents.json': '{bad',
    }), 'C:/workspace/drama');

    expect(result).toEqual(expect.objectContaining({
      status: 'error',
      source: 'stage-agent-binding-store',
      error: expect.objectContaining({ code: 'binding_invalid' }),
    }));
  });

  it('registers five real native stage agent sessions from the current workspace', async () => {
    const files: Record<string, string> = {};
    const adapter = createMemoryAdapter(files);
    const result = await registerShortDramaStageAgentBindingsFromSessions(
      adapter,
      'C:/workspace/drama',
      [
        { childSessionId: 'script-live', parentSessionId: 'main', subagentType: 'ScriptAI', workspacePath: 'C:/workspace/drama', lastActiveAt: 1 },
        { childSessionId: 'asset-live', parentSessionId: 'main', subagentType: 'AssetAI', workspacePath: 'C:/workspace/drama', lastActiveAt: 2 },
        { childSessionId: 'split-live', parentSessionId: 'main', subagentType: 'SplitAI', workspacePath: 'C:/workspace/drama', lastActiveAt: 3 },
        { childSessionId: 'video-live', parentSessionId: 'main', subagentType: 'VideoAI', workspacePath: 'C:/workspace/drama', lastActiveAt: 4 },
        { childSessionId: 'editor-live', parentSessionId: 'main', subagentType: 'EditorAI', workspacePath: 'C:/workspace/drama', lastActiveAt: 5 },
      ],
      undefined,
      100,
    );

    expect(result.status).toBe('ready');
    expect(result.bindings.map(binding => [binding.stage, binding.childSessionId, binding.status])).toEqual([
      ['script', 'script-live', 'ready'],
      ['assets', 'asset-live', 'ready'],
      ['storyboards', 'split-live', 'ready'],
      ['video', 'video-live', 'ready'],
      ['post', 'editor-live', 'ready'],
    ]);
    expect(JSON.parse(files['.void/short-drama/sessions/stage-agents.json']).workspaceRoot).toBe('C:/workspace/drama');
  });

  it('does not register old synthetic short-drama fake sessions', async () => {
    const result = await registerShortDramaStageAgentBindingsFromSessions(
      createMemoryAdapter({}),
      'C:/workspace/drama',
      [
        { childSessionId: 'short-drama-stage-script', parentSessionId: 'main', subagentType: 'ScriptAI', title: 'Short drama script agent', workspacePath: 'C:/workspace/drama', lastActiveAt: 10 },
      ],
      undefined,
      100,
    );

    expect(result.status).toBe('unchanged');
    const scriptBinding = result.bindings.find(binding => binding.stage === 'script');
    expect(scriptBinding).toEqual(expect.objectContaining({ status: 'unbound' }));
    expect(scriptBinding?.childSessionId).toBeUndefined();
  });

  it('marks a persisted binding as missing when its session is gone from the current session store', () => {
    const binding: ShortDramaStageAgentBinding = {
      stage: 'script',
      agentName: 'ScriptAI',
      childSessionId: 'script-old',
      parentSessionId: 'main-old',
      workspaceRoot: 'C:/workspace/drama',
      status: 'ready',
      source: 'main_ai_wake',
    };

    const result = validateShortDramaStageAgentBindingsAgainstSessions([binding], [], 'C:/workspace/drama', 200);

    expect(result.find(item => item.stage === 'script')).toEqual(expect.objectContaining({
      status: 'missing',
      childSessionId: 'script-old',
      lastValidatedAt: 200,
      error: expect.objectContaining({ code: 'session_missing' }),
    }));
  });

  it('persists a ready binding as missing when the session disappears', async () => {
    const files: Record<string, string> = {};
    const adapter = createMemoryAdapter(files);
    const existing: ShortDramaStageAgentBinding = {
      stage: 'script',
      agentName: 'ScriptAI',
      childSessionId: 'script-old',
      parentSessionId: 'main-old',
      workspaceRoot: 'C:/workspace/drama',
      status: 'ready',
      source: 'main_ai_wake',
    };

    const result = await registerShortDramaStageAgentBindingsFromSessions(
      adapter,
      'C:/workspace/drama',
      [],
      [existing],
      300,
    );

    expect(result.status).toBe('ready');
    expect(result.changedStages).toContain('script');
    expect(result.bindings.find(item => item.stage === 'script')).toEqual(expect.objectContaining({
      status: 'missing',
      childSessionId: 'script-old',
    }));
    const saved = JSON.parse(files['.void/short-drama/sessions/stage-agents.json']);
    expect(saved.bindings.script.status).toBe('missing');
  });

  it('marks a persisted binding as workspace_mismatch instead of reusing another workspace session', () => {
    const binding: ShortDramaStageAgentBinding = {
      stage: 'video',
      agentName: 'VideoAI',
      childSessionId: 'video-live',
      parentSessionId: 'main',
      workspaceRoot: 'C:/workspace/drama',
      status: 'ready',
      source: 'main_ai_wake',
    };

    const result = validateShortDramaStageAgentBindingsAgainstSessions(
      [binding],
      [{ childSessionId: 'video-live', parentSessionId: 'main', subagentType: 'VideoAI', workspacePath: 'C:/other/drama' }],
      'C:/workspace/drama',
      200,
    );

    expect(result.find(item => item.stage === 'video')).toEqual(expect.objectContaining({
      status: 'workspace_mismatch',
      error: expect.objectContaining({ code: 'workspace_mismatch' }),
    }));
  });
});

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
