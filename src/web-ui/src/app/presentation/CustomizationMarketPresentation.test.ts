import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const extractScssBlock = (source: string, marker: string): string => {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Missing SCSS marker: ${marker}`);
  }

  const openBraceIndex = source.indexOf('{', markerIndex);
  if (openBraceIndex < 0) {
    throw new Error(`Missing opening brace after: ${marker}`);
  }

  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(markerIndex, index + 1);
  }

  throw new Error(`Unbalanced SCSS block after: ${marker}`);
};

const sharedMarket = read('../../component-library/styles/customization-market.scss');
const agentCard = read('../scenes/agents/components/AgentCard.scss');
const teamCard = read('../scenes/agents/components/AgentTeamCard.scss');
const agentsMinimal = read('../scenes/agents/AgentsScene.minimal.scss');
const skillsScene = read('../scenes/skills/SkillsScene.scss');
const skillsMinimal = read('../scenes/skills/SkillsScene.minimal.scss');
const connectorMarket = read('../../infrastructure/config/components/ConnectorMarketplacePanel.scss');

describe('customization market presentation contract', () => {
  it('uses the shared four-column, 160px-card market geometry', () => {
    expect(sharedMarket).toContain('$card-height: 160px;');
    expect(sharedMarket).toContain('$desktop-grid-columns: 4;');
    expect(sharedMarket).toContain('gap: var(--workspace-space-3);');
  });

  it('presents Minimal agent and team cards as quiet rows without rewriting Classic cards', () => {
    const minimalCards = extractScssBlock(
      agentsMinimal,
      '.agent-card,\n    .core-agent-card,\n    .agent-team-card',
    );
    const minimalAvatars = extractScssBlock(
      agentsMinimal,
      '.agent-avatar--card,\n    .agent-team-card__avatar',
    );
    const minimalDescriptions = extractScssBlock(
      agentsMinimal,
      '.agent-card__desc,\n    .core-agent-card__desc,\n    .agent-team-card__desc',
    );
    const classicAgent = extractScssBlock(agentCard, '.agent-card');
    const classicTeamIcon = extractScssBlock(teamCard, '&__icon');

    expect(minimalCards).toContain('flex-direction: row;');
    expect(minimalCards).toContain('border-top: 1px solid var(--workspace-border-subtle);');
    expect(minimalCards).not.toContain('@include market.card;');
    expect(sharedMarket).toContain('height: var(--customization-market-card-height, #{$card-height});');
    expect(minimalAvatars).toContain('width: 20px;');
    expect(minimalAvatars).toContain('height: 20px;');
    expect(minimalDescriptions).toContain('font-size: var(--workspace-font-size-label);');
    expect(minimalDescriptions).toContain('line-height: 1.5;');

    expect(classicAgent).toContain('height: 200px;');
    expect(classicTeamIcon).toContain('width: 40px;');
    expect(classicTeamIcon).toContain('height: 40px;');
    expect(agentCard).not.toContain('.void-ui--minimal');
    expect(teamCard).not.toContain('.void-ui--minimal');
  });

  it('reserves the compact dispatch action without overlapping card titles', () => {
    const minimalDispatchHeaders = extractScssBlock(
      agentsMinimal,
      '.agent-card.agent-card--dispatchable .agent-card__header,\n    .agent-team-card.agent-team-card--dispatchable .agent-team-card__header',
    );
    const classicAgentDispatchHeader = extractScssBlock(
      agentCard,
      '&--dispatchable &__header',
    );
    const classicTeamDispatchHeader = extractScssBlock(
      teamCard,
      '&--dispatchable &__header',
    );

    expect(minimalDispatchHeaders).toContain('padding-right: 0;');
    expect(agentsMinimal).toContain('position: static;');
    expect(agentsMinimal).toContain('.void-ui--minimal .void-agents-scene');
    expect(classicAgentDispatchHeader).toContain('padding-right: 104px;');
    expect(classicTeamDispatchHeader).toContain('padding-right: 104px;');
  });

  it('presents the Minimal skill catalog as rows while Classic keeps compact cards', () => {
    const minimalMarket = extractScssBlock(
      skillsMinimal,
      ".void-ui--minimal .void-skills-scene[data-customization-market='skills']",
    );
    const classicProjection = extractScssBlock(
      skillsScene,
      '.void-skills-scene,\n.void-ui--minimal .void-skills-scene',
    );

    expect(minimalMarket).not.toContain('@include market.grid;');
    expect(minimalMarket).toContain('flex-direction: column;');
    expect(minimalMarket).toContain('border-top: 1px solid var(--workspace-border-subtle);');
    expect(minimalMarket).toContain('width: 20px;');
    expect(minimalMarket).toContain('height: 20px;');

    expect(classicProjection).toContain('height: 116px;');
    expect(classicProjection).toContain('width: 36px;');
    expect(classicProjection).toContain('height: 36px;');
  });

  it('removes only the duplicate marketplace header badge from skill cards', () => {
    const minimalMarket = extractScssBlock(
      skillsMinimal,
      ".void-ui--minimal .void-skills-scene[data-customization-market='skills']",
    );
    const discoverBadges = extractScssBlock(
      minimalMarket,
      '.skills-discover__grid .skill-card__badges',
    );

    expect(discoverBadges).toContain('display: none;');
    expect(minimalMarket).not.toContain('.skills-main__grid .skill-card__badges');
    expect(skillsScene).not.toContain('.skills-discover__grid .skill-card__badges');
  });

  it('uses matching connector breakpoints and compact identity sizing', () => {
    expect(connectorMarket).toContain('@container connector-catalog (max-width: 720px)');
    expect(connectorMarket).toContain('@container connector-catalog (max-width: 520px)');
    expect(connectorMarket).toContain('width: 44px;');
    expect(connectorMarket).toContain('height: 44px;');
    expect(connectorMarket).toContain('font-size: var(--workspace-font-size-body);');
    expect(connectorMarket).toContain('width: min(100%, 306px);');
  });
});
