import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./ModelThinkingDisplay.tsx', import.meta.url),
  'utf8',
);

const stylesheet = readFileSync(
  new URL('./ModelThinkingDisplay.scss', import.meta.url),
  'utf8',
);

const packageJson = JSON.parse(readFileSync(
  new URL('../../../package.json', import.meta.url),
  'utf8',
)) as { dependencies?: Record<string, string> };

describe('ModelThinkingDisplay presentation contract', () => {
  it('uses ThinkingOrb for active composing while completed thinking keeps its disclosure affordance', () => {
    expect(packageJson.dependencies?.['thinking-orbs']).toBe('0.2.0');
    expect(componentSource).toContain("await import('thinking-orbs')");
    expect(componentSource).toContain('const ThinkingOrb = React.lazy');
    expect(componentSource).toMatch(/isActive\s*\?\s*\(\s*<React\.Suspense[\s\S]*?<ThinkingOrb/);
    expect(componentSource).toContain('state="composing"');
    expect(componentSource).toContain('size={64}');
    expect(componentSource).toContain("theme={isLight ? 'light' : 'dark'}");
    expect(componentSource).toContain('<React.Suspense fallback={<span className="thinking-orb" aria-hidden="true" />}>');
    expect(componentSource).toContain('<ChevronRight size={14} className="thinking-chevron" />');
  });

  it('lets the orb own motion without adding layout-animation CSS', () => {
    const orbRule = stylesheet.match(/\.thinking-orb\s*\{[^}]+\}/)?.[0];

    expect(orbRule).toMatch(/width:\s*64px;[\s\S]*height:\s*64px;/);
    expect(orbRule).not.toContain('animation:');
  });
});
