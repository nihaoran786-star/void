import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./WorkspaceMediaGallery.minimal.scss', import.meta.url),
  'utf8',
);

describe('WorkspaceMediaGallery minimal card presentation', () => {
  it('keeps the filename visible while progressively disclosing secondary metadata', () => {
    expect(source).toMatch(
      /\.workspace-media-card:not\(\.is-pending\) \.workspace-media-card__overlay small,[\s\S]*?\.workspace-media-card:not\(\.is-pending\) \.workspace-media-card__meta \{[\s\S]*?max-height: 0;[\s\S]*?opacity: 0;/,
    );
    expect(source).toMatch(
      /\.workspace-media-card:not\(\.is-pending\):hover \.workspace-media-card__overlay small,[\s\S]*?\.workspace-media-card:not\(\.is-pending\):focus-visible \.workspace-media-card__meta \{[\s\S]*?max-height: 32px;[\s\S]*?opacity: 1;/,
    );
    expect(source).toMatch(
      /\.workspace-media-card__overlay strong \{[\s\S]*?font-size: var\(--workspace-font-size-label\);/,
    );
  });

  it('preserves keyboard focus treatment for card actions', () => {
    expect(source).toContain('.void-ui--minimal .workspace-media-card__action:focus-visible');
    expect(source).toMatch(
      /\.workspace-media-card__action:hover \{[\s\S]*?color: var\(--workspace-text-primary\);/,
    );
  });
});
