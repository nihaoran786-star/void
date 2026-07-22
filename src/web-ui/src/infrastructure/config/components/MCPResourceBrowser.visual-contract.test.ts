import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  fileURLToPath(new URL('./MCPResourceBrowser.scss', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('MCPResourceBrowser visual contract', () => {
  it('uses canonical theme and control tokens instead of legacy aliases', () => {
    for (const declaration of [
      'background: var(--color-bg-primary);',
      'background: var(--color-bg-secondary);',
      'background: var(--control-bg);',
      'border: 1px solid var(--control-border);',
      'border-bottom: 1px solid var(--border-base);',
      'border-radius: var(--control-radius);',
      'border-radius: var(--size-radius-sm);',
      'outline: 2px solid var(--control-focus-ring);',
      'color: var(--color-text-primary);',
      'color: var(--color-text-secondary);',
      'color: var(--color-text-muted);',
      'color: var(--input-placeholder);',
      'font-family: var(--font-family-mono);',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(stylesheet).not.toMatch(
      /var\(--(?:background-(?:primary|secondary|tertiary)|text-(?:primary|secondary|tertiary)|border-primary|radius-(?:base|sm))\)/,
    );
  });

  it('keeps hover, selected, and metadata states visually distinct', () => {
    expect(stylesheet).toMatch(
      /&:hover\s*\{\s*background: var\(--element-bg-subtle\);/,
    );
    expect(stylesheet).toMatch(
      /&\.selected\s*\{\s*background: var\(--element-bg-medium\);/,
    );
    expect(stylesheet).toMatch(
      /\.viewer-mime-type\s*\{[\s\S]*?color: var\(--status-neutral-text\);[\s\S]*?background: var\(--status-neutral-bg\);/,
    );
    expect(stylesheet).toContain('border-left: 3px solid transparent;');
    expect(stylesheet).toContain(
      'border-left: 3px solid var(--color-primary);',
    );
  });

  it('limits motion to paint-only properties and supports reduced motion', () => {
    expect(stylesheet).not.toMatch(/\btransition:\s*all\b/);
    expect(stylesheet).toContain(
      'background-color var(--motion-fast) var(--easing-standard)',
    );
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toMatch(
      /\.search-input,\s*\n\s*\.resource-item\s*\{\s*transition: none;/,
    );
  });
});
