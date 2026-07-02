import { updateShortDramaArtifactPrompt } from './ShortDramaArtifactRevisionWorkflow';
import { updateShortDramaStageWorkspaceFocus } from './ShortDramaStageWorkspace';
import type {
  ShortDramaFocusedArtifactOptimizationInput,
  ShortDramaFocusedArtifactOptimizationResult,
  ShortDramaError,
  ShortDramaProject,
  ShortDramaStageWorkspace,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-artifact-optimization' as const;

export function optimizeShortDramaFocusedArtifact(
  project: ShortDramaProject,
  workspace: ShortDramaStageWorkspace,
  input: ShortDramaFocusedArtifactOptimizationInput,
): ShortDramaFocusedArtifactOptimizationResult {
  const idOrHandle = workspace.activeArtifactId ?? workspace.activeArtifactHandle;
  if (!idOrHandle) {
    return {
      status: 'error',
      source: SOURCE,
      error: {
        code: 'artifact_missing',
        message: 'Short drama workspace has no focused artifact to optimize.',
      },
    };
  }

  const update = updateShortDramaArtifactPrompt(project, {
    idOrHandle,
    patch: input.patch ?? {
      prompt: {
        positive: input.userInstruction,
      },
    },
    reason: input.reason,
    userInstruction: input.userInstruction,
    source: input.source,
    timestamp: input.timestamp,
    markDownstream: input.markDownstream,
  });

  if (update.status !== 'ready') {
    if (update.status === 'error') {
      return {
        status: 'error',
        source: SOURCE,
        error: normalizeShortDramaError(update.error),
      };
    }

    return {
      ...update,
      source: SOURCE,
    };
  }

  const focus = updateShortDramaStageWorkspaceFocus(update.project, workspace, {
    stage: workspace.stage,
    artifactIdOrHandle: update.artifactId,
    source: input.source === 'stageAgent' ? 'stageAgent' : 'mainAI',
  });

  if (focus.status !== 'ready') {
    return {
      ...focus,
      source: SOURCE,
    };
  }

  return {
    status: 'ready',
    source: SOURCE,
    project: update.project,
    workspace: {
      ...focus.workspace,
      panelState: workspace.panelState,
    },
    artifactId: update.artifactId,
    revisionId: update.revisionId,
    impact: update.impact,
  };
}

function normalizeShortDramaError(error: { code: string; message: string; cause?: unknown }): ShortDramaError {
  if (isShortDramaErrorCode(error.code)) {
    return {
      code: error.code,
      message: error.message,
      cause: error.cause,
    };
  }

  return {
    code: 'unsupported_runtime',
    message: error.message,
    cause: error.cause,
  };
}

function isShortDramaErrorCode(code: string): code is ShortDramaError['code'] {
  return [
    'missing_workspace',
    'unsupported_runtime',
    'remote_workspace',
    'load_failed',
    'save_failed',
    'version_incompatible',
    'manifest_missing',
    'artifact_missing',
    'episode_missing',
    'media_missing',
    'not_media_artifact',
  ].includes(code);
}
