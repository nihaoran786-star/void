/**
 * Tool event handling module
 * Handles various tool lifecycle events
 */

import { FlowChatStore } from '../../store/FlowChatStore';
import { parsePartialJson } from '../../../shared/utils/partialJsonParser';
import { createLogger } from '@/shared/utils/logger';
import { dispatchWorkspaceMediaRefresh } from '@/shared/services/workspace-media/WorkspaceMediaEvents';
import type { FlowChatContext, FlowToolItem, ToolEventOptions, DialogTurn } from './types';
import { immediateSaveDialogTurn } from './PersistenceModule';
import { applyPendingAcpPermissionForTool } from './AcpPermissionToolCardModule';
import { normalizeParamsPartialFragment } from '../EventBatcher';
import type { FlowItem, ViewImagePreviewAttachment } from '../../types/flow-chat';
import type {
  CancelledToolEvent,
  CompletedToolEvent,
  ConfirmationNeededToolEvent,
  EarlyDetectedToolEvent,
  FailedToolEvent,
  FlowToolEvent,
  ParamsPartialToolEvent,
  ProgressToolEvent,
  StartedToolEvent,
} from '../EventBatcher';

const VIEW_IMAGE_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
] as const);
const VIEW_IMAGE_MAX_BASE64_CHARS = 6_990_508;

type ViewImageMimeType = ViewImagePreviewAttachment['mimeType'];

export function normalizeViewImagePreviewAttachments(
  attachments: CompletedToolEvent['image_attachments'],
): FlowToolItem['previewImageAttachments'] {
  for (const attachment of attachments ?? []) {
    if (typeof attachment.mime_type !== 'string' || typeof attachment.data_base64 !== 'string') {
      continue;
    }
    const mimeType = attachment.mime_type.trim().toLowerCase();
    const dataBase64 = attachment.data_base64.trim();
    if (
      VIEW_IMAGE_ALLOWED_MIME_TYPES.has(mimeType as ViewImageMimeType)
      && dataBase64.length > 0
      && dataBase64.length <= VIEW_IMAGE_MAX_BASE64_CHARS
      && dataBase64.length % 4 === 0
      && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)
    ) {
      return [{
        mimeType: mimeType as ViewImageMimeType,
        dataBase64,
      }];
    }
  }

  return undefined;
}

const log = createLogger('ToolEventModule');
const pendingTerminalSessionIds = new Map<string, string>();
const WORKSPACE_MEDIA_REFRESH_TOOL_NAMES = new Set([
  'GenerateImage',
  'GenerateVideo',
]);

interface ToolTerminalReadyEvent {
  tool_use_id: string;
  terminal_session_id: string;
}

/**
 * Unified tool event handler
 * Supports both main session and subagent scenarios
 */
export function processToolEvent(
  context: FlowChatContext,
  sessionId: string,
  turnId: string,
  roundId: string,
  toolEvent: FlowToolEvent,
  options?: ToolEventOptions,
  onTodoWriteResult?: (sessionId: string, turnId: string, result: any) => void
): void {
  const store = FlowChatStore.getInstance();
  const state = store.getState();
  const session = state.sessions.get(sessionId);
  
  if (!session) {
    log.debug('Session not found (processToolEvent)', { sessionId });
    return;
  }

  const dialogTurn = session.dialogTurns.find((turn: DialogTurn) => turn.id === turnId);
  if (!dialogTurn) {
    log.debug('Dialog turn not found (processToolEvent)', { turnId });
    return;
  }

  switch (toolEvent.event_type) {
    case 'EarlyDetected': {
      handleEarlyDetected(context, store, sessionId, turnId, roundId, dialogTurn, toolEvent, options);
      break;
    }
    
    case 'ParamsPartial': {
      handleParamsPartial(store, sessionId, turnId, toolEvent);
      break;
    }
    
    case 'Started': {
      flushPendingBatchedEvents(context);
      handleStarted(context, store, sessionId, turnId, roundId, dialogTurn, toolEvent, options);
      break;
    }
    
    case 'Completed': {
      flushPendingBatchedEvents(context);
      handleCompleted(context, store, sessionId, turnId, toolEvent, options, onTodoWriteResult);
      break;
    }
    
    case 'Failed': {
      flushPendingBatchedEvents(context);
      handleFailed(context, store, sessionId, turnId, toolEvent);
      break;
    }
    
    case 'Cancelled': {
      flushPendingBatchedEvents(context);
      handleCancelled(context, store, sessionId, turnId, toolEvent);
      break;
    }
    
    case 'ConfirmationNeeded': {
      flushPendingBatchedEvents(context);
      handleConfirmationNeeded(store, sessionId, turnId, toolEvent);
      break;
    }
    
    case 'Progress': {
      handleProgress(store, sessionId, turnId, toolEvent);
      break;
    }
    
    default:
      break;
  }
}

function flushPendingBatchedEvents(context: FlowChatContext): void {
  if (context.eventBatcher.getBufferSize() > 0) {
    context.eventBatcher.flushNow();
  }
}

function updateToolItem(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolId: string,
  updates: Record<string, any>,
  silent = false
): void {
  if (silent) {
    store.updateModelRoundItemSilent(sessionId, turnId, toolId, updates as any);
    return;
  }

  store.updateModelRoundItem(sessionId, turnId, toolId, updates as any);
}

function applyPendingTerminalSessionId(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolId: string,
  silent = false
): void {
  const terminalSessionId = pendingTerminalSessionIds.get(toolId);
  if (!terminalSessionId) {
    return;
  }

  updateToolItem(store, sessionId, turnId, toolId, {
    terminalSessionId,
  }, silent);
  pendingTerminalSessionIds.delete(toolId);
}

function isTodoWriteSuccessResult(result: unknown): result is Record<string, unknown> {
  return typeof result === 'object' && result !== null && (result as { success?: unknown }).success === true;
}

function isWriteLikeToolName(toolName: string): boolean {
  return ['write', 'write_notebook', 'file_write', 'Write'].includes(toolName);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function stringFromRecord(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberFromRecord(record: Record<string, unknown> | null, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function normalizeAspectRatioText(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  const colon = trimmed.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (colon) {
    return `${colon[1]}:${colon[2]}`;
  }
  const dimensions = trimmed.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (dimensions) {
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    if (width > 0 && height > 0) {
      const divisor = gcd(width, height);
      return `${width / divisor}:${height / divisor}`;
    }
  }
  return fallback;
}

function placeholderAspectRatio(requestedAspectRatio: string): string {
  const parts = requestedAspectRatio.split(':');
  return parts.length === 2 ? `${parts[0]} / ${parts[1]}` : requestedAspectRatio;
}

function workspacePathForToolEvent(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string
): string | undefined {
  const sessionWorkspacePath = store.getState().sessions.get(sessionId)?.workspacePath;
  return sessionWorkspacePath?.trim() || context.currentWorkspacePath?.trim() || undefined;
}

function mediaKindForToolName(toolName: string): 'image' | 'video' {
  return toolName === 'GenerateVideo' ? 'video' : 'image';
}

function mediaDefaultAspectRatio(toolName: string): string {
  return toolName === 'GenerateVideo' ? '16:9' : '1:1';
}

function shortDramaMetadataFromRecord(record: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  const value = record?.shortDrama ?? record?.short_drama;
  return asRecord(value) ?? undefined;
}

function shortDramaWorkspaceRefreshFields(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return {};
  }
  return {
    targetStage: stringFromRecord(metadata, 'stage') ?? stringFromRecord(metadata, 'targetStage'),
    episodeId: stringFromRecord(metadata, 'episodeId') ?? stringFromRecord(metadata, 'activeEpisodeId'),
    artifactId: stringFromRecord(metadata, 'artifactId') ?? stringFromRecord(metadata, 'activeArtifactId'),
    artifactHandle: stringFromRecord(metadata, 'artifactHandle') ?? stringFromRecord(metadata, 'activeArtifactHandle'),
    mediaItemId: stringFromRecord(metadata, 'outputMediaItemId') ?? stringFromRecord(metadata, 'mediaItemId'),
  };
}

function dispatchWorkspaceMediaRefreshForStartedTool(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  toolEvent: StartedToolEvent
): void {
  if (!WORKSPACE_MEDIA_REFRESH_TOOL_NAMES.has(toolEvent.tool_name)) {
    return;
  }

  const params = asRecord(toolEvent.params);
  const shortDrama = shortDramaMetadataFromRecord(params);
  const kind = mediaKindForToolName(toolEvent.tool_name);
  const requestedAspectRatio = normalizeAspectRatioText(
    stringFromRecord(params, 'aspect_ratio') || stringFromRecord(params, 'size'),
    mediaDefaultAspectRatio(toolEvent.tool_name)
  );

  dispatchWorkspaceMediaRefresh({
    reason: 'media-tool-event',
    lifecycleStatus: 'started',
    workspacePath: workspacePathForToolEvent(context, store, sessionId),
    toolId: toolEvent.tool_id,
    toolName: toolEvent.tool_name,
    kind,
    prompt: stringFromRecord(params, 'prompt'),
    model: stringFromRecord(params, 'model'),
    requestedCount: numberFromRecord(params, 'n'),
    requestedAspectRatio,
    placeholderAspectRatio: placeholderAspectRatio(requestedAspectRatio),
    ...shortDramaWorkspaceRefreshFields(shortDrama),
  });
}

function dispatchWorkspaceMediaRefreshForCompletedTool(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  toolEvent: CompletedToolEvent
): void {
  if (!WORKSPACE_MEDIA_REFRESH_TOOL_NAMES.has(toolEvent.tool_name)) {
    return;
  }

  const result = asRecord(toolEvent.result);
  const batch = asRecord(result?.batch);
  const shortDrama = shortDramaMetadataFromRecord(result);
  const status = typeof batch?.status === 'string'
    ? batch.status
    : typeof result?.status === 'string'
      ? result.status
      : undefined;
  const batchId = typeof batch?.batch_id === 'string'
    ? batch.batch_id
    : typeof result?.batch_id === 'string'
      ? result.batch_id
      : undefined;

  dispatchWorkspaceMediaRefresh({
    reason: 'media-tool-event',
    workspacePath: workspacePathForToolEvent(context, store, sessionId),
    toolId: toolEvent.tool_id,
    toolName: toolEvent.tool_name,
    kind: mediaKindForToolName(toolEvent.tool_name),
    status,
    batchId,
    ...shortDramaWorkspaceRefreshFields(shortDrama),
  });
}

function dispatchWorkspaceMediaRefreshForFailedTool(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  toolEvent: FailedToolEvent | CancelledToolEvent
): void {
  if (!WORKSPACE_MEDIA_REFRESH_TOOL_NAMES.has(toolEvent.tool_name)) {
    return;
  }

  dispatchWorkspaceMediaRefresh({
    reason: 'media-tool-event',
    lifecycleStatus: 'failed',
    workspacePath: workspacePathForToolEvent(context, store, sessionId),
    toolId: toolEvent.tool_id,
    toolName: toolEvent.tool_name,
    kind: mediaKindForToolName(toolEvent.tool_name),
    error: 'error' in toolEvent ? toolEvent.error : toolEvent.reason,
  });
}

function shouldIgnoreParamsPartial(status: FlowToolItem['status'], toolName: string): boolean {
  if (isWriteLikeToolName(toolName)) {
    return ['completed', 'error', 'cancelled', 'pending_confirmation', 'confirmed'].includes(status);
  }

  return ['running', 'completed', 'error', 'cancelled', 'pending_confirmation', 'confirmed'].includes(status);
}

function applyParamsPartial(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: ParamsPartialToolEvent,
  silent = false
): void {
  const existingItem = store.findToolItem(sessionId, turnId, toolEvent.tool_id);
  
  if (existingItem && existingItem.type === 'tool') {
    const existingToolItem = existingItem as FlowToolItem;
    const prevBuffer = existingToolItem._paramsBuffer || '';
    const isWriteTool = isWriteLikeToolName(toolEvent.tool_name);
    if (shouldIgnoreParamsPartial(existingToolItem.status, toolEvent.tool_name)) {
      return;
    }

    const incomingParams = normalizeParamsPartialFragment(toolEvent.params);
    if (!incomingParams) {
      return;
    }
    const isWriteFullParamsSnapshot = isWriteTool && incomingParams.trimStart().startsWith('{');
    const newBuffer = isWriteFullParamsSnapshot ? incomingParams : prevBuffer + incomingParams;
    
    let parsedParams: Record<string, any> = {};
    try {
      parsedParams = parsePartialJson(newBuffer);
    } catch {
    }
    
    const isEditTool = ['edit', 'search_replace', 'Edit'].includes(toolEvent.tool_name);
    const hasContentField = parsedParams && ('content' in parsedParams || 'contents' in parsedParams);
    const hasNewString = parsedParams && 'new_string' in parsedParams;
    
    let status: 'streaming' | 'receiving' = 'streaming';
    if ((isWriteTool && hasContentField) || (isEditTool && hasNewString)) {
      status = 'receiving';
    }
    
    updateToolItem(store, sessionId, turnId, toolEvent.tool_id, {
      toolCall: {
        input: parsedParams,
        id: toolEvent.tool_id
      },
      partialParams: parsedParams,
      _paramsBuffer: newBuffer,
      status,
      isParamsStreaming: true,
      _contentSize: isWriteTool && hasContentField ? ((parsedParams.content || parsedParams.contents || '').length) : undefined
    }, silent);
    applyPendingTerminalSessionId(store, sessionId, turnId, toolEvent.tool_id, silent);
    applyPendingAcpPermissionForTool(store, toolEvent.tool_id);
  }
}

function applyProgress(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: ProgressToolEvent,
  silent = false
): void {
  const existingItem = store.findToolItem(sessionId, turnId, toolEvent.tool_id);
  
  if (existingItem) {
    updateToolItem(store, sessionId, turnId, toolEvent.tool_id, {
      _progressMessage: toolEvent.message,
      _progressPercentage: toolEvent.percentage
    }, silent);
  }
}

export function processToolParamsPartialInternal(
  sessionId: string,
  turnId: string,
  toolEvent: ParamsPartialToolEvent
): void {
  applyParamsPartial(FlowChatStore.getInstance(), sessionId, turnId, toolEvent, false);
}

export function processToolProgressInternal(
  sessionId: string,
  turnId: string,
  toolEvent: ProgressToolEvent
): void {
  applyProgress(FlowChatStore.getInstance(), sessionId, turnId, toolEvent, true);
}

/**
 * Handle tool early detection event
 */
function handleEarlyDetected(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  roundId: string,
  dialogTurn: DialogTurn,
  toolEvent: EarlyDetectedToolEvent,
  options?: ToolEventOptions
): void {
  flushPendingBatchedEvents(context);

  // AskUserQuestion cards are rendered by the streaming engine before tool
  // arguments are parsed and validated. When a stream retry regenerates the
  // question after that specific failure class, remove the stale failed card
  // while preserving real user-cancelled or otherwise failed questions.
  if (toolEvent.tool_name === 'AskUserQuestion') {
    store.updateDialogTurn(sessionId, turnId, (turn) => ({
      ...turn,
      modelRounds: turn.modelRounds.map((round) => ({
        ...round,
        items: round.items.filter(
          (item: FlowItem) =>
            !isStaleAskUserQuestionRetryCard(item),
        ),
      })),
    }));
  }
  
  const preparingToolItem: FlowToolItem = {
    id: toolEvent.tool_id,
    type: 'tool',
    toolName: toolEvent.tool_name,
    toolCall: {
      input: {},
      id: toolEvent.tool_id
    },
    timestamp: options?.parentTimestamp ? options.parentTimestamp + 2 : Date.now(),
    status: 'preparing',
    requiresConfirmation: false,
    isParamsStreaming: true,
    startTime: options?.parentTimestamp ? options.parentTimestamp + 2 : Date.now(),
  };

  const targetRound = dialogTurn.modelRounds.find(round => round.id === roundId);
  if (!targetRound) {
    log.error('Tool EarlyDetected event references missing round (backend bug)', {
      sessionId,
      turnId,
      roundId,
      toolId: toolEvent.tool_id,
      toolName: toolEvent.tool_name,
    });
    return;
  }

  store.addModelRoundItem(sessionId, turnId, preparingToolItem, roundId);
  applyPendingAcpPermissionForTool(store, toolEvent.tool_id);
}

function isStaleAskUserQuestionRetryCard(item: FlowItem): boolean {
  if (item.type !== 'tool') {
    return false;
  }

  const toolItem = item as FlowToolItem;
  if (toolItem.toolName !== 'AskUserQuestion' || toolItem.status !== 'error') {
    return false;
  }

  const error = toolItem.toolResult?.error || '';
  return (
    error.includes('Arguments are invalid JSON') ||
    error.includes('Tool arguments were truncated by the model') ||
    error.includes('Failed to parse input parameters') ||
    /^Question \d+ /.test(error)
  );
}

/**
 * Handle tool params partial update event
 */
function handleParamsPartial(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: ParamsPartialToolEvent
): void {
  applyParamsPartial(store, sessionId, turnId, toolEvent);
}

/**
 * Handle tool started event
 */
function handleStarted(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  roundId: string,
  dialogTurn: DialogTurn,
  toolEvent: StartedToolEvent,
  options?: ToolEventOptions
): void {
  const existingItem = store.findToolItem(sessionId, turnId, toolEvent.tool_id);
  
  const toolCallData = {
    input: toolEvent.params,
    id: toolEvent.tool_id,
    ...(typeof toolEvent.timeout_seconds === 'number' && {
      timeout_seconds: toolEvent.timeout_seconds
    })
  };

  if (existingItem) {
    store.updateModelRoundItem(sessionId, turnId, toolEvent.tool_id, {
      toolCall: toolCallData,
      status: 'running',
      isParamsStreaming: false,
      partialParams: undefined
    } as any);
    applyPendingTerminalSessionId(store, sessionId, turnId, toolEvent.tool_id);
    applyPendingAcpPermissionForTool(store, toolEvent.tool_id);
  } else {
    const toolItem: FlowToolItem = {
      id: toolEvent.tool_id,
      type: 'tool',
      toolName: toolEvent.tool_name,
      terminalSessionId: pendingTerminalSessionIds.get(toolEvent.tool_id),
      toolCall: toolCallData,
      timestamp: options?.parentTimestamp ? options.parentTimestamp + 2 : Date.now(),
      status: 'running',
      requiresConfirmation: false,
      startTime: options?.parentTimestamp ? options.parentTimestamp + 2 : Date.now(),
    };

    const targetRound = dialogTurn.modelRounds.find(round => round.id === roundId);
    if (targetRound) {
      store.addModelRoundItem(sessionId, turnId, toolItem, roundId);
      pendingTerminalSessionIds.delete(toolEvent.tool_id);
      applyPendingAcpPermissionForTool(store, toolEvent.tool_id);
    } else {
      log.error('Tool Started event references missing round (backend bug)', {
        sessionId,
        turnId,
        roundId,
        toolId: toolEvent.tool_id,
        toolName: toolEvent.tool_name
      });
    }
  }

  dispatchWorkspaceMediaRefreshForStartedTool(context, store, sessionId, toolEvent);
}

/**
 * Handle tool execution completed event
 */
function handleCompleted(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: CompletedToolEvent,
  options?: ToolEventOptions,
  onTodoWriteResult?: (sessionId: string, turnId: string, result: any) => void
): void {
  if (!options?.isSubagent && toolEvent.tool_name === 'TodoWrite' && isTodoWriteSuccessResult(toolEvent.result)) {
    onTodoWriteResult?.(sessionId, turnId, toolEvent.result);
  }
  
  const updates = {
    toolResult: {
      result: toolEvent.result,
      success: true,
      resultForAssistant: toolEvent.result_for_assistant,
      duration_ms: toolEvent.duration_ms
    },
    status: 'completed' as const,
    requiresConfirmation: false,
    acpPermission: undefined,
    isParamsStreaming: false,
    endTime: Date.now(),
    durationMs: toolEvent.duration_ms,
    queueWaitMs: toolEvent.queue_wait_ms,
    preflightMs: toolEvent.preflight_ms,
    confirmationWaitMs: toolEvent.confirmation_wait_ms,
    executionMs: toolEvent.execution_ms,
    previewImageAttachments: toolEvent.tool_name === 'ViewImage'
      ? normalizeViewImagePreviewAttachments(toolEvent.image_attachments)
      : undefined
  };

  store.updateModelRoundItem(sessionId, turnId, toolEvent.tool_id, updates as any);
  dispatchWorkspaceMediaRefreshForCompletedTool(context, store, sessionId, toolEvent);

  store.clearSessionNeedsAttention(sessionId);

  immediateSaveDialogTurn(context, sessionId, turnId);
}

/**
 * Handle tool execution failed event
 */
function handleFailed(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: FailedToolEvent
): void {
  store.updateModelRoundItem(sessionId, turnId, toolEvent.tool_id, {
    toolResult: {
      result: null,
      success: false,
      error: toolEvent.error,
      duration_ms: toolEvent.duration_ms
    },
    status: 'error',
    requiresConfirmation: false,
    acpPermission: undefined,
    endTime: Date.now(),
    durationMs: toolEvent.duration_ms,
    queueWaitMs: toolEvent.queue_wait_ms,
    preflightMs: toolEvent.preflight_ms,
    confirmationWaitMs: toolEvent.confirmation_wait_ms,
    executionMs: toolEvent.execution_ms
  } as any);

  dispatchWorkspaceMediaRefreshForFailedTool(context, store, sessionId, toolEvent);

  store.clearSessionNeedsAttention(sessionId);

  immediateSaveDialogTurn(context, sessionId, turnId);
}

/**
 * Handle tool cancelled event
 */
function handleCancelled(
  context: FlowChatContext,
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: CancelledToolEvent
): void {
  const existingToolItem = store.findToolItem(sessionId, turnId, toolEvent.tool_id);
  const currentStatus = existingToolItem?.status;
  const finalStatus = currentStatus === 'confirmed' ? 'confirmed' : 'cancelled';

  store.updateModelRoundItem(sessionId, turnId, toolEvent.tool_id, {
    toolResult: {
      result: null,
      success: false,
      error: toolEvent.reason || 'User cancelled operation',
      duration_ms: toolEvent.duration_ms
    },
    status: finalStatus,
    requiresConfirmation: false,
    acpPermission: undefined,
    endTime: Date.now(),
    durationMs: toolEvent.duration_ms,
    queueWaitMs: toolEvent.queue_wait_ms,
    preflightMs: toolEvent.preflight_ms,
    confirmationWaitMs: toolEvent.confirmation_wait_ms,
    executionMs: toolEvent.execution_ms
  } as any);

  dispatchWorkspaceMediaRefreshForFailedTool(context, store, sessionId, toolEvent);

  store.clearSessionNeedsAttention(sessionId);

  immediateSaveDialogTurn(context, sessionId, turnId);
}

/**
 * Handle tool confirmation needed event
 */
function handleConfirmationNeeded(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: ConfirmationNeededToolEvent
): void {
  store.updateModelRoundItem(sessionId, turnId, toolEvent.tool_id, {
    requiresConfirmation: true,
    status: 'pending_confirmation'
  } as any);

  const state = store.getState();
  const activeSessionId = state.activeSessionId;
  if (sessionId !== activeSessionId) {
    const attentionKind = toolEvent.tool_name === 'AskUserQuestion' ? 'ask_user' : 'tool_confirm';
    store.setSessionNeedsAttention(sessionId, attentionKind);
  }
}

/**
 * Handle tool execution progress event
 */
function handleProgress(
  store: FlowChatStore,
  sessionId: string,
  turnId: string,
  toolEvent: ProgressToolEvent
): void {
  applyProgress(store, sessionId, turnId, toolEvent);
}

/**
 * Handle backend independent tool execution progress event
 */
export function handleToolExecutionProgress(
  event: any
): void {
  const eventData = (event as any).value || event;
  const { tool_use_id, progress_message, percentage } = eventData;

  const store = FlowChatStore.getInstance();
  const state = store.getState();
  
  let found = false;
  
  for (const [sessionId, session] of state.sessions) {
    for (const dialogTurn of session.dialogTurns) {
      const toolItem = store.findToolItem(sessionId, dialogTurn.id, tool_use_id);
      
      if (toolItem) {
        const existingLogs: string[] = Array.isArray((toolItem as any)._progressLogs)
          ? (toolItem as any)._progressLogs
          : [];
        const lastLog = existingLogs.length > 0 ? existingLogs[existingLogs.length - 1] : undefined;
        const shouldAppend =
          typeof progress_message === 'string' &&
          progress_message.trim().length > 0 &&
          progress_message !== lastLog;
        const nextLogs = shouldAppend ? [...existingLogs, progress_message].slice(-200) : existingLogs;

        store.updateModelRoundItem(sessionId, dialogTurn.id, tool_use_id, {
          _progressMessage: progress_message,
          _progressPercentage: percentage,
          _progressLogs: nextLogs
        } as any);
        
        found = true;
        break;
      }
    }
    if (found) break;
  }
  
  if (!found) {
    log.debug('Tool item not found', { tool_use_id });
  }
}

export function handleToolTerminalReady(
  event: ToolTerminalReadyEvent
): void {
  const { tool_use_id, terminal_session_id } = event;
  if (!tool_use_id || !terminal_session_id) {
    return;
  }

  const store = FlowChatStore.getInstance();
  const state = store.getState();

  for (const [sessionId, session] of state.sessions) {
    for (const dialogTurn of session.dialogTurns) {
      const toolItem = store.findToolItem(sessionId, dialogTurn.id, tool_use_id);
      if (!toolItem) {
        continue;
      }

      store.updateModelRoundItem(sessionId, dialogTurn.id, tool_use_id, {
        terminalSessionId: terminal_session_id,
      } as any);
      pendingTerminalSessionIds.delete(tool_use_id);
      return;
    }
  }

  pendingTerminalSessionIds.set(tool_use_id, terminal_session_id);
  log.debug('Cached terminal session for pending tool item', {
    toolUseId: tool_use_id,
    terminalSessionId: terminal_session_id,
  });
}
