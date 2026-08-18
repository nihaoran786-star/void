import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  areTeamWorkspaceWindowPresentationsEquivalent,
  listenTeamWorkspaceBinding,
  publishTeamWorkspaceBinding,
  requestTeamWorkspaceBinding,
  type TeamWorkspaceWindowPresentation,
} from './TeamWorkspaceWindowBridge';

const runtimeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
}));

const tauriEvent = vi.hoisted(() => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@/infrastructure/runtime', () => runtimeMock);
vi.mock('@tauri-apps/api/event', () => tauriEvent);

function ready(
  overrides: Partial<
    Extract<TeamWorkspaceWindowPresentation, { status: 'ready' }>['binding']
  > = {},
  sequence = 1,
): TeamWorkspaceWindowPresentation {
  return {
    status: 'ready',
    sequence,
    binding: {
      parentSessionId: 'session-1',
      workspacePath: 'D:/repo',
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
      bindingKey: 'binding-1',
      refreshKey: 'refresh-1',
      ...overrides,
    },
  };
}

describe('team workspace window binding equivalence', () => {
  it('treats a first presentation as a change', () => {
    expect(areTeamWorkspaceWindowPresentationsEquivalent(null, ready())).toBe(false);
  });

  it('treats a resent identical binding as equivalent', () => {
    expect(
      areTeamWorkspaceWindowPresentationsEquivalent(ready({}, 1), ready({}, 2)),
    ).toBe(true);
  });

  it('detects a new team run, a new workspace, and a new turn', () => {
    expect(areTeamWorkspaceWindowPresentationsEquivalent(
      ready(),
      ready({ bindingKey: 'binding-2' }),
    )).toBe(false);
    expect(areTeamWorkspaceWindowPresentationsEquivalent(
      ready(),
      ready({ workspacePath: 'D:/other' }),
    )).toBe(false);
    expect(areTeamWorkspaceWindowPresentationsEquivalent(
      ready(),
      ready({ refreshKey: 'refresh-2' }),
    )).toBe(false);
  });

  it('separates the two unavailable reasons and the ready/unavailable transition', () => {
    const noTeam: TeamWorkspaceWindowPresentation = {
      status: 'unavailable',
      sequence: 1,
      reason: 'no-team-binding',
    };
    const noSession: TeamWorkspaceWindowPresentation = {
      status: 'unavailable',
      sequence: 2,
      reason: 'no-active-session',
    };

    expect(areTeamWorkspaceWindowPresentationsEquivalent(noTeam, {
      ...noTeam,
      sequence: 9,
    })).toBe(true);
    expect(areTeamWorkspaceWindowPresentationsEquivalent(noTeam, noSession)).toBe(false);
    expect(areTeamWorkspaceWindowPresentationsEquivalent(noTeam, ready())).toBe(false);
    expect(areTeamWorkspaceWindowPresentationsEquivalent(ready(), noTeam)).toBe(false);
  });
});

describe('team workspace window transport', () => {
  afterEach(() => {
    runtimeMock.isTauriRuntime.mockReturnValue(true);
    tauriEvent.emit.mockReset();
    tauriEvent.listen.mockReset();
  });

  it('tells the window when the transport is unusable instead of going quiet', async () => {
    runtimeMock.isTauriRuntime.mockReturnValue(false);
    const received = vi.fn();

    await publishTeamWorkspaceBinding(ready());
    await requestTeamWorkspaceBinding();
    const remove = await listenTeamWorkspaceBinding(received);
    remove();

    expect(tauriEvent.emit).not.toHaveBeenCalled();
    expect(tauriEvent.listen).not.toHaveBeenCalled();
    // A silent subscription would leave the window with nothing to paint and
    // therefore permanently hidden.
    expect(received).toHaveBeenCalledWith({
      status: 'unavailable',
      sequence: 0,
      reason: 'transport-unavailable',
    });
  });

  it('carries the binding payload and stops delivering after disposal', async () => {
    let deliver: ((event: { payload: TeamWorkspaceWindowPresentation }) => void) | undefined;
    const unlisten = vi.fn();
    tauriEvent.listen.mockImplementation((_event: string, handler: typeof deliver) => {
      deliver = handler;
      return Promise.resolve(unlisten);
    });
    const received = vi.fn();

    const remove = await listenTeamWorkspaceBinding(received);
    await publishTeamWorkspaceBinding(ready());
    expect(tauriEvent.emit).toHaveBeenCalledWith(
      'void://team-workspace-binding',
      ready(),
    );

    deliver?.({ payload: ready() });
    expect(received).toHaveBeenCalledWith(ready());

    remove();
    deliver?.({ payload: ready({}, 2) });
    expect(received).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('keeps the presentation alive when the transport fails', async () => {
    tauriEvent.emit.mockRejectedValueOnce(new Error('event bus unavailable'));

    await expect(publishTeamWorkspaceBinding(ready())).resolves.toBeUndefined();

    tauriEvent.listen.mockRejectedValueOnce(new Error('event bus unavailable'));
    const received = vi.fn();
    const remove = await listenTeamWorkspaceBinding(received);
    expect(remove).toBeTypeOf('function');
    expect(received).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable',
      reason: 'transport-unavailable',
    }));
    remove();
  });
});
