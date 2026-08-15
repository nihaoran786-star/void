import { describe, expect, it, vi } from 'vitest';
import { AgentRevisionAPI } from './AgentRevisionAPI';

const apiInvokeMock = vi.hoisted(() => vi.fn());

vi.mock('./ApiClient', () => ({
  api: { invoke: apiInvokeMock },
}));

describe('AgentRevisionAPI', () => {
  it('用显式 request DTO 调用 definition 读取命令', async () => {
    const record = {
      definitionId: 'definition-1',
      personaKey: 'user::void::writer',
      scope: { level: 'user' as const },
      defaultRevisionId: 'revision-1',
      latestPublishedRevisionId: 'revision-1',
      revisions: [],
    };
    apiInvokeMock.mockResolvedValue(record);
    const api = new AgentRevisionAPI();
    const request = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
    };

    await expect(api.get(request)).resolves.toBe(record);
    expect(apiInvokeMock).toHaveBeenCalledWith('get_agent_definition_record', {
      request,
    });
  });

  it('调用 open draft 命令并保留持久化幂等键', async () => {
    const api = new AgentRevisionAPI();
    const request = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      personaKey: 'user::void::writer',
      idempotencyKey: 'open-command-1',
    };
    const draft = { draftId: 'draft-1' };
    apiInvokeMock.mockResolvedValueOnce(draft);

    await expect(api.openDraft(request)).resolves.toBe(draft);
    expect(apiInvokeMock).toHaveBeenCalledWith('open_agent_revision_draft', {
      request,
    });
  });

  it('调用 save draft 命令并传递 draft CAS', async () => {
    const api = new AgentRevisionAPI();
    const request = {
      scope: { level: 'user' as const },
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
    };
    const draft = { draftId: 'draft-1', draftRevisionId: 'draft-revision-2' };
    apiInvokeMock.mockResolvedValueOnce(draft);

    await expect(api.saveDraft(request)).resolves.toBe(draft);
    expect(apiInvokeMock).toHaveBeenCalledWith('save_agent_revision_draft', {
      request,
    });
  });

  it('调用 validation 命令并保留证据的 exact draft binding', async () => {
    const api = new AgentRevisionAPI();
    const request = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      evidence: {
        status: 'passed' as const,
        debugSessionId: 'debug-session-1',
        testCaseId: 'test-case-1',
        capabilitySnapshot: ['Read'],
      },
      idempotencyKey: 'validation-command-1',
    };
    const draft = { draftId: 'draft-1', status: 'validated' };
    apiInvokeMock.mockResolvedValueOnce(draft);

    await expect(api.recordValidation(request)).resolves.toBe(draft);
    expect(apiInvokeMock).toHaveBeenCalledWith('record_agent_revision_validation', {
      request,
    });
  });

  it('调用 publish 命令并保留 base/draft 双 CAS', async () => {
    const api = new AgentRevisionAPI();
    const request = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedBaseRevisionId: 'revision-1',
      expectedDraftRevisionId: 'draft-revision-2',
      idempotencyKey: 'publish-command-1',
    };
    const result = { status: 'published' };
    apiInvokeMock.mockResolvedValueOnce(result);

    await expect(api.publish(request)).resolves.toBe(result);
    expect(apiInvokeMock).toHaveBeenCalledWith('publish_agent_revision', {
      request,
    });
  });

  it('调用独立 set default 命令并传递 default CAS', async () => {
    const api = new AgentRevisionAPI();
    const request = {
      scope: { level: 'user' as const },
      definitionId: 'definition-1',
      revisionId: 'revision-2',
      expectedDefaultRevisionId: 'revision-1',
      idempotencyKey: 'default-command-1',
    };
    const result = { status: 'updated' };
    apiInvokeMock.mockResolvedValueOnce(result);

    await expect(api.setDefault(request)).resolves.toBe(result);
    expect(apiInvokeMock).toHaveBeenCalledWith('set_agent_default_revision', {
      request,
    });
  });
});
