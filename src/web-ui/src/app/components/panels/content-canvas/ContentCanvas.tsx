/**
 * ContentCanvas main container component.
 * Core component for the right panel, aggregating submodules.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorArea } from './editor-area';
import { AnchorZone } from './anchor-zone';
import { MissionControl } from './mission-control';
import { EmptyState } from './empty-state';
import { useCanvasStore } from './stores';
import { useTabLifecycle, useKeyboardShortcuts, usePanelTabCoordinator } from './hooks';
import type { AnchorPosition } from './types';
import { openMainSession, selectActiveBtwSessionTab } from '@/flow_chat/services/openBtwSession';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { isSamePath } from '@/shared/utils/pathUtils';
import { notificationService } from '@/shared/notification-system/services/NotificationService';
import { createShortDramaWorkspaceManifestAdapter } from '@/shared/services/short-drama/ShortDramaWorkspaceManifestAdapter';
import { isShortDramaMediaSession } from '@/shared/services/short-drama/ShortDramaWorkspaceMode';
import { readShortDramaStageAgentBindings } from '@/shared/services/short-drama/ShortDramaStageAgentSessionBinding';
import {
  workspaceMediaLibraryService,
  type WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media';
import './ContentCanvas.scss';

const WORKSPACE_MEDIA_OPEN_EVENT = 'void:open-workspace-media';
const SHORT_DRAMA_OPEN_EVENT = 'void:open-short-drama-center';
const MEDIA_AUTO_OPEN_CHECK_INTERVAL_MS = 5000;

export interface ContentCanvasProps {
  /** Workspace path */
  workspacePath?: string;
  /** App mode */
  mode?: 'agent' | 'project' | 'git';
  /** Whether the containing scene is currently visible */
  isSceneActive?: boolean;
  /** Interaction callback */
  onInteraction?: (itemId: string, userInput: string) => Promise<void>;
  /** Before-close callback */
  onBeforeClose?: (content: any) => Promise<boolean>;
  /** Disable pop-out and panel-close controls (used in panel-view scene) */
  disablePopOut?: boolean;
  /** Workspace media service override for tests. */
  workspaceMediaService?: WorkspaceMediaLibraryService;
}

export const ContentCanvas: React.FC<ContentCanvasProps> = ({
  workspacePath,
  mode = 'agent',
  isSceneActive = true,
  onInteraction,
  disablePopOut = false,
  workspaceMediaService = workspaceMediaLibraryService,
}) => {
  const { t } = useTranslation('components');
  // Store state
  const {
    primaryGroup,
    layout,
    isMissionControlOpen,
    addTab,
    findTabByMetadata,
    switchToTab,
    setAnchorPosition,
    setAnchorSize,
    closeMissionControl,
    openMissionControl,
  } = useCanvasStore();
  const activeBtwSessionTab = useCanvasStore(state => selectActiveBtwSessionTab(state as any));
  const activeBtwSessionData = activeBtwSessionTab?.content.data as
    | { childSessionId: string; parentSessionId: string; workspacePath?: string }
    | undefined;
  const activeBtwSessionShortDramaStage = activeBtwSessionTab?.content.metadata?.shortDramaStage;
  const lastSyncedBtwTabIdRef = useRef<string | null>(null);
  const autoOpenedMediaWorkspacePathsRef = useRef<Set<string>>(new Set());
  const autoRestoredShortDramaWorkspacePathsRef = useRef<Set<string>>(new Set());
  const [activeSession, setActiveSession] = useState(() => {
    const state = flowChatStore.getState();
    return state.activeSessionId ? state.sessions.get(state.activeSessionId) : undefined;
  });
  const [shortDramaRestoreCheckedWorkspace, setShortDramaRestoreCheckedWorkspace] = useState<string>();
  // Initialize hooks
  const { handleCloseWithDirtyCheck, handleCloseAllWithDirtyCheck } = useTabLifecycle({ mode });
  useKeyboardShortcuts({ enabled: isSceneActive, handleCloseWithDirtyCheck });
  // Panel/tab state coordinator (auto manage expand/collapse)
  const { collapsePanel } = usePanelTabCoordinator({
    autoCollapseOnEmpty: true,
    autoExpandOnTabOpen: true,
  });

  useEffect(() => {
    if (!isSceneActive) {
      return;
    }

    if (mode !== 'agent' || !activeBtwSessionTab?.id || !activeBtwSessionData?.parentSessionId) {
      lastSyncedBtwTabIdRef.current = null;
      return;
    }

    if (activeBtwSessionShortDramaStage) {
      lastSyncedBtwTabIdRef.current = activeBtwSessionTab.id;
      return;
    }

    if (
      lastSyncedBtwTabIdRef.current === activeBtwSessionTab.id
      && flowChatStore.getState().activeSessionId === activeBtwSessionData.parentSessionId
    ) {
      return;
    }

    // Only sync when the BTW session belongs to the current workspace,
    // preventing the wrong session from opening when switching workspaces.
    const btwWorkspacePath = activeBtwSessionData.workspacePath;
    if (workspacePath && btwWorkspacePath && !isSamePath(workspacePath, btwWorkspacePath)) {
      lastSyncedBtwTabIdRef.current = activeBtwSessionTab.id;
      return;
    }

    lastSyncedBtwTabIdRef.current = activeBtwSessionTab.id;
    void openMainSession(activeBtwSessionData.parentSessionId);
  }, [
    activeBtwSessionData?.parentSessionId,
    activeBtwSessionData?.workspacePath,
    activeBtwSessionShortDramaStage,
    activeBtwSessionTab?.id,
    isSceneActive,
    mode,
    workspacePath,
  ]);

  // Check if primary group has visible tabs
  const hasPrimaryVisibleTabs = primaryGroup.tabs.some(tab => !tab.isHidden);

  useEffect(() => {
    if (!isSceneActive) {
      return;
    }

    const syncActiveSession = (nextState = flowChatStore.getState()) => {
      setActiveSession(nextState.activeSessionId ? nextState.sessions.get(nextState.activeSessionId) : undefined);
    };

    syncActiveSession();
    return flowChatStore.subscribe(syncActiveSession);
  }, [isSceneActive]);

  const canOpenShortDramaCenter = isShortDramaMediaSession(activeSession);

  // Handle anchor close
  const handleAnchorClose = useCallback(() => {
    setAnchorPosition('hidden');
  }, [setAnchorPosition]);

  // Handle anchor position change
  const handleAnchorPositionChange = useCallback((position: AnchorPosition) => {
    setAnchorPosition(position);
  }, [setAnchorPosition]);

  // Handle anchor size change
  const handleAnchorSizeChange = useCallback((size: number) => {
    setAnchorSize(size);
  }, [setAnchorSize]);

  // Handle mission control open
  const handleOpenMissionControl = useCallback(() => {
    openMissionControl();
  }, [openMissionControl]);

  // Handle mission control close
  const handleCloseMissionControl = useCallback(() => {
    closeMissionControl();
  }, [closeMissionControl]);

  const handleOpenWorkspaceMedia = useCallback(() => {
    if (!workspacePath) {
      return;
    }

    const duplicateCheckKey = `workspace-media:${workspacePath}`;
    const existing = findTabByMetadata({ duplicateCheckKey });
    if (existing) {
      switchToTab(existing.tab.id, existing.groupId);
      return;
    }

    addTab({
      type: 'workspace-media-gallery',
      title: 'Media',
      data: { workspacePath },
      metadata: {
        duplicateCheckKey,
      },
    }, 'active', 'primary');
  }, [addTab, findTabByMetadata, switchToTab, workspacePath]);

  const handleOpenShortDramaCenter = useCallback(() => {
    if (!workspacePath) {
      return;
    }
    const state = flowChatStore.getState();
    const sourceSession = state.activeSessionId ? state.sessions.get(state.activeSessionId) : undefined;
    if (!sourceSession || !isShortDramaMediaSession(sourceSession)) {
      notificationService.info(t('shortDrama.mediaSessionRequired', {
        defaultValue: 'AI Short Drama is only available from a Media session.',
      }), { duration: 3000 });
      return;
    }
    const sourceSessionId = sourceSession.sessionId;

    const duplicateCheckKey = `short-drama:${workspacePath}`;
    const existing = findTabByMetadata({ duplicateCheckKey });
    if (existing) {
      switchToTab(existing.tab.id, existing.groupId);
      return;
    }

    addTab({
      type: 'short-drama-center',
      title: t('shortDrama.entry'),
      data: { workspacePath, sourceSessionId },
      metadata: {
        duplicateCheckKey,
        sourceSessionId,
        contentRole: 'short-drama-center',
      },
    }, 'active', 'primary');
  }, [addTab, findTabByMetadata, switchToTab, t, workspacePath]);

  useEffect(() => {
    if (!isSceneActive) {
      return;
    }
    window.addEventListener(WORKSPACE_MEDIA_OPEN_EVENT, handleOpenWorkspaceMedia);
    return () => window.removeEventListener(WORKSPACE_MEDIA_OPEN_EVENT, handleOpenWorkspaceMedia);
  }, [handleOpenWorkspaceMedia, isSceneActive]);

  useEffect(() => {
    if (!isSceneActive) {
      return;
    }
    window.addEventListener(SHORT_DRAMA_OPEN_EVENT, handleOpenShortDramaCenter);
    return () => window.removeEventListener(SHORT_DRAMA_OPEN_EVENT, handleOpenShortDramaCenter);
  }, [handleOpenShortDramaCenter, isSceneActive]);

  useEffect(() => {
    if (!workspacePath || hasPrimaryVisibleTabs || !isSceneActive) {
      return;
    }

    let cancelled = false;
    let isChecking = false;
    const workspaceKey = workspacePath.trim();
    if (!workspaceKey || autoOpenedMediaWorkspacePathsRef.current.has(workspaceKey)) {
      return;
    }
    if (canOpenShortDramaCenter && shortDramaRestoreCheckedWorkspace !== workspaceKey) {
      return;
    }

    const checkAndOpen = async () => {
      if (isChecking) {
        return;
      }
      isChecking = true;
      try {
        const availability = await workspaceMediaService.checkAvailability(workspaceKey);
        if (
          cancelled ||
          availability.status !== 'available' ||
          autoOpenedMediaWorkspacePathsRef.current.has(workspaceKey)
        ) {
          return;
        }
        autoOpenedMediaWorkspacePathsRef.current.add(workspaceKey);
        handleOpenWorkspaceMedia();
      } catch {
        return;
      } finally {
        isChecking = false;
      }
    };

    void checkAndOpen();
    const intervalId = window.setInterval(() => {
      void checkAndOpen();
    }, MEDIA_AUTO_OPEN_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    canOpenShortDramaCenter,
    handleOpenWorkspaceMedia,
    hasPrimaryVisibleTabs,
    isSceneActive,
    shortDramaRestoreCheckedWorkspace,
    workspaceMediaService,
    workspacePath,
  ]);

  useEffect(() => {
    if (!workspacePath || hasPrimaryVisibleTabs || !canOpenShortDramaCenter || !isSceneActive) {
      return;
    }

    const workspaceKey = workspacePath.trim();
    if (!workspaceKey || autoRestoredShortDramaWorkspacePathsRef.current.has(workspaceKey)) {
      return;
    }

    let cancelled = false;
    const restoreIfEnabled = async () => {
      try {
        const result = await readShortDramaStageAgentBindings(
          createShortDramaWorkspaceManifestAdapter(workspaceKey),
          workspaceKey,
        );
        if (cancelled) {
          return;
        }
        if (autoRestoredShortDramaWorkspacePathsRef.current.has(workspaceKey) || result.status === 'error') {
          setShortDramaRestoreCheckedWorkspace(workspaceKey);
          return;
        }
        if (result.bindings.every(binding => binding.status === 'unbound')) {
          setShortDramaRestoreCheckedWorkspace(workspaceKey);
          return;
        }
        autoRestoredShortDramaWorkspacePathsRef.current.add(workspaceKey);
        setShortDramaRestoreCheckedWorkspace(workspaceKey);
        handleOpenShortDramaCenter();
      } catch {
        // Restore is opportunistic; explicit user open owns visible errors.
        if (!cancelled) {
          setShortDramaRestoreCheckedWorkspace(workspaceKey);
        }
      }
    };

    void restoreIfEnabled();

    return () => {
      cancelled = true;
    };
  }, [canOpenShortDramaCenter, handleOpenShortDramaCenter, hasPrimaryVisibleTabs, isSceneActive, workspacePath]);

  // Render content
  const renderContent = () => {
    // Show empty state when primary group has no visible tabs
    if (!hasPrimaryVisibleTabs) {
      return (
        <EmptyState
          onClose={disablePopOut ? undefined : collapsePanel}
          workspacePath={workspacePath}
          onOpenWorkspaceMedia={handleOpenWorkspaceMedia}
          onOpenShortDramaCenter={canOpenShortDramaCenter ? handleOpenShortDramaCenter : undefined}
        />
      );
    }

    return (
      <div className="canvas-content-canvas__main">
        {/* Editor area */}
        <div className="canvas-content-canvas__editor">
          <EditorArea
            workspacePath={workspacePath}
            isSceneActive={isSceneActive}
            onOpenMissionControl={handleOpenMissionControl}
            onInteraction={onInteraction}
            onTabCloseWithDirtyCheck={handleCloseWithDirtyCheck}
            onTabCloseAllWithDirtyCheck={handleCloseAllWithDirtyCheck}
            disablePopOut={disablePopOut}
            onOpenWorkspaceMedia={handleOpenWorkspaceMedia}
            onOpenShortDramaCenter={canOpenShortDramaCenter ? handleOpenShortDramaCenter : undefined}
          />
        </div>

        {/* Anchor area */}
        {layout.anchorPosition !== 'hidden' && (
          <AnchorZone
            position={layout.anchorPosition}
            size={layout.anchorSize}
            onSizeChange={handleAnchorSizeChange}
            onPositionChange={handleAnchorPositionChange}
            onClose={handleAnchorClose}
          >
            {/* Anchor content (e.g., terminal) renders here */}
            <div className="canvas-content-canvas__anchor-content">
            </div>
          </AnchorZone>
        )}
      </div>
    );
  };

  return (
    <div
      className={`canvas-content-canvas ${layout.isMaximized ? 'is-maximized' : ''}`}
      data-shortcut-scope="canvas"
    >
      {/* Main content */}
      {renderContent()}

      {/* Mission control overlay */}
      <MissionControl
        isOpen={isMissionControlOpen}
        onClose={handleCloseMissionControl}
        handleCloseWithDirtyCheck={handleCloseWithDirtyCheck}
      />
    </div>
  );
};
ContentCanvas.displayName = 'ContentCanvas';

export default ContentCanvas;
