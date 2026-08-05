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
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  index = 0,
  onOpenDetails,
  onDispatch,
  dispatching = false,
}) => {
  const { t } = useTranslation('scenes/agents');
  const sourceLabel = agent.subagentSource === 'user'
    ? t('filters.user')
    : agent.subagentSource === 'project'
      ? t('filters.project')
      : t('filters.builtin');
  const roleLabel = t('agentCard.roles.specialist');
  const openDetails = () => onOpenDetails(agent);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openDetails();
  };

  return (
    <div
      className={`agent-card ${onDispatch ? 'agent-card--dispatchable' : ''}`.trim()}
      style={{
        '--card-index': index,
      } as React.CSSProperties}
      onClick={openDetails}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={t('agentCard.actions.viewNamed', { name: agent.displayName })}
    >
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
            <Loader2 size={13} className="agent-card__dispatch-spinner" aria-hidden="true" />
          ) : (
            <Send size={13} aria-hidden="true" />
          )}
          <span>{t('agentCard.actions.dispatchTask')}</span>
        </button>
      ) : null}
      <div className="agent-card__header">
        <AgentAvatar
          identity={agent.key || agent.id || agent.name}
          name={agent.displayName}
        />
        <div className="agent-card__header-info">
          <span className="agent-card__name">{agent.displayName}</span>
          <span className="agent-card__role">
            {roleLabel}
            <span aria-hidden="true">·</span>
            {sourceLabel}
          </span>
        </div>
      </div>

      <div className="agent-card__body">
        <p className="agent-card__desc">
          {getAgentDescription(t, agent)}
        </p>
      </div>

      <div className="agent-card__footer">
        <div className="agent-card__cap-chips">
          {agent.capabilities.slice(0, 3).map((cap) => (
            <span
              key={cap.category}
              className="agent-card__cap-chip"
            >
              {getCapabilityLabel(t, cap.category)}
            </span>
          ))}
        </div>
        <span className="agent-card__view">
          {t('agentCard.actions.view')}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export default AgentCard;
