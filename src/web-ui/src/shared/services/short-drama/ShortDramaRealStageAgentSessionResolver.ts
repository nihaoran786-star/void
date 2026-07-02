import { resolveShortDramaArtifactReference } from './ShortDramaArtifactIndex';
import { filterShortDramaSessionsByWorkspace } from './ShortDramaWorkspaceBinding';
import type { ShortDramaStageAgentBinding } from './ShortDramaStageAgentSessionBinding';
import type {
  ShortDramaArtifact,
  ShortDramaProject,
  ShortDramaStage,
  ShortDramaStageAgentSessionCandidate,
  ShortDramaStageAgentSessionMatchedBy,
  ShortDramaStageAgentSessionResolution,
} from './ShortDramaTypes';

export interface ShortDramaRealStageAgentSessionResolverInput {
  project: ShortDramaProject;
  stage: ShortDramaStage;
  activeArtifactIdOrHandle?: string;
  parentSessionId?: string;
  workspacePath?: string;
  stageAgentBindings?: ShortDramaStageAgentBinding[];
  sessions: ShortDramaStageAgentSessionCandidate[];
}

export function getShortDramaNativeStageAgentName(stage: ShortDramaStage) {
  if (stage === 'assets') return 'AssetAI';
  if (stage === 'storyboards') return 'SplitAI';
  if (stage === 'video') return 'VideoAI';
  if (stage === 'post') return 'EditorAI';
  return 'ScriptAI';
}

export function resolveShortDramaRealStageAgentSession(
  input: ShortDramaRealStageAgentSessionResolverInput,
): ShortDramaStageAgentSessionResolution {
  const nativeAgentName = getShortDramaNativeStageAgentName(input.stage);
  const eligibleSessions = filterShortDramaSessionsByWorkspace(
    input.sessions.filter(isRealStageAgentSessionCandidate),
    input.workspacePath,
  );
  const matchingSessions = eligibleSessions.filter(session => matchesNativeAgent(session, nativeAgentName));
  const focusedArtifact = resolveFocusedArtifact(input.project, input.activeArtifactIdOrHandle);
  const persistentBinding = input.stageAgentBindings?.find(binding => binding.stage === input.stage);

  if (persistentBinding?.childSessionId) {
    const exact = findBySessionId(eligibleSessions, persistentBinding.childSessionId);
    if (exact) {
      return ready(input.stage, nativeAgentName, exact, 'persistentStageBinding', focusedArtifact, persistentBinding.parentSessionId);
    }
    return pending(input.stage, nativeAgentName, 'session_missing', persistentBinding.status);
  }

  if (persistentBinding && persistentBinding.status !== 'ready' && persistentBinding.status !== 'unbound') {
    return pending(input.stage, nativeAgentName, 'session_missing', persistentBinding.status);
  }

  if (focusedArtifact?.subagentSessionId) {
    const exact = findBySessionId(eligibleSessions, focusedArtifact.subagentSessionId);
    if (exact) {
      return ready(input.stage, nativeAgentName, exact, 'artifactBinding', focusedArtifact);
    }
  }

  const stageBound = uniqueStageBoundCandidate(input.project, input.stage, eligibleSessions);
  if (stageBound.status === 'ready') {
    return ready(input.stage, nativeAgentName, stageBound.candidate, 'stageBinding', stageBound.artifact);
  }
  if (stageBound.status === 'conflict') {
    return conflict(input.stage, nativeAgentName, stageBound.candidates);
  }

  if (input.parentSessionId) {
    const sameParent = matchingSessions.filter(session => session.parentSessionId === input.parentSessionId);
    if (sameParent.length === 1) {
      return ready(input.stage, nativeAgentName, sameParent[0], 'parentSessionAgentName');
    }
    if (sameParent.length > 1) {
      return conflict(input.stage, nativeAgentName, sameParent);
    }
  }

  if (matchingSessions.length === 0) {
    return pending(input.stage, nativeAgentName, 'session_missing');
  }

  const recent = chooseMostRecent(matchingSessions);
  if (recent.status === 'ready') {
    return ready(input.stage, nativeAgentName, recent.candidate, 'recentAgentName');
  }

  return conflict(input.stage, nativeAgentName, matchingSessions);
}

function resolveFocusedArtifact(
  project: ShortDramaProject,
  activeArtifactIdOrHandle?: string,
): ShortDramaArtifact | undefined {
  const target = activeArtifactIdOrHandle?.trim();
  if (!target) return undefined;

  const resolved = resolveShortDramaArtifactReference(project, target);
  return resolved.status === 'ready' ? resolved.artifact : undefined;
}

function uniqueStageBoundCandidate(
  project: ShortDramaProject,
  stage: ShortDramaStage,
  sessions: ShortDramaStageAgentSessionCandidate[],
):
  | { status: 'ready'; candidate: ShortDramaStageAgentSessionCandidate; artifact: ShortDramaArtifact }
  | { status: 'conflict'; candidates: ShortDramaStageAgentSessionCandidate[] }
  | { status: 'empty' } {
  const matches = project.artifacts
    .filter(artifact => artifact.stage === stage && artifact.subagentSessionId)
    .map(artifact => ({ artifact, candidate: findBySessionId(sessions, artifact.subagentSessionId!) }))
    .filter((entry): entry is { artifact: ShortDramaArtifact; candidate: ShortDramaStageAgentSessionCandidate } => Boolean(entry.candidate));

  const unique = dedupeBySessionId(matches.map(entry => entry.candidate));
  if (unique.length === 0) return { status: 'empty' };
  if (unique.length === 1) {
    const match = matches.find(entry => entry.candidate.childSessionId === unique[0].childSessionId)!;
    return { status: 'ready', candidate: match.candidate, artifact: match.artifact };
  }
  return { status: 'conflict', candidates: unique };
}

function findBySessionId(
  sessions: ShortDramaStageAgentSessionCandidate[],
  sessionId: string,
) {
  return sessions.find(session => session.childSessionId === sessionId);
}

function matchesNativeAgent(session: ShortDramaStageAgentSessionCandidate, nativeAgentName: string) {
  const normalized = normalize(nativeAgentName);
  return [
    session.subagentType,
    session.agentType,
    session.title,
  ].some(value => normalize(value).includes(normalized));
}

function isRealStageAgentSessionCandidate(session: ShortDramaStageAgentSessionCandidate) {
  if (session.isTransient && !session.agentBackedTransient) {
    return false;
  }

  const sessionId = normalize(session.childSessionId);
  if (sessionId.startsWith('short-drama-stage-') || sessionId.startsWith('short-drama-stage-agent:')) {
    return false;
  }

  const title = normalize(session.title);
  if (/^short drama .+ agent$/.test(title)) {
    return false;
  }

  return true;
}

function ready(
  stage: ShortDramaStage,
  nativeAgentName: string,
  candidate: ShortDramaStageAgentSessionCandidate,
  matchedBy: ShortDramaStageAgentSessionMatchedBy,
  artifact?: ShortDramaArtifact,
  bindingParentSessionId?: string,
): ShortDramaStageAgentSessionResolution {
  const parentSessionId = candidate.parentSessionId ?? bindingParentSessionId ?? artifact?.parentSessionId;
  if (!parentSessionId) {
    return pending(stage, nativeAgentName, 'parent_missing');
  }

  return {
    status: 'ready',
    source: 'short-drama-real-stage-agent-resolver',
    stage,
    nativeAgentName,
    childSessionId: candidate.childSessionId,
    parentSessionId,
    parentToolCallId: candidate.parentToolCallId ?? artifact?.parentToolCallId,
    matchedBy,
    candidate,
  };
}

function pending(
  stage: ShortDramaStage,
  nativeAgentName: string,
  reason: 'session_missing' | 'parent_missing',
  bindingStatus?: 'unbound' | 'ready' | 'missing' | 'stale' | 'recreating' | 'conflict' | 'workspace_mismatch' | 'error',
): ShortDramaStageAgentSessionResolution {
  return {
    status: 'pending',
    source: 'short-drama-real-stage-agent-resolver',
    stage,
    nativeAgentName,
    reason,
    bindingStatus,
  };
}

function conflict(
  stage: ShortDramaStage,
  nativeAgentName: string,
  candidates: ShortDramaStageAgentSessionCandidate[],
): ShortDramaStageAgentSessionResolution {
  return {
    status: 'conflict',
    source: 'short-drama-real-stage-agent-resolver',
    stage,
    nativeAgentName,
    candidates,
    error: {
      code: 'stage_agent_conflict',
      message: `Multiple real ${nativeAgentName} sessions match the ${stage} workspace.`,
    },
  };
}

function chooseMostRecent(sessions: ShortDramaStageAgentSessionCandidate[]) {
  const sorted = [...sessions].sort((a, b) => getSessionTime(b) - getSessionTime(a));
  if (sorted.length === 1) return { status: 'ready' as const, candidate: sorted[0] };
  if (getSessionTime(sorted[0]) > getSessionTime(sorted[1])) {
    return { status: 'ready' as const, candidate: sorted[0] };
  }
  return { status: 'conflict' as const };
}

function getSessionTime(session: ShortDramaStageAgentSessionCandidate) {
  return session.lastActiveAt ?? session.createdAt ?? 0;
}

function dedupeBySessionId(sessions: ShortDramaStageAgentSessionCandidate[]) {
  return Array.from(new Map(sessions.map(session => [session.childSessionId, session])).values());
}

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? '';
}
