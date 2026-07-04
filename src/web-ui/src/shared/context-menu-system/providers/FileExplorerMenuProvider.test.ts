import { describe, expect, it } from 'vitest';
import { getPasteShortcut } from './FileExplorerMenuProvider';

describe('FileExplorerMenuProvider paste shortcut label', () => {
  it('uses Cmd+V for Apple platforms', () => {
    expect(getPasteShortcut('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Cmd+V');
    expect(getPasteShortcut('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('Cmd+V');
  });

  it('uses Ctrl+V for non-Apple platforms', () => {
    expect(getPasteShortcut('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Ctrl+V');
    expect(getPasteShortcut('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ctrl+V');
  });
});
