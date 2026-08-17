import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentStudioSession,
  type AgentStudioSessionDeps,
} from './agentStudioSession';

const SCOPE = {
  level: 'project',
  workspace: { backend: 'local', workspaceId: 'ws-1', workspacePath: 'C:/proj' },
} as const;

const CONTENT = {
  personaKey: 'user::void::writer',
  displayName: 'Writer',
  description: 'Writes copy',
  prompt: 'You write copy.',
  tools: ['read_file'],
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

function createDeps(overrides: Partial<AgentStudioSessionDeps> = {}) {
  const deps: AgentStudioSessionDeps = {
    openDraft: vi.fn(async () => ({ status: 'open' as const, draft: draft() })),
    saveDraft: vi.fn(async () => ({
      status: 'saved' as const,
      draft: draft({ draftRevisionId: 'draft-rev-2', draftFingerprint: 'draft-rev-2' }),
    })),
    attachTrial: vi.fn(async () => ({ status: 'ready' as const })),
    detachTrial: vi.fn(async () => undefined),
    publish: vi.fn(async () => ({ status: 'activated' as const, revisionId: 'rev-v4' })),
    ...overrides,
  };
  return deps;
}

describe('agent studio session', () => {
  let deps: AgentStudioSessionDeps;
  let studio: ReturnType<typeof createAgentStudioSession>;

  beforeEach(() => {
    deps = createDeps();
    studio = createAgentStudioSession(deps);
  });

  it('starts with nothing open', () => {
    expect(studio.state.phase).toBe('closed');
    expect(studio.state.canPublish).toBe(false);
  });

  it('opens a draft and reports it as editable but untried', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');

    expect(studio.state.phase).toBe('editing');
    expect(studio.state.trial).toBe('untried');
    expect(studio.state.canPublish).toBe(false);
  });

  it('allows publishing only after the current draft has been tried', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    expect(studio.state.canPublish).toBe(false);

    await studio.startTrial();

    expect(studio.state.trial).toBe('ready');
    expect(studio.state.canPublish).toBe(true);
  });

  it('invalidates the trial when the draft is saved again', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();
    expect(studio.state.canPublish).toBe(true);

    await studio.save({ ...CONTENT, prompt: 'You write short copy.' });

    expect(studio.state.trial).toBe('untried');
    expect(studio.state.canPublish).toBe(false);
  });

  it('detaches the superseded trial when the draft is saved', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();

    await studio.save(CONTENT);

    expect(deps.detachTrial).toHaveBeenCalledTimes(1);
  });

  it('does not publish while the draft is untried', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');

    const result = await studio.publish({ kind: 'continue' });

    expect(result.status).toBe('untried');
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('keeps an invalid save from advancing the draft or clearing the trial', async () => {
    deps = createDeps({
      saveDraft: vi.fn(async () => ({
        status: 'invalid' as const,
        reason: 'An agent prompt cannot be empty.',
      })),
    });
    studio = createAgentStudioSession(deps);
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();

    const result = await studio.save({ ...CONTENT, prompt: '' });

    expect(result.status).toBe('invalid');
    expect(studio.state.draft?.draftRevisionId).toBe('draft-rev-1');
    expect(studio.state.canPublish).toBe(true);
    expect(deps.detachTrial).not.toHaveBeenCalled();
  });

  it('reports a failed trial attach without pretending the draft is publishable', async () => {
    deps = createDeps({
      attachTrial: vi.fn(async () => ({ status: 'failed' as const, reason: 'runtime unavailable' })),
    });
    studio = createAgentStudioSession(deps);
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');

    const result = await studio.startTrial();

    expect(result.status).toBe('failed');
    expect(studio.state.trial).toBe('untried');
    expect(studio.state.canPublish).toBe(false);
  });

  it('closes the studio and releases the trial', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();

    await studio.close();

    expect(studio.state.phase).toBe('closed');
    expect(studio.state.canPublish).toBe(false);
    expect(deps.detachTrial).toHaveBeenCalled();
  });

  it('returns to an untried draft after a successful publish', async () => {
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();

    const result = await studio.publish({ kind: 'future-default' });

    expect(result.status).toBe('activated');
    // The published revision consumed its trial; the draft must be tried again
    // before it can be published a second time.
    expect(studio.state.trial).toBe('untried');
    expect(studio.state.canPublish).toBe(false);
  });

  it('keeps the trial usable when publishing was rejected', async () => {
    deps = createDeps({
      publish: vi.fn(async () => ({ status: 'conflict' as const, reason: 'base revision moved' })),
    });
    studio = createAgentStudioSession(deps);
    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();

    const result = await studio.publish({ kind: 'continue' });

    expect(result.status).toBe('conflict');
    expect(studio.state.canPublish).toBe(true);
  });

  it('notifies a subscriber on every state change', async () => {
    const changes: string[] = [];
    studio.subscribe(state => changes.push(`${state.phase}:${state.trial}`));

    await studio.open({ scope: SCOPE, definitionId: 'def-1' }, 'source-1');
    await studio.startTrial();

    expect(changes).toContain('editing:untried');
    expect(changes).toContain('editing:ready');
  });
});
