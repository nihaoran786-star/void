import { describe, expect, it } from 'vitest';
import type { FlowItem, FlowToolItem } from '../types/flow-chat';
import {
  COMMAND_TOOL_NAMES,
  isCollapsibleItem,
  isCollapsibleItemWithContext,
  isCollapsibleTool,
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

  it('only classifies explorer tools and thinking as collapsible', () => {
    expect(isCollapsibleTool('Read')).toBe(true);
    expect(isCollapsibleTool('Task')).toBe(false);
    expect(isCollapsibleItem(tool('Git'))).toBe(true);
    expect(isCollapsibleItem(tool('Write'))).toBe(false);
    expect(isCollapsibleItem(narrative('thinking'))).toBe(true);
    expect(isCollapsibleItem(narrative('text'))).toBe(false);
  });

  it('keeps narrative visible at the tail and groups it before exploration', () => {
    const text = narrative('text');
    expect(isCollapsibleItemWithContext(text, tool('Grep'), false)).toBe(true);
    expect(isCollapsibleItemWithContext(text, tool('Task'), false)).toBe(false);
    expect(isCollapsibleItemWithContext(text, narrative('thinking'), false)).toBe(true);
    expect(isCollapsibleItemWithContext(text, undefined, true)).toBe(false);
  });
});
