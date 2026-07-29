import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentWorkspace } from '@/infrastructure/contexts/WorkspaceContext';
import {
  CapabilityCatalogService,
  DeepReviewTeamAdapter,
  ExistingTeamCatalogAdapter,
  ShortDramaTeamAdapter,
} from '@/shared/services/customization';
import { useAgentsStore } from '../agentsStore';
import {
  buildTeamCatalogViewModel,
  LOADING_TEAM_CATALOG_VIEW_MODEL,
  type TeamCatalogViewModel,
} from '../teamCatalogViewModel';

const defaultTeamCatalogService = new CapabilityCatalogService([
  new DeepReviewTeamAdapter(),
  new ShortDramaTeamAdapter(),
  new ExistingTeamCatalogAdapter(),
]);

export interface UseTeamCatalogResult extends TeamCatalogViewModel {
  reload: () => Promise<void>;
}

export function useTeamCatalog(
  service: CapabilityCatalogService = defaultTeamCatalogService,
): UseTeamCatalogResult {
  const { workspacePath } = useCurrentWorkspace();
  const catalogRefreshRevision = useAgentsStore(
    state => state.catalogRefreshRevision,
  );
  const requestIdRef = useRef(0);
  const [viewModel, setViewModel] = useState<TeamCatalogViewModel>(
    LOADING_TEAM_CATALOG_VIEW_MODEL,
  );

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setViewModel(LOADING_TEAM_CATALOG_VIEW_MODEL);
    const result = await service.list({
      kinds: ['team'],
      workspacePath: workspacePath || undefined,
    });
    if (requestId === requestIdRef.current) {
      setViewModel(buildTeamCatalogViewModel(result));
    }
  }, [service, workspacePath]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [catalogRefreshRevision, reload]);

  return { ...viewModel, reload };
}
