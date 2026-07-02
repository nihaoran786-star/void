import { describe, expect, it } from 'vitest';

import {
  createShortDramaStageAgentContext,
  createShortDramaStageWorkspaces,
  createShortDramaStaticProject,
  getShortDramaStageAgentRole,
  updateShortDramaStageWorkspaceFocus,
} from './index';
import type { ShortDramaProject } from './ShortDramaTypes';

describe('ShortDramaStageWorkspace', () => {
  it('creates page-level specialist workspaces without assigning agents to cards', () => {
    const project = createShortDramaStaticProject();

    const workspaces = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      activeEpisodeId: 'episode-02',
      panelState: 'pinned',
    });

    expect(workspaces.map(workspace => [workspace.stage, workspace.specialistAgentRole])).toEqual([
      ['script', 'director'],
      ['assets', 'asset'],
      ['storyboards', 'storyboard'],
      ['video', 'video'],
      ['post', 'post'],
    ]);
    expect(workspaces.find(workspace => workspace.stage === 'assets')).toEqual(expect.objectContaining({
      activeEpisodeId: undefined,
      panelState: 'collapsed',
    }));
    expect(workspaces.find(workspace => workspace.stage === 'video')).toEqual(expect.objectContaining({
      activeEpisodeId: 'episode-02',
      panelState: 'pinned',
      stageAgentSessionResolution: expect.objectContaining({
        status: 'pending',
        reason: 'session_missing',
      }),
    }));
  });

  it('updates the current focus from an artifact handle for stage-agent context', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, { selectedStage: 'video' })
      .find(item => item.stage === 'video')!;

    const result = updateShortDramaStageWorkspaceFocus(project, workspace, {
      stage: 'video',
      artifactIdOrHandle: 'EP01-VID01',
      source: 'mainAI',
    });

    expect(result).toEqual({
      status: 'ready',
      source: 'stage-workspace',
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
    });
  });

  it('creates selected stage workspace with the current artifact focus for page-level agents', () => {
    const project = createShortDramaStaticProject();

    const videoWorkspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'video',
      activeArtifactIdOrHandle: 'EP01-VID01',
      panelState: 'open',
    }).find(item => item.stage === 'video');
    const assetWorkspace = createShortDramaStageWorkspaces(project, {
      selectedStage: 'assets',
      activeArtifactIdOrHandle: 'CHAR-01',
      panelState: 'open',
    }).find(item => item.stage === 'assets');

    expect(videoWorkspace).toEqual(expect.objectContaining({
      stage: 'video',
      activeEpisodeId: 'episode-01',
      activeArtifactId: 'episode-01-video-01',
      activeArtifactHandle: 'EP01-VID01',
      activeMedia: expect.objectContaining({
        artifactHandle: 'EP01-VID01',
        mediaKind: 'video',
        mediaStatus: 'ready',
        playable: true,
      }),
      panelState: 'open',
    }));
    expect(assetWorkspace).toEqual(expect.objectContaining({
      stage: 'assets',
      activeEpisodeId: undefined,
      activeArtifactId: 'episode-01-character-guard',
      activeArtifactHandle: 'CHAR-01',
      panelState: 'open',
    }));
  });

  it('keeps asset workspace global even when an asset came from a fixture episode', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, { selectedStage: 'assets' })
      .find(item => item.stage === 'assets')!;

    const result = updateShortDramaStageWorkspaceFocus(project, workspace, {
      stage: 'assets',
      artifactIdOrHandle: 'CHAR-01',
      source: 'userClick',
    });

    expect(result.status === 'ready' ? result.workspace : undefined).toEqual(expect.objectContaining({
      stage: 'assets',
      activeEpisodeId: undefined,
      activeArtifactId: 'episode-01-character-guard',
      activeArtifactHandle: 'CHAR-01',
      lastFocusSource: 'userClick',
    }));
  });

  it('reports missing episodes and missing artifact references explicitly', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, { selectedStage: 'storyboards' })
      .find(item => item.stage === 'storyboards')!;

    const missingEpisode = updateShortDramaStageWorkspaceFocus(project, workspace, {
      stage: 'storyboards',
      episodeId: 'episode-99',
      source: 'scroll',
    });
    const missingArtifact = updateShortDramaStageWorkspaceFocus(project, workspace, {
      stage: 'storyboards',
      artifactIdOrHandle: 'EP99-SB99',
      source: 'stageAgent',
    });

    expect(missingEpisode.status).toBe('error');
    expect(missingEpisode.status === 'error' ? missingEpisode.error.code : undefined).toBe('episode_missing');
    expect(missingArtifact.status).toBe('not_found');
  });

  it('rejects artifact focus when the handle belongs to another stage workspace', () => {
    const project = createShortDramaStaticProject();
    const workspace = createShortDramaStageWorkspaces(project, { selectedStage: 'video' })
      .find(item => item.stage === 'video')!;

    const result = updateShortDramaStageWorkspaceFocus(project, workspace, {
      stage: 'video',
      artifactIdOrHandle: 'CHAR-01',
      source: 'stageAgent',
    });

    expect(result).toEqual({
      status: 'error',
      source: 'stage-workspace',
      error: {
        code: 'stage_mismatch',
        message: 'Focused short drama artifact does not belong to the video workspace.',
      },
    });
  });

  it('keeps the stage-to-agent mapping centralized in the workspace service', () => {
    expect(getShortDramaStageAgentRole('script')).toBe('director');
    expect(getShortDramaStageAgentRole('assets')).toBe('asset');
    expect(getShortDramaStageAgentRole('storyboards')).toBe('storyboard');
    expect(getShortDramaStageAgentRole('video')).toBe('video');
    expect(getShortDramaStageAgentRole('post')).toBe('post');
  });

  it('binds real specialist sessions for every stage workspace when they exist in the session store', () => {
    const project = createShortDramaStaticProject();

    const workspaces = createShortDramaStageWorkspaces(project, {
      stageAgentSessions: [
        { childSessionId: 'subagent-director-episode-01', parentSessionId: 'parent-main-session', subagentType: 'ScriptAI' },
        { childSessionId: 'subagent-image-character-guard', parentSessionId: 'parent-main-session', subagentType: 'AssetAI' },
        { childSessionId: 'subagent-storyboard-episode-01', parentSessionId: 'parent-main-session', subagentType: 'SplitAI' },
        { childSessionId: 'subagent-video-episode-01', parentSessionId: 'parent-main-session', subagentType: 'VideoAI' },
        { childSessionId: 'subagent-post-episode-01', parentSessionId: 'parent-main-session', subagentType: 'EditorAI' },
      ],
    });

    expect(workspaces.map(workspace => [workspace.stage, workspace.specialistSessionId])).toEqual([
      ['script', 'subagent-director-episode-01'],
      ['assets', 'subagent-image-character-guard'],
      ['storyboards', 'subagent-storyboard-episode-01'],
      ['video', 'subagent-video-episode-01'],
      ['post', 'subagent-post-episode-01'],
    ]);
    expect(workspaces.every(workspace => workspace.parentSessionId === 'parent-main-session')).toBe(true);
  });

  it('binds all five stage workspaces to the latest real native subagents instead of old short-drama fake sessions', () => {
    const project = createShortDramaStaticProject();

    const workspaces = createShortDramaStageWorkspaces(project, {
      stageAgentSessions: [
        { childSessionId: 'short-drama-stage-script', parentSessionId: 'parent-main-session', subagentType: 'ScriptAI', title: 'Short drama script agent', lastActiveAt: 900 },
        { childSessionId: 'short-drama-stage-assets', parentSessionId: 'parent-main-session', subagentType: 'AssetAI', title: 'Short drama assets agent', lastActiveAt: 900 },
        { childSessionId: 'short-drama-stage-storyboards', parentSessionId: 'parent-main-session', subagentType: 'SplitAI', title: 'Short drama storyboards agent', lastActiveAt: 900 },
        { childSessionId: 'short-drama-stage-video', parentSessionId: 'parent-main-session', subagentType: 'VideoAI', title: 'Short drama video agent', lastActiveAt: 900 },
        { childSessionId: 'short-drama-stage-post', parentSessionId: 'parent-main-session', subagentType: 'EditorAI', title: 'Short drama post agent', lastActiveAt: 900 },
        { childSessionId: 'script-live', parentSessionId: 'live-main', subagentType: 'ScriptAI', title: 'ScriptAI: Wake ScriptAI', lastActiveAt: 100 },
        { childSessionId: 'asset-live', parentSessionId: 'live-main', subagentType: 'AssetAI', title: 'AssetAI: Wake AssetAI', lastActiveAt: 100 },
        { childSessionId: 'split-live', parentSessionId: 'live-main', subagentType: 'SplitAI', title: 'SplitAI: Wake SplitAI', lastActiveAt: 100 },
        { childSessionId: 'video-live', parentSessionId: 'live-main', subagentType: 'VideoAI', title: 'VideoAI: Wake VideoAI', lastActiveAt: 100 },
        { childSessionId: 'editor-live', parentSessionId: 'live-main', subagentType: 'EditorAI', title: 'EditorAI: Wake EditorAI', lastActiveAt: 100 },
      ],
    });

    expect(workspaces.map(workspace => [workspace.stage, workspace.specialistSessionId, workspace.parentSessionId])).toEqual([
      ['script', 'script-live', 'live-main'],
      ['assets', 'asset-live', 'live-main'],
      ['storyboards', 'split-live', 'live-main'],
      ['video', 'video-live', 'live-main'],
      ['post', 'editor-live', 'live-main'],
    ]);
  });

  it('does not create page-level specialist session fallbacks without real sessions', () => {
    const base = createShortDramaStaticProject();
    const project = {
      ...base,
      artifacts: base.artifacts.map(artifact => ({
        ...artifact,
        subagentSessionId: undefined,
        parentToolCallId: undefined,
      })),
    };

    const workspaces = createShortDramaStageWorkspaces(project);

    expect(workspaces.map(workspace => ({
      stage: workspace.stage,
      specialistSessionId: workspace.specialistSessionId,
      parentSessionId: workspace.parentSessionId,
      parentToolCallId: workspace.parentToolCallId,
      resolutionStatus: workspace.stageAgentSessionResolution?.status,
    }))).toEqual([
      {
        stage: 'script',
        specialistSessionId: undefined,
        parentSessionId: undefined,
        parentToolCallId: undefined,
        resolutionStatus: 'pending',
      },
      {
        stage: 'assets',
        specialistSessionId: undefined,
        parentSessionId: undefined,
        parentToolCallId: undefined,
        resolutionStatus: 'pending',
      },
      {
        stage: 'storyboards',
        specialistSessionId: undefined,
        parentSessionId: undefined,
        parentToolCallId: undefined,
        resolutionStatus: 'pending',
      },
      {
        stage: 'video',
        specialistSessionId: undefined,
        parentSessionId: undefined,
        parentToolCallId: undefined,
        resolutionStatus: 'pending',
      },
      {
        stage: 'post',
        specialistSessionId: undefined,
        parentSessionId: undefined,
        parentToolCallId: undefined,
        resolutionStatus: 'pending',
      },
    ]);
  });

  it('creates stage workspaces for a persistent empty short-drama shell', () => {
    const project: ShortDramaProject = {
      projectId: 'empty-short-drama-workspace',
      title: 'AI Short Drama',
      status: 'draft',
      activeStage: 'script',
      episodes: [],
      artifacts: [],
      productionPlan: {
        status: 'pending',
        mode: 'semiAutomatic',
        goal: '',
        episodeRange: '',
        steps: [],
      },
      scriptDocument: {
        kind: 'markdown',
        content: '',
      },
    };

    const workspaces = createShortDramaStageWorkspaces(project, {
      selectedStage: 'script',
      panelState: 'open',
      stageAgentSessions: [
        { childSessionId: 'script-live', parentSessionId: 'main-live', subagentType: 'ScriptAI', title: 'ScriptAI: Wake ScriptAI' },
      ],
    });

    expect(workspaces.map(workspace => workspace.stage)).toEqual([
      'script',
      'assets',
      'storyboards',
      'video',
      'post',
    ]);
    expect(workspaces.find(workspace => workspace.stage === 'script')).toEqual(expect.objectContaining({
      panelState: 'open',
      specialistSessionId: 'script-live',
      parentSessionId: 'main-live',
    }));
    expect(workspaces.find(workspace => workspace.stage === 'assets')).toEqual(expect.objectContaining({
      panelState: 'collapsed',
      stageAgentSessionResolution: expect.objectContaining({ status: 'pending' }),
    }));
  });

  it('creates page-level stage agent context without binding the agent to an artifact card', () => {
    const project = createShortDramaStaticProject();
    const workspace = {
      ...createShortDramaStageWorkspaces(project, { selectedStage: 'video' })
        .find(item => item.stage === 'video')!,
      activeArtifactId: 'episode-01-video-01',
      activeArtifactHandle: 'EP01-VID01',
      specialistSessionId: 'video-real-session',
      parentSessionId: 'main-short-drama-session',
    };

    const context = createShortDramaStageAgentContext(workspace, 'C:/workspace');

    expect(context).toEqual({
      status: 'ready',
      source: 'stage-workspace',
      workspace,
      openRequest: expect.objectContaining({
        childSessionId: 'video-real-session',
        parentSessionId: 'main-short-drama-session',
        workspacePath: 'C:/workspace',
        sessionKind: 'subagent',
        sessionTitle: 'VideoAI · EP01-VID01',
        agentType: 'VideoAI',
        parentToolCallId: undefined,
        subagentType: 'VideoAI',
        duplicateCheckKey: 'btw-session-video-real-session',
        panelContentType: 'btw-session',
        targetGroup: 'secondary',
        enableSplitView: true,
        replaceExisting: true,
      }),
    });
  });

  it('builds a native secondary split tab request for the selected stage agent', () => {
    const project = createShortDramaStaticProject();
    const workspace = {
      ...createShortDramaStageWorkspaces(project, { selectedStage: 'post' })
        .find(item => item.stage === 'post')!,
      activeArtifactHandle: 'EP01-FINAL',
      specialistSessionId: 'editor-real-session',
      parentSessionId: 'main-short-drama-session',
    };

    const context = createShortDramaStageAgentContext(workspace, 'C:/workspace');

    expect(context.status === 'ready' ? context.openRequest : undefined).toEqual(expect.objectContaining({
      childSessionId: 'editor-real-session',
      parentSessionId: 'main-short-drama-session',
      workspacePath: 'C:/workspace',
      sessionKind: 'subagent',
      sessionTitle: 'EditorAI · EP01-FINAL',
      agentType: 'EditorAI',
      subagentType: 'EditorAI',
      duplicateCheckKey: 'btw-session-editor-real-session',
      panelContentType: 'btw-session',
      targetGroup: 'secondary',
      enableSplitView: true,
      replaceExisting: true,
    }));
  });

  it('reports a pending stage agent context when the real child session has no parent main session yet', () => {
    const base = createShortDramaStaticProject();
    const project = {
      ...base,
      artifacts: base.artifacts.map(artifact => ({
        ...artifact,
        parentSessionId: undefined,
        parentToolCallId: undefined,
      })),
    };
    const workspace = {
      ...createShortDramaStageWorkspaces(project, { selectedStage: 'storyboards' })
        .find(item => item.stage === 'storyboards')!,
      specialistSessionId: 'split-real-session',
      parentSessionId: undefined,
    };

    const context = createShortDramaStageAgentContext(workspace);

    expect(context).toEqual({
      status: 'pending',
      source: 'stage-workspace',
      workspace,
      reason: 'parent_missing',
    });
  });
});
