import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeTeamWorkspaceWindow,
  isTeamWorkspaceWindowOpen,
  isTeamWorkspaceWindowSupported,
  listenTeamWorkspaceWindowClosed,
  openTeamWorkspaceWindow,
  revealTeamWorkspaceWindow,
  TEAM_WORKSPACE_WINDOW_CLOSED_EVENT,
} from './TeamWorkspaceWindowService';

const runtimeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
}));

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriEvent = vi.hoisted(() => ({
  listen: vi.fn(),
}));

vi.mock('@/infrastructure/runtime', () => runtimeMock);
vi.mock('@tauri-apps/api/core', () => tauriCore);
vi.mock('@tauri-apps/api/event', () => tauriEvent);

describe('TeamWorkspaceWindowService', () => {
  afterEach(() => {
    runtimeMock.isTauriRuntime.mockReturnValue(true);
    tauriCore.invoke.mockReset();
    tauriEvent.listen.mockReset();
  });

  it('is unavailable and inert outside the desktop runtime', async () => {
    runtimeMock.isTauriRuntime.mockReturnValue(false);

    expect(await openTeamWorkspaceWindow()).toBe(false);
    expect(await closeTeamWorkspaceWindow()).toBe(false);
    expect(await revealTeamWorkspaceWindow()).toBe(false);

    expect(isTeamWorkspaceWindowSupported()).toBe(false);
    expect(await isTeamWorkspaceWindowOpen()).toBe(false);
    expect(tauriCore.invoke).not.toHaveBeenCalled();
    expect(tauriEvent.listen).not.toHaveBeenCalled();
  });

  it('opens, hides, and reveals through dedicated desktop commands', async () => {
    await openTeamWorkspaceWindow();
    await closeTeamWorkspaceWindow();
    await revealTeamWorkspaceWindow();

    expect(tauriCore.invoke.mock.calls.map(([command]) => command)).toEqual([
      'show_team_workspace_desktop_window',
      'hide_team_workspace_desktop_window',
      'reveal_team_workspace_desktop_window',
    ]);
  });

  it('serialises window commands so a close cannot overtake its open', async () => {
    const completed: string[] = [];
    let resolveOpen!: () => void;
    tauriCore.invoke.mockImplementation((command: string) => {
      if (command === 'show_team_workspace_desktop_window') {
        return new Promise<void>(resolve => {
          resolveOpen = () => {
            completed.push(command);
            resolve();
          };
        });
      }
      completed.push(command);
      return Promise.resolve();
    });

    const opening = openTeamWorkspaceWindow();
    const closing = closeTeamWorkspaceWindow();
    await vi.waitFor(() => expect(resolveOpen).toBeTypeOf('function'));
    expect(completed).toEqual([]);

    resolveOpen();
    await Promise.all([opening, closing]);

    expect(completed).toEqual([
      'show_team_workspace_desktop_window',
      'hide_team_workspace_desktop_window',
    ]);
  });

  it('reports a refused window command instead of failing silently', async () => {
    // An application binary that predates these commands rejects the invoke.
    tauriCore.invoke.mockRejectedValueOnce(new Error('command not found'));

    expect(await openTeamWorkspaceWindow()).toBe(false);

    tauriCore.invoke.mockResolvedValueOnce(undefined);
    expect(await closeTeamWorkspaceWindow()).toBe(true);
    expect(tauriCore.invoke).toHaveBeenLastCalledWith(
      'hide_team_workspace_desktop_window',
    );
  });

  it('reports an unreadable window state as closed instead of throwing', async () => {
    tauriCore.invoke.mockRejectedValueOnce(new Error('no such window'));

    expect(await isTeamWorkspaceWindowOpen()).toBe(false);
  });

  it('routes a native close to the handler and stops after disposal', async () => {
    let emit: (() => void) | undefined;
    const unlisten = vi.fn();
    tauriEvent.listen.mockImplementation((event: string, handler: () => void) => {
      expect(event).toBe(TEAM_WORKSPACE_WINDOW_CLOSED_EVENT);
      emit = handler;
      return Promise.resolve(unlisten);
    });
    const handler = vi.fn();

    const remove = await listenTeamWorkspaceWindowClosed(handler);
    emit?.();
    expect(handler).toHaveBeenCalledTimes(1);

    remove();
    expect(unlisten).toHaveBeenCalledTimes(1);
    emit?.();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
