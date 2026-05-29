import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'workspaceMedia.title': 'Media',
      'workspaceMedia.description': 'Workspace images, videos, and audio files.',
      'workspaceMedia.refresh': 'Refresh',
      'workspaceMedia.filters.ariaLabel': 'Media filters',
      'workspaceMedia.filters.all': 'All',
      'workspaceMedia.filters.images': 'Images',
      'workspaceMedia.filters.videos': 'Videos',
      'workspaceMedia.filters.audio': 'Audio',
      'workspaceMedia.sort.label': 'Sort',
      'workspaceMedia.sort.recent': 'Recent',
      'workspaceMedia.sort.name': 'Name',
      'workspaceMedia.sort.size': 'Size',
      'workspaceMedia.searchPlaceholder': 'Search',
      'workspaceMedia.states.scanning': 'Scanning media files...',
      'workspaceMedia.states.empty': 'No media files found.',
      'workspaceMedia.states.truncated': 'Showing the first limited set of media files.',
      'workspaceMedia.states.noFilterMatches': 'No media files match this filter.',
      'workspaceMedia.states.unpreviewable': 'Unavailable previews',
      'workspaceMedia.ariaLabel': 'Workspace media',
    })[key] || key,
  }),
}));

import { WorkspaceMediaGallery } from './WorkspaceMediaGallery';
import { MEDIA_PREVIEW_EVENT } from '@/shared/services/preview/MediaPreviewService';
import type { WorkspaceMediaLibraryService } from '@/shared/services/workspace-media/WorkspaceMediaTypes';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const readyService = (): WorkspaceMediaLibraryService => ({
  checkAvailability: vi.fn(),
  scanLibrary: vi.fn(async () => ({
    status: 'ready',
    scannedAt: 100,
    items: [
      {
        id: 'image',
        kind: 'image',
        source: 'generated',
        filePath: 'C:/work/assets/poster.png',
        relativePath: 'assets/poster.png',
        fileName: 'poster.png',
        extension: 'png',
        sizeBytes: 1200,
        modifiedAt: 3000,
        width: 900,
        height: 1600,
        previewUrl: 'asset://local/poster.png',
        thumbnailUrl: 'asset://local/poster.png',
      },
      {
        id: 'video',
        kind: 'video',
        source: 'generated',
        filePath: 'C:/work/assets/clip.mp4',
        relativePath: 'assets/clip.mp4',
        fileName: 'clip.mp4',
        extension: 'mp4',
        sizeBytes: 3400,
        modifiedAt: 2000,
        previewUrl: 'asset://local/clip.mp4',
      },
      {
        id: 'audio',
        kind: 'audio',
        source: 'input',
        filePath: 'C:/work/assets/voice.mp3',
        relativePath: 'assets/voice.mp3',
        fileName: 'voice.mp3',
        extension: 'mp3',
        sizeBytes: 5600,
        modifiedAt: 1000,
        previewUrl: 'asset://local/voice.mp3',
      },
      {
        id: 'unpreviewable',
        kind: 'image',
        source: 'input',
        filePath: 'C:/work/assets/broken.png',
        relativePath: 'assets/broken.png',
        fileName: 'broken.png',
        extension: 'png',
        sizeBytes: 780,
        modifiedAt: 4000,
      },
    ],
  })),
});

const noDimensionsService = (): WorkspaceMediaLibraryService => ({
  checkAvailability: vi.fn(),
  scanLibrary: vi.fn(async () => ({
    status: 'ready',
    scannedAt: 100,
    items: [
      {
        id: 'landscape-without-dimensions',
        kind: 'image',
        source: 'generated',
        filePath: 'C:/work/media/generated/landscape.png',
        relativePath: 'media/generated/landscape.png',
        fileName: 'landscape.png',
        extension: 'png',
        sizeBytes: 1200,
        modifiedAt: 3000,
        previewUrl: 'asset://local/landscape.png',
        thumbnailUrl: 'asset://local/landscape.png',
      },
    ],
  })),
});

const threeImagesService = (): WorkspaceMediaLibraryService => ({
  checkAvailability: vi.fn(),
  scanLibrary: vi.fn(async () => ({
    status: 'ready',
    scannedAt: 100,
    items: [1, 2, 3].map(index => ({
      id: `image-${index}`,
      kind: 'image' as const,
      source: 'generated' as const,
      filePath: `C:/work/media/generated/image-${index}.png`,
      relativePath: `media/generated/image-${index}.png`,
      fileName: `image-${index}.png`,
      extension: 'png',
      sizeBytes: 1200 + index,
      modifiedAt: 3000 - index,
    })),
  })),
});

const largeVideoService = (): WorkspaceMediaLibraryService => ({
  checkAvailability: vi.fn(),
  scanLibrary: vi.fn(async () => ({
    status: 'ready',
    scannedAt: 100,
    items: [
      {
        id: 'large-video',
        kind: 'video',
        source: 'generated',
        filePath: 'C:/work/media/generated/large.mp4',
        relativePath: 'media/generated/large.mp4',
        fileName: 'large.mp4',
        extension: 'mp4',
        sizeBytes: 80 * 1024 * 1024,
        modifiedAt: 3000,
        previewUrl: 'asset://local/large.mp4',
      },
    ],
  })),
});

describe('WorkspaceMediaGallery', () => {
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
    vi.stubGlobal('Event', dom.window.Event);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('renders scanned media and filters by media kind', async () => {
    const service = readyService();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,preview-video');

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    expect(container.textContent).toContain('poster.png');
    expect(container.textContent).toContain('clip.mp4');
    expect(container.textContent).toContain('voice.mp3');
    expect(container.querySelector('.workspace-media-gallery__masonry')).toBeTruthy();
    expect((container.querySelector('[data-testid="workspace-media-card-image"]') as HTMLElement).style.aspectRatio).toBe('900 / 1600');
    expect(container.querySelector('[data-testid="workspace-media-card-unpreviewable"]')?.textContent).toContain('broken.png');

    const imageFilter = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Images')) as HTMLButtonElement;

    await act(async () => {
      imageFilter.click();
    });

    expect(container.textContent).toContain('poster.png');
    expect(container.textContent).not.toContain('clip.mp4');
    expect(container.textContent).not.toContain('voice.mp3');
  });

  it('searches by path and sorts by name', async () => {
    const service = readyService();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,preview-video');

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    const search = container.querySelector('input[placeholder="Search"]') as HTMLInputElement;
    await act(async () => {
      Simulate.change(search, { target: { value: 'clip' } } as any);
    });

    expect(container.textContent).toContain('clip.mp4');
    expect(container.textContent).not.toContain('poster.png');

    await act(async () => {
      Simulate.change(search, { target: { value: '' } } as any);
    });

    const nameSort = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Name')) as HTMLButtonElement;
    await act(async () => {
      nameSort.click();
    });

    const tileNames = Array.from(container.querySelectorAll('[data-testid^="workspace-media-card-"] strong'))
      .map(element => element.textContent);
    expect(tileNames.slice(0, 4)).toEqual(['broken.png', 'clip.mp4', 'poster.png', 'voice.mp3']);
  });

  it('dispatches lightweight media preview events from card clicks', async () => {
    const service = readyService();
    const previewListener = vi.fn();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,preview-video');
    window.addEventListener(MEDIA_PREVIEW_EVENT, previewListener);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    const card = container.querySelector('[data-testid="workspace-media-card-image"]') as HTMLButtonElement;

    act(() => {
      card.click();
    });

    expect(previewListener).toHaveBeenCalledTimes(1);
    expect(previewListener.mock.calls[0][0].detail).toMatchObject({
      kind: 'image',
      url: 'data:image/png;base64,preview-image',
      localPath: 'C:/work/assets/poster.png',
      title: 'poster.png',
    });
  });

  it('uses resolved image data URLs for thumbnails and overlay preview', async () => {
    const service = readyService();
    const previewListener = vi.fn();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,base64-image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,preview-video');
    window.addEventListener(MEDIA_PREVIEW_EVENT, previewListener);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    const image = container.querySelector('[data-testid="workspace-media-card-image"] img') as HTMLImageElement;
    expect(imagePreviewResolver).toHaveBeenCalledWith({
      filePath: 'C:/work/assets/poster.png',
      extension: 'png',
      kind: 'image',
      modifiedAt: 3000,
    });
    expect(image.src).toBe('data:image/png;base64,base64-image');

    const card = container.querySelector('[data-testid="workspace-media-card-image"]') as HTMLButtonElement;
    act(() => {
      card.click();
    });

    expect(previewListener).toHaveBeenCalledTimes(1);
    expect(previewListener.mock.calls[0][0].detail).toMatchObject({
      kind: 'image',
      url: 'data:image/png;base64,base64-image',
      localPath: 'C:/work/assets/poster.png',
      title: 'poster.png',
    });
  });

  it('uses resolved video data URLs for video thumbnails and overlay preview', async () => {
    const service = readyService();
    const previewListener = vi.fn();
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,video-preview');
    window.addEventListener(MEDIA_PREVIEW_EVENT, previewListener);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    const video = container.querySelector('[data-testid="workspace-media-card-video"] video') as HTMLVideoElement;
    expect(mediaPreviewResolver).toHaveBeenCalledWith({
      filePath: 'C:/work/assets/clip.mp4',
      extension: 'mp4',
      kind: 'video',
      modifiedAt: 2000,
    });
    expect(video.src).toBe('data:video/mp4;base64,video-preview');
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('controls')).toBe(false);

    const card = container.querySelector('[data-testid="workspace-media-card-video"]') as HTMLButtonElement;
    act(() => {
      card.click();
    });

    expect(previewListener).toHaveBeenCalledTimes(1);
    expect(previewListener.mock.calls[0][0].detail).toMatchObject({
      kind: 'video',
      url: 'data:video/mp4;base64,video-preview',
      localPath: 'C:/work/assets/clip.mp4',
      title: 'clip.mp4',
    });
  });

  it('keeps large videos clickable without resolving an in-memory thumbnail', async () => {
    const service = largeVideoService();
    const previewListener = vi.fn();
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,large-video');
    window.addEventListener(MEDIA_PREVIEW_EVENT, previewListener);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    expect(mediaPreviewResolver).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="workspace-media-card-large-video"] video')).toBeNull();

    const card = container.querySelector('[data-testid="workspace-media-card-large-video"]') as HTMLButtonElement;
    act(() => {
      card.click();
    });

    expect(previewListener).toHaveBeenCalledTimes(1);
    expect(previewListener.mock.calls[0][0].detail).toMatchObject({
      kind: 'video',
      url: 'asset://local/large.mp4',
      localPath: 'C:/work/media/generated/large.mp4',
      title: 'large.mp4',
    });
  });

  it('limits image preview reads and continues queued previews as earlier reads finish', async () => {
    const service = threeImagesService();
    const pendingResolvers: Array<(value: string) => void> = [];
    const imagePreviewResolver = vi.fn(() => new Promise<string>((resolve) => {
      pendingResolvers.push(resolve);
    }));

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
        />
      );
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);
    expect(imagePreviewResolver.mock.calls.map(call => call[0].filePath)).toEqual([
      'C:/work/media/generated/image-1.png',
      'C:/work/media/generated/image-2.png',
    ]);

    await act(async () => {
      pendingResolvers[0]('data:image/png;base64,first');
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(3);
    expect(imagePreviewResolver.mock.calls[2][0].filePath).toBe('C:/work/media/generated/image-3.png');
  });

  it('updates image tile aspect ratio from loaded media dimensions', async () => {
    const service = noDimensionsService();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
        />
      );
    });

    const card = container.querySelector('[data-testid="workspace-media-card-landscape-without-dimensions"]') as HTMLButtonElement;
    const image = card.querySelector('img') as HTMLImageElement;
    expect(card.style.aspectRatio).toBe('4 / 3');

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1600 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 900 });
    act(() => {
      image.dispatchEvent(new dom.window.Event('load', { bubbles: false }));
    });

    expect(card.style.aspectRatio).toBe('1600 / 900');
  });

  it('keeps image cards clickable when thumbnail loading fails', async () => {
    const service = readyService();
    const previewListener = vi.fn();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,preview-video');
    window.addEventListener(MEDIA_PREVIEW_EVENT, previewListener);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />
      );
    });

    const image = container.querySelector('[data-testid="workspace-media-card-image"] img') as HTMLImageElement;
    act(() => {
      image.dispatchEvent(new dom.window.Event('error', { bubbles: false }));
    });

    const failedCard = container.querySelector('[data-testid="workspace-media-card-image"]') as HTMLButtonElement;
    expect(failedCard.className).toContain('is-failed');
    expect(failedCard.textContent).toContain('Preview unavailable');

    act(() => {
      failedCard.click();
    });

    expect(previewListener).toHaveBeenCalledTimes(1);
    expect(previewListener.mock.calls[0][0].detail).toMatchObject({
      kind: 'image',
      url: 'data:image/png;base64,preview-image',
      localPath: 'C:/work/assets/poster.png',
      title: 'poster.png',
    });
  });

  it('shows empty and error states explicitly', async () => {
    const emptyService: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => ({ status: 'empty', scannedAt: 100 })),
    };

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={emptyService} />);
    });

    expect(container.textContent).toContain('No media files found');

    const errorService: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => ({
        status: 'error',
        error: { code: 'scan_failed', message: 'permission denied' },
      })),
    };

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={errorService} />);
    });

    expect(container.textContent).toContain('permission denied');
  });
});
