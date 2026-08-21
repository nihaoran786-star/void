/**
 * Connector install plan type — the surviving subset of the removed connector
 * marketplace. `McpConnectorInstaller` (infrastructure) consumes it; the
 * marketplace entries and query helpers it was born next to are gone.
 */

export type ConnectorRuntimeCommand = 'npx' | 'uvx';

export interface LocalCommandConnectorInstallPlan {
  connectorId: string;
  kind: 'local-command';
  runtimeCommand: ConnectorRuntimeCommand;
  serverConfig: Record<string, unknown>;
}

export interface RemoteUrlConnectorInstallPlan {
  connectorId: string;
  kind: 'remote-url';
  serverConfig: Record<string, unknown>;
}

export type ConnectorInstallPlan =
  | LocalCommandConnectorInstallPlan
  | RemoteUrlConnectorInstallPlan;
