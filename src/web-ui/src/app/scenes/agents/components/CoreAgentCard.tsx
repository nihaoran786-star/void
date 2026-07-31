import React from 'react';
import {
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentWithCapabilities } from '../agentsStore';
import { getAgentDescription, getCapabilityLabel } from '../utils';
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
}

const CoreAgentCard: React.FC<CoreAgentCardProps> = ({
  agent,
  index = 0,
  meta,
  onOpenDetails,
}) => {
  const { t } = useTranslation('scenes/agents');
  const openDetails = () => onOpenDetails(agent);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openDetails();
  };

  return (
    <div
      className="core-agent-card"
      style={{
        '--card-index': index,
      } as React.CSSProperties}
      onClick={openDetails}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={t('agentCard.actions.viewNamed', { name: agent.displayName })}
    >
      <div className="core-agent-card__top">
        <AgentAvatar
          identity={agent.key || agent.id || agent.name}
          name={agent.displayName}
        />
        <div className="core-agent-card__top-info">
          <span className="core-agent-card__name">{agent.displayName}</span>
          <span className="core-agent-card__role">
            {meta.role}
            <span aria-hidden="true">·</span>
            {t('filters.builtin')}
          </span>
        </div>
      </div>

      <div className="core-agent-card__body">
        <p className="core-agent-card__desc">
          {getAgentDescription(t, agent)}
        </p>
      </div>

      <div className="core-agent-card__footer">
        <div className="core-agent-card__cap-chips">
          {agent.capabilities.slice(0, 3).map((capability) => (
            <span key={capability.category} className="core-agent-card__cap-chip">
              {getCapabilityLabel(t, capability.category)}
            </span>
          ))}
        </div>
        <span className="core-agent-card__view">
          {t('agentCard.actions.view')}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export default CoreAgentCard;
