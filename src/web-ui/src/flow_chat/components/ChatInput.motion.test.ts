import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = fs.readFileSync(
  new URL('./ChatInput.scss', import.meta.url),
  'utf8',
);

describe('ChatInput motion contract', () => {
  it('transitions only properties that provide visible interaction feedback', () => {
    expect(styles).not.toMatch(/transition:\s*all\b/);
    expect(styles).toContain('background-color 0.25s ease');
    expect(styles).toContain('border-color 0.25s ease');
    expect(styles).toContain('box-shadow 0.25s ease');
    expect(styles).toContain('opacity 0.2s ease');
    expect(styles).toContain('transform 0.2s ease');
  });
});
