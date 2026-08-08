import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ChatPane.scss', import.meta.url), 'utf8');
const welcomeSource = readFileSync(
  new URL('../../../flow_chat/components/WelcomePanel.css', import.meta.url),
  'utf8',
);
const examplesSource = readFileSync(
  new URL('../../../flow_chat/components/SessionModeExampleCards.scss', import.meta.url),
  'utf8',
);

describe('new-task draft examples presentation', () => {
  it('keeps readable mode examples between the mode switch and composer', () => {
    expect(source).toMatch(
      /\.welcome-panel__examples\s*\{[\s\S]*?position:\s*static;[\s\S]*?width:\s*min\(100%, 640px\);/,
    );
    expect(source).toMatch(
      /\.void-session-example-cards__option\s*\{[\s\S]*?min-height:\s*36px;/,
    );
    expect(source).toMatch(
      /\.void-session-example-cards__grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(source).not.toContain('width: min(100%, 172px);');
    expect(source).not.toContain('min-height: 14px;');
  });

  it('keeps every viewport ratio in one centered non-overlapping layout flow', () => {
    expect(source).toMatch(
      /\.void-chat-pane__content:has\(\.welcome-panel__creation-modes\)\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*minmax\(170px, 1fr\) auto minmax\(var\(--workspace-space-2\), 1fr\);/,
    );
    expect(source).toMatch(
      /\.welcome-panel__creation-modes\s*\{[\s\S]*?position:\s*static;[\s\S]*?transform:\s*none;/,
    );
    expect(source).toMatch(
      /\.welcome-panel__examples\s*\{[\s\S]*?position:\s*static;[\s\S]*?transform:\s*none;/,
    );
    expect(source).toMatch(
      /\.void-chat-input-drop-zone\s*\{[\s\S]*?position:\s*relative;[\s\S]*?grid-row:\s*2;[\s\S]*?transform:\s*none;/,
    );
    expect(source).toMatch(
      /\.welcome-panel\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?padding-bottom:\s*var\(--workspace-space-4\);/,
    );
    expect(source).not.toContain('--new-session-composer-anchor');
    expect(source).not.toContain('@media (min-height: 520px)');
    expect(source).not.toContain('@media (max-height: 519px)');
  });

  it('opens slash commands below the centered draft composer only on tall views', () => {
    expect(source).toMatch(
      /@media \(min-height: 600px\)[\s\S]*?\.void-chat-input__slash-command-picker\s*\{[\s\S]*?top:\s*calc\(100% \+ 120px\);[\s\S]*?bottom:\s*auto;/,
    );
    expect(source).toMatch(
      /\.void-chat-input__slash-command-list\s*\{[\s\S]*?max-height:\s*min\(240px, calc\(57vh - 238px\)\);/,
    );
    expect(source).not.toContain('@media (max-height: 519px)');
  });

  it('lets the draft editor grow with content before switching to internal scroll', () => {
    expect(source).toMatch(
      /\.void-chat-input__box\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*calc\(\s*var\(--workspace-control-height\) \+\s*var\(--workspace-space-8\)\s*\);[\s\S]*?max-height:\s*min\(340px, 55vh\);/,
    );
    expect(source).toMatch(
      /\.rich-text-input\s*\{[\s\S]*?min-height:\s*22px !important;[\s\S]*?max-height:\s*min\(216px, 28vh\) !important;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(source).not.toMatch(
      /\.rich-text-input\s*\{[\s\S]*?min-height:\s*56px !important;[\s\S]*?max-height:\s*56px !important;/,
    );
  });

  it('uses a clear accent highlight for the active mode and example interactions', () => {
    expect(welcomeSource).toMatch(
      /\.welcome-panel__creation-mode\.is-active\s*\{[\s\S]*?background:\s*color-mix\([\s\S]*?var\(--color-accent-500\)\s*12%,[\s\S]*?var\(--color-bg-elevated\)\s*\);[\s\S]*?0 3px 10px/,
    );
    expect(examplesSource).toMatch(
      /&__option\s*\{[\s\S]*?&:hover\s*\{[\s\S]*?border-color:\s*var\(--color-accent-500\);[\s\S]*?background:\s*color-mix\([\s\S]*?var\(--color-accent-500\)\s*8%,[\s\S]*?var\(--color-bg-elevated\)\s*\);[\s\S]*?transform:\s*translateY\(-1px\);/,
    );
    expect(examplesSource).toMatch(
      /&:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--workspace-focus-ring, var\(--color-accent-500\)\);/,
    );
  });
});
