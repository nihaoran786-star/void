import type {
  CanvasSurfaceCommandHost,
  CanvasSurfaceCommandHostRegistrationResult,
  CanvasSurfaceCommandRequest,
  CanvasSurfaceOpenResult,
} from './CanvasSurfaceContracts';
import { areCanvasWorkspacePathsEquivalent } from './CanvasWorkspaceFacts';

export class CanvasSurfaceCommandService {
  private readonly hosts = new Map<string, CanvasSurfaceCommandHost>();
  private readonly deliveryScopes = new Map<string, {
    revision: string;
    activationId: number;
    owner: object;
  }>();
  private nextDeliveryScopeActivationId = 0;

  public activateDeliveryScope(
    scope: Omit<NonNullable<CanvasSurfaceCommandRequest['deliveryScope']>, 'activationId'>,
  ): {
    deliveryScope: NonNullable<CanvasSurfaceCommandRequest['deliveryScope']>;
    dispose: () => void;
  } {
    const owner = {};
    const deliveryScope = {
      ...scope,
      activationId: ++this.nextDeliveryScopeActivationId,
    };
    this.deliveryScopes.set(scope.scopeId, {
      revision: scope.revision,
      activationId: deliveryScope.activationId,
      owner,
    });
    let disposed = false;
    return {
      deliveryScope,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.deliveryScopes.get(scope.scopeId)?.owner === owner) {
          this.deliveryScopes.delete(scope.scopeId);
        }
      },
    };
  }

  public isDeliveryScopeCurrent(
    scope: CanvasSurfaceCommandRequest['deliveryScope'],
  ): boolean {
    if (!scope) return true;
    const current = this.deliveryScopes.get(scope.scopeId);
    return current?.revision === scope.revision
      && current.activationId === scope.activationId;
  }

  public registerHost(
    host: CanvasSurfaceCommandHost,
  ): CanvasSurfaceCommandHostRegistrationResult {
    if (this.hosts.has(host.hostId)) {
      return {
        status: 'conflict',
        hostId: host.hostId,
        reason: `Canvas host "${host.hostId}" is already registered.`,
        dispose: () => undefined,
      };
    }

    this.hosts.set(host.hostId, host);
    let disposed = false;
    return {
      status: 'registered',
      hostId: host.hostId,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.hosts.get(host.hostId) === host) {
          this.hosts.delete(host.hostId);
        }
      },
    };
  }

  public async open(
    request: CanvasSurfaceCommandRequest,
  ): Promise<CanvasSurfaceOpenResult> {
    if (request.target.status === 'unavailable') {
      return { status: 'unavailable', reason: request.target.reason };
    }
    if (!this.isDeliveryScopeCurrent(request.deliveryScope)) {
      return {
        status: 'unavailable',
        reason: 'Canvas command delivery scope is no longer current.',
      };
    }
    if (
      !request.target.hostId.trim()
      || !request.target.workspaceId.trim()
      || !request.target.workspacePath.trim()
    ) {
      return {
        status: 'unavailable',
        reason: 'Canvas command target is missing its host or workspace identity.',
      };
    }

    const host = this.hosts.get(request.target.hostId);
    if (!host) {
      return {
        status: 'unavailable',
        reason: `Canvas host "${request.target.hostId}" is not registered.`,
      };
    }
    if (
      host.workspace.workspaceId !== request.target.workspaceId
      || host.workspace.backend !== request.target.backend
      || !areCanvasWorkspacePathsEquivalent(
        host.workspace.workspacePath,
        request.target.workspacePath,
        host.workspace.backend,
      )
      || (
        host.workspace.backend === 'remote'
        && request.target.backend === 'remote'
        && host.workspace.remoteConnectionId !== request.target.remoteConnectionId
      )
    ) {
      return {
        status: 'unavailable',
        reason: `Canvas host "${request.target.hostId}" does not own the target workspace.`,
      };
    }
    if (
      request.sourceSessionId
      && host.activeSessionId !== request.sourceSessionId
    ) {
      return {
        status: 'unavailable',
        reason: `Canvas host "${request.target.hostId}" does not own the source session.`,
      };
    }

    try {
      return await host.open({
        surfaceId: request.surfaceId,
        source: request.source,
        input: request.input,
        idempotencyKey: request.idempotencyKey,
        ...(request.sourceSessionId ? { sourceSessionId: request.sourceSessionId } : {}),
        ...(request.deliveryScope ? { deliveryScope: request.deliveryScope } : {}),
        workspace: host.workspace,
      });
    } catch (cause) {
      return {
        status: 'error',
        error: {
          code: 'host-failed',
          message: `Canvas host "${host.hostId}" could not open surface "${request.surfaceId}".`,
          cause,
        },
      };
    }
  }
}
