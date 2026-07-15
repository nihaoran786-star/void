/* eslint-disable react-refresh/only-export-components -- This module is the stable lazy component registry. */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isMcpToolName } from '@/infrastructure/mcp/toolName';
import { createLogger } from '@/shared/utils/logger';
import type { ToolCardProps } from '../types/flow-chat';

export type ToolCardComponent = ComponentType<ToolCardProps>;
export type LazyToolCardComponent = LazyExoticComponent<ToolCardComponent>;

const log = createLogger('ToolCardRegistry');
const missingToolNames = new Set<string>();

function lazyCard(
  load: () => Promise<{ default: ToolCardComponent }>,
): LazyToolCardComponent {
  return lazy(load);
}

const ReadFileCard = lazyCard(() => import('./ReadFileDisplay').then(({ ReadFileDisplay }) => ({ default: ReadFileDisplay })));
const FileOperationCard = lazyCard(() => import('./FileOperationToolCard').then(({ FileOperationToolCard }) => ({ default: FileOperationToolCard })));
const GrepSearchCard = lazyCard(() => import('./GrepSearchDisplay').then(({ GrepSearchDisplay }) => ({ default: GrepSearchDisplay })));
const GlobSearchCard = lazyCard(() => import('./GlobSearchDisplay').then(({ GlobSearchDisplay }) => ({ default: GlobSearchDisplay })));
const ListDirectoryCard = lazyCard(() => import('./LSDisplay').then(({ LSDisplay }) => ({ default: LSDisplay })));
const WebSearchToolCard = lazyCard(() => import('./WebSearchCard').then(({ WebSearchCard }) => ({ default: WebSearchCard })));
const TaskCard = lazyCard(() => import('./TaskToolDisplay').then(({ TaskToolDisplay }) => ({ default: TaskToolDisplay })));
const TodoWriteCard = lazyCard(() => import('./TodoWriteDisplay').then(({ TodoWriteDisplay }) => ({ default: TodoWriteDisplay })));
const CodeReviewCard = lazyCard(() => import('./CodeReviewToolCard').then(({ CodeReviewToolCard }) => ({ default: CodeReviewToolCard })));
const ContextCompressionCard = lazyCard(() => import('./ContextCompressionDisplay').then(({ ContextCompressionDisplay }) => ({
  default: ({ toolItem }: ToolCardProps) => <ContextCompressionDisplay toolItem={toolItem} />,
})));
const SkillCard = lazyCard(() => import('./SkillDisplay').then(({ SkillDisplay }) => ({ default: SkillDisplay })));
const AskUserCard = lazyCard(() => import('./AskUserQuestionCard').then(({ AskUserQuestionCard }) => ({ default: AskUserQuestionCard })));
const ReviewSummaryCard = lazyCard(() => import('./ReviewSessionSummaryCard').then(({ ReviewSessionSummaryCard }) => ({ default: ReviewSessionSummaryCard })));
const GitCard = lazyCard(() => import('./GitToolDisplay').then(({ GitToolDisplay }) => ({ default: GitToolDisplay })));
const FileDiffCard = lazyCard(() => import('./GetFileDiffDisplay').then(({ GetFileDiffDisplay }) => ({ default: GetFileDiffDisplay })));
const CreatePlanCard = lazyCard(() => import('./CreatePlanDisplay').then(({ CreatePlanDisplay }) => ({ default: CreatePlanDisplay })));
const TerminalControlCard = lazyCard(() => import('./TerminalControlDisplay').then(({ TerminalControlDisplay }) => ({ default: TerminalControlDisplay })));
const SessionControlCard = lazyCard(() => import('./SessionControlToolCard').then(({ SessionControlToolCard }) => ({ default: SessionControlToolCard })));
const SessionMessageCard = lazyCard(() => import('./SessionMessageToolCard').then(({ SessionMessageToolCard }) => ({ default: SessionMessageToolCard })));
const TerminalCard = lazyCard(() => import('./TerminalToolCard').then(({ TerminalToolCard }) => ({ default: TerminalToolCard })));
const MiniAppCard = lazyCard(() => import('./MiniAppToolDisplay').then(({ InitMiniAppDisplay }) => ({ default: InitMiniAppDisplay })));
const GenerativeWidgetCard = lazyCard(() => import('./GenerativeWidgetToolCard').then(({ GenerativeWidgetToolCard }) => ({ default: GenerativeWidgetToolCard })));
const MediaGenerationCard = lazyCard(() => import('./MediaGenerationToolCard').then(({ MediaGenerationToolCard }) => ({ default: MediaGenerationToolCard })));
const McpCard = lazyCard(() => import('./MCPToolDisplay').then(({ MCPToolDisplay }) => ({ default: MCPToolDisplay })));
const DefaultCard = lazyCard(() => import('./DefaultToolCard').then(({ DefaultToolCard }) => ({ default: DefaultToolCard })));

export const TOOL_CARD_COMPONENTS: Readonly<Record<string, LazyToolCardComponent>> = Object.freeze({
  Read: ReadFileCard,
  Write: FileOperationCard,
  Edit: FileOperationCard,
  Delete: FileOperationCard,
  Grep: GrepSearchCard,
  Glob: GlobSearchCard,
  LS: ListDirectoryCard,
  WebSearch: WebSearchToolCard,
  Task: TaskCard,
  TodoWrite: TodoWriteCard,
  submit_code_review: CodeReviewCard,
  ContextCompression: ContextCompressionCard,
  Skill: SkillCard,
  AskUserQuestion: AskUserCard,
  ReviewSessionSummary: ReviewSummaryCard,
  Git: GitCard,
  GetFileDiff: FileDiffCard,
  CreatePlan: CreatePlanCard,
  TerminalControl: TerminalControlCard,
  SessionControl: SessionControlCard,
  SessionMessage: SessionMessageCard,
  Bash: TerminalCard,
  InitMiniApp: MiniAppCard,
  GenerativeUI: GenerativeWidgetCard,
  GenerateImage: MediaGenerationCard,
  GenerateVideo: MediaGenerationCard,
  UploadMediaImage: MediaGenerationCard,
  GenerateSpeech: MediaGenerationCard,
  TranscribeAudio: MediaGenerationCard,
  GetMediaTaskStatus: MediaGenerationCard,
});

export function getToolCardComponent(toolName: string): LazyToolCardComponent {
  if (isMcpToolName(toolName)) {
    return McpCard;
  }

  const component = TOOL_CARD_COMPONENTS[toolName];
  if (component) {
    return component;
  }

  if (!missingToolNames.has(toolName)) {
    missingToolNames.add(toolName);
    log.warn('Tool card component not found, using default', { toolName });
  }
  return DefaultCard;
}
