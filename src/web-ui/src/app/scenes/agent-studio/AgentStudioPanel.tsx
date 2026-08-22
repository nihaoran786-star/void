import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { Session } from '@/flow_chat/types/flow-chat';
import { AgentDebugChatPanel } from '@/app/scenes/agents/components/AgentDebugChatPanel';
import type { AgentRevisionContent } from '@/shared/services/customization/AgentAuthoringGateway';
import type { AgentActivationAction } from '@/shared/services/customization/AgentRevisionActivation';
import type { AgentStudioState } from './agentStudioSession';
import './AgentStudioPanel.scss';

/**
 * Renders the studio from explicit state.
 *
 * Every action is gated on `state.canPublish` / `state.phase` rather than on
 * whatever happens to be loaded, so the buttons never offer something the
 * controllers underneath would refuse. The trial conversation reuses the panel
 * the legacy creation page already proved out instead of growing a second chat.
 */

const subscribeToFlowChat = (callback: () => void) => flowChatStore.subscribe(callback);

function useDebugSession(sessionId: string | null): Session | null {
  const getSnapshot = React.useCallback(
    () => (sessionId ? flowChatStore.getState().sessions.get(sessionId) ?? null : null),
    [sessionId],
  );
  return React.useSyncExternalStore(subscribeToFlowChat, getSnapshot, () => null);
}

export interface AgentStudioPanelProps {
  state: AgentStudioState;
  debugSessionId: string | null;
  busy?: boolean;
  notice?: { tone: 'info' | 'error'; message: string } | null;
  onSave: (content: AgentRevisionContent) => void;
  onStartTrial: () => void;
  onPublish: (action: AgentActivationAction) => void;
}

const PUBLISH_ACTIONS: ReadonlyArray<{
  kind: AgentActivationAction['kind'];
  labelKey: string;
}> = [
  { kind: 'continue', labelKey: 'agentStudio.publish.continue' },
  { kind: 'fork', labelKey: 'agentStudio.publish.fork' },
  { kind: 'future-default', labelKey: 'agentStudio.publish.futureDefault' },
];

export const AgentStudioPanel: React.FC<AgentStudioPanelProps> = ({
  state,
  debugSessionId,
  busy = false,
  notice = null,
  onSave,
  onStartTrial,
  onPublish,
}) => {
  const { t } = useI18n('components');
  const debugSession = useDebugSession(debugSessionId);
  const draft = state.draft;
  const [edited, setEdited] = React.useState<AgentRevisionContent | null>(null);

  // A newly opened or newly saved draft replaces whatever was being typed,
  // because the catalog revision is the authority for what is in the draft.
  React.useEffect(() => {
    setEdited(draft ? { ...draft.content } : null);
  }, [draft?.draftRevisionId, draft]);

  if (state.phase === 'closed' || !draft || !edited) {
    return (
      <div className="void-agent-studio" data-studio-state="closed">
        <p>{t('agentStudio.empty')}</p>
      </div>
    );
  }

  const update = <K extends keyof AgentRevisionContent>(
    key: K,
    value: AgentRevisionContent[K],
  ) => setEdited(current => (current ? { ...current, [key]: value } : current));

  return (
    <div className="void-agent-studio" data-studio-state={state.trial}>
      {notice ? (
        <p className="void-agent-studio__notice" data-tone={notice.tone} role="status">
          {notice.message}
        </p>
      ) : null}

      <section className="void-agent-studio__editor">
        <label>
          <span>{t('agentStudio.fields.displayName')}</span>
          <input
            value={edited.displayName}
            disabled={busy}
            onChange={event => update('displayName', event.target.value)}
          />
        </label>
        <label>
          <span>{t('agentStudio.fields.description')}</span>
          <input
            value={edited.description}
            disabled={busy}
            onChange={event => update('description', event.target.value)}
          />
        </label>
        <label>
          <span>{t('agentStudio.fields.prompt')}</span>
          <textarea
            value={edited.prompt}
            rows={10}
            disabled={busy}
            onChange={event => update('prompt', event.target.value)}
          />
        </label>
        <label className="void-agent-studio__toggle">
          <input
            type="checkbox"
            checked={edited.readonly}
            disabled={busy}
            onChange={event => update('readonly', event.target.checked)}
          />
          <span>{t('agentStudio.fields.readonly')}</span>
        </label>
        <label className="void-agent-studio__toggle">
          <input
            type="checkbox"
            checked={edited.review}
            disabled={busy}
            onChange={event => update('review', event.target.checked)}
          />
          <span>{t('agentStudio.fields.review')}</span>
        </label>

        {/* Tool permissions stay read-only here: widening what an agent may do
            is a capability decision, not a text edit. */}
        <p className="void-agent-studio__tools">
          {t('agentStudio.fields.tools')}: {edited.tools.join(', ') || t('agentStudio.fields.noTools')}
        </p>

        <button type="button" disabled={busy} onClick={() => onSave(edited)}>
          {t('agentStudio.actions.save')}
        </button>
      </section>

      <section className="void-agent-studio__trial">
        <header>
          <h4>{t('agentStudio.trial.title')}</h4>
          <button type="button" disabled={busy} onClick={onStartTrial}>
            {state.trial === 'ready'
              ? t('agentStudio.actions.restartTrial')
              : t('agentStudio.actions.startTrial')}
          </button>
        </header>
        <AgentDebugChatPanel
          session={debugSession}
          status={state.trial === 'ready' ? 'ready' : 'idle'}
        />
      </section>

      <section className="void-agent-studio__publish">
        <h4>{t('agentStudio.publish.title')}</h4>
        {state.canPublish
          ? null
          : <p className="void-agent-studio__hint">{t('agentStudio.publish.untriedHint')}</p>}
        <div className="void-agent-studio__publish-actions">
          {PUBLISH_ACTIONS.map(action => (
            <button
              key={action.kind}
              type="button"
              disabled={busy || !state.canPublish}
              onClick={() => onPublish({ kind: action.kind } as AgentActivationAction)}
            >
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

AgentStudioPanel.displayName = 'AgentStudioPanel';
