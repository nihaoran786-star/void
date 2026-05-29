import { describe, expect, it } from 'vitest';

import { mapWorkspaceMediaTiles, sortWorkspaceMediaTiles } from './WorkspaceMediaTileViewModel';
import type { WorkspaceMediaItem } from '@/shared/services/workspace-media';

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
});
