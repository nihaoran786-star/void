export type TeamExecutionProfile =
  | { kind: 'prompt_orchestrated' }
  | { kind: 'flagship_adapter'; adapterId: string };

export type TeamWorkspaceBackend = 'local' | 'remote';

export interface TeamWorkspaceIdentity {
  workspaceId: string;
  contextKey: string;
  backend: TeamWorkspaceBackend;
  remoteConnectionId?: string;
  remoteHost?: string;
}

export type TeamInstanceCreationSource =
  | 'user_attachment'
  | 'persona_activation'
  | 'fixed_runtime_adapter'
  | 'recovery';

export type DesktopTeamCreationSource = Extract<
  TeamInstanceCreationSource,
  'user_attachment' | 'persona_activation'
>;

export type TeamLeadBinding =
  | { kind: 'parent_persona'; parentSessionId: string }
  | { kind: 'child_orchestrator'; childSessionId: string };

export interface TeamMemberBinding {
  memberId: string;
  childSessionId?: string;
  subagentTaskId?: string;
}

export type TeamInstanceLifecycle =
  | 'provisioning'
  | 'ready'
  | 'unavailable'
  | 'archived';

export interface TeamRuntimeError {
  source: string;
  code: string;
  message: string;
  retryable: boolean;
  recoveryAction?: string;
}

export interface TeamInstance {
  schemaVersion: number;
  teamInstanceId: string;
  teamDefinitionId: string;
  teamDefinitionRevision: string;
  workspace: TeamWorkspaceIdentity;
  parentSessionId: string;
  executionProfile: TeamExecutionProfile;
  leadBinding: TeamLeadBinding;
  memberBindings: TeamMemberBinding[];
  activeRunId?: string;
  lifecycle: TeamInstanceLifecycle;
  error?: TeamRuntimeError;
  creationSource: TeamInstanceCreationSource;
  createdAt: number;
  updatedAt: number;
}

export type TeamRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

export interface TeamRun {
  teamRunId: string;
  teamInstanceId: string;
  workflowId: string;
  objective: string;
  parentDialogTurnId: string;
  parentToolCallId: string;
  attempt: number;
  status: TeamRunStatus;
  error?: TeamRuntimeError;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export type TeamMemberRunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

export interface TeamMemberRun {
  memberRunId: string;
  teamRunId: string;
  teamInstanceId: string;
  memberId: string;
  phaseId?: string;
  operationId?: string;
  parentDialogTurnId?: string;
  parentToolCallId?: string;
  agentId?: string;
  childSessionId?: string;
  subagentTaskId?: string;
  appliedOperationIds?: string[];
  attempt: number;
  status: TeamMemberRunStatus;
  error?: TeamRuntimeError;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export type TeamPhaseRunStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface TeamPhaseRun {
  phaseRunId: string;
  teamRunId: string;
  teamInstanceId: string;
  workflowId: string;
  phaseId: string;
  attempt: number;
  status: TeamPhaseRunStatus;
  error?: TeamRuntimeError;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface TeamRuntimeSnapshot {
  instance: TeamInstance;
  teamRuns: TeamRun[];
  memberRuns: TeamMemberRun[];
  phaseRuns: TeamPhaseRun[];
}

export interface TeamRuntimeRecord {
  schemaVersion: number;
  revision: number;
  snapshot: TeamRuntimeSnapshot;
}

export type TeamRuntimeDiagnosticCode =
  | 'io'
  | 'record_too_large'
  | 'invalid_json'
  | 'invalid_contract'
  | 'scope_mismatch';

export interface TeamRuntimeDiagnostic {
  recordId: string;
  code: TeamRuntimeDiagnosticCode;
  message: string;
}

export interface TeamRuntimeList {
  records: TeamRuntimeRecord[];
  diagnostics: TeamRuntimeDiagnostic[];
}

export type TeamOrchestratorErrorCode =
  | 'invalid_command'
  | 'scope_mismatch'
  | 'definition_invalid'
  | 'definition_not_found'
  | 'definition_revision_mismatch'
  | 'scenario_unsupported'
  | 'workflow_not_found'
  | 'execution_route_invalid'
  | 'recovery_reference_missing'
  | 'runtime_not_found'
  | 'runtime_conflict'
  | 'store_failure'
  | 'adapter_unavailable'
  | 'adapter_rejected'
  | 'adapter_unsupported';

export interface TeamOrchestratorError {
  code: TeamOrchestratorErrorCode;
  message: string;
  retryable: boolean;
}

export interface TeamOrchestratorOutcome {
  operationId: string;
  accepted: boolean;
  operationIds: string[];
  notes: string[];
  error?: TeamOrchestratorError;
}

export interface TeamRuntimeMutationResponse {
  outcome: TeamOrchestratorOutcome;
  record: TeamRuntimeRecord | null;
}

export interface TeamRuntimeApiError {
  code: string;
  message: string;
  retryable: boolean;
  recoveryAction?: string;
}

export interface ListTeamRuntimeInput {
  parentSessionId: string;
}

export interface GetTeamRuntimeInput extends ListTeamRuntimeInput {
  teamInstanceId: string;
}

export interface AttachTeamRuntimeInput extends GetTeamRuntimeInput {
  operationId: string;
  teamDefinitionId: string;
  teamDefinitionRevision: string;
  creationSource: DesktopTeamCreationSource;
}

export interface ObserveTeamRuntimeInput extends GetTeamRuntimeInput {
  operationId: string;
}

export interface MessageTeamRuntimeInput extends ObserveTeamRuntimeInput {
  teamRunId: string;
  memberId: string;
  message: string;
}

export interface ControlTeamRuntimeRunInput extends ObserveTeamRuntimeInput {
  teamRunId: string;
}

export type PauseTeamRuntimeInput = ControlTeamRuntimeRunInput;
export type ResumeTeamRuntimeInput = ControlTeamRuntimeRunInput;
export type StopTeamRuntimeInput = ControlTeamRuntimeRunInput;

export type RecoverTeamRuntimeInput = ObserveTeamRuntimeInput;

export interface TeamRuntimeGateway {
  list(input: ListTeamRuntimeInput): Promise<TeamRuntimeList>;
  get(input: GetTeamRuntimeInput): Promise<TeamRuntimeRecord | null>;
  attach(input: AttachTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
  observe(input: ObserveTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
  message(input: MessageTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
  pause(input: PauseTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
  resume(input: ResumeTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
  stop(input: StopTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
  recover(input: RecoverTeamRuntimeInput): Promise<TeamRuntimeMutationResponse>;
}
