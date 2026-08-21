import React from 'react';
import { Send, Sparkles } from 'lucide-react';
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
  /** Presentation only: member names already known to the caller. */
  memberNames?: string[];
  /** Localized "{n} members" line for the card foot. */
  memberCountLabel?: string;
  /** Localized status word (running/idle); tone follows `dispatching`. */
  statusLabel?: string;
}

const MEMBER_ORB_LIMIT = 5;

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
  memberNames = [],
  memberCountLabel,
  statusLabel,
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
          <Send size={13} aria-hidden="true" />
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
        {memberNames.length > 0 ? (
          <span className="agent-team-card__members" aria-hidden="true">
            {memberNames.slice(0, MEMBER_ORB_LIMIT).map((name, orbIndex) => (
              <span
                key={`${name}-${orbIndex}`}
                className="agent-team-card__member-orb"
                title={name}
              />
            ))}
            {memberNames.length > MEMBER_ORB_LIMIT ? (
              <span className="is-overflow">
                +{memberNames.length - MEMBER_ORB_LIMIT}
              </span>
            ) : null}
          </span>
        ) : null}
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
        {memberCountLabel || statusLabel ? (
          <span className="agent-team-card__meta">
            {memberCountLabel ? (
              <span className="agent-team-card__member-count">
                {memberCountLabel}
              </span>
            ) : null}
            {statusLabel ? (
              <span
                className={`agent-team-card__status ${dispatching ? 'is-success' : 'is-muted'}`}
              >
                {statusLabel}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default AgentTeamCard;
