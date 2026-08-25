/**
 * P4 W9 pure-geometry closure for the alignment guides.
 *
 * Behavior only: which anchor wins, when nothing snaps, and which nodes are
 * excluded. No styling and no reactflow involved.
 */
import { describe, expect, it } from 'vitest';

import {
  computeInfiniteCanvasHelperLines,
  INFINITE_CANVAS_DEFAULT_NODE_SIZE,
  INFINITE_CANVAS_SNAP_THRESHOLD,
} from './infiniteCanvasHelperLines';

const SIZE = { width: 100, height: 60 };

function box(id: string, x: number, y: number, kind?: string) {
  return { id, position: { x, y }, ...SIZE, ...(kind ? { kind } : {}) };
}

describe('computeInfiniteCanvasHelperLines', () => {
  it('snaps left edges together and reports the vertical guide', () => {
    const result = computeInfiniteCanvasHelperLines(
      box('dragged', 203, 500),
      [box('anchor', 200, 0)],
    );
    expect(result.position.x).toBe(200);
    expect(result.verticalLine).toBe(200);
    expect(result.horizontalLine).toBeUndefined();
  });

  it('snaps centers together', () => {
    // anchor center x = 250; dragged center must land there => left = 200.
    const result = computeInfiniteCanvasHelperLines(
      box('dragged', 197, 900),
      [box('anchor', 200, 0)],
    );
    expect(result.position.x).toBe(200);
    expect(result.verticalLine).toBe(200);
  });

  it('snaps the dragged right edge onto an anchor right edge', () => {
    // anchor right = 300; dragged right (x+100) within threshold of it.
    const result = computeInfiniteCanvasHelperLines(
      box('dragged', 198, 900),
      [box('anchor', 200, 0)],
    );
    expect(result.position.x + SIZE.width).toBe(300);
  });

  it('snaps top, center and bottom on the vertical axis', () => {
    const top = computeInfiniteCanvasHelperLines(box('d', 900, 102), [box('a', 0, 100)]);
    expect(top.position.y).toBe(100);
    expect(top.horizontalLine).toBe(100);

    // anchor center y = 130 => dragged top lands at 100 as well.
    const center = computeInfiniteCanvasHelperLines(box('d', 900, 98), [box('a', 0, 100)]);
    expect(center.position.y).toBe(100);

    // anchor bottom = 160 => dragged bottom (y+60) snaps onto it.
    const bottom = computeInfiniteCanvasHelperLines(box('d', 900, 103), [box('a', 0, 100)]);
    expect(bottom.position.y + SIZE.height).toBe(160);
  });

  it('does not snap outside the threshold', () => {
    const distance = INFINITE_CANVAS_SNAP_THRESHOLD + 1;
    const result = computeInfiniteCanvasHelperLines(
      box('dragged', 200 + distance, 5000),
      [box('anchor', 200, 0)],
    );
    expect(result.position).toEqual({ x: 200 + distance, y: 5000 });
    expect(result.verticalLine).toBeUndefined();
    expect(result.horizontalLine).toBeUndefined();
  });

  it('ignores the dragged node itself and group nodes', () => {
    const dragged = box('dragged', 203, 103);
    const result = computeInfiniteCanvasHelperLines(dragged, [
      dragged,
      box('a-group', 200, 100, 'group'),
    ]);
    expect(result.position).toEqual({ x: 203, y: 103 });
    expect(result.verticalLine).toBeUndefined();
  });

  it('falls back to the default card box when a node has not been measured', () => {
    const result = computeInfiniteCanvasHelperLines(
      { id: 'dragged', position: { x: 2, y: 9000 } },
      [{ id: 'anchor', position: { x: 0, y: 0 } }],
    );
    expect(result.position.x).toBe(0);
    expect(INFINITE_CANVAS_DEFAULT_NODE_SIZE.width).toBeGreaterThan(0);
  });

  it('keeps the closest of several competing anchors', () => {
    const result = computeInfiniteCanvasHelperLines(
      box('dragged', 204, 9000),
      [box('far', 200, 0), box('near', 205, 0)],
    );
    expect(result.position.x).toBe(205);
    expect(result.verticalLine).toBe(205);
  });
});
