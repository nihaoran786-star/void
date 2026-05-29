import { describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceMediaLibraryService,
  getMediaKindForPath,
  shouldIgnoreWorkspaceMediaDirectory,
} from './WorkspaceMediaLibrary';
import type { WorkspaceMediaNodeAdapter } from './WorkspaceMediaTypes';

const node = (
  path: string,
  overrides: Partial<Awaited<ReturnType<WorkspaceMediaNodeAdapter['listChildren']>>[number]> = {}
) => ({
  path,
  name: path.split(/[\\/]/).pop() || path,
  isDirectory: false,
  sizeBytes: 1024,
  modifiedAt: 1000,
  ...overrides,
});

function createAdapter(tree: Record<string, Awaited<ReturnType<WorkspaceMediaNodeAdapter['listChildren']>>>): WorkspaceMediaNodeAdapter {
  return {
    ensureDirectory: vi.fn(async () => undefined),
    listChildren: vi.fn(async (path: string) => tree[path] || []),
  };
}

describe('WorkspaceMediaLibrary', () => {
  it('classifies supported image, video, and audio files by extension', () => {
    expect(getMediaKindForPath('poster.PNG')).toBe('image');
    expect(getMediaKindForPath('clip.webm')).toBe('video');
    expect(getMediaKindForPath('voice.M4A')).toBe('audio');
    expect(getMediaKindForPath('notes.md')).toBeNull();
  });

  it('ignores high-cost workspace directories', () => {
    expect(shouldIgnoreWorkspaceMediaDirectory('node_modules')).toBe(true);
    expect(shouldIgnoreWorkspaceMediaDirectory('.git')).toBe(true);
    expect(shouldIgnoreWorkspaceMediaDirectory('dist')).toBe(true);
    expect(shouldIgnoreWorkspaceMediaDirectory('storyboards')).toBe(false);
  });

  it('detects availability only from managed media folders', async () => {
    const adapter = createAdapter({
      'C:/work/media/generated': [
        node('C:/work/media/generated/scene.png', { modifiedAt: 3000 }),
      ],
      'C:/work/media/input': [],
      'C:/work/src': [
        node('C:/work/src/noisy.png', { modifiedAt: 4000 }),
      ],
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    await expect(service.checkAvailability('C:/work')).resolves.toMatchObject({ status: 'available' });
    expect(adapter.ensureDirectory).toHaveBeenCalledWith('C:/work/media/generated');
    expect(adapter.ensureDirectory).toHaveBeenCalledWith('C:/work/media/input');
    expect(adapter.listChildren).toHaveBeenCalledWith('C:/work/media/generated');
    expect(adapter.listChildren).not.toHaveBeenCalledWith('C:/work/src');
  });

  it('returns unavailable when managed media folders have no media files', async () => {
    const service = createWorkspaceMediaLibraryService(createAdapter({
      'C:/work/media/generated': [],
      'C:/work/media/input': [],
      'C:/work': [node('C:/work/noisy.png')],
    }));

    await expect(service.checkAvailability('C:/work')).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('includes legacy generated media saved under .void media without creating that folder', async () => {
    const adapter = createAdapter({
      'C:/work/media/generated': [],
      'C:/work/media/input': [],
      'C:/work/.void/media/generated': [
        node('C:/work/.void/media/generated/batch/image-001.png', { modifiedAt: 5000 }),
      ],
      'C:/work/.void/media/uploads': [
        node('C:/work/.void/media/uploads/reference.jpg', { modifiedAt: 4000 }),
      ],
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    await expect(service.checkAvailability('C:/work')).resolves.toMatchObject({ status: 'available' });

    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.items.map(item => item.relativePath)).toEqual([
      '.void/media/generated/batch/image-001.png',
      '.void/media/uploads/reference.jpg',
    ]);
    expect(result.items.map(item => item.source)).toEqual(['generated', 'input']);
    expect(adapter.ensureDirectory).toHaveBeenCalledWith('C:/work/media/generated');
    expect(adapter.ensureDirectory).toHaveBeenCalledWith('C:/work/media/input');
    expect(adapter.ensureDirectory).not.toHaveBeenCalledWith('C:/work/.void/media/generated');
    expect(adapter.ensureDirectory).not.toHaveBeenCalledWith('C:/work/.void/media/uploads');
  });

  it('scans only generated and input media folders, sorted by modified time', async () => {
    const adapter = createAdapter({
      'C:/work/media/generated': [
        node('C:/work/media/generated/new.mp4', { modifiedAt: 3000, sizeBytes: 34 }),
        node('C:/work/media/generated/audio.wav', { modifiedAt: 2000, sizeBytes: 56 }),
      ],
      'C:/work/media/input': [
        node('C:/work/media/input/old.png', { modifiedAt: 1000, sizeBytes: 12 }),
      ],
      'C:/work/assets': [
        node('C:/work/assets/noisy.png', { modifiedAt: 4000, sizeBytes: 78 }),
      ],
    });
    const service = createWorkspaceMediaLibraryService(adapter, { maxResults: 2 });

    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.truncated).toBe(true);
    expect(result.items.map(item => item.relativePath)).toEqual(['media/generated/new.mp4', 'media/generated/audio.wav']);
    expect(result.items.map(item => item.kind)).toEqual(['video', 'audio']);
    expect(result.items.map(item => item.source)).toEqual(['generated', 'generated']);
    expect(adapter.listChildren).not.toHaveBeenCalledWith('C:/work/assets');
  });

  it('treats missing managed media folders as empty instead of scan errors', async () => {
    const service = createWorkspaceMediaLibraryService({
      listChildren: vi.fn(async () => {
        throw new Error('not found');
      }),
    });

    await expect(service.scanLibrary('C:/work')).resolves.toMatchObject({ status: 'empty' });
  });

  it('normalizes scanner failures into explicit error state', async () => {
    const service = createWorkspaceMediaLibraryService({
      listChildren: vi.fn(async (path: string) => {
        if (path === 'C:/work/media/generated') {
          return [node('C:/work/media/generated/private', { name: 'private', isDirectory: true })];
        }
        if (path === 'C:/work/media/input') {
          return [];
        }
        throw new Error('permission denied');
      }),
    });

    await expect(service.scanLibrary('C:/work')).resolves.toMatchObject({
      status: 'error',
      error: {
        code: 'scan_failed',
      },
    });
  });
});
