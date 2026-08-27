/**
 * The merged frame editor (§7.4.1), tested in BOTH directions from one file —
 * which is the point of the merge: there is one component, so there is one
 * suite, and a rule that holds for cropping is asserted next to the same rule
 * for expanding.
 *
 * What is asserted is geometry and behaviour, never a style:
 *
 * - both directions open where they should and report what they should;
 * - each direction's clamp holds at its own boundary — inward may not leave
 *   the picture nor shrink below a usable size, outward may not go inwards at
 *   all nor past the write-ceiling cap;
 * - the two submit paths still hand over exactly what their lanes need;
 * - closing never asks (§7.4.2), by any of the three routes.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import {
  CANVAS_CROP_MIN_SIZE,
  CANVAS_EXPAND_MAX_RATIO,
} from './infiniteCanvasImageRaster';
import { InfiniteCanvasFrameEditor } from './InfiniteCanvasFrameEditor';
import type { CanvasFrameDirection } from './infiniteCanvasFrameGeometry';

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
    // The canvas is captured through the call, not aliased: the surface size
    // the composite lands on is part of what this file pins down.
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
    'data:image/png;base64,RlJBTUU='
  )) as never;
  return { draws, sizes };
}

describe('InfiniteCanvasFrameEditor', () => {
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

  async function renderEditor(
    direction: CanvasFrameDirection,
    resolve: () => Promise<string | undefined> = async () => PNG_DATA_URL,
  ) {
    await act(async () => {
      root.render(
        <InfiniteCanvasFrameEditor
          direction={direction}
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

  const surface = () => container.querySelector('[data-canvas-stage]')!;
  const stage = () => container.querySelector('[data-canvas-frame-stage="true"]') as HTMLElement;
  const box = () => container.querySelector('[data-canvas-frame-box="true"]') as HTMLElement;
  const readout = () => container.querySelector('[data-canvas-frame-readout="true"]')!;
  const closeButton = () => container.querySelector('[data-canvas-stage-action="close"]')!;
  const cropConfirm = () => (
    container.querySelector('[data-canvas-frame-action="confirm"]') as HTMLButtonElement
  );
  const sendButton = () => (
    container.querySelector('[data-canvas-generator-action="send"]') as HTMLButtonElement
  );

  /** The box in natural pixels, as the surface itself reports it. */
  function rectOf() {
    const element = box();
    return {
      x: Number(element.getAttribute('data-canvas-frame-x')),
      y: Number(element.getAttribute('data-canvas-frame-y')),
      width: Number(element.getAttribute('data-canvas-frame-box-width')),
      height: Number(element.getAttribute('data-canvas-frame-box-height')),
    };
  }

  /** JSDOM reports a zero-sized box, so client pixels map 1:1 onto natural. */
  function drag(handle: string, dx: number, dy: number) {
    act(() => {
      Simulate.mouseDown(
        container.querySelector(`[data-canvas-frame-handle="${handle}"]`)!,
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

  function pressEscape() {
    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });
  }

  // —— One shell, two assemblies ————————————————————————————————————————————

  it('mounts the one shared stage in both directions', async () => {
    await renderEditor('inward');
    expect(surface().getAttribute('data-canvas-stage')).toBe('crop');
    // The `×` is the shell's, not the scene's, and cropping has no input box.
    expect(closeButton()).not.toBeNull();
    expect(container.querySelector('[data-canvas-generator-surface="editor"]')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderEditor('outward');
    expect(surface().getAttribute('data-canvas-stage')).toBe('expand');
    expect(closeButton()).not.toBeNull();
    // §7.4.4: expanding sends from the SHARED generator, writing area and all
    // — the owner asked to be able to type underneath the frame.
    expect(container.querySelector('[data-canvas-generator-surface="editor"]')).not.toBeNull();
    expect(container.querySelector('[data-canvas-generator-prompt]')?.getAttribute(
      'data-canvas-generator-prompt',
    )).toBe('open');
    expect(container.querySelector('[data-canvas-generator-field="prompt"]')).not.toBeNull();
    expect(cropConfirm()).toBeNull();
  });

  it('gives both directions the same eight grips', async () => {
    await renderEditor('inward');
    expect(container.querySelectorAll('[data-canvas-frame-handle]')).toHaveLength(8);

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderEditor('outward');
    expect(container.querySelectorAll('[data-canvas-frame-handle]')).toHaveLength(8);
  });

  // —— Opening ——————————————————————————————————————————————————————————————

  it('stays invisible until the natural size is known', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasFrameEditor
          direction="inward"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={() => new Promise(() => undefined)}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    // The box's geometry comes from a measurement; nothing is shown before
    // that measurement exists, so it can never snap from a guess to the truth.
    expect(surface().getAttribute('data-ready')).toBe('false');
    expect(container.querySelector('[data-canvas-frame-box="true"]')).toBeNull();
  });

  it('opens inward at a centred 80% box and outward flush with the picture', async () => {
    await renderEditor('inward');
    expect(surface().getAttribute('data-ready')).toBe('true');
    expect(rectOf()).toEqual({ x: 100, y: 50, width: 800, height: 400 });
    expect(readout().textContent).toBe('800 × 400');

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderEditor('outward');
    // Expanding is something you ask for: nothing is added until it is dragged.
    expect(rectOf()).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    expect(readout().textContent).toBe('2 : 1');
    expect(sendButton().disabled).toBe(true);
  });

  // —— The inward clamp —————————————————————————————————————————————————————

  it('clamps an inward grip dragged past the edge back into the picture', async () => {
    await renderEditor('inward');

    drag('nw', -600, -600);

    const rect = rectOf();
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(NATURAL.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(NATURAL.height);
  });

  it('never lets the inward box shrink below the minimum size', async () => {
    await renderEditor('inward');

    drag('se', -799, -399);

    const rect = rectOf();
    expect(rect.width).toBeGreaterThanOrEqual(CANVAS_CROP_MIN_SIZE);
    expect(rect.height).toBeGreaterThanOrEqual(CANVAS_CROP_MIN_SIZE);
  });

  it('pans the inward box without resizing it', async () => {
    await renderEditor('inward');

    act(() => {
      Simulate.mouseDown(box(), { clientX: 0, clientY: 0 } as never);
    });
    act(() => {
      Simulate.mouseMove(stage(), { clientX: 40, clientY: 20 } as never);
    });

    expect(rectOf()).toEqual({ x: 140, y: 70, width: 800, height: 400 });
  });

  // —— The outward clamp ————————————————————————————————————————————————————

  it('grows outwards from a grip and reports the new canvas', async () => {
    await renderEditor('outward');

    drag('e', 300, 0);
    expect(rectOf()).toEqual({ x: 0, y: 0, width: 1300, height: 500 });
    expect(readout().textContent).toBe('13 : 5');
    expect(sendButton().disabled).toBe(false);

    drag('nw', -120, -60);
    expect(rectOf()).toEqual({ x: -120, y: -60, width: 1420, height: 560 });
  });

  /**
   * The load-bearing rule of the outward direction (§7.4.4): the box may be
   * dragged either way, and the only thing it may not do is stop containing
   * the picture. A grip pulled inwards therefore walks that side back to the
   * picture's edge and stops there — it is held, not rejected.
   */
  it('holds an inward-dragged outward grip at the picture edge', async () => {
    await renderEditor('outward');

    drag('e', -400, 0);
    drag('s', 0, -400);

    expect(rectOf()).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    expect(sendButton().disabled).toBe(true);
  });

  /**
   * §7.4.4, in the owner's words: "你还可以任意拖拽调整裁剪框". Out on one side,
   * back in on the same side, out again — each grip answers in both directions
   * for as long as the box still holds the picture.
   */
  it('lets an outward grip be dragged back in and out again', async () => {
    await renderEditor('outward');

    drag('e', 400, 0);
    expect(rectOf()).toEqual({ x: 0, y: 0, width: 1400, height: 500 });

    // Back in — not to zero, to somewhere in between. This is the gesture the
    // owner reported as impossible.
    drag('e', -150, 0);
    expect(rectOf()).toEqual({ x: 0, y: 0, width: 1250, height: 500 });

    drag('e', 50, 0);
    expect(rectOf()).toEqual({ x: 0, y: 0, width: 1300, height: 500 });
    expect(sendButton().disabled).toBe(false);
  });

  /**
   * The frame may sit off-centre on the picture — a lot added on the left and
   * nothing on the right is a legal request — and an off-centre frame submits
   * exactly as it looks.
   */
  it('submits an off-centre outward frame as it stands', async () => {
    await renderEditor('outward');

    drag('w', -300, 0);

    expect(rectOf()).toEqual({ x: -300, y: 0, width: 1300, height: 500 });
    act(() => {
      Simulate.click(sendButton());
    });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      insets: { left: 300, top: 0, right: 0, bottom: 0 },
      size: { width: 1300, height: 500 },
    }));
  });

  /**
   * The grips ride the box's border, so the first pixel of an outward gesture
   * is already off the stage element. Following the drag on the window is what
   * makes the frame movable at all; this asserts the gesture survives.
   */
  it('keeps following an outward drag after the pointer leaves the stage', async () => {
    await renderEditor('outward');

    act(() => {
      Simulate.mouseDown(
        container.querySelector('[data-canvas-frame-handle="e"]')!,
        { clientX: 0, clientY: 0 } as never,
      );
    });
    act(() => {
      stage().dispatchEvent(new dom.window.MouseEvent('mouseleave', { bubbles: false }));
    });
    act(() => {
      dom.window.dispatchEvent(new dom.window.MouseEvent('mousemove', {
        clientX: 260,
        clientY: 0,
      }));
    });

    expect(rectOf().width).toBe(1260);
  });

  /**
   * §7.4.4: the writing area is optional. An empty box still sends, and what
   * is typed travels with the frame.
   */
  it('sends the outward frame with or without a sentence', async () => {
    await renderEditor('outward');
    drag('e', 200, 0);

    act(() => {
      Simulate.click(sendButton());
    });
    expect(onConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: '' }));

    const field = container.querySelector('[data-canvas-generator-field="prompt"]')!;
    act(() => {
      Simulate.change(field, { target: { value: '  a wider beach  ' } } as never);
    });
    act(() => {
      Simulate.click(sendButton());
    });
    expect(onConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ prompt: 'a wider beach' }),
    );
  });

  it('stops each outward side at the cap however far the grip is dragged', async () => {
    await renderEditor('outward');

    drag('e', 100000, 0);
    drag('s', 0, 100000);

    expect(rectOf()).toEqual({
      x: 0,
      y: 0,
      width: NATURAL.width * (1 + CANVAS_EXPAND_MAX_RATIO),
      height: NATURAL.height * (1 + CANVAS_EXPAND_MAX_RATIO),
    });
  });

  it('nudges a grip from the keyboard, through the same clamp', async () => {
    await renderEditor('outward');

    const grip = container.querySelector('[data-canvas-frame-handle="e"]')!;
    act(() => {
      Simulate.keyDown(grip, { key: 'ArrowRight', shiftKey: true } as never);
    });
    expect(rectOf().width).toBe(1010);

    act(() => {
      Simulate.keyDown(grip, { key: 'ArrowLeft', shiftKey: true } as never);
    });
    act(() => {
      Simulate.keyDown(grip, { key: 'ArrowLeft', shiftKey: true } as never);
    });
    // Still clamped: the keyboard is the same pipeline, not a way around it.
    expect(rectOf().width).toBe(1000);
  });

  // —— The two submit paths, unchanged by the merge ——————————————————————————

  it('cuts inward at natural scale and hands back bare base64', async () => {
    await renderEditor('inward');

    act(() => {
      Simulate.click(cropConfirm());
    });

    expect(onConfirm).toHaveBeenCalledWith({
      base64Png: 'RlJBTUU=',
      // Cropping mounts no input box, so it never carries a sentence.
      prompt: '',
      rect: { x: 100, y: 50, width: 800, height: 400 },
      insets: { left: 0, top: 0, right: 0, bottom: 0 },
      size: { width: 800, height: 400 },
    });
    expect(draws[0].slice(1)).toEqual([100, 50, 800, 400, 0, 0, 800, 400]);
  });

  it('composites outward at natural scale onto the expanded canvas', async () => {
    await renderEditor('outward');

    drag('nw', -200, -100);
    act(() => {
      Simulate.click(sendButton());
    });

    expect(onConfirm).toHaveBeenCalledWith({
      base64Png: 'RlJBTUU=',
      prompt: '',
      rect: { x: -200, y: -100, width: 1200, height: 600 },
      insets: { left: 200, top: 100, right: 0, bottom: 0 },
      size: { width: 1200, height: 600 },
    });
    // One draw, at the dragged offset, at natural scale — the surface it lands
    // on is the target canvas and the rest of it stays transparent.
    expect(draws).toHaveLength(1);
    expect(draws[0].slice(1)).toEqual([200, 100]);
    expect(sizes[0]).toEqual({ width: 1200, height: 600 });
  });

  // —— §7.4.2: closing never asks ————————————————————————————————————————————

  it.each(['inward', 'outward'] as const)(
    'leaves %s on Escape without asking, even after the box was moved',
    async direction => {
      await renderEditor(direction);
      drag('e', direction === 'inward' ? -60 : 240, 0);

      pressEscape();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it.each(['inward', 'outward'] as const)(
    'leaves %s through the pill × without asking, even after the box was moved',
    async direction => {
      await renderEditor(direction);
      drag('e', direction === 'inward' ? -60 : 240, 0);

      act(() => {
        Simulate.click(closeButton());
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
    },
  );

  it.each(['inward', 'outward'] as const)(
    'leaves %s on a press on the blurred board without asking',
    async direction => {
      await renderEditor(direction);
      drag('w', direction === 'inward' ? 60 : -240, 0);

      act(() => {
        dom.window.document.body.dispatchEvent(
          new dom.window.MouseEvent('mousedown', { bubbles: true }),
        );
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
    },
  );

  it('does not leave when the press lands on the picture itself', async () => {
    await renderEditor('inward');

    act(() => {
      stage().dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  // —— Failure ——————————————————————————————————————————————————————————————

  it.each(['inward', 'outward'] as const)(
    'reports a picture it cannot open (%s) and keeps the way out visible',
    async direction => {
      await renderEditor(direction, async () => undefined);

      expect(container.querySelector('[role="alert"]')?.textContent)
        .toBe(`infiniteCanvas.${direction === 'inward' ? 'crop' : 'expand'}.unavailable`);
      expect(surface().getAttribute('data-state')).toBe('failed');
      // `data-ready` never becomes true here, so the way out must live outside
      // the measure-before-show gate.
      expect(closeButton()).not.toBeNull();
    },
  );

  it('says the picture is opening while a slow decode is in flight', async () => {
    await renderEditor('inward', () => new Promise(() => undefined));

    expect(surface().getAttribute('data-state')).toBe('loading');
    const loading = container.querySelector('[data-canvas-frame-state="loading"]');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.closest('[data-canvas-stage-media]')).toBeNull();
  });
});
