import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

describe('ReviewConfig Minimal presentation', () => {
  it('uses a feature-owned Minimal projection without changing review controls', () => {
    const owner = readSource('./ReviewConfig.scss');
    const source = readSource('./ReviewConfig.tsx');
    const styles = readSource('./ReviewConfig.minimal.scss');

    expect(owner).toContain("@use './ReviewConfig.minimal' as minimal;");
    expect(source).toContain(
      'getMemberRole(member) !== getMemberName(member)',
    );
    expect(source).toContain(
      'ariaLabel={`${getMemberName(member)} · ${t(\'members.strategyControl\')}`}',
    );
    expect(source).toContain(
      'inputAriaLabel={t(\'capacity.maxParallelReviewers.label\')}',
    );
    expect(styles).toContain('.review-config__member-state.is-locked');
    expect(styles).toContain('.void-ui--minimal .review-config');
    expect(styles).toContain('var(--workspace-border-subtle)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps reviewer controls compact and responds to the settings container', () => {
    const styles = readSource('./ReviewConfig.minimal.scss');

    expect(styles).toContain(
      'grid-template-columns: minmax(160px, 0.65fr) minmax(0, 1.8fr);',
    );
    expect(styles).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;',
    );
    expect(styles).toContain('.review-config__member-model {\n    display: none;');
    expect(styles).toContain('@container config-panel (max-width: 640px)');
    expect(styles).toContain(
      'grid-template-columns: minmax(120px, 0.55fr) minmax(0, 1fr);',
    );
    expect(styles).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(styles).toContain('.review-config__strategy-summary {\n      display: none;');
  });
});
