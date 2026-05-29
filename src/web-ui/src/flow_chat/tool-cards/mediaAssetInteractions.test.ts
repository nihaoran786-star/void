import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMediaReferencePromptText,
  createMediaReferenceContext,
  dispatchMediaReference,
  getMediaReferencePromptText,
  openMediaPreview,
} from './mediaAssetInteractions';
import { MEDIA_PREVIEW_EVENT } from '@/shared/services/preview/MediaPreviewService';
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

  it('does not create image contexts or prompt text for video assets', () => {
    const videoAsset: MediaAssetViewModel = {
      kind: 'video',
      url: 'https://cdn.example.com/video-1.mp4',
      itemIndex: 2,
    };

    expect(createMediaReferenceContext(videoAsset)).toBeUndefined();
    expect(buildMediaReferencePromptText(videoAsset)).toBe('');
  });

  it('dispatches lightweight media preview events instead of browser preview tabs', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    openMediaPreview(imageAsset);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: MEDIA_PREVIEW_EVENT,
      detail: expect.objectContaining({
        kind: 'image',
        url: 'https://cdn.example.com/image-1.png',
        title: 'Image #1',
      }),
    }));
  });

  it('prefers local paths for generated image references when available', () => {
    const context = createMediaReferenceContext({
      ...imageAsset,
      localPath: 'C:/repo/media/generated/batch/image-001.png',
      previewUrl: 'asset://localhost/C%3A%2Frepo%2Fmedia%2Fgenerated%2Fbatch%2Fimage-001.png',
    });

    expect(context).toMatchObject({
      imagePath: 'C:/repo/media/generated/batch/image-001.png',
      source: 'file',
      isLocal: true,
      thumbnailUrl: 'https://cdn.example.com/image-1.png',
    });
  });

  it('creates stable reference ids so duplicate generated assets do not create duplicate chips', () => {
    const asset = {
      ...imageAsset,
      localPath: 'C:/repo/media/generated/batch/image-001.png',
    };

    const first = createMediaReferenceContext(asset);
    const second = createMediaReferenceContext({ ...asset, taskId: 'task-2' });

    expect(first?.id).toBe(second?.id);
  });

  it('dispatches media reference events without auto-inserting prompt text', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    dispatchMediaReference(imageAsset);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-reference-selected',
      detail: expect.objectContaining({
        context: expect.objectContaining({
          imagePath: 'https://cdn.example.com/image-1.png',
        }),
        promptText: '',
      }),
    }));
  });

  it('drops legacy prompt text for media reference contexts', () => {
    const context = createMediaReferenceContext(imageAsset);

    expect(getMediaReferencePromptText({
      asset: imageAsset,
      context,
      promptText: '以参考图 #1为基础继续生成。',
    })).toBe('');
  });
});
