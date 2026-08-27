/**
 * P6: the expand editor as a surface.
 *
 * The frame is kept in the picture's natural pixels and rendered in
 * percentages, so what is asserted here is the geometry the confirm hands over
 * — never a style. The three properties worth paying for:
 *
 * - the frame can only grow OUTWARDS, and only as far as the cap allows;
 * - the composite is the original at natural scale, at the right offset, on a
 *   canvas of the right size;
 * - nothing is thrown away by accident, and nothing is sent by accident.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { CANVAS_EXPAND_MAX_RATIO } from './infiniteCanvasImageRaster';
import { InfiniteCanvasExpandEditor } from './InfiniteCanvasExpandEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MEDIA_REF = {
  workspacePath: 'C:/ws',
  relativePath: 'media/generated/b1/image-001.png',
};

const PNG_DATA_URL = 'data:image/png;base64,QUJD';

/** The picture under test: 1000 × 500 natural pixels. */
const NATURAL = { width: 1000, height: 500 };

const GENERATOR = {
  target: {
    nodeId: 'n-image',
    mediaKind: 'image' as const,
    prompt: '',
    modelLabel: 'test-model',
    pending: false,
  },
};

function installCanvasStub(dom: JSDOM): {
  draws: unknown[][];
  sizes: { width: number; height: number }[];
} {
  const draws: unknown[][] = [];
  const sizes: { width: number; height: number }[] = [];
  dom.window.HTMLCanvasElement.prototype.getContext = (function getContext(
    this: HTMLCanvasElement,
  ) {
    // The canvas is captured through the call, not aliased: the composite's
    // surface size is exactly what this test is here to pin down.
    const { width, height } = this;
    return {
      drawImage: (...args: unknown[]) => {
        sizes.push({ width, height });
        draws.push(args);
      },
      clearRect: () => undefined,
    };
  }) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = (() => (
    'data:image/png;base64,RVhQQU5E'
  )) as never;
  return { draws, sizes };
}

describe('InfiniteCanvasExpandEditor', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let draws: unknown[][];
  let sizes: { width: number; height: number }[];
  let onConfirm: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Blob', dom.window.Blob);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => (
      { ...NATURAL, close: () => undefined } as unknown as ImageBitmap
    )));
    ({ draws, sizes } = installCanvasStub(dom));
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    onConfirm = vi.fn();
    onClose = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderEditor(resolve: () => Promise<string | undefined> = async () => (
    PNG_DATA_URL
  )) {
    await act(async () => {
      root.render(
        <InfiniteCanvasExpandEditor
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={resolve}
          generator={GENERATOR}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  const surface = () => container.querySelector('[data-canvas-editor="expand"]')!;
  const stage = () => container.querySelector('[data-expand-stage="true"]') as HTMLElement;
  const sendButton = () => (
    container.querySelector('[data-canvas-generator-action="send"]') as HTMLButtonElement
  );

  function insetsOf() {
    const element = stage();
    return {
      left: Number(element.getAttribute('data-expand-left')),
      top: Number(element.getAttribute('data-expand-top')),
      right: Number(element.getAttribute('data-expand-right')),
      bottom: Number(element.getAttribute('data-expand-bottom')),
    };
  }

  function sizeOf() {
    const element = stage();
    return {
      width: Number(element.getAttribute('data-expand-width')),
      height: Number(element.getAttribute('data-expand-height')),
    };
  }

  /** JSDOM reports a zero-sized box, so client pixels map 1:1 onto natural. */
  function drag(handle: string, dx: number, dy: number) {
    act(() => {
      Simulate.mouseDown(
        container.querySelector(`[data-expand-handle="${handle}"]`)!,
        { clientX: 0, clientY: 0 } as never,
      );
    });
    act(() => {
      Simulate.mouseMove(stage(), { clientX: dx, clientY: dy } as never);
    });
    act(() => {
      Simulate.mouseUp(stage(), { clientX: dx, clientY: dy } as never);
    });
  }

  it('stays invisible until the natural size is known, then opens unexpanded', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasExpandEditor
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={() => new Promise(() => undefined)}
          generator={GENERATOR}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    // The stage's ratio comes from a measurement; nothing is shown before that
    // measurement exists, so it can never snap from a guess to the truth.
    expect(surface().getAttribute('data-ready')).toBe('false');

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderEditor();

    expect(surface().getAttribute('data-ready')).toBe('true');
    // The frame opens ON the picture: expanding is something you ask for.
    expect(insetsOf()).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(sizeOf()).toEqual(NATURAL);
    expect(sendButton().disabled).toBe(true);
  });

  it('grows outwards from an edge grip and reports the new canvas', async () => {
    await renderEditor();

    drag('e', 300, 0);

    expect(insetsOf()).toEqual({ left: 0, top: 0, right: 300, bottom: 0 });
    expect(sizeOf()).toEqual({ width: 1300, height: 500 });
    expect(sendButton().disabled).toBe(false);
  });

  it('grows on both axes from a corner grip', async () => {
    await renderEditor();

    drag('nw', -120, -60);

    expect(insetsOf()).toEqual({ left: 120, top: 60, right: 0, bottom: 0 });
    expect(sizeOf()).toEqual({ width: 1120, height: 560 });
  });

  /**
   * The load-bearing rule: outpainting must leave the source pixels alone, so a
   * frame dragged INWARDS is refused rather than quietly becoming a crop.
   */
  it('refuses to let the frame shrink below the original picture', async () => {
    await renderEditor();

    drag('e', -400, 0);
    expect(insetsOf().right).toBe(0);
    expect(sizeOf()).toEqual(NATURAL);

    drag('s', -400, -400);
    expect(insetsOf().bottom).toBe(0);
    expect(sizeOf()).toEqual(NATURAL);
    // Nothing to send: the picture is still exactly itself.
    expect(sendButton().disabled).toBe(true);
  });

  it('stops each side at the cap however far the grip is dragged', async () => {
    await renderEditor();

    drag('e', 100000, 0);
    drag('s', 0, 100000);

    const insets = insetsOf();
    expect(insets.right).toBe(NATURAL.width * CANVAS_EXPAND_MAX_RATIO);
    expect(insets.bottom).toBe(NATURAL.height * CANVAS_EXPAND_MAX_RATIO);
    expect(sizeOf()).toEqual({
      width: NATURAL.width * (1 + CANVAS_EXPAND_MAX_RATIO),
      height: NATURAL.height * (1 + CANVAS_EXPAND_MAX_RATIO),
    });
  });

  it('composites at natural scale onto the expanded canvas and hands back bare base64', async () => {
    await renderEditor();

    drag('nw', -200, -100);
    act(() => {
      Simulate.click(sendButton());
    });

    expect(onConfirm).toHaveBeenCalledWith({
      base64Png: 'RVhQQU5E',
      insets: { left: 200, top: 100, right: 0, bottom: 0 },
      size: { width: 1200, height: 600 },
    });
    // One draw, at the dragged offset, at natural scale — the surface it lands
    // on is the target canvas and the rest of it stays transparent.
    expect(draws).toHaveLength(1);
    expect(draws[0].slice(1)).toEqual([200, 100]);
    expect(sizes[0]).toEqual({ width: 1200, height: 600 });
  });

  it('reports the frame ratio rather than offering a preset that does nothing', async () => {
    await renderEditor();

    // 1000 × 500 reduces to 2 : 1; dragging 500 to the right makes it 3 : 1.
    expect(container.querySelector('[data-expand-ratio="true"]')!.textContent).toBe('2 : 1');
    drag('e', 500, 0);
    expect(container.querySelector('[data-expand-ratio="true"]')!.textContent).toBe('3 : 1');
  });

  it('closes on Escape while the frame is untouched', async () => {
    await renderEditor();

    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves through the pill × when the frame is untouched', async () => {
    await renderEditor();

    act(() => {
      Simulate.click(container.querySelector('[data-expand-action="back"]')!);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm="expand-discard"]')).toBeNull();
  });

  it('asks before the pill × drops a frame the user dragged out', async () => {
    await renderEditor();
    drag('e', 240, 0);

    act(() => {
      Simulate.click(container.querySelector('[data-expand-action="back"]')!);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-canvas-confirm="expand-discard"]')).not.toBeNull();

    // Confirming the discard is the only route out that loses the frame.
    act(() => {
      Simulate.click(container.querySelector('[data-canvas-confirm-action="confirm"]')!);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('asks before a press on the blurred board drops a dragged frame', async () => {
    await renderEditor();
    drag('w', -240, 0);

    act(() => {
      dom.window.document.body.dispatchEvent(
        new dom.window.MouseEvent('mousedown', { bubbles: true }),
      );
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-canvas-confirm="expand-discard"]')).not.toBeNull();
  });

  it('reports a picture it cannot open instead of showing an empty stage', async () => {
    await renderEditor(async () => undefined);

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('infiniteCanvas.expand.unavailable');
    expect(surface().getAttribute('data-state')).toBe('failed');
    // P5 review C6: the way out must survive a picture that never decodes.
    expect(container.querySelector('[data-expand-action="back"]')).not.toBeNull();
  });
});
