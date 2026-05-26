import { describe, expect, it } from 'vitest';
import { getMediaToolViewModel } from './mediaResult';
import type { FlowToolItem } from '../types/flow-chat';

function toolWithResult(result: unknown): FlowToolItem {
  return {
    id: 'tool-media-1',
    type: 'tool',
    toolName: 'GenerateImage',
    timestamp: 1000,
    status: 'completed',
    toolCall: {
      id: 'tool-media-1',
      input: { prompt: 'test prompt', model: 'gpt-image-2' },
    },
    toolResult: {
      result,
      success: true,
    },
  };
}

describe('getMediaToolViewModel', () => {
  it('tracks polling image batches from submitted tool results', () => {
    const model = getMediaToolViewModel(toolWithResult({
      status: 'polling',
      source: 'apimart',
      kind: 'image',
      task_ids: ['task-a', 'task-b'],
      poll_interval_seconds: 5,
    }));

    expect(model?.status).toBe('polling');
    expect(model?.kind).toBe('image');
    expect(model?.completedCount).toBe(0);
    expect(model?.totalCount).toBe(2);
    expect(model?.taskIds).toEqual(['task-a', 'task-b']);
  });

  it('extracts completed batch assets from late backend completion events', () => {
    const model = getMediaToolViewModel(toolWithResult({
      status: 'completed',
      source: 'apimart',
      kind: 'image',
      batch: {
        kind: 'image',
        total_count: 2,
        completed_count: 2,
        failed_count: 0,
        assets: [
          { task_id: 'task-a', kind: 'image', url: 'https://cdn.example/a.png' },
          { task_id: 'task-b', kind: 'image', url: 'https://cdn.example/b.png' },
        ],
      },
    }));

    expect(model?.status).toBe('completed');
    expect(model?.assets.map(asset => asset.url)).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ]);
  });
});
