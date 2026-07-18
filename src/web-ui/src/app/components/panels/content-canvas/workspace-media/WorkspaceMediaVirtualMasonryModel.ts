const VIRTUALIZATION_THRESHOLD = 60;

export function shouldVirtualizeWorkspaceMediaList(itemCount: number): boolean {
  return itemCount > VIRTUALIZATION_THRESHOLD;
}
