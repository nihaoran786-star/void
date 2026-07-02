import { useEffect, useRef } from 'react';
import { FlowChatStore } from '../store/FlowChatStore';
import type { FlowToolItem } from '../types/flow-chat';
import { recordWorkspaceMediaRefresh } from '@/shared/services/workspace-media/WorkspaceMediaEvents';
import type { MediaToolViewModel } from './mediaResult';

const WORKSPACE_MEDIA_TOOL_NAMES = new Set(['GenerateImage', 'GenerateVideo']);

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function recordFrom(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function shortDramaMetadataFromToolInput(input: Record<string, unknown>): Record<string, unknown> | undefined {
  return recordFrom(input.shortDrama) ?? recordFrom(input.short_drama);
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  return record ? stringFrom(record[key]) : undefined;
}

function mediaLifecycleStatus(status: string | undefined, pendingCount: number): 'polling' | 'completed' | 'failed' {
  if (status === 'failed' || status === 'timeout' || status === 'error') {
    return 'failed';
  }
  if (status === 'polling' || pendingCount > 0) {
    return 'polling';
  }
  return 'completed';
}

function normalizeAspectRatio(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  const dimensions = trimmed.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!dimensions) {
    return fallback;
  }
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  if (width <= 0 || height <= 0) {
    return fallback;
  }
  let left = width;
  let right = height;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  const divisor = left || 1;
  return `${width / divisor}:${height / divisor}`;
}

function placeholderAspectRatio(value: string): string {
  const [width, height] = value.split(':');
  return width && height ? `${width} / ${height}` : value;
}

export function useWorkspaceMediaToolRefreshBridge(
  toolItem: FlowToolItem,
  model: MediaToolViewModel | null,
  sessionId?: string
): void {
  const lastWorkspaceRefreshKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!model || !WORKSPACE_MEDIA_TOOL_NAMES.has(toolItem.toolName)) {
      return;
    }

    const toolInput = toolItem.toolCall?.input || {};
    const shortDrama = shortDramaMetadataFromToolInput(toolInput);
    const workspacePath = sessionId
      ? FlowChatStore.getInstance().getState().sessions.get(sessionId)?.workspacePath
      : undefined;
    const kind = toolItem.toolName === 'GenerateVideo' ? 'video' : 'image';
    const lifecycleStatus = mediaLifecycleStatus(model.status, model.pendingCount);
    const requestedAspectRatio = normalizeAspectRatio(
      model.requestedAspectRatio || stringFrom(toolInput.aspect_ratio) || stringFrom(toolInput.size),
      kind === 'video' ? '16:9' : '1:1'
    );
    const resolvedPlaceholderAspectRatio = model.placeholderAspectRatio || placeholderAspectRatio(requestedAspectRatio);
    const refreshKey = JSON.stringify([
      toolItem.id,
      model.batchId,
      lifecycleStatus,
      model.completedCount,
      model.pendingCount,
      model.totalCount,
      requestedAspectRatio,
      resolvedPlaceholderAspectRatio,
      workspacePath,
    ]);
    if (lastWorkspaceRefreshKeyRef.current === refreshKey) {
      return;
    }
    lastWorkspaceRefreshKeyRef.current = refreshKey;

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus,
      workspacePath,
      toolId: toolItem.id,
      toolName: toolItem.toolName,
      kind,
      batchId: model.batchId,
      prompt: stringFrom(toolInput.prompt) || model.items.find(item => item.prompt)?.prompt,
      model: stringFrom(toolInput.model) || model.items.find(item => item.model)?.model,
      requestedCount: numberFrom(toolInput.n) || model.totalCount || model.pendingCount || model.taskIds.length || 1,
      requestedAspectRatio,
      placeholderAspectRatio: resolvedPlaceholderAspectRatio,
      status: model.status,
      error: model.errorMessage,
      targetStage: stringField(shortDrama, 'stage') ?? stringField(shortDrama, 'targetStage'),
      episodeId: stringField(shortDrama, 'episodeId') ?? stringField(shortDrama, 'activeEpisodeId'),
      artifactId: stringField(shortDrama, 'artifactId') ?? stringField(shortDrama, 'activeArtifactId'),
      artifactHandle: stringField(shortDrama, 'artifactHandle') ?? stringField(shortDrama, 'activeArtifactHandle'),
      mediaItemId: stringField(shortDrama, 'outputMediaItemId') ?? stringField(shortDrama, 'mediaItemId'),
    });
  }, [model, sessionId, toolItem.id, toolItem.toolCall?.input, toolItem.toolName]);
}
