import { describe, expect, it, vi } from 'vitest';

import { checkLegacyAgentWriteAllowed } from './legacyAgentWriteGuard';

const SCOPE = {
  level: 'project',
  workspace: { backend: 'local', workspaceId: 'ws-1', workspacePath: 'C:/proj' },
} as const;

describe('legacy agent write guard', () => {
  it('allows writing an agent the catalog does not own', async () => {
    const result = await checkLegacyAgentWriteAllowed({
      scope: SCOPE,
      personaKey: 'user::void::untracked',
      resolveByPersonaKey: vi.fn(async () => {
        throw Object.assign(new Error('not found'), { code: 'not_found' });
      }),
    });

    expect(result.status).toBe('allowed');
  });

  it('blocks writing an agent the catalog has taken over', async () => {
    const result = await checkLegacyAgentWriteAllowed({
      scope: SCOPE,
      personaKey: 'user::void::managed',
      resolveByPersonaKey: vi.fn(async () => ({ definitionId: 'def-1' })),
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.definitionId).toBe('def-1');
  });

  it('allows the write when there is no persona key to check yet', async () => {
    const resolveByPersonaKey = vi.fn();

    const result = await checkLegacyAgentWriteAllowed({
      scope: SCOPE,
      personaKey: '  ',
      resolveByPersonaKey,
    });

    expect(result.status).toBe('allowed');
    expect(resolveByPersonaKey).not.toHaveBeenCalled();
  });

  it('fails closed when the catalog cannot be read, rather than risking a dual write', async () => {
    const result = await checkLegacyAgentWriteAllowed({
      scope: SCOPE,
      personaKey: 'user::void::managed',
      resolveByPersonaKey: vi.fn(async () => {
        throw Object.assign(new Error('the catalog is locked'), { code: 'read_failed' });
      }),
    });

    expect(result.status).toBe('unknown');
    if (result.status !== 'unknown') return;
    expect(result.reason).toContain('locked');
  });

  it('treats a plain error without a code as unreadable rather than absent', async () => {
    const result = await checkLegacyAgentWriteAllowed({
      scope: SCOPE,
      personaKey: 'user::void::managed',
      resolveByPersonaKey: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    expect(result.status).toBe('unknown');
  });
});
