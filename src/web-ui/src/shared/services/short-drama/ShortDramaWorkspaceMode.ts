import type { ShortDramaStageAgentBinding, ShortDramaStageAgentBindingStatus } from './ShortDramaStageAgentSessionBinding';
import type { ShortDramaStage } from './ShortDramaTypes';

export type ShortDramaWorkspaceModeStatus =
  | 'disabled'
  | 'bootstrapping'
  | 'ready'
  | 'partial'
  | 'missing'
  | 'recreating'
  | 'conflict'
  | 'workspace_mismatch'
  | 'error';

export interface ShortDramaWorkspaceModeSessionLike {
  sessionId?: string;
  mode?: string;
  sessionKind?: string;
}

export interface ShortDramaWorkspaceModeState {
  status: ShortDramaWorkspaceModeStatus;
  source: 'short-drama-workspace-mode';
  workspaceRoot?: string;
  sourceSessionId?: string;
  isMediaSession: boolean;
  panelStatus: 'closed' | 'open';
  stageAgentStatuses: Record<ShortDramaStage, ShortDramaStageAgentBindingStatus>;
  diagnostics: Array<{
    code: string;
    message: string;
    stage?: ShortDramaStage;
  }>;
}

const STAGES: ShortDramaStage[] = ['script', 'assets', 'storyboards', 'video', 'post'];

export function isShortDramaMediaSession(session?: ShortDramaWorkspaceModeSessionLike | null): boolean {
  return session?.mode?.trim().toLowerCase() === 'media'
    && session.sessionKind !== 'subagent';
}

export function createShortDramaWorkspaceModeState(input: {
  workspaceRoot?: string;
  sourceSession?: ShortDramaWorkspaceModeSessionLike | null;
  panelStatus?: 'closed' | 'open';
  bindings?: ShortDramaStageAgentBinding[];
  isBootstrapping?: boolean;
  error?: { code: string; message: string };
}): ShortDramaWorkspaceModeState {
  const isMediaSession = isShortDramaMediaSession(input.sourceSession);
  if (!isMediaSession) {
    return {
      status: 'disabled',
      source: 'short-drama-workspace-mode',
      workspaceRoot: input.workspaceRoot,
      sourceSessionId: input.sourceSession?.sessionId,
      isMediaSession,
      panelStatus: input.panelStatus ?? 'closed',
      stageAgentStatuses: createStageStatusMap(input.bindings),
      diagnostics: [{
        code: 'media_session_required',
        message: 'AI short drama workspace mode is only available from a Media session.',
      }],
    };
  }

  const stageAgentStatuses = createStageStatusMap(input.bindings);
  const diagnostics: ShortDramaWorkspaceModeState['diagnostics'] = createDiagnostics(stageAgentStatuses);
  if (input.error) {
    diagnostics.push(input.error);
  }

  return {
    status: resolveWorkspaceModeStatus(stageAgentStatuses, Boolean(input.isBootstrapping), Boolean(input.error)),
    source: 'short-drama-workspace-mode',
    workspaceRoot: input.workspaceRoot,
    sourceSessionId: input.sourceSession?.sessionId,
    isMediaSession,
    panelStatus: input.panelStatus ?? 'open',
    stageAgentStatuses,
    diagnostics,
  };
}

function createStageStatusMap(bindings: ShortDramaStageAgentBinding[] = []) {
  return Object.fromEntries(STAGES.map(stage => [
    stage,
    bindings.find(binding => binding.stage === stage)?.status ?? 'unbound',
  ])) as Record<ShortDramaStage, ShortDramaStageAgentBindingStatus>;
}

function resolveWorkspaceModeStatus(
  statuses: Record<ShortDramaStage, ShortDramaStageAgentBindingStatus>,
  isBootstrapping: boolean,
  hasError: boolean,
): ShortDramaWorkspaceModeStatus {
  if (hasError) return 'error';
  if (isBootstrapping) return 'bootstrapping';
  const values = Object.values(statuses);
  if (values.some(status => status === 'conflict')) return 'conflict';
  if (values.some(status => status === 'workspace_mismatch')) return 'workspace_mismatch';
  if (values.some(status => status === 'recreating')) return 'recreating';
  if (values.every(status => status === 'ready')) return 'ready';
  if (values.some(status => status === 'ready')) return 'partial';
  return 'missing';
}

function createDiagnostics(statuses: Record<ShortDramaStage, ShortDramaStageAgentBindingStatus>) {
  return STAGES
    .filter(stage => statuses[stage] !== 'ready')
    .map(stage => ({
      stage,
      code: `stage_agent_${statuses[stage]}`,
      message: `${stage} stage agent is ${statuses[stage]}.`,
    }));
}
