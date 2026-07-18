import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./EditorArea.minimal.scss', import.meta.url),
  'utf8',
);

describe('EditorArea minimal short-drama team layout contract', () => {
  it('keeps the real agent panel as a readable overlay instead of compressing the primary surface', () => {
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__primary \{[\s\S]*?width: 100% !important;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-split-handle \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__secondary \{[\s\S]*?position: absolute;[\s\S]*?width: min\([\s\S]*?420px,[\s\S]*?100%[\s\S]*?\) !important;[\s\S]*?max-width: 420px;/,
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

  it('gives short-drama and media surfaces a readable compact-panel floor', () => {
    expect(source).toMatch(
      /\.void-ui--minimal[\s\S]*?\.void-session-scene__aux-pane:not\([\s\S]*?:has\(\.short-drama-center, \.workspace-media-gallery\)[\s\S]*?min-width: min\(420px, 36vw\);/,
    );
  });

  it('keeps all team layout overrides scoped to the minimal presentation', () => {
    expect(source).toMatch(
      /\.void-ui--minimal \.canvas-editor-area\.is-short-drama-team/,
    );
    expect(source).toMatch(
      /\.void-ui--minimal \.thinking-collapsed-header \{[\s\S]*?\.thinking-label,[\s\S]*?\.thinking-chevron \{[\s\S]*?color: var\(--workspace-text-muted\);[\s\S]*?opacity: 1;/,
    );
  });
});
