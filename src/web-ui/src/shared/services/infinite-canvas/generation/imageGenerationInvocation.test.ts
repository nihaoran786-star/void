import { describe, expect, it } from 'vitest';

import { referenceImageLabel } from './imageGenerationInvocation';

describe('referenceImageLabel', () => {
  it('uses Chinese ordinals up to ten and a numeric fallback beyond', () => {
    expect(referenceImageLabel(1)).toBe('图一');
    expect(referenceImageLabel(2)).toBe('图二');
    expect(referenceImageLabel(10)).toBe('图十');
    expect(referenceImageLabel(11)).toBe('图11');
  });
});
