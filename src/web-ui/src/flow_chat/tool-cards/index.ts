/** Lightweight public surface for tool-card metadata and shared primitives. */

export {
  TOOL_CARD_CONFIGS,
  getAllToolNames,
  getToolCardConfig,
  requiresConfirmation,
} from './toolCardMetadata';
export {
  TOOL_CARD_COMPONENTS,
  getToolCardComponent,
} from './toolCardRegistry';
export type {
  LazyToolCardComponent,
  ToolCardComponent,
} from './toolCardRegistry';
export {
  COLLAPSIBLE_TOOL_NAMES,
  READ_TOOL_NAMES,
  SEARCH_TOOL_NAMES,
  COMMAND_TOOL_NAMES,
  isCollapsibleTool,
  isCollapsibleItem,
  isCollapsibleItemWithContext,
} from './toolCardClassification';

export { BaseToolCard, ToolCardHeader } from './BaseToolCard';
export type { BaseToolCardProps, ToolCardHeaderProps } from './BaseToolCard';
export {
  ToolCardHeaderLayoutContext,
  useToolCardHeaderLayout,
} from './ToolCardHeaderLayoutContext';
export type {
  ToolCardHeaderLayoutContextValue,
  ToolCardHeaderAffordanceKind,
} from './ToolCardHeaderLayoutContext';
export { ToolCardIconSlot } from './ToolCardIconSlot';
export type { ToolCardIconSlotProps } from './ToolCardIconSlot';
export { ToolCardStatusIcon } from './ToolCardStatusIcon';
export type { ToolCardStatusIconProps } from './ToolCardStatusIcon';
export type { PlanDisplayProps } from './CreatePlanDisplay';
