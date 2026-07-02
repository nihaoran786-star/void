import { resolveShortDramaArtifactReference } from './ShortDramaArtifactIndex';
import type {
  ShortDramaArtifactAttempt,
  ShortDramaArtifactRevision,
  ShortDramaImpactItem,
  ShortDramaMediaReference,
  ShortDramaProject,
  ShortDramaStage,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-audit-log' as const;

export type ShortDramaAuditEvent =
  | {
      type: 'revision';
      title: string;
      timestamp: number;
      revisionId: string;
      version: number;
      source?: ShortDramaArtifactRevision['source'];
      reason?: string;
      userInstruction?: string;
      changedFields: string[];
      relatedMediaItemId?: string;
    }
  | {
      type: 'attempt';
      title: string;
      timestamp: number;
      attemptId: string;
      status: ShortDramaArtifactAttempt['status'];
      relatedRevisionId?: string;
      runId?: string;
      failureReason?: string;
      orchestratorCorrection?: string;
    }
  | {
      type: 'impact';
      title: 'Downstream impact';
      timestamp: number;
      affectedArtifactIds: string[];
      recommendations: ShortDramaImpactItem[];
    }
  | {
      type: 'media';
      title: 'Media reference';
      timestamp: number;
      mediaItemId: string;
      mediaKind: ShortDramaMediaReference['kind'];
      mediaLabel?: string;
      previewState: 'available' | 'referenced';
      playable: boolean;
    };

export type ShortDramaArtifactChangeExplanation =
  | {
      status: 'ready';
      source: typeof SOURCE;
      artifactId: string;
      handle: string;
      displayName: string;
      currentStatus: string;
      summary: string;
      events: ShortDramaAuditEvent[];
      omittedContext: Array<'rawMediaPayloads' | 'fullPromptHistory' | 'unrelatedArtifacts'>;
    }
  | {
      status: 'not_found';
      source: typeof SOURCE;
      error: { code: 'artifact_missing'; message: string };
    }
  | {
      status: 'conflict';
      source: typeof SOURCE;
      error: { code: 'handle_conflict'; message: string };
      matches: Array<{ id: string; handle: string; displayName: string }>;
    };

export interface ShortDramaProjectAuditLogQuery {
  stage?: ShortDramaStage;
  artifactIdOrHandle?: string;
  limit?: number;
}

export interface ShortDramaProjectAuditLogEntry {
  artifactId: string;
  handle: string;
  displayName: string;
  stage: ShortDramaStage;
  currentStatus: string;
  latestEventType: ShortDramaAuditEvent['type'];
  latestTimestamp: number;
  latestReason?: string;
  actor?: ShortDramaArtifactRevision['source'];
  affectedArtifactIds: string[];
  omittedContext: Array<'rawMediaPayloads' | 'fullPromptHistory' | 'unrelatedArtifacts'>;
}

export type ShortDramaProjectAuditLogResult =
  | {
      status: 'ready';
      source: typeof SOURCE;
      projectId: string;
      query: ShortDramaProjectAuditLogQuery;
      entries: ShortDramaProjectAuditLogEntry[];
      omittedContext: Array<'rawMediaPayloads' | 'fullPromptHistory' | 'unrelatedArtifacts'>;
    }
  | {
      status: 'empty';
      source: typeof SOURCE;
      projectId: string;
      query: ShortDramaProjectAuditLogQuery;
      reason: 'no_audit_events';
    };

export function createShortDramaArtifactChangeExplanation(
  project: ShortDramaProject,
  idOrHandle: string,
): ShortDramaArtifactChangeExplanation {
  const resolved = resolveShortDramaArtifactReference(project, idOrHandle);
  if (resolved.status === 'not_found') {
    return {
      status: 'not_found',
      source: SOURCE,
      error: resolved.error,
    };
  }
  if (resolved.status === 'conflict') {
    return {
      status: 'conflict',
      source: SOURCE,
      error: resolved.error,
      matches: resolved.matches.map(match => ({
        id: match.id,
        handle: match.handle,
        displayName: match.displayName,
      })),
    };
  }

  const { artifact, entry } = resolved;
  const revisionEvents = artifact.revisions.map(createRevisionEvent);
  const attemptOffset = Math.max(0, artifact.attemptCount - artifact.attempts.length);
  const attemptEvents = artifact.attempts.map((attempt, index) => createAttemptEvent(attempt, attemptOffset + index + 1));
  const impactEvents = artifact.revisions.flatMap(createImpactEvents);
  const mediaEvent = artifact.mediaReference ? [createMediaEvent(artifact.mediaReference)] : [];
  const events = [...revisionEvents, ...attemptEvents, ...impactEvents, ...mediaEvent]
    .sort((left, right) => left.timestamp - right.timestamp);

  return {
    status: 'ready',
    source: SOURCE,
    artifactId: artifact.id,
    handle: entry.handle,
    displayName: entry.displayName,
    currentStatus: artifact.status,
    summary: createExplanationSummary(artifact.title, artifact.revisions.at(-1)),
    events,
    omittedContext: ['rawMediaPayloads', 'fullPromptHistory', 'unrelatedArtifacts'],
  };
}

export function createShortDramaProjectAuditLog(
  project: ShortDramaProject,
  query: ShortDramaProjectAuditLogQuery = {},
): ShortDramaProjectAuditLogResult {
  const queryArtifactIds = resolveAuditQueryArtifactIds(project, query.artifactIdOrHandle);
  const entries = project.artifacts
    .filter(artifact => query.stage ? artifact.stage === query.stage : true)
    .filter(artifact => queryArtifactIds ? queryArtifactIds.has(artifact.id) : true)
    .map(artifact => {
      const explanation = createShortDramaArtifactChangeExplanation(project, artifact.id);
      if (explanation.status !== 'ready' || explanation.events.length === 0) {
        return undefined;
      }

      const latestEvent = explanation.events.at(-1);
      if (!latestEvent) {
        return undefined;
      }

      return createProjectAuditEntry(artifact.stage, explanation, latestEvent);
    })
    .filter((entry): entry is ShortDramaProjectAuditLogEntry => Boolean(entry))
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp)
    .slice(0, query.limit ?? 20);

  if (entries.length === 0) {
    return {
      status: 'empty',
      source: SOURCE,
      projectId: project.projectId,
      query,
      reason: 'no_audit_events',
    };
  }

  return {
    status: 'ready',
    source: SOURCE,
    projectId: project.projectId,
    query,
    entries,
    omittedContext: ['rawMediaPayloads', 'fullPromptHistory', 'unrelatedArtifacts'],
  };
}

function resolveAuditQueryArtifactIds(
  project: ShortDramaProject,
  artifactIdOrHandle?: string,
) {
  if (!artifactIdOrHandle) {
    return undefined;
  }

  const resolved = resolveShortDramaArtifactReference(project, artifactIdOrHandle);
  if (resolved.status === 'ready') {
    return new Set([resolved.artifact.id]);
  }
  if (resolved.status === 'conflict') {
    return new Set(resolved.matches.map(match => match.id));
  }
  return new Set<string>();
}

function createRevisionEvent(revision: ShortDramaArtifactRevision): ShortDramaAuditEvent {
  return {
    type: 'revision',
    title: `Revision ${revision.version}`,
    timestamp: revision.createdAt,
    revisionId: revision.id,
    version: revision.version,
    source: revision.source,
    reason: revision.reason ?? revision.summary,
    userInstruction: revision.userInstruction,
    changedFields: revision.changedFields ?? [],
    relatedMediaItemId: revision.mediaItemId,
  };
}

function createAttemptEvent(attempt: ShortDramaArtifactAttempt, attemptNumber: number): ShortDramaAuditEvent {
  return {
    type: 'attempt',
    title: `Attempt ${attemptNumber}`,
    timestamp: attempt.createdAt,
    attemptId: attempt.id,
    status: attempt.status,
    relatedRevisionId: attempt.revisionId,
    runId: attempt.runId,
    failureReason: attempt.failureReason,
    orchestratorCorrection: attempt.orchestratorCorrection,
  };
}

function createImpactEvents(revision: ShortDramaArtifactRevision): ShortDramaAuditEvent[] {
  const recommendations = revision.downstreamImpact ?? [];
  if (recommendations.length === 0) {
    return [];
  }

  return [{
    type: 'impact',
    title: 'Downstream impact',
    timestamp: revision.createdAt,
    affectedArtifactIds: recommendations.map(item => item.artifactId),
    recommendations,
  }];
}

function createMediaEvent(media: ShortDramaMediaReference): ShortDramaAuditEvent {
  return {
    type: 'media',
    title: 'Media reference',
    timestamp: 0,
    mediaItemId: media.mediaItemId,
    mediaKind: media.kind,
    mediaLabel: media.label,
    previewState: media.previewUrl || media.thumbnailUrl ? 'available' : 'referenced',
    playable: media.kind === 'video' && Boolean(media.previewUrl),
  };
}

function createProjectAuditEntry(
  stage: ShortDramaStage,
  explanation: Extract<ShortDramaArtifactChangeExplanation, { status: 'ready' }>,
  latestEvent: ShortDramaAuditEvent,
): ShortDramaProjectAuditLogEntry {
  const latestRevision = explanation.events
    .filter((event): event is Extract<ShortDramaAuditEvent, { type: 'revision' }> => event.type === 'revision')
    .sort((left, right) => right.version - left.version)
    .at(0);
  const primaryEvent = latestRevision ?? latestEvent;
  const affectedArtifactIds = explanation.events
    .filter((event): event is Extract<ShortDramaAuditEvent, { type: 'impact' }> => event.type === 'impact')
    .flatMap(event => event.affectedArtifactIds);

  return {
    artifactId: explanation.artifactId,
    handle: explanation.handle,
    displayName: explanation.displayName,
    stage,
    currentStatus: explanation.currentStatus,
    latestEventType: primaryEvent.type,
    latestTimestamp: primaryEvent.timestamp,
    latestReason: latestRevision?.reason,
    actor: latestRevision?.source,
    affectedArtifactIds: [...new Set(affectedArtifactIds)],
    omittedContext: ['rawMediaPayloads', 'fullPromptHistory', 'unrelatedArtifacts'],
  };
}

function createExplanationSummary(title: string, latestRevision?: ShortDramaArtifactRevision) {
  if (!latestRevision) {
    return `${title} has no recorded revisions yet.`;
  }

  const reason = latestRevision.reason ?? latestRevision.summary;
  const source = latestRevision.source ? ` by ${latestRevision.source}` : '';
  return `${title} changed${source}: ${reason}`;
}
