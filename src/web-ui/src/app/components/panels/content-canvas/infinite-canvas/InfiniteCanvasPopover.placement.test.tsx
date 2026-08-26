/**
 * The clamp, through the real component (visual language §7.3-B).
 *
 * `infiniteCanvasPopoverPlacement.test.ts` pins the maths; this pins the wiring
 * — that the surface really measures the PANEL (not the viewport) and writes
 * the clamped box into its inline style. jsdom has no layout, so every
 * rectangle here comes from a stubbed `getBoundingClientRect`, one per element
 * class, which is exactly the three situations the owner hit:
 * a trigger against the right edge, against the left edge, and with no room
 * above it.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The panel occupies the right two thirds of a 1280×800 window. */
const PANEL_RECT = { left: 300, top: 60, width: 900, height: 700 };
const SURFACE_HEIGHT = 240;
const WIDTH = 300;

function boxOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('InfiniteCanvasPopover placement', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let anchorRect: DOMRect;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body><div class="infinite-canvas-panel"><div id="root"></div>'
      + '<button id="trigger">model</button></div></body></html>',
      { pretendToBeVisual: true },
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    dom.window.innerWidth = 1280;
    dom.window.innerHeight = 800;

    anchorRect = boxOf(500, 600, 120, 24);
    // One stub for every element: the panel, the trigger and the surface each
    // answer their own rectangle, since jsdom measures nothing.
    dom.window.HTMLElement.prototype.getBoundingClientRect = function rectOf(
      this: HTMLElement,
    ): DOMRect {
      if (this.classList.contains('infinite-canvas-panel')) {
        return boxOf(PANEL_RECT.left, PANEL_RECT.top, PANEL_RECT.width, PANEL_RECT.height);
      }
      if (this.id === 'trigger') return anchorRect;
      if (this.classList.contains('infinite-canvas-popover')) {
        return boxOf(0, 0, WIDTH, SURFACE_HEIGHT);
      }
      return boxOf(0, 0, 0, 0);
    };

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  async function renderAt(rect: DOMRect): Promise<HTMLElement> {
    anchorRect = rect;
    const anchor = dom.window.document.getElementById('trigger') as HTMLElement;
    await act(async () => {
      root.render(
        <InfiniteCanvasPopover
          kind="test"
          width={WIDTH}
          label="test"
          anchor={anchor}
          onDismiss={() => undefined}
        >
          <div style={{ height: SURFACE_HEIGHT }} />
        </InfiniteCanvasPopover>,
      );
    });
    return container.querySelector<HTMLElement>('[data-canvas-popover="test"]')!;
  }

  // The surface is positioned against the panel, not the viewport (an ancestor
  // of the canvas is transformed, so even `position: fixed` would resolve
  // against it). The component therefore emits panel-relative numbers, and
  // these expectations read them back in the same space.
  function boxOfSurface(surface: HTMLElement): { left: number; top: number; maxHeight: number } {
    return {
      left: Number.parseFloat(surface.style.left),
      top: Number.parseFloat(surface.style.top),
      maxHeight: Number.parseFloat(surface.style.maxHeight),
    };
  }

  it('aligns the left edges and opens above, capping the height at 420px', async () => {
    const surface = await renderAt(boxOf(500, 600, 120, 24));
    const box = boxOfSurface(surface);

    expect(surface.getAttribute('data-canvas-popover-side')).toBe('above');
    expect(box.left).toBe(500 - PANEL_RECT.left);
    expect(box.top).toBe(600 - 8 - SURFACE_HEIGHT - PANEL_RECT.top);
    expect(box.maxHeight).toBe(420);
  });

  it('never overflows the panel right edge', async () => {
    // A trigger 60px from the panel's right edge: the old viewport clamp let
    // 300px of surface run past the panel and get clipped.
    const surface = await renderAt(boxOf(1140, 600, 60, 24));
    const box = boxOfSurface(surface);

    expect(box.left + WIDTH).toBeLessThanOrEqual(PANEL_RECT.width);
    expect(box.left).toBe(PANEL_RECT.width - 8 - WIDTH);
  });

  it('never overflows the panel left edge', async () => {
    const surface = await renderAt(boxOf(302, 600, 60, 24));

    expect(boxOfSurface(surface).left).toBe(8);
  });

  it('flips below when there is no room above, and stays inside the panel', async () => {
    const surface = await renderAt(boxOf(500, 100, 120, 24));
    const box = boxOfSurface(surface);

    expect(surface.getAttribute('data-canvas-popover-side')).toBe('below');
    expect(box.top).toBe(132 - PANEL_RECT.top);
    expect(box.top + SURFACE_HEIGHT).toBeLessThanOrEqual(PANEL_RECT.height);
  });
});
