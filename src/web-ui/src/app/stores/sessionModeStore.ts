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
  draftStatus: NewSessionDraftStatus;
  draftWorkspace: NewSessionDraftWorkspace | null;
  setMode: (mode: SessionMode) => void;
  beginDraft: (mode: SessionMode, workspace?: NewSessionDraftWorkspace | null) => void;
  setDraftWorkspace: (workspace: NewSessionDraftWorkspace | null) => void;
  setDraftStatus: (status: NewSessionDraftStatus) => void;
  clearDraft: () => void;
}

export const useSessionModeStore = create<SessionModeState>((set) => ({
  mode: 'code',
  draftStatus: 'idle',
  draftWorkspace: null,
  setMode: (mode) => set({ mode }),
  beginDraft: (mode, workspace = null) => set({
    mode,
    draftStatus: 'draft',
    draftWorkspace: workspace,
  }),
  setDraftWorkspace: (draftWorkspace) => set({ draftWorkspace }),
  setDraftStatus: (draftStatus) => set({ draftStatus }),
  clearDraft: () => set({
    draftStatus: 'idle',
    draftWorkspace: null,
  }),
}));
