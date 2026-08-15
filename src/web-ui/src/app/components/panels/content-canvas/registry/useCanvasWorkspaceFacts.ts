import { useMemo } from 'react';

import { useOptionalCurrentWorkspace } from '@/infrastructure/contexts/WorkspaceContext';
import type { CanvasWorkspaceFacts } from '@/shared/services/canvas/CanvasSurfaceContracts';
import {
  areCanvasWorkspacePathsEquivalent,
  createCanvasWorkspaceFacts,
} from '@/shared/services/canvas/CanvasWorkspaceFacts';

export function useCanvasWorkspaceFacts(
  expectedWorkspacePath?: string,
): CanvasWorkspaceFacts {
  const { workspace } = useOptionalCurrentWorkspace();
  return useMemo(() => {
    const facts = createCanvasWorkspaceFacts(workspace);
    if (
      facts.status === 'ready'
      && expectedWorkspacePath
      && !areCanvasWorkspacePathsEquivalent(
        facts.workspacePath,
        expectedWorkspacePath,
        facts.backend,
      )
    ) {
      return { status: 'unavailable', reason: 'invalid-workspace' };
    }
    return facts;
  }, [expectedWorkspacePath, workspace]);
}
