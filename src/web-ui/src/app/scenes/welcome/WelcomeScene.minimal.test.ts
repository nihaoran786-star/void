import { describe, expect, it } from 'vitest';
import {
  readSourceText,
} from '@/test-utils/sourceText';

const pathFor = (relativePath: string): URL =>
  new URL(relativePath, import.meta.url);

const readSource = (relativePath: string): string =>
  readSourceText(pathFor(relativePath));

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

  it('keeps workspace actions on the existing context and notification interfaces', () => {
    const component = readSource('./WelcomeScene.tsx');

    expect(component).toContain('useWorkspaceContext()');
    expect(component).toContain('useNotification()');
    expect(component).toContain("openScene('session' as SceneTabId)");
    expect(component).not.toContain('@tauri-apps/api');
    expect(component).not.toContain('@tauri-apps/plugin-fs');
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

  it('removes decorative action glyphs while separating read-only time from deletion', () => {
    const classicComponent = readSource('./WelcomeScene.tsx');
    const recentItemStyles = stylesheet.slice(
      stylesheet.indexOf('&__recent-item {'),
      stylesheet.indexOf('&__recent-host,'),
    );

    for (const contract of [
      '&__section-label {',
      '&__link-btn {',
      '> svg {\n        display: none;',
      '&__recent-time {',
      '&__recent-remove-btn {',
      '&:focus-visible {',
      'outline: 2px solid var(--workspace-focus-ring);',
    ]) {
      expect(stylesheet).toContain(contract);
    }

    expect(classicComponent).toContain('<time');
    expect(classicComponent).toContain('className="welcome-scene__recent-time"');
    expect(classicComponent).toContain('className="welcome-scene__recent-remove-btn"');
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

  it('keeps touch removal explicit without expanding mouse-driven rows', () => {
    const coarsePointerStart = stylesheet.indexOf(
      '@media (hover: none), (pointer: coarse)',
    );
    const reducedMotionStart = stylesheet.indexOf(
      '@media (prefers-reduced-motion: reduce)',
      coarsePointerStart,
    );
    const coarsePointerStyles = stylesheet.slice(
      coarsePointerStart,
      reducedMotionStart,
    );
    const desktopStyles = stylesheet.slice(0, coarsePointerStart);

    expect(coarsePointerStyles).toContain(
      'min-height: var(--workspace-touch-target);',
    );
    expect(coarsePointerStyles).toContain('touch-action: manipulation;');
    expect(coarsePointerStyles).toContain('&__recent-remove-btn {');
    expect(coarsePointerStyles).toContain('opacity: 1;');
    expect(desktopStyles).not.toContain(
      'min-height: var(--workspace-touch-target);',
    );
  });
});
