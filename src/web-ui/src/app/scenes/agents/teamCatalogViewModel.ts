import type {
  CapabilityCatalogResult,
  CatalogSourceError,
  TeamCatalogEntry,
} from '@/shared/services/customization';

export type TeamCatalogViewStatus =
  | 'loading'
  | 'ready'
  | 'partial'
  | 'empty'
  | 'error';

export interface TeamCatalogViewModel {
  status: TeamCatalogViewStatus;
  entries: TeamCatalogEntry[];
  errors: CatalogSourceError[];
}

export const LOADING_TEAM_CATALOG_VIEW_MODEL: TeamCatalogViewModel = {
  status: 'loading',
  entries: [],
  errors: [],
};

export function buildTeamCatalogViewModel(
  result: CapabilityCatalogResult,
): TeamCatalogViewModel {
  return {
    status: result.status,
    entries: result.entries.filter(
      (entry): entry is TeamCatalogEntry => entry.kind === 'team',
    ),
    errors: result.errors,
  };
}
