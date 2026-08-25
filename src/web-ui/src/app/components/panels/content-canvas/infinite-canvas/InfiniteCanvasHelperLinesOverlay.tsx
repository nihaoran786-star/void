/**
 * Alignment guide overlay for the Infinite Canvas panel (P4 W9).
 *
 * Deliberately dumb: it receives the two guide positions already converted to
 * panel pixels and draws one hairline each. Keeping the flow-to-screen maths
 * in the panel means this overlay needs no reactflow store access — and so
 * the panel needs no `ReactFlowProvider`, which stays a later slice's call.
 * The layer never captures pointer events.
 */
import React from 'react';

export interface InfiniteCanvasHelperLinesProps {
  /** Panel-pixel x of the vertical guide, when the drag matched one. */
  vertical?: number;
  /** Panel-pixel y of the horizontal guide, when the drag matched one. */
  horizontal?: number;
}

export const InfiniteCanvasHelperLines: React.FC<InfiniteCanvasHelperLinesProps> = ({
  vertical,
  horizontal,
}) => {
  if (vertical === undefined && horizontal === undefined) return null;
  return (
    <div className="infinite-canvas-helper-lines" data-helper-lines aria-hidden="true">
      {vertical === undefined ? null : (
        <span
          className="infinite-canvas-helper-lines__line infinite-canvas-helper-lines__line--v"
          data-helper-line="vertical"
          style={{ left: `${vertical}px` }}
        />
      )}
      {horizontal === undefined ? null : (
        <span
          className="infinite-canvas-helper-lines__line infinite-canvas-helper-lines__line--h"
          data-helper-line="horizontal"
          style={{ top: `${horizontal}px` }}
        />
      )}
    </div>
  );
};

InfiniteCanvasHelperLines.displayName = 'InfiniteCanvasHelperLines';
