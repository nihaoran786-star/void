export type PreviewSource = 'manual';

export type PreviewOpenStatus = 'accepted' | 'unsupported';

export interface PreviewOpenRequest {
  url: string;
  source: PreviewSource;
  workspaceKey?: string | null;
  title?: string;
}

export interface PreviewOpenResult {
  status: PreviewOpenStatus;
  source: PreviewSource;
  url: string;
  error?: string;
}

const SUPPORTED_PREVIEW_PROTOCOLS = new Set(['http:', 'https:']);

function normalizePreviewUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsed = new URL(trimmedUrl);
    return SUPPORTED_PREVIEW_PROTOCOLS.has(parsed.protocol) ? trimmedUrl : null;
  } catch {
    return null;
  }
}

export function buildPreviewDuplicateKey(url: string, workspaceKey?: string | null): string {
  return `preview:${workspaceKey?.trim() || 'global'}:${url}`;
}

export function openRightPanelPreview(request: PreviewOpenRequest): PreviewOpenResult {
  const normalizedUrl = normalizePreviewUrl(request.url);
  if (!normalizedUrl) {
    return {
      status: 'unsupported',
      source: request.source,
      url: request.url,
      error: 'Unsupported preview URL',
    };
  }

  const duplicateCheckKey = buildPreviewDuplicateKey(normalizedUrl, request.workspaceKey);
  const detail = {
    type: 'browser',
    title: request.title || 'Preview',
    data: {
      url: normalizedUrl,
    },
    metadata: {
      duplicateCheckKey,
      preview: {
        source: request.source,
        status: 'requested',
        url: normalizedUrl,
        workspaceKey: request.workspaceKey || null,
      },
    },
    checkDuplicate: true,
    replaceExisting: true,
    duplicateCheckKey,
  };

  window.dispatchEvent(new CustomEvent('expand-right-panel'));
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('agent-create-tab', { detail }));
  }, 300);

  return {
    status: 'accepted',
    source: request.source,
    url: normalizedUrl,
  };
}
