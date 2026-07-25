import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ChatPane.scss', import.meta.url), 'utf8');

describe('new-task draft examples presentation', () => {
  it('keeps compact office examples outside the greeting layout', () => {
    expect(source).toMatch(
      /\.welcome-panel__cowork\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*min\(100%, 172px\);/,
    );
    expect(source).toMatch(
      /\.void-cowork-example-cards__card\s*\{[\s\S]*?min-height:\s*14px;/,
    );
    expect(source).toMatch(
      /\.void-cowork-example-cards__grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(source).toMatch(
      /@media \(max-height: 619px\)[\s\S]*?\.welcome-panel__cowork\s*\{[\s\S]*?top:\s*calc\(100% \+ 50px\);/,
    );
  });

  it('opens slash commands below the centered draft composer only on tall views', () => {
    expect(source).toMatch(
      /@media \(min-height: 620px\)[\s\S]*?\.void-chat-input__slash-command-picker\s*\{[\s\S]*?top:\s*calc\(100% \+ 120px\);[\s\S]*?bottom:\s*auto;/,
    );
    expect(source).toMatch(
      /\.void-chat-input__slash-command-list\s*\{[\s\S]*?max-height:\s*min\(240px, calc\(57vh - 238px\)\);/,
    );
    expect(source).toMatch(
      /@media \(max-height: 619px\)[\s\S]*?\.void-chat-input__slash-command-picker\s*\{[\s\S]*?max-height:\s*clamp\(80px, calc\(100vh - 392px\), 220px\);/,
    );
    expect(source).toMatch(
      /@media \(max-height: 619px\)[\s\S]*?\.void-chat-input__slash-command-header\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(source).not.toMatch(
      /@media \(max-height: 619px\)[\s\S]*?\.void-chat-input__slash-command-picker\s*\{[\s\S]*?top:/,
    );
  });

  it('lets the draft editor grow with content before switching to internal scroll', () => {
    expect(source).toMatch(
      /@media \(min-height: 620px\)[\s\S]*?\.void-chat-input__box\s*\{[\s\S]*?min-height:\s*160px;[\s\S]*?max-height:\s*min\(340px, 55vh\);/,
    );
    expect(source).toMatch(
      /@media \(min-height: 620px\)[\s\S]*?\.rich-text-input\s*\{[\s\S]*?min-height:\s*56px !important;[\s\S]*?max-height:\s*min\(216px, 28vh\) !important;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(source).not.toMatch(
      /\.rich-text-input\s*\{[\s\S]*?min-height:\s*56px !important;[\s\S]*?max-height:\s*56px !important;/,
    );
  });
});
