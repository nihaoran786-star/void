/**
 * SessionScene — Session scene layout.
 *
 * Layout (left to right):
 *   ChatPane (flex:1, FlowChat conversation)
 *   PaneResizer (draggable divider)
 *   AuxPane (variable width, ContentCanvas tabs)
 *
 * A bound Team is presented in its own desktop window, not inside this scene.
 *
 * Resizer logic moved here from WorkspaceShell.
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../hooks/useApp';
import ChatPane from './ChatPane';
import SessionCapabilityRail from './SessionCapabilityRail';
import { SessionCapabilityRailOutletProvider } from '@/app/presentation/sessionCapabilityRailOutlet';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import { useCanvasStore } from '@/app/components/panels/content-canvas/stores';
import {
  activateFirstPartyCanvasDeliveryScope,
  openFirstPartyCanvasCapability,
  reconcileFirstPartyTeamCanvasPresentation,
  resolveCanvasCapabilityForContent,
} from '@/app/components/panels/content-canvas/registry/FirstPartyCanvasCapabilityRuntime';
import { useActiveSessionCapabilities } from '@/flow_chat/hooks/useActiveSessionCapabilities';
import type { SessionCapabilityId } from '@/flow_chat/services/sessionCapabilities';
import { isSamePath } from '@/shared/utils/pathUtils';
import { useOptionalWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import {
  resolveTeamCanvasCapability,
  useTeamWorkspacePresentationStore,
  useActiveSessionTeamWorkspace,
} from '@/team_workspace';
import {
  closeTeamWorkspaceWindow,
  listenTeamWorkspaceWindowClosed,
  openTeamWorkspaceWindow,
} from '@/infrastructure/config/services/TeamWorkspaceWindowService';

import {
  RIGHT_PANEL_CONFIG,
  PANEL_COMMON_CONFIG,
  STORAGE_KEYS,
  PanelDisplayMode,
  getPanelDisplayMode,
  getModeWidth,
  getSnappedWidth,
  getNextMode,
  savePanelWidth,
  loadPanelWidth,
} from '../../layout/panelConfig';

import './SessionScene.scss';

const AuxPane = React.lazy(() => import('./AuxPane'));

/**
 * A capability click that fails must never fail silently: surface the typed
 * reason as a toast so the user (and support) can see why nothing opened.
 */
function reportSessionCanvasCapabilityFailure(
  intent: SessionCanvasCapabilityIntent,
  result: Awaited<ReturnType<typeof openFirstPartyCanvasCapability>>,
): Awaited<ReturnType<typeof openFirstPartyCanvasCapability>> {
  if (result.status === 'error'
    || result.status === 'unavailable'
    || result.status === 'restricted'
    || result.status === 'incompatible'
  ) {
    const reason = result.status === 'error'
      ? result.error.message
      : result.reason;
    console.error(
      '[SessionScene] Canvas capability open failed',
      { capabilityId: intent.capabilityId, result },
    );
    void import('@/shared/notification-system').then(({ notificationService }) => {
      notificationService.error(`${intent.capabilityId}: ${reason}`);
    });
  }
  return result;
}

interface SessionCanvasCapabilityIntent {
  capabilityId: SessionCapabilityId;
  source: 'capability-rail' | 'restore';
  idempotencyKey: string;
  sourceSessionId?: string;
  personaId?: string;
  workspaceId?: string;
  workspacePath?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
  deliveryScope?: {
    scopeId: string;
    revision: string;
    activationId: number;
  };
}

type SessionCanvasIntentState = 'current' | 'wait' | 'stale';

function getSessionCanvasIntentState(
  intent: SessionCanvasCapabilityIntent,
  current: {
    sourceSessionId?: string | null;
    workspaceId?: string;
    workspacePath?: string;
    remoteConnectionId?: string;
  },
): SessionCanvasIntentState {
  if (intent.sourceSessionId) {
    if (!current.sourceSessionId) return 'wait';
    if (intent.sourceSessionId !== current.sourceSessionId) return 'stale';
  }
  if (intent.workspaceId) {
    if (!current.workspaceId) return 'wait';
    if (intent.workspaceId !== current.workspaceId) return 'stale';
  }
  if (intent.workspacePath) {
    if (!current.workspacePath) return 'wait';
    if (!isSamePath(intent.workspacePath, current.workspacePath)) return 'stale';
  }
  if (intent.remoteConnectionId !== current.remoteConnectionId) return 'stale';
  return 'current';
}

interface SessionSceneProps {
  workspaceId?: string;
  workspacePath?: string;
  isEntering?: boolean;
  isActive?: boolean;
}

const SessionScene: React.FC<SessionSceneProps> = ({
  workspaceId,
  workspacePath,
  isEntering = false,
  isActive = true,
}) => {
  const { t } = useTranslation('flow-chat');
  const { state, updateRightPanelWidth, toggleRightPanel } = useApp();
  const newSessionDraftStatus = useSessionModeStore(store => store.draftStatus);
  const {
    sessionId: activeSessionId,
    personaId: activeSessionPersonaId,
    workspaceId: activeSessionWorkspaceId,
    workspacePath: activeSessionWorkspacePath,
    remoteConnectionId: activeSessionRemoteConnectionId,
    remoteSshHost: activeSessionRemoteSshHost,
    capabilities: activeSessionCapabilities,
  } = useActiveSessionCapabilities();
  // The session's own workspace binding wins: the shell's opened workspace can
  // be absent (session created from the welcome screen) or a different one.
  const capabilityWorkspaceId = activeSessionWorkspaceId ?? workspaceId;
  const capabilityWorkspacePath = activeSessionWorkspacePath ?? workspacePath;
  const workspaceContext = useOptionalWorkspaceContext();
  const activeTeamWorkspace = useActiveSessionTeamWorkspace({ workspacePath });
  const activeCanvasCapabilityId = useCanvasStore(canvasState => {
    const activeTab = canvasState.primaryGroup.tabs.find(
      tab => tab.id === canvasState.primaryGroup.activeTabId,
    );
    return resolveCanvasCapabilityForContent(activeTab?.content)?.capabilityId as
      | SessionCapabilityId
      | undefined;
  });
  const [isAuxPaneReady, setIsAuxPaneReady] = useState(false);
  const pendingCanvasCapabilityIntentsRef = useRef(
    new Map<SessionCapabilityId, SessionCanvasCapabilityIntent>(),
  );
  const canvasCapabilityDeliverySequenceRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const teamWorkspaceToggleRef = useRef<HTMLButtonElement>(null);
  const teamWorkspacePresentation = useTeamWorkspacePresentationStore(
    store => activeTeamWorkspace.sessionId
      ? store.sessions[activeTeamWorkspace.sessionId]
      : undefined,
  );
  const activateTeamWorkspaceBinding = useTeamWorkspacePresentationStore(
    store => store.activateBinding,
  );
  const registerTeamWorkspaceSnapshot = useTeamWorkspacePresentationStore(
    store => store.registerSnapshot,
  );
  const openTeamWorkspace = useTeamWorkspacePresentationStore(
    store => store.open,
  );
  const closeTeamWorkspacePresentation = useTeamWorkspacePresentationStore(
    store => store.close,
  );
  const isTeamWorkspaceOpen = Boolean(
    activeTeamWorkspace.hasTeamBinding
      && teamWorkspacePresentation?.isOpen,
  );

  useEffect(() => {
    if (
      !activeTeamWorkspace.sessionId
      || !activeTeamWorkspace.teamBindingKey
    ) return;
    activateTeamWorkspaceBinding(
      activeTeamWorkspace.sessionId,
      activeTeamWorkspace.teamBindingKey,
      activeTeamWorkspace.snapshot,
    );
  }, [
    activateTeamWorkspaceBinding,
    activeTeamWorkspace.sessionId,
    activeTeamWorkspace.snapshot,
    activeTeamWorkspace.teamBindingKey,
  ]);

  useEffect(() => {
    if (activeTeamWorkspace.snapshot) {
      registerTeamWorkspaceSnapshot(activeTeamWorkspace.snapshot);
    }
  }, [activeTeamWorkspace.snapshot, registerTeamWorkspaceSnapshot]);

  // The Team presentation now lives in its own desktop window. Opening and
  // closing it is presentation-only: the Team run, its member child sessions,
  // and this parent conversation are untouched either way.
  useEffect(() => {
    if (!isTeamWorkspaceOpen) return undefined;

    let disposed = false;
    // Loaded behind the Team-window boundary so the main entry never pays for
    // the publisher, and so scene tests do not pull the Flow Chat store in.
    const publisherModule = import(
      '@/team_workspace/services/TeamWorkspaceWindowPublisher'
    );
    void publisherModule.then(({ activateTeamWorkspaceWindowPublishing }) => {
      if (disposed) return;
      void activateTeamWorkspaceWindowPublishing();
    });
    // If the desktop host cannot provide the window, collapse the presentation
    // again so the rail capsule never claims a window the user cannot see.
    void openTeamWorkspaceWindow().then(opened => {
      if (opened || disposed || !activeTeamWorkspace.sessionId) return;
      closeTeamWorkspacePresentation(activeTeamWorkspace.sessionId);
    });

    let removeClosedListener: (() => void) | null = null;
    void listenTeamWorkspaceWindowClosed(() => {
      if (disposed || !activeTeamWorkspace.sessionId) return;
      closeTeamWorkspacePresentation(activeTeamWorkspace.sessionId);
      queueMicrotask(() => teamWorkspaceToggleRef.current?.focus());
    }).then(unlisten => {
      if (disposed) unlisten();
      else removeClosedListener = unlisten;
    });

    return () => {
      disposed = true;
      removeClosedListener?.();
      void publisherModule.then(({ suspendTeamWorkspaceWindowPublishing }) => {
        suspendTeamWorkspaceWindowPublishing();
      });
      void closeTeamWorkspaceWindow();
    };
  }, [
    activeTeamWorkspace.sessionId,
    closeTeamWorkspacePresentation,
    isTeamWorkspaceOpen,
  ]);

  const toggleTeamWorkspace = useCallback(() => {
    if (!activeTeamWorkspace.sessionId) return;
    if (isTeamWorkspaceOpen) {
      closeTeamWorkspacePresentation(activeTeamWorkspace.sessionId);
    } else {
      openTeamWorkspace(activeTeamWorkspace.sessionId);
    }
  }, [
    activeTeamWorkspace.sessionId,
    closeTeamWorkspacePresentation,
    isTeamWorkspaceOpen,
    openTeamWorkspace,
  ]);

  const preferredRightWidthRef = useRef(
    loadPanelWidth(
      STORAGE_KEYS.RIGHT_PANEL_LAST_WIDTH,
      RIGHT_PANEL_CONFIG.COMFORTABLE_DEFAULT,
    ),
  );
  const [, setLastRightWidth] = useState<number>(
    preferredRightWidthRef.current,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);
  const auxPaneElementRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const currentRightWidth = state.layout.rightPanelWidth || RIGHT_PANEL_CONFIG.COMFORTABLE_DEFAULT;

  const rightPanelMode: PanelDisplayMode = useMemo(() => {
    if (state.layout.rightPanelCollapsed) return 'collapsed';
    return getPanelDisplayMode(currentRightWidth, RIGHT_PANEL_CONFIG);
  }, [state.layout.rightPanelCollapsed, currentRightWidth]);

  useEffect(() => {
    if (newSessionDraftStatus === 'idle') {
      return;
    }

    if (state.layout.chatCollapsed) {
      window.dispatchEvent(new CustomEvent('void:compact-chat-close-requested'));
    }
    if (!state.layout.rightPanelCollapsed) {
      toggleRightPanel();
    }
  }, [
    newSessionDraftStatus,
    state.layout.chatCollapsed,
    state.layout.rightPanelCollapsed,
    toggleRightPanel,
  ]);

  // Keep right panel visible when chat is hidden
  useEffect(() => {
    if (state.layout.chatCollapsed && state.layout.rightPanelCollapsed) {
      toggleRightPanel();
    }
  }, [state.layout.chatCollapsed, state.layout.rightPanelCollapsed, toggleRightPanel]);

  const calculateValidRightWidth = useCallback((newWidth: number): number => {
    if (!containerRef.current) return newWidth;
    const containerWidth = containerRef.current.offsetWidth;
    // NavPanel (240px) is outside SessionScene — only account for resizer + min chat width.
    // The Team Workspace is its own desktop window and reserves no width here.
    const reserved = PANEL_COMMON_CONFIG.RESIZER_WIDTH
      + PANEL_COMMON_CONFIG.MIN_CENTER_WIDTH;
    const dynamicMax = containerWidth - reserved;
    const maxWidth = Math.min(RIGHT_PANEL_CONFIG.MAX_WIDTH, dynamicMax);
    return Math.min(maxWidth, Math.max(RIGHT_PANEL_CONFIG.COMPACT_WIDTH, newWidth));
  }, []);

  const saveAndUpdateRightWidth = useCallback((width: number) => {
    preferredRightWidthRef.current = width;
    updateRightPanelWidth(width);
    setLastRightWidth(width);
    savePanelWidth(STORAGE_KEYS.RIGHT_PANEL_LAST_WIDTH, width);
  }, [updateRightPanelWidth]);

  const handleDoubleClick = useCallback(() => {
    const nextMode = getNextMode(rightPanelMode);
    const targetWidth = getModeWidth(nextMode, RIGHT_PANEL_CONFIG);
    saveAndUpdateRightWidth(calculateValidRightWidth(targetWidth));
  }, [rightPanelMode, calculateValidRightWidth, saveAndUpdateRightWidth]);

  const handleMouseDownResizer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const startX = e.clientX;
    const startWidth = currentRightWidth;
    let lastValidWidth = startWidth;

    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => {
        const valid = calculateValidRightWidth(startWidth + (startX - ev.clientX));
        lastValidWidth = valid;
        if (auxPaneElementRef.current && !state.layout.chatCollapsed) {
          auxPaneElementRef.current.style.width = `${valid}px`;
        } else {
          updateRightPanelWidth(valid);
        }
        animationFrameRef.current = null;
      });
    };

    const onUp = () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const snapped = getSnappedWidth(lastValidWidth, RIGHT_PANEL_CONFIG, false);
      if (snapped !== lastValidWidth) {
        saveAndUpdateRightWidth(snapped);
      } else {
        preferredRightWidthRef.current = lastValidWidth;
        updateRightPanelWidth(lastValidWidth);
        setLastRightWidth(lastValidWidth);
        savePanelWidth(STORAGE_KEYS.RIGHT_PANEL_LAST_WIDTH, lastValidWidth);
      }
      requestAnimationFrame(() => requestAnimationFrame(() => setIsDragging(false)));
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [currentRightWidth, calculateValidRightWidth, updateRightPanelWidth, saveAndUpdateRightWidth, state.layout.chatCollapsed]);

  // No-animation expansion
  const [isAuxPaneExpandingImmediate, setIsAuxPaneExpandingImmediate] = useState(false);

  useEffect(() => {
    const handler = (event: CustomEvent) => {
      if (event.detail?.noAnimation && state.layout.rightPanelCollapsed) {
        setIsAuxPaneExpandingImmediate(true);
        setTimeout(() => setIsAuxPaneExpandingImmediate(false), 0);
      }
    };
    window.addEventListener('expand-right-panel-immediate', handler as EventListener);
    return () => window.removeEventListener('expand-right-panel-immediate', handler as EventListener);
  }, [state.layout.rightPanelCollapsed]);

  // Responsive resize — also validate on mount to clamp widths restored from
  // localStorage that may exceed the current (non-maximized) window size.
  // A temporary clamp must not replace the user's preferred width, otherwise
  // maximizing the window again can leave the canvas too narrow for media and
  // the short-drama team to coexist.
  useEffect(() => {
    const validate = () => {
      const valid = calculateValidRightWidth(preferredRightWidthRef.current);
      if (valid !== currentRightWidth) updateRightPanelWidth(valid);
    };
    const rafId = requestAnimationFrame(validate);
    window.addEventListener('resize', validate);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', validate);
    };
  }, [currentRightWidth, calculateValidRightWidth, updateRightPanelWidth]);

  // Cleanup animation frames
  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const isRightAsMain = state.layout.chatCollapsed;
  const isChatHidden = state.layout.centerPanelCollapsed || isRightAsMain;
  const canUsePreviewFirstFloatingChat = isTauriRuntime();

  const panelModeLabels = useMemo(() => ({
    collapsed:    t('layout.panelMode.collapsed'),
    compact:      t('layout.panelMode.compact'),
    comfortable:  t('layout.panelMode.comfortable'),
    expanded:     t('layout.panelMode.expanded'),
  }), [t]);

  const panelCollapseHintStyles = useMemo(() => {
    const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
    return {
      ['--panel-collapse-hint-right' as any]: q(t('layout.panelCollapseHintRight')),
    } as React.CSSProperties;
  }, [t]);

  const handlePreviewFirstToggle = useCallback(() => {
    window.dispatchEvent(new CustomEvent('void:toggle-preview-first'));
  }, []);

  const dispatchSessionCanvasCapability = useCallback(async (
    intent: SessionCanvasCapabilityIntent,
  ) => reportSessionCanvasCapabilityFailure(intent, await openFirstPartyCanvasCapability({
    capabilityId: intent.capabilityId,
    source: intent.source,
    input: undefined,
    ...(intent.personaId ? { personaId: intent.personaId } : {}),
    idempotencyKey: intent.idempotencyKey,
    target: !intent.workspaceId || !intent.workspacePath
      || (intent.remoteSshHost && !intent.remoteConnectionId)
      ? {
          status: 'unavailable',
          reason: 'Session Canvas workspace is unavailable.',
        }
      : intent.remoteConnectionId
        ? {
            status: 'ready',
            hostId: 'agent',
            workspaceId: intent.workspaceId,
            workspacePath: intent.workspacePath,
            backend: 'remote',
            remoteConnectionId: intent.remoteConnectionId,
            ...(intent.remoteSshHost
              ? { remoteHost: intent.remoteSshHost }
              : {}),
          }
        : {
            status: 'ready',
            hostId: 'agent',
            workspaceId: intent.workspaceId,
            workspacePath: intent.workspacePath,
            backend: 'local',
          },
    ...(intent.sourceSessionId ? { sourceSessionId: intent.sourceSessionId } : {}),
    ...(intent.deliveryScope ? { deliveryScope: intent.deliveryScope } : {}),
  })), []);

  const handleAuxPaneReady = useCallback(() => {
    setIsAuxPaneReady(true);
  }, []);

  useEffect(() => {
    if (!isAuxPaneReady || !isActive) return;
    for (const [capabilityId, intent] of pendingCanvasCapabilityIntentsRef.current) {
      const intentState = getSessionCanvasIntentState(intent, {
        sourceSessionId: activeSessionId,
        workspaceId: workspaceId ?? capabilityWorkspaceId,
        workspacePath: workspacePath ?? capabilityWorkspacePath,
        remoteConnectionId: activeSessionRemoteConnectionId,
      });
      if (intentState === 'wait') continue;
      pendingCanvasCapabilityIntentsRef.current.delete(capabilityId);
      if (intentState === 'current') {
        void dispatchSessionCanvasCapability(intent);
      }
    }
  }, [
    activeSessionId,
    activeSessionRemoteConnectionId,
    dispatchSessionCanvasCapability,
    isActive,
    isAuxPaneReady,
    capabilityWorkspaceId,
    capabilityWorkspacePath,
    workspaceId,
    workspacePath,
  ]);

  const handleOpenSessionCapability = useCallback((
    capabilityId: SessionCapabilityId,
  ) => {
    if (state.layout.rightPanelCollapsed) {
      toggleRightPanel();
    }

    // Older sessions persist only a workspace path; resolve the id from the
    // opened workspaces so the typed target can be built.
    let targetWorkspaceId = capabilityWorkspaceId;
    if (!targetWorkspaceId && capabilityWorkspacePath && workspaceContext) {
      targetWorkspaceId = workspaceContext.openedWorkspacesList.find(
        candidate => isSamePath(candidate.rootPath, capabilityWorkspacePath),
      )?.id;
    }

    const intent: SessionCanvasCapabilityIntent = {
      capabilityId,
      source: 'capability-rail',
      idempotencyKey: `capability-rail:${++canvasCapabilityDeliverySequenceRef.current}`,
      ...(activeSessionId ? { sourceSessionId: activeSessionId } : {}),
      ...(activeSessionPersonaId ? { personaId: activeSessionPersonaId } : {}),
      ...(targetWorkspaceId ? { workspaceId: targetWorkspaceId } : {}),
      ...(capabilityWorkspacePath ? { workspacePath: capabilityWorkspacePath } : {}),
      ...(activeSessionRemoteConnectionId
        ? { remoteConnectionId: activeSessionRemoteConnectionId }
        : {}),
      ...(activeSessionRemoteSshHost
        ? { remoteSshHost: activeSessionRemoteSshHost }
        : {}),
    };

    // The canvas host only registers once the session's workspace is the
    // shell-active one; activate it first and let the queued intent dispatch
    // when the host comes up.
    if (
      targetWorkspaceId
      && targetWorkspaceId !== workspaceId
      && workspaceContext
    ) {
      pendingCanvasCapabilityIntentsRef.current.set(capabilityId, intent);
      void workspaceContext.setActiveWorkspace(targetWorkspaceId).catch(() => {
        pendingCanvasCapabilityIntentsRef.current.delete(capabilityId);
      });
      return;
    }

    if (!isAuxPaneReady || !isActive) {
      pendingCanvasCapabilityIntentsRef.current.set(capabilityId, intent);
      return;
    }
    void dispatchSessionCanvasCapability(intent);
  }, [
    activeSessionId,
    activeSessionPersonaId,
    activeSessionRemoteConnectionId,
    activeSessionRemoteSshHost,
    dispatchSessionCanvasCapability,
    isActive,
    isAuxPaneReady,
    state.layout.rightPanelCollapsed,
    toggleRightPanel,
    capabilityWorkspaceId,
    capabilityWorkspacePath,
    workspaceContext,
    workspaceId,
  ]);

  const teamCanvasCapability = resolveTeamCanvasCapability(
    activeTeamWorkspace.snapshot?.activeTeam?.teamDefinitionId,
  );
  const restoredTeamCanvasBindingRef = useRef<string | null>(null);
  const restoringTeamCanvasBindingRef = useRef<{
    restorationKey: string;
    operationId: number;
  } | null>(null);
  const teamCanvasRestoreOperationSequenceRef = useRef(0);
  useEffect(() => {
    if (!isActive) return;
    const activeTeam = activeTeamWorkspace.snapshot?.activeTeam;
    if (!activeTeamWorkspace.sessionId || !activeTeam || !teamCanvasCapability) return;
    reconcileFirstPartyTeamCanvasPresentation({
      capabilityId: teamCanvasCapability,
      parentSessionId: activeTeamWorkspace.sessionId,
      workspacePath,
      memberChildSessionIds: activeTeam.members.flatMap(member => (
        member.childSessionId ? [member.childSessionId] : []
      )),
    });
  }, [
    activeTeamWorkspace.sessionId,
    activeTeamWorkspace.snapshot,
    isActive,
    teamCanvasCapability,
    workspacePath,
  ]);
  useEffect(() => {
    if (!activeTeamWorkspace.teamBindingKey || !teamCanvasCapability) {
      restoredTeamCanvasBindingRef.current = null;
      restoringTeamCanvasBindingRef.current = null;
      return;
    }
    if (!isAuxPaneReady || !isActive) {
      return;
    }
    const restorationKey = [
      activeTeamWorkspace.teamBindingKey,
      teamCanvasCapability,
      workspaceId ?? workspacePath ?? 'workspace-unavailable',
      activeSessionRemoteConnectionId ?? 'local',
    ].join(':');
    if (
      restoredTeamCanvasBindingRef.current === restorationKey
      || restoringTeamCanvasBindingRef.current?.restorationKey === restorationKey
      || !activeTeamWorkspace.sessionId
      || !workspaceId
      || !workspacePath
    ) {
      return;
    }
    const operationId = ++teamCanvasRestoreOperationSequenceRef.current;
    restoringTeamCanvasBindingRef.current = { restorationKey, operationId };
    const deliveryActivation = activateFirstPartyCanvasDeliveryScope({
      scopeId: `team-canvas-restore:${activeTeamWorkspace.sessionId}`,
      revision: restorationKey,
    });
    const { deliveryScope } = deliveryActivation;
    let cancelled = false;
    void dispatchSessionCanvasCapability({
      capabilityId: teamCanvasCapability,
      source: 'restore',
      idempotencyKey: `team-restore:${restorationKey}`,
      sourceSessionId: activeTeamWorkspace.sessionId,
      deliveryScope,
      workspaceId,
      workspacePath,
      ...(activeSessionRemoteConnectionId
        ? { remoteConnectionId: activeSessionRemoteConnectionId }
        : {}),
      ...(activeSessionRemoteSshHost
        ? { remoteSshHost: activeSessionRemoteSshHost }
        : {}),
    }).then(result => {
      if (
        !cancelled
        && restoringTeamCanvasBindingRef.current?.operationId === operationId
        && (
          result.status === 'opened'
          || result.status === 'focused'
          || result.status === 'updated'
        )
      ) {
        restoredTeamCanvasBindingRef.current = restorationKey;
      }
    }).finally(() => {
      deliveryActivation.dispose();
      if (restoringTeamCanvasBindingRef.current?.operationId === operationId) {
        restoringTeamCanvasBindingRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      deliveryActivation.dispose();
      if (restoringTeamCanvasBindingRef.current?.operationId === operationId) {
        restoringTeamCanvasBindingRef.current = null;
      }
    };
  }, [
    activeTeamWorkspace.sessionId,
    activeTeamWorkspace.teamBindingKey,
    activeSessionRemoteConnectionId,
    activeSessionRemoteSshHost,
    dispatchSessionCanvasCapability,
    isActive,
    isAuxPaneReady,
    teamCanvasCapability,
    workspaceId,
    workspacePath,
  ]);

  const canToggleAuxPane = newSessionDraftStatus === 'idle'
    && !isRightAsMain
    && !state.layout.centerPanelCollapsed;
  const isAuxPaneExpanded = !state.layout.rightPanelCollapsed;
  // The Team presentation is a separate window now, so expanding or collapsing
  // Canvas no longer has to collapse it to free scene space.
  const toggleAuxPane = useCallback(() => {
    toggleRightPanel();
  }, [toggleRightPanel]);
  const ensureAuxPaneExpanded = useCallback(() => {
    if (state.layout.rightPanelCollapsed) {
      toggleRightPanel();
    }
  }, [state.layout.rightPanelCollapsed, toggleRightPanel]);
  return (
    <SessionCapabilityRailOutletProvider
      isCanvasExpanded={isAuxPaneExpanded}
      ensureCanvasExpanded={ensureAuxPaneExpanded}
    >
      <div
        ref={containerRef}
        className={[
          'void-session-scene',
          isDragging && 'void-session-scene--dragging',
          isEntering && 'layout-entering',
        ].filter(Boolean).join(' ')}
        style={panelCollapseHintStyles}
      >
      {/* ChatPane — FlowChat conversation */}
      {!isChatHidden && (
        <div
          className={`void-session-scene__chat-pane ${isDragging ? 'void-session-scene__chat-pane--dragging' : ''}`}
        >
          <ChatPane
            width={0}
            isFullscreen={false}
            isDragging={false}
            isPresentationActive={isActive}
            workspacePath={workspacePath}
            showChatInput
            showPreviewFirstToggle={canUsePreviewFirstFloatingChat}
            isPreviewFirstActive={isRightAsMain}
            onPreviewFirstToggle={handlePreviewFirstToggle}
          />
          {canToggleAuxPane && activeSessionId && (
            <SessionCapabilityRail
              capabilities={activeSessionCapabilities}
              teamWorkspace={activeTeamWorkspace.hasTeamBinding ? {
                label: activeTeamWorkspace.displayName,
                status: activeTeamWorkspace.presentationStatus,
                isOpen: isTeamWorkspaceOpen,
                onToggle: toggleTeamWorkspace,
                buttonRef: teamWorkspaceToggleRef,
              } : undefined}
              activeCapabilityId={
                isAuxPaneExpanded ? activeCanvasCapabilityId : undefined
              }
              isCanvasExpanded={isAuxPaneExpanded}
              onOpenCapability={handleOpenSessionCapability}
              onCanvasToggle={toggleAuxPane}
            />
          )}
        </div>
      )}

      {/* Resizer — always rendered (when chat visible) for slide animation */}
      {!isChatHidden && (
        <div
          ref={resizerRef}
          className={[
            'void-pane-resizer',
            state.layout.rightPanelCollapsed && 'void-pane-resizer--collapsed',
            isDragging && 'void-pane-resizer--dragging',
            isHovering && 'void-pane-resizer--hovering',
          ].filter(Boolean).join(' ')}
          onMouseDown={handleMouseDownResizer}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          tabIndex={state.layout.rightPanelCollapsed ? -1 : 0}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('layout.resizer.rightAriaLabel')}
          aria-valuenow={currentRightWidth}
          aria-valuemin={RIGHT_PANEL_CONFIG.COMPACT_WIDTH}
          aria-valuemax={RIGHT_PANEL_CONFIG.MAX_WIDTH}
          title={t('layout.resizer.title', { mode: panelModeLabels[rightPanelMode] })}
        >
          <div className="void-pane-resizer__line" />
          <div className="void-pane-resizer__handle">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="void-pane-resizer__icon">
              <circle cx="6" cy="4" r="1" fill="currentColor" />
              <circle cx="6" cy="8" r="1" fill="currentColor" />
              <circle cx="6" cy="12" r="1" fill="currentColor" />
              <circle cx="10" cy="4" r="1" fill="currentColor" />
              <circle cx="10" cy="8" r="1" fill="currentColor" />
              <circle cx="10" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
        </div>
      )}

      {/* AuxPane — ContentCanvas */}
      <div
        ref={auxPaneElementRef}
        className={[
          'void-session-scene__aux-pane',
          state.layout.rightPanelCollapsed         && 'void-session-scene__aux-pane--collapsed',
          isDragging                               && 'void-session-scene__aux-pane--dragging',
          isRightAsMain                            && 'void-session-scene__aux-pane--editor-mode',
          isAuxPaneExpandingImmediate              && 'void-session-scene__aux-pane--no-animation',
        ].filter(Boolean).join(' ')}
        style={{
          width: state.layout.rightPanelCollapsed
            ? undefined
            : isRightAsMain ? undefined : `${currentRightWidth}px`,
        }}
        data-mode={rightPanelMode}
        id="void-session-aux-pane"
      >
        <React.Suspense fallback={null}>
          <AuxPane
            workspacePath={workspacePath}
            isSceneActive={isActive}
            onReady={handleAuxPaneReady}
          />
        </React.Suspense>
      </div>
      </div>
    </SessionCapabilityRailOutletProvider>
  );
};

export default SessionScene;
