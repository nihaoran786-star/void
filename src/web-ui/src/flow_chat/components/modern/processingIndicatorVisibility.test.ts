import { describe, expect, it } from 'vitest';
import type { FlowTextItem, FlowToolItem } from '../../types/flow-chat';
import {
  readProcessingIndicatorMessageKey,
  shouldReserveProcessingIndicatorSpace,
  shouldShowProcessingIndicator,
} from './processingIndicatorVisibility';

function runtimeStatusItem(messageKey?: string): FlowTextItem {
  return {
    id: 'runtime-status-main-round-1',
    type: 'text',
    content: '\u200B',
    timestamp: 1000,
    status: 'streaming',
    isStreaming: true,
    isMarkdown: false,
    runtimeStatus: {
      phase: 'waiting_model',
      scope: 'main',
      ...(messageKey ? { messageKey } : {}),
    },
  };
}

describe('processingIndicatorVisibility', () => {
  it('shows the single turn activity indicator for a runtime-status phase', () => {
    const input = {
      isTurnProcessing: true,
      isSessionProcessing: true,
      processingPhase: 'thinking',
      lastItem: runtimeStatusItem(),
      isContentGrowing: false,
    };

    expect(shouldShowProcessingIndicator(input)).toBe(true);
    expect(shouldReserveProcessingIndicatorSpace(input)).toBe(true);
  });

  it('reports the runtime-reported phase key so the indicator can name the phase', () => {
    expect(readProcessingIndicatorMessageKey(runtimeStatusItem('runtimeStatus.waitingForModelResponse')))
      .toBe('runtimeStatus.waitingForModelResponse');
  });

  it('reports no phase key for ordinary content', () => {
    expect(readProcessingIndicatorMessageKey({
      id: 'answer-1',
      type: 'text',
      content: 'Partial answer',
      timestamp: 1000,
      status: 'streaming',
      isStreaming: true,
    } satisfies FlowTextItem)).toBeNull();
    expect(readProcessingIndicatorMessageKey(undefined)).toBeNull();
  });

  it('keeps existing behavior for idle text waits without inline runtime status', () => {
    const input = {
      isTurnProcessing: true,
      isSessionProcessing: false,
      processingPhase: 'thinking',
      lastItem: {
        id: 'answer-1',
        type: 'text',
        content: 'Partial answer',
        timestamp: 1000,
        status: 'streaming',
        isStreaming: true,
      } satisfies FlowTextItem,
      isContentGrowing: false,
    };

    expect(shouldShowProcessingIndicator(input)).toBe(true);
    expect(shouldReserveProcessingIndicatorSpace(input)).toBe(true);
  });

  it('keeps hiding the footer indicator while a tool card is already running', () => {
    const input = {
      isTurnProcessing: true,
      isSessionProcessing: true,
      lastItem: {
        id: 'tool-1',
        type: 'tool',
        toolName: 'Shell',
        toolCall: { input: {}, id: 'tool-1' },
        timestamp: 1000,
        status: 'running',
      } satisfies FlowToolItem,
      isContentGrowing: false,
    };

    expect(shouldShowProcessingIndicator(input)).toBe(false);
    expect(shouldReserveProcessingIndicatorSpace(input)).toBe(true);
  });
});
