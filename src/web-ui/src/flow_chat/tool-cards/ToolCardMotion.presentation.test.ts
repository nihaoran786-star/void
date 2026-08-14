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

  it('removes the duplicate task ring and decorative caret animations', () => {
    expect(taskToolSource).not.toContain('task-status-ring-orbit');
    expect(taskToolSource).not.toContain('task-status-ring-draw');
    expect(taskToolSource).not.toContain('task-steps-caret');
    expect(taskToolSource).toContain('&__step');
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

  it('uses the original Beautiful UI thinking component without a duplicate animation layer', () => {
    expect(thinkingSource).toContain("components/thinking-state'");
    expect(thinkingSource).toContain('alwaysExpanded');
    expect(thinkingSource).not.toContain('useThinkingElapsed');
    expect(thinkingSource).not.toContain('useTypewriter');
    expect(thinkingSource).not.toContain("await import('thinking-orbs')");
  });
});
