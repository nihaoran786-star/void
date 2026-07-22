import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheets = {
  fileBrowser: readFileSync(
    new URL('../../features/ssh-remote/RemoteFileBrowser.scss', import.meta.url),
    'utf8',
  ),
  connection: readFileSync(
    new URL(
      '../../features/ssh-remote/SSHConnectionDialog.scss',
      import.meta.url,
    ),
    'utf8',
  ),
  authPrompt: readFileSync(
    new URL(
      '../../features/ssh-remote/SSHAuthPromptDialog.scss',
      import.meta.url,
    ),
    'utf8',
  ),
  confirmation: readFileSync(
    new URL('../../features/ssh-remote/ConfirmDialog.scss', import.meta.url),
    'utf8',
  ),
};

const combinedStylesheet = Object.values(stylesheets).join('\n');
const canonicalTokens = new Set([
  '--font-size-2xs',
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-base',
  '--font-size-xl',
]);

const findRawFontSizeConsumers = (source: string) =>
  [
    ...source.matchAll(
      /(?<![-\w])font-size\s*:\s*\d+(?:\.\d+)?(?:px|rem|em)\b/g,
    ),
  ].map(match => match[0]);

const findTokenConsumers = (source: string) =>
  [
    ...source.matchAll(
      /(?<![-\w])font-size\s*:\s*var\((--font-size-[\w-]+)\)/g,
    ),
  ].map(match => match[1]);

const countTokenConsumers = (source: string, token: string) =>
  findTokenConsumers(source).filter(consumer => consumer === token).length;

describe('SSH Remote typography governance', () => {
  it('keeps all four SSH Remote stylesheets free of raw font-size consumers', () => {
    for (const source of Object.values(stylesheets)) {
      expect(findRawFontSizeConsumers(source)).toEqual([]);
    }
  });

  it('uses only canonical typography tokens for font-size declarations', () => {
    expect(
      findTokenConsumers(combinedStylesheet).filter(
        token => !canonicalTokens.has(token),
      ),
    ).toEqual([]);
  });

  it('keeps the exact canonical token distribution', () => {
    expect({
      '2xs': countTokenConsumers(combinedStylesheet, '--font-size-2xs'),
      xs: countTokenConsumers(combinedStylesheet, '--font-size-xs'),
      sm: countTokenConsumers(combinedStylesheet, '--font-size-sm'),
      base: countTokenConsumers(combinedStylesheet, '--font-size-base'),
      xl: countTokenConsumers(combinedStylesheet, '--font-size-xl'),
    }).toEqual({
      '2xs': 9,
      xs: 6,
      sm: 13,
      base: 3,
      xl: 2,
    });
  });

  it('does not depend on the minimal presentation override', () => {
    expect(Object.keys(stylesheets)).not.toContain('minimal');
    expect(combinedStylesheet).not.toContain('RemoteFileBrowser.minimal.scss');
  });

  it('detects a synthesized raw-size regression', () => {
    const mutated =
      `${stylesheets.fileBrowser}\n.synthetic-ssh-row { font-size: 1rem; }`;

    expect(findRawFontSizeConsumers(mutated)).toEqual(['font-size: 1rem']);
  });
});
