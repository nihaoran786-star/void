import { useEffect, useMemo, useRef, useState } from 'react';

import type { CanvasWorkspaceFacts } from '@/shared/services/canvas';
import { createShortDramaWorkspaceManifestAdapter } from '@/shared/services/short-drama/ShortDramaWorkspaceManifestAdapter';
import { readShortDramaStageAgentBindings } from '@/shared/services/short-drama/ShortDramaStageAgentSessionBinding';
import {
  isFirstPartyCanvasCapabilityAvailableForSession,
  openFirstPartyCanvasCapability,
} from './FirstPartyCanvasCapabilityRuntime';

interface FirstPartyCanvasRestoreSessionFacts {
  sessionId: string;
  mode?: string;
  sessionKind?: string;
}

interface FirstPartyCanvasSurfaceRestoreOptions {
  enabled: boolean;
  hostId: string;
  workspace: CanvasWorkspaceFacts;
  sourceSession?: FirstPartyCanvasRestoreSessionFacts;
}

function isMutationSuccess(status: string): boolean {
  return status === 'opened' || status === 'focused' || status === 'updated';
}

export function useFirstPartyCanvasSurfaceRestore({
  enabled,
  hostId,
  workspace,
  sourceSession,
}: FirstPartyCanvasSurfaceRestoreOptions): {
  isInitialRestoreSettled: boolean;
} {
  const restoredScopeKeysRef = useRef(new Set<string>());
  const [settledScopeKey, setSettledScopeKey] = useState<string>();
  const restoreScope = useMemo(() => {
    if (
      !enabled
      || workspace.status !== 'ready'
      || workspace.backend !== 'local'
      || !sourceSession?.sessionId
      || !isFirstPartyCanvasCapabilityAvailableForSession(
        'short-drama',
        sourceSession,
      )
    ) {
      return undefined;
    }
    return {
      key: `${workspace.workspaceId}\u0000${sourceSession.sessionId}`,
      workspace,
      sourceSessionId: sourceSession.sessionId,
    };
  }, [enabled, sourceSession, workspace]);

  useEffect(() => {
    if (!restoreScope) return;
    let cancelled = false;
    const restore = async () => {
      try {
        const result = await readShortDramaStageAgentBindings(
          createShortDramaWorkspaceManifestAdapter(restoreScope.workspace.workspacePath),
          restoreScope.workspace.workspacePath,
        );
        if (cancelled || result.status === 'error') return;
        if (
          result.bindings.every(binding => binding.status === 'unbound')
          || restoredScopeKeysRef.current.has(restoreScope.key)
        ) {
          return;
        }
        const openResult = await openFirstPartyCanvasCapability({
          capabilityId: 'short-drama',
          source: 'restore',
          input: undefined,
          idempotencyKey: `short-drama-bindings:${restoreScope.key}`,
          sourceSessionId: restoreScope.sourceSessionId,
          target: {
            ...restoreScope.workspace,
            hostId,
          },
        });
        if (!cancelled && isMutationSuccess(openResult.status)) {
          restoredScopeKeysRef.current.add(restoreScope.key);
        }
      } catch {
        // Restore is opportunistic. The current canvas remains usable and a
        // later scope activation may retry without leaking an unhandled task.
      } finally {
        if (!cancelled) setSettledScopeKey(restoreScope.key);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [hostId, restoreScope]);

  return {
    isInitialRestoreSettled: !restoreScope || settledScopeKey === restoreScope.key,
  };
}
