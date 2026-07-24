import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

describe('AcpAgentsConfig Minimal presentation', () => {
  it('uses a feature-owned token projection with component responsiveness', () => {
    const owner = readSource('./AcpAgentsConfig.scss');
    const styles = readSource('./AcpAgentsConfig.minimal.scss');

    expect(owner).toContain("@use './AcpAgentsConfig.minimal' as minimal;");
    expect(owner).toContain('@include minimal.styles;');
    expect(styles).toContain('.void-ui--minimal .void-acp-agents');
    expect(styles).toContain('@container config-panel (max-width: 520px)');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) auto auto;');
    expect(styles).toContain('var(--workspace-surface-panel)');
    expect(styles).not.toMatch(/(?:linear|radial)-gradient|backdrop-filter|rgba?\(/);
  });

  it('keeps compact toolbar actions named and localizes preset descriptions', () => {
    const source = readSource('./AcpAgentsConfig.tsx');
    const zhCn = JSON.parse(readSource(
      '../../../locales/zh-CN/settings/acp-agents.json',
    )) as Record<string, unknown>;

    expect(source).toContain('aria-label={t(\'actions.refresh\')}');
    expect(source).toContain('title={t(\'actions.learnMore\')}');
    expect(source).toContain('t(`presets.${preset.id}.description`');
    expect(zhCn).toHaveProperty('presets.opencode.description');
    expect(zhCn).toHaveProperty('presets.claude-code.description');
    expect(zhCn).toHaveProperty('presets.codex.description');
  });
});
