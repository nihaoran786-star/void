/**
 * Presentational debug-chat panel for the agent-authoring page.
 * Receives the resolved session and lifecycle status as props from the owner
 * (CreateAgentPage) and renders the conversation using the FlowChat view
 * building blocks. It never touches the hook, the runtime, or the store.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bot, Loader2, RefreshCw } from 'lucide-react';
import { FlowChatContext } from '@/flow_chat/components/modern/FlowChatContext';
import { FlowChatPresentationActivityProvider } from '@/flow_chat/components/modern/FlowChatPresentationActivity';
import { VirtualItemRenderer } from '@/flow_chat/components/modern/VirtualItemRenderer';
import { ProcessingIndicator } from '@/flow_chat/components/modern/ProcessingIndicator';
import {
  shouldReserveProcessingIndicatorSpace,
  shouldShowProcessingIndicator,
} from '@/flow_chat/components/modern/processingIndicatorVisibility';
import { useExploreGroupState } from '@/flow_chat/components/modern/useExploreGroupState';
import { ScrollToBottomButton } from '@/flow_chat';
import { LazyChatInput } from '@/flow_chat/components/LazyChatInput';
import type { DialogTurn, FlowChatConfig, Session } from '@/flow_chat/types/flow-chat';
import { sessionToVirtualItems } from '@/flow_chat/store/modernFlowChatStore';
import './AgentDebugChatPanel.scss';

export interface AgentDebugChatPanelProps {
  session?: Session | null;
  status: 'idle' | 'creating' | 'ready' | 'stale' | 'error';
  draftFingerprint: string;
  justReplaced?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

type PanelStatus = AgentDebugChatPanelProps['status'];

const PANEL_CONFIG: FlowChatConfig = {
  enableMarkdown: true,
  autoScroll: true,
  showTimestamps: false,
  maxHistoryRounds: 50,
  enableVirtualScroll: false,
  theme: 'dark',
};

const STATUS_TEXT_KEY: Record<PanelStatus, string> = {
  idle: 'agentsOverview.debug.status.idle',
  creating: 'agentsOverview.debug.status.creating',
  ready: 'agentsOverview.debug.status.ready',
  stale: 'agentsOverview.debug.status.stale',
  error: 'agentsOverview.debug.status.error',
};

const STATUS_TONE: Record<PanelStatus, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  idle: 'neutral',
  creating: 'info',
  ready: 'success',
  stale: 'warning',
  error: 'error',
};

const isActiveTurnStatus = (status?: DialogTurn['status']): boolean =>
  status === 'pending' ||
  status === 'image_analyzing' ||
  status === 'processing' ||
  status === 'finishing';

export const AgentDebugChatPanel: React.FC<AgentDebugChatPanelProps> = ({
  session,
  status,
  draftFingerprint,
  justReplaced = false,
  error,
  onRetry,
}) => {
  const { t } = useTranslation('scenes/agents');
  const { t: tFlow } = useTranslation('flow-chat');

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const autoScrollFrameRef = useRef<number | null>(null);

  const virtualItems = useMemo(() => sessionToVirtualItems(session ?? null), [session]);
  const {
    exploreGroupStates,
    onExploreGroupToggle,
    onExpandGroup,
    onExpandAllInTurn,
    onCollapseGroup,
  } = useExploreGroupState(virtualItems);

  const updateScrollAffordance = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
    if (distanceFromBottom < 80) {
      shouldAutoScrollRef.current = true;
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        shouldAutoScrollRef.current = false;
      } else if (e.deltaY > 0) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        if (distanceFromBottom < 100) {
          shouldAutoScrollRef.current = true;
        }
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('scroll', updateScrollAffordance, { passive: true });
    updateScrollAffordance();
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', updateScrollAffordance);
    };
  }, [updateScrollAffordance]);

  useEffect(() => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    const container = scrollContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    autoScrollFrameRef.current = window.requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      container.scrollTop = container.scrollHeight;
      setShowScrollToBottom(false);
    });
    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [virtualItems]);

  const handleScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    shouldAutoScrollRef.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    setShowScrollToBottom(false);
  }, []);

  const lastDialogTurn = session?.dialogTurns[session.dialogTurns.length - 1];
  const lastModelRound = lastDialogTurn?.modelRounds[lastDialogTurn.modelRounds.length - 1];
  const lastItem = lastModelRound?.items[lastModelRound.items.length - 1];
  const lastItemContent =
    lastItem && 'content' in lastItem
      ? String((lastItem as { content?: unknown }).content || '')
      : '';
  const isTurnProcessing = isActiveTurnStatus(lastDialogTurn?.status);
  const [isContentGrowing, setIsContentGrowing] = useState(true);
  const contentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (contentTimeoutRef.current) {
      clearTimeout(contentTimeoutRef.current);
      contentTimeoutRef.current = null;
    }
    if (!isTurnProcessing) {
      setIsContentGrowing(false);
      return;
    }
    setIsContentGrowing(true);
    contentTimeoutRef.current = setTimeout(() => {
      contentTimeoutRef.current = null;
      setIsContentGrowing(false);
    }, 500);
    return () => {
      if (contentTimeoutRef.current) {
        clearTimeout(contentTimeoutRef.current);
        contentTimeoutRef.current = null;
      }
    };
  }, [isTurnProcessing, lastItemContent]);

  const showProcessingIndicator = useMemo(
    () => shouldShowProcessingIndicator({
      isTurnProcessing,
      lastItem,
      isContentGrowing,
    }),
    [isTurnProcessing, lastItem, isContentGrowing],
  );

  const reserveProcessingIndicatorSpace = useMemo(
    () => shouldReserveProcessingIndicatorSpace({
      isTurnProcessing,
      lastItem,
      isContentGrowing,
    }),
    [isTurnProcessing, lastItem, isContentGrowing],
  );

  const contextValue = useMemo(() => ({
    sessionId: session?.sessionId,
    activeSessionOverride: session ?? null,
    allowUserMessageEdit: false,
    config: PANEL_CONFIG,
    exploreGroupStates,
    onExploreGroupToggle,
    onExpandGroup,
    onExpandAllInTurn,
    onCollapseGroup,
  }), [
    session,
    exploreGroupStates,
    onExploreGroupToggle,
    onExpandGroup,
    onExpandAllInTurn,
    onCollapseGroup,
  ]);

  const activeSession = status === 'ready' || status === 'stale' ? session : null;
  const showConversation = activeSession != null;
  const fingerprint = draftFingerprint.slice(0, 8);

  return (
    <div className="agent-debug-chat-panel">
      <div className="agent-debug-chat-panel__header">
        <span className="agent-debug-chat-panel__title">{t('agentsOverview.debug.title')}</span>
        {fingerprint && (
          <code className="agent-debug-chat-panel__fingerprint">{fingerprint}</code>
        )}
        <span className="agent-debug-chat-panel__status" data-tone={STATUS_TONE[status]}>
          {t(STATUS_TEXT_KEY[status])}
        </span>
      </div>

      {status === 'stale' && justReplaced && showConversation && (
        <div
          className="agent-debug-chat-panel__stale-banner"
          data-testid="agent-debug-chat-stale-banner"
        >
          <RefreshCw size={13} />
          <span>{t('agentsOverview.debug.stale')}</span>
        </div>
      )}

      {status === 'idle' && (
        <div className="agent-debug-chat-panel__body agent-debug-chat-panel__body--centered">
          <div className="agent-debug-chat-panel__state">
            <Bot size={28} strokeWidth={1.5} />
            <span>{t('agentsOverview.debug.empty')}</span>
          </div>
        </div>
      )}

      {status === 'creating' && (
        <div className="agent-debug-chat-panel__body agent-debug-chat-panel__body--centered">
          <div className="agent-debug-chat-panel__state">
            <Loader2 className="agent-debug-chat-panel__spinner" size={22} />
            <span>{t('agentsOverview.debug.creating')}</span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="agent-debug-chat-panel__body agent-debug-chat-panel__body--centered">
          <div className="agent-debug-chat-panel__state agent-debug-chat-panel__state--error">
            <AlertTriangle size={22} strokeWidth={1.5} />
            <span className="agent-debug-chat-panel__error-message">
              {t('agentsOverview.debug.error', { message: error ?? '' })}
            </span>
            {onRetry && (
              <button
                type="button"
                className="agent-debug-chat-panel__retry-button"
                onClick={onRetry}
              >
                {t('agentsOverview.debug.retry')}
              </button>
            )}
          </div>
        </div>
      )}

      {showConversation && activeSession && (
        <FlowChatContext.Provider value={contextValue}>
          <FlowChatPresentationActivityProvider isActive>
            <div className="agent-debug-chat-panel__conversation">
              <div ref={scrollContainerRef} className="agent-debug-chat-panel__body">
                {virtualItems.length === 0 ? (
                  <div className="agent-debug-chat-panel__empty-conversation">
                    {tFlow('session.empty')}
                  </div>
                ) : (
                  <>
                    {virtualItems.map((item, index) => (
                      <VirtualItemRenderer
                        key={`${item.turnId}-${item.type}-${index}`}
                        item={item}
                        index={index}
                      />
                    ))}
                    <ProcessingIndicator
                      visible={showProcessingIndicator}
                      reserveSpace={reserveProcessingIndicatorSpace}
                    />
                  </>
                )}
              </div>
              <ScrollToBottomButton
                visible={showScrollToBottom}
                onClick={handleScrollToBottom}
                className="agent-debug-chat-panel__scroll-to-bottom"
              />
            </div>
          </FlowChatPresentationActivityProvider>
          <div className="agent-debug-chat-panel__composer" data-testid="agent-debug-chat-composer">
            <LazyChatInput
              sessionId={activeSession.sessionId}
              className="void-chat-input--embedded"
            />
          </div>
        </FlowChatContext.Provider>
      )}
    </div>
  );
};

AgentDebugChatPanel.displayName = 'AgentDebugChatPanel';
