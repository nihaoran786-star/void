/**
 * Defect-A closure: mediaRef cards must display through the same proven lane
 * the Workspace Media gallery uses — `resolveWorkspaceMediaPreviewUrl` with a
 * forced data URL (this app does not enable Tauri's asset protocol, so
 * convertFileSrc URLs are refused by the webview). The absolute path is
 * joined from workspacePath + relativePath — Windows separators included —
 * and the card falls back to the previewUnavailable state when no loadable
 * URL exists.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const previewResolverMock = vi.hoisted(() => ({
  resolveWorkspaceMediaPreviewUrl: vi.fn(
    async (request: { filePath: string }) =>
      `data:mock;base64,${encodeURIComponent(request.filePath)}`,
  ),
}));

vi.mock('@/shared/services/workspace-media/WorkspaceMediaPreviewResolver', () => previewResolverMock);

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

const resolveMock = previewResolverMock.resolveWorkspaceMediaPreviewUrl;

function mockDataUrl(filePath: string): string {
  return `data:mock;base64,${encodeURIComponent(filePath)}`;
}

describe('resolveInfiniteCanvasMediaPreviewUrl', () => {
  beforeEach(() => {
    resolveMock.mockClear();
    resolveMock.mockImplementation(
      async (request: { filePath: string }) => mockDataUrl(request.filePath),
    );
  });

  it('requests a forced data URL for the joined absolute Windows path', async () => {
    const url = await resolveInfiniteCanvasMediaPreviewUrl({
      workspacePath: 'D:\\projects\\ws',
      relativePath: 'media/generated/batch-1/image-001.png',
    });

    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolveMock).toHaveBeenCalledWith({
      filePath: 'D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png',
      kind: 'image',
      forceDataUrl: true,
    });
    expect(url).toBe(
      mockDataUrl('D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png'),
    );
  });

  it('classifies video extensions as video requests', async () => {
    await resolveInfiniteCanvasMediaPreviewUrl({
      workspacePath: 'D:\\projects\\ws',
      relativePath: 'media/generated/batch-2/video-001.mp4',
    });

    expect(resolveMock).toHaveBeenCalledWith({
      filePath: 'D:\\projects\\ws\\media\\generated\\batch-2\\video-001.mp4',
      kind: 'video',
      forceDataUrl: true,
    });
  });

  it('never mixes separators when the relativePath arrives with backslashes', () => {
    expect(infiniteCanvasMediaFilePath({
      workspacePath: 'C:/projects/ws',
      relativePath: 'media\\generated\\batch-2\\image-001.png',
    })).toBe('C:/projects/ws/media/generated/batch-2/image-001.png');
  });

  it('returns undefined when resolution fails (previewUnavailable path)', async () => {
    resolveMock.mockResolvedValue(undefined);

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
    resolveMock.mockClear();
    resolveMock.mockImplementation(
      async (request: { filePath: string }) => mockDataUrl(request.filePath),
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

  it('image card shows the resolved data URL for its mediaRef', async () => {
    await act(async () => {
      root.render(
        <InfiniteCanvasImageNode
          id="card-1"
          data={{ mediaRef, resolvePreviewUrl: resolveInfiniteCanvasMediaPreviewUrl, ...noopHandlers }}
        />,
      );
    });

    expect(resolveMock).toHaveBeenCalledWith({
      filePath: 'D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png',
      kind: 'image',
      forceDataUrl: true,
    });
    const image = container.querySelector('.infinite-canvas-node__image');
    expect(image).not.toBeNull();
    expect(image!.getAttribute('src')).toBe(
      mockDataUrl('D:\\projects\\ws\\media\\generated\\batch-1\\image-001.png'),
    );
  });

  it('video card shows the resolved data URL for its mediaRef', async () => {
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

    expect(resolveMock).toHaveBeenCalledWith({
      filePath: 'D:\\projects\\ws\\media\\generated\\batch-2\\video-001.mp4',
      kind: 'video',
      forceDataUrl: true,
    });
    const video = container.querySelector('.infinite-canvas-node__video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe(
      mockDataUrl('D:\\projects\\ws\\media\\generated\\batch-2\\video-001.mp4'),
    );
  });

  it('falls back to previewUnavailable when the resolver yields no URL', async () => {
    resolveMock.mockResolvedValue(undefined);
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
    // The card face carries no words now (visual language §2); the state is
    // still named for assistive tech on the placeholder itself.
    expect(placeholder!.getAttribute('aria-label'))
      .toBe('infiniteCanvas.imageNode.previewUnavailable');
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
