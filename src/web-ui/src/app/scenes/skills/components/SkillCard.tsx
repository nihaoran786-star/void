import React from 'react';
import { getCardGradient, getCardColorRgb } from '@/shared/utils/cardGradients';
import SkillCatalogAvatar from './SkillCatalogAvatar';
import './SkillCard.scss';

type SkillCardActionTone = 'primary' | 'danger' | 'success' | 'muted';

export interface SkillCardAction {
  id: string;
  icon: React.ReactNode;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  tone?: SkillCardActionTone;
  onClick: () => void;
}

/** Explicit per-card status line: quiet ink, never a pill. */
export interface SkillCardStatus {
  /** Visible status copy, e.g. t('list.item.statusActive'). */
  label: string;
  /** Colors the status ink dot + label; defaults to muted. */
  tone?: 'success' | 'warning' | 'error' | 'muted';
  /** Optional origin/detail rendered after a middot, always muted. */
  detail?: string;
  /** Tooltip for the whole status line. */
  title?: string;
}

interface SkillCardProps {
  name: string;
  description?: string;
  index?: number;
  accentSeed?: string;
  iconKind?: 'skill' | 'market';
  /**
   * Card lifecycle state, surfaced as `data-state` so tests and styles can
   * distinguish e.g. an active skill from one shadowed by a duplicate.
   */
  state?: 'active' | 'shadowed';
  status?: SkillCardStatus;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: SkillCardAction[];
  detailLabel: string;
  onOpenDetails?: () => void;
}

/**
 * The one Staff HQ skill card, shared by the installed grid and the market
 * grid: 36px glyph, name, clamped purpose, explicit status ink, and corner
 * actions that surface on hover. Presentation only — every grid passes its own
 * handlers in.
 */
const SkillCard: React.FC<SkillCardProps> = ({
  name,
  description,
  index = 0,
  accentSeed,
  iconKind = 'skill',
  state = 'active',
  status,
  badges,
  meta,
  actions = [],
  detailLabel,
  onOpenDetails,
}) => {
  return (
    <article
      className={[
        'skill-card',
        state === 'shadowed' && 'is-shadowed',
      ].filter(Boolean).join(' ')}
      style={{
        '--card-index': index,
        '--skill-card-gradient': getCardGradient(accentSeed ?? name),
        '--skill-card-color-rgb': getCardColorRgb(accentSeed ?? name),
      } as React.CSSProperties}
      aria-label={name}
      data-state={state}
    >
      {/* Header: visual identity + capability summary */}
      <div className="skill-card__header">
        <SkillCatalogAvatar
          identity={accentSeed ?? name}
          name={name}
          kind={iconKind}
          className="skill-card__avatar"
        />
        <div className="skill-card__body">
          <div className="skill-card__title-row">
            <span className="skill-card__name">{name}</span>
            {meta ? (
              <div
                className="skill-card__meta"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {meta}
              </div>
            ) : null}
          </div>
          {description?.trim() && (
            <p className="skill-card__desc">{description.trim()}</p>
          )}
          {status && (
            <p
              className={[
                'skill-card__status',
                `is-${status.tone ?? 'muted'}`,
              ].join(' ')}
              title={status.title}
            >
              <span className="skill-card__status-state">{status.label}</span>
              {status.detail && (
                <span className="skill-card__status-origin">{status.detail}</span>
              )}
            </p>
          )}
        </div>
        {badges && <div className="skill-card__badges">{badges}</div>}
      </div>

      {/* Corner operations: detail + per-grid actions, revealed on hover */}
      {(onOpenDetails || actions.length > 0) && (
        <div className="skill-card__footer">
          {onOpenDetails && (
            <button
              type="button"
              className="skill-card__detail-btn"
              onClick={onOpenDetails}
            >
              {detailLabel}
            </button>
          )}
          <div className="skill-card__actions" onClick={(e) => e.stopPropagation()}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={[
                  'skill-card__action-btn',
                  action.tone && `skill-card__action-btn--${action.tone}`,
                ].filter(Boolean).join(' ')}
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.ariaLabel}
                title={action.title ?? action.ariaLabel}
              >
                {action.icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

export default SkillCard;
