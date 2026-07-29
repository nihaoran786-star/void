import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function normalizeLf(source: string): string {
  return source.replace(/\r\n?/g, '\n');
}

export function readSourceText(path: string | URL): string {
  return normalizeLf(readFileSync(path, 'utf8'));
}

export function sha256Text(source: string): string {
  return createHash('sha256').update(normalizeLf(source)).digest('hex');
}

export function sha256SourceText(path: string | URL): string {
  return sha256Text(readSourceText(path));
}
