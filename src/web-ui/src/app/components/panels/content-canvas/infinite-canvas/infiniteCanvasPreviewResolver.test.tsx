/**
 * Defect-A closure: mediaRef cards must display through the proven
 * convertFileSrc lane (the same one the Workspace Media thumbnails and the
 * canvas image picker use), with the absolute path joined from
 * workspacePath + relativePath — Windows separators included — and fall back
 * to the previewUnavailable state when no loadable URL exists.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const tauriCore = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}));

vi.mock('@tauri-apps/api/core', () => tauriCore);

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import {
  infiniteCanvasMediaFilePath,
  resolveInfiniteCanvasMediaPreviewUrl,
} from './infiniteCanvasPreviewResolver';
import { InfiniteCanvasImageNode, InfiniteCanvasVideoNode } from './InfiniteCanvasNodes';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('resolveInfiniteCanvasMediaPreviewUrl', () => {
  beforeEach(() => {
    tauriCore.convertFileSrc.mockClear();
    tauriCore.convertFileSrc.mockImplementation(
      (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
    );
  });

  it('converts the joined absolute Windows path (backslash workspace)', async () => {
    const url = await resolveInfiniteCanvasMediaPreviewUrl({
      workspacePath: 'D:\\projects\\ws',
      relativePath: 'media/generated/batch-1/image-001.png',
    });

    expect(tauriCore.convertFileSrc).toHaveBeenCalledTimes(1);
    expect(tauriCore.convertFileSrc).toHaveBeenCalledWith(
      'D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png',
    );
    expect(url).toBe(
      `asset://localhost/${encodeURIComponent('D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png')}`,
    );
  });

  it('never mixes separators when the relativePath arrives with backslashes', () => {
    expect(infiniteCanvasMediaFilePath({
      workspacePath: 'C:/projects/ws',
      relativePath: 'media\\generated\\batch-2\\image-001.png',
    })).toBe('C:/projects/ws/media/generated/batch-2/image-001.png');
  });

  it('returns undefined when conversion is unavailable (previewUnavailable path)', async () => {
    tauriCore.convertFileSrc.mockImplementation(() => {
      throw new Error('not in a Tauri webview');
    });

    const url = await resolveInfiniteCanvasMediaPreviewUrl({
      workspacePath: 'D:\\projects\\ws',
      relativePath: 'media/generated/batch-1/image-001.png',
    });

    expect(url).toBeUndefined();
  });
});

describe('media cards render through the resolver', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  const mediaRef = {
    workspacePath: 'D:\\projects\\ws',
    relativePath: 'media/generated/batch-1/image-001.png',
  };

  const noopHandlers = {
    onCommitPrompt: () => undefined,
    onGenerate: () => undefined,
    onRetryGeneration: () => undefined,
    onRemoveFailedGeneration: () => undefined,
    onOpenStylePicker: () => undefined,
    onRunImageTool: () => undefined,
  };

  beforeEach(() => {
    tauriCore.convertFileSrc.mockClear();
    tauriCore.convertFileSrc.mockImplementation(
      (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
    );
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('image card shows the converted URL for its mediaRef', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasImageNode
          id="card-1"
          data={{ mediaRef, resolvePreviewUrl: resolveInfiniteCanvasMediaPreviewUrl, ...noopHandlers }}
        />,
      );
    });

    expect(tauriCore.convertFileSrc).toHaveBeenCalledWith(
      'D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png',
    );
    const image = container.querySelector('.infinite-canvas-node__image');
    expect(image).not.toBeNull();
    expect(image!.getAttribute('src')).toBe(
      `asset://localhost/${encodeURIComponent('D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png')}`,
    );
  });

  it('video card shows the converted URL for its mediaRef', async () => {
    const videoRef = {
      workspacePath: 'D:\\projects\\ws',
      relativePath: 'media/generated/batch-2/video-001.mp4',
    };
    await act(async () => {
      root.render(
        <InfiniteCanvasVideoNode
          id="card-2"
          data={{
            mediaRef: videoRef,
            resolvePreviewUrl: resolveInfiniteCanvasMediaPreviewUrl,
            ...noopHandlers,
          }}
        />,
      );
    });

    expect(tauriCore.convertFileSrc).toHaveBeenCalledWith(
      'D:\\projects\\ws\\media\\generated\\batch-2\\video-001.mp4',
    );
    const video = container.querySelector('.infinite-canvas-node__video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe(
      `asset://localhost/${encodeURIComponent('D:\\projects\\ws\\media\\generated\\batch-2\\video-001.mp4')}`,
    );
  });

  it('falls back to previewUnavailable when the resolver yields no URL', async () => {
    tauriCore.convertFileSrc.mockImplementation(() => {
      throw new Error('unavailable');
    });
    await act(async () => {
      root.render(
        <InfiniteCanvasImageNode
          id="card-3"
          data={{ mediaRef, resolvePreviewUrl: resolveInfiniteCanvasMediaPreviewUrl, ...noopHandlers }}
        />,
      );
    });

    const placeholder = container.querySelector('.infinite-canvas-node__image-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.getAttribute('data-state')).toBe('unavailable');
    expect(placeholder!.textContent).toBe('infiniteCanvas.imageNode.previewUnavailable');
  });

  it('falls back to previewUnavailable when the resolved URL fails to load', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasImageNode
          id="card-4"
          data={{ mediaRef, resolvePreviewUrl: resolveInfiniteCanvasMediaPreviewUrl, ...noopHandlers }}
        />,
      );
    });
    const image = container.querySelector('.infinite-canvas-node__image');
    expect(image).not.toBeNull();

    await act(async () => {
      image!.dispatchEvent(new dom.window.Event('error'));
    });

    const placeholder = container.querySelector('.infinite-canvas-node__image-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.getAttribute('data-state')).toBe('unavailable');
  });
});
