import type {
  CanvasSurfaceDeliveryScope,
  CanvasSurfaceCommandRequest,
  CanvasSurfaceOpenResult,
} from '@/shared/services/canvas';
import type { PanelContent } from '../types';
import { useAgentCanvasStore } from '../stores';
import { removeDuplicateTeamMemberCanvasTabs } from '@/app/presentation/TeamMemberCanvasPresentation';
import { canvasSurfaceCommandService } from './CanvasSurfaceCommandRuntime';
import {
  canvasCapabilityContributionRegistry,
  type CanvasCapabilityContribution,
} from './CanvasCapabilityContributionRegistry';
import { ensureFirstPartyCanvasCapabilitiesRegistered } from './firstPartyCanvasCapabilities';
import { SHORT_DRAMA_SURFACE_ID } from './CanvasSurfaceIds';

export interface CanvasCapabilityCommandRequest
  extends Omit<CanvasSurfaceCommandRequest, 'surfaceId'> {
  capabilityId: string;
}

function ensureFirstPartyCanvasRuntime(): CanvasSurfaceOpenResult | undefined {
  const capabilities = ensureFirstPartyCanvasCapabilitiesRegistered();
  if (capabilities.status === 'conflict') {
    return {
      status: 'error',
      error: { code: 'definition-failed', message: capabilities.reason },
    };
  }
  return undefined;
}

export function resolveFirstPartyCanvasCapability(
  capabilityId: string,
): CanvasCapabilityContribution | undefined {
  if (ensureFirstPartyCanvasRuntime()) return undefined;
  return canvasCapabilityContributionRegistry.resolveByCapabilityId(capabilityId);
}

export function isFirstPartyCanvasCapabilityAvailableForSession(
  capabilityId: string,
  session: { mode?: string; sessionKind?: string } | undefined,
): boolean {
  if (!session) return false;
  const contribution = resolveFirstPartyCanvasCapability(capabilityId);
  if (!contribution) return false;
  return contribution.isAvailableForSession?.(session) ?? true;
}

export function resolveCanvasCapabilityForContent(
  content: PanelContent | undefined,
): CanvasCapabilityContribution | undefined {
  if (!content || ensureFirstPartyCanvasRuntime()) return undefined;
  const metadataSurfaceId = content.metadata?.canvasSurfaceId;
  return typeof metadataSurfaceId === 'string'
    ? canvasCapabilityContributionRegistry.resolveBySurfaceId(metadataSurfaceId)
    : canvasCapabilityContributionRegistry.resolveByLegacyContentType(content.type);
}

export async function openFirstPartyCanvasCapability(
  request: CanvasCapabilityCommandRequest,
): Promise<CanvasSurfaceOpenResult> {
  const activationError = ensureFirstPartyCanvasRuntime();
  if (activationError) return activationError;

  const contribution = canvasCapabilityContributionRegistry.resolveByCapabilityId(
    request.capabilityId,
  );
  if (!contribution) {
    return {
      status: 'incompatible',
      reason: `Canvas capability "${request.capabilityId}" is not registered.`,
    };
  }
  return await canvasSurfaceCommandService.open({
    source: request.source,
    input: request.input,
    idempotencyKey: request.idempotencyKey,
    target: request.target,
    ...(request.sourceSessionId
      ? { sourceSessionId: request.sourceSessionId }
      : {}),
    ...(request.deliveryScope ? { deliveryScope: request.deliveryScope } : {}),
    surfaceId: contribution.surfaceId,
  });
}

export function activateFirstPartyCanvasDeliveryScope(
  scope: Omit<CanvasSurfaceDeliveryScope, 'activationId'>,
): { deliveryScope: CanvasSurfaceDeliveryScope; dispose: () => void } {
  return canvasSurfaceCommandService.activateDeliveryScope(scope);
}

export function reconcileFirstPartyTeamCanvasPresentation(input: {
  capabilityId: string;
  parentSessionId: string;
  workspacePath?: string;
  memberChildSessionIds: readonly string[];
}): number {
  const contribution = resolveFirstPartyCanvasCapability(input.capabilityId);
  return removeDuplicateTeamMemberCanvasTabs(useAgentCanvasStore.getState(), {
    parentSessionId: input.parentSessionId,
    workspacePath: input.workspacePath,
    memberChildSessionIds: input.memberChildSessionIds,
    removeShortDramaWorkspaceTabs: (
      contribution?.surfaceId === SHORT_DRAMA_SURFACE_ID
    ),
  });
}
