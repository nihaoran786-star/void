import { globalEventBus } from '@/infrastructure/event-bus';
import type {
  ShortDramaAgentTaskDispatchRecord,
  ShortDramaAgentTaskDispatchResult,
  ShortDramaAgentTaskRequest,
  ShortDramaError,
} from './ShortDramaTypes';

const SHORT_DRAMA_AGENT_TASK_DISPATCH_EVENT = 'short-drama:agent-tasks-dispatch-requested';

export interface ShortDramaAgentTaskDispatchEvent {
  requests: ShortDramaAgentTaskRequest[];
  source: 'short-drama-center';
}

export interface ShortDramaAgentTaskDispatchEventBus {
  emit(eventName: typeof SHORT_DRAMA_AGENT_TASK_DISPATCH_EVENT, event: ShortDramaAgentTaskDispatchEvent): boolean;
}

export interface ShortDramaAgentTaskSessionSendRequest {
  targetSessionId: string;
  request: ShortDramaAgentTaskRequest;
  message: string;
}

export type ShortDramaAgentTaskSessionSendResult =
  | { status: 'ready'; targetSessionId: string; messageId?: string }
  | { status: 'error'; error: ShortDramaError };

export interface ShortDramaAgentTaskSessionSender {
  sendAgentTask(request: ShortDramaAgentTaskSessionSendRequest): Promise<ShortDramaAgentTaskSessionSendResult>;
}

export interface ShortDramaAgentTaskDispatchAdapterOptions {
  eventBus?: ShortDramaAgentTaskDispatchEventBus;
  sessionSender?: ShortDramaAgentTaskSessionSender;
}

export interface ShortDramaAgentTaskDispatchAdapter {
  dispatchAgentTasks(requests: ShortDramaAgentTaskRequest[]): Promise<ShortDramaAgentTaskDispatchResult>;
}

export function createShortDramaAgentTaskDispatchAdapter(
  optionsOrEventBus: ShortDramaAgentTaskDispatchEventBus | ShortDramaAgentTaskDispatchAdapterOptions = globalEventBus,
): ShortDramaAgentTaskDispatchAdapter {
  const options = normalizeDispatchAdapterOptions(optionsOrEventBus);
  return {
    async dispatchAgentTasks(requests) {
      if (options.sessionSender && requests.every(request => request.targetSessionId)) {
        return dispatchToPersistentSessions(requests, options.sessionSender);
      }

      const hasListener = options.eventBus.emit(SHORT_DRAMA_AGENT_TASK_DISPATCH_EVENT, {
        requests,
        source: 'short-drama-center',
      });

      if (!hasListener) {
        return {
          status: 'unsupported',
          error: {
            code: 'unsupported_runtime',
            message: 'No short drama agent task dispatcher is registered.',
          },
        };
      }

      return { status: 'ready', requests };
    },
  };
}

function normalizeDispatchAdapterOptions(
  optionsOrEventBus: ShortDramaAgentTaskDispatchEventBus | ShortDramaAgentTaskDispatchAdapterOptions,
): Required<Pick<ShortDramaAgentTaskDispatchAdapterOptions, 'eventBus'>> & Pick<ShortDramaAgentTaskDispatchAdapterOptions, 'sessionSender'> {
  if ('emit' in optionsOrEventBus) {
    return { eventBus: optionsOrEventBus };
  }

  return {
    eventBus: optionsOrEventBus.eventBus ?? globalEventBus,
    sessionSender: optionsOrEventBus.sessionSender,
  };
}

async function dispatchToPersistentSessions(
  requests: ShortDramaAgentTaskRequest[],
  sessionSender: ShortDramaAgentTaskSessionSender,
): Promise<ShortDramaAgentTaskDispatchResult> {
  const dispatchedTasks: ShortDramaAgentTaskDispatchRecord[] = [];

  for (const request of requests) {
    const targetSessionId = request.targetSessionId;
    if (!targetSessionId) {
      return {
        status: 'unsupported',
        error: {
          code: 'unsupported_runtime',
          message: 'Short drama agent task request is missing a persistent target session.',
        },
      };
    }

    const sent = await sessionSender.sendAgentTask({
      targetSessionId,
      request,
      message: formatShortDramaAgentTaskMessage(request),
    });

    if (sent.status === 'error') {
      return { status: 'error', error: sent.error };
    }

    dispatchedTasks.push({
      artifactId: request.artifactId,
      stage: request.stage,
      targetSessionId: sent.targetSessionId,
      source: 'persistent-session',
      messageId: sent.messageId,
    });
  }

  return { status: 'ready', requests, dispatchedTasks };
}

function formatShortDramaAgentTaskMessage(request: ShortDramaAgentTaskRequest): string {
  return [
    '请处理这个 AI 短剧专业任务。',
    `阶段：${request.stage}`,
    `产物：${request.artifactId}`,
    `集数：${request.episodeId}`,
    `任务：${request.inputSummary}`,
    '请优先使用 ShortDramaProject 工具读取当前工作区短剧项目，必要时把结果写回对应产物，不要只在聊天里给出无法落地的文案。',
  ].join('\n');
}
