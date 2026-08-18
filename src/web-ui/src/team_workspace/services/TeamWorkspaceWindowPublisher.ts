import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState } from '@/flow_chat/types/flow-chat';
import { selectActiveTeam } from '../hooks/useActiveSessionTeamWorkspace';
import {
  areTeamWorkspaceWindowPresentationsEquivalent,
  listenTeamWorkspaceBindingRequest,
  publishTeamWorkspaceBinding,
  type TeamWorkspaceWindowPresentation,
} from './TeamWorkspaceWindowBridge';

type Unsubscribe = () => void;

export function readTeamWorkspaceWindowPresentation(
  state: FlowChatState,
  sequence: number,
): TeamWorkspaceWindowPresentation {
  const selection = selectActiveTeam(state);
  if (
    !selection.bindingKey
    || !selection.sessionId
    || !selection.teamDefinitionId
    || !selection.teamInstanceId
  ) {
    return {
      status: 'unavailable',
      sequence,
      reason: state.activeSessionId ? 'no-team-binding' : 'no-active-session',
    };
  }

  return {
    status: 'ready',
    sequence,
    binding: {
      parentSessionId: selection.sessionId,
      workspacePath: selection.workspacePath,
      teamDefinitionId: selection.teamDefinitionId,
      teamInstanceId: selection.teamInstanceId,
      bindingKey: selection.bindingKey,
      refreshKey: selection.refreshKey,
    },
  };
}

export interface TeamWorkspaceWindowPublisherDeps {
  subscribe: (handler: (state: FlowChatState) => void) => Unsubscribe;
  read: () => FlowChatState;
  publish: (presentation: TeamWorkspaceWindowPresentation) => Promise<void> | void;
  listenRequests: (handler: () => void) => Promise<Unsubscribe>;
}

/**
 * Mirrors the active Team binding identity into the Team window while that
 * window is open.
 *
 * Semantically equivalent snapshots are dropped, so composer typing and lead
 * streaming in the main window cannot remount or flash the Team window. An
 * explicit request from the window always republishes, because the window may
 * have booted after the last change.
 */
export class TeamWorkspaceWindowPublisher {
  private active = false;
  private activation = 0;
  private sequence = 0;
  private lastPublished: TeamWorkspaceWindowPresentation | null = null;
  private unsubscribeStore: Unsubscribe | null = null;
  private unsubscribeRequests: Unsubscribe | null = null;

  constructor(private readonly deps: TeamWorkspaceWindowPublisherDeps) {}

  async activate(): Promise<void> {
    if (this.active) {
      await this.publish({ force: true });
      return;
    }

    this.active = true;
    const activation = ++this.activation;
    this.unsubscribeStore = this.deps.subscribe(() => {
      void this.publish({ force: false });
    });

    const unsubscribeRequests = await this.deps.listenRequests(() => {
      void this.publish({ force: true });
    });
    // The window may have closed, or reopened under a newer activation, while
    // the subscription was still resolving. Exactly one owner disposes it.
    if (!this.active || this.activation !== activation) {
      unsubscribeRequests();
      return;
    }
    this.unsubscribeRequests = unsubscribeRequests;

    await this.publish({ force: true });
  }

  suspend(): void {
    this.active = false;
    this.activation += 1;
    this.lastPublished = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.unsubscribeRequests?.();
    this.unsubscribeRequests = null;
  }

  private async publish({ force }: { force: boolean }): Promise<void> {
    if (!this.active) return;

    const next = readTeamWorkspaceWindowPresentation(
      this.deps.read(),
      this.sequence + 1,
    );
    if (
      !force
      && areTeamWorkspaceWindowPresentationsEquivalent(this.lastPublished, next)
    ) {
      return;
    }

    this.sequence = next.sequence;
    this.lastPublished = next;
    await this.deps.publish(next);
  }
}

const teamWorkspaceWindowPublisher = new TeamWorkspaceWindowPublisher({
  subscribe: handler => flowChatStore.subscribe(handler),
  read: () => flowChatStore.getState(),
  publish: publishTeamWorkspaceBinding,
  listenRequests: listenTeamWorkspaceBindingRequest,
});

export const activateTeamWorkspaceWindowPublishing = (): Promise<void> =>
  teamWorkspaceWindowPublisher.activate();

export const suspendTeamWorkspaceWindowPublishing = (): void => {
  teamWorkspaceWindowPublisher.suspend();
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    teamWorkspaceWindowPublisher.suspend();
  });
}
