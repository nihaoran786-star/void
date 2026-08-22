/**
 * Modern FlowChat container.
 * Uses virtual scrolling with Zustand and syncs legacy store state.
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShortcut } from '@/infrastructure/hooks/useShortcut';
import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import { VirtualMessageList, VirtualMessageListRef } from './VirtualMessageList';
import { FlowChatHeader, type FlowChatHeaderTurnSummary } from './FlowChatHeader';
import { useSessionPersonaLabel } from '../../utils/sessionPersonaLabel';
import { WelcomePanel } from '../WelcomePanel';
import { HistorySessionPlaceholder } from './HistorySessionPlaceholder';
import { FlowChatContext, FlowChatContextValue } from './FlowChatContext';
import { useExploreGroupState } from './useExploreGroupState';
import { useFlowChatFileActions } from './useFlowChatFileActions';
import { useFlowChatNavigation } from './useFlowChatNavigation';
import { useFlowChatCopyDialog } from './useFlowChatCopyDialog';
import { useFlowChatSync } from './useFlowChatSync';
import { useFlowChatToolActions } from './useFlowChatToolActions';
import { useFlowChatSearch } from './useFlowChatSearch';
import type { VisibleTurnInfo } from '../../store/modernFlowChatStore';
import type { FlowChatConfig, FlowToolItem, Session, DialogTurn } from '../../types/flow-chat';
import type { LineRange } from '@/component-library';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { parsePullRequestUrl } from '@/shared/utils/pullRequestLinks';
import { createReviewPlatformPullRequestDetailTab } from '@/shared/utils/tabUtils';
import { isAcpFlowSession } from '../../utils/acpSession';
import { flowChatStore } from '../../store/FlowChatStore';
import { openBtwSessionInAuxPane } from '../../services/openBtwSession';
import { resolveSessionOpenIntent } from '../../services/sessionOpenIntent';
import { isChatPopupActive, subscribeChatPopupChange } from '../chatPopupState';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import {
  usePresentationActiveSession,
  usePresentationVirtualItems,
  usePresentationVisibleTurnInfo,
} from './useFlowChatPresentationStore';
import './ModernFlowChatContainer.scss';

const HEADER_TURN_PIN_RETRY_MAX_ATTEMPTS = 120;

interface ModernFlowChatContainerProps {
  className?: string;
  config?: Partial<FlowChatConfig>;
  isPresentationActive?: boolean;

  // Callbacks compatible with the legacy version.
  onFileViewRequest?: (filePath: string, fileName: string, lineRange?: LineRange) => void;
  onTabOpen?: (tabInfo: any, sessionId?: string, panelType?: string) => void;
  onOpenVisualization?: (type: string, data: any) => void;
  onSwitchToChatPanel?: () => void;
  showPreviewFirstToggle?: boolean;
  isPreviewFirstActive?: boolean;
  onPreviewFirstToggle?: () => void;
}

type BackgroundSubagentSummary = {
  sessionId: string;
  title: string;
  agentType?: string;
  status: 'processing' | 'finishing';
  workspacePath?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
  parentToolCallId?: string;
  subagentType?: string;
};

type HeaderTurnPinOptions = Parameters<VirtualMessageListRef['pinTurnToTop']>[1];

function isBackgroundTaskTool(item: FlowToolItem): boolean {
  const input = item.toolCall?.input;
  if (!input || typeof input !== 'object') {
    return false;
  }

  return (input as Record<string, unknown>).run_in_background === true;
}

function readSubagentExecutionStatus(session: Session): 'processing' | 'finishing' | null {
  const latestTurn = session.dialogTurns[session.dialogTurns.length - 1];
  if (!latestTurn) {
    return null;
  }

  if (
    latestTurn.status === 'pending' ||
    latestTurn.status === 'image_analyzing' ||
    latestTurn.status === 'processing'
  ) {
    return 'processing';
  }

  if (latestTurn.status === 'finishing' || latestTurn.status === 'cancelling') {
    return 'finishing';
  }

  return null;
}

function readProjectedSubagentTaskStatus(
  task: FlowToolItem['subagentTask'],
): 'processing' | 'finishing' | null {
  if (!task) {
    return null;
  }
  if (
    task.status === 'created' ||
    task.status === 'running' ||
    task.recoveryState === 'queued'
  ) {
    return 'processing';
  }
  if (
    task.deliveryState === 'pending' ||
    task.deliveryState === 'delivering'
  ) {
    return 'finishing';
  }
  return null;
}

function collectRunningBackgroundSubagents(parentSessionId: string | undefined): BackgroundSubagentSummary[] {
  if (!parentSessionId) {
    return [];
  }

  const { sessions } = flowChatStore.getState();
  const parentSession = sessions.get(parentSessionId);
  if (!parentSession) {
    return [];
  }

  const backgroundTaskBySessionId = new Map<string, FlowToolItem>();
  for (const turn of parentSession.dialogTurns) {
    for (const round of turn.modelRounds) {
      for (const item of round.items) {
        if (
          item.type === 'tool' &&
          item.toolName?.toLowerCase() === 'task' &&
          item.subagentSessionId &&
          isBackgroundTaskTool(item as FlowToolItem)
        ) {
          backgroundTaskBySessionId.set(item.subagentSessionId, item as FlowToolItem);
        }
      }
    }
  }

  const results: BackgroundSubagentSummary[] = [];
  for (const session of sessions.values()) {
    if (session.sessionKind !== 'subagent' || session.parentSessionId !== parentSessionId) {
      continue;
    }

    const parentTask = backgroundTaskBySessionId.get(session.sessionId);
    if (!parentTask) {
      continue;
    }

    const status =
      readProjectedSubagentTaskStatus(parentTask.subagentTask) ||
      readSubagentExecutionStatus(session);
    if (!status) {
      continue;
    }

    results.push({
      sessionId: session.sessionId,
      title: session.title?.trim() || parentTask.toolCall?.input?.description || 'Background subagent',
      agentType: session.subagentType || parentTask.toolCall?.input?.subagent_type || parentTask.toolCall?.input?.subagentType,
      status,
      workspacePath: session.workspacePath,
      remoteConnectionId: session.remoteConnectionId,
      remoteSshHost: session.remoteSshHost,
      parentToolCallId: session.parentToolCallId || parentTask.toolCall?.id || parentTask.id,
      subagentType: session.subagentType || parentTask.toolCall?.input?.subagent_type || parentTask.toolCall?.input?.subagentType,
    });
  }

  return results.sort((a, b) => {
    const aSession = sessions.get(a.sessionId);
    const bSession = sessions.get(b.sessionId);
    const createdAtDiff = (aSession?.createdAt ?? 0) - (bSession?.createdAt ?? 0);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return a.sessionId.localeCompare(b.sessionId);
  });
}

export const ModernFlowChatContainer: React.FC<ModernFlowChatContainerProps> = ({
  className = '',
  config,
  isPresentationActive = true,
  onFileViewRequest,
  onTabOpen,
  onOpenVisualization,
  onSwitchToChatPanel,
  showPreviewFirstToggle = false,
  isPreviewFirstActive = false,
  onPreviewFirstToggle,
}) => {
  const { t } = useTranslation('flow-chat');
  const virtualItems = usePresentationVirtualItems(isPresentationActive);
  const activeSession = usePresentationActiveSession(isPresentationActive);
  const visibleTurnInfo = usePresentationVisibleTurnInfo(isPresentationActive);
  const [pendingHeaderTurnId, setPendingHeaderTurnId] = useState<string | null>(null);
  const [searchOpenRequest, setSearchOpenRequest] = useState(0);
  const [backgroundSubagents, setBackgroundSubagents] = useState<BackgroundSubagentSummary[]>([]);
  const [chatPopupActive, setChatPopupActiveState] = useState(() => isChatPopupActive());
  const autoPinnedSessionIdRef = useRef<string | null>(null);
  const virtualListRef = useRef<VirtualMessageListRef>(null);
  const chatScopeRef = useRef<HTMLDivElement>(null);
  const headerTurnPinFrameRef = useRef<number | null>(null);
  const headerTurnPinAttemptsRef = useRef(0);
  const visibleTurnInfoRef = useRef<VisibleTurnInfo | null>(null);
  const turnSummariesRef = useRef<FlowChatHeaderTurnSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const { workspacePath } = useWorkspaceContext();
  const personaIdentityLabel = useSessionPersonaLabel(activeSession?.sessionId);
  const allowUserMessageRollback = !isAcpFlowSession(activeSession);
  const sessionOpenIntent = useMemo(
    () => resolveSessionOpenIntent({ session: activeSession }),
    [activeSession]
  );
  const historyPlaceholderState = sessionOpenIntent.action === 'show_error'
    ? 'failed'
    : sessionOpenIntent.action === 'show_loading'
      ? 'hydrating'
      : 'metadata-only';
  const showHistoryPlaceholder = virtualItems.length === 0 && (
    sessionOpenIntent.action === 'load_history' ||
    sessionOpenIntent.action === 'show_loading' ||
    (
      sessionOpenIntent.action === 'show_error' &&
      sessionOpenIntent.source === 'history'
    )
  );
  const {
    exploreGroupStates,
    onExploreGroupToggle: handleExploreGroupToggle,
    onExpandGroup: handleExpandGroup,
    onExpandAllInTurn: handleExpandAllInTurn,
    onCollapseGroup: handleCollapseGroup,
  } = useExploreGroupState(virtualItems);
  const { handleToolConfirm, handleToolReject } = useFlowChatToolActions();

  const { handleFileViewRequest } = useFlowChatFileActions({
    workspacePath,
    onFileViewRequest,
  });
  const handleHttpLinkClick = useCallback((url: string, _event: React.MouseEvent<HTMLAnchorElement>) => {
    const pullRequestTarget = parsePullRequestUrl(url);
    if (!pullRequestTarget) {
      return false;
    }

    createReviewPlatformPullRequestDetailTab({
      workspacePath: activeSession?.workspacePath || workspacePath,
      pullRequestId: pullRequestTarget.pullRequestId,
      pullRequestUrl: pullRequestTarget.webUrl,
      title: `PR #${pullRequestTarget.pullRequestId}`,
    });
    return true;
  }, [activeSession?.workspacePath, workspacePath]);
  const {
    searchQuery,
    onSearchChange,
    matches: searchMatches,
    matchIndices: searchMatchIndices,
    currentMatchIndex: searchCurrentMatchIndex,
    currentMatchVirtualIndex: searchCurrentMatchVirtualIndex,
    goToNext: handleSearchNext,
    goToPrev: handleSearchPrev,
    clearSearch,
  } = useFlowChatSearch(virtualItems);

  useFlowChatSync(isPresentationActive);
  useFlowChatCopyDialog(isPresentationActive);

  useFlowChatNavigation({
    isActive: isPresentationActive,
    activeSessionId: activeSession?.sessionId,
    virtualItems,
    virtualListRef,
    onExpandExploreGroup: handleExpandGroup,
  });

  const contextValue: FlowChatContextValue = useMemo(() => ({
    onFileViewRequest: handleFileViewRequest,
    onTabOpen,
    onHttpLinkClick: handleHttpLinkClick,
    onOpenVisualization,
    onSwitchToChatPanel,
    onToolConfirm: handleToolConfirm,
    onToolReject: handleToolReject,
    sessionId: activeSession?.sessionId,
    // Deliberately not `activeSessionOverride`: the active session object is
    // replaced on every streamed flush, and putting it here re-rendered every
    // mounted message ~10 times a second. Consumers read live turn state from
    // the store instead.
    sessionWorkspacePath: activeSession?.workspacePath,
    allowUserMessageRollback,
    config: {
      enableMarkdown: true,
      autoScroll: true,
      showTimestamps: false,
      maxHistoryRounds: 50,
      enableVirtualScroll: true,
      theme: 'dark',
      ...config,
    },
    exploreGroupStates,
    onExploreGroupToggle: handleExploreGroupToggle,
    onExpandGroup: handleExpandGroup,
    onExpandAllInTurn: handleExpandAllInTurn,
    onCollapseGroup: handleCollapseGroup,
    searchQuery,
    searchMatchIndices,
    searchCurrentMatchVirtualIndex,
  }), [
    handleFileViewRequest,
    onTabOpen,
    handleHttpLinkClick,
    onOpenVisualization,
    onSwitchToChatPanel,
    handleToolConfirm,
    handleToolReject,
    activeSession?.sessionId,
    activeSession?.workspacePath,
    allowUserMessageRollback,
    config,
    exploreGroupStates,
    handleExploreGroupToggle,
    handleExpandGroup,
    handleExpandAllInTurn,
    handleCollapseGroup,
    searchQuery,
    searchMatchIndices,
    searchCurrentMatchVirtualIndex,
  ]);

  const resolveLocalCommandHeaderTitle = useCallback((metadata: DialogTurn['userMessage']['metadata']) => {
    if (metadata?.kind === 'background_result' && metadata.sourceKind === 'subagent') {
      return t('message.backgroundSubagentResult');
    }
    if (metadata?.localCommandKind === 'usage_report') {
      return t('usage.title');
    }
    if (metadata?.localCommandKind === 'goal_pending') {
      return t('chatInput.goalGenerating');
    }
    if (metadata?.localCommandKind === 'goal_verifying') {
      return t('chatInput.goalVerifying');
    }
    return null;
  }, [t]);

  const turnSummaries = useMemo<FlowChatHeaderTurnSummary[]>(() => {
    return (activeSession?.dialogTurns ?? [])
      .filter(turn => !!turn.userMessage)
      .map((turn, index) => ({
        turnId: turn.id,
        turnIndex: index + 1,
        title: resolveLocalCommandHeaderTitle(turn.userMessage?.metadata)
          ?? turn.userMessage?.content ?? '',
      }));
  }, [activeSession?.dialogTurns, resolveLocalCommandHeaderTitle]);

  visibleTurnInfoRef.current = visibleTurnInfo;
  turnSummariesRef.current = turnSummaries;
  activeSessionIdRef.current = activeSession?.sessionId ?? null;

  const cancelHeaderTurnPinRequest = useCallback(() => {
    if (headerTurnPinFrameRef.current !== null) {
      cancelAnimationFrame(headerTurnPinFrameRef.current);
      headerTurnPinFrameRef.current = null;
    }
    headerTurnPinAttemptsRef.current = 0;
    setPendingHeaderTurnId(null);
  }, []);

  const scheduleHeaderTurnPinRetry = useCallback((turnId: string, options: HeaderTurnPinOptions) => {
    if (!isPresentationActive) return;
    const requestSessionId = activeSessionIdRef.current;

    if (headerTurnPinFrameRef.current !== null) {
      cancelAnimationFrame(headerTurnPinFrameRef.current);
      headerTurnPinFrameRef.current = null;
    }

    const retry = () => {
      headerTurnPinFrameRef.current = null;

      if (!isPresentationActive || activeSessionIdRef.current !== requestSessionId) {
        headerTurnPinAttemptsRef.current = 0;
        setPendingHeaderTurnId(null);
        return;
      }

      if (visibleTurnInfoRef.current?.turnId === turnId) {
        headerTurnPinAttemptsRef.current = 0;
        setPendingHeaderTurnId(null);
        return;
      }

      const targetStillExists = turnSummariesRef.current.some(turn => turn.turnId === turnId);
      if (!targetStillExists || headerTurnPinAttemptsRef.current >= HEADER_TURN_PIN_RETRY_MAX_ATTEMPTS) {
        headerTurnPinAttemptsRef.current = 0;
        setPendingHeaderTurnId(null);
        return;
      }

      const accepted = virtualListRef.current?.pinTurnToTop(turnId, {
        ...options,
        behavior: 'auto',
      }) ?? false;
      if (!accepted) {
        headerTurnPinAttemptsRef.current = 0;
        setPendingHeaderTurnId(null);
        return;
      }

      headerTurnPinAttemptsRef.current += 1;
      headerTurnPinFrameRef.current = requestAnimationFrame(retry);
    };

    headerTurnPinFrameRef.current = requestAnimationFrame(retry);
  }, [isPresentationActive]);

  const requestHeaderTurnPin = useCallback((turnId: string, options: HeaderTurnPinOptions) => {
    if (!isPresentationActive) return false;
    if (headerTurnPinFrameRef.current !== null) {
      cancelAnimationFrame(headerTurnPinFrameRef.current);
      headerTurnPinFrameRef.current = null;
    }

    const accepted = virtualListRef.current?.pinTurnToTop(turnId, options) ?? false;
    if (!accepted) {
      headerTurnPinAttemptsRef.current = 0;
      setPendingHeaderTurnId(null);
      return false;
    }

    headerTurnPinAttemptsRef.current = 1;
    setPendingHeaderTurnId(turnId);
    scheduleHeaderTurnPinRetry(turnId, options);
    return true;
  }, [isPresentationActive, scheduleHeaderTurnPinRetry]);

  const effectiveVisibleTurnInfo = useMemo<VisibleTurnInfo | null>(() => {
    return visibleTurnInfo;
  }, [visibleTurnInfo]);

  const currentHeaderMessage = useMemo(() => {
    const turnId = effectiveVisibleTurnInfo?.turnId;
    if (!turnId) {
      return effectiveVisibleTurnInfo?.userMessage ?? '';
    }
    const turn = activeSession?.dialogTurns.find(item => item.id === turnId);
    const localCommandTitle = resolveLocalCommandHeaderTitle(turn?.userMessage?.metadata);
    if (localCommandTitle) {
      return localCommandTitle;
    }
    return effectiveVisibleTurnInfo?.userMessage ?? '';
  }, [activeSession?.dialogTurns, effectiveVisibleTurnInfo?.turnId, effectiveVisibleTurnInfo?.userMessage, resolveLocalCommandHeaderTitle]);

  useEffect(() => {
    if (!isPresentationActive) {
      cancelHeaderTurnPinRequest();
      return;
    }
    if (!pendingHeaderTurnId) return;

    if (visibleTurnInfo?.turnId === pendingHeaderTurnId) {
      cancelHeaderTurnPinRequest();
      return;
    }

    const targetStillExists = turnSummaries.some(turn => turn.turnId === pendingHeaderTurnId);
    if (!targetStillExists) {
      cancelHeaderTurnPinRequest();
    }
  }, [cancelHeaderTurnPinRequest, isPresentationActive, pendingHeaderTurnId, turnSummaries, visibleTurnInfo?.turnId]);

  useEffect(() => {
    autoPinnedSessionIdRef.current = null;
    cancelHeaderTurnPinRequest();
  }, [activeSession?.sessionId, cancelHeaderTurnPinRequest]);

  useEffect(() => {
    return () => {
      cancelHeaderTurnPinRequest();
    };
  }, [cancelHeaderTurnPinRequest]);

  useEffect(() => {
    if (!isPresentationActive) return;
    const sessionId = activeSession?.sessionId;
    const latestTurnId = turnSummaries[turnSummaries.length - 1]?.turnId;
    if (!sessionId || !latestTurnId || autoPinnedSessionIdRef.current === sessionId) {
      return;
    }

    const resolvedLatestTurnId = latestTurnId;
    const resolvedSessionId = sessionId;

    autoPinnedSessionIdRef.current = resolvedSessionId;
    setPendingHeaderTurnId(resolvedLatestTurnId);

    const frameId = requestAnimationFrame(() => {
      const accepted = requestHeaderTurnPin(resolvedLatestTurnId, {
        behavior: 'auto',
        pinMode: 'sticky-latest',
      });

      if (!accepted) {
        autoPinnedSessionIdRef.current = null;
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [activeSession?.sessionId, isPresentationActive, requestHeaderTurnPin, turnSummaries]);

  useEffect(() => {
    if (!isPresentationActive || searchCurrentMatchVirtualIndex < 0) return;
    const frameId = requestAnimationFrame(() => {
      virtualListRef.current?.scrollToIndex(searchCurrentMatchVirtualIndex);
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isPresentationActive, searchCurrentMatchVirtualIndex]);

  const handleJumpToTurn = useCallback((turnId: string) => {
    if (!turnId) return false;

    const isLatestTurn = turnSummaries[turnSummaries.length - 1]?.turnId === turnId;

    return requestHeaderTurnPin(turnId, {
      behavior: 'smooth',
      pinMode: isLatestTurn ? 'sticky-latest' : 'transient',
    });
  }, [requestHeaderTurnPin, turnSummaries]);

  const handleJumpToPreviousTurn = useCallback(() => {
    if (!effectiveVisibleTurnInfo || effectiveVisibleTurnInfo.turnIndex <= 1) return;
    const previousTurn = turnSummaries[effectiveVisibleTurnInfo.turnIndex - 2];
    if (!previousTurn) return;
    handleJumpToTurn(previousTurn.turnId);
  }, [effectiveVisibleTurnInfo, handleJumpToTurn, turnSummaries]);

  const handleJumpToNextTurn = useCallback(() => {
    if (!effectiveVisibleTurnInfo || effectiveVisibleTurnInfo.turnIndex >= turnSummaries.length) return;
    const nextTurn = turnSummaries[effectiveVisibleTurnInfo.turnIndex];
    if (!nextTurn) return;
    handleJumpToTurn(nextTurn.turnId);
  }, [effectiveVisibleTurnInfo, handleJumpToTurn, turnSummaries]);

  const handleRetryHistoryLoad = useCallback(() => {
    const sessionId = activeSession?.sessionId;
    if (!sessionId) return;
    void FlowChatManager.getInstance().switchChatSession(sessionId);
  }, [activeSession?.sessionId]);

  useEffect(() => {
    if (!isPresentationActive) return;
    const syncBackgroundSubagents = () => {
      setBackgroundSubagents(collectRunningBackgroundSubagents(activeSession?.sessionId));
    };

    syncBackgroundSubagents();
    return flowChatStore.subscribe(syncBackgroundSubagents);
  }, [activeSession?.sessionId, isPresentationActive]);

  const handleOpenBackgroundSubagent = useCallback((childSessionId: string) => {
    const subagent = backgroundSubagents.find(item => item.sessionId === childSessionId);
    if (!subagent || !activeSession?.sessionId) {
      return;
    }

    openBtwSessionInAuxPane({
      childSessionId,
      parentSessionId: activeSession.sessionId,
      workspacePath: subagent.workspacePath || activeSession.workspacePath,
      sessionKind: 'subagent',
      sessionTitle: subagent.title,
      agentType: subagent.agentType,
      parentToolCallId: subagent.parentToolCallId,
      subagentType: subagent.subagentType,
      remoteConnectionId: subagent.remoteConnectionId || activeSession.remoteConnectionId,
      remoteSshHost: subagent.remoteSshHost || activeSession.remoteSshHost,
      includeInternal: true,
    });
  }, [activeSession, backgroundSubagents]);

  useShortcut(
    'chat.stopGeneration',
    { key: 'Escape', scope: 'chat', allowInInput: true },
    () => {
      void FlowChatManager.getInstance().cancelCurrentTask();
    },
    {
      priority: 20,
      description: 'keyboard.shortcuts.chat.stopGeneration',
      enabled: isPresentationActive && !chatPopupActive,
    }
  );

  useEffect(() => {
    if (!isPresentationActive) return;
    setChatPopupActiveState(isChatPopupActive());
    return subscribeChatPopupChange(() => {
      setChatPopupActiveState(isChatPopupActive());
    });
  }, [isPresentationActive]);

  useShortcut(
    'chat.newSession',
    { key: 'N', ctrl: true, scope: 'chat' },
    () => {
      void (async () => {
        try {
          useSessionModeStore.getState().setMode('code');
          await FlowChatManager.getInstance().createChatSession({}, 'agentic');
        } catch {
          /* ignore */
        }
      })();
    },
    { priority: 10, description: 'keyboard.shortcuts.chat.newSession', enabled: isPresentationActive }
  );

  useShortcut(
    'btw-fill',
    { key: 'B', ctrl: true, alt: true, scope: 'chat', allowInInput: true },
    () => {
      const selected = (window.getSelection?.()?.toString() ?? '').trim();
      const message = selected ? `/btw Explain this:\n\n${selected}` : '/btw ';
      window.dispatchEvent(new CustomEvent('fill-chat-input', { detail: { message } }));
    },
    { priority: 20, description: 'keyboard.shortcuts.chat.btwFill', enabled: isPresentationActive }
  );

  useShortcut(
    'chat.search',
    { key: 'F', ctrl: true, scope: 'chat', allowInInput: false },
    () => {
      setSearchOpenRequest(prev => prev + 1);
    },
    { priority: 15, description: 'keyboard.shortcuts.chat.search', enabled: isPresentationActive }
  );

  return (
    <FlowChatPresentationActivityProvider isActive={isPresentationActive}>
      <FlowChatContext.Provider value={contextValue}>
        <div
          ref={chatScopeRef}
          className={`modern-flowchat-container flow-chat-typography ${className}`}
          data-shortcut-scope="chat"
        >
        <FlowChatHeader
          currentTurn={effectiveVisibleTurnInfo?.turnIndex ?? 0}
          totalTurns={effectiveVisibleTurnInfo?.totalTurns ?? 0}
          currentUserMessage={currentHeaderMessage}
          visible={virtualItems.length > 0}
          sessionId={activeSession?.sessionId}
          turns={turnSummaries}
          onJumpToTurn={handleJumpToTurn}
          onJumpToCurrentTurn={() => {
            const turnId = effectiveVisibleTurnInfo?.turnId;
            if (turnId) handleJumpToTurn(turnId);
          }}
          onJumpToPreviousTurn={handleJumpToPreviousTurn}
          onJumpToNextTurn={handleJumpToNextTurn}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchMatchCount={searchMatches.length}
          searchCurrentMatch={searchMatches.length > 0 ? searchCurrentMatchIndex + 1 : 0}
          onSearchNext={handleSearchNext}
          onSearchPrev={handleSearchPrev}
          onSearchClose={clearSearch}
          searchOpenRequest={searchOpenRequest}
          backgroundSubagents={backgroundSubagents}
          onOpenBackgroundSubagent={handleOpenBackgroundSubagent}
          showPreviewFirstToggle={showPreviewFirstToggle}
          isPreviewFirstActive={isPreviewFirstActive}
          onPreviewFirstToggle={onPreviewFirstToggle}
          personaIdentityLabel={personaIdentityLabel}
        />

        <div className="modern-flowchat-container__messages">
          {showHistoryPlaceholder ? (
            <HistorySessionPlaceholder
              state={historyPlaceholderState}
              onRetry={handleRetryHistoryLoad}
            />
          ) : virtualItems.length === 0 ? (
            <WelcomePanel
              key={activeSession?.sessionId ?? 'welcome'}
              sessionMode={activeSession?.mode}
              workspacePath={activeSession?.workspacePath}
              onQuickAction={(command) => {
                window.dispatchEvent(new CustomEvent('fill-chat-input', {
                  detail: { message: command }
                }));
              }}
            />
          ) : (
            <VirtualMessageList
              // Remount per session so Virtuoso does not reuse the previous
              // viewport before the new session's auto-pin settles.
              key={activeSession?.sessionId ?? 'virtual-message-list'}
              ref={virtualListRef}
              onUserScrollIntent={cancelHeaderTurnPinRequest}
            />
          )}
        </div>
        </div>
      </FlowChatContext.Provider>
    </FlowChatPresentationActivityProvider>
  );
};

ModernFlowChatContainer.displayName = 'ModernFlowChatContainer';
