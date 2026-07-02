import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import type { ShortDramaAgentTaskSessionSender } from '@/shared/services/short-drama';

export function createShortDramaAgentTaskSessionSender(): ShortDramaAgentTaskSessionSender {
  return {
    async sendAgentTask(task) {
      await FlowChatManager.getInstance().sendMessage(
        task.message,
        task.targetSessionId,
        task.request.inputSummary,
        undefined,
        undefined,
        {
          userMessageMetadata: {
            shortDramaAgentTask: {
              artifactId: task.request.artifactId,
              episodeId: task.request.episodeId,
              stage: task.request.stage,
              agentRole: task.request.agentRole,
              source: 'short-drama-center',
            },
          },
        },
      );

      return {
        status: 'ready',
        targetSessionId: task.targetSessionId,
      };
    },
  };
}
