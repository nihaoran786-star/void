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
import {
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';
import { ShortDramaCanvasSurfaceRenderer } from './ShortDramaCanvasSurfaceRenderer';
import { WorkspaceMediaSurfaceRenderer } from './WorkspaceMediaSurfaceRenderer';

export {
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';

interface WorkspaceMediaSurfaceInput {
  workspacePath: string;
}

interface ShortDramaSurfaceInput {
  staticFixtureEpisodeCount?: number;
}

const shortDramaSurfaceDefinition: CanvasSurfaceDefinition = {
  surfaceId: SHORT_DRAMA_SURFACE_ID,
  pluginVersion: '1.0.0',
  registrationKey: 'builtin.short-drama.surface.v1',
  legacyContentType: 'short-drama-center',
  existingInstanceStrategy: 'update',
  prepareOpen: async context => {
    const runtime = await import('./ShortDramaCanvasOpenPolicyRuntime');
    const preparation = await runtime.prepareShortDramaCanvasOpen(context);
    if (preparation.status !== 'ready') return preparation;
    return {
      status: 'ready',
      beforeHostMutation: () => {
        runtime.beforeShortDramaCanvasHostMutation(context);
      },
    };
  },
  checkWorkspace: workspace => workspace.backend === 'remote'
    ? {
        status: 'unavailable',
        reason: 'AI Short Drama remote workspace I/O routing is not available.',
      }
    : { status: 'available' },
  validateInput: (input, context) => {
    const sourceSessionId = context.sourceSessionId?.trim();
    if (!sourceSessionId) {
      return {
        status: 'invalid',
        reason: 'AI Short Drama requires a source session.',
      };
    }
    if (input === undefined) {
      return { status: 'valid', value: {} satisfies ShortDramaSurfaceInput };
    }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return {
        status: 'invalid',
        reason: 'AI Short Drama surface input is invalid.',
      };
    }
    const staticFixtureEpisodeCount = (
      input as Partial<ShortDramaSurfaceInput>
    ).staticFixtureEpisodeCount;
    if (
      staticFixtureEpisodeCount !== undefined
      && (
        !Number.isInteger(staticFixtureEpisodeCount)
        || staticFixtureEpisodeCount < 0
      )
    ) {
      return {
        status: 'invalid',
        reason: 'AI Short Drama fixture episode count is invalid.',
      };
    }
    return {
      status: 'valid',
      value: staticFixtureEpisodeCount === undefined
        ? {}
        : { staticFixtureEpisodeCount },
    };
  },
  createInstanceKey: context => (
    `${SHORT_DRAMA_SURFACE_ID}:${context.workspace.workspaceId}`
  ),
  createPresentation: context => {
    const input = context.input as ShortDramaSurfaceInput;
    const sourceSessionId = context.sourceSessionId as string;
    return {
      title: 'AI Short Drama',
      data: {
        workspacePath: context.workspace.workspacePath,
        sourceSessionId,
        ...(input.staticFixtureEpisodeCount === undefined
          ? {}
          : { staticFixtureEpisodeCount: input.staticFixtureEpisodeCount }),
      },
      metadata: {
        duplicateCheckKey: `short-drama:${context.workspace.workspacePath}`,
        sourceSessionId,
        contentRole: 'short-drama-center',
      },
    };
  },
};

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
  const shortDramaSurfaceRegistration = surfaces.register(shortDramaSurfaceDefinition);
  if (shortDramaSurfaceRegistration.status === 'conflict') {
    return {
      status: 'conflict',
      reason: shortDramaSurfaceRegistration.reason ?? 'AI Short Drama surface registration conflict.',
      dispose: () => undefined,
    };
  }

  const shortDramaRendererRegistration = renderers.register({
    surfaceId: SHORT_DRAMA_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.short-drama.renderer.v1',
    legacyContentTypes: ['short-drama-center'],
    Renderer: ShortDramaCanvasSurfaceRenderer,
  });
  if (shortDramaRendererRegistration.status === 'conflict') {
    shortDramaSurfaceRegistration.dispose();
    return {
      status: 'conflict',
      reason: shortDramaRendererRegistration.reason ?? 'AI Short Drama renderer registration conflict.',
      dispose: () => undefined,
    };
  }

  const surfaceRegistration = surfaces.register(workspaceMediaSurfaceDefinition);
  if (surfaceRegistration.status === 'conflict') {
    shortDramaRendererRegistration.dispose();
    shortDramaSurfaceRegistration.dispose();
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
    shortDramaRendererRegistration.dispose();
    shortDramaSurfaceRegistration.dispose();
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
      shortDramaRendererRegistration.dispose();
      shortDramaSurfaceRegistration.dispose();
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
