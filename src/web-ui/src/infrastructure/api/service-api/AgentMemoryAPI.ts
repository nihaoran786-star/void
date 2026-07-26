import { api } from './ApiClient';
import {
  createTauriCommandError,
} from '../errors/TauriCommandError';
import { isTauriCommandUnavailableError } from '../errors/TauriCommandSupport';

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

export interface MemoryCandidateBatch {
  candidates: AgentMemoryCandidate[];
  rejectedCount: number;
}

export type MemoryWorkflowErrorCode =
  | 'unsupported'
  | 'source'
  | 'extractor'
  | 'invalid_candidate'
  | 'conflict'
  | 'confirmation_required'
  | 'persistence';

export interface MemoryWorkflowError {
  code: MemoryWorkflowErrorCode;
  message: string;
  retryable: boolean;
}

export const AGENT_MEMORY_DESKTOP_UPDATE_REQUIRED = 'desktop_update_required';

export class AgentMemoryCapabilityError extends Error {
  readonly code = AGENT_MEMORY_DESKTOP_UPDATE_REQUIRED;
  readonly retryable = false;

  constructor() {
    super('Agent memory requires a current desktop host. Restart Void to finish the update.');
    this.name = 'AgentMemoryCapabilityError';
  }
}

export function isAgentMemoryCapabilityError(
  error: unknown,
): error is AgentMemoryCapabilityError {
  return error instanceof AgentMemoryCapabilityError;
}

function agentMemoryCommandError(
  command: string,
  error: unknown,
  request?: unknown,
): Error {
  return isTauriCommandUnavailableError(error)
    ? new AgentMemoryCapabilityError()
    : createTauriCommandError(command, error, request);
}

export interface AgentMemorySource {
  kind: string;
  sessionId?: string;
  transcriptFingerprint?: string;
  rendererVersion?: string;
}

export interface AgentMemoryProposal {
  proposalId: string;
  memoryId: string;
  content: string;
  expectedRevision?: number | null;
  source: AgentMemorySource;
}

export type MemoryCompletionOutcome =
  | { status: 'disabled' }
  | { status: 'proposed'; proposals: AgentMemoryProposal[] };

export type MemoryApprovalOutcome =
  | { status: 'denied'; memory?: null }
  | { status: 'committed'; memory: StoredAgentMemory };

export interface StoredAgentMemory {
  schemaVersion: number;
  id: string;
  content: string;
  revision: number;
  source: AgentMemorySource;
  createdAt: number;
  updatedAt: number;
  state: AgentMemoryState;
}

export class AgentMemoryAPI {
  async propose(workspacePath: string, inputs: string[]): Promise<MemoryCandidateBatch> {
    const request = { workspacePath, inputs };
    try {
      return await api.invoke<MemoryCandidateBatch>('propose_agent_memory', { request });
    } catch (error) {
      throw agentMemoryCommandError('propose_agent_memory', error, request);
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
      throw agentMemoryCommandError('commit_agent_memory', error, request);
    }
  }

  async extractFromSession(
    workspacePath: string,
    sessionId: string,
  ): Promise<MemoryCompletionOutcome> {
    const request = {
      workspacePath,
      sessionId,
    };
    try {
      return await api.invoke<MemoryCompletionOutcome>(
        'extract_agent_memory_from_session',
        { request },
      );
    } catch (error) {
      throw agentMemoryCommandError(
        'extract_agent_memory_from_session',
        error,
        request,
      );
    }
  }

  async review(
    workspacePath: string,
    proposal: AgentMemoryProposal,
    editedContent: string,
    approved: boolean,
  ): Promise<MemoryApprovalOutcome> {
    const request = { workspacePath, proposal, editedContent, approved };
    try {
      return await api.invoke<MemoryApprovalOutcome>(
        'review_agent_memory_proposal',
        { request },
      );
    } catch (error) {
      throw agentMemoryCommandError(
        'review_agent_memory_proposal',
        error,
        request,
      );
    }
  }

  async list(workspacePath: string): Promise<StoredAgentMemory[]> {
    try {
      return await api.invoke<StoredAgentMemory[]>('list_agent_memories', { workspacePath });
    } catch (error) {
      throw agentMemoryCommandError('list_agent_memories', error, { workspacePath });
    }
  }

  async delete(workspacePath: string, id: string): Promise<void> {
    const request = { workspacePath, id };
    try {
      await api.invoke<void>('delete_agent_memory', { request });
    } catch (error) {
      throw agentMemoryCommandError('delete_agent_memory', error, request);
    }
  }

  async deleteConfirmed(memory: StoredAgentMemory, workspacePath: string): Promise<void> {
    const request = {
      workspacePath,
      memoryId: memory.id,
      expectedRevision: memory.revision,
      confirmation: `delete:${memory.id}:revision:${memory.revision}`,
    };
    try {
      await api.invoke<void>('delete_agent_memory_confirmed', { request });
    } catch (error) {
      throw agentMemoryCommandError('delete_agent_memory_confirmed', error, request);
    }
  }
}

export const agentMemoryAPI = new AgentMemoryAPI();
