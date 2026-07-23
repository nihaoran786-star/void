import React from 'react';

import type { CanvasTab } from '../types';
import { ShortDramaTeamPanelControls } from './ShortDramaTeamPanelControls';
import { useShortDramaTeamStatusProjection } from './useShortDramaTeamStatusProjection';

export interface ShortDramaTeamPanelControlsContainerProps {
  tabs: readonly CanvasTab[];
  onToggle: () => void;
}

export const ShortDramaTeamPanelControlsContainer: React.FC<
  ShortDramaTeamPanelControlsContainerProps
> = props => {
  const statuses = useShortDramaTeamStatusProjection(props.tabs);
  return <ShortDramaTeamPanelControls {...props} statuses={statuses} />;
};

ShortDramaTeamPanelControlsContainer.displayName = 'ShortDramaTeamPanelControlsContainer';

export default ShortDramaTeamPanelControlsContainer;
