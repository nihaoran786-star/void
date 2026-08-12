import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AttachTeamRuntimeInput,
  TeamRuntimeGateway,
  TeamRuntimeRecord,
} from './TeamRuntimeGateway';

const record: TeamRuntimeRecord = {
  schemaVersion: 1,
  revision: 2,
  snapshot: {
    instance: {
      schemaVersion: 1,
      teamInstanceId: 'team-instance-1',
      teamDefinitionId: 'team-definition-1',
      teamDefinitionRevision: 'revision-1',
      workspace: {
        workspaceId: 'workspace-1',
        contextKey: 'local:D:/workspace',
        backend: 'local',
      },
      parentSessionId: 'parent-1',
      executionProfile: { kind: 'prompt_orchestrated' },
      leadBinding: {
        kind: 'parent_persona',
        parentSessionId: 'parent-1',
      },
      memberBindings: [{
        memberId: 'member-1',
        childSessionId: 'child-1',
        subagentTaskId: 'task-1',
      }],
      activeRunId: 'team-run-1',
      lifecycle: 'ready',
      creationSource: 'user_attachment',
      createdAt: 100,
      updatedAt: 110,
    },
    teamRuns: [{
      teamRunId: 'team-run-1',
      teamInstanceId: 'team-instance-1',
      workflowId: 'workflow-1',
      objective: 'Ship the feature',
      parentDialogTurnId: 'dialog-turn-1',
      parentToolCallId: 'tool-call-1',
      attempt: 1,
      status: 'running',
      createdAt: 101,
      updatedAt: 110,
      startedAt: 102,
    }],
    memberRuns: [{
      memberRunId: 'member-run-1',
      teamRunId: 'team-run-1',
      teamInstanceId: 'team-instance-1',
      memberId: 'member-1',
      phaseId: 'phase-1',
      operationId: 'operation-1',
      parentDialogTurnId: 'dialog-turn-1',
      parentToolCallId: 'tool-call-1',
      agentId: 'agent-1',
      childSessionId: 'child-1',
      subagentTaskId: 'task-1',
      appliedOperationIds: ['operation-1'],
      attempt: 1,
      status: 'running',
      createdAt: 103,
      updatedAt: 110,
      startedAt: 104,
    }],
    phaseRuns: [{
      phaseRunId: 'phase-run-1',
      teamRunId: 'team-run-1',
      teamInstanceId: 'team-instance-1',
      workflowId: 'workflow-1',
      phaseId: 'phase-1',
      attempt: 1,
      status: 'running',
      createdAt: 103,
      updatedAt: 110,
      startedAt: 104,
    }],
  },
};

describe('TeamRuntimeGateway contract', () => {
  it('镜像 Rust serde 的 durable runtime record 字段和值', () => {
    expect(record.snapshot.instance.executionProfile).toEqual({
      kind: 'prompt_orchestrated',
    });
    expect(record.snapshot.teamRuns[0]?.status).toBe('running');
    expect(record.snapshot.memberRuns[0]?.appliedOperationIds).toEqual([
      'operation-1',
    ]);
    expect(record.snapshot.phaseRuns[0]?.status).toBe('running');
  });

  it('公开强类型运行时操作与委派任务读取', () => {
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('list');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('get');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('attach');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('observe');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('message');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('pause');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('resume');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('stop');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('recover');
    expectTypeOf<TeamRuntimeGateway>().toHaveProperty('listDelegatedTasks');
  });

  it('attach 输入不拥有宿主推导的权限和工作区字段', () => {
    expectTypeOf<keyof AttachTeamRuntimeInput>().not.toEqualTypeOf<'workspace'>();
    expectTypeOf<keyof AttachTeamRuntimeInput>().not.toEqualTypeOf<'scenario'>();
    expectTypeOf<keyof AttachTeamRuntimeInput>().not.toEqualTypeOf<'permission'>();
  });
});
