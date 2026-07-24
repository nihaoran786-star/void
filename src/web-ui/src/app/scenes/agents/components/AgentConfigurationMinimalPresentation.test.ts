import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');

describe('agent configuration minimal presentation', () => {
  it('keeps creation behavior in the owner while projecting a compact tokenized form', () => {
    const owner = read('./CreateAgentPage.scss');
    const source = read('./CreateAgentPage.minimal.scss');

    expect(owner).toContain("@use './CreateAgentPage.minimal' as minimal;");
    expect(owner).toContain('@include minimal.styles;');
    expect(source).toContain('.void-ui--minimal .void-agents-scene--page');
    expect(source).toContain('background: var(--workspace-surface-canvas);');
    expect(source).toContain('grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));');
    expect(source).toContain('max-height: 136px;');
    expect(source).toContain('position: sticky;');
    expect(source).toContain('bottom: 0;');
    expect(source).not.toMatch(/linear-gradient|radial-gradient|rgba?\(/);
  });

  it('flattens inherited Review Team decoration without changing its page contract', () => {
    const owner = read('./ReviewTeamPage.scss');
    const source = read('./ReviewTeamPage.minimal.scss');

    expect(owner).toContain("@use './ReviewTeamPage.minimal' as minimal;");
    expect(owner).toContain('@include minimal.styles;');
    expect(source).toContain('.void-ui--minimal .review-team-page');
    expect(source).toContain('&__summary-card--primary');
    expect(source).toContain('background: var(--workspace-surface-panel);');
    expect(source).toContain('&__member-detail-panel');
    expect(source).toContain('animation: none;');
    expect(source).toContain('@media (max-width: 960px)');
    expect(source).toContain('@container config-panel (max-width: 520px)');
    expect(source).not.toMatch(/linear-gradient|radial-gradient|rgba?\(/);
  });
});
