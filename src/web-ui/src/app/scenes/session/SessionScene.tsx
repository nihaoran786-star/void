/**
 * SessionScene — Session scene layout.
 *
 * Layout (left to right):
 *   ChatPane (flex:1, FlowChat conversation)
 *   PaneResizer (draggable divider)
 *   AuxPane (variable width, ContentCanvas tabs)
 *   TeamWorkspace (fixed member workspace when a Team is bound)
 *
 * Resizer logic moved here from WorkspaceShell.
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../hooks/useApp';
import ChatPane from './ChatPane';
import AuxPane, { type AuxPaneRef } from './AuxPane';
import SessionCapabilityRail from './SessionCapabilityRail';
import { SessionCapabilityRailOutletProvider } from '@/app/presentation/sessionCapabilityRailOutlet';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import {
  useAgentCanvasStore,
  useCanvasStore,
} from '@/app/components/panels/content-canvas/stores';
import { removeDuplicateTeamMemberCanvasTabs } from '@/app/presentation/TeamMemberCanvasPresentation';
import { useActiveSessionCapabilities } from '@/flow_chat/hooks/useActiveSessionCapabilities';
import type { SessionCapabilityId } from '@/flow_chat/services/sessionCapabilities';
import {
  TeamWorkspacePanel,
  resolveTeamCanvasCapability,
  useTeamWorkspacePresentationStore,
  useActiveSessionTeamWorkspace,
} from '@/team_workspace';

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


interface SessionSceneProps {
  workspacePath?: string;
  isEntering?: boolean;
  isActive?: boolean;
}

const SessionScene: React.FC<SessionSceneProps> = ({
  workspacePath,
  isEntering = false,
  isActive = true,
}) => {
  const { t } = useTranslation('flow-chat');
  const { state, updateRightPanelWidth, toggleRightPanel } = useApp();
  const newSessionDraftStatus = useSessionModeStore(store => store.draftStatus);
  const {
    sessionId: activeSessionId,
    capabilities: activeSessionCapabilities,
  } = useActiveSessionCapabilities();
  const activeTeamWorkspace = useActiveSessionTeamWorkspace({ workspacePath });
  const activeCanvasCapabilityId = useCanvasStore(canvasState => {
    const activeTab = canvasState.primaryGroup.tabs.find(
      tab => tab.id === canvasState.primaryGroup.activeTabId,
    );
    if (activeTab?.content.type === 'short-drama-center') {
      return 'short-drama' as const;
    }
    if (activeTab?.content.type === 'workspace-media-gallery') {
      return 'workspace-media' as const;
    }
    return undefined;
  });
  const auxPaneRef = useRef<AuxPaneRef>(null);

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
  const selectTeamWorkspaceMember = useTeamWorkspacePresentationStore(
    store => store.selectMember,
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

  const closeTeamWorkspace = useCallback(() => {
    if (!activeTeamWorkspace.sessionId) return;
    closeTeamWorkspacePresentation(activeTeamWorkspace.sessionId);
    queueMicrotask(() => teamWorkspaceToggleRef.current?.focus());
  }, [activeTeamWorkspace.sessionId, closeTeamWorkspacePresentation]);

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
    // NavPanel (240px) is outside SessionScene — only account for resizer + min chat width
    const isWideTeamLayout = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1280px)').matches
      : window.innerWidth >= 1280;
    const teamWorkspaceWidth = isTeamWorkspaceOpen && isWideTeamLayout ? 368 : 0;
    const reserved = PANEL_COMMON_CONFIG.RESIZER_WIDTH
      + PANEL_COMMON_CONFIG.MIN_CENTER_WIDTH
      + teamWorkspaceWidth;
    const dynamicMax = containerWidth - reserved;
    const maxWidth = Math.min(RIGHT_PANEL_CONFIG.MAX_WIDTH, dynamicMax);
    return Math.min(maxWidth, Math.max(RIGHT_PANEL_CONFIG.COMPACT_WIDTH, newWidth));
  }, [isTeamWorkspaceOpen]);

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

  const handleOpenSessionCapability = useCallback((
    capabilityId: SessionCapabilityId,
  ) => {
    if (state.layout.rightPanelCollapsed) {
      toggleRightPanel();
    }

    const eventName = capabilityId === 'short-drama'
      ? 'void:open-short-drama-center'
      : 'void:open-workspace-media';
    window.dispatchEvent(new CustomEvent(eventName));
  }, [state.layout.rightPanelCollapsed, toggleRightPanel]);

  const teamCanvasCapability = resolveTeamCanvasCapability(
    activeTeamWorkspace.snapshot?.activeTeam?.teamDefinitionId,
  );
  useEffect(() => {
    const activeTeam = activeTeamWorkspace.snapshot?.activeTeam;
    if (!activeTeamWorkspace.sessionId || !activeTeam) return;
    removeDuplicateTeamMemberCanvasTabs(useAgentCanvasStore.getState(), {
      parentSessionId: activeTeamWorkspace.sessionId,
      workspacePath,
      memberChildSessionIds: activeTeam.members.flatMap(member => (
        member.childSessionId ? [member.childSessionId] : []
      )),
      removeShortDramaWorkspaceTabs: teamCanvasCapability === 'short-drama',
    });
  }, [
    activeTeamWorkspace.sessionId,
    activeTeamWorkspace.snapshot,
    teamCanvasCapability,
    workspacePath,
  ]);
  useEffect(() => {
    if (!activeTeamWorkspace.teamBindingKey || !teamCanvasCapability) return;
    if (state.layout.rightPanelCollapsed) toggleRightPanel();
    const eventName = teamCanvasCapability === 'short-drama'
      ? 'void:open-short-drama-center'
      : 'void:open-workspace-media';
    window.dispatchEvent(new CustomEvent(eventName));
  }, [
    activeTeamWorkspace.teamBindingKey,
    state.layout.rightPanelCollapsed,
    teamCanvasCapability,
    toggleRightPanel,
  ]);

  const canToggleAuxPane = newSessionDraftStatus === 'idle'
    && !isRightAsMain
    && !state.layout.centerPanelCollapsed;
  const isAuxPaneExpanded = !state.layout.rightPanelCollapsed;
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
          isTeamWorkspaceOpen && 'void-session-scene--has-team-workspace',
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
              onCanvasToggle={toggleRightPanel}
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
        <AuxPane
          ref={auxPaneRef}
          workspacePath={workspacePath}
          isSceneActive={isActive}
        />
      </div>
      {activeTeamWorkspace.hasTeamBinding && isTeamWorkspaceOpen && (
        <div
          className="void-session-scene__team-workspace"
          id="void-team-workspace-panel"
          data-testid="session-team-workspace-panel"
        >
          <TeamWorkspacePanel
            state={activeTeamWorkspace}
            isActive={isActive}
            workspacePath={workspacePath}
            onClose={closeTeamWorkspace}
            selectedMemberId={
              teamWorkspacePresentation?.selectedMemberId ?? null
            }
            onSelectedMemberChange={memberId => {
              if (activeTeamWorkspace.sessionId) {
                selectTeamWorkspaceMember(
                  activeTeamWorkspace.sessionId,
                  memberId,
                );
              }
            }}
          />
        </div>
      )}
      </div>
    </SessionCapabilityRailOutletProvider>
  );
};

export default SessionScene;
