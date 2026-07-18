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

export interface ShortDramaTeamLayoutRecoveryInput {
  presentation: WorkspacePresentation;
  splitMode: SplitMode;
  primaryGroup: EditorGroupState;
  secondaryGroup: EditorGroupState;
}

export type ShortDramaTeamLayoutRecovery =
  | { status: 'stable' }
  | {
      status: 'recoverable';
      primarySurfaceTabId: string;
      misplacedTabs: ReadonlyArray<{
        tabId: string;
        fromGroupId: 'primary';
      }>;
    };

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

/**
 * Detects the persisted layout shown by the duplicate-team-pane bug:
 * a short-drama surface still exists in primary, but one or more of its real
 * stage-agent tabs were restored beside it while the remaining team is in
 * secondary. This selector is intentionally conservative and never mutates
 * tabs; EditorArea executes the returned move plan through existing store
 * actions.
 */
export function selectShortDramaTeamLayoutRecovery({
  presentation,
  splitMode,
  primaryGroup,
  secondaryGroup,
}: ShortDramaTeamLayoutRecoveryInput): ShortDramaTeamLayoutRecovery {
  if (presentation !== 'minimal' || splitMode !== 'horizontal') {
    return { status: 'stable' };
  }

  const visiblePrimaryTabs = primaryGroup.tabs.filter(tab => !tab.isHidden);
  const primarySurfaceTab = visiblePrimaryTabs.find(tab => (
    isShortDramaWorkspaceTab(tab)
    && typeof workspacePathForTab(tab) === 'string'
    && workspacePathForTab(tab)!.length > 0
  ));
  if (!primarySurfaceTab) {
    return { status: 'stable' };
  }

  const workspacePath = workspacePathForTab(primarySurfaceTab);
  const visibleSecondaryTabs = secondaryGroup.tabs.filter(tab => !tab.isHidden);
  if (!visibleSecondaryTabs.every(tab => (
    isShortDramaStageAgentTab(tab)
    && stageAgentMatchesWorkspace(tab, workspacePath, true)
  ))) {
    return { status: 'stable' };
  }

  const misplacedTabs = visiblePrimaryTabs
    .filter(tab => (
      tab.id !== primarySurfaceTab.id
      && isShortDramaStageAgentTab(tab)
      && stageAgentMatchesWorkspace(tab, workspacePath, true)
    ))
    .map(tab => ({
      tabId: tab.id,
      fromGroupId: 'primary' as const,
    }));

  if (misplacedTabs.length === 0) {
    return { status: 'stable' };
  }

  return {
    status: 'recoverable',
    primarySurfaceTabId: primarySurfaceTab.id,
    misplacedTabs,
  };
}

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
