import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';

const IMAGE_MIME_TYPES: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

const VIDEO_MIME_TYPES: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

const AUDIO_MIME_TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

export interface WorkspaceMediaPreviewRequest {
  filePath: string;
  extension?: string;
  kind?: 'image' | 'video' | 'audio' | 'media';
  modifiedAt?: number;
}

export type WorkspaceMediaImagePreviewRequest = WorkspaceMediaPreviewRequest;

export type WorkspaceMediaImagePreviewResolver = (
  request: WorkspaceMediaImagePreviewRequest
) => Promise<string | undefined>;

export type WorkspaceMediaPreviewResolver = (
  request: WorkspaceMediaPreviewRequest
) => Promise<string | undefined>;

function mimeTypeForMediaRequest(request: WorkspaceMediaPreviewRequest): string {
  const extension = (request.extension || '').toLowerCase();
  if (request.kind === 'video') {
    return VIDEO_MIME_TYPES[extension] || 'video/mp4';
  }
  if (request.kind === 'audio') {
    return AUDIO_MIME_TYPES[extension] || 'audio/mpeg';
  }
  return IMAGE_MIME_TYPES[extension] || 'image/png';
}

export async function resolveWorkspaceMediaPreviewUrl(
  request: WorkspaceMediaPreviewRequest
): Promise<string | undefined> {
  if (!request.filePath.trim()) {
    return undefined;
  }

  const base64 = await workspaceAPI.readFileContent(request.filePath);
  const mimeType = mimeTypeForMediaRequest(request);
  return `data:${mimeType};base64,${base64}`;
}

export async function resolveWorkspaceMediaImagePreviewUrl(
  request: WorkspaceMediaImagePreviewRequest
): Promise<string | undefined> {
  return resolveWorkspaceMediaPreviewUrl({ ...request, kind: 'image' });
}
