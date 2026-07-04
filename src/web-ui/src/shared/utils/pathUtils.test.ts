import { describe, expect, it } from 'vitest';
import {
  normalizeLocalPathForRename,
  normalizeRemoteWorkspacePath,
} from './pathUtils';

describe('pathUtils rename normalization', () => {
  it('preserves literal percent sequences in local file names', () => {
    expect(normalizeLocalPathForRename('C:\\work\\100%25-real.txt')).toBe('C:/work/100%25-real.txt');
  });

  it('normalizes remote workspace separators without local URI decoding', () => {
    expect(normalizeRemoteWorkspacePath('/workspace//folder\\file.txt')).toBe('/workspace/folder/file.txt');
  });
});
