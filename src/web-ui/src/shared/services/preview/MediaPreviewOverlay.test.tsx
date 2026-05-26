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

    const closeButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.getAttribute('aria-label') === '关闭') as HTMLButtonElement | undefined;
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
