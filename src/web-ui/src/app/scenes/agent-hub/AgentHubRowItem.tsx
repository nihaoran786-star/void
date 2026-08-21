/**
 * One AGENT directory row: avatar → name → one muted line → status word.
 *
 * No card, no border, no shadow. Hover (and keyboard focus) swaps the status
 * word for the row's two quiet actions; the status stays readable as text plus
 * a colour dot, never colour alone.
 */

import React, { useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import AgentAvatar from '../agents/components/AgentAvatar';
import SkillCatalogAvatar from '../skills/components/SkillCatalogAvatar';
import ConnectorCatalogAvatar from '@/infrastructure/config/components/ConnectorCatalogAvatar';
import type { AgentHubRow } from './useAgentHubDirectory';

export interface AgentHubRowAction {
  key: string;
  Icon: LucideIcon;
  label: string;
  onSelect: () => void;
}

interface AgentHubRowItemProps {
  row: AgentHubRow;
  statusLabel: string;
  actions: AgentHubRowAction[];
  onOpen: () => void;
}

const AgentHubRowItem: React.FC<AgentHubRowItemProps> = ({
  row,
  statusLabel,
  actions,
  onOpen,
}) => {
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  }, [onOpen]);

  return (
    <div
      className={`agent-hub-row agent-hub-row--${row.type}`}
      data-testid={`agent-hub-row-${row.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <span className="agent-hub-row__avatar">
        {renderAvatar(row)}
      </span>
      <span className="agent-hub-row__name">{row.name}</span>
      <span className="agent-hub-row__line" title={row.line}>{row.line}</span>
      <span className={`agent-hub-row__status is-${row.status.tone}`}>
        {statusLabel}
      </span>
      <span className="agent-hub-row__actions">
        {actions.map(action => (
          <button
            key={action.key}
            type="button"
            className="agent-hub-row__action"
            aria-label={action.label}
            title={action.label}
            onClick={event => {
              event.stopPropagation();
              action.onSelect();
            }}
          >
            <action.Icon size={15} aria-hidden="true" />
          </button>
        ))}
      </span>
    </div>
  );
};

function renderAvatar(row: AgentHubRow): React.ReactNode {
  const { avatarProps } = row;

  if (row.type === 'skill') {
    return (
      <span className="agent-hub-row__glyph">
        <SkillCatalogAvatar identity={avatarProps.identity} name={avatarProps.name} />
      </span>
    );
  }

  if (row.type === 'connector') {
    return (
      <span className="agent-hub-row__glyph">
        <ConnectorCatalogAvatar
          identity={avatarProps.identity}
          name={avatarProps.name}
          transport={avatarProps.transport}
        />
      </span>
    );
  }

  if (row.type === 'team') {
    return (
      <span className="agent-hub-row__team">
        <AgentAvatar identity={avatarProps.identity} name={avatarProps.name} />
        <span className="agent-hub-row__members">
          {(avatarProps.memberIdentities ?? []).map(identity => (
            <span key={identity} className="agent-hub-row__member-orb" />
          ))}
          {avatarProps.overflowCount ? (
            <span className="is-overflow">{`+${avatarProps.overflowCount}`}</span>
          ) : null}
        </span>
      </span>
    );
  }

  return <AgentAvatar identity={avatarProps.identity} name={avatarProps.name} />;
}

export default AgentHubRowItem;
