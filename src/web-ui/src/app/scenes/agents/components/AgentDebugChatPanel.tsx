/**
 * Presentational debug-chat panel for the agent-authoring page.
 * Receives the resolved session and lifecycle status as props from the owner
 * (CreateAgentPage) and renders the conversation using the FlowChat view
 * building blocks. It never touches the hook, the runtime, or the store.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  justReplaced?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onReset?: () => void;
  onMessageSent?: () => void;
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

/**
 * One plain sentence per blocked state, shown where the composer would be.
 * Wording is deliberately non-technical: no session, fingerprint or runtime.
 */
const BLOCKED_HINT_KEY: Record<Exclude<PanelStatus, 'ready'>, string> = {
  idle: 'agentsOverview.debug.hint.idle',
  creating: 'agentsOverview.debug.hint.preparing',
  stale: 'agentsOverview.debug.hint.updating',
  error: 'agentsOverview.debug.hint.error',
};

const isActiveTurnStatus = (status?: DialogTurn['status']): boolean =>
  status === 'pending' ||
  status === 'image_analyzing' ||
  status === 'processing' ||
  status === 'finishing';

export const AgentDebugChatPanel: React.FC<AgentDebugChatPanelProps> = ({
  session,
  status,
  justReplaced = false,
  onRetry,
  onReset,
  onMessageSent,
}) => {
  const { t } = useTranslation('scenes/agents');

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
  // Fail-closed: the real composer only exists on a ready session. Every other
  // state shows a plain, non-interactive line saying why in everyday words.
  const canSend = status === 'ready' && activeSession != null;
  const blockedHint = canSend ? null : t(BLOCKED_HINT_KEY[status as Exclude<PanelStatus, 'ready'>]
    ?? BLOCKED_HINT_KEY.creating);
  const canReset = Boolean(onReset) && showConversation && virtualItems.length > 0;

  return (
    <section className="agent-debug-chat-panel" aria-label={t('agentsOverview.debug.title')}>
      {/* Quiet header: what this is, in one line, plus one plain text action. */}
      <div className="agent-debug-chat-panel__header">
        <div className="agent-debug-chat-panel__heading">
          <h3 className="agent-debug-chat-panel__title">{t('agentsOverview.debug.title')}</h3>
          <p className="agent-debug-chat-panel__subtitle">
            {t('agentsOverview.debug.subtitle')}
          </p>
        </div>
        {canReset && (
          <button
            type="button"
            className="agent-debug-chat-panel__action"
            data-testid="agent-debug-chat-reset"
            onClick={onReset}
          >
            {t('agentsOverview.debug.reset')}
          </button>
        )}
      </div>

      {/* After an edit lands, one sentence: the next try uses the newest draft. */}
      {status === 'ready' && justReplaced && showConversation && (
        <p
          className="agent-debug-chat-panel__note"
          data-testid="agent-debug-chat-stale-banner"
          role="status"
        >
          {t('agentsOverview.debug.hint.updated')}
        </p>
      )}

      {!showConversation && (
        <div className="agent-debug-chat-panel__body agent-debug-chat-panel__body--centered">
          <p className="agent-debug-chat-panel__placeholder">
            {t('agentsOverview.debug.emptyConversation')}
          </p>
        </div>
      )}

      {showConversation && activeSession && (
        <FlowChatContext.Provider value={contextValue}>
          <FlowChatPresentationActivityProvider isActive>
            <div className="agent-debug-chat-panel__conversation">
              <div ref={scrollContainerRef} className="agent-debug-chat-panel__body">
                {virtualItems.length === 0 ? (
                  <div className="agent-debug-chat-panel__empty-conversation">
                    {t('agentsOverview.debug.emptyConversation')}
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
          {canSend && (
            <div className="agent-debug-chat-panel__composer" data-testid="agent-debug-chat-composer">
              <LazyChatInput
                sessionId={activeSession.sessionId}
                className="void-chat-input--embedded"
                onSendMessage={onMessageSent}
              />
            </div>
          )}
        </FlowChatContext.Provider>
      )}

      {/* Composer slot when sending is closed: the reason, in one sentence. */}
      {blockedHint && (
        <div
          className="agent-debug-chat-panel__composer agent-debug-chat-panel__composer--blocked"
          data-testid="agent-debug-chat-composer-blocked"
          aria-disabled="true"
          role={status === 'error' ? 'alert' : 'status'}
        >
          <span className="agent-debug-chat-panel__hint">{blockedHint}</span>
          {status === 'error' && onRetry && (
            <button
              type="button"
              className="agent-debug-chat-panel__action"
              data-testid="agent-debug-chat-retry"
              onClick={onRetry}
            >
              {t('agentsOverview.debug.retry')}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

AgentDebugChatPanel.displayName = 'AgentDebugChatPanel';
