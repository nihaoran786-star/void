export function joinWorkspaceMediaPath(workspacePath: string, relativePathValue: string): string {
  const trimmedWorkspace = workspacePath.replace(/[\\/]+$/, '');
  const separator = trimmedWorkspace.includes('\\') && !trimmedWorkspace.includes('/') ? '\\' : '/';
  return `${trimmedWorkspace}${separator}${relativePathValue.replace(/\//g, separator)}`;
}

export function workspaceMediaGeneratedDirectory(workspacePath: string): string {
  return joinWorkspaceMediaPath(workspacePath, 'media/generated');
}

export function workspaceMediaInputDirectory(workspacePath: string): string {
  return joinWorkspaceMediaPath(workspacePath, 'media/input');
}
