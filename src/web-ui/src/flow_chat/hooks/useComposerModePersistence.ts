import { useCallback, useRef, useState } from 'react';

const persistComposerMode = async (
  sessionId: string,
  mode: string,
): Promise<void> => {
  const { FlowChatManager } = await import('@/flow_chat/services/FlowChatManager');
  await FlowChatManager.getInstance().updateChatSessionMode(sessionId, mode);
};

export interface UseComposerModePersistenceOptions {
  sessionId?: string | null;
  enabled: boolean;
  persistMode?: (sessionId: string, mode: string) => Promise<void>;
}

interface PendingModeTransaction {
  sessionId: string;
  mode: string;
}

export function useComposerModePersistence({
  sessionId,
  enabled,
  persistMode = persistComposerMode,
}: UseComposerModePersistenceOptions) {
  const pendingRef = useRef<PendingModeTransaction>();
  const [pending, setPending] = useState<PendingModeTransaction>();

  const isModePersistencePending = useCallback(
    (targetSessionId = sessionId) =>
      Boolean(
        targetSessionId
        && pendingRef.current?.sessionId === targetSessionId,
      ),
    [sessionId],
  );

  const persistModeChange = useCallback(async (mode: string): Promise<void> => {
    const normalizedMode = mode.trim();
    if (!enabled || !sessionId || !normalizedMode) {
      throw new TypeError('parent_session_required');
    }
    if (pendingRef.current) {
      throw new Error('mode_persistence_pending');
    }

    const transaction = { sessionId, mode: normalizedMode };
    pendingRef.current = transaction;
    setPending(transaction);
    try {
      await persistMode(sessionId, normalizedMode);
    } finally {
      if (pendingRef.current === transaction) {
        pendingRef.current = undefined;
        setPending(undefined);
      }
    }
  }, [enabled, persistMode, sessionId]);

  return {
    modePersistencePending:
      Boolean(sessionId && pending?.sessionId === sessionId),
    pendingMode: pending?.mode,
    isModePersistencePending,
    persistModeChange,
  };
}
