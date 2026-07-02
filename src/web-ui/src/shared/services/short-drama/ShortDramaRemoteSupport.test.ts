import { describe, expect, it } from 'vitest';

import { evaluateShortDramaWorkspaceSupport } from './ShortDramaRemoteSupport';

describe('ShortDramaRemoteSupport', () => {
  it('returns ready for local workspace manifest adapters', () => {
    const support = evaluateShortDramaWorkspaceSupport({
      workspacePath: 'C:/workspace',
      adapterKind: 'local',
    });

    expect(support).toEqual({
      status: 'ready',
      source: 'short-drama-remote-support',
      workspacePath: 'C:/workspace',
      adapterKind: 'local',
    });
  });

  it('returns unsupported for remote workspace manifest adapters without falling back to an empty project', () => {
    const support = evaluateShortDramaWorkspaceSupport({
      workspacePath: 'ssh://studio/project',
      adapterKind: 'remote',
    });

    expect(support).toEqual({
      status: 'unsupported',
      source: 'short-drama-remote-support',
      workspacePath: 'ssh://studio/project',
      adapterKind: 'remote',
      error: {
        code: 'remote_workspace',
        message: 'Remote short drama manifests are not supported yet.',
      },
    });
  });

  it('returns an explicit error when no workspace path is available', () => {
    const support = evaluateShortDramaWorkspaceSupport({
      workspacePath: '',
      adapterKind: 'local',
    });

    expect(support).toEqual({
      status: 'error',
      source: 'short-drama-remote-support',
      adapterKind: 'local',
      error: {
        code: 'missing_workspace',
        message: 'A workspace is required to load the short drama center.',
      },
    });
  });
});
