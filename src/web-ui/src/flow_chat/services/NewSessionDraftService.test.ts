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
      draftId: null,
      draftExecutionPolicy: null,
      draftPersonaTarget: null,
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
      draftId: expect.any(String),
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

  it('creates a fresh composer identity for every new-task draft', () => {
    beginNewSessionDraft('code', null);
    const firstDraftId = useSessionModeStore.getState().draftId;

    beginNewSessionDraft('code', null);
    const secondDraftId = useSessionModeStore.getState().draftId;

    expect(firstDraftId).toEqual(expect.any(String));
    expect(secondDraftId).toEqual(expect.any(String));
    expect(secondDraftId).not.toBe(firstDraftId);
  });

  it('keeps a canonical persona target on the unpersisted draft only', () => {
    const personaTarget = {
      kind: 'agent',
      identity: { id: 'user::void::writer' },
    } as any;

    beginNewSessionDraft('cowork', null, {
      executionPolicy: 'Cowork',
      personaTarget,
    });

    expect(useSessionModeStore.getState()).toMatchObject({
      mode: 'cowork',
      draftExecutionPolicy: 'Cowork',
      draftPersonaTarget: personaTarget,
    });
    expect(mocks.setState).toHaveBeenCalledOnce();
  });

  it('clears only the draft projection after the real session is created', () => {
    useSessionModeStore.getState().beginDraft('cowork', null);
    completeNewSessionDraft();

    expect(useSessionModeStore.getState()).toMatchObject({
      mode: 'cowork',
      draftStatus: 'idle',
      draftId: null,
      draftWorkspace: null,
      draftExecutionPolicy: null,
      draftPersonaTarget: null,
    });
  });
});
