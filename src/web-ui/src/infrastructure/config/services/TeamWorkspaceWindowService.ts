import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('TeamWorkspaceWindowService');

/**
 * Desktop host for the Team window.
 *
 * The window is a presentation host only: opening, closing, and revealing it
 * never touches the Team run, its member child sessions, or the parent
 * conversation. It reuses the same multi-window pipeline as the compact chat
 * floating window, so no new runtime or data channel is introduced.
 */
export const TEAM_WORKSPACE_WINDOW_CLOSED_EVENT = 'void://team-workspace-window-closed';

type TeamWorkspaceWindowCommand =
  | 'show_team_workspace_desktop_window'
  | 'hide_team_workspace_desktop_window'
  | 'reveal_team_workspace_desktop_window';

let teamWorkspaceWindowChain: Promise<void> = Promise.resolve();

/**
 * Runs one window command and reports whether the desktop host actually
 * performed it. A refusal must stay visible: a silently swallowed failure
 * leaves the rail's Team capsule claiming a window that does not exist.
 */
async function invokeTeamWorkspaceWindowCommand(
  command: TeamWorkspaceWindowCommand,
): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  let succeeded = false;
  const run = async (): Promise<void> => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke(command);
      succeeded = true;
    } catch (error) {
      log.error('Team workspace window command was refused by the desktop host', {
        command,
        error,
      });
    }
  };

  teamWorkspaceWindowChain = teamWorkspaceWindowChain.then(run, run);
  await teamWorkspaceWindowChain;
  return succeeded;
}

export function isTeamWorkspaceWindowSupported(): boolean {
  return isTauriRuntime();
}

/** Resolves to `true` only when the desktop window is really up. */
export async function openTeamWorkspaceWindow(): Promise<boolean> {
  return invokeTeamWorkspaceWindowCommand('show_team_workspace_desktop_window');
}

export async function closeTeamWorkspaceWindow(): Promise<boolean> {
  return invokeTeamWorkspaceWindowCommand('hide_team_workspace_desktop_window');
}

/**
 * Called from inside the Team window once it has real content to paint, so the
 * user never sees an empty frame.
 */
export async function revealTeamWorkspaceWindow(): Promise<boolean> {
  return invokeTeamWorkspaceWindowCommand('reveal_team_workspace_desktop_window');
}

export async function isTeamWorkspaceWindowOpen(): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('is_team_workspace_desktop_window_open');
  } catch (error) {
    log.warn('Failed to read team workspace window state', error);
    return false;
  }
}

/**
 * Fires when the window disappears for any reason, including the native close
 * button. Closing is presentation-only, so the handler must never cancel a run
 * or delete a child session.
 */
export async function listenTeamWorkspaceWindowClosed(
  handler: () => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;

  let disposed = false;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen(TEAM_WORKSPACE_WINDOW_CLOSED_EVENT, () => {
      if (disposed) return;
      handler();
    });

    return () => {
      disposed = true;
      unlisten();
    };
  } catch (error) {
    log.warn('Failed to listen for team workspace window close', error);
    return () => {
      disposed = true;
    };
  }
}
