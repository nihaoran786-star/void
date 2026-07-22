import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readEditorStylesheet = (relativePath: string) =>
  readFileSync(
    new URL(`../../tools/editor/${relativePath}`, import.meta.url),
    'utf8',
  );

const editorStylesheets = {
  codeEditor: readEditorStylesheet('components/CodeEditor.scss'),
  diffEditor: readEditorStylesheet('components/DiffEditor.scss'),
  breadcrumb: readEditorStylesheet('components/EditorBreadcrumb.scss'),
  statusBar: readEditorStylesheet('components/EditorStatusBar.scss'),
  imageViewer: readEditorStylesheet('components/ImageViewer.scss'),
  planViewer: readEditorStylesheet('components/PlanViewer.scss'),
  statusBarPopovers: readEditorStylesheet(
    'components/StatusBarPopovers/StatusBarPopovers.scss',
  ),
  tiptap: readEditorStylesheet('meditor/components/TiptapEditor.scss'),
};

const combinedStylesheet = Object.values(editorStylesheets).join('\n');

const canonicalFontSizes = new Set([
  'var(--font-size-xxs)',
  'var(--font-size-2xs)',
  'var(--font-size-xs)',
  'var(--font-size-sm)',
  'var(--font-size-base)',
  'var(--font-size-lg)',
  'var(--font-size-xl)',
  'var(--font-size-2xl)',
  'var(--font-size-3xl)',
]);

const tiptapSemanticFontSizes = new Set([
  'var(--flowchat-md-pre-font-size)',
  '0.9em',
  '0.85rem',
  'inherit',
]);

const findFontSizeConsumers = (source: string) =>
  [...source.matchAll(/(?<![-\w])font-size\s*:\s*([^;]+);/g)].map(match =>
    match[1].trim(),
  );

const findScssFontSizeAliases = (source: string) =>
  [...source.matchAll(/\$[\w-]*font-size[\w-]*\s*:/g)].map(match =>
    match[0].slice(0, -1).trim(),
  );

const findUnexpectedFontSizeConsumers = (
  stylesheets: Record<string, string>,
) =>
  Object.entries(stylesheets).flatMap(([name, source]) =>
    findFontSizeConsumers(source)
      .filter(value => {
        if (canonicalFontSizes.has(value)) {
          return false;
        }
        if (
          name === 'codeEditor' &&
          value === 'var(--font-size-xs) !important'
        ) {
          return false;
        }
        return name !== 'tiptap' || !tiptapSemanticFontSizes.has(value);
      })
      .map(value => `${name}: ${value}`),
  );

const countDirectTokenConsumers = (source: string, token: string) =>
  source.match(
    new RegExp(
      `font-size\\s*:\\s*var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
      'g',
    ),
  )?.length ?? 0;

describe('editor typography governance', () => {
  it('keeps all eight editor stylesheets on canonical or explicit semantic sizes', () => {
    expect(findUnexpectedFontSizeConsumers(editorStylesheets)).toEqual([]);
    expect(combinedStylesheet).not.toMatch(
      /(?<![-\w])font-size\s*:\s*\d+(?:\.\d+)?px\b/,
    );
    expect(combinedStylesheet).not.toMatch(/\$[\w-]*font-size[\w-]*/);
  });

  it('locks the exact canonical token distribution after the migration', () => {
    expect({
      xxs: countDirectTokenConsumers(combinedStylesheet, '--font-size-xxs'),
      '2xs': countDirectTokenConsumers(combinedStylesheet, '--font-size-2xs'),
      xs: countDirectTokenConsumers(combinedStylesheet, '--font-size-xs'),
      sm: countDirectTokenConsumers(combinedStylesheet, '--font-size-sm'),
      base: countDirectTokenConsumers(combinedStylesheet, '--font-size-base'),
      lg: countDirectTokenConsumers(combinedStylesheet, '--font-size-lg'),
      xl: countDirectTokenConsumers(combinedStylesheet, '--font-size-xl'),
      '2xl': countDirectTokenConsumers(combinedStylesheet, '--font-size-2xl'),
      '3xl': countDirectTokenConsumers(combinedStylesheet, '--font-size-3xl'),
    }).toEqual({
      xxs: 3,
      '2xs': 10,
      xs: 34,
      sm: 18,
      base: 8,
      lg: 3,
      xl: 1,
      '2xl': 1,
      '3xl': 1,
    });
  });

  it('preserves the six intentional Tiptap semantic scaling consumers', () => {
    expect(
      findFontSizeConsumers(editorStylesheets.tiptap).filter(
        value => !canonicalFontSizes.has(value),
      ),
    ).toEqual([
      'var(--flowchat-md-pre-font-size)',
      '0.9em',
      'var(--flowchat-md-pre-font-size)',
      '0.85rem',
      'inherit',
      '0.9em',
    ]);
  });

  it('keeps all six Monaco hover overrides explicit and important', () => {
    expect(
      findFontSizeConsumers(editorStylesheets.codeEditor).filter(value =>
        value.endsWith('!important'),
      ),
    ).toEqual(Array(6).fill('var(--font-size-xs) !important'));
  });

  it('rejects synthesized absolute and unknown relative sizes', () => {
    const synthetic =
      '$_synthetic-font-size: 11px; .a { font-size: 17px; } .b { font-size: 0.75rem; } .c { font-size: 0.8em; } .d { font-size: $_synthetic-font-size; }';

    expect(
      findUnexpectedFontSizeConsumers({
        synthetic,
      }),
    ).toEqual([
      'synthetic: 17px',
      'synthetic: 0.75rem',
      'synthetic: 0.8em',
      'synthetic: $_synthetic-font-size',
    ]);
    expect(findScssFontSizeAliases(synthetic)).toEqual([
      '$_synthetic-font-size',
    ]);
  });
});
