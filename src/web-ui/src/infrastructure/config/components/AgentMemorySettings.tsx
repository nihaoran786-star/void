import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { agentMemoryAPI } from '@/infrastructure/api';
import type {
  AgentMemoryCandidate,
  StoredAgentMemory,
} from '@/infrastructure/api';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { Button } from '@/component-library';
import './AgentMemorySettings.scss';

function activeWorkspacePath(): string | undefined {
  const state = flowChatStore.getState();
  const session = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : undefined;
  return session?.remoteConnectionId ? undefined : session?.workspacePath;
}

export function AgentMemorySettings(): React.ReactElement {
  const { t } = useTranslation('settings');
  const [workspacePath, setWorkspacePath] = useState(activeWorkspacePath);
  const [input, setInput] = useState('');
  const [candidates, setCandidates] = useState<AgentMemoryCandidate[]>([]);
  const [memories, setMemories] = useState<StoredAgentMemory[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(
    () => flowChatStore.subscribe(() => setWorkspacePath(activeWorkspacePath())),
    [],
  );

  const refresh = useCallback(async () => {
    if (!workspacePath) {
      setMemories([]);
      return;
    }
    setMemories(await agentMemoryAPI.list(workspacePath));
  }, [workspacePath]);

  useEffect(() => {
    void refresh().catch(cause => setError(String(cause)));
  }, [refresh]);

  const propose = useCallback(async () => {
    if (!workspacePath || !input.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const batch = await agentMemoryAPI.propose(workspacePath, [input]);
      setCandidates(batch.candidates);
      setRejectedCount(batch.rejectedCount);
      setInput('');
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [input, workspacePath]);

  const resolveCandidate = useCallback(async (
    candidate: AgentMemoryCandidate,
    approved: boolean,
  ) => {
    if (!workspacePath) return;
    setBusy(true);
    setError(undefined);
    try {
      await agentMemoryAPI.commit(workspacePath, candidate, approved);
      setCandidates(current => current.filter(item => item.id !== candidate.id));
      if (approved) await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [refresh, workspacePath]);

  const removeMemory = useCallback(async (id: string) => {
    if (!workspacePath) return;
    setBusy(true);
    setError(undefined);
    try {
      await agentMemoryAPI.delete(workspacePath, id);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [refresh, workspacePath]);

  return (
    <section className="agent-memory-settings" aria-labelledby="agent-memory-title">
      <h3 id="agent-memory-title">{t('agentMemory.title')}</h3>
      <p>{t('agentMemory.description')}</p>
      {!workspacePath ? (
        <p role="status">{t('agentMemory.openWorkspace')}</p>
      ) : (
        <>
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder={t('agentMemory.placeholder')}
            aria-label={t('agentMemory.candidateAriaLabel')}
            disabled={busy}
          />
          <Button onClick={() => void propose()} disabled={busy || !input.trim()}>
            {t('agentMemory.review')}
          </Button>
          {rejectedCount > 0 && (
            <p role="alert">{t('agentMemory.rejected')}</p>
          )}
          {error && <p role="alert">{error}</p>}
          {candidates.map(candidate => (
            <div className="agent-memory-settings__item" key={candidate.id}>
              <span>{candidate.content}</span>
              <div>
                <Button onClick={() => void resolveCandidate(candidate, true)} disabled={busy}>
                  {t('agentMemory.save')}
                </Button>
                <Button onClick={() => void resolveCandidate(candidate, false)} disabled={busy}>
                  {t('agentMemory.discard')}
                </Button>
              </div>
            </div>
          ))}
          <div aria-label={t('agentMemory.savedAriaLabel')}>
            {memories.map(memory => (
              <div className="agent-memory-settings__item" key={memory.id}>
                <span>{memory.content}</span>
                <Button onClick={() => void removeMemory(memory.id)} disabled={busy}>
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
