import type { ImageContext } from '@/shared/types/context';
import type { ImageContextData as BackendImageContext } from '@/infrastructure/api/service-api/ImageContextTypes';

export interface BackendImageContextPayload {
  imageContexts: BackendImageContext[];
  imageDisplayData: Array<{
    id: string;
    name: string;
    dataUrl?: string;
    imagePath?: string;
    mimeType?: string;
  }>;
}

export function buildImageContextsForBackend(
  imageContexts: ImageContext[],
): BackendImageContextPayload {
  return {
    imageContexts: imageContexts.map(ctx => ({
      id: ctx.id,
      image_path: ctx.isLocal || ctx.source === 'url' ? ctx.imagePath : undefined,
      data_url: !ctx.isLocal && ctx.source !== 'url' ? ctx.dataUrl : undefined,
      mime_type: ctx.mimeType,
      metadata: {
        name: ctx.imageName,
        width: ctx.width,
        height: ctx.height,
        file_size: ctx.fileSize,
        source: ctx.source,
      },
    })),
    imageDisplayData: imageContexts.map(ctx => ({
      id: ctx.id,
      name: ctx.imageName || 'Image',
      dataUrl: ctx.dataUrl,
      imagePath: ctx.isLocal || ctx.source === 'url' ? ctx.imagePath : undefined,
      mimeType: ctx.mimeType,
    })),
  };
}
