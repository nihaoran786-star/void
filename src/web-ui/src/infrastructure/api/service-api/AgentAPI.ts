 

import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type { DialogTurnData, SessionRelationship } from '@/shared/types/session-history';
import type { ImageContextData as ImageInputContextData } from './ImageContextTypes';
import type { ReviewTeamRunManifest } from '@/shared/services/reviewTeamService';



export interface SessionTitleGeneratedEvent {
  sessionId: string;
  title: string;
  method: 'ai' | 'fallback';
  timestamp: number;
}

export interface SessionModelAutoMigratedEvent {
  sessionId: string;
  previousModelId: string;
  newModelId: string;
  reason: string;
}

 
export interface SessionConfig {
  modelName?: string;
  maxContextTokens?: number;
  autoCompact?: boolean;
  enableTools?: boolean;
  safeMode?: boolean;
  maxTurns?: number;
  enableContextCompression?: boolean;
  compressionThreshold?: number;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

 
export interface CreateSessionRequest {
  sessionId?: string; 
  sessionName: string;
  agentType: string;
  workspacePath: string;
  workspaceId?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
  sessionKind?: 'standard' | 'subagent';
  relationship?: SessionRelationship;
  deepReviewRunManifest?: ReviewTeamRunManifest;
  config?: SessionConfig;
}

 
export interface CreateSessionResponse {
  sessionId: string;
  sessionName: string;
  agentType: string;
}

 
export interface StartDialogTurnRequest {
  sessionId: string;
  userInput: string;
  originalUserInput?: string;
  turnId?: string; 
  agentType: string; 
  workspacePath?: string;
  /** Optional multimodal image contexts (snake_case fields, aligned with backend ImageContextData). */
  imageContexts?: ImageInputContextData[];
  userMessageMetadata?: Record<string, unknown>;
}

export interface StartDialogTurnResponse {
  success: boolean;
  message: string;
}

export interface CompactSessionRequest {
  sessionId: string;
  workspacePath?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

 
export interface SessionInfo {
  sessionId: string;
  /** Current/default mode selection for the next dialog turn. */
  sessionName: string;
  agentType: string;
  /** Mode of the last surviving user dialog turn in session history. */
  lastUserDialogAgentType?: string;
  /** Mode of the most recent user submission accepted by the runtime. */
  lastSubmittedAgentType?: string;
  state: string;
  turnCount: number;
  createdAt: number;
}

export interface RestoreSessionWithTurnsResponse {
  session: SessionInfo;
  turns: DialogTurnData[];
}

export interface RestoreSessionViewResponse {
  session: SessionInfo;
  turns: DialogTurnData[];
  contextRestoreState: 'ready' | 'pending';
  isPartial?: boolean;
  loadedTurnCount?: number;
  totalTurnCount?: number;
}

export interface EnsureAssistantBootstrapRequest {
  sessionId: string;
  workspacePath: string;
}

export interface RunInitAgentsMdRequest {
  sessionId: string;
  workspacePath?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

export type EnsureAssistantBootstrapStatus = 'started' | 'skipped' | 'blocked';

export type EnsureAssistantBootstrapReason =
  | 'bootstrap_started'
  | 'bootstrap_not_required'
  | 'session_has_existing_turns'
  | 'session_not_idle'
  | 'model_unavailable';

export interface EnsureAssistantBootstrapResponse {
  status: EnsureAssistantBootstrapStatus;
  reason: EnsureAssistantBootstrapReason;
  sessionId: string;
  turnId?: string;
  detail?: string;
}

export interface UpdateSessionModelRequest {
  sessionId: string;
  modelName: string;
}

export interface UpdateSessionTitleRequest {
  sessionId: string;
  title: string;
  workspacePath?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

 
export interface ModeInfo {
  id: string;
  name: string;
  description: string;
  isReadonly: boolean;
  toolCount: number;
  defaultTools?: string[];
  /**
   * Combined prompt-cache compatibility key for mode-switch guards. Modes that
   * share the same key can reuse the same session-level prompt cache.
   */
  promptCacheScopeKey: string;
  configProfileId: string;
  configProfileLabel?: string;
  configProfileMemberModeIds: string[];
}



export interface SubagentParentInfo {
  toolCallId: string;
  sessionId: string;
  dialogTurnId: string;
}

export interface AgenticEvent {
  sessionId: string;
  turnId?: string;
  [key: string]: any;
}

export type DialogTurnStartedEvent = AgenticEvent;

export interface TextChunkEvent extends AgenticEvent {
  roundId: string;
  text: string;
  contentType?: 'text' | 'thinking';
  isThinkingEnd?: boolean;
}

export interface ToolEvent extends AgenticEvent {
  roundId: string;
  toolEvent: any;
}

export interface SubagentSessionLinkedEvent extends AgenticEvent {
  parentSessionId: string;
  parentDialogTurnId: string;
  parentToolCallId: string;
  agentType?: string;
}

export type SubagentTaskStatus =
  | 'created'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type SubagentTaskDeliveryState =
  | 'not_required'
  | 'pending'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'blocked';

export type SubagentTaskRecoveryState = 'none' | 'queued' | 'blocked';
export type SubagentTaskRecoveryBlockCode =
  | 'missing_checkpoint'
  | 'invalid_checkpoint'
  | 'missing_launch_spec'
  | 'invalid_launch_spec'
  | 'missing_child_session'
  | 'unsafe_delivery_replay'
  | 'resume_failed';

export interface SubagentTaskRecordDTO {
  schemaVersion: number;
  taskId: string;
  parentSessionId: string;
  childSessionId?: string;
  objective: string;
  executionMode: 'synchronous' | 'background';
  contextMode: 'fresh' | 'fork';
  status: SubagentTaskStatus;
  owner: string;
  progress?: string;
  result?: string;
  failure?: string;
  deliveryState: SubagentTaskDeliveryState;
  deliveryReplaySafety: 'idempotent' | 'unsafe_external_side_effect';
  deliveryIdempotencyKey: string;
  deliveryAttempts: number;
  recoveryState: SubagentTaskRecoveryState;
  recoveryReason?: string;
  recoveryBlock?: {
    code: SubagentTaskRecoveryBlockCode;
    detail: string;
  };
  durableCheckpoint?: {
    checkpointId: string;
    sessionId: string;
    checkpointVersion: number;
  };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  deliveredAt?: number;
}

export interface SubagentTaskChangedEvent extends AgenticEvent {
  task: SubagentTaskRecordDTO;
}

const SUBAGENT_TASK_STATUSES = new Set<SubagentTaskStatus>([
  'created',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);
const SUBAGENT_DELIVERY_STATES = new Set<SubagentTaskDeliveryState>([
  'not_required',
  'pending',
  'delivering',
  'delivered',
  'failed',
  'blocked',
]);
const SUBAGENT_RECOVERY_STATES = new Set<SubagentTaskRecoveryState>([
  'none',
  'queued',
  'blocked',
]);
const SUBAGENT_EXECUTION_MODES = new Set<SubagentTaskRecordDTO['executionMode']>([
  'synchronous',
  'background',
]);
const SUBAGENT_CONTEXT_MODES = new Set<SubagentTaskRecordDTO['contextMode']>([
  'fresh',
  'fork',
]);
const SUBAGENT_REPLAY_SAFETY = new Set<SubagentTaskRecordDTO['deliveryReplaySafety']>([
  'idempotent',
  'unsafe_external_side_effect',
]);
const SUBAGENT_RECOVERY_BLOCK_CODES = new Set<SubagentTaskRecoveryBlockCode>([
  'missing_checkpoint',
  'invalid_checkpoint',
  'missing_launch_spec',
  'invalid_launch_spec',
  'missing_child_session',
  'unsafe_delivery_replay',
  'resume_failed',
]);

function readDtoField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): unknown {
  return record[camelKey] ?? record[snakeKey];
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeSubagentTaskRecord(value: unknown): SubagentTaskRecordDTO | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const schemaVersion = readOptionalNumber(readDtoField(record, 'schemaVersion', 'schema_version'));
  const taskId = readOptionalString(readDtoField(record, 'taskId', 'task_id'));
  const parentSessionId = readOptionalString(
    readDtoField(record, 'parentSessionId', 'parent_session_id'),
  );
  const objective = readOptionalString(record.objective);
  const owner = readOptionalString(record.owner);
  const executionMode = readOptionalString(
    readDtoField(record, 'executionMode', 'execution_mode'),
  ) as SubagentTaskRecordDTO['executionMode'] | undefined;
  const contextMode = readOptionalString(
    readDtoField(record, 'contextMode', 'context_mode'),
  ) as SubagentTaskRecordDTO['contextMode'] | undefined;
  const status = readOptionalString(record.status) as SubagentTaskStatus | undefined;
  const deliveryState = readOptionalString(
    readDtoField(record, 'deliveryState', 'delivery_state'),
  ) as SubagentTaskDeliveryState | undefined;
  const recoveryState = (
    readOptionalString(readDtoField(record, 'recoveryState', 'recovery_state'))
  ) as SubagentTaskRecoveryState | undefined;
  const replaySafety = readOptionalString(
    readDtoField(record, 'deliveryReplaySafety', 'delivery_replay_safety'),
  ) as SubagentTaskRecordDTO['deliveryReplaySafety'] | undefined;
  const deliveryIdempotencyKey = readOptionalString(
    readDtoField(record, 'deliveryIdempotencyKey', 'delivery_idempotency_key'),
  );
  const deliveryAttempts = readOptionalNumber(
    readDtoField(record, 'deliveryAttempts', 'delivery_attempts'),
  );
  const createdAt = readOptionalNumber(readDtoField(record, 'createdAt', 'created_at'));
  const updatedAt = readOptionalNumber(readDtoField(record, 'updatedAt', 'updated_at'));

  if (
    (schemaVersion !== 2 && schemaVersion !== 3) ||
    !taskId ||
    !parentSessionId ||
    !objective ||
    !owner ||
    !executionMode ||
    !SUBAGENT_EXECUTION_MODES.has(executionMode) ||
    !contextMode ||
    !SUBAGENT_CONTEXT_MODES.has(contextMode) ||
    !status ||
    !SUBAGENT_TASK_STATUSES.has(status) ||
    !deliveryState ||
    !SUBAGENT_DELIVERY_STATES.has(deliveryState) ||
    !recoveryState ||
    !SUBAGENT_RECOVERY_STATES.has(recoveryState) ||
    !replaySafety ||
    !SUBAGENT_REPLAY_SAFETY.has(replaySafety) ||
    !deliveryIdempotencyKey ||
    deliveryAttempts === undefined ||
    !Number.isInteger(deliveryAttempts) ||
    deliveryAttempts < 0 ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    return null;
  }

  const rawCheckpoint = readDtoField(record, 'durableCheckpoint', 'durable_checkpoint');
  const checkpoint = rawCheckpoint && typeof rawCheckpoint === 'object' && !Array.isArray(rawCheckpoint)
    ? rawCheckpoint as Record<string, unknown>
    : undefined;
  const checkpointId = checkpoint
    ? readOptionalString(readDtoField(checkpoint, 'checkpointId', 'checkpoint_id'))
    : undefined;
  const checkpointSessionId = checkpoint
    ? readOptionalString(readDtoField(checkpoint, 'sessionId', 'session_id'))
    : undefined;
  const checkpointVersion = checkpoint
    ? readOptionalNumber(readDtoField(checkpoint, 'checkpointVersion', 'checkpoint_version'))
    : undefined;
  const rawRecoveryBlock = readDtoField(record, 'recoveryBlock', 'recovery_block');
  const recoveryBlock = rawRecoveryBlock &&
    typeof rawRecoveryBlock === 'object' &&
    !Array.isArray(rawRecoveryBlock)
    ? rawRecoveryBlock as Record<string, unknown>
    : undefined;
  const recoveryBlockCode = recoveryBlock
    ? readOptionalString(recoveryBlock.code) as SubagentTaskRecoveryBlockCode | undefined
    : undefined;
  const recoveryBlockDetail = recoveryBlock
    ? readOptionalString(recoveryBlock.detail)
    : undefined;
  if (
    rawRecoveryBlock != null &&
    (
      !recoveryBlockCode ||
      !SUBAGENT_RECOVERY_BLOCK_CODES.has(recoveryBlockCode) ||
      !recoveryBlockDetail
    )
  ) {
    return null;
  }

  return {
    schemaVersion,
    taskId,
    parentSessionId,
    childSessionId: readOptionalString(
      readDtoField(record, 'childSessionId', 'child_session_id'),
    ),
    objective,
    executionMode,
    contextMode,
    status,
    owner,
    progress: readOptionalString(record.progress),
    result: readOptionalString(record.result),
    failure: readOptionalString(record.failure),
    deliveryState,
    deliveryReplaySafety: replaySafety,
    deliveryIdempotencyKey,
    deliveryAttempts,
    recoveryState,
    recoveryReason: readOptionalString(
      readDtoField(record, 'recoveryReason', 'recovery_reason'),
    ),
    recoveryBlock: recoveryBlockCode && recoveryBlockDetail
      ? { code: recoveryBlockCode, detail: recoveryBlockDetail }
      : undefined,
    durableCheckpoint: checkpointId && checkpointSessionId && checkpointVersion !== undefined
      ? {
          checkpointId,
          sessionId: checkpointSessionId,
          checkpointVersion,
        }
      : undefined,
    createdAt,
    updatedAt,
    completedAt: readOptionalNumber(readDtoField(record, 'completedAt', 'completed_at')),
    deliveredAt: readOptionalNumber(readDtoField(record, 'deliveredAt', 'delivered_at')),
  };
}

export type DeepReviewQueueStatus =
  | 'queued_for_capacity'
  | 'paused_by_user'
  | 'running'
  | 'capacity_skipped';

export type DeepReviewQueueReason =
  | 'provider_rate_limit'
  | 'provider_concurrency_limit'
  | 'retry_after'
  | 'local_concurrency_cap'
  | 'launch_batch_blocked'
  | 'temporary_overload';

export interface DeepReviewQueueStateEventData {
  toolId: string;
  subagentType: string;
  status: DeepReviewQueueStatus;
  reason?: DeepReviewQueueReason;
  queuedReviewerCount: number;
  activeReviewerCount?: number;
  effectiveParallelInstances?: number;
  optionalReviewerCount?: number;
  queueElapsedMs?: number;
  runElapsedMs?: number;
  maxQueueWaitSeconds?: number;
  sessionConcurrencyHigh?: boolean;
}

export interface DeepReviewQueueStateChangedEvent extends AgenticEvent {
  queueState: DeepReviewQueueStateEventData;
}

export type DeepReviewQueueControlAction =
  | 'pause'
  | 'continue'
  | 'cancel'
  | 'skip_optional';

export interface DeepReviewQueueControlRequest {
  sessionId: string;
  dialogTurnId: string;
  toolId: string;
  action: DeepReviewQueueControlAction;
}

 
export interface ImageAnalysisEvent extends AgenticEvent {
  imageCount?: number;
  userInput?: string;
  success?: boolean;
  durationMs?: number;
}

export interface UserSteeringInjectedEvent extends AgenticEvent {
  turnId: string;
  roundIndex: number;
  steeringId: string;
  content: string;
  displayContent: string;
}

export interface ModelRoundCompletedEvent extends AgenticEvent {
  turnId: string;
  roundId: string;
  hasToolCalls?: boolean;
  durationMs?: number;
  providerId?: string;
  modelId?: string;
  modelAlias?: string;
  firstChunkMs?: number;
  firstVisibleOutputMs?: number;
  streamDurationMs?: number;
  attemptCount?: number;
  failureCategory?: string;
  tokenDetails?: unknown;
  promptCacheTelemetry?: unknown;
}

export interface AcpContextUsageUpdatedEvent extends AgenticEvent {
  clientId?: string;
  used: number;
  size: number;
  cost?: {
    amount: number;
    currency: string;
  };
}

export interface CompressionEvent extends AgenticEvent {
  compressionId: string;          
  
  trigger?: string;                // "auto" | "manual" | "user_message"
  tokensBefore?: number;           
  contextWindow?: number;          
  threshold?: number;              
  
  compressionCount?: number;       
  tokensAfter?: number;            
  compressionRatio?: number;       
  durationMs?: number;             
  hasSummary?: boolean;            
  summarySource?: 'model' | 'local_fallback' | 'none';
  
  error?: string;                  
}



export class AgentAPI {
  
  

  

   
  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    try {
      return await api.invoke<CreateSessionResponse>('create_session', { request });
    } catch (error) {
      throw createTauriCommandError('create_session', error, request);
    }
  }

   
  async startDialogTurn(request: StartDialogTurnRequest): Promise<{ success: boolean; message: string }> {
    try {
      return await api.invoke<{ success: boolean; message: string }>('start_dialog_turn', { request });
    } catch (error) {
      throw createTauriCommandError('start_dialog_turn', error, request);
    }
  }

  async compactSession(request: CompactSessionRequest): Promise<{ success: boolean; message: string }> {
    try {
      return await api.invoke<{ success: boolean; message: string }>('compact_session', { request });
    } catch (error) {
      throw createTauriCommandError('compact_session', error, request);
    }
  }

  async activateSessionGoal(request: {
    sessionId: string;
    userHint?: string;
    workspacePath?: string;
    remoteConnectionId?: string;
    remoteSshHost?: string;
  }): Promise<{
    success: boolean;
    goalText: string;
    successCriteria: string[];
    kickoffMessage: string;
    displayMessage: string;
  }> {
    try {
      return await api.invoke('activate_session_goal', { request });
    } catch (error) {
      throw createTauriCommandError('activate_session_goal', error, request);
    }
  }

  async updateSessionGoal(request: {
    sessionId: string;
    action:
      | 'pause'
      | 'resume'
      | 'clear'
      | 'edit'
      | 'complete'
      | 'block'
      | 'set-budget'
      | 'clear-budget';
    goalText?: string;
    tokenBudget?: number;
    workspacePath?: string;
    remoteConnectionId?: string;
    remoteSshHost?: string;
  }): Promise<{
    success: boolean;
    status: string;
    active: boolean;
    goalText?: string;
    tokenBudget?: number;
    tokensUsed: number;
    displayMessage: string;
    continuationMessage?: string;
    continuationDisplayMessage?: string;
    continuationMetadata?: Record<string, unknown>;
  }> {
    try {
      return await api.invoke('update_session_goal', { request });
    } catch (error) {
      throw createTauriCommandError('update_session_goal', error, request);
    }
  }

  async ensureAssistantBootstrap(
    request: EnsureAssistantBootstrapRequest
  ): Promise<EnsureAssistantBootstrapResponse> {
    try {
      return await api.invoke<EnsureAssistantBootstrapResponse>('ensure_assistant_bootstrap', {
        request
      });
    } catch (error) {
      throw createTauriCommandError('ensure_assistant_bootstrap', error, request);
    }
  }

  async runInitAgentsMd(
    request: RunInitAgentsMdRequest
  ): Promise<StartDialogTurnResponse> {
    try {
      return await api.invoke<StartDialogTurnResponse>('run_init_agents_md', {
        request,
      });
    } catch (error) {
      throw createTauriCommandError('run_init_agents_md', error, request);
    }
  }

   
  async cancelDialogTurn(sessionId: string, dialogTurnId: string): Promise<void> {
    try {
      await api.invoke<void>('cancel_dialog_turn', { request: { sessionId, dialogTurnId } });
    } catch (error) {
      throw createTauriCommandError('cancel_dialog_turn', error, { sessionId, dialogTurnId });
    }
  }

  /**
   * Inject a user "steering" message into the currently running dialog turn.
   * Mirrors Codex CLI's Esc-to-steer behavior: the message is queued on the
   * Rust side and consumed by the execution engine at the next round boundary
   * without ending the current turn.
   */
  async steerDialogTurn(request: {
    sessionId: string;
    dialogTurnId: string;
    content: string;
    displayContent?: string;
  }): Promise<{ success: boolean; steeringId: string }> {
    try {
      return await api.invoke<{ success: boolean; steeringId: string }>(
        'steer_dialog_turn',
        { request },
      );
    } catch (error) {
      throw createTauriCommandError('steer_dialog_turn', error, request);
    }
  }

  async controlDeepReviewQueue(request: DeepReviewQueueControlRequest): Promise<void> {
    try {
      await api.invoke<void>('control_deep_review_queue', { request });
    } catch (error) {
      throw createTauriCommandError('control_deep_review_queue', error, request);
    }
  }

   
  async deleteSession(
    sessionId: string,
    workspacePath: string,
    remoteConnectionId?: string,
    remoteSshHost?: string
  ): Promise<void> {
    try {
      await api.invoke<void>('delete_session', { 
        request: { sessionId, workspacePath, remoteConnectionId, remoteSshHost } 
      });
    } catch (error) {
      throw createTauriCommandError('delete_session', error, { sessionId, workspacePath });
    }
  }

   
  async restoreSession(
    sessionId: string,
    workspacePath: string,
    remoteConnectionId?: string,
    remoteSshHost?: string,
    traceId?: string,
    includeInternal?: boolean,
  ): Promise<SessionInfo> {
    try {
      return await api.invoke<SessionInfo>('restore_session', {
        request: {
          sessionId,
          workspacePath,
          remoteConnectionId,
          remoteSshHost,
          traceId,
          includeInternal,
        },
      });
    } catch (error) {
      throw createTauriCommandError('restore_session', error, { sessionId, workspacePath });
    }
  }

  async restoreSessionWithTurns(
    sessionId: string,
    workspacePath: string,
    remoteConnectionId?: string,
    remoteSshHost?: string,
    traceId?: string,
    includeInternal?: boolean,
  ): Promise<RestoreSessionWithTurnsResponse> {
    try {
      return await api.invoke<RestoreSessionWithTurnsResponse>('restore_session_with_turns', {
        request: {
          sessionId,
          workspacePath,
          remoteConnectionId,
          remoteSshHost,
          traceId,
          includeInternal,
        },
      });
    } catch (error) {
      throw createTauriCommandError('restore_session_with_turns', error, { sessionId, workspacePath });
    }
  }

  async restoreSessionView(
    sessionId: string,
    workspacePath: string,
    remoteConnectionId?: string,
    remoteSshHost?: string,
    traceId?: string,
    includeInternal?: boolean,
  ): Promise<RestoreSessionViewResponse> {
    try {
      return await api.invoke<RestoreSessionViewResponse>('restore_session_view', {
        request: {
          sessionId,
          workspacePath,
          remoteConnectionId,
          remoteSshHost,
          traceId,
          includeInternal,
        },
      });
    } catch (error) {
      throw createTauriCommandError('restore_session_view', error, { sessionId, workspacePath });
    }
  }

  /**
   * No-op if the session is already in the coordinator; otherwise loads it from disk
   * using the same workspace path resolution as restore_session (required for SSH remote workspaces).
   */
  async ensureCoordinatorSession(request: {
    sessionId: string;
    workspacePath: string;
    remoteConnectionId?: string;
    remoteSshHost?: string;
    includeInternal?: boolean;
  }): Promise<void> {
    try {
      await api.invoke<void>('ensure_coordinator_session', { request });
    } catch (error) {
      throw createTauriCommandError('ensure_coordinator_session', error, request);
    }
  }

  async updateSessionModel(request: UpdateSessionModelRequest): Promise<void> {
    try {
      await api.invoke<void>('update_session_model', { request });
    } catch (error) {
      throw createTauriCommandError('update_session_model', error, request);
    }
  }

  async updateSessionTitle(request: UpdateSessionTitleRequest): Promise<string> {
    try {
      return await api.invoke<string>('update_session_title', { request });
    } catch (error) {
      throw createTauriCommandError('update_session_title', error, request);
    }
  }


   
  async listSessions(
    workspacePath: string,
    remoteConnectionId?: string,
    remoteSshHost?: string
  ): Promise<SessionInfo[]> {
    try {
      return await api.invoke<SessionInfo[]>('list_sessions', {
        request: { workspacePath, remoteConnectionId, remoteSshHost },
      });
    } catch (error) {
      throw createTauriCommandError('list_sessions', error, { workspacePath });
    }
  }

  async listSubagentTasks(parentSessionId: string): Promise<SubagentTaskRecordDTO[]> {
    try {
      const values = await api.invoke<unknown[]>('list_subagent_tasks', {
        request: { parentSessionId },
      });
      return values.map((value) => {
        const task = normalizeSubagentTaskRecord(value);
        if (!task) {
          throw new Error('Backend returned an invalid subagent task record');
        }
        return task;
      });
    } catch (error) {
      throw createTauriCommandError('list_subagent_tasks', error, { parentSessionId });
    }
  }

  async confirmToolExecution(sessionId: string, toolId: string): Promise<void> {
    try {
      await api.invoke<void>('confirm_tool_execution', {
        request: {
          sessionId,
          toolId
        }
      });
    } catch (error) {
      throw createTauriCommandError('confirm_tool_execution', error, { sessionId, toolId });
    }
  }

   
  async rejectToolExecution(sessionId: string, toolId: string, reason?: string): Promise<void> {
    try {
      await api.invoke<void>('reject_tool_execution', {
        request: {
          sessionId,
          toolId,
          reason
        }
      });
    } catch (error) {
      throw createTauriCommandError('reject_tool_execution', error, { sessionId, toolId, reason });
    }
  }
  

   
  onSessionCreated(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://session-created', callback);
  }

  onSessionDeleted(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://session-deleted', callback);
  }

  onSessionStateChanged(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://session-state-changed', callback);
  }

  onSessionModelAutoMigrated(
    callback: (event: SessionModelAutoMigratedEvent) => void
  ): () => void {
    return api.listen<SessionModelAutoMigratedEvent>(
      'agentic://session-model-auto-migrated',
      callback
    );
  }

   
  onDialogTurnStarted(callback: (event: DialogTurnStartedEvent) => void): () => void {
    return api.listen<DialogTurnStartedEvent>('agentic://dialog-turn-started', callback);
  }

   
  onModelRoundStarted(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://model-round-started', callback);
  }

  onModelRoundCompleted(callback: (event: ModelRoundCompletedEvent) => void): () => void {
    return api.listen<ModelRoundCompletedEvent>('agentic://model-round-completed', callback);
  }

   
  onTextChunk(callback: (event: TextChunkEvent) => void): () => void {
    return api.listen<TextChunkEvent>('agentic://text-chunk', callback);
  }

   
  onToolEvent(callback: (event: ToolEvent) => void): () => void {
    return api.listen<ToolEvent>('agentic://tool-event', callback);
  }

  onSubagentSessionLinked(
    callback: (event: SubagentSessionLinkedEvent) => void
  ): () => void {
    return api.listen<SubagentSessionLinkedEvent>(
      'agentic://subagent-session-linked',
      callback
    );
  }

  onSubagentTaskChanged(
    callback: (event: SubagentTaskChangedEvent) => void,
  ): () => void {
    return api.listen<Record<string, unknown>>('agentic://subagent-task-changed', (event) => {
      const task = normalizeSubagentTaskRecord(event.task);
      if (!task) {
        return;
      }
      callback({
        ...event,
        sessionId: typeof event.sessionId === 'string'
          ? event.sessionId
          : task.parentSessionId,
        task,
      });
    });
  }

  onDeepReviewQueueStateChanged(
    callback: (event: DeepReviewQueueStateChangedEvent) => void
  ): () => void {
    return api.listen<DeepReviewQueueStateChangedEvent>(
      'agentic://deep-review-queue-state-changed',
      callback
    );
  }

   
  onDialogTurnCompleted(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://dialog-turn-completed', callback);
  }

  onUserSteeringInjected(
    callback: (event: UserSteeringInjectedEvent) => void,
  ): () => void {
    return api.listen<UserSteeringInjectedEvent>('agentic://user-steering-injected', callback);
  }

   
  onDialogTurnFailed(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://dialog-turn-failed', callback);
  }

   
  onDialogTurnCancelled(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://dialog-turn-cancelled', callback);
  }

   
  onTokenUsageUpdated(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://token-usage-updated', callback);
  }

  onAcpContextUsageUpdated(
    callback: (event: AcpContextUsageUpdatedEvent) => void
  ): () => void {
    return api.listen<AcpContextUsageUpdatedEvent>(
      'agentic://acp-context-usage-updated',
      callback
    );
  }

   
  onContextCompressionStarted(callback: (event: CompressionEvent) => void): () => void {
    return api.listen<CompressionEvent>('agentic://context-compression-started', callback);
  }

   
  onContextCompressionCompleted(callback: (event: CompressionEvent) => void): () => void {
    return api.listen<CompressionEvent>('agentic://context-compression-completed', callback);
  }

   
  onContextCompressionFailed(callback: (event: CompressionEvent) => void): () => void {
    return api.listen<CompressionEvent>('agentic://context-compression-failed', callback);
  }

  onGoalVerificationStarted(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://goal-verification-started', callback);
  }

  onGoalVerificationFinished(callback: (event: AgenticEvent) => void): () => void {
    return api.listen<AgenticEvent>('agentic://goal-verification-finished', callback);
  }

  onImageAnalysisStarted(callback: (event: ImageAnalysisEvent) => void): () => void {
    return api.listen<ImageAnalysisEvent>('agentic://image-analysis-started', callback);
  }

  onImageAnalysisCompleted(callback: (event: ImageAnalysisEvent) => void): () => void {
    return api.listen<ImageAnalysisEvent>('agentic://image-analysis-completed', callback);
  }

   
  async getAvailableTools(): Promise<string[]> {
    try {
      return await api.invoke<string[]>('get_available_tools');
    } catch (error) {
      throw createTauriCommandError('get_available_tools', error);
    }
  }

  async getDefaultReviewTeamDefinition(): Promise<unknown> {
    try {
      return await api.invoke<unknown>('get_default_review_team_definition');
    } catch (error) {
      throw createTauriCommandError('get_default_review_team_definition', error);
    }
  }

  async generateSessionTitle(
    sessionId: string,
    userMessage: string,
    maxLength?: number
  ): Promise<string> {
    try {
      return await api.invoke<string>('generate_session_title', {
        request: {
          sessionId,
          userMessage,
          maxLength: maxLength || 20
        }
      });
    } catch (error) {
      throw createTauriCommandError('generate_session_title', error, {
        sessionId,
        userMessage,
        maxLength
      });
    }
  }

   
  onSessionTitleGenerated(
    callback: (event: SessionTitleGeneratedEvent) => void
  ): () => void {
    return api.listen<SessionTitleGeneratedEvent>('session_title_generated', callback);
  }

  async cancelSession(sessionId: string): Promise<void> {
    try {
      await api.invoke<void>('cancel_session', {
        request: { sessionId }
      });
    } catch (error) {
      throw createTauriCommandError('cancel_session', error, { sessionId });
    }
  }

  async setSubagentTimeout(
    sessionId: string,
    action: { type: 'disable' } | { type: 'restore' } | { type: 'extend'; seconds: number },
  ): Promise<void> {
    const actionPayload = action.type === 'disable'
      ? { type: 'Disable', payload: null }
      : action.type === 'restore'
        ? { type: 'Restore', payload: null }
        : { type: 'Extend', payload: { seconds: action.seconds } };
    try {
      await api.invoke<void>('set_subagent_timeout', {
        request: { sessionId, action: actionPayload },
      });
    } catch (error) {
      throw createTauriCommandError('set_subagent_timeout', error, { sessionId, action: action.type });
    }
  }

  async getAgentInfo(agentType: string): Promise<ModeInfo & { agent_type: string; when_to_use: string; tools: string; location: string }> {
    return {
      id: agentType,
      name: agentType,
      description: `${agentType} agent`,
      isReadonly: false,
      toolCount: 0,
      promptCacheScopeKey: agentType,
      configProfileId: agentType,
      configProfileMemberModeIds: [agentType],
      agent_type: agentType,
      when_to_use: `Use ${agentType} for related tasks`,
      tools: 'all',
      location: 'builtin',
    };
  }

  

   
  async getAvailableModes(): Promise<ModeInfo[]> {
    try {
      return await api.invoke<ModeInfo[]>('get_available_modes');
    } catch (error) {
      throw createTauriCommandError('get_available_modes', error);
    }
  }

}


export const agentAPI = new AgentAPI();
