import { afterEach, describe, expect, it, vi } from 'vitest';
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

function toolNamedWithResult(toolName: string, result: unknown): FlowToolItem {
  return {
    ...toolWithResult(result),
    toolName,
  };
}

describe('getMediaToolViewModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
        batch_id: 'media-batch-completed',
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
    expect(model?.batchId).toBeDefined();
    expect(model?.assets.map(asset => asset.url)).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ]);
  });

  it('exposes local generated asset paths and local-first preview URLs', () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {
        convertFileSrc: vi.fn((path: string, protocol = 'asset') => `${protocol}://local/${encodeURIComponent(path)}`),
      },
    });

    const model = getMediaToolViewModel(toolWithResult({
      status: 'completed',
      source: 'apimart',
      kind: 'image',
      batch: {
        batch_id: 'media-batch-completed',
        kind: 'image',
        total_count: 1,
        completed_count: 1,
        failed_count: 0,
        assets: [
          {
            task_id: 'task-a',
            kind: 'image',
            url: 'https://cdn.example/a.png',
            local_path: 'C:/repo/.void/media/generated/media-batch-completed/image-001.png',
            save_status: 'saved',
          },
        ],
      },
    }));

    expect(model?.assets[0]).toMatchObject({
      url: 'https://cdn.example/a.png',
      localPath: 'C:/repo/.void/media/generated/media-batch-completed/image-001.png',
      saveStatus: 'saved',
      previewUrl: 'asset://local/C%3A%2Frepo%2F.void%2Fmedia%2Fgenerated%2Fmedia-batch-completed%2Fimage-001.png',
    });
  });

  it('keeps stable item numbers from batch-shaped media results', () => {
    const model = getMediaToolViewModel(toolWithResult({
      status: 'partial',
      source: 'apimart',
      kind: 'image',
      batch: {
        batch_id: 'media-batch-1',
        kind: 'image',
        status: 'partial',
        total_count: 2,
        completed_count: 1,
        failed_count: 1,
        items: [
          {
            item_index: 1,
            kind: 'image',
            prompt: 'first frame',
            model: 'gpt-image-2',
            task_id: 'task-z',
            status: 'completed',
            result_url: 'https://cdn.example/z.png',
          },
          {
            item_index: 2,
            kind: 'image',
            prompt: 'second frame',
            model: 'gpt-image-2',
            task_id: 'task-a',
            status: 'failed',
            error: { code: 'provider_error', message: 'blocked' },
          },
        ],
      },
    }));

    expect(model?.batchId).toBe('media-batch-1');
    expect(model?.items.map(item => item.itemIndex)).toEqual([1, 2]);
    expect(model?.items[0].resultUrl).toBe('https://cdn.example/z.png');
    expect(model?.items[1].errorMessage).toBe('blocked');
    expect(model?.assets[0].itemIndex).toBe(1);
  });

  it('summarizes upload media results without APIMart-specific UI parsing', () => {
    const model = getMediaToolViewModel(toolNamedWithResult('UploadMediaImage', {
      status: 'completed',
      source: 'apimart',
      kind: 'upload_image',
      response: {
        data: {
          url: 'https://cdn.example/upload.png',
        },
      },
    }));

    expect(model?.kind).toBe('upload');
    expect(model?.status).toBe('completed');
    expect(model?.assets[0].url).toBe('https://cdn.example/upload.png');
    expect(model?.items[0].itemIndex).toBe(1);
  });

  it('summarizes generated speech output paths', () => {
    const model = getMediaToolViewModel(toolNamedWithResult('GenerateSpeech', {
      status: 'completed',
      source: 'apimart',
      kind: 'speech',
      path: 'C:/repo/media-speech.wav',
      bytes: 1024,
    }));

    expect(model?.kind).toBe('audio');
    expect(model?.items[0].resultPath).toBe('C:/repo/media-speech.wav');
  });
});
