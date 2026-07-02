import type { FlowToolItem } from '../types/flow-chat';
import { convertFileSrc } from '@tauri-apps/api/core';

export type MediaToolKind = 'image' | 'video' | 'audio' | 'upload' | 'media';
export type MediaToolStatus = 'polling' | 'partial' | 'completed' | 'failed' | 'timeout' | 'error';

export interface MediaAssetViewModel {
  kind: MediaToolKind;
  url: string;
  localPath?: string;
  previewUrl?: string;
  saveStatus?: string;
  saveError?: string;
  itemIndex?: number;
  taskId?: string;
}

export interface MediaItemViewModel {
  itemIndex: number;
  kind: MediaToolKind;
  status: MediaItemStatus;
  prompt?: string;
  model?: string;
  taskId?: string;
  resultUrl?: string;
  resultPath?: string;
  localPath?: string;
  saveStatus?: string;
  saveError?: string;
  errorMessage?: string;
}

type MediaItemStatus = MediaToolStatus | 'queued' | 'submitted' | 'cancelled' | 'provider_mapping_missing';

export interface MediaToolViewModel {
  batchId?: string;
  kind: MediaToolKind;
  status: MediaToolStatus;
  source?: string;
  requestedAspectRatio?: string;
  placeholderAspectRatio?: string;
  taskIds: string[];
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  pollIntervalSeconds?: number;
  items: MediaItemViewModel[];
  assets: MediaAssetViewModel[];
  errorMessage?: string;
}

const MEDIA_TOOL_NAMES = new Set([
  'GenerateImage',
  'GenerateVideo',
  'UploadMediaImage',
  'GenerateSpeech',
  'TranscribeAudio',
  'GetMediaTaskStatus',
]);

function asRecord(value: unknown): Record<string, any> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, any> : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeKind(value: unknown, fallback: MediaToolKind): MediaToolKind {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'upload' || value === 'upload_image' ? (value === 'upload_image' ? 'upload' : value) : fallback;
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

function normalizeItemStatus(value: unknown): MediaItemStatus {
  if (
    value === 'queued' ||
    value === 'submitted' ||
    value === 'cancelled' ||
    value === 'provider_mapping_missing'
  ) {
    return value;
  }
  return normalizeStatus(value);
}

function countNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function localAssetPreviewUrl(localPath: string | undefined): string | undefined {
  if (!localPath) return undefined;

  try {
    return convertFileSrc(localPath);
  } catch {
    return undefined;
  }
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
    if (typeof assetRecord?.local_path === 'string' && assetRecord.local_path.trim()) {
      viewModel.localPath = assetRecord.local_path;
      viewModel.previewUrl = localAssetPreviewUrl(assetRecord.local_path);
    }
    if (typeof assetRecord?.save_status === 'string') {
      viewModel.saveStatus = assetRecord.save_status;
    }
    if (typeof assetRecord?.save_error === 'string') {
      viewModel.saveError = assetRecord.save_error;
    }
    if (typeof assetRecord?.item_index === 'number') {
      viewModel.itemIndex = assetRecord.item_index;
    }
    if (typeof assetRecord?.task_id === 'string') {
      viewModel.taskId = assetRecord.task_id;
    }
    assets.push(viewModel);
  }
  return assets;
}

function collectHttpUrls(value: unknown, urls: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value) && !urls.includes(value)) {
      urls.push(value);
    }
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectHttpUrls(item, urls));
    return urls;
  }
  const record = asRecord(value);
  if (record) {
    Object.values(record).forEach(child => collectHttpUrls(child, urls));
  }
  return urls;
}

function fallbackKindForTool(toolName: string): MediaToolKind {
  if (toolName === 'GenerateVideo') return 'video';
  if (toolName === 'GenerateSpeech' || toolName === 'TranscribeAudio') return 'audio';
  if (toolName === 'UploadMediaImage') return 'upload';
  return 'image';
}

function errorMessageFrom(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.message === 'string' ? record.message : undefined;
}

function collectItems(value: unknown, fallbackKind: MediaToolKind): MediaItemViewModel[] {
  const record = asRecord(value);
  const rawItems = Array.isArray(record?.items) ? record.items : [];
  return rawItems
    .map((item, index): MediaItemViewModel | null => {
      const itemRecord = asRecord(item);
      if (!itemRecord) return null;
      const itemIndex = typeof itemRecord.item_index === 'number' ? itemRecord.item_index : index + 1;
      return {
        itemIndex,
        kind: normalizeKind(itemRecord.kind, fallbackKind),
        status: normalizeItemStatus(itemRecord.status),
        prompt: typeof itemRecord.prompt === 'string' && itemRecord.prompt ? itemRecord.prompt : undefined,
        model: typeof itemRecord.model === 'string' && itemRecord.model ? itemRecord.model : undefined,
        taskId: typeof itemRecord.task_id === 'string' ? itemRecord.task_id : undefined,
        resultUrl: typeof itemRecord.result_url === 'string' ? itemRecord.result_url : undefined,
        resultPath: typeof itemRecord.result_path === 'string' ? itemRecord.result_path : undefined,
        localPath: typeof itemRecord.local_path === 'string' ? itemRecord.local_path : undefined,
        saveStatus: typeof itemRecord.save_status === 'string' ? itemRecord.save_status : undefined,
        saveError: typeof itemRecord.save_error === 'string' ? itemRecord.save_error : undefined,
        errorMessage: errorMessageFrom(itemRecord.error),
      };
    })
    .filter((item): item is MediaItemViewModel => item !== null);
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
    const fallbackKind = fallbackKindForTool(toolItem.toolName);
    return {
      kind: fallbackKind,
      status: toolItem.status === 'error' ? 'error' : 'polling',
      taskIds: [],
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      items: [],
      assets: [],
      errorMessage: toolItem.toolResult?.error,
    };
  }

  const fallbackKind = fallbackKindForTool(toolItem.toolName);
  const batch = asRecord(result.batch);
  const kind = normalizeKind(batch?.kind ?? result.kind, fallbackKind);
  const status = normalizeStatus(batch?.status ?? result.status);
  const requestedAspectRatio =
    typeof batch?.requested_aspect_ratio === 'string' && batch.requested_aspect_ratio.trim()
      ? batch.requested_aspect_ratio.trim()
      : typeof result.requested_aspect_ratio === 'string' && result.requested_aspect_ratio.trim()
        ? result.requested_aspect_ratio.trim()
        : undefined;
  const placeholderAspectRatio =
    typeof batch?.placeholder_aspect_ratio === 'string' && batch.placeholder_aspect_ratio.trim()
      ? batch.placeholder_aspect_ratio.trim()
      : typeof result.placeholder_aspect_ratio === 'string' && result.placeholder_aspect_ratio.trim()
        ? result.placeholder_aspect_ratio.trim()
        : undefined;
  const taskIds = asStringArray(result.task_ids);
  const taskIdsFromTasks = collectTaskIdsFromTasks(result.tasks);
  const allTaskIds = taskIds.length > 0 ? taskIds : taskIdsFromTasks;
  const completedCount = countNumber(batch?.completed_count) ?? (status === 'polling' ? 0 : undefined);
  const failedCount = countNumber(batch?.failed_count) ?? 0;
  const totalCount = countNumber(batch?.total_count) ?? allTaskIds.length;
  const pendingCount = countNumber(batch?.pending_count) ?? Math.max(totalCount - (completedCount ?? 0) - failedCount, 0);
  const error = asRecord(result.error);
  const batchItems = collectItems(batch, kind);
  const explicitAssets = collectAssets(batch, kind);
  const genericUrls = explicitAssets.length > 0 || batchItems.length > 0 ? [] : collectHttpUrls(result);
  const genericPath = typeof result.path === 'string' ? result.path : undefined;
  const fallbackItems: MediaItemViewModel[] = batchItems.length > 0
    ? batchItems
    : explicitAssets.length > 0
      ? explicitAssets.map((asset, index) => ({
          itemIndex: asset.itemIndex ?? index + 1,
          kind: asset.kind,
          status: 'completed' as const,
          taskId: asset.taskId,
          resultUrl: asset.url,
          localPath: asset.localPath,
          saveStatus: asset.saveStatus,
          saveError: asset.saveError,
        }))
      : genericUrls.length > 0
        ? genericUrls.map((url, index) => ({
            itemIndex: index + 1,
            kind,
            status: 'completed' as const,
            resultUrl: url,
          }))
        : genericPath
          ? [{
              itemIndex: 1,
              kind,
              status: 'completed' as const,
              resultPath: genericPath,
            }]
          : [];
  const assets = explicitAssets.length > 0
    ? explicitAssets
    : fallbackItems
        .filter(item => typeof item.resultUrl === 'string' && /^https?:\/\//.test(item.resultUrl))
        .map(item => ({
          itemIndex: item.itemIndex,
          kind: item.kind,
          taskId: item.taskId,
          url: item.resultUrl as string,
          localPath: item.localPath,
          previewUrl: localAssetPreviewUrl(item.localPath),
          saveStatus: item.saveStatus,
          saveError: item.saveError,
        }));

  return {
    batchId: typeof batch?.batch_id === 'string'
      ? batch.batch_id
      : typeof result.batch_id === 'string'
        ? result.batch_id
        : undefined,
    kind,
    status,
    source: typeof result.source === 'string' ? result.source : undefined,
    requestedAspectRatio,
    placeholderAspectRatio,
    taskIds: allTaskIds,
    totalCount,
    completedCount: completedCount ?? totalCount,
    failedCount,
    pendingCount,
    pollIntervalSeconds: countNumber(result.poll_interval_seconds),
    items: fallbackItems,
    assets,
    errorMessage: typeof error?.message === 'string' ? error.message : toolItem.toolResult?.error,
  };
}
