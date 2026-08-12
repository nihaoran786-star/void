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

  it('presents the catalog as quiet hairline rows instead of card grids', () => {
    expect(minimalStyles).toContain("[data-customization-market='skills']");
    expect(minimalStyles).not.toContain('@include market.grid;');
    expect(minimalStyles).not.toContain('@include market.card;');
    expect(minimalStyles).not.toContain('market.two-column-grid');
    expect(minimalStyles).not.toContain('market.one-column-grid');
    expect(minimalStyles).toContain('@container skills-market (max-width: 900px)');
    expect(minimalStyles).toContain('@container skills-market (max-width: 560px)');
    expect(minimalStyles).toMatch(
      /\.skills-main__grid,[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/,
    );
    expect(minimalStyles).toMatch(
      /\.skills-card,[\s\S]*?\.skill-card \{[\s\S]*?flex-direction: row;[\s\S]*?border-top: 1px solid var\(--workspace-border-subtle\);/,
    );
    expect(marketContract).toContain('$desktop-grid-columns: 4;');
  });

  it('uses deterministic static sigil runes instead of keyword-mapped icons', () => {
    const sceneSource = readSource('./SkillsScene.tsx');
    const avatar = readSource('./components/SkillCatalogAvatar.tsx');
    const avatarStyles = readSource('./components/SkillCatalogAvatar.scss');
    const sigil = readSource('./components/skillSigil.ts');

    expect(avatar).toContain('resolveSigilCells');
    expect(avatar).toContain('<svg');
    expect(avatar).toContain('fill="currentColor"');
    expect(avatar).not.toContain('CatalogIconAvatar');
    expect(avatar).not.toContain('resolveSkillCatalogIcon');
    expect(sigil).toContain('SIGIL_GRID_SIZE = 4');
    expect(sigil).toContain('sigil:');
    expect(avatarStyles).toContain(
      'transition: opacity var(--workspace-motion-fast) var(--workspace-easing-standard);',
    );
    expect(avatarStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(avatarStyles).toContain('.gallery-detail-modal__icon:has(.skill-sigil)');
    expect(sceneSource).not.toContain('resolveSkillCatalogIcon');
    expect(sceneSource).not.toContain('getCardGradient');
    expect(sceneSource).toContain('icon={<SkillCatalogAvatar');
    expect(minimalStyles).toMatch(
      /\.skills-card__avatar,[\s\S]*?\.skill-card__avatar \{[\s\S]*?width: 20px;[\s\S]*?height: 20px;/,
    );
    expect(minimalStyles).toContain('opacity: 0.28;');
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

  it('collects row actions into hover and keeps meta as plain monospace text', () => {
    expect(marketContract).toContain('$card-height: 160px;');
    expect(minimalStyles).toContain('.skills-card__avatar,');
    expect(minimalStyles).toContain('.skill-card__avatar');
    expect(minimalStyles).toMatch(
      /\.skills-card__actions \{[\s\S]*?opacity: 0;/,
    );
    expect(minimalStyles).toMatch(
      /\.skills-card:hover \.skills-card__actions,[\s\S]*?opacity: 1;/,
    );
    expect(minimalStyles).toMatch(
      /\.skills-filter-bar__item \{[\s\S]*?background: transparent;[\s\S]*?border: 0;/,
    );
    expect(minimalStyles).toMatch(
      /&\.is-active::before \{[\s\S]*?background: var\(--workspace-accent\);/,
    );
    expect(styles).toContain('-webkit-line-clamp: 2;');
    expect(styles).toContain('.skill-card__footer');
    expect(styles).toContain('border-top: 0;');
    expect(styles).toContain('.skill-card__action-btn');
    expect(styles).toContain('flex: 0 0 28px;');
    expect(minimalStyles).toContain('font-family: var(--font-family-mono);');
    expect(minimalStyles).not.toContain('font-family: ui-monospace');
    expect(minimalStyles).toMatch(
      /@media \(hover: none\)[\s\S]*?\.skills-card__actions,[\s\S]*?\.skill-card__actions \{[\s\S]*?opacity: 1;/,
    );
  });

  it('honors the existing reduced-motion and token contracts', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(styles).not.toMatch(/transition\s*:\s*all/i);
  });
});
