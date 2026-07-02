import { isSamePath, joinPath, normalizePath } from '@/shared/utils/pathUtils';
import type { ShortDramaLibraryState, ShortDramaSource, ShortDramaStageAgentSessionCandidate } from './ShortDramaTypes';

export type ShortDramaWorkspaceBindingStatus =
  | 'no_workspace'
  | 'no_project'
  | 'ready'
  | 'mismatch'
  | 'error';

export type ShortDramaWorkspaceBindingSource =
  | 'current_workspace'
  | 'active_session'
  | 'subagent_session'
  | 'explicit_open';

export interface ShortDramaWorkspaceBinding {
  status: ShortDramaWorkspaceBindingStatus;
  source: ShortDramaWorkspaceBindingSource;
  uiWorkspacePath?: string;
  toolWorkspaceRoot?: string;
  projectPath?: string;
  normalizedUiWorkspacePath?: string;
  normalizedToolWorkspaceRoot?: string;
  normalizedProjectPath?: string;
  error?: {
    code: 'missing_workspace' | 'workspace_mismatch' | 'binding_failed';
    message: string;
  };
}

export interface ShortDramaWorkspaceBindingInput {
  uiWorkspacePath?: string;
  toolWorkspaceRoot?: string;
  projectPath?: string;
  hasProject?: boolean;
  source?: ShortDramaWorkspaceBindingSource;
}

export function createShortDramaProjectPath(workspacePath: string): string {
  return joinPath(workspacePath, '.void/short-drama');
}

export function normalizeShortDramaWorkspacePath(path?: string): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) {
    return undefined;
  }

  return normalizePath(trimmed).replace(/\/+$/, '');
}

export function areShortDramaWorkspacePathsEqual(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeShortDramaWorkspacePath(left);
  const normalizedRight = normalizeShortDramaWorkspacePath(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return isSamePath(normalizedLeft, normalizedRight);
}

export function resolveShortDramaWorkspaceBinding(
  input: ShortDramaWorkspaceBindingInput,
): ShortDramaWorkspaceBinding {
  const uiWorkspacePath = trimPath(input.uiWorkspacePath);
  const toolWorkspaceRoot = trimPath(input.toolWorkspaceRoot);
  const inferredProjectPath = uiWorkspacePath ? createShortDramaProjectPath(uiWorkspacePath) : undefined;
  const projectPath = trimPath(input.projectPath) ?? inferredProjectPath;
  const source = input.source ?? 'current_workspace';
  const normalizedUiWorkspacePath = normalizeShortDramaWorkspacePath(uiWorkspacePath);
  const normalizedToolWorkspaceRoot = normalizeShortDramaWorkspacePath(toolWorkspaceRoot);
  const normalizedProjectPath = normalizeShortDramaWorkspacePath(projectPath);

  if (!normalizedUiWorkspacePath && !normalizedToolWorkspaceRoot) {
    return {
      status: 'no_workspace',
      source,
      uiWorkspacePath,
      toolWorkspaceRoot,
      projectPath,
      normalizedUiWorkspacePath,
      normalizedToolWorkspaceRoot,
      normalizedProjectPath,
      error: {
        code: 'missing_workspace',
        message: 'AI short drama needs an active workspace before project state can be read or written.',
      },
    };
  }

  if (normalizedUiWorkspacePath && normalizedToolWorkspaceRoot
    && !areShortDramaWorkspacePathsEqual(normalizedUiWorkspacePath, normalizedToolWorkspaceRoot)) {
    return {
      status: 'mismatch',
      source,
      uiWorkspacePath,
      toolWorkspaceRoot,
      projectPath,
      normalizedUiWorkspacePath,
      normalizedToolWorkspaceRoot,
      normalizedProjectPath,
      error: {
        code: 'workspace_mismatch',
        message: 'AI short drama panel workspace and runtime tool workspace do not match.',
      },
    };
  }

  return {
    status: input.hasProject ? 'ready' : 'no_project',
    source,
    uiWorkspacePath,
    toolWorkspaceRoot: toolWorkspaceRoot ?? uiWorkspacePath,
    projectPath,
    normalizedUiWorkspacePath,
    normalizedToolWorkspaceRoot: normalizedToolWorkspaceRoot ?? normalizedUiWorkspacePath,
    normalizedProjectPath,
  };
}

export function createShortDramaWorkspaceMismatchState(
  binding: Extract<ShortDramaWorkspaceBinding, { status: 'mismatch' }> | ShortDramaWorkspaceBinding,
  source: ShortDramaSource = 'manifest',
): ShortDramaLibraryState {
  return {
    status: 'mismatch',
    source,
    binding,
    error: {
      code: 'workspace_mismatch',
      message: binding.error?.message ?? 'AI short drama panel workspace and runtime tool workspace do not match.',
    },
  };
}

export function filterShortDramaSessionsByWorkspace(
  sessions: ShortDramaStageAgentSessionCandidate[],
  workspacePath?: string,
): ShortDramaStageAgentSessionCandidate[] {
  const normalizedWorkspacePath = normalizeShortDramaWorkspacePath(workspacePath);
  if (!normalizedWorkspacePath) {
    return sessions;
  }

  const scopedSessions = sessions.filter(session => (
    session.workspacePath
    && areShortDramaWorkspacePathsEqual(session.workspacePath, normalizedWorkspacePath)
  ));
  if (scopedSessions.length > 0) {
    return scopedSessions;
  }

  return sessions.filter(session => !session.workspacePath);
}

function trimPath(path?: string) {
  const trimmed = path?.trim();
  return trimmed ? trimmed : undefined;
}
