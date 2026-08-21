import { describe, expect, it } from 'vitest';
import {
  FLOWCHAT_INPUT_STACK_INSET_STEP_PX,
  FLOWCHAT_MESSAGE_TAIL_CLEARANCE_PX,
  computeFlowChatInputStackFooterPx,
  computeFlowChatInputStackInsetPx,
  settleFlowChatInputStackInsetPx,
} from './flowChatScrollLayout';

describe('flowChatScrollLayout', () => {
  it('insets the list by the composer block so overlays clear it', () => {
    // Composer height plus the viewport inset it floats above.
    expect(computeFlowChatInputStackInsetPx(120, true)).toBe(124);
  });

  it('keeps the footer to the message tail clearance only', () => {
    // The composer's own height is handled by the inset, not by the spacer.
    expect(computeFlowChatInputStackFooterPx(120, true))
      .toBe(FLOWCHAT_MESSAGE_TAIL_CLEARANCE_PX);
  });

  it('absorbs sub-step wobble in the measured composer height', () => {
    const first = settleFlowChatInputStackInsetPx(124, null);
    expect(first % FLOWCHAT_INPUT_STACK_INSET_STEP_PX).toBe(0);

    // A composer that re-measures a pixel back and forth must not resize the
    // scroll viewport, or the whole transcript shakes at that frequency.
    expect(settleFlowChatInputStackInsetPx(123, first)).toBe(first);
    expect(settleFlowChatInputStackInsetPx(125, first)).toBe(first);
    expect(settleFlowChatInputStackInsetPx(124, first)).toBe(first);
  });

  it('follows a real change of composer size', () => {
    const settled = settleFlowChatInputStackInsetPx(124, null);

    // One more input line grows past the hysteresis band.
    const grown = settleFlowChatInputStackInsetPx(146, settled);
    expect(grown).toBeGreaterThanOrEqual(146);

    // Collapsing back down past a full step follows too.
    expect(settleFlowChatInputStackInsetPx(100, grown)).toBeLessThan(grown);
  });
});
