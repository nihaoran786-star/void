import { describe, expect, it } from 'vitest';

import { createShortDramaStageAgentHistoricalSessionRestores } from './ShortDramaStageAgentSessionHydration';
import type { ShortDramaStageAgentBinding, ShortDramaStageAgentSessionCandidate } from '@/shared/services/short-drama';

describe('ShortDramaStageAgentSessionHydration', () => {
  it('creates metadata-only restore specs for persisted stage agent bindings missing from the runtime store', () => {
    const bindings: ShortDramaStageAgentBinding[] = [
      {
        stage: 'script',
        agentName: 'ScriptAI',
        childSessionId: 'script-session',
        parentSessionId: 'media-parent',
        workspaceRoot: 'C:/work',
        status: 'ready',
        source: 'main_ai_wake',
        createdAt: 10,
        updatedAt: 20,
      },
      {
        stage: 'assets',
        agentName: 'AssetAI',
        childSessionId: 'asset-session',
        parentSessionId: 'media-parent',
        workspaceRoot: 'C:/work',
        status: 'ready',
        source: 'main_ai_wake',
      },
    ];

    const sessions: ShortDramaStageAgentSessionCandidate[] = [
      { childSessionId: 'asset-session', parentSessionId: 'media-parent', subagentType: 'AssetAI', workspacePath: 'C:/work' },
    ];

    const restores = createShortDramaStageAgentHistoricalSessionRestores({
      bindings,
      sessions,
      workspaceRoot: 'C:\\work',
    });

    expect(restores).toEqual([
      {
        stage: 'script',
        agentName: 'ScriptAI',
        childSessionId: 'script-session',
        parentSessionId: 'media-parent',
        workspaceRoot: 'C:/work',
        createdAt: 10,
        lastActiveAt: 20,
      },
    ]);
  });

  it('does not restore bindings from another workspace', () => {
    const bindings: ShortDramaStageAgentBinding[] = [
      {
        stage: 'video',
        agentName: 'VideoAI',
        childSessionId: 'video-session',
        parentSessionId: 'media-parent',
        workspaceRoot: 'C:/other',
        status: 'ready',
        source: 'main_ai_wake',
      },
    ];

    const restores = createShortDramaStageAgentHistoricalSessionRestores({
      bindings,
      sessions: [],
      workspaceRoot: 'C:/work',
    });

    expect(restores).toEqual([]);
  });
});
