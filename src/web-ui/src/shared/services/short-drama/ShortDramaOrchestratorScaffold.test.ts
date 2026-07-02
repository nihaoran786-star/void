import { describe, expect, it } from 'vitest';

import {
  applyShortDramaReviewDecision,
  createShortDramaMainAIDispatchPlan,
  createShortDramaProjectAuditLog,
  createShortDramaStaticProject,
  reviewShortDramaArtifactOutput,
  reviewShortDramaStageOutput,
} from './index';

describe('ShortDramaOrchestratorScaffold', () => {
  it('creates a traceable main AI dispatch plan that references immutable artifact ids', () => {
    const project = createShortDramaStaticProject();

    const dispatch = createShortDramaMainAIDispatchPlan(project, {
      userGoal: '把目前未完成的短剧产物继续往下推进。',
      approved: true,
      parentSessionId: 'main-session-001',
    });

    expect(dispatch).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-orchestrator-scaffold',
      plan: expect.objectContaining({
        projectId: 'static_short_drama_001',
        userGoal: '把目前未完成的短剧产物继续往下推进。',
      }),
    }));
    const tasks = dispatch.status === 'ready' ? dispatch.plan.tasks : [];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: 'assets',
        specialistRole: 'asset',
        targetArtifactIds: expect.arrayContaining(['episode-01-prop-letter']),
        userGoal: '把目前未完成的短剧产物继续往下推进。',
        requiresApproval: false,
        contextPackage: expect.objectContaining({
          source: 'short-drama-orchestrator-scaffold',
          projectId: 'static_short_drama_001',
          stage: 'assets',
          artifactCount: expect.any(Number),
          targetHandles: expect.arrayContaining(['PROP-01']),
          omittedSections: expect.arrayContaining(['rawMediaPayloads', 'unrelatedStages']),
        }),
        requiredInputs: expect.arrayContaining(['script_segments', 'style_constraints']),
        expectedOutputs: expect.arrayContaining(['media_reference', 'prompt_revision']),
        status: 'ready',
      }),
      expect.objectContaining({
        stage: 'video',
        specialistRole: 'video',
        targetArtifactIds: expect.arrayContaining(['episode-02-video-01']),
      }),
    ]));
    expect(JSON.stringify(dispatch)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('routes dispatch tasks to persistent stage agent bindings when available', () => {
    const project = createShortDramaStaticProject();
    const workspaceRoot = 'C:/Users/17949/Documents/void-source';

    const dispatch = createShortDramaMainAIDispatchPlan(project, {
      userGoal: '让视频 AI 继续修复视频产物。',
      approved: true,
      parentSessionId: 'main-session-001',
      targetStage: 'video',
      stageAgentBindings: [
        { stage: 'video', agentName: 'VideoAI', childSessionId: 'session-video', parentSessionId: 'main-session-001', workspaceRoot, status: 'ready', source: 'main_ai_wake' },
      ],
    });

    expect(dispatch.status).toBe('ready');
    expect(dispatch.status === 'ready' ? dispatch.plan.tasks : []).toEqual([
      expect.objectContaining({
        stage: 'video',
        specialistRole: 'video',
        specialistSessionId: 'session-video',
        persistentSessionId: 'session-video',
        dispatchTarget: {
          status: 'ready',
          source: 'stage-agent-binding',
          childSessionId: 'session-video',
          parentSessionId: 'main-session-001',
          agentName: 'VideoAI',
          bindingStatus: 'ready',
        },
      }),
    ]);
  });

  it('keeps semi-automatic dispatch behind explicit approval', () => {
    const project = createShortDramaStaticProject();

    const dispatch = createShortDramaMainAIDispatchPlan(project, {
      userGoal: '全自动继续制作。',
    });

    expect(dispatch).toEqual(expect.objectContaining({
      status: 'needs_approval',
      source: 'short-drama-orchestrator-scaffold',
      plan: expect.objectContaining({
        tasks: [],
      }),
    }));
  });

  it('creates a limited correction review without touching the generic agent loop', () => {
    const project = createShortDramaStaticProject();

    const review = reviewShortDramaArtifactOutput(project, {
      artifactId: 'episode-02-video-01',
      finding: '街头镜头缺少宫墙冷色调，和资产页场景锚点不一致。',
      severity: 'minor',
      retryBudget: 2,
      timestamp: 456,
    });

    expect(review).toEqual(expect.objectContaining({
      status: 'needsCorrection',
      source: 'short-drama-orchestrator-scaffold',
      review: expect.objectContaining({
        artifactId: 'episode-02-video-01',
        retryBudgetRemaining: 1,
        userDecisionRequired: false,
        correctionInstruction: expect.stringContaining('街头镜头缺少宫墙冷色调'),
      }),
    }));
    const artifact = review.status === 'needsCorrection'
      ? review.project.artifacts.find(item => item.id === 'episode-02-video-01')
      : undefined;
    expect(artifact).toEqual(expect.objectContaining({
      status: 'revising',
      attemptCount: 1,
      attempts: [
        expect.objectContaining({
          id: 'attempt-correction-episode-02-video-01-456',
          status: 'created',
          orchestratorCorrection: expect.stringContaining('街头镜头缺少宫墙冷色调'),
        }),
      ],
    }));
  });

  it('creates a bounded stage-level correction review for the current workspace only', () => {
    const project = createShortDramaStaticProject();

    const review = reviewShortDramaStageOutput(project, {
      stage: 'video',
      finding: '第二集视频整体过暗，和分镜的霓虹风格不一致。',
      severity: 'minor',
      retryBudget: 2,
      timestamp: 1_783_000_006_000,
    });

    expect(review).toEqual(expect.objectContaining({
      status: 'needsCorrection',
      source: 'short-drama-orchestrator-scaffold',
      affectedArtifactIds: expect.arrayContaining(['episode-01-video-01', 'episode-02-video-01']),
      review: expect.objectContaining({
        stage: 'video',
        retryBudgetRemaining: 1,
        userDecisionRequired: false,
        correctionInstruction: expect.stringContaining('第二集视频整体过暗'),
      }),
    }));
    const nextProject = review.status === 'needsCorrection' ? review.project : project;
    expect(nextProject.artifacts.find(item => item.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      status: 'revising',
      attempts: expect.arrayContaining([
        expect.objectContaining({
          id: 'attempt-stage-correction-episode-01-video-01-1783000006000',
          orchestratorCorrection: expect.stringContaining('Return limited corrections for this stage only'),
        }),
      ]),
    }));
    expect(nextProject.artifacts.find(item => item.stage === 'post')).not.toEqual(expect.objectContaining({
      status: 'revising',
    }));
  });

  it('requires user review after retry budget is exhausted and preserves existing media', () => {
    const project = createShortDramaStaticProject();

    const review = reviewShortDramaArtifactOutput(project, {
      artifactId: 'episode-01-video-01',
      finding: '镜头运动仍然跑偏。',
      severity: 'major',
      retryBudget: 1,
      timestamp: 789,
    });

    expect(review).toEqual(expect.objectContaining({
      status: 'needsUserReview',
      review: expect.objectContaining({
        retryBudgetRemaining: 0,
        userDecisionRequired: true,
      }),
    }));
    const artifact = review.status === 'needsUserReview'
      ? review.project.artifacts.find(item => item.id === 'episode-01-video-01')
      : undefined;
    expect(artifact).toEqual(expect.objectContaining({
      status: 'needs_intervention',
      mediaReference: expect.objectContaining({
        mediaItemId: 'media-video-01',
      }),
    }));
  });

  it('records main AI pass reviews in artifact audit history', () => {
    const project = createShortDramaStaticProject();

    const review = reviewShortDramaArtifactOutput(project, {
      artifactId: 'episode-01-video-01',
      finding: '主 AI 确认视频节奏、画面和资产一致，可以进入后期。',
      severity: 'pass',
      retryBudget: 2,
      timestamp: 1_783_000_005_000,
    });
    const audit = createShortDramaProjectAuditLog(
      review.status === 'pass' ? review.project : project,
      { artifactIdOrHandle: 'EP01-VID01', limit: 1 },
    );

    expect(audit).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-audit-log',
      entries: [
        expect.objectContaining({
          artifactId: 'episode-01-video-01',
          latestEventType: 'revision',
          latestReason: '主 AI 确认视频节奏、画面和资产一致，可以进入后期。',
          actor: 'mainAI',
        }),
      ],
    }));
    expect(JSON.stringify(audit)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('lets user keep a reviewed artifact without marking downstream stale', () => {
    const project = createShortDramaStaticProject();

    const decision = applyShortDramaReviewDecision(project, {
      artifactId: 'episode-02-video-01',
      decision: 'keep',
      reason: '用户确认当前缺口可接受，先进入后期。',
      timestamp: 999,
    });

    expect(decision).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-orchestrator-scaffold',
      project: expect.objectContaining({
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            id: 'episode-02-video-01',
            status: 'ready',
            revisionCount: 1,
          }),
          expect.objectContaining({
            id: 'episode-02-post-subtitle',
            status: 'error',
          }),
        ]),
      }),
    }));
  });
});
