import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { agentMemoryAPI } from '@/infrastructure/api';
import type {
  AgentMemoryCandidate,
  AgentMemoryProposal,
  StoredAgentMemory,
} from '@/infrastructure/api';
import { isAgentMemoryCapabilityError } from '@/infrastructure/api/service-api/AgentMemoryAPI';
import { configManager } from '@/infrastructure/config';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { Button, confirmDanger } from '@/component-library';
import './AgentMemorySettings.scss';

interface MemorySessionTarget {
  sessionId: string;
  workspacePath: string;
}

function activeMemoryTarget(): MemorySessionTarget | undefined {
  const state = flowChatStore.getState();
  const session = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : undefined;
  if (!session?.workspacePath || session.remoteConnectionId) return undefined;
  return {
    sessionId: session.sessionId,
    workspacePath: session.workspacePath,
  };
}

interface AgentMemoryPresentationError {
  code: 'desktop_update_required' | 'operation_failed';
  message: string;
}

function presentationError(cause: unknown): AgentMemoryPresentationError {
  if (isAgentMemoryCapabilityError(cause)) {
    return {
      code: 'desktop_update_required',
      message: cause.message,
    };
  }
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return {
      code: 'operation_failed',
      message: String(cause.message),
    };
  }
  return {
    code: 'operation_failed',
    message: String(cause),
  };
}

export function AgentMemorySettings(): React.ReactElement {
  const { t } = useTranslation('settings');
  const [target, setTarget] = useState(activeMemoryTarget);
  const [extractionEnabled, setExtractionEnabled] = useState(false);
  const [input, setInput] = useState('');
  const [manualCandidates, setManualCandidates] = useState<AgentMemoryCandidate[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [candidates, setCandidates] = useState<AgentMemoryProposal[]>([]);
  const [memories, setMemories] = useState<StoredAgentMemory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AgentMemoryPresentationError>();
  const desktopUpdateRequired = error?.code === 'desktop_update_required';

  useEffect(
    () => flowChatStore.subscribe(() => setTarget(activeMemoryTarget())),
    [],
  );

  useEffect(() => {
    void configManager
      .getConfig<boolean>(
        'app.ai_experience.agent_memory_extraction_enabled',
      )
      .then(value => setExtractionEnabled(value === true))
      .catch(cause => setError(presentationError(cause)));
  }, []);

  const refresh = useCallback(async () => {
    if (!target) {
      setMemories([]);
      return;
    }
    setMemories(await agentMemoryAPI.list(target.workspacePath));
  }, [target]);

  useEffect(() => {
    setCandidates([]);
    setManualCandidates([]);
    setError(undefined);
    void refresh().catch(cause => setError(presentationError(cause)));
  }, [refresh]);

  const setExtractionPermission = useCallback(async (enabled: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await configManager.setConfig(
        'app.ai_experience.agent_memory_extraction_enabled',
        enabled,
      );
      setExtractionEnabled(enabled);
    } catch (cause) {
      setError(presentationError(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const extractFromSession = useCallback(async () => {
    if (!target || !extractionEnabled) return;
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await agentMemoryAPI.extractFromSession(
        target.workspacePath,
        target.sessionId,
      );
      setCandidates(outcome.status === 'proposed' ? outcome.proposals : []);
    } catch (cause) {
      setError(presentationError(cause));
    } finally {
      setBusy(false);
    }
  }, [extractionEnabled, target]);

  const proposeManual = useCallback(async () => {
    if (!target || !input.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const batch = await agentMemoryAPI.propose(target.workspacePath, [input]);
      setManualCandidates(batch.candidates);
      setRejectedCount(batch.rejectedCount);
      setInput('');
    } catch (cause) {
      setError(presentationError(cause));
    } finally {
      setBusy(false);
    }
  }, [input, target]);

  const resolveManualCandidate = useCallback(
    async (candidate: AgentMemoryCandidate, approved: boolean) => {
      if (!target) return;
      setBusy(true);
      setError(undefined);
      try {
        await agentMemoryAPI.commit(target.workspacePath, candidate, approved);
        setManualCandidates(current =>
          current.filter(item => item.id !== candidate.id),
        );
        if (approved) await refresh();
      } catch (cause) {
        setError(presentationError(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh, target],
  );

  const updateCandidate = useCallback((proposalId: string, content: string) => {
    setCandidates(current =>
      current.map(candidate =>
        candidate.proposalId === proposalId
          ? { ...candidate, content }
          : candidate,
      ),
    );
  }, []);

  const resolveCandidate = useCallback(
    async (proposal: AgentMemoryProposal, approved: boolean) => {
      if (!target) return;
      setBusy(true);
      setError(undefined);
      try {
        await agentMemoryAPI.review(
          target.workspacePath,
          proposal,
          proposal.content,
          approved,
        );
        setCandidates(current =>
          current.filter(item => item.proposalId !== proposal.proposalId),
        );
        if (approved) await refresh();
      } catch (cause) {
        setError(presentationError(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh, target],
  );

  const removeMemory = useCallback(
    async (memory: StoredAgentMemory) => {
      if (!target) return;
      const confirmed = await confirmDanger(
        t('agentMemory.deleteConfirmTitle'),
        t('agentMemory.deleteConfirmMessage', { content: memory.content }),
      );
      if (!confirmed) return;
      setBusy(true);
      setError(undefined);
      try {
        await agentMemoryAPI.deleteConfirmed(memory, target.workspacePath);
        await refresh();
      } catch (cause) {
        setError(presentationError(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh, t, target],
  );

  return (
    <section className="agent-memory-settings" aria-labelledby="agent-memory-title">
      <h3 id="agent-memory-title">{t('agentMemory.title')}</h3>
      <p>{t('agentMemory.description')}</p>
      <label className="agent-memory-settings__trigger">
        <input
          type="checkbox"
          checked={extractionEnabled}
          disabled={busy || desktopUpdateRequired}
          onChange={event => void setExtractionPermission(event.target.checked)}
        />
        <span>{t('agentMemory.extractionPermission')}</span>
      </label>
      <p className="agent-memory-settings__hint">
        {t('agentMemory.extractionPermissionHint')}
      </p>
      {!target ? (
        <p role="status">{t('agentMemory.openWorkspace')}</p>
      ) : (
        <>
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder={t('agentMemory.placeholder')}
            aria-label={t('agentMemory.candidateAriaLabel')}
            disabled={busy || desktopUpdateRequired}
          />
          <Button
            onClick={() => void proposeManual()}
            disabled={busy || desktopUpdateRequired || !input.trim()}
          >
            {t('agentMemory.review')}
          </Button>
          {rejectedCount > 0 && (
            <p role="alert">{t('agentMemory.rejected')}</p>
          )}
          {manualCandidates.map(candidate => (
            <div className="agent-memory-settings__item" key={candidate.id}>
              <span>{candidate.content}</span>
              <div>
                <Button
                  onClick={() => void resolveManualCandidate(candidate, true)}
                  disabled={busy || desktopUpdateRequired}
                >
                  {t('agentMemory.save')}
                </Button>
                <Button
                  onClick={() => void resolveManualCandidate(candidate, false)}
                  disabled={busy || desktopUpdateRequired}
                >
                  {t('agentMemory.discard')}
                </Button>
              </div>
            </div>
          ))}
          <Button
            onClick={() => void extractFromSession()}
            disabled={busy || desktopUpdateRequired || !extractionEnabled}
          >
            {t('agentMemory.reviewSession')}
          </Button>
          {error && (
            <p role="alert">
              {desktopUpdateRequired
                ? t('agentMemory.desktopUpdateRequired')
                : error.message}
            </p>
          )}
          <div aria-label={t('agentMemory.candidatesAriaLabel')}>
            {candidates.map(candidate => (
              <div className="agent-memory-settings__item" key={candidate.proposalId}>
                <div className="agent-memory-settings__content">
                  {candidate.expectedRevision != null && (
                    <span className="agent-memory-settings__badge">
                      {t('agentMemory.merge')}
                    </span>
                  )}
                  <textarea
                    value={candidate.content}
                    aria-label={t('agentMemory.editCandidate')}
                    disabled={busy || desktopUpdateRequired}
                    onChange={event =>
                      updateCandidate(candidate.proposalId, event.target.value)
                    }
                  />
                </div>
                <div>
                  <Button
                    onClick={() => void resolveCandidate(candidate, true)}
                    disabled={busy || desktopUpdateRequired || !candidate.content.trim()}
                  >
                    {t('agentMemory.save')}
                  </Button>
                  <Button
                    onClick={() => void resolveCandidate(candidate, false)}
                    disabled={busy || desktopUpdateRequired}
                  >
                    {t('agentMemory.discard')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div aria-label={t('agentMemory.savedAriaLabel')}>
            {memories.length === 0 && (
              <p role="status">{t('agentMemory.empty')}</p>
            )}
            {memories.map(memory => (
              <div className="agent-memory-settings__item" key={memory.id}>
                <span>{memory.content}</span>
                <Button
                  onClick={() => void removeMemory(memory)}
                  disabled={busy || desktopUpdateRequired}
                >
                  {t('agentMemory.delete')}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
