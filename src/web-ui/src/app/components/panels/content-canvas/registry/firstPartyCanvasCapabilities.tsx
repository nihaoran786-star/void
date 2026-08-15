/* eslint-disable react-refresh/only-export-components -- registration lifecycle is not a React component module */
import { Clapperboard, Images } from 'lucide-react';

import {
  CanvasCapabilityContributionRegistry,
  canvasCapabilityContributionRegistry,
} from './CanvasCapabilityContributionRegistry';
import {
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './CanvasSurfaceIds';

export {
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

  let disposed = false;
  return {
    status: 'active',
    dispose: () => {
      if (disposed) return;
      disposed = true;
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
