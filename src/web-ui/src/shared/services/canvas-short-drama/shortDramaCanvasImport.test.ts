import { describe, expect, it } from 'vitest';

import type {
  ShortDramaArtifact,
  ShortDramaProject,
} from '@/shared/services/short-drama/ShortDramaTypes';
import {
  resolveShortDramaCanvasGenerationBinding,
  resolveShortDramaCanvasImport,
  resolveShortDramaCanvasOrigin,
  SHORT_DRAMA_CANVAS_GENERATION_LABEL,
} from './shortDramaCanvasImport';
import { shortDramaStageForCanvasKind } from './shortDramaCanvasRefBridge';

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
      origin: { handle: 'CHAR-001', title: 'Lin Xia', status: 'ready' },
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
      .toEqual({ handle: 'CHAR-001', title: 'Lin Xia', status: 'ready' });
  });

  it('follows a rename, because the handle is looked up and never stored', () => {
    expect(resolveShortDramaCanvasOrigin(
      project([artifact({ handle: 'CHAR-007' })]),
      DOMAIN_REF,
    )).toEqual({ handle: 'CHAR-007', title: 'Lin Xia', status: 'ready' });
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
    )).toEqual({ handle: 'CHAR-001', title: 'Lin Xia', status: 'ready' });
  });
});

describe('resolveShortDramaCanvasGenerationBinding (K3 §6.2)', () => {
  it('names the project, the stage and the asset a generation belongs to', () => {
    expect(resolveShortDramaCanvasGenerationBinding(project(), DOMAIN_REF)).toEqual({
      projectId: 'project-1',
      stage: 'assets',
      artifactId: 'artifact-1',
      artifactHandle: 'CHAR-001',
      outputMediaLabel: SHORT_DRAMA_CANVAS_GENERATION_LABEL,
    });
  });

  it('uses the asset\'s own stage rather than a guess from its kind', () => {
    const moved = resolveShortDramaCanvasGenerationBinding(
      project([artifact({ stage: 'storyboards' })]),
      DOMAIN_REF,
    );
    expect(moved?.stage).toBe('storyboards');
  });

  it('falls back to the kind table only when the record carries no stage', () => {
    const kindless = resolveShortDramaCanvasGenerationBinding(
      project([artifact({ stage: undefined as never })]),
      DOMAIN_REF,
    );
    expect(kindless?.stage).toBe('assets');
    const storyboard = resolveShortDramaCanvasGenerationBinding(
      project([artifact({ type: 'storyboard', stage: undefined as never })]),
      { ...DOMAIN_REF, kind: 'storyboard' },
    );
    expect(storyboard?.stage).toBe('storyboards');
  });

  it('refuses coordinates for a missing asset or a mismatched type', () => {
    expect(resolveShortDramaCanvasGenerationBinding(project([]), DOMAIN_REF)).toBeUndefined();
    expect(resolveShortDramaCanvasGenerationBinding(
      project([artifact({ type: 'location' })]),
      DOMAIN_REF,
    )).toBeUndefined();
  });
});

describe('shortDramaStageForCanvasKind', () => {
  it('maps only the three kinds the board knows, and nothing else', () => {
    expect(shortDramaStageForCanvasKind('character')).toBe('assets');
    expect(shortDramaStageForCanvasKind('location')).toBe('assets');
    expect(shortDramaStageForCanvasKind('storyboard')).toBe('storyboards');
    expect(shortDramaStageForCanvasKind('script')).toBeUndefined();
  });
});
