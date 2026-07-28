import type { FlowToolItem, Session } from '../types/flow-chat';

export type SessionCapabilityId = 'short-drama' | 'workspace-media';

export type SessionCapabilityStatus =
  | 'running'
  | 'attention'
  | 'ready'
  | 'failed';

export interface SessionCapabilityPresentation {
  id: SessionCapabilityId;
  status: SessionCapabilityStatus;
  usageCount: number;
  latestActivityAt: number;
}

type SessionCapabilitySource = Pick<Session, 'dialogTurns'>
  & Partial<Pick<Session, 'mode' | 'sessionKind'>>;

const MEDIA_TOOL_NAMES = new Set([
  'GenerateImage',
  'GenerateVideo',
  'UploadMediaImage',
]);

const RUNNING_TOOL_STATUSES = new Set<FlowToolItem['status']>([
  'pending',
  'preparing',
  'running',
  'streaming',
  'receiving',
  'analyzing',
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function hasShortDramaCoordinates(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(
    asRecord(record?.shortDrama)
    || asRecord(record?.short_drama),
  );
}

function capabilityIdsForTool(tool: FlowToolItem): SessionCapabilityId[] {
  const ids: SessionCapabilityId[] = [];
  const isMediaTool = MEDIA_TOOL_NAMES.has(tool.toolName);

  if (isMediaTool) {
    ids.push('workspace-media');
  }

  if (
    tool.toolName === 'ShortDramaProject'
    || (
      isMediaTool
      && (
        hasShortDramaCoordinates(tool.toolCall?.input)
        || hasShortDramaCoordinates(tool.toolResult?.result)
      )
    )
  ) {
    ids.push('short-drama');
  }

  return ids;
}

function statusForTool(tool: FlowToolItem): SessionCapabilityStatus {
  if (tool.status === 'pending_confirmation') {
    return 'attention';
  }
  if (RUNNING_TOOL_STATUSES.has(tool.status)) {
    return 'running';
  }
  if (tool.status === 'completed' || tool.status === 'confirmed') {
    return 'ready';
  }
  return 'failed';
}

function activityTimeForTool(tool: FlowToolItem): number {
  return tool.endTime ?? tool.startTime ?? tool.timestamp;
}

/**
 * Projects durable, session-specific capabilities from the existing persisted
 * session mode and tool transcript. This keeps capability discovery isolated
 * per session and avoids introducing a second persistence model.
 */
export function deriveSessionCapabilities(
  session: SessionCapabilitySource | undefined,
): SessionCapabilityPresentation[] {
  if (!session) {
    return [];
  }

  const presentations = new Map<
    SessionCapabilityId,
    SessionCapabilityPresentation
  >();
  const countedToolIds = new Map<SessionCapabilityId, Set<string>>();

  if (
    session.mode?.trim().toLowerCase() === 'media'
    && session.sessionKind !== 'subagent'
  ) {
    presentations.set('workspace-media', {
      id: 'workspace-media',
      status: 'ready',
      usageCount: 0,
      latestActivityAt: 0,
    });
  }

  for (const turn of session.dialogTurns) {
    for (const round of turn.modelRounds) {
      for (const item of round.items) {
        if (item.type !== 'tool') {
          continue;
        }

        const tool = item as FlowToolItem;
        const latestActivityAt = activityTimeForTool(tool);

        for (const capabilityId of capabilityIdsForTool(tool)) {
          const countedIds = countedToolIds.get(capabilityId) ?? new Set<string>();
          countedIds.add(tool.id);
          countedToolIds.set(capabilityId, countedIds);

          const current = presentations.get(capabilityId);
          if (!current || latestActivityAt >= current.latestActivityAt) {
            presentations.set(capabilityId, {
              id: capabilityId,
              status: statusForTool(tool),
              usageCount: countedIds.size,
              latestActivityAt,
            });
          } else {
            presentations.set(capabilityId, {
              ...current,
              usageCount: countedIds.size,
            });
          }
        }
      }
    }
  }

  return ['short-drama', 'workspace-media']
    .map(id => presentations.get(id as SessionCapabilityId))
    .filter(
      (value): value is SessionCapabilityPresentation => Boolean(value),
    );
}

export function areSessionCapabilitiesEqual(
  left: SessionCapabilityPresentation[],
  right: SessionCapabilityPresentation[],
): boolean {
  return left.length === right.length
    && left.every((capability, index) => {
      const other = right[index];
      return capability.id === other?.id
        && capability.status === other.status
        && capability.usageCount === other.usageCount
        && capability.latestActivityAt === other.latestActivityAt;
    });
}
