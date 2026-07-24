import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

describe('McpToolsConfig empty presentation', () => {
  it('uses one compact JSON action without changing the editor path', () => {
    const source = readSource('./McpToolsConfig.tsx');
    const styles = readSource('./McpToolsConfig.scss');

    expect(source).toContain(
      'const isMcpEmpty = !showJsonEditor && !mcpLoading && servers.length === 0;',
    );
    expect(source).toContain('extra={isMcpEmpty ? undefined : mcpSectionExtra}');
    expect(source).toContain(
      'className={isMcpEmpty ? \'void-mcp-tools__section--empty\' : \'\'}',
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
