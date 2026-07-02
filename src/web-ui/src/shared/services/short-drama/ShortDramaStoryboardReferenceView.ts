import type {
  ShortDramaArtifact,
  ShortDramaStoryboardReferencePlan,
} from './ShortDramaTypes';

export type ShortDramaStoryboardReferenceViewKind = 'character' | 'location' | 'prop';
export type ShortDramaStoryboardReferenceViewSource = 'asset' | 'placeholder';

export interface ShortDramaStoryboardReferenceViewItem {
  key: string;
  kind: ShortDramaStoryboardReferenceViewKind;
  kindLabel: string;
  label: string;
  thumbnailUrl?: string;
  source: ShortDramaStoryboardReferenceViewSource;
}

export function createShortDramaStoryboardReferenceViewItems({
  artifact,
  projectArtifacts,
  storyboardReferencePlans,
}: {
  artifact: ShortDramaArtifact;
  projectArtifacts: ShortDramaArtifact[];
  storyboardReferencePlans: ShortDramaStoryboardReferencePlan[];
}): ShortDramaStoryboardReferenceViewItem[] {
  const artifactById = new Map(projectArtifacts.map(item => [item.id, item]));
  const plans = findShortDramaStoryboardReferencePlansForArtifact(artifact, storyboardReferencePlans);
  const items: ShortDramaStoryboardReferenceViewItem[] = [
    ...createAssetReferenceItems('character', artifact.references?.characterAssetIds ?? [], artifactById),
    ...createAssetReferenceItems('location', artifact.references?.locationAssetIds ?? [], artifactById),
    ...createAssetReferenceItems('prop', artifact.references?.propAssetIds ?? [], artifactById),
    ...plans.flatMap(plan => [
      ...createPlaceholderReferenceItems('character', plan.unresolvedCharacterNames ?? []),
      ...createPlaceholderReferenceItems('location', plan.unresolvedLocationNames ?? []),
      ...createPlaceholderReferenceItems('prop', plan.unresolvedPropNames ?? []),
    ]),
  ];

  return dedupeShortDramaStoryboardReferenceViewItems(items);
}

function createAssetReferenceItems(
  kind: ShortDramaStoryboardReferenceViewKind,
  referenceIds: string[],
  artifactById: Map<string, ShortDramaArtifact>,
): ShortDramaStoryboardReferenceViewItem[] {
  return referenceIds.map(referenceId => {
    const referencedArtifact = artifactById.get(referenceId);
    return {
      key: `${kind}:asset:${referenceId}`,
      kind,
      kindLabel: getStoryboardReferenceKindLabel(kind),
      label: referencedArtifact?.displayName ?? referencedArtifact?.handle ?? referencedArtifact?.title ?? referenceId,
      thumbnailUrl: referencedArtifact?.mediaReference?.thumbnailUrl,
      source: 'asset',
    };
  });
}

function createPlaceholderReferenceItems(
  kind: ShortDramaStoryboardReferenceViewKind,
  labels: string[],
): ShortDramaStoryboardReferenceViewItem[] {
  return labels.map(label => ({
    key: `${kind}:placeholder:${label}`,
    kind,
    kindLabel: getStoryboardReferenceKindLabel(kind),
    label,
    source: 'placeholder',
  }));
}

function findShortDramaStoryboardReferencePlansForArtifact(
  artifact: ShortDramaArtifact,
  plans: ShortDramaStoryboardReferencePlan[],
) {
  const storyboardReferencePlanIds = new Set(artifact.references?.storyboardReferencePlanIds ?? []);
  const scriptSegmentIds = new Set(artifact.references?.scriptSegmentIds ?? []);
  return plans.filter(plan => (
    plan.episodeId === artifact.episodeId
    && (
      storyboardReferencePlanIds.has(plan.id)
      || scriptSegmentIds.has(plan.scriptSegmentId)
      || artifact.references?.characterAssetIds?.some(id => plan.characterAssetIds.includes(id))
      || artifact.references?.locationAssetIds?.some(id => plan.locationAssetIds.includes(id))
      || artifact.references?.propAssetIds?.some(id => plan.propAssetIds.includes(id))
    )
  ));
}

function dedupeShortDramaStoryboardReferenceViewItems(
  items: ShortDramaStoryboardReferenceViewItem[],
) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getStoryboardReferenceKindLabel(kind: ShortDramaStoryboardReferenceViewKind) {
  switch (kind) {
    case 'character':
      return '\u89d2\u8272';
    case 'location':
      return '\u573a\u666f';
    case 'prop':
      return '\u9053\u5177';
  }
}
