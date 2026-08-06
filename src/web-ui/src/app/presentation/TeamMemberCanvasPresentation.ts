import type {
  CanvasTab,
  EditorGroupId,
  EditorGroupState,
} from '@/app/components/panels/content-canvas/types';
import { areShortDramaWorkspacePathsEqual } from '@/shared/services/short-drama';

export interface TeamMemberCanvasGateway {
  primaryGroup: EditorGroupState;
  secondaryGroup: EditorGroupState;
  tertiaryGroup: EditorGroupState;
  closeTab(
    tabId: string,
    groupId: EditorGroupId,
    options?: { forceRemove?: boolean },
  ): void;
}

export interface TeamMemberCanvasCleanupScope {
  parentSessionId: string;
  workspacePath?: string;
  memberChildSessionIds?: readonly string[];
  removeShortDramaWorkspaceTabs?: boolean;
}

/**
 * Keeps the durable Team workspace as the only Team-member chat surface.
 * This only changes Canvas presentation state; child sessions, task runs and
 * domain artifacts remain intact.
 */
export function removeDuplicateTeamMemberCanvasTabs(
  canvas: TeamMemberCanvasGateway,
  scope: TeamMemberCanvasCleanupScope,
): number {
  const memberChildSessionIds = new Set(scope.memberChildSessionIds ?? []);
  const matches: Array<{ tabId: string; groupId: EditorGroupId }> = [];
  const groups: Array<{ groupId: EditorGroupId; group: EditorGroupState }> = [
    { groupId: 'primary', group: canvas.primaryGroup },
    { groupId: 'secondary', group: canvas.secondaryGroup },
    { groupId: 'tertiary', group: canvas.tertiaryGroup },
  ];

  for (const { groupId, group } of groups) {
    for (const tab of group.tabs) {
      if (isDuplicateTeamMemberTab(tab, scope, memberChildSessionIds)) {
        matches.push({ tabId: tab.id, groupId });
      }
    }
  }

  for (const match of matches) {
    canvas.closeTab(match.tabId, match.groupId, { forceRemove: true });
  }
  return matches.length;
}

function isDuplicateTeamMemberTab(
  tab: CanvasTab,
  scope: TeamMemberCanvasCleanupScope,
  memberChildSessionIds: ReadonlySet<string>,
): boolean {
  if (tab.content.type !== 'btw-session') return false;

  const metadata = tab.content.metadata ?? {};
  const data = tab.content.data as {
    childSessionId?: string;
    parentSessionId?: string;
  } | undefined;
  const childSessionId = typeof data?.childSessionId === 'string'
    ? data.childSessionId
    : typeof metadata.childSessionId === 'string'
      ? metadata.childSessionId
      : undefined;
  if (childSessionId && memberChildSessionIds.has(childSessionId)) return true;

  if (
    scope.removeShortDramaWorkspaceTabs !== true
    || typeof metadata.shortDramaStage !== 'string'
  ) return false;

  const parentSessionId = typeof data?.parentSessionId === 'string'
    ? data.parentSessionId
    : typeof metadata.parentSessionId === 'string'
      ? metadata.parentSessionId
      : undefined;
  if (parentSessionId === scope.parentSessionId) return true;

  const tabWorkspacePath = typeof metadata.shortDramaWorkspacePath === 'string'
    ? metadata.shortDramaWorkspacePath
    : undefined;
  return Boolean(
    tabWorkspacePath
      && scope.workspacePath
      && areShortDramaWorkspacePathsEqual(tabWorkspacePath, scope.workspacePath),
  );
}
