import { describe, expect, it } from 'vitest';
import type { FlowItem, FlowToolItem } from '../types/flow-chat';
import {
  COMMAND_TOOL_NAMES,
  isCollapsibleItem,
  isCollapsibleItemWithContext,
  isCollapsibleTool,
  isCollapsibleToolItem,
  READ_TOOL_NAMES,
  SEARCH_TOOL_NAMES,
} from './toolCardClassification';

function tool(toolName: string): FlowToolItem {
  return {
    id: `tool-${toolName}`,
    type: 'tool',
    toolName,
    status: 'completed',
    timestamp: 1,
    toolCall: { id: `call-${toolName}`, input: {} },
  };
}

function narrative(type: 'text' | 'thinking'): FlowItem {
  return {
    id: type,
    type,
    status: 'completed',
    timestamp: 1,
  } as FlowItem;
}

describe('toolCardClassification', () => {
  it('preserves the explorer statistics categories', () => {
    expect([...READ_TOOL_NAMES]).toEqual(['Read', 'LS']);
    expect([...SEARCH_TOOL_NAMES]).toEqual(['Grep', 'Glob', 'WebSearch']);
    expect([...COMMAND_TOOL_NAMES]).toEqual(['Bash', 'Git']);
  });

  it('only classifies explicitly routine tools and thinking as collapsible', () => {
    for (const toolName of ['GetToolSpec', 'CallDeferredTool', 'Read', 'Write', 'Grep', 'Bash']) {
      expect(isCollapsibleTool(toolName)).toBe(true);
    }
    for (const toolName of ['UnknownFutureTool', 'Task', 'GenerateImage', 'mcp__canvas__open_panel']) {
      expect(isCollapsibleTool(toolName)).toBe(false);
    }
    expect(isCollapsibleItem(tool('Git'))).toBe(true);
    expect(isCollapsibleItem(tool('Write'))).toBe(true);
    expect(isCollapsibleItem(narrative('thinking'))).toBe(true);
    expect(isCollapsibleItem(narrative('text'))).toBe(false);
  });

  it('only collapses settled successful tools without pending interaction', () => {
    const failed = {
      ...tool('GetToolSpec'),
      status: 'error' as const,
      toolResult: { result: null, success: false, error: 'failed' },
    };
    const awaitingApproval = {
      ...tool('Bash'),
      status: 'pending_confirmation' as const,
      requiresConfirmation: true,
    };
    const cancelled = {
      ...tool('Read'),
      status: 'cancelled' as const,
    };

    expect(isCollapsibleToolItem(tool('GetToolSpec'))).toBe(true);
    expect(isCollapsibleToolItem(failed)).toBe(false);
    expect(isCollapsibleToolItem(awaitingApproval)).toBe(false);
    expect(isCollapsibleToolItem(cancelled)).toBe(false);
    expect(isCollapsibleToolItem(tool('Task'))).toBe(false);
    expect(isCollapsibleToolItem(tool('GenerateVideo'))).toBe(false);
    expect(isCollapsibleToolItem(tool('mcp__canvas__open_panel'))).toBe(false);
    expect(isCollapsibleToolItem(tool('UnknownFutureTool'))).toBe(false);
  });

  it('keeps narrative visible at the tail and groups it before exploration', () => {
    const text = narrative('text');
    expect(isCollapsibleItemWithContext(text, tool('Grep'), false)).toBe(true);
    expect(isCollapsibleItemWithContext(text, tool('Task'), false)).toBe(false);
    expect(isCollapsibleItemWithContext(text, narrative('thinking'), false)).toBe(true);
    expect(isCollapsibleItemWithContext(text, undefined, true)).toBe(false);
  });
});
