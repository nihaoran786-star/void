import type { ImageContext } from '@/shared/types/context';
import { openMediaPreviewPanel } from '@/shared/services/preview/MediaPreviewService';
import {
  MEDIA_REFERENCE_EVENT,
  createMediaReferenceContext as createSharedMediaReferenceContext,
  dispatchMediaReference as dispatchSharedMediaReference,
  getMediaReferencePromptText,
  type MediaReferenceEventDetail,
} from '@/shared/services/media-reference';
import type { MediaAssetViewModel, MediaToolKind } from './mediaResult';

export { MEDIA_REFERENCE_EVENT, getMediaReferencePromptText };
export type { MediaReferenceEventDetail };

function referencePath(asset: MediaAssetViewModel): string {
  return asset.localPath || asset.url;
}

function previewUrl(asset: MediaAssetViewModel): string {
  return asset.previewUrl || asset.url;
}

function referenceThumbnailUrl(asset: MediaAssetViewModel): string {
  return asset.url || asset.previewUrl || referencePath(asset);
}

function extensionForKind(kind: MediaToolKind): string {
  if (kind === 'video') return 'mp4';
  if (kind === 'audio') return 'mp3';
  return 'png';
}

function referenceKind(kind: MediaToolKind): 'image' | 'video' | 'audio' {
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'audio';
  return 'image';
}

export function canUseMediaAssetAsImageReference(asset: MediaAssetViewModel): boolean {
  return asset.kind === 'image' || asset.kind === 'upload';
}

export function createMediaReferenceContext(asset: MediaAssetViewModel): ImageContext | undefined {
  const itemLabel = asset.itemIndex ? `#${asset.itemIndex}` : 'media';
  const context = createSharedMediaReferenceContext({
    id: asset.taskId || referencePath(asset),
    kind: referenceKind(asset.kind),
    filePath: referencePath(asset),
    displayName: `Generated ${itemLabel}.${extensionForKind(asset.kind)}`,
    previewUrl: previewUrl(asset),
    thumbnailUrl: referenceThumbnailUrl(asset),
    source: 'generated',
    extension: extensionForKind(asset.kind),
  });
  if (context?.metadata) {
    context.metadata.itemIndex = asset.itemIndex;
    context.metadata.taskId = asset.taskId;
    context.metadata.url = asset.url;
    context.metadata.localPath = asset.localPath;
  }
  return context?.type === 'image' ? context : undefined;
}

export function buildMediaReferencePromptText(_asset: MediaAssetViewModel): string {
  return '';
}

export function dispatchMediaReference(asset: MediaAssetViewModel): void {
  dispatchSharedMediaReference({
    id: asset.taskId || referencePath(asset),
    kind: referenceKind(asset.kind),
    filePath: referencePath(asset),
    displayName: asset.itemIndex
      ? `Generated #${asset.itemIndex}.${extensionForKind(asset.kind)}`
      : `Generated media.${extensionForKind(asset.kind)}`,
    previewUrl: previewUrl(asset),
    thumbnailUrl: referenceThumbnailUrl(asset),
    source: 'generated',
    extension: extensionForKind(asset.kind),
  });
}

export function openMediaPreview(asset: MediaAssetViewModel): void {
  const index = asset.itemIndex ? ` #${asset.itemIndex}` : '';
  openMediaPreviewPanel({
    kind: asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio' ? asset.kind : 'media',
    url: previewUrl(asset),
    remoteUrl: asset.url,
    localPath: asset.localPath,
    title: `${asset.kind === 'image' ? 'Image' : asset.kind === 'video' ? 'Video' : asset.kind === 'audio' ? 'Audio' : 'Media'}${index}`,
  });
}
