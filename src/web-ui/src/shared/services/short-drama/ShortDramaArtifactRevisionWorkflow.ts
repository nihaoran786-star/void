import {
  createShortDramaArtifactIndex,
  resolveShortDramaArtifactReference,
} from './ShortDramaArtifactIndex';
import { collectShortDramaArtifactAssetReferenceIds } from './ShortDramaDependencyGraph';
import type {
  ShortDramaArtifact,
  ShortDramaArtifactPromptPatch,
  ShortDramaArtifactPromptUpdateInput,
  ShortDramaArtifactPromptUpdateResult,
  ShortDramaAssetUsage,
  ShortDramaAssetUsageEntry,
  ShortDramaImpactAnalysis,
  ShortDramaImpactItem,
  ShortDramaProject,
} from './ShortDramaTypes';

const ASSET_TYPES = new Set(['character', 'location', 'prop']);

export function updateShortDramaArtifactPrompt(
  project: ShortDramaProject,
  input: ShortDramaArtifactPromptUpdateInput,
): ShortDramaArtifactPromptUpdateResult {
  const resolved = resolveShortDramaArtifactReference(project, input.idOrHandle);
  if (resolved.status !== 'ready') {
    return resolved;
  }

  const timestamp = input.timestamp ?? Date.now();
  const impact = previewShortDramaArtifactPromptImpact(project, resolved.artifact.id);
  if (impact.status !== 'ready') {
    return {
      status: 'error',
      source: 'artifact-revision',
      error: impact.error ?? { code: 'artifact_missing', message: 'Short drama artifact was not found.' },
    };
  }

  const previousRevision = resolved.artifact.revisions.at(-1);
  const changedFields = getChangedPromptFields(input.patch);
  const revisionId = `revision-${resolved.artifact.id}-${timestamp}`;
  const attemptId = `attempt-${resolved.artifact.id}-${timestamp}`;
  const nextRevisionCount = resolved.artifact.revisionCount + 1;
  const nextAttemptCount = resolved.artifact.attemptCount + 1;

  const nextArtifacts = project.artifacts.map(artifact => {
    if (artifact.id === resolved.artifact.id) {
      const nextArtifact = applyPromptPatch(artifact, input.patch);
      const revisions = [
        ...artifact.revisions,
        {
          id: revisionId,
          version: nextRevisionCount,
          createdAt: timestamp,
          summary: input.reason,
          mediaItemId: input.patch.mediaReference?.mediaItemId,
          previousRevisionId: previousRevision?.id,
          changedFields,
          reason: input.reason,
          userInstruction: input.userInstruction,
          source: input.source,
          downstreamImpact: impact.items.filter(item => item.recommendation !== 'keep'),
        },
      ];
      const attempts = [
        ...artifact.attempts,
        {
          id: attemptId,
          status: 'created' as const,
          createdAt: timestamp,
          revisionId,
          inputInstruction: input.userInstruction,
        },
      ];

      return {
        ...nextArtifact,
        status: 'revising' as const,
        revisionCount: nextRevisionCount,
        attemptCount: nextAttemptCount,
        revisions,
        attempts,
      };
    }

    if (!input.markDownstream) {
      return artifact;
    }

    const impactItem = impact.items.find(item => item.artifactId === artifact.id);
    if (!impactItem || impactItem.recommendation === 'keep') {
      return artifact;
    }

    return {
      ...artifact,
      status: impactItem.recommendation === 'regenerate' ? 'stale' as const : 'reviewing' as const,
      statusReason: impactItem.reason,
    };
  });

  return {
    status: 'ready',
    source: 'artifact-revision',
    project: { ...project, artifacts: nextArtifacts },
    artifactId: resolved.artifact.id,
    revisionId,
    impact,
  };
}

export function previewShortDramaArtifactPromptImpact(
  project: ShortDramaProject,
  artifactId: string,
): ShortDramaImpactAnalysis {
  const changedArtifact = project.artifacts.find(artifact => artifact.id === artifactId);
  if (!changedArtifact) {
    return {
      status: 'error',
      changedArtifactId: artifactId,
      items: [],
      error: { code: 'artifact_missing', message: 'Changed artifact was not found.' },
    };
  }

  const resolveDependencyImpact = createDependencyImpactResolver(project, changedArtifact.id);
  return {
    status: 'ready',
    changedArtifactId: artifactId,
    items: project.artifacts
      .filter(artifact => artifact.id !== artifactId)
      .map(artifact => createImpactItem(changedArtifact, artifact, resolveDependencyImpact(artifact))),
  };
}

export function createShortDramaAssetUsageGraph(project: ShortDramaProject): ShortDramaAssetUsageEntry[] {
  const index = createShortDramaArtifactIndex(project);
  const entriesById = new Map(index.map(entry => [entry.id, entry]));
  const assets = project.artifacts.filter(artifact => ASSET_TYPES.has(artifact.type));

  return assets.map(asset => {
    const assetEntry = entriesById.get(asset.id)!;
    const usedBy: ShortDramaAssetUsage[] = project.artifacts
      .filter(artifact => artifact.id !== asset.id)
      .filter(artifact => collectShortDramaArtifactAssetReferenceIds(artifact).includes(asset.id))
      .map(artifact => {
        const artifactEntry = entriesById.get(artifact.id)!;
        return {
          assetId: asset.id,
          assetHandle: assetEntry.handle,
          artifactId: artifact.id,
          artifactHandle: artifactEntry.handle,
          usageType: usageTypeForArtifact(artifact),
          confidence: 1,
        };
      });

    return {
      assetId: asset.id,
      assetHandle: assetEntry.handle,
      assetType: asset.type as ShortDramaAssetUsageEntry['assetType'],
      displayName: assetEntry.displayName,
      usedBy,
    };
  });
}

function applyPromptPatch(artifact: ShortDramaArtifact, patch: ShortDramaArtifactPromptPatch): ShortDramaArtifact {
  return {
    ...artifact,
    title: patch.title ?? artifact.title,
    summary: patch.summary ?? artifact.summary,
    prompt: patch.prompt ? { ...artifact.prompt, ...patch.prompt } : artifact.prompt,
    mediaReference: patch.mediaReference ?? artifact.mediaReference,
  };
}

function getChangedPromptFields(patch: ShortDramaArtifactPromptPatch) {
  const fields: string[] = [];
  if (patch.title !== undefined) fields.push('title');
  if (patch.summary !== undefined) fields.push('summary');
  if (patch.mediaReference !== undefined) fields.push('mediaReference');
  if (patch.prompt) {
    fields.push(...Object.keys(patch.prompt).map(key => `prompt.${key}`));
  }
  return fields;
}

type DependencyImpact = {
  depth: number;
};

function createDependencyImpactResolver(project: ShortDramaProject, changedArtifactId: string) {
  const artifactsById = new Map(project.artifacts.map(artifact => [artifact.id, artifact]));
  const memo = new Map<string, DependencyImpact | undefined>();

  const resolve = (artifact: ShortDramaArtifact, visiting: Set<string>): DependencyImpact | undefined => {
    if (memo.has(artifact.id)) {
      return memo.get(artifact.id);
    }

    if (visiting.has(artifact.id)) {
      return undefined;
    }

    visiting.add(artifact.id);
    let result: DependencyImpact | undefined;

    for (const dependencyId of artifact.dependsOn ?? []) {
      if (dependencyId === changedArtifactId) {
        result = { depth: 1 };
        break;
      }

      const dependency = artifactsById.get(dependencyId);
      if (!dependency) {
        continue;
      }

      const dependencyImpact = resolve(dependency, visiting);
      if (dependencyImpact) {
        result = { depth: dependencyImpact.depth + 1 };
        break;
      }
    }

    visiting.delete(artifact.id);
    memo.set(artifact.id, result);
    return result;
  };

  return (artifact: ShortDramaArtifact) => resolve(artifact, new Set<string>());
}

function createImpactItem(
  changedArtifact: ShortDramaArtifact,
  artifact: ShortDramaArtifact,
  dependencyImpact: DependencyImpact | undefined,
): ShortDramaImpactItem {
  if (!dependencyImpact) {
    return {
      artifactId: artifact.id,
      recommendation: 'keep',
      reason: 'No dependency on the changed artifact.',
      estimatedMinutes: 0,
      estimatedCostLabel: '$0.00 est.',
    };
  }

  const recommendation = artifact.stage === 'video' || artifact.stage === 'storyboards'
    ? 'regenerate'
    : 'review';

  return {
    artifactId: artifact.id,
    recommendation,
    reason: dependencyImpact.depth === 1
      ? `${artifact.title} depends on ${changedArtifact.title}.`
      : `${artifact.title} is affected through downstream dependency on ${changedArtifact.title}.`,
    estimatedMinutes: artifact.stage === 'video' ? 12 : 4,
    estimatedCostLabel: artifact.stage === 'video' ? '$4.20 est.' : '$0.40 est.',
  };
}

function usageTypeForArtifact(artifact: ShortDramaArtifact): ShortDramaAssetUsage['usageType'] {
  if (artifact.stage === 'storyboards') {
    return 'visual_reference';
  }
  if (artifact.stage === 'video' || artifact.stage === 'post') {
    return 'continuity_requirement';
  }
  return 'prompt_reference';
}
