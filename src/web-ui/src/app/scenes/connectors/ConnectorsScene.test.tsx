import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

describe('ConnectorsScene boundary', () => {
  it('composes the existing MCP interface without importing transports', () => {
    const source = readSource('./ConnectorsScene.tsx');

    expect(source).toContain('<McpToolsConfig presentation="catalog" />');
    expect(source).not.toContain('MCPAPI');
    expect(source).not.toContain('@tauri-apps');
    expect(source).not.toContain('node:fs');
  });

  it('is registered as a complete standalone scene', () => {
    const types = readSource('../../components/SceneBar/types.ts');
    const registry = readSource('../registry.ts');
    const viewport = readSource('../SceneViewport.tsx');

    expect(types).toContain("| 'connectors'");
    expect(registry).toContain("id: 'connectors' as SceneTabId");
    expect(registry).toContain("labelKey: 'nav.items.connectors'");
    expect(viewport).toContain("import('./connectors/ConnectorsScene')");
    expect(viewport).toContain("case 'connectors':");
    expect(viewport).toContain('return <ConnectorsScene />;');
  });
});
