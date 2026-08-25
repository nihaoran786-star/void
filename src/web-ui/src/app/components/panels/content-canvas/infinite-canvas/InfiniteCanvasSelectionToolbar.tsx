/**
 * Floating toolbar for a multi-selection (P4 W7, plan §2.5).
 *
 * Shown only from two selected cards up: a single card already carries its own
 * controls and its right-click menu, so a bar for one card would be clutter.
 *
 * Placement follows the union of the selected cards' rendered rectangles. When
 * those rectangles are not measurable (the cards are off-screen, or the flow
 * has not painted yet) the bar falls back to the top centre of the canvas
 * rather than disappearing — the actions stay reachable either way.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';

export type InfiniteCanvasSelectionAction = 'copy' | 'duplicate' | 'delete';

export interface InfiniteCanvasSelectionToolbarProps {
  nodeIds: readonly string[];
  /** The element the bar is positioned inside (the flow viewport wrapper). */
  containerRef: React.RefObject<HTMLElement | null>;
  onAction: (action: InfiniteCanvasSelectionAction) => void;
}

const ACTIONS: { action: InfiniteCanvasSelectionAction; labelKey: string }[] = [
  { action: 'copy', labelKey: 'infiniteCanvas.menu.copySelection' },
  { action: 'duplicate', labelKey: 'infiniteCanvas.menu.duplicate' },
  { action: 'delete', labelKey: 'infiniteCanvas.menu.deleteSelection' },
];

function unionRect(
  container: HTMLElement,
  nodeIds: readonly string[],
): { left: number; top: number } | undefined {
  if (typeof container.getBoundingClientRect !== 'function') return undefined;
  const host = container.getBoundingClientRect();
  let minLeft = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  for (const nodeId of nodeIds) {
    // CSS.escape: node ids are opaque and may legally contain characters a
    // raw attribute selector would choke on.
    const selector = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
      : `.react-flow__node[data-id="${nodeId}"]`;
    const element = container.querySelector(selector);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    minLeft = Math.min(minLeft, rect.left);
    maxRight = Math.max(maxRight, rect.right);
    minTop = Math.min(minTop, rect.top);
  }
  if (!Number.isFinite(minLeft) || !Number.isFinite(minTop)) return undefined;
  return {
    left: (minLeft + maxRight) / 2 - host.left,
    top: minTop - host.top - 40,
  };
}

export const InfiniteCanvasSelectionToolbar: React.FC<
  InfiniteCanvasSelectionToolbarProps
> = ({ nodeIds, containerRef, onAction }) => {
  const { t } = useI18n('components');
  const [placement, setPlacement] = React.useState<{ left: number; top: number } | undefined>();

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    setPlacement(container ? unionRect(container, nodeIds) : undefined);
  }, [containerRef, nodeIds]);

  return (
    <div
      className="infinite-canvas-selection-toolbar"
      role="toolbar"
      data-canvas-selection-toolbar={nodeIds.length}
      aria-label={t('infiniteCanvas.menu.selectionToolbar')}
      style={placement
        ? { left: `${placement.left}px`, top: `${Math.max(placement.top, 8)}px` }
        : undefined}
    >
      {ACTIONS.map(entry => (
        <button
          key={entry.action}
          type="button"
          className="infinite-canvas-selection-toolbar__button"
          data-canvas-selection-action={entry.action}
          onClick={() => onAction(entry.action)}
        >
          {t(entry.labelKey)}
        </button>
      ))}
    </div>
  );
};

InfiniteCanvasSelectionToolbar.displayName = 'InfiniteCanvasSelectionToolbar';
