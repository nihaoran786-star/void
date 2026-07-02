import { describe, expect, it } from 'vitest';

import {
  createShortDramaChangeRequest,
  createShortDramaFocusContextFromWorkspace,
  listShortDramaChangeRequests,
  resolveShortDramaChangeRequest,
} from './ShortDramaChangeRequest';
import {
  createShortDramaStageWorkspaces,
  updateShortDramaStageWorkspaceFocus,
} from './ShortDramaStageWorkspace';
import { createShortDramaStaticProject } from './ShortDramaStaticProject';

describe('ShortDramaChangeRequest', () => {
  it('lets a specialist request upstream changes while preserving the right-panel focus context', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      activeEpisodeId: 'episode-01',
      activeArtifactIdOrHandle: 'EP01-VID01',
      panelState: 'open',
    }).find(item => item.stage === 'video')!;

    const result = createShortDramaChangeRequest(project, {
      actorRole: 'video',
      stage: 'video',
      targetStage: 'storyboards',
      targetArtifactIdOrHandle: 'EP01-SB01',
      reason: 'The storyboard lacks camera movement direction for stable video generation.',
      suggestion: 'Add a slow push-in note and continuity reference before regenerating video.',
      focus: createShortDramaFocusContextFromWorkspace(workspace),
      timestamp: 123,
    });

    expect(result).toEqual({
      status: 'ready',
      source: 'short-drama-change-request',
      request: expect.objectContaining({
        id: 'change-request-storyboards-123',
        sourceStage: 'video',
        targetStage: 'storyboards',
        requestedByRole: 'video',
        targetArtifactId: 'episode-01-storyboard-01',
        targetArtifactHandle: 'EP01-SB01',
        status: 'open',
        focus: expect.objectContaining({
          activeStage: 'video',
          activeEpisodeId: 'episode-01',
          activeArtifactId: 'episode-01-video-01',
          activeArtifactHandle: 'EP01-VID01',
        }),
      }),
    });
  });

  it('derives tool focus context from workspace focus sources instead of UI-private state', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, { selectedStage: 'video' })
      .find(item => item.stage === 'video')!;
    const inputs = [
      { source: 'userClick' as const, artifactIdOrHandle: 'EP01-VID01' },
      { source: 'scroll' as const, episodeId: 'episode-02' },
      { source: 'mainAI' as const, artifactIdOrHandle: 'EP02-VID01' },
      { source: 'stageAgent' as const, artifactIdOrHandle: 'EP01-VID01' },
    ];

    const contexts = inputs.map(input => {
      const result = updateShortDramaStageWorkspaceFocus(project, workspace, {
        stage: 'video',
        ...input,
      });
      return result.status === 'ready'
        ? createShortDramaFocusContextFromWorkspace(result.workspace)
        : result;
    });

    expect(contexts).toEqual([
      expect.objectContaining({
        activeStage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactHandle: 'EP01-VID01',
        activeMediaItemId: 'media-video-01',
        selectionSource: 'userClick',
      }),
      expect.objectContaining({
        activeStage: 'video',
        activeEpisodeId: 'episode-02',
        activeArtifactHandle: undefined,
        activeMediaItemId: undefined,
        selectionSource: 'scroll',
      }),
      expect.objectContaining({
        activeStage: 'video',
        activeEpisodeId: 'episode-02',
        activeArtifactHandle: 'EP02-VID01',
        selectionSource: 'mainAI',
      }),
      expect.objectContaining({
        activeStage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactHandle: 'EP01-VID01',
        activeMediaItemId: 'media-video-01',
        selectionSource: 'stageAgent',
      }),
    ]);
  });

  it('denies direct cross-stage requests that are outside the specialist policy', () => {
    const project = createShortDramaStaticProject();

    const result = createShortDramaChangeRequest(project, {
      actorRole: 'post',
      stage: 'post',
      targetStage: 'post',
      reason: 'Try to self-request post changes.',
      suggestion: 'This should be a direct post update, not a change request.',
    });

    expect(result).toEqual({
      status: 'denied',
      source: 'short-drama-change-request',
      authorization: expect.objectContaining({
        status: 'deny',
        source: 'short-drama-tool-policy',
        stage: 'post',
        capability: 'requestChange',
      }),
    });
  });

  it('rejects target artifacts that belong to a different stage than the request target', () => {
    const project = createShortDramaStaticProject();

    const result = createShortDramaChangeRequest(project, {
      actorRole: 'video',
      stage: 'video',
      targetStage: 'script',
      targetArtifactIdOrHandle: 'EP01-SB01',
      reason: 'Wrong target stage.',
      suggestion: 'This should fail before dispatch.',
    });

    expect(result).toEqual({
      status: 'error',
      source: 'short-drama-change-request',
      error: {
        code: 'stage_mismatch',
        message: 'Change request targets script, but artifact episode-01-storyboard-01 belongs to storyboards.',
      },
    });
  });

  it('lists pending requests for the main AI and assigned stage agents', () => {
    const project = {
      ...createShortDramaStaticProject(),
      changeRequests: [
        createShortDramaChangeRequest(createShortDramaStaticProject(), {
          actorRole: 'video',
          stage: 'video',
          targetStage: 'storyboards',
          targetArtifactIdOrHandle: 'EP01-SB01',
          reason: 'VideoAI needs clearer movement direction.',
          suggestion: 'SplitAI should add a slow push-in note.',
          timestamp: 101,
        }).request!,
        createShortDramaChangeRequest(createShortDramaStaticProject(), {
          actorRole: 'image',
          stage: 'assets',
          targetStage: 'script',
          targetArtifactIdOrHandle: 'episode-01-script',
          reason: 'AssetAI found conflicting costume description.',
          suggestion: 'ScriptAI should clarify robe color before character generation.',
          timestamp: 102,
        }).request!,
        createShortDramaChangeRequest(createShortDramaStaticProject(), {
          actorRole: 'post',
          stage: 'post',
          targetStage: 'video',
          targetArtifactIdOrHandle: 'EP01-VID01',
          reason: 'EditorAI needs a locked video render before subtitles.',
          suggestion: 'VideoAI should regenerate the clip with locked timing.',
          timestamp: 103,
        }).request!,
      ],
    };

    const mainAI = listShortDramaChangeRequests(project, { status: 'open' });
    const splitAI = listShortDramaChangeRequests(project, {
      targetStage: 'storyboards',
      status: 'open',
    });
    const scriptAI = listShortDramaChangeRequests(project, {
      targetStage: 'script',
      status: 'open',
    });
    const videoAI = listShortDramaChangeRequests(project, {
      targetStage: 'video',
      status: 'open',
    });

    expect(mainAI).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-change-request',
      requests: expect.arrayContaining([
        expect.objectContaining({ requestedByRole: 'video', targetStage: 'storyboards' }),
        expect.objectContaining({ requestedByRole: 'image', targetStage: 'script' }),
        expect.objectContaining({ requestedByRole: 'post', targetStage: 'video' }),
      ]),
    }));
    expect(splitAI).toEqual(expect.objectContaining({
      status: 'ready',
      requests: [expect.objectContaining({ targetArtifactHandle: 'EP01-SB01' })],
    }));
    expect(scriptAI).toEqual(expect.objectContaining({
      status: 'ready',
      requests: [expect.objectContaining({ targetStage: 'script' })],
    }));
    expect(videoAI).toEqual(expect.objectContaining({
      status: 'ready',
      requests: [expect.objectContaining({ targetArtifactHandle: 'EP01-VID01' })],
    }));
  });

  it('resolves requests with audit metadata and downstream stale candidates without mutating artifacts', () => {
    const base = createShortDramaStaticProject();
    const request = createShortDramaChangeRequest(base, {
      actorRole: 'video',
      stage: 'video',
      targetStage: 'storyboards',
      targetArtifactIdOrHandle: 'EP01-SB01',
      reason: 'VideoAI needs clearer movement direction.',
      suggestion: 'SplitAI should add a slow push-in note.',
      timestamp: 101,
    });
    const project = {
      ...base,
      changeRequests: request.status === 'ready' ? [request.request] : [],
    };

    const resolved = resolveShortDramaChangeRequest(project, {
      idOrHandle: 'change-request-storyboards-101',
      status: 'resolved',
      resolution: 'SplitAI added a slow push-in note.',
      updatedBy: 'SplitAI',
      timestamp: 202,
    });

    expect(resolved).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-change-request',
      request: expect.objectContaining({
        status: 'resolved',
        resolution: 'SplitAI added a slow push-in note.',
        updatedBy: 'SplitAI',
        updatedAt: 202,
      }),
      audit: expect.objectContaining({
        type: 'changeRequestResolved',
        actor: 'SplitAI',
        targetArtifactId: 'episode-01-storyboard-01',
      }),
      downstreamStaleCandidates: expect.arrayContaining([
        expect.objectContaining({
          artifactId: 'episode-01-video-01',
          recommendedStatus: 'stale',
        }),
      ]),
      project: expect.objectContaining({
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            id: 'episode-01-video-01',
            status: 'ready',
          }),
        ]),
      }),
    }));
  });
});
