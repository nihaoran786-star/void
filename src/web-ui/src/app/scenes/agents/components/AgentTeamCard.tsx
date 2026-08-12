import React from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import AgentAvatar from './AgentAvatar';
import './AgentTeamCard.scss';

interface AgentTeamCardProps {
  index?: number;
  title: string;
  subtitle: string;
  roleName: string;
  tagNames: string[];
  avatarIdentity: string;
  avatarName: string;
  onOpen: () => void;
  onDispatch?: () => void;
  dispatchLabel?: string;
  dispatchAriaLabel?: string;
  dispatching?: boolean;
}

const AgentTeamCard: React.FC<AgentTeamCardProps> = ({
  index = 0,
  title,
  subtitle,
  roleName,
  tagNames,
  avatarIdentity,
  avatarName,
  onOpen,
  onDispatch,
  dispatchLabel,
  dispatchAriaLabel,
  dispatching = false,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      className={`agent-team-card ${onDispatch ? 'agent-team-card--dispatchable' : ''}`.trim()}
      style={{ '--card-index': index } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={title}
    >
      {onDispatch && dispatchLabel ? (
        <button
          type="button"
          className="agent-team-card__dispatch"
          aria-label={dispatchAriaLabel ?? dispatchLabel}
          disabled={dispatching}
          onClick={event => {
            event.stopPropagation();
            onDispatch();
          }}
          onKeyDown={event => event.stopPropagation()}
        >
          {dispatching ? (
            <Loader2 size={13} className="agent-team-card__dispatch-spinner" aria-hidden="true" />
          ) : (
            <Send size={13} aria-hidden="true" />
          )}
          <span>{dispatchLabel}</span>
        </button>
      ) : null}
      <div className="agent-team-card__header">
        <AgentAvatar
          identity={avatarIdentity}
          name={avatarName}
          state={dispatching ? 'running' : 'idle'}
          className="agent-team-card__avatar"
        />
        <div className="agent-team-card__header-copy">
          <div className="agent-team-card__title-row">
            <span className="agent-team-card__title">{title}</span>
          </div>
          <span className="agent-team-card__role">
            <Sparkles size={10} strokeWidth={2} />
            {roleName}
          </span>
        </div>
      </div>

      <div className="agent-team-card__body">
        <p className="agent-team-card__desc">{subtitle}</p>
      </div>

      <div className="agent-team-card__footer">
        <div className="agent-team-card__tags">
          {tagNames.slice(0, 3).map((name) => (
            <span
              key={name}
              className="agent-team-card__tag-chip"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgentTeamCard;
