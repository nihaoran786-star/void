import { useEffect, useRef, useState } from 'react';
import { flowChatStore } from '../store/FlowChatStore';
import {
  areSessionCapabilitiesEqual,
  deriveSessionCapabilities,
  type SessionCapabilityPresentation,
} from '../services/sessionCapabilities';
import type { DialogTurn, FlowChatState } from '../types/flow-chat';

interface ActiveSessionCapabilitiesSnapshot {
  sessionId: string | null;
  /** Persona the conversation is bound to, for capabilities that author it. */
  personaId?: string;
  /** Workspace the session itself is bound to — the shell's currently opened
   * workspace can be absent (or a different one) while a session is active. */
  workspaceId?: string;
  workspacePath?: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
  capabilities: SessionCapabilityPresentation[];
}

interface TurnCapabilityCacheEntry {
  turn: DialogTurn;
  capabilities: SessionCapabilityPresentation[];
}

interface SessionCapabilityProjectionCache {
  sessionId: string | null;
  turns: Map<string, TurnCapabilityCacheEntry>;
}

function aggregateTurnCapabilities(
  entries: Iterable<TurnCapabilityCacheEntry>,
  baseline: SessionCapabilityPresentation[] = [],
): SessionCapabilityPresentation[] {
  const aggregated = new Map<
    SessionCapabilityPresentation['id'],
    SessionCapabilityPresentation
  >();

  for (const capability of baseline) {
    aggregated.set(capability.id, { ...capability });
  }

  for (const entry of entries) {
    for (const capability of entry.capabilities) {
      const current = aggregated.get(capability.id);
      if (!current) {
        aggregated.set(capability.id, { ...capability });
        continue;
      }

      aggregated.set(capability.id, {
        ...(capability.latestActivityAt >= current.latestActivityAt
          ? capability
          : current),
        usageCount: current.usageCount + capability.usageCount,
      });
    }
  }

  return ['short-drama', 'workspace-media', 'infinite-canvas', 'agent-studio']
    .map(id => aggregated.get(
      id as SessionCapabilityPresentation['id'],
    ))
    .filter(
      (value): value is SessionCapabilityPresentation => Boolean(value),
    );
}

function selectSnapshot(
  state: FlowChatState,
  cache: SessionCapabilityProjectionCache,
): ActiveSessionCapabilitiesSnapshot {
  const sessionId = state.activeSessionId;
  const session = sessionId ? state.sessions.get(sessionId) : undefined;

  if (!sessionId || !session) {
    cache.sessionId = null;
    cache.turns.clear();
    return { sessionId, capabilities: [] };
  }

  if (cache.sessionId !== sessionId) {
    cache.sessionId = sessionId;
    cache.turns.clear();
  }

  const liveTurnIds = new Set(session.dialogTurns.map(turn => turn.id));
  for (const turnId of cache.turns.keys()) {
    if (!liveTurnIds.has(turnId)) {
      cache.turns.delete(turnId);
    }
  }

  for (const turn of session.dialogTurns) {
    const cached = cache.turns.get(turn.id);
    if (cached?.turn === turn) {
      continue;
    }
    cache.turns.set(turn.id, {
      turn,
      capabilities: deriveSessionCapabilities({ dialogTurns: [turn] }),
    });
  }

  const personaId = session.activePersonaBinding?.kind === 'agent'
    ? session.activePersonaBinding.personaId?.trim()
    : undefined;

  return {
    sessionId,
    ...(personaId ? { personaId } : {}),
    ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
    ...(session.workspacePath ? { workspacePath: session.workspacePath } : {}),
    ...(session.remoteConnectionId
      ? { remoteConnectionId: session.remoteConnectionId }
      : {}),
    ...(session.remoteSshHost ? { remoteSshHost: session.remoteSshHost } : {}),
    capabilities: aggregateTurnCapabilities(
      cache.turns.values(),
      deriveSessionCapabilities({
        dialogTurns: [],
        mode: session.mode,
        sessionKind: session.sessionKind,
        activePersonaBinding: session.activePersonaBinding,
      }),
    ),
  };
}

function areSnapshotsEqual(
  left: ActiveSessionCapabilitiesSnapshot,
  right: ActiveSessionCapabilitiesSnapshot,
): boolean {
  return left.sessionId === right.sessionId
    && left.personaId === right.personaId
    && left.workspaceId === right.workspaceId
    && left.workspacePath === right.workspacePath
    && left.remoteConnectionId === right.remoteConnectionId
    && left.remoteSshHost === right.remoteSshHost
    && areSessionCapabilitiesEqual(left.capabilities, right.capabilities);
}

export function useActiveSessionCapabilities(): ActiveSessionCapabilitiesSnapshot {
  const cacheRef = useRef<SessionCapabilityProjectionCache>({
    sessionId: null,
    turns: new Map(),
  });
  const [snapshot, setSnapshot] = useState(() => selectSnapshot(
    flowChatStore.getState(),
    cacheRef.current,
  ));

  useEffect(() => flowChatStore.subscribe(state => {
    const next = selectSnapshot(state, cacheRef.current);
    setSnapshot(current => areSnapshotsEqual(current, next) ? current : next);
  }), []);

  return snapshot;
}
