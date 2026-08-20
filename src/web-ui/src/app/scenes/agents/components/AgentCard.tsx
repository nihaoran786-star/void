import React from 'react';
import {
  ChevronRight,
  Loader2,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentWithCapabilities } from '../agentsStore';
import { getAgentDescription, getCapabilityLabel } from '../utils';
import AgentAvatar from './AgentAvatar';
import './AgentCard.scss';

interface AgentCardProps {
  agent: AgentWithCapabilities;
  index?: number;
  onOpenDetails: (agent: AgentWithCapabilities) => void;
  onDispatch?: (agent: AgentWithCapabilities) => void;
  dispatching?: boolean;
  /** Selected in the directory — its orb avatar animates. */
  active?: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  index = 0,
  onOpenDetails,
  onDispatch,
  dispatching = false,
  active = false,
}) => {
  const { t } = useTranslation('scenes/agents');
  const [hovered, setHovered] = React.useState(false);
  const avatarState = dispatching ? 'running' : active || hovered ? 'active' : 'idle';
  const sourceLabel = agent.subagentSource === 'user'
    ? t('filters.user')
    : agent.subagentSource === 'project'
      ? t('filters.project')
      : t('filters.builtin');
  const roleLabel = t('agentCard.roles.specialist');
  const summary = getAgentDescription(t, agent);
  const tagLabels = (agent.capabilities ?? [])
    .slice(0, 3)
    .map(cap => getCapabilityLabel(t, cap.category));
  const openDetails = () => onOpenDetails(agent);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openDetails();
  };

  return (
    <div
      className={`agent-card ${onDispatch ? 'agent-card--dispatchable' : ''}`.trim()}
      data-state={dispatching ? 'running' : 'idle'}
      style={{
        '--card-index': index,
      } as React.CSSProperties}
      onClick={openDetails}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={t('agentCard.actions.viewNamed', { name: agent.displayName })}
    >
      <AgentAvatar
        identity={agent.key || agent.id || agent.name}
        name={agent.displayName}
        state={avatarState}
      />
      <p className="agent-card__name">{agent.displayName}</p>
      <p className="agent-card__role">
        {roleLabel}
        <span aria-hidden="true">·</span>
        {sourceLabel}
      </p>
      {summary ? (
        <p className="agent-card__summary" title={summary}>{summary}</p>
      ) : null}
      <div className="agent-card__foot">
        <p className="agent-card__status">
          {dispatching ? (
            <span className="agent-card__status-running">
              <span className="agent-card__status-dot" aria-hidden="true" />
              {t('agentCard.status.running')}
            </span>
          ) : (
            <span className="agent-card__status-idle">
              {t('agentCard.status.idle')}
            </span>
          )}
        </p>
        {tagLabels.length > 0 ? (
          <span className="agent-card__tags">
            {tagLabels.map(label => (
              <span key={label} className="agent-card__tag">{label}</span>
            ))}
          </span>
        ) : null}
      </div>

      <div className="agent-card__actions">
        {onDispatch ? (
          <button
            type="button"
            className="agent-card__dispatch"
            aria-label={t('agentCard.actions.dispatchNamed', { name: agent.displayName })}
            disabled={dispatching}
            onClick={event => {
              event.stopPropagation();
              onDispatch(agent);
            }}
            onKeyDown={event => event.stopPropagation()}
          >
            {dispatching ? (
              <Loader2 size={12} className="agent-card__dispatch-spinner" aria-hidden="true" />
            ) : (
              <Send size={12} aria-hidden="true" />
            )}
            <span>{t('agentCard.actions.dispatchTask')}</span>
          </button>
        ) : null}
        <span className="agent-card__view" title={t('agentCard.actions.view')}>
          <span className="agent-card__view-label">{t('agentCard.actions.view')}</span>
          <ChevronRight size={12} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export default AgentCard;
