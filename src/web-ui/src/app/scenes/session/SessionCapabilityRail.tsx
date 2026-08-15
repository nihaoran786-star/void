import React from 'react';
import {
  PanelRightClose,
  PanelRightOpen,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  SessionCapabilityId,
  SessionCapabilityPresentation,
} from '@/flow_chat/services/sessionCapabilities';
import { SessionCapabilityRailOutlet } from '@/app/presentation/sessionCapabilityRailOutlet';
import { canvasCapabilityContributionRegistry } from '@/app/components/panels/content-canvas/registry/CanvasCapabilityContributionRegistry';
import { ensureFirstPartyCanvasCapabilitiesRegistered } from '@/app/components/panels/content-canvas/registry/firstPartyCanvasCapabilities';
import type { TeamWorkspaceRailStatus } from '@/team_workspace';
import './SessionCapabilityRail.scss';

export interface TeamWorkspaceRailPresentation {
  label?: string;
  status: TeamWorkspaceRailStatus;
  isOpen: boolean;
  onToggle: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

interface SessionCapabilityRailProps {
  capabilities: SessionCapabilityPresentation[];
  teamWorkspace?: TeamWorkspaceRailPresentation;
  activeCapabilityId?: SessionCapabilityId;
  isCanvasExpanded: boolean;
  onOpenCapability: (capabilityId: SessionCapabilityId) => void;
  onCanvasToggle: () => void;
}

ensureFirstPartyCanvasCapabilitiesRegistered();

export const SessionCapabilityRail: React.FC<SessionCapabilityRailProps> = ({
  capabilities,
  teamWorkspace,
  activeCapabilityId,
  isCanvasExpanded,
  onOpenCapability,
  onCanvasToggle,
}) => {
  const { t } = useTranslation('flow-chat');
  const teamWorkspaceLabel = teamWorkspace?.label?.trim()
    || t('layout.sessionCapabilities.teamWorkspace.label');
  const teamWorkspaceStatus = teamWorkspace
    ? t(`layout.sessionCapabilities.teamWorkspace.status.${teamWorkspace.status}`)
    : '';

  return (
    <aside
      className="session-capability-rail"
      aria-label={t('layout.sessionCapabilities.ariaLabel')}
      data-testid="session-capability-rail"
    >
      {capabilities.map(capability => {
        const contribution = canvasCapabilityContributionRegistry.resolveByCapabilityId(
          capability.id,
        );
        if (!contribution) return null;
        const Icon = contribution.Icon;
        const label = t(contribution.labelKey);
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

      {teamWorkspace && (
        <button
          ref={teamWorkspace.buttonRef}
          type="button"
          className={[
            'session-capability-rail__team',
            teamWorkspace.isOpen && 'session-capability-rail__team--active',
            `session-capability-rail__team--${teamWorkspace.status}`,
          ].filter(Boolean).join(' ')}
          onClick={teamWorkspace.onToggle}
          title={t(
            teamWorkspace.isOpen
              ? 'layout.sessionCapabilities.teamWorkspace.close'
              : 'layout.sessionCapabilities.teamWorkspace.open',
            { name: teamWorkspaceLabel },
          )}
          aria-label={t('layout.sessionCapabilities.teamWorkspace.ariaLabel', {
            action: t(
              teamWorkspace.isOpen
                ? 'layout.sessionCapabilities.teamWorkspace.close'
                : 'layout.sessionCapabilities.teamWorkspace.open',
              { name: teamWorkspaceLabel },
            ),
            status: teamWorkspaceStatus,
          })}
          aria-controls="void-team-workspace-panel"
          aria-expanded={teamWorkspace.isOpen}
          data-testid="session-team-workspace-toggle"
        >
          <span className="session-capability-rail__icon">
            <UsersRound size={16} aria-hidden="true" />
          </span>
          <span className="session-capability-rail__copy">
            <span className="session-capability-rail__label">
              {teamWorkspaceLabel}
            </span>
            <span className="session-capability-rail__status">
              {teamWorkspaceStatus}
            </span>
          </span>
          <span
            className="session-capability-rail__status-dot"
            aria-hidden="true"
          />
        </button>
      )}

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
