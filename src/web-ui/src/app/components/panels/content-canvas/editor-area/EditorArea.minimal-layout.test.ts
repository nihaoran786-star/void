import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./EditorArea.minimal.scss', import.meta.url),
  'utf8',
);

describe('EditorArea minimal short-drama team layout contract', () => {
  it('gives the real agent panel its own bounded column without covering the primary surface', () => {
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__primary \{[\s\S]*?flex: 1 1 0;[\s\S]*?width: auto !important;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-split-handle \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__secondary \{[\s\S]*?position: relative;[\s\S]*?flex: 0 0 min\(360px, 32%\);[\s\S]*?width: min\(360px, 32%\) !important;[\s\S]*?max-width: 360px;[\s\S]*?box-shadow: none;/,
    );
    expect(source).toMatch(
      /@container short-drama-editor-area \(max-width: 720px\)[\s\S]*?&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__secondary \{[\s\S]*?position: absolute;[\s\S]*?width: min\(360px, calc\(100% - 48px\)\) !important;[\s\S]*?box-shadow: var\(--workspace-shadow-raised\);/,
    );
    expect(source).toContain(
      '.btw-session-panel__composer-input::placeholder',
    );
    expect(source).toMatch(
      /\.btw-session-panel__composer-box \{[\s\S]*?border-color: color-mix\([\s\S]*?var\(--workspace-text-muted\) 75%,[\s\S]*?var\(--workspace-surface-panel\)[\s\S]*?&:focus-within \{[\s\S]*?border-color: var\(--workspace-focus-ring\);/,
    );
    expect(source).not.toContain('--short-drama-team-primary-ratio');
    expect(source).not.toContain('--short-drama-team-secondary-ratio');
  });

  it('anchors one compact rail control without reserving a permanent side rail', () => {
    expect(source).toMatch(
      /&\.is-short-drama-team-rail[\s\S]*?> \.canvas-editor-area__primary \{[\s\S]*?width: 100% !important;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-rail[\s\S]*?> \.canvas-editor-area__secondary \{[\s\S]*?position: absolute;[\s\S]*?right: 0;[\s\S]*?width: 0 !important;[\s\S]*?max-width: 0;[\s\S]*?overflow: visible;/,
    );
    expect(source).toMatch(
      /\.short-drama-team-panel-controls__summary \{[\s\S]*?width: auto;[\s\S]*?border: 1px solid var\(--workspace-border-subtle\);/,
    );
    expect(source).toMatch(
      /@container short-drama-editor-area \(max-width: 560px\)[\s\S]*?\.short-drama-team-panel-controls__summary-label \{[\s\S]*?display: none;/,
    );
    expect(source).not.toContain('44px');
  });

  it('lets the session width controller keep media surfaces inside the scene', () => {
    expect(source).toMatch(
      /\.void-ui--minimal[\s\S]*?\.void-session-scene:has\([\s\S]*?\.short-drama-center, \.workspace-media-gallery[\s\S]*?> \.void-session-scene__chat-pane \{[\s\S]*?min-width: min\(400px, max\(0px, calc\(100% - 217px\)\)\);/,
    );
    expect(source).toMatch(
      /\.void-ui--minimal[\s\S]*?\.void-session-scene__aux-pane:not\([\s\S]*?:has\(\.short-drama-center, \.workspace-media-gallery\)[\s\S]*?min-width: min\(216px, 100%\);/,
    );
    expect(source).not.toContain('min-width: min(420px, 36vw)');
  });

  it('keeps all team layout overrides scoped to the minimal presentation', () => {
    expect(source).toMatch(
      /\.void-ui--minimal \.canvas-editor-area\.is-short-drama-team/,
    );
    expect(source).toMatch(
      /\.void-ui--minimal \.thinking-collapsed-header \{[\s\S]*?\.thinking-label,[\s\S]*?\.thinking-chevron \{[\s\S]*?color: var\(--workspace-text-muted\);[\s\S]*?opacity: 1;/,
    );
    expect(source).toContain(
      'font-size: var(--workspace-font-size-label);',
    );
    expect(source).toContain(
      'font-size: var(--workspace-font-size-title);',
    );
    expect(source).not.toMatch(/font-size:\s*\d+(?:\.\d+)?px/);
  });
});
