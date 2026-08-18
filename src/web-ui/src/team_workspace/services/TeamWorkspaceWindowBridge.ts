import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('TeamWorkspaceWindowBridge');

const BINDING_EVENT = 'void://team-workspace-binding';
const BINDING_REQUEST_EVENT = 'void://team-workspace-binding-request';

/**
 * The typed Team binding facts the main window hands to the Team window.
 *
 * This is identity only. The Team window resolves the projection itself through
 * the same `TeamWorkspaceProjection` reader the in-app panel used, and member
 * transcripts still come from the existing BTW child-session interface, so no
 * second runtime or data channel exists.
 */
export interface TeamWorkspaceWindowBinding {
  parentSessionId: string;
  workspacePath?: string;
  teamDefinitionId: string;
  teamInstanceId: string;
  bindingKey: string;
  refreshKey: string | null;
}

export type TeamWorkspaceWindowUnavailableReason =
  | 'no-team-binding'
  | 'no-active-session'
  /** The window could not reach the main window at all. */
  | 'transport-unavailable';

export type TeamWorkspaceWindowPresentation =
  | {
      status: 'ready';
      sequence: number;
      binding: TeamWorkspaceWindowBinding;
    }
  | {
      status: 'unavailable';
      sequence: number;
      reason: TeamWorkspaceWindowUnavailableReason;
    };

export function areTeamWorkspaceWindowPresentationsEquivalent(
  left: TeamWorkspaceWindowPresentation | null,
  right: TeamWorkspaceWindowPresentation,
): boolean {
  if (!left) return false;
  if (left.status !== right.status) return false;
  if (left.status === 'unavailable' && right.status === 'unavailable') {
    return left.reason === right.reason;
  }
  if (left.status === 'ready' && right.status === 'ready') {
    return left.binding.bindingKey === right.binding.bindingKey
      && left.binding.refreshKey === right.binding.refreshKey
      && left.binding.workspacePath === right.binding.workspacePath;
  }
  return false;
}

async function emitToAllWindows(event: string, payload?: unknown): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(event, payload);
  } catch (error) {
    log.warn('Failed to publish team workspace window event', { event, error });
  }
}

async function listenFromAnyWindow<TPayload>(
  event: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;

  let disposed = false;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<TPayload>(event, received => {
      if (disposed) return;
      handler(received.payload);
    });
    return () => {
      disposed = true;
      unlisten();
    };
  } catch (error) {
    log.warn('Failed to subscribe to team workspace window event', { event, error });
    return () => {
      disposed = true;
    };
  }
}

/** Main window -> Team window. */
export function publishTeamWorkspaceBinding(
  presentation: TeamWorkspaceWindowPresentation,
): Promise<void> {
  return emitToAllWindows(BINDING_EVENT, presentation);
}

/** Team window -> main window: "send me the current binding". */
export function requestTeamWorkspaceBinding(): Promise<void> {
  return emitToAllWindows(BINDING_REQUEST_EVENT);
}

/**
 * Team window side.
 *
 * When the transport itself is unusable the handler is told so immediately.
 * Staying silent would leave the window with nothing to paint and therefore
 * permanently hidden, which reads to the user as "the button does nothing".
 */
export async function listenTeamWorkspaceBinding(
  handler: (presentation: TeamWorkspaceWindowPresentation) => void,
): Promise<() => void> {
  const reportTransportUnavailable = () => handler({
    status: 'unavailable',
    sequence: 0,
    reason: 'transport-unavailable',
  });

  if (!isTauriRuntime()) {
    reportTransportUnavailable();
    return () => undefined;
  }

  let disposed = false;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<TeamWorkspaceWindowPresentation>(
      BINDING_EVENT,
      received => {
        if (disposed) return;
        handler(received.payload);
      },
    );
    return () => {
      disposed = true;
      unlisten();
    };
  } catch (error) {
    log.warn('Failed to subscribe to the team workspace binding', error);
    reportTransportUnavailable();
    return () => {
      disposed = true;
    };
  }
}

/** Main window side. */
export function listenTeamWorkspaceBindingRequest(
  handler: () => void,
): Promise<() => void> {
  return listenFromAnyWindow<unknown>(BINDING_REQUEST_EVENT, handler);
}
