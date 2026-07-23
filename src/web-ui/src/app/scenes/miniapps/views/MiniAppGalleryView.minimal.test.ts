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

describe('Mini App gallery Minimal presentation contract', () => {
  const source = readSource('./MiniAppGalleryView.minimal.scss');

  it('loads once through the lazy Mini App feature stylesheet', () => {
    const owner = readSource('./MiniAppGalleryView.scss');

    expect(owner.match(/@use '\.\/MiniAppGalleryView\.minimal' as minimal;/g)).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(readSource('../../../presentation/minimalWorkspacePresentation.scss'))
      .not.toContain('MiniAppGalleryView.minimal.scss');
  });

  it('keeps stores, API adapters, cards, and customization behavior unchanged', () => {
    expect(sha256('../miniAppStore.ts')).toBe(
      '79ff1eabd2a4841ab3034a3dab40de0b98590bb3eb806e4c1901de2c515f632f',
    );
    expect(sha256('../components/MiniAppCard.tsx')).toBe(
      '83495e9e8b55c2a4d1e535339f00a2b35dc8063b40e828a11cf0ef56f263fa11',
    );
    expect(sha256('../customization/MiniAppCustomizePanel.tsx')).toBe(
      '74abcd68e6d73be2570da3f542902012ec2dfc604e1137282200a9a43d6f6387',
    );
  });

  it('scopes all presentation changes to the Minimal Mini App gallery', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .miniapp-gallery {');
    expect(source).not.toMatch(/\n {2}\.(?:miniapp-card|gallery-page-header)/);
  });

  it('uses one compact header with icon-first search and import actions', () => {
    expect(source).toMatch(
      /\.gallery-page-header \{[\s\S]*?min-height: 52px;[\s\S]*?flex-direction: row;[\s\S]*?flex-wrap: nowrap;/,
    );
    expect(source).toMatch(
      /\.gallery-page-header__subtitle \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /\.gallery-page-header__actions \.search \{[\s\S]*?width: var\(--workspace-icon-target\);/,
    );
    expect(source).toMatch(
      /&:focus-within \{[\s\S]*?width: 220px;/,
    );
    expect(readSource('./MiniAppGalleryView.tsx')).toContain(
      'className="gallery-search-btn"',
    );
  });

  it('compresses empty state, categories, and cards without removing detail access', () => {
    expect(source).toContain('.gallery-zone:has(.gallery-run-empty)');
    expect(source).toContain('content-visibility: auto;');
    expect(source).toContain('contain-intrinsic-size: auto 180px;');
    expect(source).toContain('overscroll-behavior-inline: contain;');
    expect(source).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 252px), 1fr));',
    );
    expect(source).toMatch(
      /\.miniapp-card \{[\s\S]*?height: 132px;[\s\S]*?min-height: 132px;/,
    );
    expect(source).toMatch(
      /\.miniapp-card__desc-inner \{[\s\S]*?white-space: nowrap;[\s\S]*?text-overflow: ellipsis;/,
    );
  });

  it('uses tokenized, single-ring feedback with no decorative effects', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(source).not.toMatch(/\b(?:translate|scale)\s*\(/i);
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline: 1px solid var\(--workspace-focus-ring-subtle\);[\s\S]*?outline-offset: -1px;[\s\S]*?box-shadow: none;/,
    );
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('localizes known catalog categories without changing category identities', () => {
    const simplifiedChinese = JSON.parse(
      readSource('../../../../locales/zh-CN/scenes/miniapp.json'),
    ) as { categories: Record<string, string> };
    const traditionalChinese = JSON.parse(
      readSource('../../../../locales/zh-TW/scenes/miniapp.json'),
    ) as { categories: Record<string, string> };

    expect(simplifiedChinese.categories).toEqual({
      design: '设计',
      developer: '开发',
      game: '游戏',
      lifestyle: '生活',
    });
    expect(traditionalChinese.categories.developer).toBe('開發');
    expect(readSource('./MiniAppGalleryView.tsx')).toContain(
      'categoryLabels[category] ?? category',
    );
  });
});
