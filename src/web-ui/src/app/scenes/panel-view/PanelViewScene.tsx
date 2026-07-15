/**
 * PanelViewScene — a standalone scene that hosts a ContentCanvas
 * with its own independent store (panel-view mode).
 *
 * Tabs popped out from the agent scene's right panel are added here,
 * allowing them all to be viewed and managed in one place.
 */

import React, { useCallback } from 'react';
import { ContentCanvas, CanvasStoreModeContext } from '../../components/panels/content-canvas';
import './PanelViewScene.scss';

interface PanelViewSceneProps {
  workspacePath?: string;
  isActive?: boolean;
}

const PanelViewScene: React.FC<PanelViewSceneProps> = ({ workspacePath, isActive = true }) => {
  const handleInteraction = useCallback(async (_itemId: string, _userInput: string) => {
    // no-op
  }, []);

  return (
    <CanvasStoreModeContext.Provider value="panel-view">
      <div className="void-panel-view-scene">
        <ContentCanvas
          workspacePath={workspacePath}
          mode="agent"
          isSceneActive={isActive}
          onInteraction={handleInteraction}
          disablePopOut={true}
        />
      </div>
    </CanvasStoreModeContext.Provider>
  );
};

export default PanelViewScene;
