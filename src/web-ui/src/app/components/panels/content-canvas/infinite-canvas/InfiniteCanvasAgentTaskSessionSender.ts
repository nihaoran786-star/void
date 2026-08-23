/**
 * Flow-chat backed implementation of the Infinite Canvas agent-task sender
 * port (K2 W4). Mirrors ShortDramaAgentTaskSessionSender: this file is the
 * ONLY place allowed to import FlowChatManager for the infinite canvas; the
 * shared gateway sees nothing but the injected port.
 */
import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { isSamePath } from '@/shared/utils/pathUtils';
import type { InfiniteCanvasAgentTaskSessionSender } from '@/shared/services/infinite-canvas';

export interface InfiniteCanvasSessionResolvers {
  /** The canvas surface's source session, only while it still exists. */
  getSourceSessionId: () => string | undefined;
  /** The currently active flow-chat session, if any. */
  getActiveSessionId: () => string | undefined;
}

export interface InfiniteCanvasSessionResolverOptions {
  /** The canvas surface's source session id; preferred dispatch target. */
  sourceSessionId?: string;
  /**
   * The canvas workspace path. The active-session fallback is only allowed
   * when that session verifiably belongs to the same workspace: a canvas in
   * workspace A must never dispatch its binding into a session running in
   * workspace B (the image would land in the wrong workspace). A session
   * without a workspacePath cannot be verified and is rejected (fail-closed);
   * the gateway then surfaces the existing typed "no target session" error.
   */
  workspacePath?: string;
}

function sessionWorkspacePath(sessionId: string): string | undefined {
  const session = flowChatStore.getState().sessions.get(sessionId);
  if (!session) return undefined;
  return session.workspacePath ?? session.config?.workspacePath;
}

/**
 * Target-session resolution for the session gateway (PRD §2): prefer the
 * surface's sourceSessionId while that session still exists, fall back to the
 * active session of the SAME workspace. Lives here because this file is the
 * single flow_chat seam of the infinite canvas.
 */
export function createInfiniteCanvasSessionResolvers(
  options: InfiniteCanvasSessionResolverOptions = {},
): InfiniteCanvasSessionResolvers {
  const { sourceSessionId, workspacePath } = options;
  return {
    getSourceSessionId: () => {
      if (!sourceSessionId?.trim()) return undefined;
      return flowChatStore.getState().sessions.has(sourceSessionId)
        ? sourceSessionId
        : undefined;
    },
    getActiveSessionId: () => {
      const activeSessionId = flowChatStore.getState().activeSessionId ?? undefined;
      if (!activeSessionId) return undefined;
      if (!workspacePath?.trim()) return activeSessionId;
      const activeWorkspacePath = sessionWorkspacePath(activeSessionId);
      return activeWorkspacePath !== undefined
        && isSamePath(activeWorkspacePath, workspacePath)
        ? activeSessionId
        : undefined;
    },
  };
}

export function createInfiniteCanvasAgentTaskSessionSender(): InfiniteCanvasAgentTaskSessionSender {
  return {
    async sendImageGenerationTask(request) {
      // Fail-soft: any throw out of the flow-chat lane must come back as a
      // typed error so the caller can roll its pending card back to a
      // retryable failed state instead of leaving it pending forever.
      try {
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
      } catch (cause) {
        return {
          status: 'error',
          error: {
            message: cause instanceof Error
              ? cause.message
              : 'Failed to send the image generation task.',
          },
        };
      }

      return {
        status: 'ready',
        targetSessionId: request.targetSessionId,
      };
    },
  };
}
