import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
);

const agentCard = read('../scenes/agents/components/AgentCard.scss');
const teamCard = read('../scenes/agents/components/AgentTeamCard.scss');
const teamsCatalogView = read('../scenes/agents/components/TeamsCatalogView.scss');
const teamsCatalogComponent = read('../scenes/agents/components/TeamsCatalogView.tsx');
const agentsMinimal = read('../scenes/agents/AgentsScene.minimal.scss');
const skillsScene = read('../scenes/skills/SkillsScene.scss');
const skillsMinimal = read('../scenes/skills/SkillsScene.minimal.scss');
const connectorMarket = read('../../infrastructure/config/components/ConnectorMarketplacePanel.scss');
const auxPane = read('../scenes/session/AuxPane.scss');
const teamWorkspace = read('../../team_workspace/components/TeamWorkspacePanel.scss');

describe('Minimal presentation remains isolated from Classic', () => {
  it('keeps Classic agent cards unchanged and projects compact cards only in Minimal', () => {
    expect(agentCard).toContain('height: 184px;');
    expect(agentCard).toContain('padding-right: 104px;');
    expect(agentCard).not.toContain('var(--customization-market-card-height, 160px)');

    expect(teamCard).toContain('font-size: var(--font-size-xl);');
    expect(teamCard).toContain('min-height: 190px;');
    expect(teamCard).not.toContain('var(--customization-market-card-height, 160px)');
    expect(teamsCatalogComponent).toContain('cardHeight={190}');
    expect(teamsCatalogView).not.toContain('.team-catalog-skeleton');

    expect(agentsMinimal).toContain('.void-ui--minimal .void-agents-scene');
    expect(agentsMinimal).toContain('height: var(--customization-market-card-height, 160px);');
    expect(agentsMinimal).toContain('.team-catalog-skeleton');
    expect(agentsMinimal).toContain(
      '.agent-card.agent-card--dispatchable .agent-card__header',
    );
    expect(agentsMinimal).toContain('.agent-team-card__avatar');
  });

  it('keeps the legacy skill layout in the base stylesheet', () => {
    expect(skillsScene).toContain('height: 116px;');
    expect(skillsScene).toContain('@container skills-market (max-width: 900px)');
    expect(skillsScene).toContain('@container skills-market (max-width: 560px)');
    expect(skillsScene).not.toContain(
      '.skills-discover__grid .skill-card__badges {\n    display: none;',
    );

    expect(skillsMinimal).toContain(
      ".void-ui--minimal .void-skills-scene[data-customization-market='skills']",
    );
    expect(skillsMinimal).toContain('@container skills-market (max-width: 900px)');
    expect(skillsMinimal).toContain('@container skills-market (max-width: 560px)');
    expect(skillsMinimal).not.toContain('@include market.grid;');
    expect(skillsMinimal).toContain('flex-direction: column;');
    expect(skillsMinimal).toMatch(
      /\.skills-discover__grid \.skill-card__badges \{\s*display: none;/,
    );
  });

  it('keeps connector geometry Classic by default and compact only in Minimal', () => {
    const minimalStart = connectorMarket.indexOf('.void-ui--minimal .void-connector-market');
    const classicConnector = connectorMarket.slice(0, minimalStart);
    const minimalConnector = connectorMarket.slice(minimalStart);

    expect(minimalStart).toBeGreaterThan(0);
    expect(classicConnector).toContain('width: min(100%, 340px);');
    expect(classicConnector).toContain('width: 52px;');
    expect(classicConnector).toContain('@container connector-catalog (max-width: 900px)');
    expect(classicConnector).toContain('@container connector-catalog (max-width: 620px)');
    expect(classicConnector).not.toContain('width: min(100%, 306px);');

    expect(minimalConnector).toContain('width: min(100%, 306px);');
    expect(minimalConnector).toContain('grid-template-columns: 44px minmax(0, 1fr);');
    expect(minimalConnector).toContain('@container connector-catalog (max-width: 720px)');
    expect(minimalConnector).toContain('@container connector-catalog (max-width: 520px)');
  });

  it('keeps right-rail resets and compact headers theme-scoped', () => {
    expect(auxPane).toContain('.void-ui--classic .void-aux-pane');
    expect(auxPane).toContain('border-left: none !important;');
    expect(auxPane).toContain('.void-ui--minimal .void-aux-pane');
    expect(auxPane).toContain('padding: var(--workspace-space-2);');

    const minimalStart = teamWorkspace.indexOf('.void-ui--minimal .team-workspace-panel');
    const classicWorkspace = teamWorkspace.slice(0, minimalStart);
    const minimalWorkspace = teamWorkspace.slice(minimalStart);

    expect(minimalStart).toBeGreaterThan(0);
    expect(classicWorkspace).toContain('min-height: 36px; flex: 0 0 auto; padding: 12px 16px 9px;');
    expect(classicWorkspace).toContain('border-bottom: 1px solid var(--border-subtle);');
    expect(classicWorkspace).not.toContain('border-radius: inherit;');
    expect(minimalWorkspace).toContain('border-radius: inherit;');
  });
});
