// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(
  new URL('./QuickLook.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const baseStylesheet = readFileSync(
  new URL('./QuickLook.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const minimalStylesheet = readFileSync(
  new URL('./QuickLook.minimal.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

describe('QuickLook presentation boundary', () => {
  it('keeps preview callbacks intact and gives its portal explicit, named controls', () => {
    expect(component).toContain('role="dialog"');
    expect(component).toContain('aria-label={content.title}');
    expect(component).toContain('aria-label={t(\'canvas.pinAsTab\')}');
    expect(component).toContain('aria-label={t(\'canvas.closeEsc\')}');
    expect(component).toContain('previouslyFocusedElement.focus({ preventScroll: true })');
    expect(component).toContain('onContentChange={handleContentChange}');
    expect(component).not.toContain('ExternalLink');
  });

  it('cleans delayed pin work and uses the shared Minimal presentation tokens', () => {
    expect(component).toContain('clearTimeout(pinTimerRef.current)');
    expect(minimalStylesheet).toContain('.void-ui--minimal .canvas-quick-look');
    expect(minimalStylesheet).toContain('var(--workspace-shadow-raised)');
    expect(minimalStylesheet).toContain('var(--workspace-icon-target)');
    expect(minimalStylesheet).toContain(
      '.canvas-quick-look__content {\n      background: var(--workspace-surface-raised);',
    );
    expect(minimalStylesheet).toContain('.void-flexible-panel__content,');
    expect(minimalStylesheet).toContain('backdrop-filter: none;');
    expect(baseStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
