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

describe('Gallery card Minimal presentation contract', () => {
  const source = readSource('./GalleryCards.minimal.scss');

  it('loads once through the Minimal presentation aggregator', () => {
    const aggregator = readSource('../../presentation/minimalWorkspacePresentation.scss');

    expect(aggregator.match(/GalleryCards\.minimal\.scss/g)).toHaveLength(1);
    expect(aggregator.match(/@include gallery-cards\.styles;/g)).toHaveLength(1);
  });

  it('keeps feature-owned Classic card styles byte-identical', () => {
    expect(sha256('../../scenes/agents/components/AgentCard.scss')).toBe(
      '224bbbc3005ec84161cc0d2a0928313a99c7da40336eee2db244be9fedd36679',
    );
    expect(sha256('../../scenes/agents/components/CoreAgentCard.scss')).toBe(
      '3c077fed46606795751c10111a17d15561bc24b09e559c521f828e9b8529b69d',
    );
    expect(sha256('../../scenes/agents/components/AgentTeamCard.scss')).toBe(
      '137eec4b014faa465573b07ad39f3a8007f5770f4f1c4d99447fb31e558ab472',
    );
    expect(sha256('../../scenes/miniapps/components/MiniAppCard.scss')).toBe(
      'b38ab1c077424f4ffb82aea34ec353a303580e2477ffa7766a4523a42e2a6655',
    );
    expect(sha256('../../scenes/profile/views/NurseryView.scss')).toBe(
      'c1960242e9d604c0eabe8f1434a4b9e5a58a830e4c84b4ba500f7490415e2ecd',
    );
  });

  it('scopes every card projection to Minimal GalleryLayout', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .gallery-layout {');
    expect(source).not.toMatch(/\n {2}\.(?:agent|core|miniapp|assistant|nursery)-/);
  });

  it('uses a compact responsive grid and consistent card geometry', () => {
    expect(source).toContain(
      'grid-template-columns: repeat(auto-fill, minmax(min(100%, 288px), 1fr));',
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
