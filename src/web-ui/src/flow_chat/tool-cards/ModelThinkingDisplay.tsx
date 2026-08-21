/**
 * Production model-summary presenter.
 *
 * Uses the Beautiful UI Thinking source component directly, including its own
 * disclosure: the summary reads as one quiet line and the reasoning opens on
 * click. Flow Chat adds no second collapse state or animation layer around it.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BeautifulUIStage } from '@/component-library/components/BeautifulUI';
import ThinkingState, {
  type ThinkingStateRow,
} from '@/component-library/preview/beautiful-ui-original/components/thinking-state';
import type { FlowThinkingItem } from '../types/flow-chat';

interface ModelThinkingDisplayProps {
  thinkingItem: FlowThinkingItem;
  /** Kept for renderer compatibility; the disclosure state is component-local. */
  isLastItem?: boolean;
  displayContext?: 'default' | 'subagent-projection';
  /**
   * Set where a pinned activity bar already reports live work. While reasoning
   * streams, this component shows its own animated header and a live tail of
   * the raw text, which next to that bar is a second running indicator saying
   * the same thing in two places. With this set the reasoning stays out of the
   * transcript until it settles, and then joins it as one quiet, openable line.
   *
   * Surfaces without a pinned bar (the compact window, the component gallery)
   * leave it off and keep the live tail as their only progress signal.
   */
  deferToPinnedActivity?: boolean;
}

function toPlainThinkingSummary(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

export const ModelThinkingDisplay: React.FC<ModelThinkingDisplayProps> = ({
  thinkingItem,
  deferToPinnedActivity = false,
}) => {
  const { t } = useTranslation('flow-chat');
  const isActive = thinkingItem.isStreaming || thinkingItem.status === 'streaming';
  const rows = useMemo<ThinkingStateRow[]>(() => {
    const summary = toPlainThinkingSummary(thinkingItem.content);
    return summary ? [{ primary: summary }] : [];
  }, [thinkingItem.content]);

  // The pinned bar is already saying "working" with a live timer; this one
  // joins the transcript once it has something settled to show.
  if (deferToPinnedActivity && isActive) return null;

  return (
    <div
      data-tool-card-id={thinkingItem.id}
      data-beautiful-component="thinking-state"
      className="flow-thinking-item flow-thinking-item--beautiful-original"
    >
      <BeautifulUIStage mode="surface">
        <ThinkingState
          variant="Reasoning"
          rows={rows}
          working={isActive}
          liveText={thinkingItem.content}
          activeLabel={t('toolCards.think.thinking')}
          doneLabel={t('toolCards.think.thinkingProcess')}
          compact
        />
      </BeautifulUIStage>
    </div>
  );
};
