import type {
  TeamDefinition,
  TeamMemberDefinition,
  TeamWorkflowDefinition,
  TeamWorkflowPhaseDefinition,
} from '@/infrastructure/config/types';
import type {
  TeamInstanceLifecycle,
  TeamMemberRun,
  TeamMemberRunStatus,
  TeamPhaseRun,
  TeamPhaseRunStatus,
  TeamRun,
  TeamRunStatus,
  TeamRuntimeError,
} from '@/shared/services/customization/TeamRuntimeGateway';

export type TeamWorkspaceIssueSource =
  | 'runtime_gateway'
  | 'runtime_record'
  | 'definition_gateway'
  | 'definition_record'
  | 'projection';

export type TeamWorkspaceIssueCode =
  | 'unsupported_transport'
  | 'runtime_read_failed'
  | 'runtime_diagnostic'
  | 'runtime_scope_mismatch'
  | 'runtime_record_ambiguous'
  | 'definition_read_failed'
  | 'definition_diagnostic'
  | 'definition_missing'
  | 'definition_revision_mismatch'
  | 'definition_ambiguous'
  | 'active_run_missing'
  | 'active_run_ambiguous'
  | 'latest_run_ambiguous'
  | 'member_run_ambiguous'
  | 'phase_run_ambiguous'
  | 'workflow_missing'
  | 'unknown_member_run'
  | 'unknown_phase_run'
  | 'active_team_ambiguous'
  | 'active_team_binding_incomplete'
  | 'bound_team_runtime_missing'
  | 'bound_team_definition_mismatch'
  | 'bound_team_projection_missing';

export interface TeamWorkspaceIssue {
  code: TeamWorkspaceIssueCode;
  source: TeamWorkspaceIssueSource;
  message: string;
  retryable: boolean;
  recordId?: string;
  teamDefinitionId?: string;
  teamInstanceId?: string;
  runId?: string;
  memberId?: string;
  phaseId?: string;
}

export type TeamWorkspaceDefinitionState = {
  source: 'definition';
  status: 'not_started';
};

export type TeamWorkspaceUnavailableState = {
  source: 'projection';
  status: 'unavailable';
  issueCode:
    | 'member_run_ambiguous'
    | 'phase_run_ambiguous';
};

export type TeamWorkspaceMemberState =
  | TeamWorkspaceDefinitionState
  | TeamWorkspaceUnavailableState
  | {
      source: 'runtime';
      status: TeamMemberRunStatus;
      run: TeamMemberRun;
    };

export type TeamWorkspacePhaseState =
  | TeamWorkspaceDefinitionState
  | TeamWorkspaceUnavailableState
  | {
      source: 'runtime';
      status: TeamPhaseRunStatus;
      run: TeamPhaseRun;
    };

export interface TeamWorkspaceMemberProjection {
  definition: TeamMemberDefinition;
  state: TeamWorkspaceMemberState;
  childSessionId?: string;
  subagentTaskId?: string;
}

export interface TeamWorkspacePhaseProjection {
  definition: TeamWorkflowPhaseDefinition;
  state: TeamWorkspacePhaseState;
}

export interface TeamWorkspaceRunProjection {
  source: 'runtime';
  status: TeamRunStatus;
  run: TeamRun;
  workflow: TeamWorkflowDefinition | null;
}

export interface TeamWorkspaceTeamProjection {
  teamInstanceId: string;
  teamDefinitionId: string;
  teamDefinitionRevision: string;
  runtimeRevision: number;
  definition: TeamDefinition;
  lifecycle: TeamInstanceLifecycle;
  runtimeError?: TeamRuntimeError;
  activeRun: TeamWorkspaceRunProjection | null;
  members: TeamWorkspaceMemberProjection[];
  phases: TeamWorkspacePhaseProjection[];
  issues: TeamWorkspaceIssue[];
  updatedAt: number;
  isTerminal: boolean;
}

export type TeamWorkspaceSnapshotStatus = 'ready' | 'partial' | 'error';

export interface TeamWorkspaceSnapshot {
  status: TeamWorkspaceSnapshotStatus;
  parentSessionId: string;
  teams: TeamWorkspaceTeamProjection[];
  activeTeam: TeamWorkspaceTeamProjection | null;
  issues: TeamWorkspaceIssue[];
  shouldPoll: boolean;
}

export interface ReadTeamWorkspaceInput {
  parentSessionId: string;
  workspacePath?: string;
  teamDefinitionId?: string;
  teamInstanceId?: string;
}

export interface TeamWorkspaceProjectionReader {
  read(input: ReadTeamWorkspaceInput): Promise<TeamWorkspaceSnapshot>;
}

export type ActiveTeamWorkspaceStatus =
  | 'disabled'
  | 'unsupported'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'error';

export interface ActiveTeamWorkspaceState {
  status: ActiveTeamWorkspaceStatus;
  snapshot?: TeamWorkspaceSnapshot;
  error?: TeamWorkspaceIssue;
  reload: () => void;
}
