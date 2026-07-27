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
const MAX_IMAGE_DATA_URL_CACHE_ENTRIES = 12;
const MAX_IMAGE_DATA_URL_CACHE_CHARS = 32 * 1024 * 1024;
const MAX_SINGLE_IMAGE_DATA_URL_CHARS = 8 * 1024 * 1024;

interface WorkspaceMediaPreviewResolution {
  url: string;
  cache: 'none' | 'stream' | 'image-data';
}

const resolvedUrlCache = new Map<string, string>();
const resolvedImageDataUrlCache = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<WorkspaceMediaPreviewResolution>>();
let resolvedImageDataUrlCacheChars = 0;
let cacheEpoch = 0;

export interface WorkspaceMediaPreviewRequest {
  filePath: string;
  extension?: string;
  kind?: 'image' | 'video' | 'audio' | 'media';
  modifiedAt?: number;
  forceDataUrl?: boolean;
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
  return [
    request.kind ?? 'media',
    request.filePath,
    request.modifiedAt ?? '',
    request.forceDataUrl ? 'data' : 'stream',
  ].join('|');
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

function touchResolvedImageDataUrlCacheEntry(key: string, url: string) {
  const current = resolvedImageDataUrlCache.get(key);
  if (current) {
    resolvedImageDataUrlCacheChars -= current.length;
    resolvedImageDataUrlCache.delete(key);
  }
  if (url.length > MAX_SINGLE_IMAGE_DATA_URL_CHARS) {
    return;
  }
  resolvedImageDataUrlCache.set(key, url);
  resolvedImageDataUrlCacheChars += url.length;
  while (
    resolvedImageDataUrlCache.size > MAX_IMAGE_DATA_URL_CACHE_ENTRIES
    || resolvedImageDataUrlCacheChars > MAX_IMAGE_DATA_URL_CACHE_CHARS
  ) {
    const oldestKey = resolvedImageDataUrlCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    const oldestUrl = resolvedImageDataUrlCache.get(oldestKey);
    if (oldestUrl) {
      resolvedImageDataUrlCacheChars -= oldestUrl.length;
    }
    resolvedImageDataUrlCache.delete(oldestKey);
  }
}

export function clearWorkspaceMediaPreviewUrlCache() {
  cacheEpoch += 1;
  resolvedUrlCache.clear();
  resolvedImageDataUrlCache.clear();
  resolvedImageDataUrlCacheChars = 0;
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
  const cachedImageDataUrl = resolvedImageDataUrlCache.get(cacheKey);
  if (cachedImageDataUrl) {
    touchResolvedImageDataUrlCacheEntry(cacheKey, cachedImageDataUrl);
    return cachedImageDataUrl;
  }

  const inFlight = inFlightResolutions.get(cacheKey);
  if (inFlight) {
    try {
      return (await inFlight).url;
    } catch {
      return undefined;
    }
  }

  const resolutionEpoch = cacheEpoch;
  const resolution = (async (): Promise<WorkspaceMediaPreviewResolution> => {
    if (isTauriEnvironment() && !request.forceDataUrl) {
      try {
        let streamingUrl = convertFileSrc(filePath);
        if (streamingUrl && request.modifiedAt) {
          streamingUrl += `${streamingUrl.includes('?') ? '&' : '?'}v=${request.modifiedAt}`;
        }
        if (streamingUrl) {
          return { url: streamingUrl, cache: 'stream' };
        }
      } catch {
        // Fall back to the base64 reader below.
      }
    }
    const base64 = await workspaceAPI.readFileContent(filePath);
    return {
      url: `data:${mimeTypeForMediaRequest(request)};base64,${base64}`,
      // Video and audio data URLs remain uncached. Image thumbnails opt into
      // a much smaller byte- and entry-bounded cache so gallery navigation
      // does not repeatedly read and decode the same workspace file.
      cache: request.kind === 'image' && request.forceDataUrl
        ? 'image-data'
        : 'none',
    };
  })();

  inFlightResolutions.set(cacheKey, resolution);
  try {
    const result = await resolution;
    if (resolutionEpoch === cacheEpoch) {
      if (result.cache === 'stream') {
        touchResolvedUrlCacheEntry(cacheKey, result.url);
      } else if (result.cache === 'image-data') {
        touchResolvedImageDataUrlCacheEntry(cacheKey, result.url);
      }
    }
    return result.url;
  } catch {
    return undefined;
  } finally {
    if (inFlightResolutions.get(cacheKey) === resolution) {
      inFlightResolutions.delete(cacheKey);
    }
  }
}

export async function resolveWorkspaceMediaImagePreviewUrl(
  request: WorkspaceMediaImagePreviewRequest,
): Promise<string | undefined> {
  return resolveWorkspaceMediaPreviewUrl({
    ...request,
    kind: 'image',
    forceDataUrl: true,
  });
}
