import type {
  CapabilityCatalogEntry,
  CapabilityCatalogQuery,
  CapabilityCatalogResult,
  CapabilityCatalogSource,
  CatalogSourceError,
  CatalogSourceState,
} from './types';

function entryKey(entry: CapabilityCatalogEntry): string {
  return [
    entry.kind,
    entry.identity.id,
    entry.source.adapterId,
    entry.source.recordType,
    entry.source.recordId,
  ].join('::');
}

function errorFromUnknown(sourceId: string, error: unknown): CatalogSourceError {
  return {
    sourceId,
    code: 'catalog_source_load_failed',
    message: error instanceof Error && error.message
      ? error.message
      : 'catalog.errors.catalog_source_load_failed',
  };
}

function matchesQuery(entry: CapabilityCatalogEntry, query: CapabilityCatalogQuery): boolean {
  if (query.kinds?.length && !query.kinds.includes(entry.kind)) return false;
  if (query.scenario && !entry.scenarioEligibility.includes(query.scenario)) return false;
  if (
    query.executionPolicy
    && entry.kind === 'agent'
    && entry.executionPolicyEligibility.length > 0
    && !entry.executionPolicyEligibility.includes(query.executionPolicy)
  ) {
    return false;
  }
  const search = query.search?.trim().toLocaleLowerCase();
  if (!search) return true;
  return [
    entry.identity.displayName,
    entry.identity.description,
    ...entry.identity.aliases,
    ...entry.tags,
  ].some(value => value.toLocaleLowerCase().includes(search));
}

export class CapabilityCatalogService {
  constructor(private readonly sources: CapabilityCatalogSource[]) {}

  async list(query: CapabilityCatalogQuery = {}): Promise<CapabilityCatalogResult> {
    const settled = await Promise.allSettled(
      this.sources.map(source => source.load({ workspacePath: query.workspacePath })),
    );
    const entries = new Map<string, CapabilityCatalogEntry>();
    const sources: CatalogSourceState[] = [];
    const errors: CatalogSourceError[] = [];

    settled.forEach((result, index) => {
      const sourceId = this.sources[index].sourceId;
      if (result.status === 'rejected') {
        const error = errorFromUnknown(sourceId, result.reason);
        errors.push(error);
        sources.push({ sourceId, status: 'error', entryCount: 0, error });
        return;
      }
      const snapshot = result.value;
      snapshot.entries.forEach(entry => {
        const key = entryKey(entry);
        if (!entries.has(key)) entries.set(key, entry);
      });
      errors.push(...snapshot.errors);
      sources.push({
        sourceId,
        status: snapshot.status,
        entryCount: snapshot.entries.length,
        error: snapshot.errors[0],
      });
    });

    const filteredEntries = Array.from(entries.values()).filter(entry => matchesQuery(entry, query));
    const hasFailure = sources.some(source => source.status !== 'ready');
    const allFailed = sources.length > 0 && sources.every(source => source.status === 'error');
    const status: CapabilityCatalogResult['status'] = allFailed
      ? 'error'
      : hasFailure
        ? 'partial'
        : filteredEntries.length === 0
          ? 'empty'
          : 'ready';
    return { status, entries: filteredEntries, sources, errors };
  }
}
