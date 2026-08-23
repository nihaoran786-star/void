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
  AGENT_STUDIO_SURFACE_ID,
  INFINITE_CANVAS_SURFACE_ID,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';
import { AgentStudioCanvasSurfaceRenderer } from './AgentStudioCanvasSurfaceRenderer';
import { InfiniteCanvasSurfaceRenderer } from './InfiniteCanvasSurfaceRenderer';
import { ShortDramaCanvasSurfaceRenderer } from './ShortDramaCanvasSurfaceRenderer';
import { WorkspaceMediaSurfaceRenderer } from './WorkspaceMediaSurfaceRenderer';

export {
  AGENT_STUDIO_SURFACE_ID,
  INFINITE_CANVAS_SURFACE_ID,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';

interface WorkspaceMediaSurfaceInput {
  workspacePath: string;
}

interface ShortDramaSurfaceInput {
  staticFixtureEpisodeCount?: number;
}

interface AgentStudioSurfaceInput {
  definitionId: string;
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

/**
 * Agent Studio inspects one agent definition at a time.
 *
 * It deliberately declares no legacyContentType: it is a new surface rather than
 * a migrated panel, so it must never resolve an existing panel content type.
 * Authoring is local-only, matching the authoring fail-closed rule for remote
 * projects, and this surface is read-only in P1-A2-1 — it neither opens drafts
 * nor changes the session's pinned revision.
 */
const agentStudioSurfaceDefinition: CanvasSurfaceDefinition = {
  surfaceId: AGENT_STUDIO_SURFACE_ID,
  pluginVersion: '1.0.0',
  registrationKey: 'builtin.agent-studio.surface.v1',
  existingInstanceStrategy: 'focus',
  checkWorkspace: workspace => workspace.backend === 'remote'
    ? {
        status: 'unavailable',
        reason: 'Agent authoring is not available on a remote workspace.',
      }
    : { status: 'available' },
  validateInput: (input, context) => {
    if (!context.sourceSessionId?.trim()) {
      return {
        status: 'invalid',
        reason: 'Agent Studio requires a source session.',
      };
    }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return {
        status: 'invalid',
        reason: 'Agent Studio surface input is invalid.',
      };
    }
    const definitionId = (input as Partial<AgentStudioSurfaceInput>).definitionId;
    if (typeof definitionId !== 'string' || !definitionId.trim()) {
      return {
        status: 'invalid',
        reason: 'Agent Studio requires an agent definition ID.',
      };
    }
    return {
      status: 'valid',
      value: { definitionId: definitionId.trim() } satisfies AgentStudioSurfaceInput,
    };
  },
  createInstanceKey: context => {
    const input = context.input as AgentStudioSurfaceInput;
    return `${AGENT_STUDIO_SURFACE_ID}:${context.workspace.workspaceId}:${input.definitionId}`;
  },
  createPresentation: context => {
    const input = context.input as AgentStudioSurfaceInput;
    const sourceSessionId = context.sourceSessionId as string;
    return {
      title: 'Agent Studio',
      data: {
        definitionId: input.definitionId,
        workspacePath: context.workspace.workspacePath,
      },
      metadata: {
        duplicateCheckKey: `agent-studio:${context.workspace.workspaceId}:${input.definitionId}`,
        sourceSessionId,
      },
    };
  },
};

/**
 * Infinite Canvas presents the per-workspace canvas document owned by the
 * infinite-canvas Domain Module. The tab is only a projection: its snapshot
 * stores workspace/document references, never node data.
 *
 * It deliberately declares no legacyContentType — a brand-new surface must not
 * capture an existing panel — and it is fail-closed on remote workspaces, the
 * same rule as Workspace Media and Agent Studio.
 */
const infiniteCanvasSurfaceDefinition: CanvasSurfaceDefinition = {
  surfaceId: INFINITE_CANVAS_SURFACE_ID,
  pluginVersion: '1.0.0',
  registrationKey: 'builtin.infinite-canvas.surface.v1',
  existingInstanceStrategy: 'focus',
  checkWorkspace: workspace => workspace.backend === 'remote'
    ? {
        status: 'unavailable',
        reason: 'Infinite Canvas remote workspace I/O routing is not available.',
      }
    : { status: 'available' },
  // Phase 1 uses one default document per workspace, so no input payload is
  // required; anything but an empty object or undefined is rejected.
  validateInput: input => {
    if (input === undefined || input === null) {
      return { status: 'valid', value: {} };
    }
    if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) {
      return {
        status: 'invalid',
        reason: 'Infinite Canvas surface input must be empty in phase 1.',
      };
    }
    return { status: 'valid', value: {} };
  },
  createInstanceKey: context => (
    `${INFINITE_CANVAS_SURFACE_ID}:${context.workspace.workspaceId}`
  ),
  createPresentation: context => ({
    title: 'Infinite Canvas',
    data: {
      workspacePath: context.workspace.workspacePath,
      // K2: the panel prefers the opening session as its dispatch target, so
      // the presentation data carries it alongside the metadata echo.
      ...(context.sourceSessionId
        ? { sourceSessionId: context.sourceSessionId }
        : {}),
    },
    metadata: {
      duplicateCheckKey: `infinite-canvas:${context.workspace.workspaceId}`,
      ...(context.sourceSessionId
        ? { sourceSessionId: context.sourceSessionId }
        : {}),
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

  const agentStudioSurfaceRegistration = surfaces.register(agentStudioSurfaceDefinition);
  if (agentStudioSurfaceRegistration.status === 'conflict') {
    rendererRegistration.dispose();
    surfaceRegistration.dispose();
    shortDramaRendererRegistration.dispose();
    shortDramaSurfaceRegistration.dispose();
    return {
      status: 'conflict',
      reason: agentStudioSurfaceRegistration.reason ?? 'Agent Studio surface registration conflict.',
      dispose: () => undefined,
    };
  }

  const agentStudioRendererRegistration = renderers.register({
    surfaceId: AGENT_STUDIO_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.agent-studio.renderer.v1',
    legacyContentTypes: [],
    Renderer: AgentStudioCanvasSurfaceRenderer,
  });
  if (agentStudioRendererRegistration.status === 'conflict') {
    agentStudioSurfaceRegistration.dispose();
    rendererRegistration.dispose();
    surfaceRegistration.dispose();
    shortDramaRendererRegistration.dispose();
    shortDramaSurfaceRegistration.dispose();
    return {
      status: 'conflict',
      reason: agentStudioRendererRegistration.reason ?? 'Agent Studio renderer registration conflict.',
      dispose: () => undefined,
    };
  }

  const infiniteCanvasSurfaceRegistration = surfaces.register(infiniteCanvasSurfaceDefinition);
  if (infiniteCanvasSurfaceRegistration.status === 'conflict') {
    agentStudioRendererRegistration.dispose();
    agentStudioSurfaceRegistration.dispose();
    rendererRegistration.dispose();
    surfaceRegistration.dispose();
    shortDramaRendererRegistration.dispose();
    shortDramaSurfaceRegistration.dispose();
    return {
      status: 'conflict',
      reason: infiniteCanvasSurfaceRegistration.reason ?? 'Infinite Canvas surface registration conflict.',
      dispose: () => undefined,
    };
  }

  const infiniteCanvasRendererRegistration = renderers.register({
    surfaceId: INFINITE_CANVAS_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.infinite-canvas.renderer.v1',
    legacyContentTypes: [],
    Renderer: InfiniteCanvasSurfaceRenderer,
  });
  if (infiniteCanvasRendererRegistration.status === 'conflict') {
    infiniteCanvasSurfaceRegistration.dispose();
    agentStudioRendererRegistration.dispose();
    agentStudioSurfaceRegistration.dispose();
    rendererRegistration.dispose();
    surfaceRegistration.dispose();
    shortDramaRendererRegistration.dispose();
    shortDramaSurfaceRegistration.dispose();
    return {
      status: 'conflict',
      reason: infiniteCanvasRendererRegistration.reason ?? 'Infinite Canvas renderer registration conflict.',
      dispose: () => undefined,
    };
  }

  let disposed = false;
  return {
    status: 'active',
    dispose: () => {
      if (disposed) return;
      disposed = true;
      infiniteCanvasRendererRegistration.dispose();
      infiniteCanvasSurfaceRegistration.dispose();
      agentStudioRendererRegistration.dispose();
      agentStudioSurfaceRegistration.dispose();
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
