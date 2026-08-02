import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

type PureStatusHelpers = {
  acquireMcpServerOperationLock: (locks: Set<string>, serverId: string) => boolean;
  getCatalogStatusClass: (status: string) => string;
  getCatalogStatusGroup: (status: string) => string;
  isMcpServerStoppedStatus: (status: string) => boolean;
  isMcpServerTransitioningStatus: (status: string) => boolean;
  releaseMcpServerOperationLock: (locks: Set<string>, serverId: string) => void;
};

const loadPureStatusHelpers = () => {
  const source = readSource('./McpToolsConfig.tsx');
  const start = source.indexOf('function getCatalogStatusGroup');
  const end = source.indexOf('const McpToolsConfig:', start);
  const helperSource = `${source.slice(start, end)}
export {
  acquireMcpServerOperationLock,
  getCatalogStatusClass,
  getCatalogStatusGroup,
  isMcpServerStoppedStatus,
  isMcpServerTransitioningStatus,
  releaseMcpServerOperationLock,
};`;
  const output = transpileModule(helperSource, {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2020,
    },
  }).outputText;
  const helperExports: Partial<PureStatusHelpers> = {};
  Function('exports', output)(helperExports);
  return helperExports as PureStatusHelpers;
};

const {
  acquireMcpServerOperationLock,
  getCatalogStatusClass,
  getCatalogStatusGroup,
  isMcpServerStoppedStatus,
  isMcpServerTransitioningStatus,
  releaseMcpServerOperationLock,
} = loadPureStatusHelpers();

describe('McpToolsConfig empty presentation', () => {
  it.each([
    ['Uninitialized', 'stopped'],
    ['Starting', 'transitioning'],
    ['Connected', 'connected'],
    ['Healthy', 'connected'],
    ['NeedsAuth', 'attention'],
    ['Reconnecting', 'transitioning'],
    ['Failed', 'attention'],
    ['Stopping', 'transitioning'],
    ['Stopped', 'stopped'],
    ['Connected-but-stopped', 'attention'],
  ] as const)('classifies %s into the exact %s catalog group', (status, expected) => {
    expect(getCatalogStatusGroup(status)).toBe(expected);
  });

  it('keeps stopped and transitioning lifecycle states disjoint', () => {
    expect(['Uninitialized', 'Stopped', 'Failed', 'NeedsAuth'].map(isMcpServerStoppedStatus))
      .toEqual([true, true, true, true]);
    expect(['Connected', 'Healthy', 'Starting', 'Reconnecting', 'Stopping']
      .map(isMcpServerStoppedStatus))
      .toEqual([false, false, false, false, false]);
    expect(['Starting', 'Reconnecting', 'Stopping'].map(isMcpServerTransitioningStatus))
      .toEqual([true, true, true]);
  });

  it('presents stopped and uninitialized as neutral rather than failures', () => {
    expect(getCatalogStatusClass('Stopped')).toBe('is-neutral');
    expect(getCatalogStatusClass('Uninitialized')).toBe('is-neutral');
    expect(getCatalogStatusClass('Failed')).toBe('is-error');
  });

  it('acquires and releases a synchronous server operation lock', () => {
    const locks = new Set<string>();

    expect(acquireMcpServerOperationLock(locks, 'github')).toBe(true);
    expect(acquireMcpServerOperationLock(locks, 'github')).toBe(false);
    expect(locks.has('github')).toBe(true);

    releaseMcpServerOperationLock(locks, 'github');
    expect(locks.has('github')).toBe(false);
    expect(acquireMcpServerOperationLock(locks, 'github')).toBe(true);
  });

  it('keeps catalog filter and starter copy aligned in all supported languages', () => {
    const expected = {
      '../../../locales/zh-CN/settings/mcp.json': ['全部', '已连接', '需处理', '已停止'],
      '../../../locales/en-US/settings/mcp.json': ['All', 'Connected', 'Needs attention', 'Stopped'],
      '../../../locales/zh-TW/settings/mcp.json': ['全部', '已連接', '需處理', '已停止'],
    } as const;

    for (const [file, labels] of Object.entries(expected)) {
      const locale = JSON.parse(readSource(file));
      expect(Object.keys(locale.catalog.filters)).toEqual([
        'all',
        'connected',
        'attention',
        'stopped',
      ]);
      expect(Object.values(locale.catalog.filters)).toEqual(labels);
      expect(Object.keys(locale.catalog.starter)).toEqual([
        'localTitle',
        'localDescription',
        'remoteTitle',
        'remoteDescription',
      ]);
      expect(Object.values(locale.catalog.starter).every((value) => (
        typeof value === 'string' && value.trim().length > 0
      ))).toBe(true);
    }
  });

  it('uses one compact JSON action without changing the editor path', () => {
    const source = readSource('./McpToolsConfig.tsx');
    const styles = readSource('./McpToolsConfig.scss');

    expect(source).toContain(
      'const isMcpEmpty = !showJsonEditor && !mcpLoading && !mcpLoadError && servers.length === 0;',
    );
    expect(source).toContain(
      "extra={presentation === 'settings' && !isMcpEmpty ? mcpSectionExtra : undefined}",
    );
    expect(source).toContain(
      "isMcpEmpty && 'void-mcp-tools__section--empty'",
    );
    expect(source).toContain(
      'className="void-collection-empty void-mcp-tools__empty"',
    );
    expect(source).toContain("tMcp('empty.noServers')");
    expect(source).toContain("tMcp('empty.noServersHint')");
    expect(source).toContain('onClick={() => setShowJsonEditor(true)}');
    expect(styles).toContain('&__section--empty');
    expect(styles).toContain('&__empty');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(styles).toContain('border-top: 1px solid var(--workspace-border-subtle);');
    expect(styles).toContain('@container config-panel (max-width: 360px)');
  });

  it('separates the real empty starter from a no-match result and keeps one add entry', () => {
    const source = readSource('./McpToolsConfig.tsx');

    expect(source).toContain("&& servers.length > 0 && (");
    expect(source).toContain('servers.length === 0 ? (');
    expect(source).toContain('className="void-mcp-tools__catalog-starter"');
    expect(source).toContain('className="void-mcp-tools__catalog-starter-card"');
    expect(source).toContain("tMcp('catalog.starter.localTitle')");
    expect(source).toContain("tMcp('catalog.starter.remoteTitle')");
    expect(source).toContain('identity="connector-search-empty"');
    expect(source).toContain("tMcp('empty.noMatchingServers')");
    expect(source).toContain("tMcp('actions.addConnector')");
    expect(source).toContain('onClick={() => setShowJsonEditor(true)}');
    expect(source).toContain('aria-controls="mcp-json-editor"');
  });

  it('provides a standalone catalog without changing the default settings presentation', () => {
    const source = readSource('./McpToolsConfig.tsx');
    const styles = readSource('./McpToolsConfig.scss');

    expect(source).toContain("presentation?: McpToolsPresentation;");
    expect(source).toContain("presentation = 'settings'");
    expect(source).toContain("presentation === 'settings' && (");
    expect(source).toContain("{presentation === 'catalog'\n            && !showJsonEditor");
    expect(source).not.toContain("{presentation === 'settings' && !showJsonEditor && (\n            <div className=\"void-mcp-tools__catalog-toolbar\"");
    expect(source).toContain('CATALOG_PAGE_SIZE = 8');
    expect(source).toContain('filteredCatalogServers.slice(');
    expect(source).toContain('setCatalogPage(0);');
    expect(source).toContain('Math.min(page, Math.max(0, catalogTotalPages - 1))');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain('@container connector-catalog (max-width: 1040px)');
    expect(styles).toContain('grid-template-columns: 1fr;');
    expect(styles).toContain('@container connector-catalog (max-width: 620px)');
    expect(styles).toContain('grid-column: 1 / -1;');
    expect(styles).toContain('grid-column: span 2;');
  });

  it('locks server lifecycle operations synchronously and exposes busy controls', () => {
    const source = readSource('./McpToolsConfig.tsx');

    expect(source).toContain('const serverOperationLocksRef = useRef(new Set<string>());');
    expect(source).toContain('!acquireServerOperation(server.id)');
    expect(source).toContain('serverOperationLocksRef.current.has(server.id)');
    expect(source).toContain('finally {\n      releaseServerOperation(serverId);\n    }');
    expect(source).toContain('disabled={isBusy}');
    expect(source).toContain('aria-busy={isBusy || undefined}');
    expect(source).toContain('aria-busy={isServerControlBusy(server) || undefined}');
    expect(source).toContain('<ToolProcessingDots size={14} />');
    expect(source).toContain("tMcp(`catalog.filters.${filter}`)");
    expect(source).not.toContain("all: 'tabs.servers'");
    expect(source).not.toContain("attention: 'status.needsAuth'");
  });

  it('renders MCP load failures explicitly with a retry action', () => {
    const source = readSource('./McpToolsConfig.tsx');

    expect(source).toContain('const [mcpLoadError, setMcpLoadError]');
    expect(source).toContain('setMcpLoadError(null);');
    expect(source).toContain('setMcpLoadError(error instanceof Error ? error.message : String(error));');
    expect(source).toContain('className="void-collection-empty void-mcp-tools__load-error" role="alert"');
    expect(source).toContain('onClick={() => void loadServers()}');
  });

  it('keeps optional examples collapsed and links the trigger to the named editor', () => {
    const source = readSource('./McpToolsConfig.tsx');
    const styles = readSource('./McpToolsConfig.scss');

    expect(source).toContain('id="mcp-json-editor"');
    expect(source).toContain('aria-controls="mcp-json-editor"');
    expect(source).toContain('aria-expanded={showJsonEditor}');
    expect(source).toContain("aria-label={tMcp('jsonEditor.title')}");
    expect(source).toContain('<details className="void-mcp-tools__json-examples">');
    expect(source).not.toContain(
      '<details open className="void-mcp-tools__json-examples">',
    );
    expect(styles).toContain('&__json-examples-summary');
    expect(styles).toContain('max-width: 680px;');
    expect(styles).toContain('overflow-anchor: none;');
    expect(styles).toContain('font-size: var(--workspace-font-size-meta);');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('animation: none;');
  });
});
