import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentAPI, type SubagentTaskRecordDTO } from '@/infrastructure/api/service-api/AgentAPI';
import { FlowChatStore } from '../store/FlowChatStore';
import type { FlowChatState, FlowToolItem, Session } from '../types/flow-chat';
import {
  applySubagentTaskProjection,
  hydrateSubagentTaskProjections,
} from './SubagentTaskProjectionService';

vi.mock('@/infrastructure/api/service-api/AgentAPI', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/infrastructure/api/service-api/AgentAPI')>();
  return {
    ...original,
    agentAPI: {
      ...original.agentAPI,
      listSubagentTasks: vi.fn(),
    },
  };
});

const store = FlowChatStore.getInstance();

function task(overrides: Partial<SubagentTaskRecordDTO> = {}): SubagentTaskRecordDTO {
  return {
    schemaVersion: 3,
    taskId: 'bg-1',
    parentSessionId: 'parent-1',
    childSessionId: 'child-1',
    objective: 'Inspect runtime',
    executionMode: 'background',
    contextMode: 'fresh',
    status: 'running',
    owner: 'worker-1',
    deliveryState: 'pending',
    deliveryReplaySafety: 'idempotent',
    deliveryIdempotencyKey: 'delivery-1',
    deliveryAttempts: 0,
    recoveryState: 'none',
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  };
}

function parentSession(): Session {
  return {
    sessionId: 'parent-1',
    title: 'Parent',
    dialogTurns: [{
      id: 'turn-1',
      sessionId: 'parent-1',
      userMessage: { id: 'user-1', content: 'Delegate', timestamp: 1 },
      modelRounds: [{
        id: 'round-1',
        index: 0,
        items: [{
          id: 'tool-1',
          type: 'tool',
          toolName: 'Task',
          timestamp: 2,
          status: 'completed',
          toolCall: {
            id: 'tool-1',
            input: { run_in_background: true },
          },
          toolResult: {
            success: true,
            result: { background_task_id: 'bg-1' },
          },
        } as FlowToolItem],
        isStreaming: false,
        isComplete: true,
        status: 'completed',
        startTime: 2,
      }],
      status: 'completed',
      startTime: 1,
    }],
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'normal',
  } as Session;
}

function projectedTool(): FlowToolItem {
  return store.getState().sessions
    .get('parent-1')!
    .dialogTurns[0]
    .modelRounds[0]
    .items[0] as FlowToolItem;
}

describe('SubagentTaskProjectionService', () => {
  beforeEach(() => {
    store.setState((): FlowChatState => ({
      sessions: new Map([['parent-1', parentSession()]]),
      activeSessionId: 'parent-1',
    }));
    vi.mocked(agentAPI.listSubagentTasks).mockReset();
  });

  afterEach(() => {
    store.setState((): FlowChatState => ({
      sessions: new Map(),
      activeSessionId: null,
    }));
  });

  it('projects a durable task onto the existing parent Task item', () => {
    expect(applySubagentTaskProjection(store, task())).toBe(true);
    expect(projectedTool()).toMatchObject({
      subagentSessionId: 'child-1',
      subagentTask: {
        taskId: 'bg-1',
        status: 'running',
        deliveryState: 'pending',
      },
    });
  });

  it('does not let an older task event regress the projected state', () => {
    applySubagentTaskProjection(store, task({ status: 'completed', updatedAt: 30 }));
    expect(applySubagentTaskProjection(store, task({ status: 'running', updatedAt: 20 }))).toBe(false);
    expect(projectedTool().subagentTask?.status).toBe('completed');
  });

  it('applies a terminal event with the same timestamp as the running event', () => {
    applySubagentTaskProjection(store, task({ status: 'running', updatedAt: 20 }));
    expect(applySubagentTaskProjection(
      store,
      task({ status: 'completed', deliveryState: 'delivered', updatedAt: 20 }),
    )).toBe(true);
    expect(projectedTool().subagentTask).toMatchObject({
      status: 'completed',
      deliveryState: 'delivered',
    });
  });

  it('hydrates the same projection through the typed list API', async () => {
    vi.mocked(agentAPI.listSubagentTasks).mockResolvedValueOnce([
      task({ status: 'interrupted', recoveryState: 'queued' }),
    ]);

    await expect(hydrateSubagentTaskProjections(store, 'parent-1')).resolves.toBe(1);
    expect(projectedTool().subagentTask).toMatchObject({
      status: 'interrupted',
      recoveryState: 'queued',
    });
  });
});
