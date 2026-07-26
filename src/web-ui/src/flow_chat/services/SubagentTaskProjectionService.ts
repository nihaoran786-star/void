import {
  agentAPI,
  type SubagentTaskRecordDTO,
} from '@/infrastructure/api/service-api/AgentAPI';
import type { FlowChatStore } from '../store/FlowChatStore';
import type { FlowToolItem, Session } from '../types/flow-chat';

interface ProjectionTarget {
  turnId: string;
  itemId: string;
  item: FlowToolItem;
}

function readBackgroundTaskId(item: FlowToolItem): string | undefined {
  const result = item.toolResult?.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return undefined;
  }
  const record = result as Record<string, unknown>;
  const taskId = record.backgroundTaskId ?? record.background_task_id;
  return typeof taskId === 'string' && taskId.trim() ? taskId : undefined;
}

function findTaskTool(
  parentSession: Session,
  task: SubagentTaskRecordDTO,
): ProjectionTarget | null {
  let childSessionMatch: ProjectionTarget | null = null;
  for (const turn of parentSession.dialogTurns) {
    for (const round of turn.modelRounds) {
      for (const item of round.items) {
        if (item.type !== 'tool' || item.toolName?.toLowerCase() !== 'task') {
          continue;
        }
        const tool = item as FlowToolItem;
        const target = {
          turnId: turn.id,
          itemId: tool.toolCall?.id || tool.id,
          item: tool,
        };
        if (
          tool.subagentTask?.taskId === task.taskId ||
          readBackgroundTaskId(tool) === task.taskId
        ) {
          return target;
        }
        if (
          task.childSessionId &&
          tool.subagentSessionId === task.childSessionId
        ) {
          childSessionMatch = target;
        }
      }
    }
  }
  return childSessionMatch;
}

export function applySubagentTaskProjection(
  store: FlowChatStore,
  task: SubagentTaskRecordDTO,
): boolean {
  const state = store.getState();
  const parentSession = state.sessions.get(task.parentSessionId);
  if (!parentSession) {
    return false;
  }

  let target = findTaskTool(parentSession, task);
  if (!target && task.childSessionId) {
    const childSession = state.sessions.get(task.childSessionId);
    const parentToolCallId = childSession?.parentSessionId === task.parentSessionId
      ? childSession.parentToolCallId
      : undefined;
    if (parentToolCallId) {
      for (const turn of parentSession.dialogTurns) {
        const item = store.findToolItem(task.parentSessionId, turn.id, parentToolCallId);
        const tool = item?.type === 'tool' ? item as FlowToolItem : null;
        if (tool?.toolName?.toLowerCase() === 'task') {
          target = {
            turnId: turn.id,
            itemId: parentToolCallId,
            item: tool,
          };
          break;
        }
      }
    }
  }
  if (!target) {
    return false;
  }

  const existing = target.item.subagentTask;
  if (
    existing?.taskId === task.taskId &&
    existing.updatedAt > task.updatedAt
  ) {
    return false;
  }
  store.updateModelRoundItem(
    task.parentSessionId,
    target.turnId,
    target.itemId,
    {
      subagentTask: task,
      ...(task.childSessionId ? { subagentSessionId: task.childSessionId } : {}),
    } as Partial<FlowToolItem>,
  );
  return true;
}

export async function hydrateSubagentTaskProjections(
  store: FlowChatStore,
  parentSessionId: string,
): Promise<number> {
  const tasks = await agentAPI.listSubagentTasks(parentSessionId);
  return tasks.reduce(
    (count, task) => count + Number(applySubagentTaskProjection(store, task)),
    0,
  );
}
