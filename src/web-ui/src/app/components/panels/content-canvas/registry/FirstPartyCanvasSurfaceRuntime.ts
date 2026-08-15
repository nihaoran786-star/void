import type {
  CanvasSurfaceOpenRequest,
  CanvasSurfaceOpenResult,
} from '@/shared/services/canvas/CanvasSurfaceContracts';
import { canvasSurfaceRegistry } from '@/shared/services/canvas/CanvasSurfaceRegistry';
import { CanvasSurfaceService } from '@/shared/services/canvas/CanvasSurfaceService';
import {
  createCanvasStoreHostAdapter,
  type CanvasStoreHostActions,
} from './CanvasStoreHostAdapter';
import { ensureFirstPartyCanvasSurfacesRegistered } from './firstPartyCanvasSurfaces';

const servicesByHost = new WeakMap<CanvasStoreHostActions, CanvasSurfaceService>();

export function openFirstPartyCanvasSurface(
  hostActions: CanvasStoreHostActions,
  request: CanvasSurfaceOpenRequest,
): Promise<CanvasSurfaceOpenResult> {
  const activation = ensureFirstPartyCanvasSurfacesRegistered();
  if (activation.status === 'conflict') {
    return Promise.resolve({
      status: 'error',
      error: {
        code: 'definition-failed',
        message: activation.reason,
      },
    });
  }

  let service = servicesByHost.get(hostActions);
  if (!service) {
    service = new CanvasSurfaceService(
      canvasSurfaceRegistry,
      createCanvasStoreHostAdapter(hostActions),
    );
    servicesByHost.set(hostActions, service);
  }
  return service.open(request);
}
