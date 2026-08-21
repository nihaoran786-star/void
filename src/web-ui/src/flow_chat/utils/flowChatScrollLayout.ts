/**
 * FlowChat scroll layout: floating ChatInput + message list footer / scroll-to-latest.
 * Keep footer spacer and overlay controls aligned on the same geometric model.
 */

/** Matches `.void-chat-input-drop-zone { bottom: … }` — viewport inset under workspace strip. */
export const CHAT_INPUT_DROP_ZONE_BOTTOM_PX = 4;

/** Space between the top edge of the input block and the end of scroll content */
export const FLOWCHAT_MESSAGE_TAIL_CLEARANCE_PX = 24;

/** Space above the scroll-to-latest control (tighter than message tail; sits in overlay) */
export const SCROLL_TO_LATEST_INPUT_CLEARANCE_PX = 6;

const FALLBACK_INPUT_BLOCK_ACTIVE_PX = 96;
const FALLBACK_INPUT_BLOCK_COLLAPSED_PX = 54;
const NORMAL_INPUT_BLOCK_SAFE_PX = 96;

/**
 * Vertical space the floating composer occupies at the bottom of the pane.
 *
 * The message list is inset by this much, so the scroller — and therefore its
 * scrollbar, the pinned activity bar and the scroll-to-latest control — ends
 * above the composer instead of running underneath it at every window size.
 *
 * `measuredInputHeight` is the drop-zone `offsetHeight` from ChatInput
 * (excluding the viewport bottom inset in `CHAT_INPUT_DROP_ZONE_BOTTOM_PX`).
 */
export function computeFlowChatInputStackInsetPx(
  measuredInputHeight: number,
  isInputActive: boolean,
): number {
  const measuredInputBlock = measuredInputHeight > 0
    ? measuredInputHeight
    : isInputActive
      ? FALLBACK_INPUT_BLOCK_ACTIVE_PX
      : FALLBACK_INPUT_BLOCK_COLLAPSED_PX;
  const inputBlock = Math.max(measuredInputBlock, NORMAL_INPUT_BLOCK_SAFE_PX);
  return inputBlock + CHAT_INPUT_DROP_ZONE_BOTTOM_PX;
}

/** Granularity of the list inset; also the width of its hysteresis band. */
export const FLOWCHAT_INPUT_STACK_INSET_STEP_PX = 8;

/**
 * Settle the raw inset onto a coarse step.
 *
 * The inset drives the height of the scroll viewport, so any wobble in the
 * measured composer height moves the whole transcript. A composer that
 * re-measures a pixel back and forth — a caret change, a status chip, a
 * sub-pixel layout — would shake the conversation at the observer's frequency.
 * The value therefore only moves in whole steps, and a shrink of less than one
 * step is ignored; a real expansion (another input line) still lands at once.
 */
export function settleFlowChatInputStackInsetPx(
  rawInsetPx: number,
  previousInsetPx: number | null,
): number {
  const stepped = Math.ceil(rawInsetPx / FLOWCHAT_INPUT_STACK_INSET_STEP_PX)
    * FLOWCHAT_INPUT_STACK_INSET_STEP_PX;

  if (previousInsetPx === null) return stepped;

  const withinHysteresis =
    rawInsetPx <= previousInsetPx &&
    rawInsetPx > previousInsetPx - FLOWCHAT_INPUT_STACK_INSET_STEP_PX;

  return withinHysteresis ? previousInsetPx : stepped;
}

/**
 * Height of the Virtuoso footer spacer.
 *
 * The composer's own height is handled by the list inset above, so the spacer
 * only has to keep the last message off the bottom edge of the list.
 */
export function computeFlowChatInputStackFooterPx(
  _measuredInputHeight: number,
  _isInputActive: boolean,
): number {
  return FLOWCHAT_MESSAGE_TAIL_CLEARANCE_PX;
}
