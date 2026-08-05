import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Skills market presentation contract', () => {
  const scene = readSource('./SkillsScene.tsx');
  const styles = readSource('./SkillsScene.scss');
  const minimalStyles = readSource('./SkillsScene.minimal.scss');
  const marketContract = readSource('../../../component-library/styles/customization-market.scss');
  const marketCard = readSource('./components/SkillCard.tsx');

  it('keeps skills in one standalone scene without duplicate customization navigation', () => {
    expect(scene).not.toContain('CustomizationTopNav');
    expect(scene).not.toContain('skills-discover__hero');
    expect(scene).not.toContain('skills-sidebar');
    expect(scene).toContain('className="skills-filter-bar"');
    expect(scene).toContain("className=\"skills-discover__toolbar\"");
  });

  it('uses twenty items per page for a dense five-row desktop catalog', () => {
    expect(scene).toContain('const SKILLS_PAGE_SIZE = 20;');
    expect(scene).toContain('pageSize: SKILLS_PAGE_SIZE,');
    expect(scene.match(/Array\.from\(\{ length: SKILLS_PAGE_SIZE \}\)/g)).toHaveLength(3);
    expect(scene).toContain('setInstalledListPage(0);');
    expect(scene).toContain('Math.min(p, Math.max(0, installedTotalPages - 1))');
  });

  it('uses a four, two, one column responsive market grid', () => {
    expect(minimalStyles).toContain("[data-customization-market='skills']");
    expect(minimalStyles).toContain('@include market.grid;');
    expect(minimalStyles).toContain('@container skills-market (max-width: 900px)');
    expect(minimalStyles).toContain('@include market.two-column-grid;');
    expect(minimalStyles).toContain('@container skills-market (max-width: 560px)');
    expect(minimalStyles).toContain('@include market.one-column-grid;');
    expect(marketContract).toContain('$desktop-grid-columns: 4;');
  });

  it('searches both localized presentation and stable raw skill identity', () => {
    const installedHook = readSource('./hooks/useInstalledSkills.ts');
    expect(installedHook).toContain('presentation.displayName');
    expect(installedHook).toContain('presentation.description');
    expect(installedHook).toContain('...presentation.aliases');
    expect(installedHook).toContain('skill.name');
    expect(installedHook).toContain('skill.key');
    expect(installedHook).toContain('skill.sourceSlot');
  });

  it('keeps raw paths out of market cards and exposes selection state', () => {
    expect(scene).not.toContain('className="skills-card__path"');
    expect(scene).toContain('role="tablist"');
    expect(scene).toContain("aria-selected={activeTab === 'installed'}");
    expect(scene).toContain("aria-selected={activeTab === 'discover'}");
    expect(scene).toContain('aria-pressed={installedFilter === cat.id}');
    expect(scene).toContain('aria-expanded={isAddFormOpen}');
    expect(scene).toContain("variant={skill.level === 'project' ? 'purple' : 'info'}");
    expect(scene).toContain('{skill.isShadowed && (');
  });

  it('renders retryable skill failures as alerts', () => {
    expect(scene).toContain('className="skills-main__empty skills-main__empty--error" role="alert"');
    expect(scene).toContain('onClick={() => void installed.loadSkills(true)}');
    expect(scene).toContain('className="skills-discover__empty skills-discover__empty--error" role="alert"');
    expect(scene).toContain('onClick={() => void market.refresh()}');
  });

  it('keeps card actions as sibling native buttons inside semantic articles', () => {
    expect(scene).toContain('<article');
    expect(scene).toContain('className="skills-card__detail"');
    expect(scene).not.toContain('role="button"');
    expect(marketCard).toContain('<article');
    expect(marketCard).toContain('className="skill-card__detail-btn"');
    expect(marketCard).not.toContain('tabIndex={0}');
    expect(marketCard).not.toContain('onClick={openDetails}');
  });

  it('uses compact icon-forward cards without a heavy market footer rail', () => {
    expect(minimalStyles).toContain('@include market.card;');
    expect(marketContract).toContain('$card-height: 160px;');
    expect(minimalStyles).toContain('.skills-card__avatar,');
    expect(minimalStyles).toContain('.skill-card__avatar');
    expect(minimalStyles).toContain('width: 52px;');
    expect(styles).toContain('-webkit-line-clamp: 2;');
    expect(styles).toContain('.skill-card__footer');
    expect(styles).toContain('border-top: 0;');
    expect(styles).toContain('.skill-card__action-btn');
    expect(styles).toContain('flex: 0 0 28px;');
  });

  it('honors the existing reduced-motion and token contracts', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(styles).not.toMatch(/transition\s*:\s*all/i);
  });
});
