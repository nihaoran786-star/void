import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('Web UI startup import boundaries', () => {
  it('keeps Monaco runtime configuration out of the application entry', () => {
    const source = readSource('../../main.tsx');

    for (const forbidden of [
      '@monaco-editor/react',
      'editor.main.css',
      'MonacoEnvironment',
      'getMonacoPath',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps application theme state editor agnostic', () => {
    const source = readSource('../../infrastructure/theme/core/ThemeService.ts');
    expect(source).not.toContain('MonacoThemeSync');
    expect(source).not.toContain('monacoThemeSync');
  });
});
