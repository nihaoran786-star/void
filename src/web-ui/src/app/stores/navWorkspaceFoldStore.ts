/**
 * navWorkspaceFoldStore — which workspaces show their session list in the nav
 * tree.
 *
 * This used to be `useState` inside each WorkspaceItem, which made the fold
 * state die with the component: reordering the list, a workspace list refresh
 * or switching presentation silently re-expanded everything, and activating a
 * workspace force-expanded it even when the user had just folded it.
 *
 * Presentation state only. Nothing here creates, opens or closes a workspace —
 * it records which rows the user chose to fold, keyed by workspace id.
 */

import { create } from 'zustand';

interface NavWorkspaceFoldState {
  /** Ids whose session list is folded away. Absent id = expanded. */
  foldedWorkspaceIds: ReadonlySet<string>;
  isFolded: (workspaceId: string) => boolean;
  toggleFolded: (workspaceId: string) => void;
  setFolded: (workspaceId: string, folded: boolean) => void;
}

export const useNavWorkspaceFoldStore = create<NavWorkspaceFoldState>((set, get) => ({
  foldedWorkspaceIds: new Set<string>(),

  isFolded: (workspaceId) => get().foldedWorkspaceIds.has(workspaceId),

  toggleFolded: (workspaceId) => set((state) => {
    const next = new Set(state.foldedWorkspaceIds);
    if (next.has(workspaceId)) {
      next.delete(workspaceId);
    } else {
      next.add(workspaceId);
    }
    return { foldedWorkspaceIds: next };
  }),

  setFolded: (workspaceId, folded) => set((state) => {
    if (state.foldedWorkspaceIds.has(workspaceId) === folded) {
      return state;
    }
    const next = new Set(state.foldedWorkspaceIds);
    if (folded) {
      next.add(workspaceId);
    } else {
      next.delete(workspaceId);
    }
    return { foldedWorkspaceIds: next };
  }),
}));
