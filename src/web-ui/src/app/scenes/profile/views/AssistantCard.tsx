import React from 'react';
import { Bot, MessageSquarePlus, Settings, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import type { WorkspaceInfo } from '@/shared/types';

/**
 * Staff HQ person card for one assistant workspace.
 * Presentation only — all behaviour arrives through the handler props.
 */
interface AssistantCardProps {
  workspace: WorkspaceInfo;
  onClick: () => void;
  onNewSession?: () => void;
  onDelete?: () => void;
  style?: React.CSSProperties;
}

const AssistantCard: React.FC<AssistantCardProps> = ({ workspace, onClick, onNewSession, onDelete, style }) => {
  const { t } = useTranslation('scenes/profile');
  const identity = workspace.identity;

  const name = identity?.name?.trim() || workspace.name || t('nursery.card.unnamed');
  const emoji = identity?.emoji?.trim() ?? '';
  const creature = identity?.creature?.trim() || '';
  const vibe = identity?.vibe?.trim() || '';
  const modelPrimary = identity?.modelPrimary?.trim() || '';
  const modelFast = identity?.modelFast?.trim() || '';

  const personaLine = [creature, vibe].filter(Boolean).join(' · ');

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="assistant-hq-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      aria-label={name}
      style={style}
    >
      <div className="assistant-hq-card__head">
        <div className="assistant-hq-card__avatar" aria-hidden>
          {emoji ? (
            <span className="assistant-hq-card__emoji">{emoji}</span>
          ) : (
            <Bot className="assistant-hq-card__avatar-icon" size={20} strokeWidth={1.6} />
          )}
        </div>
        <div className="assistant-hq-card__id">
          <span className="assistant-hq-card__name">{name}</span>
          <span className={`assistant-hq-card__line${personaLine ? '' : ' assistant-hq-card__line--empty'}`}>
            {personaLine || t('nursery.card.noVibe')}
          </span>
        </div>
      </div>

      {(modelPrimary || modelFast) ? (
        <div className="assistant-hq-card__tags">
          {modelPrimary && <span className="assistant-hq-card__tag">{modelPrimary}</span>}
          {modelFast && modelFast !== modelPrimary && (
            <span className="assistant-hq-card__tag">{modelFast}</span>
          )}
        </div>
      ) : null}

      <div className="assistant-hq-card__actions">
        {onNewSession && (
          <Tooltip content={t('nursery.card.newSession')} placement="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNewSession();
              }}
              aria-label={t('nursery.card.newSession')}
            >
              <MessageSquarePlus size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        )}
        <Tooltip content={t('nursery.hq.configure')} placement="top">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            aria-label={t('nursery.hq.configure')}
          >
            <Settings size={14} strokeWidth={2} aria-hidden />
          </button>
        </Tooltip>
        {onDelete && (
          <Tooltip content={t('nursery.card.delete')} placement="top">
            <button
              type="button"
              className="assistant-hq-card__delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label={t('nursery.card.delete')}
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default AssistantCard;
