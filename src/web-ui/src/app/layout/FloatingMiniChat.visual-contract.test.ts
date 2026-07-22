import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('FloatingMiniChat minimal visual contract', () => {
  it('keeps the Classic structural layer on canonical theme variables', () => {
    const stylesheet = readSource('./FloatingMiniChat.scss');

    expect(stylesheet).not.toMatch(
      /var\(\s*--[^,\s)]+\s*,\s*(?:#[\da-f]{3,8}\b|rgba?\(|hsla?\(|transparent\b|white\b|black\b)/i,
    );
    expect(stylesheet).toContain('background: linear-gradient(135deg,');
  });

  it('registers the Slice 13 desktop contract exactly once', () => {
    const webdriverConfig = readSource(
      '../../../../../tests/e2e/config/wdio.conf_l0.ts',
    );
    const spec = '../specs/l0-floating-mini-chat-visual.spec.ts';

    expect(webdriverConfig.split(spec)).toHaveLength(2);
  });

  it('is imported only through the Minimal presentation layer', () => {
    const presentation = readSource(
      '../presentation/minimalWorkspacePresentation.scss',
    );
    const stylesheet = readSource('./FloatingMiniChat.minimal.scss');

    expect(presentation).toContain(
      "@use '../layout/FloatingMiniChat.minimal.scss' as floating-mini-chat;",
    );
    expect(presentation).toContain('@include floating-mini-chat.styles;');
    expect(stylesheet).toContain('@mixin styles {');
    expect(stylesheet).toContain('.void-app-layout.void-ui--minimal {');
    expect(stylesheet).not.toContain('.void-ui--classic');
  });

  it('keeps the closed launcher edge-bound and the open panel inset', () => {
    const stylesheet = readSource('./FloatingMiniChat.minimal.scss');

    for (const contract of [
      '.void-fmc {\n      right: 0;',
      '&--open {\n        right: var(--workspace-space-3);',
      '&--miniapp-customizing {',
      'right: calc(clamp(380px, 38vw, 560px) + 44px);',
      '.void-settings-scene .void-config-page-content {',
      '+ 24px',
      'width: 25px;',
      'height: 40px;',
      'border-right: 0;',
      'box-shadow: none;',
      'width: 360px;',
      'height: 560px;',
      'max-width: calc(100vw - 24px);',
      'max-height: calc(100vh - 24px);',
      'border-radius: var(--workspace-radius-panel);',
      'background: var(--workspace-surface-raised);',
      'box-shadow: var(--workspace-shadow-raised);',
      '&--open {\n        opacity: 1;\n        transform: none;',
    ]) {
      expect(stylesheet).toContain(contract);
    }
  });

  it('uses static semantic status, control, and focus tokens', () => {
    const stylesheet = readSource('./FloatingMiniChat.minimal.scss');

    for (const contract of [
      'border-color: var(--workspace-status-info-border);',
      'background: var(--workspace-status-info-text);',
      'border-color: var(--workspace-status-error-border);',
      'background: var(--workspace-status-error-text);',
      'border-color: var(--workspace-status-warning-border);',
      'background: var(--workspace-status-warning-text);',
      'border-bottom-color: var(--workspace-border-subtle);',
      'background: var(--workspace-surface-panel);',
      'background: var(--workspace-surface-hover);',
      'outline: 2px solid var(--workspace-focus-ring);',
      '@media (prefers-reduced-motion: reduce)',
      'animation: none;',
      'transition: none;',
    ]) {
      expect(stylesheet).toContain(contract);
    }
  });

  it('does not reintroduce decorative effects or scale motion', () => {
    const stylesheet = readSource('./FloatingMiniChat.minimal.scss');

    expect(stylesheet).not.toMatch(/\blinear-gradient\s*\(/i);
    expect(stylesheet).not.toMatch(/@keyframes\b/i);
    expect(stylesheet).not.toMatch(/\b(?:glow|pulse)\b/i);
    expect(stylesheet).not.toMatch(/\bscale\s*\(/i);
  });
});
