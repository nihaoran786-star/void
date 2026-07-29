import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
    .replace(/\r\n/g, '\n');

describe('composer persona presentation contract', () => {
  it('shows a localized agent name or a localized generic label instead of an internal id', () => {
    const source = readSource('./ChatInput.tsx');
    const capsule = source.match(
      /\{composerActivePersonaBinding\?\.kind === 'agent'[\s\S]*?<\/div>\s*\)\}/,
    )?.[0];

    expect(source).toContain('localizeCatalogPresentation(');
    expect(source).toContain("tCommon('customization.composerPersona.selectedAgent')");
    expect(capsule).toContain('{activePersonaDisplayName}');
    expect(capsule).not.toContain('personaId');
  });

  it('uses common three-locale keys for action feedback and the clear button', () => {
    const source = readSource('./ChatInput.tsx');
    for (const key of [
      'activationFailed',
      'clearFailed',
      'teamActionFailed',
      'clearPersona',
    ]) {
      expect(source).toContain(`customization.composerPersona.${key}`);
    }

    const localePaths = [
      '../../locales/en-US/common.json',
      '../../locales/zh-CN/common.json',
      '../../locales/zh-TW/common.json',
    ];
    for (const localePath of localePaths) {
      const locale = JSON.parse(readSource(localePath)) as {
        customization: {
          composerPersona: Record<string, string>;
        };
      };
      expect(locale.customization.composerPersona).toMatchObject({
        selectedAgent: expect.any(String),
        unsupportedWeb: expect.any(String),
        activationFailed: expect.any(String),
        clearFailed: expect.any(String),
        teamActionFailed: expect.any(String),
        clearPersona: expect.any(String),
      });
    }
  });

  it('renders an explicit unsupported state without actionable catalog rows', () => {
    const source = readSource('./ComposerPersonaPicker.tsx');

    expect(source).toContain("status === 'unsupported'");
    expect(source).toContain(
      "tCommon('customization.composerPersona.unsupportedWeb')",
    );
    expect(source).toContain("status !== 'unsupported'");
  });
});
