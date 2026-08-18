/* eslint-disable @typescript-eslint/no-use-before-define */
/**
 * Explore group renderer.
 * Renders merged explore-only rounds as an always-visible activity region.
 */

import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowItem, FlowToolItem, FlowTextItem, FlowThinkingItem } from '../../types/flow-chat';
import type { ExploreGroupData } from '../../store/modernFlowChatStore';
import { FlowTextBlock } from '../FlowTextBlock';
import { FlowToolCard } from '../FlowToolCard';
import { ModelThinkingDisplay } from '../../tool-cards/ModelThinkingDisplay';
import { useFlowChatContext } from './FlowChatContext';
import './ExploreRegion.scss';

export interface ExploreGroupRendererProps {
  data: ExploreGroupData;
  turnId: string;
}

export const ExploreGroupRenderer: React.FC<ExploreGroupRendererProps> = React.memo(({
  data,
  turnId,
}) => {
  const { t } = useTranslation('flow-chat');

  const {
    groupId,
    allItems,
    stats,
    isGroupStreaming,
    isLastGroupInTurn,
    wasCutByCritical,
  } = data;

  // Build summary text with i18n.
  const displaySummary = useMemo(() => {
    const { readCount, searchCount, commandCount } = stats;
    
    const parts: string[] = [];
    if (readCount > 0) {
      parts.push(t('exploreRegion.readFiles', { count: readCount }));
    }
    if (searchCount > 0) {
      parts.push(t('exploreRegion.searchCount', { count: searchCount }));
    }
    if (commandCount > 0) {
      parts.push(t('exploreRegion.commandCount', { count: commandCount }));
    }
    
    if (parts.length === 0) {
      const toolCount = allItems.filter(item => item.type === 'tool').length;
      if (toolCount === 0 && allItems.some(item => item.type === 'thinking')) {
        return t('toolCards.think.thinkingProcess');
      }
      return t('exploreRegion.exploreCount', {
        count: toolCount,
      });
    }
    
    return parts.join(t('exploreRegion.separator'));
  }, [allItems, stats, t]);

  const isThinkingOnly = useMemo(() => (
    allItems.some(item => item.type === 'thinking')
    && allItems.every(item => item.type !== 'tool')
  ), [allItems]);

  // Build class list.
  const className = [
    'explore-region',
    'explore-region--always-visible',
    isGroupStreaming ? 'explore-region--streaming' : null,
    !wasCutByCritical ? 'explore-region--bounded' : null,
  ].filter(Boolean).join(' ');
  return (
    <div
      data-tool-card-id={groupId}
      data-beautiful-component="tool-chips"
      className={className}
    >
      {/*
        One activity indicator per turn. The group header stays a quiet summary
        line in both states; a second loader here ran its own animation and its
        own elapsed clock next to the turn indicator.
      */}
      {!isThinkingOnly && (
        <div className="explore-region__header">
          <span className="explore-region__summary">{displaySummary}</span>
        </div>
      )}
      <div className="explore-region__content">
        {allItems.map((item, idx) => (
          <ExploreItemRenderer
            key={item.id}
            item={item}
            turnId={turnId}
            isLastItem={isLastGroupInTurn && idx === allItems.length - 1}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * Explore item renderer inside the explore region.
 * Uses React.memo to avoid unnecessary re-renders.
 */
interface ExploreItemRendererProps {
  item: FlowItem;
  turnId: string;
  isLastItem?: boolean;
}

const ExploreItemRenderer = React.memo<ExploreItemRendererProps>(({ item, turnId, isLastItem }) => {
  const {
    onToolConfirm,
    onToolReject,
    onFileViewRequest,
    onTabOpen,
    sessionId,
  } = useFlowChatContext();
  
  const handleConfirm = useCallback(async (toolId: string, updatedInput?: any, permissionOptionId?: string, approve?: boolean) => {
    if (onToolConfirm) {
      await onToolConfirm(toolId, updatedInput, permissionOptionId, approve);
    }
  }, [onToolConfirm]);
  
  const handleReject = useCallback(async (toolId: string, permissionOptionId?: string) => {
    if (onToolReject) {
      await onToolReject(toolId, permissionOptionId);
    }
  }, [onToolReject]);
  
  const handleOpenInEditor = useCallback((filePath: string) => {
    if (onFileViewRequest) {
      onFileViewRequest(filePath, filePath.split(/[/\\]/).pop() || filePath);
    }
  }, [onFileViewRequest]);
  
  const handleOpenInPanel = useCallback((_panelType: string, data: any) => {
    if (onTabOpen) {
      onTabOpen(data, sessionId);
    }
  }, [onTabOpen, sessionId]);
  
  switch (item.type) {
    case 'text':
      return (
        <FlowTextBlock
          textItem={item as FlowTextItem}
        />
      );
    
    case 'thinking': {
      const thinkingItem = item as FlowThinkingItem;
      return (
        <ModelThinkingDisplay thinkingItem={thinkingItem} isLastItem={isLastItem} />
      );
    }
    
    case 'tool':
      return (
        <div className="flowchat-flow-item" data-flow-item-id={item.id} data-flow-item-type="tool">
          <FlowToolCard
            toolItem={item as FlowToolItem}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onOpenInEditor={handleOpenInEditor}
            onOpenInPanel={handleOpenInPanel}
            sessionId={sessionId}
            turnId={turnId}
          />
        </div>
      );

    default:
      return null;
  }
});

ExploreGroupRenderer.displayName = 'ExploreGroupRenderer';
