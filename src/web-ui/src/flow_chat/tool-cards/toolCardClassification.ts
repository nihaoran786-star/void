import type { FlowItem, FlowToolItem } from '../types/flow-chat';

/** Explorer tools that may collapse after their work settles. */
export const COLLAPSIBLE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'Read', 'LS', 'Grep', 'Glob', 'WebSearch', 'Bash', 'Git',
]);

export const READ_TOOL_NAMES: ReadonlySet<string> = new Set(['Read', 'LS']);
export const SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set(['Grep', 'Glob', 'WebSearch']);
export const COMMAND_TOOL_NAMES: ReadonlySet<string> = new Set(['Bash', 'Git']);

export function isCollapsibleTool(toolName: string): boolean {
  return COLLAPSIBLE_TOOL_NAMES.has(toolName);
}

export function isCollapsibleItem(item: FlowItem): boolean {
  if (item.type === 'text') return false;
  if (item.type === 'thinking') return true;
  if (item.type === 'tool') {
    return isCollapsibleTool((item as FlowToolItem).toolName);
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
      return isCollapsibleTool((nextItem as FlowToolItem).toolName);
    }
    return nextItem.type === 'text' || nextItem.type === 'thinking';
  }

  if (item.type === 'tool') {
    return isCollapsibleTool((item as FlowToolItem).toolName);
  }

  return false;
}
