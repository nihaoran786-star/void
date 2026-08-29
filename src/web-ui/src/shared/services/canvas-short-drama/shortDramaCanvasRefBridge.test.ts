import { describe, expect, it } from 'vitest';

import type { ShortDramaMediaReference } from '@/shared/services/short-drama/ShortDramaTypes';
import {
  canRefineShortDramaArtifactOnCanvas,
  wasShortDramaArtifactRefinedOnCanvas,
} from './shortDramaCanvasPredicates';
import {
  toCanvasMediaRef,
  toShortDramaMediaItemId,
  toShortDramaMediaReference,
  toShortDramaRelativePath,
} from './shortDramaCanvasRefBridge';

const WORKSPACE = 'C:/projects/demo';

function media(overrides: Partial<ShortDramaMediaReference> = {}): ShortDramaMediaReference {
  return {
    mediaItemId: 'media-1',
    kind: 'image',
    relativePath: 'media/generated/batch-1/item-1.png',
    // Redundant mirrors that must never be used as a fallback.
    localPath: 'C:/projects/demo/media/generated/batch-1/item-1.png',
    filePath: 'C:/projects/demo/media/generated/batch-1/item-1.png',
    thumbnailUrl: 'asset://localhost/thumb.png',
    previewUrl: 'asset://localhost/preview.png',
    ...overrides,
  };
}

describe('toCanvasMediaRef', () => {
  it('carries the relative path across untouched', () => {
    expect(toCanvasMediaRef(media(), WORKSPACE)).toEqual({
      workspacePath: WORKSPACE,
      relativePath: 'media/generated/batch-1/item-1.png',
    });
  });

  it('normalises backslashes to the slash style the document already uses', () => {
    expect(toCanvasMediaRef(
      media({ relativePath: 'media\\generated\\batch-1\\item-1.png' }),
      WORKSPACE,
    )).toEqual({
      workspacePath: WORKSPACE,
      relativePath: 'media/generated/batch-1/item-1.png',
    });
  });

  it.each([
    ['a missing relative path', { relativePath: undefined }],
    ['a blank relative path', { relativePath: '   ' }],
    ['a traversal segment', { relativePath: '../../etc/passwd' }],
    ['a traversal segment in the middle', { relativePath: 'media/../../secret.png' }],
    ['a POSIX absolute path', { relativePath: '/media/generated/item.png' }],
    ['a drive-letter absolute path', { relativePath: 'C:/media/generated/item.png' }],
    ['a UNC path', { relativePath: '//host/share/item.png' }],
    ['an asset URL', { relativePath: 'asset://localhost/item.png' }],
  ])('refuses %s rather than repairing it', (_label, overrides) => {
    expect(toCanvasMediaRef(media(overrides), WORKSPACE)).toBeNull();
  });

  it('never falls back to localPath or filePath when relativePath is unusable', () => {
    expect(toCanvasMediaRef(media({ relativePath: '' }), WORKSPACE)).toBeNull();
  });

  it('refuses video and audio: the board refines pictures', () => {
    expect(toCanvasMediaRef(media({ kind: 'video' }), WORKSPACE)).toBeNull();
    expect(toCanvasMediaRef(media({ kind: 'audio' }), WORKSPACE)).toBeNull();
  });

  it('refuses a missing asset or a blank workspace', () => {
    expect(toCanvasMediaRef(undefined, WORKSPACE)).toBeNull();
    expect(toCanvasMediaRef(media(), '   ')).toBeNull();
  });
});

describe('toShortDramaRelativePath', () => {
  it('returns the relative path when the workspaces are the same place', () => {
    expect(toShortDramaRelativePath(
      { workspacePath: 'C:\\projects\\demo\\', relativePath: 'media/generated/a.png' },
      WORKSPACE,
    )).toBe('media/generated/a.png');
  });

  it('refuses a card that points at another workspace', () => {
    expect(toShortDramaRelativePath(
      { workspacePath: 'C:/projects/other', relativePath: 'media/generated/a.png' },
      WORKSPACE,
    )).toBeNull();
  });

  it.each([
    ['nothing at all', undefined],
    ['a card with no picture', { workspacePath: WORKSPACE }],
    ['a traversal segment', { workspacePath: WORKSPACE, relativePath: '../a.png' }],
    ['an absolute path', { workspacePath: WORKSPACE, relativePath: '/a.png' }],
    ['a card with no workspace', { relativePath: 'media/generated/a.png' }],
  ])('refuses %s', (_label, mediaRef) => {
    expect(toShortDramaRelativePath(mediaRef, WORKSPACE)).toBeNull();
  });
});

describe('canRefineShortDramaArtifactOnCanvas', () => {
  it.each([
    ['character', 'character'],
    ['location', 'location'],
    ['storyboard', 'storyboard'],
  ] as const)('lets a %s asset with a picture go to the board', (_label, type) => {
    expect(canRefineShortDramaArtifactOnCanvas({
      type,
      mediaReference: media(),
    })).toBe(true);
  });

  it('keeps the entry away from an asset that has no picture yet', () => {
    expect(canRefineShortDramaArtifactOnCanvas({
      type: 'character',
      mediaReference: undefined,
    })).toBe(false);
  });

  it.each([
    ['video', 'video'],
    ['audio', 'audio'],
  ] as const)('keeps the entry away from a %s asset', (_label, kind) => {
    expect(canRefineShortDramaArtifactOnCanvas({
      type: 'storyboard',
      mediaReference: media({ kind }),
    })).toBe(false);
  });

  it('keeps the entry away from an asset type the board cannot own', () => {
    expect(canRefineShortDramaArtifactOnCanvas({
      type: 'video',
      mediaReference: media(),
    })).toBe(false);
  });
});

describe('canvas picture -> short drama media reference', () => {
  it('reuses the identity the media job already stamped into the path', () => {
    expect(toShortDramaMediaItemId('media/generated/batch-9/image-3.png'))
      .toBe('batch-9-3');
  });

  it('names a picture no job produced after its own path, and says so', () => {
    expect(toShortDramaMediaItemId('media/input/hand-drawn.png'))
      .toBe('canvas-refine:media/input/hand-drawn.png');
  });

  it('builds a reference short drama can actually draw', () => {
    const reference = toShortDramaMediaReference(
      { workspacePath: WORKSPACE, relativePath: 'media/generated/batch-1/item-1.png' },
      WORKSPACE,
      'local',
      { timestamp: 42 },
    );

    expect(reference).toEqual({
      mediaItemId: 'batch-1-1',
      kind: 'image',
      relativePath: 'media/generated/batch-1/item-1.png',
      localPath: `${WORKSPACE}/media/generated/batch-1/item-1.png`,
      filePath: `${WORKSPACE}/media/generated/batch-1/item-1.png`,
      modifiedAt: 42,
      source: 'generated',
    });
  });

  it.each([
    ['a foreign workspace', { workspacePath: 'D:/other', relativePath: 'media/a.png' }],
    ['a traversal', { workspacePath: WORKSPACE, relativePath: '../a.png' }],
    ['an absolute path', { workspacePath: WORKSPACE, relativePath: 'C:/a.png' }],
    ['a blank path', { workspacePath: WORKSPACE, relativePath: '   ' }],
    ['something that is not a picture', { workspacePath: WORKSPACE, relativePath: 'media/generated/b/clip-1.mp4' }],
  ])('refuses %s', (_label, mediaRef) => {
    expect(toShortDramaMediaReference(mediaRef, WORKSPACE)).toBeNull();
  });
});

describe('does this asset hold a picture that came back from the board?', () => {
  const revision = (overrides: Record<string, unknown> = {}) => ({
    id: 'r',
    version: 1,
    createdAt: 0,
    summary: 'Something happened.',
    ...overrides,
  });

  it('says yes when the newest revision names a card', () => {
    expect(wasShortDramaArtifactRefinedOnCanvas({
      revisions: [revision(), revision({ id: 'r2', sourceCanvasNodeId: 'node-7' })],
    })).toBe(true);
  });

  it('says no once a later revision came from somewhere else', () => {
    expect(wasShortDramaArtifactRefinedOnCanvas({
      revisions: [revision({ id: 'r1', sourceCanvasNodeId: 'node-7' }), revision({ id: 'r2' })],
    })).toBe(false);
  });

  it('says no for a project written before the board could write anything', () => {
    expect(wasShortDramaArtifactRefinedOnCanvas({ revisions: [revision()] })).toBe(false);
    expect(wasShortDramaArtifactRefinedOnCanvas({ revisions: [] })).toBe(false);
  });
});
