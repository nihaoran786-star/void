import { describe, expect, it } from 'vitest';

import { createShortDramaWorkspaceModeState, isShortDramaMediaSession } from './ShortDramaWorkspaceMode';
import type { ShortDramaStageAgentBinding } from './ShortDramaStageAgentSessionBinding';

describe('ShortDramaWorkspaceMode', () => {
  it('allows only Media parent sessions to open short drama workspace mode', () => {
    expect(isShortDramaMediaSession({ sessionId: 'media', mode: 'Media' })).toBe(true);
    expect(isShortDramaMediaSession({ sessionId: 'code', mode: 'agentic' })).toBe(false);
    expect(isShortDramaMediaSession({ sessionId: 'child', mode: 'Media', sessionKind: 'subagent' })).toBe(false);
  });

  it('returns disabled state with a clear diagnostic for non-media sessions', () => {
    const state = createShortDramaWorkspaceModeState({
      workspaceRoot: 'C:/work',
      sourceSession: { sessionId: 'code', mode: 'agentic' },
    });

    expect(state).toEqual(expect.objectContaining({
      status: 'disabled',
      isMediaSession: false,
      sourceSessionId: 'code',
    }));
    expect(state.diagnostics[0]).toEqual(expect.objectContaining({ code: 'media_session_required' }));
  });

  it('aggregates five stage binding statuses into ready and partial workspace states', () => {
    const ready = createShortDramaWorkspaceModeState({
      workspaceRoot: 'C:/work',
      sourceSession: { sessionId: 'media', mode: 'Media' },
      bindings: createBindings(['ready', 'ready', 'ready', 'ready', 'ready']),
    });
    const partial = createShortDramaWorkspaceModeState({
      workspaceRoot: 'C:/work',
      sourceSession: { sessionId: 'media', mode: 'Media' },
      bindings: createBindings(['ready', 'missing', 'ready', 'unbound', 'ready']),
    });

    expect(ready.status).toBe('ready');
    expect(partial.status).toBe('partial');
    expect(partial.diagnostics.map(item => item.stage)).toEqual(['assets', 'video']);
  });
});

function createBindings(statuses: ShortDramaStageAgentBinding['status'][]): ShortDramaStageAgentBinding[] {
  const stages: ShortDramaStageAgentBinding['stage'][] = ['script', 'assets', 'storyboards', 'video', 'post'];
  const agentNames: ShortDramaStageAgentBinding['agentName'][] = ['ScriptAI', 'AssetAI', 'SplitAI', 'VideoAI', 'EditorAI'];
  return statuses.map((status, index) => ({
    stage: stages[index],
    agentName: agentNames[index],
    workspaceRoot: 'C:/work',
    status,
    source: 'main_ai_wake',
  }));
}
