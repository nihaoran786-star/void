import type { FlowItem, FlowToolItem } from '../types/flow-chat';

/** Settled routine tools that may move into progressive disclosure. */
export const ROUTINE_COLLAPSIBLE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'GetToolSpec',
  'CallDeferredTool',
  'Read',
  'LS',
  'Grep',
  'Glob',
  'WebSearch',
  'Bash',
  'Git',
  'Write',
  'Edit',
  'Delete',
]);

export const READ_TOOL_NAMES: ReadonlySet<string> = new Set(['Read', 'LS']);
export const SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set(['Grep', 'Glob', 'WebSearch']);
export const COMMAND_TOOL_NAMES: ReadonlySet<string> = new Set(['Bash', 'Git']);

export function isCollapsibleTool(toolName: string): boolean {
  return ROUTINE_COLLAPSIBLE_TOOL_NAMES.has(toolName);
}

export function isCollapsibleToolItem(item: FlowToolItem): boolean {
  return (
    item.status === 'completed' &&
    item.toolResult?.success !== false &&
    isCollapsibleTool(item.toolName)
  );
}

export function isCollapsibleItem(item: FlowItem): boolean {
  if (item.type === 'text') return false;
  if (item.type === 'thinking') return true;
  if (item.type === 'tool') {
    return isCollapsibleToolItem(item as FlowToolItem);
  }
  return false;
}

export function isCollapsibleItemWithContext(
  item: FlowItem,
  nextItem: FlowItem | undefined,
  isLast: boolean,
): boolean {
  if (item.type === 'text' || item.type === 'thinking') {
    if (isLast || !nextItem) return false;
    if (nextItem.type === 'tool') {
      return isCollapsibleToolItem(nextItem as FlowToolItem);
    }
    return nextItem.type === 'text' || nextItem.type === 'thinking';
  }

  if (item.type === 'tool') {
    return isCollapsibleToolItem(item as FlowToolItem);
  }

  return false;
}
