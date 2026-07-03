import { describe, expect, it } from 'vitest';

import { popLastExistingImageUndoId } from './chatInputImageUndo';

describe('popLastExistingImageUndoId', () => {
  it('returns the most recent pasted image that still exists', () => {
    const stack = ['img-1', 'img-2', 'img-3'];

    expect(popLastExistingImageUndoId(stack, new Set(['img-1', 'img-3']))).toBe('img-3');
    expect(stack).toEqual(['img-1', 'img-2']);
  });

  it('skips stale image ids and leaves native undo available when none remain', () => {
    const stack = ['img-1', 'img-2'];

    expect(popLastExistingImageUndoId(stack, new Set(['img-other']))).toBeNull();
    expect(stack).toEqual([]);
  });
});
