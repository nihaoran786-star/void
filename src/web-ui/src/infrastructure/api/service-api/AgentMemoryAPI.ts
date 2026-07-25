import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';

export type AgentMemoryState =
  | 'candidate'
  | 'consent_pending'
  | 'committed'
  | 'deleted'
  | 'failed';

export type AgentMemoryConsent = 'not_requested' | 'pending' | 'granted' | 'denied';

export interface AgentMemoryCandidate {
  id: string;
  content: string;
  state: AgentMemoryState;
  consent: AgentMemoryConsent;
  failure?: string;
}

export interface StoredAgentMemory {
  id: string;
  content: string;
}

export interface MemoryCandidateBatch {
  candidates: AgentMemoryCandidate[];
  rejectedCount: number;
}

export class AgentMemoryAPI {
  async propose(workspacePath: string, inputs: string[]): Promise<MemoryCandidateBatch> {
    const request = { workspacePath, inputs };
    try {
      return await api.invoke<MemoryCandidateBatch>('propose_agent_memory', { request });
    } catch (error) {
      throw createTauriCommandError('propose_agent_memory', error, request);
    }
  }

  async commit(
    workspacePath: string,
    candidate: AgentMemoryCandidate,
    approved: boolean,
  ): Promise<AgentMemoryCandidate> {
    const request = { workspacePath, candidate, approved };
    try {
      return await api.invoke<AgentMemoryCandidate>('commit_agent_memory', { request });
    } catch (error) {
      throw createTauriCommandError('commit_agent_memory', error, request);
    }
  }

  async list(workspacePath: string): Promise<StoredAgentMemory[]> {
    try {
      return await api.invoke<StoredAgentMemory[]>('list_agent_memories', { workspacePath });
    } catch (error) {
      throw createTauriCommandError('list_agent_memories', error, { workspacePath });
    }
  }

  async delete(workspacePath: string, id: string): Promise<void> {
    const request = { workspacePath, id };
    try {
      await api.invoke<void>('delete_agent_memory', { request });
    } catch (error) {
      throw createTauriCommandError('delete_agent_memory', error, request);
    }
  }
}

export const agentMemoryAPI = new AgentMemoryAPI();
