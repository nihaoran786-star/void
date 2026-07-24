import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';

const mocks = vi.hoisted(() => ({
  setState: vi.fn(),
}));

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    setState: mocks.setState,
  },
}));

import {
  beginNewSessionDraft,
  completeNewSessionDraft,
} from './NewSessionDraftService';

describe('NewSessionDraftService', () => {
  beforeEach(() => {
    mocks.setState.mockReset();
    useSessionModeStore.setState({
      mode: 'code',
      draftStatus: 'idle',
      draftWorkspace: null,
    });
  });

  it('opens a draft without creating or deleting a persisted session', () => {
    beginNewSessionDraft('media', {
      id: 'workspace-1',
      name: 'Workspace',
      rootPath: 'D:/workspace',
    } as any);

    expect(useSessionModeStore.getState()).toMatchObject({
      mode: 'media',
      draftStatus: 'draft',
      draftWorkspace: {
        id: 'workspace-1',
        rootPath: 'D:/workspace',
      },
    });
    expect(mocks.setState).toHaveBeenCalledOnce();

    const projectDraft = mocks.setState.mock.calls[0]?.[0];
    const sessions = new Map([['session-1', { sessionId: 'session-1' }]]);
    expect(projectDraft({ sessions, activeSessionId: 'session-1' })).toEqual({
      sessions,
      activeSessionId: null,
    });
  });

  it('clears only the draft projection after the real session is created', () => {
    useSessionModeStore.getState().beginDraft('cowork', null);
    completeNewSessionDraft();

    expect(useSessionModeStore.getState()).toMatchObject({
      mode: 'cowork',
      draftStatus: 'idle',
      draftWorkspace: null,
    });
  });
});
