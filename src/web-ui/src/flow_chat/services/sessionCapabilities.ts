import type { FlowToolItem, Session } from '../types/flow-chat';

export type SessionCapabilityId =
  | 'short-drama'
  | 'workspace-media'
  | 'agent-studio'
  | 'infinite-canvas';

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
  & Partial<Pick<Session, 'mode' | 'sessionKind'>>
  & {
    activePersonaBinding?: {
      kind?: string;
      personaId?: string;
    } | null;
  };

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
    // Infinite Canvas shares the media parent-session scope in phase 1; the
    // rail stays surface-agnostic and resolves the entry from the capability
    // contribution registry.
    presentations.set('infinite-canvas', {
      id: 'infinite-canvas',
      status: 'ready',
      usageCount: 0,
      latestActivityAt: 0,
    });
  }

  // Agent Studio authors the agent this conversation is running, so it is
  // offered only for an explicitly selected agent persona. A scenario default
  // has nothing authored behind it, a team lead is authored as a team, and a
  // subagent conversation runs a persona it does not own.
  if (
    session.sessionKind !== 'subagent'
    && session.activePersonaBinding?.kind === 'agent'
    && session.activePersonaBinding.personaId?.trim()
  ) {
    presentations.set('agent-studio', {
      id: 'agent-studio',
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

  return ['short-drama', 'workspace-media', 'infinite-canvas', 'agent-studio']
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
