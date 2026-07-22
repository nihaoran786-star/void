import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  new URL(
    '../components/panels/review-platform/ReviewPlatformPanel.scss',
    import.meta.url,
  ),
  'utf8',
);

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

describe('Review Platform typography governance', () => {
  it('has no direct pixel font-size consumer', () => {
    expect(findRawFontSizeConsumers(stylesheet)).toEqual([]);
  });

  it('keeps the exact canonical token distribution', () => {
    expect({
      xxs: countTokenConsumers(stylesheet, '--font-size-xxs'),
      '2xs': countTokenConsumers(stylesheet, '--font-size-2xs'),
      xs: countTokenConsumers(stylesheet, '--font-size-xs'),
      sm: countTokenConsumers(stylesheet, '--font-size-sm'),
      base: countTokenConsumers(stylesheet, '--font-size-base'),
      lg: countTokenConsumers(stylesheet, '--font-size-lg'),
    }).toEqual({
      xxs: 6,
      '2xs': 27,
      xs: 18,
      sm: 3,
      base: 1,
      lg: 1,
    });
  });

  it('does not introduce Review Platform font-size aliases', () => {
    expect(stylesheet).not.toMatch(/--review-platform-[\w-]*font-size\b/);
  });

  it('detects a synthesized raw-size regression', () => {
    const mutated =
      `${stylesheet}\n.review-platform__synthetic { font-size: 17px; }`;

    expect(findRawFontSizeConsumers(mutated)).toEqual([
      'font-size: 17px',
    ]);
  });
});
