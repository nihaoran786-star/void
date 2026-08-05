import type {
  TeamDefinitionDiagnostic,
  TeamDefinitionRecord,
  TeamMemberDefinition,
  TeamWorkflowPhaseDefinition,
} from '@/infrastructure/config/types';
import {
  existingTeamDefinitionAdapter,
} from '@/shared/services/customization/adapters/ExistingTeamDefinitionAdapter';
import {
  desktopTeamRuntimeAdapter,
} from '@/shared/services/customization/adapters/DesktopTeamRuntimeAdapter';
import type { TeamAuthoringGateway } from '@/shared/services/customization/TeamAuthoringGateway';
import type {
  TeamRun,
  TeamRuntimeDiagnostic,
  TeamRuntimeGateway,
  TeamRuntimeRecord,
} from '@/shared/services/customization/TeamRuntimeGateway';
import type {
  ReadTeamWorkspaceInput,
  TeamWorkspaceIssue,
  TeamWorkspaceMemberProjection,
  TeamWorkspacePhaseProjection,
  TeamWorkspaceProjectionReader,
  TeamWorkspaceSnapshot,
  TeamWorkspaceTeamProjection,
} from '../types';

const TERMINAL_RUN_STATUSES = new Set<TeamRun['status']>([
  'completed',
  'failed',
  'interrupted',
  'cancelled',
]);

type AttemptRecord = {
  attempt: number;
  updatedAt: number;
  createdAt: number;
};

interface AttemptSelection<T> {
  record: T | null;
  ambiguous: boolean;
}

function selectLatestAttempt<T extends AttemptRecord>(
  records: readonly T[],
): AttemptSelection<T> {
  if (records.length === 0) return { record: null, ambiguous: false };
  const ordered = [...records].sort((left, right) => (
    right.attempt - left.attempt
    || right.updatedAt - left.updatedAt
    || right.createdAt - left.createdAt
  ));
  const first = ordered[0];
  if (!first) return { record: null, ambiguous: false };
  const ambiguous = ordered.slice(1).some(candidate => (
    candidate.attempt === first.attempt
    && candidate.updatedAt === first.updatedAt
    && candidate.createdAt === first.createdAt
  ));
  return { record: ambiguous ? null : first, ambiguous };
}

function runtimeDiagnosticIssue(
  diagnostic: TeamRuntimeDiagnostic,
): TeamWorkspaceIssue {
  return {
    code: 'runtime_diagnostic',
    source: 'runtime_gateway',
    message: `${diagnostic.code}: ${diagnostic.message}`,
    retryable: diagnostic.code === 'io',
    recordId: diagnostic.recordId,
  };
}

function definitionDiagnosticIssue(
  diagnostic: TeamDefinitionDiagnostic,
): TeamWorkspaceIssue {
  return {
    code: 'definition_diagnostic',
    source: 'definition_gateway',
    message: `${diagnostic.error.code}: ${diagnostic.error.message}`,
    retryable: diagnostic.error.code === 'read_failed',
    recordId: diagnostic.path,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createIssue(
  issue: TeamWorkspaceIssue,
): TeamWorkspaceIssue {
  return issue;
}

function selectActiveRun(
  record: TeamRuntimeRecord,
  issues: TeamWorkspaceIssue[],
): TeamRun | null {
  const { instance, teamRuns } = record.snapshot;
  const scopedRuns = teamRuns.filter(
    run => run.teamInstanceId === instance.teamInstanceId,
  );

  if (instance.activeRunId) {
    const matches = scopedRuns.filter(
      run => run.teamRunId === instance.activeRunId,
    );
    if (matches.length === 1) return matches[0] ?? null;
    issues.push(createIssue({
      code: matches.length === 0 ? 'active_run_missing' : 'active_run_ambiguous',
      source: 'runtime_record',
      message: matches.length === 0
        ? `Active run ${instance.activeRunId} is missing from the runtime record.`
        : `Active run ${instance.activeRunId} is duplicated in the runtime record.`,
      retryable: true,
      teamDefinitionId: instance.teamDefinitionId,
      teamInstanceId: instance.teamInstanceId,
      runId: instance.activeRunId,
    }));
    return null;
  }

  const selection = selectLatestAttempt(scopedRuns);
  if (selection.ambiguous) {
    issues.push(createIssue({
      code: 'latest_run_ambiguous',
      source: 'runtime_record',
      message: 'The latest team run attempt is ambiguous.',
      retryable: true,
      teamDefinitionId: instance.teamDefinitionId,
      teamInstanceId: instance.teamInstanceId,
    }));
  }
  return selection.record;
}

function projectMember(
  member: TeamMemberDefinition,
  record: TeamRuntimeRecord,
  activeRun: TeamRun | null,
  issues: TeamWorkspaceIssue[],
): TeamWorkspaceMemberProjection {
  const binding = record.snapshot.instance.memberBindings.find(
    candidate => candidate.memberId === member.memberId,
  );
  if (!activeRun) {
    return {
      definition: member,
      state: { source: 'definition', status: 'not_started' },
      childSessionId: binding?.childSessionId,
      subagentTaskId: binding?.subagentTaskId,
    };
  }

  const selection = selectLatestAttempt(record.snapshot.memberRuns.filter(
    run => run.teamRunId === activeRun.teamRunId
      && run.teamInstanceId === record.snapshot.instance.teamInstanceId
      && run.memberId === member.memberId,
  ));
  if (selection.ambiguous) {
    issues.push(createIssue({
      code: 'member_run_ambiguous',
      source: 'runtime_record',
      message: `The latest member run for ${member.memberId} is ambiguous.`,
      retryable: true,
      teamDefinitionId: record.snapshot.instance.teamDefinitionId,
      teamInstanceId: record.snapshot.instance.teamInstanceId,
      runId: activeRun.teamRunId,
      memberId: member.memberId,
    }));
    return {
      definition: member,
      state: {
        source: 'projection',
        status: 'unavailable',
        issueCode: 'member_run_ambiguous',
      },
      childSessionId: binding?.childSessionId,
      subagentTaskId: binding?.subagentTaskId,
    };
  }
  const run = selection.record;
  return {
    definition: member,
    state: run
      ? { source: 'runtime', status: run.status, run }
      : { source: 'definition', status: 'not_started' },
    childSessionId: run?.childSessionId ?? binding?.childSessionId,
    subagentTaskId: run?.subagentTaskId ?? binding?.subagentTaskId,
  };
}

function projectPhase(
  phase: TeamWorkflowPhaseDefinition,
  record: TeamRuntimeRecord,
  activeRun: TeamRun,
  issues: TeamWorkspaceIssue[],
): TeamWorkspacePhaseProjection {
  const selection = selectLatestAttempt(record.snapshot.phaseRuns.filter(
    run => run.teamRunId === activeRun.teamRunId
      && run.teamInstanceId === record.snapshot.instance.teamInstanceId
      && run.workflowId === activeRun.workflowId
      && run.phaseId === phase.phaseId,
  ));
  if (selection.ambiguous) {
    issues.push(createIssue({
      code: 'phase_run_ambiguous',
      source: 'runtime_record',
      message: `The latest phase run for ${phase.phaseId} is ambiguous.`,
      retryable: true,
      teamDefinitionId: record.snapshot.instance.teamDefinitionId,
      teamInstanceId: record.snapshot.instance.teamInstanceId,
      runId: activeRun.teamRunId,
      phaseId: phase.phaseId,
    }));
    return {
      definition: phase,
      state: {
        source: 'projection',
        status: 'unavailable',
        issueCode: 'phase_run_ambiguous',
      },
    };
  }
  const run = selection.record;
  return {
    definition: phase,
    state: run
      ? { source: 'runtime', status: run.status, run }
      : { source: 'definition', status: 'not_started' },
  };
}

function projectTeam(
  runtimeRecord: TeamRuntimeRecord,
  definitionRecord: TeamDefinitionRecord,
): TeamWorkspaceTeamProjection {
  const { instance } = runtimeRecord.snapshot;
  const issues: TeamWorkspaceIssue[] = [];
  const activeRun = selectActiveRun(runtimeRecord, issues);
  const workflow = activeRun
    ? definitionRecord.definition.workflows.find(
        candidate => candidate.workflowId === activeRun.workflowId,
      ) ?? null
    : null;

  if (activeRun && !workflow) {
    issues.push(createIssue({
      code: 'workflow_missing',
      source: 'definition_record',
      message: `Workflow ${activeRun.workflowId} is missing from the matched definition.`,
      retryable: false,
      teamDefinitionId: instance.teamDefinitionId,
      teamInstanceId: instance.teamInstanceId,
      runId: activeRun.teamRunId,
    }));
  }

  const memberIds = new Set(
    definitionRecord.definition.members.map(member => member.memberId),
  );
  for (const run of runtimeRecord.snapshot.memberRuns) {
    if (
      activeRun
      && run.teamRunId === activeRun.teamRunId
      && !memberIds.has(run.memberId)
    ) {
      issues.push(createIssue({
        code: 'unknown_member_run',
        source: 'runtime_record',
        message: `Member run references unknown member ${run.memberId}.`,
        retryable: false,
        teamDefinitionId: instance.teamDefinitionId,
        teamInstanceId: instance.teamInstanceId,
        runId: activeRun.teamRunId,
        memberId: run.memberId,
      }));
    }
  }

  const phaseIds = new Set(workflow?.phases.map(phase => phase.phaseId) ?? []);
  for (const run of runtimeRecord.snapshot.phaseRuns) {
    if (
      activeRun
      && run.teamRunId === activeRun.teamRunId
      && run.workflowId === activeRun.workflowId
      && !phaseIds.has(run.phaseId)
    ) {
      issues.push(createIssue({
        code: 'unknown_phase_run',
        source: 'runtime_record',
        message: `Phase run references unknown phase ${run.phaseId}.`,
        retryable: false,
        teamDefinitionId: instance.teamDefinitionId,
        teamInstanceId: instance.teamInstanceId,
        runId: activeRun.teamRunId,
        phaseId: run.phaseId,
      }));
    }
  }

  // The Team lead is the active persona of the parent conversation. It is not
  // a child agent and must never be projected into the right-side member
  // workspace, even when an older definition/runtime happens to contain a lead
  // binding alongside specialist bindings.
  const members = definitionRecord.definition.members
    .filter(member => (
      member.memberId !== definitionRecord.definition.leadMemberId
      && member.role !== 'lead'
    ))
    .map(member => projectMember(member, runtimeRecord, activeRun, issues));
  const phases = workflow?.phases.map(phase => (
    projectPhase(phase, runtimeRecord, activeRun as TeamRun, issues)
  )) ?? [];
  const isTerminal = instance.lifecycle === 'unavailable'
    || instance.lifecycle === 'archived'
    || (
      instance.lifecycle === 'ready'
      && !instance.activeRunId
      && (!activeRun || TERMINAL_RUN_STATUSES.has(activeRun.status))
    )
    || (
      instance.lifecycle === 'ready'
      && Boolean(activeRun)
      && TERMINAL_RUN_STATUSES.has(activeRun?.status ?? 'running')
    );

  return {
    teamInstanceId: instance.teamInstanceId,
    teamDefinitionId: instance.teamDefinitionId,
    teamDefinitionRevision: instance.teamDefinitionRevision,
    runtimeRevision: runtimeRecord.revision,
    definition: definitionRecord.definition,
    lifecycle: instance.lifecycle,
    runtimeError: instance.error,
    activeRun: activeRun
      ? { source: 'runtime', status: activeRun.status, run: activeRun, workflow }
      : null,
    members,
    phases,
    issues,
    updatedAt: instance.updatedAt,
    isTerminal,
  };
}

function selectActiveTeam(
  teams: TeamWorkspaceTeamProjection[],
  issues: TeamWorkspaceIssue[],
): TeamWorkspaceTeamProjection | null {
  if (teams.length === 0) return null;
  if (teams.length === 1) return teams[0] ?? null;

  const running = teams.filter(team => team.activeRun && !team.isTerminal);
  if (running.length === 1) return running[0] ?? null;
  if (running.length > 1) {
    issues.push(createIssue({
      code: 'active_team_ambiguous',
      source: 'projection',
      message: 'More than one team has an active non-terminal run.',
      retryable: true,
    }));
    return null;
  }

  const ordered = [...teams].sort((left, right) => right.updatedAt - left.updatedAt);
  const first = ordered[0];
  if (!first) return null;
  if (ordered[1]?.updatedAt === first.updatedAt) {
    issues.push(createIssue({
      code: 'active_team_ambiguous',
      source: 'projection',
      message: 'The most recently updated team is ambiguous.',
      retryable: true,
    }));
    return null;
  }
  return first;
}

function snapshotStatus(
  teams: TeamWorkspaceTeamProjection[],
  issues: TeamWorkspaceIssue[],
): TeamWorkspaceSnapshot['status'] {
  if (issues.length === 0) return 'ready';
  return teams.length > 0 ? 'partial' : 'error';
}

export class TeamWorkspaceProjectionService
implements TeamWorkspaceProjectionReader {
  constructor(
    private readonly runtimeGateway: TeamRuntimeGateway,
    private readonly definitionGateway: TeamAuthoringGateway,
  ) {}

  async read(input: ReadTeamWorkspaceInput): Promise<TeamWorkspaceSnapshot> {
    const boundTeamDefinitionId = input.teamDefinitionId?.trim() || undefined;
    const boundTeamInstanceId = input.teamInstanceId?.trim() || undefined;
    const hasTeamDefinitionBinding = Boolean(boundTeamDefinitionId);
    const hasTeamInstanceBinding = Boolean(boundTeamInstanceId);
    const hasBindingInput = input.teamDefinitionId !== undefined
      || input.teamInstanceId !== undefined;
    if (
      hasBindingInput
      && (!hasTeamDefinitionBinding || !hasTeamInstanceBinding)
    ) {
      const issue = createIssue({
        code: 'active_team_binding_incomplete',
        source: 'projection',
        message: 'An active team binding requires both teamDefinitionId and teamInstanceId.',
        retryable: false,
        teamDefinitionId: boundTeamDefinitionId,
        teamInstanceId: boundTeamInstanceId,
      });
      return {
        status: 'error',
        parentSessionId: input.parentSessionId,
        teams: [],
        activeTeam: null,
        issues: [issue],
        shouldPoll: false,
      };
    }
    const hasActiveTeamBinding = hasTeamDefinitionBinding && hasTeamInstanceBinding;

    let runtimeList;
    try {
      runtimeList = await this.runtimeGateway.list({
        parentSessionId: input.parentSessionId,
      });
    } catch (error) {
      const issue = createIssue({
        code: 'runtime_read_failed',
        source: 'runtime_gateway',
        message: errorMessage(error),
        retryable: true,
      });
      return {
        status: 'error',
        parentSessionId: input.parentSessionId,
        teams: [],
        activeTeam: null,
        issues: [issue],
        shouldPoll: false,
      };
    }

    const issues = runtimeList.diagnostics.map(runtimeDiagnosticIssue);
    const scopedRecords = runtimeList.records.filter(record => {
      const matches = record.snapshot.instance.parentSessionId === input.parentSessionId;
      if (!matches) {
        issues.push(createIssue({
          code: 'runtime_scope_mismatch',
          source: 'runtime_record',
          message: `Runtime ${record.snapshot.instance.teamInstanceId} belongs to another parent session.`,
          retryable: false,
          teamDefinitionId: record.snapshot.instance.teamDefinitionId,
          teamInstanceId: record.snapshot.instance.teamInstanceId,
        }));
      }
      return matches;
    });

    const runtimeIds = new Map<string, number>();
    for (const record of scopedRecords) {
      const id = record.snapshot.instance.teamInstanceId;
      runtimeIds.set(id, (runtimeIds.get(id) ?? 0) + 1);
    }
    const unambiguousRuntimeRecords = scopedRecords.filter(record => {
      const { instance } = record.snapshot;
      if (runtimeIds.get(instance.teamInstanceId) === 1) return true;
      if (!issues.some(issue => (
        issue.code === 'runtime_record_ambiguous'
        && issue.teamInstanceId === instance.teamInstanceId
      ))) {
        issues.push(createIssue({
          code: 'runtime_record_ambiguous',
          source: 'runtime_record',
          message: `Runtime ${instance.teamInstanceId} is duplicated.`,
          retryable: true,
          teamDefinitionId: instance.teamDefinitionId,
          teamInstanceId: instance.teamInstanceId,
        }));
      }
      return false;
    });

    if (hasActiveTeamBinding) {
      const boundRuntimeRecords = scopedRecords.filter(record => (
        record.snapshot.instance.teamInstanceId === boundTeamInstanceId
      ));
      if (boundRuntimeRecords.length === 0) {
        issues.push(createIssue({
          code: 'bound_team_runtime_missing',
          source: 'runtime_record',
          message: `Bound team runtime ${boundTeamInstanceId} is missing.`,
          retryable: true,
          teamDefinitionId: boundTeamDefinitionId,
          teamInstanceId: boundTeamInstanceId,
        }));
      } else if (boundRuntimeRecords.some(record => (
        record.snapshot.instance.teamDefinitionId !== boundTeamDefinitionId
      ))) {
        issues.push(createIssue({
          code: 'bound_team_definition_mismatch',
          source: 'runtime_record',
          message: `Bound team runtime ${boundTeamInstanceId} does not belong to definition ${boundTeamDefinitionId}.`,
          retryable: false,
          teamDefinitionId: boundTeamDefinitionId,
          teamInstanceId: boundTeamInstanceId,
        }));
      }
    }

    if (unambiguousRuntimeRecords.length === 0) {
      return {
        status: snapshotStatus([], issues),
        parentSessionId: input.parentSessionId,
        teams: [],
        activeTeam: null,
        issues,
        shouldPoll: false,
      };
    }

    let definitionSnapshot;
    try {
      definitionSnapshot = await this.definitionGateway.list({
        workspacePath: input.workspacePath,
      });
    } catch (error) {
      issues.push(createIssue({
        code: 'definition_read_failed',
        source: 'definition_gateway',
        message: errorMessage(error),
        retryable: true,
      }));
      return {
        status: 'error',
        parentSessionId: input.parentSessionId,
        teams: [],
        activeTeam: null,
        issues,
        shouldPoll: false,
      };
    }
    issues.push(...definitionSnapshot.diagnostics.map(definitionDiagnosticIssue));

    const teams: TeamWorkspaceTeamProjection[] = [];
    for (const runtimeRecord of unambiguousRuntimeRecords) {
      const { instance } = runtimeRecord.snapshot;
      const idMatches = definitionSnapshot.records.filter(
        record => record.definition.teamDefinitionId === instance.teamDefinitionId,
      );
      const exactMatches = idMatches.filter(
        record => record.revision === instance.teamDefinitionRevision,
      );
      if (exactMatches.length !== 1) {
        const code = exactMatches.length > 1
          ? 'definition_ambiguous'
          : idMatches.length === 0
            ? 'definition_missing'
            : 'definition_revision_mismatch';
        issues.push(createIssue({
          code,
          source: 'definition_record',
          message: code === 'definition_missing'
            ? `Definition ${instance.teamDefinitionId} is missing.`
            : code === 'definition_revision_mismatch'
              ? `Definition ${instance.teamDefinitionId} revision ${instance.teamDefinitionRevision} is missing.`
              : `Definition ${instance.teamDefinitionId} revision ${instance.teamDefinitionRevision} is ambiguous.`,
          retryable: code !== 'definition_ambiguous',
          teamDefinitionId: instance.teamDefinitionId,
          teamInstanceId: instance.teamInstanceId,
        }));
        continue;
      }
      const definitionRecord = exactMatches[0];
      if (definitionRecord) teams.push(projectTeam(runtimeRecord, definitionRecord));
    }

    teams.sort((left, right) => (
      right.updatedAt - left.updatedAt
      || left.teamInstanceId.localeCompare(right.teamInstanceId)
    ));
    for (const team of teams) issues.push(...team.issues);
    const activeTeam = hasActiveTeamBinding
      ? teams.find(team => (
          team.teamInstanceId === boundTeamInstanceId
          && team.teamDefinitionId === boundTeamDefinitionId
        )) ?? null
      : selectActiveTeam(teams, issues);
    if (
      hasActiveTeamBinding
      && !activeTeam
      && !issues.some(issue => (
        issue.code === 'bound_team_runtime_missing'
        || issue.code === 'bound_team_definition_mismatch'
      ))
    ) {
      issues.push(createIssue({
        code: 'bound_team_projection_missing',
        source: 'projection',
        message: `Bound team ${boundTeamDefinitionId}/${boundTeamInstanceId} could not be projected.`,
        retryable: true,
        teamDefinitionId: boundTeamDefinitionId,
        teamInstanceId: boundTeamInstanceId,
      }));
    }
    const visibleIssues = hasActiveTeamBinding
      ? issues.filter(issue => (
          !issue.teamInstanceId
          || issue.teamInstanceId === boundTeamInstanceId
        ))
      : issues;
    return {
      status: snapshotStatus(teams, visibleIssues),
      parentSessionId: input.parentSessionId,
      teams,
      activeTeam,
      issues: visibleIssues,
      shouldPoll: hasActiveTeamBinding
        ? Boolean(activeTeam && !activeTeam.isTerminal)
        : teams.some(team => !team.isTerminal),
    };
  }
}

export const teamWorkspaceProjectionService = new TeamWorkspaceProjectionService(
  desktopTeamRuntimeAdapter,
  existingTeamDefinitionAdapter,
);
