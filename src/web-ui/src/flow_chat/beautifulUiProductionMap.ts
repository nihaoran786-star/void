import { isMcpToolName } from '@/infrastructure/mcp/toolName';

export const BEAUTIFUL_UI_PRODUCTION_COMPONENTS = [
  'streaming-text',
  'chat-composer',
  'sidebar-nav',
  'prompt-bar',
  'context-cards',
  'code-block',
  'search',
  'task-rows',
  'selection-actions',
  'recommendation-card',
  'tool-chips',
  'insight-cards',
  'fine-tune-card',
  'approval-card',
  'loading-state',
  'records-table',
  'diff-table',
  'filter-table',
  'thinking-state',
] as const;

export type BeautifulUIProductionComponent = typeof BEAUTIFUL_UI_PRODUCTION_COMPONENTS[number];

const toolComponentMap: Readonly<Record<string, BeautifulUIProductionComponent>> = Object.freeze({
  Read: 'context-cards',
  Write: 'code-block',
  Edit: 'code-block',
  Delete: 'code-block',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  WebSearch: 'recommendation-card',
  Task: 'task-rows',
  TodoWrite: 'selection-actions',
  ContextCompression: 'insight-cards',
  Skill: 'fine-tune-card',
  AskUserQuestion: 'approval-card',
  CreatePlan: 'records-table',
  Git: 'diff-table',
  GetFileDiff: 'diff-table',
  InitMiniApp: 'filter-table',
});

export function getBeautifulUIToolComponent(toolName: string): BeautifulUIProductionComponent {
  if (isMcpToolName(toolName)) return 'tool-chips';
  return toolComponentMap[toolName] ?? 'tool-chips';
}
