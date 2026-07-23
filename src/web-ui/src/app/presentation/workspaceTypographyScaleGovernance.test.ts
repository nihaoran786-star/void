import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('workspace typography scale governance', () => {
  it('owns the complete compact workspace hierarchy', () => {
    const tokens = readSource(
      '../../component-library/styles/tokens.scss',
    );

    for (const declaration of [
      '--workspace-font-size-micro: calc(#{$font-size-2xs} - 1px);',
      '--workspace-font-size-meta: #{$font-size-2xs};',
      '--workspace-font-size-label: #{$font-size-xs};',
      '--workspace-font-size-control: #{$font-size-sm};',
      '--workspace-font-size-body: #{$font-size-base};',
      '--workspace-font-size-title: #{$font-size-xl};',
      '--workspace-font-size-lead: #{$font-size-2xl};',
      '--workspace-font-size-display: #{$font-size-3xl};',
    ]) {
      expect(tokens).toContain(declaration);
    }
  });

  it('keeps automation typography projected through workspace roles', () => {
    const automationTheme = readSource(
      '../scenes/automation/AutomationScene.theme.scss',
    );

    for (const role of ['micro', 'lead', 'display']) {
      expect(automationTheme).toContain(
        `--as-font-size-${role}: var(--workspace-font-size-${role});`,
      );
    }
  });
});
