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

  it('keeps skills in one standalone scene without duplicate customization navigation', () => {
    expect(scene).not.toContain('CustomizationTopNav');
    expect(scene).not.toContain('skills-discover__hero');
    expect(scene).not.toContain('skills-sidebar');
    expect(scene).toContain('className="skills-filter-bar"');
    expect(scene).toContain("className=\"skills-discover__toolbar\"");
  });

  it('uses eight items per page for installed and market skills', () => {
    expect(scene).toContain('const INSTALLED_PAGE_SIZE = 8;');
    expect(scene).toContain('pageSize: 8,');
    expect(scene.match(/Array\.from\(\{ length: 8 \}\)/g)).toHaveLength(3);
    expect(scene).toContain('setInstalledListPage(0);');
    expect(scene).toContain('Math.min(p, Math.max(0, installedTotalPages - 1))');
  });

  it('uses a four, two, one column responsive market grid', () => {
    expect(styles).toContain('.void-ui--minimal .void-skills-scene');
    expect(styles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(styles).toContain('@container skills-market (max-width: 900px)');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain('@container skills-market (max-width: 560px)');
    expect(styles).toContain('grid-template-columns: 1fr;');
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
    expect(scene).toContain("aria-pressed={activeTab === 'installed'}");
    expect(scene).toContain("aria-pressed={activeTab === 'discover'}");
    expect(scene).toContain('aria-pressed={installedFilter === cat.id}');
    expect(scene).toContain('aria-expanded={isAddFormOpen}');
  });

  it('honors the existing reduced-motion and token contracts', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(styles).not.toMatch(/transition\s*:\s*all/i);
  });
});
