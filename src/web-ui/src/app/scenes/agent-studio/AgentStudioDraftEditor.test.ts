import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentStudioDraftEditor,
  type AgentStudioDraftEditorDeps,
} from './AgentStudioDraftEditor';

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

function draftRecord(overrides: Record<string, unknown> = {}) {
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
  };
}

function createDeps(overrides: Partial<AgentStudioDraftEditorDeps> = {}) {
  const calls = { opened: [] as unknown[], saved: [] as unknown[] };
  const deps: AgentStudioDraftEditorDeps = {
    openDraft: vi.fn(async request => {
      calls.opened.push(request);
      return draftRecord();
    }),
    saveDraft: vi.fn(async request => {
      calls.saved.push(request);
      return draftRecord({
        draftRevisionId: 'draft-rev-2',
        draftFingerprint: 'draft-rev-2',
        content: (request as { content: typeof CONTENT }).content,
      });
    }),
    createIdempotencyKey: () => 'idem-1',
    ...overrides,
  };
  return { deps, calls };
}

describe('agent studio draft editor', () => {
  let deps: AgentStudioDraftEditorDeps;
  let calls: ReturnType<typeof createDeps>['calls'];
  let editor: ReturnType<typeof createAgentStudioDraftEditor>;

  beforeEach(() => {
    ({ deps, calls } = createDeps());
    editor = createAgentStudioDraftEditor(deps);
  });

  it('opens a draft for the definition being authored', async () => {
    const result = await editor.open({ scope: SCOPE, definitionId: 'def-1' });

    expect(result.status).toBe('open');
    if (result.status !== 'open') return;
    expect(result.draft.draftId).toBe('draft-1');
    expect(calls.opened).toHaveLength(1);
  });

  it('saves against the exact draft revision it opened', async () => {
    const opened = await editor.open({ scope: SCOPE, definitionId: 'def-1' });
    if (opened.status !== 'open') throw new Error('expected open');

    const saved = await editor.save(opened.draft, { ...CONTENT, prompt: 'You write short copy.' });

    expect(saved.status).toBe('saved');
    expect(calls.saved).toEqual([
      expect.objectContaining({
        definitionId: 'def-1',
        draftId: 'draft-1',
        expectedDraftRevisionId: 'draft-rev-1',
      }),
    ]);
  });

  it('advances the draft revision after a save, so the next save cannot replay the old one', async () => {
    const opened = await editor.open({ scope: SCOPE, definitionId: 'def-1' });
    if (opened.status !== 'open') throw new Error('expected open');

    const saved = await editor.save(opened.draft, CONTENT);
    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') return;
    expect(saved.draft.draftRevisionId).toBe('draft-rev-2');
    expect(saved.draft.draftRevisionId).not.toBe(opened.draft.draftRevisionId);
  });

  it('refuses to save content whose persona key differs from the draft', async () => {
    const opened = await editor.open({ scope: SCOPE, definitionId: 'def-1' });
    if (opened.status !== 'open') throw new Error('expected open');

    const result = await editor.save(opened.draft, {
      ...CONTENT,
      personaKey: 'user::void::someone-else',
    });

    expect(result.status).toBe('invalid');
    expect(calls.saved).toEqual([]);
  });

  it('refuses to save an empty prompt rather than publishing a mute agent later', async () => {
    const opened = await editor.open({ scope: SCOPE, definitionId: 'def-1' });
    if (opened.status !== 'open') throw new Error('expected open');

    const result = await editor.save(opened.draft, { ...CONTENT, prompt: '   ' });

    expect(result.status).toBe('invalid');
    expect(calls.saved).toEqual([]);
  });

  it('reports a compare-and-swap conflict as explicit state', async () => {
    ({ deps, calls } = createDeps({
      saveDraft: vi.fn(async () => {
        throw new Error('draft revision conflict');
      }),
    }));
    editor = createAgentStudioDraftEditor(deps);
    const opened = await editor.open({ scope: SCOPE, definitionId: 'def-1' });
    if (opened.status !== 'open') throw new Error('expected open');

    const result = await editor.save(opened.draft, CONTENT);

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('conflict');
  });

  it('reports an open failure as explicit state instead of throwing', async () => {
    ({ deps, calls } = createDeps({
      openDraft: vi.fn(async () => {
        throw new Error('the catalog is locked');
      }),
    }));
    editor = createAgentStudioDraftEditor(deps);

    const result = await editor.open({ scope: SCOPE, definitionId: 'def-1' });

    expect(result.status).toBe('failed');
  });

  it('uses a fresh idempotency key per save, so two edits are not collapsed', async () => {
    const keys: string[] = [];
    ({ deps, calls } = createDeps({
      createIdempotencyKey: () => `idem-${keys.push('x')}`,
    }));
    editor = createAgentStudioDraftEditor(deps);
    const opened = await editor.open({ scope: SCOPE, definitionId: 'def-1' });
    if (opened.status !== 'open') throw new Error('expected open');

    const first = await editor.save(opened.draft, CONTENT);
    if (first.status !== 'saved') throw new Error('expected saved');
    await editor.save(first.draft, { ...CONTENT, prompt: 'Another edit.' });

    const usedKeys = calls.saved.map(
      request => (request as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(usedKeys).size).toBe(usedKeys.length);
  });
});
