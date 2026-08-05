export interface WorkspaceReadinessSnapshot {
  currentWorkspacePath: string | null;
  openedWorkspacePaths: string[];
  managerCurrentWorkspacePath: string | null;
  managerLoading: boolean;
  applicationShellReady: boolean;
}

export function isWorkspaceReady(
  state: WorkspaceReadinessSnapshot,
  workspacePath: string,
): boolean {
  return state.currentWorkspacePath === workspacePath
    && state.openedWorkspacePaths.includes(workspacePath)
    && state.managerCurrentWorkspacePath === workspacePath
    && !state.managerLoading
    && state.applicationShellReady;
}
