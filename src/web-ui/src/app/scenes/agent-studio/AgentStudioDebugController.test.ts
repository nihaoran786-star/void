import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentStudioDebugController,
  type AgentStudioDebugControllerDeps,
} from './AgentStudioDebugController';

const SCOPE = {
  level: 'project',
  workspace: { backend: 'local', workspaceId: 'ws-1', workspacePath: 'C:/proj' },
} as const;

const CONTENT = {
  personaKey: 'user::void::writer',
  displayName: 'Writer',
  description: 'Writes copy',
  prompt: 'You write copy.',
  tools: ['read_file', 'grep'],
  readonly: true,
  review: false,
  model: 'default',
  allowedParentAgentIds: ['agentic'],
};

function draft(overrides: Record<string, unknown> = {}) {
  return {
    draftId: 'draft-1',
    draftRevisionId: 'draft-rev-1',
    draftFingerprint: 'draft-rev-1',
    definitionId: 'def-1',
    scope: SCOPE,
    baseRevisionId: 'rev-v3',
    status: 'editing',
    content: CONTENT,
    validationEvidence: [],
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  } as never;
}

function createDeps() {
  const calls = {
    bound: [] as Array<Record<string, unknown>>,
    sent: [] as string[],
    outcomes: [] as Array<Record<string, unknown>>,
    released: 0,
    releasedAll: 0,
  };
  let sequence = 0;
  const deps: AgentStudioDebugControllerDeps = {
    bind: vi.fn(async request => {
      sequence += 1;
      calls.bound.push(request as Record<string, unknown>);
      return {
        status: 'bound' as const,
        binding: {
          debugSessionId: `debug-${sequence}`,
          sourceSessionId: (request as { sourceSessionId: string }).sourceSessionId,
          scope: SCOPE,
          definitionId: 'def-1',
          draftId: 'draft-1',
          draftRevisionId: (request as { draftRevisionId: string }).draftRevisionId,
          capabilitySnapshot: ['grep', 'read_file'],
        },
      };
    }),
    send: vi.fn(async (_binding, message) => {
      calls.sent.push(message);
      return { status: 'sent' as const };
    }),
    recordOutcome: vi.fn(async (_binding, outcome) => {
      calls.outcomes.push(outcome as Record<string, unknown>);
      return { status: 'recorded' as const };
    }),
    release: vi.fn(async () => {
      calls.released += 1;
    }),
    releaseAll: vi.fn(async () => {
      calls.releasedAll += 1;
    }),
  };
  return { deps, calls };
}

describe('agent studio debug controller', () => {
  let deps: AgentStudioDebugControllerDeps;
  let calls: ReturnType<typeof createDeps>['calls'];
  let controller: ReturnType<typeof createAgentStudioDebugController>;

  beforeEach(() => {
    ({ deps, calls } = createDeps());
    controller = createAgentStudioDebugController(deps);
  });

  it('binds a debug session to the draft revision being tried out', async () => {
    const result = await controller.attach(draft(), 'source-session-1');

    expect(result.status).toBe('ready');
    expect(calls.bound).toEqual([
      expect.objectContaining({
        draftRevisionId: 'draft-rev-1',
        sourceSessionId: 'source-session-1',
        definitionId: 'def-1',
      }),
    ]);
  });

  it('maps only the runtime-relevant draft fields into the debug persona', async () => {
    await controller.attach(draft(), 'source-session-1');

    expect(calls.bound[0]?.draft).toEqual({
      displayName: 'Writer',
      description: 'Writes copy',
      prompt: 'You write copy.',
      tools: ['read_file', 'grep'],
      readonly: true,
      review: false,
    });
  });

  it('rebinds when the draft advances, so a trial never runs the previous prompt', async () => {
    await controller.attach(draft(), 'source-session-1');
    await controller.attach(
      draft({ draftRevisionId: 'draft-rev-2', content: { ...CONTENT, prompt: 'Changed.' } }),
      'source-session-1',
    );

    expect(calls.bound.map(request => request.draftRevisionId))
      .toEqual(['draft-rev-1', 'draft-rev-2']);
  });

  it('sends through the live binding', async () => {
    await controller.attach(draft(), 'source-session-1');

    const result = await controller.send('try this');

    expect(result.status).toBe('sent');
    expect(calls.sent).toEqual(['try this']);
  });

  it('refuses to send before a debug session has been attached', async () => {
    const result = await controller.send('too early');

    expect(result.status).toBe('detached');
    expect(calls.sent).toEqual([]);
  });

  it('refuses to send after release, so a closed studio cannot keep talking', async () => {
    await controller.attach(draft(), 'source-session-1');
    await controller.detach();

    const result = await controller.send('after close');

    expect(result.status).toBe('detached');
    expect(calls.sent).toEqual([]);
  });

  it('records a passing trial against the revision that ran', async () => {
    await controller.attach(draft(), 'source-session-1');
    await controller.send('try this');

    const result = await controller.recordOutcome({ status: 'passed' });

    expect(result.status).toBe('recorded');
    expect(calls.outcomes).toEqual([{ status: 'passed' }]);
  });

  it('records a failing trial too, so a bad run cannot be quietly dropped', async () => {
    await controller.attach(draft(), 'source-session-1');

    const result = await controller.recordOutcome({
      status: 'failed',
      message: 'ignored the readonly policy',
    });

    expect(result.status).toBe('recorded');
    expect(calls.outcomes[0]).toMatchObject({ status: 'failed' });
  });

  it('refuses to record an outcome with no attached session', async () => {
    const result = await controller.recordOutcome({ status: 'passed' });

    expect(result.status).toBe('detached');
    expect(calls.outcomes).toEqual([]);
  });

  it('releases every debug session when the studio closes, leaking no temporary agent', async () => {
    await controller.attach(draft(), 'source-session-1');
    await controller.attach(draft({ draftRevisionId: 'draft-rev-2' }), 'source-session-1');

    await controller.dispose();

    expect(calls.releasedAll).toBe(1);
  });

  it('never sends to the source session', async () => {
    await controller.attach(draft(), 'source-session-1');
    await controller.send('try this');

    const bindingUsed = (deps.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(bindingUsed.debugSessionId).toBe('debug-1');
    expect(bindingUsed.debugSessionId).not.toBe('source-session-1');
  });

  it('surfaces a bind failure as explicit state instead of a silent dead panel', async () => {
    ({ deps, calls } = createDeps());
    deps.bind = vi.fn(async () => ({
      status: 'failed' as const,
      reason: 'the debug revision is unavailable',
    }));
    controller = createAgentStudioDebugController(deps);

    const result = await controller.attach(draft(), 'source-session-1');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('unavailable');
  });

  it('drops the binding when a bind fails, so the next send does not use a stale one', async () => {
    await controller.attach(draft(), 'source-session-1');
    deps.bind = vi.fn(async () => ({ status: 'failed' as const, reason: 'catalog locked' }));

    await controller.attach(draft({ draftRevisionId: 'draft-rev-2' }), 'source-session-1');
    const result = await controller.send('after failed rebind');

    expect(result.status).toBe('detached');
    expect(calls.sent).toEqual([]);
  });
});
