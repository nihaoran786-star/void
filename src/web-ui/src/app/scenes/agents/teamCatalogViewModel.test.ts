import { describe, expect, it } from 'vitest';
import { createShortDramaTeamCatalogEntry } from '@/shared/services/customization';
import {
  buildTeamCatalogViewModel,
  LOADING_TEAM_CATALOG_VIEW_MODEL,
} from './teamCatalogViewModel';

const team = createShortDramaTeamCatalogEntry();

describe('teamCatalogViewModel', () => {
  it('保留 loading/ready/partial/empty/error 五种显式状态', () => {
    expect(LOADING_TEAM_CATALOG_VIEW_MODEL.status).toBe('loading');

    for (const status of ['ready', 'partial', 'empty', 'error'] as const) {
      const entries = status === 'ready' || status === 'partial' ? [team] : [];
      const errors = status === 'partial' || status === 'error'
        ? [{ sourceId: 'source', code: 'failed', message: 'failed' }]
        : [];
      const result = buildTeamCatalogViewModel({
        status,
        entries,
        sources: [],
        errors,
      });
      expect(result.status).toBe(status);
      expect(result.entries).toEqual(entries);
      expect(result.errors).toEqual(errors);
    }
  });

  it('partial 即使有错误也继续展示成功加载的团队', () => {
    const model = buildTeamCatalogViewModel({
      status: 'partial',
      entries: [team],
      sources: [],
      errors: [{ sourceId: 'review', code: 'failed', message: 'failed' }],
    });
    expect(model.entries).toHaveLength(1);
    expect(model.errors).toHaveLength(1);
  });
});
