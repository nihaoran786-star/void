import { describe, expect, it } from 'vitest';
import {
  readSourceText,
  sha256SourceText,
  sha256Text,
} from '@/test-utils/sourceText';

const pathFor = (relativePath: string): URL =>
  new URL(relativePath, import.meta.url);

const readSource = (relativePath: string): string =>
  readSourceText(pathFor(relativePath));

const sha256 = (relativePath: string): string =>
  sha256SourceText(pathFor(relativePath));

describe('Gallery card Minimal presentation contract', () => {
  const source = readSource('./GalleryCards.minimal.scss');

  it('loads once through the Minimal presentation aggregator', () => {
    const aggregator = readSource('../../presentation/minimalWorkspacePresentation.scss');

    expect(aggregator.match(/GalleryCards\.minimal\.scss/g)).toHaveLength(1);
    expect(aggregator.match(/@include gallery-cards\.styles;/g)).toHaveLength(1);
  });

  it('keeps feature-owned Classic card styles byte-identical', () => {
    expect(sha256('../../scenes/agents/components/AgentCard.scss')).toBe(
      '6599a356206babc533555dd37ae0a2cb35c3424b1f782063eaeff71116b6ca16',
    );
    expect(sha256('../../scenes/agents/components/CoreAgentCard.scss')).toBe(
      'bd69497c68a84952d306e61d35c9451f1ce8ddbf496b400c41989d2ab12059d0',
    );
    expect(sha256('../../scenes/agents/components/AgentTeamCard.scss')).toBe(
      '8cdda2f8624f651b88aec2940f1c09fcd616227e1118740cdb20753ae9c55794',
    );
    expect(sha256('../../scenes/miniapps/components/MiniAppCard.scss')).toBe(
      '83981cdb46cef7e718a52b740e972ef74881037b514189494b6afb910929768e',
    );
    const projectionFreeNursery = readSource('../../scenes/profile/views/NurseryView.scss')
      .replace("@use './NurseryView.minimal' as minimal;\n", '')
      .replace('\n\n@include minimal.styles;\n', '\n');
    expect(sha256Text(projectionFreeNursery)).toBe(
      '0a4ff738e71becc5f98d32504fb79015376e203c95f87c14b9330e0cf4e5e777',
    );
  });

  it('scopes every card projection to Minimal GalleryLayout', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .gallery-layout {');
    expect(source).not.toMatch(/\n {2}\.(?:agent|core|miniapp|assistant|nursery)-/);
  });

  it('uses a compact responsive grid and consistent card geometry', () => {
    expect(source).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 288px), 1fr));',
    );
    expect(source).toMatch(
      /\.gallery-grid--skeleton \{[\s\S]*?grid-template-columns: repeat\([\s\S]*?auto-fill,[\s\S]*?var\(--gallery-grid-min, 288px\)/,
    );
    expect(source).toMatch(
      /\.agent-card,[\s\S]*?\.assistant-card \{[\s\S]*?width: 100%;[\s\S]*?box-sizing: border-box;[\s\S]*?height: 164px;[\s\S]*?min-height: 164px;/,
    );
    expect(source).toContain('@media (max-width: 520px)');
    expect(source).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?grid-template-columns: 1fr;/,
    );
  });

  it('removes costly decorative effects while preserving semantic state dots', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(
      [...source.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/gi)]
        .map((match) => match[1].trim()),
    ).toEqual(['none', 'none']);
    expect(source).toContain('.miniapp-card__run-dot');
    expect(source).toContain('background: var(--workspace-status-success-text);');
    expect(source).toContain('.nursery-template-card__deco');
    expect(source).toContain('display: none;');
  });

  it('uses tokenized short feedback without layout animation or bounce', () => {
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

  it('keeps one visible focus ring and honors reduced motion', () => {
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?outline-offset: -2px;[\s\S]*?box-shadow: none;/,
    );
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;[\s\S]*?transition: none;/,
    );
  });
});
