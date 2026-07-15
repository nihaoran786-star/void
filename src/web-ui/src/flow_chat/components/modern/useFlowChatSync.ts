/**
 * FlowChat store synchronization effects.
 */

import { useEffect } from 'react';
import { agentAPI } from '@/infrastructure/api';
import { flowChatStore } from '../../store/FlowChatStore';
import { startAutoSync } from '../../services/storeSync';

export function useFlowChatSync(isActive: boolean = true): void {
  useEffect(() => {
    if (!isActive) return;
    const unsubscribe = startAutoSync();
    return () => {
      unsubscribe();
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const unlisten = agentAPI.onSessionTitleGenerated((event) => {
      flowChatStore.updateSessionTitle(
        event.sessionId,
        event.title,
        'generated',
      );
    });

    return () => {
      unlisten();
    };
  }, [isActive]);
}
