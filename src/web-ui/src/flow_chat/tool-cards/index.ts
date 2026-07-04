/**
 * Tool card registry.
 * Maps tool configs to components.
 */

import { createLogger } from '@/shared/utils/logger';
import { isMcpToolName } from '@/infrastructure/mcp/toolName';

const log = createLogger('ToolCardRegistry');
// Tool display components
import { ReadFileDisplay } from './ReadFileDisplay';
import { GrepSearchDisplay } from './GrepSearchDisplay';
import { GlobSearchDisplay } from './GlobSearchDisplay';
import { LSDisplay } from './LSDisplay';
import { TodoWriteDisplay } from './TodoWriteDisplay';
import { TaskToolDisplay } from './TaskToolDisplay';
import { CodeReviewToolCard } from './CodeReviewToolCard';
import { FileOperationToolCard } from './FileOperationToolCard';
import { DefaultToolCard } from './DefaultToolCard';
import { WebSearchCard } from './WebSearchCard'; // Temporary until WebSearchDisplay exists.
import { ContextCompressionDisplay } from './ContextCompressionDisplay';
import { MCPToolDisplay } from './MCPToolDisplay';
import { SkillDisplay } from './SkillDisplay';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { GitToolDisplay } from './GitToolDisplay';
import { GetFileDiffDisplay } from './GetFileDiffDisplay';
import { CreatePlanDisplay } from './CreatePlanDisplay';
import { TerminalToolCard } from './TerminalToolCard';
import { TerminalControlDisplay } from './TerminalControlDisplay';
import { InitMiniAppDisplay } from './MiniAppToolDisplay';
import { GenerativeWidgetToolCard } from './GenerativeWidgetToolCard';
import { ReviewSessionSummaryCard } from './ReviewSessionSummaryCard';
import { SessionControlToolCard } from './SessionControlToolCard';
import { SessionMessageToolCard } from './SessionMessageToolCard';
import { MediaGenerationToolCard } from './MediaGenerationToolCard';

export {
  TOOL_CARD_CONFIGS,
  getAllToolNames,
  getToolCardConfig,
  requiresConfirmation,
} from './toolCardMetadata';

// Tool card component map - uses backend tool names
export const TOOL_CARD_COMPONENTS = {
  // File tools
  'Read': ReadFileDisplay, // Read does not need snapshot support.
  'Write': FileOperationToolCard,
  'Edit': FileOperationToolCard,
  'Delete': FileOperationToolCard,
  
  // Search tools
  'Grep': GrepSearchDisplay,
  'Glob': GlobSearchDisplay,
  'LS': LSDisplay,
  
  // Web tools
  'WebSearch': WebSearchCard,
  
  // Advanced tools
  'Task': TaskToolDisplay,
  'TodoWrite': TodoWriteDisplay,
  
  'submit_code_review': CodeReviewToolCard,
  
  // Context compression
  'ContextCompression': ContextCompressionDisplay,

  // Skill tool
  'Skill': SkillDisplay,

  // AskUserQuestion tool
  'AskUserQuestion': AskUserQuestionCard,

  'ReviewSessionSummary': ReviewSessionSummaryCard,

  // Git version control
  'Git': GitToolDisplay,

  // GetFileDiff tool
  'GetFileDiff': GetFileDiffDisplay,

  // CreatePlan tool
  'CreatePlan': CreatePlanDisplay,

  // TerminalControl tool
  'TerminalControl': TerminalControlDisplay,

  // Session tools
  'SessionControl': SessionControlToolCard,
  'SessionMessage': SessionMessageToolCard,

  // Bash tool
  'Bash': TerminalToolCard,

  // MiniApp tool
  'InitMiniApp': InitMiniAppDisplay,

  // Generative widget tool
  'GenerativeUI': GenerativeWidgetToolCard,

  // Media tools
  'GenerateImage': MediaGenerationToolCard,
  'GenerateVideo': MediaGenerationToolCard,
  'UploadMediaImage': MediaGenerationToolCard,
  'GenerateSpeech': MediaGenerationToolCard,
  'TranscribeAudio': MediaGenerationToolCard,
  'GetMediaTaskStatus': MediaGenerationToolCard,
};

/**
 * Get tool card component.
 */
export function getToolCardComponent(toolName: string) {
  // Check MCP tools (prefix: mcp__).
  if (isMcpToolName(toolName)) {
    return MCPToolDisplay;
  }
  
  const component = TOOL_CARD_COMPONENTS[toolName as keyof typeof TOOL_CARD_COMPONENTS];
  
  // Debug log (only when a component is missing).
  if (!component) {
    log.warn('Tool card component not found, using default', { toolName });
  }
  
  return component || DefaultToolCard;
}

// Export components
export {
  BaseToolCard,
  ToolCardHeader,
} from './BaseToolCard';
export {
  ToolCardHeaderLayoutContext,
  useToolCardHeaderLayout,
} from './ToolCardHeaderLayoutContext';
export type {
  BaseToolCardProps,
  ToolCardHeaderProps,
} from './BaseToolCard';
export type {
  ToolCardHeaderLayoutContextValue,
  ToolCardHeaderAffordanceKind,
} from './ToolCardHeaderLayoutContext';
export { ToolCardIconSlot } from './ToolCardIconSlot';
export type { ToolCardIconSlotProps } from './ToolCardIconSlot';
export { ToolCardStatusIcon } from './ToolCardStatusIcon';
export type { ToolCardStatusIconProps } from './ToolCardStatusIcon';
export { PlanDisplay } from './CreatePlanDisplay';
export type { PlanDisplayProps } from './CreatePlanDisplay';

// ==================== Collapsible explorer tools ====================

import type { FlowItem, FlowToolItem } from '../types/flow-chat';

/**
 * Collapsible explorer tools.
 * They are auto-collapsed during streaming to reduce visual noise.
 */
export const COLLAPSIBLE_TOOL_NAMES = new Set([
  'Read', 'LS', 'Grep', 'Glob', 'WebSearch', 'Bash', 'Git',
]);

/** Read tools (counted in readCount). */
export const READ_TOOL_NAMES = new Set(['Read', 'LS']);

/** Search tools (counted in searchCount). */
export const SEARCH_TOOL_NAMES = new Set(['Grep', 'Glob', 'WebSearch']);

/** Command tools (counted in commandCount). */
export const COMMAND_TOOL_NAMES = new Set(['Bash', 'Git']);

/** Check whether a tool is collapsible. */
export function isCollapsibleTool(toolName: string): boolean {
  return COLLAPSIBLE_TOOL_NAMES.has(toolName);
}

/**
 * Check whether a FlowItem is collapsible (no context).
 * - Text needs context (use isCollapsibleItemWithContext).
 * - Thinking can be collapsed with explorer tools.
 * - Only explorer tools are collapsible.
 */
export function isCollapsibleItem(item: FlowItem): boolean {
  // Text: default not collapsed (needs isCollapsibleItemWithContext).
  if (item.type === 'text') return false;
  
  // Thinking can be collapsed with explorer tools.
  if (item.type === 'thinking') return true;
  
  // Tools: only explorer tools are collapsible.
  if (item.type === 'tool') {
    return isCollapsibleTool((item as FlowToolItem).toolName);
  }
  
  return false;
}

/**
 * Check whether a FlowItem is collapsible with context.
 * @param item Current item
 * @param nextItem Next item (optional)
 * @param isLast Whether this is the last item
 */
export function isCollapsibleItemWithContext(
  item: FlowItem, 
  nextItem: FlowItem | undefined, 
  isLast: boolean
): boolean {
  // Text and thinking depend on what follows.
  if (item.type === 'text' || item.type === 'thinking') {
    // Last item should stay visible.
    if (isLast || !nextItem) return false;
    
    // If followed by an explorer tool, collapse together.
    if (nextItem.type === 'tool') {
      return isCollapsibleTool((nextItem as FlowToolItem).toolName);
    }
    
    // If followed by text or thinking, treat as collapsible for grouping.
    if (nextItem.type === 'text' || nextItem.type === 'thinking') {
      return true;
    }
    
    // Otherwise do not collapse.
    return false;
  }
  
  // Tools: only explorer tools are collapsible.
  if (item.type === 'tool') {
    return isCollapsibleTool((item as FlowToolItem).toolName);
  }
  
  return false;
}
