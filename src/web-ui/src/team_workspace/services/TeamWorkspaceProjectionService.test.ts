import { describe, expect, it, vi } from 'vitest';
import type {
  TeamDefinitionListSnapshot,
  TeamDefinitionRecord,
} from '@/infrastructure/config/types';
import type { TeamAuthoringGateway } from '@/shared/services/customization/TeamAuthoringGateway';
import type {
  TeamRuntimeGateway,
  TeamRuntimeList,
  TeamRuntimeRecord,
} from '@/shared/services/customization/TeamRuntimeGateway';
import { TeamWorkspaceProjectionService } from './TeamWorkspaceProjectionService';

function definitionRecord(
  revision = 'revision-1',
  teamDefinitionId = 'team-1',
): TeamDefinitionRecord {
  return {
    revision,
    level: 'project',
    path: `D:/repo/.void/teams/${teamDefinitionId}.json`,
    isAuthorable: true,
    definition: {
      schemaVersion: 1,
      teamDefinitionId,
      displayName: '软件交付团队',
      description: '负责稳定交付软件。',
      category: '技术工程',
      capabilityTags: ['研发'],
      scenarioEligibility: ['code'],
      leadMemberId: 'lead',
      members: [
        {
          memberId: 'lead',
          displayName: '研发主理人',
          professionalRole: '交付负责人',
          role: 'lead',
          instructions: '负责编排。',
          outputResponsibility: '汇总交付结果。',
          agentId: 'agentic',
          allowedSkillKeys: [],
          allowedToolNames: [],
          permissionPolicy: 'inherit_parent_intersection',
          isReadonly: false,
        },
        {
          memberId: 'developer',
          displayName: '开发工程师',
          professionalRole: '工程师',
          role: 'specialist',
          instructions: '负责实现。',
          outputResponsibility: '提交代码。',
          agentId: 'agentic',
          allowedSkillKeys: [],
          allowedToolNames: [],
          permissionPolicy: 'inherit_parent_intersection',
          isReadonly: false,
        },
      ],
      workflows: [{
        workflowId: 'delivery',
        displayName: '交付流程',
        triggerDescription: '实现软件需求。',
        phases: [
          {
            phaseId: 'build',
            displayName: '实现',
            kind: 'serial',
            dependsOnPhaseIds: [],
            assignedMemberIds: ['developer'],
            expectedOutputs: ['代码'],
            completionRule: '测试通过。',
          },
          {
            phaseId: 'review',
            displayName: '复核',
            kind: 'review',
            dependsOnPhaseIds: ['build'],
            assignedMemberIds: ['lead'],
            expectedOutputs: ['结论'],
            completionRule: '主理人接受。',
          },
        ],
      }],
      collaborationPolicy: 'lead_mediated',
      permissionPolicy: 'inherit_parent_intersection',
      origin: 'project',
    },
  };
}

function runtimeRecord(
  overrides: Partial<TeamRuntimeRecord['snapshot']> = {},
): TeamRuntimeRecord {
  const instance: TeamRuntimeRecord['snapshot']['instance'] = {
    schemaVersion: 1,
    teamInstanceId: 'instance-1',
    teamDefinitionId: 'team-1',
    teamDefinitionRevision: 'revision-1',
    workspace: {
      workspaceId: 'workspace-1',
      contextKey: 'local:D:/repo',
      backend: 'local',
    },
    parentSessionId: 'session-1',
    executionProfile: { kind: 'prompt_orchestrated' },
    leadBinding: { kind: 'parent_persona', parentSessionId: 'session-1' },
    memberBindings: [{ memberId: 'developer', childSessionId: 'child-1' }],
    activeRunId: 'run-1',
    lifecycle: 'ready',
    creationSource: 'persona_activation',
    createdAt: 1,
    updatedAt: 10,
  };
  return {
    schemaVersion: 1,
    revision: 3,
    snapshot: {
      instance,
      teamRuns: [{
        teamRunId: 'run-1',
        teamInstanceId: 'instance-1',
        workflowId: 'delivery',
        objective: '完成需求',
        parentDialogTurnId: 'turn-1',
        parentToolCallId: 'call-1',
        attempt: 1,
        status: 'running',
        createdAt: 2,
        updatedAt: 9,
      }],
      memberRuns: [{
        memberRunId: 'member-run-1',
        teamRunId: 'run-1',
        teamInstanceId: 'instance-1',
        memberId: 'developer',
        phaseId: 'build',
        childSessionId: 'child-1',
        attempt: 1,
        status: 'running',
        createdAt: 3,
        updatedAt: 8,
      }],
      phaseRuns: [{
        phaseRunId: 'phase-run-1',
        teamRunId: 'run-1',
        teamInstanceId: 'instance-1',
        workflowId: 'delivery',
        phaseId: 'build',
        attempt: 1,
        status: 'running',
        createdAt: 3,
        updatedAt: 8,
      }],
      ...overrides,
    },
  };
}

function retargetRuntime(
  record: TeamRuntimeRecord,
  input: {
    teamInstanceId: string;
    teamDefinitionId: string;
    teamDefinitionRevision: string;
    teamRunId: string;
  },
): TeamRuntimeRecord {
  record.snapshot.instance.teamInstanceId = input.teamInstanceId;
  record.snapshot.instance.teamDefinitionId = input.teamDefinitionId;
  record.snapshot.instance.teamDefinitionRevision = input.teamDefinitionRevision;
  record.snapshot.instance.activeRunId = input.teamRunId;
  for (const run of record.snapshot.teamRuns) {
    run.teamInstanceId = input.teamInstanceId;
    run.teamRunId = input.teamRunId;
  }
  for (const run of record.snapshot.memberRuns) {
    run.teamInstanceId = input.teamInstanceId;
    run.teamRunId = input.teamRunId;
  }
  for (const run of record.snapshot.phaseRuns) {
    run.teamInstanceId = input.teamInstanceId;
    run.teamRunId = input.teamRunId;
  }
  return record;
}

function gateways(
  runtime: TeamRuntimeList,
  definitions: TeamDefinitionListSnapshot = {
    status: 'ready',
    records: [definitionRecord()],
    diagnostics: [],
  },
) {
  const runtimeGateway: TeamRuntimeGateway = {
    list: vi.fn().mockResolvedValue(runtime),
    get: vi.fn(),
    attach: vi.fn(),
    observe: vi.fn(),
    message: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    recover: vi.fn(),
  };
  const definitionGateway: TeamAuthoringGateway = {
    list: vi.fn().mockResolvedValue(definitions),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    install: vi.fn(),
    delete: vi.fn(),
  };
  return { runtimeGateway, definitionGateway };
}

describe('TeamWorkspaceProjectionService', () => {
  it('按精确团队版本投影活动运行，并把缺失成员和阶段显式标记为未开始', async () => {
    const pair = gateways({ records: [runtimeRecord()], diagnostics: [] });
    const service = new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    );

    const snapshot = await service.read({
      parentSessionId: 'session-1',
      workspacePath: 'D:/repo',
    });

    expect(pair.definitionGateway.list).toHaveBeenCalledWith({
      workspacePath: 'D:/repo',
    });
    expect(snapshot).toMatchObject({
      status: 'ready',
      shouldPoll: true,
      activeTeam: {
        teamDefinitionId: 'team-1',
        teamDefinitionRevision: 'revision-1',
        activeRun: { status: 'running' },
      },
    });
    expect(snapshot.activeTeam?.members.map(member => ({
      id: member.definition.memberId,
      source: member.state.source,
      status: member.state.status,
    }))).toEqual([
      { id: 'lead', source: 'definition', status: 'not_started' },
      { id: 'developer', source: 'runtime', status: 'running' },
    ]);
    expect(snapshot.activeTeam?.phases.map(phase => ({
      id: phase.definition.phaseId,
      source: phase.state.source,
      status: phase.state.status,
    }))).toEqual([
      { id: 'build', source: 'runtime', status: 'running' },
      { id: 'review', source: 'definition', status: 'not_started' },
    ]);
  });

  it('没有运行时团队时返回明确的空 ready 快照且不读取定义', async () => {
    const pair = gateways({ records: [], diagnostics: [] });
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });

    expect(snapshot).toEqual({
      status: 'ready',
      parentSessionId: 'session-1',
      teams: [],
      activeTeam: null,
      issues: [],
      shouldPoll: false,
    });
    expect(pair.definitionGateway.list).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: '定义缺失',
      definitions: [] as TeamDefinitionRecord[],
      expectedCode: 'definition_missing',
    },
    {
      title: '定义修订不匹配',
      definitions: [definitionRecord('revision-2')],
      expectedCode: 'definition_revision_mismatch',
    },
    {
      title: '完全相同的定义修订重复',
      definitions: [definitionRecord(), definitionRecord()],
      expectedCode: 'definition_ambiguous',
    },
  ])('$title时 fail closed，不投影错版本', async ({ definitions, expectedCode }) => {
    const pair = gateways(
      { records: [runtimeRecord()], diagnostics: [] },
      { status: 'ready', records: definitions, diagnostics: [] },
    );
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });

    expect(snapshot.status).toBe('error');
    expect(snapshot.teams).toEqual([]);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: expectedCode,
      teamDefinitionId: 'team-1',
    }));
  });

  it('保留运行时与定义读取诊断，不用空数组伪装正常', async () => {
    const pair = gateways(
      {
        records: [runtimeRecord()],
        diagnostics: [{
          recordId: 'broken-runtime',
          code: 'invalid_json',
          message: 'bad runtime json',
        }],
      },
      {
        status: 'partial',
        records: [definitionRecord()],
        diagnostics: [{
          path: 'D:/repo/broken-team.json',
          error: { code: 'invalid_schema', message: 'bad definition' },
        }],
      },
    );
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });

    expect(snapshot.status).toBe('partial');
    expect(snapshot.teams).toHaveLength(1);
    expect(snapshot.issues.map(issue => issue.code)).toEqual([
      'runtime_diagnostic',
      'definition_diagnostic',
    ]);
  });

  it('activeRunId 指向缺失运行时产生显式错误而不是猜测其他运行', async () => {
    const record = runtimeRecord();
    record.snapshot.instance.activeRunId = 'missing-run';
    const pair = gateways({ records: [record], diagnostics: [] });
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });

    expect(snapshot.status).toBe('partial');
    expect(snapshot.shouldPoll).toBe(true);
    expect(snapshot.activeTeam?.activeRun).toBeNull();
    expect(snapshot.activeTeam?.members.every(
      member => member.state.source === 'definition',
    )).toBe(true);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: 'active_run_missing',
      runId: 'missing-run',
    }));
  });

  it('无 activeRunId 时稳定选择最大 attempt，并检测相同版本时间戳冲突', async () => {
    const latest = runtimeRecord();
    delete latest.snapshot.instance.activeRunId;
    latest.snapshot.teamRuns = [
      { ...latest.snapshot.teamRuns[0]!, teamRunId: 'run-old', attempt: 1 },
      { ...latest.snapshot.teamRuns[0]!, teamRunId: 'run-new', attempt: 2 },
    ];
    latest.snapshot.memberRuns = [];
    latest.snapshot.phaseRuns = [];
    const latestPair = gateways({ records: [latest], diagnostics: [] });
    const selected = await new TeamWorkspaceProjectionService(
      latestPair.runtimeGateway,
      latestPair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });
    expect(selected.activeTeam?.activeRun?.run.teamRunId).toBe('run-new');

    const conflict = runtimeRecord();
    delete conflict.snapshot.instance.activeRunId;
    conflict.snapshot.teamRuns = [
      { ...conflict.snapshot.teamRuns[0]!, teamRunId: 'run-a', attempt: 2 },
      { ...conflict.snapshot.teamRuns[0]!, teamRunId: 'run-b', attempt: 2 },
    ];
    const conflictPair = gateways({ records: [conflict], diagnostics: [] });
    const ambiguous = await new TeamWorkspaceProjectionService(
      conflictPair.runtimeGateway,
      conflictPair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });
    expect(ambiguous.activeTeam?.activeRun).toBeNull();
    expect(ambiguous.issues).toContainEqual(expect.objectContaining({
      code: 'latest_run_ambiguous',
    }));
  });

  it('成员和阶段最大 attempt 冲突时输出 unavailable 状态及对应问题', async () => {
    const record = runtimeRecord();
    record.snapshot.memberRuns.push({
      ...record.snapshot.memberRuns[0]!,
      memberRunId: 'member-run-duplicate',
    });
    record.snapshot.phaseRuns.push({
      ...record.snapshot.phaseRuns[0]!,
      phaseRunId: 'phase-run-duplicate',
    });
    const pair = gateways({ records: [record], diagnostics: [] });
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({ parentSessionId: 'session-1' });

    expect(snapshot.activeTeam?.members[1]?.state).toMatchObject({
      source: 'projection',
      status: 'unavailable',
      issueCode: 'member_run_ambiguous',
    });
    expect(snapshot.activeTeam?.phases[0]?.state).toMatchObject({
      source: 'projection',
      status: 'unavailable',
      issueCode: 'phase_run_ambiguous',
    });
    expect(snapshot.issues.map(issue => issue.code)).toEqual([
      'member_run_ambiguous',
      'phase_run_ambiguous',
    ]);
  });

  it('绑定团队时精确选择实例，旧 running 团队不能按更新时间抢占且不驱动轮询', async () => {
    const oldRunning = runtimeRecord();
    oldRunning.snapshot.instance.updatedAt = 100;
    const bound = retargetRuntime(runtimeRecord(), {
      teamInstanceId: 'instance-2',
      teamDefinitionId: 'team-2',
      teamDefinitionRevision: 'revision-2',
      teamRunId: 'run-2',
    });
    bound.snapshot.instance.updatedAt = 20;
    bound.snapshot.teamRuns[0]!.status = 'completed';
    const pair = gateways(
      { records: [oldRunning, bound], diagnostics: [] },
      {
        status: 'ready',
        records: [definitionRecord(), definitionRecord('revision-2', 'team-2')],
        diagnostics: [],
      },
    );

    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({
      parentSessionId: 'session-1',
      teamDefinitionId: 'team-2',
      teamInstanceId: 'instance-2',
    });

    expect(snapshot.activeTeam?.teamInstanceId).toBe('instance-2');
    expect(snapshot.activeTeam?.teamDefinitionId).toBe('team-2');
    expect(snapshot.shouldPoll).toBe(false);
    expect(snapshot.teams.find(team => team.teamInstanceId === 'instance-1')
      ?.activeRun?.status).toBe('running');
  });

  it('绑定新版本团队时旧实例的定义版本问题不污染当前工作区', async () => {
    const obsolete = runtimeRecord();
    obsolete.snapshot.instance.teamDefinitionRevision = 'obsolete-revision';
    const bound = retargetRuntime(runtimeRecord(), {
      teamInstanceId: 'instance-2',
      teamDefinitionId: 'team-2',
      teamDefinitionRevision: 'revision-2',
      teamRunId: 'run-2',
    });
    const pair = gateways(
      { records: [obsolete, bound], diagnostics: [] },
      {
        status: 'ready',
        records: [definitionRecord('revision-2', 'team-2')],
        diagnostics: [],
      },
    );

    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({
      parentSessionId: 'session-1',
      teamDefinitionId: 'team-2',
      teamInstanceId: 'instance-2',
    });

    expect(snapshot.activeTeam?.teamInstanceId).toBe('instance-2');
    expect(snapshot.issues).not.toContainEqual(expect.objectContaining({
      code: 'definition_revision_mismatch',
      teamInstanceId: 'instance-1',
    }));
  });

  it.each([
    {
      title: '绑定实例缺失',
      teamDefinitionId: 'team-2',
      teamInstanceId: 'missing-instance',
      expectedCode: 'bound_team_runtime_missing',
    },
    {
      title: '绑定实例属于其他定义',
      teamDefinitionId: 'team-2',
      teamInstanceId: 'instance-1',
      expectedCode: 'bound_team_definition_mismatch',
    },
  ])('$title时不回退选择旧团队', async ({
    teamDefinitionId,
    teamInstanceId,
    expectedCode,
  }) => {
    const pair = gateways({ records: [runtimeRecord()], diagnostics: [] });
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({ parentSessionId: 'session-1', teamDefinitionId, teamInstanceId });

    expect(snapshot.activeTeam).toBeNull();
    expect(snapshot.shouldPoll).toBe(false);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: expectedCode,
      teamDefinitionId,
      teamInstanceId,
    }));
  });

  it('绑定身份不完整时在调用 gateway 前显式拒绝', async () => {
    const pair = gateways({ records: [runtimeRecord()], diagnostics: [] });
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({
      parentSessionId: 'session-1',
      teamDefinitionId: 'team-1',
    });

    expect(snapshot).toMatchObject({
      status: 'error',
      activeTeam: null,
      shouldPoll: false,
      issues: [{ code: 'active_team_binding_incomplete' }],
    });
    expect(pair.runtimeGateway.list).not.toHaveBeenCalled();
    expect(pair.definitionGateway.list).not.toHaveBeenCalled();
  });

  it('空白绑定身份不会退回到按运行状态猜测团队', async () => {
    const pair = gateways({ records: [runtimeRecord()], diagnostics: [] });
    const snapshot = await new TeamWorkspaceProjectionService(
      pair.runtimeGateway,
      pair.definitionGateway,
    ).read({
      parentSessionId: 'session-1',
      teamDefinitionId: '   ',
      teamInstanceId: '   ',
    });

    expect(snapshot).toMatchObject({
      status: 'error',
      activeTeam: null,
      shouldPoll: false,
      issues: [{ code: 'active_team_binding_incomplete' }],
    });
    expect(pair.runtimeGateway.list).not.toHaveBeenCalled();
  });
});
