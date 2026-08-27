/**
 * §7.4: there is ONE floating media stage, and all four scenes are assemblies
 * of it.
 *
 * This file exists to stop them drifting apart again. It renders the viewer,
 * the mask editor and the frame editor in both directions through their real
 * components and asserts that each one is the same shell: same root, same
 * blurred plate, same pill with the `×` first, same shrink-wrapped media
 * region, and the same three ways out — none of which asks a question
 * (§7.4.2).
 *
 * It deliberately asserts structure and behaviour, never a style.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { InfiniteCanvasFrameEditor } from './InfiniteCanvasFrameEditor';
import { InfiniteCanvasMaskEditor } from './InfiniteCanvasMaskEditor';
import { InfiniteCanvasMediaViewer } from './InfiniteCanvasMediaViewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MEDIA_REF = {
  workspacePath: 'C:/ws',
  relativePath: 'media/generated/b1/image-001.png',
};

const PNG_DATA_URL = 'data:image/png;base64,QUJD';
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

describe('the one floating media stage (§7.4)', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
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
    dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage: () => undefined,
      clearRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      fill: () => undefined,
      fillRect: () => undefined,
      strokeRect: () => undefined,
      getImageData: () => undefined,
      putImageData: () => undefined,
    })) as never;
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    onClose = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const resolvePreviewUrl = async () => PNG_DATA_URL;

  /** Every scene, built the way the panel builds it. */
  const SCENES: readonly {
    name: string;
    scene: string;
    render: () => React.ReactElement;
  }[] = [
    {
      name: 'the full-screen viewer',
      scene: 'viewer',
      render: () => (
        <InfiniteCanvasMediaViewer
          items={[{ nodeId: 'n-image', mediaRef: MEDIA_REF, mediaKind: 'image' }]}
          activeNodeId="n-image"
          resolvePreviewUrl={resolvePreviewUrl}
          onNavigate={() => undefined}
          onClose={onClose}
          onSaveAs={() => undefined}
        />
      ),
    },
    {
      name: 'the mask editor',
      scene: 'mask',
      render: () => (
        <InfiniteCanvasMaskEditor
          toolId="inpaint"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={resolvePreviewUrl}
          generator={GENERATOR}
          onConfirm={() => undefined}
          onClose={onClose}
        />
      ),
    },
    {
      name: 'the frame editor, cropping',
      scene: 'crop',
      render: () => (
        <InfiniteCanvasFrameEditor
          direction="inward"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={resolvePreviewUrl}
          onConfirm={() => undefined}
          onClose={onClose}
        />
      ),
    },
    {
      name: 'the frame editor, expanding',
      scene: 'expand',
      render: () => (
        <InfiniteCanvasFrameEditor
          direction="outward"
          mediaRef={MEDIA_REF}
          resolvePreviewUrl={resolvePreviewUrl}
          generator={GENERATOR}
          onConfirm={() => undefined}
          onClose={onClose}
        />
      ),
    },
  ];

  async function mount(scene: (typeof SCENES)[number]) {
    await act(async () => {
      root.render(scene.render());
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  it.each(SCENES)('$name is the one shared shell', async scene => {
    await mount(scene);

    const stage = container.querySelector('.infinite-canvas-stage')!;
    expect(stage).not.toBeNull();
    expect(stage.getAttribute('data-canvas-stage')).toBe(scene.scene);
    expect(stage.getAttribute('role')).toBe('dialog');
    // One blurred plate, one pill, one shrink-wrapped media region.
    expect(stage.querySelectorAll('[data-canvas-stage-action="backdrop"]')).toHaveLength(1);
    expect(stage.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    expect(stage.querySelectorAll('[data-canvas-stage-media]')).toHaveLength(1);
    // Nobody kept a plate or a pill of their own.
    expect(container.querySelectorAll('.infinite-canvas-editor__backdrop')).toHaveLength(1);
    expect(container.querySelectorAll('.infinite-canvas-editor__pill')).toHaveLength(1);
  });

  it.each(SCENES)('$name puts the × first in the pill', async scene => {
    await mount(scene);

    const pill = container.querySelector('[role="toolbar"]')!;
    expect(pill.firstElementChild?.getAttribute('data-canvas-stage-action')).toBe('close');
  });

  it.each(SCENES)('$name closes from the × without asking', async scene => {
    await mount(scene);

    act(() => {
      Simulate.click(container.querySelector('[data-canvas-stage-action="close"]')!);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-canvas-confirm]')).toBeNull();
  });

  it.each(SCENES)('$name closes on Escape without asking', async scene => {
    await mount(scene);

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

  it.each(SCENES)('$name closes on a press on the blurred plate', async scene => {
    await mount(scene);

    act(() => {
      container.querySelector('[data-canvas-stage-action="backdrop"]')!
        .dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(SCENES)('$name keeps the media itself out of the way out', async scene => {
    await mount(scene);

    act(() => {
      container.querySelector('[data-canvas-stage-media]')!
        .dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
