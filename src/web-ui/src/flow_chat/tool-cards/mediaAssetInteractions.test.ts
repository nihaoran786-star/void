import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMediaReferencePromptText,
  createMediaReferenceContext,
  dispatchMediaReference,
  openMediaPreview,
} from './mediaAssetInteractions';
import type { MediaAssetViewModel } from './mediaResult';

describe('mediaAssetInteractions', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const imageAsset: MediaAssetViewModel = {
    kind: 'image',
    url: 'https://cdn.example.com/image-1.png',
    itemIndex: 1,
    taskId: 'task-1',
  };

  it('creates URL-backed image contexts for generated image references', () => {
    const context = createMediaReferenceContext(imageAsset);

    expect(context).toMatchObject({
      type: 'image',
      imagePath: 'https://cdn.example.com/image-1.png',
      source: 'url',
      isLocal: false,
      thumbnailUrl: 'https://cdn.example.com/image-1.png',
      metadata: {
        mediaReference: true,
        itemIndex: 1,
        taskId: 'task-1',
      },
    });
  });

  it('uses text references for video assets instead of fake image contexts', () => {
    const videoAsset: MediaAssetViewModel = {
      kind: 'video',
      url: 'https://cdn.example.com/video-1.mp4',
      itemIndex: 2,
    };

    expect(createMediaReferenceContext(videoAsset)).toBeUndefined();
    expect(buildMediaReferencePromptText(videoAsset)).toBe('参考视频 #2: https://cdn.example.com/video-1.mp4');
  });

  it('dispatches right-panel browser preview events', () => {
    vi.useFakeTimers();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    openMediaPreview(imageAsset);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expand-right-panel',
    }));

    vi.advanceTimersByTime(300);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent-create-tab',
      detail: expect.objectContaining({
        type: 'browser',
        data: { url: 'https://cdn.example.com/image-1.png' },
        duplicateCheckKey: 'preview:global:https://cdn.example.com/image-1.png',
      }),
    }));
  });

  it('dispatches media reference events with optional context', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    dispatchMediaReference(imageAsset);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-reference-selected',
      detail: expect.objectContaining({
        context: expect.objectContaining({
          imagePath: 'https://cdn.example.com/image-1.png',
        }),
        promptText: '以参考图 #1为基础继续生成。',
      }),
    }));
  });
});
