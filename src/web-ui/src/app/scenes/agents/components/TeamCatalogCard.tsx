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
}

const TeamCatalogCard: React.FC<TeamCatalogCardProps> = ({ team, index, onOpen }) => {
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
  return (
    <AgentTeamCard
      index={index}
      title={presentation.displayName}
      subtitle={presentation.description}
      roleName={lead.displayName}
      tagNames={tagNames}
      onOpen={() => onOpen(team)}
    />
  );
};

export default TeamCatalogCard;
