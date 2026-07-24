import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

describe('AppearanceConfig presentation hierarchy', () => {
  it('uses a distinct interface section without repeating the page copy', () => {
    const source = readSource('./AppearanceConfig.tsx');

    expect(source).toContain(
      "const { t: tAppearance } = useTranslation('settings/appearance');",
    );
    expect(source).toContain(
      "<ConfigPageSection title={tAppearance('interfaceSection')}>",
    );
    expect(source).not.toContain(
      "<ConfigPageSection title={t('appearance.title')} description={t('appearance.hint')}>",
    );
  });

  it('names language and theme controls from their visible labels', () => {
    const source = readSource('./AppearanceConfig.tsx');

    expect(source).toContain("ariaLabel={t('appearance.language')}");
    expect(source).toContain("ariaLabel={t('appearance.themes')}");
  });

  it('uses a flat Minimal list and keeps interface controls inline when narrow', () => {
    const styles = readSource('./AppearanceConfig.scss');

    expect(styles).toContain(
      '.void-ui--minimal .void-appearance-config {\n  .void-config-page-section__body {',
    );
    expect(styles).toContain('border-width: 1px 0 0;');
    expect(styles).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(140px, 42%);',
    );
  });

  it('localizes font controls and removes the empty reset column', () => {
    const source = readSource(
      '../../font-preference/components/FontPreferencePanel.tsx',
    );
    const styles = readSource(
      '../../font-preference/components/FontPreferencePanel.scss',
    );

    expect(source).toContain(
      "aria-label={t('appearance.fontSize.previewLabel')}",
    );
    expect(source).toContain(
      "aria-label={t('appearance.fontSize.customPxLabel')}",
    );
    expect(source).toContain(
      "ariaLabel={t('appearance.fontSize.flowChatLabel')}",
    );
    expect(source).toContain('className="font-pref-panel__row--reset"');
    expect(styles).toContain(
      '&__row--reset.void-config-page-row {\n    grid-template-columns: minmax(0, 1fr);',
    );
  });
});
