import { describe, expect, it } from 'vitest';

import { createShortDramaStoryboardReferenceViewItems } from './ShortDramaStoryboardReferenceView';
import type { ShortDramaArtifact, ShortDramaStoryboardReferencePlan } from './ShortDramaTypes';

describe('ShortDramaStoryboardReferenceView', () => {
  it('builds compact storyboard reference chips with asset thumbnails and text placeholders', () => {
    const storyboard = createArtifact({
      id: 'storyboard-1',
      stage: 'storyboards',
      type: 'storyboard',
      references: {
        scriptSegmentIds: ['script-segment-episode-01'],
        characterAssetIds: ['asset-character-hero'],
        propAssetIds: ['asset-prop-letter'],
      },
    });
    const character = createArtifact({
      id: 'asset-character-hero',
      stage: 'assets',
      type: 'character',
      displayName: '主角1',
      mediaReference: {
        mediaItemId: 'media-character-hero',
        kind: 'image',
        thumbnailUrl: '/thumbs/hero.png',
      },
    });
    const prop = createArtifact({
      id: 'asset-prop-letter',
      stage: 'assets',
      type: 'prop',
      displayName: '密信',
    });
    const plans: ShortDramaStoryboardReferencePlan[] = [{
      id: 'plan-episode-01-sc01-sh01',
      episodeId: 'episode-01',
      sceneId: 'SC01',
      shotId: 'SH01',
      scriptSegmentId: 'script-segment-episode-01',
      characterAssetIds: ['asset-character-hero'],
      locationAssetIds: [],
      propAssetIds: ['asset-prop-letter'],
      unresolvedLocationNames: ['宫门夜雨'],
      requiredBeats: ['主角发现密信'],
      visualNotes: ['低机位'],
    }];

    const items = createShortDramaStoryboardReferenceViewItems({
      artifact: storyboard,
      projectArtifacts: [storyboard, character, prop],
      storyboardReferencePlans: plans,
    });

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'character',
        kindLabel: '角色',
        label: '主角1',
        thumbnailUrl: '/thumbs/hero.png',
        source: 'asset',
      }),
      expect.objectContaining({
        kind: 'prop',
        kindLabel: '道具',
        label: '密信',
        source: 'asset',
      }),
      expect.objectContaining({
        kind: 'location',
        kindLabel: '场景',
        label: '宫门夜雨',
        source: 'placeholder',
      }),
    ]);
  });

  it('uses explicit storyboard reference plan ids before falling back to script or asset inference', () => {
    const storyboard = createArtifact({
      id: 'storyboard-1',
      stage: 'storyboards',
      type: 'storyboard',
      references: {
        storyboardReferencePlanIds: ['plan-target'],
      },
    });
    const plans: ShortDramaStoryboardReferencePlan[] = [
      {
        id: 'plan-other',
        episodeId: 'episode-01',
        sceneId: 'SC01',
        shotId: 'SH01',
        scriptSegmentId: 'script-segment-other',
        characterAssetIds: [],
        locationAssetIds: [],
        propAssetIds: [],
        unresolvedCharacterNames: ['不应该出现'],
        requiredBeats: [],
        visualNotes: [],
      },
      {
        id: 'plan-target',
        episodeId: 'episode-01',
        sceneId: 'SC02',
        shotId: 'SH03',
        scriptSegmentId: 'script-segment-target',
        characterAssetIds: [],
        locationAssetIds: [],
        propAssetIds: [],
        unresolvedCharacterNames: ['主角1'],
        unresolvedLocationNames: ['场景3'],
        unresolvedPropNames: ['道具4'],
        requiredBeats: [],
        visualNotes: [],
      },
    ];

    const items = createShortDramaStoryboardReferenceViewItems({
      artifact: storyboard,
      projectArtifacts: [storyboard],
      storyboardReferencePlans: plans,
    });

    expect(items.map(item => item.label)).toEqual(['主角1', '场景3', '道具4']);
  });
});

function createArtifact(overrides: Partial<ShortDramaArtifact>): ShortDramaArtifact {
  return {
    id: overrides.id ?? 'artifact-1',
    episodeId: overrides.episodeId ?? 'episode-01',
    stage: overrides.stage ?? 'storyboards',
    type: overrides.type ?? 'storyboard',
    title: overrides.title ?? overrides.displayName ?? overrides.id ?? 'Artifact',
    summary: overrides.summary ?? '',
    agentRole: overrides.agentRole ?? 'image',
    status: overrides.status ?? 'ready',
    revisionCount: overrides.revisionCount ?? 0,
    attemptCount: overrides.attemptCount ?? 0,
    revisions: overrides.revisions ?? [],
    attempts: overrides.attempts ?? [],
    ...overrides,
  };
}
