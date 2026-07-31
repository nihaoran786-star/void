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

describe('Agents scene Minimal presentation contract', () => {
  const source = readSource('./AgentsScene.minimal.scss');

  it('loads once through the lazy Agents feature stylesheet', () => {
    const owner = readSource('./AgentsScene.scss');

    expect(owner.match(/@use '\.\/AgentsScene\.minimal' as minimal;/g)).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(readSource('../../presentation/minimalWorkspacePresentation.scss'))
      .not.toContain('AgentsScene.minimal.scss');
  });

  it('keeps the classic shell and team-card presentation stable while locking the employee market projection', () => {
    const projectionFreeClassic = readSource('./AgentsScene.scss')
      .replace("@use './AgentsScene.minimal' as minimal;\n", '')
      .replace('\n\n@include minimal.styles;\n', '\n');

    expect(sha256Text(projectionFreeClassic)).toBe(
      '5f73fbe73f9a6dc38c85177b37685f592c34056f316fc42a951e525b4a91f576',
    );
    expect(sha256('./AgentsScene.tsx')).toBe(
      '69a4731b358c06160a0cb92c743e93f88672dd0a2e225a059110847b0fd63545',
    );
    expect(sha256('./components/CoreAgentCard.tsx')).toBe(
      '4c9fe890d32913cecd56a3aa55701a9bccdc770493af73db1e15c673ea60888b',
    );
    expect(sha256('./components/AgentCard.tsx')).toBe(
      'a2d7e98cadf23aae10c40504d4c1157edb9c05c3576508bbbeec4208e837ee2e',
    );
    expect(sha256('./components/AgentTeamCard.tsx')).toBe(
      'eec1f6756a7d654b0163938ba5aaff0903bbfc9263440ef2f40852cefecbca3b',
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

  it('uses one bounded content axis with a title-free compact toolbar', () => {
    expect(source).toContain('--agents-content-max: 1280px;');
    expect(source).toMatch(
      /\.agent-market-toolbar \{[\s\S]*?var\(--agents-content-max\)[\s\S]*?min-height: 52px;[\s\S]*?border-bottom: 1px solid var\(--workspace-border-subtle\);/,
    );
    expect(source).toMatch(
      /\.gallery-zones \{[\s\S]*?var\(--agents-content-max\)[\s\S]*?margin-inline: auto;/,
    );
    expect(source).not.toContain('/visuals/void-agents-hero.webp');
    expect(source).toMatch(
      /\.agent-market-toolbar \.search \{[\s\S]*?width: min\(280px, 34vw\);/,
    );
    expect(source).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.agent-market-toolbar \{[\s\S]*?flex-direction: column;/,
    );
    expect(readSource('./AgentsScene.tsx')).not.toContain('<GalleryPageHeader');
  });

  it('matches the workspace tab, toolbar, and control typography contract', () => {
    expect(source).toMatch(
      /\.agents-catalog-tabs \{[\s\S]*?min-height: 48px;[\s\S]*?button \{[\s\S]*?min-height: 48px;[\s\S]*?font-size: var\(--workspace-font-size-label\);[\s\S]*?font-weight: var\(--workspace-font-weight-regular\);/,
    );
    expect(source).toMatch(
      /&\.is-active \{[\s\S]*?border-bottom-color: var\(--workspace-accent\);[\s\S]*?font-weight: var\(--workspace-font-weight-medium\);/,
    );
    expect(source).toMatch(
      /\.agent-market-toolbar \.search__input \{[\s\S]*?font-size: var\(--workspace-font-size-label\);[\s\S]*?font-weight: var\(--workspace-font-weight-medium\);/,
    );
    expect(source).toMatch(
      /\.gallery-cat-chip \{[\s\S]*?height: var\(--workspace-control-height\);[\s\S]*?font-size: var\(--workspace-font-size-label\);[\s\S]*?font-weight: var\(--workspace-font-weight-medium\);/,
    );
    expect(source).toMatch(
      /\.gallery-filter-count \{[\s\S]*?font-size: var\(--workspace-font-size-meta\);[\s\S]*?font-variant-numeric: tabular-nums;/,
    );
  });

  it('compresses list cards without removing their details behavior', () => {
    expect(source).toMatch(
      /\.agent-card,[\s\S]*?\.core-agent-card,[\s\S]*?\.agent-team-card \{[\s\S]*?height: 160px;[\s\S]*?min-height: 160px;/,
    );
    expect(source).toContain('--gallery-grid-min: 280px;');
    expect(source).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(source).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));');
    expect(source).toContain('content-visibility: auto;');
    expect(source).toContain('contain-intrinsic-size: auto 220px;');
    expect(source).toMatch(
      /\.agent-card__desc,[\s\S]*?white-space: normal;[\s\S]*?-webkit-line-clamp: 2;/,
    );
    expect(source).toMatch(
      /\.agent-card__name,[\s\S]*?font-size: var\(--workspace-font-size-control\);[\s\S]*?font-weight: var\(--workspace-font-weight-strong\);/,
    );
    expect(source).toMatch(
      /\.core-agent-card__role,[\s\S]*?font-size: var\(--workspace-font-size-meta\);[\s\S]*?font-weight: var\(--workspace-font-weight-regular\);/,
    );
    expect(source).toMatch(
      /\.agent-card__desc,[\s\S]*?font-size: var\(--workspace-font-size-label\);[\s\S]*?line-height: 1\.5;/,
    );
    expect(readSource('./AgentsScene.tsx')).toContain('<GalleryGrid minCardWidth={280}>');
    expect(readSource('./AgentsScene.tsx')).not.toContain(
      '<span className="gallery-zone-count">{visibleAgents.length}</span>',
    );
    expect(readSource('./AgentsScene.tsx')).toContain('const AGENT_PAGE_SIZE = 6;');
    expect(readSource('./AgentsScene.tsx')).toContain('visibleAgents.slice(');
  });

  it('uses one real portrait slot for both core and specialist employees', () => {
    expect(source).toMatch(
      /\.agent-avatar--card \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/,
    );
    expect(readSource('./components/AgentAvatar.tsx')).toContain('<img');
    expect(readSource('./components/AgentAvatar.tsx')).toContain('onError={() => setImageFailed(true)}');
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
      /\.void-agents-scene__agent-filters \{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow: visible;/,
    );
  });

  it('keeps employee identity and descriptions readable on narrow views', () => {
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.agent-card,[\s\S]*?\.core-agent-card,[\s\S]*?\.agent-team-card \{[\s\S]*?height: auto;[\s\S]*?min-height: 150px;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.agent-card__body,[\s\S]*?\.core-agent-card__body,[\s\S]*?\.agent-team-card__body \{[\s\S]*?display: block;/,
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
      expect.objectContaining({ coreAgents: '推荐', agents: '全部' }),
    );
    expect(simplifiedChinese.filters).toEqual(
      expect.objectContaining({ mode: '智能体', subagent: '子智能体' }),
    );
    expect(traditionalChinese.page.searchPlaceholder).toBe('搜尋智能體…');
    expect(traditionalChinese.filters.subagent).toBe('子智能體');
  });
});
