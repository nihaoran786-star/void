import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorInstallPlan } from '@/shared/services/customization';
import {
  McpConnectorInstaller,
  type McpConnectorGateway,
} from './McpConnectorInstaller';

const plan: ConnectorInstallPlan = {
  connectorId: 'memory',
  kind: 'local-command',
  runtimeCommand: 'npx',
  serverConfig: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    enabled: true,
    autoStart: true,
  },
};

const remotePlan: ConnectorInstallPlan = {
  connectorId: 'context7',
  kind: 'remote-url',
  serverConfig: {
    type: 'streamable-http',
    url: 'https://mcp.context7.com/mcp',
    enabled: true,
    autoStart: true,
  },
};

const secondPlan: ConnectorInstallPlan = {
  ...plan,
  connectorId: 'second-connector',
};

function createGateway(): McpConnectorGateway {
  return {
    installConnector: vi.fn().mockResolvedValue(undefined),
    getRuntimeCapabilities: vi.fn().mockResolvedValue([
      { command: 'npx', available: true, source: 'managed' },
    ]),
  };
}

describe('McpConnectorInstaller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the atomic backend endpoint without loading or saving a full config snapshot', async () => {
    const gateway = createGateway();

    await expect(new McpConnectorInstaller(gateway).install(plan)).resolves.toEqual({
      connectorId: 'memory',
    });

    expect(gateway.installConnector).toHaveBeenCalledWith({
      connectorId: 'memory',
      serverConfig: plan.serverConfig,
    });
    expect(gateway).not.toHaveProperty('loadMCPJsonConfig');
    expect(gateway).not.toHaveProperty('saveMCPJsonConfig');
    expect(gateway).not.toHaveProperty('initializeServersNonDestructive');
    expect(gateway).not.toHaveProperty('deleteServer');
    expect(gateway).not.toHaveProperty('getServers');
  });

  it('stops before installation when the required runtime is unavailable', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getRuntimeCapabilities).mockResolvedValue([
      { command: 'npx', available: false },
    ]);

    await expect(new McpConnectorInstaller(gateway).install(plan)).rejects.toMatchObject({
      code: 'runtime_unavailable',
    });
    expect(gateway.installConnector).not.toHaveBeenCalled();
  });

  it('skips local runtime preflight for a remote HTTPS connector', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getRuntimeCapabilities).mockRejectedValue(
      new Error('runtime preflight must not run'),
    );

    await expect(new McpConnectorInstaller(gateway).install(remotePlan)).resolves.toEqual({
      connectorId: 'context7',
    });
    expect(gateway.getRuntimeCapabilities).not.toHaveBeenCalled();
    expect(gateway.installConnector).toHaveBeenCalledWith({
      connectorId: 'context7',
      serverConfig: remotePlan.serverConfig,
    });
  });

  it.each([
    ['MCP_CONNECTOR_ALREADY_INSTALLED: memory', 'already_installed'],
    ['MCP_CONNECTOR_INSTALL_FAILED: process exited', 'initialize_failed'],
    [
      'MCP_CONNECTOR_ROLLBACK_FAILED: original=MCP_CONNECTOR_INSTALL_FAILED: process exited; rollback=config cleanup failed',
      'rollback_failed',
    ],
  ] as const)('maps backend error prefix %s to %s', async (message, code) => {
    const gateway = createGateway();
    vi.mocked(gateway.installConnector).mockRejectedValue(new Error(message));

    await expect(new McpConnectorInstaller(gateway).install(plan)).rejects.toMatchObject({
      code,
      connectorId: 'memory',
      message: expect.stringContaining(message),
    });
  });

  it('serializes concurrent installs through one installer instance', async () => {
    let releaseFirst!: () => void;
    const firstInstall = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const gateway = createGateway();
    vi.mocked(gateway.installConnector)
      .mockImplementationOnce(() => firstInstall)
      .mockResolvedValueOnce(undefined);
    const installer = new McpConnectorInstaller(gateway);

    const firstRun = installer.install(plan);
    const secondRun = installer.install(secondPlan);
    await vi.waitFor(() => expect(gateway.installConnector).toHaveBeenCalledTimes(1));

    releaseFirst();
    await expect(Promise.all([firstRun, secondRun])).resolves.toHaveLength(2);
    expect(gateway.installConnector).toHaveBeenCalledTimes(2);
  });

  it('continues the queue after a failed atomic install', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.installConnector)
      .mockRejectedValueOnce(new Error('MCP_CONNECTOR_INSTALL_FAILED: start failed'))
      .mockResolvedValueOnce(undefined);
    const installer = new McpConnectorInstaller(gateway);

    const firstOutcome = installer.install(plan).catch(error => error);
    const secondRun = installer.install(secondPlan);

    await expect(firstOutcome).resolves.toMatchObject({ code: 'initialize_failed' });
    await expect(secondRun).resolves.toMatchObject({ connectorId: secondPlan.connectorId });
    expect(gateway.installConnector).toHaveBeenCalledTimes(2);
  });
});
