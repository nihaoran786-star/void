/**
 * Flow-chat backed implementation of the Infinite Canvas agent-task sender
 * port (K2 W4). Mirrors ShortDramaAgentTaskSessionSender: this file is the
 * ONLY place allowed to import FlowChatManager for the infinite canvas; the
 * shared gateway sees nothing but the injected port.
 */
import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { InfiniteCanvasAgentTaskSessionSender } from '@/shared/services/infinite-canvas';

export interface InfiniteCanvasSessionResolvers {
  /** The canvas surface's source session, only while it still exists. */
  getSourceSessionId: () => string | undefined;
  /** The currently active flow-chat session, if any. */
  getActiveSessionId: () => string | undefined;
}

/**
 * Target-session resolution for the session gateway (PRD §2): prefer the
 * surface's sourceSessionId while that session still exists, fall back to the
 * active session. Lives here because this file is the single flow_chat seam
 * of the infinite canvas.
 */
export function createInfiniteCanvasSessionResolvers(
  sourceSessionId?: string,
): InfiniteCanvasSessionResolvers {
  return {
    getSourceSessionId: () => {
      if (!sourceSessionId?.trim()) return undefined;
      return flowChatStore.getState().sessions.has(sourceSessionId)
        ? sourceSessionId
        : undefined;
    },
    getActiveSessionId: () => flowChatStore.getState().activeSessionId ?? undefined,
  };
}

export function createInfiniteCanvasAgentTaskSessionSender(): InfiniteCanvasAgentTaskSessionSender {
  return {
    async sendImageGenerationTask(request) {
      await FlowChatManager.getInstance().sendMessage(
        request.message,
        request.targetSessionId,
        request.inputSummary,
        undefined,
        undefined,
        {
          userMessageMetadata: {
            infiniteCanvasImageTask: {
              workspaceId: request.binding.workspaceId,
              documentId: request.binding.documentId,
              nodeId: request.binding.nodeId,
              resultMode: request.binding.resultMode,
              ...(request.binding.sourceNodeId
                ? { sourceNodeId: request.binding.sourceNodeId }
                : {}),
              toolId: request.binding.toolId,
              operationId: request.binding.operationId,
              source: 'infinite-canvas',
            },
          },
        },
      );

      return {
        status: 'ready',
        targetSessionId: request.targetSessionId,
      };
    },
  };
}
