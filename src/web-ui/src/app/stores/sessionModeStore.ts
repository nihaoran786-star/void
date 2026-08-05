/**
 * sessionModeStore — tracks the active session creation mode.
 *
 * Three modes:
 *   - 'code'   → standard AI coding session (default)
 *   - 'cowork' → collaborative Cowork session
 *   - 'media'  → Media creation session
 */

import { create } from 'zustand';
import type {
  AgentCatalogEntry,
  TeamCatalogEntry,
} from '@/shared/services/customization/types';

export type SessionMode = 'code' | 'cowork' | 'media';
export type NewSessionDraftStatus = 'idle' | 'draft' | 'creating' | 'error';

export interface NewSessionDraftWorkspace {
  id: string;
  name: string;
  rootPath: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

export type NewSessionDraftPersonaTarget = AgentCatalogEntry | TeamCatalogEntry;

export interface NewSessionDraftCustomization {
  executionPolicy?: string;
  personaTarget?: NewSessionDraftPersonaTarget | null;
}

interface SessionModeState {
  mode: SessionMode;
  draftId: string | null;
  draftStatus: NewSessionDraftStatus;
  draftWorkspace: NewSessionDraftWorkspace | null;
  draftExecutionPolicy: string | null;
  draftPersonaTarget: NewSessionDraftPersonaTarget | null;
  setMode: (mode: SessionMode) => void;
  beginDraft: (
    mode: SessionMode,
    workspace?: NewSessionDraftWorkspace | null,
    customization?: NewSessionDraftCustomization,
  ) => void;
  setDraftWorkspace: (workspace: NewSessionDraftWorkspace | null) => void;
  setDraftPersonaTarget: (target: NewSessionDraftPersonaTarget | null) => void;
  setDraftStatus: (status: NewSessionDraftStatus) => void;
  clearDraft: () => void;
}

let nextNewSessionDraftId = 0;

export const useSessionModeStore = create<SessionModeState>((set) => ({
  mode: 'code',
  draftId: null,
  draftStatus: 'idle',
  draftWorkspace: null,
  draftExecutionPolicy: null,
  draftPersonaTarget: null,
  setMode: (mode) => set({ mode }),
  beginDraft: (mode, workspace = null, customization = {}) => set({
    mode,
    draftId: `draft:${++nextNewSessionDraftId}`,
    draftStatus: 'draft',
    draftWorkspace: workspace,
    draftExecutionPolicy: customization.executionPolicy?.trim() || null,
    draftPersonaTarget: customization.personaTarget ?? null,
  }),
  setDraftWorkspace: (draftWorkspace) => set({ draftWorkspace }),
  setDraftPersonaTarget: (draftPersonaTarget) => set({ draftPersonaTarget }),
  setDraftStatus: (draftStatus) => set({ draftStatus }),
  clearDraft: () => set({
    draftId: null,
    draftStatus: 'idle',
    draftWorkspace: null,
    draftExecutionPolicy: null,
    draftPersonaTarget: null,
  }),
}));
