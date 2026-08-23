/**
 * Flow-chat backed implementation of the Infinite Canvas agent-task sender
 * port (K2 W4). Mirrors ShortDramaAgentTaskSessionSender: this file is the
 * ONLY place allowed to import FlowChatManager for the infinite canvas; the
 * shared gateway sees nothing but the injected port.
 */
import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import type { InfiniteCanvasAgentTaskSessionSender } from '@/shared/services/infinite-canvas';

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
