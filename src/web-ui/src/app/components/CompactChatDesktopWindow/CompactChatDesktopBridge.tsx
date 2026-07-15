import { useEffect } from 'react';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';
import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import {
  listenCompactChatCancelTaskRequests,
  listenCompactChatCloseRequests,
  listenCompactChatMessageRequests,
  listenCompactChatPresentationRequests,
  listenCompactChatPresentationSuspensionRequests,
} from '@/flow_chat/services/CompactChatPresentationBridge';
import {
  activateCompactChatPresentationPublishing,
  requestCompactChatPresentationUpdate,
  suspendCompactChatPresentationPublishing,
} from '@/flow_chat/services/CompactChatPresentationPublisher';
import { closeCompactChatFloatingWindow } from '@/infrastructure/config/services/CompactChatWindowService';

const log = createLogger('CompactChatDesktopBridge');

export const CompactChatDesktopBridge = () => {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlistenRequest: (() => void) | null = null;
    let unlistenSuspension: (() => void) | null = null;
    void listenCompactChatPresentationRequests(() => {
      activateCompactChatPresentationPublishing();
    }).then(removeListener => {
      if (disposed) {
        removeListener();
      } else {
        unlistenRequest = removeListener;
      }
    });
    void listenCompactChatPresentationSuspensionRequests(() => {
      suspendCompactChatPresentationPublishing();
    }).then(removeListener => {
      if (disposed) {
        removeListener();
      } else {
        unlistenSuspension = removeListener;
      }
    });

    return () => {
      disposed = true;
      unlistenRequest?.();
      unlistenSuspension?.();
      suspendCompactChatPresentationPublishing();
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
        requestCompactChatPresentationUpdate();
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
        requestCompactChatPresentationUpdate();
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

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenCompactChatCloseRequests(() => {
      if (disposed) return;
      suspendCompactChatPresentationPublishing();
      window.dispatchEvent(new CustomEvent('void:compact-chat-close-requested'));
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
