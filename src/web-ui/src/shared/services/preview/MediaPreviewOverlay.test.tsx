import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { MediaPreviewOverlay } from './MediaPreviewOverlay';
import { openMediaPreviewPanel } from './MediaPreviewService';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MediaPreviewOverlay', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('renders image previews from media preview events and closes on click', () => {
    act(() => {
      root.render(<MediaPreviewOverlay />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'image',
        url: 'https://cdn.example.com/generated-1.png',
        title: 'Image #1',
      });
    });

    const dialog = container.querySelector('[role="dialog"]');
    const image = container.querySelector('img') as HTMLImageElement | null;
    expect(dialog).toBeTruthy();
    expect(image?.src).toBe('https://cdn.example.com/generated-1.png');
    expect(image?.className).toBe('media-preview-overlay__media');

    const closeButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.getAttribute('aria-label') === '关闭') as HTMLButtonElement | undefined;
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders video previews with the contain media class', () => {
    act(() => {
      root.render(<MediaPreviewOverlay />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'video',
        url: 'https://cdn.example.com/generated-1.mp4',
        title: 'Video #1',
      });
    });

    const video = container.querySelector('video') as HTMLVideoElement | null;
    expect(video?.src).toBe('https://cdn.example.com/generated-1.mp4');
    expect(video?.className).toBe('media-preview-overlay__media');
    expect(video?.hasAttribute('controls')).toBe(true);
  });

  it('does not apply the contain media class to audio previews', () => {
    act(() => {
      root.render(<MediaPreviewOverlay />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'audio',
        url: 'https://cdn.example.com/generated-1.mp3',
        title: 'Audio #1',
      });
    });

    const audio = container.querySelector('audio') as HTMLAudioElement | null;
    expect(audio?.src).toBe('https://cdn.example.com/generated-1.mp3');
    expect(audio?.className).toBe('');
    expect(audio?.hasAttribute('controls')).toBe(true);
  });

  it('falls back to the remote URL when the local preview URL cannot load', () => {
    act(() => {
      root.render(<MediaPreviewOverlay />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'image',
        url: 'asset://local/generated.png',
        remoteUrl: 'https://cdn.example.com/generated-1.png',
        title: 'Image #1',
      });
    });

    const image = container.querySelector('img') as HTMLImageElement;
    expect(image.src).toBe('asset://local/generated.png');

    act(() => {
      image.dispatchEvent(new dom.window.Event('error', { bubbles: false }));
    });

    expect((container.querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example.com/generated-1.png');
  });
});
