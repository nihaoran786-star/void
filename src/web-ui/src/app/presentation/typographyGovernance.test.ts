import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { builtinThemes } from '@/infrastructure/theme/presets';
import { DEFAULT_UI_FONT_FAMILY } from '@/shared/constants/typography';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

type FontDeclarationKind =
  | 'canvas'
  | 'css'
  | 'reference'
  | 'svg'
  | 'theme-sans'
  | 'ts';

interface FontDeclaration {
  kind: FontDeclarationKind;
  value: string;
}

const divergentUiFontBaseline: Record<string, number> = {};

const literalMonoBaseline: Record<string, number> = {
  'app/components/AboutDialog/AboutDialog.scss': 3,
  'app/components/MCPInteractionDialog/MCPInteractionDialog.scss': 1,
  'app/components/NewProjectDialog/NewProjectDialog.scss': 1,
  'app/components/panels/content-canvas/mission-control/ThumbnailCard.scss': 1,
  'app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.scss': 2,
  'app/components/panels/DiffFullscreenViewer.css': 2,
  'app/components/RemoteConnectDialog/RemoteConnectDialog.scss': 1,
  'app/scenes/automation/AutomationScene.scss': 14,
  'app/scenes/settings/components/KeyboardShortcutsTab.scss': 1,
  'component-library/components/ConfirmDialog/ConfirmDialog.scss': 1,
  'component-library/components/FlowChatCards/TaskCard/TaskCard.scss': 1,
  'component-library/components/FlowChatCards/WebSearchCard/WebSearchCard.scss': 1,
  'component-library/components/StreamText/StreamText.scss': 1,
  'flow_chat/components/modern/SessionFileModificationsBar.scss': 2,
  'flow_chat/components/modern/SessionFilesBadge.scss': 3,
  'flow_chat/components/TurnHistoryPanel.scss': 1,
  'flow_chat/tool-cards/FileOperationToolCard.scss': 1,
  'flow_chat/tool-cards/MCPToolDisplay.scss': 1,
  'flow_chat/tool-cards/SnapshotFullscreenDiffViewer.css': 3,
  'infrastructure/update/UpdateAvailableDialog.scss': 1,
  'tools/git/components/GitBranchHistoryView/GitBranchHistoryView.scss': 2,
  'tools/git/components/GitGraphView/GitGraphView.scss': 2,
  'tools/workspace/components/WorkspaceManager.css': 2,
};

const staticSvgFontBaseline = {
  'shared/services/short-drama/ShortDramaStaticProject.ts': 6,
};

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'preview' ? [] : collectSourceFiles(path);
    }
    if (!entry.isFile() || !/\.(?:css|scss|ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return /\.(?:test|spec)\.[^.]+$/.test(entry.name) ? [] : [path];
  });
}

function sourcePath(file: string): string {
  return relative(sourceRoot, file).split(sep).join('/');
}

function extractFontDeclarations(path: string, source: string): FontDeclaration[] {
  const declarations: FontDeclaration[] = [];
  const collect = (
    kind: FontDeclarationKind,
    pattern: RegExp,
    valueGroup: number,
  ) => {
    for (const match of source.matchAll(pattern)) {
      declarations.push({ kind, value: match[valueGroup].trim() });
    }
  };

  collect(
    'css',
    /font-family\s*:\s*([^;\r\n]+?)(?:;|(?=\s*}))/g,
    1,
  );
  collect(
    'ts',
    /(?:\bfontFamily\b|['"]fontFamily['"])\s*:\s*(['"`])([^\r\n]*?)\1/g,
    2,
  );
  collect(
    'canvas',
    /\b(?:[$\w]+(?:\??\.[$\w]+|\[[^\]\r\n]+\])*)\.font\s*=\s*(['"`])([^\r\n]*?)\1/g,
    2,
  );
  collect('svg', /\bfont-family=(['"])(.*?)\1/g, 2);
  collect('theme-sans', /^\s*sans\s*:\s*(['"])(.*?)\1\s*,?\s*$/gm, 2);
  if (
    /^tools\/(?:generative-widget|mermaid-editor|git\/components\/GitGraphView)\//.test(
      path,
    )
  ) {
    collect(
      'reference',
      /(?:\bfontFamily\b|(?:[$\w]+(?:\??\.[$\w]+|\[[^\]\r\n]+\])*)(?:\.font|\[['"]font['"]\]))\s*[:=]\s*([^\r\n;]+)/g,
      1,
    );
  }

  return declarations;
}

function countByPath(
  entries: Array<{ path: string; declaration: FontDeclaration }>,
): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.path] = (counts[entry.path] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeFontValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function declarationKey(
  path: string,
  declaration: FontDeclaration,
): string {
  return `${path} [${declaration.kind}]: ${normalizeFontValue(declaration.value)}`;
}

function countByDeclaration(
  entries: Array<{ path: string; declaration: FontDeclaration }>,
): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = declarationKey(entry.path, entry.declaration);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function exactDeclarationBaseline(
  pathCounts: Record<string, number>,
  kind: FontDeclarationKind,
  value: string,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(pathCounts).map(([path, count]) => [
      `${path} [${kind}]: ${normalizeFontValue(value)}`,
      count,
    ]),
  );
}

function expectExactBaseline(
  actual: Record<string, number>,
  expected: Record<string, number>,
): void {
  expect(Object.fromEntries(Object.entries(actual).sort())).toEqual(
    Object.fromEntries(Object.entries(expected).sort()),
  );
}

function isCanonicalCssFamily(value: string): boolean {
  return (
    /^(?:inherit|initial|unset)(?:\s*!important)?$/.test(value) ||
    /\$(?:font-family-mono)\b/.test(value) ||
    /var\(--(?:font-family-(?:sans|mono)|font-(?:sans|mono)|workspace-font-family|markdown-font-(?:sans|heading|mono)|tool-card-font-mono|tool-compact-summary-font|flowchat-md-code-font-mono)\b/.test(
      value,
    )
  );
}

function isLiteralMono(value: string): boolean {
  return /\bmonospace\b/i.test(value) && !/var\(|\$font-family/.test(value);
}

function isCanonicalTsFamily(path: string, value: string): boolean {
  if (
    /var\(--(?:font-family-sans|font-family-mono|markdown-font-mono|tool-card-font-mono)\b/.test(
      value,
    )
  ) {
    return true;
  }
  return (
    /\b(?:monospace|Fira Code|Courier New)\b/i.test(value) &&
    /^(?:component-library\/components\/Markdown|flow_chat\/|infrastructure\/config\/components\/AIModelConfig|tools\/(?:editor|terminal))\//.test(
      path,
    )
  );
}

function isExplicitFontEngineException(path: string, value: string): boolean {
  const katexFontFamilies = new Set([
    'KaTeX_AMS',
    'KaTeX_Caligraphic',
    'KaTeX_Fraktur',
    'KaTeX_Main',
    'KaTeX_Math',
    'KaTeX_SansSerif',
    'KaTeX_Script',
    'KaTeX_Size1',
    'KaTeX_Size2',
    'KaTeX_Size3',
    'KaTeX_Size4',
    'KaTeX_Typewriter',
  ]);
  return (
    (/^component-library\/components\/Markdown\//.test(path) &&
      katexFontFamilies.has(value)) ||
    (/^component-library\/components\/CodeEditor\//.test(path) &&
      value === 'codicon') ||
    (path === 'flow_chat/BeautifulUIFlowBindings.scss' &&
      /BeautifulUI (?:Inter|Mono)/.test(value))
  );
}

function classifyDeclarations(path: string, source: string) {
  const result = {
    divergent: [] as FontDeclaration[],
    legacySassSans: [] as FontDeclaration[],
    literalMono: [] as FontDeclaration[],
    staticSvg: [] as FontDeclaration[],
    themeSans: [] as FontDeclaration[],
    violations: [] as FontDeclaration[],
  };

  for (const declaration of extractFontDeclarations(path, source)) {
    const { kind, value } = declaration;
    if (kind === 'reference' && /^['"`]/.test(value)) {
      continue;
    } else if (kind === 'css' && /font-family-sans\b/.test(value) && /^\$/.test(value)) {
      result.legacySassSans.push(declaration);
    } else if (
      kind === 'css' &&
      (/^(?:['"]Helvetica Neue|['"]Comic Sans MS)/.test(value) ||
        /^var\(--font-sans,\s*Inter\b/.test(value))
    ) {
      result.divergent.push(declaration);
    } else if (
      kind === 'canvas' &&
      !/\b(?:monospace|SF Mono|Courier New)\b/.test(value)
    ) {
      result.divergent.push(declaration);
    } else if (
      kind === 'ts' &&
      /^tools\/mermaid-editor\//.test(path) &&
      /\b(?:Inter|Segoe UI)\b/.test(value)
    ) {
      result.divergent.push(declaration);
    } else if (kind === 'css' && isLiteralMono(value)) {
      result.literalMono.push(declaration);
    } else if (
      kind === 'reference' &&
      (/^(?:buildCanvasFont|readUiFontFamily)\(/.test(value) ||
        /^vars\[['"]--font-sans['"]\]\s*\|\|\s*body\.style\.fontFamily$/.test(
          value,
        ))
    ) {
      continue;
    } else if (
      kind === 'svg' &&
      path === 'shared/services/short-drama/ShortDramaStaticProject.ts' &&
      value === 'Arial, sans-serif'
    ) {
      result.staticSvg.push(declaration);
    } else if (kind === 'theme-sans' && /^infrastructure\/theme\/presets\//.test(path)) {
      result.themeSans.push(declaration);
    } else if (
      (kind === 'css' &&
        (isCanonicalCssFamily(value) ||
          isExplicitFontEngineException(path, value))) ||
      (kind === 'ts' && isCanonicalTsFamily(path, value)) ||
      (kind === 'canvas' && /\b(?:monospace|SF Mono|Courier New)\b/.test(value))
    ) {
      continue;
    } else {
      result.violations.push(declaration);
    }
  }

  return result;
}

describe('UI typography governance', () => {
  const classified = collectSourceFiles(sourceRoot).map(file => {
    const path = sourcePath(file);
    return {
      path,
      result: classifyDeclarations(path, readFileSync(file, 'utf8')),
    };
  });

  it('keeps remaining non-DOM debt and font-engine exceptions on exact baselines', () => {
    const flatten = (key: keyof (typeof classified)[number]['result']) =>
      classified.flatMap(({ path, result }) =>
        result[key].map(declaration => ({ path, declaration })),
      );

    const legacySass = flatten('legacySassSans');
    const divergent = flatten('divergent');
    const staticSvg = flatten('staticSvg');

    expect(legacySass).toEqual([]);
    expect(divergent).toEqual([]);
    expect(staticSvg).toHaveLength(6);

    expectExactBaseline(countByPath(divergent), divergentUiFontBaseline);
    expectExactBaseline(countByDeclaration(divergent), {});

    const literalMono = flatten('literalMono');
    expectExactBaseline(countByPath(literalMono), literalMonoBaseline);
    expectExactBaseline(
      countByDeclaration(literalMono),
      {
        "app/components/AboutDialog/AboutDialog.scss [css]: 'Consolas', 'Monaco', monospace": 3,
        'app/components/MCPInteractionDialog/MCPInteractionDialog.scss [css]: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace': 1,
        "app/components/NewProjectDialog/NewProjectDialog.scss [css]: 'Consolas', 'Monaco', monospace": 1,
        "app/components/RemoteConnectDialog/RemoteConnectDialog.scss [css]: 'Fira Code', 'Courier New', monospace": 1,
        "app/components/panels/DiffFullscreenViewer.css [css]: 'JetBrains Mono', 'Fira Code', monospace": 2,
        "app/components/panels/content-canvas/mission-control/ThumbnailCard.scss [css]: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace": 1,
        'app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.scss [css]: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace': 2,
        'app/scenes/automation/AutomationScene.scss [css]: ui-monospace, SFMono-Regular, Menlo, monospace': 14,
        "app/scenes/settings/components/KeyboardShortcutsTab.scss [css]: ui-monospace, 'Cascadia Code', 'Fira Code', monospace": 1,
        "component-library/components/ConfirmDialog/ConfirmDialog.scss [css]: 'Consolas', 'Monaco', 'Courier New', monospace": 1,
        "component-library/components/FlowChatCards/TaskCard/TaskCard.scss [css]: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace": 1,
        "component-library/components/FlowChatCards/WebSearchCard/WebSearchCard.scss [css]: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace": 1,
        "component-library/components/StreamText/StreamText.scss [css]: 'Courier New', monospace": 1,
        "flow_chat/components/TurnHistoryPanel.scss [css]: 'Monaco', 'Consolas', monospace": 1,
        "flow_chat/components/modern/SessionFileModificationsBar.scss [css]: 'SF Mono', 'Monaco', 'Cascadia Code', monospace": 2,
        "flow_chat/components/modern/SessionFilesBadge.scss [css]: 'SF Mono', 'Monaco', 'Cascadia Code', monospace": 3,
        "flow_chat/tool-cards/FileOperationToolCard.scss [css]: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', 'Monaco', 'Courier New', monospace": 1,
        'flow_chat/tool-cards/MCPToolDisplay.scss [css]: monospace': 1,
        "flow_chat/tool-cards/SnapshotFullscreenDiffViewer.css [css]: 'Monaco', 'Menlo', monospace": 3,
        "infrastructure/update/UpdateAvailableDialog.scss [css]: 'Consolas', 'Monaco', 'ui-monospace', monospace": 1,
        "tools/git/components/GitBranchHistoryView/GitBranchHistoryView.scss [css]: 'SF Mono', 'Monaco', 'Consolas', monospace": 2,
        "tools/git/components/GitGraphView/GitGraphView.scss [css]: 'Courier New', monospace": 1,
        "tools/git/components/GitGraphView/GitGraphView.scss [css]: 'SF Mono', 'Monaco', 'Courier New', monospace": 1,
        "tools/workspace/components/WorkspaceManager.css [css]: 'Fira Code', 'Monaco', 'Consolas', monospace": 2,
      },
    );

    expectExactBaseline(countByPath(staticSvg), staticSvgFontBaseline);
    expectExactBaseline(
      countByDeclaration(staticSvg),
      exactDeclarationBaseline(
        staticSvgFontBaseline,
        'svg',
        'Arial, sans-serif',
      ),
    );

    expect(flatten('themeSans')).toEqual([]);
  });

  it('rejects every unclassified font-family declaration', () => {
    const violations = classified.flatMap(({ path, result }) =>
      result.violations.map(({ kind, value }) => `${path} [${kind}]: ${value}`),
    );

    expect(violations).toEqual([]);
  });

  it.each([
    ['CSS Arial', 'app/Fake.scss', '.x { font-family: Arial, sans-serif; }'],
    ['CSS generic serif', 'app/Fake.scss', '.x { font-family: serif; }'],
    ['CSS no-semicolon Arial', 'app/Fake.scss', '.x { font-family: Arial, sans-serif }'],
    [
      'TS Arial',
      'app/Fake.tsx',
      "const style = { fontFamily: 'Arial, sans-serif' };",
    ],
    [
      'Mermaid fontFamily',
      'tools/mermaid-editor/newTheme.ts',
      "const theme = { fontFamily: 'Arial, sans-serif' };",
    ],
    [
      'non-whitelisted short-drama SVG',
      'shared/services/short-drama/OtherProject.ts',
      '<text font-family="Arial, sans-serif"/>',
    ],
  ])('rejects a new %s declaration', (_name, path, source) => {
    expect(classifyDeclarations(path, source).violations).toHaveLength(1);
  });

  it('detects nested and indexed Canvas context font assignments', () => {
    const result = classifyDeclarations(
      'tools/git/components/Fake.ts',
      "contexts[0].font = '12px Arial, sans-serif';",
    );

    expect(result.divergent).toEqual([
      { kind: 'canvas', value: '12px Arial, sans-serif' },
    ]);
  });

  it('rejects indirect non-DOM font references unless they use the shared resolver', () => {
    const canvas = classifyDeclarations(
      'tools/git/components/GitGraphView/Fake.ts',
      "const stack = 'Arial'; contexts[0]['font'] = stack;",
    );
    const mermaid = classifyDeclarations(
      'tools/mermaid-editor/theme/Fake.ts',
      'const theme = { fontFamily: unreviewedFontStack };',
    );
    const canonical = classifyDeclarations(
      'tools/mermaid-editor/theme/Fake.ts',
      'const theme = { fontFamily: readUiFontFamily() };',
    );

    expect(canvas.violations).toContainEqual({
      kind: 'reference',
      value: 'stack',
    });
    expect(mermaid.violations).toContainEqual({
      kind: 'reference',
      value: 'unreviewedFontStack }',
    });
    expect(canonical.violations).toEqual([]);
  });

  it('keeps explicit mono, KaTeX, codicon, and static SVG exceptions narrow', () => {
    expect(
      classifyDeclarations(
        'tools/editor/components/Fake.tsx',
        "const style = { fontFamily: 'Fira Code, monospace' };",
      ).violations,
    ).toEqual([]);
    expect(
      classifyDeclarations(
        'component-library/components/Markdown/Fake.scss',
        '.math { font-family: KaTeX_Main; }',
      ).violations,
    ).toEqual([]);
    expect(
      classifyDeclarations(
        'component-library/components/CodeEditor/Fake.scss',
        '.icon { font-family: codicon; }',
      ).violations,
    ).toEqual([]);
    expect(
      classifyDeclarations(
        'shared/services/short-drama/OtherProject.ts',
        '<text font-family="Arial, sans-serif"/>',
      ).violations,
    ).toHaveLength(1);
    expect(
      classifyDeclarations(
        'component-library/components/Markdown/Fake.scss',
        '.math { font-family: KaTeX_Evil; }',
      ).violations,
    ).toHaveLength(1);
    expect(
      classifyDeclarations(
        'app/Fake.scss',
        '.math { font-family: KaTeX_Main; } .icon { font-family: codicon; }',
      ).violations,
    ).toHaveLength(2);
  });

  it('keeps the canonical and compatibility typography token contract explicit', () => {
    const tokens = readFileSync(
      resolve(sourceRoot, 'component-library/styles/tokens.scss'),
      'utf8',
    );
    const themeService = readFileSync(
      resolve(sourceRoot, 'infrastructure/theme/core/ThemeService.ts'),
      'utf8',
    );

    expect(tokens).toContain('--font-sans: var(--font-family-sans);');
    expect(tokens).toContain('--font-mono: var(--font-family-mono);');
    const bootstrapSans = tokens.match(
      /^\$font-family-sans:\s*([^;]+);$/m,
    )?.[1];
    expect(bootstrapSans?.replace(/\s+/g, ' ').trim()).toBe(
      DEFAULT_UI_FONT_FAMILY.replace(/\s+/g, ' ').trim(),
    );
    expect(themeService).toContain(
      "root.style.setProperty('--font-family-sans', typography.font.sans);",
    );
    expect(themeService).toContain(
      "root.style.setProperty('--font-family-mono', typography.font.mono);",
    );
    expect(builtinThemes).toHaveLength(8);
    expect(
      builtinThemes.map(theme => theme.typography.font.sans),
    ).toEqual(Array.from({ length: 8 }, () => DEFAULT_UI_FONT_FAMILY));
  });
});
