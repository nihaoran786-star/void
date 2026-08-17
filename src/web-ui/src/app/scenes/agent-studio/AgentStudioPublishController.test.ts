import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentStudioPublishController,
  type AgentStudioPublishControllerDeps,
} from './AgentStudioPublishController';

const SCOPE = {
  level: 'project',
  workspace: { backend: 'local', workspaceId: 'ws-1', workspacePath: 'C:/proj' },
} as const;

const BINDING = {
  debugSessionId: 'debug-1',
  sourceSessionId: 'source-session-1',
  scope: SCOPE,
  definitionId: 'def-1',
  draftId: 'draft-1',
  draftRevisionId: 'draft-rev-1',
  capabilitySnapshot: ['grep', 'read_file'],
} as never;

function draft(overrides: Record<string, unknown> = {}) {
  return {
    draftId: 'draft-1',
    draftRevisionId: 'draft-rev-1',
    draftFingerprint: 'draft-rev-1',
    definitionId: 'def-1',
    scope: SCOPE,
    baseRevisionId: 'rev-v3',
    status: 'validated',
    content: {},
    validationEvidence: [],
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  } as never;
}

function createDeps(overrides: Partial<AgentStudioPublishControllerDeps> = {}) {
  const calls = { activated: [] as Array<Record<string, unknown>>, released: 0 };
  const deps: AgentStudioPublishControllerDeps = {
    currentBinding: () => BINDING,
    readDefaultRevisionId: vi.fn(async () => 'rev-v3'),
    publishAndActivate: vi.fn(async request => {
      calls.activated.push(request as Record<string, unknown>);
      return { status: 'activated' as const, revisionId: 'rev-v4' };
    }),
    releaseDebugSession: vi.fn(async () => {
      calls.released += 1;
    }),
    ...overrides,
  };
  return { deps, calls };
}

describe('agent studio publish controller', () => {
  let deps: AgentStudioPublishControllerDeps;
  let calls: ReturnType<typeof createDeps>['calls'];
  let controller: ReturnType<typeof createAgentStudioPublishController>;

  beforeEach(() => {
    ({ deps, calls } = createDeps());
    controller = createAgentStudioPublishController(deps);
  });

  it('publishes with the draft base revision as the compare-and-swap expectation', async () => {
    const result = await controller.publish(draft(), { kind: 'continue' });

    expect(result.status).toBe('activated');
    expect(calls.activated[0]).toMatchObject({
      expectedBaseRevisionId: 'rev-v3',
      expectedDefaultRevisionId: 'rev-v3',
      action: { kind: 'continue' },
    });
  });

  it('publishes the binding that actually ran, not a copy of the draft', async () => {
    await controller.publish(draft(), { kind: 'continue' });

    expect(calls.activated[0]?.binding).toBe(BINDING);
  });

  it('refuses to publish a draft that has been edited since the trial', async () => {
    const result = await controller.publish(
      draft({ draftRevisionId: 'draft-rev-2' }),
      { kind: 'continue' },
    );

    expect(result.status).toBe('stale');
    expect(calls.activated).toEqual([]);
  });

  it('refuses to publish with no trial conversation attached', async () => {
    ({ deps, calls } = createDeps({ currentBinding: () => null }));
    controller = createAgentStudioPublishController(deps);

    const result = await controller.publish(draft(), { kind: 'continue' });

    expect(result.status).toBe('untried');
    expect(calls.activated).toEqual([]);
  });

  it('carries the fork action and its message anchor through', async () => {
    await controller.publish(draft(), { kind: 'fork', forkFromMessageId: 'msg-7' });

    expect(calls.activated[0]?.action).toEqual({ kind: 'fork', forkFromMessageId: 'msg-7' });
  });

  it('reads the current default pointer so the future-default action is a real CAS', async () => {
    ({ deps, calls } = createDeps({ readDefaultRevisionId: vi.fn(async () => 'rev-v2') }));
    controller = createAgentStudioPublishController(deps);

    await controller.publish(draft(), { kind: 'future-default' });

    expect(calls.activated[0]).toMatchObject({ expectedDefaultRevisionId: 'rev-v2' });
  });

  it('accepts a definition that has never had a default', async () => {
    ({ deps, calls } = createDeps({ readDefaultRevisionId: vi.fn(async () => null) }));
    controller = createAgentStudioPublishController(deps);

    const result = await controller.publish(
      draft({ baseRevisionId: null }),
      { kind: 'future-default' },
    );

    expect(result.status).toBe('activated');
    expect(calls.activated[0]).toMatchObject({
      expectedBaseRevisionId: null,
      expectedDefaultRevisionId: null,
    });
  });

  it('releases the trial session once its draft has been published', async () => {
    await controller.publish(draft(), { kind: 'continue' });

    expect(calls.released).toBe(1);
  });

  it('keeps the trial session when publishing was rejected', async () => {
    ({ deps, calls } = createDeps({
      publishAndActivate: vi.fn(async () => ({
        status: 'conflict' as const,
        reason: 'base revision moved',
      })),
    }));
    controller = createAgentStudioPublishController(deps);

    const result = await controller.publish(draft(), { kind: 'continue' });

    expect(result.status).toBe('conflict');
    expect(calls.released).toBe(0);
  });

  it('surfaces a published-but-not-activated result without claiming success', async () => {
    ({ deps, calls } = createDeps({
      publishAndActivate: vi.fn(async () => ({
        status: 'published_not_activated' as const,
        revisionId: 'rev-v4',
        reason: 'default pointer CAS failed',
      })),
    }));
    controller = createAgentStudioPublishController(deps);

    const result = await controller.publish(draft(), { kind: 'future-default' });

    expect(result.status).toBe('published_not_activated');
    if (result.status !== 'published_not_activated') return;
    expect(result.revisionId).toBe('rev-v4');
  });

  it('releases the trial session for a published-but-not-activated result too', async () => {
    ({ deps, calls } = createDeps({
      publishAndActivate: vi.fn(async () => ({
        status: 'published_not_activated' as const,
        revisionId: 'rev-v4',
        reason: 'fork failed',
      })),
    }));
    controller = createAgentStudioPublishController(deps);

    await controller.publish(draft(), { kind: 'fork' });

    // The revision exists and is immutable, so its trial session is spent
    // whether or not the activation landed.
    expect(calls.released).toBe(1);
  });

  it('reports an unvalidated draft without pretending it was published', async () => {
    ({ deps, calls } = createDeps({
      publishAndActivate: vi.fn(async () => ({
        status: 'unvalidated' as const,
        reason: 'no passing debug run',
      })),
    }));
    controller = createAgentStudioPublishController(deps);

    const result = await controller.publish(draft(), { kind: 'continue' });

    expect(result.status).toBe('unvalidated');
    expect(calls.released).toBe(0);
  });
});
