import type { CanvasWorkspaceFacts } from './CanvasSurfaceContracts';
import { normalizePath, normalizeRemoteWorkspacePath } from '@/shared/utils/pathUtils';

export interface CanvasWorkspaceSource {
  id: string;
  rootPath: string;
  workspaceKind: 'normal' | 'assistant' | 'remote';
  connectionId?: string;
  sshHost?: string;
}

export function createCanvasWorkspaceFacts(
  workspace: CanvasWorkspaceSource | null | undefined,
): CanvasWorkspaceFacts {
  if (!workspace) {
    return { status: 'unavailable', reason: 'no-workspace' };
  }

  const workspaceId = workspace.id.trim();
  const workspacePath = workspace.rootPath.trim();
  if (!workspaceId || !workspacePath) {
    return { status: 'unavailable', reason: 'invalid-workspace' };
  }

  if (workspace.workspaceKind === 'remote') {
    const remoteConnectionId = workspace.connectionId?.trim();
    if (!remoteConnectionId) {
      return { status: 'unavailable', reason: 'invalid-workspace' };
    }

    const remoteHost = workspace.sshHost?.trim();
    return {
      status: 'ready',
      workspaceId,
      workspacePath,
      backend: 'remote',
      remoteConnectionId,
      ...(remoteHost ? { remoteHost } : {}),
    };
  }

  return {
    status: 'ready',
    workspaceId,
    workspacePath,
    backend: 'local',
  };
}

function normalizeCanvasWorkspacePath(
  path: string,
  backend: 'local' | 'remote',
): string {
  const normalized = backend === 'remote'
    ? normalizeRemoteWorkspacePath(path.trim())
    : normalizePath(path.trim());
  if (normalized === '/' || /^[A-Z]:\/$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\/+$/, '');
}

export function areCanvasWorkspacePathsEquivalent(
  left: string,
  right: string,
  backend: 'local' | 'remote',
): boolean {
  return normalizeCanvasWorkspacePath(left, backend)
    === normalizeCanvasWorkspacePath(right, backend);
}
