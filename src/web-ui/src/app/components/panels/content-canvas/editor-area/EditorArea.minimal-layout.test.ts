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
    expect(source).toMatch(
      /\.btw-session-panel__composer \{[\s\S]*?padding: var\(--workspace-space-2\);[\s\S]*?border: 0;[\s\S]*?background: var\(--workspace-surface-panel\);/,
    );
    expect(source).toMatch(
      /\.btw-session-panel__composer-box \{[\s\S]*?min-height: var\(--workspace-composer-min-height\);[\s\S]*?max-height: min\(240px, 38vh\);[\s\S]*?padding: var\(--workspace-space-2\);[\s\S]*?border-radius: var\(--workspace-radius-composer\);[\s\S]*?background: var\(--workspace-surface-raised\);[\s\S]*?transition: none;[\s\S]*?&:focus-within \{[\s\S]*?border-color: var\(--workspace-focus-ring-subtle\);[\s\S]*?box-shadow: none;/,
    );
    expect(source).toMatch(
      /\.btw-session-panel__composer-row \{[\s\S]*?display: grid;[\s\S]*?grid-template-areas:[\s\S]*?'input input input'[\s\S]*?'image file send';[\s\S]*?grid-template-columns: auto auto minmax\(0, 1fr\);[\s\S]*?row-gap: var\(--workspace-space-2\);/,
    );
    expect(source).toMatch(
      /\.btw-session-panel__composer-input \{[\s\S]*?grid-area: input;[\s\S]*?min-height: 22px;[\s\S]*?font-family: var\(--workspace-font-family\);[\s\S]*?font-size: var\(--workspace-font-size-body\);[\s\S]*?&:focus,[\s\S]*?&:focus-visible \{[\s\S]*?outline: none;[\s\S]*?box-shadow: none;[\s\S]*?&::placeholder \{[\s\S]*?color: var\(--workspace-text-muted\);/,
    );
    expect(source).toMatch(
      /\.btw-session-panel__composer-attach-button \{[\s\S]*?&--image \{[\s\S]*?grid-area: image;[\s\S]*?&--file \{[\s\S]*?grid-area: file;[\s\S]*?\.btw-session-panel__composer-button \{[\s\S]*?grid-area: send;[\s\S]*?justify-self: end;/,
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
      /\.short-drama-team-panel-controls__summary-icon \{[\s\S]*?place-items: center;/,
    );
    expect(source).not.toContain(
      '.short-drama-team-panel-controls__summary-label',
    );
    expect(source).toMatch(
      /\.short-drama-team-panel-controls__summary \{[\s\S]*?border-radius: var\(--workspace-radius-control\);[\s\S]*?background: var\(--workspace-surface-panel\);[\s\S]*?box-shadow: none;/,
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
