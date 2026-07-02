import { describe, expect, it } from 'vitest';

import {
  applyShortDramaStoryboardReferencePlans,
  createShortDramaStoryboardReferencePlansFromBreakdown,
  summarizeShortDramaReferencePlanPlaceholders,
} from './ShortDramaStoryboardReferencePlan';
import { createShortDramaStaticProject } from './ShortDramaStaticProject';
import { summarizeShortDramaStoryboardReferencePlan } from './ShortDramaDependencyGraph';

describe('ShortDramaStoryboardReferencePlan', () => {
  it('builds reference plans from ScriptAI breakdown with asset ids and text placeholders', () => {
    const result = createShortDramaStoryboardReferencePlansFromBreakdown(createShortDramaStaticProject());

    expect(result.status).toBe('ready');
    expect(result.plans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        episodeId: 'episode-01',
        sceneId: 'SC01',
        shotId: 'SH01',
        scriptSegmentId: 'script-segment-episode-01',
        characterAssetIds: ['episode-01-character-guard'],
        propAssetIds: ['episode-01-prop-letter'],
        unresolvedLocationNames: ['banquet hall'],
      }),
    ]));
    expect(result.unresolvedReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'location',
        names: ['banquet hall'],
      }),
    ]));
  });

  it('returns an empty result when no ScriptAI breakdown is available', () => {
    const project = {
      ...createShortDramaStaticProject(),
      scriptBreakdown: undefined,
    };

    expect(createShortDramaStoryboardReferencePlansFromBreakdown(project)).toEqual({
      status: 'empty',
      source: 'short-drama-storyboard-reference-plan',
      plans: [],
      unresolvedReferences: [],
      reason: 'no_script_breakdown',
    });
  });

  it('applies generated plans to a project copy without mutating the original project', () => {
    const project = {
      ...createShortDramaStaticProject(),
      storyboardReferencePlans: [],
    };
    const built = createShortDramaStoryboardReferencePlansFromBreakdown(project);
    expect(built.status).toBe('ready');

    const applied = built.status === 'ready'
      ? applyShortDramaStoryboardReferencePlans(project, built.plans)
      : undefined;

    expect(project.storyboardReferencePlans).toEqual([]);
    expect(applied).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-storyboard-reference-plan',
      planCount: built.status === 'ready' ? built.plans.length : 0,
    }));
    expect(applied?.project.storyboardReferencePlans?.length).toBeGreaterThan(0);
    expect(applied?.project.artifacts.find(artifact => artifact.id === 'episode-01-storyboard-01')?.references)
      .toEqual(expect.objectContaining({
        storyboardReferencePlanIds: ['plan-episode-01-sc01-sh01'],
        scriptSegmentIds: ['script-segment-episode-01'],
        characterAssetIds: ['episode-01-character-guard'],
        propAssetIds: ['episode-01-prop-letter'],
        referenceSnapshots: [expect.objectContaining({
          storyboardReferencePlanId: 'plan-episode-01-sc01-sh01',
          characterNames: ['Chai Yong'],
          locationNames: ['banquet hall'],
          propNames: ['Half-hidden letter'],
          unresolvedLocationNames: ['banquet hall'],
        })],
      }));
  });

  it('preserves ScriptAI shot action, emotion, and camera intent in reference plans', () => {
    const project = {
      ...createShortDramaStaticProject(),
      artifacts: [],
      scriptBreakdown: [{
        episodeId: 'episode-01',
        scenes: [{
          sceneId: 'SC09',
          title: '宫门夜雨',
          shots: [{
            id: 'shot-ep01-sc09-sh01',
            episodeId: 'episode-01',
            sceneId: 'SC09',
            shotId: 'SH01',
            scriptSegmentId: 'script-segment-episode-01',
            characterNames: ['主角1'],
            locationNames: ['场景3'],
            propNames: ['道具4'],
            requiredBeats: ['主角1发现道具4'],
            visualNotes: ['低机位夜雨'],
            actionNotes: ['推门进入'],
            emotionNotes: ['紧张怀疑'],
            cameraIntent: ['慢推到手部特写'],
          }],
        }],
      }],
    };

    const result = createShortDramaStoryboardReferencePlansFromBreakdown(project);

    expect(result.status).toBe('ready');
    expect(result.plans[0]).toEqual(expect.objectContaining({
      actionNotes: ['推门进入'],
      emotionNotes: ['紧张怀疑'],
      cameraIntent: ['慢推到手部特写'],
    }));
  });

  it('keeps unresolved names visible in AI-facing summaries', () => {
    const project = createShortDramaStaticProject();
    const built = createShortDramaStoryboardReferencePlansFromBreakdown(project);
    expect(built.status).toBe('ready');
    const plan = built.status === 'ready' ? built.plans.find(item => item.episodeId === 'episode-01') : undefined;

    expect(plan).toBeDefined();
    expect(summarizeShortDramaReferencePlanPlaceholders(plan!)).toContain('banquet hall');
    expect(summarizeShortDramaStoryboardReferencePlan(project, plan!)).toContain('banquet hall');
  });
});
