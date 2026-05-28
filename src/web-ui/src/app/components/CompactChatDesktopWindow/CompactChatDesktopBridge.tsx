import { useEffect } from 'react';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';
import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import {
  emitCompactChatPresentation,
  listenCompactChatCancelTaskRequests,
  listenCompactChatMessageRequests,
  listenCompactChatPresentationRequests,
  subscribeCompactChatPresentationSource,
} from '@/flow_chat/services/CompactChatPresentationBridge';
import { closeCompactChatFloatingWindow } from '@/infrastructure/config/services/CompactChatWindowService';

const log = createLogger('CompactChatDesktopBridge');

export const CompactChatDesktopBridge = () => {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    const emitPresentation = () => {
      void emitCompactChatPresentation();
    };
    emitPresentation();
    const unsubscribe = subscribeCompactChatPresentationSource(emitPresentation);
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenCompactChatPresentationRequests(emitPresentation).then(removeListener => {
      if (disposed) {
        removeListener();
      } else {
        unlisten = removeListener;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenCompactChatMessageRequests(async ({ message, sessionId }) => {
      if (disposed) return;
      try {
        await FlowChatManager.getInstance().sendMessage(message, sessionId);
        void emitCompactChatPresentation();
      } catch (error) {
        log.error('Failed to send message from compact chat floating window', {
          sessionId,
          error,
        });
      }
    }).then(removeListener => {
      if (disposed) {
        removeListener();
      } else {
        unlisten = removeListener;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
      void closeCompactChatFloatingWindow();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenCompactChatCancelTaskRequests(async ({ sessionId }) => {
      if (disposed) return;
      try {
        await FlowChatManager.getInstance().cancelCurrentTask();
        void emitCompactChatPresentation();
      } catch (error) {
        log.error('Failed to cancel task from compact chat floating window', {
          sessionId,
          error,
        });
      }
    }).then(removeListener => {
      if (disposed) {
        removeListener();
      } else {
        unlisten = removeListener;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return null;
};

export default CompactChatDesktopBridge;
