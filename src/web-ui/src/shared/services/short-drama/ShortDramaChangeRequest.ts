import { resolveShortDramaArtifactReference } from './ShortDramaArtifactIndex';
import { listShortDramaArtifactDownstreamReferences } from './ShortDramaDependencyGraph';
import { authorizeShortDramaAgentWrite } from './ShortDramaToolPolicy';
import type {
  ShortDramaChangeRequestInput,
  ShortDramaChangeRequestListResult,
  ShortDramaChangeRequestQuery,
  ShortDramaChangeRequestResolutionInput,
  ShortDramaChangeRequestResolutionResult,
  ShortDramaChangeRequestResult,
  ShortDramaFocusContext,
  ShortDramaProject,
  ShortDramaStageWorkspace,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-change-request' as const;

export function createShortDramaFocusContextFromWorkspace(
  workspace: ShortDramaStageWorkspace,
): ShortDramaFocusContext {
  return {
    activeStage: workspace.stage,
    activeEpisodeId: workspace.activeEpisodeId,
    activeArtifactId: workspace.activeArtifactId,
    activeArtifactHandle: workspace.activeArtifactHandle,
    activeMediaItemId: workspace.activeMedia?.mediaItemId,
    selectionSource: workspace.lastFocusSource,
  };
}

export function createShortDramaChangeRequest(
  project: ShortDramaProject,
  input: ShortDramaChangeRequestInput,
): ShortDramaChangeRequestResult {
  const authorization = authorizeShortDramaAgentWrite(
    { actorRole: input.actorRole, stage: input.stage },
    'requestChange',
    input.targetStage,
  );

  if (authorization.status !== 'allow') {
    return { status: 'denied', source: SOURCE, authorization };
  }

  const resolved = input.targetArtifactIdOrHandle
    ? resolveShortDramaArtifactReference(project, input.targetArtifactIdOrHandle)
    : undefined;
  if (resolved && resolved.status !== 'ready') {
    return {
      status: 'error',
      source: SOURCE,
      error: resolved.error,
    };
  }

  if (resolved?.artifact.stage && resolved.artifact.stage !== input.targetStage) {
    return {
      status: 'error',
      source: SOURCE,
      error: {
        code: 'stage_mismatch',
        message: `Change request targets ${input.targetStage}, but artifact ${resolved.artifact.id} belongs to ${resolved.artifact.stage}.`,
      },
    };
  }

  const timestamp = input.timestamp ?? Date.now();
  return {
    status: 'ready',
    source: SOURCE,
    request: {
      id: `change-request-${input.targetStage}-${timestamp}`,
      sourceStage: input.stage,
      targetStage: input.targetStage,
      requestedByRole: input.actorRole,
      targetArtifactId: resolved?.artifact.id,
      targetArtifactHandle: resolved?.entry.handle,
      reason: input.reason,
      suggestion: input.suggestion,
      focus: input.focus,
      status: 'open',
      createdAt: timestamp,
    },
  };
}

export function listShortDramaChangeRequests(
  project: ShortDramaProject,
  query: ShortDramaChangeRequestQuery = {},
): ShortDramaChangeRequestListResult {
  const targetArtifactIds = resolveChangeRequestTargetArtifactIds(project, query.targetArtifactIdOrHandle);
  const requests = (project.changeRequests ?? [])
    .filter(request => query.targetStage ? request.targetStage === query.targetStage : true)
    .filter(request => query.status ? request.status === query.status : true)
    .filter(request => query.requestedByRole ? request.requestedByRole === query.requestedByRole : true)
    .filter(request => targetArtifactIds
      ? Boolean(request.targetArtifactId && targetArtifactIds.has(request.targetArtifactId))
        || Boolean(request.targetArtifactHandle && targetArtifactIds.has(request.targetArtifactHandle))
      : true)
    .sort((left, right) => right.createdAt - left.createdAt);

  if (requests.length === 0) {
    return {
      status: 'empty',
      source: SOURCE,
      query,
      reason: 'no_change_requests',
      requests: [],
    };
  }

  return {
    status: 'ready',
    source: SOURCE,
    query,
    requests,
  };
}

export function resolveShortDramaChangeRequest(
  project: ShortDramaProject,
  input: ShortDramaChangeRequestResolutionInput,
): ShortDramaChangeRequestResolutionResult {
  const target = input.idOrHandle.trim().toLowerCase();
  const current = (project.changeRequests ?? []).find(request => (
    request.id.toLowerCase() === target
      || request.targetArtifactId?.toLowerCase() === target
      || request.targetArtifactHandle?.toLowerCase() === target
  ));

  if (!current) {
    return {
      status: 'not_found',
      source: SOURCE,
      error: {
        code: 'change_request_missing',
        message: `Short drama change request ${input.idOrHandle} was not found.`,
      },
    };
  }

  const timestamp = input.timestamp ?? Date.now();
  const request = {
    ...current,
    status: input.status,
    resolution: input.resolution,
    updatedAt: timestamp,
    updatedBy: input.updatedBy,
  };
  const projectWithRequest = {
    ...project,
    changeRequests: (project.changeRequests ?? []).map(item => item.id === current.id ? request : item),
  };
  const audit = {
    type: input.status === 'resolved' ? 'changeRequestResolved' as const : 'changeRequestRejected' as const,
    requestId: request.id,
    actor: input.updatedBy,
    timestamp,
    targetStage: request.targetStage,
    targetArtifactId: request.targetArtifactId,
    targetArtifactHandle: request.targetArtifactHandle,
    resolution: input.resolution,
  };
  const downstreamStaleCandidates = request.targetArtifactId
    ? listShortDramaArtifactDownstreamReferences(project, request.targetArtifactId)
      .map(artifactId => project.artifacts.find(artifact => artifact.id === artifactId))
      .filter((artifact): artifact is ShortDramaProject['artifacts'][number] => Boolean(artifact))
      .map(artifact => ({
        artifactId: artifact.id,
        stage: artifact.stage,
        recommendedStatus: artifact.stage === 'post' ? 'reviewing' as const : 'stale' as const,
        reason: `Target ${request.targetArtifactHandle ?? request.targetArtifactId} changed through ${request.id}; review downstream ${artifact.stage} output before reuse.`,
      }))
    : [];

  return {
    status: 'ready',
    source: SOURCE,
    request,
    project: projectWithRequest,
    audit,
    downstreamStaleCandidates,
  };
}

function resolveChangeRequestTargetArtifactIds(
  project: ShortDramaProject,
  idOrHandle?: string,
): Set<string> | undefined {
  if (!idOrHandle) {
    return undefined;
  }

  const resolved = resolveShortDramaArtifactReference(project, idOrHandle);
  if (resolved.status === 'ready') {
    return new Set([resolved.artifact.id, resolved.entry.handle]);
  }
  if (resolved.status === 'conflict') {
    return new Set(resolved.matches.flatMap(match => [match.id, match.handle]));
  }
  return new Set([idOrHandle]);
}
