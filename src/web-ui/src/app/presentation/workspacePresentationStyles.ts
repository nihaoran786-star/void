import {
  readWorkspacePresentation,
  type WorkspacePresentation,
} from './workspacePresentation';

export async function loadWorkspacePresentationStyles(
  presentation: WorkspacePresentation = readWorkspacePresentation(),
): Promise<void> {
  if (presentation !== 'minimal') {
    return;
  }

  await import('./minimalWorkspacePresentation.scss');
}
