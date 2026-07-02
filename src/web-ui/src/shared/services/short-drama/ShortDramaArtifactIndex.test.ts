import { describe, expect, it } from 'vitest';

import {
  createShortDramaArtifactIndex,
  createShortDramaMediaArtifactIndex,
  createShortDramaSearchIndex,
  createShortDramaScriptSegmentIndex,
  createShortDramaStaticProject,
  listShortDramaMediaArtifacts,
  locateShortDramaArtifact,
  readShortDramaArtifact,
  searchShortDramaIndex,
  searchShortDramaScriptSegments,
  validateShortDramaDerivedIndexIntegrity,
  resolveShortDramaArtifactReference,
  searchShortDramaArtifacts,
} from './index';
import type { ShortDramaProject } from './ShortDramaTypes';

describe('ShortDramaArtifactIndex', () => {
  it('derives human-readable handles without making the index the source of truth', () => {
    const project = createShortDramaStaticProject();

    const index = createShortDramaArtifactIndex(project);

    expect(index.find(entry => entry.id === 'episode-01-character-guard')).toEqual(expect.objectContaining({
      handle: 'CHAR-01',
      artifactType: 'character',
      stage: 'assets',
      mediaKind: 'image',
      mediaItemId: 'media-image-hero',
    }));
    expect(index.find(entry => entry.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      handle: 'EP01-VID01',
      artifactType: 'video',
      stage: 'video',
      mediaKind: 'video',
      mediaItemId: 'media-video-01',
    }));
    expect(project.artifacts.find(artifact => artifact.id === 'episode-01-video-01')?.handle).toBeUndefined();
  });

  it('resolves immutable ids, active handles, and previous handles to the same artifact', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      artifacts: createShortDramaStaticProject().artifacts.map(artifact => (
        artifact.id === 'episode-01-video-01'
          ? {
              ...artifact,
              handle: 'EP02-SC01-SH03-VID01',
              previousHandles: ['EP01-SC05-SH02-VID01'],
            }
          : artifact
      )),
    };

    const byId = resolveShortDramaArtifactReference(project, 'episode-01-video-01');
    const byHandle = resolveShortDramaArtifactReference(project, 'EP02-SC01-SH03-VID01');
    const byPreviousHandle = resolveShortDramaArtifactReference(project, 'EP01-SC05-SH02-VID01');

    expect(byId.status === 'ready' ? byId.source : undefined).toBe('id');
    expect(byHandle.status === 'ready' ? byHandle.artifact.id : undefined).toBe('episode-01-video-01');
    expect(byPreviousHandle.status === 'ready' ? byPreviousHandle.source : undefined).toBe('previousHandle');
  });

  it('searches artifacts with structured filters before the main AI reads details', () => {
    const project = createShortDramaStaticProject();

    const result = searchShortDramaArtifacts(project, {
      text: 'video',
      stage: 'video',
      episodeNumber: 1,
      artifactType: 'video',
      status: 'ready',
      limit: 3,
    });

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.results : []).toEqual([
      expect.objectContaining({
        id: 'episode-01-video-01',
        handle: 'EP01-VID01',
        mediaKind: 'video',
      }),
    ]);
  });

  it('searches storyboard and video media by structured scene and shot coordinates', () => {
    const project = createShortDramaStaticProject();

    const storyboard = searchShortDramaArtifacts(project, {
      stage: 'storyboards',
      episodeNumber: 1,
      sceneNumber: 1,
      shotNumber: 1,
      mediaKind: 'image',
      limit: 5,
    });
    const video = searchShortDramaArtifacts(project, {
      stage: 'video',
      episodeNumber: 1,
      sceneNumber: 1,
      shotNumber: 3,
      mediaKind: 'video',
      limit: 5,
    });
    const media = searchShortDramaIndex(project, {
      kind: 'media',
      stage: 'video',
      episodeNumber: 1,
      sceneNumber: 1,
      shotNumber: 3,
      mediaKind: 'video',
      limit: 5,
    });

    expect(storyboard.status).toBe('ready');
    expect(storyboard.status === 'ready' ? storyboard.results : []).toEqual([
      expect.objectContaining({
        id: 'episode-01-storyboard-01',
        sceneNumber: 1,
        shotNumber: 1,
        shotNumbers: [1, 2, 3],
      }),
    ]);
    expect(video.status).toBe('ready');
    expect(video.status === 'ready' ? video.results : []).toEqual([
      expect.objectContaining({
        id: 'episode-01-video-01',
        sceneNumber: 1,
        shotNumber: 1,
        shotNumbers: [1, 2, 3],
      }),
    ]);
    expect(media.status === 'ready' ? media.results.map(entry => entry.sourceId) : []).toEqual([
      'episode-01-video-01',
    ]);
  });

  it('indexes right-panel media artifacts without embedding preview payloads', () => {
    const project = createShortDramaStaticProject();

    const mediaIndex = createShortDramaMediaArtifactIndex(project);

    expect(mediaIndex).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactId: 'episode-01-character-guard',
        artifactHandle: 'CHAR-01',
        stage: 'assets',
        mediaItemId: 'media-image-hero',
        mediaKind: 'image',
        previewAvailable: true,
        playable: false,
      }),
      expect.objectContaining({
        artifactId: 'episode-01-storyboard-01',
        artifactHandle: 'EP01-SB01',
        stage: 'storyboards',
        mediaItemId: 'media-storyboard-01',
        mediaKind: 'image',
        previewAvailable: true,
        playable: false,
      }),
      expect.objectContaining({
        artifactId: 'episode-01-video-01',
        artifactHandle: 'EP01-VID01',
        stage: 'video',
        mediaItemId: 'media-video-01',
        mediaKind: 'video',
        previewAvailable: true,
        playable: true,
        durationMs: 12000,
      }),
      expect.objectContaining({
        artifactId: 'episode-01-post-final',
        artifactHandle: 'EP01-POST01',
        stage: 'post',
        mediaItemId: 'media-post-final-01',
        mediaKind: 'video',
        previewAvailable: true,
        playable: true,
      }),
      expect.objectContaining({
        artifactId: 'episode-02-video-01',
        mediaItemId: 'media-video-missing',
        mediaKind: 'video',
        previewAvailable: false,
        playable: false,
      }),
    ]));
    expect(JSON.stringify(mediaIndex)).not.toContain('data:image/svg+xml');
    expect(JSON.stringify(mediaIndex)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('derives script segments from one markdown document and rebuilds after edits', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第1集',
          '宫门夜雨。',
          '## 第3场 密道',
          '女主发现半封信。',
          '',
          '# Episode 2',
          'Outer palace road at night.',
          '## Scene 4 Street chase',
          'A lantern drops near the wall.',
          '',
          '# EP03',
          'Third episode setup.',
          '',
          '# 04',
          'Pure numeric heading.',
        ].join('\n'),
      },
    };

    const initial = createShortDramaScriptSegmentIndex(project);
    const edited = createShortDramaScriptSegmentIndex({
      ...project,
      scriptDocument: {
        kind: 'markdown',
        content: project.scriptDocument!.content.replace('Outer palace road', 'Cold market road'),
      },
    });

    expect(initial).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'script-segment-episode-01-scene-03',
        handle: 'EP01-SC03',
        episodeNumber: 1,
        sceneNumber: 3,
        headingText: '第3场 密道',
        linkedArtifactIds: expect.arrayContaining(['episode-01-script']),
      }),
      expect.objectContaining({
        id: 'script-segment-episode-02-scene-04',
        handle: 'EP02-SC04',
        episodeNumber: 2,
        sceneNumber: 4,
        summary: expect.stringContaining('A lantern drops'),
      }),
      expect.objectContaining({
        id: 'script-segment-episode-03',
        handle: 'EP03',
        episodeNumber: 3,
      }),
      expect.objectContaining({
        id: 'script-segment-episode-04',
        handle: 'EP04',
        episodeNumber: 4,
      }),
    ]));
    expect(JSON.stringify(initial)).not.toContain('data:image/svg+xml');
    expect(edited.find(segment => segment.episodeNumber === 2)?.summary).toContain('Cold market road');
  });

  it('searches script segments by structured episode, scene, and text filters', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第1集',
          '宫门夜雨。',
          '## 第1场 宫宴',
          'Chai Yong hides the letter.',
          '',
          '# 第2集',
          '城外追逐。',
          '## 第4场 街头',
          'Lantern shadow crosses the cold street wall.',
        ].join('\n'),
      },
    };

    const result = searchShortDramaScriptSegments(project, {
      episodeNumber: 2,
      sceneNumber: 4,
      text: 'cold street',
      limit: 3,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'script-segment-index',
      results: [
        expect.objectContaining({
          handle: 'EP02-SC04',
          headingText: '第4场 街头',
          summary: expect.stringContaining('cold street'),
        }),
      ],
    }));
  });

  it('creates a unified low-context search index across artifacts, media, and script segments', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第2集',
          'Outer palace road at night.',
          '## Scene 4 Street chase',
          'A lantern drops near the cold street wall.',
        ].join('\n'),
      },
    };

    const index = createShortDramaSearchIndex(project);
    const street = searchShortDramaIndex(project, {
      text: 'street',
      episodeNumber: 2,
      limit: 10,
    });
    const playablePost = searchShortDramaIndex(project, {
      stage: 'post',
      hasPlayableMedia: true,
      limit: 5,
    });

    expect(index).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'artifact:episode-02-location-street',
        kind: 'artifact',
        sourceId: 'episode-02-location-street',
        handle: 'LOC-01',
        stage: 'assets',
        episodeNumber: 2,
      }),
      expect.objectContaining({
        id: 'media:episode-02-video-01',
        kind: 'media',
        sourceId: 'episode-02-video-01',
        mediaKind: 'video',
        hasMedia: true,
        hasMediaPreview: false,
      }),
      expect.objectContaining({
        id: 'script:script-segment-episode-02-scene-04',
        kind: 'scriptSegment',
        handle: 'EP02-SC04',
        episodeNumber: 2,
        sceneNumber: 4,
      }),
    ]));
    expect(street.status).toBe('ready');
    expect(street.status === 'ready' ? street.results.map(entry => entry.id) : []).toEqual(expect.arrayContaining([
      'artifact:episode-02-location-street',
      'media:episode-02-video-01',
      'script:script-segment-episode-02-scene-04',
    ]));
    expect(playablePost.status === 'ready' ? playablePost.results.map(entry => entry.sourceId) : []).toEqual([
      'episode-01-post-final',
    ]);
    expect(JSON.stringify(index)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(index)).not.toContain('data:image/svg+xml');
  });

  it('validates derived index integrity without treating the index as the source of truth', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      artifacts: [
        ...base.artifacts,
        {
          id: 'episode-99-orphan-video',
          episodeId: 'episode-99',
          stage: 'video',
          type: 'video',
          title: 'Orphan video',
          summary: 'Video points at a missing episode and broken dependency.',
          agentRole: 'video',
          status: 'ready',
          revisionCount: 0,
          attemptCount: 0,
          attempts: [],
          revisions: [],
          mediaReference: { mediaItemId: 'media-orphan-video', kind: 'video', label: 'Orphan video' },
          dependsOn: ['missing-storyboard'],
        },
      ],
    };

    const integrity = validateShortDramaDerivedIndexIntegrity(project);

    expect(integrity).toEqual(expect.objectContaining({
      status: 'issues',
      source: 'short-drama-derived-index-integrity',
      summary: expect.objectContaining({
        artifactCount: project.artifacts.length,
        mediaCount: 6,
        issueCount: 6,
      }),
      issues: expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'episode_missing',
          artifactId: 'episode-99-orphan-video',
          message: expect.stringContaining('episode-99'),
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'dependency_missing',
          artifactId: 'episode-99-orphan-video',
          relatedId: 'missing-storyboard',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'media_preview_missing',
          artifactId: 'episode-02-video-01',
          relatedId: 'media-video-missing',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'media_playback_missing',
          artifactId: 'episode-02-video-01',
          relatedId: 'media-video-missing',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'media_preview_missing',
          artifactId: 'episode-99-orphan-video',
          relatedId: 'media-orphan-video',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'media_playback_missing',
          artifactId: 'episode-99-orphan-video',
          relatedId: 'media-orphan-video',
        }),
      ]),
    }));
    expect(JSON.stringify(integrity)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(integrity)).not.toContain('data:image/svg+xml');
  });

  it('searches media artifacts with preview and playback filters', () => {
    const project = createShortDramaStaticProject();

    const playableVideos = searchShortDramaArtifacts(project, {
      mediaKind: 'video',
      hasPlayableMedia: true,
      limit: 10,
    });
    const previewableImages = searchShortDramaArtifacts(project, {
      mediaKind: 'image',
      hasMediaPreview: true,
      limit: 10,
    });

    expect(playableVideos.status).toBe('ready');
    expect(playableVideos.status === 'ready' ? playableVideos.results.map(result => result.id) : []).toEqual([
      'episode-01-video-01',
      'episode-01-post-final',
    ]);
    expect(previewableImages.status).toBe('ready');
    expect(previewableImages.status === 'ready' ? previewableImages.results.map(result => result.id) : []).toEqual([
      'episode-01-character-guard',
      'episode-01-storyboard-01',
    ]);
  });

  it('searches and lists media by stable media item id', () => {
    const project = createShortDramaStaticProject();

    const artifactSearch = searchShortDramaArtifacts(project, {
      mediaItemId: 'media-post-final-01',
      limit: 10,
    });
    const mediaSearch = listShortDramaMediaArtifacts(project, {
      mediaItemId: 'media-post-final-01',
      includeEmpty: true,
      limit: 10,
    });

    expect(artifactSearch).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'artifact-index',
      results: [
        expect.objectContaining({
          id: 'episode-01-post-final',
          handle: 'EP01-POST01',
          mediaItemId: 'media-post-final-01',
        }),
      ],
    }));
    expect(mediaSearch).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'media-artifact-index',
      results: [
        expect.objectContaining({
          artifactId: 'episode-01-post-final',
          artifactHandle: 'EP01-POST01',
          mediaItemId: 'media-post-final-01',
          playable: true,
        }),
      ],
    }));
  });

  it('reads artifact details with explicit context omissions and media metadata opt-in', () => {
    const project = createShortDramaStaticProject();

    const thin = readShortDramaArtifact(project, {
      idOrHandle: 'EP01-VID01',
      tokenBudget: 8,
    });
    const withMedia = readShortDramaArtifact(project, {
      idOrHandle: 'EP01-VID01',
      includeMediaMetadata: true,
      includeRevisionSummary: true,
    });

    expect(thin.status).toBe('ready');
    expect(thin.status === 'ready' ? thin.summary.endsWith('...') : undefined).toBe(true);
    expect(thin.status === 'ready' ? thin.omittedContext : []).toEqual(expect.arrayContaining([
      'summaryOverflow',
      'revisionSummary',
      'mediaMetadata',
    ]));
    expect(withMedia.status === 'ready' ? withMedia.media : undefined).toEqual({
      mediaItemId: 'media-video-01',
      kind: 'video',
      label: 'Video clip',
      previewAvailable: true,
      thumbnailAvailable: true,
      playable: true,
      durationMs: 12000,
      source: 'artifact-reference',
    });
    expect(JSON.stringify(withMedia)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(withMedia.status === 'ready' ? withMedia.revisionSummary : []).toEqual(['v1: Approved 12 second clip.']);
  });

  it('marks empty media confirmation metadata as omitted unless explicitly requested', () => {
    const project = createShortDramaStaticProject();

    const thin = readShortDramaArtifact(project, {
      idOrHandle: 'EP03-POST01',
      tokenBudget: 16,
    });
    const withMedia = readShortDramaArtifact(project, {
      idOrHandle: 'EP03-POST01',
      includeMediaMetadata: true,
      tokenBudget: 16,
    });

    expect(thin).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'artifact-index',
      artifactId: 'episode-03-post-placeholder',
      media: undefined,
      omittedContext: expect.arrayContaining(['mediaMetadata']),
    }));
    expect(withMedia.status === 'ready' ? withMedia.media : undefined).toEqual({
      mediaItemId: undefined,
      kind: 'video',
      label: 'Episode 03 post placeholder',
      mediaStatus: 'empty',
      previewAvailable: false,
      thumbnailAvailable: false,
      playable: false,
      durationMs: undefined,
      source: 'media-inventory',
    });
  });

  it('locates an artifact for the right panel without asking UI to infer stage or episode', () => {
    const project = createShortDramaStaticProject();

    const location = locateShortDramaArtifact(project, 'EP01-VID01');

    expect(location).toEqual({
      status: 'ready',
      source: 'artifact-index',
      artifactId: 'episode-01-video-01',
      handle: 'EP01-VID01',
      stage: 'video',
      episodeId: 'episode-01',
      scrollTargetId: 'short-drama-artifact-episode-01-video-01',
    });
  });

  it('reports handle conflicts explicitly instead of choosing a random artifact', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      artifacts: base.artifacts.map(artifact => (
        artifact.id === 'episode-01-video-01' || artifact.id === 'episode-02-video-01'
          ? { ...artifact, handle: 'EP01-DUPLICATE' }
          : artifact
      )),
    };

    const result = resolveShortDramaArtifactReference(project, 'EP01-DUPLICATE');

    expect(result.status).toBe('conflict');
    expect(result.status === 'conflict' ? result.error.code : undefined).toBe('handle_conflict');
    expect(result.status === 'conflict' ? result.matches.map(match => match.id).sort() : []).toEqual([
      'episode-01-video-01',
      'episode-02-video-01',
    ]);
  });
});
