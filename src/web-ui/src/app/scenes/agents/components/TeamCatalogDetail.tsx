import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '@/component-library';
import { GalleryDetailModal } from '@/app/components';
import { Send, ShieldCheck } from 'lucide-react';
import {
  localizeCatalogPresentation,
  type TeamCatalogEntry,
} from '@/shared/services/customization';
import AgentAvatar from './AgentAvatar';
import { canDispatchCustomizationTarget } from '@/app/services/CustomizationTaskDispatchService';

interface TeamCatalogDetailProps {
  team: TeamCatalogEntry | null;
  onClose: () => void;
  onOpenReviewTeam: () => void;
  onEdit: (team: TeamCatalogEntry) => void;
  onDelete: (team: TeamCatalogEntry) => void;
  onDispatch: (team: TeamCatalogEntry) => void;
  deleting?: boolean;
  dispatching?: boolean;
}

const TeamCatalogDetail: React.FC<TeamCatalogDetailProps> = ({
  team,
  onClose,
  onOpenReviewTeam,
  onEdit,
  onDelete,
  onDispatch,
  deleting = false,
  dispatching = false,
}) => {
  const { t } = useTranslation('scenes/agents');
  const isDeepReview = team?.identity.id === 'default-review-team';
  const presentation = team
    ? localizeCatalogPresentation(team.identity, key => t(key))
    : null;
  const lead = team
    ? localizeCatalogPresentation(team.lead.identity, key => t(key))
    : null;
  const dispatchAvailable = team ? canDispatchCustomizationTarget(team) : false;
  const unavailableReason = team && !dispatchAvailable
    ? t(
        team.availability.message
          || `catalog.availability.${team.availability.reasonCode || 'unavailable'}`,
        { defaultValue: t('catalog.availability.unavailable') },
      )
    : null;

  return (
    <GalleryDetailModal
      isOpen={Boolean(team)}
      onClose={onClose}
      icon={team && presentation ? (
        <AgentAvatar
          identity={`team:${team.source.adapterId}:${team.identity.id}`}
          name={presentation.displayName}
          size="detail"
        />
      ) : null}
      title={presentation?.displayName ?? ''}
      description={presentation?.description}
      badges={team ? (
        <>
          <Badge variant="accent">
            {t(`catalog.scenarios.${team.scenarioEligibility[0]}`)}
          </Badge>
          <Badge variant="neutral">
            {t('catalog.detail.memberCount', { count: team.members.length + 1 })}
          </Badge>
        </>
      ) : null}
      actions={team ? (
        <>
          <Button
            variant="primary"
            size="small"
            disabled={!dispatchAvailable}
            isLoading={dispatching}
            onClick={() => onDispatch(team)}
          >
            <Send size={14} />
            {t('catalog.detail.dispatchTask')}
          </Button>
          {isDeepReview ? (
            <Button variant="secondary" size="small" onClick={onOpenReviewTeam}>
              <ShieldCheck size={14} />
              {t('catalog.detail.openReviewTeam')}
            </Button>
          ) : null}
          {team.managementSupport === 'authorable' ? (
            <>
              <Button
                variant="secondary"
                size="small"
                data-testid="team-catalog-edit-definition"
                onClick={() => onEdit(team)}
              >
                {t('catalog.detail.editDefinition')}
              </Button>
              <Button
                variant="secondary"
                size="small"
                isLoading={deleting}
                onClick={() => onDelete(team)}
              >
                {t('catalog.detail.deleteDefinition')}
              </Button>
            </>
          ) : team.managementSupport === 'installed_readonly' ? (
            <Button
              variant="secondary"
              size="small"
              isLoading={deleting}
              onClick={() => onDelete(team)}
            >
              {t('catalog.detail.removeInstalled')}
            </Button>
          ) : null}
        </>
      ) : null}
    >
      {team ? (
        <div className="team-catalog-detail agent-surface__stack">
          <div className="team-catalog-detail__section agent-surface__section">
            <div className="team-catalog-detail__runtime-state agent-surface__row-copy">
              <strong>
                {!dispatchAvailable
                  ? t('catalog.detail.dispatchUnavailable')
                  : team.activationSupport === 'definition_only'
                  ? t('catalog.detail.definitionReady')
                  : t('catalog.detail.runtimeReady')}
              </strong>
              <span>
                {unavailableReason
                  || (team.activationSupport === 'definition_only'
                  ? t('catalog.detail.definitionRuntimeDeferred')
                  : t('catalog.detail.fixedRuntimeHint'))}
              </span>
            </div>
          </div>
          {team.workflowCount !== undefined ? (
            <div className="team-catalog-detail__section agent-surface__section">
              <span className="team-catalog-detail__label agent-surface__section-label">
                {t('catalog.detail.workflows')}
              </span>
              <div className="team-catalog-detail__summary">
                {t('catalog.detail.workflowCount', {
                  count: team.workflowCount,
                })}
              </div>
            </div>
          ) : null}
          <div className="team-catalog-detail__section agent-surface__section">
            <span className="team-catalog-detail__label agent-surface__section-label">{t('catalog.detail.lead')}</span>
            <div className="team-catalog-detail__member team-catalog-detail__member--lead agent-surface__row agent-surface__row--static">
              <AgentAvatar
                identity={`team:${team.identity.id}:lead:${team.lead.identity.id}`}
                name={lead?.displayName ?? team.lead.identity.displayName}
              />
              <div className="team-catalog-detail__member-copy agent-surface__row-copy">
                <strong>{lead?.displayName}</strong>
                <span>{lead?.description}</span>
              </div>
              <Badge variant="accent">{t('catalog.detail.lead')}</Badge>
            </div>
          </div>
          <div className="team-catalog-detail__section agent-surface__section">
            <span className="team-catalog-detail__label agent-surface__section-label">{t('catalog.detail.members')}</span>
            <div className="team-catalog-detail__members">
              {team.members.map(member => {
                const memberPresentation = localizeCatalogPresentation(
                  member.identity,
                  key => t(key),
                );
                return (
                  <div key={member.identity.id} className="team-catalog-detail__member agent-surface__row agent-surface__row--static">
                    <AgentAvatar
                      identity={`team:${team.identity.id}:member:${member.identity.id}`}
                      name={memberPresentation.displayName}
                    />
                    <div className="team-catalog-detail__member-copy agent-surface__row-copy">
                      <strong>{memberPresentation.displayName}</strong>
                      <span>{memberPresentation.description}</span>
                    </div>
                    {member.role === 'quality_gate' ? (
                      <Badge variant="success">{t('catalog.detail.qualityGate')}</Badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </GalleryDetailModal>
  );
};

export default TeamCatalogDetail;
