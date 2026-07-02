import type { ContextItem, ImageContext, MediaReferenceContext } from '@/shared/types/context';

export const MEDIA_REFERENCE_EVENT = 'void-media-reference-selected';

export interface MediaReferenceSource {
  id: string;
  kind: 'image' | 'video' | 'audio';
  filePath: string;
  displayName: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  source?: 'generated' | 'input';
  stableSlotId?: string;
  extension?: string;
}

export interface MediaReferenceEventDetail {
  source: MediaReferenceSource;
  context?: ContextItem;
  promptText: string;
}

function stableIdFromPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i += 1) {
    hash = ((hash << 5) - hash) + path.charCodeAt(i);
    hash |= 0;
  }
  return `media-ref-${Math.abs(hash).toString(36)}`;
}

function mimeTypeForMedia(source: MediaReferenceSource): string {
  const extension = source.extension?.toLowerCase();
  if (source.kind === 'video') return extension === 'webm' ? 'video/webm' : 'video/mp4';
  if (source.kind === 'audio') return extension === 'wav' ? 'audio/wav' : 'audio/mpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return 'image/png';
}

export function createMediaReferenceContext(source: MediaReferenceSource): ContextItem | undefined {
  if (!source.filePath) {
    return undefined;
  }
  if (source.kind === 'image') {
    const context: ImageContext = {
      id: stableIdFromPath(source.stableSlotId || source.filePath),
      type: 'image',
      imagePath: source.filePath,
      imageName: source.displayName,
      fileSize: 0,
      mimeType: mimeTypeForMedia(source),
      source: source.filePath.startsWith('http') ? 'url' : 'file',
      isLocal: !source.filePath.startsWith('http'),
      timestamp: Date.now(),
      thumbnailUrl: source.thumbnailUrl || source.previewUrl || source.filePath,
      metadata: {
        mediaReference: true,
        kind: source.kind,
        stableSlotId: source.stableSlotId,
      },
    };
    return context;
  }

  const context: MediaReferenceContext = {
    id: stableIdFromPath(source.stableSlotId || source.filePath),
    type: 'media-reference',
    kind: source.kind,
    mediaPath: source.filePath,
    mediaName: source.displayName,
    previewUrl: source.previewUrl,
    thumbnailUrl: source.thumbnailUrl,
    mimeType: mimeTypeForMedia(source),
    source: source.source,
    stableSlotId: source.stableSlotId,
    timestamp: Date.now(),
    metadata: {
      mediaReference: true,
    },
  };
  return context;
}

export function dispatchMediaReference(source: MediaReferenceSource): void {
  window.dispatchEvent(new CustomEvent<MediaReferenceEventDetail>(MEDIA_REFERENCE_EVENT, {
    detail: {
      source,
      context: createMediaReferenceContext(source),
      promptText: '',
    },
  }));
}

export function getMediaReferencePromptText(detail: MediaReferenceEventDetail): string {
  if (detail.context?.metadata?.mediaReference) {
    return '';
  }
  return detail.promptText;
}
