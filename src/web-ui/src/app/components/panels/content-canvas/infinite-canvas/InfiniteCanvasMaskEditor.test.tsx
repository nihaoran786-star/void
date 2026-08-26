/**
 * P5 W3: the mask brush as a surface.
 *
 * No pixels are compared — the 2d context is a recording stub, so what is
 * pinned is the call shape (the eraser really does cut out of the mark layer
 * rather than paint on the picture), the isolation of this editor's undo stack
 * from the board's, and the two "you cannot lose work by accident" rules.
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
  CANVAS_BRUSH_DEFAULT,
  CANVAS_MARK_FILL,
  CANVAS_MARK_UNDO_LIMIT,
} from './infiniteCanvasImageRaster';
import { InfiniteCanvasMaskEditor } from './InfiniteCanvasMaskEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MEDIA_REF = {
  workspacePath: 'C:/ws',
  relativePath: 'media/generated/b1/image-001.png',
};

const PNG_DATA_URL = 'data:image/png;base64,QUJD';

interface RecordedCall {
  name: string;
  args: unknown[];
}

interface ContextStub {
  calls: RecordedCall[];
  composites: string[];
}

function installCanvasStub(dom: JSDOM): ContextStub {
  const calls: RecordedCall[] = [];
  const composites: string[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
  };
  dom.window.HTMLCanvasElement.prototype.getContext = (function getContext(
    this: HTMLCanvasElement,
  ) {
    const context = {
      canvas: this,
      lineCap: 'butt',
      lineJoin: 'miter',
      lineWidth: 1,
      fillStyle: '',
      strokeStyle: '',
      set globalCompositeOperation(value: string) {
        composites.push(value);
      },
      get globalCompositeOperation() {
        return composites[composites.length - 1] ?? 'source-over';
      },
      save: record('save'),
      restore: record('restore'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      stroke: record('stroke'),
      fillRect: record('fillRect'),
      strokeRect: record('strokeRect'),
      clearRect: record('clearRect'),
      drawImage: record('drawImage'),
      putImageData: record('putImageData'),
      getImageData: (..._args: unknown[]) => {
        calls.push({ name: 'getImageData', args: [] });
        return { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData;
      },
    };
    return context as unknown as CanvasRenderingContext2D;
  }) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = (() => (
    'data:image/png;base64,Q09NUE9TSVRF'
  )) as never;
  return { calls, composites };
}

describe('InfiniteCanvasMaskEditor', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let stub: ContextStub;
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
      { width: 1600, height: 1200, close: () => undefined } as unknown as ImageBitmap
    )));
    stub = installCanvasStub(dom);
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

  async function renderEditor(toolId: 'inpaint' | 'erase' = 'inpaint') {
    await act(async () => {
      root.render(
        <InfiniteCanvasMaskEditor
          toolId={toolId}
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={async () => PNG_DATA_URL}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    // Two microtask turns: resolve the preview URL, then decode the bitmap.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  const surface = () => container.querySelector('[data-canvas-editor="mask"]')!;
  const layer = () => container.querySelector('[data-mask-surface="layer"]') as HTMLCanvasElement;
  const confirmButton = () => (
    container.querySelector('[data-mask-action="confirm"]') as HTMLButtonElement
  );

  function paintStroke(from = { clientX: 10, clientY: 10 }, to = { clientX: 40, clientY: 40 }) {
    const canvas = layer();
    act(() => {
      Simulate.mouseDown(canvas, from as never);
      Simulate.mouseMove(canvas, to as never);
      Simulate.mouseUp(canvas, to as never);
    });
  }

  it('sizes the mark layer to the picture natural pixels, not the screen box', async () => {
    await renderEditor();

    expect(surface().getAttribute('data-ready')).toBe('true');
    expect(layer().width).toBe(1600);
    expect(layer().height).toBe(1200);
  });

  it('stays invisible until the picture has decoded', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasMaskEditor
          toolId="inpaint"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={() => new Promise(() => undefined)}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });

    // Nothing measured yet: the surface must not paint a guessed layout first.
    expect(surface().getAttribute('data-ready')).toBe('false');
  });

  it('paints the brush in the functional red, never a theme colour', async () => {
    await renderEditor();
    paintStroke();

    const strokes = stub.calls.filter(call => call.name === 'stroke');
    expect(strokes.length).toBeGreaterThan(0);
    expect(CANVAS_MARK_FILL).toBe('rgba(255, 46, 46, 0.55)');
    expect(stub.composites).toContain('source-over');
  });

  it('erases out of the mark layer with destination-out', async () => {
    await renderEditor();
    act(() => {
      Simulate.click(container.querySelector('[data-mask-tool="eraser"]')!);
    });
    paintStroke();

    // The eraser cuts marks away; it never draws over the picture, so the
    // source pixels cannot be damaged by it.
    expect(stub.composites).toContain('destination-out');
  });

  it('fills and outlines a dragged rectangle', async () => {
    await renderEditor();
    act(() => {
      Simulate.click(container.querySelector('[data-mask-tool="rect"]')!);
    });
    paintStroke();

    expect(stub.calls.some(call => call.name === 'fillRect')).toBe(true);
    expect(stub.calls.some(call => call.name === 'strokeRect')).toBe(true);
  });

  it('opens with the tool 【】 template and refuses to confirm until it is completed', async () => {
    await renderEditor('erase');

    const input = container.querySelector('[data-mask-control="instruction"]') as
      HTMLTextAreaElement;
    expect(input.value).toBe('infiniteCanvas.mask.prefill.erase');

    // Nothing painted yet, so confirming is impossible whatever the text says.
    expect(confirmButton().disabled).toBe(true);
    paintStroke();
    act(() => {
      Simulate.change(input, { target: { value: 'remove 【】' } } as never);
    });
    expect(confirmButton().disabled).toBe(true);

    act(() => {
      Simulate.change(input, { target: { value: 'remove the lamp post' } } as never);
    });
    expect(confirmButton().disabled).toBe(false);
  });

  it('hands back the composite as bare base64 plus the sentence', async () => {
    await renderEditor();
    paintStroke();
    act(() => {
      Simulate.change(
        container.querySelector('[data-mask-control="instruction"]')!,
        { target: { value: 'put a hat here' } } as never,
      );
    });
    act(() => {
      Simulate.click(confirmButton());
    });

    expect(onConfirm).toHaveBeenCalledWith({
      base64Png: 'Q09NUE9TSVRF',
      instruction: 'put a hat here',
    });
    // Original first, marks second — the composite is the picture WITH the
    // marks burnt in, at natural size.
    const draws = stub.calls.filter(call => call.name === 'drawImage');
    expect(draws).toHaveLength(2);
  });

  it('keeps its undo stack to itself and away from the board history', async () => {
    await renderEditor();
    paintStroke();

    const undo = container.querySelector('[data-mask-action="undo"]') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    const boardListener = vi.fn();
    dom.window.addEventListener('keydown', boardListener);
    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    // The stroke is undone here and the event never reaches a board-level
    // listener: Ctrl+Z inside the editor can never remove a card.
    expect(undo.disabled).toBe(true);
    expect(boardListener).not.toHaveBeenCalled();
    expect(confirmButton().disabled).toBe(true);
  });

  it('caps the undo stack instead of growing without bound', async () => {
    await renderEditor();
    for (let index = 0; index < CANVAS_MARK_UNDO_LIMIT + 6; index += 1) {
      paintStroke({ clientX: index, clientY: index }, { clientX: index + 5, clientY: index + 5 });
    }

    const undo = container.querySelector('[data-mask-action="undo"]') as HTMLButtonElement;
    for (let index = 0; index < CANVAS_MARK_UNDO_LIMIT; index += 1) {
      act(() => Simulate.click(undo));
    }
    expect(undo.disabled).toBe(true);
  });

  it('clears every mark in one undoable step', async () => {
    await renderEditor();
    paintStroke();
    paintStroke({ clientX: 80, clientY: 80 }, { clientX: 120, clientY: 120 });

    act(() => {
      Simulate.click(container.querySelector('[data-mask-action="clear"]')!);
    });

    expect(confirmButton().disabled).toBe(true);
    expect((container.querySelector('[data-mask-action="clear"]') as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('closes straight away on Escape when nothing was painted', async () => {
    await renderEditor();

    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm="mask-discard"]')).toBeNull();
  });

  it('asks before throwing painted marks away', async () => {
    await renderEditor();
    paintStroke();

    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onClose).not.toHaveBeenCalled();
    const confirmDialog = container.querySelector('[data-canvas-confirm="mask-discard"]');
    expect(confirmDialog).not.toBeNull();

    act(() => {
      Simulate.click(confirmDialog!.querySelector('[data-canvas-confirm-action="confirm"]')!);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers an adjustable brush that starts at the reference default', async () => {
    await renderEditor();

    const slider = container.querySelector('[data-mask-control="brush-size"]') as
      HTMLInputElement;
    expect(slider.value).toBe(String(CANVAS_BRUSH_DEFAULT));
    expect(slider.min).toBe('8');
    expect(slider.max).toBe('120');

    act(() => {
      Simulate.change(slider, { target: { value: '96' } } as never);
    });
    expect((container.querySelector('[data-mask-control="brush-size"]') as HTMLInputElement).value)
      .toBe('96');
  });
});
