import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./AIModelConfig.tsx', import.meta.url),
  'utf8',
);
const defaultSource = fs.readFileSync(
  new URL('./DefaultModelConfig.tsx', import.meta.url),
  'utf8',
);
const styles = fs.readFileSync(
  new URL('./AIModelConfig.scss', import.meta.url),
  'utf8',
);
const defaultStyles = fs.readFileSync(
  new URL('./DefaultModelConfig.scss', import.meta.url),
  'utf8',
);

describe('AIModelConfig presentation contract', () => {
  it('names the primary model-page controls from their visible labels', () => {
    const inputLabels = [
      "t('media.tokenLabel')",
      "t('media.baseUrlLabel')",
      "t('streamTtftTimeout.label')",
      "t('streamIdleTimeout.label')",
      "t('proxy.url')",
      "t('proxy.username')",
      "t('proxy.password')",
    ];

    for (const label of inputLabels) {
      expect(source).toContain(`aria-label={${label}}`);
    }

    expect(source).toContain("aria-label={t('proxy.enable')}");
    expect(source).toContain('aria-label={modelLabel}');
    expect(defaultSource).toContain("ariaLabel={t('core.primary.label')}");
    expect(defaultSource).toContain("ariaLabel={t('core.fast.label')}");
  });

  it('uses the localized input visibility labels', () => {
    expect(source).toContain("tComponents('input.show')");
    expect(source).toContain("tComponents('input.hide')");
    expect(source).not.toMatch(/tComponents\('(show|hide)'\)/);
  });

  it('keeps simple rows compact while allowing very narrow layouts to stack', () => {
    expect(styles).toContain(
      '.void-ui--minimal .void-ai-model-config {\n  --ai-model-compact-capability-font-size:',
    );
    expect(styles).toContain('border-width: 1px 0 0;');
    expect(styles).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(156px, 44%);',
    );
    expect(defaultStyles).toContain('&__compact-row {');
    expect(defaultStyles).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(156px, 44%);',
    );
    expect(styles).toContain('@container config-panel (max-width: 360px)');
    expect(defaultStyles).toContain('@container config-panel (max-width: 360px)');
  });
});
