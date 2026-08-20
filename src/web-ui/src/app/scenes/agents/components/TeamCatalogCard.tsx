import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  localizeCatalogPresentation,
  type TeamCatalogEntry,
} from '@/shared/services/customization';
import AgentTeamCard from './AgentTeamCard';

interface TeamCatalogCardProps {
  team: TeamCatalogEntry;
  index: number;
  onOpen: (team: TeamCatalogEntry) => void;
  onDispatch?: (team: TeamCatalogEntry) => void;
  dispatching?: boolean;
}

const TeamCatalogCard: React.FC<TeamCatalogCardProps> = ({
  team,
  index,
  onOpen,
  onDispatch,
  dispatching = false,
}) => {
  const { t } = useTranslation('scenes/agents');
  const presentation = localizeCatalogPresentation(team.identity, key => t(key));
  const lead = localizeCatalogPresentation(team.lead.identity, key => t(key));
  const tagNames = team.tags
    .filter(tag => tag !== 'team_definition')
    .map(tag => (
      [
        'code_review',
        'parallel_review',
        'quality_gate',
        'ai_short_drama',
        'video_production',
        'five_stage_workflow',
      ].includes(tag)
        ? t(`catalog.tags.${tag}`)
        : tag
    ));
  if (team.activationSupport === 'definition_only') {
    tagNames.unshift(t('catalog.tags.definition_only'));
  }
  const memberNames = team.members.map(member => (
    localizeCatalogPresentation(member.identity, key => t(key)).displayName
  ));
  return (
    <AgentTeamCard
      index={index}
      title={presentation.displayName}
      subtitle={presentation.description}
      roleName={lead.displayName}
      tagNames={tagNames}
      avatarIdentity={`team:${team.source.adapterId}:${team.identity.id}`}
      avatarName={presentation.displayName}
      onOpen={() => onOpen(team)}
      onDispatch={onDispatch ? () => onDispatch(team) : undefined}
      dispatchLabel={t('catalog.detail.dispatchTask')}
      dispatchAriaLabel={t('agentCard.actions.dispatchNamed', {
        name: presentation.displayName,
      })}
      dispatching={dispatching}
      memberNames={memberNames}
      memberCountLabel={memberNames.length > 0
        ? t('catalog.detail.memberCount', { count: memberNames.length })
        : undefined}
      statusLabel={dispatching
        ? t('agentCard.status.running')
        : t('agentCard.status.idle')}
    />
  );
};

export default TeamCatalogCard;
