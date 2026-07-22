import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  fileURLToPath(new URL('./FontPreferencePanel.scss', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('FontPreferencePanel visual contract', () => {
  it('uses canonical typography, text, and surface tokens', () => {
    for (const declaration of [
      'font-family: var(--font-family-sans);',
      'color: var(--color-text-primary);',
      'color: var(--color-text-secondary);',
      'color: var(--color-text-muted);',
      'background: var(--color-bg-secondary);',
      'background: var(--control-bg);',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(stylesheet).not.toMatch(
      /var\(--(?:text-(?:primary|secondary|muted)|bg-secondary|font-sans)(?:[,)]|\s)/,
    );
  });

  it('limits transitions to explicit paint properties', () => {
    expect(stylesheet).not.toMatch(/\btransition:\s*all\b/);
    expect(stylesheet).toContain(
      'background-color $motion-fast $easing-standard',
    );
    expect(stylesheet).toContain(
      'border-color $motion-fast $easing-standard',
    );
    expect(stylesheet).toContain('color $motion-fast $easing-standard');
  });

  it('keeps every native font control keyboard-focus visible', () => {
    expect(stylesheet).toMatch(
      /&__level-btn:focus-visible,\s*\n\s*&__reset-btn:focus-visible\s*\{\s*outline: 2px solid var\(--control-focus-ring\);\s*outline-offset: 2px;/,
    );
    expect(stylesheet).toMatch(
      /&__step-btn:focus-visible,\s*\n\s*&__number-input:focus-visible\s*\{\s*outline: none !important;\s*box-shadow: inset 0 0 0 2px var\(--control-focus-ring\) !important;/,
    );
  });
});
