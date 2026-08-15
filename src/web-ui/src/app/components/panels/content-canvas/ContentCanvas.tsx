/**
 * ContentCanvas main container component.
 * Core component for the right panel, aggregating submodules.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorArea } from './editor-area';
import { AnchorZone } from './anchor-zone';
import { MissionControl } from './mission-control';
import { EmptyState } from './empty-state';
import { useAgentCanvasStore, useCanvasStore } from './stores';
import { useTabLifecycle, useKeyboardShortcuts, usePanelTabCoordinator } from './hooks';
import type { AnchorPosition } from './types';
import { openMainSession, selectActiveBtwSessionTab } from '@/flow_chat/services/openBtwSession';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { isSamePath } from '@/shared/utils/pathUtils';
import { notificationService } from '@/shared/notification-system/services/NotificationService';
import type {
  CanvasHostOpenRequest,
  CanvasSurfaceOpenResult,
  CanvasSurfaceSource,
  CanvasWorkspaceFacts,
} from '@/shared/services/canvas/CanvasSurfaceContracts';
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas/CanvasWorkspaceFacts';
import { createShortDramaWorkspaceManifestAdapter } from '@/shared/services/short-drama/ShortDramaWorkspaceManifestAdapter';
import { isShortDramaMediaSession } from '@/shared/services/short-drama/ShortDramaWorkspaceMode';
import { readShortDramaStageAgentBindings } from '@/shared/services/short-drama/ShortDramaStageAgentSessionBinding';
import { isUnifiedShortDramaTeamSession } from './short-drama/ShortDramaTeamSessionPolicy';
import { removeDuplicateTeamMemberCanvasTabs } from '@/app/presentation/TeamMemberCanvasPresentation';
import {
  workspaceMediaLibraryService,
  type WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media';
import type { CanvasStoreHostActions } from './registry/CanvasStoreHostAdapter';
import { WORKSPACE_MEDIA_SURFACE_ID } from './registry/CanvasSurfaceIds';
import {
  readWorkspaceMediaOpenEventDetail,
  WORKSPACE_MEDIA_OPEN_EVENT,
  type WorkspaceMediaOpenEventDetail,
} from './registry/WorkspaceMediaOpenEvent';
import { useCanvasWorkspaceFacts } from './registry/useCanvasWorkspaceFacts';
import './ContentCanvas.scss';

const SHORT_DRAMA_OPEN_EVENT = 'void:open-short-drama-center';
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
  const autoRestoredShortDramaWorkspacePathsRef = useRef<Set<string>>(new Set());
  const mediaOpenDeliverySequenceRef = useRef(0);
  const [activeSession, setActiveSession] = useState(() => {
    const state = flowChatStore.getState();
    return state.activeSessionId ? state.sessions.get(state.activeSessionId) : undefined;
  });
  const [pendingMediaRestore, setPendingMediaRestore] = useState<
    Extract<WorkspaceMediaOpenEventDetail, { source: 'restore' }> | undefined
  >();
  const [shortDramaRestoreCheckedWorkspace, setShortDramaRestoreCheckedWorkspace] = useState<string>();
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

  const canOpenShortDramaCenter = isShortDramaMediaSession(activeSession);

  const canvasWorkspaceFacts = useCanvasWorkspaceFacts(workspacePath);
  const canvasWorkspaceFactsRef = useRef(canvasWorkspaceFacts);
  const canvasHostMountedRef = useRef(true);
  useLayoutEffect(() => {
    canvasWorkspaceFactsRef.current = canvasWorkspaceFacts;
    canvasHostMountedRef.current = true;
    return () => {
      canvasHostMountedRef.current = false;
    };
  }, [canvasWorkspaceFacts]);
  const isCanvasHostRequestCurrent = useCallback((request: CanvasHostOpenRequest) => (
    canvasHostMountedRef.current
    && isSameCanvasWorkspaceRoute(canvasWorkspaceFactsRef.current, request.workspace)
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
    let result: CanvasSurfaceOpenResult;
    try {
      const { openFirstPartyCanvasSurface } = await import('./registry/FirstPartyCanvasSurfaceRuntime');
      result = await openFirstPartyCanvasSurface(canvasHostActions, {
        surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
        source,
        input: undefined,
        idempotencyKey,
        workspace: canvasWorkspaceFacts,
        ...(sourceSessionId ? { sourceSessionId } : {}),
      });
    } catch (cause) {
      result = {
        status: 'error',
        error: {
          code: 'definition-failed',
          message: 'The Workspace Media Canvas plugin could not be loaded.',
          cause,
        },
      };
    }
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
  }, [canvasHostActions, canvasWorkspaceFacts, t]);

  const openWorkspaceMediaFromCanvasControl = useCallback(() => {
    mediaOpenDeliverySequenceRef.current += 1;
    void openWorkspaceMedia(
      'canvas-control',
      `canvas-control:${mediaOpenDeliverySequenceRef.current}`,
      activeSession?.sessionId,
    );
  }, [activeSession?.sessionId, openWorkspaceMedia]);

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
    if (isUnifiedShortDramaTeamSession(sourceSession)) {
      const canvas = useAgentCanvasStore.getState();
      removeDuplicateTeamMemberCanvasTabs(canvas, {
        parentSessionId: sourceSessionId,
        workspacePath,
        removeShortDramaWorkspaceTabs: true,
      });
    }

    const duplicateCheckKey = `short-drama:${workspacePath}`;
    const existing = findTabByMetadata({ duplicateCheckKey });
    if (existing) {
      updateTabContent(existing.tab.id, existing.groupId, {
        ...existing.tab.content,
        data: {
          ...existing.tab.content.data,
          workspacePath,
          sourceSessionId,
        },
        metadata: {
          ...existing.tab.content.metadata,
          duplicateCheckKey,
          sourceSessionId,
          contentRole: 'short-drama-center',
        },
      });
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
  }, [addTab, findTabByMetadata, switchToTab, t, updateTabContent, workspacePath]);

  useEffect(() => {
    const sessionId = activeSession?.sessionId;
    if (
      !sessionId
      || !workspacePath
      || canvasWorkspaceFacts.status !== 'ready'
      || !isSceneActive
      || !canOpenShortDramaCenter
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
    canOpenShortDramaCenter,
    canvasWorkspaceFacts,
    openWorkspaceMedia,
    isSceneActive,
    workspacePath,
  ]);

  useEffect(() => {
    if (!isSceneActive) {
      return;
    }
    const handleCapabilityRailOpen = (event: Event) => {
      const detail = readWorkspaceMediaOpenEventDetail(event);
      if (!detail) {
        return;
      }
      if (
        canvasWorkspaceFacts.status === 'ready'
        && (
          (detail.workspaceId && detail.workspaceId !== canvasWorkspaceFacts.workspaceId)
          || (
            detail.workspacePath
            && !areCanvasWorkspacePathsEquivalent(
              detail.workspacePath,
              canvasWorkspaceFacts.workspacePath,
              canvasWorkspaceFacts.backend,
            )
          )
        )
      ) {
        return;
      }
      mediaOpenDeliverySequenceRef.current += 1;
      void openWorkspaceMedia(
        detail.source,
        `${detail.source}:${mediaOpenDeliverySequenceRef.current}`,
        detail.sourceSessionId ?? activeSession?.sessionId,
      ).then(result => {
        if (
          detail.source === 'restore'
          && !isCanvasSurfaceMutationSuccess(result)
          && canvasWorkspaceFacts.status !== 'ready'
        ) {
          setPendingMediaRestore(detail);
        }
      });
    };
    window.addEventListener(WORKSPACE_MEDIA_OPEN_EVENT, handleCapabilityRailOpen);
    return () => window.removeEventListener(WORKSPACE_MEDIA_OPEN_EVENT, handleCapabilityRailOpen);
  }, [
    activeSession?.sessionId,
    canvasWorkspaceFacts,
    isSceneActive,
    openWorkspaceMedia,
  ]);

  useEffect(() => {
    if (
      !pendingMediaRestore
      || !isSceneActive
      || canvasWorkspaceFacts.status !== 'ready'
    ) {
      return;
    }

    const matchesPendingWorkspace = (
      pendingMediaRestore.workspaceId === canvasWorkspaceFacts.workspaceId
      && areCanvasWorkspacePathsEquivalent(
        pendingMediaRestore.workspacePath,
        canvasWorkspaceFacts.workspacePath,
        canvasWorkspaceFacts.backend,
      )
    );
    if (!matchesPendingWorkspace) {
      setPendingMediaRestore(undefined);
      return;
    }

    mediaOpenDeliverySequenceRef.current += 1;
    const restore = pendingMediaRestore;
    void openWorkspaceMedia(
      'restore',
      `restore-retry:${mediaOpenDeliverySequenceRef.current}`,
      restore.sourceSessionId,
    ).then(result => {
      if (isCanvasSurfaceMutationSuccess(result)) {
        setPendingMediaRestore(current => current === restore ? undefined : current);
      }
    });
  }, [canvasWorkspaceFacts, isSceneActive, openWorkspaceMedia, pendingMediaRestore]);

  useEffect(() => {
    if (!isSceneActive) {
      return;
    }
    window.addEventListener(SHORT_DRAMA_OPEN_EVENT, handleOpenShortDramaCenter);
    return () => window.removeEventListener(SHORT_DRAMA_OPEN_EVENT, handleOpenShortDramaCenter);
  }, [handleOpenShortDramaCenter, isSceneActive]);

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
    canOpenShortDramaCenter,
    canvasWorkspaceFacts,
    hasPrimaryVisibleTabs,
    isSceneActive,
    shortDramaRestoreCheckedWorkspace,
    workspaceMediaService,
    workspacePath,
    openWorkspaceMedia,
  ]);

  useEffect(() => {
    if (
      !workspacePath
      || hasPrimaryVisibleTabs
      || !canOpenShortDramaCenter
      || !isSceneActive
      || (
        activeSession?.sessionId
        && defaultMediaOpenedSessionIdsRef.current.has(activeSession.sessionId)
      )
    ) {
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
  }, [
    activeSession?.sessionId,
    canOpenShortDramaCenter,
    handleOpenShortDramaCenter,
    hasPrimaryVisibleTabs,
    isSceneActive,
    workspacePath,
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
