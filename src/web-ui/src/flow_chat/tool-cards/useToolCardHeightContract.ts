import { useCallback, useRef } from 'react';
import { deferAutoCollapse, isReaderControlled } from '../components/modern/readerControlGate';

export type ToolCardCollapseReason = 'manual' | 'auto';

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
    window.dispatchEvent(new CustomEvent('tool-card-toggle'));
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
