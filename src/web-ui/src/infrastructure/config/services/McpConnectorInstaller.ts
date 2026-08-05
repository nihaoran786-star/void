import {
  MCPAPI,
  type RuntimeCommandCapability,
} from '@/infrastructure/api/service-api/MCPAPI';
import type { ConnectorInstallPlan } from '@/shared/services/customization';

export type McpConnectorInstallErrorCode =
  | 'invalid_config'
  | 'already_installed'
  | 'runtime_unavailable'
  | 'save_failed'
  | 'initialize_failed'
  | 'verification_failed'
  | 'rollback_failed';

export interface McpConnectorInstallResult {
  connectorId: string;
}

export interface McpConnectorGateway {
  installConnector(request: {
    connectorId: string;
    serverConfig: Record<string, unknown>;
  }): Promise<void>;
  getRuntimeCapabilities(): Promise<RuntimeCommandCapability[]>;
}

export class McpConnectorInstallError extends Error {
  readonly rollbackError?: unknown;

  constructor(
    public readonly code: McpConnectorInstallErrorCode,
    message: string,
    public readonly connectorId: string,
    options: { cause?: unknown; rollbackError?: unknown } = {},
  ) {
    super(message);
    this.name = 'McpConnectorInstallError';
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.rollbackError = options.rollbackError;
  }
}

function wrapInstallError(
  code: McpConnectorInstallErrorCode,
  connectorId: string,
  cause: unknown,
): McpConnectorInstallError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new McpConnectorInstallError(code, detail, connectorId, { cause });
}

export class McpConnectorInstaller {
  private installTail: Promise<void> = Promise.resolve();

  constructor(private readonly gateway: McpConnectorGateway = MCPAPI) {}

  install(plan: ConnectorInstallPlan): Promise<McpConnectorInstallResult> {
    const run = this.installTail.then(() => this.performInstall(plan));
    this.installTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async performInstall(
    plan: ConnectorInstallPlan,
  ): Promise<McpConnectorInstallResult> {
    if (plan.kind === 'local-command') {
      const capabilities = await this.gateway.getRuntimeCapabilities();
      const capability = capabilities.find(item => (
        item.command.toLocaleLowerCase() === plan.runtimeCommand.toLocaleLowerCase()
      ));
      if (!capability?.available) {
        throw new McpConnectorInstallError(
          'runtime_unavailable',
          `Runtime command "${plan.runtimeCommand}" is unavailable.`,
          plan.connectorId,
        );
      }
    }

    try {
      await this.gateway.installConnector({
        connectorId: plan.connectorId,
        serverConfig: structuredClone(plan.serverConfig),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes('MCP_CONNECTOR_ALREADY_INSTALLED:')) {
        throw wrapInstallError('already_installed', plan.connectorId, error);
      }
      if (detail.includes('MCP_CONNECTOR_ROLLBACK_FAILED:')) {
        throw wrapInstallError('rollback_failed', plan.connectorId, error);
      }
      throw wrapInstallError('initialize_failed', plan.connectorId, error);
    }

    return { connectorId: plan.connectorId };
  }
}

export const mcpConnectorInstaller = new McpConnectorInstaller();
