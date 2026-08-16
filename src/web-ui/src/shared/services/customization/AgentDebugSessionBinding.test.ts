import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentDebugSessionBinder,
  type AgentDebugSessionBinderDeps,
} from './AgentDebugSessionBinding';

const SCOPE = {
  level: 'project',
  workspace: { backend: 'local', workspaceId: 'ws-1', workspacePath: 'C:/proj' },
} as const;

function draft(overrides: Partial<{ prompt: string; tools: string[] }> = {}) {
  return {
    displayName: 'Reviewer',
    description: 'Reviews diffs',
    prompt: overrides.prompt ?? 'You review diffs.',
    tools: overrides.tools ?? ['read_file', 'grep'],
    readonly: true,
    review: true,
  };
}

function createDeps(): AgentDebugSessionBinderDeps & {
  calls: {
    created: string[];
    sent: Array<{ sessionId: string; message: string }>;
    released: string[];
    validated: Array<{ draftRevisionId: string; status: string; debugSessionId?: string }>;
  };
} {
  const calls = {
    created: [] as string[],
    sent: [] as Array<{ sessionId: string; message: string }>,
    released: [] as string[],
    validated: [] as Array<{ draftRevisionId: string; status: string; debugSessionId?: string }>,
  };
  let sequence = 0;
  return {
    calls,
    createDebugSession: vi.fn(async () => {
      sequence += 1;
      const sessionId = `debug-session-${sequence}`;
      calls.created.push(sessionId);
      return {
        sessionId,
        subagentId: `sub-${sequence}`,
        subagentKey: `user::void::sub-${sequence}`,
        draftFingerprint: `fp-${sequence}`,
        workspacePath: SCOPE.workspace.workspacePath,
      };
    }),
    disposeDebugSession: vi.fn(async handle => {
      calls.released.push(handle.sessionId);
    }),
    sendMessage: vi.fn(async (handle, message) => {
      calls.sent.push({ sessionId: handle.sessionId, message });
    }),
    recordValidation: vi.fn(async request => {
      calls.validated.push({
        draftRevisionId: request.draftRevisionId,
        status: request.evidence.status,
        debugSessionId: request.evidence.debugSessionId,
      });
    }),
    createIdempotencyKey: () => `idem-${calls.validated.length + 1}`,
  };
}

const BIND_REQUEST = {
  scope: SCOPE,
  definitionId: 'def-1',
  draftId: 'draft-1',
  draftRevisionId: 'rev-1',
  sourceSessionId: 'source-session-1',
  draft: draft(),
};

describe('agent debug session binding', () => {
  let deps: ReturnType<typeof createDeps>;
  let binder: ReturnType<typeof createAgentDebugSessionBinder>;

  beforeEach(() => {
    deps = createDeps();
    binder = createAgentDebugSessionBinder(deps);
  });

  it('binds a debug session to the source session and the exact draft revision', async () => {
    const result = await binder.bind(BIND_REQUEST);

    expect(result.status).toBe('bound');
    if (result.status !== 'bound') return;
    expect(result.binding.sourceSessionId).toBe('source-session-1');
    expect(result.binding.draftRevisionId).toBe('rev-1');
    expect(result.binding.debugSessionId).toBe('debug-session-1');
  });

  it('never reuses the source session as the debug session', async () => {
    const result = await binder.bind(BIND_REQUEST);

    expect(result.status).toBe('bound');
    if (result.status !== 'bound') return;
    expect(result.binding.debugSessionId).not.toBe(result.binding.sourceSessionId);
  });

  it('snapshots the draft capabilities at bind time', async () => {
    const result = await binder.bind({
      ...BIND_REQUEST,
      draft: draft({ tools: ['grep', 'read_file', 'grep', ' '] }),
    });

    expect(result.status).toBe('bound');
    if (result.status !== 'bound') return;
    expect(result.binding.capabilitySnapshot).toEqual(['grep', 'read_file']);
  });

  it('sends through the bound debug session', async () => {
    const bound = await binder.bind(BIND_REQUEST);
    if (bound.status !== 'bound') throw new Error('expected bound');

    const sent = await binder.send(bound.binding, 'hello');

    expect(sent.status).toBe('sent');
    expect(deps.calls.sent).toEqual([{ sessionId: 'debug-session-1', message: 'hello' }]);
  });

  it('refuses to send on a binding whose draft revision has moved on', async () => {
    const first = await binder.bind(BIND_REQUEST);
    if (first.status !== 'bound') throw new Error('expected bound');

    await binder.bind({ ...BIND_REQUEST, draftRevisionId: 'rev-2', draft: draft({ prompt: 'New.' }) });

    const sent = await binder.send(first.binding, 'late message');

    expect(sent.status).toBe('stale');
    expect(deps.calls.sent).toEqual([]);
  });

  it('releases the superseded debug session when the draft revision advances', async () => {
    const first = await binder.bind(BIND_REQUEST);
    if (first.status !== 'bound') throw new Error('expected bound');

    await binder.bind({ ...BIND_REQUEST, draftRevisionId: 'rev-2', draft: draft({ prompt: 'New.' }) });

    expect(deps.calls.released).toEqual(['debug-session-1']);
    expect(deps.calls.created).toEqual(['debug-session-1', 'debug-session-2']);
  });

  it('refuses to send on a released binding', async () => {
    const bound = await binder.bind(BIND_REQUEST);
    if (bound.status !== 'bound') throw new Error('expected bound');

    await binder.release(bound.binding);
    const sent = await binder.send(bound.binding, 'after release');

    expect(sent.status).toBe('stale');
    expect(deps.calls.sent).toEqual([]);
  });

  it('records validation evidence against the revision that actually ran', async () => {
    const bound = await binder.bind(BIND_REQUEST);
    if (bound.status !== 'bound') throw new Error('expected bound');
    await binder.send(bound.binding, 'hello');

    const recorded = await binder.recordOutcome(bound.binding, { status: 'passed' });

    expect(recorded.status).toBe('recorded');
    expect(deps.calls.validated).toEqual([
      { draftRevisionId: 'rev-1', status: 'passed', debugSessionId: 'debug-session-1' },
    ]);
  });

  it('refuses to record evidence for a superseded binding', async () => {
    const first = await binder.bind(BIND_REQUEST);
    if (first.status !== 'bound') throw new Error('expected bound');
    await binder.bind({ ...BIND_REQUEST, draftRevisionId: 'rev-2', draft: draft({ prompt: 'New.' }) });

    const recorded = await binder.recordOutcome(first.binding, { status: 'passed' });

    expect(recorded.status).toBe('stale');
    expect(deps.calls.validated).toEqual([]);
  });

  it('records a failed run as evidence too, so a failure cannot be silently discarded', async () => {
    const bound = await binder.bind(BIND_REQUEST);
    if (bound.status !== 'bound') throw new Error('expected bound');

    const recorded = await binder.recordOutcome(bound.binding, {
      status: 'failed',
      message: 'The agent ignored the readonly policy.',
    });

    expect(recorded.status).toBe('recorded');
    expect(deps.calls.validated[0]).toMatchObject({ draftRevisionId: 'rev-1', status: 'failed' });
  });

  it('keeps bindings for different drafts independent', async () => {
    const a = await binder.bind(BIND_REQUEST);
    const b = await binder.bind({
      ...BIND_REQUEST,
      definitionId: 'def-2',
      draftId: 'draft-2',
      draftRevisionId: 'rev-9',
    });
    if (a.status !== 'bound' || b.status !== 'bound') throw new Error('expected bound');

    expect(deps.calls.released).toEqual([]);
    await expect(binder.send(a.binding, 'still fine')).resolves.toMatchObject({ status: 'sent' });
    await expect(binder.send(b.binding, 'also fine')).resolves.toMatchObject({ status: 'sent' });
  });

  it('reuses the live debug session when the same draft revision is bound again', async () => {
    const first = await binder.bind(BIND_REQUEST);
    const second = await binder.bind(BIND_REQUEST);
    if (first.status !== 'bound' || second.status !== 'bound') throw new Error('expected bound');

    expect(second.binding.debugSessionId).toBe(first.binding.debugSessionId);
    expect(deps.calls.created).toEqual(['debug-session-1']);
    expect(deps.calls.released).toEqual([]);
  });

  it('reports a bind failure as explicit state instead of throwing', async () => {
    deps.createDebugSession = vi.fn(async () => {
      throw new Error('Agent debug revision unavailable; cannot bind the persona.');
    });
    binder = createAgentDebugSessionBinder(deps);

    const result = await binder.bind(BIND_REQUEST);

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('revision unavailable');
  });

  it('releasing a binding never touches the source session', async () => {
    const bound = await binder.bind(BIND_REQUEST);
    if (bound.status !== 'bound') throw new Error('expected bound');

    await binder.release(bound.binding);

    expect(deps.calls.released).toEqual(['debug-session-1']);
    expect(deps.calls.released).not.toContain('source-session-1');
  });

  it('releases every live binding when the studio closes', async () => {
    const a = await binder.bind(BIND_REQUEST);
    const b = await binder.bind({
      ...BIND_REQUEST,
      definitionId: 'def-2',
      draftId: 'draft-2',
      draftRevisionId: 'rev-9',
    });
    if (a.status !== 'bound' || b.status !== 'bound') throw new Error('expected bound');

    await binder.releaseAll();

    expect(deps.calls.released.sort()).toEqual(['debug-session-1', 'debug-session-2']);
    await expect(binder.send(a.binding, 'nope')).resolves.toMatchObject({ status: 'stale' });
    await expect(binder.send(b.binding, 'nope')).resolves.toMatchObject({ status: 'stale' });
  });
});
