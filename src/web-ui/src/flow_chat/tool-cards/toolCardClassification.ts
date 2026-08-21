import type { FlowItem, FlowToolItem } from '../types/flow-chat';

/**
 * The tools that were the original collapsible allowlist. Kept as the named
 * set of everyday work; collapsibility itself is now decided by
 * `CRITICAL_TOOL_NAMES` below, so a tool does not have to be listed here to
 * fold away.
 */
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

/**
 * Tools whose finished card is the answer, or is something the reader has to
 * act on. These always stay open; everything else is routine work that folds
 * into the activity summary once it has finished successfully.
 *
 * The rule used to be the other way round — only the twelve names above were
 * ever folded — so every skill call, MCP tool, media result, diff and unknown
 * tool printed a full card forever, and a long turn read as a wall of finished
 * machinery instead of an answer.
 */
export const CRITICAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Needs an answer or a decision from the reader.
  'AskUserQuestion',
  'CreatePlan',
  // Standing state the reader keeps checking back on.
  'TodoWrite',
  'Task',
  // The card is the deliverable.
  'submit_code_review',
  'ReviewSessionSummary',
  'GetFileDiff',
  'GenerativeUI',
  'GenerateImage',
  'GenerateVideo',
  'GenerateSpeech',
  'UploadMediaImage',
  'TranscribeAudio',
  'GetMediaTaskStatus',
  'ViewImage',
  'InitMiniApp',
  'Skill',
  // Session-level events worth keeping visible in the flow.
  'ContextCompression',
  'SessionMessage',
]);

export function isCollapsibleTool(toolName: string): boolean {
  if (!toolName) return false;
  return !CRITICAL_TOOL_NAMES.has(toolName);
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
