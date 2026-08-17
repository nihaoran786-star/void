import { describe, expect, it } from 'vitest';
import { resolveSkillCatalogIcon } from './skillCatalogIcons';

describe('resolveSkillCatalogIcon', () => {
  it('keeps one stable mark per immutable skill identity', () => {
    expect(resolveSkillCatalogIcon('user::home.codex::arrange'))
      .toBe(resolveSkillCatalogIcon('user::home.codex::arrange'));
  });

  it('reads what the skill does before falling back to the identity hash', () => {
    const script = resolveSkillCatalogIcon('user::a', 'screenplay drafting');
    const review = resolveSkillCatalogIcon('user::a', 'code review');
    expect(script).not.toBe(review);

    // The runtime identity carries the same signal when the display name is
    // localized away from English.
    expect(resolveSkillCatalogIcon('user::screenplay-tool', '')).toBe(script);
  });

  it('spreads unnamed skills across the fallback pool', () => {
    const marks = new Set(
      Array.from({ length: 24 }, (_, index) =>
        resolveSkillCatalogIcon(`market::package-${index}`)),
    );
    expect(marks.size).toBeGreaterThan(3);
  });
});
