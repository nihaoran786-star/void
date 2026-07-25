import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionReferenceContext } from '@/shared/types/context';

const mocks = vi.hoisted(() => ({
  resolveSessionReferences: vi.fn(),
}));

vi.mock('@/infrastructure/api', () => ({
  sessionAPI: {
    resolveSessionReferences: mocks.resolveSessionReferences,
  },
}));

import {
  resolveSessionReferenceTranscriptInjection,
  sessionReferenceResolutionMetadata,
} from './sessionReferenceTranscript';

const reference: SessionReferenceContext = {
  id: 'session-reference-1',
  type: 'session-reference',
  sessionId: 'research',
  sessionTitle: 'Research',
  workspaceId: 'workspace-1',
  workspacePath: 'D:/workspace/project',
  timestamp: 1,
};

const scope = {
  currentSessionId: 'current',
  workspaceId: 'workspace-1',
  workspacePath: 'D:/workspace/project',
};

describe('sessionReferenceTranscript', () => {
  beforeEach(() => {
    mocks.resolveSessionReferences.mockReset();
  });

  it('does not query the Adapter without an explicit session reference', async () => {
    await expect(resolveSessionReferenceTranscriptInjection([], scope)).resolves.toEqual({
      prompt: '',
      results: [],
    });
    expect(mocks.resolveSessionReferences).not.toHaveBeenCalled();
  });

  it('injects only a ready transcript and keeps typed resolution metadata', async () => {
    mocks.resolveSessionReferences.mockResolvedValue([{
      source: {
        kind: 'session_reference',
        sessionId: 'research',
        sessionTitle: 'Research',
      },
      status: 'ready',
      transcript: '<referenced_session>safe transcript</referenced_session>',
      messageCount: 2,
      estimatedTokens: 10,
    }]);

    const injection = await resolveSessionReferenceTranscriptInjection([reference], scope);

    expect(mocks.resolveSessionReferences).toHaveBeenCalledWith(scope, [reference]);
    expect(injection.prompt).toContain('safe transcript');
    expect(sessionReferenceResolutionMetadata(injection.results)).toEqual([{
      source: expect.objectContaining({ sessionId: 'research' }),
      status: 'ready',
      error: undefined,
    }]);
  });

  it('converts an Adapter failure into a typed failed result without injecting raw data', async () => {
    mocks.resolveSessionReferences.mockRejectedValue(new Error('transport unavailable'));

    const injection = await resolveSessionReferenceTranscriptInjection([reference], scope);

    expect(injection.prompt).toContain('status=failed');
    expect(injection.prompt).not.toContain('safe transcript');
    expect(injection.results[0]).toMatchObject({
      status: 'failed',
      error: {
        code: 'failed',
        message: 'Referenced session could not be resolved.',
      },
    });
  });
});
