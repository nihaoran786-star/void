import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));

const targetStylesheets = [
  'app/scenes/git/GitNav.scss',
  'app/scenes/git/GitScene.scss',
  'app/scenes/git/views/BranchesView.scss',
  'app/scenes/git/views/GraphView.scss',
  'app/scenes/git/views/WorkingCopyView.scss',
  'tools/git/components/CreateBranchDialog/CreateBranchDialog.scss',
  'tools/git/components/GitBranchHistoryView/GitBranchHistoryView.scss',
  'tools/git/components/GitDiffView/GitDiffView.scss',
  'tools/git/components/GitGraphView/GitGraphView.scss',
  'tools/git/components/GitSettingsView/GitSettingsView.css',
  'tools/git/components/PushButton/PushButton.scss',
] as const;

const canonicalTokens = [
  'xxs',
  '2xs',
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
] as const;

type CanonicalToken = (typeof canonicalTokens)[number];
type TokenCounts = Record<CanonicalToken, number>;

const expectedTokenCounts: TokenCounts = {
  xxs: 14,
  '2xs': 15,
  xs: 37,
  sm: 23,
  base: 10,
  lg: 2,
  xl: 2,
  '2xl': 1,
};

const fontSizeDeclaration =
  /(?<![-\w])font-size\s*:\s*([^;]+);/g;
const forbiddenUnitOrFunction =
  /(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)\b|%|clamp\s*\(/i;
const canonicalTokenValue =
  /^var\(--font-size-(xxs|2xs|xs|sm|base|lg|xl|2xl)\)$/;

const auditSource = (
  source: string,
  path: string,
): { findings: string[]; counts: TokenCounts } => {
  const findings: string[] = [];
  const counts = Object.fromEntries(
    canonicalTokens.map(token => [token, 0]),
  ) as TokenCounts;

  for (const match of source.matchAll(fontSizeDeclaration)) {
    const value = match[1].trim();

    if (forbiddenUnitOrFunction.test(value)) {
      findings.push(`${path}: forbidden font-size ${value}`);
      continue;
    }

    if (value === '0') {
      continue;
    }

    const tokenMatch = value.match(canonicalTokenValue);
    if (!tokenMatch) {
      findings.push(`${path}: unsupported font-size ${value}`);
      continue;
    }

    counts[tokenMatch[1] as CanonicalToken] += 1;
  }

  return { findings, counts };
};

describe('Git typography governance', () => {
  it('uses only canonical font-size tokens across the fixed Git stylesheet set', () => {
    const findings: string[] = [];
    const actualTokenCounts = Object.fromEntries(
      canonicalTokens.map(token => [token, 0]),
    ) as TokenCounts;

    for (const path of targetStylesheets) {
      const audit = auditSource(readFileSync(join(sourceRoot, path), 'utf8'), path);
      findings.push(...audit.findings);
      for (const token of canonicalTokens) {
        actualTokenCounts[token] += audit.counts[token];
      }
    }

    expect(findings).toEqual([]);
    expect(actualTokenCounts).toEqual(expectedTokenCounts);
  });

  it('rejects direct units, clamp, and non-canonical values while allowing zero', () => {
    const syntheticSource = `
      .valid { font-size: var(--font-size-sm); }
      .zero { font-size: 0; }
      .px { font-size: 12px; }
      .rem { font-size: 0.75rem; }
      .em { font-size: 1em; }
      .percent { font-size: 80%; }
      .fluid { font-size: clamp(12px, 2vw, 16px); }
      .unknown { font-size: var(--font-size-caption); }
    `;

    expect(auditSource(syntheticSource, 'synthetic.scss')).toEqual({
      findings: [
        'synthetic.scss: forbidden font-size 12px',
        'synthetic.scss: forbidden font-size 0.75rem',
        'synthetic.scss: forbidden font-size 1em',
        'synthetic.scss: forbidden font-size 80%',
        'synthetic.scss: forbidden font-size clamp(12px, 2vw, 16px)',
        'synthetic.scss: unsupported font-size var(--font-size-caption)',
      ],
      counts: {
        xxs: 0,
        '2xs': 0,
        xs: 0,
        sm: 1,
        base: 0,
        lg: 0,
        xl: 0,
        '2xl': 0,
      },
    });
  });
});
