import { globalEventBus } from '@/infrastructure/event-bus';
import {
  applyShortDramaAgentEvent,
  mapShortDramaSubagentSessionLinked,
} from './ShortDramaProjectViewModel';
import type {
  ShortDramaAgentEvent,
  ShortDramaArtifactStatusEvent,
  ShortDramaError,
  ShortDramaManifestState,
  ShortDramaMediaReference,
  ShortDramaProject,
  ShortDramaStage,
  ShortDramaSubagentSessionMetadata,
  ShortDramaSubagentSessionLinkedInput,
  ShortDramaSubagentSessionLinkedResult,
} from './ShortDramaTypes';

export type ShortDramaRuntimeBridgeSaveProject = (project: ShortDramaProject) => Promise<ShortDramaManifestState>;

export type ShortDramaRuntimeAgentEventResult =
  | { status: 'ready'; project: ShortDramaProject; artifactId: string }
  | { status: 'error'; error: ShortDramaError };

export type ShortDramaRuntimeIgnoredEventReason =
  | 'missing_event_fields'
  | 'missing_short_drama_metadata'
  | 'project_mismatch'
  | 'artifact_missing'
  | 'unsupported_event_type';

export interface ShortDramaRuntimeIgnoredEvent {
  status: 'ignored';
  source: 'runtime-bridge';
  reason: ShortDramaRuntimeIgnoredEventReason;
  projectId: string;
  eventType?: string;
  toolId?: string;
  artifactId?: string;
  eventProjectId?: string;
}

export interface ShortDramaRuntimeBridgeOptions {
  project: ShortDramaProject;
  saveProject?: ShortDramaRuntimeBridgeSaveProject;
  onProjectChange?: (project: ShortDramaProject) => void;
  onStatusEvent?: (event: ShortDramaArtifactStatusEvent) => void;
}

export interface ShortDramaRuntimeBridge {
  getProject(): ShortDramaProject;
  handleSubagentSessionLinked(event: ShortDramaSubagentSessionLinkedInput): Promise<ShortDramaSubagentSessionLinkedResult>;
  handleAgentEvent(event: ShortDramaAgentEvent): Promise<ShortDramaRuntimeAgentEventResult>;
}

export function createShortDramaRuntimeBridge(options: ShortDramaRuntimeBridgeOptions): ShortDramaRuntimeBridge {
  let project = options.project;

  async function persist(nextProject: ShortDramaProject) {
    project = nextProject;
    options.onProjectChange?.(nextProject);
    if (options.saveProject) {
      await options.saveProject(nextProject);
    }
  }

  return {
    getProject() {
      return project;
    },

    async handleSubagentSessionLinked(event) {
      const result = mapShortDramaSubagentSessionLinked(project, event);
      if (result.status === 'ready') {
        await persist(result.project);
      }
      return result;
    },

    async handleAgentEvent(event) {
      if (!project.artifacts.some(artifact => artifact.id === event.artifactId)) {
        return {
          status: 'error',
          error: { code: 'artifact_missing', message: 'Short drama artifact was not found.' },
        };
      }

      const nextProject = applyShortDramaAgentEvent(project, event);
      await persist(nextProject);
      const statusEvent = createShortDramaArtifactStatusEvent(nextProject, event);
      if (statusEvent) {
        options.onStatusEvent?.(statusEvent);
      }
      return { status: 'ready', project: nextProject, artifactId: event.artifactId };
    },
  };
}

export function createShortDramaArtifactStatusEvent(
  project: ShortDramaProject,
  event: ShortDramaAgentEvent,
): ShortDramaArtifactStatusEvent | undefined {
  const artifact = project.artifacts.find(item => item.id === event.artifactId);
  if (!artifact) {
    return undefined;
  }

  const attempt = artifact.attempts.find(item => item.runId === event.runId);
  const error = event.type === 'failed' || event.type === 'cancelled'
    ? {
        code: event.type === 'cancelled' ? 'unsupported_runtime' as const : 'load_failed' as const,
        message: event.failureReason ?? (event.type === 'cancelled'
          ? 'Short drama runtime action was cancelled.'
          : 'Short drama runtime action failed.'),
      }
    : undefined;

  return {
    eventId: `${event.source ?? 'runtime'}:${event.type}:${event.runId}:${event.artifactId}:${event.timestamp}`,
    source: event.source ?? 'runtime',
    projectId: project.projectId,
    artifactId: artifact.id,
    attemptId: attempt?.id,
    status: artifact.status,
    mediaReference: artifact.mediaReference,
    error,
    occurredAt: event.timestamp,
  };
}

export interface ShortDramaRuntimeEventBus {
  on(
    eventName: 'agent:subagent-session-linked' | 'agent:tool-run-event',
    handler: (event: unknown) => void,
  ): () => void;
}

export function connectShortDramaRuntimeBridgeToEventBus(
  bridge: ShortDramaRuntimeBridge,
  eventBus: ShortDramaRuntimeEventBus = globalEventBus,
  options: { onIgnoredEvent?: (event: ShortDramaRuntimeIgnoredEvent) => void } = {},
): () => void {
  const unsubscribers = [
    eventBus.on('agent:subagent-session-linked', event => {
      void handleShortDramaSubagentSessionLinkedPayload(bridge, event);
    }),
    eventBus.on('agent:tool-run-event', event => {
      void handleShortDramaToolRunPayload(bridge, event, options.onIgnoredEvent);
    }),
  ];

  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

/**
 * The two payload handlers, exported so a subscription that is not built
 * around one already-loaded project can reuse them verbatim (see
 * {@link file://./ShortDramaRuntimeBridgeSubscription.ts}). Splitting them out
 * changes nothing about what either one does.
 */
export async function handleShortDramaSubagentSessionLinkedPayload(
  bridge: ShortDramaRuntimeBridge,
  event: unknown,
): Promise<ShortDramaSubagentSessionLinkedResult | undefined> {
  const payload = event as Record<string, unknown> | undefined;
  if (!payload) {
    return undefined;
  }
  const shortDrama = extractShortDramaMetadata(payload);

  return bridge.handleSubagentSessionLinked({
    childSessionId: typeof payload.childSessionId === 'string' ? payload.childSessionId : undefined,
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    parentSessionId: typeof payload.parentSessionId === 'string' ? payload.parentSessionId : undefined,
    parentToolCallId: typeof payload.parentToolCallId === 'string' ? payload.parentToolCallId : getString(shortDrama, 'parentToolCallId'),
    agentType: typeof payload.agentType === 'string' ? payload.agentType : undefined,
    artifactId: typeof payload.artifactId === 'string' ? payload.artifactId : getString(shortDrama, 'artifactId'),
    shortDrama: createSubagentSessionMetadata(shortDrama),
  });
}

export async function handleShortDramaToolRunPayload(
  bridge: ShortDramaRuntimeBridge,
  event: unknown,
  onIgnoredEvent?: (event: ShortDramaRuntimeIgnoredEvent) => void,
): Promise<ShortDramaRuntimeAgentEventResult | ShortDramaRuntimeIgnoredEvent> {
  const mapped = mapToolRunObserverEventToAgentEvent(bridge.getProject(), event);
  if (mapped.status === 'ignored') {
    onIgnoredEvent?.(mapped);
    return mapped;
  }

  return bridge.handleAgentEvent(mapped.event);
}

/**
 * Does this payload carry short-drama coordinates at all?
 *
 * A cheap, synchronous pre-filter. The application-level subscription has to
 * decide whether an event is worth reading the project off disk for, and the
 * tool-run lane carries every tool run in the app.
 */
export function payloadCarriesShortDramaMetadata(event: unknown): boolean {
  const payload = event as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  return hasShortDramaMetadata(extractShortDramaMetadata(payload));
}

function mapToolRunObserverEventToAgentEvent(
  project: ShortDramaProject,
  event: unknown,
): { status: 'ready'; event: ShortDramaAgentEvent } | ShortDramaRuntimeIgnoredEvent {
  const payload = event as Record<string, unknown> | undefined;
  if (!payload) {
    return createIgnoredRuntimeEvent(project, 'missing_event_fields');
  }

  const eventType = typeof payload.eventType === 'string' ? payload.eventType : undefined;
  const toolId = typeof payload.toolId === 'string' ? payload.toolId : undefined;
  if (!eventType || !toolId) {
    return createIgnoredRuntimeEvent(project, 'missing_event_fields', { eventType, toolId });
  }

  const shortDrama = extractShortDramaMetadata(payload);
  const eventProjectId = typeof shortDrama.projectId === 'string' ? shortDrama.projectId : undefined;
  if (eventProjectId && eventProjectId !== project.projectId) {
    return createIgnoredRuntimeEvent(project, 'project_mismatch', { eventType, toolId, eventProjectId });
  }

  const artifactHandle = getString(shortDrama, 'artifactHandle') ?? getString(shortDrama, 'activeArtifactHandle');
  const artifactId = typeof shortDrama.artifactId === 'string'
    ? shortDrama.artifactId
    : artifactHandle
      ? project.artifacts.find(artifact => artifact.handle === artifactHandle || artifact.id === artifactHandle)?.id
      : project.artifacts.find(artifact => artifact.parentToolCallId === toolId)?.id;
  if (!artifactId) {
    return createIgnoredRuntimeEvent(
      project,
      hasShortDramaMetadata(shortDrama) ? 'artifact_missing' : 'missing_short_drama_metadata',
      { eventType, toolId, eventProjectId },
    );
  }

  if (!project.artifacts.some(artifact => artifact.id === artifactId)) {
    return createIgnoredRuntimeEvent(project, 'artifact_missing', { eventType, toolId, artifactId, eventProjectId });
  }

  const type = mapToolEventType(eventType);
  if (!type) {
    return createIgnoredRuntimeEvent(project, 'unsupported_event_type', { eventType, toolId, artifactId, eventProjectId });
  }

  return {
    status: 'ready',
    event: {
      type,
      artifactId,
      runId: typeof shortDrama.runId === 'string' ? shortDrama.runId : toolId,
      timestamp: Date.now(),
      source: 'tool',
      outputMediaItemId: typeof shortDrama.outputMediaItemId === 'string'
        ? shortDrama.outputMediaItemId
        : undefined,
      outputMediaReference: createOutputMediaReference(shortDrama),
      failureReason: typeof payload.error === 'string'
        ? payload.error
        : typeof payload.reason === 'string'
          ? payload.reason
          : undefined,
      orchestratorCorrection: typeof shortDrama.orchestratorCorrection === 'string'
        ? shortDrama.orchestratorCorrection
        : undefined,
      retryLimit: typeof shortDrama.retryLimit === 'number' ? shortDrama.retryLimit : undefined,
    },
  };
}

function createIgnoredRuntimeEvent(
  project: ShortDramaProject,
  reason: ShortDramaRuntimeIgnoredEventReason,
  detail: Partial<Pick<ShortDramaRuntimeIgnoredEvent, 'eventType' | 'toolId' | 'artifactId' | 'eventProjectId'>> = {},
): ShortDramaRuntimeIgnoredEvent {
  return {
    status: 'ignored',
    source: 'runtime-bridge',
    reason,
    projectId: project.projectId,
    ...detail,
  };
}

function createOutputMediaReference(shortDrama: Record<string, unknown>): ShortDramaMediaReference | undefined {
  const value = shortDrama.outputMediaReference;
  if (!isRecord(value)) {
    const mediaItemId = getString(shortDrama, 'outputMediaItemId') ?? getString(shortDrama, 'mediaItemId');
    const kind = getMediaKind(shortDrama, 'outputMediaKind') ?? getMediaKind(shortDrama, 'mediaKind');
    if (!mediaItemId || !kind) {
      return undefined;
    }

    return {
      mediaItemId,
      kind,
      label: getString(shortDrama, 'outputMediaLabel') ?? getString(shortDrama, 'mediaLabel'),
      localPath: getString(shortDrama, 'outputMediaPath') ?? getString(shortDrama, 'localPath') ?? getString(shortDrama, 'filePath'),
      filePath: getString(shortDrama, 'outputMediaPath') ?? getString(shortDrama, 'filePath') ?? getString(shortDrama, 'localPath'),
      relativePath: getString(shortDrama, 'outputMediaRelativePath') ?? getString(shortDrama, 'relativePath'),
      previewUrl: getString(shortDrama, 'outputPreviewUrl') ?? getString(shortDrama, 'previewUrl'),
      thumbnailUrl: getString(shortDrama, 'outputThumbnailUrl') ?? getString(shortDrama, 'thumbnailUrl'),
      durationMs: getNumber(shortDrama, 'outputDurationMs') ?? getNumber(shortDrama, 'durationMs'),
      source: getMediaSource(shortDrama, 'source') ?? 'generated',
    };
  }

  const mediaItemId = getString(value, 'mediaItemId');
  const kind = getMediaKind(value, 'kind');
  if (!mediaItemId || !kind) {
    return undefined;
  }

  return {
    mediaItemId,
    kind,
    label: getString(value, 'label'),
    localPath: getString(value, 'localPath') ?? getString(value, 'filePath'),
    filePath: getString(value, 'filePath') ?? getString(value, 'localPath'),
    relativePath: getString(value, 'relativePath'),
    previewUrl: getString(value, 'previewUrl'),
    thumbnailUrl: getString(value, 'thumbnailUrl'),
    durationMs: getNumber(value, 'durationMs'),
    source: getMediaSource(value, 'source'),
  };
}

function getString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

function getMediaKind(source: Record<string, unknown>, key: string): ShortDramaMediaReference['kind'] | undefined {
  const value = source[key];
  if (value === 'image' || value === 'video' || value === 'audio') {
    return value;
  }
  return undefined;
}

function getMediaSource(source: Record<string, unknown>, key: string): ShortDramaMediaReference['source'] | undefined {
  const value = source[key];
  if (value === 'generated' || value === 'imported' || value === 'external' || value === 'artifact-reference') {
    return value;
  }
  return undefined;
}

function mapToolEventType(eventType: string): ShortDramaAgentEvent['type'] | undefined {
  if (eventType === 'Started') return 'started';
  if (eventType === 'Progress') return 'progress';
  if (eventType === 'Completed') return 'completed';
  if (eventType === 'Failed') return 'failed';
  if (eventType === 'Cancelled') return 'cancelled';
  if (eventType === 'Queued' || eventType === 'Waiting' || eventType === 'EarlyDetected') return 'created';
  return undefined;
}

function extractShortDramaMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const direct = payload.shortDrama;
  if (isRecord(direct)) return direct;

  const params = payload.params;
  if (isRecord(params) && isRecord(params.shortDrama)) return params.shortDrama;

  const result = payload.result;
  if (isRecord(result) && isRecord(result.shortDrama)) return result.shortDrama;

  return {};
}

function createSubagentSessionMetadata(
  value: Record<string, unknown>,
): ShortDramaSubagentSessionMetadata | undefined {
  const projectId = getString(value, 'projectId');
  const stage = getShortDramaStage(value, 'stage');
  const source = getString(value, 'source');
  if (!projectId || !stage || source !== 'mainAI-dispatch') {
    return undefined;
  }

  return {
    projectId,
    stage,
    artifactId: getString(value, 'artifactId'),
    activeEpisodeId: getString(value, 'activeEpisodeId'),
    activeArtifactId: getString(value, 'activeArtifactId'),
    activeArtifactHandle: getString(value, 'activeArtifactHandle'),
    parentToolCallId: getString(value, 'parentToolCallId'),
    source: 'mainAI-dispatch',
  };
}

function hasShortDramaMetadata(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

function getShortDramaStage(value: Record<string, unknown>, key: string): ShortDramaStage | undefined {
  const stage = getString(value, key);
  if (
    stage === 'script'
    || stage === 'assets'
    || stage === 'storyboards'
    || stage === 'video'
    || stage === 'post'
  ) {
    return stage;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
