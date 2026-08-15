import { describe, expect, it } from 'vitest';

import {
  areCanvasWorkspacePathsEquivalent,
  createCanvasWorkspaceFacts,
} from './CanvasWorkspaceFacts';

describe('createCanvasWorkspaceFacts', () => {
  it.each([null, undefined])('marks %s as no workspace', workspace => {
    expect(createCanvasWorkspaceFacts(workspace)).toEqual({
      status: 'unavailable',
      reason: 'no-workspace',
    });
  });

  it.each([
    { id: ' ', rootPath: 'C:/work', workspaceKind: 'normal' as const },
    { id: 'workspace-1', rootPath: ' ', workspaceKind: 'assistant' as const },
  ])('rejects incomplete stable workspace identity', workspace => {
    expect(createCanvasWorkspaceFacts(workspace)).toEqual({
      status: 'unavailable',
      reason: 'invalid-workspace',
    });
  });

  it('treats normal and assistant workspaces as local backends', () => {
    expect(createCanvasWorkspaceFacts({
      id: ' workspace-normal ',
      rootPath: ' C:/work ',
      workspaceKind: 'normal',
    })).toEqual({
      status: 'ready',
      workspaceId: 'workspace-normal',
      workspacePath: 'C:/work',
      backend: 'local',
    });
    expect(createCanvasWorkspaceFacts({
      id: 'workspace-assistant',
      rootPath: 'C:/assistant',
      workspaceKind: 'assistant',
    })).toMatchObject({
      status: 'ready',
      workspaceId: 'workspace-assistant',
      backend: 'local',
    });
  });

  it('preserves remote workspace identity instead of reducing it to a path', () => {
    const facts = createCanvasWorkspaceFacts({
      id: 'workspace-remote-1',
      rootPath: '/srv/app',
      workspaceKind: 'remote',
      connectionId: 'connection-1',
      sshHost: 'build-host',
    });

    expect(facts).toEqual({
      status: 'ready',
      workspaceId: 'workspace-remote-1',
      workspacePath: '/srv/app',
      backend: 'remote',
      remoteConnectionId: 'connection-1',
      remoteHost: 'build-host',
    });
  });

  it('fails closed when a remote transport route is unavailable', () => {
    expect(createCanvasWorkspaceFacts({
      id: 'workspace-remote-1',
      rootPath: '/srv/app',
      workspaceKind: 'remote',
      sshHost: 'build-host',
    })).toEqual({
      status: 'unavailable',
      reason: 'invalid-workspace',
    });
  });

  it('keeps the stable scope across reconnects and separates equal paths by workspace id', () => {
    const remoteA = createCanvasWorkspaceFacts({
      id: 'workspace-remote-a',
      rootPath: '/srv/app',
      workspaceKind: 'remote',
      connectionId: 'connection-old',
      sshHost: 'host-a',
    });
    const reconnectedA = createCanvasWorkspaceFacts({
      id: 'workspace-remote-a',
      rootPath: '/srv/app',
      workspaceKind: 'remote',
      connectionId: 'connection-new',
      sshHost: 'host-a',
    });
    const remoteB = createCanvasWorkspaceFacts({
      id: 'workspace-remote-b',
      rootPath: '/srv/app',
      workspaceKind: 'remote',
      connectionId: 'connection-b',
      sshHost: 'host-b',
    });

    expect(remoteA.status === 'ready' && remoteA.workspaceId).toBe('workspace-remote-a');
    expect(reconnectedA.status === 'ready' && reconnectedA.workspaceId).toBe('workspace-remote-a');
    expect(remoteA.status === 'ready' && remoteA.backend === 'remote'
      && remoteA.remoteConnectionId).toBe('connection-old');
    expect(reconnectedA.status === 'ready' && reconnectedA.backend === 'remote'
      && reconnectedA.remoteConnectionId).toBe('connection-new');
    expect(remoteB.status === 'ready' && remoteB.workspaceId).toBe('workspace-remote-b');
  });

  it('treats trailing separators as equivalent without collapsing distinct paths', () => {
    expect(areCanvasWorkspacePathsEquivalent('C:/work', 'C:/work/', 'local')).toBe(true);
    expect(areCanvasWorkspacePathsEquivalent('/srv/app', '/srv/app/', 'remote')).toBe(true);
    expect(areCanvasWorkspacePathsEquivalent('/srv/app-a', '/srv/app-b', 'remote')).toBe(false);
  });
});
