import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const minimalToolCardSource = readFileSync(
  new URL('./ToolCardShell.minimal.scss', import.meta.url),
  'utf8',
);

const taskToolSource = readFileSync(
  new URL('./TaskToolDisplay.scss', import.meta.url),
  'utf8',
);

const thinkingSource = readFileSync(
  new URL('./ModelThinkingDisplay.tsx', import.meta.url),
  'utf8',
);

describe('tool card motion presentation', () => {
  it('uses the status slot as the only running signal for compact tool rows', () => {
    expect(minimalToolCardSource).toMatch(
      /compact-tool-card-wrapper--loading-shimmer[\s\S]*?\.compact-tool-card::before[\s\S]*?display:\s*none;/,
    );
    expect(minimalToolCardSource).toMatch(
      /compact-tool-card-wrapper--loading-shimmer[\s\S]*?\.compact-card-content[\s\S]*?background:\s*none;[\s\S]*?animation:\s*none;/,
    );
  });

  it('keeps one functional task status animation without a decorative caret', () => {
    expect(taskToolSource).toContain('task-status-ring-orbit');
    expect(taskToolSource).toContain('.task-steps__step');
    expect(minimalToolCardSource).toMatch(
      /\.task-steps__step--now::after[\s\S]*?display:\s*none;/,
    );
  });

  it('keeps task shell state transitions off geometry properties', () => {
    expect(minimalToolCardSource).toMatch(
      /\.base-tool-card-wrapper\.task-tool-display\s*\{[\s\S]*?transition:[\s\S]*?border-color[\s\S]*?background[\s\S]*?box-shadow[\s\S]*?;/,
    );
    expect(minimalToolCardSource).not.toContain('transition: all');
  });

  it('reveals compact hover actions without changing row width', () => {
    expect(minimalToolCardSource).toMatch(
      /\.compact-tool-card \.compact-extra-on-hover\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?transition:[\s\S]*?opacity[\s\S]*?transform[\s\S]*?;/,
    );
    expect(minimalToolCardSource).toMatch(
      /\.compact-tool-card:is\(:hover, :focus-within\)\s+\.compact-extra-on-hover/,
    );
    expect(minimalToolCardSource).not.toMatch(
      /compact-extra-on-hover[\s\S]*?transition:[^;]*(?:width|max-width)/,
    );
  });

  it('reserves the signature composing motion for the thinking orb', () => {
    expect(thinkingSource).toContain("await import('thinking-orbs')");
    expect(thinkingSource).toContain('state="composing"');
  });
});
