/**
 * SceneViewport — renders the active scene component.
 *
 * All tabs are mounted but only the active one is visible,
 * preserving state across tab switches.
 *
 * 'welcome' is a proper scene tab; it auto-closes when any other
 * scene is explicitly opened.
 */

import React, { Suspense, lazy } from 'react';
import type { SceneTabId } from '../components/SceneBar/types';
import { useSceneStore } from '../stores/sceneStore';
import { useI18n } from '@/infrastructure/i18n/hooks/useI18n';
import { useDialogCompletionNotify } from '../hooks/useDialogCompletionNotify';
import { useDocumentVisibilityState } from '../hooks/useDocumentVisibilityState';
import { ProcessingIndicator } from '@/flow_chat/components/modern/ProcessingIndicator';
import SessionScene from './session/SessionScene';
import {
  loadAgentHubScene,
  loadAutomationScene,
  loadBrowserScene,
  loadFileViewerScene,
  loadGitScene,
  loadInsightsScene,
  loadMiniAppGalleryScene,
  loadMiniAppScene,
  loadPanelViewScene,
  loadProfileScene,
  loadSettingsScene,
  loadShellScene,
  loadTerminalScene,
  loadWelcomeScene,
} from './sceneLoaders';
import './SceneViewport.scss';

// Session is the primary interaction path. Keep it in the main scene bundle so
// first open does not stall on a lazy chunk fetch/parse before FlowChat mounts.
const SettingsScene = lazy(loadSettingsScene);
const TerminalScene = lazy(loadTerminalScene);
const GitScene = lazy(loadGitScene);
const FileViewerScene = lazy(loadFileViewerScene);
const ProfileScene = lazy(loadProfileScene);
const AgentHubScene = lazy(loadAgentHubScene);
const MiniAppGalleryScene = lazy(loadMiniAppGalleryScene);
const BrowserScene = lazy(loadBrowserScene);
const InsightsScene = lazy(loadInsightsScene);
const AutomationScene = lazy(loadAutomationScene);
const ShellScene = lazy(loadShellScene);
const WelcomeScene = lazy(loadWelcomeScene);
const MiniAppScene = lazy(loadMiniAppScene);
const PanelViewScene = lazy(loadPanelViewScene);


interface SceneViewportProps {
  workspaceId?: string;
  workspacePath?: string;
  isEntering?: boolean;
}

interface SceneSlotProps {
  id: SceneTabId;
  workspaceId?: string;
  workspacePath?: string;
  isEntering: boolean;
  isActive: boolean;
  isDocumentVisible: boolean;
  loadingLabel: string;
}

const SceneSlot = React.memo(function SceneSlot({
  id,
  workspaceId,
  workspacePath,
  isEntering,
  isActive,
  isDocumentVisible,
  loadingLabel,
}: SceneSlotProps) {
  const isPresentationActive = isActive && isDocumentVisible;

  return (
    <div
      className={[
        'void-scene-viewport__scene',
        isActive && 'void-scene-viewport__scene--active',
      ].filter(Boolean).join(' ')}
      aria-hidden={!isActive}
    >
      <Suspense
        fallback={
          isActive ? (
            <div
              className="void-scene-viewport__lazy-fallback"
              role="status"
              aria-busy="true"
              aria-label={loadingLabel}
            >
              <ProcessingIndicator visible />
            </div>
          ) : null
        }
      >
        {renderScene(id, workspaceId, workspacePath, isEntering, isPresentationActive)}
      </Suspense>
    </div>
  );
}, (previous, next) => (
  previous.id === next.id
  && previous.workspaceId === next.workspaceId
  && previous.workspacePath === next.workspacePath
  && previous.isEntering === next.isEntering
  && previous.isActive === next.isActive
  && (!next.isActive || (
    previous.isDocumentVisible === next.isDocumentVisible
    && previous.loadingLabel === next.loadingLabel
  ))
));

const SceneViewport: React.FC<SceneViewportProps> = ({
  workspaceId,
  workspacePath,
  isEntering = false,
}) => {
  const openTabs = useSceneStore((state) => state.openTabs);
  const activeTabId = useSceneStore((state) => state.activeTabId);
  const { t } = useI18n('common');
  const isDocumentVisible = useDocumentVisibilityState();
  useDialogCompletionNotify();

  // All tabs closed — show empty state
  if (openTabs.length === 0) {
    return (
      <div className="void-scene-viewport">
        <div className="void-scene-viewport__clip void-scene-viewport__clip--empty">
          <p className="void-scene-viewport__empty-hint">{t('welcomeScene.emptyHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="void-scene-viewport">
      <div className="void-scene-viewport__clip">
        {openTabs.map((tab) => (
          <SceneSlot
            key={tab.id}
            id={tab.id}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            isEntering={isEntering}
            isActive={tab.id === activeTabId}
            isDocumentVisible={isDocumentVisible}
            loadingLabel={t('loading.scenes')}
          />
        ))}
      </div>
    </div>
  );
};

function renderScene(
  id: SceneTabId,
  workspaceId?: string,
  workspacePath?: string,
  isEntering?: boolean,
  isActive: boolean = false
) {
  switch (id) {
    case 'welcome':
      return <WelcomeScene />;
    case 'session':
      return (
        <SessionScene
          workspaceId={workspaceId}
          workspacePath={workspacePath}
          isEntering={isEntering}
          isActive={isActive}
        />
      );
    case 'terminal':
      return <TerminalScene isActive={isActive} />;
    case 'git':
      return <GitScene workspacePath={workspacePath} isActive={isActive} />;
    case 'settings':
      return <SettingsScene />;
    case 'file-viewer':
      return <FileViewerScene workspacePath={workspacePath} isActive={isActive} />;
    case 'profile':
      return <ProfileScene isActive={isActive} />;
    case 'agent-hub':
      return <AgentHubScene />;
    case 'miniapps':
      return <MiniAppGalleryScene />;
    case 'browser':
      return <BrowserScene isActive={isActive} />;
    case 'insights':
      return <InsightsScene />;
    case 'automation':
      return <AutomationScene isActive={isActive} />;
    case 'shell':
      return <ShellScene isActive={isActive} />;
    case 'panel-view':
      return <PanelViewScene workspacePath={workspacePath} isActive={isActive} />;
    default:
      if (typeof id === 'string' && id.startsWith('miniapp:')) {
        return <MiniAppScene appId={id.slice('miniapp:'.length)} />;
      }
      return null;
  }
}

export default SceneViewport;
