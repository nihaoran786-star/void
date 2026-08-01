import { describe, expect, it } from 'vitest';
import {
  Clapperboard,
  LayoutGrid,
  Network,
  Package,
  Table2,
} from 'lucide-react';
import { resolveSkillCatalogIcon } from './skillCatalogIcons';

describe('resolveSkillCatalogIcon', () => {
  it('uses the immutable skill identity to select a meaningful icon', () => {
    expect(resolveSkillCatalogIcon('user::home.codex::arrange')).toBe(LayoutGrid);
    expect(resolveSkillCatalogIcon('user::home.codex::agent-app-architecture')).toBe(Network);
    expect(resolveSkillCatalogIcon('builtin::xlsx')).toBe(Table2);
    expect(resolveSkillCatalogIcon('builtin::short-drama-character-board')).toBe(Clapperboard);
  });

  it('keeps an explicit marketplace fallback for unknown packages', () => {
    expect(resolveSkillCatalogIcon('market::unknown-package', '未知能力', 'market')).toBe(Package);
  });
});
