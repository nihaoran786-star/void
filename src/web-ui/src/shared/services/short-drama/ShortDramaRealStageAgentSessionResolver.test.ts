import { describe, expect, it } from 'vitest';

import {
  createShortDramaStageAgentContext,
  createShortDramaStageWorkspaces,
  createShortDramaStaticProject,
  getShortDramaNativeStageAgentName,
  resolveShortDramaRealStageAgentSession,
} from './index';

describe('ShortDramaRealStageAgentSessionResolver', () => {
  it('keeps the native stage agent name mapping centralized', () => {
    expect(getShortDramaNativeStageAgentName('script')).toBe('ScriptAI');
    expect(getShortDramaNativeStageAgentName('assets')).toBe('AssetAI');
    expect(getShortDramaNativeStageAgentName('storyboards')).toBe('SplitAI');
    expect(getShortDramaNativeStageAgentName('video')).toBe('VideoAI');
    expect(getShortDramaNativeStageAgentName('post')).toBe('EditorAI');
  });

  it('prefers an exact artifact subagent session binding when present', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'video',
      activeArtifactIdOrHandle: 'EP01-VID01',
      sessions: [
        {
          childSessionId: 'subagent-video-episode-01',
          parentSessionId: 'parent-main-session',
          subagentType: 'VideoAI',
          title: 'VideoAI: Test VideoAI',
          lastActiveAt: 20,
        },
        {
          childSessionId: 'other-video-session',
          parentSessionId: 'parent-main-session',
          subagentType: 'VideoAI',
          title: 'VideoAI: Older',
          lastActiveAt: 10,
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      childSessionId: 'subagent-video-episode-01',
      parentSessionId: 'parent-main-session',
      matchedBy: 'artifactBinding',
    }));
  });

  it('ignores stale synthetic short-drama stage sessions and binds the latest real native subagent', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'video',
      sessions: [
        {
          childSessionId: 'short-drama-stage-video',
          parentSessionId: 'parent-main-session',
          subagentType: 'VideoAI',
          title: 'Short drama video agent',
          lastActiveAt: 200,
        },
        {
          childSessionId: 'video-real-wake-session',
          parentSessionId: 'live-main-session',
          subagentType: 'VideoAI',
          title: 'VideoAI: Wake VideoAI',
          lastActiveAt: 100,
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      childSessionId: 'video-real-wake-session',
      parentSessionId: 'live-main-session',
      matchedBy: 'recentAgentName',
    }));
  });

  it('does not use static fixture parent-main-session as an implicit parent fallback', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'assets',
      sessions: [
        {
          childSessionId: 'asset-old-static-parent',
          parentSessionId: 'parent-main-session',
          subagentType: 'AssetAI',
          title: 'AssetAI: stale',
          lastActiveAt: 20,
        },
        {
          childSessionId: 'asset-live-dispatch',
          parentSessionId: 'live-main-session',
          subagentType: 'AssetAI',
          title: 'AssetAI: Wake AssetAI',
          lastActiveAt: 40,
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      childSessionId: 'asset-live-dispatch',
      parentSessionId: 'live-main-session',
      matchedBy: 'recentAgentName',
    }));
  });

  it('binds to the real subagent session from the current workspace instead of a newer session from another workspace', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'script',
      workspacePath: 'C:\\current\\workspace',
      sessions: [
        {
          childSessionId: 'script-other-workspace',
          parentSessionId: 'other-main-session',
          subagentType: 'ScriptAI',
          title: 'ScriptAI: other workspace',
          workspacePath: 'C:/other/workspace',
          lastActiveAt: 200,
        },
        {
          childSessionId: 'script-legacy-unscoped',
          parentSessionId: 'legacy-main-session',
          subagentType: 'ScriptAI',
          title: 'ScriptAI: legacy',
          lastActiveAt: 150,
        },
        {
          childSessionId: 'script-current-workspace',
          parentSessionId: 'current-main-session',
          subagentType: 'ScriptAI',
          title: 'ScriptAI: current workspace',
          workspacePath: 'C:/current/workspace',
          lastActiveAt: 10,
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      childSessionId: 'script-current-workspace',
      parentSessionId: 'current-main-session',
      matchedBy: 'recentAgentName',
    }));
  });

  it('prefers the persisted same-workspace stage agent binding over a newer same-agent session', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'script',
      workspacePath: 'C:/workspace/drama',
      stageAgentBindings: [
        {
          stage: 'script',
          agentName: 'ScriptAI',
          childSessionId: 'script-persisted',
          parentSessionId: 'main-persisted',
          workspaceRoot: 'C:/workspace/drama',
          status: 'ready',
          source: 'main_ai_wake',
        },
      ],
      sessions: [
        {
          childSessionId: 'script-newer',
          parentSessionId: 'main-newer',
          subagentType: 'ScriptAI',
          title: 'ScriptAI: newer',
          workspacePath: 'C:/workspace/drama',
          lastActiveAt: 200,
        },
        {
          childSessionId: 'script-persisted',
          parentSessionId: 'main-persisted',
          subagentType: 'ScriptAI',
          title: 'ScriptAI: persisted',
          workspacePath: 'C:/workspace/drama',
          lastActiveAt: 10,
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      childSessionId: 'script-persisted',
      parentSessionId: 'main-persisted',
      matchedBy: 'persistentStageBinding',
    }));
  });

  it('returns pending missing for a stale persisted binding instead of falling back to another session', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'script',
      workspacePath: 'C:/workspace/drama',
      stageAgentBindings: [
        {
          stage: 'script',
          agentName: 'ScriptAI',
          childSessionId: 'script-old',
          parentSessionId: 'main-old',
          workspaceRoot: 'C:/workspace/drama',
          status: 'missing',
          source: 'main_ai_wake',
        },
      ],
      sessions: [
        {
          childSessionId: 'script-other',
          parentSessionId: 'main-other',
          subagentType: 'ScriptAI',
          title: 'ScriptAI: other',
          workspacePath: 'C:/workspace/drama',
          lastActiveAt: 200,
        },
      ],
    });

    expect(result).toEqual({
      status: 'pending',
      source: 'short-drama-real-stage-agent-resolver',
      stage: 'script',
      nativeAgentName: 'ScriptAI',
      reason: 'session_missing',
      bindingStatus: 'missing',
    });
  });

  it('returns pending instead of inventing a short-drama-stage session', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'assets',
      sessions: [],
    });

    expect(result).toEqual({
      status: 'pending',
      source: 'short-drama-real-stage-agent-resolver',
      stage: 'assets',
      nativeAgentName: 'AssetAI',
      reason: 'session_missing',
    });
  });

  it('resolves the stage agent under the current parent session', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'storyboards',
      parentSessionId: 'active-parent',
      sessions: [
        {
          childSessionId: 'split-other-parent',
          parentSessionId: 'other-parent',
          subagentType: 'SplitAI',
          title: 'SplitAI: old',
          lastActiveAt: 100,
        },
        {
          childSessionId: 'split-active-parent',
          parentSessionId: 'active-parent',
          subagentType: 'SplitAI',
          title: 'SplitAI: current',
          lastActiveAt: 1,
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      childSessionId: 'split-active-parent',
      parentSessionId: 'active-parent',
      matchedBy: 'parentSessionAgentName',
    }));
  });

  it('binds five real native subagent sessions to stage workspaces with current focus open requests', () => {
    const project = createShortDramaStaticProject();
    const parentSessionId = 'live-main-session';
    const sessions = [
      { stage: 'script', childSessionId: 'script-live-session', subagentType: 'ScriptAI' },
      { stage: 'assets', childSessionId: 'asset-live-session', subagentType: 'AssetAI' },
      { stage: 'storyboards', childSessionId: 'split-live-session', subagentType: 'SplitAI' },
      { stage: 'video', childSessionId: 'video-live-session', subagentType: 'VideoAI' },
      { stage: 'post', childSessionId: 'editor-live-session', subagentType: 'EditorAI' },
    ].map((session, index) => ({
      childSessionId: session.childSessionId,
      parentSessionId,
      subagentType: session.subagentType,
      title: `${session.subagentType}: Wake ${session.subagentType}`,
      lastActiveAt: 100 + index,
    }));

    const focusByStage = {
      script: undefined,
      assets: 'episode-01-character-guard',
      storyboards: 'episode-01-storyboard-01',
      video: 'episode-01-video-01',
      post: 'episode-01-post-final',
    } as const;

    for (const stage of ['script', 'assets', 'storyboards', 'video', 'post'] as const) {
      const workspace = createShortDramaStageWorkspaces(project, {
        selectedStage: stage,
        activeArtifactIdOrHandle: focusByStage[stage],
        parentSessionId,
        stageAgentSessions: sessions,
      }).find(item => item.stage === stage)!;
      const context = createShortDramaStageAgentContext(workspace, 'C:/workspace');

      expect(workspace.stageAgentSessionResolution).toEqual(expect.objectContaining({
        status: 'ready',
        nativeAgentName: getShortDramaNativeStageAgentName(stage),
        parentSessionId,
        matchedBy: 'parentSessionAgentName',
      }));
      expect(context).toEqual(expect.objectContaining({
        status: 'ready',
        source: 'stage-workspace',
      }));
      if (context.status !== 'ready') {
        throw new Error(`Expected ${stage} context to be ready`);
      }
      expect(context.openRequest).toEqual(expect.objectContaining({
        panelContentType: 'btw-session',
        childSessionId: sessions.find(session => session.subagentType === getShortDramaNativeStageAgentName(stage))?.childSessionId,
        parentSessionId,
        workspacePath: 'C:/workspace',
        agentType: getShortDramaNativeStageAgentName(stage),
        subagentType: getShortDramaNativeStageAgentName(stage),
        duplicateCheckKey: `btw-session-${workspace.specialistSessionId}`,
        targetGroup: 'secondary',
        enableSplitView: true,
      }));
      if (focusByStage[stage]) {
        expect(workspace.activeArtifactId).toBe(focusByStage[stage]);
      }
    }
  });

  it('reports a conflict when multiple same-stage real sessions are equally plausible', () => {
    const project = createShortDramaStaticProject();

    const result = resolveShortDramaRealStageAgentSession({
      project,
      stage: 'post',
      parentSessionId: 'parent-main-session',
      sessions: [
        {
          childSessionId: 'editor-a',
          parentSessionId: 'parent-main-session',
          subagentType: 'EditorAI',
          title: 'EditorAI: A',
        },
        {
          childSessionId: 'editor-b',
          parentSessionId: 'parent-main-session',
          subagentType: 'EditorAI',
          title: 'EditorAI: B',
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'conflict',
      stage: 'post',
      nativeAgentName: 'EditorAI',
      error: {
        code: 'stage_agent_conflict',
        message: 'Multiple real EditorAI sessions match the post workspace.',
      },
    }));
  });
});
