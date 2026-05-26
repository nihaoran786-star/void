import { describe, expect, it } from 'vitest';

import type { ImageContext } from '@/shared/types/context';
import { buildImageContextsForBackend } from './imageContextForBackend';

describe('buildImageContextsForBackend', () => {
  it('keeps data URLs for uploaded chat images so media tools can use them', () => {
    const image: ImageContext = {
      id: 'img-1',
      type: 'image',
      imagePath: '',
      imageName: 'thor-reference.png',
      fileSize: 1234,
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,abc123',
      source: 'file',
      isLocal: false,
    };

    const result = buildImageContextsForBackend([image]);

    expect(result.imageContexts).toEqual([
      {
        id: 'img-1',
        image_path: undefined,
        data_url: 'data:image/png;base64,abc123',
        mime_type: 'image/png',
        metadata: {
          name: 'thor-reference.png',
          width: undefined,
          height: undefined,
          file_size: 1234,
          source: 'file',
        },
      },
    ]);
  });
});
