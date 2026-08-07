import { FlowChatManager } from '@/flow_chat/services/FlowChatManager';
import type { SessionConfig } from '@/flow_chat/types/flow-chat';
import { SubagentAPI } from '@/infrastructure/api/service-api/SubagentAPI';
import type {
  CreateSubagentPayload,
  DeleteSubagentPayload,
  SubagentInfo,
} from '@/infrastructure/api/service-api/SubagentAPI';
import type {
  SessionActivePersonaBinding,
  SessionCustomizationScenario,
} from '@/shared/types/session-history';
import {
  computeAgentDraftFingerprint,
  type AgentDebugDraft,
} from './AgentDebugDraft';

export const DEBUG_SUBAGENT_DISPLAY_PREFIX = '调试草稿·';
export const DEBUG_EXECUTION_POLICY = 'agentic';
export const DEBUG_SCENARIO = 'code' as const;

export interface AgentDebugSessionHandle {
  sessionId: string;
  subagentId: string;
  subagentKey: string;
  draftFingerprint: string;
  workspacePath: string;
}

export interface AgentDebugPersonaState {
  scenario: SessionCustomizationScenario;
  executionPolicy: string;
  activePersonaBinding: SessionActivePersonaBinding;
}

export interface AgentDebugRuntimeDeps {
  createSubagent: (payload: CreateSubagentPayload) => Promise<string>;
  listSubagents: () => Promise<Array<SubagentInfo & { promptCacheScopeKey?: string }>>;
  deleteSubagent: (payload: DeleteSubagentPayload) => Promise<void>;
  createChatSession: (config: SessionConfig, mode?: string) => Promise<string>;
  persistPersona: (sessionId: string, state: AgentDebugPersonaState) => Promise<void>;
  sendMessage: (message: string, sessionId: string, agentType: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export function defaultAgentDebugRuntimeDeps(): AgentDebugRuntimeDeps {
  const manager = FlowChatManager.getInstance();
  return {
    createSubagent: payload => SubagentAPI.createSubagent(payload),
    listSubagents: () => SubagentAPI.listSubagents(),
    deleteSubagent: payload => SubagentAPI.deleteSubagent(payload),
    createChatSession: (config, mode) => manager.createChatSession(config, mode),
    persistPersona: (sessionId, state) => manager.updateChatSessionPersona(sessionId, state),
    sendMessage: (message, sessionId, agentType) =>
      manager.sendMessage(message, sessionId, undefined, agentType),
    deleteSession: sessionId => manager.deleteChatSession(sessionId),
  };
}

export function createAgentDebugRuntime(deps: AgentDebugRuntimeDeps) {
  async function createDebugSession(
    draft: AgentDebugDraft,
    workspacePath: string,
  ): Promise<AgentDebugSessionHandle> {
    const subagentId = await deps.createSubagent({
      level: 'user',
      displayName: `${DEBUG_SUBAGENT_DISPLAY_PREFIX}${draft.displayName}`,
      description: draft.description,
      prompt: draft.prompt,
      tools: draft.tools,
      allowedParentAgentIds: ['agentic'],
      readonly: draft.readonly,
      review: draft.review,
      workspacePath,
    });

    try {
      const entries = await deps.listSubagents();
      const revision = entries
        .find(entry => entry.id === subagentId)
        ?.promptCacheScopeKey?.trim();
      if (!revision) {
        throw new Error('Agent debug revision unavailable; cannot bind the persona.');
      }

      const sessionId = await deps.createChatSession({}, DEBUG_EXECUTION_POLICY);
      await deps.persistPersona(sessionId, {
        scenario: DEBUG_SCENARIO,
        executionPolicy: DEBUG_EXECUTION_POLICY,
        activePersonaBinding: {
          kind: 'agent',
          personaId: `user::void::${subagentId}`,
          personaRevision: { status: 'known', value: revision },
        },
      });

      return {
        sessionId,
        subagentId,
        subagentKey: `user::void::${subagentId}`,
        draftFingerprint: computeAgentDraftFingerprint(draft),
        workspacePath,
      };
    } catch (error) {
      await deps.deleteSubagent({
        subagentKey: `user::void::${subagentId}`,
        subagentId,
        workspacePath,
      });
      throw error;
    }
  }

  async function prepareForSend(
    current: AgentDebugSessionHandle | null,
    draft: AgentDebugDraft,
    workspacePath: string,
  ): Promise<AgentDebugSessionHandle> {
    if (current) {
      const fingerprint = computeAgentDraftFingerprint(draft);
      if (
        current.draftFingerprint === fingerprint
        && current.workspacePath === workspacePath
      ) {
        return current;
      }
      await disposeDebugSession(current);
    }
    return createDebugSession(draft, workspacePath);
  }

  async function disposeDebugSession(handle: AgentDebugSessionHandle): Promise<void> {
    try {
      await deps.deleteSession(handle.sessionId);
    } finally {
      await deps.deleteSubagent({
        subagentKey: handle.subagentKey,
        subagentId: handle.subagentId,
      });
    }
  }

  async function sendMessage(
    handle: AgentDebugSessionHandle,
    message: string,
  ): Promise<void> {
    return deps.sendMessage(message, handle.sessionId, DEBUG_EXECUTION_POLICY);
  }

  async function sweepOrphanedDebugSubagents(
    liveSubagentIds: string[],
  ): Promise<number> {
    const live = new Set(liveSubagentIds);
    let removed = 0;
    for (const entry of await deps.listSubagents()) {
      const withDisplayName = entry as SubagentInfo & { displayName?: string };
      const displayName = withDisplayName.displayName ?? entry.name;
      if (!displayName?.startsWith(DEBUG_SUBAGENT_DISPLAY_PREFIX)) continue;
      if (live.has(entry.id)) continue;
      await deps.deleteSubagent({
        subagentKey: entry.key,
        subagentId: entry.id,
      });
      removed += 1;
    }
    return removed;
  }

  return {
    createDebugSession,
    prepareForSend,
    disposeDebugSession,
    sendMessage,
    sweepOrphanedDebugSubagents,
  };
}
