import type { ImageContext } from '@/shared/types/context';
import { openMediaPreviewPanel } from '@/shared/services/preview/MediaPreviewService';
import type { MediaAssetViewModel, MediaToolKind } from './mediaResult';

export const MEDIA_REFERENCE_EVENT = 'void-media-reference-selected';

export interface MediaReferenceEventDetail {
  asset: MediaAssetViewModel;
  context?: ImageContext;
  promptText: string;
}

function stableIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return `media-ref-${Math.abs(hash).toString(36)}`;
}

function referencePath(asset: MediaAssetViewModel): string {
  return asset.localPath || asset.url;
}

function previewUrl(asset: MediaAssetViewModel): string {
  return asset.previewUrl || asset.url;
}

function extensionForKind(kind: MediaToolKind): string {
  if (kind === 'video') return 'mp4';
  if (kind === 'audio') return 'mp3';
  return 'png';
}

function mimeTypeForKind(kind: MediaToolKind): string {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') return 'audio/mpeg';
  return 'image/png';
}

export function canUseMediaAssetAsImageReference(asset: MediaAssetViewModel): boolean {
  return asset.kind === 'image' || asset.kind === 'upload';
}

export function createMediaReferenceContext(asset: MediaAssetViewModel): ImageContext | undefined {
  if (!canUseMediaAssetAsImageReference(asset)) {
    return undefined;
  }

  const itemLabel = asset.itemIndex ? `#${asset.itemIndex}` : 'media';
  const path = referencePath(asset);
  const isLocal = Boolean(asset.localPath);
  return {
    id: stableIdFromUrl(path),
    type: 'image',
    imagePath: path,
    imageName: `Generated ${itemLabel}.${extensionForKind(asset.kind)}`,
    fileSize: 0,
    mimeType: mimeTypeForKind(asset.kind),
    source: isLocal ? 'file' : 'url',
    isLocal,
    timestamp: Date.now(),
    thumbnailUrl: previewUrl(asset),
    metadata: {
      mediaReference: true,
      itemIndex: asset.itemIndex,
      taskId: asset.taskId,
      url: asset.url,
      localPath: asset.localPath,
    },
  };
}

export function buildMediaReferencePromptText(asset: MediaAssetViewModel): string {
  const index = asset.itemIndex ? ` #${asset.itemIndex}` : '';
  if (canUseMediaAssetAsImageReference(asset)) {
    return `以参考图${index}为基础继续生成。`;
  }
  if (asset.kind === 'video') {
    return `参考视频${index}: ${referencePath(asset)}`;
  }
  if (asset.kind === 'audio') {
    return `参考音频${index}: ${referencePath(asset)}`;
  }
  return `参考媒体${index}: ${referencePath(asset)}`;
}

export function dispatchMediaReference(asset: MediaAssetViewModel): void {
  window.dispatchEvent(new CustomEvent<MediaReferenceEventDetail>(MEDIA_REFERENCE_EVENT, {
    detail: {
      asset,
      context: createMediaReferenceContext(asset),
      promptText: buildMediaReferencePromptText(asset),
    },
  }));
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
