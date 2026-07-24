import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

describe('QuickActionsConfig presentation', () => {
  it('keeps the action state visible while progressively disclosing secondary actions', () => {
    const source = readSource('./QuickActionsConfig.tsx');
    const styles = readSource('./QuickActionsConfig.scss');

    expect(source).toContain('aria-label={actionText.label}');
    expect(source).toContain('quick-actions-config__row-secondary-controls');
    expect(styles).toContain('&:focus-within');
    expect(styles).toContain('@media (hover: none), (pointer: coarse)');
    expect(styles).toContain(
      '.quick-actions-config__row-secondary-controls {\n    opacity: 1;',
    );
  });

  it('uses one add action and a compact tokenized empty state', () => {
    const source = readSource('./QuickActionsConfig.tsx');
    const styles = readSource('./QuickActionsConfig.scss');

    expect(
      source.match(/onClick=\{\(\) => setModalTarget\(null\)\}/g),
    ).toHaveLength(1);
    expect(source).not.toContain('quick-actions-config__empty-icon');
    expect(styles).toContain('min-height: var(--workspace-control-height-primary);');
    expect(styles).toContain('font-size: var(--workspace-font-size-meta);');
    expect(styles).toContain('.void-ui--minimal .quick-actions-config');
    expect(styles).toContain('var(--workspace-border-subtle)');
  });
});
