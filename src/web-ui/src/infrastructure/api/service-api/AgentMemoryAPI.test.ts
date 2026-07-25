import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('./ApiClient', () => ({
  api: { invoke },
}));

vi.mock('../errors/TauriCommandError', () => ({
  createTauriCommandError: (_command: string, error: unknown) => error,
}));

import { AgentMemoryAPI, type StoredAgentMemory } from './AgentMemoryAPI';

describe('AgentMemoryAPI', () => {
  beforeEach(() => invoke.mockReset());

  it('preserves the legacy manual proposal contract', async () => {
    invoke.mockResolvedValue({ candidates: [], rejectedCount: 0 });

    await new AgentMemoryAPI().propose('D:/workspace', ['Prefer focused tests']);

    expect(invoke).toHaveBeenCalledWith('propose_agent_memory', {
      request: {
        workspacePath: 'D:/workspace',
        inputs: ['Prefer focused tests'],
      },
    });
  });

  it('preserves the legacy commit and delete contracts', async () => {
    const candidate = {
      id: 'candidate-1',
      content: 'Prefer focused tests',
      state: 'consent_pending',
      consent: 'pending',
    } as const;
    invoke.mockResolvedValue(candidate);
    const api = new AgentMemoryAPI();

    await api.commit('D:/workspace', candidate, true);
    expect(invoke).toHaveBeenLastCalledWith('commit_agent_memory', {
      request: { workspacePath: 'D:/workspace', candidate, approved: true },
    });

    await api.delete('D:/workspace', 'memory-1');
    expect(invoke).toHaveBeenLastCalledWith('delete_agent_memory', {
      request: { workspacePath: 'D:/workspace', id: 'memory-1' },
    });
  });

  it('keeps extraction authorization server-controlled in its separate command', async () => {
    invoke.mockResolvedValue({ status: 'disabled' });

    await new AgentMemoryAPI().extractFromSession(
      'D:/workspace',
      'session-1',
    );

    expect(invoke).toHaveBeenCalledWith('extract_agent_memory_from_session', {
      request: {
        workspacePath: 'D:/workspace',
        sessionId: 'session-1',
      },
    });
  });

  it('sends the exact revision-bound delete confirmation', async () => {
    invoke.mockResolvedValue(undefined);
    const memory = {
      schemaVersion: 2,
      id: 'memory-1',
      content: 'Prefer focused tests',
      revision: 3,
      source: { kind: 'session_completion' },
      createdAt: 1,
      updatedAt: 2,
      state: 'committed',
    } satisfies StoredAgentMemory;

    await new AgentMemoryAPI().deleteConfirmed(memory, 'D:/workspace');

    expect(invoke).toHaveBeenCalledWith('delete_agent_memory_confirmed', {
      request: {
        workspacePath: 'D:/workspace',
        memoryId: 'memory-1',
        expectedRevision: 3,
        confirmation: 'delete:memory-1:revision:3',
      },
    });
  });
});
