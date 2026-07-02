import { describe, expect, it } from 'vitest';

import {
  createShortDramaDependencyGraph,
  listShortDramaArtifactDownstreamReferences,
  listShortDramaArtifactUpstreamReferences,
  listShortDramaAssetReferenceImpact,
  listShortDramaAssetUsedBy,
  listShortDramaScriptSegmentLinkedArtifacts,
  listShortDramaStoryboardReferencePlans,
  summarizeShortDramaStoryboardReferencePlan,
} from './ShortDramaDependencyGraph';
import { createShortDramaStaticProject } from './ShortDramaStaticProject';
import { createShortDramaAssetUsageGraph } from './ShortDramaArtifactRevisionWorkflow';

describe('ShortDramaDependencyGraph', () => {
  it('tracks storyboard reference plans and artifact reference ids without relying on handles as keys', () => {
    const project = createShortDramaStaticProject();
    const nextProject = {
      ...project,
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
          requiredBeats: ['guard discovers the sealed letter'],
          visualNotes: ['use low lantern light'],
        },
      ],
      artifacts: project.artifacts.map(artifact => artifact.id === 'episode-01-storyboard-01'
        ? {
            ...artifact,
            references: {
              scriptSegmentIds: ['script-segment-episode-01'],
              characterAssetIds: ['episode-01-character-guard'],
              propAssetIds: ['episode-01-prop-letter'],
            },
          }
        : artifact),
    };

    const graph = createShortDramaDependencyGraph(nextProject);
    const storyboardNode = listShortDramaArtifactUpstreamReferences(nextProject, 'episode-01-storyboard-01');
    const plans = listShortDramaStoryboardReferencePlans(nextProject, {
      episodeId: 'episode-01',
      sceneId: 'SC01',
    });

    expect(graph).toEqual(expect.objectContaining({
      source: 'short-drama-dependency-graph',
      storyboardReferencePlans: nextProject.storyboardReferencePlans,
    }));
    expect(storyboardNode).toEqual(expect.objectContaining({
      artifactId: 'episode-01-storyboard-01',
      scriptSegmentIds: ['script-segment-episode-01'],
      characterAssetIds: ['episode-01-character-guard'],
      propAssetIds: ['episode-01-prop-letter'],
    }));
    expect(plans).toHaveLength(1);
    expect(summarizeShortDramaStoryboardReferencePlan(nextProject, plans[0])).toContain('guard discovers the sealed letter');
  });

  it('feeds referenced assets into the existing asset usedBy surface', () => {
    const project = createShortDramaStaticProject();
    const nextProject = {
      ...project,
      artifacts: project.artifacts.map(artifact => artifact.id === 'episode-02-storyboard-01'
        ? {
            ...artifact,
            dependsOn: [],
            references: {
              characterAssetIds: ['episode-01-character-guard'],
              propAssetIds: ['episode-01-prop-letter'],
            },
          }
        : artifact),
    };

    expect(listShortDramaAssetUsedBy(nextProject, 'episode-01-character-guard'))
      .toEqual(expect.arrayContaining(['episode-02-storyboard-01']));
    expect(createShortDramaAssetUsageGraph(nextProject)
      .find(entry => entry.assetId === 'episode-01-character-guard')?.usedBy)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          artifactId: 'episode-02-storyboard-01',
          usageType: 'visual_reference',
        }),
      ]));
  });

  it('answers script, asset, storyboard, video, and post dependency impact queries', () => {
    const project = createShortDramaStaticProject();
    const nextProject = {
      ...project,
      storyboardReferencePlans: [
        {
          id: 'plan-ep01-sc01-sh01',
          episodeId: 'episode-01',
          sceneId: 'SC01',
          shotId: 'SH01',
          scriptSegmentId: 'script-segment-episode-01',
          characterAssetIds: ['episode-01-character-guard'],
          locationAssetIds: ['episode-01-location-gate'],
          propAssetIds: ['episode-01-prop-letter'],
          requiredBeats: ['guard discovers the sealed letter'],
          visualNotes: ['use low lantern light'],
        },
      ],
      artifacts: project.artifacts.map(artifact => {
        if (artifact.id === 'episode-01-storyboard-01') {
          return {
            ...artifact,
            references: {
              scriptSegmentIds: ['script-segment-episode-01'],
              characterAssetIds: ['episode-01-character-guard'],
              locationAssetIds: ['episode-01-location-gate'],
              propAssetIds: ['episode-01-prop-letter'],
            },
          };
        }
        if (artifact.id === 'episode-01-video-01') {
          return {
            ...artifact,
            references: {
              storyboardArtifactIds: ['episode-01-storyboard-01'],
              characterAssetIds: ['episode-01-character-guard'],
              locationAssetIds: ['episode-01-location-gate'],
            },
          };
        }
        if (artifact.id === 'episode-01-post-final') {
          return {
            ...artifact,
            references: {
              videoArtifactIds: ['episode-01-video-01'],
            },
          };
        }
        return artifact;
      }),
    };

    expect(listShortDramaScriptSegmentLinkedArtifacts(nextProject, 'script-segment-episode-01'))
      .toEqual(expect.arrayContaining(['episode-01-storyboard-01']));
    expect(listShortDramaArtifactDownstreamReferences(nextProject, 'episode-01-storyboard-01'))
      .toEqual(expect.arrayContaining(['episode-01-video-01', 'episode-01-post-final']));
    expect(listShortDramaArtifactDownstreamReferences(nextProject, 'episode-01-video-01'))
      .toEqual(expect.arrayContaining(['episode-01-post-final']));
    expect(listShortDramaAssetReferenceImpact(nextProject, 'episode-01-character-guard'))
      .toEqual(expect.objectContaining({
        assetId: 'episode-01-character-guard',
        storyboardReferencePlanIds: ['plan-ep01-sc01-sh01'],
        directArtifactIds: expect.arrayContaining(['episode-01-storyboard-01', 'episode-01-video-01']),
        downstreamArtifactIds: expect.arrayContaining(['episode-01-post-final']),
      }));
  });
});
