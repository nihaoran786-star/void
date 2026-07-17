import type { CanvasTab, EditorGroupState, SplitMode } from '../types';

export type ShortDramaTeamPanelMode = 'closed' | 'rail' | 'open';

export type ShortDramaTeamPanelPresentation =
  | {
      status: 'inactive';
      mode: 'closed';
      reason:
        | 'unsupported-layout'
        | 'primary-is-not-short-drama'
        | 'secondary-is-empty'
        | 'secondary-has-mixed-content'
        | 'secondary-agent-is-not-active';
      tabs: readonly [];
    }
  | {
      status: 'ready';
      mode: 'rail' | 'open';
      tabs: readonly CanvasTab[];
      activeTabId: string;
    };

export interface ShortDramaTeamPanelPresentationInput {
  splitMode: SplitMode;
  primaryGroup: EditorGroupState;
  secondaryGroup: EditorGroupState;
  expanded: boolean;
}

const activeTab = (group: EditorGroupState): CanvasTab | undefined =>
  group.tabs.find(tab => tab.id === group.activeTabId);

const isShortDramaStageAgentTab = (tab: CanvasTab): boolean =>
  tab.content.type === 'btw-session'
  && typeof tab.content.metadata?.shortDramaStage === 'string';

export function selectShortDramaTeamPanelPresentation({
  splitMode,
  primaryGroup,
  secondaryGroup,
  expanded,
}: ShortDramaTeamPanelPresentationInput): ShortDramaTeamPanelPresentation {
  if (splitMode !== 'horizontal') {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'unsupported-layout',
      tabs: [],
    };
  }

  if (activeTab(primaryGroup)?.content.type !== 'short-drama-center') {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'primary-is-not-short-drama',
      tabs: [],
    };
  }

  const visibleSecondaryTabs = secondaryGroup.tabs.filter(tab => !tab.isHidden);
  if (visibleSecondaryTabs.length === 0) {
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

  const activeSecondaryTab = activeTab(secondaryGroup);
  if (!activeSecondaryTab || !isShortDramaStageAgentTab(activeSecondaryTab)) {
    return {
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-agent-is-not-active',
      tabs: [],
    };
  }

  return {
    status: 'ready',
    mode: expanded ? 'open' : 'rail',
    tabs: visibleSecondaryTabs,
    activeTabId: activeSecondaryTab.id,
  };
}
