import React from 'react';
import {
  ChevronRight,
  Loader2,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentWithCapabilities } from '../agentsStore';
import AgentAvatar from './AgentAvatar';
import './CoreAgentCard.scss';

export interface CoreAgentMeta {
  role: string;
}

interface CoreAgentCardProps {
  agent: AgentWithCapabilities;
  index?: number;
  meta: CoreAgentMeta;
  onOpenDetails: (agent: AgentWithCapabilities) => void;
  onDispatch?: (agent: AgentWithCapabilities) => void;
  dispatching?: boolean;
  /** Selected in the directory — its orb avatar animates. */
  active?: boolean;
}

const CoreAgentCard: React.FC<CoreAgentCardProps> = ({
  agent,
  index = 0,
  meta,
  onOpenDetails,
  onDispatch,
  dispatching = false,
  active = false,
}) => {
  const { t } = useTranslation('scenes/agents');
  const [hovered, setHovered] = React.useState(false);
  const avatarState = dispatching ? 'running' : active || hovered ? 'active' : 'idle';
  const openDetails = () => onOpenDetails(agent);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openDetails();
  };

  return (
    <div
      className={`core-agent-card ${onDispatch ? 'core-agent-card--dispatchable' : ''}`.trim()}
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
      <p className="core-agent-card__name">{agent.displayName}</p>
      <p className="core-agent-card__role">
        {meta.role}
        <span aria-hidden="true">·</span>
        {t('filters.builtin')}
      </p>
      <p className="core-agent-card__status">
        {dispatching ? (
          <span className="core-agent-card__status-running">
            <span className="core-agent-card__status-dot" aria-hidden="true" />
            {t('agentCard.status.running')}
          </span>
        ) : (
          <span className="core-agent-card__status-idle">
            {t('agentCard.status.idle')}
          </span>
        )}
      </p>

      <div className="core-agent-card__actions">
        {onDispatch ? (
          <button
            type="button"
            className="core-agent-card__dispatch"
            aria-label={t('agentCard.actions.dispatchNamed', { name: agent.displayName })}
            disabled={dispatching}
            onClick={event => {
              event.stopPropagation();
              onDispatch(agent);
            }}
            onKeyDown={event => event.stopPropagation()}
          >
            {dispatching ? (
              <Loader2 size={12} className="core-agent-card__dispatch-spinner" aria-hidden="true" />
            ) : (
              <Send size={12} aria-hidden="true" />
            )}
            <span>{t('agentCard.actions.dispatchTask')}</span>
          </button>
        ) : null}
        <span className="core-agent-card__view">
          {t('agentCard.actions.view')}
          <ChevronRight size={12} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export default CoreAgentCard;
