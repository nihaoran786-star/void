import { describe, expect, it } from 'vitest';

import {
  createShortDramaMainAITools,
  createShortDramaStageWorkspaces,
  createShortDramaStaticProject,
  optimizeShortDramaFocusedArtifact,
} from './index';

describe('ShortDramaArtifactOptimizationWorkflow', () => {
  it('optimizes the focused workspace artifact through revision history', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      activeArtifactIdOrHandle: 'EP01-VID01',
      panelState: 'open',
    }).find(item => item.stage === 'video')!;

    const result = optimizeShortDramaFocusedArtifact(project, workspace, {
      userInstruction: '这个镜头节奏太快，改成更慢的推轨并保持宫廷冷色调。',
      reason: 'User requested a slower motion pass for the focused video artifact.',
      timestamp: 789,
      source: 'mainAI',
      markDownstream: true,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-artifact-optimization',
      artifactId: 'episode-01-video-01',
      revisionId: 'revision-episode-01-video-01-789',
      workspace: expect.objectContaining({
        stage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactId: 'episode-01-video-01',
        activeArtifactHandle: 'EP01-VID01',
        activeMedia: {
          artifactHandle: 'EP01-VID01',
          mediaKind: 'video',
          mediaStatus: 'ready',
          mediaItemId: 'media-video-01',
          previewAvailable: true,
          playable: true,
        },
        lastFocusSource: 'mainAI',
      }),
      impact: expect.objectContaining({
        status: 'ready',
        changedArtifactId: 'episode-01-video-01',
      }),
    }));
    const nextProject = result.status === 'ready' ? result.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      status: 'revising',
      revisionCount: 2,
      attemptCount: 2,
      prompt: expect.objectContaining({
        positive: '这个镜头节奏太快，改成更慢的推轨并保持宫廷冷色调。',
      }),
    }));
  });

  it('keeps an empty media confirmation slot focused after optimizing a missing post final', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'post',
      activeArtifactIdOrHandle: 'EP03-POST01',
      panelState: 'open',
    }).find(item => item.stage === 'post')!;

    const result = optimizeShortDramaFocusedArtifact(project, workspace, {
      userInstruction: '第三集后期成片还没有，先保留空置位并重写成片生成提示。',
      reason: 'User wants the post agent to prepare the missing final preview.',
      timestamp: 1301,
      source: 'stageAgent',
      markDownstream: true,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-artifact-optimization',
      artifactId: 'episode-03-post-placeholder',
      revisionId: 'revision-episode-03-post-placeholder-1301',
      workspace: expect.objectContaining({
        stage: 'post',
        activeEpisodeId: 'episode-03',
        activeArtifactHandle: 'EP03-POST01',
        activeMedia: {
          artifactHandle: 'EP03-POST01',
          mediaKind: 'video',
          mediaStatus: 'empty',
          mediaItemId: undefined,
          previewAvailable: false,
          playable: false,
        },
        lastFocusSource: 'stageAgent',
      }),
    }));
  });

  it('returns an explicit error when the workspace has no focused artifact', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      panelState: 'open',
    }).find(item => item.stage === 'video')!;

    const result = optimizeShortDramaFocusedArtifact(project, workspace, {
      userInstruction: '优化当前镜头。',
      reason: 'No focus should be treated as an explicit state.',
      source: 'mainAI',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'error',
      source: 'short-drama-artifact-optimization',
      error: expect.objectContaining({
        code: 'artifact_missing',
      }),
    }));
  });

  it('rejects cross-stage focused artifacts before creating prompt revisions', () => {
    const project = createShortDramaStaticProject();
    const workspace = {
      ...createShortDramaStageWorkspaces(project, {
        selectedStage: 'video',
        panelState: 'open',
      }).find(item => item.stage === 'video')!,
      activeArtifactId: 'episode-01-character-guard',
      activeArtifactHandle: 'CHAR-01',
    };

    const result = optimizeShortDramaFocusedArtifact(project, workspace, {
      userInstruction: '把这个镜头变慢。',
      reason: 'Polluted video workspace must not update an asset prompt.',
      timestamp: 1001,
      source: 'stageAgent',
      markDownstream: true,
    });

    expect(result).toEqual({
      status: 'error',
      source: 'short-drama-artifact-optimization',
      error: {
        code: 'stage_mismatch',
        message: 'Focused short drama artifact does not belong to the video workspace.',
      },
    });
    expect(project.artifacts.find(artifact => artifact.id === 'episode-01-character-guard')).toEqual(expect.objectContaining({
      revisionCount: 2,
      attemptCount: 3,
      status: 'ready',
    }));
  });

  it('exposes focused artifact optimization through the main AI facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);
    const focus = tools.focusArtifact('CHAR-01');
    const workspace = focus.status === 'ready' ? focus.workspace : undefined;

    const result = workspace
      ? tools.optimizeFocusedArtifact(workspace, {
          userInstruction: '角色图更成熟，但不要换人。',
          reason: 'User wants to refine the focused character asset.',
          timestamp: 901,
          source: 'mainAI',
          markDownstream: true,
        })
      : undefined;

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-character-guard',
      revisionId: 'revision-episode-01-character-guard-901',
      workspace: expect.objectContaining({
        stage: 'assets',
        activeEpisodeId: undefined,
        activeArtifactHandle: 'CHAR-01',
      }),
    }));
  });

  it('marks transitive downstream artifacts stale when optimizing a reused asset', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);
    const focus = tools.focusArtifact('CHAR-01');
    const workspace = focus.status === 'ready' ? focus.workspace : undefined;

    const result = workspace
      ? tools.optimizeFocusedArtifact(workspace, {
          userInstruction: '角色图统一成更稳定的红袍轮廓。',
          reason: 'User changed a reused character asset that affects storyboard, video, and post.',
          timestamp: 1501,
          source: 'mainAI',
          markDownstream: true,
        })
      : undefined;

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-character-guard',
      impact: expect.objectContaining({
        status: 'ready',
        items: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'episode-01-storyboard-01',
            recommendation: 'regenerate',
          }),
          expect.objectContaining({
            artifactId: 'episode-01-video-01',
            recommendation: 'regenerate',
          }),
          expect.objectContaining({
            artifactId: 'episode-01-post-final',
            recommendation: 'review',
          }),
        ]),
      }),
    }));
    const nextProject = result?.status === 'ready' ? result.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-storyboard-01')).toEqual(expect.objectContaining({
      status: 'stale',
      statusReason: expect.stringContaining('Chai Yong character reference'),
    }));
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      status: 'stale',
      statusReason: expect.stringContaining('downstream dependency'),
    }));
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-post-final')).toEqual(expect.objectContaining({
      status: 'reviewing',
      statusReason: expect.stringContaining('downstream dependency'),
    }));
  });

  it('keeps optimized artifact history explainable through the main AI facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);
    const focus = tools.focusArtifact('EP01-VID01', { panelState: 'pinned' });
    const workspace = focus.status === 'ready' ? focus.workspace : undefined;

    const optimized = workspace
      ? tools.optimizeFocusedArtifact(workspace, {
          userInstruction: '这个视频镜头节奏太快，前 3 秒放慢，保持宫廷冷色。',
          reason: 'Stage video agent refined the focused clip timing.',
          timestamp: 1201,
          source: 'stageAgent',
          markDownstream: true,
        })
      : undefined;
    const nextTools = createShortDramaMainAITools(optimized?.status === 'ready' ? optimized.project : project);
    const explanation = nextTools.explainArtifactChange('EP01-VID01');

    expect(optimized).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-video-01',
      revisionId: 'revision-episode-01-video-01-1201',
      workspace: expect.objectContaining({
        stage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactHandle: 'EP01-VID01',
        panelState: 'pinned',
        lastFocusSource: 'stageAgent',
      }),
      impact: expect.objectContaining({
        status: 'ready',
        changedArtifactId: 'episode-01-video-01',
      }),
    }));
    expect(explanation).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-video-01',
      summary: expect.stringContaining('Stage video agent refined the focused clip timing'),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: 'revision',
          revisionId: 'revision-episode-01-video-01-1201',
          source: 'stageAgent',
          userInstruction: '这个视频镜头节奏太快，前 3 秒放慢，保持宫廷冷色。',
        }),
        expect.objectContaining({
          type: 'attempt',
          attemptId: 'attempt-episode-01-video-01-1201',
          relatedRevisionId: 'revision-episode-01-video-01-1201',
          status: 'created',
        }),
      ]),
    }));
  });
});
