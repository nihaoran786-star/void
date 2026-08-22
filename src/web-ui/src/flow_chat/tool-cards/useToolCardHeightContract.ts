import { useCallback, useRef } from 'react';
import { deferAutoCollapse, isReaderControlled } from '../components/modern/readerControlGate';

export type ToolCardCollapseReason = 'manual' | 'auto';

/**
 * "Something in the transcript just changed height."
 *
 * The standalone half of the height contract, for content that is not a tool
 * card and has no expand/collapse state to route through `applyExpandedState`:
 * an image that finishes decoding, an async-rendered diagram, a syntax
 * highlighter that swaps plain text for tokens. All of them change their box
 * after mount, and `VirtualMessageList` otherwise has to discover it as an
 * unsignalled delta — the path that produces blank tail space and jitter.
 *
 * Use this for *growth* and for changes whose direction is not known in
 * advance. A shrink that is known before it happens should still announce
 * itself with `flowchat:tool-card-collapse-intent` so the list can
 * pre-compensate.
 */
export function notifyToolCardHeightChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tool-card-toggle'));
}

interface UseToolCardHeightContractOptions {
  toolId: string | null | undefined;
  toolName: string;
  getCardHeight?: () => number | null;
}

interface ApplyHeightContractOptions {
  reason?: ToolCardCollapseReason;
  onExpand?: () => void;
  detail?: Record<string, unknown>;
}

export function useToolCardHeightContract({
  toolId,
  toolName,
  getCardHeight,
}: UseToolCardHeightContractOptions) {
  const cardRootRef = useRef<HTMLDivElement>(null);

  const dispatchToolCardToggle = useCallback(() => {
    notifyToolCardHeightChanged();
  }, []);

  const dispatchCollapseIntent = useCallback((
    reason: ToolCardCollapseReason,
    detail?: Record<string, unknown>,
  ) => {
    const cardHeight = getCardHeight?.()
      ?? cardRootRef.current?.getBoundingClientRect().height
      ?? null;

    window.dispatchEvent(new CustomEvent('flowchat:tool-card-collapse-intent', {
      detail: {
        toolId: toolId ?? null,
        toolName,
        cardHeight,
        reason,
        ...detail,
      },
    }));
  }, [getCardHeight, toolId, toolName]);

  const applyExpandedState = useCallback((
    currentExpanded: boolean,
    nextExpanded: boolean,
    setExpanded: (nextExpanded: boolean) => void,
    options?: ApplyHeightContractOptions,
  ) => {
    const reason = options?.reason ?? 'manual';
    const isCollapsing = !nextExpanded && currentExpanded;

    // Freeze automatic collapses while the reader is reading further up: a card
    // shrinking above them drags the text they are looking at. Queue it and let
    // it happen once they are back at the bottom.
    if (isCollapsing && reason === 'auto' && isReaderControlled()) {
      deferAutoCollapse(`${toolName}:${toolId ?? 'anonymous'}`, () => {
        dispatchCollapseIntent('auto', options?.detail);
        setExpanded(false);
        dispatchToolCardToggle();
      });
      return;
    }

    if (isCollapsing) {
      dispatchCollapseIntent(reason, options?.detail);
    }

    if (nextExpanded !== currentExpanded) {
      setExpanded(nextExpanded);
      dispatchToolCardToggle();
    }

    if (nextExpanded) {
      options?.onExpand?.();
    }
  }, [dispatchCollapseIntent, dispatchToolCardToggle, toolId, toolName]);

  return {
    cardRootRef,
    dispatchToolCardToggle,
    dispatchCollapseIntent,
    applyExpandedState,
  };
}
