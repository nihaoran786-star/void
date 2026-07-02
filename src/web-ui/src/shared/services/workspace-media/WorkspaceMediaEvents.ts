import { create } from 'zustand';
import { pathsEquivalentFs } from '@/shared/utils/pathUtils';
import type { WorkspaceMediaKind, WorkspaceMediaPendingGeneration } from './WorkspaceMediaTypes';

export const WORKSPACE_MEDIA_REFRESH_EVENT = 'void:workspace-media-refresh';

export type WorkspaceMediaRefreshLifecycleStatus =
  | 'started'
  | 'polling'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface WorkspaceMediaRefreshEventDetail {
  reason: 'media-tool-event';
  lifecycleStatus?: WorkspaceMediaRefreshLifecycleStatus;
  workspacePath?: string;
  toolId?: string;
  taskId?: string;
  toolName?: string;
  status?: string;
  batchId?: string;
  kind?: Exclude<WorkspaceMediaKind, 'audio'>;
  targetStage?: string;
  episodeId?: string;
  artifactId?: string;
  artifactHandle?: string;
  mediaItemId?: string;
  prompt?: string;
  model?: string;
  requestedCount?: number;
  requestedAspectRatio?: string;
  placeholderAspectRatio?: string;
  error?: string;
}

export interface WorkspaceMediaRefreshSignal extends WorkspaceMediaRefreshEventDetail {
  token: number;
  lifecycleStatus: WorkspaceMediaRefreshLifecycleStatus;
  receivedAt: number;
}

interface WorkspaceMediaRefreshState {
  token: number;
  lastSignal?: WorkspaceMediaRefreshSignal;
  signalsByToolId: Record<string, WorkspaceMediaRefreshSignal>;
}

export const useWorkspaceMediaRefreshStore = create<WorkspaceMediaRefreshState>(() => ({
  token: 0,
  signalsByToolId: {},
}));

function lifecycleStatusFromDetail(detail: WorkspaceMediaRefreshEventDetail): WorkspaceMediaRefreshLifecycleStatus {
  if (detail.lifecycleStatus) {
    return detail.lifecycleStatus;
  }
  if (detail.status === 'polling') {
    return 'polling';
  }
  if (detail.status === 'completed') {
    return 'completed';
  }
  if (detail.status === 'failed' || detail.status === 'error') {
    return 'failed';
  }
  return 'unknown';
}

function signalKey(detail: WorkspaceMediaRefreshEventDetail, token: number): string {
  const target = signalTargetKey(detail);
  if (detail.taskId) {
    return target ? `${detail.taskId}:${target}` : detail.taskId;
  }
  if (detail.toolId) {
    return target ? `${detail.toolId}:${target}` : detail.toolId;
  }
  if (detail.batchId) {
    return target ? `${detail.batchId}:${target}` : detail.batchId;
  }
  return `${detail.toolName || 'media'}:${token}`;
}

function sanitizePendingId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function defaultKindForTool(toolName?: string): Exclude<WorkspaceMediaKind, 'audio'> {
  return toolName === 'GenerateVideo' ? 'video' : 'image';
}

function defaultRequestedAspectRatio(kind: Exclude<WorkspaceMediaKind, 'audio'>): string {
  return kind === 'video' ? '16:9' : '1:1';
}

function defaultPlaceholderAspectRatio(requestedAspectRatio: string): string {
  const ratio = requestedAspectRatio.trim();
  const colon = ratio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (colon) {
    return `${colon[1]} / ${colon[2]}`;
  }
  return ratio.replace(/\s*x\s*/i, ' / ');
}

function isActiveMediaSignal(signal: WorkspaceMediaRefreshSignal): boolean {
  return signal.lifecycleStatus === 'started' || signal.lifecycleStatus === 'polling';
}

function signalMatchesWorkspace(signal: WorkspaceMediaRefreshSignal, workspacePath?: string): boolean {
  if (!signal.workspacePath || !workspacePath) {
    return true;
  }
  return pathsEquivalentFs(signal.workspacePath, workspacePath);
}

function signalTargetKey(signal: Pick<WorkspaceMediaRefreshSignal, 'targetStage' | 'episodeId' | 'artifactId' | 'artifactHandle' | 'mediaItemId'>): string {
  return [
    signal.targetStage,
    signal.episodeId,
    signal.artifactId,
    signal.artifactHandle,
    signal.mediaItemId,
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(':')
    .toLowerCase();
}

function signalTargetsMatch(
  existing: WorkspaceMediaRefreshSignal,
  signal: WorkspaceMediaRefreshSignal,
): boolean {
  const signalTarget = signalTargetKey(signal);
  const existingTarget = signalTargetKey(existing);
  if (!signalTarget && !existingTarget) {
    return true;
  }
  if (!signalTarget || !existingTarget) {
    return true;
  }
  return signalTarget === existingTarget;
}

export function recordWorkspaceMediaRefresh(detail: WorkspaceMediaRefreshEventDetail): WorkspaceMediaRefreshSignal {
  const current = useWorkspaceMediaRefreshStore.getState();
  const token = current.token + 1;
  const signal: WorkspaceMediaRefreshSignal = {
    ...detail,
    lifecycleStatus: lifecycleStatusFromDetail(detail),
    token,
    receivedAt: Date.now(),
  };
  const key = signalKey(detail, token);

  useWorkspaceMediaRefreshStore.setState((state) => ({
    token,
    lastSignal: signal,
    signalsByToolId: upsertRefreshSignal(state.signalsByToolId, key, signal),
  }));

  return signal;
}

function upsertRefreshSignal(
  signalsByToolId: Record<string, WorkspaceMediaRefreshSignal>,
  key: string,
  signal: WorkspaceMediaRefreshSignal,
): Record<string, WorkspaceMediaRefreshSignal> {
  const next = { ...signalsByToolId };
  for (const [existingKey, existing] of Object.entries(next)) {
    const sameTool = Boolean(signal.toolId && existing.toolId === signal.toolId);
    const sameBatch = Boolean(signal.batchId && existing.batchId === signal.batchId);
    if (
      (sameTool || sameBatch)
      && signalTargetsMatch(existing, signal)
      && signalMatchesWorkspace(existing, signal.workspacePath)
    ) {
      delete next[existingKey];
    }
  }
  next[key] = signal;
  return next;
}

export function resetWorkspaceMediaRefreshState(): void {
  useWorkspaceMediaRefreshStore.setState({
    token: 0,
    lastSignal: undefined,
    signalsByToolId: {},
  });
}

export function getWorkspaceMediaPendingGenerationsForWorkspace(
  workspacePath?: string
): WorkspaceMediaPendingGeneration[] {
  const state = useWorkspaceMediaRefreshStore.getState();
  return Object.values(state.signalsByToolId)
    .filter(signal => isActiveMediaSignal(signal) && signalMatchesWorkspace(signal, workspacePath))
    .flatMap((signal): WorkspaceMediaPendingGeneration[] => {
      const kind = signal.kind || defaultKindForTool(signal.toolName);
      const requestedCount = Math.max(1, Math.min(signal.requestedCount || 1, 8));
      const requestedAspectRatio = signal.requestedAspectRatio || defaultRequestedAspectRatio(kind);
      const placeholderAspectRatio =
        signal.placeholderAspectRatio || defaultPlaceholderAspectRatio(requestedAspectRatio);
      const batchId = signal.batchId || `tool-${sanitizePendingId(signal.toolId || String(signal.token))}`;
      const idPrefix = signal.batchId
        ? `workspace-media-pending-${sanitizePendingId(signal.batchId)}${signalTargetKey(signal) ? `-${sanitizePendingId(signalTargetKey(signal))}` : ''}`
        : `workspace-media-pending-tool-${sanitizePendingId(signal.toolId || String(signal.token))}`;

      return Array.from({ length: requestedCount }, (_, index) => ({
        id: createPendingGenerationSlotKey({
          workspacePath: signal.workspacePath,
          toolId: signal.toolId,
          taskId: signal.taskId,
          batchId,
          kind,
          targetStage: signal.targetStage,
          artifactHandle: signal.artifactHandle,
          itemIndex: index + 1,
          fallback: `${idPrefix}-${index + 1}`,
        }),
        batchId,
        itemIndex: index + 1,
        kind,
        source: 'generated',
        workspacePath: signal.workspacePath,
        toolId: signal.toolId,
        taskId: signal.taskId,
        targetStage: signal.targetStage,
        episodeId: signal.episodeId,
        artifactId: signal.artifactId,
        artifactHandle: signal.artifactHandle,
        mediaItemId: signal.mediaItemId,
        prompt: signal.prompt,
        model: signal.model,
        requestedAspectRatio,
        placeholderAspectRatio,
        startedAt: signal.receivedAt,
        updatedAt: signal.receivedAt,
      }));
    })
    .sort((left, right) => (right.updatedAt || right.startedAt || 0) - (left.updatedAt || left.startedAt || 0));
}

export function mergeWorkspaceMediaPendingGenerationsForWorkspace(
  pendingGenerations: WorkspaceMediaPendingGeneration[] = [],
  workspacePath?: string
): WorkspaceMediaPendingGeneration[] {
  const existingBatchIds = new Set(pendingGenerations.map(item => item.batchId));
  const signalPending = getWorkspaceMediaPendingGenerationsForWorkspace(workspacePath)
    .filter(item => !existingBatchIds.has(item.batchId))
    .filter(item => !pendingGenerations.some(existing => pendingGenerationsMatch(existing, item)));
  return [...signalPending, ...pendingGenerations];
}

function pendingGenerationsMatch(
  existing: WorkspaceMediaPendingGeneration,
  incoming: WorkspaceMediaPendingGeneration,
): boolean {
  if (existing.kind !== incoming.kind || existing.itemIndex !== incoming.itemIndex) {
    return false;
  }
  if (existing.batchId === incoming.batchId) {
    return true;
  }
  const existingSlot = pendingStableSlotKey(existing);
  const incomingSlot = pendingStableSlotKey(incoming);
  if (existingSlot && incomingSlot && existingSlot === incomingSlot) {
    return true;
  }
  const sameOperation = Boolean(
    (existing.taskId && incoming.taskId && existing.taskId === incoming.taskId)
    || (existing.toolId && incoming.toolId && existing.toolId === incoming.toolId)
  );
  if (sameOperation) {
    return true;
  }
  const existingTarget = pendingTargetKey(existing);
  const incomingTarget = pendingTargetKey(incoming);
  const targetsCompatible = !existingTarget || !incomingTarget || existingTarget === incomingTarget;
  if (!targetsCompatible) {
    return false;
  }
  return Boolean(
    existing.prompt
    && incoming.prompt
    && existing.prompt.trim() === incoming.prompt.trim()
  );
}

function createPendingGenerationSlotKey(input: {
  workspacePath?: string;
  toolId?: string;
  taskId?: string;
  batchId?: string;
  kind: Exclude<WorkspaceMediaKind, 'audio'>;
  targetStage?: string;
  artifactHandle?: string;
  itemIndex: number;
  fallback: string;
}): string {
  const rawKey = [
    input.workspacePath,
    input.taskId,
    input.toolId,
    input.batchId,
    input.kind,
    input.targetStage,
    input.artifactHandle,
    String(input.itemIndex),
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(':');
  return `workspace-media-pending-${sanitizePendingId(rawKey || input.fallback)}`;
}

function pendingStableSlotKey(item: Pick<WorkspaceMediaPendingGeneration, 'workspacePath' | 'toolId' | 'taskId' | 'batchId' | 'kind' | 'targetStage' | 'artifactHandle' | 'itemIndex'>): string {
  return [
    item.workspacePath,
    item.taskId,
    item.toolId,
    item.batchId,
    item.kind,
    item.targetStage,
    item.artifactHandle,
    String(item.itemIndex),
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(':')
    .toLowerCase();
}

function pendingTargetKey(item: Pick<WorkspaceMediaPendingGeneration, 'targetStage' | 'episodeId' | 'artifactId' | 'artifactHandle' | 'mediaItemId'>): string {
  return [
    item.targetStage,
    item.episodeId,
    item.artifactId,
    item.artifactHandle,
    item.mediaItemId,
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(':')
    .toLowerCase();
}

export function getWorkspaceMediaPathMismatch(workspacePath?: string): WorkspaceMediaRefreshSignal | undefined {
  const signal = useWorkspaceMediaRefreshStore.getState().lastSignal;
  if (
    !signal ||
    !isActiveMediaSignal(signal) ||
    !signal.workspacePath ||
    !workspacePath ||
    pathsEquivalentFs(signal.workspacePath, workspacePath)
  ) {
    return undefined;
  }
  return signal;
}

export function dispatchWorkspaceMediaRefresh(detail: WorkspaceMediaRefreshEventDetail): void {
  const signal = recordWorkspaceMediaRefresh(detail);
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(WORKSPACE_MEDIA_REFRESH_EVENT, { detail: signal }));
}
