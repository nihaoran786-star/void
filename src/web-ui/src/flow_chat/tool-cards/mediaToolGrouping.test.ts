import { describe, expect, it } from 'vitest';
import type { FlowTextItem, FlowToolItem } from '../types/flow-chat';
import {
  createMediaToolGroup,
  groupMediaToolItems,
  groupMediaToolsInModelRoundGroups,
  isMediaToolGroupRenderableItem,
} from './mediaToolGrouping';
import type { ModelRoundItemGroup } from '../components/modern/modelRoundItemGrouping';

function makeTextItem(id: string): FlowTextItem {
  return {
    id,
    type: 'text',
    content: 'assistant text',
    isStreaming: false,
    timestamp: 1000,
    status: 'completed',
  };
}

function makeToolItem(
  id: string,
  toolName: string,
  status: FlowToolItem['status'] = 'running',
  result?: FlowToolItem['toolResult'],
): FlowToolItem {
  return {
    id,
    type: 'tool',
    toolName,
    timestamp: 1001,
    status,
    toolCall: {
      id: `call-${id}`,
      input: { prompt: 'generate media' },
    },
    ...(result ? { toolResult: result } : {}),
  };
}

function makeCompletedMediaResult(kind: 'image' | 'video', index: number): FlowToolItem['toolResult'] {
  const extension = kind === 'video' ? 'mp4' : 'png';
  return {
    success: true,
    result: {
      status: 'completed',
      kind,
      batch: {
        batch_id: `batch-${kind}-${index}`,
        kind,
        status: 'completed',
        total_count: 1,
        completed_count: 1,
        failed_count: 0,
        pending_count: 0,
        assets: [
          {
            kind,
            url: `https://cdn.example.com/${kind}-${index}.${extension}`,
            item_index: 1,
            task_id: `task-${kind}-${index}`,
          },
        ],
      },
    },
  };
}

describe('mediaToolGrouping', () => {
  it('groups five image tools into one render item', () => {
    const items = Array.from({ length: 5 }, (_, index) => (
      makeToolItem(`image-${index + 1}`, 'GenerateImage')
    ));

    const grouped = groupMediaToolItems(items);

    expect(grouped).toHaveLength(1);
    expect(isMediaToolGroupRenderableItem(grouped[0])).toBe(true);
    if (!isMediaToolGroupRenderableItem(grouped[0])) return;
    expect(grouped[0].group.toolName).toBe('GenerateImage');
    expect(grouped[0].group.totalCount).toBe(5);
    expect(grouped[0].group.completedCount).toBe(0);
    expect(grouped[0].group.pendingCount).toBe(5);
    expect(grouped[0].group.syntheticToolItem.toolResult?.result).toMatchObject({
      status: 'polling',
      batch: {
        total_count: 5,
        completed_count: 0,
        pending_count: 5,
      },
    });
  });

  it('keeps image and video tools in separate groups', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, index) => makeToolItem(`image-${index + 1}`, 'GenerateImage')),
      ...Array.from({ length: 5 }, (_, index) => makeToolItem(`video-${index + 1}`, 'GenerateVideo')),
    ];

    const grouped = groupMediaToolItems(items);

    expect(grouped).toHaveLength(2);
    expect(grouped.every(isMediaToolGroupRenderableItem)).toBe(true);
    expect(isMediaToolGroupRenderableItem(grouped[0]) && grouped[0].group.toolName).toBe('GenerateImage');
    expect(isMediaToolGroupRenderableItem(grouped[1]) && grouped[1].group.toolName).toBe('GenerateVideo');
  });

  it('groups media tools across non-media boundaries in the same round', () => {
    const firstImage = makeToolItem('image-1', 'GenerateImage');
    const readTool = makeToolItem('read-1', 'Read', 'completed', { success: true, result: 'file contents' });
    const secondImage = makeToolItem('image-2', 'GenerateImage');

    const grouped = groupMediaToolItems([firstImage, readTool, secondImage]);

    expect(grouped).toHaveLength(2);
    expect(isMediaToolGroupRenderableItem(grouped[0])).toBe(true);
    if (!isMediaToolGroupRenderableItem(grouped[0])) return;
    expect(grouped[0].group.totalCount).toBe(2);
    expect(grouped[1]).toBe(readTool);
  });

  it('aggregates completed assets with stable display indexes', () => {
    const group = createMediaToolGroup([
      makeToolItem('image-1', 'GenerateImage', 'completed', makeCompletedMediaResult('image', 1)),
      makeToolItem('image-2', 'GenerateImage', 'completed', makeCompletedMediaResult('image', 2)),
    ]);

    expect(group.status).toBe('completed');
    expect(group.totalCount).toBe(2);
    expect(group.completedCount).toBe(2);
    expect(group.assets.map(asset => asset.itemIndex)).toEqual([1, 2]);
    expect(group.syntheticToolItem.toolResult?.result).toMatchObject({
      status: 'completed',
      batch: {
        total_count: 2,
        completed_count: 2,
        assets: [
          { item_index: 1, url: 'https://cdn.example.com/image-1.png' },
          { item_index: 2, url: 'https://cdn.example.com/image-2.png' },
        ],
      },
    });
  });

  it('aggregates partially completed media groups', () => {
    const group = createMediaToolGroup([
      makeToolItem('image-1', 'GenerateImage', 'completed', makeCompletedMediaResult('image', 1)),
      makeToolItem('image-2', 'GenerateImage'),
      makeToolItem('image-3', 'GenerateImage'),
    ]);

    expect(group.status).toBe('polling');
    expect(group.totalCount).toBe(3);
    expect(group.completedCount).toBe(1);
    expect(group.pendingCount).toBe(2);
    expect(group.syntheticToolItem.toolResult?.result).toMatchObject({
      status: 'polling',
      batch: {
        total_count: 3,
        completed_count: 1,
        pending_count: 2,
      },
    });
  });

  it('groups adjacent critical media tools after model round grouping', () => {
    const groups: ModelRoundItemGroup[] = [
      { type: 'critical', item: makeToolItem('image-1', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-2', 'GenerateImage') },
      { type: 'critical', item: makeTextItem('text-1') },
    ];

    const mediaGrouped = groupMediaToolsInModelRoundGroups(groups);

    expect(mediaGrouped).toHaveLength(2);
    expect(mediaGrouped[0].type).toBe('critical');
    expect(mediaGrouped[0].type === 'critical' && isMediaToolGroupRenderableItem(mediaGrouped[0].item)).toBe(true);
    expect(mediaGrouped[1]).toEqual({ type: 'critical', item: groups[2].item });
  });

  it('groups same-kind critical media tools across assistant text', () => {
    const groups: ModelRoundItemGroup[] = [
      { type: 'critical', item: makeToolItem('image-1', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-2', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-3', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-4', 'GenerateImage') },
      { type: 'critical', item: makeTextItem('text-1') },
      { type: 'critical', item: makeToolItem('image-5', 'GenerateImage') },
    ];

    const mediaGrouped = groupMediaToolsInModelRoundGroups(groups);

    expect(mediaGrouped).toHaveLength(2);
    expect(mediaGrouped[0].type).toBe('critical');
    if (mediaGrouped[0].type !== 'critical' || !isMediaToolGroupRenderableItem(mediaGrouped[0].item)) {
      throw new Error('Expected first item to be a media tool group');
    }
    expect(mediaGrouped[0].item.group.totalCount).toBe(5);
    expect(mediaGrouped[1]).toEqual({ type: 'critical', item: groups[4].item });
  });

  it('groups same-kind critical media tools across non-media tools in one model round', () => {
    const readTool = makeToolItem('read-1', 'Read', 'completed', { success: true, result: 'file contents' });
    const groups: ModelRoundItemGroup[] = [
      { type: 'critical', item: makeToolItem('image-1', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-2', 'GenerateImage') },
      { type: 'critical', item: readTool },
      { type: 'critical', item: makeToolItem('image-3', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-4', 'GenerateImage') },
      { type: 'critical', item: makeToolItem('image-5', 'GenerateImage') },
    ];

    const mediaGrouped = groupMediaToolsInModelRoundGroups(groups);

    expect(mediaGrouped).toHaveLength(2);
    expect(mediaGrouped[0].type).toBe('critical');
    if (mediaGrouped[0].type !== 'critical' || !isMediaToolGroupRenderableItem(mediaGrouped[0].item)) {
      throw new Error('Expected first item to be a media tool group');
    }
    expect(mediaGrouped[0].item.group.totalCount).toBe(5);
    expect(mediaGrouped[1]).toEqual({ type: 'critical', item: readTool });
  });
});
