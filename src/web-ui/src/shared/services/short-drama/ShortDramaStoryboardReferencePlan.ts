import type {
  ShortDramaArtifact,
  ShortDramaProject,
  ShortDramaScriptBreakdownShot,
  ShortDramaStoryboardReferencePlan,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-storyboard-reference-plan' as const;
const ASSET_TYPES = new Set(['character', 'location', 'prop']);

export interface ShortDramaStoryboardReferencePlanBuildOptions {
  idPrefix?: string;
}

export interface ShortDramaStoryboardReferencePlanBuildResult {
  status: 'ready' | 'empty';
  source: typeof SOURCE;
  plans: ShortDramaStoryboardReferencePlan[];
  unresolvedReferences: Array<{
    planId: string;
    kind: 'character' | 'location' | 'prop';
    names: string[];
  }>;
  reason?: 'no_script_breakdown';
}

export type ShortDramaStoryboardReferencePlanApplyResult = {
  status: 'ready';
  source: typeof SOURCE;
  project: ShortDramaProject;
  planCount: number;
};

export function createShortDramaStoryboardReferencePlansFromBreakdown(
  project: ShortDramaProject,
  options: ShortDramaStoryboardReferencePlanBuildOptions = {},
): ShortDramaStoryboardReferencePlanBuildResult {
  const shots = (project.scriptBreakdown ?? []).flatMap(episode => (
    episode.scenes.flatMap(scene => scene.shots)
  ));

  if (shots.length === 0) {
    return {
      status: 'empty',
      source: SOURCE,
      plans: [],
      unresolvedReferences: [],
      reason: 'no_script_breakdown',
    };
  }

  const assets = project.artifacts.filter(artifact => (
    artifact.stage === 'assets' && ASSET_TYPES.has(artifact.type)
  ));

  const plans = shots.map(shot => createPlanForShot(shot, assets, options.idPrefix));
  const unresolvedReferences = plans.flatMap(plan => [
    {
      planId: plan.id,
      kind: 'character' as const,
      names: plan.unresolvedCharacterNames ?? [],
    },
    {
      planId: plan.id,
      kind: 'location' as const,
      names: plan.unresolvedLocationNames ?? [],
    },
    {
      planId: plan.id,
      kind: 'prop' as const,
      names: plan.unresolvedPropNames ?? [],
    },
  ].filter(entry => entry.names.length > 0));

  return {
    status: 'ready',
    source: SOURCE,
    plans,
    unresolvedReferences,
  };
}

export function applyShortDramaStoryboardReferencePlans(
  project: ShortDramaProject,
  plans: ShortDramaStoryboardReferencePlan[],
): ShortDramaStoryboardReferencePlanApplyResult {
  const existingPlans = new Map((project.storyboardReferencePlans ?? []).map(plan => [plan.id, plan]));
  for (const plan of plans) {
    existingPlans.set(plan.id, plan);
  }

  return {
    status: 'ready',
    source: SOURCE,
    project: {
      ...project,
      artifacts: applyPlansToStoryboardArtifacts(project.artifacts, plans),
      storyboardReferencePlans: [...existingPlans.values()],
    },
    planCount: plans.length,
  };
}

export function summarizeShortDramaReferencePlanPlaceholders(
  plan: ShortDramaStoryboardReferencePlan,
): string[] {
  return [
    ...(plan.unresolvedCharacterNames ?? plan.characterNames ?? []),
    ...(plan.unresolvedLocationNames ?? plan.locationNames ?? []),
    ...(plan.unresolvedPropNames ?? plan.propNames ?? []),
  ];
}

function createPlanForShot(
  shot: ShortDramaScriptBreakdownShot,
  assets: ShortDramaArtifact[],
  idPrefix = 'plan',
): ShortDramaStoryboardReferencePlan {
  const character = resolveAssetsByNames(assets, 'character', shot.characterNames);
  const location = resolveAssetsByNames(assets, 'location', shot.locationNames);
  const prop = resolveAssetsByNames(assets, 'prop', shot.propNames);

  return {
    id: `${idPrefix}-${shot.episodeId}-${shot.sceneId}-${shot.shotId}`.toLowerCase(),
    episodeId: shot.episodeId,
    sceneId: shot.sceneId,
    shotId: shot.shotId,
    scriptSegmentId: shot.scriptSegmentId,
    characterNames: [...shot.characterNames],
    locationNames: [...shot.locationNames],
    propNames: [...shot.propNames],
    characterAssetIds: character.assetIds,
    locationAssetIds: location.assetIds,
    propAssetIds: prop.assetIds,
    unresolvedCharacterNames: character.unresolvedNames,
    unresolvedLocationNames: location.unresolvedNames,
    unresolvedPropNames: prop.unresolvedNames,
    requiredBeats: [...shot.requiredBeats],
    visualNotes: [...shot.visualNotes],
    actionNotes: [...(shot.actionNotes ?? [])],
    emotionNotes: [...(shot.emotionNotes ?? [])],
    cameraIntent: [...(shot.cameraIntent ?? [])],
  };
}

function applyPlansToStoryboardArtifacts(
  artifacts: ShortDramaArtifact[],
  plans: ShortDramaStoryboardReferencePlan[],
): ShortDramaArtifact[] {
  const storyboardsByEpisode = new Map<string, ShortDramaArtifact[]>();
  for (const artifact of artifacts) {
    if (artifact.stage !== 'storyboards') {
      continue;
    }
    const list = storyboardsByEpisode.get(artifact.episodeId) ?? [];
    list.push(artifact);
    storyboardsByEpisode.set(artifact.episodeId, list);
  }

  return artifacts.map(artifact => {
    if (artifact.stage !== 'storyboards') {
      return artifact;
    }

    const matchingPlans = plans.filter(plan => planMatchesStoryboardArtifact(
      plan,
      artifact,
      storyboardsByEpisode.get(artifact.episodeId) ?? [],
    ));

    if (matchingPlans.length === 0) {
      return artifact;
    }

    return {
      ...artifact,
      references: {
        ...artifact.references,
        storyboardReferencePlanIds: unique([
          ...(artifact.references?.storyboardReferencePlanIds ?? []),
          ...matchingPlans.map(plan => plan.id),
        ]),
        scriptSegmentIds: unique([
          ...(artifact.references?.scriptSegmentIds ?? []),
          ...matchingPlans.map(plan => plan.scriptSegmentId),
        ]),
        characterAssetIds: unique([
          ...(artifact.references?.characterAssetIds ?? []),
          ...matchingPlans.flatMap(plan => plan.characterAssetIds),
        ]),
        locationAssetIds: unique([
          ...(artifact.references?.locationAssetIds ?? []),
          ...matchingPlans.flatMap(plan => plan.locationAssetIds),
        ]),
        propAssetIds: unique([
          ...(artifact.references?.propAssetIds ?? []),
          ...matchingPlans.flatMap(plan => plan.propAssetIds),
        ]),
        referenceSnapshots: mergeReferenceSnapshots(
          artifact.references?.referenceSnapshots ?? [],
          matchingPlans.map(createReferenceSnapshot),
        ),
      },
    };
  });
}

function createReferenceSnapshot(plan: ShortDramaStoryboardReferencePlan) {
  return {
    storyboardReferencePlanId: plan.id,
    scriptSegmentId: plan.scriptSegmentId,
    episodeId: plan.episodeId,
    sceneId: plan.sceneId,
    shotId: plan.shotId,
    characterNames: [...(plan.characterNames ?? [])],
    locationNames: [...(plan.locationNames ?? [])],
    propNames: [...(plan.propNames ?? [])],
    characterAssetIds: [...(plan.characterAssetIds ?? [])],
    locationAssetIds: [...(plan.locationAssetIds ?? [])],
    propAssetIds: [...(plan.propAssetIds ?? [])],
    unresolvedCharacterNames: [...(plan.unresolvedCharacterNames ?? [])],
    unresolvedLocationNames: [...(plan.unresolvedLocationNames ?? [])],
    unresolvedPropNames: [...(plan.unresolvedPropNames ?? [])],
    requiredBeats: [...(plan.requiredBeats ?? [])],
    visualNotes: [...(plan.visualNotes ?? [])],
    actionNotes: [...(plan.actionNotes ?? [])],
    emotionNotes: [...(plan.emotionNotes ?? [])],
    cameraIntent: [...(plan.cameraIntent ?? [])],
  };
}

function mergeReferenceSnapshots<T extends { storyboardReferencePlanId: string }>(
  existing: T[],
  next: T[],
): T[] {
  const snapshotsByPlanId = new Map(existing.map(snapshot => [snapshot.storyboardReferencePlanId, snapshot]));
  for (const snapshot of next) {
    snapshotsByPlanId.set(snapshot.storyboardReferencePlanId, snapshot);
  }
  return [...snapshotsByPlanId.values()];
}

function planMatchesStoryboardArtifact(
  plan: ShortDramaStoryboardReferencePlan,
  artifact: ShortDramaArtifact,
  episodeStoryboards: ShortDramaArtifact[],
): boolean {
  if (artifact.references?.scriptSegmentIds?.includes(plan.scriptSegmentId)) {
    return true;
  }

  return episodeStoryboards.length === 1 && artifact.episodeId === plan.episodeId;
}

function resolveAssetsByNames(
  assets: ShortDramaArtifact[],
  type: 'character' | 'location' | 'prop',
  names: string[],
) {
  const candidates = assets.filter(artifact => artifact.type === type);
  const assetIds: string[] = [];
  const unresolvedNames: string[] = [];

  for (const name of unique(names)) {
    const matched = candidates.find(candidate => artifactMatchesName(candidate, name));
    if (matched) {
      assetIds.push(matched.id);
    } else {
      unresolvedNames.push(name);
    }
  }

  return {
    assetIds: unique(assetIds),
    unresolvedNames,
  };
}

function artifactMatchesName(artifact: ShortDramaArtifact, name: string): boolean {
  const target = normalize(name);
  if (!target) {
    return false;
  }

  return [
    artifact.id,
    artifact.handle,
    artifact.displayName,
    artifact.title,
    artifact.summary,
  ].some(value => normalize(value).includes(target));
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
