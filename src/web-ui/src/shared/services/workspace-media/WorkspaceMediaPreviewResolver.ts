import { convertFileSrc } from '@tauri-apps/api/core';

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

const MAX_RESOLVED_URL_CACHE_ENTRIES = 240;

const resolvedUrlCache = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string | undefined>>();

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

function cacheKeyForMediaRequest(request: WorkspaceMediaPreviewRequest): string {
  return [request.kind ?? 'media', request.filePath, request.modifiedAt ?? ''].join('|');
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function touchResolvedUrlCacheEntry(key: string, url: string) {
  resolvedUrlCache.delete(key);
  resolvedUrlCache.set(key, url);
  while (resolvedUrlCache.size > MAX_RESOLVED_URL_CACHE_ENTRIES) {
    const oldestKey = resolvedUrlCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    resolvedUrlCache.delete(oldestKey);
  }
}

export function clearWorkspaceMediaPreviewUrlCache() {
  resolvedUrlCache.clear();
  inFlightResolutions.clear();
}

export async function resolveWorkspaceMediaPreviewUrl(
  request: WorkspaceMediaPreviewRequest,
): Promise<string | undefined> {
  const filePath = request.filePath.trim();
  if (!filePath) {
    return undefined;
  }

  const cacheKey = cacheKeyForMediaRequest({ ...request, filePath });
  const cached = resolvedUrlCache.get(cacheKey);
  if (cached) {
    touchResolvedUrlCacheEntry(cacheKey, cached);
    return cached;
  }

  const inFlight = inFlightResolutions.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const resolution = (async () => {
    if (isTauriEnvironment()) {
      try {
        let streamingUrl = convertFileSrc(filePath);
        if (streamingUrl && request.modifiedAt) {
          streamingUrl += `${streamingUrl.includes('?') ? '&' : '?'}v=${request.modifiedAt}`;
        }
        if (streamingUrl) {
          return streamingUrl;
        }
      } catch {
        // Fall back to the base64 reader below.
      }
    }
    const base64 = await workspaceAPI.readFileContent(filePath);
    return `data:${mimeTypeForMediaRequest(request)};base64,${base64}`;
  })();

  inFlightResolutions.set(cacheKey, resolution);
  try {
    const url = await resolution;
    if (url) {
      touchResolvedUrlCacheEntry(cacheKey, url);
    }
    return url;
  } catch {
    return undefined;
  } finally {
    inFlightResolutions.delete(cacheKey);
  }
}

export async function resolveWorkspaceMediaImagePreviewUrl(
  request: WorkspaceMediaImagePreviewRequest,
): Promise<string | undefined> {
  return resolveWorkspaceMediaPreviewUrl({ ...request, kind: 'image' });
}
