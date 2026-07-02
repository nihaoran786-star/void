import { describe, expect, it } from 'vitest';

import {
  createShortDramaStageWorkspaces,
  createShortDramaStaticProject,
  resolveShortDramaNaturalLanguageTarget,
} from './index';

describe('ShortDramaTargetResolver', () => {
  it('turns a Chinese user-facing media reference into structured search candidates', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaNaturalLanguageTarget(project, {
      text: '第二集街头那张图',
      limit: 4,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-target-resolver',
      query: expect.objectContaining({
        text: '街头',
        stage: 'assets',
        episodeNumber: 2,
        mediaKind: 'image',
        limit: 4,
      }),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'episode-02-location-street',
          handle: 'LOC-01',
        }),
      ]),
    }));
  });

  it('uses the current stage workspace focus when the user says this shot', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      activeArtifactIdOrHandle: 'EP01-VID01',
    }).find(item => item.stage === 'video')!;

    const result = resolveShortDramaNaturalLanguageTarget(project, {
      text: '这个镜头太慢',
      workspace,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-target-resolver',
      query: expect.objectContaining({
        stage: 'video',
        episodeNumber: 1,
        artifactType: 'video',
      }),
      focusedArtifactId: 'episode-01-video-01',
      candidates: [
        expect.objectContaining({
          sourceId: 'episode-01-video-01',
          handle: 'EP01-VID01',
        }),
      ],
    }));
  });

  it('resolves a post-production final preview request to an empty confirmation slot', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaNaturalLanguageTarget(project, {
      text: '第三集后期成片',
      limit: 5,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-target-resolver',
      query: expect.objectContaining({
        stage: 'post',
        episodeNumber: 3,
        mediaKind: 'video',
        includeEmptyMedia: true,
      }),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          kind: 'media',
          sourceId: 'episode-03-post-placeholder',
          handle: 'EP03-POST01',
          mediaKind: 'video',
          mediaStatus: 'empty',
          hasMedia: false,
          hasPlayableMedia: false,
        }),
      ]),
    }));
  });

  it('uses the current stage and episode when the user refers to the current final without an artifact focus', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'post',
      activeEpisodeId: 'episode-03',
    }).find(item => item.stage === 'post')!;

    const result = resolveShortDramaNaturalLanguageTarget(project, {
      text: '当前成片需要重新确认',
      workspace,
      limit: 4,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-target-resolver',
      query: expect.objectContaining({
        stage: 'post',
        episodeNumber: 3,
        mediaKind: 'video',
        includeEmptyMedia: true,
      }),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'episode-03-post-placeholder',
          handle: 'EP03-POST01',
          mediaStatus: 'empty',
        }),
      ]),
    }));
  });

  it('asks for focus context instead of guessing when this has no workspace target', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaNaturalLanguageTarget(project, {
      text: '这个镜头太慢',
    });

    expect(result).toEqual({
      status: 'needs_context',
      source: 'short-drama-target-resolver',
      reason: 'deictic_reference_without_focus',
      query: expect.objectContaining({
        artifactType: 'video',
      }),
    });
  });
});
