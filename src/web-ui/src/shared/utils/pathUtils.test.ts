import { describe, expect, it } from 'vitest';
import {
  formatPathForClipboard,
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

  it('formats Windows drive paths with native clipboard separators', () => {
    expect(formatPathForClipboard('C:/work/project/file.txt')).toBe('C:\\work\\project\\file.txt');
  });

  it('formats UNC-style paths with native clipboard separators', () => {
    expect(formatPathForClipboard('//server/share/file.txt')).toBe('\\\\server\\share\\file.txt');
  });

  it('keeps POSIX paths unchanged for clipboard', () => {
    expect(formatPathForClipboard('/workspace/project/file.txt')).toBe('/workspace/project/file.txt');
  });
});
