import { describe, expect, it } from 'vitest';
import { buildModelRoundItemGroups } from './modelRoundItemGrouping';
import type { FlowTextItem, FlowThinkingItem, FlowToolItem, FlowUserSteeringItem } from '../../types/flow-chat';

function makeTextItem(id: string): FlowTextItem {
  return {
    id,
    type: 'text',
    content: 'assistant text',
    isStreaming: false,
    isMarkdown: true,
    timestamp: 1000,
    status: 'completed',
  };
}

function makeReadTool(
  id: string,
  status: FlowToolItem['status'] = 'completed',
  endTime?: number,
): FlowToolItem {
  return {
    id,
    type: 'tool',
    toolName: 'Read',
    timestamp: 1001,
    status,
    toolCall: {
      id,
      input: { file_path: 'src/main.rs' },
    },
    ...(status === 'completed'
      ? {
          toolResult: {
            result: 'file contents',
            success: true,
          },
        }
      : {}),
    ...(endTime !== undefined ? { endTime } : {}),
  };
}

function makeThinkingItem(id: string): FlowThinkingItem {
  return {
    id,
    type: 'thinking',
    content: 'brief reasoning',
    isStreaming: false,
    isCollapsed: true,
    timestamp: 1000,
    status: 'completed',
  };
}

function makeSteeringItem(id: string): FlowUserSteeringItem {
  return {
    id,
    type: 'user-steering',
    steeringId: id,
    content: 'Run the newly queued request now',
    roundIndex: 0,
    timestamp: 1002,
    status: 'pending',
  };
}

describe('buildModelRoundItemGroups', () => {
  it('keeps user-steering items as critical visible content', () => {
    const steeringItem = makeSteeringItem('steering-1');

    const groups = buildModelRoundItemGroups({
      items: [steeringItem],
      isStreaming: true,
      disableExploreGrouping: false,
      isCollapsibleToolItem: () => false,
    });

    expect(groups).toEqual([
      {
        type: 'critical',
        item: steeringItem,
      },
    ]);
  });

  it('flushes pending assistant text before rendering user-steering content', () => {
    const textItem = makeTextItem('text-1');
    const steeringItem = makeSteeringItem('steering-1');

    const groups = buildModelRoundItemGroups({
      items: [textItem, steeringItem],
      isStreaming: true,
      disableExploreGrouping: false,
      isCollapsibleToolItem: () => false,
    });

    expect(groups).toEqual([
      {
        type: 'critical',
        item: textItem,
      },
      {
        type: 'critical',
        item: steeringItem,
      },
    ]);
  });

  it('preserves existing explore grouping for collapsible tool rounds', () => {
    const textItem = makeTextItem('text-1');
    const toolItem = makeReadTool('tool-1');

    const groups = buildModelRoundItemGroups({
      items: [textItem, toolItem],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read',
    });

    expect(groups).toEqual([
      {
        type: 'explore',
        items: [textItem, toolItem],
        isLast: true,
      },
    ]);
  });

  it('keeps settled routine tools and adjacent thinking in one quiet group before a critical tool', () => {
    const firstThinking = makeThinkingItem('thinking-1');
    const routineTool = { ...makeReadTool('spec-1'), toolName: 'GetToolSpec' };
    const secondThinking = makeThinkingItem('thinking-2');
    const criticalTool = { ...makeReadTool('task-1'), toolName: 'Task' };

    const groups = buildModelRoundItemGroups({
      items: [firstThinking, routineTool, secondThinking, criticalTool],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'GetToolSpec',
    });

    expect(groups).toEqual([
      {
        type: 'explore',
        items: [firstThinking, routineTool, secondThinking],
        isLast: false,
      },
      {
        type: 'critical',
        item: criticalTool,
      },
    ]);
  });

  it('keeps completed thinking quiet even when the next tool must stay visible', () => {
    const thinking = makeThinkingItem('thinking-before-task');
    const criticalTool = { ...makeReadTool('task-1'), toolName: 'Task' };

    const groups = buildModelRoundItemGroups({
      items: [thinking, criticalTool],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: () => false,
    });

    expect(groups).toEqual([
      { type: 'explore', items: [thinking], isLast: false },
      { type: 'critical', item: criticalTool },
    ]);
  });

  it('keeps an active collapsible tool outside the preceding explore group', () => {
    const completedTool = makeReadTool('tool-1');
    const runningTool = makeReadTool('tool-2', 'running');

    const groups = buildModelRoundItemGroups({
      items: [completedTool, runningTool],
      isStreaming: true,
      disableExploreGrouping: false,
      // Defensive contract: grouping itself keeps active work visible even if
      // a caller accidentally reports the running tool as routine/collapsible.
      isCollapsibleToolItem: item => item.toolName === 'Read',
    });

    expect(groups).toEqual([
      {
        type: 'explore',
        items: [completedTool],
        isLast: false,
      },
      {
        type: 'critical',
        item: runningTool,
      },
    ]);
  });

  it('keeps a just-completed collapsible tool visible before merging it', () => {
    const completedTool = makeReadTool('tool-1');
    const justCompletedTool = makeReadTool('tool-2', 'completed', 10_000);

    const groups = buildModelRoundItemGroups({
      items: [completedTool, justCompletedTool],
      isStreaming: true,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read' && item.status === 'completed',
      nowMs: 10_200,
    });

    expect(groups).toEqual([
      {
        type: 'explore',
        items: [completedTool],
        isLast: false,
      },
      {
        type: 'critical',
        item: justCompletedTool,
      },
    ]);
  });

  it('merges a completed collapsible tool after the transition window', () => {
    const completedTool = makeReadTool('tool-1');
    const settledTool = makeReadTool('tool-2', 'completed', 10_000);

    const groups = buildModelRoundItemGroups({
      items: [completedTool, settledTool],
      isStreaming: true,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read' && item.status === 'completed',
      nowMs: 11_001,
    });

    expect(groups).toEqual([
      {
        type: 'explore',
        items: [completedTool, settledTool],
        isLast: true,
      },
    ]);
  });

  it('does not keep non-streaming completed tools in a time-based critical state', () => {
    const completedTool = makeReadTool('tool-1');
    const justCompletedTool = makeReadTool('tool-2', 'completed', 10_000);

    const groups = buildModelRoundItemGroups({
      items: [completedTool, justCompletedTool],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read' && item.status === 'completed',
      nowMs: 10_200,
    });

    expect(groups).toEqual([
      {
        type: 'explore',
        items: [completedTool, justCompletedTool],
        isLast: true,
      },
    ]);
  });
});
