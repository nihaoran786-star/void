import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

const sha256 = (relativePath: string): string =>
  createHash('sha256').update(readFileSync(pathFor(relativePath))).digest('hex');

const sha256Text = (source: string): string =>
  createHash('sha256').update(source).digest('hex');

describe('Skills scene Minimal presentation contract', () => {
  const source = readSource('./SkillsScene.minimal.scss');

  it('loads once through the lazy Skills feature stylesheet', () => {
    const owner = readSource('./SkillsScene.scss');

    expect(owner.match(/@use '\.\/SkillsScene\.minimal' as minimal;/g)).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(readSource('../../presentation/minimalWorkspacePresentation.scss'))
      .not.toContain('SkillsScene.minimal.scss');
  });

  it('locks Skills behavior and Classic rules after authoring integration', () => {
    const projectionFreeClassic = readSource('./SkillsScene.scss')
      .replace("@use './SkillsScene.minimal' as minimal;\n", '')
      .replace('\n\n@include minimal.styles;\n', '\n');

    expect(sha256Text(projectionFreeClassic)).toBe(
      'c51d07eb44408dcc57fa2cf6bb0c2c5c575c1dfce5be205b4ced1443a5d39419',
    );
    expect(sha256('./SkillsScene.tsx')).toBe(
      'a973cf2b21592fa11d9686dcb1e3dc86c4e21aabbd7aff9c54f16a97582f3b7b',
    );
    expect(sha256('./components/SkillCard.scss')).toBe(
      '25fb225b1eb44e976633027a12369c676717b545f760fc51b94b835de6e73c49',
    );
    expect(sha256('./components/SkillCard.tsx')).toBe(
      'cdd00c65090c83f2faafb9159de2f71de38bc2aa74413f67d4db79084e4c1cf5',
    );
    expect(sha256('./components/SkillsSuiteView.tsx')).toBe(
      '884a63570913c1fece911a38713cab92f2e410c4cf6fa710974d32b9fb661a82',
    );
  });

  it('scopes all changes to the Minimal Skills scene', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .void-skills-scene {');
    expect(source).not.toMatch(/\n {2}\.(?:skills|skill-card)/);
  });

  it('uses one compact responsive geometry across installed, suite, and market cards', () => {
    expect(source.match(
      /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\);/g,
    )).toHaveLength(4);
    expect(source).toMatch(
      /\.skills-card \{[\s\S]*?box-sizing: border-box;[\s\S]*?height: 104px;[\s\S]*?min-height: 104px;/,
    );
    expect(source).toMatch(
      /\.skill-card \{[\s\S]*?box-sizing: border-box;[\s\S]*?height: 104px;[\s\S]*?min-height: 104px;/,
    );
    expect(source).toMatch(
      /\.skills-suite__group-card \{[\s\S]*?height: 160px;[\s\S]*?min-height: 160px;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.skills-suite__group-card \{[\s\S]*?height: auto;[\s\S]*?min-height: 0;/,
    );
    expect(source).toContain('@media (max-width: 520px)');
    expect(source).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?grid-template-columns: 1fr;/,
    );
    expect(source).toContain('container-name: skills-main;');
    expect(source).toMatch(
      /@container skills-main \(max-width: 520px\)[\s\S]*?flex: 1 0 100%;[\s\S]*?flex: 1 1 calc\(50% - var\(--workspace-space-1\)\);/,
    );
  });

  it('uses a compact responsive tab header without decorative imagery', () => {
    expect(source).toMatch(
      /\.skills-tabs-bar \{[\s\S]*?position: sticky;[\s\S]*?min-height: 48px;[\s\S]*?border-bottom: 1px solid var\(--workspace-border-subtle\);[\s\S]*?background-color: var\(--workspace-surface-canvas\);/,
    );
    expect(source).toMatch(
      /\.skills-tabs-bar__tabs \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
    );
    expect(source).toMatch(
      /\.skills-tabs-bar__tab \{[\s\S]*?&::after \{[\s\S]*?opacity: 0;[\s\S]*?&\.is-active \{[\s\S]*?opacity: 1;/,
    );
    expect(source).not.toContain('/visuals/void-skills-hero.webp');
    expect(source).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.skills-tabs-bar \{[\s\S]*?min-height: 48px;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.skills-tabs-bar \{[\s\S]*?min-height: 44px;/,
    );
  });

  it('keeps installed and market search controls compact on wide layouts', () => {
    expect(source).toMatch(
      /\.skills-main__toolbar-search \{[\s\S]*?flex: 0 1 360px;[\s\S]*?margin-right: auto;/,
    );
    expect(source).toMatch(
      /\.skills-discover__hero-content \{[\s\S]*?grid-template-columns: minmax\(160px, 1fr\) minmax\(220px, 360px\);/,
    );
    expect(source).toMatch(
      /@container skills-main \(max-width: 520px\)[\s\S]*?\.skills-main__toolbar-search \{[\s\S]*?flex: 1 0 100%;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?grid-template-areas:[\s\S]*?'search';/,
    );
  });

  it('removes decorative rendering cost while preserving semantic states', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(
      [...source.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/gi)]
        .map((match) => match[1].trim()),
    ).toEqual(['none']);
    expect(source).toContain('&.is-enabled {');
    expect(source).toContain('background: var(--workspace-status-success-bg);');
    expect(source).toContain('&.is-dirty {');
    expect(source).toContain('border-color: var(--workspace-status-info-border);');
    expect(source.match(/content-visibility: auto;/g)).toHaveLength(2);
    expect(source.match(/contain-intrinsic-block-size: 104px;/g)).toHaveLength(2);
  });

  it('keeps compact cards readable while collapsing the redundant details label', () => {
    expect(source).toMatch(
      /\.skills-card__desc \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/,
    );
    expect(source).toMatch(
      /\.skills-card__actions \{[\s\S]*?grid-row: 2;[\s\S]*?flex-direction: row;/,
    );
    expect(source).toMatch(
      /\.skills-card__actions \{[\s\S]*?\.btn \{[\s\S]*?span \{[\s\S]*?clip: rect\(0 0 0 0\);/,
    );
    expect(source).toMatch(
      /@media \(hover: hover\)[\s\S]*?\.skills-card__actions \{[\s\S]*?opacity: 0;[\s\S]*?\.skills-card__path \{[\s\S]*?opacity: 0;[\s\S]*?\.skills-card:focus-within \.skills-card__path/,
    );
    expect(source).toMatch(
      /@container skills-main \(max-width: 240px\)[\s\S]*?\.skills-card__top > \.badge \{[\s\S]*?font-size: 0;/,
    );
    expect(source).toMatch(
      /@container skills-main \(max-width: 240px\)[\s\S]*?\.skills-card__actions:has\(\.skills-card__delete\) > \.btn \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /@container skills-main \(max-width: 240px\)[\s\S]*?\.skills-card__delete \{[\s\S]*?flex: 0 0 var\(--workspace-icon-target\);[\s\S]*?min-width: var\(--workspace-icon-target\);/,
    );
  });

  it('uses short tokenized feedback without lift, bounce, or stagger', () => {
    expect(source).toContain(
      'background-color var(--workspace-motion-fast) var(--workspace-easing-standard)',
    );
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).not.toMatch(/transition\s*:[^;]*(?:width|height|padding|margin)/i);
    expect(source).not.toMatch(/\bscale\s*\(/i);
    const transforms = [...source.matchAll(/\btransform:\s*([^;]+);/gi)]
      .map((match) => match[1].trim());
    expect(transforms.every((value) => value === 'none')).toBe(true);
  });

  it('keeps a single visible focus ring and honors reduced motion', () => {
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?outline-offset: -2px;[\s\S]*?box-shadow: none;/,
    );
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;[\s\S]*?transition: none;/,
    );
  });

  it('exposes visual selection and dialog state to assistive technology', () => {
    const scene = readSource('./SkillsScene.tsx');

    expect(scene).toContain('role="group"');
    expect(scene).toContain("aria-label={t('nav.title')}");
    expect(scene).toContain("aria-label={t('installed.titleAll')}");
    expect(scene).toContain("aria-pressed={activeTab === 'installed'}");
    expect(scene).toContain("aria-pressed={activeTab === 'discover'}");
    expect(scene).toContain('aria-pressed={installedFilter === cat.id}');
    expect(scene).toContain('aria-pressed={hideDuplicates}');
    expect(scene).toContain('aria-expanded={isAddFormOpen}');
    expect(scene).toContain('aria-haspopup="dialog"');
  });
});
