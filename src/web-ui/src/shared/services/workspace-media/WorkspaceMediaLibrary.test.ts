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

function createAdapterWithFiles(
  tree: Record<string, Awaited<ReturnType<WorkspaceMediaNodeAdapter['listChildren']>>>,
  files: Record<string, string>
): WorkspaceMediaNodeAdapter {
  return {
    ensureDirectory: vi.fn(async () => undefined),
    listChildren: vi.fn(async (path: string) => tree[path] || []),
    readTextFile: vi.fn(async (path: string) => files[path] ?? ''),
  };
}

function createMutableAdapter(
  tree: Record<string, Awaited<ReturnType<WorkspaceMediaNodeAdapter['listChildren']>>>,
  files: Record<string, string> = {},
  existingPaths: string[] = []
): WorkspaceMediaNodeAdapter {
  const existing = new Set(existingPaths);
  Object.values(tree).flat().forEach(entry => {
    existing.add(entry.path);
  });
  return {
    ensureDirectory: vi.fn(async (path: string) => {
      existing.add(path);
    }),
    listChildren: vi.fn(async (path: string) => tree[path] || []),
    readTextFile: vi.fn(async (path: string) => files[path] ?? ''),
    writeTextFile: vi.fn(async (path: string, content: string) => {
      files[path] = content;
      existing.add(path);
    }),
    renameFile: vi.fn(async (from: string, to: string) => {
      existing.delete(from);
      existing.add(to);
    }),
    deleteFile: vi.fn(async (path: string) => {
      existing.delete(path);
    }),
    deleteDirectory: vi.fn(async (path: string) => {
      existing.delete(path);
    }),
    pathExists: vi.fn(async (path: string) => existing.has(path)),
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

  it('does not read or delete media files during library scanning', async () => {
    const adapter: WorkspaceMediaNodeAdapter = {
      ensureDirectory: vi.fn(async () => undefined),
      listChildren: vi.fn(async (path: string) => {
        if (path === 'C:/work/media/generated') {
          return [
            node('C:/work/media/generated/valid.png', { modifiedAt: 3000 }),
            node('C:/work/media/generated/001.png', { modifiedAt: 4000 }),
          ];
        }
        return [];
      }),
    };
    const readFileContent = vi.fn(async () => '<html>not an image</html>');
    const deleteFile = vi.fn(async () => undefined);
    Object.assign(adapter, { readFileContent, deleteFile });
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.items.map(item => item.relativePath)).toEqual([
      'media/generated/001.png',
      'media/generated/valid.png',
    ]);
    expect(readFileContent).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
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

  it('returns active media job placeholders with requested count and aspect ratio', async () => {
    const adapter = createAdapterWithFiles({
      'C:/work/media/generated': [],
      'C:/work/media/input': [],
      'C:/work/.void/media-jobs': [
        node('C:/work/.void/media-jobs/media_batch_1.json', { modifiedAt: 3000 }),
      ],
    }, {
      'C:/work/.void/media-jobs/media_batch_1.json': JSON.stringify({
        status: 'polling',
        batch: {
          batch_id: 'media_batch_1',
          kind: 'image',
          status: 'polling',
          pending_count: 2,
          requested_count: 2,
          requested_aspect_ratio: '9:16',
          placeholder_aspect_ratio: '9 / 16',
          updated_at: '2026-05-29T12:00:00.000Z',
          items: [
            { prompt: 'portrait city', model: 'gpt-image-2' },
          ],
        },
      }),
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    await expect(service.checkAvailability('C:/work')).resolves.toMatchObject({ status: 'available' });
    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.items).toEqual([]);
    expect(result.pendingGenerations).toHaveLength(2);
    expect(result.pendingGenerations?.[0]).toMatchObject({
      id: 'workspace-media-pending-media_batch_1-1',
      batchId: 'media_batch_1',
      itemIndex: 1,
      kind: 'image',
      prompt: 'portrait city',
      model: 'gpt-image-2',
      requestedAspectRatio: '9:16',
      placeholderAspectRatio: '9 / 16',
    });
  });

  it('extracts generated identity and slot aspect metadata from generated output manifests', async () => {
    const adapter = createAdapterWithFiles({
      'C:/work/media/generated': [
        node('C:/work/media/generated/media_batch_1', { name: 'media_batch_1', isDirectory: true }),
      ],
      'C:/work/media/generated/media_batch_1': [
        node('C:/work/media/generated/media_batch_1/image-001.png', { modifiedAt: 9000 }),
        node('C:/work/media/generated/media_batch_1/manifest.json', { modifiedAt: 9100 }),
      ],
      'C:/work/media/input': [],
      'C:/work/.void/media-jobs': [],
    }, {
      'C:/work/media/generated/media_batch_1/manifest.json': JSON.stringify({
        batch: {
          batch_id: 'media_batch_1',
          status: 'completed',
          requested_aspect_ratio: '9:16',
          placeholder_aspect_ratio: '9 / 16',
          updated_at: '2026-05-29T12:00:00.000Z',
          items: [
            {
              item_index: 1,
              completed_at: '2026-05-29T12:00:10.000Z',
              prompt: '角色设定图，林晚，雨夜归来造型',
              role: 'asset',
              result_url: 'https://example.test/media/image-001.png',
              local_path: 'C:/work/media/generated/media_batch_1/image-001.png',
            },
          ],
        },
      }),
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'media/generated/media_batch_1/image-001.png',
      generatedIdentity: {
        batchId: 'media_batch_1',
        itemIndex: 1,
      },
      requestedAspectRatio: '9:16',
      placeholderAspectRatio: '9 / 16',
      generationPrompt: '角色设定图，林晚，雨夜归来造型',
      generationRole: 'asset',
      generationResultUrl: 'https://example.test/media/image-001.png',
      filePath: 'C:/work/media/generated/media_batch_1/image-001.png',
      sortAt: Date.parse('2026-05-29T12:00:10.000Z'),
    });
  });

  it('ignores completed and malformed media job records while keeping ready files', async () => {
    const adapter = createAdapterWithFiles({
      'C:/work/media/generated': [
        node('C:/work/media/generated/done.png', { modifiedAt: 5000 }),
      ],
      'C:/work/media/input': [],
      'C:/work/.void/media-jobs': [
        node('C:/work/.void/media-jobs/completed.json'),
        node('C:/work/.void/media-jobs/broken.json'),
      ],
    }, {
      'C:/work/.void/media-jobs/completed.json': JSON.stringify({
        status: 'completed',
        batch: { batch_id: 'done', status: 'completed', pending_count: 0 },
      }),
      'C:/work/.void/media-jobs/broken.json': '{',
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.items.map(item => item.relativePath)).toEqual(['media/generated/done.png']);
    expect(result.pendingGenerations).toEqual([]);
  });

  it('handles large pending generation batches without reading media files', async () => {
    const adapter = createAdapterWithFiles({
      'C:/work/media/generated': [],
      'C:/work/media/input': [],
      'C:/work/.void/media-jobs': [
        node('C:/work/.void/media-jobs/large.json'),
      ],
    }, {
      'C:/work/.void/media-jobs/large.json': JSON.stringify({
        status: 'polling',
        batch: {
          batch_id: 'large',
          kind: 'video',
          status: 'polling',
          pending_count: 80,
          requested_count: 80,
          requested_aspect_ratio: '21:9',
          placeholder_aspect_ratio: '21 / 9',
        },
      }),
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.scanLibrary('C:/work');

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.pendingGenerations).toHaveLength(64);
    expect(result.pendingGenerations?.[63]).toMatchObject({
      id: 'workspace-media-pending-large-64',
      kind: 'video',
      placeholderAspectRatio: '21 / 9',
    });
    expect(adapter.readTextFile).toHaveBeenCalledTimes(1);
  });

  it('moves selected media into trash with metadata and lists recently deleted records', async () => {
    const adapter = createMutableAdapter({
      'C:/work/.void/media-trash': [
        node('C:/work/.void/media-trash/trash-existing', { name: 'trash-existing', isDirectory: true }),
      ],
      'C:/work/.void/media-trash/trash-existing': [
        node('C:/work/.void/media-trash/trash-existing/metadata.json'),
      ],
    }, {
      'C:/work/.void/media-trash/trash-existing/metadata.json': JSON.stringify({
        id: 'trash-existing',
        state: 'trashed',
        originalPath: 'C:/work/media/generated/old.png',
        trashPath: 'C:/work/.void/media-trash/trash-existing/old.png',
        fileName: 'old.png',
        kind: 'image',
        source: 'generated',
        deletedAt: 1000,
      }),
    }, ['C:/work/media/generated/new.png']);
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.deleteItems('C:/work', [{
      id: 'new',
      stableSlotId: 'new',
      filePath: 'C:/work/media/generated/new.png',
      kind: 'image',
      source: 'generated',
    }], 2000);

    expect(result.status).toBe('ready');
    expect(adapter.renameFile).toHaveBeenCalledWith(
      'C:/work/media/generated/new.png',
      expect.stringContaining('C:/work/.void/media-trash/')
    );
    expect(adapter.writeTextFile).toHaveBeenCalledWith(
      expect.stringContaining('/metadata.json'),
      expect.stringContaining('"originalPath": "C:/work/media/generated/new.png"')
    );
    expect(adapter.writeTextFile).toHaveBeenCalledWith(
      'C:/work/.void/media-trash/index.json',
      expect.stringContaining('"originalPath": "C:/work/media/generated/new.png"')
    );

    const trash = await service.listTrash('C:/work', 2000);

    expect(trash.status).toBe('ready');
    if (trash.status !== 'ready') return;
    expect(trash.items.map(item => item.id)).toContain('trash-existing');
    expect(trash.items.find(item => item.id === 'trash-existing')).toMatchObject({
      state: 'trashed',
      originalPath: 'C:/work/media/generated/old.png',
      kind: 'image',
      source: 'generated',
      deletedAt: 1000,
    });
  });

  it('lists recently deleted records from the trash index when directory listing is stale', async () => {
    const adapter = createMutableAdapter({
      'C:/work/.void/media-trash': [],
    }, {
      'C:/work/.void/media-trash/index.json': JSON.stringify({
        version: 1,
        items: [{
          id: 'trash-indexed',
          state: 'trashed',
          originalPath: 'C:/work/media/generated/indexed.png',
          trashPath: 'C:/work/.void/media-trash/trash-indexed/indexed.png',
          fileName: 'indexed.png',
          kind: 'image',
          source: 'generated',
          deletedAt: 3000,
        }],
      }),
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    const trash = await service.listTrash('C:/work', 4000);

    expect(trash.status).toBe('ready');
    if (trash.status !== 'ready') return;
    expect(trash.items).toHaveLength(1);
    expect(trash.items[0]).toMatchObject({
      id: 'trash-indexed',
      originalPath: 'C:/work/media/generated/indexed.png',
      deletedAt: 3000,
    });
  });

  it('restores trash records and avoids original-path conflicts', async () => {
    const adapter = createMutableAdapter({
      'C:/work/.void/media-trash': [
        node('C:/work/.void/media-trash/trash-1', { name: 'trash-1', isDirectory: true }),
      ],
      'C:/work/.void/media-trash/trash-1': [
        node('C:/work/.void/media-trash/trash-1/metadata.json'),
      ],
    }, {
      'C:/work/.void/media-trash/trash-1/metadata.json': JSON.stringify({
        id: 'trash-1',
        state: 'trashed',
        originalPath: 'C:/work/media/generated/scene.png',
        trashPath: 'C:/work/.void/media-trash/trash-1/scene.png',
        fileName: 'scene.png',
        kind: 'image',
        source: 'generated',
        deletedAt: 1000,
      }),
    }, ['C:/work/.void/media-trash/trash-1/scene.png', 'C:/work/media/generated/scene.png']);
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.restoreItems('C:/work', ['trash-1']);

    expect(result.status).toBe('ready');
    expect(adapter.renameFile).toHaveBeenCalledWith(
      'C:/work/.void/media-trash/trash-1/scene.png',
      'C:/work/media/generated/scene-restored-1.png'
    );
    expect(adapter.deleteDirectory).toHaveBeenCalledWith('C:/work/.void/media-trash/trash-1', true);
  });

  it('permanently purges selected and expired trash records', async () => {
    const adapter = createMutableAdapter({
      'C:/work/.void/media-trash': [
        node('C:/work/.void/media-trash/trash-old', { name: 'trash-old', isDirectory: true }),
        node('C:/work/.void/media-trash/trash-new', { name: 'trash-new', isDirectory: true }),
      ],
      'C:/work/.void/media-trash/trash-old': [node('C:/work/.void/media-trash/trash-old/metadata.json')],
      'C:/work/.void/media-trash/trash-new': [node('C:/work/.void/media-trash/trash-new/metadata.json')],
    }, {
      'C:/work/.void/media-trash/trash-old/metadata.json': JSON.stringify({
        id: 'trash-old',
        state: 'trashed',
        originalPath: 'C:/work/media/generated/old.png',
        trashPath: 'C:/work/.void/media-trash/trash-old/old.png',
        fileName: 'old.png',
        kind: 'image',
        source: 'generated',
        deletedAt: 0,
      }),
      'C:/work/.void/media-trash/trash-new/metadata.json': JSON.stringify({
        id: 'trash-new',
        state: 'trashed',
        originalPath: 'C:/work/media/generated/new.png',
        trashPath: 'C:/work/.void/media-trash/trash-new/new.png',
        fileName: 'new.png',
        kind: 'image',
        source: 'generated',
        deletedAt: 9 * 24 * 60 * 60 * 1000,
      }),
    });
    const service = createWorkspaceMediaLibraryService(adapter);

    await service.purgeItems('C:/work', ['trash-new']);
    await service.purgeExpiredTrash('C:/work', 8 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000);

    expect(adapter.deleteDirectory).toHaveBeenCalledWith('C:/work/.void/media-trash/trash-new', true);
    expect(adapter.deleteDirectory).toHaveBeenCalledWith('C:/work/.void/media-trash/trash-old', true);
  });

  it('rejects delete selections outside the active workspace', async () => {
    const adapter = createMutableAdapter({}, {}, ['C:/other/media/generated/escape.png']);
    const service = createWorkspaceMediaLibraryService(adapter);

    const result = await service.deleteItems('C:/work', [{
      id: 'escape',
      filePath: 'C:/other/media/generated/escape.png',
      kind: 'image',
      source: 'generated',
    }], 1000);

    expect(result.status).toBe('error');
    expect(adapter.renameFile).not.toHaveBeenCalled();
  });
});
