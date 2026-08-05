import { describe, expect, it } from 'vitest';
import { BookOpen, Cable, Database, FolderOpen, Github, Mail } from 'lucide-react';
import { resolveConnectorCatalogIcon } from './connectorCatalogIcons';

describe('resolveConnectorCatalogIcon', () => {
  it('maps common connector identities to familiar service categories', () => {
    expect(resolveConnectorCatalogIcon('github')).toBe(Github);
    expect(resolveConnectorCatalogIcon('local-filesystem')).toBe(FolderOpen);
    expect(resolveConnectorCatalogIcon('postgres-mcp')).toBe(Database);
    expect(resolveConnectorCatalogIcon('gmail')).toBe(Mail);
    expect(resolveConnectorCatalogIcon('context7', 'Context7 docs')).toBe(BookOpen);
  });

  it('uses the connector glyph when no category can be inferred', () => {
    expect(resolveConnectorCatalogIcon('private-capability')).toBe(Cable);
  });
});
