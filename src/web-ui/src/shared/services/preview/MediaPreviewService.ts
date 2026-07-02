export type MediaPreviewKind = 'image' | 'video' | 'audio' | 'media';

export const MEDIA_PREVIEW_EVENT = 'void-media-preview-open';

export interface MediaPreviewOpenRequest {
  kind: MediaPreviewKind;
  url: string;
  localPath?: string;
  title?: string;
  remoteUrl?: string;
}

export function openMediaPreviewPanel(request: MediaPreviewOpenRequest): void {
  if (!request.url.trim()) {
    return;
  }

  window.dispatchEvent(new CustomEvent<MediaPreviewOpenRequest>(MEDIA_PREVIEW_EVENT, {
    detail: request,
  }));
}
