import { describe, expect, it } from 'vitest';

import {
  createShortDramaArtifactChatContext,
  createShortDramaArtifactCardViewModel,
  createShortDramaSpecialistContextPackage,
  createShortDramaMediaPreviewViewModel,
  createShortDramaAssetAnchorViewModel,
  createShortDramaEpisodeStageChatContext,
  createShortDramaProjectViewModel,
  createShortDramaRecoveryGuidance,
  createShortDramaProjectWithRecoveredMediaReferences,
  createShortDramaScriptDocumentViewModel,
  readShortDramaManifest,
  selectShortDramaPostFinalPreviewArtifact,
  createShortDramaStageSpecialistContextPackage,
  createShortDramaStageMediaViewModel,
  createShortDramaStageTimelineViewModel,
  createShortDramaStaticProject,
  inferShortDramaAssetAnchorType,
  mapShortDramaSubagentSessionLinked,
  shortDramaEpisodeIdMatches,
} from './ShortDramaProjectViewModel';
import { createShortDramaMediaArtifactIndex, listShortDramaMediaArtifacts } from './ShortDramaArtifactIndex';
import { createShortDramaStageWorkspaces } from './ShortDramaStageWorkspace';
import type { ShortDramaManifestAdapter, ShortDramaProject } from './ShortDramaTypes';
import type { WorkspaceMediaItem } from '../workspace-media';

describe('ShortDramaProjectViewModel', () => {
  it('summarizes stages, episodes, artifacts, and explicit statuses for panel rendering', () => {
    const project = createShortDramaStaticProject();

    const viewModel = createShortDramaProjectViewModel(project, {
      selectedStage: 'video',
      selectedEpisodeId: 'episode-02',
    });

    expect(viewModel.state.status).toBe('ready');
    expect(viewModel.selectedStage).toBe('video');
    expect(viewModel.selectedEpisode?.id).toBe('episode-02');
    expect(viewModel.stageSummaries.map(stage => stage.stage)).toEqual([
      'script',
      'assets',
      'storyboards',
      'video',
      'post',
    ]);
    expect(viewModel.stageSummaries.find(stage => stage.stage === 'video')?.artifactCount).toBe(10);
    expect(viewModel.currentArtifacts.every(artifact => artifact.episodeId === 'episode-02')).toBe(true);
    expect(viewModel.statusSummary.byStatus).toEqual(expect.objectContaining({
      pending: expect.any(Number),
      generating: expect.any(Number),
      ready: expect.any(Number),
      reviewing: expect.any(Number),
      revising: expect.any(Number),
      stale: expect.any(Number),
      error: expect.any(Number),
      unsupported: expect.any(Number),
    }));
    expect(viewModel.productionPlan.mode).toBe('semiAutomatic');
    expect(viewModel.productionPlan.status).toBe('ready');
  });

  it('treats local generated media references as previewable media facts', () => {
    const source = createShortDramaStaticProject();
    const character = source.artifacts.find(artifact => artifact.stage === 'assets' && artifact.type === 'character')!;
    const project: ShortDramaProject = {
      ...source,
      artifacts: source.artifacts.map(artifact => artifact.id === character.id
        ? {
            ...artifact,
            mediaReference: {
              mediaItemId: 'media-local-character',
              kind: 'image',
              label: 'Local character render',
              localPath: 'C:/work/media/generated/character-001.png',
              relativePath: 'media/generated/character-001.png',
              source: 'generated',
            },
          }
        : artifact),
    };

    const entry = createShortDramaMediaArtifactIndex(project)
      .find(item => item.artifactId === character.id);
    const preview = createShortDramaMediaPreviewViewModel(project.artifacts.find(artifact => artifact.id === character.id)!);

    expect(entry).toEqual(expect.objectContaining({
      mediaStatus: 'ready',
      previewAvailable: true,
      mediaItemId: 'media-local-character',
    }));
    expect(preview).toEqual(expect.objectContaining({
      status: 'ready',
      mediaItemId: 'media-local-character',
      localPath: 'C:/work/media/generated/character-001.png',
      source: 'generated',
    }));
  });

  it('recovers missing asset media references from generated workspace media prompts', () => {
    const source = createShortDramaStaticProject();
    const assetArtifacts = [
      {
        id: 'CHAR-001',
        handle: 'CHAR-001',
        displayName: '林晚｜第一集雨夜造型',
        episodeId: 'episode-01',
        stage: 'assets' as const,
        type: 'character' as const,
        title: '林晚｜第一集雨夜造型',
        summary: '林晚拖着进入废弃车站的行李箱。',
        agentRole: 'image' as const,
        status: 'ready' as const,
        revisionCount: 0,
        attemptCount: 0,
        revisions: [],
        attempts: [],
      },
      {
        id: 'LOC-004',
        handle: 'LOC-004',
        displayName: '废弃车站｜雨夜站台',
        episodeId: 'episode-01',
        stage: 'assets' as const,
        type: 'location' as const,
        title: '废弃车站｜雨夜站台',
        summary: '废弃车站站台，夜晚暴雨。',
        agentRole: 'image' as const,
        status: 'ready' as const,
        revisionCount: 0,
        attemptCount: 0,
        revisions: [],
        attempts: [],
      },
      {
        id: 'PROP-005',
        handle: 'PROP-005',
        displayName: '旧戒指｜关键信物',
        episodeId: 'episode-01',
        stage: 'assets' as const,
        type: 'prop' as const,
        title: '旧戒指｜关键信物',
        summary: '一枚旧戒指。',
        agentRole: 'image' as const,
        status: 'ready' as const,
        revisionCount: 0,
        attemptCount: 0,
        revisions: [],
        attempts: [],
      },
    ];
    const project: ShortDramaProject = {
      ...source,
      artifacts: assetArtifacts,
    };
    const mediaItems: WorkspaceMediaItem[] = [
      generatedMediaItem('media-linwan', 'C:/work/media/generated/a/image-001.png', 'media/generated/a/image-001.png', '角色设定图，林晚，中国女性，28-32岁，雨夜氛围，穿深色长风衣，手中攥着一枚旧戒指，身旁有复古行李箱。'),
      generatedMediaItem('media-station', 'C:/work/media/generated/b/image-001.png', 'media/generated/b/image-001.png', '场景设定图，废弃车站站台，夜晚暴雨，铁皮屋顶被雨水敲打，地面积水反光。'),
      generatedMediaItem('media-ring', 'C:/work/media/generated/c/image-001.png', 'media/generated/c/image-001.png', '道具设定图，一枚旧戒指，银色或暗金属质感，边缘有轻微磨损和细小划痕。'),
    ];

    const recovered = createShortDramaProjectWithRecoveredMediaReferences(project, mediaItems);

    expect(recovered.artifacts.find(artifact => artifact.id === 'CHAR-001')?.mediaReference).toEqual(expect.objectContaining({
      mediaItemId: 'media-linwan',
      kind: 'image',
      localPath: 'C:/work/media/generated/a/image-001.png',
      relativePath: 'media/generated/a/image-001.png',
      source: 'generated',
    }));
    expect(recovered.artifacts.find(artifact => artifact.id === 'LOC-004')?.mediaReference?.mediaItemId).toBe('media-station');
    expect(recovered.artifacts.find(artifact => artifact.id === 'PROP-005')?.mediaReference?.mediaItemId).toBe('media-ring');
    expect(createShortDramaAssetAnchorViewModel(recovered).find(category => category.id === 'characters')?.artifacts.map(artifact => artifact.id)).toEqual(['CHAR-001']);
    expect(createShortDramaMediaPreviewViewModel(recovered.artifacts[0])).toEqual(expect.objectContaining({
      status: 'ready',
      mediaItemId: 'media-linwan',
    }));
  });

  it('does not attach location or prop images to character assets that only share story terms', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      artifacts: [{
        id: 'CHAR-001',
        handle: 'CHAR-001',
        displayName: '林舟｜地球黄昏·离别状态',
        episodeId: 'episode-01',
        stage: 'assets',
        type: 'character',
        title: '林舟｜地球黄昏·离别状态',
        summary: '航天员林舟任务出发前身份板。',
        agentRole: 'image',
        status: 'ready',
        revisionCount: 0,
        attemptCount: 0,
        revisions: [],
        attempts: [],
      }],
    };
    const mediaItems: WorkspaceMediaItem[] = [
      generatedMediaItem(
        'media-earth-dusk',
        'C:/work/media/generated/earth/image-001.png',
        'media/generated/earth/image-001.png',
        '写实电影环境资产图，地球黄昏，最后一片麦田正在被沙暴吞没，不要人物。',
      ),
      generatedMediaItem(
        'media-watch-projection',
        'C:/work/media/generated/watch/image-001.png',
        'media/generated/watch/image-001.png',
        '写实科幻电影道具资产图，旧怀表玻璃内浮现成年女性通讯者的低强度轮廓。',
      ),
    ];

    const recovered = createShortDramaProjectWithRecoveredMediaReferences(project, mediaItems);

    expect(recovered.artifacts[0]?.mediaReference).toBeUndefined();
  });

  it('recovers generated storyboard and video media references from workspace media items', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      episodes: [
        { id: 'episode-01', number: 1, title: 'Episode 01', summary: 'Opening episode.' },
      ],
      artifacts: [
        {
          id: 'STORY-E01-S01-001',
          handle: 'SB-E01-001',
          displayName: '分镜01｜雨夜废弃车站林晚归来',
          episodeId: 'E01',
          stage: 'storyboards',
          type: 'storyboard',
          title: '分镜01｜雨夜废弃车站林晚归来',
          summary: '林晚拖着行李箱走入废弃车站站台。',
          agentRole: 'image',
          status: 'reviewing',
          revisionCount: 0,
          attemptCount: 0,
          revisions: [],
          attempts: [],
        },
        {
          id: 'VID-E01-S01-001',
          handle: 'VID-E01-S01-001',
          displayName: '视频01｜雨夜废弃车站林晚归来',
          episodeId: 'E01',
          stage: 'video',
          type: 'video',
          title: '视频01｜雨夜废弃车站林晚归来',
          summary: '由分镜01生成的测试视频：林晚在暴雨夜拖着行李箱走入废弃车站站台。',
          agentRole: 'VideoAI',
          status: 'generating',
          revisionCount: 0,
          attemptCount: 0,
          revisions: [],
          attempts: [],
          sourceStoryboard: 'STORY-E01-S01-001',
        },
        {
          id: 'POST-E01-FINAL-001',
          handle: 'POST-E01-FINAL-001',
          displayName: '成片01｜雨夜重逢',
          episodeId: 'E01',
          stage: 'post',
          type: 'final',
          title: '成片01｜雨夜重逢',
          summary: '第一集雨夜重逢的最终成片。',
          agentRole: 'EditorAI',
          status: 'pending',
          revisionCount: 0,
          attemptCount: 0,
          revisions: [],
          attempts: [],
        },
      ],
    };
    const mediaItems: WorkspaceMediaItem[] = [
      generatedMediaItem(
        'storyboard-media',
        'C:/work/media/generated/media_batch_storyboard/image-001.png',
        'media/generated/media_batch_storyboard/image-001.png',
        '电影级写实短剧分镜图，雨夜废弃车站站台，林晚拖着行李箱走入站台。',
        { kind: 'image', generationRole: 'asset' },
      ),
      generatedMediaItem(
        'video-media',
        'C:/work/media/generated/media_batch_video/video-001.mp4',
        'media/generated/media_batch_video/video-001.mp4',
        '以参考分镜图作为首帧和视觉基准，生成电影级写实短剧图生视频。夜晚暴雨中的废弃车站站台，中国女性林晚拖着复古深色小号行李箱，从画面左侧缓慢走入空旷站台。',
        { kind: 'video', generationRole: 'clip', previewUrl: 'asset://video-preview' },
      ),
      generatedMediaItem(
        'post-media',
        'C:/work/media/generated/media_batch_post/video-001.mp4',
        'media/generated/media_batch_post/video-001.mp4',
        '第一集雨夜重逢最终成片，完成剪辑、字幕、音效和成片结构。',
        { kind: 'video', generationRole: 'final', previewUrl: 'asset://post-preview' },
      ),
    ];

    const recovered = createShortDramaProjectWithRecoveredMediaReferences(project, mediaItems);

    expect(recovered.artifacts.find(artifact => artifact.id === 'STORY-E01-S01-001')?.mediaReference).toEqual(expect.objectContaining({
      mediaItemId: 'storyboard-media',
      kind: 'image',
      localPath: 'C:/work/media/generated/media_batch_storyboard/image-001.png',
    }));
    expect(recovered.artifacts.find(artifact => artifact.id === 'VID-E01-S01-001')?.mediaReference).toEqual(expect.objectContaining({
      mediaItemId: 'video-media',
      kind: 'video',
      localPath: 'C:/work/media/generated/media_batch_video/video-001.mp4',
      previewUrl: 'asset://video-preview',
    }));
    const videoPreview = createShortDramaMediaPreviewViewModel(recovered.artifacts.find(artifact => artifact.id === 'VID-E01-S01-001')!);
    expect(videoPreview).toEqual(expect.objectContaining({
      status: 'ready',
      kind: 'video',
      canPlay: true,
    }));
    const videoMediaIndex = createShortDramaMediaArtifactIndex(recovered, { includeEmpty: true })
      .find(entry => entry.artifactId === 'VID-E01-S01-001');
    expect(videoMediaIndex).toEqual(expect.objectContaining({
      mediaKind: 'video',
      mediaStatus: 'ready',
      playable: true,
    }));
    expect(recovered.artifacts.find(artifact => artifact.id === 'POST-E01-FINAL-001')?.mediaReference).toEqual(expect.objectContaining({
      mediaItemId: 'post-media',
      kind: 'video',
      previewUrl: 'asset://post-preview',
    }));
  });

  it('expresses empty, unsupported, and error states without asking UI to infer them', () => {
    const emptyProject: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      episodes: [],
      artifacts: [],
    };

    expect(createShortDramaProjectViewModel(emptyProject).state).toEqual({
      status: 'empty',
      source: 'static',
      reason: 'no_episodes',
    });
    expect(createShortDramaProjectViewModel(undefined, { source: 'manifest' }).state).toEqual({
      status: 'empty',
      source: 'manifest',
      reason: 'no_project',
    });
    expect(createShortDramaProjectViewModel(undefined, {
      source: 'manifest',
      unsupportedReason: 'remote_workspace',
    }).state).toEqual({
      status: 'unsupported',
      source: 'manifest',
      error: {
        code: 'remote_workspace',
        message: 'Remote short drama manifests are not supported yet.',
      },
    });
    expect(createShortDramaProjectViewModel(undefined, {
      source: 'manifest',
      error: { code: 'version_incompatible', message: 'Manifest version is not supported.' },
    }).state).toEqual({
      status: 'error',
      source: 'manifest',
      error: { code: 'version_incompatible', message: 'Manifest version is not supported.' },
    });
  });

  it('exposes media reference presentation without asking cards to scan workspace media', () => {
    const project = createShortDramaStaticProject();
    const mediaArtifact = project.artifacts.find(item => item.mediaReference?.mediaItemId === 'media-image-hero')!;
    const nonMediaArtifact = project.artifacts.find(item => !item.mediaReference)!;

    expect(createShortDramaArtifactCardViewModel(mediaArtifact).media).toEqual({
      status: 'referenced',
      mediaItemId: 'media-image-hero',
      kind: 'image',
      label: 'Character still',
    });
    expect(createShortDramaArtifactCardViewModel(nonMediaArtifact).media).toEqual({
      status: 'none',
    });
  });

  it('creates media preview state from artifact media refs and optional workspace media lookup', () => {
    const project = createShortDramaStaticProject();
    const imageArtifact = project.artifacts.find(item => item.mediaReference?.mediaItemId === 'media-image-hero')!;
    const missingVideoArtifact = project.artifacts.find(item => item.mediaReference?.mediaItemId === 'media-video-missing')!;
    const nonMediaArtifact = project.artifacts.find(item => !item.mediaReference)!;

    expect(createShortDramaMediaPreviewViewModel(imageArtifact)).toEqual({
      status: 'ready',
      mediaItemId: 'media-image-hero',
      kind: 'image',
      label: 'Character still',
      previewUrl: expect.stringContaining('data:image/svg+xml'),
      thumbnailUrl: expect.stringContaining('data:image/svg+xml'),
      canPlay: false,
    });

    expect(createShortDramaMediaPreviewViewModel(missingVideoArtifact, {
      resolve() {
        return {
          status: 'ready',
          mediaItem: {
            id: 'media-video-missing',
            kind: 'video',
            previewUrl: 'data:video/mp4;base64,AAAA',
            thumbnailUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
            durationMs: 12000,
          },
          previewUrl: 'data:video/mp4;base64,AAAA',
        };
      },
    })).toEqual({
      status: 'ready',
      mediaItemId: 'media-video-missing',
      kind: 'video',
      label: 'Missing clip',
      previewUrl: 'data:video/mp4;base64,AAAA',
      thumbnailUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
      durationMs: 12000,
      canPlay: true,
    });

    expect(createShortDramaMediaPreviewViewModel(missingVideoArtifact)).toEqual(expect.objectContaining({
      status: 'missing',
      mediaItemId: 'media-video-missing',
      kind: 'video',
      canPlay: false,
      error: expect.objectContaining({ code: 'media_missing' }),
    }));

    expect(createShortDramaMediaPreviewViewModel(missingVideoArtifact, {
      resolve() {
        return {
          status: 'unsupported',
          error: { code: 'unsupported_runtime', message: 'Video preview is not supported in this workspace.' },
        };
      },
    })).toEqual({
      status: 'unsupported',
      mediaItemId: 'media-video-missing',
      kind: 'video',
      label: 'Missing clip',
      canPlay: false,
      error: { code: 'unsupported_runtime', message: 'Video preview is not supported in this workspace.' },
    });

    expect(createShortDramaMediaPreviewViewModel(nonMediaArtifact)).toEqual({
      status: 'empty',
    });
  });

  it('creates empty media preview state from media inventory confirmation slots', () => {
    const project = createShortDramaStaticProject();
    const emptyInventory = listShortDramaMediaArtifacts(project, {
      stage: 'video',
      episodeNumber: 3,
      includeEmpty: true,
      mediaStatus: 'empty',
    });
    const placeholder = project.artifacts.find(item => item.id === 'episode-03-video-placeholder')!;
    const emptySlot = emptyInventory.status === 'ready' ? emptyInventory.results[0] : undefined;

    expect(emptySlot).toEqual(expect.objectContaining({
      artifactId: 'episode-03-video-placeholder',
      mediaKind: 'video',
      mediaStatus: 'empty',
    }));
    expect(createShortDramaMediaPreviewViewModel(placeholder, undefined, emptySlot)).toEqual({
      status: 'empty',
      kind: 'video',
      label: 'Episode 03 video placeholder',
    });
  });

  it('selects an empty post video confirmation slot as the final preview fallback', () => {
    const project = createShortDramaStaticProject();
    const mediaEntriesByArtifactId = new Map(createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
      .map(entry => [entry.artifactId, entry]));
    const episodeArtifacts = project.artifacts.filter(artifact => artifact.episodeId === 'episode-03');

    const finalPreviewArtifact = selectShortDramaPostFinalPreviewArtifact(episodeArtifacts, mediaEntriesByArtifactId);

    expect(finalPreviewArtifact?.id).toBe('episode-03-post-placeholder');
    expect(mediaEntriesByArtifactId.get(finalPreviewArtifact!.id)).toEqual(expect.objectContaining({
      mediaKind: 'video',
      mediaStatus: 'empty',
    }));
  });

  it('creates a continuous stage timeline across all episodes instead of paging by selected episode', () => {
    const project = createShortDramaStaticProject();

    const timeline = createShortDramaStageTimelineViewModel(project, 'video');

    expect(timeline.map(section => section.episode.id)).toEqual([
      'episode-01',
      'episode-02',
      'episode-03',
      'episode-04',
      'episode-05',
      'episode-06',
      'episode-07',
      'episode-08',
      'episode-09',
      'episode-10',
    ]);
    expect(timeline[0].artifacts.map(artifact => artifact.id)).toEqual(['episode-01-video-01']);
    expect(timeline[1].artifacts.map(artifact => artifact.id)).toEqual(['episode-02-video-01']);
    expect(timeline[9].artifacts.map(artifact => artifact.id)).toEqual(['episode-10-video-placeholder']);
  });

  it('creates a global asset anchor page grouped by reusable asset type', () => {
    const project = createShortDramaStaticProject();

    const categories = createShortDramaAssetAnchorViewModel(project);

    expect(categories.map(category => category.id)).toEqual(['characters', 'locations', 'props']);
    expect(categories.find(category => category.id === 'characters')?.artifacts.every(artifact => (
      artifact.stage === 'assets' && artifact.type === 'character'
    ))).toBe(true);
    expect(categories.find(category => category.id === 'locations')?.artifacts.every(artifact => (
      artifact.stage === 'assets' && artifact.type === 'location'
    ))).toBe(true);
    expect(categories.find(category => category.id === 'props')?.artifacts.every(artifact => (
      artifact.stage === 'assets' && artifact.type === 'prop'
    ))).toBe(true);
    expect(categories.flatMap(category => category.artifacts).map(artifact => artifact.id).sort()).toEqual(
      project.artifacts
        .filter(artifact => artifact.stage === 'assets' && ['character', 'location', 'prop'].includes(artifact.type))
        .map(artifact => artifact.id)
        .sort(),
    );
    expect(categories.flatMap(category => category.artifacts).some(artifact => artifact.type === 'image')).toBe(false);
    expect(categories.find(category => category.id === 'characters')?.items[0]).toEqual(expect.objectContaining({
      artifact: expect.objectContaining({ id: 'episode-01-character-guard' }),
      usedBy: expect.arrayContaining([
        expect.objectContaining({
          artifactId: 'episode-01-storyboard-01',
          artifactHandle: 'EP01-SB01',
          usageType: 'visual_reference',
        }),
      ]),
    }));
  });

  it('normalizes runtime asset artifactType and handle prefixes into asset categories', async () => {
    const adapter = createMemoryManifestAdapter({
      '.void/short-drama/manifest.json': JSON.stringify({
        manifestVersion: 1,
        projectId: 'runtime-short-drama',
        title: 'Runtime short drama',
        status: 'draft',
        activeStage: 'assets',
        activeEpisodeId: 'episode-01',
        createdAt: 1780848139198,
        updatedAt: 1780848139198,
        episodes: [
          { id: 'episode-01', number: 1, title: '第1集', summary: '雨夜。' },
        ],
        stages: {
          script: { status: 'ready' },
          assets: { status: 'ready' },
        },
      }),
      '.void/short-drama/script.md': '# 第1集\n\n雨夜车站。',
      '.void/short-drama/indexes/artifact-index.json': JSON.stringify([
        {
          id: 'runtime-char-1',
          handle: 'CHAR-001',
          stage: 'assets',
          artifactType: 'character',
          title: '林晚 / 第一集雨夜造型',
          summary: '角色资产。',
          status: 'ready',
        },
        {
          id: 'runtime-loc-1',
          handle: 'LOC-001',
          stage: 'assets',
          type: 'image',
          title: '废弃车站',
          summary: '场景资产。',
          status: 'ready',
        },
        {
          id: 'runtime-prop-1',
          handle: 'PROP-001',
          stage: 'assets',
          title: '旧戒指',
          summary: '道具资产。',
          status: 'ready',
        },
      ]),
    });
    const state = await readShortDramaManifest(adapter, 'runtime-short-drama');
    const project = state.status === 'ready' ? state.project : undefined;

    expect(project).toBeTruthy();
    const categories = createShortDramaAssetAnchorViewModel(project!);

    expect(categories.find(category => category.id === 'characters')?.artifacts.map(item => item.id)).toEqual(['runtime-char-1']);
    expect(categories.find(category => category.id === 'locations')?.artifacts.map(item => item.id)).toEqual(['runtime-loc-1']);
    expect(categories.find(category => category.id === 'props')?.artifacts.map(item => item.id)).toEqual(['runtime-prop-1']);
  });

  it('normalizes legacy runtime artifact types for storyboards, video, and post stages', async () => {
    const adapter = createMemoryManifestAdapter({
      '.void/short-drama/manifest.json': JSON.stringify({
        manifestVersion: 1,
        projectId: 'runtime-short-drama',
        title: 'Runtime short drama',
        status: 'draft',
        activeStage: 'storyboards',
        activeEpisodeId: 'episode-01',
        createdAt: 1780848139198,
        updatedAt: 1780848139198,
        episodes: [
          { id: 'episode-01', number: 1, title: 'Episode 01', summary: 'Runtime episode.' },
        ],
      }),
      '.void/short-drama/indexes/artifact-index.json': JSON.stringify([
        {
          id: 'runtime-storyboard-image',
          handle: 'EP01-SB01',
          stage: 'storyboards',
          type: 'image',
          title: '旧分镜图',
          summary: '旧索引里的 image 类型。',
          status: 'ready',
        },
        {
          id: 'runtime-video-clip',
          handle: 'EP01-VID01',
          stage: 'video',
          type: 'clip',
          title: '旧视频片段',
          summary: '旧索引里的 clip 类型。',
          status: 'ready',
        },
        {
          id: 'runtime-post-final',
          handle: 'EP01-POST01',
          stage: 'post',
          type: 'final_video',
          title: '旧成片',
          summary: '旧索引里的 final_video 类型。',
          status: 'ready',
        },
      ]),
    });

    const state = await readShortDramaManifest(adapter, 'runtime-short-drama');
    const project = state.status === 'ready' ? state.project : undefined;

    expect(project).toBeTruthy();
    expect(project!.artifacts.find(item => item.id === 'runtime-storyboard-image')?.type).toBe('storyboard');
    expect(project!.artifacts.find(item => item.id === 'runtime-video-clip')?.type).toBe('video');
    expect(project!.artifacts.find(item => item.id === 'runtime-post-final')?.type).toBe('final');
    expect(createShortDramaStageTimelineViewModel(project!, 'storyboards')[0].artifacts.map(item => item.id)).toEqual(['runtime-storyboard-image']);
    expect(createShortDramaStageTimelineViewModel(project!, 'video')[0].artifacts.map(item => item.id)).toEqual(['runtime-video-clip']);
    expect(createShortDramaStageTimelineViewModel(project!, 'post')[0].artifacts.map(item => item.id)).toEqual(['runtime-post-final']);
  });

  it('creates shared stage media preview state and filters pending generation targets', () => {
    const project = createShortDramaStaticProject();
    const readyImageArtifact = project.artifacts.find(item => item.mediaReference?.mediaItemId === 'media-image-hero')!;
    const mediaEntriesByArtifactId = new Map(createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
      .map(entry => [entry.artifactId, entry]));

    const assets = createShortDramaStageMediaViewModel(project, 'assets', {
      mediaEntriesByArtifactId,
      pendingGenerations: [
        {
          id: 'pending-ready-asset',
          batchId: 'batch-ready',
          itemIndex: 1,
          kind: 'image',
          source: 'generated',
          targetStage: 'assets',
          artifactHandle: readyImageArtifact.handle,
          mediaItemId: 'media-image-hero',
          requestedAspectRatio: '1:1',
          placeholderAspectRatio: '1 / 1',
        },
        {
          id: 'pending-storyboard',
          batchId: 'batch-storyboard',
          itemIndex: 1,
          kind: 'image',
          source: 'generated',
          targetStage: 'storyboards',
          artifactHandle: 'EP01-SB01',
          requestedAspectRatio: '1:1',
          placeholderAspectRatio: '1 / 1',
        },
        {
          id: 'pending-asset',
          batchId: 'batch-asset',
          itemIndex: 1,
          kind: 'image',
          source: 'generated',
          targetStage: 'assets',
          artifactHandle: 'CHAR-999',
          requestedAspectRatio: '1:1',
          placeholderAspectRatio: '1 / 1',
        },
        {
          id: 'pending-unscoped-image',
          batchId: 'batch-unscoped',
          itemIndex: 1,
          kind: 'image',
          source: 'generated',
          requestedAspectRatio: '1:1',
          placeholderAspectRatio: '1 / 1',
        },
      ],
    });
    const storyboards = createShortDramaStageMediaViewModel(project, 'storyboards', {
      mediaEntriesByArtifactId,
      pendingGenerations: [
        {
          id: 'pending-storyboard',
          batchId: 'batch-storyboard',
          itemIndex: 1,
          kind: 'image',
          source: 'generated',
          targetStage: 'storyboards',
          artifactHandle: 'EP01-SB01',
          requestedAspectRatio: '1:1',
          placeholderAspectRatio: '1 / 1',
        },
      ],
    });

    expect(assets.pendingGenerations.map(item => item.id)).toEqual(['pending-asset']);
    expect(storyboards.pendingGenerations.map(item => item.id)).toEqual(['pending-storyboard']);
    expect(assets.artifacts.some(item => item.preview.status === 'ready')).toBe(true);
  });

  it('matches episode aliases when grouping generated storyboard artifacts', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      episodes: [
        { id: 'episode-01', number: 1, title: 'Episode 01', summary: 'Opening episode.' },
      ],
      artifacts: [
        {
          id: 'storyboard-e01-001',
          handle: 'SB-E01-001',
          displayName: '分镜01',
          episodeId: 'E01',
          stage: 'storyboards',
          type: 'storyboard',
          title: '分镜01',
          summary: '雨夜归来。',
          agentRole: 'image',
          status: 'ready',
          revisionCount: 0,
          attemptCount: 0,
          revisions: [],
          attempts: [],
          mediaReference: {
            mediaItemId: 'media_batch_storyboard_001-1',
            kind: 'image',
            localPath: 'C:/work/media/generated/storyboard/image-001.png',
            source: 'generated',
          },
        },
        {
          id: 'storyboard-e01-003',
          handle: 'SB-E01-003',
          displayName: '分镜03',
          episodeId: 'E01',
          stage: 'storyboards',
          type: 'storyboard',
          title: '分镜03',
          summary: '只登记了 prompt，还没有生成媒体。',
          agentRole: 'image',
          status: 'pending',
          revisionCount: 0,
          attemptCount: 0,
          revisions: [],
          attempts: [],
        },
      ],
    };

    const timeline = createShortDramaStageTimelineViewModel(project, 'storyboards');
    const mediaTimeline = createShortDramaStageTimelineViewModel(project, 'storyboards', {
      mediaPreviewOnly: true,
      mediaEntriesByArtifactId: new Map(createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
        .map(entry => [entry.artifactId, entry])),
    });
    const stageMedia = createShortDramaStageMediaViewModel(project, 'storyboards', {
      episodeId: 'episode-01',
      mediaEntriesByArtifactId: new Map(createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
        .map(entry => [entry.artifactId, entry])),
      pendingGenerations: [
        {
          id: 'pending-stale-storyboard',
          batchId: 'tool-call-storyboard-001',
          itemIndex: 1,
          kind: 'image',
          source: 'generated',
          targetStage: 'storyboards',
          artifactHandle: 'SB-E01-001',
          requestedAspectRatio: '16:9',
          placeholderAspectRatio: '16 / 9',
        },
      ],
    });
    const viewModel = createShortDramaProjectViewModel(project, {
      selectedStage: 'storyboards',
      selectedEpisodeId: 'episode-01',
    });

    expect(timeline[0].artifacts.map(artifact => artifact.id)).toEqual(['storyboard-e01-001', 'storyboard-e01-003']);
    expect(mediaTimeline[0].artifacts.map(artifact => artifact.id)).toEqual(['storyboard-e01-001']);
    expect(stageMedia.artifacts.map(item => item.artifact.id)).toEqual(['storyboard-e01-001', 'storyboard-e01-003']);
    expect(stageMedia.artifacts[0].preview.status).toBe('ready');
    expect(stageMedia.pendingGenerations).toEqual([]);
    expect(viewModel.currentArtifacts.map(artifact => artifact.id)).toEqual(['storyboard-e01-001', 'storyboard-e01-003']);
    expect(shortDramaEpisodeIdMatches(project, 'E01', 'episode-01')).toBe(true);
    expect(shortDramaEpisodeIdMatches(project, 'EP02', 'episode-01')).toBe(false);
  });

  it('creates one script markdown document with episode heading anchors', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第1集',
          '宫门夜雨。',
          '',
          '# 第 2 集',
          '灯影追凶。',
          '',
          '# EP03',
          '新增番外。',
          '',
          '# Episode 4',
          'English heading.',
        ].join('\n'),
      },
    };

    const document = createShortDramaScriptDocumentViewModel(project);

    expect(document.content).toContain('# 第1集');
    expect(document.anchors).toEqual([
      { episodeId: 'episode-01', episodeNumber: 1, title: '第1集', lineNumber: 1 },
      { episodeId: 'episode-02', episodeNumber: 2, title: '第 2 集', lineNumber: 4 },
      { episodeId: 'episode-03', episodeNumber: 3, title: 'EP03', lineNumber: 7 },
      { episodeId: 'episode-04', episodeNumber: 4, title: 'Episode 4', lineNumber: 10 },
    ]);
  });

  it('falls back to episode script artifacts when no script document exists', () => {
    const project = createShortDramaStaticProject();

    const document = createShortDramaScriptDocumentViewModel(project);

    expect(document.content).toContain('# 第1集');
    expect(document.content).toContain('# 第2集');
    expect(document.anchors.map(anchor => anchor.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('creates structured recovery guidance for restricted and failed states', () => {
    expect(createShortDramaRecoveryGuidance({
      code: 'remote_workspace',
      message: 'Remote short drama manifests are not supported yet.',
    })).toEqual({
      titleKey: 'shortDrama.recovery.remoteWorkspace.title',
      reasonKey: 'shortDrama.recovery.remoteWorkspace.reason',
      nextActionKey: 'shortDrama.recovery.remoteWorkspace.nextAction',
    });
    expect(createShortDramaRecoveryGuidance({
      code: 'save_failed',
      message: 'Short drama manifest could not be saved.',
    })).toEqual(expect.objectContaining({
      titleKey: 'shortDrama.recovery.saveFailed.title',
      reasonKey: 'shortDrama.recovery.saveFailed.reason',
      nextActionKey: 'shortDrama.recovery.saveFailed.nextAction',
    }));
    expect(createShortDramaRecoveryGuidance({
      code: 'media_missing',
      message: 'Referenced media is missing from the workspace.',
    })).toEqual(expect.objectContaining({
      titleKey: 'shortDrama.recovery.mediaMissing.title',
    }));
    expect(createShortDramaRecoveryGuidance()).toEqual(expect.objectContaining({
      titleKey: 'shortDrama.recovery.noProject.title',
    }));
  });

  it('packages focused context for a specialist agent without leaking unrelated project context', () => {
    const project = createShortDramaStaticProject();

    const context = createShortDramaSpecialistContextPackage(project, 'episode-01-video-01');

    expect(context.status).toBe('ready');
    expect(context.status === 'ready' ? context.context : undefined).toEqual(expect.objectContaining({
      projectId: 'static_short_drama_001',
      artifactId: 'episode-01-video-01',
      activeEpisodeId: 'episode-01',
      activeArtifactId: 'episode-01-video-01',
      stage: 'video',
      agentRole: 'video',
      stageAgentRole: 'video',
      artifactSummary: expect.stringContaining('Shot 01-03 video render'),
      relevantScriptSegments: expect.arrayContaining([
        expect.stringContaining('Episode 01 script polish'),
      ]),
      referencedAssets: expect.arrayContaining([
        expect.stringContaining('Chai Yong character reference'),
      ]),
      includedContext: expect.arrayContaining([
        expect.objectContaining({
          type: 'focus',
          id: 'episode-01-video-01',
        }),
        expect.objectContaining({
          type: 'scriptSegment',
          id: 'script-segment-episode-01',
        }),
      ]),
      omittedContextDetails: expect.arrayContaining([
        expect.objectContaining({
          type: 'raw_media_payloads',
        }),
        expect.objectContaining({
          type: 'unreferenced_assets',
        }),
      ]),
      policyApplied: expect.stringContaining('video/video read(script:segment'),
      upstreamArtifacts: expect.arrayContaining([
        expect.stringContaining('Scene 01 shots 01-03'),
      ]),
      allowedTools: [
        'searchProjectIndex',
        'listMedia',
        'readMediaArtifact',
        'readArtifact',
        'explainMediaArtifactChange',
        'explainArtifactChange',
        'readScriptSegment',
        'updateArtifactPrompt',
        'createAttempt',
        'requestReview',
        'requestGeneration',
      ],
      toolPolicy: expect.objectContaining({
        actorRole: 'video',
        stage: 'video',
        scope: 'stage',
        permissions: expect.arrayContaining([
          expect.objectContaining({
            tool: 'readShortDramaMediaArtifact',
            access: 'allow',
          }),
          expect.objectContaining({
            tool: 'explainShortDramaMediaArtifactChange',
            access: 'allow',
          }),
          expect.objectContaining({
            tool: 'requestShortDramaGeneration',
            access: 'requiresMainAIApproval',
          }),
          expect.objectContaining({
            tool: 'deleteShortDramaArtifact',
            access: 'deny',
          }),
        ]),
      }),
      forbiddenActions: expect.arrayContaining([
        'modify_other_stage_without_main_ai_dispatch',
        'read_full_chat_history',
        'overwrite_prompt_revision_history',
        'delete_artifacts_or_media',
      ]),
    }));
    expect(context.status === 'ready' ? context.context.allowedTools : []).not.toContain('deleteArtifact');
    expect(context.status === 'ready' ? context.context.allowedTools : []).not.toContain('createDispatchPlan');
    expect(context.status === 'ready' ? context.context.relatedArtifactSummaries.join('\n') : '')
      .not.toContain('Episode 02');
  });

  it('includes ScriptAI storyboard reference plans for SplitAI and VideoAI context packages', () => {
    const baseProject = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...baseProject,
      storyboardReferencePlans: [
        {
          id: 'plan-ep01-sc01-sh01',
          episodeId: 'episode-01',
          sceneId: 'SC01',
          shotId: 'SH01',
          scriptSegmentId: 'script-segment-episode-01',
          characterAssetIds: ['episode-01-character-guard'],
          locationAssetIds: [],
          propAssetIds: ['episode-01-prop-letter'],
          requiredBeats: ['guard reveals the sealed letter'],
          visualNotes: ['reference the guard face anchor and the red seal prop'],
        },
      ],
      artifacts: baseProject.artifacts.map(artifact => artifact.id === 'episode-01-video-01'
        ? {
            ...artifact,
            references: {
              scriptSegmentIds: ['script-segment-episode-01'],
              characterAssetIds: ['episode-01-character-guard'],
              propAssetIds: ['episode-01-prop-letter'],
              storyboardArtifactIds: ['episode-01-storyboard-01'],
            },
          }
        : artifact),
    };

    const context = createShortDramaSpecialistContextPackage(project, 'episode-01-video-01');

    expect(context.status).toBe('ready');
    expect(context.status === 'ready' ? context.context.storyboardReferencePlans : []).toEqual(expect.arrayContaining([
      expect.stringContaining('guard reveals the sealed letter'),
    ]));
    expect(context.status === 'ready' ? context.context.includedContext : []).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'storyboardReferencePlan',
        id: 'plan-ep01-sc01-sh01',
      }),
      expect.objectContaining({
        type: 'asset',
        id: 'episode-01-prop-letter',
      }),
    ]));
  });

  it('packages stage workspace context from the active episode when no media card is selected', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      activeEpisodeId: 'episode-02',
      panelState: 'open',
    }).find(item => item.stage === 'video')!;

    const context = createShortDramaStageSpecialistContextPackage(project, workspace);

    expect(context).toEqual(expect.objectContaining({
      status: 'ready',
      context: expect.objectContaining({
        projectId: 'static_short_drama_001',
        artifactId: 'episode-02-video-01',
        episodeId: 'episode-02',
        activeEpisodeId: 'episode-02',
        activeArtifactId: 'episode-02-video-01',
        activeScriptSegmentId: 'script-segment-episode-02',
        stage: 'video',
        agentRole: 'video',
        stageAgentRole: 'video',
        focusContext: {
          activeStage: 'video',
          activeEpisodeId: 'episode-02',
          activeArtifactId: 'episode-02-video-01',
          activeArtifactHandle: 'EP02-VID01',
          activeMediaItemId: 'media-video-missing',
          selectionSource: 'initial',
        },
      }),
    }));
  });

  it('packages markdown script segments for the focused episode instead of only script artifacts', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第1集',
          'Lanterns flare inside the banquet hall.',
          '',
          '# 第2集',
          'The fugitive guard reaches the cold street.',
          '',
          '## 第4场 街头追逐',
          'Lantern shadow crosses the cold street wall while the guard hides the jade token.',
        ].join('\n'),
      },
    };

    const context = createShortDramaSpecialistContextPackage(project, 'episode-02-video-01');

    expect(context.status).toBe('ready');
    expect(context.status === 'ready' ? context.context.relevantScriptSegments : []).toEqual(expect.arrayContaining([
      expect.stringContaining('EP02-SC04'),
      expect.stringContaining('第4场 街头追逐'),
      expect.stringContaining('jade token'),
    ]));
    expect(context.status === 'ready' ? context.context.relevantScriptSegments.join('\n') : '')
      .not.toContain('Lanterns flare inside the banquet hall');
  });

  it('packages focused media confirmation state for a page-level specialist agent', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'post',
      activeArtifactIdOrHandle: 'EP03-POST01',
      panelState: 'open',
    }).find(item => item.stage === 'post')!;

    const context = createShortDramaStageSpecialistContextPackage(project, workspace);

    expect(context).toEqual(expect.objectContaining({
      status: 'ready',
      context: expect.objectContaining({
        artifactId: 'episode-03-post-placeholder',
        activeArtifactId: 'episode-03-post-placeholder',
        activeArtifactHandle: 'EP03-POST01',
        activeEpisodeId: 'episode-03',
        stage: 'post',
        stageAgentRole: 'post',
        focusContext: {
          activeStage: 'post',
          activeEpisodeId: 'episode-03',
          activeArtifactId: 'episode-03-post-placeholder',
          activeArtifactHandle: 'EP03-POST01',
          activeMediaItemId: undefined,
          selectionSource: 'initial',
        },
        focusedMedia: {
          artifactHandle: 'EP03-POST01',
          mediaKind: 'video',
          mediaStatus: 'empty',
          mediaItemId: undefined,
          previewAvailable: false,
          playable: false,
        },
      }),
    }));
  });

  it('rejects polluted stage workspace context when the active artifact belongs to another stage', () => {
    const project = createShortDramaStaticProject();
    const workspace = {
      ...createShortDramaStageWorkspaces(project, { selectedStage: 'video' })
        .find(item => item.stage === 'video')!,
      activeArtifactId: 'episode-01-character-guard',
      activeArtifactHandle: 'CHAR-01',
    };

    const context = createShortDramaStageSpecialistContextPackage(project, workspace);

    expect(context).toEqual({
      status: 'error',
      error: {
        code: 'stage_mismatch',
        message: 'Focused short drama artifact does not belong to the video workspace.',
      },
    });
  });

  it('packages asset specialist context with downstream usage instead of episode paging', () => {
    const project = createShortDramaStaticProject();

    const context = createShortDramaSpecialistContextPackage(project, 'episode-01-character-guard');

    expect(context.status).toBe('ready');
    expect(context.status === 'ready' ? context.context : undefined).toEqual(expect.objectContaining({
      stage: 'assets',
      agentRole: 'image',
      stageAgentRole: 'asset',
      activeEpisodeId: undefined,
      referencedAssets: [],
      downstreamImpactSummary: expect.stringContaining('EP01-SB01'),
      constraints: expect.objectContaining({
        characterConsistency: expect.stringContaining('stable'),
      }),
    }));
  });

  it('uses role-specific read scopes and omitted context for all short-drama specialist agents', () => {
    const project = createShortDramaStaticProject();
    const contexts = [
      createShortDramaSpecialistContextPackage(project, 'episode-01-script'),
      createShortDramaSpecialistContextPackage(project, 'episode-01-character-guard'),
      createShortDramaSpecialistContextPackage(project, 'episode-01-storyboard-01'),
      createShortDramaSpecialistContextPackage(project, 'episode-01-video-01'),
      createShortDramaSpecialistContextPackage(project, 'episode-01-post-final'),
    ].map(context => context.status === 'ready' ? context.context : context);

    expect(contexts).toEqual([
      expect.objectContaining({
        agentRole: 'director',
        stageAgentRole: 'director',
        policyApplied: expect.stringContaining('director/script read(script:full'),
        omittedContextDetails: expect.arrayContaining([
          expect.objectContaining({ type: 'unrelated_stage_media' }),
        ]),
      }),
      expect.objectContaining({
        agentRole: 'image',
        stageAgentRole: 'asset',
        policyApplied: expect.stringContaining('image/assets read(script:episode'),
        omittedContextDetails: expect.arrayContaining([
          expect.objectContaining({ type: 'full_script_document' }),
        ]),
      }),
      expect.objectContaining({
        agentRole: 'image',
        stageAgentRole: 'storyboard',
        policyApplied: expect.stringContaining('image/storyboards read(script:segment'),
        omittedContextDetails: expect.arrayContaining([
          expect.objectContaining({ type: 'unreferenced_assets' }),
        ]),
      }),
      expect.objectContaining({
        agentRole: 'video',
        stageAgentRole: 'video',
        policyApplied: expect.stringContaining('video/video read(script:segment'),
        omittedContextDetails: expect.arrayContaining([
          expect.objectContaining({ type: 'unreferenced_assets' }),
          expect.objectContaining({ type: 'unreferenced_storyboards' }),
        ]),
      }),
      expect.objectContaining({
        agentRole: 'post',
        stageAgentRole: 'post',
        policyApplied: expect.stringContaining('post/post read(script:segment'),
        omittedContextDetails: expect.arrayContaining([
          expect.objectContaining({ type: 'raw_video_payloads' }),
        ]),
      }),
    ]);
  });
});

describe('ShortDramaManifestReader', () => {
  it('loads the runtime flat manifest written by ShortDramaProject tool', async () => {
    const adapter = createMemoryManifestAdapter({
      '.void/short-drama/manifest.json': JSON.stringify({
        activeEpisodeId: 'episode-01',
        activeStage: 'script',
        createdAt: 1780848139198,
        episodes: [
          {
            id: 'episode-01',
            number: 1,
            title: 'Episode 01',
            summary: 'Runtime initialized episode.',
          },
        ],
        manifestVersion: 1,
        projectId: 'short-drama-project',
        source: {
          kind: 'script',
          sourceActor: 'MainAI',
          userInstruction: 'Initialize from script.',
        },
        stages: {
          script: {
            status: 'ready',
          },
        },
        status: 'draft',
        storyboardReferencePlans: [],
        title: '雨夜测试短剧',
        updatedAt: 1780848139198,
        project: {
          artifacts: [
            {
              id: 'CHAR-001',
              handle: 'CHAR-001',
              displayName: '林晚｜第一集雨夜造型',
              episodeId: 'E01',
              stage: 'assets',
              type: 'character',
              title: '林晚｜第一集雨夜造型',
              summary: '角色资产。',
              agentRole: 'image',
              status: 'ready',
              revisionCount: 0,
              attemptCount: 0,
              revisions: [],
              attempts: [],
            },
            {
              id: 'LOC-004',
              handle: 'LOC-004',
              displayName: '废弃车站｜雨夜站台',
              episodeId: 'E01',
              stage: 'assets',
              type: 'location',
              title: '废弃车站｜雨夜站台',
              summary: '场景资产。',
              agentRole: 'image',
              status: 'ready',
              revisionCount: 0,
              attemptCount: 0,
              revisions: [],
              attempts: [],
            },
            {
              id: 'PROP-005',
              handle: 'PROP-005',
              displayName: '旧戒指｜关键信物',
              episodeId: 'E01',
              stage: 'assets',
              type: 'prop',
              title: '旧戒指｜关键信物',
              summary: '道具资产。',
              agentRole: 'image',
              status: 'ready',
              revisionCount: 0,
              attemptCount: 0,
              revisions: [],
              attempts: [],
            },
          ],
        },
      }),
      '.void/short-drama/script.md': '# 第1集\n\n雨夜里，女主收到一封密信。',
      '.void/short-drama/indexes/artifact-index.json': JSON.stringify([
        {
          id: 'episode-01-script',
          handle: 'EP01-SCRIPT01',
          displayName: '第1集 剧本',
          episodeId: 'episode-01',
          stage: 'script',
          type: 'script',
          title: 'Episode 01 script',
          summary: 'Runtime script artifact.',
          agentRole: 'director',
          status: 'pending',
          revisionCount: 0,
          attemptCount: 0,
          revisions: [],
          attempts: [],
        },
      ]),
    });

    const state = await readShortDramaManifest(adapter, 'short-drama-project');

    expect(state.status).toBe('ready');
    expect(state.status === 'ready' ? state.project.title : undefined).toBe('雨夜测试短剧');
    expect(state.status === 'ready' ? state.project.scriptDocument?.content : undefined)
      .toContain('雨夜里，女主收到一封密信。');
    expect(state.status === 'ready' ? state.project.artifacts.map(artifact => artifact.id) : [])
      .toEqual(['episode-01-script', 'CHAR-001', 'LOC-004', 'PROP-005']);
    const categories = state.status === 'ready'
      ? createShortDramaAssetAnchorViewModel(state.project)
      : [];
    expect(categories.find(category => category.id === 'characters')?.artifacts.map(item => item.id)).toEqual(['CHAR-001']);
    expect(categories.find(category => category.id === 'locations')?.artifacts.map(item => item.id)).toEqual(['LOC-004']);
    expect(categories.find(category => category.id === 'props')?.artifacts.map(item => item.id)).toEqual(['PROP-005']);
  });
});

function createMemoryManifestAdapter(files: Record<string, string>): ShortDramaManifestAdapter {
  return {
    kind: 'local',
    async read(key: string) {
      return files[key];
    },
    async write(key: string, value: string) {
      files[key] = value;
    },
  };
}

function generatedMediaItem(
  id: string,
  filePath: string,
  relativePath: string,
  generationPrompt: string,
  overrides: Partial<WorkspaceMediaItem> = {}
): WorkspaceMediaItem {
  const kind = overrides.kind ?? 'image';
  const extension = kind === 'video' ? 'mp4' : 'png';
  return {
    id,
    kind,
    source: 'generated',
    filePath,
    relativePath,
    fileName: filePath.split(/[\\/]/).pop() ?? filePath,
    extension,
    generationPrompt,
    generatedIdentity: {
      batchId: relativePath.split('/')[2] ?? id,
      itemIndex: 1,
    },
    ...overrides,
  };
}

describe('ShortDramaSubagentSessionLinked', () => {
  it('binds a real subagent session from main AI dispatch metadata to the matching artifact', () => {
    const project = createShortDramaStaticProject();

    const result = mapShortDramaSubagentSessionLinked(project, {
      childSessionId: 'video-live-session',
      parentSessionId: 'live-main-session',
      agentType: 'VideoAI',
      shortDrama: {
        projectId: project.projectId,
        stage: 'video',
        activeArtifactHandle: 'EP01-VID01',
        parentToolCallId: 'tool-call-video-01',
        source: 'mainAI-dispatch',
      },
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error('Expected subagent session link to be ready');
    }
    expect(result.artifactId).toBe('episode-01-video-01');
    expect(result.project.artifacts.find(item => item.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      subagentSessionId: 'video-live-session',
      parentSessionId: 'live-main-session',
      parentToolCallId: 'tool-call-video-01',
    }));
  });

  it('falls back to parentToolCallId when dispatch metadata omits the artifact target', () => {
    const project: ShortDramaProject = {
      ...createShortDramaStaticProject(),
      artifacts: createShortDramaStaticProject().artifacts.map(artifact => artifact.id === 'episode-01-storyboard-01'
        ? { ...artifact, parentToolCallId: 'tool-call-storyboard-01' }
        : artifact),
    };

    const result = mapShortDramaSubagentSessionLinked(project, {
      childSessionId: 'split-live-session',
      parentSessionId: 'live-main-session',
      parentToolCallId: 'tool-call-storyboard-01',
      agentType: 'SplitAI',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error('Expected tool call fallback to bind the session');
    }
    expect(result.artifactId).toBe('episode-01-storyboard-01');
    expect(result.project.artifacts.find(item => item.id === 'episode-01-storyboard-01')).toEqual(expect.objectContaining({
      subagentSessionId: 'split-live-session',
      parentSessionId: 'live-main-session',
      parentToolCallId: 'tool-call-storyboard-01',
    }));
  });

  it('ignores dispatch metadata for a different project without mutating the current project', () => {
    const project = createShortDramaStaticProject();

    const result = mapShortDramaSubagentSessionLinked(project, {
      childSessionId: 'asset-other-project-session',
      parentSessionId: 'live-main-session',
      agentType: 'AssetAI',
      shortDrama: {
        projectId: 'other-project',
        stage: 'assets',
        activeArtifactId: 'episode-01-character-guard',
        source: 'mainAI-dispatch',
      },
    });

    expect(result).toEqual({ status: 'ignored', reason: 'no_matching_artifact' });
    expect(project.artifacts.find(item => item.id === 'episode-01-character-guard')?.subagentSessionId)
      .not.toBe('asset-other-project-session');
  });

  it('ignores dispatch metadata when the target artifact belongs to a different stage', () => {
    const project = createShortDramaStaticProject();

    const result = mapShortDramaSubagentSessionLinked(project, {
      childSessionId: 'video-wrong-stage-session',
      parentSessionId: 'live-main-session',
      agentType: 'VideoAI',
      shortDrama: {
        projectId: project.projectId,
        stage: 'video',
        activeArtifactId: 'episode-01-character-guard',
        source: 'mainAI-dispatch',
      },
    });

    expect(result).toEqual({ status: 'ignored', reason: 'no_matching_artifact' });
  });
});

describe('ShortDramaArtifactChatContext', () => {
  it('creates artifact-scope open requests only when an artifact has a subagent session', () => {
    const project = createShortDramaStaticProject();
    const artifact = project.artifacts.find(item => item.subagentSessionId);

    expect(artifact).toBeDefined();
    const context = createShortDramaArtifactChatContext(project, artifact!.id);

    expect(context.status).toBe('ready');
    expect(context.scope).toBe('artifact');
    expect(context.openRequest).toEqual(expect.objectContaining({
      childSessionId: artifact!.subagentSessionId,
      parentSessionId: artifact!.parentSessionId,
      sessionKind: 'subagent',
      subagentType: artifact!.agentRole,
      duplicateCheckKey: `short-drama-subagent:${artifact!.subagentSessionId}`,
    }));
  });

  it('returns pending status when an artifact has no subagent session yet', () => {
    const project = createShortDramaStaticProject();
    const artifact = project.artifacts.find(item => !item.subagentSessionId);

    expect(artifact).toBeDefined();
    const context = createShortDramaArtifactChatContext(project, artifact!.id);

    expect(context).toEqual(expect.objectContaining({
      status: 'pending',
      scope: 'artifact',
      artifactId: artifact!.id,
      episodeId: artifact!.episodeId,
      stage: artifact!.stage,
      agentRole: artifact!.agentRole,
    }));
    expect(context.openRequest).toBeUndefined();
  });

  it('creates episode-stage context for broader intervention', () => {
    const project = createShortDramaStaticProject();

    const context = createShortDramaEpisodeStageChatContext(project, 'episode-01', 'storyboards');

    expect(context.status).toBe('ready');
    expect(context.scope).toBe('episodeStage');
    expect(context.episodeId).toBe('episode-01');
    expect(context.stage).toBe('storyboards');
    expect(context.agentRole).toBe('director');
  });
});

describe('short drama asset anchor reclassification', () => {
  it('matches English category hints as whole words instead of substrings', () => {
    expect(inferShortDramaAssetAnchorType('command deck wide shot')).toBeUndefined();
    expect(inferShortDramaAssetAnchorType('human habitat concept')).toBeUndefined();
    expect(inferShortDramaAssetAnchorType('character portrait sheet')).toBe('character');
  });

  it('moves assets whose text evidence clearly indicates another category', () => {
    const project = createShortDramaStaticProject();
    const misclassified = [
      {
        ...project.artifacts.find(item => item.type === 'character')!,
        id: 'mis-scene-1',
        title: '空间站指挥舱内景',
        summary: '红色警示灯下的未来指挥舱场景',
      },
      {
        ...project.artifacts.find(item => item.type === 'location')!,
        id: 'mis-prop-1',
        title: '金属手提箱',
        summary: '装满信件的旧手提箱道具',
      },
    ];
    const mixed = { ...project, artifacts: [...project.artifacts, ...misclassified] };

    const categories = createShortDramaAssetAnchorViewModel(mixed);

    expect(categories.find(category => category.id === 'locations')?.artifacts.map(item => item.id))
      .toContain('mis-scene-1');
    expect(categories.find(category => category.id === 'props')?.artifacts.map(item => item.id))
      .toContain('mis-prop-1');
    expect(categories.find(category => category.id === 'characters')?.artifacts.map(item => item.id))
      .not.toContain('mis-scene-1');
    expect(categories.find(category => category.id === 'characters')?.artifacts.map(item => item.id))
      .not.toContain('mis-prop-1');
  });

  it('keeps the stored type when the text has no category hint', () => {
    const project = createShortDramaStaticProject();
    const neutral = {
      ...project.artifacts.find(item => item.type === 'character')!,
      id: 'neutral-1',
      title: '远帆号·夜航',
      summary: '第七集使用',
    };
    const mixed = { ...project, artifacts: [...project.artifacts, neutral] };

    const categories = createShortDramaAssetAnchorViewModel(mixed);

    expect(categories.find(category => category.id === 'characters')?.artifacts.map(item => item.id))
      .toContain('neutral-1');
  });
});

describe('short drama media preview version propagation', () => {
  it('refreshes an existing media reference with the workspace modification time', () => {
    const project = createShortDramaStaticProject();
    const artifact = project.artifacts.find(item => item.mediaReference)!;
    const mediaItem: WorkspaceMediaItem = {
      id: artifact.mediaReference!.mediaItemId,
      kind: artifact.mediaReference!.kind,
      source: 'generated',
      filePath: artifact.mediaReference!.localPath ?? 'C:/work/generated.png',
      relativePath: artifact.mediaReference!.relativePath ?? 'media/generated.png',
      fileName: 'generated.png',
      extension: 'png',
      modifiedAt: 42,
      generationPrompt: 'existing short drama artifact',
    };

    const recovered = createShortDramaProjectWithRecoveredMediaReferences(project, [mediaItem]);
    const refreshed = recovered.artifacts.find(item => item.id === artifact.id)!;
    const preview = createShortDramaMediaPreviewViewModel(refreshed);

    expect(refreshed.mediaReference?.modifiedAt).toBe(42);
    expect(preview.status === 'ready' ? preview.modifiedAt : undefined).toBe(42);
  });
});
