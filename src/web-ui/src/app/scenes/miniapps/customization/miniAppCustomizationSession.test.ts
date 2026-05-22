import { describe, expect, it } from 'vitest';
import { buildMiniAppCustomizationSessionRequest } from './miniAppCustomizationSession';

describe('buildMiniAppCustomizationSessionRequest', () => {
  it('creates a hidden non-persisted agent session for MiniApp customization', () => {
    expect(buildMiniAppCustomizationSessionRequest({
      sessionId: 'miniapp-customize:builtin-gomoku:1',
      sessionName: 'Customize Gomoku',
      workspacePath: 'D:/workspace/Void',
    })).toMatchObject({
      sessionId: 'miniapp-customize:builtin-gomoku:1',
      sessionName: 'Customize Gomoku',
      agentType: 'agentic',
      workspacePath: 'D:/workspace/Void',
      sessionKind: 'subagent',
      config: {
        enableTools: true,
        safeMode: true,
        autoCompact: true,
        enableContextCompression: true,
      },
    });
  });
});
