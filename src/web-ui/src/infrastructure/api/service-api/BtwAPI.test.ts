import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('./ApiClient', () => ({
  api: { invoke },
}));

vi.mock('../errors/TauriCommandError', () => ({
  createTauriCommandError: (_command: string, error: unknown) => error,
}));

import { BtwAPI } from './BtwAPI';

describe('BtwAPI', () => {
  beforeEach(() => invoke.mockReset());

  it('rejects a partial response when relationship persistence failed', async () => {
    invoke.mockResolvedValue({
      ok: false,
      relationship: {
        schemaVersion: 1,
        parentSessionId: 'parent',
        childSessionId: 'child',
        hydrationState: 'failed',
        hydrationDetail: 'disk full',
        memoryEnabled: false,
      },
    });

    await expect(new BtwAPI().askStream({
      requestId: 'request',
      sessionId: 'parent',
      workspacePath: 'D:/workspace',
      question: 'Question',
      childSessionId: 'child',
    })).rejects.toThrow('disk full');
  });
});
