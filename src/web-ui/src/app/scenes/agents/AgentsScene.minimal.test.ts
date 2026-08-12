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
  const marketContract = readSource('../../../component-library/styles/customization-market.scss');

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
      'a82d5c5d18bd6b2e837e1cc854e8d29f5eb570d49ec7779ee1b1f60d16af25a1',
    );
    expect(sha256('./components/CoreAgentCard.tsx')).toBe(
      'ec1651b4e03a78efdc7fb11dccf4084c5316428dc5d098ca2906ed81105569c3',
    );
    expect(sha256('./components/AgentCard.tsx')).toBe(
      'bca29dcbf2e31fbcac1432809f599233f882e9fc69f3c4de2e456ee4a3a99908',
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
    expect(marketContract).toContain('$content-max-width: 1280px;');
    expect(source).toMatch(/\.agent-market-toolbar \{[\s\S]*?@include market\.content-frame;[\s\S]*?@include market\.toolbar;/);
    expect(source).toMatch(/\.gallery-zones \{[\s\S]*?@include market\.content-frame;/);
    expect(source).not.toContain('/visuals/void-agents-hero.webp');
    expect(source).toMatch(
      /\.agent-market-toolbar \.search \{[\s\S]*?width: min\(280px, 34vw\);/,
    );
    expect(source).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.agent-market-toolbar \{[\s\S]*?flex-direction: column;/,
    );
    expect(readSource('./AgentsScene.tsx')).not.toContain('<GalleryPageHeader');
  });

  it('keeps quick task dispatch separate from the card details action', () => {
    for (const cardSource of [
      readSource('./components/CoreAgentCard.tsx'),
      readSource('./components/AgentCard.tsx'),
      readSource('./components/AgentTeamCard.tsx'),
    ]) {
      expect(cardSource).toContain('event.stopPropagation();');
      expect(cardSource).toContain('onKeyDown={event => event.stopPropagation()}');
      expect(cardSource).toContain('dispatching');
    }
  });

  it('matches the workspace tab, toolbar, and control typography contract', () => {
    expect(source).toMatch(/\.agents-catalog-tabs \{[\s\S]*?@include market\.tab-strip;[\s\S]*?button \{[\s\S]*?@include market\.tab;/);
    expect(marketContract).toContain('$tab-height: 48px;');
    expect(marketContract).toContain('font-size: var(--workspace-font-size-label);');
    expect(marketContract).toContain('font-weight: var(--workspace-font-weight-regular);');
    expect(marketContract).toMatch(/&\.is-active \{[\s\S]*?font-weight: var\(--workspace-font-weight-medium\);/);
    expect(source).toMatch(
      /\.agent-market-toolbar \.search__input \{[\s\S]*?font-size: var\(--workspace-font-size-label\);[\s\S]*?font-weight: var\(--workspace-font-weight-medium\);/,
    );
    expect(source).toMatch(
      /\.gallery-cat-chip \{[\s\S]*?font-size: var\(--workspace-font-size-label\);[\s\S]*?font-weight: var\(--workspace-font-weight-medium\);/,
    );
    expect(source).toMatch(
      /\.gallery-filter-count \{[\s\S]*?font-size: var\(--workspace-font-size-meta\);[\s\S]*?font-variant-numeric: tabular-nums;/,
    );
  });

  it('presents the directory as quiet hairline rows instead of card grids', () => {
    expect(source).not.toContain('@include market.card;');
    expect(source).not.toContain('@include market.grid;');
    expect(source).not.toContain('market.two-column-grid');
    expect(source).not.toContain('market.one-column-grid');
    expect(source).toMatch(
      /\.core-agents-grid \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/,
    );
    expect(source).toMatch(
      /\.gallery-grid \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/,
    );
    expect(source).toMatch(
      /\.agent-card,[\s\S]*?\.core-agent-card,[\s\S]*?\.agent-team-card \{[\s\S]*?flex-direction: row;[\s\S]*?border-top: 1px solid var\(--workspace-border-subtle\);/,
    );
    expect(source).toMatch(
      /\.gallery-zone__header \{[\s\S]*?border-bottom: 1px solid var\(--workspace-border-subtle\);/,
    );
    expect(source).toContain('content-visibility: auto;');
    expect(source).toContain('contain-intrinsic-size: auto 220px;');
    expect(source).toMatch(
      /\.agent-card__desc,[\s\S]*?white-space: nowrap;[\s\S]*?text-overflow: ellipsis;/,
    );
    expect(source).toMatch(
      /\.agent-card__name,[\s\S]*?font-size: var\(--workspace-font-size-control\);[\s\S]*?font-weight: var\(--workspace-font-weight-strong\);/,
    );
    expect(source).toMatch(
      /\.core-agent-card__role,[\s\S]*?font-family: var\(--font-family-mono\);[\s\S]*?font-size: var\(--workspace-font-size-meta\);/,
    );
    expect(readSource('./AgentsScene.tsx')).toContain('<GalleryGrid minCardWidth={280}>');
    expect(readSource('./AgentsScene.tsx')).not.toContain(
      '<span className="gallery-zone-count">{visibleAgents.length}</span>',
    );
    expect(readSource('./AgentsScene.tsx')).toContain('const AGENT_PAGE_SIZE = 8;');
    expect(readSource('./AgentsScene.tsx')).toContain('visibleAgents.slice(');
  });

  it('collects row actions into hover and keeps capability meta as plain monospace text', () => {
    expect(source).toMatch(
      /\.agent-card__dispatch,[\s\S]*?\.agent-team-card__dispatch \{[\s\S]*?opacity: 0;/,
    );
    expect(source).toMatch(
      /\.agent-card:hover \.agent-card__dispatch,[\s\S]*?opacity: 1;/,
    );
    expect(source).toMatch(
      /\.agent-card__cap-chip,[\s\S]*?\.core-agent-card__cap-chip,[\s\S]*?\.agent-team-card__tag-chip \{[\s\S]*?font-family: var\(--font-family-mono\);[\s\S]*?border: 0;/,
    );
    expect(source).toMatch(
      /\.gallery-cat-chip--active::before \{[\s\S]*?background: var\(--workspace-accent\);/,
    );
    expect(source).not.toContain('font-family: ui-monospace');
  });

  it('keeps dispatch actions visible while keyboard focus moves inside a row', () => {
    expect(source).toContain('.agent-card:focus-within .agent-card__dispatch');
    expect(source).toContain('.agent-team-card:focus-within .agent-team-card__dispatch');
    expect(source).toContain('.core-agent-card:focus-within .core-agent-card__dispatch');
    expect(source).toMatch(
      /@media \(hover: none\)[\s\S]*?\.agent-card__dispatch,[\s\S]*?\.core-agent-card__dispatch,[\s\S]*?opacity: 1;/,
    );
  });

  it('uses orb avatars with a deterministic motion form instead of human portraits', () => {
    const avatar = readSource('./components/AgentAvatar.tsx');
    const avatarStyles = readSource('./components/AgentAvatar.scss');
    const engine = readSource('./components/orbAvatarEngine.ts');

    expect(avatar).toContain('<canvas');
    expect(avatar).toContain('attachOrb');
    expect(avatar).toContain('resolveOrbType');
    expect(avatar).not.toContain('<img');
    expect(avatar).toContain("state === 'active' || state === 'running'");
    expect(avatar).toContain('}, [orbType, state]);');
    for (const orbType of [
      'breathing',
      'searching',
      'working',
      'solving',
      'listening',
      'connecting',
      'weaving',
      'composing',
      'shaping',
    ]) {
      expect(engine).toContain(orbType);
    }
    expect(engine).toContain('prefers-reduced-motion: reduce');
    expect(avatarStyles).toContain(
      'transition: opacity var(--workspace-motion-fast) var(--workspace-easing-standard);',
    );
    expect(avatarStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(avatarStyles).not.toContain('&__image');
    expect(avatarStyles).not.toContain('&__fallback-icon');
    expect(source).toMatch(
      /\.agent-avatar--card,[\s\S]*?\.agent-team-card__avatar \{[\s\S]*?width: 20px;[\s\S]*?height: 20px;/,
    );
    expect(source).toMatch(
      /\.core-agent-card \.agent-avatar--card \{[\s\S]*?width: 30px;[\s\S]*?height: 30px;/,
    );
  });

  it('animates the orb only for selected or running rows', () => {
    const scene = readSource('./AgentsScene.tsx');
    const agentCard = readSource('./components/AgentCard.tsx');
    const coreCard = readSource('./components/CoreAgentCard.tsx');

    expect(scene.match(/active=\{selectedAgentKey === agent\.key\}/g)).toHaveLength(2);
    expect(scene).toContain('state="active"');
    for (const cardSource of [agentCard, coreCard]) {
      expect(cardSource).toContain("dispatching ? 'running' : active ? 'active' : 'idle'");
      expect(cardSource).toContain('state={avatarState}');
    }
    expect(readSource('./components/AgentTeamCard.tsx')).not.toContain('TAG_COLORS');
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

  it('keeps employee rows readable on narrow views', () => {
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.agent-card__cap-chips > :nth-child\(n \+ 2\),[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.agent-card__body,[\s\S]*?\.core-agent-card__body,[\s\S]*?\.agent-team-card__body \{[\s\S]*?display: none;/,
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
