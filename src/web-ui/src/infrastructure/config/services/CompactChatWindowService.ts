import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('CompactChatWindowService');

export type CompactChatFloatingWindowStatus =
  | { supported: true }
  | { supported: false; reason: 'unsupported-runtime' };

export interface CompactChatWindowSize {
  width: number;
  height: number;
}

export type CompactChatResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

export type CompactChatWindowActivity = 'focused' | 'minimized';

let compactChatWindowChain: Promise<void> = Promise.resolve();

export async function getCompactChatFloatingWindowStatus(): Promise<CompactChatFloatingWindowStatus> {
  if (!isTauriRuntime()) {
    return { supported: false, reason: 'unsupported-runtime' };
  }

  return { supported: true };
}

async function invokeCompactChatWindowCommand(
  command:
    | 'show_compact_chat_desktop_window'
    | 'hide_compact_chat_desktop_window'
    | 'reveal_compact_chat_desktop_window',
): Promise<void> {
  if (!isTauriRuntime()) return;

  const run = async (): Promise<void> => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke(command);
    } catch (error) {
      log.warn('Failed to sync compact chat floating window', { command, error });
    }
  };

  compactChatWindowChain = compactChatWindowChain.then(run, run);
  await compactChatWindowChain;
}

export async function openCompactChatFloatingWindow(): Promise<void> {
  await invokeCompactChatWindowCommand('show_compact_chat_desktop_window');
}

export async function closeCompactChatFloatingWindow(): Promise<void> {
  await invokeCompactChatWindowCommand('hide_compact_chat_desktop_window');
}

export async function revealCompactChatFloatingWindow(): Promise<void> {
  await invokeCompactChatWindowCommand('reveal_compact_chat_desktop_window');
}

export async function minimizeCompactChatFloatingWindow(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    await getCurrentWindow().minimize();
  } catch (error) {
    log.warn('Failed to minimize compact chat floating window', error);
  }
}

export async function listenCompactChatFloatingWindowActivity(
  handler: (activity: CompactChatWindowActivity) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;

  let disposed = false;
  let focusGeneration = 0;
  try {
    const currentWindow = getCurrentWindow();
    const unlisten = await currentWindow.onFocusChanged(({ payload: focused }) => {
      if (disposed) return;
      const generation = ++focusGeneration;
      if (focused) {
        handler('focused');
        return;
      }

      void currentWindow.isMinimized()
        .then(minimized => {
          if (!disposed && generation === focusGeneration && minimized) {
            handler('minimized');
          }
        })
        .catch(error => {
          log.warn('Failed to read compact chat minimized state', error);
        });
    });

    return () => {
      disposed = true;
      focusGeneration += 1;
      unlisten();
    };
  } catch (error) {
    log.warn('Failed to listen for compact chat window activity', error);
    return () => {
      disposed = true;
    };
  }
}

export async function listenCompactChatFloatingWindowCloseRequest(
  handler: () => Promise<void> | void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;

  let disposed = false;
  try {
    const unlisten = await getCurrentWindow().onCloseRequested(event => {
      if (disposed) return;
      event.preventDefault();
      void Promise.resolve(handler()).catch(error => {
        log.warn('Failed to handle compact chat window close request', error);
      });
    });

    return () => {
      disposed = true;
      unlisten();
    };
  } catch (error) {
    log.warn('Failed to listen for compact chat window close request', error);
    return () => {
      disposed = true;
    };
  }
}

export async function resizeCompactChatFloatingWindow(size: CompactChatWindowSize): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('resize_compact_chat_desktop_window', {
      width: size.width,
      height: size.height,
    });
  } catch (error) {
    log.warn('Failed to resize compact chat floating window', { size, error });
  }
}

export async function startCompactChatFloatingWindowDrag(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    await getCurrentWindow().startDragging();
  } catch (error) {
    log.warn('Failed to start compact chat floating window drag', error);
  }
}

export async function startCompactChatFloatingWindowResize(direction: CompactChatResizeDirection): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    await getCurrentWindow().startResizeDragging(direction);
  } catch (error) {
    log.warn('Failed to start compact chat floating window resize', { direction, error });
  }
}
