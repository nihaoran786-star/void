/* eslint-disable react-refresh/only-export-components -- registration lifecycle is not a React component module */
import { Clapperboard, Images, LayoutGrid, SlidersHorizontal } from 'lucide-react';

import {
  CanvasCapabilityContributionRegistry,
  canvasCapabilityContributionRegistry,
} from './CanvasCapabilityContributionRegistry';
import {
  AGENT_STUDIO_SURFACE_ID,
  INFINITE_CANVAS_SURFACE_ID,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';
import { resolveAgentStudioCapabilityInput } from './agentStudioCapabilityInput';

export {
  AGENT_STUDIO_SURFACE_ID,
  INFINITE_CANVAS_SURFACE_ID,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';

export type FirstPartyCanvasCapabilityActivation =
  | { status: 'active'; dispose: () => void }
  | { status: 'conflict'; reason: string; dispose: () => void };

const isAvailableForMediaParentSession = (session: {
  mode?: string;
  sessionKind?: string;
}) => session.mode?.trim().toLowerCase() === 'media'
  && session.sessionKind !== 'subagent';

export function registerFirstPartyCanvasCapabilities(
  registry: CanvasCapabilityContributionRegistry,
): FirstPartyCanvasCapabilityActivation {
  const shortDramaRegistration = registry.register({
    capabilityId: 'short-drama',
    surfaceId: SHORT_DRAMA_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.short-drama.capability.v1',
    labelKey: 'layout.sessionCapabilities.shortDrama',
    Icon: Clapperboard,
    legacyContentTypes: ['short-drama-center'],
    isAvailableForSession: isAvailableForMediaParentSession,
  });
  if (shortDramaRegistration.status === 'conflict') {
    return {
      status: 'conflict',
      reason: shortDramaRegistration.reason,
      dispose: () => undefined,
    };
  }

  const workspaceMediaRegistration = registry.register({
    capabilityId: 'workspace-media',
    surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.workspace-media.capability.v1',
    labelKey: 'layout.sessionCapabilities.workspaceMedia',
    Icon: Images,
    legacyContentTypes: ['workspace-media-gallery'],
    isAvailableForSession: isAvailableForMediaParentSession,
  });
  if (workspaceMediaRegistration.status === 'conflict') {
    shortDramaRegistration.dispose();
    return {
      status: 'conflict',
      reason: workspaceMediaRegistration.reason,
      dispose: () => undefined,
    };
  }

  const agentStudioRegistration = registry.register({
    capabilityId: 'agent-studio',
    surfaceId: AGENT_STUDIO_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.agent-studio.capability.v1',
    labelKey: 'layout.sessionCapabilities.agentStudio',
    Icon: SlidersHorizontal,
    // A new surface, not a migrated panel: it must not capture an existing tab.
    legacyContentTypes: [],
    // A subagent conversation runs someone else's persona, so it has no agent
    // of its own to author.
    isAvailableForSession: session => session.sessionKind !== 'subagent',
    resolveInput: resolveAgentStudioCapabilityInput,
  });
  if (agentStudioRegistration.status === 'conflict') {
    workspaceMediaRegistration.dispose();
    shortDramaRegistration.dispose();
    return {
      status: 'conflict',
      reason: agentStudioRegistration.reason,
      dispose: () => undefined,
    };
  }

  const infiniteCanvasRegistration = registry.register({
    capabilityId: 'infinite-canvas',
    surfaceId: INFINITE_CANVAS_SURFACE_ID,
    pluginVersion: '1.0.0',
    registrationKey: 'builtin.infinite-canvas.capability.v1',
    labelKey: 'layout.sessionCapabilities.infiniteCanvas',
    Icon: LayoutGrid,
    // A new surface, not a migrated panel: it must not capture an existing tab.
    legacyContentTypes: [],
    // Phase 1 keeps the scope narrow: media parent sessions only.
    isAvailableForSession: isAvailableForMediaParentSession,
  });
  if (infiniteCanvasRegistration.status === 'conflict') {
    agentStudioRegistration.dispose();
    workspaceMediaRegistration.dispose();
    shortDramaRegistration.dispose();
    return {
      status: 'conflict',
      reason: infiniteCanvasRegistration.reason,
      dispose: () => undefined,
    };
  }

  let disposed = false;
  return {
    status: 'active',
    dispose: () => {
      if (disposed) return;
      disposed = true;
      infiniteCanvasRegistration.dispose();
      agentStudioRegistration.dispose();
      workspaceMediaRegistration.dispose();
      shortDramaRegistration.dispose();
    },
  };
}

let firstPartyCapabilityActivation: FirstPartyCanvasCapabilityActivation | undefined;

export function ensureFirstPartyCanvasCapabilitiesRegistered(): FirstPartyCanvasCapabilityActivation {
  if (
    !firstPartyCapabilityActivation
    || firstPartyCapabilityActivation.status === 'conflict'
  ) {
    const activation = registerFirstPartyCanvasCapabilities(
      canvasCapabilityContributionRegistry,
    );
    if (activation.status === 'conflict') {
      firstPartyCapabilityActivation = activation;
    } else {
      let disposed = false;
      const trackedActivation: FirstPartyCanvasCapabilityActivation = {
        status: 'active',
        dispose: () => {
          if (disposed) return;
          disposed = true;
          activation.dispose();
          if (firstPartyCapabilityActivation === trackedActivation) {
            firstPartyCapabilityActivation = undefined;
          }
        },
      };
      firstPartyCapabilityActivation = trackedActivation;
    }
  }
  return firstPartyCapabilityActivation;
}
