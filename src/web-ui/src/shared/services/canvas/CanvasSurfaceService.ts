import type {
  CanvasHostOpenRequest,
  CanvasHostPort,
  CanvasSurfaceDefinition,
  CanvasSurfaceOpenRequest,
  CanvasSurfaceOpenResult,
} from './CanvasSurfaceContracts';
import { CanvasSurfaceRegistry } from './CanvasSurfaceRegistry';

export class CanvasSurfaceService {
  private readonly inFlightDeliveries = new Map<string, Promise<CanvasSurfaceOpenResult>>();

  public constructor(
    private readonly registry: CanvasSurfaceRegistry<CanvasSurfaceDefinition>,
    private readonly host: CanvasHostPort,
  ) {}

  public async open(request: CanvasSurfaceOpenRequest): Promise<CanvasSurfaceOpenResult> {
    const workspace = request.workspace;
    if (workspace.status !== 'ready') {
      return { status: 'unavailable', reason: workspace.reason };
    }

    const deliveryKey = [
      workspace.workspaceId,
      workspace.backend === 'remote' ? workspace.remoteConnectionId : 'local',
      request.surfaceId,
      request.source,
      request.sourceSessionId ?? 'no-session',
      request.idempotencyKey,
    ].join('\u0000');
    const inFlight = this.inFlightDeliveries.get(deliveryKey);
    if (inFlight) {
      return await inFlight;
    }

    const delivery = this.openOnce({ ...request, workspace });
    this.inFlightDeliveries.set(deliveryKey, delivery);
    try {
      return await delivery;
    } finally {
      if (this.inFlightDeliveries.get(deliveryKey) === delivery) {
        this.inFlightDeliveries.delete(deliveryKey);
      }
    }
  }

  private async openOnce(
    request: CanvasSurfaceOpenRequest & {
      workspace: Extract<CanvasSurfaceOpenRequest['workspace'], { status: 'ready' }>;
    },
  ): Promise<CanvasSurfaceOpenResult> {

    const definition = this.registry.resolve(request.surfaceId);
    if (!definition) {
      return {
        status: 'incompatible',
        reason: `Canvas surface "${request.surfaceId}" is not registered.`,
      };
    }

    if (definition.checkWorkspace) {
      try {
        const availability = definition.checkWorkspace(request.workspace);
        if (availability.status !== 'available') {
          return availability;
        }
      } catch (cause) {
        return {
          status: 'error',
          error: {
            code: 'definition-failed',
            message: `Canvas surface "${request.surfaceId}" could not evaluate workspace support.`,
            cause,
          },
        };
      }
    }

    let validation;
    try {
      validation = definition.validateInput(request.input, {
        workspace: request.workspace,
        source: request.source,
        sourceSessionId: request.sourceSessionId,
      });
    } catch (cause) {
      return {
        status: 'error',
        error: {
          code: 'definition-failed',
          message: `Canvas surface "${request.surfaceId}" rejected its input unexpectedly.`,
          cause,
        },
      };
    }
    if (validation.status === 'invalid') {
      return { status: 'incompatible', reason: validation.reason };
    }

    let hostRequest: CanvasHostOpenRequest;
    try {
      const context = {
        workspace: request.workspace,
        input: validation.value,
        source: request.source,
        sourceSessionId: request.sourceSessionId,
      } as const;
      const instanceKey = definition.createInstanceKey(context);
      const presentation = definition.createPresentation(context);
      hostRequest = {
        surfaceId: definition.surfaceId,
        instanceKey,
        workspace: request.workspace,
        source: request.source,
        ...(request.sourceSessionId ? { sourceSessionId: request.sourceSessionId } : {}),
        ...(definition.legacyContentType
          ? { legacyContentType: definition.legacyContentType }
          : {}),
        ...presentation,
      };
    } catch (cause) {
      return {
        status: 'error',
        error: {
          code: 'definition-failed',
          message: `Canvas surface "${request.surfaceId}" could not prepare its presentation.`,
          cause,
        },
      };
    }

    try {
      const instanceKey = hostRequest.instanceKey;
      const existing = this.host.findInstance(instanceKey, hostRequest);
      if (!existing) {
        return await this.host.open(hostRequest);
      }

      if (
        existing.instanceKey !== instanceKey
        || existing.surfaceId !== definition.surfaceId
        || (
          existing.workspaceId !== undefined
          && existing.workspaceId !== request.workspace.workspaceId
        )
      ) {
        return {
          status: 'error',
          error: {
            code: 'host-failed',
            message: `Canvas host returned a conflicting instance for "${request.surfaceId}".`,
          },
        };
      }

      const routeChanged = (
        existing.workspaceId === undefined
        || (
          request.workspace.backend === 'remote'
          && existing.remoteConnectionId !== request.workspace.remoteConnectionId
        )
      );

      if (routeChanged || definition.existingInstanceStrategy === 'update') {
        return await this.host.update(existing.instanceId, hostRequest);
      }
      return await this.host.focus(existing.instanceId);
    } catch (cause) {
      return {
        status: 'error',
        error: {
          code: 'host-failed',
          message: `Canvas surface "${request.surfaceId}" could not be opened.`,
          cause,
        },
      };
    }
  }
}
