import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ChatPane.scss', import.meta.url), 'utf8');

describe('new-task draft examples presentation', () => {
  it('keeps compact office examples outside the greeting layout', () => {
    expect(source).toMatch(
      /\.welcome-panel__cowork\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*min\(100%, 460px\);/,
    );
    expect(source).toMatch(
      /\.void-cowork-example-cards__card\s*\{[\s\S]*?min-height:\s*30px;/,
    );
    expect(source).toMatch(
      /\.void-cowork-example-cards__grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(source).toMatch(
      /@media \(max-height: 619px\)[\s\S]*?\.welcome-panel__cowork\s*\{[\s\S]*?top:\s*calc\(100% \+ 48px\);/,
    );
  });
});
