import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, GripHorizontal, Minus, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FlowTextBlock } from '@/flow_chat/components/FlowTextBlock';
import { FlowToolCard } from '@/flow_chat/components/FlowToolCard';
import { useImeEnterGuard } from '@/flow_chat/hooks/useImeEnterGuard';
import {
  listenCompactChatPresentation,
  requestCompactChatCancelTask,
  requestCompactChatClose,
  requestCompactChatPresentation,
  sendCompactChatMessage,
  type CompactChatPresentation,
} from '@/flow_chat/services/CompactChatPresentationBridge';
import { ModelThinkingDisplay } from '@/flow_chat/tool-cards/ModelThinkingDisplay';
import type { AnyFlowItem, FlowTextItem, FlowThinkingItem, FlowToolItem } from '@/flow_chat/types/flow-chat';
import {
  minimizeCompactChatFloatingWindow,
  revealCompactChatFloatingWindow,
  resizeCompactChatFloatingWindow,
  startCompactChatFloatingWindowDrag,
  startCompactChatFloatingWindowResize,
  type CompactChatResizeDirection,
} from '@/infrastructure/config/services/CompactChatWindowService';
import './CompactChatDesktopWindow.scss';

const DEFAULT_WINDOW_SIZE = { width: 420, height: 680 };
const MAX_RENDERED_TURNS = 12;
const RESIZE_DIRECTIONS: CompactChatResizeDirection[] = [
  'North',
  'NorthEast',
  'East',
  'SouthEast',
  'South',
  'SouthWest',
  'West',
  'NorthWest',
];

interface CompactChatFlowItemProps {
  item: AnyFlowItem;
  isLastItem: boolean;
  sessionId: string;
}

const CompactChatFlowItem: React.FC<CompactChatFlowItemProps> = ({ item, isLastItem, sessionId }) => {
  switch (item.type) {
    case 'text':
      return (
        <div className="void-compact-chat-window__message void-compact-chat-window__message--assistant void-compact-chat-window__message--flow-text">
          <FlowTextBlock
            textItem={item as FlowTextItem}
            replayStreamingOnMount={false}
          />
        </div>
      );

    case 'thinking':
      return (
        <div className="void-compact-chat-window__assistant-item void-compact-chat-window__assistant-item--thinking">
          <ModelThinkingDisplay
            thinkingItem={item as FlowThinkingItem}
            isLastItem={isLastItem}
          />
        </div>
      );

    case 'tool':
      return (
        <div className="void-compact-chat-window__assistant-item void-compact-chat-window__assistant-item--tool">
          <FlowToolCard
            toolItem={item as FlowToolItem}
            sessionId={sessionId}
          />
        </div>
      );

    default:
      return null;
  }
}

export const CompactChatDesktopWindow: React.FC = () => {
  const { t } = useTranslation('flow-chat');
  const [presentation, setPresentation] = useState<CompactChatPresentation>({
    status: 'unavailable',
    reason: 'no-active-session',
  });
  const [hasReceivedPresentation, setHasReceivedPresentation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const shellRef = useRef<HTMLDivElement>(null);
  const lastPresentationSequenceRef = useRef(0);
  const { isImeEnter, handleCompositionStart, handleCompositionEnd } = useImeEnterGuard();

  useEffect(() => {
    document.documentElement.classList.add('void-compact-chat-window-root');
    document.body.classList.add('void-compact-chat-window-body');
    void resizeCompactChatFloatingWindow(DEFAULT_WINDOW_SIZE);

    let removeListener: (() => void) | null = null;
    let disposed = false;
    void listenCompactChatPresentation(nextPresentation => {
      if (disposed) return;
      const sequence = nextPresentation.sequence ?? 0;
      if (sequence > 0) {
        if (sequence <= lastPresentationSequenceRef.current) {
          return;
        }
        lastPresentationSequenceRef.current = sequence;
      }
      setHasReceivedPresentation(true);
      setPresentation(nextPresentation);
    }).then(unlisten => {
      if (disposed) {
        unlisten();
      } else {
        removeListener = unlisten;
        void requestCompactChatPresentation();
      }
    });

    return () => {
      disposed = true;
      removeListener?.();
      document.documentElement.classList.remove('void-compact-chat-window-root');
      document.body.classList.remove('void-compact-chat-window-body');
    };
  }, []);

  useEffect(() => {
    if (!hasReceivedPresentation) return;
    void revealCompactChatFloatingWindow();
  }, [hasReceivedPresentation]);

  const activeSessionId = presentation.status === 'ready'
    ? presentation.activeSession.sessionId
    : null;

  const isStreaming = useMemo(() => {
    if (presentation.status !== 'ready') return false;
    const lastTurn = presentation.activeSession.dialogTurns.at(-1);
    return lastTurn?.status === 'processing'
      || lastTurn?.status === 'finishing'
      || lastTurn?.status === 'image_analyzing';
  }, [presentation]);

  const handleSendMessage = useCallback(() => {
    if (!activeSessionId) return;
    const message = inputValue.trim();
    if (!message) return;
    void sendCompactChatMessage(message, activeSessionId);
    setInputValue('');
  }, [activeSessionId, inputValue]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isImeEnter(event)) return;
      event.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage, isImeEnter]);

  const handleCancel = useCallback(() => {
    if (!activeSessionId) return;
    void requestCompactChatCancelTask(activeSessionId);
  }, [activeSessionId]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    void startCompactChatFloatingWindowDrag();
  }, []);

  const handleResizePointerDown = useCallback((
    event: React.PointerEvent<HTMLSpanElement>,
    direction: CompactChatResizeDirection,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void startCompactChatFloatingWindowResize(direction);
  }, []);

  const visibleTurns = presentation.status === 'ready'
    ? presentation.activeSession.dialogTurns.slice(-MAX_RENDERED_TURNS)
    : [];

  if (!hasReceivedPresentation) {
    return (
      <main
        className="void-compact-chat-window void-compact-chat-window--booting"
        ref={shellRef}
        aria-hidden="true"
      />
    );
  }

  return (
    <main className="void-compact-chat-window" ref={shellRef}>
      {RESIZE_DIRECTIONS.map(direction => (
        <span
          key={direction}
          className={`void-compact-chat-window__resize-handle void-compact-chat-window__resize-handle--${direction.toLowerCase()}`}
          data-resize-direction={direction}
          onPointerDown={(event) => handleResizePointerDown(event, direction)}
          aria-hidden="true"
        />
      ))}
      <section
        className="void-compact-chat-window__shell"
        data-testid="compact-chat-surface"
        aria-label={t('compactChat.title')}
      >
        <div
          className="void-compact-chat-window__drag-bar"
          onPointerDown={handlePointerDown}
          role="toolbar"
          aria-label={t('compactChat.dragHandle')}
        >
          <GripHorizontal size={16} aria-hidden="true" />
          <span className="void-compact-chat-window__title">
            {presentation.status === 'ready'
              ? presentation.activeSession.title
              : t('compactChat.title')}
          </span>
          <button
            type="button"
            className="void-compact-chat-window__icon-button"
            data-testid="compact-chat-minimize"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void minimizeCompactChatFloatingWindow()}
            aria-label={t('compactChat.minimize')}
            title={t('compactChat.minimize')}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="void-compact-chat-window__icon-button"
            data-testid="compact-chat-close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void requestCompactChatClose()}
            aria-label={t('compactChat.close')}
            title={t('compactChat.close')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="void-compact-chat-window__body">
          {presentation.status === 'ready' ? (
            <div className="void-compact-chat-window__messages">
              {visibleTurns.map(turn => {
                const assistantItems = turn.modelRounds.flatMap((round, roundIndex) => (
                  round.items.map((item, itemIndex) => ({
                    isLastItem: roundIndex === turn.modelRounds.length - 1 && itemIndex === round.items.length - 1,
                    item,
                    key: `${round.id}:${item.id}`,
                  }))
                ));
                return (
                  <article key={turn.id} className="void-compact-chat-window__turn">
                    {turn.userMessage?.content && (
                      <div className="void-compact-chat-window__message void-compact-chat-window__message--user">
                        {turn.userMessage.content}
                      </div>
                    )}
                    {assistantItems.length > 0 && (
                      <div className="void-compact-chat-window__assistant-flow">
                        {assistantItems.map(({ item, key, isLastItem }) => (
                          <CompactChatFlowItem
                            key={key}
                            item={item}
                            isLastItem={isLastItem}
                            sessionId={presentation.activeSession.sessionId}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
              {visibleTurns.length === 0 && (
                <div className="void-compact-chat-window__unavailable" role="status">
                  <h1>{t('compactChat.empty.title')}</h1>
                  <p>{t('compactChat.empty.description')}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="void-compact-chat-window__unavailable" role="status">
              <h1>{t('compactChat.unavailable.title')}</h1>
              <p>{t('compactChat.unavailable.description')}</p>
            </div>
          )}
        </div>

        <div className="void-compact-chat-window__composer">
          <input
            className="void-compact-chat-window__input"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={isStreaming ? t('toolCards.toolbar.aiProcessing') : t('toolCards.toolbar.inputMessage')}
            disabled={!activeSessionId || isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              className="void-compact-chat-window__send-button void-compact-chat-window__send-button--stop"
              onClick={handleCancel}
              aria-label={t('input.stop')}
              title={t('input.stop')}
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="void-compact-chat-window__send-button"
              onClick={handleSendMessage}
              disabled={!activeSessionId || !inputValue.trim()}
              aria-label={t('input.send')}
              title={t('input.send')}
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
};

export default CompactChatDesktopWindow;
