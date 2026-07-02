import {
  areShortDramaWorkspacePathsEqual,
  normalizeShortDramaWorkspacePath,
  type ShortDramaStage,
  type ShortDramaStageAgentBinding,
  type ShortDramaStageAgentSessionCandidate,
} from '@/shared/services/short-drama';

export interface ShortDramaStageAgentHistoricalSessionRestore {
  stage: ShortDramaStage;
  agentName: ShortDramaStageAgentBinding['agentName'];
  childSessionId: string;
  parentSessionId: string;
  workspaceRoot: string;
  createdAt?: number;
  lastActiveAt?: number;
}

export function createShortDramaStageAgentHistoricalSessionRestores(input: {
  bindings: ShortDramaStageAgentBinding[];
  sessions: ShortDramaStageAgentSessionCandidate[];
  workspaceRoot: string;
}): ShortDramaStageAgentHistoricalSessionRestore[] {
  const workspaceRoot = normalizeShortDramaWorkspacePath(input.workspaceRoot) ?? input.workspaceRoot;
  const existingSessionIds = new Set(input.sessions.map(session => session.childSessionId));

  return input.bindings
    .filter(binding => Boolean(binding.childSessionId && binding.parentSessionId))
    .filter(binding => !existingSessionIds.has(binding.childSessionId!))
    .filter(binding => !binding.workspaceRoot || areShortDramaWorkspacePathsEqual(binding.workspaceRoot, workspaceRoot))
    .map(binding => ({
      stage: binding.stage,
      agentName: binding.agentName,
      childSessionId: binding.childSessionId!,
      parentSessionId: binding.parentSessionId!,
      workspaceRoot,
      createdAt: binding.createdAt,
      lastActiveAt: binding.updatedAt ?? binding.lastValidatedAt ?? binding.createdAt,
    }));
}
