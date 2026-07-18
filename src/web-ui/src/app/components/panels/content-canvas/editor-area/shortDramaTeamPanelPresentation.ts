import type { CanvasTab, EditorGroupState, SplitMode } from '../types';
import type { WorkspacePresentation } from '@/app/presentation/workspacePresentation';
import { areShortDramaWorkspacePathsEqual } from '@/shared/services/short-drama/ShortDramaWorkspaceBinding';

export type ShortDramaTeamPanelMode = 'closed' | 'rail' | 'open';

export type ShortDramaTeamPanelPresentation =
  | {
      status: 'inactive';
      mode: 'closed';
      reason:
        | 'unsupported-layout'
        | 'classic-presentation'
        | 'primary-is-not-short-drama'
        | 'secondary-is-empty'
        | 'secondary-has-mixed-content'
        | 'secondary-workspace-mismatch';
      tabs: readonly [];
    }
  | {
      status: 'ready';
      mode: 'rail' | 'open';
      tabs: readonly CanvasTab[];
      activeTabId: string;
      primarySurfaceKey: string;
      teamIdentity: string;
    };

export interface ShortDramaTeamPanelPresentationInput {
  presentation: WorkspacePresentation;
  splitMode: SplitMode;
  primaryGroup: EditorGroupState;
  secondaryGroup: EditorGroupState;
  expandedPrimarySurfaceKey: string | null;
}

const activeTab = (group: EditorGroupState): CanvasTab | undefined =>
  group.tabs.find(tab => tab.id === group.activeTabId);

const isShortDramaStageAgentTab = (tab: CanvasTab): boolean =>
  tab.content.type === 'btw-session'
  && typeof tab.content.metadata?.shortDramaStage === 'string';

const isShortDramaWorkspaceTab = (tab: CanvasTab): boolean =>
  tab.content.type === 'short-drama-center'
  || tab.content.type === 'workspace-media-gallery';

const primarySurfaceKeyForTab = (tab: CanvasTab): string =>
  `${tab.id}:${tab.content.type}`;

const workspacePathForTab = (tab: CanvasTab): string | undefined => {
  const data = tab.content.data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  return typeof data.workspacePath === 'string' ? data.workspacePath : undefined;
};

const stageAgentMatchesWorkspace = (
  tab: CanvasTab,
  workspacePath: string | undefined,
  requireExplicitWorkspace: boolean,
): boolean => {
  const stageWorkspacePath = tab.content.metadata?.shortDramaWorkspacePath;
  if (
    requireExplicitWorkspace
    && (
      !workspacePath
      || typeof stageWorkspacePath !== 'string'
      || stageWorkspacePath.length === 0
    )
  ) {
    return false;
  }
  if (
    !workspacePath
    || typeof stageWorkspacePath !== 'string'
    || stageWorkspacePath.length === 0
  ) {
    return true;
  }
  return areShortDramaWorkspacePathsEqual(stageWorkspacePath, workspacePath);
};

const teamIdentityFor = (
  primarySurfaceKey: string,
  tabs: readonly CanvasTab[],
): string => JSON.stringify([
  primarySurfaceKey,
  ...tabs.map(tab => tab.id).sort(),
]);

export function selectShortDramaTeamPanelPresentation({
  presentation,
  splitMode,
  primaryGroup,
  secondaryGroup,
  expandedPrimarySurfaceKey,
}: ShortDramaTeamPanelPresentationInput): ShortDramaTeamPanelPresentation {
  if (presentation !== 'minimal') {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'classic-presentation',
      tabs: [],
    };
  }

  if (splitMode !== 'horizontal') {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'unsupported-layout',
      tabs: [],
    };
  }

  const activePrimaryTab = activeTab(primaryGroup);
  if (!activePrimaryTab || !isShortDramaWorkspaceTab(activePrimaryTab)) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'primary-is-not-short-drama',
      tabs: [],
    };
  }

  const visibleSecondaryTabs = secondaryGroup.tabs.filter(tab => !tab.isHidden);
  if (
    activePrimaryTab.content.type === 'workspace-media-gallery'
    && visibleSecondaryTabs.length === 0
  ) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-is-empty',
      tabs: [],
    };
  }
  if (!visibleSecondaryTabs.every(isShortDramaStageAgentTab)) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-has-mixed-content',
      tabs: [],
    };
  }
  const primaryWorkspacePath = workspacePathForTab(activePrimaryTab);
  const requireExplicitWorkspace = (
    activePrimaryTab.content.type === 'workspace-media-gallery'
  );
  if (!visibleSecondaryTabs.every(
    tab => stageAgentMatchesWorkspace(
      tab,
      primaryWorkspacePath,
      requireExplicitWorkspace,
    ),
  )) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-workspace-mismatch',
      tabs: [],
    };
  }

  const activeSecondaryTab = visibleSecondaryTabs.find(
    tab => tab.id === secondaryGroup.activeTabId,
  );
  const primarySurfaceKey = primarySurfaceKeyForTab(activePrimaryTab);
  const teamIdentity = teamIdentityFor(primarySurfaceKey, visibleSecondaryTabs);

  return {
    status: 'ready',
    mode: visibleSecondaryTabs.length > 0
      && expandedPrimarySurfaceKey === primarySurfaceKey
      ? 'open'
      : 'rail',
    tabs: visibleSecondaryTabs,
    activeTabId: activeSecondaryTab?.id ?? '',
    primarySurfaceKey,
    teamIdentity,
  };
}
