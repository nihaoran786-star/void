import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponentStylesheet = (relativePath: string) =>
  readFileSync(
    new URL(`../../component-library/components/${relativePath}`, import.meta.url),
    'utf8',
  );

const existingGovernedStylesheets = {
  select: readComponentStylesheet('Select/Select.scss'),
  input: readComponentStylesheet('Input/Input.scss'),
  textarea: readComponentStylesheet('Textarea/Textarea.scss'),
  avatar: readComponentStylesheet('Avatar/Avatar.scss'),
};

const migratedStylesheets = {
  checkbox: readComponentStylesheet('Checkbox/Checkbox.scss'),
  codeEditor: readComponentStylesheet('CodeEditor/CodeEditor.scss'),
  empty: readComponentStylesheet('Empty/Empty.scss'),
  filterPill: readComponentStylesheet('FilterPill/FilterPill.scss'),
  baseToolCard: readComponentStylesheet(
    'FlowChatCards/BaseToolCard/BaseToolCard.scss',
  ),
  contextCompressionCard: readComponentStylesheet(
    'FlowChatCards/ContextCompressionCard/ContextCompressionCard.scss',
  ),
  readFileCard: readComponentStylesheet(
    'FlowChatCards/ReadFileCard/ReadFileCard.scss',
  ),
  searchCard: readComponentStylesheet(
    'FlowChatCards/SearchCard/SearchCard.scss',
  ),
  snapshotCard: readComponentStylesheet(
    'FlowChatCards/SnapshotCard/SnapshotCard.scss',
  ),
  taskCard: readComponentStylesheet(
    'FlowChatCards/TaskCard/TaskCard.scss',
  ),
  todoCard: readComponentStylesheet(
    'FlowChatCards/TodoCard/TodoCard.scss',
  ),
  webSearchCard: readComponentStylesheet(
    'FlowChatCards/WebSearchCard/WebSearchCard.scss',
  ),
  inputDialog: readComponentStylesheet('InputDialog/InputDialog.scss'),
  mermaid: readComponentStylesheet('Markdown/MermaidBlock.scss'),
  modal: readComponentStylesheet('Modal/Modal.scss'),
  numberInput: readComponentStylesheet('NumberInput/NumberInput.scss'),
  tabs: readComponentStylesheet('Tabs/Tabs.scss'),
};

const existingCombinedStylesheet =
  Object.values(existingGovernedStylesheets).join('\n');
const migratedCombinedStylesheet = Object.values(migratedStylesheets).join('\n');

const canonicalFontSizes = new Set([
  'var(--font-size-xxs)',
  'var(--font-size-2xs)',
  'var(--font-size-xs)',
  'var(--font-size-sm)',
  'var(--font-size-base)',
  'var(--font-size-lg)',
  'var(--font-size-xl)',
  'var(--font-size-2xl)',
]);

const semanticFontSizeAllowlist: Partial<
  Record<keyof typeof migratedStylesheets, ReadonlySet<string>>
> = {
  mermaid: new Set([
    'var(--flowchat-font-size-xs)',
    'var(--tool-card-action-font-size, var(--flowchat-font-size-sm))',
    'var(--flowchat-code-font-size, 0.92em)',
  ]),
  numberInput: new Set([
    'var(--font-size-sm, 14px)',
    'inherit',
    '0.85em',
  ]),
};

const findFontSizeConsumers = (source: string) =>
  [...source.matchAll(/(?<![-\w])font-size\s*:\s*([^;]+);/g)].map(match =>
    match[1].trim(),
  );

const findUnexpectedFontSizeConsumers = (
  stylesheets: Record<string, string>,
) =>
  Object.entries(stylesheets).flatMap(([name, source]) =>
    findFontSizeConsumers(source)
      .filter(
        value =>
          !canonicalFontSizes.has(value) &&
          !semanticFontSizeAllowlist[
            name as keyof typeof migratedStylesheets
          ]?.has(value),
      )
      .map(value => `${name}: ${value}`),
  );

const findRawFontSizeConsumers = (source: string) =>
  [...source.matchAll(/(?<![-\w])font-size\s*:\s*\d+(?:\.\d+)?px\b/g)].map(
    match => match[0],
  );

const countDirectTokenConsumers = (source: string, token: string) =>
  source.match(
    new RegExp(
      `font-size\\s*:\\s*var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
      'g',
    ),
  )?.length ?? 0;

describe('component library typography governance', () => {
  it('keeps the migrated component styles on canonical or explicit semantic sizes', () => {
    expect(findUnexpectedFontSizeConsumers(migratedStylesheets)).toEqual([]);
  });

  it('locks the exact canonical token distribution after the migration', () => {
    expect({
      xxs: countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-xxs',
      ),
      '2xs': countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-2xs',
      ),
      xs: countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-xs',
      ),
      sm: countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-sm',
      ),
      base: countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-base',
      ),
      lg: countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-lg',
      ),
      xl: countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-xl',
      ),
      '2xl': countDirectTokenConsumers(
        migratedCombinedStylesheet,
        '--font-size-2xl',
      ),
    }).toEqual({
      xxs: 4,
      '2xs': 4,
      xs: 34,
      sm: 27,
      base: 6,
      lg: 1,
      xl: 5,
      '2xl': 1,
    });
  });

  it('preserves the exact Mermaid and NumberInput semantic scaling expressions', () => {
    expect(
      findFontSizeConsumers(migratedStylesheets.mermaid).filter(
        value => !canonicalFontSizes.has(value),
      ),
    ).toEqual([
      'var(--flowchat-font-size-xs)',
      'var(--tool-card-action-font-size, var(--flowchat-font-size-sm))',
      'var(--tool-card-action-font-size, var(--flowchat-font-size-sm))',
      'var(--flowchat-code-font-size, 0.92em)',
    ]);
    expect(
      findFontSizeConsumers(migratedStylesheets.numberInput).filter(
        value => !canonicalFontSizes.has(value),
      ),
    ).toEqual([
      'var(--font-size-sm, 14px)',
      'inherit',
      '0.85em',
    ]);
  });

  it('rejects new absolute sizes and unknown relative scaling', () => {
    expect(
      findUnexpectedFontSizeConsumers({
        synthetic:
          '.a { font-size: 17px; } .b { font-size: 0.75rem; } .c { font-size: 0.9em; }',
      }),
    ).toEqual([
      'synthetic: 17px',
      'synthetic: 0.75rem',
      'synthetic: 0.9em',
    ]);
  });

  it('keeps Select, Input, Textarea, and Avatar free of direct pixel font sizes', () => {
    for (const stylesheet of Object.values(existingGovernedStylesheets)) {
      expect(findRawFontSizeConsumers(stylesheet)).toEqual([]);
    }
  });

  it('keeps the existing canonical text-token distribution', () => {
    expect({
      xs: countDirectTokenConsumers(existingCombinedStylesheet, '--font-size-xs'),
      sm: countDirectTokenConsumers(existingCombinedStylesheet, '--font-size-sm'),
      base: countDirectTokenConsumers(
        existingCombinedStylesheet,
        '--font-size-base',
      ),
      lg: countDirectTokenConsumers(existingCombinedStylesheet, '--font-size-lg'),
      xl: countDirectTokenConsumers(existingCombinedStylesheet, '--font-size-xl'),
    }).toEqual({
      xs: 6,
      sm: 6,
      base: 4,
      lg: 4,
      xl: 1,
    });
  });

  it('uses control icon tokens for Select clear affordances', () => {
    expect({
      xs: countDirectTokenConsumers(
        existingGovernedStylesheets.select,
        '--control-icon-xs',
      ),
      sm: countDirectTokenConsumers(
        existingGovernedStylesheets.select,
        '--control-icon-sm',
      ),
    }).toEqual({
      xs: 2,
      sm: 1,
    });
  });

  it('keeps one Select checkmark alias with explicit default, small, and large mappings', () => {
    expect(
      [
        ...existingGovernedStylesheets.select.matchAll(
          /--([\w-]*font-size[\w-]*)\s*:/g,
        ),
      ],
    ).toEqual([]);
    expect(
      [
        ...existingGovernedStylesheets.select.matchAll(
          /--select-checkmark-size\s*:/g,
        ),
      ],
    ).toHaveLength(3);
    expect(existingGovernedStylesheets.select).toMatch(
      /\.select\s*\{\s*--select-checkmark-size:\s*var\(--font-size-2xs\);/,
    );
    expect(existingGovernedStylesheets.select).toMatch(
      /&--small\s*\{\s*--select-checkmark-size:\s*var\(--font-size-xxs\);/,
    );
    expect(existingGovernedStylesheets.select).toMatch(
      /&--large\s*\{\s*--select-checkmark-size:\s*var\(--font-size-xs\);/,
    );
    expect(
      countDirectTokenConsumers(
        existingGovernedStylesheets.select,
        '--select-checkmark-size',
      ),
    ).toBe(1);
  });

  it('does not introduce component-specific font-size aliases elsewhere', () => {
    expect(existingGovernedStylesheets.input).not.toMatch(
      /--[\w-]*font-size[\w-]*\s*:/,
    );
    expect(existingGovernedStylesheets.textarea).not.toMatch(
      /--[\w-]*font-size[\w-]*\s*:/,
    );
    expect(existingGovernedStylesheets.avatar).not.toMatch(
      /--[\w-]*font-size[\w-]*\s*:/,
    );
  });

  it('preserves Avatar internal-text precedence and parent size roles', () => {
    expect(existingGovernedStylesheets.avatar).toMatch(
      /&__text\s*\{[^}]*font-size:\s*var\(--font-size-base\);[^}]*transform:\s*scale\(0\.8\);/s,
    );
    expect(existingGovernedStylesheets.avatar).toMatch(
      /&--small\s*\{\s*font-size:\s*var\(--font-size-xs\);\s*\}/,
    );
    expect(existingGovernedStylesheets.avatar).toMatch(
      /&--medium\s*\{\s*font-size:\s*var\(--font-size-base\);\s*\}/,
    );
    expect(existingGovernedStylesheets.avatar).toMatch(
      /&--large\s*\{\s*font-size:\s*var\(--font-size-xl\);\s*\}/,
    );
  });

  it('detects a synthesized raw-size regression in the existing governed set', () => {
    const mutated =
      `${existingCombinedStylesheet}\n.synthetic-control { font-size: 17px; }`;

    expect(findRawFontSizeConsumers(mutated)).toEqual(['font-size: 17px']);
  });
});
