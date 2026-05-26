import type { FlowToolItem } from '../types/flow-chat';

export type MediaToolKind = 'image' | 'video' | 'audio' | 'media';
export type MediaToolStatus = 'polling' | 'partial' | 'completed' | 'failed' | 'timeout' | 'error';

export interface MediaAssetViewModel {
  kind: MediaToolKind;
  url: string;
  taskId?: string;
}

export interface MediaToolViewModel {
  kind: MediaToolKind;
  status: MediaToolStatus;
  source?: string;
  taskIds: string[];
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  pollIntervalSeconds?: number;
  assets: MediaAssetViewModel[];
  errorMessage?: string;
}

const MEDIA_TOOL_NAMES = new Set(['GenerateImage', 'GenerateVideo']);

function asRecord(value: unknown): Record<string, any> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, any> : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeKind(value: unknown, fallback: MediaToolKind): MediaToolKind {
  return value === 'image' || value === 'video' || value === 'audio' ? value : fallback;
}

function normalizeStatus(value: unknown): MediaToolStatus {
  if (
    value === 'polling' ||
    value === 'partial' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'timeout' ||
    value === 'error'
  ) {
    return value;
  }
  return 'completed';
}

function countNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function collectAssets(value: unknown, fallbackKind: MediaToolKind): MediaAssetViewModel[] {
  const record = asRecord(value);
  const rawAssets = Array.isArray(record?.assets) ? record.assets : [];
  const assets: MediaAssetViewModel[] = [];
  for (const asset of rawAssets) {
    const assetRecord = asRecord(asset);
    const url = assetRecord?.url;
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      continue;
    }

    const viewModel: MediaAssetViewModel = {
      kind: normalizeKind(assetRecord?.kind, fallbackKind),
      url,
    };
    if (typeof assetRecord?.task_id === 'string') {
      viewModel.taskId = assetRecord.task_id;
    }
    assets.push(viewModel);
  }
  return assets;
}

function collectTaskIdsFromTasks(tasks: unknown): string[] {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map(task => asRecord(task)?.task_id)
    .filter((taskId): taskId is string => typeof taskId === 'string' && taskId.trim().length > 0);
}

export function getMediaToolViewModel(toolItem: FlowToolItem): MediaToolViewModel | null {
  if (!MEDIA_TOOL_NAMES.has(toolItem.toolName)) {
    return null;
  }

  const result = asRecord(toolItem.toolResult?.result);
  if (!result) {
    const fallbackKind = toolItem.toolName === 'GenerateVideo' ? 'video' : 'image';
    return {
      kind: fallbackKind,
      status: toolItem.status === 'error' ? 'error' : 'polling',
      taskIds: [],
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      assets: [],
      errorMessage: toolItem.toolResult?.error,
    };
  }

  const fallbackKind = toolItem.toolName === 'GenerateVideo' ? 'video' : 'image';
  const batch = asRecord(result.batch);
  const kind = normalizeKind(batch?.kind ?? result.kind, fallbackKind);
  const status = normalizeStatus(batch?.status ?? result.status);
  const taskIds = asStringArray(result.task_ids);
  const taskIdsFromTasks = collectTaskIdsFromTasks(result.tasks);
  const allTaskIds = taskIds.length > 0 ? taskIds : taskIdsFromTasks;
  const completedCount = countNumber(batch?.completed_count) ?? (status === 'polling' ? 0 : undefined);
  const failedCount = countNumber(batch?.failed_count) ?? 0;
  const totalCount = countNumber(batch?.total_count) ?? allTaskIds.length;
  const pendingCount = countNumber(batch?.pending_count) ?? Math.max(totalCount - (completedCount ?? 0) - failedCount, 0);
  const error = asRecord(result.error);

  return {
    kind,
    status,
    source: typeof result.source === 'string' ? result.source : undefined,
    taskIds: allTaskIds,
    totalCount,
    completedCount: completedCount ?? totalCount,
    failedCount,
    pendingCount,
    pollIntervalSeconds: countNumber(result.poll_interval_seconds),
    assets: collectAssets(batch, kind),
    errorMessage: typeof error?.message === 'string' ? error.message : toolItem.toolResult?.error,
  };
}
