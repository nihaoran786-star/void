import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttachTeamRuntimeInput,
  TeamRuntimeApiError,
  TeamRuntimeMutationResponse,
} from '../TeamRuntimeGateway';
import { DesktopTeamRuntimeAdapter } from './DesktopTeamRuntimeAdapter';

const apiInvokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/api', () => ({
  api: {
    invoke: apiInvokeMock,
  },
}));

const rejectedOutcome: TeamRuntimeMutationResponse = {
  outcome: {
    operationId: 'operation-1',
    accepted: false,
    operationIds: [],
    notes: ['The operation was rejected without a transport failure.'],
    error: {
      code: 'runtime_conflict',
      message: 'The Team run is already active.',
      retryable: false,
    },
  },
  record: null,
};

const attachInput: AttachTeamRuntimeInput = {
  operationId: 'operation-1',
  parentSessionId: 'parent-1',
  teamInstanceId: 'team-instance-1',
  teamDefinitionId: 'team-definition-1',
  teamDefinitionRevision: 'revision-1',
  creationSource: 'user_attachment',
};

describe('DesktopTeamRuntimeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiInvokeMock.mockResolvedValue(rejectedOutcome);
  });

  it('逐字段映射九个公开 Team runtime 命令到 Tauri request DTO', async () => {
    const adapter = new DesktopTeamRuntimeAdapter();

    await adapter.list({ parentSessionId: 'parent-1' });
    await adapter.get({
      parentSessionId: 'parent-1',
      teamInstanceId: 'team-instance-1',
    });
    await adapter.attach(attachInput);
    await adapter.observe({
      operationId: 'operation-observe',
      parentSessionId: 'parent-1',
      teamInstanceId: 'team-instance-1',
    });
    await adapter.message({
      operationId: 'operation-message',
      parentSessionId: 'parent-1',
      teamInstanceId: 'team-instance-1',
      teamRunId: 'team-run-1',
      memberId: 'member-1',
      message: 'Please report progress.',
    });
    const runInput = {
      operationId: 'operation-run',
      parentSessionId: 'parent-1',
      teamInstanceId: 'team-instance-1',
      teamRunId: 'team-run-1',
    };
    await adapter.pause(runInput);
    await adapter.resume(runInput);
    await adapter.stop(runInput);
    await adapter.recover({
      operationId: 'operation-recover',
      parentSessionId: 'parent-1',
      teamInstanceId: 'team-instance-1',
    });

    expect(apiInvokeMock.mock.calls).toEqual([
      ['team_runtime_list', {
        request: { parentSessionId: 'parent-1' },
      }],
      ['team_runtime_get', {
        request: {
          parentSessionId: 'parent-1',
          teamInstanceId: 'team-instance-1',
        },
      }],
      ['team_runtime_attach', { request: attachInput }],
      ['team_runtime_observe', {
        request: {
          operationId: 'operation-observe',
          parentSessionId: 'parent-1',
          teamInstanceId: 'team-instance-1',
        },
      }],
      ['team_runtime_message', {
        request: {
          operationId: 'operation-message',
          parentSessionId: 'parent-1',
          teamInstanceId: 'team-instance-1',
          teamRunId: 'team-run-1',
          memberId: 'member-1',
          message: 'Please report progress.',
        },
      }],
      ['team_runtime_pause', { request: runInput }],
      ['team_runtime_resume', { request: runInput }],
      ['team_runtime_stop', { request: runInput }],
      ['team_runtime_recover', {
        request: {
          operationId: 'operation-recover',
          parentSessionId: 'parent-1',
          teamInstanceId: 'team-instance-1',
        },
      }],
    ]);
  });

  it('不向桌面命令透传 workspace、scenario 或 permission', async () => {
    const adapter = new DesktopTeamRuntimeAdapter();
    const hostileInput = {
      ...attachInput,
      workspace: { workspaceId: 'forged-workspace' },
      scenario: 'media',
      permission: 'allow_all',
    } as AttachTeamRuntimeInput & Record<string, unknown>;

    await adapter.attach(hostileInput);

    expect(apiInvokeMock).toHaveBeenCalledWith('team_runtime_attach', {
      request: attachInput,
    });
  });

  it('把 accepted:false 当作正常结果返回', async () => {
    const adapter = new DesktopTeamRuntimeAdapter();

    await expect(adapter.attach(attachInput)).resolves.toBe(rejectedOutcome);
  });

  it('原样保留 api.invoke 拒绝时的结构化错误', async () => {
    const adapter = new DesktopTeamRuntimeAdapter();
    const error: TeamRuntimeApiError = {
      code: 'parent_session_not_restored',
      message: 'The parent session must be restored.',
      retryable: false,
      recoveryAction: 'restore_parent_session',
    };
    apiInvokeMock.mockRejectedValueOnce(error);

    await expect(adapter.attach(attachInput)).rejects.toBe(error);
  });
});
