import type { Session } from '@/flow_chat/types/flow-chat';
import { SHORT_DRAMA_TEAM_CATALOG_ID } from '@/shared/services/customization/fixedTeamIds';

export function isUnifiedShortDramaTeamSession(
  session?: Pick<Session, 'activePersonaBinding'>,
): boolean {
  const binding = session?.activePersonaBinding;
  return binding?.kind === 'team_lead'
    && binding.teamDefinitionId === SHORT_DRAMA_TEAM_CATALOG_ID;
}

export function shouldBootstrapLegacyShortDramaStageAgents(
  session?: Pick<Session, 'activePersonaBinding'>,
): boolean {
  return !isUnifiedShortDramaTeamSession(session);
}
