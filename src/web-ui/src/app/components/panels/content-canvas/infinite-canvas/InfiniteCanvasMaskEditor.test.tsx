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

// The prefill keys resolve to their REAL English sentences: P5 review P16
// made the placeholder check compare against the template the editor actually
// prefilled, so a stub that returned bare key names would test nothing.
vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'infiniteCanvas.mask.prefill.erase': 'Remove 【what should go】 from the marked area.',
      'infiniteCanvas.mask.prefill.inpaint':
        'Turn the marked area into 【what should be there instead】.',
    } as Record<string, string>)[key] ?? key,
  }),
}));

import {
  CANVAS_BRUSH_DEFAULT,
  CANVAS_MARK_ERASE,
  CANVAS_MARK_FILL,
  CANVAS_MARK_UNDO_BUDGET_BYTES,
  CANVAS_MARK_UNDO_LIMIT,
  canvasMarkUndoLimit,
} from './infiniteCanvasImageRaster';
import { InfiniteCanvasMaskEditor } from './InfiniteCanvasMaskEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MEDIA_REF = {
  workspacePath: 'C:/ws',
  relativePath: 'media/generated/b1/image-001.png',
};

const PNG_DATA_URL = 'data:image/png;base64,QUJD';

/**
 * The card projection the panel hands over so the editor can mount the SHARED
 * generator (owner, 2026-08-27: the editors do not get an input box of their
 * own). Nothing here is asserted — it exists so the real component renders.
 */
const GENERATOR = {
  target: {
    nodeId: 'node-1',
    mediaKind: 'image' as const,
    prompt: 'whatever the card carries',
    modelLabel: 'some-model',
    pending: false,
  },
};

interface RecordedCall {
  name: string;
  args: unknown[];
}

/** The paint state at the instant `stroke()` ran. */
interface StrokeState {
  composite: string;
  strokeStyle: string;
  globalAlpha: number;
}

interface ContextStub {
  calls: RecordedCall[];
  composites: string[];
  /** One entry per `stroke()`, in order. */
  strokes: StrokeState[];
}

function installCanvasStub(dom: JSDOM): ContextStub {
  const calls: RecordedCall[] = [];
  const composites: string[] = [];
  const strokes: StrokeState[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
  };
  let strokeStyle = '';
  let globalAlpha = 1;
  dom.window.HTMLCanvasElement.prototype.getContext = (function getContext(
    this: HTMLCanvasElement,
  ) {
    const context = {
      canvas: this,
      lineCap: 'butt',
      lineJoin: 'miter',
      lineWidth: 1,
      fillStyle: '',
      // Read back at `stroke()` time: P5 review C4 is entirely about which
      // colour and which alpha were in force at that instant.
      set strokeStyle(value: string) {
        strokeStyle = value;
      },
      get strokeStyle() {
        return strokeStyle;
      },
      set globalAlpha(value: number) {
        globalAlpha = value;
      },
      get globalAlpha() {
        return globalAlpha;
      },
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
      stroke(...args: unknown[]) {
        calls.push({ name: 'stroke', args });
        strokes.push({
          composite: composites[composites.length - 1] ?? 'source-over',
          strokeStyle,
          globalAlpha,
        });
      },
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
  return { calls, composites, strokes };
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
          generator={GENERATOR}
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
  // Owner feedback 2026-08-27 (second pass): there is no confirm button of
  // this editor's own any more. Confirming IS sending from the shared board
  // generator mounted underneath the picture.
  const confirmButton = () => (
    container.querySelector('[data-canvas-generator-action="send"]') as HTMLButtonElement
  );
  const promptField = () => (
    container.querySelector('[data-canvas-generator-field="prompt"]') as HTMLTextAreaElement
  );
  const clearButton = () => (
    container.querySelector('[data-mask-action="clear"]') as HTMLButtonElement
  );
  const undoButton = () => (
    container.querySelector('[data-mask-action="undo"]') as HTMLButtonElement
  );
  const blockedReason = () => (
    container.querySelector('[data-blocked-reason]')?.getAttribute('data-blocked-reason')
      ?? undefined
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
          generator={GENERATOR}
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

  /**
   * P5 review C4: `destination-out` removes the destination in proportion to
   * the SOURCE ALPHA. Erasing with the translucent mark colour took away 55%
   * per pass and left a pink ghost that the composite burnt into the picture,
   * contradicting the directive's "only the area covered by the red marking".
   */
  it('erases at full opacity, so one pass removes the mark completely', async () => {
    await renderEditor();
    paintStroke();
    const painted = stub.strokes[stub.strokes.length - 1];
    expect(painted.composite).toBe('source-over');
    expect(painted.strokeStyle).toBe(CANVAS_MARK_FILL);

    act(() => {
      Simulate.click(container.querySelector('[data-mask-tool="eraser"]')!);
    });
    paintStroke();

    const erased = stub.strokes[stub.strokes.length - 1];
    expect(erased.composite).toBe('destination-out');
    expect(erased.strokeStyle).toBe(CANVAS_MARK_ERASE);
    expect(erased.globalAlpha).toBe(1);
    // The whole point: nothing translucent may reach a destination-out stroke.
    expect(erased.strokeStyle).not.toBe(CANVAS_MARK_FILL);
    expect(CANVAS_MARK_ERASE.endsWith(', 1)')).toBe(true);
  });

  /**
   * P5 review C5: the stroke COUNT and the mark LAYER could disagree. "Paint →
   * clear → undo" put the marks back on screen while the counter stayed at 0,
   * which greyed out confirm, disabled clearing, and let Escape throw the
   * painting away without asking.
   */
  it('keeps confirm and clear alive after paint → clear → undo', async () => {
    await renderEditor('erase');
    paintStroke();
    act(() => {
      Simulate.change(
        promptField(),
        { target: { value: 'remove the lamp post' } } as never,
      );
    });
    expect(confirmButton().disabled).toBe(false);

    act(() => {
      Simulate.click(clearButton());
    });
    expect(confirmButton().disabled).toBe(true);
    expect(clearButton().disabled).toBe(true);

    act(() => {
      Simulate.click(undoButton());
    });
    // The marks are back on the layer, so every control that depends on them
    // is back too.
    expect(confirmButton().disabled).toBe(false);
    expect(clearButton().disabled).toBe(false);

    // …and §7.4.2: Escape still leaves at once, marks or no marks.
    act(() => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm="mask-discard"]')).toBeNull();
  });

  /**
   * P5 review C6: `data-ready` never becomes true when decoding fails, and the
   * stylesheet used to hide the WHOLE surface on that attribute — so the one
   * message with something to say was hidden exactly when it had to speak.
   */
  it('keeps the failure message outside the measure-before-show gate', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasMaskEditor
          toolId="inpaint"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={async () => undefined}
          generator={GENERATOR}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    await act(async () => { await Promise.resolve(); });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('infiniteCanvas.mask.unavailable');
    expect(surface().getAttribute('data-state')).toBe('failed');
    // The alert is a sibling of the frame, never a descendant of it: only the
    // frame carries the visibility gate.
    expect(alert?.closest('.infinite-canvas-mask__frame')).toBeNull();
  });

  it('says the picture is opening while a slow decode is in flight', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasMaskEditor
          toolId="inpaint"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={() => new Promise(() => undefined)}
          generator={GENERATOR}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });

    expect(surface().getAttribute('data-state')).toBe('loading');
    const loading = container.querySelector('[data-mask-state="loading"]');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.closest('.infinite-canvas-mask__frame')).toBeNull();
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

    const input = promptField() as unknown as
      HTMLTextAreaElement;
    expect(input.value).toBe('Remove 【what should go】 from the marked area.');

    // Nothing painted yet, so confirming is impossible whatever the text says.
    expect(confirmButton().disabled).toBe(true);
    expect(blockedReason()).toBe('marks');
    paintStroke();
    // The template's own token is still there: still blocked, and it says so.
    expect(confirmButton().disabled).toBe(true);
    expect(blockedReason()).toBe('placeholder');

    act(() => {
      Simulate.change(input, { target: { value: '   ' } } as never);
    });
    expect(confirmButton().disabled).toBe(true);
    expect(blockedReason()).toBe('empty');

    act(() => {
      Simulate.change(input, { target: { value: 'remove the lamp post' } } as never);
    });
    expect(confirmButton().disabled).toBe(false);
    expect(blockedReason()).toBeUndefined();
  });

  /**
   * P5 review P16: `/[【】]/` fired on a SINGLE lenticular bracket, so a
   * Chinese-writing owner using 【】 as ordinary emphasis had the confirm
   * button greyed out with nothing on screen explaining it. Only the tokens
   * the prefilled template shipped may block.
   */
  it('accepts 【】 the user typed themselves, and names the reason when it blocks', async () => {
    await renderEditor('erase');
    paintStroke();
    const input = promptField() as unknown as
      HTMLTextAreaElement;

    act(() => {
      Simulate.change(input, { target: { value: 'replace the sign reading 【OPEN】' } } as never);
    });
    expect(confirmButton().disabled).toBe(false);
    expect(blockedReason()).toBeUndefined();

    // The template's exact token, however, is still an unfilled placeholder.
    act(() => {
      Simulate.change(
        input,
        { target: { value: 'Remove 【what should go】 from the marked area.' } } as never,
      );
    });
    expect(confirmButton().disabled).toBe(true);
    expect(blockedReason()).toBe('placeholder');
  });

  it('hands back the composite as bare base64 plus the sentence', async () => {
    await renderEditor();
    paintStroke();
    act(() => {
      Simulate.change(
        promptField(),
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

  /**
   * P5 review P10: the depth is a MEMORY budget, so it is the budget — not the
   * ceiling constant — that the stack must honour. At 1600×1200 one snapshot
   * is ~7.7 MB, which buys fewer than the thirty the constant allows.
   */
  it('caps the undo stack at the memory budget for THIS picture size', async () => {
    await renderEditor();
    const limit = canvasMarkUndoLimit({ width: 1600, height: 1200 });
    expect(limit).toBeLessThan(CANVAS_MARK_UNDO_LIMIT);
    expect(limit * 1600 * 1200 * 4).toBeLessThanOrEqual(CANVAS_MARK_UNDO_BUDGET_BYTES);

    for (let index = 0; index < limit + 6; index += 1) {
      paintStroke({ clientX: index, clientY: index }, { clientX: index + 5, clientY: index + 5 });
    }

    const undo = undoButton();
    for (let index = 0; index < limit - 1; index += 1) {
      act(() => Simulate.click(undo));
    }
    // Exactly `limit` steps were kept: one left here, none after it.
    expect(undo.disabled).toBe(false);
    act(() => Simulate.click(undo));
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

  it('closes straight away on Escape', async () => {
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

  /**
   * §7.4.2 (owner 2026-08-28): "closing must not ask". This REPLACES the
   * previous round's discard confirmation. The marks are a draft — the
   * original picture and the document were never touched — so Escape leaves
   * immediately even with a painted layer, and no confirmation is mounted.
   */
  it('leaves painted marks without asking on Escape', async () => {
    await renderEditor();
    paintStroke();

    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
  });

  /**
   * §7.4: the exit is the `×` at the left end of the shared pill, and it is
   * the same one every other assembly of the shell carries.
   */
  it('leaves through the shared pill × when nothing was painted', async () => {
    await renderEditor();

    act(() => {
      Simulate.click(container.querySelector('[data-canvas-stage-action="close"]')!);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
  });

  it('leaves painted marks without asking through the pill ×', async () => {
    await renderEditor();
    paintStroke();

    act(() => {
      Simulate.click(container.querySelector('[data-canvas-stage-action="close"]')!);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
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

  /**
   * The picture FLOATS over the shared blurred plate, so pressing the plate
   * leaves — immediately, marks or no marks (§7.4.2).
   */
  it('leaves on a press on the blurred board without asking', async () => {
    await renderEditor();
    paintStroke();

    act(() => {
      dom.window.document.body.dispatchEvent(
        new dom.window.MouseEvent('mousedown', { bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
  });

  it('does not leave when the press lands on the picture itself', async () => {
    await renderEditor();

    act(() => {
      layer().dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
  });

  /**
   * Owner feedback 2026-08-27: "所有的都是共用输入框的" — the sentence is written
   * in the BOARD's generator, mounted here in its editor surface. There is
   * exactly one field on this screen, and it is that one.
   */
  it('writes its sentence in the board generator, not a field of its own', async () => {
    await renderEditor();

    expect(container.querySelector('[data-canvas-generator-surface="editor"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-canvas-generator-field="prompt"]'))
      .toHaveLength(1);
    expect(container.querySelector('textarea:not([data-canvas-generator-field])')).toBeNull();
    // The editor carries no confirm of its own; sending is confirming.
    expect(container.querySelector('[data-mask-action="confirm"]')).toBeNull();
  });
});
