import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentAPI, normalizeSubagentTaskRecord } from './AgentAPI';

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock('./ApiClient', () => ({
  api: {
    invoke: invokeMock,
    listen: listenMock,
  },
}));

describe('AgentAPI', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockReset();
    listenMock.mockReturnValue(() => {});
  });

  it('sends subagent timeout controls with the desktop command request shape', async () => {
    await agentAPI.setSubagentTimeout('subagent-session', { type: 'disable' });

    expect(invokeMock).toHaveBeenCalledWith('set_subagent_timeout', {
      request: {
        sessionId: 'subagent-session',
        action: { type: 'Disable', payload: null },
      },
    });
  });

  it('sends subagent timeout extensions with seconds in the action payload', async () => {
    await agentAPI.setSubagentTimeout('subagent-session', { type: 'extend', seconds: 300 });

    expect(invokeMock).toHaveBeenCalledWith('set_subagent_timeout', {
      request: {
        sessionId: 'subagent-session',
        action: { type: 'Extend', payload: { seconds: 300 } },
      },
    });
  });

  it('normalizes persisted snake-case subagent task records', () => {
    expect(normalizeSubagentTaskRecord({
      schema_version: 2,
      task_id: 'bg-1',
      parent_session_id: 'parent-1',
      child_session_id: 'child-1',
      objective: 'Inspect runtime',
      execution_mode: 'background',
      context_mode: 'fork',
      status: 'running',
      owner: 'worker-1',
      delivery_state: 'pending',
      delivery_replay_safety: 'idempotent',
      delivery_idempotency_key: 'delivery-1',
      delivery_attempts: 1,
      recovery_state: 'queued',
      durable_checkpoint: {
        checkpoint_id: 'checkpoint-1',
        session_id: 'child-1',
        checkpoint_version: 1,
      },
      created_at: 10,
      updated_at: 20,
    })).toMatchObject({
      schemaVersion: 2,
      taskId: 'bg-1',
      parentSessionId: 'parent-1',
      childSessionId: 'child-1',
      status: 'running',
      recoveryState: 'queued',
      durableCheckpoint: {
        checkpointId: 'checkpoint-1',
        sessionId: 'child-1',
      },
    });
  });

  it('lists and normalizes persisted subagent tasks', async () => {
    invokeMock.mockResolvedValueOnce([{
      schema_version: 2,
      task_id: 'bg-1',
      parent_session_id: 'parent-1',
      objective: 'Inspect runtime',
      execution_mode: 'background',
      context_mode: 'fresh',
      status: 'completed',
      owner: 'worker-1',
      delivery_state: 'delivered',
      delivery_replay_safety: 'idempotent',
      delivery_idempotency_key: 'delivery-1',
      delivery_attempts: 1,
      recovery_state: 'none',
      created_at: 10,
      updated_at: 20,
    }]);

    await expect(agentAPI.listSubagentTasks('parent-1')).resolves.toEqual([
      expect.objectContaining({
        taskId: 'bg-1',
        parentSessionId: 'parent-1',
        status: 'completed',
      }),
    ]);
    expect(invokeMock).toHaveBeenCalledWith('list_subagent_tasks', {
      request: { parentSessionId: 'parent-1' },
    });
  });

  it('normalizes task-change events before exposing them to Flow Chat', () => {
    const callback = vi.fn();
    agentAPI.onSubagentTaskChanged(callback);
    const [, listener] = listenMock.mock.calls[0];

    listener({
      sessionId: 'parent-1',
      task: {
        schema_version: 2,
        task_id: 'bg-1',
        parent_session_id: 'parent-1',
        objective: 'Inspect runtime',
        execution_mode: 'background',
        context_mode: 'fresh',
        status: 'running',
        owner: 'worker-1',
        delivery_state: 'pending',
        delivery_replay_safety: 'idempotent',
        delivery_idempotency_key: 'delivery-1',
        delivery_attempts: 0,
        recovery_state: 'none',
        created_at: 10,
        updated_at: 20,
      },
    });

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'parent-1',
      task: expect.objectContaining({ taskId: 'bg-1', status: 'running' }),
    }));
  });

  it('rejects future schemas and unknown lifecycle enums instead of inferring defaults', () => {
    const valid = {
      schema_version: 3,
      task_id: 'bg-1',
      parent_session_id: 'parent-1',
      objective: 'Inspect runtime',
      execution_mode: 'background',
      context_mode: 'fresh',
      status: 'running',
      owner: 'worker-1',
      delivery_state: 'pending',
      delivery_replay_safety: 'idempotent',
      delivery_idempotency_key: 'delivery-1',
      delivery_attempts: 0,
      recovery_state: 'none',
      created_at: 10,
      updated_at: 20,
    };

    expect(normalizeSubagentTaskRecord({ ...valid, schema_version: 4 })).toBeNull();
    expect(normalizeSubagentTaskRecord({ ...valid, execution_mode: 'automatic' })).toBeNull();
    expect(normalizeSubagentTaskRecord({ ...valid, context_mode: 'shared' })).toBeNull();
    expect(normalizeSubagentTaskRecord({
      ...valid,
      delivery_replay_safety: 'probably_safe',
    })).toBeNull();
  });

  it('preserves typed V3 recovery blocks and rejects malformed codes', () => {
    const value = {
      schema_version: 3,
      task_id: 'bg-1',
      parent_session_id: 'parent-1',
      objective: 'Inspect runtime',
      execution_mode: 'background',
      context_mode: 'fresh',
      status: 'interrupted',
      owner: 'worker-1',
      delivery_state: 'blocked',
      delivery_replay_safety: 'idempotent',
      delivery_idempotency_key: 'delivery-1',
      delivery_attempts: 1,
      recovery_state: 'blocked',
      recovery_block: {
        code: 'missing_launch_spec',
        detail: 'Launch inputs were not persisted by the legacy task.',
      },
      created_at: 10,
      updated_at: 20,
    };

    expect(normalizeSubagentTaskRecord(value)?.recoveryBlock).toEqual({
      code: 'missing_launch_spec',
      detail: 'Launch inputs were not persisted by the legacy task.',
    });
    expect(normalizeSubagentTaskRecord({
      ...value,
      recovery_block: { code: 'unknown', detail: 'Nope' },
    })).toBeNull();
  });
});
