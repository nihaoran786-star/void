/**
 * The instruction-placeholder contract (P5 review P16).
 *
 * One definition serves both the tool instruction dialog and the mask editor,
 * so this is where the rule is pinned: only the tokens the prefilled template
 * actually shipped may block a submission. 【】 typed by the user as ordinary
 * punctuation — which is exactly what a Chinese-writing owner does — is prose,
 * not an unfilled slot, and greying the confirm button out for it (silently,
 * as the old `/[【】]/` did) is a bug.
 */
import { describe, expect, it } from 'vitest';

import {
  hasUnfilledInstructionPlaceholder,
  IMAGE_TOOL_DEFINITIONS,
  instructionBlockReason,
  instructionPlaceholders,
} from './ImageToolTypes';

const ERASE = IMAGE_TOOL_DEFINITIONS.find(entry => entry.toolId === 'erase')!;

describe('instructionPlaceholders', () => {
  it('lists the template tokens, de-duplicated and whole', () => {
    expect(instructionPlaceholders(ERASE.instructionTemplate))
      .toEqual(['【object to remove】']);
    expect(instructionPlaceholders('【a】 and 【b】 and 【a】'))
      .toEqual(['【a】', '【b】']);
  });

  it('finds nothing in a template that has no slots', () => {
    expect(instructionPlaceholders('Make it brighter.')).toEqual([]);
  });
});

describe('hasUnfilledInstructionPlaceholder', () => {
  it('blocks the untouched template', () => {
    expect(hasUnfilledInstructionPlaceholder(
      ERASE.instructionTemplate,
      ERASE.instructionTemplate,
    )).toBe(true);
  });

  it('releases the template once every slot is replaced', () => {
    expect(hasUnfilledInstructionPlaceholder(
      'Erase the lamp post and reconstruct the background.',
      ERASE.instructionTemplate,
    )).toBe(false);
  });

  /** The regression itself: a single bracket used to be enough to block. */
  it('does not block on 【】 the user typed as their own punctuation', () => {
    for (const written of [
      'Erase the sign reading 【OPEN】 and reconstruct the background.',
      'Erase the 】 stray bracket and reconstruct the background.',
      'Erase the 【 stray bracket and reconstruct the background.',
    ]) {
      expect(hasUnfilledInstructionPlaceholder(written, ERASE.instructionTemplate)).toBe(false);
    }
  });

  it('falls back to "any whole token" when no template is known', () => {
    expect(hasUnfilledInstructionPlaceholder('put 【something】 here')).toBe(true);
    expect(hasUnfilledInstructionPlaceholder('a lone 】 bracket')).toBe(false);
    // A global regex would carry `lastIndex` between calls; this must not.
    expect(hasUnfilledInstructionPlaceholder('put 【something】 here')).toBe(true);
  });
});

describe('instructionBlockReason', () => {
  it('names each reason, so a disabled button can explain itself', () => {
    expect(instructionBlockReason('   ', ERASE.instructionTemplate)).toBe('empty');
    expect(instructionBlockReason(ERASE.instructionTemplate, ERASE.instructionTemplate))
      .toBe('placeholder');
    expect(instructionBlockReason('Erase the lamp post.', ERASE.instructionTemplate))
      .toBeUndefined();
  });
});
