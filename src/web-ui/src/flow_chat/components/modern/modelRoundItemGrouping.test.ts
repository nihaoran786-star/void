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

  it('leaves a lone routine tool as its own visible step', () => {
    const textItem = makeTextItem('text-1');
    const toolItem = makeReadTool('tool-1');

    const groups = buildModelRoundItemGroups({
      items: [textItem, toolItem],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read',
    });

    // One call is one line either way; folding it would hide a step of the turn.
    expect(groups).toEqual([
      { type: 'critical', item: textItem },
      { type: 'critical', item: toolItem },
    ]);
  });

  it('keeps reasoning at the top level between tool calls', () => {
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

    // think -> call -> think -> call, one flat sequence.
    expect(groups).toEqual([
      { type: 'critical', item: firstThinking },
      { type: 'critical', item: routineTool },
      { type: 'critical', item: secondThinking },
      { type: 'critical', item: criticalTool },
    ]);
  });

  it('never folds completed thinking away', () => {
    const thinking = makeThinkingItem('thinking-before-task');
    const criticalTool = { ...makeReadTool('task-1'), toolName: 'Task' };

    const groups = buildModelRoundItemGroups({
      items: [thinking, criticalTool],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: () => false,
    });

    expect(groups).toEqual([
      { type: 'critical', item: thinking },
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
      { type: 'critical', item: completedTool },
      { type: 'critical', item: runningTool },
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
      { type: 'critical', item: completedTool },
      { type: 'critical', item: justCompletedTool },
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

  it('folds tool calls that reasoning interleaved into one summary, reasoning above it', () => {
    const firstTool = makeReadTool('tool-1');
    const thinking = makeThinkingItem('thinking-1');
    const secondTool = makeReadTool('tool-2');
    const thirdTool = makeReadTool('tool-3');

    const groups = buildModelRoundItemGroups({
      items: [firstTool, thinking, secondTool, thirdTool],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read' && item.status === 'completed',
      nowMs: 10_200,
    });

    // Without the buffering, `thinking` cut the run into two runs of one and
    // neither folded, so the reader got four rows of chrome instead of two.
    expect(groups).toEqual([
      { type: 'critical', item: thinking },
      { type: 'explore', items: [firstTool, secondTool, thirdTool], isLast: true },
    ]);
  });

  it('lets prose cut a tool run exactly where it appeared', () => {
    const firstTool = makeReadTool('tool-1');
    const secondTool = makeReadTool('tool-2');
    const text = makeTextItem('text-1');
    const thirdTool = makeReadTool('tool-3');
    const fourthTool = makeReadTool('tool-4');

    const groups = buildModelRoundItemGroups({
      items: [firstTool, secondTool, text, thirdTool, fourthTool],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read' && item.status === 'completed',
      nowMs: 10_200,
    });

    expect(groups).toEqual([
      { type: 'explore', items: [firstTool, secondTool], isLast: false },
      { type: 'critical', item: text },
      { type: 'explore', items: [thirdTool, fourthTool], isLast: true },
    ]);
  });

  it('keeps trailing reasoning visible when no tool run is open', () => {
    const text = makeTextItem('text-1');
    const thinking = makeThinkingItem('thinking-1');

    const groups = buildModelRoundItemGroups({
      items: [text, thinking],
      isStreaming: false,
      disableExploreGrouping: false,
      isCollapsibleToolItem: item => item.toolName === 'Read' && item.status === 'completed',
      nowMs: 10_200,
    });

    expect(groups).toEqual([
      { type: 'critical', item: text },
      { type: 'critical', item: thinking },
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
