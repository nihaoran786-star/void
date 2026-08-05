import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import { localizeCatalogPresentation } from '@/shared/services/customization';
import { useCurrentSessionTitle } from './useCurrentSessionTitle';

type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface SessionTabSubtitleInput {
  sessionTitle: string;
  draftStatus: ReturnType<typeof useSessionModeStore.getState>['draftStatus'];
  draftPersonaTarget: ReturnType<typeof useSessionModeStore.getState>['draftPersonaTarget'];
  tCommon: Translate;
  tAgents: Translate;
}

/**
 * Presentation-only adapter for the session tab subtitle.
 * Persisted session titles remain authoritative; an unpersisted market draft
 * may temporarily identify its selected employee until the first send.
 */
export function resolveSessionTabSubtitle({
  sessionTitle,
  draftStatus,
  draftPersonaTarget,
  tCommon,
  tAgents,
}: SessionTabSubtitleInput): string {
  if (sessionTitle) return sessionTitle;
  if (draftStatus === 'idle' || !draftPersonaTarget) return '';

  const name = localizeCatalogPresentation(
    draftPersonaTarget.identity,
    key => tAgents(key),
  ).displayName;
  return tCommon('sceneTabs.personaDraftTitle', { name });
}

export function useSessionTabSubtitle(): string {
  const sessionTitle = useCurrentSessionTitle();
  const draftStatus = useSessionModeStore(state => state.draftStatus);
  const draftPersonaTarget = useSessionModeStore(state => state.draftPersonaTarget);
  const { t: tCommon } = useTranslation('common');
  const { t: tAgents } = useTranslation('scenes/agents');

  return useMemo(() => resolveSessionTabSubtitle({
    sessionTitle,
    draftStatus,
    draftPersonaTarget,
    tCommon,
    tAgents,
  }), [
    draftPersonaTarget,
    draftStatus,
    sessionTitle,
    tAgents,
    tCommon,
  ]);
}
