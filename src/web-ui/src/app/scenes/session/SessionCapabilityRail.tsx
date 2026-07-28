import React from 'react';
import {
  Clapperboard,
  Images,
  PanelRightClose,
  PanelRightOpen,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  SessionCapabilityId,
  SessionCapabilityPresentation,
} from '@/flow_chat/services/sessionCapabilities';
import { SessionCapabilityRailOutlet } from '@/app/presentation/sessionCapabilityRailOutlet';
import './SessionCapabilityRail.scss';

interface SessionCapabilityRailProps {
  capabilities: SessionCapabilityPresentation[];
  activeCapabilityId?: SessionCapabilityId;
  isCanvasExpanded: boolean;
  onOpenCapability: (capabilityId: SessionCapabilityId) => void;
  onCanvasToggle: () => void;
}

const CAPABILITY_ICONS = {
  'short-drama': Clapperboard,
  'workspace-media': Images,
} satisfies Record<SessionCapabilityId, LucideIcon>;

const CAPABILITY_LABEL_KEYS = {
  'short-drama': 'layout.sessionCapabilities.shortDrama',
  'workspace-media': 'layout.sessionCapabilities.workspaceMedia',
} satisfies Record<SessionCapabilityId, string>;

export const SessionCapabilityRail: React.FC<SessionCapabilityRailProps> = ({
  capabilities,
  activeCapabilityId,
  isCanvasExpanded,
  onOpenCapability,
  onCanvasToggle,
}) => {
  const { t } = useTranslation('flow-chat');

  return (
    <aside
      className="session-capability-rail"
      aria-label={t('layout.sessionCapabilities.ariaLabel')}
      data-testid="session-capability-rail"
    >
      {capabilities.map(capability => {
        const Icon = CAPABILITY_ICONS[capability.id];
        const label = t(CAPABILITY_LABEL_KEYS[capability.id]);
        const status = t(
          `layout.sessionCapabilities.status.${capability.status}`,
        );
        const isActive = isCanvasExpanded
          && activeCapabilityId === capability.id;

        return (
          <button
            key={capability.id}
            type="button"
            className={[
              'session-capability-rail__capability',
              isActive && 'session-capability-rail__capability--active',
              `session-capability-rail__capability--${capability.status}`,
            ].filter(Boolean).join(' ')}
            onClick={() => onOpenCapability(capability.id)}
            title={t('layout.sessionCapabilities.open', { name: label })}
            aria-label={t('layout.sessionCapabilities.open', { name: label })}
            aria-pressed={isActive}
            data-capability-id={capability.id}
          >
            <span className="session-capability-rail__icon">
              <Icon size={16} />
            </span>
            <span className="session-capability-rail__copy">
              <span className="session-capability-rail__label">{label}</span>
              <span className="session-capability-rail__status">
                {capability.status === 'ready' && capability.usageCount > 0
                  ? t('layout.sessionCapabilities.usageCount', {
                      count: capability.usageCount,
                    })
                  : status}
              </span>
            </span>
            <span
              className="session-capability-rail__status-dot"
              aria-hidden="true"
            />
          </button>
        );
      })}

      <SessionCapabilityRailOutlet />

      <button
        type="button"
        className="session-capability-rail__toggle"
        onClick={onCanvasToggle}
        title={t(
          isCanvasExpanded
            ? 'layout.collapseCanvas'
            : 'layout.expandCanvas',
        )}
        aria-label={t(
          isCanvasExpanded
            ? 'layout.collapseCanvas'
            : 'layout.expandCanvas',
        )}
        aria-controls="void-session-aux-pane"
        aria-expanded={isCanvasExpanded}
        data-testid="session-aux-pane-toggle"
      >
        {isCanvasExpanded
          ? <PanelRightClose size={15} aria-hidden="true" />
          : <PanelRightOpen size={15} aria-hidden="true" />}
        <span>
          {t(
            isCanvasExpanded
              ? 'layout.sessionCapabilities.collapse'
              : 'layout.sessionCapabilities.expand',
          )}
        </span>
      </button>
    </aside>
  );
};

export default SessionCapabilityRail;
