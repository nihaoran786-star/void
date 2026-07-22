import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./EditorArea.scss', import.meta.url), 'utf8');

describe('EditorArea split layout contract', () => {
  it('bounds horizontal split group floors so two groups never overflow the pane', () => {
    const horizontalBlock = source.match(
      /&\.is-horizontal\s*\{[\s\S]*?\n  \}/,
    )?.[0] ?? '';

    expect(horizontalBlock).toContain('min-width: min(200px, 45%);');
    expect(horizontalBlock).not.toContain('min-width: 200px;');
  });
});
