import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAgentCanvasStore } from '@/app/components/panels/content-canvas/stores';
import {
  selectActiveBtwSessionTab,
  type BtwSessionPanelData,
} from '../services/openBtwSession';
import type { Session } from '../types/flow-chat';
import {
  resolveComposerTarget,
  type ComposerTarget,
  type ComposerTargetSelection,
} from '../utils/composerTarget';

interface UseComposerTargetInput {
  mainSessionId: string | null;
  sessions: ReadonlyMap<string, Session>;
}

export function useComposerTarget({
  mainSessionId,
  sessions,
}: UseComposerTargetInput) {
  const activeChildTab = useAgentCanvasStore(selectActiveBtwSessionTab);
  const activeChildPanel = useMemo(() => {
    const data = activeChildTab?.content.data as BtwSessionPanelData | undefined;
    return data?.childSessionId && data.parentSessionId
      ? {
          childSessionId: data.childSessionId,
          parentSessionId: data.parentSessionId,
        }
      : null;
  }, [activeChildTab]);
  const [selection, setSelection] =
    useState<ComposerTargetSelection>({ kind: 'main' });
  const activeChildTarget = useMemo<ComposerTarget | null>(
    () => activeChildPanel
      ? resolveComposerTarget({
          mainSessionId,
          selectedTarget: {
            kind: 'child',
            sessionId: activeChildPanel.childSessionId,
          },
          activeChildPanel,
          sessions,
        })
      : null,
    [activeChildPanel, mainSessionId, sessions],
  );
  const previousMainSessionIdRef = useRef<string | null>(null);
  const previousActiveChildIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextChildId =
      activeChildTarget?.status === 'ready' && activeChildTarget.kind === 'child'
        ? activeChildTarget.sessionId
        : null;
    const mainChanged = previousMainSessionIdRef.current !== mainSessionId;
    const childChanged = previousActiveChildIdRef.current !== nextChildId;
    previousMainSessionIdRef.current = mainSessionId;
    previousActiveChildIdRef.current = nextChildId;

    if (mainChanged || childChanged) {
      setSelection(
        nextChildId
          ? { kind: 'child', sessionId: nextChildId }
          : { kind: 'main' },
      );
    }
  }, [activeChildTarget, mainSessionId]);

  const target = useMemo(
    () => resolveComposerTarget({
      mainSessionId,
      selectedTarget: selection,
      activeChildPanel,
      sessions,
    }),
    [activeChildPanel, mainSessionId, selection, sessions],
  );

  const selectMain = useCallback(() => {
    setSelection({ kind: 'main' });
  }, []);
  const selectActiveChild = useCallback(() => {
    if (activeChildTarget?.status !== 'ready' || activeChildTarget.kind !== 'child') {
      return false;
    }
    setSelection({ kind: 'child', sessionId: activeChildTarget.sessionId });
    return true;
  }, [activeChildTarget]);
  const canSelectSession = useCallback((sessionId: string) => (
    sessionId === mainSessionId
    || (
      activeChildTarget?.status === 'ready'
      && activeChildTarget.kind === 'child'
      && activeChildTarget.sessionId === sessionId
    )
  ), [activeChildTarget, mainSessionId]);
  const selectSession = useCallback((sessionId: string) => {
    if (!canSelectSession(sessionId)) {
      return false;
    }
    if (sessionId === mainSessionId) {
      selectMain();
      return true;
    }
    setSelection({ kind: 'child', sessionId });
    return true;
  }, [canSelectSession, mainSessionId, selectMain]);

  return {
    target,
    activeChildTarget,
    selectMain,
    selectActiveChild,
    canSelectSession,
    selectSession,
  };
}
