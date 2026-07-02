import type { ShortDramaError, ShortDramaManifestAdapter } from './ShortDramaTypes';

const SOURCE = 'short-drama-remote-support' as const;

export type ShortDramaWorkspaceSupportState =
  | {
      status: 'ready';
      source: typeof SOURCE;
      workspacePath: string;
      adapterKind: ShortDramaManifestAdapter['kind'];
    }
  | {
      status: 'unsupported';
      source: typeof SOURCE;
      workspacePath: string;
      adapterKind: ShortDramaManifestAdapter['kind'];
      error: ShortDramaError;
    }
  | {
      status: 'error';
      source: typeof SOURCE;
      adapterKind: ShortDramaManifestAdapter['kind'];
      error: ShortDramaError;
    };

export function evaluateShortDramaWorkspaceSupport(input: {
  workspacePath?: string;
  adapterKind: ShortDramaManifestAdapter['kind'];
}): ShortDramaWorkspaceSupportState {
  const workspacePath = input.workspacePath?.trim();
  if (!workspacePath) {
    return {
      status: 'error',
      source: SOURCE,
      adapterKind: input.adapterKind,
      error: {
        code: 'missing_workspace',
        message: 'A workspace is required to load the short drama center.',
      },
    };
  }

  if (input.adapterKind === 'remote') {
    return {
      status: 'unsupported',
      source: SOURCE,
      workspacePath,
      adapterKind: input.adapterKind,
      error: {
        code: 'remote_workspace',
        message: 'Remote short drama manifests are not supported yet.',
      },
    };
  }

  return {
    status: 'ready',
    source: SOURCE,
    workspacePath,
    adapterKind: input.adapterKind,
  };
}
