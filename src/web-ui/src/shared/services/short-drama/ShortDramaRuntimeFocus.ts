import type {
  ShortDramaError,
  ShortDramaFocusContext,
  ShortDramaManifestAdapter,
  ShortDramaProject,
} from './ShortDramaTypes';

const SHORT_DRAMA_RUNTIME_FOCUS_KEY = '.void/short-drama/focus.json';
const runtimeFocusWriteQueues = new WeakMap<
  ShortDramaManifestAdapter,
  Promise<void>
>();

export type ShortDramaRuntimeFocusInput = ShortDramaFocusContext & {
  workspaceRoot?: string;
  projectPath?: string;
};

export type ShortDramaRuntimeFocusResult =
  | { status: 'ready'; source: 'runtime-focus'; focus: ShortDramaRuntimeFocusInput }
  | { status: 'unsupported'; source: 'runtime-focus'; error: ShortDramaError }
  | { status: 'error'; source: 'runtime-focus'; error: ShortDramaError };

export async function writeShortDramaRuntimeFocus(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
  focus: ShortDramaRuntimeFocusInput,
): Promise<ShortDramaRuntimeFocusResult> {
  if (adapter.kind === 'remote') {
    return {
      status: 'unsupported',
      source: 'runtime-focus',
      error: { code: 'remote_workspace', message: 'Remote short drama runtime focus is not supported yet.' },
    };
  }

  const normalizedFocus = normalizeShortDramaRuntimeFocus(project, focus);
  const precedingWrite = runtimeFocusWriteQueues.get(adapter)
    ?? Promise.resolve();
  const resultPromise = precedingWrite
    .catch(() => undefined)
    .then(() => persistShortDramaRuntimeFocus(adapter, normalizedFocus));
  const queueTail = resultPromise.then(
    () => undefined,
    () => undefined,
  );
  runtimeFocusWriteQueues.set(adapter, queueTail);

  try {
    return await resultPromise;
  } finally {
    if (runtimeFocusWriteQueues.get(adapter) === queueTail) {
      runtimeFocusWriteQueues.delete(adapter);
    }
  }
}

async function persistShortDramaRuntimeFocus(
  adapter: ShortDramaManifestAdapter,
  normalizedFocus: ShortDramaRuntimeFocusInput,
): Promise<ShortDramaRuntimeFocusResult> {
  try {
    await adapter.write(
      SHORT_DRAMA_RUNTIME_FOCUS_KEY,
      JSON.stringify(normalizedFocus, null, 2),
    );
    return {
      status: 'ready',
      source: 'runtime-focus',
      focus: normalizedFocus,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'runtime-focus',
      error: {
        code: 'save_failed',
        message: 'Short drama runtime focus could not be saved.',
        cause: error,
      },
    };
  }
}

function normalizeShortDramaRuntimeFocus(
  project: ShortDramaProject,
  focus: ShortDramaRuntimeFocusInput,
): ShortDramaRuntimeFocusInput {
  return {
    workspaceRoot: cleanOptionalString(focus.workspaceRoot),
    projectPath: cleanOptionalString(focus.projectPath) ?? createShortDramaProjectPath(focus.workspaceRoot),
    activeStage: focus.activeStage,
    activeEpisodeId: cleanOptionalString(focus.activeEpisodeId ?? project.activeEpisodeId),
    activeArtifactId: cleanOptionalString(focus.activeArtifactId),
    activeArtifactHandle: cleanOptionalString(focus.activeArtifactHandle),
    activeMediaItemId: cleanOptionalString(focus.activeMediaItemId),
    selectionSource: focus.selectionSource,
  };
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createShortDramaProjectPath(workspaceRoot: string | undefined): string | undefined {
  const normalizedWorkspaceRoot = cleanOptionalString(workspaceRoot)?.replace(/[\\/]+$/, '');
  return normalizedWorkspaceRoot ? `${normalizedWorkspaceRoot}/.void/short-drama` : undefined;
}
