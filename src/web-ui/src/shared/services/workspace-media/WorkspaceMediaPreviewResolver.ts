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

export interface WorkspaceMediaImagePreviewRequest {
  filePath: string;
  extension?: string;
  modifiedAt?: number;
}

export type WorkspaceMediaImagePreviewResolver = (
  request: WorkspaceMediaImagePreviewRequest
) => Promise<string | undefined>;

export async function resolveWorkspaceMediaImagePreviewUrl(
  request: WorkspaceMediaImagePreviewRequest
): Promise<string | undefined> {
  if (!request.filePath.trim()) {
    return undefined;
  }

  const base64 = await workspaceAPI.readFileContent(request.filePath);
  const mimeType = IMAGE_MIME_TYPES[(request.extension || '').toLowerCase()] || 'image/png';
  return `data:${mimeType};base64,${base64}`;
}
