import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

const sha256 = (relativePath: string): string =>
  sha256Text(readSource(relativePath));

const sha256Text = (source: string): string =>
  createHash('sha256').update(source).digest('hex');

describe('Agents scene Minimal presentation contract', () => {
  const source = readSource('./AgentsScene.minimal.scss');

  it('loads once through the lazy Agents feature stylesheet', () => {
    const owner = readSource('./AgentsScene.scss');

    expect(owner.match(/@use '\.\/AgentsScene\.minimal' as minimal;/g)).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(readSource('../../presentation/minimalWorkspacePresentation.scss'))
      .not.toContain('AgentsScene.minimal.scss');
  });

  it('keeps Agents behavior and pre-existing Classic presentation unchanged', () => {
    const projectionFreeClassic = readSource('./AgentsScene.scss')
      .replace("@use './AgentsScene.minimal' as minimal;\n", '')
      .replace('\n\n@include minimal.styles;\n', '\n');

    expect(sha256Text(projectionFreeClassic)).toBe(
      'aa24794f9fae4914f35829e5bdd442b95f00c822ca779d530ad56c003fdac1bd',
    );
    expect(sha256('./AgentsScene.tsx')).toBe(
      '4cb9bd8a3bf1d2d41c96151f3676bd0e186516eb1c6b50905ca3a13437aa4ab3',
    );
    expect(sha256('./components/CoreAgentCard.tsx')).toBe(
      '6c91afe416d6807ffb0ad6e0fa6b53cacbfb300e377f15fb31a1472b8c675586',
    );
    expect(sha256('./components/AgentCard.tsx')).toBe(
      '90fb45e966bb8985dc3b53575f67dea166fee12d94e080a63c3d394f28fc9dac',
    );
    expect(sha256('./components/AgentTeamCard.tsx')).toBe(
      '270b4ba8a2043c28ae885356a0ca66a77c3bc9c6adab50488e19645dbce3b2d7',
    );
  });

  it('gives every button-like catalog card Enter and Space activation', () => {
    for (const cardSource of [
      readSource('./components/CoreAgentCard.tsx'),
      readSource('./components/AgentCard.tsx'),
      readSource('./components/AgentTeamCard.tsx'),
    ]) {
      expect(cardSource).toContain("event.key !== 'Enter' && event.key !== ' '");
      expect(cardSource).toContain('event.preventDefault();');
      expect(cardSource).toContain('onKeyDown={handleKeyDown}');
    }
  });

  it('scopes all presentation changes to the Minimal Agents scene', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .void-agents-scene {');
    expect(source).not.toMatch(/\n {2}\.(?:agent-card|core-agent-card|gallery-page-header)/);
  });

  it('uses one bounded content axis with a flat graphic-free header', () => {
    expect(source).toContain('--agents-content-max: 1120px;');
    expect(source).toMatch(
      /\.gallery-page-header \{[\s\S]*?var\(--agents-content-max\)[\s\S]*?min-height: 96px;[\s\S]*?border-bottom: 1px solid var\(--workspace-border-subtle\);[\s\S]*?background: transparent;/,
    );
    expect(source).toMatch(
      /\.gallery-zones \{[\s\S]*?var\(--agents-content-max\)[\s\S]*?margin-inline: auto;/,
    );
    expect(source).not.toContain('/visuals/void-agents-hero.webp');
    expect(source).toMatch(
      /\.gallery-page-header__subtitle \{[\s\S]*?display: block;/,
    );
    expect(source).toMatch(
      /\.gallery-page-header__actions \.search \{[\s\S]*?width: var\(--workspace-icon-target\);/,
    );
    expect(source).toMatch(
      /&:focus-within \{[\s\S]*?width: 240px;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.gallery-page-header \{[\s\S]*?min-height: 80px;/,
    );
  });

  it('compresses list cards without removing their details behavior', () => {
    expect(source).toMatch(
      /\.agent-card,[\s\S]*?\.core-agent-card,[\s\S]*?\.agent-team-card \{[\s\S]*?height: 112px;[\s\S]*?min-height: 112px;/,
    );
    expect(source).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 264px), 1fr));');
    expect(source).toContain('content-visibility: auto;');
    expect(source).toContain('contain-intrinsic-size: auto 220px;');
    expect(source).toMatch(
      /\.agent-card__desc,[\s\S]*?white-space: nowrap;[\s\S]*?-webkit-line-clamp: 1;/,
    );
  });

  it('keeps core identity color on small icons without decorative imagery', () => {
    expect(source).toMatch(
      /\.core-agent-card__icon-wrap \{[\s\S]*?color: var\(--core-accent, var\(--workspace-accent\)\);[\s\S]*?background: var\(/,
    );
    expect(source).toContain('color-mix(in srgb, var(--workspace-accent) 9%, transparent)');
  });

  it('uses tokenized feedback without gradients, shadows, lift, or stagger', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(
      [...source.matchAll(/\bbox-shadow:\s*([^;]+);/gi)]
        .map((match) => match[1].trim()),
    ).toEqual(expect.arrayContaining(['none']));
    expect(
      [...source.matchAll(/\btransform:\s*([^;]+);/gi)]
        .map((match) => match[1].trim())
        .every((value) => value === 'none'),
    ).toBe(true);
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).not.toMatch(/animation-delay/i);
  });

  it('keeps one subtle focus treatment and honors reduced motion', () => {
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline: 1px solid var\(--workspace-focus-ring-subtle\);[\s\S]*?outline-offset: -1px;[\s\S]*?box-shadow: none;/,
    );
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;[\s\S]*?transition: none;/,
    );
  });

  it('wraps narrow filter groups instead of clipping the second group', () => {
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.void-agents-scene__agent-filters \{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow-x: visible;/,
    );
  });

  it('progressively discloses secondary card details on narrow views', () => {
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.agent-card,[\s\S]*?\.core-agent-card,[\s\S]*?\.agent-team-card \{[\s\S]*?height: 76px;[\s\S]*?min-height: 76px;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.agent-card__body,[\s\S]*?\.core-agent-card__body,[\s\S]*?\.agent-team-card__body \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.agent-card__meta > :nth-child\(n \+ 2\),[\s\S]*?\.core-agent-card__meta > :nth-child\(n \+ 2\) \{[\s\S]*?display: none;/,
    );
  });

  it('uses compact Chinese labels without changing runtime agent identities', () => {
    const simplifiedChinese = JSON.parse(
      readSource('../../../locales/zh-CN/scenes/agents.json'),
    ) as {
      page: { searchPlaceholder: string; newAgent: string };
      nav: { coreAgents: string; agents: string };
      filters: { mode: string; subagent: string };
    };
    const traditionalChinese = JSON.parse(
      readSource('../../../locales/zh-TW/scenes/agents.json'),
    ) as {
      page: { searchPlaceholder: string; newAgent: string };
      nav: { coreAgents: string; agents: string };
      filters: { mode: string; subagent: string };
    };

    expect(simplifiedChinese.page).toEqual(
      expect.objectContaining({ searchPlaceholder: '搜索智能体…', newAgent: '新建' }),
    );
    expect(simplifiedChinese.nav).toEqual(
      expect.objectContaining({ coreAgents: '核心', agents: '智能体' }),
    );
    expect(simplifiedChinese.filters).toEqual(
      expect.objectContaining({ mode: '智能体', subagent: '子智能体' }),
    );
    expect(traditionalChinese.page.searchPlaceholder).toBe('搜尋智能體…');
    expect(traditionalChinese.filters.subagent).toBe('子智能體');
  });
});
