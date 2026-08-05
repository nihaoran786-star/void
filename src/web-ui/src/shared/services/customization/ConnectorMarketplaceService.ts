export type ConnectorMarketplaceCategory =
  | 'all'
  | 'knowledge'
  | 'reasoning'
  | 'files'
  | 'development'
  | 'productivity'
  | 'browser';

export type ConnectorRuntimeCommand = 'npx' | 'uvx';
export type ConnectorRemoteTransport = 'streamable-http';

export interface ConnectorMarketplaceField {
  id: string;
  labelKey: string;
  placeholderKey: string;
  hintKey: string;
  required: true;
  kind: 'path';
}

interface ConnectorMarketplaceEntryBase {
  /** Stable config/runtime identity. This value is never localized. */
  id: string;
  nameKey: string;
  descriptionKey: string;
  category: Exclude<ConnectorMarketplaceCategory, 'all'>;
  aliases: readonly string[];
  tags: readonly string[];
  fields: readonly ConnectorMarketplaceField[];
}

export interface LocalCommandConnectorMarketplaceEntry
  extends ConnectorMarketplaceEntryBase {
  kind: 'local-command';
  runtimeCommand: ConnectorRuntimeCommand;
  template: Readonly<{
    command: ConnectorRuntimeCommand;
    args: readonly string[];
    env: Readonly<Record<string, string>>;
    enabled: true;
    autoStart: true;
  }>;
}

export interface RemoteUrlConnectorMarketplaceEntry
  extends ConnectorMarketplaceEntryBase {
  kind: 'remote-url';
  transport: ConnectorRemoteTransport;
  fields: readonly [];
  template: Readonly<{
    type: ConnectorRemoteTransport;
    url: string;
    enabled: true;
    autoStart: true;
  }>;
}

export type ConnectorMarketplaceEntry =
  | LocalCommandConnectorMarketplaceEntry
  | RemoteUrlConnectorMarketplaceEntry;

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

export interface ConnectorCatalogQuery {
  search?: string;
  category?: ConnectorMarketplaceCategory;
  /** Resolves localized name/description keys without coupling this Module to i18n. */
  resolveText?: (key: string) => string;
}

export type ConnectorFieldValues = Readonly<Record<string, string>>;

const localPathField = (
  id: 'allowedPath' | 'repositoryPath',
): ConnectorMarketplaceField => ({
  id,
  labelKey: `catalog.market.fields.${id}.label`,
  placeholderKey: `catalog.market.fields.${id}.placeholder`,
  hintKey: `catalog.market.fields.${id}.hint`,
  required: true,
  kind: 'path',
});

const entry = <TEntry extends ConnectorMarketplaceEntry>(value: TEntry): TEntry => value;

/**
 * A deliberately small, audited catalog. Templates are argument arrays rather
 * than shell snippets, so catalog installation cannot execute user-authored
 * commands or interpolate shell syntax.
 */
export const CURATED_CONNECTOR_CATALOG: readonly ConnectorMarketplaceEntry[] = [
  entry({
    id: 'memory',
    nameKey: 'catalog.market.items.memory.name',
    descriptionKey: 'catalog.market.items.memory.description',
    category: 'knowledge',
    aliases: ['memory', 'server-memory', '@modelcontextprotocol/server-memory'],
    tags: ['memory', 'knowledge'],
    kind: 'local-command',
    runtimeCommand: 'npx',
    fields: [],
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      env: {},
      enabled: true,
      autoStart: true,
    },
  }),
  entry({
    id: 'sequential-thinking',
    nameKey: 'catalog.market.items.sequentialThinking.name',
    descriptionKey: 'catalog.market.items.sequentialThinking.description',
    category: 'reasoning',
    aliases: [
      'sequential thinking',
      'sequential-thinking',
      '@modelcontextprotocol/server-sequential-thinking',
    ],
    tags: ['reasoning', 'planning'],
    kind: 'local-command',
    runtimeCommand: 'npx',
    fields: [],
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      env: {},
      enabled: true,
      autoStart: true,
    },
  }),
  entry({
    id: 'filesystem',
    nameKey: 'catalog.market.items.filesystem.name',
    descriptionKey: 'catalog.market.items.filesystem.description',
    category: 'files',
    aliases: ['filesystem', 'files', '@modelcontextprotocol/server-filesystem'],
    tags: ['files', 'local'],
    kind: 'local-command',
    runtimeCommand: 'npx',
    fields: [localPathField('allowedPath')],
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{{allowedPath}}'],
      env: {},
      enabled: true,
      autoStart: true,
    },
  }),
  entry({
    id: 'git',
    nameKey: 'catalog.market.items.git.name',
    descriptionKey: 'catalog.market.items.git.description',
    category: 'development',
    aliases: ['git', 'repository', 'mcp-server-git'],
    tags: ['git', 'repository', 'development'],
    kind: 'local-command',
    runtimeCommand: 'uvx',
    fields: [localPathField('repositoryPath')],
    template: {
      command: 'uvx',
      args: ['mcp-server-git', '--repository', '{{repositoryPath}}'],
      env: {},
      enabled: true,
      autoStart: true,
    },
  }),
  entry({
    id: 'time',
    nameKey: 'catalog.market.items.time.name',
    descriptionKey: 'catalog.market.items.time.description',
    category: 'productivity',
    aliases: ['time', 'timezone', 'mcp-server-time'],
    tags: ['time', 'timezone'],
    kind: 'local-command',
    runtimeCommand: 'uvx',
    fields: [],
    template: {
      command: 'uvx',
      args: ['mcp-server-time'],
      env: {},
      enabled: true,
      autoStart: true,
    },
  }),
  entry({
    id: 'playwright',
    nameKey: 'catalog.market.items.playwright.name',
    descriptionKey: 'catalog.market.items.playwright.description',
    category: 'browser',
    aliases: ['playwright', 'browser automation', '@playwright/mcp'],
    tags: ['browser', 'automation', 'testing'],
    kind: 'local-command',
    runtimeCommand: 'npx',
    fields: [],
    template: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: {},
      enabled: true,
      autoStart: true,
    },
  }),
  entry({
    id: 'context7',
    nameKey: 'catalog.market.items.context7.name',
    descriptionKey: 'catalog.market.items.context7.description',
    category: 'knowledge',
    aliases: [
      'context7',
      'context 7',
      'context7 docs',
      'documentation',
      'library docs',
      'mcp.context7.com',
    ],
    tags: ['docs', 'knowledge', 'remote', 'https'],
    kind: 'remote-url',
    transport: 'streamable-http',
    fields: [],
    template: {
      type: 'streamable-http',
      url: 'https://mcp.context7.com/mcp',
      enabled: true,
      autoStart: true,
    },
  }),
];

export function listConnectorMarketplaceEntries(
  query: ConnectorCatalogQuery = {},
): ConnectorMarketplaceEntry[] {
  const normalizedSearch = query.search?.trim().toLocaleLowerCase() ?? '';
  const category = query.category ?? 'all';
  const resolveText = query.resolveText ?? ((key: string) => key);

  return CURATED_CONNECTOR_CATALOG.filter((catalogEntry) => {
    if (category !== 'all' && catalogEntry.category !== category) return false;
    if (!normalizedSearch) return true;

    const searchable = [
      catalogEntry.id,
      resolveText(catalogEntry.nameKey),
      resolveText(catalogEntry.descriptionKey),
      ...catalogEntry.aliases,
      ...catalogEntry.tags,
    ];
    return searchable.some(value => value.toLocaleLowerCase().includes(normalizedSearch));
  });
}

export function validateConnectorFieldValues(
  catalogEntry: ConnectorMarketplaceEntry,
  values: ConnectorFieldValues,
): Record<string, string> {
  const validated: Record<string, string> = {};
  for (const field of catalogEntry.fields) {
    const value = values[field.id]?.trim() ?? '';
    if (field.required && !value) {
      throw new Error(`connector_field_required:${field.id}`);
    }
    if (/\0|\r|\n/.test(value)) {
      throw new Error(`connector_field_invalid:${field.id}`);
    }
    validated[field.id] = value;
  }
  return validated;
}

function resolveTemplateArgument(
  argument: string,
  values: Readonly<Record<string, string>>,
): string {
  return argument.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, fieldId: string) => {
    const value = values[fieldId];
    if (value === undefined) throw new Error(`connector_template_field_missing:${fieldId}`);
    return value;
  });
}

export function buildConnectorInstallPlan(
  catalogEntry: ConnectorMarketplaceEntry,
  values: ConnectorFieldValues = {},
): ConnectorInstallPlan {
  const validated = validateConnectorFieldValues(catalogEntry, values);
  if (catalogEntry.kind === 'remote-url') {
    return {
      connectorId: catalogEntry.id,
      kind: catalogEntry.kind,
      serverConfig: { ...catalogEntry.template },
    };
  }

  return {
    connectorId: catalogEntry.id,
    kind: catalogEntry.kind,
    runtimeCommand: catalogEntry.runtimeCommand,
    serverConfig: {
      ...catalogEntry.template,
      args: catalogEntry.template.args.map(argument => (
        resolveTemplateArgument(argument, validated)
      )),
      env: { ...catalogEntry.template.env },
    },
  };
}
