import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UsersRound } from 'lucide-react';
// Imported directly rather than through the component-library barrel: the
// barrel pulls Mermaid and the editor stack into this window's chunk.
import { WindowControls } from '@/component-library/components/WindowControls';
import { supportsNativeWindowDragging } from '@/infrastructure/runtime';
import { TeamWorkspacePanel, useActiveTeamWorkspace } from '@/team_workspace';
import {
  listenTeamWorkspaceBinding,
  requestTeamWorkspaceBinding,
  type TeamWorkspaceWindowPresentation,
} from '@/team_workspace/services/TeamWorkspaceWindowBridge';
import { revealTeamWorkspaceWindow } from '@/infrastructure/config/services/TeamWorkspaceWindowService';
import { flowChatManager } from '@/flow_chat/services/FlowChatManager';
import { createLogger } from '@/shared/utils/logger';
import './TeamWorkspaceDesktopWindow.scss';

const BINDING_REQUEST_RETRY_MS = 500;
/**
 * How long the window may stay blank while waiting for the main window. After
 * this the window shows itself with an explicit state and keeps asking, so a
 * lost binding can never leave an invisible window behind.
 */
const BINDING_WAIT_BUDGET_MS = 3_000;
const log = createLogger('TeamWorkspaceDesktopWindow');

/**
 * Second desktop window hosting the Team Workspace.
 *
 * It is a presentation host: the Team binding identity arrives from the main
 * window, the projection comes from the same typed Team reader the in-app panel
 * used, and member conversations remain existing `/btw` child sessions rendered
 * by the shared panel. Closing this window collapses the presentation only.
 */
export const TeamWorkspaceDesktopWindow: React.FC = () => {
  const { t } = useTranslation('flow-chat');
  const [presentation, setPresentation] = useState<TeamWorkspaceWindowPresentation | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);
  const lastSequenceRef = useRef(0);
  const hasReceivedRef = useRef(false);
  const hasRevealedRef = useRef(false);
  const attachedWorkspacePathRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('void-team-window-root');
    document.body.classList.add('void-team-window-body');

    let disposed = false;
    let removeListener: (() => void) | null = null;
    let retryTimer: number | null = null;
    // Keep asking even after the budget expires: the main window may still be
    // starting up, and a late binding upgrades the visible state in place.
    const waitTimer = window.setTimeout(() => {
      if (disposed || hasReceivedRef.current) return;
      log.warn('No team binding arrived from the main window within the wait budget');
      setWaitedOut(true);
    }, BINDING_WAIT_BUDGET_MS);

    void listenTeamWorkspaceBinding(next => {
      if (disposed) return;
      const sequence = next.sequence ?? 0;
      if (sequence > 0) {
        if (sequence <= lastSequenceRef.current) return;
        lastSequenceRef.current = sequence;
      }
      hasReceivedRef.current = true;
      setPresentation(next);
    }).then(unlisten => {
      if (disposed) {
        unlisten();
        return;
      }
      removeListener = unlisten;
      const requestUntilReady = () => {
        if (disposed || hasReceivedRef.current) return;
        void requestTeamWorkspaceBinding();
        retryTimer = window.setTimeout(requestUntilReady, BINDING_REQUEST_RETRY_MS);
      };
      requestUntilReady();
    });

    return () => {
      disposed = true;
      removeListener?.();
      window.clearTimeout(waitTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      document.documentElement.classList.remove('void-team-window-root');
      document.body.classList.remove('void-team-window-body');
    };
  }, []);

  const binding = presentation?.status === 'ready' ? presentation.binding : null;
  const workspacePath = binding?.workspacePath;
  const [isMaximized, setIsMaximized] = useState(false);

  // The window draws its own chrome so it matches the main window's top bar.
  // These are window-manager operations only; none of them touch the Team run.
  const withCurrentWindow = useCallback(async (
    action: (currentWindow: Awaited<
      ReturnType<typeof import('@tauri-apps/api/window')['getCurrentWindow']>
    >) => Promise<unknown>,
  ) => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await action(getCurrentWindow());
    } catch (error) {
      log.warn('Team window chrome action failed', error);
    }
  }, []);

  const handleDragBarMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0 || !supportsNativeWindowDragging()) return;
    if ((event.target as HTMLElement | null)?.closest('button, .window-controls')) return;
    void withCurrentWindow(currentWindow => currentWindow.startDragging());
  }, [withCurrentWindow]);

  const handleMaximize = useCallback(() => {
    void withCurrentWindow(async currentWindow => {
      await currentWindow.toggleMaximize();
      setIsMaximized(await currentWindow.isMaximized());
    });
  }, [withCurrentWindow]);

  const handleMinimize = useCallback(() => {
    void withCurrentWindow(currentWindow => currentWindow.minimize());
  }, [withCurrentWindow]);

  // Closing routes through the same native close path the desktop host already
  // intercepts, so the main window is told and the Team keeps running.
  const handleClose = useCallback(() => {
    void withCurrentWindow(currentWindow => currentWindow.close());
  }, [withCurrentWindow]);

  // Live turn/tool events for the member conversations rendered here. Session
  // discovery, selection, and lifecycle stay with the main window.
  useEffect(() => {
    if (!workspacePath || attachedWorkspacePathRef.current === workspacePath) return;
    attachedWorkspacePathRef.current = workspacePath;
    void flowChatManager.attachPresentationHost(workspacePath).catch(error => {
      log.error('Failed to attach the Team window to the Flow Chat runtime', error);
    });
  }, [workspacePath]);

  const workspaceState = useActiveTeamWorkspace({
    sessionId: binding?.parentSessionId ?? null,
    workspacePath,
    teamDefinitionId: binding?.teamDefinitionId,
    teamInstanceId: binding?.teamInstanceId,
    refreshKey: binding?.refreshKey ?? null,
    enabled: Boolean(binding),
  });

  useEffect(() => {
    if ((!presentation && !waitedOut) || hasRevealedRef.current) return;
    hasRevealedRef.current = true;
    void revealTeamWorkspaceWindow();
  }, [presentation, waitedOut]);

  const titleBar = (
    <div
      className="void-team-window__title-bar"
      onMouseDown={handleDragBarMouseDown}
      onDoubleClick={handleMaximize}
      data-testid="team-window-title-bar"
    >
      <span className="void-team-window__title">
        {workspaceState.snapshot?.activeTeam?.definition.displayName
          ?? t('teamWorkspace.ariaLabel')}
      </span>
      <WindowControls
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
        isMaximized={isMaximized}
        data-testid-close="team-window-close"
      />
    </div>
  );

  if (!presentation && !waitedOut) {
    return <main className="void-team-window void-team-window--booting" aria-hidden="true" />;
  }

  if (!binding) {
    // `disconnected` means the main window never answered; the window is shown
    // anyway so the user sees why, instead of nothing at all.
    const disconnected = !presentation
      || (presentation.status === 'unavailable'
        && presentation.reason === 'transport-unavailable');
    return (
      <main className="void-team-window" aria-label={t('teamWorkspace.ariaLabel')}>
        {titleBar}
        <div className="void-team-window__empty" role="status">
          <UsersRound aria-hidden="true" />
          <strong>
            {t(disconnected
              ? 'teamWorkspace.window.disconnectedTitle'
              : 'teamWorkspace.window.unboundTitle')}
          </strong>
          <p>
            {t(disconnected
              ? 'teamWorkspace.window.disconnectedDescription'
              : 'teamWorkspace.window.unboundDescription')}
          </p>
        </div>
      </main>
    );
  }

  // No `aria-label` here: the panel already exposes the named Team region with
  // its identity and run status, and a second identical name only adds noise.
  return (
    <main className="void-team-window">
      {titleBar}
      <TeamWorkspacePanel
        state={workspaceState}
        isActive
        workspacePath={workspacePath}
      />
    </main>
  );
};

export default TeamWorkspaceDesktopWindow;
