import { describe, expect, it } from 'vitest';

import {
  createShortDramaImageContextForArtifact,
  createShortDramaImageContextFromMediaReference,
  createShortDramaStaticProject,
  resolveShortDramaImageUnderstandingReference,
} from './index';
import type { ShortDramaProject } from './ShortDramaTypes';

describe('ShortDramaImageContextBridge', () => {
  it('resolves a low-context image understanding reference without raw media paths or URLs', () => {
    const sourceProject = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(artifact => artifact.id === 'episode-01-character-guard'
        ? {
            ...artifact,
            mediaReference: {
              mediaItemId: 'media-image-hero',
              kind: 'image' as const,
              label: 'Hero character still',
              localPath: 'C:/Users/17949/Pictures/short-drama/hero.png',
              filePath: '/mnt/workspace/short-drama/hero.png',
              previewUrl: 'https://cdn.example.com/raw-short-drama-image.png',
              thumbnailUrl: 'data:image/png;base64,raw-thumbnail-bytes',
              source: 'generated' as const,
            },
          }
        : artifact),
    };

    const result = resolveShortDramaImageUnderstandingReference(project, 'CHAR-01');

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-image-context-bridge',
      projectId: 'static_short_drama_001',
      artifactId: 'episode-01-character-guard',
      artifactHandle: 'CHAR-01',
      artifactStage: 'assets',
      mediaItemId: 'media-image-hero',
      kind: 'image',
      promptContext: expect.objectContaining({
        title: expect.any(String),
        summary: expect.any(String),
      }),
    }));
    const payload = JSON.stringify(result);
    expect(payload).not.toContain('https://cdn.example.com/raw-short-drama-image.png');
    expect(payload).not.toContain('raw-thumbnail-bytes');
    expect(payload).not.toContain('C:/Users/17949/Pictures/short-drama/hero.png');
    expect(payload).not.toContain('/mnt/workspace/short-drama/hero.png');
    expect(payload).not.toContain('previewUrl');
    expect(payload).not.toContain('thumbnailUrl');
    expect(payload).not.toContain('localPath');
    expect(payload).not.toContain('filePath');
  });

  it('creates an image context from a project artifact with an explicit local image path', () => {
    const sourceProject = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(artifact => artifact.id === 'episode-01-character-guard'
        ? {
            ...artifact,
            mediaReference: {
              mediaItemId: 'media-image-hero',
              kind: 'image' as const,
              label: 'Hero character still',
              localPath: 'C:/Users/17949/Pictures/short-drama/hero.png',
              previewUrl: 'https://cdn.example.com/raw-short-drama-image.png',
              thumbnailUrl: 'data:image/png;base64,raw-thumbnail-bytes',
              source: 'generated' as const,
            },
          }
        : artifact),
    };

    const result = createShortDramaImageContextForArtifact(project, 'episode-01-character-guard');

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-image-context-bridge',
      artifact: expect.objectContaining({
        id: 'episode-01-character-guard',
        handle: 'CHAR-01',
      }),
      media: expect.objectContaining({
        mediaItemId: 'media-image-hero',
        kind: 'image',
      }),
    }));
    expect(result.status === 'ready' ? result.context : undefined).toEqual(expect.objectContaining({
      type: 'image',
      imagePath: 'C:/Users/17949/Pictures/short-drama/hero.png',
      imageName: 'Hero character still',
      source: 'file',
      isLocal: true,
      mimeType: 'image/png',
      metadata: expect.objectContaining({
        shortDramaImageContextBridge: true,
        projectId: 'static_short_drama_001',
        artifactId: 'episode-01-character-guard',
        artifactHandle: 'CHAR-01',
        mediaItemId: 'media-image-hero',
        rawMediaPayloadsIncluded: false,
      }),
    }));

    const payload = JSON.stringify(result);
    expect(payload).not.toContain('https://cdn.example.com/raw-short-drama-image.png');
    expect(payload).not.toContain('raw-thumbnail-bytes');
    expect(payload).not.toContain('data:image/png');
  });

  it('resolves artifact handles through the short-drama project source of truth', () => {
    const sourceProject = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(artifact => artifact.id === 'episode-01-character-guard'
        ? {
            ...artifact,
            mediaReference: {
              mediaItemId: 'media-image-hero',
              kind: 'image' as const,
              label: 'Relative hero still',
              relativePath: '.void/short-drama/media/hero.webp',
            },
          }
        : artifact),
    };

    const result = createShortDramaImageContextForArtifact(project, 'CHAR-01');

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.context.imagePath : undefined).toBe('.void/short-drama/media/hero.webp');
    expect(result.status === 'ready' ? result.context.mimeType : undefined).toBe('image/webp');
    expect(result.status === 'ready' ? result.context.metadata?.resolvedBy : undefined).toBe('handle');
  });

  it('rejects non-image short-drama media references', () => {
    const sourceProject = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(artifact => artifact.id === 'episode-01-video-01'
        ? {
            ...artifact,
            mediaReference: {
              mediaItemId: 'media-video-01',
              kind: 'video' as const,
              label: 'Episode video',
              localPath: 'C:/Users/17949/Videos/episode-01.mp4',
              previewUrl: '/short-drama-static/final-preview.mp4',
            },
          }
        : artifact),
    };

    const result = createShortDramaImageContextForArtifact(project, 'episode-01-video-01');

    expect(result).toEqual({
      status: 'unsupported',
      source: 'short-drama-image-context-bridge',
      error: {
        code: 'not_image',
        message: 'Short drama media reference is not an image: media-video-01',
      },
    });
  });

  it('rejects image media that only has remote or inline preview references', () => {
    const result = createShortDramaImageContextFromMediaReference({
      mediaItemId: 'media-image-remote-only',
      kind: 'image',
      label: 'Remote-only image',
      previewUrl: 'https://cdn.example.com/raw-short-drama-image.png',
      thumbnailUrl: 'data:image/png;base64,raw-thumbnail-bytes',
    });

    expect(result).toEqual({
      status: 'unsupported',
      source: 'short-drama-image-context-bridge',
      error: {
        code: 'remote_image_url_not_supported',
        message: 'Short drama image media has no analyzable local image path: media-image-remote-only',
      },
    });
    expect(JSON.stringify(result)).not.toContain('raw-thumbnail-bytes');
  });

  it('returns explicit status and error when the artifact cannot be resolved', () => {
    const result = createShortDramaImageContextForArtifact(
      createShortDramaStaticProject(),
      'missing-short-drama-artifact',
    );

    expect(result).toEqual({
      status: 'not_found',
      source: 'short-drama-image-context-bridge',
      error: {
        code: 'artifact_missing',
        message: 'Short drama artifact was not found: missing-short-drama-artifact',
      },
    });
  });
});
