import { createShortDramaArtifactIndex } from './ShortDramaArtifactIndex';
import type {
  ShortDramaArtifact,
  ShortDramaArtifactReferences,
  ShortDramaProject,
  ShortDramaStoryboardReferencePlan,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-dependency-graph' as const;
const ASSET_TYPES = new Set(['character', 'location', 'prop']);

export interface ShortDramaDependencyGraphNode {
  artifactId: string;
  upstreamArtifactIds: string[];
  scriptSegmentIds: string[];
  characterAssetIds: string[];
  locationAssetIds: string[];
  propAssetIds: string[];
  storyboardArtifactIds: string[];
  videoArtifactIds: string[];
}

export interface ShortDramaAssetDependencyUsage {
  assetId: string;
  usedByArtifactIds: string[];
}

export interface ShortDramaAssetReferenceImpact {
  source: typeof SOURCE;
  assetId: string;
  storyboardReferencePlanIds: string[];
  directArtifactIds: string[];
  downstreamArtifactIds: string[];
}

export interface ShortDramaDependencyGraph {
  source: typeof SOURCE;
  artifactNodes: ShortDramaDependencyGraphNode[];
  assetUsage: ShortDramaAssetDependencyUsage[];
  storyboardReferencePlans: ShortDramaStoryboardReferencePlan[];
}

export function createShortDramaDependencyGraph(project: ShortDramaProject): ShortDramaDependencyGraph {
  const artifactNodes = project.artifacts.map(artifact => createArtifactNode(artifact));
  const usageByAsset = new Map<string, Set<string>>();

  for (const artifact of project.artifacts) {
    for (const assetId of collectShortDramaArtifactAssetReferenceIds(artifact)) {
      if (artifact.id === assetId) {
        continue;
      }
      const usedBy = usageByAsset.get(assetId) ?? new Set<string>();
      usedBy.add(artifact.id);
      usageByAsset.set(assetId, usedBy);
    }
  }

  const assetIds = project.artifacts
    .filter(artifact => ASSET_TYPES.has(artifact.type))
    .map(artifact => artifact.id);

  return {
    source: SOURCE,
    artifactNodes,
    assetUsage: assetIds.map(assetId => ({
      assetId,
      usedByArtifactIds: [...(usageByAsset.get(assetId) ?? [])],
    })),
    storyboardReferencePlans: project.storyboardReferencePlans ?? [],
  };
}

export function collectShortDramaArtifactAssetReferenceIds(artifact: ShortDramaArtifact): string[] {
  return unique([
    ...(artifact.dependsOn ?? []),
    ...collectReferenceIds(artifact.references, 'characterAssetIds'),
    ...collectReferenceIds(artifact.references, 'locationAssetIds'),
    ...collectReferenceIds(artifact.references, 'propAssetIds'),
  ]);
}

export function listShortDramaArtifactUpstreamReferences(
  project: ShortDramaProject,
  artifactId: string,
): ShortDramaDependencyGraphNode | undefined {
  return createShortDramaDependencyGraph(project)
    .artifactNodes
    .find(node => node.artifactId === artifactId);
}

export function listShortDramaAssetUsedBy(project: ShortDramaProject, assetId: string): string[] {
  return createShortDramaDependencyGraph(project)
    .assetUsage
    .find(entry => entry.assetId === assetId)
    ?.usedByArtifactIds ?? [];
}

export function listShortDramaScriptSegmentLinkedArtifacts(
  project: ShortDramaProject,
  scriptSegmentId: string,
): string[] {
  return createShortDramaDependencyGraph(project)
    .artifactNodes
    .filter(node => node.scriptSegmentIds.includes(scriptSegmentId))
    .map(node => node.artifactId);
}

export function listShortDramaArtifactDownstreamReferences(
  project: ShortDramaProject,
  artifactId: string,
): string[] {
  const graph = createShortDramaDependencyGraph(project);
  const reverseDependencyById = createReverseDependencyMap(project, graph);
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [...(reverseDependencyById.get(artifactId) ?? [])];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    result.push(currentId);
    queue.push(...(reverseDependencyById.get(currentId) ?? []));
  }

  return result;
}

export function listShortDramaAssetReferenceImpact(
  project: ShortDramaProject,
  assetId: string,
): ShortDramaAssetReferenceImpact {
  const directArtifactIds = listShortDramaAssetUsedBy(project, assetId);
  const directSet = new Set(directArtifactIds);
  const downstreamArtifactIds = unique(directArtifactIds.flatMap(artifactId => (
    listShortDramaArtifactDownstreamReferences(project, artifactId)
  ))).filter(artifactId => !directSet.has(artifactId));

  return {
    source: SOURCE,
    assetId,
    storyboardReferencePlanIds: (project.storyboardReferencePlans ?? [])
      .filter(plan => [
        ...plan.characterAssetIds,
        ...plan.locationAssetIds,
        ...plan.propAssetIds,
      ].includes(assetId))
      .map(plan => plan.id),
    directArtifactIds,
    downstreamArtifactIds,
  };
}

export function listShortDramaStoryboardReferencePlans(
  project: ShortDramaProject,
  query: { episodeId?: string; sceneId?: string; shotId?: string; scriptSegmentId?: string } = {},
): ShortDramaStoryboardReferencePlan[] {
  return (project.storyboardReferencePlans ?? []).filter(plan => (
    (!query.episodeId || plan.episodeId === query.episodeId)
    && (!query.sceneId || plan.sceneId === query.sceneId)
    && (!query.shotId || plan.shotId === query.shotId)
    && (!query.scriptSegmentId || plan.scriptSegmentId === query.scriptSegmentId)
  ));
}

export function summarizeShortDramaStoryboardReferencePlan(
  project: ShortDramaProject,
  plan: ShortDramaStoryboardReferencePlan,
): string {
  const index = createShortDramaArtifactIndex(project);
  const displayById = new Map(index.map(entry => [entry.id, entry.displayName]));
  const assets = [
    ...plan.characterAssetIds,
    ...plan.locationAssetIds,
    ...plan.propAssetIds,
  ].map(id => displayById.get(id) ?? id);
  const placeholders = [
    ...(plan.unresolvedCharacterNames ?? []),
    ...(plan.unresolvedLocationNames ?? []),
    ...(plan.unresolvedPropNames ?? []),
  ];
  const references = [...assets, ...placeholders];

  return `${plan.sceneId}/${plan.shotId}: ${references.join(', ') || 'no asset refs'}; ${plan.requiredBeats.join(' / ')}`;
}

function createArtifactNode(artifact: ShortDramaArtifact): ShortDramaDependencyGraphNode {
  return {
    artifactId: artifact.id,
    upstreamArtifactIds: unique([
      ...(artifact.dependsOn ?? []),
      ...collectReferenceIds(artifact.references, 'storyboardArtifactIds'),
      ...collectReferenceIds(artifact.references, 'videoArtifactIds'),
    ]),
    scriptSegmentIds: collectReferenceIds(artifact.references, 'scriptSegmentIds'),
    characterAssetIds: collectReferenceIds(artifact.references, 'characterAssetIds'),
    locationAssetIds: collectReferenceIds(artifact.references, 'locationAssetIds'),
    propAssetIds: collectReferenceIds(artifact.references, 'propAssetIds'),
    storyboardArtifactIds: collectReferenceIds(artifact.references, 'storyboardArtifactIds'),
    videoArtifactIds: collectReferenceIds(artifact.references, 'videoArtifactIds'),
  };
}

function createReverseDependencyMap(
  project: ShortDramaProject,
  graph: ShortDramaDependencyGraph,
): Map<string, string[]> {
  const reverseDependencyById = new Map<string, Set<string>>();

  for (const node of graph.artifactNodes) {
    for (const upstreamId of node.upstreamArtifactIds) {
      appendToSetMap(reverseDependencyById, upstreamId, node.artifactId);
    }
  }

  for (const artifact of project.artifacts) {
    for (const assetId of collectShortDramaArtifactAssetReferenceIds(artifact)) {
      if (artifact.id !== assetId) {
        appendToSetMap(reverseDependencyById, assetId, artifact.id);
      }
    }
  }

  return new Map([...reverseDependencyById.entries()].map(([key, value]) => [key, [...value]]));
}

function appendToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

type ShortDramaArtifactReferenceIdKey =
  | 'storyboardReferencePlanIds'
  | 'scriptSegmentIds'
  | 'characterAssetIds'
  | 'locationAssetIds'
  | 'propAssetIds'
  | 'storyboardArtifactIds'
  | 'videoArtifactIds';

function collectReferenceIds(
  references: ShortDramaArtifactReferences | undefined,
  key: ShortDramaArtifactReferenceIdKey,
): string[] {
  return references?.[key] ?? [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
