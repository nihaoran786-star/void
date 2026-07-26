/**
 * sessionModeStore — tracks the active session creation mode.
 *
 * Three modes:
 *   - 'code'   → standard AI coding session (default)
 *   - 'cowork' → collaborative Cowork session
 *   - 'media'  → Media creation session
 */

import { create } from 'zustand';

export type SessionMode = 'code' | 'cowork' | 'media';
export type NewSessionDraftStatus = 'idle' | 'draft' | 'creating' | 'error';

export interface NewSessionDraftWorkspace {
  id: string;
  name: string;
  rootPath: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

interface SessionModeState {
  mode: SessionMode;
  draftId: string | null;
  draftStatus: NewSessionDraftStatus;
  draftWorkspace: NewSessionDraftWorkspace | null;
  setMode: (mode: SessionMode) => void;
  beginDraft: (mode: SessionMode, workspace?: NewSessionDraftWorkspace | null) => void;
  setDraftWorkspace: (workspace: NewSessionDraftWorkspace | null) => void;
  setDraftStatus: (status: NewSessionDraftStatus) => void;
  clearDraft: () => void;
}

let nextNewSessionDraftId = 0;

export const useSessionModeStore = create<SessionModeState>((set) => ({
  mode: 'code',
  draftId: null,
  draftStatus: 'idle',
  draftWorkspace: null,
  setMode: (mode) => set({ mode }),
  beginDraft: (mode, workspace = null) => set({
    mode,
    draftId: `draft:${++nextNewSessionDraftId}`,
    draftStatus: 'draft',
    draftWorkspace: workspace,
  }),
  setDraftWorkspace: (draftWorkspace) => set({ draftWorkspace }),
  setDraftStatus: (draftStatus) => set({ draftStatus }),
  clearDraft: () => set({
    draftId: null,
    draftStatus: 'idle',
    draftWorkspace: null,
  }),
}));
