import { describe, expect, it } from 'vitest';
import {
  buildConnectorInstallPlan,
  CURATED_CONNECTOR_CATALOG,
  listConnectorMarketplaceEntries,
} from './ConnectorMarketplaceService';

describe('ConnectorMarketplaceService', () => {
  it('keeps the six local templates and adds the audited Context7 remote endpoint', () => {
    expect(CURATED_CONNECTOR_CATALOG.map(entry => entry.id)).toEqual([
      'memory',
      'sequential-thinking',
      'filesystem',
      'git',
      'time',
      'playwright',
      'context7',
    ]);
    expect(CURATED_CONNECTOR_CATALOG.slice(0, 6).every(entry => (
      entry.kind === 'local-command'
      && (entry.template.command === 'npx' || entry.template.command === 'uvx')
    ))).toBe(true);
    expect(CURATED_CONNECTOR_CATALOG.slice(0, 6).map(entry => entry.template)).toEqual([
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        env: {},
        enabled: true,
        autoStart: true,
      },
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        env: {},
        enabled: true,
        autoStart: true,
      },
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '{{allowedPath}}'],
        env: {},
        enabled: true,
        autoStart: true,
      },
      {
        command: 'uvx',
        args: ['mcp-server-git', '--repository', '{{repositoryPath}}'],
        env: {},
        enabled: true,
        autoStart: true,
      },
      {
        command: 'uvx',
        args: ['mcp-server-time'],
        env: {},
        enabled: true,
        autoStart: true,
      },
      {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: {},
        enabled: true,
        autoStart: true,
      },
    ]);
  });

  it('finds localized names and English package aliases without changing identity', () => {
    const translations: Record<string, string> = {
      'catalog.market.items.memory.name': '长期记忆',
      'catalog.market.items.memory.description': '保存可复用的知识关系。',
    };
    const resolveText = (key: string) => translations[key] ?? key;

    expect(listConnectorMarketplaceEntries({ search: '长期', resolveText })[0]?.id)
      .toBe('memory');
    expect(listConnectorMarketplaceEntries({ search: 'server-memory', resolveText })[0]?.id)
      .toBe('memory');
    expect(listConnectorMarketplaceEntries({ search: 'PLAYWRIGHT', resolveText })[0]?.id)
      .toBe('playwright');
    expect(listConnectorMarketplaceEntries({ search: 'documentation', resolveText })[0]?.id)
      .toBe('context7');
  });

  it('builds no-config one-click plans without mutating the template', () => {
    const memory = CURATED_CONNECTOR_CATALOG.find(entry => entry.id === 'memory')!;
    const before = structuredClone(memory);

    expect(buildConnectorInstallPlan(memory)).toEqual({
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
    });
    expect(memory).toEqual(before);
  });

  it('builds an auth-free Streamable HTTP plan for the fixed Context7 endpoint', () => {
    const context7 = CURATED_CONNECTOR_CATALOG.find(entry => entry.id === 'context7')!;

    expect(buildConnectorInstallPlan(context7)).toEqual({
      connectorId: 'context7',
      kind: 'remote-url',
      serverConfig: {
        type: 'streamable-http',
        url: 'https://mcp.context7.com/mcp',
        enabled: true,
        autoStart: true,
      },
    });
  });

  it('requires only the declared local path and passes it as one argument', () => {
    const filesystem = CURATED_CONNECTOR_CATALOG.find(entry => entry.id === 'filesystem')!;

    expect(() => buildConnectorInstallPlan(filesystem)).toThrow(
      'connector_field_required:allowedPath',
    );
    expect(buildConnectorInstallPlan(filesystem, {
      allowedPath: ' D:\\Workspaces\\我的项目 ',
    }).serverConfig.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      'D:\\Workspaces\\我的项目',
    ]);
  });

  it('rejects control characters instead of producing an unsafe argument', () => {
    const git = CURATED_CONNECTOR_CATALOG.find(entry => entry.id === 'git')!;
    expect(() => buildConnectorInstallPlan(git, {
      repositoryPath: 'D:\\repo\n--help',
    })).toThrow('connector_field_invalid:repositoryPath');
  });
});
