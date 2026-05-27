import type { FlowItem, FlowToolItem } from '../types/flow-chat';
import {
  getMediaToolViewModel,
  type MediaAssetViewModel,
  type MediaItemViewModel,
  type MediaToolKind,
  type MediaToolStatus,
} from './mediaResult';

const GROUPABLE_MEDIA_TOOLS = new Set([
  'GenerateImage',
  'GenerateVideo',
  'GenerateSpeech',
  'TranscribeAudio',
  'UploadMediaImage',
]);

const MEDIA_GROUP_RESULT_SOURCE = 'media-tool-group';

export interface MediaToolGroup {
  id: string;
  kind: MediaToolKind;
  toolName: string;
  items: FlowToolItem[];
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  assets: MediaAssetViewModel[];
  status: MediaToolStatus;
  syntheticToolItem: FlowToolItem;
}

export type MediaRenderableItem =
  | FlowItem
  | {
      type: 'media-tool-group';
      id: string;
      group: MediaToolGroup;
    };

export type MediaGroupedModelRoundItemGroup =
  | { type: 'explore'; items: MediaRenderableItem[]; isLast: boolean }
  | { type: 'critical'; item: MediaRenderableItem };

type MediaGroupingInputModelRoundItemGroup =
  | { type: 'explore'; items: FlowItem[]; isLast: boolean }
  | { type: 'critical'; item: FlowItem };

function isFlowToolItem(item: FlowItem): item is FlowToolItem {
  return item.type === 'tool';
}

export function isGroupableMediaToolItem(item: FlowItem): item is FlowToolItem {
  return isFlowToolItem(item) && GROUPABLE_MEDIA_TOOLS.has(item.toolName);
}

function groupingKindForTool(toolName: string): MediaToolKind {
  if (toolName === 'GenerateVideo') return 'video';
  if (toolName === 'GenerateSpeech' || toolName === 'TranscribeAudio') return 'audio';
  if (toolName === 'UploadMediaImage') return 'upload';
  return 'image';
}

function mediaGroupKey(item: FlowToolItem): string {
  return `${item.toolName}:${groupingKindForTool(item.toolName)}`;
}

function normalizeItemTotal(toolItem: FlowToolItem): number {
  const model = getMediaToolViewModel(toolItem);
  if (!model) return 1;
  return Math.max(model.totalCount || model.taskIds.length || model.items.length || model.assets.length || 1, 1);
}

function aggregateStatus(
  totalCount: number,
  completedCount: number,
  failedCount: number,
  hasPolling: boolean,
  hasTimeout: boolean,
  hasError: boolean,
): MediaToolStatus {
  if (hasError) return completedCount > 0 ? 'partial' : 'error';
  if (hasTimeout) return completedCount > 0 ? 'partial' : 'timeout';
  if (failedCount > 0) return completedCount > 0 ? 'partial' : 'failed';
  if (hasPolling || completedCount < totalCount) return 'polling';
  return 'completed';
}

function syntheticFlowStatus(status: MediaToolStatus): FlowToolItem['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'timeout' || status === 'error') return 'error';
  return 'running';
}

export function createMediaToolGroup(items: FlowToolItem[]): MediaToolGroup {
  if (items.length === 0) {
    throw new Error('Cannot create an empty media tool group');
  }

  const firstItem = items[0];
  const kind = groupingKindForTool(firstItem.toolName);
  const taskIds: string[] = [];
  const assets: MediaAssetViewModel[] = [];
  const mediaItems: MediaItemViewModel[] = [];
  let totalCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let hasPolling = false;
  let hasTimeout = false;
  let hasError = false;

  items.forEach((item) => {
    const model = getMediaToolViewModel(item);
    const itemTotal = model ? Math.max(model.totalCount || model.taskIds.length || model.items.length || model.assets.length || 1, 1) : normalizeItemTotal(item);
    totalCount += itemTotal;

    if (!model) {
      hasPolling = hasPolling || item.status !== 'completed';
      completedCount += item.status === 'completed' ? 1 : 0;
      failedCount += item.status === 'error' ? 1 : 0;
      return;
    }

    taskIds.push(...model.taskIds);
    completedCount += Math.min(model.completedCount, itemTotal);
    failedCount += model.failedCount;
    hasPolling = hasPolling || model.status === 'polling' || model.pendingCount > 0;
    hasTimeout = hasTimeout || model.status === 'timeout';
    hasError = hasError || model.status === 'error';

    model.items.forEach(mediaItem => {
      mediaItems.push({
        ...mediaItem,
        itemIndex: mediaItems.length + 1,
      });
    });

    model.assets.forEach(asset => {
      assets.push({
        ...asset,
        itemIndex: assets.length + 1,
      });
    });
  });

  const pendingCount = Math.max(totalCount - completedCount - failedCount, 0);
  const status = aggregateStatus(totalCount, completedCount, failedCount, hasPolling, hasTimeout, hasError);
  const id = `media-group-${firstItem.toolName}-${items.map(item => item.id).join('-')}`;
  const latestItem = items[items.length - 1];
  const syntheticToolItem: FlowToolItem = {
    ...latestItem,
    id,
    toolName: firstItem.toolName,
    timestamp: firstItem.timestamp,
    status: syntheticFlowStatus(status),
    toolCall: {
      ...firstItem.toolCall,
      id,
      input: {
        ...(typeof firstItem.toolCall?.input === 'object' && firstItem.toolCall.input !== null ? firstItem.toolCall.input : {}),
        grouped_tool_call_ids: items.map(item => item.toolCall?.id ?? item.id),
      },
    },
    toolResult: {
      success: status !== 'failed' && status !== 'timeout' && status !== 'error',
      result: {
        source: MEDIA_GROUP_RESULT_SOURCE,
        status,
        kind,
        task_ids: taskIds,
        batch: {
          batch_id: id,
          kind,
          status,
          total_count: totalCount,
          completed_count: completedCount,
          failed_count: failedCount,
          pending_count: pendingCount,
          items: mediaItems.map(item => ({
            item_index: item.itemIndex,
            kind: item.kind,
            status: item.status,
            prompt: item.prompt,
            model: item.model,
            task_id: item.taskId,
            result_url: item.resultUrl,
            result_path: item.resultPath,
            local_path: item.localPath,
            save_status: item.saveStatus,
            save_error: item.saveError,
            error: item.errorMessage ? { message: item.errorMessage } : undefined,
          })),
          assets: assets.map(asset => ({
            kind: asset.kind,
            url: asset.url,
            local_path: asset.localPath,
            save_status: asset.saveStatus,
            save_error: asset.saveError,
            item_index: asset.itemIndex,
            task_id: asset.taskId,
          })),
        },
      },
      error: status === 'failed' || status === 'timeout' || status === 'error'
        ? items.find(item => item.toolResult?.error)?.toolResult?.error
        : undefined,
    },
  };

  return {
    id,
    kind,
    toolName: firstItem.toolName,
    items,
    totalCount,
    completedCount,
    failedCount,
    pendingCount,
    assets,
    status,
    syntheticToolItem,
  };
}

export function groupMediaToolItems(items: FlowItem[]): MediaRenderableItem[] {
  type PendingMediaGroup = {
    key: string;
    items: FlowToolItem[];
    placeholderIndex: number;
  };
  type PlaceholderItem = { type: 'media-tool-group-placeholder'; key: string };
  const groupedItems: Array<MediaRenderableItem | PlaceholderItem> = [];
  const pendingGroups = new Map<string, PendingMediaGroup>();

  const flushPendingGroups = () => {
    for (const pendingGroup of pendingGroups.values()) {
      groupedItems[pendingGroup.placeholderIndex] = createMediaRenderableGroup(pendingGroup.items);
    }
    pendingGroups.clear();
  };

  const appendMediaTool = (item: FlowToolItem) => {
    const key = mediaGroupKey(item);
    const pendingGroup = pendingGroups.get(key);
    if (pendingGroup) {
      pendingGroup.items.push(item);
      return;
    }

    pendingGroups.set(key, {
      key,
      items: [item],
      placeholderIndex: groupedItems.length,
    });
    groupedItems.push({ type: 'media-tool-group-placeholder', key });
  };

  for (const item of items) {
    if (isGroupableMediaToolItem(item)) {
      appendMediaTool(item);
      continue;
    }

    groupedItems.push(item);
  }

  flushPendingGroups();
  return groupedItems.filter((item): item is MediaRenderableItem => item.type !== 'media-tool-group-placeholder');
}

function createMediaRenderableGroup(items: FlowToolItem[]): MediaRenderableItem {
  if (items.length === 1) {
    return items[0];
  }

  const group = createMediaToolGroup(items);
  return {
    type: 'media-tool-group',
    id: group.id,
    group,
  };
}

export function groupMediaToolsInModelRoundGroups(
  groups: MediaGroupingInputModelRoundItemGroup[],
): MediaGroupedModelRoundItemGroup[] {
  const result: MediaGroupedModelRoundItemGroup[] = [];
  let criticalBuffer: FlowItem[] = [];

  const flushCriticalBuffer = () => {
    if (criticalBuffer.length === 0) return;
    for (const item of groupMediaToolItems(criticalBuffer)) {
      result.push({ type: 'critical', item });
    }
    criticalBuffer = [];
  };

  for (const group of groups) {
    if (group.type === 'explore') {
      flushCriticalBuffer();
      result.push({
        type: 'explore',
        items: groupMediaToolItems(group.items),
        isLast: group.isLast,
      });
      continue;
    }

    const item = group.item;
    criticalBuffer.push(item);
  }

  flushCriticalBuffer();
  return result;
}

export function isMediaToolGroupRenderableItem(item: MediaRenderableItem): item is Extract<MediaRenderableItem, { type: 'media-tool-group' }> {
  return item.type === 'media-tool-group';
}
