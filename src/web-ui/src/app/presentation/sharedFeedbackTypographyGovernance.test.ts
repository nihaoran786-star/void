import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../../shared/${relativePath}`, import.meta.url), 'utf8');

const stylesheets = {
  loadingNotification: readSource(
    'notification-system/components/LoadingNotification.scss',
  ),
  notificationCenter: readSource(
    'notification-system/components/NotificationCenter.scss',
  ),
  notificationItem: readSource(
    'notification-system/components/NotificationItem.scss',
  ),
  progressNotification: readSource(
    'notification-system/components/ProgressNotification.scss',
  ),
  contextMenu: readSource(
    'context-menu-system/components/ui/ContextMenu.scss',
  ),
  contextCard: readSource(
    'context-system/components/ContextCard/ContextCard.scss',
  ),
  contextList: readSource(
    'context-system/components/ContextList/ContextList.scss',
  ),
};

const notificationCenterComponent = readSource(
  'notification-system/components/NotificationCenter.tsx',
);
const contextMenuComponent = readSource(
  'context-menu-system/components/ui/ContextMenu.tsx',
);
const combinedStylesheet = Object.values(stylesheets).join('\n');

const canonicalFontSizes = new Set([
  'var(--font-size-xxs)',
  'var(--font-size-2xs)',
  'var(--font-size-xs)',
  'var(--font-size-sm)',
  'var(--font-size-base)',
  'var(--font-size-lg)',
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
  sources: Record<string, string>,
) =>
  Object.entries(sources).flatMap(([name, source]) =>
    findFontSizeConsumers(source)
      .filter(
        value =>
          !canonicalFontSizes.has(value) &&
          !(name === 'contextMenu' && value === '0'),
      )
      .map(value => `${name}: ${value}`),
  );

const countDirectTokenConsumers = (source: string, token: string) =>
  source.match(
    new RegExp(
      `font-size\\s*:\\s*var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
      'g',
    ),
  )?.length ?? 0;

describe('shared feedback typography governance', () => {
  it('keeps all seven stylesheets on canonical font-size tokens', () => {
    expect(findUnexpectedFontSizeConsumers(stylesheets)).toEqual([]);
    expect(combinedStylesheet).not.toMatch(
      /(?<![-\w])font-size\s*:\s*(?:\d+(?:\.\d+)?(?:px|rem|em|%)|clamp\s*\()/,
    );
    expect(findScssFontSizeAliases(combinedStylesheet)).toEqual([]);
  });

  it('locks the exact canonical token distribution after the migration', () => {
    expect({
      xxs: countDirectTokenConsumers(combinedStylesheet, '--font-size-xxs'),
      '2xs': countDirectTokenConsumers(combinedStylesheet, '--font-size-2xs'),
      xs: countDirectTokenConsumers(combinedStylesheet, '--font-size-xs'),
      sm: countDirectTokenConsumers(combinedStylesheet, '--font-size-sm'),
      base: countDirectTokenConsumers(combinedStylesheet, '--font-size-base'),
      lg: countDirectTokenConsumers(combinedStylesheet, '--font-size-lg'),
    }).toEqual({
      xxs: 5,
      '2xs': 10,
      xs: 18,
      sm: 8,
      base: 1,
      lg: 1,
    });
  });

  it('keeps the notification surfaces on the shared sans family token', () => {
    for (const source of [
      stylesheets.notificationCenter,
      stylesheets.notificationItem,
      stylesheets.progressNotification,
    ]) {
      expect(
        source.match(/font-family:\s*var\(--font-family-sans\);/g),
      ).toHaveLength(1);
    }
  });

  it('keeps the empty icon structural and free of an ineffective text size', () => {
    expect(notificationCenterComponent).toMatch(
      /<div className="notification-center__empty-icon"\s*\/>/,
    );
    expect(stylesheets.notificationCenter).toMatch(
      /&__empty-icon\s*\{\s*margin-bottom:\s*\$size-gap-3;\s*opacity:\s*0\.5;\s*\}/,
    );
    expect(stylesheets.notificationCenter).not.toMatch(
      /&__empty-icon\s*\{[^}]*font-size\s*:/s,
    );
  });

  it('keeps the submenu glyph hidden behind the CSS arrow affordance', () => {
    expect(contextMenuComponent).toMatch(
      /<span className="context-menu-submenu-arrow">▶<\/span>/,
    );
    expect(
      findFontSizeConsumers(stylesheets.contextMenu).filter(
        value => value === '0',
      ),
    ).toEqual(['0']);
    expect(stylesheets.contextMenu).toMatch(
      /\.context-menu-submenu-arrow\s*\{[^}]*font-size:\s*0;[^}]*color:\s*transparent;[^}]*&::before\s*\{[^}]*content:\s*'';[^}]*border-right:\s*1\.5px solid var\(--color-text-muted\);[^}]*border-bottom:\s*1\.5px solid var\(--color-text-muted\);[^}]*transform:\s*rotate\(-45deg\);/s,
    );
  });

  it('rejects synthesized absolute, relative, fluid, and alias regressions', () => {
    const synthetic =
      '$_synthetic-font-size: 11px; .a { font-size: 17px; } .b { font-size: 0.75rem; } .c { font-size: 0.8em; } .d { font-size: 90%; } .e { font-size: clamp(1rem, 2vw, 2rem); } .f { font-size: $_synthetic-font-size; }';

    expect(
      findUnexpectedFontSizeConsumers({
        synthetic,
      }),
    ).toEqual([
      'synthetic: 17px',
      'synthetic: 0.75rem',
      'synthetic: 0.8em',
      'synthetic: 90%',
      'synthetic: clamp(1rem, 2vw, 2rem)',
      'synthetic: $_synthetic-font-size',
    ]);
    expect(findScssFontSizeAliases(synthetic)).toEqual([
      '$_synthetic-font-size',
    ]);
  });
});
