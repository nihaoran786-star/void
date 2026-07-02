import type { CreateSessionRequest, CreateSessionResponse } from '@/infrastructure/api/service-api/AgentAPI';
import type { Session } from '@/flow_chat/types/flow-chat';
import type {
  ShortDramaManifestAdapter,
  ShortDramaStage,
  ShortDramaStageAgentSessionCandidate,
} from '@/shared/services/short-drama';
import {
  SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES,
  getShortDramaNativeStageAgentName,
  registerShortDramaStageAgentBindingsFromSessions,
  validateShortDramaStageAgentBindingsAgainstSessions,
  type ShortDramaStageAgentBinding,
} from '@/shared/services/short-drama';
import { normalizeShortDramaWorkspacePath } from '@/shared/services/short-drama/ShortDramaWorkspaceBinding';

export type ShortDramaStageAgentBootstrapStatus = 'ready' | 'partial' | 'error';

export interface ShortDramaStageAgentBootstrapResult {
  status: ShortDramaStageAgentBootstrapStatus;
  source: 'short-drama-stage-agent-bootstrap';
  workspaceRoot: string;
  bindings: ShortDramaStageAgentBinding[];
  createdStages: ShortDramaStage[];
  errors: Array<{
    stage: ShortDramaStage;
    code: string;
    message: string;
  }>;
}

export async function ensureShortDramaStageAgentSessions(input: {
  adapter: ShortDramaManifestAdapter;
  workspaceRoot: string;
  parentSession: Session;
  sessions: ShortDramaStageAgentSessionCandidate[];
  existingBindings: ShortDramaStageAgentBinding[];
  createSession: (request: CreateSessionRequest) => Promise<CreateSessionResponse>;
  addSessionToStore: (params: {
    childSessionId: string;
    title: string;
    agentName: string;
    parentSession: Session;
    stage: ShortDramaStage;
  }) => void;
}): Promise<ShortDramaStageAgentBootstrapResult> {
  const workspaceRoot = normalizeShortDramaWorkspacePath(input.workspaceRoot) ?? input.workspaceRoot;
  const sessions = [...input.sessions];
  const createdStages: ShortDramaStage[] = [];
  const errors: ShortDramaStageAgentBootstrapResult['errors'] = [];

  for (const stage of SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES) {
    const existing = input.existingBindings.find(binding => binding.stage === stage);
    if (existing?.status === 'ready' && existing.childSessionId) {
      continue;
    }

    const agentName = getShortDramaNativeStageAgentName(stage);
    try {
      const title = createShortDramaStageAgentSessionTitle(agentName);
      const response = await input.createSession({
        sessionName: title,
        agentType: agentName,
        workspacePath: workspaceRoot,
        workspaceId: input.parentSession.workspaceId,
        remoteConnectionId: input.parentSession.remoteConnectionId,
        remoteSshHost: input.parentSession.remoteSshHost,
        sessionKind: 'subagent',
        relationship: {
          kind: 'subagent',
          parentSessionId: input.parentSession.sessionId,
          subagentType: agentName,
        },
        config: {
          modelName: input.parentSession.config?.modelName || 'auto',
          enableTools: true,
          safeMode: true,
          autoCompact: true,
          enableContextCompression: true,
          remoteConnectionId: input.parentSession.remoteConnectionId,
          remoteSshHost: input.parentSession.remoteSshHost,
        },
      });

      input.addSessionToStore({
        childSessionId: response.sessionId,
        title,
        agentName,
        parentSession: input.parentSession,
        stage,
      });
      sessions.push({
        childSessionId: response.sessionId,
        parentSessionId: input.parentSession.sessionId,
        subagentType: agentName,
        agentType: agentName,
        title,
        workspacePath: workspaceRoot,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
      createdStages.push(stage);
    } catch (error) {
      errors.push({
        stage,
        code: 'stage_agent_create_failed',
        message: error instanceof Error ? error.message : `Failed to create ${agentName}.`,
      });
    }
  }

  const registered = await registerShortDramaStageAgentBindingsFromSessions(
    input.adapter,
    workspaceRoot,
    sessions,
    input.existingBindings,
  );
  const bindings = registered.status === 'error'
    ? validateShortDramaStageAgentBindingsAgainstSessions(input.existingBindings, sessions, workspaceRoot)
    : registered.bindings;

  return {
    status: errors.length === 0 && bindings.every(binding => binding.status === 'ready')
      ? 'ready'
      : errors.length < SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES.length
        ? 'partial'
        : 'error',
    source: 'short-drama-stage-agent-bootstrap',
    workspaceRoot,
    bindings,
    createdStages,
    errors,
  };
}

function createShortDramaStageAgentSessionTitle(agentName: string) {
  return `${agentName}`;
}
