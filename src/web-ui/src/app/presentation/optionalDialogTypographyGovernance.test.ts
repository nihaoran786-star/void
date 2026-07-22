import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheets = {
  about: readFileSync(
    new URL('../components/AboutDialog/AboutDialog.scss', import.meta.url),
    'utf8',
  ),
  remoteConnect: readFileSync(
    new URL(
      '../components/RemoteConnectDialog/RemoteConnectDialog.scss',
      import.meta.url,
    ),
    'utf8',
  ),
  remoteDisclaimer: readFileSync(
    new URL(
      '../components/RemoteConnectDialog/RemoteConnectDisclaimer.scss',
      import.meta.url,
    ),
    'utf8',
  ),
  newProject: readFileSync(
    new URL(
      '../components/NewProjectDialog/NewProjectDialog.scss',
      import.meta.url,
    ),
    'utf8',
  ),
};

const findRawFontSizeConsumers = (source: string) =>
  [...source.matchAll(/(?<![-\w])font-size\s*:\s*\d+(?:\.\d+)?px\b/g)].map(
    match => match[0],
  );

const countTokenConsumers = (source: string, token: string) =>
  source.match(
    new RegExp(
      `font-size\\s*:\\s*var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
      'g',
    ),
  )?.length ?? 0;

const canonicalDistribution = (source: string) => ({
  '2xl': countTokenConsumers(source, '--font-size-2xl'),
  sm: countTokenConsumers(source, '--font-size-sm'),
  xs: countTokenConsumers(source, '--font-size-xs'),
  '2xs': countTokenConsumers(source, '--font-size-2xs'),
  xxs: countTokenConsumers(source, '--font-size-xxs'),
});

describe('optional dialog typography governance', () => {
  it('keeps all four optional-dialog stylesheets free of direct pixel consumers', () => {
    for (const source of Object.values(stylesheets)) {
      expect(findRawFontSizeConsumers(source)).toEqual([]);
    }
  });

  it('keeps the exact canonical token distribution', () => {
    expect(canonicalDistribution(stylesheets.about)).toEqual({
      '2xl': 0,
      sm: 0,
      xs: 5,
      '2xs': 7,
      xxs: 2,
    });
    expect(canonicalDistribution(stylesheets.remoteConnect)).toEqual({
      '2xl': 0,
      sm: 2,
      xs: 10,
      '2xs': 0,
      xxs: 0,
    });
    expect(canonicalDistribution(stylesheets.remoteDisclaimer)).toEqual({
      '2xl': 0,
      sm: 0,
      xs: 3,
      '2xs': 0,
      xxs: 0,
    });
    expect(canonicalDistribution(stylesheets.newProject)).toEqual({
      '2xl': 1,
      sm: 0,
      xs: 8,
      '2xs': 2,
      xxs: 1,
    });
  });

  it('keeps non-standard Classic sizes explicit, exact, and component-local', () => {
    const declarations = Object.values(stylesheets).flatMap(source =>
      [
        ...source.matchAll(
          /(--(?:about|remote)-[\w-]+-size)\s*:\s*(\d+(?:\.\d+)?px)\s*;/g,
        ),
      ].map(match => `${match[1]}: ${match[2]}`),
    );

    expect(declarations).toEqual([
      '--about-title-size: 28px',
      '--about-responsive-title-size: 20px',
      '--about-dependency-license-size: 9px',
      '--about-dependency-tag-size: 8px',
      '--remote-pairing-code-size: 36px',
      '--remote-ngrok-link-size: 12.5px',
    ]);

    expect({
      aboutTitle: countTokenConsumers(stylesheets.about, '--about-title-size'),
      aboutResponsiveTitle: countTokenConsumers(
        stylesheets.about,
        '--about-responsive-title-size',
      ),
      aboutDependencyLicense: countTokenConsumers(
        stylesheets.about,
        '--about-dependency-license-size',
      ),
      aboutDependencyTag: countTokenConsumers(
        stylesheets.about,
        '--about-dependency-tag-size',
      ),
      remotePairingCode: countTokenConsumers(
        stylesheets.remoteConnect,
        '--remote-pairing-code-size',
      ),
      remoteNgrokLink: countTokenConsumers(
        stylesheets.remoteConnect,
        '--remote-ngrok-link-size',
      ),
    }).toEqual({
      aboutTitle: 1,
      aboutResponsiveTitle: 2,
      aboutDependencyLicense: 1,
      aboutDependencyTag: 1,
      remotePairingCode: 1,
      remoteNgrokLink: 1,
    });
  });

  it('detects a synthesized direct-size regression', () => {
    const mutated =
      `${stylesheets.about}\n.synthetic-dialog { font-size: 17px; }`;

    expect(findRawFontSizeConsumers(mutated)).toEqual([
      'font-size: 17px',
    ]);
  });
});
