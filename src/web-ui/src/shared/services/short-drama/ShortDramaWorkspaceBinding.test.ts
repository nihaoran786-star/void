import { describe, expect, it } from 'vitest';

import {
  filterShortDramaSessionsByWorkspace,
  resolveShortDramaWorkspaceBinding,
} from './ShortDramaWorkspaceBinding';

describe('ShortDramaWorkspaceBinding', () => {
  it('reports no_workspace when neither UI nor tool runtime has a workspace root', () => {
    expect(resolveShortDramaWorkspaceBinding({})).toEqual(expect.objectContaining({
      status: 'no_workspace',
      error: expect.objectContaining({ code: 'missing_workspace' }),
    }));
  });

  it('detects mismatched UI and runtime workspaces after path normalization', () => {
    const binding = resolveShortDramaWorkspaceBinding({
      uiWorkspacePath: 'C:\\workspaces\\drama',
      toolWorkspaceRoot: 'C:/other/drama',
      projectPath: 'C:/other/drama/.void/short-drama',
      hasProject: true,
    });

    expect(binding).toEqual(expect.objectContaining({
      status: 'mismatch',
      error: expect.objectContaining({ code: 'workspace_mismatch' }),
      normalizedUiWorkspacePath: 'C:/workspaces/drama',
      normalizedToolWorkspaceRoot: 'C:/other/drama',
    }));
  });

  it('prefers same-workspace subagent sessions over legacy unscoped sessions', () => {
    const sessions = [
      {
        childSessionId: 'legacy-script',
        subagentType: 'ScriptAI',
        title: 'ScriptAI: legacy',
      },
      {
        childSessionId: 'current-script',
        subagentType: 'ScriptAI',
        title: 'ScriptAI: current',
        workspacePath: 'C:/workspaces/drama',
      },
      {
        childSessionId: 'other-script',
        subagentType: 'ScriptAI',
        title: 'ScriptAI: other',
        workspacePath: 'C:/other/drama',
      },
    ];

    expect(filterShortDramaSessionsByWorkspace(sessions, 'C:\\workspaces\\drama\\'))
      .toEqual([expect.objectContaining({ childSessionId: 'current-script' })]);
  });
});
