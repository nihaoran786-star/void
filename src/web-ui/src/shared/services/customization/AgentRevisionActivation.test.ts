import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentRevisionActivator,
  type AgentRevisionActivatorDeps,
} from './AgentRevisionActivation';
import type { AgentDebugBinding } from './AgentDebugSessionBinding';

const SCOPE = {
  level: 'project',
  workspace: { backend: 'local', workspaceId: 'ws-1', workspacePath: 'C:/proj' },
} as const;

const BINDING: AgentDebugBinding = {
  debugSessionId: 'debug-session-1',
  sourceSessionId: 'source-session-1',
  scope: SCOPE,
  definitionId: 'def-1',
  draftId: 'draft-1',
  draftRevisionId: 'draft-rev-1',
  capabilitySnapshot: ['grep', 'read_file'],
};

function passedEvidence(draftRevisionId: string) {
  return {
    validationId: 'val-1',
    draftRevisionId,
    validatedAt: '2026-08-16T00:00:00.000Z',
    status: 'passed' as const,
    debugSessionId: 'debug-session-1',
    capabilitySnapshot: ['grep', 'read_file'],
  };
}

function createDeps(overrides: Partial<AgentRevisionActivatorDeps> = {}) {
  const calls = {
    published: [] as unknown[],
    defaults: [] as unknown[],
    forks: [] as unknown[],
  };
  const deps: AgentRevisionActivatorDeps = {
    isBindingLive: vi.fn(() => true),
    readDraftValidation: vi.fn(async () => [passedEvidence('draft-rev-1')]),
    publish: vi.fn(async request => {
      calls.published.push(request);
      return { status: 'published' as const, revisionId: 'rev-v4' };
    }),
    setDefault: vi.fn(async request => {
      calls.defaults.push(request);
      return { status: 'updated' as const };
    }),
    forkSession: vi.fn(async request => {
      calls.forks.push(request);
      return 'forked-session-1';
    }),
    createIdempotencyKey: () => 'idem-1',
    ...overrides,
  };
  return { deps, calls };
}

const BASE_REQUEST = {
  binding: BINDING,
  expectedBaseRevisionId: 'rev-v3',
  expectedDefaultRevisionId: 'rev-v3',
};

describe('agent revision publish and activation', () => {
  let deps: AgentRevisionActivatorDeps;
  let calls: ReturnType<typeof createDeps>['calls'];
  let activator: ReturnType<typeof createAgentRevisionActivator>;

  beforeEach(() => {
    ({ deps, calls } = createDeps());
    activator = createAgentRevisionActivator(deps);
  });

  it('publishes the validated draft as a new revision', async () => {
    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });

    expect(result.status).toBe('activated');
    if (result.status !== 'activated') return;
    expect(result.revisionId).toBe('rev-v4');
    expect(calls.published).toHaveLength(1);
  });

  it('leaves the source session pinned when the user continues on the current revision', async () => {
    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });

    expect(result.status).toBe('activated');
    expect(calls.defaults).toEqual([]);
    expect(calls.forks).toEqual([]);
  });

  it('forks a new session pinned to the new revision without rebinding the source', async () => {
    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'fork', forkFromMessageId: 'msg-7' },
    });

    expect(result.status).toBe('activated');
    if (result.status !== 'activated') return;
    expect(result.forkedSessionId).toBe('forked-session-1');
    expect(calls.forks).toEqual([
      {
        sourceSessionId: 'source-session-1',
        definitionId: 'def-1',
        revisionId: 'rev-v4',
        fromMessageId: 'msg-7',
      },
    ]);
    expect(calls.defaults).toEqual([]);
  });

  it('sets the future default without forking or touching any running session', async () => {
    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'future-default' },
    });

    expect(result.status).toBe('activated');
    expect(calls.forks).toEqual([]);
    expect(calls.defaults).toEqual([
      {
        scope: SCOPE,
        definitionId: 'def-1',
        revisionId: 'rev-v4',
        expectedDefaultRevisionId: 'rev-v3',
        idempotencyKey: 'idem-1',
      },
    ]);
  });

  it('never passes the source session to publish or set-default', async () => {
    await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'future-default' },
    });

    const serialized = JSON.stringify([...calls.published, ...calls.defaults]);
    expect(serialized).not.toContain('source-session-1');
  });

  it('refuses to publish a draft with no passing validation evidence', async () => {
    ({ deps, calls } = createDeps({ readDraftValidation: vi.fn(async () => []) }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });

    expect(result.status).toBe('unvalidated');
    expect(calls.published).toEqual([]);
  });

  it('does not accept evidence recorded against a different draft revision', async () => {
    ({ deps, calls } = createDeps({
      readDraftValidation: vi.fn(async () => [passedEvidence('draft-rev-0')]),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });

    expect(result.status).toBe('unvalidated');
    expect(calls.published).toEqual([]);
  });

  it('does not accept a failed debug run as validation', async () => {
    ({ deps, calls } = createDeps({
      readDraftValidation: vi.fn(async () => [
        { ...passedEvidence('draft-rev-1'), status: 'failed' as const },
      ]),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });

    expect(result.status).toBe('unvalidated');
    expect(calls.published).toEqual([]);
  });

  it('refuses to publish from a superseded binding', async () => {
    ({ deps, calls } = createDeps({ isBindingLive: vi.fn(() => false) }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });

    expect(result.status).toBe('stale');
    expect(calls.published).toEqual([]);
  });

  it('reports a base revision conflict without attempting activation', async () => {
    ({ deps, calls } = createDeps({
      publish: vi.fn(async () => ({ status: 'conflict' as const, reason: 'base revision moved' })),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'future-default' },
    });

    expect(result.status).toBe('conflict');
    expect(calls.defaults).toEqual([]);
    expect(calls.forks).toEqual([]);
  });

  it('treats a replayed publish as success rather than an error', async () => {
    ({ deps, calls } = createDeps({
      publish: vi.fn(async () => ({ status: 'already_published' as const, revisionId: 'rev-v4' })),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'future-default' },
    });

    expect(result.status).toBe('activated');
    expect(calls.defaults).toHaveLength(1);
  });

  it('reports a published-but-not-activated state when setting the default fails', async () => {
    ({ deps, calls } = createDeps({
      setDefault: vi.fn(async () => {
        throw new Error('default pointer CAS failed');
      }),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'future-default' },
    });

    expect(result.status).toBe('published_not_activated');
    if (result.status !== 'published_not_activated') return;
    expect(result.revisionId).toBe('rev-v4');
    expect(result.reason).toContain('CAS');
  });

  it('reports a published-but-not-activated state when the fork fails', async () => {
    ({ deps, calls } = createDeps({
      forkSession: vi.fn(async () => {
        throw new Error('fork target message is missing');
      }),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'fork' },
    });

    expect(result.status).toBe('published_not_activated');
    if (result.status !== 'published_not_activated') return;
    expect(result.revisionId).toBe('rev-v4');
  });

  it('reports an already-default pointer as activated, so a retry is not an error', async () => {
    ({ deps, calls } = createDeps({
      setDefault: vi.fn(async () => ({ status: 'already_default' as const })),
    }));
    activator = createAgentRevisionActivator(deps);

    const result = await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'future-default' },
    });

    expect(result.status).toBe('activated');
  });

  it('publishing alone never moves the default pointer', async () => {
    await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'continue' },
    });
    await activator.publishAndActivate({
      ...BASE_REQUEST,
      action: { kind: 'fork' },
    });

    expect(calls.defaults).toEqual([]);
  });
});
