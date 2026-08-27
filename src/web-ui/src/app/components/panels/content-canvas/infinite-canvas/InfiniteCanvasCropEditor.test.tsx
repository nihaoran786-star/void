/**
 * P5 W2: the crop editor as a surface.
 *
 * The frame is kept in natural pixels and rendered in percentages, so what is
 * asserted here is the geometry the confirm hands over — never a style.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { CANVAS_CROP_MIN_SIZE } from './infiniteCanvasImageRaster';
import { InfiniteCanvasCropEditor } from './InfiniteCanvasCropEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MEDIA_REF = {
  workspacePath: 'C:/ws',
  relativePath: 'media/generated/b1/image-001.png',
};

const PNG_DATA_URL = 'data:image/png;base64,QUJD';

function installCanvasStub(dom: JSDOM): { draws: unknown[][] } {
  const draws: unknown[][] = [];
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
    drawImage: (...args: unknown[]) => draws.push(args),
    clearRect: () => undefined,
  })) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = (() => (
    'data:image/png;base64,Q1JPUA=='
  )) as never;
  return { draws };
}

describe('InfiniteCanvasCropEditor', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let draws: unknown[][];
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
      { width: 1000, height: 500, close: () => undefined } as unknown as ImageBitmap
    )));
    ({ draws } = installCanvasStub(dom));
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
        <InfiniteCanvasCropEditor
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={resolve}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  const surface = () => container.querySelector('[data-canvas-editor="crop"]')!;
  const frame = () => container.querySelector('[data-crop-rect="true"]') as HTMLElement;
  const confirmButton = () => (
    container.querySelector('[data-crop-action="confirm"]') as HTMLButtonElement
  );

  function rectOf() {
    const element = frame();
    return {
      x: Number(element.getAttribute('data-crop-x')),
      y: Number(element.getAttribute('data-crop-y')),
      width: Number(element.getAttribute('data-crop-width')),
      height: Number(element.getAttribute('data-crop-height')),
    };
  }

  it('stays invisible until the natural size is known, then opens centred', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasCropEditor
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={() => new Promise(() => undefined)}
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      );
    });
    // The frame's position comes from a measurement; nothing is shown before
    // that measurement exists, so it can never snap from a guess to the truth.
    expect(surface().getAttribute('data-ready')).toBe('false');
    expect(container.querySelector('[data-crop-rect="true"]')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderEditor();

    expect(surface().getAttribute('data-ready')).toBe('true');
    expect(rectOf()).toEqual({ x: 100, y: 50, width: 800, height: 400 });
  });

  it('clamps a handle dragged past the edge back into the picture', async () => {
    await renderEditor();

    const handle = container.querySelector('[data-crop-handle="nw"]')!;
    act(() => {
      Simulate.mouseDown(handle, { clientX: 100, clientY: 50 } as never);
    });
    act(() => {
      // getBoundingClientRect is all zeros under JSDOM, so client pixels map
      // 1:1 onto natural ones: this drags the north-west corner far outside.
      Simulate.mouseMove(frame().parentElement!, { clientX: -600, clientY: -600 } as never);
    });

    const rect = rectOf();
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1000);
    expect(rect.y + rect.height).toBeLessThanOrEqual(500);
  });

  it('never lets the frame shrink below the minimum size', async () => {
    await renderEditor();

    act(() => {
      Simulate.mouseDown(
        container.querySelector('[data-crop-handle="se"]')!,
        { clientX: 900, clientY: 450 } as never,
      );
    });
    act(() => {
      Simulate.mouseMove(frame().parentElement!, { clientX: 101, clientY: 51 } as never);
    });

    const rect = rectOf();
    expect(rect.width).toBeGreaterThanOrEqual(CANVAS_CROP_MIN_SIZE);
    expect(rect.height).toBeGreaterThanOrEqual(CANVAS_CROP_MIN_SIZE);
  });

  it('cuts at natural scale and hands back bare base64', async () => {
    await renderEditor();

    act(() => {
      Simulate.click(confirmButton());
    });

    expect(onConfirm).toHaveBeenCalledWith({
      base64Png: 'Q1JPUA==',
      rect: { x: 100, y: 50, width: 800, height: 400 },
    });
    expect(draws[0].slice(1)).toEqual([100, 50, 800, 400, 0, 0, 800, 400]);
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

  it('asks before dropping a frame the user adjusted', async () => {
    await renderEditor();
    act(() => {
      Simulate.mouseDown(frame(), { clientX: 400, clientY: 200 } as never);
    });
    act(() => {
      Simulate.mouseMove(frame().parentElement!, { clientX: 420, clientY: 210 } as never);
    });

    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-canvas-confirm="crop-discard"]')).not.toBeNull();
  });

  it('reports a picture it cannot open instead of showing an empty stage', async () => {
    await renderEditor(async () => undefined);

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('infiniteCanvas.crop.unavailable');
    expect(confirmButton().disabled).toBe(true);
  });

  /**
   * P5 review C6: `data-ready` never becomes true when decoding fails, and the
   * stylesheet used to hang `visibility: hidden` off that attribute for the
   * WHOLE surface — so pressing "crop" on an unreadable picture produced an
   * invisible panel with an invisible explanation, i.e. nothing at all.
   */
  it('keeps the failure message outside the measure-before-show gate', async () => {
    await renderEditor(async () => undefined);

    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(surface().getAttribute('data-state')).toBe('failed');
    // Only the frame carries the gate; the message is a sibling of it.
    expect(alert?.closest('.infinite-canvas-crop__frame')).toBeNull();
  });

  it('says the picture is opening while a slow decode is in flight', async () => {
    await renderEditor(() => new Promise(() => undefined));

    expect(surface().getAttribute('data-state')).toBe('loading');
    const loading = container.querySelector('[data-crop-state="loading"]');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.closest('.infinite-canvas-crop__frame')).toBeNull();
  });
});
