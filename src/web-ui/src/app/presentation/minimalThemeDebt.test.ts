import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shadowDeclaration = /box-shadow\s*:\s*([^;]+);/g;
const allowedShadowValues = [
  /^none(?:\s*!important)?$/,
  /^var\(--workspace-(?:shadow|glass-shadow|composer-shadow)[\w-]*\)(?:\s*!important)?$/,
  /^inset 0 0 0 (?:1|2)px var\(--workspace-(?:focus-ring|border-subtle|border-strong|accent)\)(?:\s*!important)?$/,
  // Glass Air shell: inset hairline ring plus one soft float-shadow layer.
  /^inset 0 0 0 (?:1|2)px var\(--workspace-(?:focus-ring|border-subtle|border-strong|accent)\), var\(--workspace-glass-shadow\)(?:\s*!important)?$/,
  // Minimal sidebar: selected-row accent hairline light bar.
  /^inset 2px 0 0 var\(--color-accent-500\)$/,
];

function collectMinimalStyles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectMinimalStyles(path);
    return entry.isFile() && entry.name.endsWith('.minimal.scss') ? [path] : [];
  });
}

describe('Minimal presentation shadow contract', () => {
  it('centralizes elevation and limits inset rings to semantic workspace tokens', () => {
    const violations = collectMinimalStyles(sourceRoot).flatMap(file => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(shadowDeclaration)].flatMap(match => {
        const value = match[1].replace(/\s+/g, ' ').trim();
        if (allowedShadowValues.some(pattern => pattern.test(value))) return [];
        return [`${relative(sourceRoot, file)}: ${value}`];
      });
    });

    expect(violations).toEqual([]);
  });
});
