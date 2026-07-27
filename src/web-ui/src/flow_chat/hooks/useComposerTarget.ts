import { useMemo } from 'react';

import type { Session } from '../types/flow-chat';
import { resolveComposerTarget } from '../utils/composerTarget';

interface UseComposerTargetInput {
  mainSessionId: string | null;
  targetSessionId?: string;
  parentSessionId?: string;
  sessions: ReadonlyMap<string, Session>;
}

export function useComposerTarget({
  mainSessionId,
  targetSessionId,
  parentSessionId,
  sessions,
}: UseComposerTargetInput) {
  return useMemo(
    () => resolveComposerTarget({
      mainSessionId,
      targetSessionId,
      parentSessionId,
      sessions,
    }),
    [mainSessionId, parentSessionId, sessions, targetSessionId],
  );
}
