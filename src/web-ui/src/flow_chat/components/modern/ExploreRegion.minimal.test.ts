import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ExploreRegion.minimal.scss', import.meta.url),
  'utf8',
);

describe('ExploreRegion Minimal presentation contract', () => {
  it('renders one quiet summary row and reveals detail without decorative chrome', () => {
    expect(source).toMatch(
      /\.explore-region__header \{[\s\S]*?min-height: 28px;[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
    );
    expect(source).toMatch(
      /\.explore-region__summary \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/,
    );
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toContain('transition: all');
  });
});
