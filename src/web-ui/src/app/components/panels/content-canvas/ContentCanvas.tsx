/**
 * ContentCanvas main container component.
 * Core component for the right panel, aggregating submodules.
 */

import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorArea } from './editor-area';
import { AnchorZone } from './anchor-zone';
import { MissionControl } from './mission-control';
import { EmptyState } from './empty-state';
import { CanvasStoreModeContext, useCanvasStore } from './stores';
import { useTabLifecycle, useKeyboardShortcuts, usePanelTabCoordinator } from './hooks';
import type { AnchorPosition } from './types';
import { openMainSession, selectActiveBtwSessionTab } from '@/flow_chat/services/openBtwSession';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { isSamePath } from '@/shared/utils/pathUtils';
import { notificationService } from '@/shared/notification-system/services/NotificationService';
import type {
  CanvasHostOpenRequest,
  CanvasHostRequestScope,
  CanvasSurfaceOpenRequest,
  CanvasSurfaceOpenResult,
  CanvasSurfaceSource,
  CanvasWorkspaceFacts,
} from '@/shared/services/canvas/CanvasSurfaceContracts';
import {
  workspaceMediaLibraryService,
  type WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media';
import type { CanvasStoreHostActions } from './registry/CanvasStoreHostAdapter';
import { canvasSurfaceCommandService } from './registry/CanvasSurfaceCommandRuntime';
import { WORKSPACE_MEDIA_SURFACE_ID } from './registry/CanvasSurfaceIds';
import {
  isFirstPartyCanvasCapabilityAvailableForSession,
  openFirstPartyCanvasCapability,
} from './registry/FirstPartyCanvasCapabilityRuntime';
import { useFirstPartyCanvasSurfaceRestore } from './registry/useFirstPartyCanvasSurfaceRestore';
import { useCanvasWorkspaceFacts } from './registry/useCanvasWorkspaceFacts';
import './ContentCanvas.scss';

const MEDIA_AUTO_OPEN_CHECK_INTERVAL_MS = 5000;

function isCanvasSurfaceMutationSuccess(result: CanvasSurfaceOpenResult): boolean {
  return result.status === 'opened'
    || result.status === 'focused'
    || result.status === 'updated';
}

function isSameCanvasWorkspaceRoute(
  current: CanvasWorkspaceFacts,
  requested: CanvasHostOpenRequest['workspace'],
): boolean {
  if (
    current.status !== 'ready'
    || current.workspaceId !== requested.workspaceId
    || current.backend !== requested.backend
  ) {
    return false;
  }
  if (current.backend === 'local') return true;
  return requested.backend === 'remote'
    && current.remoteConnectionId === requested.remoteConnectionId;
}

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
  const canvasHostId = useContext(CanvasStoreModeContext);
  // Store state
  const {
    primaryGroup,
    layout,
    isMissionControlOpen,
    addTab,
    findTabByMetadata,
    switchToTab,
    updateTabContent,
    showTab,
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
  const defaultMediaOpenedSessionIdsRef = useRef<Set<string>>(new Set());
  const defaultMediaOpeningSessionIdsRef = useRef<Set<string>>(new Set());
  const autoOpenedMediaWorkspaceIdsRef = useRef<Set<string>>(new Set());
  const mediaOpenDeliverySequenceRef = useRef(0);
  const capabilityOpenDeliverySequenceRef = useRef(0);
  const [activeSession, setActiveSession] = useState(() => {
    const state = flowChatStore.getState();
    return state.activeSessionId ? state.sessions.get(state.activeSessionId) : undefined;
  });
  // Initialize hooks
  const { handleCloseWithDirtyCheck, handleCloseAllWithDirtyCheck } = useTabLifecycle({ mode });
  useKeyboardShortcuts({ enabled: isSceneActive, handleCloseWithDirtyCheck });
  // Tabs may restore or open in the background, but visibility belongs to the
  // explicit session Canvas control. An empty Canvas may still collapse.
  const { collapsePanel } = usePanelTabCoordinator({
    autoCollapseOnEmpty: true,
    autoExpandOnTabOpen: false,
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

  const canOpenShortDramaCapability = isFirstPartyCanvasCapabilityAvailableForSession(
    'short-drama',
    activeSession,
  );

  const canvasWorkspaceFacts = useCanvasWorkspaceFacts(workspacePath);
  const canvasWorkspaceFactsRef = useRef(canvasWorkspaceFacts);
  const canvasHostMountedRef = useRef(true);
  const canvasHostActiveSessionIdRef = useRef(activeSession?.sessionId);
  const canvasHostSceneActiveRef = useRef(isSceneActive);
  useLayoutEffect(() => {
    canvasWorkspaceFactsRef.current = canvasWorkspaceFacts;
    canvasHostActiveSessionIdRef.current = activeSession?.sessionId;
    canvasHostSceneActiveRef.current = isSceneActive;
    canvasHostMountedRef.current = true;
    return () => {
      canvasHostMountedRef.current = false;
    };
  }, [activeSession?.sessionId, canvasWorkspaceFacts, isSceneActive]);
  const isCanvasHostRequestCurrent = useCallback((request: CanvasHostRequestScope) => (
    canvasHostMountedRef.current
    && canvasHostSceneActiveRef.current
    && canvasSurfaceCommandService.isDeliveryScopeCurrent(request.deliveryScope)
    && isSameCanvasWorkspaceRoute(canvasWorkspaceFactsRef.current, request.workspace)
    && (
      !request.sourceSessionId
      || request.sourceSessionId === canvasHostActiveSessionIdRef.current
    )
  ), []);
  const canvasHostActions = useMemo<CanvasStoreHostActions>(() => ({
    isRequestCurrent: isCanvasHostRequestCurrent,
    addTab,
    findTabByMetadata,
    switchToTab,
    updateTabContent,
    showTab,
  }), [
    addTab,
    findTabByMetadata,
    isCanvasHostRequestCurrent,
    showTab,
    switchToTab,
    updateTabContent,
  ]);

  const openRegisteredCanvasSurface = useCallback(async (
    request: CanvasSurfaceOpenRequest,
  ): Promise<CanvasSurfaceOpenResult> => {
    try {
      const { openFirstPartyCanvasSurface } = await import('./registry/FirstPartyCanvasSurfaceRuntime');
      return await openFirstPartyCanvasSurface(canvasHostActions, request);
    } catch (cause) {
      return {
        status: 'error',
        error: {
          code: 'definition-failed',
          message: `Canvas surface "${request.surfaceId}" could not be loaded.`,
          cause,
        },
      };
    }
  }, [canvasHostActions]);

  useLayoutEffect(() => {
    if (!isSceneActive || canvasWorkspaceFacts.status !== 'ready') {
      return;
    }
    const registration = canvasSurfaceCommandService.registerHost({
      hostId: canvasHostId,
      workspace: canvasWorkspaceFacts,
      activeSessionId: activeSession?.sessionId,
      open: openRegisteredCanvasSurface,
    });
    return registration.dispose;
  }, [
    canvasHostId,
    activeSession?.sessionId,
    canvasWorkspaceFacts,
    isSceneActive,
    openRegisteredCanvasSurface,
  ]);

  const { isInitialRestoreSettled } = useFirstPartyCanvasSurfaceRestore({
    enabled: isSceneActive && !hasPrimaryVisibleTabs,
    hostId: canvasHostId,
    workspace: canvasWorkspaceFacts,
    sourceSession: activeSession,
  });

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

  const openWorkspaceMedia = useCallback(async (
    source: CanvasSurfaceSource,
    idempotencyKey: string,
    sourceSessionId?: string,
  ): Promise<CanvasSurfaceOpenResult> => {
    const result = await canvasSurfaceCommandService.open({
      surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
      source,
      input: undefined,
      idempotencyKey,
      target: canvasWorkspaceFacts.status === 'ready'
        ? {
            ...canvasWorkspaceFacts,
            hostId: canvasHostId,
          }
        : canvasWorkspaceFacts,
      ...(sourceSessionId ? { sourceSessionId } : {}),
    });
    if (
      (source === 'canvas-control' || source === 'capability-rail')
      && canvasHostMountedRef.current
      && canvasWorkspaceFactsRef.current === canvasWorkspaceFacts
      && !isCanvasSurfaceMutationSuccess(result)
    ) {
      notificationService.warning(t('workspaceMedia.states.openUnavailable', {
        defaultValue: 'Workspace Media is unavailable for this workspace.',
      }), { duration: 4000 });
    }
    return result;
  }, [canvasHostId, canvasWorkspaceFacts, t]);

  const openWorkspaceMediaFromCanvasControl = useCallback(() => {
    mediaOpenDeliverySequenceRef.current += 1;
    void openWorkspaceMedia(
      'canvas-control',
      `canvas-control:${mediaOpenDeliverySequenceRef.current}`,
      activeSession?.sessionId,
    );
  }, [activeSession?.sessionId, openWorkspaceMedia]);

  const handleOpenShortDramaCapability = useCallback(() => {
    capabilityOpenDeliverySequenceRef.current += 1;
    void openFirstPartyCanvasCapability({
      capabilityId: 'short-drama',
      source: 'canvas-control',
      input: undefined,
      idempotencyKey: `canvas-control:${capabilityOpenDeliverySequenceRef.current}`,
      target: canvasWorkspaceFacts.status === 'ready'
        ? {
            ...canvasWorkspaceFacts,
            hostId: canvasHostId,
          }
        : canvasWorkspaceFacts,
      ...(activeSession?.sessionId
        ? { sourceSessionId: activeSession.sessionId }
        : {}),
    }).then(result => {
      if (!isCanvasSurfaceMutationSuccess(result)) {
        notificationService.info(t('shortDrama.mediaSessionRequired', {
          defaultValue: 'AI Short Drama is only available from a Media session.',
        }), { duration: 3000 });
      }
    });
  }, [activeSession?.sessionId, canvasHostId, canvasWorkspaceFacts, t]);

  useEffect(() => {
    const sessionId = activeSession?.sessionId;
    if (
      !sessionId
      || !workspacePath
      || canvasWorkspaceFacts.status !== 'ready'
      || !isSceneActive
      || !canOpenShortDramaCapability
      || defaultMediaOpenedSessionIdsRef.current.has(sessionId)
      || defaultMediaOpeningSessionIdsRef.current.has(sessionId)
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (defaultMediaOpenedSessionIdsRef.current.has(sessionId)) {
        return;
      }
      defaultMediaOpeningSessionIdsRef.current.add(sessionId);
      void openWorkspaceMedia(
        'session-default',
        `session-default:${sessionId}`,
        sessionId,
      ).then(result => {
        if (isCanvasSurfaceMutationSuccess(result)) {
          defaultMediaOpenedSessionIdsRef.current.add(sessionId);
        }
      }).finally(() => {
        defaultMediaOpeningSessionIdsRef.current.delete(sessionId);
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    activeSession,
    canOpenShortDramaCapability,
    canvasWorkspaceFacts,
    openWorkspaceMedia,
    isSceneActive,
    workspacePath,
  ]);

  useEffect(() => {
    if (
      !workspacePath
      || canvasWorkspaceFacts.status !== 'ready'
      || canvasWorkspaceFacts.backend === 'remote'
      || hasPrimaryVisibleTabs
      || !isSceneActive
    ) {
      return;
    }

    let cancelled = false;
    let isChecking = false;
    const workspaceKey = workspacePath.trim();
    const workspaceScopeKey = canvasWorkspaceFacts.workspaceId;
    if (!workspaceKey || autoOpenedMediaWorkspaceIdsRef.current.has(workspaceScopeKey)) {
      return;
    }
    if (!isInitialRestoreSettled) {
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
          autoOpenedMediaWorkspaceIdsRef.current.has(workspaceScopeKey)
        ) {
          return;
        }
        const result = await openWorkspaceMedia(
          'background-discovery',
          `background-discovery:${workspaceScopeKey}`,
        );
        if (isCanvasSurfaceMutationSuccess(result)) {
          autoOpenedMediaWorkspaceIdsRef.current.add(workspaceScopeKey);
        }
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
    canvasWorkspaceFacts,
    hasPrimaryVisibleTabs,
    isSceneActive,
    isInitialRestoreSettled,
    workspaceMediaService,
    workspacePath,
    openWorkspaceMedia,
  ]);

  // Render content
  const renderContent = () => {
    // Show empty state when primary group has no visible tabs
    if (!hasPrimaryVisibleTabs) {
      return (
        <EmptyState
          onClose={disablePopOut ? undefined : collapsePanel}
          workspacePath={workspacePath}
          onOpenWorkspaceMedia={openWorkspaceMediaFromCanvasControl}
          onOpenShortDramaCenter={
            canOpenShortDramaCapability
              ? handleOpenShortDramaCapability
              : undefined
          }
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
