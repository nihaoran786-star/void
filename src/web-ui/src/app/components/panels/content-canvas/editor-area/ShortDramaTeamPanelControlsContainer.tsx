import React from 'react';

import type { CanvasTab } from '../types';
import type { ShortDramaTeamPanelMode } from './shortDramaTeamPanelPresentation';
import { ShortDramaTeamPanelControls } from './ShortDramaTeamPanelControls';
import { useShortDramaTeamStatusProjection } from './useShortDramaTeamStatusProjection';

export interface ShortDramaTeamPanelControlsContainerProps {
  mode: Exclude<ShortDramaTeamPanelMode, 'closed'>;
  tabs: readonly CanvasTab[];
  activeTabId: string;
  onToggle: () => void;
  onSelectTab: (tabId: string) => void;
}

export const ShortDramaTeamPanelControlsContainer: React.FC<
  ShortDramaTeamPanelControlsContainerProps
> = props => {
  const statuses = useShortDramaTeamStatusProjection(props.tabs);
  return <ShortDramaTeamPanelControls {...props} statuses={statuses} />;
};

ShortDramaTeamPanelControlsContainer.displayName = 'ShortDramaTeamPanelControlsContainer';

export default ShortDramaTeamPanelControlsContainer;
