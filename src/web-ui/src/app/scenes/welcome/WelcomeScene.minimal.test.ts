import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

const sha256 = (relativePath: string): string =>
  createHash('sha256').update(readFileSync(pathFor(relativePath))).digest('hex');

describe('WelcomeScene Minimal presentation', () => {
  const stylesheet = readSource('./WelcomeScene.minimal.scss');

  it('enters through the Minimal presentation aggregator exactly once', () => {
    const aggregator = readSource('../../presentation/minimalWorkspacePresentation.scss');
    const classicComponent = readSource('./WelcomeScene.tsx');

    expect(aggregator.match(/WelcomeScene\.minimal\.scss/g)).toHaveLength(1);
    expect(aggregator.match(/@include welcome-scene\.styles;/g)).toHaveLength(1);
    expect(classicComponent).toContain("import './WelcomeScene.scss';");
    expect(classicComponent).not.toContain('WelcomeScene.minimal.scss');
  });

  it('keeps the existing Classic component and stylesheet byte-identical', () => {
    expect(sha256('./WelcomeScene.tsx')).toBe(
      '648c6885ac63a54676fd76f8ec41a3335452b6440d8cc739e34de949be771a82',
    );
    expect(sha256('./WelcomeScene.scss')).toBe(
      'bee8b1057dec81b2acc933ca02e0e1618129e7cc3bdeea12588fc9e5c0d506f0',
    );
  });

  it('uses the compact 16/13/11 typography hierarchy and flat recent rows', () => {
    for (const contract of [
      'font-size: var(--workspace-font-size-title);',
      'font-size: var(--workspace-font-size-control);',
      'font-size: var(--workspace-font-size-meta);',
      'border-top: 1px solid var(--workspace-border-subtle);',
      'border-bottom: 1px solid var(--workspace-border-subtle);',
      'border-radius: 0;',
      'opacity: 0.55;',
    ]) {
      expect(stylesheet).toContain(contract);
    }
  });

  it('removes decorative section/action glyphs while preserving date-to-delete disclosure', () => {
    const classicComponent = readSource('./WelcomeScene.tsx');
    const recentItemStyles = stylesheet.slice(
      stylesheet.indexOf('&__recent-item {'),
      stylesheet.indexOf('&__recent-host,'),
    );

    for (const contract of [
      '&__section-label {',
      '&__link-btn {',
      '> svg {\n        display: none;',
      '&__label {',
      '&__icon {',
      '&:focus-visible {',
      'outline: 2px solid var(--workspace-focus-ring);',
    ]) {
      expect(stylesheet).toContain(contract);
    }

    expect(classicComponent).toContain(
      'className="welcome-scene__recent-time-btn__label"',
    );
    expect(classicComponent).toContain(
      'className="welcome-scene__recent-time-btn__icon"',
    );
    expect(recentItemStyles).not.toContain('display: none;');
  });

  it('stays workspace-token driven and avoids decorative effects', () => {
    expect(stylesheet).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    expect(stylesheet).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(stylesheet).not.toMatch(/\b(?:backdrop-filter|filter)\s*:/i);
    expect(stylesheet).not.toMatch(/\bbox-shadow\s*:/i);
    expect(stylesheet).not.toMatch(/var\(--workspace-[^)]+,/);
    expect(stylesheet).not.toMatch(
      /var\(--workspace-[^)]+\)\s*\*\s*\d+(?:\.\d+)?/,
    );

    for (const property of ['color', 'background', 'font-size', 'font-family']) {
      const declarations = stylesheet.match(
        new RegExp(`\\b${property}\\s*:\\s*[^;]+;`, 'g'),
      ) ?? [];
      expect(declarations.length).toBeGreaterThan(0);
      for (const declaration of declarations) {
        expect(declaration).toMatch(
          /var\(--workspace-|(?:background|color):\s*transparent/,
        );
      }
    }
  });

  it('defines bounded 720px and 480px layouts plus reduced-motion behavior', () => {
    expect(stylesheet).toContain('@media (max-width: 720px)');
    expect(stylesheet).toContain('@media (max-width: 480px)');
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('transition: none;');
  });
});
