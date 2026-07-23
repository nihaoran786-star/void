import type { CanvasTab, EditorGroupId, EditorGroupState, SplitMode } from '../types';
import type { WorkspacePresentation } from '@/app/presentation/workspacePresentation';
import { areShortDramaWorkspacePathsEqual } from '@/shared/services/short-drama/ShortDramaWorkspaceBinding';
import type { ShortDramaStage } from '@/shared/services/short-drama';
import { getCanvasTabDisplayTitle } from '../tab-bar/canvasTabPresentation';

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

export type ShortDramaTeamTabCloseAction = 'collapse-team' | 'close-tab';

export function selectShortDramaTeamTabCloseAction(input: {
  groupId: EditorGroupId;
  tabId: string;
  presentation: ShortDramaTeamPanelPresentation;
}): ShortDramaTeamTabCloseAction {
  const { groupId, tabId, presentation } = input;
  if (
    groupId === 'secondary'
    && presentation.status === 'ready'
    && presentation.tabs.length === 1
    && presentation.tabs[0]?.id === tabId
  ) {
    return 'collapse-team';
  }
  return 'close-tab';
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

const shortDramaStageOrder: Readonly<Record<ShortDramaStage, number>> = {
  script: 0,
  assets: 1,
  storyboards: 2,
  video: 3,
  post: 4,
};

const isShortDramaStage = (value: unknown): value is ShortDramaStage =>
  value === 'script'
  || value === 'assets'
  || value === 'storyboards'
  || value === 'video'
  || value === 'post';

const isShortDramaStageAgentTab = (tab: CanvasTab): boolean =>
  tab.content.type === 'btw-session'
  && isShortDramaStage(tab.content.metadata?.shortDramaStage);

const shortDramaStageForTab = (tab: CanvasTab): ShortDramaStage | null => {
  const stage = tab.content.metadata?.shortDramaStage;
  return isShortDramaStage(stage) ? stage : null;
};

export function orderShortDramaTeamTabs(
  tabs: readonly CanvasTab[],
): CanvasTab[] {
  return [...tabs].sort((left, right) => {
    const leftStage = shortDramaStageForTab(left);
    const rightStage = shortDramaStageForTab(right);
    const leftOrder = leftStage ? shortDramaStageOrder[leftStage] : Number.MAX_SAFE_INTEGER;
    const rightOrder = rightStage ? shortDramaStageOrder[rightStage] : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export function getShortDramaTeamTabDisplayTitle(
  tab: CanvasTab,
  translate: (key: string) => string,
): string {
  return getCanvasTabDisplayTitle(tab, translate);
}

export function projectShortDramaTeamGroup(
  group: EditorGroupState,
  translate: (key: string) => string,
): EditorGroupState {
  const stageTabs = orderShortDramaTeamTabs(
    group.tabs.filter(isShortDramaStageAgentTab),
  );
  const activeTabId = stageTabs.some(tab => tab.id === group.activeTabId)
    ? group.activeTabId
    : stageTabs[0]?.id ?? null;
  return {
    ...group,
    activeTabId,
    tabs: stageTabs.map(tab => {
      const title = getShortDramaTeamTabDisplayTitle(tab, translate);
      if (title === tab.title && title === tab.content.title) {
        return tab;
      }
      return {
        ...tab,
        title,
        content: {
          ...tab.content,
          title,
        },
      };
    }),
  };
}

const isShortDramaWorkspaceTab = (tab: CanvasTab): boolean =>
  tab.content.type === 'short-drama-center'
  || tab.content.type === 'workspace-media-gallery';

const shortDramaSurfaceTab = (
  group: EditorGroupState,
): CanvasTab | undefined => {
  const active = activeTab(group);
  if (active && isShortDramaWorkspaceTab(active)) {
    return active;
  }

  const visibleSurfaces = group.tabs.filter(tab => (
    !tab.isHidden && isShortDramaWorkspaceTab(tab)
  ));
  return visibleSurfaces.find(tab => tab.content.type === 'short-drama-center')
    ?? visibleSurfaces[0];
};

const workspacePathForTab = (tab: CanvasTab): string | undefined => {
  const data = tab.content.data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  return typeof data.workspacePath === 'string' ? data.workspacePath : undefined;
};

const primarySurfaceKeyForTab = (tab: CanvasTab): string => {
  if (isShortDramaWorkspaceTab(tab)) {
    const workspacePath = workspacePathForTab(tab);
    if (workspacePath) {
      return `short-drama-workspace:${workspacePath}`;
    }
  }
  return `${tab.id}:${tab.content.type}`;
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

  const activePrimaryTab = shortDramaSurfaceTab(primaryGroup);
  if (!activePrimaryTab) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'primary-is-not-short-drama',
      tabs: [],
    };
  }

  const visibleSecondaryTabs = secondaryGroup.tabs.filter(tab => !tab.isHidden);
  const visibleStageAgentTabs = visibleSecondaryTabs.filter(isShortDramaStageAgentTab);
  if (
    activePrimaryTab.content.type === 'workspace-media-gallery'
    && visibleStageAgentTabs.length === 0
  ) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-is-empty',
      tabs: [],
    };
  }
  if (!visibleSecondaryTabs.every(tab => tab.content.type === 'btw-session')) {
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
  if (!visibleStageAgentTabs.every(
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

  const activeSecondaryTab = visibleStageAgentTabs.find(
    tab => tab.id === secondaryGroup.activeTabId,
  );
  const orderedSecondaryTabs = orderShortDramaTeamTabs(visibleStageAgentTabs);
  const primarySurfaceKey = primarySurfaceKeyForTab(activePrimaryTab);
  const teamIdentity = teamIdentityFor(primarySurfaceKey, orderedSecondaryTabs);

  return {
    status: 'ready',
    mode: visibleSecondaryTabs.length > 0
      && expandedPrimarySurfaceKey === primarySurfaceKey
      ? 'open'
      : 'rail',
    tabs: orderedSecondaryTabs,
    activeTabId: activeSecondaryTab?.id ?? '',
    primarySurfaceKey,
    teamIdentity,
  };
}
