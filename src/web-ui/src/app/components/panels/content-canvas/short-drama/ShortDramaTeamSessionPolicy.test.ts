import { describe, expect, it } from 'vitest';
import { SHORT_DRAMA_TEAM_CATALOG_ID } from '@/shared/services/customization/fixedTeamIds';
import {
  isUnifiedShortDramaTeamSession,
  shouldBootstrapLegacyShortDramaStageAgents,
} from './ShortDramaTeamSessionPolicy';

describe('ShortDramaTeamSessionPolicy', () => {
  it('disables the legacy five-session bootstrap for the durable short-drama Team', () => {
    const session = {
      activePersonaBinding: {
        kind: 'team_lead' as const,
        personaId: 'member-lead',
        personaRevision: { status: 'known' as const, value: 'revision:lead' },
        teamDefinitionId: SHORT_DRAMA_TEAM_CATALOG_ID,
        teamInstanceId: 'team-instance',
      },
    };

    expect(isUnifiedShortDramaTeamSession(session)).toBe(true);
    expect(shouldBootstrapLegacyShortDramaStageAgents(session)).toBe(false);
  });

  it('keeps legacy Media sessions compatible when no Team is bound', () => {
    expect(shouldBootstrapLegacyShortDramaStageAgents({
      activePersonaBinding: null,
    })).toBe(true);
  });
});
