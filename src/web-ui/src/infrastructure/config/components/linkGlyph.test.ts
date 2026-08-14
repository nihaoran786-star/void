import { describe, expect, it } from 'vitest';
import { LINK_PATHS, resolveLinkPath } from './linkGlyph';

describe('resolveLinkPath', () => {
  it('is deterministic per connector identity', () => {
    expect(resolveLinkPath('github')).toBe(resolveLinkPath('github'));
    expect(resolveLinkPath('context7')).toBe(resolveLinkPath('context7'));
  });

  it('always returns one of the four canonical routes', () => {
    ['github', 'local-filesystem', 'postgres-mcp', 'gmail', 'context7', 'memory', 'fetch']
      .forEach((identity) => {
        expect(LINK_PATHS).toContain(resolveLinkPath(identity));
      });
  });

  it('varies routes across distinct identities', () => {
    const routes = new Set(
      [
        'github',
        'local-filesystem',
        'postgres-mcp',
        'gmail',
        'context7',
        'memory',
        'fetch',
        'sqlite',
      ].map(resolveLinkPath),
    );
    expect(routes.size).toBeGreaterThan(1);
  });
});
