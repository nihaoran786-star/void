/**
 * Streaming text block component.
 * Renders the real streamed content without replaying a second typewriter
 * animation over provider updates.
 */

import React, { useState, useEffect, useRef } from 'react';
import { MarkdownRenderer } from '@/component-library';
import type { FlowTextItem } from '../types/flow-chat';
import { useFlowChatContext } from './modern/FlowChatContext';
import {
  autoPreviewOrchestrator,
  detectAutoPreviewCandidates,
} from '@/shared/services/preview/AutoPreviewService';
import {
  isStartupRenderTraceEnabled,
  recordReactRenderProfile,
  startupTrace,
} from '@/shared/utils/startupTrace';
import './FlowTextBlock.scss';

// Idle timeout (ms) after content stops growing.
const CONTENT_IDLE_TIMEOUT = 500;

interface FlowTextBlockProps {
  textItem: FlowTextItem;
  className?: string;
  replayStreamingOnMount?: boolean;
}

/**
 * Use React.memo to avoid unnecessary re-renders.
 * Re-render only when key textItem fields change.
 */
export const FlowTextBlock = React.memo<FlowTextBlockProps>(({
  textItem,
  className = '',
}) => {
  const {
    activeSessionOverride,
    sessionWorkspacePath,
    onFileViewRequest,
    onTabOpen,
    onHttpLinkClick,
    onOpenVisualization,
    sessionId,
  } = useFlowChatContext();

  // Normalize content to a string.
  const content = typeof textItem.content === 'string'
    ? textItem.content
    : String(textItem.content || '');

  const isStreaming = textItem.isStreaming &&
    (textItem.status === 'streaming' || textItem.status === 'running');
  const displayContent = content;
  const hasMountedRef = useRef(false);
  const wasStreamingRef = useRef(isStreaming);

  // Heuristic: if content does not change for a while, streaming is done.
  const [isContentGrowing, setIsContentGrowing] = useState(true);
  const lastContentRef = useRef(content);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (content !== lastContentRef.current) {
      lastContentRef.current = content;
      setIsContentGrowing(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsContentGrowing(false);
      }, CONTENT_IDLE_TIMEOUT);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content]);

  useEffect(() => {
    if (textItem.status === 'completed' || !textItem.isStreaming) {
      setIsContentGrowing(false);
    }
  }, [textItem.status, textItem.isStreaming]);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (!sessionId || !wasStreaming || isStreaming || textItem.status !== 'completed' || textItem.runtimeStatus) {
      return;
    }

    const [candidate] = detectAutoPreviewCandidates({
      text: content,
      source: 'assistant-message',
      sessionId,
      turnId: textItem.id,
      workspaceKey: activeSessionOverride?.workspacePath ?? sessionWorkspacePath,
    });

    if (candidate) {
      autoPreviewOrchestrator.maybeOpen(candidate);
    }
  }, [
    activeSessionOverride?.workspacePath,
    sessionWorkspacePath,
    content,
    isStreaming,
    sessionId,
    textItem.id,
    textItem.runtimeStatus,
    textItem.status,
  ]);

  const isActivelyStreaming = textItem.isStreaming &&
    (textItem.status === 'streaming' || textItem.status === 'running') &&
    isContentGrowing;

  // A runtime-status item is a phase marker, not content. The single turn
  // activity indicator at the tail of the turn represents that phase; rendering
  // a second loader here duplicated it with its own independent timer.
  const flowTextBlockContent = textItem.runtimeStatus ? null : (
    <div
      data-beautiful-component="streaming-text"
      className={`flow-text-block ${className} ${isActivelyStreaming ? 'streaming flow-text-block--streaming' : ''}`}
    >
      {textItem.isMarkdown ? (
        <MarkdownRenderer
          content={displayContent}
          // Pass the raw streaming flag (not the idle-gated
          // `isActivelyStreaming`) so the code-block render path inside
          // Markdown stays stable across bursty AI output. Otherwise
          // `isContentGrowing` toggles every >500ms idle and forces the
          // fallback <pre> / Prism highlighter to swap back and forth,
          // which makes line numbers and the code body visibly shake
          // until the stream finally completes.
          isStreaming={isStreaming}
          onFileViewRequest={onFileViewRequest}
          onTabOpen={onTabOpen}
          onHttpLinkClick={onHttpLinkClick}
          showRightPanelPreviewLinks
          onOpenVisualization={(visualization) => {
            onOpenVisualization?.(visualization?.type, visualization?.data);
          }}
        />
      ) : (
        <div className="text-content">
          {displayContent}
        </div>
      )}
    </div>
  );

  const renderTraceEnabled = isStartupRenderTraceEnabled();
  if (!renderTraceEnabled) {
    return flowTextBlockContent;
  }

  const hasCodeBlock = /```/.test(displayContent);
  const hasTable = /\n\|.+\|\n\|[-:\s|]+\|/.test(displayContent);

  return (
    <React.Profiler
      id="FlowTextBlock"
      onRender={(
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      ) => {
        recordReactRenderProfile(startupTrace, {
          component: id,
          phase,
          actualDurationMs: actualDuration,
          baseDurationMs: baseDuration,
          startTimeMs: startTime,
          commitTimeMs: commitTime,
          itemId: textItem.id,
          contentLength: content.length,
          renderedCount: displayContent.length,
          isStreaming,
          hasCodeBlock,
          hasTable,
        });
      }}
    >
      {flowTextBlockContent}
    </React.Profiler>
  );
}, (prevProps, nextProps) => {
  const prev = prevProps.textItem;
  const next = nextProps.textItem;
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.status === next.status &&
    prevProps.className === nextProps.className &&
    prevProps.replayStreamingOnMount === nextProps.replayStreamingOnMount
  );
});
