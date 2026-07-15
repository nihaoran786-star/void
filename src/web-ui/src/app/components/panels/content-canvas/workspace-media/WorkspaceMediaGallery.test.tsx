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
      'workspaceMedia.views.active': 'Media',
      'workspaceMedia.views.deleted': 'Recently Deleted',
      'workspaceMedia.actions.delete': 'Delete',
      'workspaceMedia.actions.restore': 'Restore',
      'workspaceMedia.actions.purge': 'Delete forever',
      'workspaceMedia.actions.select': 'Select',
      'workspaceMedia.actions.selectVisible': 'Select all',
      'workspaceMedia.actions.clearVisibleSelection': 'Clear selected',
      'workspaceMedia.actions.deleteSelected': 'Delete selected',
      'workspaceMedia.actions.restoreSelected': 'Restore selected',
      'workspaceMedia.actions.purgeSelected': 'Delete selected forever',
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
      'workspaceMedia.states.deletedEmpty': 'No recently deleted media.',
      'workspaceMedia.ariaLabel': 'Workspace media',
    })[key] || key,
  }),
}));

import { WorkspaceMediaGallery } from './WorkspaceMediaGallery';
import { MEDIA_PREVIEW_EVENT } from '@/shared/services/preview/MediaPreviewService';
import { MEDIA_REFERENCE_EVENT } from '@/shared/services/media-reference';
import {
  dispatchWorkspaceMediaRefresh,
  recordWorkspaceMediaRefresh,
  resetWorkspaceMediaRefreshState,
} from '@/shared/services/workspace-media/WorkspaceMediaEvents';
import type {
  WorkspaceMediaLibraryService,
  WorkspaceMediaLibraryState,
} from '@/shared/services/workspace-media/WorkspaceMediaTypes';

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

const pendingGenerationService = (): WorkspaceMediaLibraryService => ({
  checkAvailability: vi.fn(),
  scanLibrary: vi.fn(async () => ({
    status: 'ready',
    scannedAt: 100,
    items: [],
    pendingGenerations: [
      {
        id: 'workspace-media-pending-batch-1',
        batchId: 'batch',
        itemIndex: 1,
        kind: 'image',
        source: 'generated',
        prompt: 'vertical scene',
        model: 'gpt-image-2',
        requestedAspectRatio: '9:16',
        placeholderAspectRatio: '9 / 16',
        updatedAt: 3000,
      },
      {
        id: 'workspace-media-pending-batch-2',
        batchId: 'batch',
        itemIndex: 2,
        kind: 'image',
        source: 'generated',
        prompt: 'vertical scene',
        model: 'gpt-image-2',
        requestedAspectRatio: '9:16',
        placeholderAspectRatio: '9 / 16',
        updatedAt: 3000,
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetWorkspaceMediaRefreshState();
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

  it('does no presentation work while inactive and refreshes immediately on activation', async () => {
    vi.useFakeTimers();
    const service = readyService();
    const listTrash = vi.fn(async () => ({ status: 'ready' as const, items: [], checkedAt: 100 }));
    const purgeExpiredTrash = vi.fn(async () => ({ status: 'ready' as const, items: [], checkedAt: 100 }));
    Object.assign(service, { listTrash, purgeExpiredTrash });
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,preview-video');

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
          isActive={false}
        />
      );
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(service.scanLibrary).not.toHaveBeenCalled();
    expect(listTrash).not.toHaveBeenCalled();
    expect(purgeExpiredTrash).toHaveBeenCalledTimes(1);
    expect(imagePreviewResolver).not.toHaveBeenCalled();
    expect(mediaPreviewResolver).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
          isActive
        />
      );
      await Promise.resolve();
    });

    expect(service.scanLibrary).toHaveBeenCalledTimes(1);
    expect(listTrash).toHaveBeenCalledTimes(1);
    expect(imagePreviewResolver).toHaveBeenCalled();
    expect(mediaPreviewResolver).toHaveBeenCalled();
  });

  it('starts a new activity epoch without waiting for a stale scan and rejects its late result', async () => {
    let resolveFirstScan!: (state: WorkspaceMediaLibraryState) => void;
    let resolveSecondScan!: (state: WorkspaceMediaLibraryState) => void;
    const scanLibrary = vi.fn()
      .mockImplementationOnce(() => new Promise<WorkspaceMediaLibraryState>((resolve) => {
        resolveFirstScan = resolve;
      }))
      .mockImplementationOnce(() => new Promise<WorkspaceMediaLibraryState>((resolve) => {
        resolveSecondScan = resolve;
      }));
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary,
    };
    const mediaState = (id: string): WorkspaceMediaLibraryState => ({
      status: 'ready',
      scannedAt: 100,
      items: [{
        id,
        kind: 'audio',
        source: 'input',
        filePath: `C:/work/${id}.mp3`,
        relativePath: `${id}.mp3`,
        fileName: `${id}.mp3`,
        extension: 'mp3',
        modifiedAt: 100,
        previewUrl: `asset://local/${id}.mp3`,
      }],
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive />);
    });
    expect(scanLibrary).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive={false} />);
    });
    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive />);
    });
    expect(scanLibrary).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecondScan(mediaState('fresh'));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('fresh.mp3');

    await act(async () => {
      resolveFirstScan(mediaState('stale'));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('fresh.mp3');
    expect(container.textContent).not.toContain('stale.mp3');
  });

  it('keeps the ready gallery visible while an activation refresh is pending', async () => {
    let resolveRefresh!: (state: WorkspaceMediaLibraryState) => void;
    const readyState: WorkspaceMediaLibraryState = {
      status: 'ready',
      scannedAt: 100,
      items: [{
        id: 'retained',
        kind: 'audio',
        source: 'input',
        filePath: 'C:/work/retained.mp3',
        relativePath: 'retained.mp3',
        fileName: 'retained.mp3',
        extension: 'mp3',
        modifiedAt: 100,
        previewUrl: 'asset://local/retained.mp3',
      }],
    };
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn()
        .mockResolvedValueOnce(readyState)
        .mockImplementationOnce(() => new Promise<WorkspaceMediaLibraryState>((resolve) => {
          resolveRefresh = resolve;
        })),
    };

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive />);
    });
    expect(container.textContent).toContain('retained.mp3');

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive={false} />);
    });
    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive />);
    });

    expect(service.scanLibrary).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('retained.mp3');
    expect(container.textContent).not.toContain('Scanning media files...');

    await act(async () => {
      resolveRefresh(readyState);
      await Promise.resolve();
    });
  });

  it('keeps pending generation cards visible while an activation refresh is pending', async () => {
    let resolveRefresh!: (state: WorkspaceMediaLibraryState) => void;
    const emptyState: WorkspaceMediaLibraryState = { status: 'empty', scannedAt: 100 };
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn()
        .mockResolvedValueOnce(emptyState)
        .mockImplementationOnce(() => new Promise<WorkspaceMediaLibraryState>((resolve) => {
          resolveRefresh = resolve;
        })),
    };
    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'started',
      workspacePath: 'C:/work',
      toolId: 'media-tool-before-resume',
      toolName: 'GenerateImage',
      kind: 'image',
      prompt: 'retained pending request',
      requestedAspectRatio: '1:1',
      placeholderAspectRatio: '1 / 1',
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive />);
    });
    expect(container.querySelector('[data-testid^="workspace-media-card-workspace-media-pending-"]')).toBeTruthy();

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive={false} />);
    });
    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} isActive />);
    });

    expect(service.scanLibrary).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid^="workspace-media-card-workspace-media-pending-"]')).toBeTruthy();
    expect(container.textContent).not.toContain('Scanning media files...');

    await act(async () => {
      resolveRefresh(emptyState);
      await Promise.resolve();
    });
  });

  it('retries an invalidated preview after activation and pauses media without autoplay', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => ({
        status: 'ready',
        scannedAt: 100,
        items: [{
          id: 'video-retry',
          kind: 'video',
          source: 'generated',
          filePath: 'C:/work/video-retry.mp4',
          relativePath: 'video-retry.mp4',
          fileName: 'video-retry.mp4',
          extension: 'mp4',
          sizeBytes: 1024,
          modifiedAt: 100,
          previewUrl: 'asset://local/video-retry.mp4',
        }],
      })),
    };
    let resolveFirstPreview!: (url: string) => void;
    let resolveSecondPreview!: (url: string) => void;
    const mediaPreviewResolver = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => {
        resolveFirstPreview = resolve;
      }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => {
        resolveSecondPreview = resolve;
      }));
    const pauseSpy = vi.spyOn(dom.window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(dom.window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          mediaPreviewResolver={mediaPreviewResolver}
          isActive
        />
      );
    });
    expect(mediaPreviewResolver).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          mediaPreviewResolver={mediaPreviewResolver}
          isActive={false}
        />
      );
    });
    await act(async () => {
      resolveFirstPreview('data:video/mp4;base64,stale');
      await Promise.resolve();
    });
    expect(container.querySelector('video')).toBeNull();

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          mediaPreviewResolver={mediaPreviewResolver}
          isActive
        />
      );
      await Promise.resolve();
    });
    expect(mediaPreviewResolver).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecondPreview('data:video/mp4;base64,fresh');
      await Promise.resolve();
    });
    expect(container.querySelector('video')).toBeTruthy();

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          mediaPreviewResolver={mediaPreviewResolver}
          isActive={false}
        />
      );
    });
    expect(pauseSpy).toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
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

  it('renders pending generation placeholders with requested count and ratio without preview clicks', async () => {
    const service = pendingGenerationService();
    const previewListener = vi.fn();
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,preview-image');
    window.addEventListener(MEDIA_PREVIEW_EVENT, previewListener);

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
          imagePreviewResolver={imagePreviewResolver}
        />
      );
    });

    const cards = container.querySelectorAll('[data-testid^="workspace-media-card-workspace-media-pending-batch-"]');
    expect(cards).toHaveLength(2);
    const card = cards[0] as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    expect(card.className).toContain('is-pending');
    expect(card.style.aspectRatio).toBe('9 / 16');
    expect(card.textContent).toContain('Generating image #1');
    expect(card.textContent).toContain('9:16');
    expect(card.querySelector('.workspace-media-card__generator')).toBeTruthy();
    expect(imagePreviewResolver).not.toHaveBeenCalled();

    act(() => {
      card.click();
    });

    expect(previewListener).not.toHaveBeenCalled();
  });

  it('background-refreshes the gallery so newly created pending generation jobs appear without reopening', async () => {
    vi.useFakeTimers();
    let scanCount = 0;
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => {
        scanCount += 1;
        return {
          status: 'ready',
          scannedAt: 100 + scanCount,
          items: [],
          pendingGenerations: scanCount === 1 ? [] : [
            {
              id: 'workspace-media-pending-live-batch-1',
              batchId: 'live-batch',
              itemIndex: 1,
              kind: 'image',
              source: 'generated',
              prompt: 'new live request',
              model: 'gpt-image-2',
              requestedAspectRatio: '21:9',
              placeholderAspectRatio: '21 / 9',
              updatedAt: 5000,
            },
          ],
        };
      }),
    };

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
        />
      );
    });

    expect(container.querySelector('[data-testid="workspace-media-card-workspace-media-pending-live-batch-1"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="workspace-media-card-workspace-media-pending-live-batch-1"]') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.disabled).toBe(true);
    expect(card.className).toContain('is-pending');
    expect(card.style.aspectRatio).toBe('21 / 9');
    expect(card.querySelector('.workspace-media-card__generator')).toBeTruthy();
  });

  it('refreshes immediately when a workspace media refresh event is dispatched', async () => {
    let scanCount = 0;
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => {
        scanCount += 1;
        return {
          status: 'ready',
          scannedAt: 100 + scanCount,
          items: [],
          pendingGenerations: scanCount === 1 ? [] : [
            {
              id: 'workspace-media-pending-event-batch-1',
              batchId: 'event-batch',
              itemIndex: 1,
              kind: 'image',
              source: 'generated',
              prompt: 'event driven request',
              model: 'gpt-image-2',
              requestedAspectRatio: '1:1',
              placeholderAspectRatio: '1 / 1',
              updatedAt: 5000,
            },
          ],
        };
      }),
    };

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
        />
      );
    });

    expect(container.querySelector('[data-testid="workspace-media-card-workspace-media-pending-event-batch-1"]')).toBeNull();

    await act(async () => {
      dispatchWorkspaceMediaRefresh({
        reason: 'media-tool-event',
        lifecycleStatus: 'polling',
        workspacePath: 'C:/work',
        toolId: 'media-tool-event-batch',
        toolName: 'GenerateImage',
        batchId: 'event-batch',
      });
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="workspace-media-card-workspace-media-pending-event-batch-1"]') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.disabled).toBe(true);
    expect(card.querySelector('.workspace-media-card__generator')).toBeTruthy();
  });

  it('retries after a workspace media refresh event so async job manifests can settle', async () => {
    vi.useFakeTimers();
    let scanCount = 0;
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => {
        scanCount += 1;
        return {
          status: 'ready',
          scannedAt: 100 + scanCount,
          items: [],
          pendingGenerations: scanCount < 3 ? [] : [
            {
              id: 'workspace-media-pending-settled-batch-1',
              batchId: 'settled-batch',
              itemIndex: 1,
              kind: 'image',
              source: 'generated',
              prompt: 'settled request',
              model: 'gpt-image-2',
              requestedAspectRatio: '1:1',
              placeholderAspectRatio: '1 / 1',
              updatedAt: 5000,
            },
          ],
        };
      }),
    };

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
        />
      );
    });

    await act(async () => {
      dispatchWorkspaceMediaRefresh({
        reason: 'media-tool-event',
        lifecycleStatus: 'polling',
        workspacePath: 'C:/work',
        toolId: 'media-tool-settled-batch',
        toolName: 'GenerateImage',
        batchId: 'settled-batch',
      });
      await Promise.resolve();
    });

    const immediateCard = container.querySelector(
      '[data-testid^="workspace-media-card-workspace-media-pending-C-work-media-tool-settled-batch-settled-batch-image-1"]'
    ) as HTMLButtonElement;
    expect(immediateCard).toBeTruthy();
    expect(immediateCard.disabled).toBe(true);
    expect(service.scanLibrary).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="workspace-media-card-workspace-media-pending-settled-batch-1"]') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.disabled).toBe(true);
    expect(card.querySelector('.workspace-media-card__generator')).toBeTruthy();
    expect(service.scanLibrary).toHaveBeenCalledTimes(3);
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

  it('renders a pending generation signal that arrived before the gallery mounted', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => ({ status: 'empty', scannedAt: 100 })),
    };

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'started',
      workspacePath: 'C:/work',
      toolId: 'media-tool-before-mount',
      toolName: 'GenerateImage',
      kind: 'image',
      prompt: 'new live request',
      requestedAspectRatio: '1:1',
      placeholderAspectRatio: '1 / 1',
    });

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
        />
      );
    });

    const card = container.querySelector(
      '[data-testid^="workspace-media-card-workspace-media-pending-C-work-media-tool-before-mount-tool-media-tool-before-mount-image-1"]'
    ) as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.disabled).toBe(true);
    expect(card.querySelector('.workspace-media-card__generator')).toBeTruthy();
    expect(service.scanLibrary).toHaveBeenCalledWith('C:/work');
  });

  it('shows a path mismatch state when the latest media signal targets a different workspace', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(),
      scanLibrary: vi.fn(async () => ({ status: 'empty', scannedAt: 100 })),
    };

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'started',
      workspacePath: 'C:/other-workspace',
      toolId: 'media-tool-other-workspace',
      toolName: 'GenerateImage',
      kind: 'image',
      prompt: 'other workspace request',
    });

    await act(async () => {
      root.render(
        <WorkspaceMediaGallery
          workspacePath="C:/work"
          service={service}
        />
      );
    });

    expect(container.querySelector('[data-testid="workspace-media-path-mismatch"]')).toBeTruthy();
    expect(container.textContent).toContain('different workspace');
  });

  it('deletes single media items through the workspace media service', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 100 })),
      deleteItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 200 })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    const deleteButton = container.querySelector('[aria-label="Delete poster.png"]') as HTMLButtonElement;

    await act(async () => {
      deleteButton.click();
      await Promise.resolve();
    });

    expect(service.deleteItems).toHaveBeenCalledWith('C:/work', [
      expect.objectContaining({
        id: 'image',
        filePath: 'C:/work/assets/poster.png',
        kind: 'image',
        source: 'generated',
        stableSlotId: 'image',
      }),
    ]);
    expect(service.scanLibrary).toHaveBeenCalledTimes(2);
  });

  it('keeps the active media view after a delete operation', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 100 })),
      deleteItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 200 })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    await act(async () => {
      (container.querySelector('[aria-label="Delete poster.png"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('.workspace-media-gallery__views button.is-active')?.textContent).toContain('Media');
    expect(container.textContent).not.toContain('No recently deleted media.');
  });

  it('shows delete errors without switching to recently deleted', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 100 })),
      deleteItems: vi.fn(async () => ({
        status: 'error',
        error: { code: 'trash_failed', message: 'write_file_content failed' },
      })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    await act(async () => {
      (container.querySelector('[aria-label="Delete poster.png"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('.workspace-media-gallery__views button.is-active')?.textContent).toContain('Media');
    expect(container.textContent).toContain('write_file_content failed');
  });

  it('supports batch delete from the active media view', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 100 })),
      deleteItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 200 })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    const selectButtons = [
      container.querySelector('button[aria-label="Select poster.png"]') as HTMLButtonElement,
      container.querySelector('button[aria-label="Select clip.mp4"]') as HTMLButtonElement,
    ];
    await act(async () => {
      selectButtons[0].click();
      selectButtons[1].click();
    });

    const deleteSelected = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Delete selected')) as HTMLButtonElement;
    await act(async () => {
      deleteSelected.click();
      await Promise.resolve();
    });

    expect(service.deleteItems).toHaveBeenCalledWith('C:/work', expect.arrayContaining([
      expect.objectContaining({ id: 'image' }),
      expect.objectContaining({ id: 'video' }),
    ]));
  });

  it('selects visible active media for batch delete', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 100 })),
      deleteItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 200 })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    const videosFilter = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Videos')) as HTMLButtonElement;
    await act(async () => {
      videosFilter.click();
    });

    const selectAll = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Select all')) as HTMLButtonElement;
    await act(async () => {
      selectAll.click();
    });

    const deleteSelected = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Delete selected')) as HTMLButtonElement;
    await act(async () => {
      deleteSelected.click();
      await Promise.resolve();
    });

    expect(service.deleteItems).toHaveBeenCalledWith('C:/work', [
      expect.objectContaining({ id: 'video' }),
    ]);
  });

  it('shows recently deleted media and restores or permanently deletes records', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({
        status: 'ready',
        checkedAt: 100,
        items: [
          {
            id: 'trash-1',
            state: 'trashed',
            originalPath: 'C:/work/media/generated/deleted.png',
            trashPath: 'C:/work/.void/media-trash/trash-1/deleted.png',
            fileName: 'deleted.png',
            kind: 'image',
            source: 'generated',
            deletedAt: 1000,
          },
        ],
      })),
      restoreItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 200 })),
      purgeItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 300 })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    const deletedView = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Recently Deleted')) as HTMLButtonElement;
    await act(async () => {
      deletedView.click();
    });

    expect(container.textContent).toContain('deleted.png');
    expect(container.querySelector('.workspace-media-gallery__deleted-list')).toBeNull();
    expect(container.querySelector('[data-testid="workspace-media-trash-trash-1"]')?.closest('.workspace-media-gallery__masonry-item')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[aria-label="Restore deleted.png"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(service.restoreItems).toHaveBeenCalledWith('C:/work', ['trash-1']);

    await act(async () => {
      deletedView.click();
    });
    await act(async () => {
      (container.querySelector('[aria-label="Delete forever deleted.png"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(service.purgeItems).toHaveBeenCalledWith('C:/work', ['trash-1']);
  });

  it('selects visible recently deleted records for restore and permanent delete', async () => {
    const service = readyService();
    Object.assign(service, {
      listTrash: vi.fn(async () => ({
        status: 'ready',
        checkedAt: 100,
        items: [
          {
            id: 'trash-image',
            state: 'trashed',
            originalPath: 'C:/work/media/generated/deleted.png',
            trashPath: 'C:/work/.void/media-trash/trash-image/deleted.png',
            fileName: 'deleted.png',
            kind: 'image',
            source: 'generated',
            deletedAt: 1000,
          },
          {
            id: 'trash-audio',
            state: 'trashed',
            originalPath: 'C:/work/media/input/deleted.mp3',
            trashPath: 'C:/work/.void/media-trash/trash-audio/deleted.mp3',
            fileName: 'deleted.mp3',
            kind: 'audio',
            source: 'input',
            deletedAt: 900,
          },
        ],
      })),
      restoreItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 200 })),
      purgeItems: vi.fn(async () => ({ status: 'ready', items: [], checkedAt: 300 })),
    });

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    const deletedView = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Recently Deleted')) as HTMLButtonElement;
    await act(async () => {
      deletedView.click();
    });

    const imagesFilter = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Images')) as HTMLButtonElement;
    await act(async () => {
      imagesFilter.click();
    });

    const selectAll = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Select all')) as HTMLButtonElement;
    await act(async () => {
      selectAll.click();
    });

    const restoreSelected = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Restore selected')) as HTMLButtonElement;
    await act(async () => {
      restoreSelected.click();
      await Promise.resolve();
    });
    expect(service.restoreItems).toHaveBeenCalledWith('C:/work', ['trash-image']);

    await act(async () => {
      deletedView.click();
    });
    await act(async () => {
      (Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent?.includes('Select all')) as HTMLButtonElement).click();
    });
    const purgeSelected = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Delete selected forever')) as HTMLButtonElement;
    await act(async () => {
      purgeSelected.click();
      await Promise.resolve();
    });
    expect(service.purgeItems).toHaveBeenCalledWith('C:/work', ['trash-image']);
  });

  it('dispatches structured media reference contexts for image video and audio tiles', async () => {
    const service = readyService();
    const referenceListener = vi.fn();
    window.addEventListener(MEDIA_REFERENCE_EVENT, referenceListener);

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    await act(async () => {
      (container.querySelector('[aria-label="Reference poster.png"]') as HTMLButtonElement).click();
      (container.querySelector('[aria-label="Reference clip.mp4"]') as HTMLButtonElement).click();
      (container.querySelector('[aria-label="Reference voice.mp3"]') as HTMLButtonElement).click();
    });

    expect(referenceListener).toHaveBeenCalledTimes(3);
    expect(referenceListener.mock.calls[0][0].detail.context).toMatchObject({
      type: 'image',
      imagePath: 'C:/work/assets/poster.png',
      metadata: { mediaReference: true },
    });
    expect(referenceListener.mock.calls[1][0].detail.context).toMatchObject({
      type: 'media-reference',
      kind: 'video',
      mediaPath: 'C:/work/assets/clip.mp4',
    });
    expect(referenceListener.mock.calls[2][0].detail.context).toMatchObject({
      type: 'media-reference',
      kind: 'audio',
      mediaPath: 'C:/work/assets/voice.mp3',
    });
  });

  it('keeps ready media tiles free of top-left type badges while retaining video play affordance', async () => {
    const service = readyService();

    await act(async () => {
      root.render(<WorkspaceMediaGallery workspacePath="C:/work" service={service} />);
    });

    const imageCard = container.querySelector('[data-testid="workspace-media-card-image"]') as HTMLElement;
    const videoCard = container.querySelector('[data-testid="workspace-media-card-video"]') as HTMLElement;

    expect(imageCard.querySelector('.workspace-media-card__type')).toBeNull();
    expect(videoCard.querySelector('.workspace-media-card__type')).toBeNull();
    expect(videoCard.querySelector('.workspace-media-card__play')).toBeTruthy();
  });
});
