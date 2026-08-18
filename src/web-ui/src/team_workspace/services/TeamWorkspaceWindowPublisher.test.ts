import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowChatState } from '@/flow_chat/types/flow-chat';
import {
  readTeamWorkspaceWindowPresentation,
  TeamWorkspaceWindowPublisher,
  type TeamWorkspaceWindowPublisherDeps,
} from './TeamWorkspaceWindowPublisher';
import type { TeamWorkspaceWindowPresentation } from './TeamWorkspaceWindowBridge';

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    subscribe: vi.fn(() => () => undefined),
    getState: vi.fn(() => ({ activeSessionId: null, sessions: new Map() })),
  },
}));

vi.mock('./TeamWorkspaceWindowBridge', async () => {
  const actual = await vi.importActual<
    typeof import('./TeamWorkspaceWindowBridge')
  >('./TeamWorkspaceWindowBridge');
  return {
    ...actual,
    publishTeamWorkspaceBinding: vi.fn(),
    listenTeamWorkspaceBindingRequest: vi.fn(async () => () => undefined),
  };
});

function teamBoundState(overrides: {
  turnCount?: number;
  lastTurnStatus?: string;
  teamInstanceId?: string;
} = {}): FlowChatState {
  const {
    turnCount = 1,
    lastTurnStatus = 'completed',
    teamInstanceId = 'instance-1',
  } = overrides;
  const dialogTurns = Array.from({ length: turnCount }, (_unused, index) => ({
    id: `turn-${index + 1}`,
    status: index === turnCount - 1 ? lastTurnStatus : 'completed',
  }));
  return {
    activeSessionId: 'session-1',
    sessions: new Map([['session-1', {
      sessionKind: 'normal',
      workspacePath: 'D:/repo',
      dialogTurns,
      activePersonaBinding: {
        kind: 'team_lead',
        personaId: 'lead',
        teamDefinitionId: 'team-1',
        teamInstanceId,
        personaRevision: { status: 'known', value: 'revision-1' },
      },
    }]]),
  } as unknown as FlowChatState;
}

function noTeamState(activeSessionId: string | null): FlowChatState {
  return {
    activeSessionId,
    sessions: new Map(activeSessionId ? [[activeSessionId, {
      sessionKind: 'normal',
      workspacePath: 'D:/repo',
      dialogTurns: [],
    }]] : []),
  } as unknown as FlowChatState;
}

describe('readTeamWorkspaceWindowPresentation', () => {
  it('publishes binding identity only, never a mirrored projection', () => {
    const presentation = readTeamWorkspaceWindowPresentation(teamBoundState(), 4);

    expect(presentation.status).toBe('ready');
    expect(presentation).toMatchObject({
      sequence: 4,
      binding: {
        parentSessionId: 'session-1',
        workspacePath: 'D:/repo',
        teamDefinitionId: 'team-1',
        teamInstanceId: 'instance-1',
      },
    });
    expect(Object.keys(presentation)).toEqual(['status', 'sequence', 'binding']);
  });

  it('distinguishes an unbound session from having no session at all', () => {
    expect(readTeamWorkspaceWindowPresentation(noTeamState('session-1'), 1))
      .toMatchObject({ status: 'unavailable', reason: 'no-team-binding' });
    expect(readTeamWorkspaceWindowPresentation(noTeamState(null), 2))
      .toMatchObject({ status: 'unavailable', reason: 'no-active-session' });
  });
});

describe('TeamWorkspaceWindowPublisher', () => {
  let state: FlowChatState;
  let notify: (() => void) | null;
  let requestHandler: (() => void) | null;
  let published: TeamWorkspaceWindowPresentation[];
  let deps: TeamWorkspaceWindowPublisherDeps;
  let unsubscribeStore: ReturnType<typeof vi.fn>;
  let unsubscribeRequests: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = teamBoundState();
    notify = null;
    requestHandler = null;
    published = [];
    unsubscribeStore = vi.fn();
    unsubscribeRequests = vi.fn();
    deps = {
      subscribe: handler => {
        notify = () => handler(state);
        return unsubscribeStore;
      },
      read: () => state,
      publish: presentation => {
        published.push(presentation);
      },
      listenRequests: async handler => {
        requestHandler = handler;
        return unsubscribeRequests;
      },
    };
  });

  it('publishes once on activation and drops equivalent snapshots', async () => {
    const publisher = new TeamWorkspaceWindowPublisher(deps);
    await publisher.activate();
    expect(published).toHaveLength(1);

    // Composer typing and lead streaming reproduce the same binding identity.
    notify?.();
    notify?.();
    expect(published).toHaveLength(1);

    // A completed parent turn is a real change the window must see.
    state = teamBoundState({ turnCount: 2 });
    notify?.();
    expect(published).toHaveLength(2);
    expect(published[1]?.sequence).toBeGreaterThan(published[0]!.sequence);
  });

  it('always republishes for an explicit request from a freshly booted window', async () => {
    const publisher = new TeamWorkspaceWindowPublisher(deps);
    await publisher.activate();
    expect(published).toHaveLength(1);

    requestHandler?.();
    await Promise.resolve();
    expect(published).toHaveLength(2);
    expect(published[1]).toMatchObject({ status: 'ready' });
    expect(published[1]?.sequence).toBe(published[0]!.sequence + 1);
  });

  it('republishes when the same window is reopened without a binding change', async () => {
    const publisher = new TeamWorkspaceWindowPublisher(deps);
    await publisher.activate();
    await publisher.activate();

    expect(published).toHaveLength(2);
    expect(unsubscribeStore).not.toHaveBeenCalled();
  });

  it('stops publishing after suspend and republishes on the next activation', async () => {
    const publisher = new TeamWorkspaceWindowPublisher(deps);
    await publisher.activate();
    publisher.suspend();

    expect(unsubscribeStore).toHaveBeenCalledTimes(1);
    expect(unsubscribeRequests).toHaveBeenCalledTimes(1);

    state = teamBoundState({ turnCount: 3 });
    notify?.();
    requestHandler?.();
    await Promise.resolve();
    expect(published).toHaveLength(1);

    await publisher.activate();
    expect(published).toHaveLength(2);
  });

  it('reports losing the team binding instead of going silent', async () => {
    const publisher = new TeamWorkspaceWindowPublisher(deps);
    await publisher.activate();

    state = noTeamState('session-2');
    notify?.();

    expect(published[1]).toMatchObject({
      status: 'unavailable',
      reason: 'no-team-binding',
    });
  });

  it('drops a subscription that resolves after suspend', async () => {
    let resolveRequests!: (unsubscribe: () => void) => void;
    const publisher = new TeamWorkspaceWindowPublisher({
      ...deps,
      listenRequests: () => new Promise(resolve => {
        resolveRequests = resolve;
      }),
    });

    const activation = publisher.activate();
    publisher.suspend();
    resolveRequests(unsubscribeRequests);
    await activation;

    expect(unsubscribeRequests).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(0);
  });
});
