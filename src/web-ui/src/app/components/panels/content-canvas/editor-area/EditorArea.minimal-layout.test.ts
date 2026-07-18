import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./EditorArea.minimal.scss', import.meta.url),
  'utf8',
);

describe('EditorArea minimal short-drama team layout contract', () => {
  it('keeps the real agent panel as a bounded overlay instead of compressing the primary surface', () => {
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__primary \{[\s\S]*?width: 100% !important;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-split-handle \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /&\.is-short-drama-team-open[\s\S]*?> \.canvas-editor-area__secondary \{[\s\S]*?position: absolute;[\s\S]*?max-width: 300px;/,
    );
    expect(source).not.toContain('--short-drama-team-primary-ratio');
    expect(source).not.toContain('--short-drama-team-secondary-ratio');
  });

  it('keeps all team layout overrides scoped to the minimal presentation', () => {
    expect(source).toMatch(
      /\.void-ui--minimal \.canvas-editor-area\.is-short-drama-team/,
    );
  });
});
