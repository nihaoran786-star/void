import { describe, expect, it, vi } from 'vitest';
import { AgentAuthoringError } from '../AgentAuthoringGateway';
import { DesktopAgentAuthoringAdapter } from './DesktopAgentAuthoringAdapter';

function createApi() {
  return {
    get: vi.fn(),
    openDraft: vi.fn(),
    saveDraft: vi.fn(),
    recordValidation: vi.fn(),
    publish: vi.fn(),
    setDefault: vi.fn(),
  };
}

describe('DesktopAgentAuthoringAdapter', () => {
  it('逐字段映射 local project scope 到 Desktop API', async () => {
    const api = createApi();
    const content = {
      personaKey: 'project::void::writer',
      displayName: 'Writer',
      description: 'Writes scripts.',
      prompt: 'Write a script.',
      tools: ['Read'],
      readonly: false,
      review: false,
      model: 'claude-sonnet',
      allowedParentAgentIds: ['agentic'],
    };
    const revision = {
      revisionId: 'revision-1',
      definitionId: 'definition-1',
      content,
      createdAt: '2026-08-15T11:00:00Z',
      legacyRuntimeRevisionAliases: ['legacy-runtime-revision-1'],
    };
    const record = {
      definitionId: 'definition-1',
      personaKey: 'project::void::writer',
      scope: {
        level: 'project' as const,
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath: 'D:/repo',
          backend: 'local' as const,
        },
      },
      defaultRevisionId: 'revision-1',
      latestPublishedRevisionId: 'revision-1',
      revisions: [revision],
      drafts: [],
      legacySource: {
        sourcePath: 'D:/repo/.void/agents/writer.md',
        importedRawDocument: 'host-private legacy document',
        importedRuntimeRevisionAlias: 'legacy-runtime-revision-1',
      },
      createdAt: '2026-08-15T11:00:00Z',
      updatedAt: '2026-08-15T11:00:00Z',
    };
    api.get.mockResolvedValueOnce(record);
    const adapter = new DesktopAgentAuthoringAdapter(api);
    const input = {
      scope: record.scope,
      definitionId: 'definition-1',
    };

    await expect(adapter.get(input)).resolves.toEqual({
      ...record,
      revisions: [revision],
      legacySource: {
        sourcePath: 'D:/repo/.void/agents/writer.md',
        importedRuntimeRevisionAlias: 'legacy-runtime-revision-1',
      },
    });
    expect(api.get).toHaveBeenCalledWith(input);
  });

  it('逐字段映射 open draft，包括 initial content 与 idempotency key', async () => {
    const api = createApi();
    const content = {
      personaKey: 'user::void::writer',
      displayName: 'Writer',
      description: 'Writes scripts.',
      prompt: 'Write a script.',
      tools: ['Read'],
      readonly: false,
      review: false,
      model: '',
      allowedParentAgentIds: ['agentic'],
    };
    const draft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-1',
      draftFingerprint: 'draft-revision-1',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: null,
      status: 'editing' as const,
      content,
      validationEvidence: [],
      updatedAt: '2026-08-15T12:00:00Z',
    };
    api.openDraft.mockResolvedValueOnce(draft);
    const adapter = new DesktopAgentAuthoringAdapter(api);
    const input = {
      scope: { level: 'user' as const },
      personaKey: 'user::void::writer',
      initialContent: content,
      idempotencyKey: 'open-command-1',
    };

    await expect(adapter.openDraft(input)).resolves.toEqual(draft);
    expect(api.openDraft).toHaveBeenCalledWith(input);
  });

  it('逐字段映射 save draft 的 CAS 输入', async () => {
    const api = createApi();
    const content = {
      personaKey: 'user::void::writer',
      displayName: 'Writer v4',
      description: 'Writes scripts.',
      prompt: 'Write a script.',
      tools: ['Read'],
      readonly: false,
      review: false,
      model: '',
      allowedParentAgentIds: ['agentic'],
    };
    const draft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      draftFingerprint: 'draft-revision-2',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: 'revision-1',
      status: 'editing' as const,
      content,
      validationEvidence: [],
      updatedAt: '2026-08-15T12:01:00Z',
    };
    api.saveDraft.mockResolvedValueOnce(draft);
    const adapter = new DesktopAgentAuthoringAdapter(api);
    const input = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedDraftRevisionId: 'draft-revision-1',
      content,
      idempotencyKey: 'save-command-1',
    };

    await expect(adapter.saveDraft(input)).resolves.toEqual(draft);
    expect(api.saveDraft).toHaveBeenCalledWith(input);
  });

  it('逐字段映射 host-owned validation command 输入', async () => {
    const api = createApi();
    const content = {
      personaKey: 'user::void::writer',
      displayName: 'Writer',
      description: 'Writes scripts.',
      prompt: 'Write a script.',
      tools: ['Read'],
      readonly: false,
      review: false,
      model: '',
      allowedParentAgentIds: ['agentic'],
    };
    const draft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      draftFingerprint: 'draft-revision-2',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: 'revision-1',
      status: 'validated' as const,
      content,
      validationEvidence: [{
        validationId: 'validation-1',
        draftRevisionId: 'draft-revision-2',
        status: 'passed' as const,
        validatedAt: '2026-08-15T12:02:00Z',
        debugSessionId: 'debug-session-1',
        testCaseId: 'test-case-1',
        capabilitySnapshot: ['Read'],
        message: 'Validated.',
      }],
      updatedAt: '2026-08-15T12:02:00Z',
    };
    api.recordValidation.mockResolvedValueOnce(draft);
    const adapter = new DesktopAgentAuthoringAdapter(api);
    const input = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      evidence: {
        status: 'passed' as const,
        debugSessionId: 'debug-session-1',
        testCaseId: 'test-case-1',
        capabilitySnapshot: ['Read'],
        message: 'Validated.',
      },
      idempotencyKey: 'validation-command-1',
    };

    await expect(adapter.recordValidation(input)).resolves.toEqual(draft);
    expect(api.recordValidation).toHaveBeenCalledWith(input);
  });

  it('保留 publish 的 already_published 幂等结果并映射双 CAS', async () => {
    const api = createApi();
    const content = {
      personaKey: 'user::void::writer',
      displayName: 'Writer v4',
      description: 'Writes scripts.',
      prompt: 'Write a script.',
      tools: ['Read'],
      readonly: false,
      review: false,
      model: '',
      allowedParentAgentIds: ['agentic'],
    };
    const revision = {
      revisionId: 'revision-2',
      definitionId: 'definition-1',
      content,
      createdAt: '2026-08-15T12:03:00Z',
      legacyRuntimeRevisionAliases: [],
    };
    const result = {
      status: 'already_published' as const,
      definition: {
        definitionId: 'definition-1',
        personaKey: 'user::void::writer',
        scope: { level: 'user' as const },
        defaultRevisionId: 'revision-1',
        latestPublishedRevisionId: 'revision-2',
        revisions: [revision],
        drafts: [],
        legacySource: null,
        createdAt: '2026-08-15T12:00:00Z',
        updatedAt: '2026-08-15T12:03:00Z',
      },
      revision,
      draft: {
        draftId: 'draft-1',
        draftRevisionId: 'draft-revision-2',
        draftFingerprint: 'draft-revision-2',
        definitionId: 'definition-1',
        scope: { level: 'user' as const },
        baseRevisionId: 'revision-1',
        status: 'published' as const,
        content,
        validationEvidence: [{
          validationId: 'validation-1',
          draftRevisionId: 'draft-revision-2',
          status: 'passed' as const,
          validatedAt: '2026-08-15T12:02:00Z',
          capabilitySnapshot: ['Read'],
        }],
        updatedAt: '2026-08-15T12:03:00Z',
      },
    };
    api.publish.mockResolvedValueOnce(result);
    const adapter = new DesktopAgentAuthoringAdapter(api);
    const input = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedBaseRevisionId: 'revision-1',
      expectedDraftRevisionId: 'draft-revision-2',
      idempotencyKey: 'publish-command-1',
    };

    await expect(adapter.publish(input)).resolves.toEqual(result);
    expect(api.publish).toHaveBeenCalledWith(input);
  });

  it('保留 set default 的 already_default 幂等结果并映射 default CAS', async () => {
    const api = createApi();
    const result = {
      status: 'already_default' as const,
      definition: {
        definitionId: 'definition-1',
        personaKey: 'user::void::writer',
        scope: { level: 'user' as const },
        defaultRevisionId: 'revision-2',
        latestPublishedRevisionId: 'revision-2',
        revisions: [],
        drafts: [],
        legacySource: null,
        createdAt: '2026-08-15T12:00:00Z',
        updatedAt: '2026-08-15T12:03:00Z',
      },
    };
    api.setDefault.mockResolvedValueOnce(result);
    const adapter = new DesktopAgentAuthoringAdapter(api);
    const input = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      revisionId: 'revision-2',
      expectedDefaultRevisionId: 'revision-1',
      idempotencyKey: 'default-command-1',
    };

    await expect(adapter.setDefault(input)).resolves.toEqual(result);
    expect(api.setDefault).toHaveBeenCalledWith(input);
  });

  it('把嵌套 Tauri revision conflict 映射为 typed domain error facts', async () => {
    const api = createApi();
    api.publish.mockRejectedValueOnce({
      code: 'COMMAND_FAILED',
      message: 'Command failed.',
      details: {
        originalError: {
          code: 'revision_conflict',
          message: 'The draft revision changed.',
          retryable: false,
          conflictKind: 'draft_revision',
          expectedRevisionId: 'draft-revision-1',
          actualRevisionId: 'draft-revision-2',
        },
      },
    });
    const adapter = new DesktopAgentAuthoringAdapter(api);

    const promise = adapter.publish({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedBaseRevisionId: 'revision-1',
      expectedDraftRevisionId: 'draft-revision-1',
      idempotencyKey: 'publish-command-1',
    });

    await expect(promise).rejects.toBeInstanceOf(AgentAuthoringError);
    await expect(promise).rejects.toMatchObject({
      code: 'revision_conflict',
      causeMessage: 'The draft revision changed.',
      retryable: false,
      conflictKind: 'draft_revision',
      expectedRevisionId: 'draft-revision-1',
      actualRevisionId: 'draft-revision-2',
    });
  });

  it('把未知 save transport failure 分类为 write_failed', async () => {
    const api = createApi();
    api.saveDraft.mockRejectedValueOnce(new Error('Desktop transport closed.'));
    const adapter = new DesktopAgentAuthoringAdapter(api);

    await expect(adapter.saveDraft({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedDraftRevisionId: 'draft-revision-1',
      content: {
        personaKey: 'user::void::writer',
        displayName: 'Writer',
        description: 'Writes scripts.',
        prompt: 'Write a script.',
        tools: ['Read'],
        readonly: false,
        review: false,
        model: '',
        allowedParentAgentIds: ['agentic'],
      },
      idempotencyKey: 'save-command-1',
    })).rejects.toMatchObject({
      code: 'write_failed',
      causeMessage: 'Desktop transport closed.',
    });
  });

  it('把同一 idempotency key 的不同请求保留为 typed conflict', async () => {
    const api = createApi();
    api.publish.mockRejectedValueOnce({
      code: 'idempotency_conflict',
      message: 'The command key was already used for another request.',
      retryable: false,
      conflictKind: 'idempotency_key',
    });
    const adapter = new DesktopAgentAuthoringAdapter(api);

    await expect(adapter.publish({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedBaseRevisionId: 'revision-1',
      expectedDraftRevisionId: 'draft-revision-1',
      idempotencyKey: 'publish-command-1',
    })).rejects.toMatchObject({
      code: 'idempotency_conflict',
      conflictKind: 'idempotency_key',
      retryable: false,
    });
  });
});
