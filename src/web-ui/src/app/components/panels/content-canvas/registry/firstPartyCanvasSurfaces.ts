/** Built-in Canvas surface definitions and atomic renderer registration. */
import {
  canvasSurfaceRegistry,
  type CanvasSurfaceDefinition,
  type CanvasSurfaceRegistry,
} from '@/shared/services/canvas';
import {
  canvasSurfaceRendererRegistry,
  CanvasSurfaceRendererRegistry,
} from './CanvasSurfaceRendererRegistry';
import { WORKSPACE_MEDIA_SURFACE_ID } from './CanvasSurfaceIds';
import { WorkspaceMediaSurfaceRenderer } from './WorkspaceMediaSurfaceRenderer';

export { WORKSPACE_MEDIA_SURFACE_ID } from './CanvasSurfaceIds';

interface WorkspaceMediaSurfaceInput {
  workspacePath: string;
}

const workspaceMediaSurfaceDefinition: CanvasSurfaceDefinition = {
  surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
  pluginVersion: '1.0.0',
  registrationKey: 'builtin.workspace-media.surface.v1',
  legacyContentType: 'workspace-media-gallery',
  existingInstanceStrategy: 'focus',
  checkWorkspace: workspace => workspace.backend === 'remote'
    ? {
        status: 'unavailable',
        reason: 'Workspace Media remote I/O routing is not available.',
      }
    : { status: 'available' },
  validateInput: () => ({ status: 'valid', value: undefined }),
  createInstanceKey: context => (
    `${WORKSPACE_MEDIA_SURFACE_ID}:${context.workspace.workspaceId}`
  ),
  createPresentation: context => ({
    title: 'Media',
    data: {
      workspacePath: context.workspace.workspacePath,
    } satisfies WorkspaceMediaSurfaceInput,
    metadata: {
      duplicateCheckKey: `workspace-media:${context.workspace.workspacePath}`,
    },
  }),
};

export type FirstPartyCanvasSurfaceActivation =
  | { status: 'active'; dispose: () => void }
  | { status: 'conflict'; reason: string; dispose: () => void };

export function registerFirstPartyCanvasSurfaces(
  surfaces: CanvasSurfaceRegistry<CanvasSurfaceDefinition>,
  renderers: CanvasSurfaceRendererRegistry,
): FirstPartyCanvasSurfaceActivation {
  const surfaceRegistration = surfaces.register(workspaceMediaSurfaceDefinition);
  if (surfaceRegistration.status === 'conflict') {
    return {
      status: 'conflict',
      reason: surfaceRegistration.reason ?? 'Workspace Media surface registration conflict.',
      dispose: () => undefined,
    };
  }

  const rendererRegistration = renderers.register({
    surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.workspace-media.renderer.v1',
    legacyContentTypes: ['workspace-media-gallery'],
    Renderer: WorkspaceMediaSurfaceRenderer,
  });
  if (rendererRegistration.status === 'conflict') {
    surfaceRegistration.dispose();
    return {
      status: 'conflict',
      reason: rendererRegistration.reason ?? 'Workspace Media renderer registration conflict.',
      dispose: () => undefined,
    };
  }

  let disposed = false;
  return {
    status: 'active',
    dispose: () => {
      if (disposed) return;
      disposed = true;
      rendererRegistration.dispose();
      surfaceRegistration.dispose();
    },
  };
}

let firstPartyActivation: FirstPartyCanvasSurfaceActivation | undefined;

export function ensureFirstPartyCanvasSurfacesRegistered(): FirstPartyCanvasSurfaceActivation {
  if (!firstPartyActivation || firstPartyActivation.status === 'conflict') {
    const activation = registerFirstPartyCanvasSurfaces(
      canvasSurfaceRegistry,
      canvasSurfaceRendererRegistry,
    );
    if (activation.status === 'conflict') {
      firstPartyActivation = activation;
    } else {
      let disposed = false;
      const trackedActivation: FirstPartyCanvasSurfaceActivation = {
        status: 'active',
        dispose: () => {
          if (disposed) return;
          disposed = true;
          activation.dispose();
          if (firstPartyActivation === trackedActivation) {
            firstPartyActivation = undefined;
          }
        },
      };
      firstPartyActivation = trackedActivation;
    }
  }
  return firstPartyActivation;
}
