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
});
