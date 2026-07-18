import { describe, expect, it } from 'vitest';

import {
  filterWorkspaceMediaTiles,
  mapWorkspaceMediaTiles,
  sortWorkspaceMediaTiles,
} from './WorkspaceMediaTileViewModel';
import type { WorkspaceMediaItem, WorkspaceMediaPendingGeneration } from '@/shared/services/workspace-media';

const item = (overrides: Partial<WorkspaceMediaItem>): WorkspaceMediaItem => ({
  id: 'asset',
  kind: 'image',
  source: 'generated',
  filePath: 'C:/work/assets/asset.png',
  relativePath: 'assets/asset.png',
  fileName: 'asset.png',
  extension: 'png',
  sizeBytes: 100,
  modifiedAt: 1000,
  ...overrides,
});

describe('WorkspaceMediaTileViewModel', () => {
  it('keeps local images renderable without a thumbnail or asset preview URL', () => {
    const [tile] = mapWorkspaceMediaTiles([
      item({
        id: 'local-image',
        thumbnailUrl: undefined,
        previewUrl: undefined,
      }),
    ]);

    expect(tile.renderStatus).toBe('ready');
    expect(tile.isPrimaryWallRenderable).toBe(true);
    expect(tile.previewUrl).toBeUndefined();
  });

  it('keeps video and audio renderable with deliberate non-image visuals', () => {
    const tiles = mapWorkspaceMediaTiles([
      item({
        id: 'video',
        kind: 'video',
        fileName: 'clip.mp4',
        relativePath: 'assets/clip.mp4',
        previewUrl: undefined,
      }),
      item({
        id: 'audio',
        kind: 'audio',
        fileName: 'voice.mp3',
        relativePath: 'assets/voice.mp3',
        previewUrl: undefined,
      }),
    ]);

    expect(tiles.map(tile => tile.renderStatus)).toEqual(['ready', 'ready']);
    expect(tiles.map(tile => tile.isPrimaryWallRenderable)).toEqual([true, true]);
    expect(tiles.map(tile => tile.aspectRatio)).toEqual(['16 / 9', '5 / 2']);
  });

  it('projects missing preview sources consistently for image video and audio', () => {
    const unavailableTiles = mapWorkspaceMediaTiles([
      item({ id: 'image-missing', filePath: '', previewUrl: undefined }),
      item({
        id: 'video-missing',
        kind: 'video',
        filePath: '',
        previewUrl: undefined,
      }),
      item({
        id: 'audio-missing',
        kind: 'audio',
        filePath: '',
        previewUrl: undefined,
      }),
    ]);
    const [remoteOnlyTile] = mapWorkspaceMediaTiles([
      item({
        id: 'remote-only',
        filePath: '',
        previewUrl: 'https://example.test/remote.png',
      }),
    ]);

    expect(unavailableTiles.map(tile => tile.renderStatus)).toEqual([
      'unpreviewable',
      'unpreviewable',
      'unpreviewable',
    ]);
    expect(unavailableTiles.map(tile => tile.isPrimaryWallRenderable))
      .toEqual([false, false, false]);
    expect(remoteOnlyTile.renderStatus).toBe('ready');
    expect(remoteOnlyTile.isPrimaryWallRenderable).toBe(true);
  });

  it('derives stable display metadata and aspect ratio fallbacks', () => {
    const [tile] = mapWorkspaceMediaTiles([
      item({
        id: 'portrait',
        width: 900,
        height: 1600,
        thumbnailUrl: 'asset://portrait',
        previewUrl: 'asset://portrait',
      }),
    ]);

    expect(tile.displayName).toBe('asset.png');
    expect(tile.pathLabel).toBe('assets/asset.png');
    expect(tile.aspectRatio).toBe('900 / 1600');
    expect(tile.typeLabel).toBe('IMG');
    expect(tile.source).toBe('generated');
  });

  it('sorts by recent, name, and size without mutating the source array', () => {
    const tiles = mapWorkspaceMediaTiles([
      item({ id: 'b', fileName: 'b.png', thumbnailUrl: 'asset://b', modifiedAt: 1000, sizeBytes: 10 }),
      item({ id: 'a', fileName: 'a.png', thumbnailUrl: 'asset://a', modifiedAt: 3000, sizeBytes: 30 }),
      item({ id: 'c', fileName: 'c.png', thumbnailUrl: 'asset://c', modifiedAt: 2000, sizeBytes: 20 }),
    ]);

    expect(sortWorkspaceMediaTiles(tiles, 'recent').map(tile => tile.id)).toEqual(['a', 'c', 'b']);
    expect(sortWorkspaceMediaTiles(tiles, 'name').map(tile => tile.id)).toEqual(['a', 'b', 'c']);
    expect(sortWorkspaceMediaTiles(tiles, 'size').map(tile => tile.id)).toEqual(['a', 'c', 'b']);
    expect(tiles.map(tile => tile.id)).toEqual(['b', 'a', 'c']);
  });

  it('uses normalized sortAt for recent sorting', () => {
    const tiles = mapWorkspaceMediaTiles([
      item({ id: 'new-file-old-slot', fileName: 'new-file-old-slot.png', modifiedAt: 9000, sortAt: 1000 }),
      item({ id: 'old-file-new-slot', fileName: 'old-file-new-slot.png', modifiedAt: 1000, sortAt: 9000 }),
    ]);

    expect(sortWorkspaceMediaTiles(tiles, 'recent').map(tile => tile.id)).toEqual([
      'old-file-new-slot',
      'new-file-old-slot',
    ]);
  });

  it('maps pending media generations into non-file renderable placeholders', () => {
    const pending: WorkspaceMediaPendingGeneration[] = [
      {
        id: 'workspace-media-pending-batch-1',
        batchId: 'batch',
        itemIndex: 1,
        kind: 'video',
        source: 'generated',
        prompt: 'wide cinematic shot',
        model: 'veo',
        requestedAspectRatio: '21:9',
        placeholderAspectRatio: '21 / 9',
        updatedAt: 4000,
      },
    ];

    const [tile] = mapWorkspaceMediaTiles([], pending);

    expect(tile.renderStatus).toBe('pending');
    expect(tile.isPrimaryWallRenderable).toBe(true);
    expect(tile.kind).toBe('video');
    expect(tile.typeLabel).toBe('VID');
    expect(tile.aspectRatio).toBe('21 / 9');
    expect(tile.filePath).toBe('');
    expect(tile.pending).toMatchObject({
      batchId: 'batch',
      itemIndex: 1,
      requestedAspectRatio: '21:9',
    });
  });

  it('replaces a pending generated slot with its ready file when generated identity matches', () => {
    const pending: WorkspaceMediaPendingGeneration[] = [
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
        updatedAt: 5000,
      },
    ];

    const tiles = mapWorkspaceMediaTiles([
      item({
        id: 'ready-file',
        fileName: 'image-001.png',
        relativePath: 'media/generated/batch/image-001.png',
        generatedIdentity: {
          batchId: 'batch',
          itemIndex: 1,
        },
        modifiedAt: 9000,
        sortAt: 9000,
        width: 1024,
        height: 1024,
      }),
    ], pending);

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      id: 'ready-file',
      stableSlotId: 'workspace-media-slot-batch-1',
      renderStatus: 'ready',
      aspectRatio: '9 / 16',
      sortAt: 5000,
    });
  });

  it('filters explicit render states without changing kind or search behavior', () => {
    const tiles = mapWorkspaceMediaTiles([
      item({ id: 'ready-image', fileName: 'ready.png' }),
      item({
        id: 'unavailable-image',
        filePath: '',
        fileName: 'unavailable.png',
      }),
    ], [{
      id: 'pending-image',
      batchId: 'batch-pending',
      itemIndex: 1,
      kind: 'image',
      source: 'generated',
      requestedAspectRatio: '1:1',
      placeholderAspectRatio: '1 / 1',
    }]);
    const failedTiles = tiles.map(tile => (
      tile.id === 'ready-image'
        ? { ...tile, renderStatus: 'failed' as const }
        : tile
    ));

    expect(filterWorkspaceMediaTiles(failedTiles, {
      filter: 'all',
      query: '',
      status: 'failed',
    }).map(tile => tile.id)).toEqual(['ready-image']);
    expect(filterWorkspaceMediaTiles(failedTiles, {
      filter: 'image',
      query: 'pending',
      status: 'pending',
    }).map(tile => tile.id)).toEqual(['pending-image']);
    expect(filterWorkspaceMediaTiles(failedTiles, {
      filter: 'all',
      query: '',
      status: 'unpreviewable',
    }).map(tile => tile.id)).toEqual(['unavailable-image']);
  });
});
