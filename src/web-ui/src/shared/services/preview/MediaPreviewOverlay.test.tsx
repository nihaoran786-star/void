import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { MediaPreviewOverlay } from './MediaPreviewOverlay';
import { openMediaPreviewPanel } from './MediaPreviewService';
import { resolveWorkspaceMediaPreviewUrl } from '@/shared/services/workspace-media';

vi.mock('@/shared/services/workspace-media', () => ({
  resolveWorkspaceMediaPreviewUrl: vi.fn(),
}));

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
      root.render(<MediaPreviewOverlay className="void-ui--minimal" />);
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
    expect(dialog?.classList.contains('void-ui--minimal')).toBe(true);
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

  it('traps keyboard focus while open and restores the trigger after closing', async () => {
    const trigger = dom.window.document.createElement('button');
    trigger.textContent = 'Open preview';
    dom.window.document.body.appendChild(trigger);
    trigger.focus();

    act(() => {
      root.render(<MediaPreviewOverlay className="void-ui--minimal" />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'image',
        url: 'https://cdn.example.com/focus-preview.png',
        title: 'Focus Preview',
      });
    });

    await act(async () => {
      await new Promise(resolve => dom.window.setTimeout(resolve, 24));
    });

    const dialog = container.querySelector('[role="dialog"]') as HTMLDivElement;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const copyButton = buttons.find(button => button.getAttribute('aria-label')?.includes('复制'))!;
    const closeButton = buttons.find(button => button.getAttribute('aria-label')?.includes('关闭'))!;
    expect(dom.window.document.activeElement).toBe(closeButton);

    act(() => {
      closeButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
      }));
    });
    expect(dom.window.document.activeElement).toBe(copyButton);

    act(() => {
      copyButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
      }));
    });
    expect(dom.window.document.activeElement).toBe(closeButton);

    act(() => {
      closeButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
      }));
    });
    expect(dom.window.document.activeElement).toBe(copyButton);

    act(() => {
      closeButton.click();
    });
    expect(dom.window.document.activeElement).toBe(trigger);
    trigger.remove();
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

  it('falls back to a local file data URL when a video preview URL cannot load', async () => {
    vi.mocked(resolveWorkspaceMediaPreviewUrl).mockResolvedValue('data:video/mp4;base64,local-video');

    act(() => {
      root.render(<MediaPreviewOverlay />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'video',
        url: 'asset://local/clip.mp4',
        localPath: 'C:/work/media/generated/clip.mp4',
        title: 'Video #1',
      });
    });

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.src).toBe('asset://local/clip.mp4');

    await act(async () => {
      video.dispatchEvent(new dom.window.Event('error', { bubbles: false }));
    });

    expect(resolveWorkspaceMediaPreviewUrl).toHaveBeenCalledWith({
      filePath: 'C:/work/media/generated/clip.mp4',
      extension: 'mp4',
      kind: 'video',
    });
    expect((container.querySelector('video') as HTMLVideoElement).src).toBe('data:video/mp4;base64,local-video');
  });

  it('does not let stale local fallback reads overwrite a newer preview', async () => {
    let resolveFallback: (value: string) => void = () => {};
    vi.mocked(resolveWorkspaceMediaPreviewUrl).mockReturnValue(new Promise<string>((resolve) => {
      resolveFallback = resolve;
    }));

    act(() => {
      root.render(<MediaPreviewOverlay />);
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'video',
        url: 'asset://local/old.mp4',
        localPath: 'C:/work/media/generated/old.mp4',
        title: 'Old Video',
      });
    });

    const oldVideo = container.querySelector('video') as HTMLVideoElement;
    await act(async () => {
      oldVideo.dispatchEvent(new dom.window.Event('error', { bubbles: false }));
    });

    act(() => {
      openMediaPreviewPanel({
        kind: 'video',
        url: 'asset://local/new.mp4',
        localPath: 'C:/work/media/generated/new.mp4',
        title: 'New Video',
      });
    });

    await act(async () => {
      resolveFallback('data:video/mp4;base64,old-video');
    });

    expect((container.querySelector('video') as HTMLVideoElement).src).toBe('asset://local/new.mp4');
  });
});
