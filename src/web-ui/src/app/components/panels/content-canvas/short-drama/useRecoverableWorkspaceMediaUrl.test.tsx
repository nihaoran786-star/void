// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRecoverableWorkspaceMediaUrl } from './useRecoverableWorkspaceMediaUrl';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useRecoverableWorkspaceMediaUrl', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps remote media lazy and resolves the local file only after a load failure', async () => {
    const resolver = vi.fn().mockResolvedValue('data:image/png;base64,local');

    function Harness() {
      const media = useRecoverableWorkspaceMediaUrl({
        directUrl: 'https://example.invalid/expired.png',
        localPath: 'D:/workspace/media/image.png',
        kind: 'image',
        modifiedAt: 42,
        resolver,
      });
      return <img src={media.url} alt="asset" onError={media.onError} />;
    }

    await act(async () => root.render(<Harness />));
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('https://example.invalid/expired.png');
    expect(resolver).not.toHaveBeenCalled();

    await act(async () => {
      image?.dispatchEvent(new Event('error'));
      await Promise.resolve();
    });

    expect(resolver).toHaveBeenCalledWith({
      filePath: 'D:/workspace/media/image.png',
      extension: 'png',
      kind: 'image',
      modifiedAt: 42,
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,local');
  });

  it('forces a data URL only after the local streaming URL also fails', async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce('asset://localhost/image.png')
      .mockResolvedValueOnce('data:image/png;base64,local');

    function Harness() {
      const media = useRecoverableWorkspaceMediaUrl({
        directUrl: 'https://example.invalid/expired.png',
        localPath: 'D:/workspace/media/image.png',
        kind: 'image',
        resolver,
      });
      return <img src={media.url} alt="asset" onError={media.onError} />;
    }

    await act(async () => root.render(<Harness />));
    await act(async () => {
      container.querySelector('img')?.dispatchEvent(new Event('error'));
      await Promise.resolve();
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('asset://localhost/image.png');

    await act(async () => {
      container.querySelector('img')?.dispatchEvent(new Event('error'));
      await Promise.resolve();
    });
    expect(resolver).toHaveBeenLastCalledWith(expect.objectContaining({
      filePath: 'D:/workspace/media/image.png',
      forceDataUrl: true,
    }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,local');
  });
});
