import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  new URL('./TeamAuthoringPage.scss', import.meta.url),
  'utf8',
);

describe('minimal Team roster presentation contract', () => {
  it('uses a four-column desktop roster with responsive two and one-column fallbacks', () => {
    expect(stylesheet).toMatch(
      /&__agent-grid[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?&__agent-grid[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 480px\)[\s\S]*?&__agent-grid[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });

  it('keeps motion optional and avoids decorative gradients', () => {
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).not.toMatch(/linear-gradient|radial-gradient/);
  });
});
