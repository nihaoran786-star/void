export const WORKSPACE_MEDIA_OPEN_EVENT = 'void:open-workspace-media';

export type WorkspaceMediaOpenEventDetail =
  | {
      source: 'capability-rail';
      sourceSessionId?: string;
      workspaceId?: string;
      workspacePath?: string;
    }
  | {
      source: 'restore';
      sourceSessionId: string;
      workspaceId: string;
      workspacePath: string;
    };

export function dispatchWorkspaceMediaOpen(
  detail: WorkspaceMediaOpenEventDetail,
): void {
  window.dispatchEvent(new CustomEvent<WorkspaceMediaOpenEventDetail>(
    WORKSPACE_MEDIA_OPEN_EVENT,
    { detail },
  ));
}

export function readWorkspaceMediaOpenEventDetail(
  event: Event,
): WorkspaceMediaOpenEventDetail | undefined {
  if (event instanceof CustomEvent) {
    const detail = event.detail as Partial<WorkspaceMediaOpenEventDetail> | undefined;
    if (detail?.source === 'restore') {
      if (
        typeof detail.sourceSessionId !== 'string'
        || !detail.sourceSessionId.trim()
        || typeof detail.workspaceId !== 'string'
        || !detail.workspaceId.trim()
        || typeof detail.workspacePath !== 'string'
        || !detail.workspacePath.trim()
      ) {
        return undefined;
      }
      return {
        source: 'restore',
        sourceSessionId: detail.sourceSessionId,
        workspaceId: detail.workspaceId,
        workspacePath: detail.workspacePath,
      };
    }
    if (detail?.source === 'capability-rail') {
      return {
        source: 'capability-rail',
        ...(typeof detail.sourceSessionId === 'string' && detail.sourceSessionId
          ? { sourceSessionId: detail.sourceSessionId }
          : {}),
        ...(typeof detail.workspaceId === 'string' && detail.workspaceId
          ? { workspaceId: detail.workspaceId }
          : {}),
        ...(typeof detail.workspacePath === 'string' && detail.workspacePath
          ? { workspacePath: detail.workspacePath }
          : {}),
      };
    }
  }
  return { source: 'capability-rail' };
}
