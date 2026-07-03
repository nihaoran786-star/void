import type { ImageContext } from '@/shared/types/context';

import { resolveShortDramaArtifactReference } from './ShortDramaArtifactIndex';
import type {
  ShortDramaArtifactIndexEntry,
  ShortDramaArtifactHandleResolutionSource,
  ShortDramaArtifactResolveResult,
  ShortDramaMediaReference,
  ShortDramaProject,
} from './ShortDramaTypes';

const SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE = 'short-drama-image-context-bridge';

type ShortDramaImageContextBridgeErrorCode =
  | 'artifact_missing'
  | 'handle_conflict'
  | 'media_reference_missing'
  | 'not_image'
  | 'missing_local_image_path'
  | 'remote_image_url_not_supported';

type ShortDramaImageContextBridgeErrorResult<Status extends 'unsupported' | 'not_found' | 'conflict'> = {
  status: Status;
  source: typeof SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE;
  error: {
    code: ShortDramaImageContextBridgeErrorCode;
    message: string;
  };
  matches?: ShortDramaArtifactIndexEntry[];
};

export type ShortDramaImageContextBridgeResult =
  | {
      status: 'ready';
      source: typeof SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE;
      context: ImageContext;
      artifact?: Pick<ShortDramaArtifactIndexEntry, 'id' | 'handle' | 'displayName' | 'stage' | 'artifactType'>;
      media: Pick<ShortDramaMediaReference, 'mediaItemId' | 'kind' | 'label' | 'source'>;
    }
  | ShortDramaImageContextBridgeErrorResult<'unsupported' | 'not_found' | 'conflict'>;

export type ShortDramaImageUnderstandingReferenceResult =
  | {
      status: 'ready';
      source: typeof SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE;
      projectId: string;
      artifactId: string;
      artifactHandle: string;
      artifactDisplayName: string;
      artifactStage: ShortDramaArtifactIndexEntry['stage'];
      artifactType: ShortDramaArtifactIndexEntry['artifactType'];
      episodeId?: string;
      mediaItemId: string;
      kind: 'image';
      promptContext: {
        title: string;
        summary: string;
      };
    }
  | ShortDramaImageContextBridgeErrorResult<'unsupported' | 'not_found' | 'conflict'>;

export function resolveShortDramaImageUnderstandingReference(
  project: ShortDramaProject,
  artifactIdOrHandle: string,
): ShortDramaImageUnderstandingReferenceResult {
  const resolved = resolveShortDramaArtifactReference(project, artifactIdOrHandle);
  if (resolved.status !== 'ready') {
    return createArtifactResolutionError(resolved);
  }

  const mediaReference = resolved.artifact.mediaReference;
  if (!mediaReference) {
    return createUnsupported('media_reference_missing', `Short drama artifact has no media reference: ${artifactIdOrHandle}`);
  }
  if (mediaReference.kind !== 'image') {
    return createUnsupported('not_image', `Short drama media reference is not an image: ${mediaReference.mediaItemId}`);
  }

  return {
    status: 'ready',
    source: SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE,
    projectId: project.projectId,
    artifactId: resolved.artifact.id,
    artifactHandle: resolved.entry.handle,
    artifactDisplayName: resolved.entry.displayName,
    artifactStage: resolved.entry.stage,
    artifactType: resolved.entry.artifactType,
    episodeId: resolved.artifact.episodeId,
    mediaItemId: mediaReference.mediaItemId,
    kind: mediaReference.kind,
    promptContext: {
      title: resolved.artifact.title,
      summary: resolved.artifact.summary,
    },
  };
}

export function createShortDramaImageContextForArtifact(
  project: ShortDramaProject,
  artifactIdOrHandle: string,
): ShortDramaImageContextBridgeResult {
  const resolved = resolveShortDramaArtifactReference(project, artifactIdOrHandle);
  if (resolved.status !== 'ready') {
    return createArtifactResolutionError(resolved);
  }

  const mediaReference = resolved.artifact.mediaReference;
  if (!mediaReference) {
    return createUnsupported('media_reference_missing', `Short drama artifact has no media reference: ${artifactIdOrHandle}`);
  }

  return createShortDramaImageContextFromMediaReference(mediaReference, {
    projectId: project.projectId,
    artifact: resolved.entry,
    resolvedBy: resolved.source,
  });
}

export function createShortDramaImageContextFromMediaReference(
  mediaReference: ShortDramaMediaReference,
  options: {
    projectId?: string;
    artifact?: Pick<ShortDramaArtifactIndexEntry, 'id' | 'handle' | 'displayName' | 'stage' | 'artifactType'>;
    resolvedBy?: ShortDramaArtifactHandleResolutionSource;
  } = {},
): ShortDramaImageContextBridgeResult {
  if (mediaReference.kind !== 'image') {
    return createUnsupported('not_image', `Short drama media reference is not an image: ${mediaReference.mediaItemId}`);
  }

  const imagePath = selectAnalyzableImagePath(mediaReference);
  if (!imagePath) {
    const hasRemoteOnlySource = [
      mediaReference.localPath,
      mediaReference.filePath,
      mediaReference.relativePath,
      mediaReference.previewUrl,
      mediaReference.thumbnailUrl,
    ].some(path => path ? isRemoteOrInlinePath(path) : false);

    return createUnsupported(
      hasRemoteOnlySource ? 'remote_image_url_not_supported' : 'missing_local_image_path',
      `Short drama image media has no analyzable local image path: ${mediaReference.mediaItemId}`,
    );
  }

  const displayName = mediaReference.label || options.artifact?.displayName || mediaReference.mediaItemId;
  const context: ImageContext = {
    id: stableImageContextId(options.artifact?.id || mediaReference.mediaItemId, imagePath),
    type: 'image',
    imagePath,
    imageName: displayName,
    fileSize: 0,
    mimeType: mimeTypeForImagePath(imagePath),
    source: 'file',
    isLocal: true,
    timestamp: Date.now(),
    metadata: {
      shortDramaImageContextBridge: true,
      projectId: options.projectId,
      artifactId: options.artifact?.id,
      artifactHandle: options.artifact?.handle,
      artifactStage: options.artifact?.stage,
      artifactType: options.artifact?.artifactType,
      mediaItemId: mediaReference.mediaItemId,
      mediaKind: mediaReference.kind,
      mediaSource: mediaReference.source,
      resolvedBy: options.resolvedBy,
      rawMediaPayloadsIncluded: false,
    },
  };

  return {
    status: 'ready',
    source: SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE,
    context,
    artifact: options.artifact,
    media: {
      mediaItemId: mediaReference.mediaItemId,
      kind: mediaReference.kind,
      label: mediaReference.label,
      source: mediaReference.source,
    },
  };
}

function createArtifactResolutionError(
  result: Extract<ShortDramaArtifactResolveResult, { status: 'not_found' | 'conflict' }>,
): ShortDramaImageContextBridgeErrorResult<'not_found' | 'conflict'> {
  return {
    status: result.status,
    source: SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE,
    error: result.error,
    matches: result.status === 'conflict' ? result.matches : undefined,
  };
}

function createUnsupported(
  code: ShortDramaImageContextBridgeErrorCode,
  message: string,
): ShortDramaImageContextBridgeErrorResult<'unsupported'> {
  return {
    status: 'unsupported',
    source: SHORT_DRAMA_IMAGE_CONTEXT_BRIDGE_SOURCE,
    error: { code, message },
  };
}

function selectAnalyzableImagePath(mediaReference: ShortDramaMediaReference): string | undefined {
  return [
    mediaReference.localPath,
    mediaReference.filePath,
    mediaReference.relativePath,
  ].find(path => path ? !isRemoteOrInlinePath(path) : false);
}

function isRemoteOrInlinePath(path: string): boolean {
  return /^(https?:\/\/|data:|blob:)/i.test(path.trim());
}

function mimeTypeForImagePath(path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function stableImageContextId(identity: string, path: string): string {
  const value = `${identity}:${path}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `short-drama-image-${Math.abs(hash).toString(36)}`;
}
