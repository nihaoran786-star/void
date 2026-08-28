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
  buildExpandInstruction,
  expandInstructionDirection,
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

/**
 * P6: outpainting fills the EXISTING `expand` template from the frame the user
 * dragged, rather than shipping a second instruction template or asking the
 * owner to describe a direction in words.
 */
describe('buildExpandInstruction', () => {
  const EXPAND = IMAGE_TOOL_DEFINITIONS.find(entry => entry.toolId === 'expand')!;

  it('names only the sides the frame was actually dragged out on', () => {
    expect(expandInstructionDirection({ left: 0, top: 0, right: 40, bottom: 0 }))
      .toBe('the right');
    expect(expandInstructionDirection({ left: 12, top: 0, right: 40, bottom: 0 }))
      .toBe('the right and left');
    expect(expandInstructionDirection({ left: 1, top: 1, right: 1, bottom: 1 }))
      .toBe('all four sides');
    expect(expandInstructionDirection({ left: 0, top: 0, right: 0, bottom: 0 }))
      .toBe('no side');
  });

  it('leaves no placeholder behind for the submit gate to trip on', () => {
    const instruction = buildExpandInstruction(
      'Keep every existing pixel.',
      { left: 0, top: 30, right: 0, bottom: 0 },
    );
    expect(instruction).toContain('Keep every existing pixel.');
    expect(instruction).toContain('the top');
    expect(hasUnfilledInstructionPlaceholder(instruction, EXPAND.instructionTemplate))
      .toBe(false);
    expect(instructionBlockReason(instruction, EXPAND.instructionTemplate)).toBeUndefined();
  });

  /**
   * Adversarial review P4: `String.replace` reads `$&`, `` $` ``, `$'` and
   * `$1` inside a STRING replacement, so a user who typed a dollar sign had
   * their own sentence silently rewritten before it reached the model.
   */
  it('takes a dollar sign in the user sentence literally', () => {
    const written = "a $5 note on the table, $& $' $` $1 $$";
    const instruction = buildExpandInstruction(
      'DIRECTIVE',
      { left: 0, top: 30, right: 0, bottom: 0 },
      written,
    );

    expect(instruction).toContain(written);
    // Nothing from the template leaked in through a replacement pattern.
    expect(instruction).not.toContain('【');
    expect(instruction.match(/Expand the canvas/g)).toHaveLength(1);
  });

  it('keeps the directive first, the way the mask lane does', () => {
    const instruction = buildExpandInstruction('DIRECTIVE', {
      left: 5, top: 0, right: 0, bottom: 0,
    });
    expect(instruction.startsWith('DIRECTIVE')).toBe(true);
  });
});
