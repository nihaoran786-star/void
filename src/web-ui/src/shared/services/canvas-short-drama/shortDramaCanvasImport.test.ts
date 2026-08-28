import { describe, expect, it } from 'vitest';

import type {
  ShortDramaArtifact,
  ShortDramaProject,
} from '@/shared/services/short-drama/ShortDramaTypes';
import {
  resolveShortDramaCanvasImport,
  resolveShortDramaCanvasOrigin,
} from './shortDramaCanvasImport';

const WORKSPACE = 'C:/projects/demo';
const DOMAIN_REF = {
  moduleId: 'short-drama',
  kind: 'character',
  id: 'artifact-1',
  role: 'refine',
};

function artifact(overrides: Partial<ShortDramaArtifact> = {}): ShortDramaArtifact {
  return {
    id: 'artifact-1',
    handle: 'CHAR-001',
    episodeId: 'episode-1',
    stage: 'assets',
    type: 'character',
    title: 'Lin Xia',
    summary: 'The lead.',
    agentRole: 'asset',
    status: 'ready',
    revisionCount: 0,
    attemptCount: 0,
    revisions: [],
    attempts: [],
    mediaReference: {
      mediaItemId: 'media-1',
      kind: 'image',
      relativePath: 'media/generated/batch-1/lin-xia.png',
      thumbnailUrl: 'asset://localhost/thumb.png',
    },
    ...overrides,
  } as ShortDramaArtifact;
}

function project(artifacts: ShortDramaArtifact[] = [artifact()]): ShortDramaProject {
  return {
    projectId: 'project-1',
    title: 'Demo',
    episodes: [{ id: 'episode-1', number: 1, title: 'Pilot' }],
    artifacts,
  } as unknown as ShortDramaProject;
}

describe('resolveShortDramaCanvasImport', () => {
  it('answers with the asset\'s current picture and its display handle', () => {
    expect(resolveShortDramaCanvasImport(project(), DOMAIN_REF, WORKSPACE)).toEqual({
      status: 'ready',
      mediaRef: {
        workspacePath: WORKSPACE,
        relativePath: 'media/generated/batch-1/lin-xia.png',
      },
      origin: { handle: 'CHAR-001', title: 'Lin Xia' },
    });
  });

  it('refuses an asset that is no longer in the project', () => {
    expect(resolveShortDramaCanvasImport(project([]), DOMAIN_REF, WORKSPACE))
      .toEqual({ status: 'refused', reason: 'asset-missing' });
  });

  it('refuses an id that now belongs to a different asset type', () => {
    // An id can be reused after a delete-and-recreate; a storyboard wearing a
    // character's reference would send a later refinement to the wrong place.
    expect(resolveShortDramaCanvasImport(
      project([artifact({ type: 'storyboard' })]),
      DOMAIN_REF,
      WORKSPACE,
    )).toEqual({ status: 'refused', reason: 'asset-missing' });
  });

  it.each([
    ['no picture at all', undefined],
    ['a picture with no relative path', {
      mediaItemId: 'media-1',
      kind: 'image' as const,
      localPath: 'C:/projects/demo/media/generated/lin-xia.png',
    }],
    ['a video', {
      mediaItemId: 'media-1',
      kind: 'video' as const,
      relativePath: 'media/generated/clip.mp4',
    }],
  ])('refuses an asset with %s', (_label, mediaReference) => {
    expect(resolveShortDramaCanvasImport(
      project([artifact({ mediaReference })]),
      DOMAIN_REF,
      WORKSPACE,
    )).toEqual({ status: 'refused', reason: 'unusable-picture' });
  });
});

describe('resolveShortDramaCanvasOrigin', () => {
  it('finds the handle the badge shows', () => {
    expect(resolveShortDramaCanvasOrigin(project(), DOMAIN_REF))
      .toEqual({ handle: 'CHAR-001', title: 'Lin Xia' });
  });

  it('follows a rename, because the handle is looked up and never stored', () => {
    expect(resolveShortDramaCanvasOrigin(
      project([artifact({ handle: 'CHAR-007' })]),
      DOMAIN_REF,
    )).toEqual({ handle: 'CHAR-007', title: 'Lin Xia' });
  });

  it('answers nothing for an asset that is gone', () => {
    expect(resolveShortDramaCanvasOrigin(project([]), DOMAIN_REF)).toBeUndefined();
  });

  it('still answers for an asset whose picture cannot be used', () => {
    // The badge is about belonging, not about pictures: a card whose asset has
    // lost its picture is still that asset's card.
    expect(resolveShortDramaCanvasOrigin(
      project([artifact({ mediaReference: undefined })]),
      DOMAIN_REF,
    )).toEqual({ handle: 'CHAR-001', title: 'Lin Xia' });
  });
});
