import { useCallback, useEffect, useRef, useState } from 'react';

import {
  resolveWorkspaceMediaPreviewUrl,
  type WorkspaceMediaPreviewRequest,
  type WorkspaceMediaPreviewResolver,
} from '@/shared/services/workspace-media/WorkspaceMediaPreviewResolver';

interface RecoverableWorkspaceMediaUrlInput {
  directUrl?: string;
  localPath?: string;
  kind?: WorkspaceMediaPreviewRequest['kind'];
  modifiedAt?: number;
  resolver?: WorkspaceMediaPreviewResolver;
}

interface RecoverableWorkspaceMediaUrl {
  url?: string;
  onError: () => void;
}

interface MediaUrlState {
  key: string;
  url?: string;
}

function extensionFromPath(path: string): string | undefined {
  const cleanPath = path.split(/[?#]/)[0] ?? path;
  const fileName = cleanPath.split(/[\\/]/).pop() ?? cleanPath;
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : undefined;
}

export function useRecoverableWorkspaceMediaUrl({
  directUrl,
  localPath,
  kind,
  modifiedAt,
  resolver = resolveWorkspaceMediaPreviewUrl,
}: RecoverableWorkspaceMediaUrlInput): RecoverableWorkspaceMediaUrl {
  const sourceKey = [directUrl ?? '', localPath ?? '', kind ?? '', modifiedAt ?? ''].join('|');
  const generationRef = useRef(0);
  const localResolutionAttemptRef = useRef(0);
  const [state, setState] = useState<MediaUrlState>({
    key: sourceKey,
    url: directUrl,
  });

  const resolveLocalUrl = useCallback(() => {
    if (!localPath) {
      setState({ key: sourceKey });
      return;
    }

    // A remote URL may expire, and Tauri's compact streaming URL can still be
    // rejected by WebView path permissions. Cap recovery at two local reads:
    // stream first, then an uncached data URL as the final compatibility path.
    if (localResolutionAttemptRef.current >= 2) {
      setState({ key: sourceKey });
      return;
    }

    const forceDataUrl = localResolutionAttemptRef.current === 1;
    localResolutionAttemptRef.current += 1;

    const generation = generationRef.current;
    setState({ key: sourceKey });
    void resolver({
      filePath: localPath,
      extension: extensionFromPath(localPath),
      kind,
      modifiedAt,
      ...(forceDataUrl ? { forceDataUrl: true } : {}),
    }).then((url) => {
      if (generationRef.current === generation) {
        setState({ key: sourceKey, url });
      }
    }).catch(() => {
      if (generationRef.current === generation) {
        setState({ key: sourceKey });
      }
    });
  }, [kind, localPath, modifiedAt, resolver, sourceKey]);

  useEffect(() => {
    generationRef.current += 1;
    localResolutionAttemptRef.current = 0;
    setState({ key: sourceKey, url: directUrl });
    if (!directUrl && localPath) {
      resolveLocalUrl();
    }
    return () => {
      generationRef.current += 1;
    };
  }, [directUrl, localPath, resolveLocalUrl, sourceKey]);

  return {
    url: state.key === sourceKey ? state.url : directUrl,
    onError: resolveLocalUrl,
  };
}
