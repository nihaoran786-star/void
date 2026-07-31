import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheets = {
  agentsScene: readFileSync(
    new URL('../scenes/agents/AgentsScene.scss', import.meta.url),
    'utf8',
  ),
  agentCard: readFileSync(
    new URL('../scenes/agents/components/AgentCard.scss', import.meta.url),
    'utf8',
  ),
  agentTeamCard: readFileSync(
    new URL('../scenes/agents/components/AgentTeamCard.scss', import.meta.url),
    'utf8',
  ),
  coreAgentCard: readFileSync(
    new URL('../scenes/agents/components/CoreAgentCard.scss', import.meta.url),
    'utf8',
  ),
  createAgentPage: readFileSync(
    new URL('../scenes/agents/components/CreateAgentPage.scss', import.meta.url),
    'utf8',
  ),
  reviewTeamPage: readFileSync(
    new URL('../scenes/agents/components/ReviewTeamPage.scss', import.meta.url),
    'utf8',
  ),
  insights: readFileSync(
    new URL('../scenes/my-agent/InsightsScene.scss', import.meta.url),
    'utf8',
  ),
  nursery: readFileSync(
    new URL('../scenes/profile/views/NurseryView.scss', import.meta.url),
    'utf8',
  ),
  skills: readFileSync(
    new URL('../scenes/skills/SkillsScene.scss', import.meta.url),
    'utf8',
  ),
};

const combinedStylesheet = Object.values(stylesheets).join('\n');
const canonicalTokens = new Set([
  '--font-size-xxs',
  '--font-size-2xs',
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-base',
  '--font-size-xl',
  '--font-size-2xl',
  '--font-size-3xl',
  '--font-size-4xl',
  '--font-size-5xl',
]);

const migratedDistribution = {
  xxs: 19,
  '2xs': 25,
  xs: 6,
  sm: 8,
  base: 3,
  xl: 4,
  '2xl': 6,
  '3xl': 3,
  '4xl': 1,
  '5xl': 2,
} as const;

// These offsets exclude canonical-token consumers outside the original
// 77-declaration migration, including both pre-existing consumers and later
// feature additions, while preserving the historical migration baseline.
const preExistingDistribution = {
  xxs: 0,
  '2xs': 33,
  xs: 53,
  sm: 46,
  base: 6,
  xl: 7,
  '2xl': 0,
  '3xl': 0,
  '4xl': 0,
  '5xl': 0,
} as const;

const findRawFontSizeConsumers = (source: string) =>
  [
    ...source.matchAll(/(?<![-\w])font-size\s*:\s*([^;}\n]+)/g),
  ]
    .filter(match =>
      /(?:\d+(?:\.\d+)?(?:px|rem|em)\b|%|clamp\s*\()/i.test(match[1]),
    )
    .map(match => match[0]);

const findTokenConsumers = (source: string) =>
  [
    ...source.matchAll(
      /(?<![-\w])font-size\s*:\s*var\((--font-size-[\w-]+)\)/g,
    ),
  ].map(match => match[1]);

const countTokenConsumers = (token: string) =>
  findTokenConsumers(combinedStylesheet).filter(
    consumer => consumer === `--font-size-${token}`,
  ).length;

describe('agent management typography governance', () => {
  it('keeps all nine stylesheets on the fixed token scale', () => {
    for (const source of Object.values(stylesheets)) {
      expect(findRawFontSizeConsumers(source)).toEqual([]);
    }
  });

  it('uses only canonical typography tokens for direct token consumers', () => {
    expect(
      findTokenConsumers(combinedStylesheet).filter(
        token => !canonicalTokens.has(token),
      ),
    ).toEqual([]);
  });

  it('locks the exact distribution of the 77 migrated declarations', () => {
    expect(
      Object.fromEntries(
        Object.entries(migratedDistribution).map(([token, expected]) => [
          token,
          countTokenConsumers(token) -
            preExistingDistribution[
              token as keyof typeof preExistingDistribution
            ],
        ]),
      ),
    ).toEqual(migratedDistribution);
  });

  it('keeps the Insights type aliases on their canonical tokens', () => {
    expect(stylesheets.insights).toMatch(
      /^\$ins-title:\s+var\(--font-size-2xl\);$/m,
    );
    expect(stylesheets.insights).toMatch(
      /^\$ins-section:\s+var\(--font-size-xs\);/m,
    );
    expect(stylesheets.insights).toMatch(
      /^\$ins-body:\s+var\(--font-size-base\);$/m,
    );
    expect(stylesheets.insights).toMatch(
      /^\$ins-small:\s+var\(--font-size-sm\);$/m,
    );
    expect(stylesheets.insights).toMatch(
      /^\$ins-label:\s+var\(--font-size-xs\);$/m,
    );
    expect(stylesheets.insights).not.toMatch(
      /^\$ins-(?:title|section|body|small|label):[^\n]*\d+(?:\.\d+)?px\b/m,
    );
  });

  it('preserves the existing family and Skills surface-token governance', () => {
    expect(stylesheets.insights).toContain(
      'font-family: var(--font-family-sans);',
    );
    expect(
      stylesheets.nursery.match(
        /font-family:\s*var\(--font-family-sans\);/g,
      ),
    ).toHaveLength(2);
    expect(
      stylesheets.skills.match(
        /background:\s*var\(--color-bg-primary\);/g,
      ),
    ).toHaveLength(2);
    expect(stylesheets.skills).toContain(
      'linear-gradient(180deg, var(--color-bg-secondary) 0%, var(--color-bg-primary) 100%)',
    );
  });

  it('keeps the Skills mobile layout aligned with the 720px desktop viewport', () => {
    expect(stylesheets.skills).toContain('@media (max-width: 720px)');
    expect(stylesheets.skills).not.toContain('@media (max-width: 640px)');
    expect(stylesheets.skills).toContain('@media (max-width: 960px)');
  });

  it('keeps the Insights report usable at the 720px breakpoint', () => {
    const narrowLayout = stylesheets.insights.slice(
      stylesheets.insights.lastIndexOf('@media (max-width: 720px)'),
    );

    expect(narrowLayout).toContain('.insights-report-content');
    expect(narrowLayout).toMatch(
      /\.insights-report-content\s*\{[^}]*flex-direction:\s*column;/s,
    );
    expect(narrowLayout).toMatch(
      /\.insights-report-nav\s*\{[^}]*flex-direction:\s*row;[^}]*overflow-x:\s*auto;/s,
    );
    expect(narrowLayout).not.toMatch(
      /\.insights-report-nav\s*\{[^}]*display:\s*none;/s,
    );
    expect(narrowLayout).toMatch(
      /&__item\s*\{[^}]*flex:\s*0 0 auto;/s,
    );
  });

  it('detects a synthesized 17px regression', () => {
    const mutated =
      `${stylesheets.agentCard}\n.synthetic-agent-label { font-size: 17px; }`;

    expect(findRawFontSizeConsumers(mutated)).toEqual(['font-size: 17px']);
  });
});
