import { describe, expect, it, vi } from 'vitest';
import type {
  AgentAuthoringGateway,
  AgentDefinitionRecord,
} from './AgentAuthoringGateway';
import { AgentRevisionService } from './AgentRevisionService';

const definition: AgentDefinitionRecord = {
  definitionId: 'definition-1',
  personaKey: 'user::void::writer',
  scope: { level: 'user' },
  defaultRevisionId: 'revision-1',
  latestPublishedRevisionId: 'revision-1',
  revisions: [],
  drafts: [],
  legacySource: null,
  createdAt: '2026-08-15T12:00:00Z',
  updatedAt: '2026-08-15T12:00:00Z',
};

function createGateway(): AgentAuthoringGateway & {
  get: ReturnType<typeof vi.fn>;
  openDraft: ReturnType<typeof vi.fn>;
  saveDraft: ReturnType<typeof vi.fn>;
  recordValidation: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  setDefault: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(definition),
    openDraft: vi.fn(),
    saveDraft: vi.fn(),
    recordValidation: vi.fn(),
    publish: vi.fn(),
    setDefault: vi.fn(),
  };
}

describe('AgentRevisionService', () => {
  it('规范化 user scope 与 definition ID 后读取版本化 Agent', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.get({
      scope: { level: 'user' },
      definitionId: '  definition-1  ',
    })).resolves.toBe(definition);

    expect(gateway.get).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
    });
  });

  it('拒绝缺少连接身份的 remote project scope 且不调用 Gateway', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.get({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath: '/repo',
          backend: 'remote',
          remoteConnectionId: '   ',
        },
      },
      definitionId: 'definition-1',
    })).rejects.toMatchObject({ code: 'invalid_scope' });

    expect(gateway.get).not.toHaveBeenCalled();
  });

  it('拒绝缺少稳定 workspace ID/path 的 local project scope', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.get({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: '   ',
          workspacePath: 'D:/repo',
          backend: 'local',
        },
      },
      definitionId: 'definition-1',
    })).rejects.toMatchObject({ code: 'invalid_scope', retryable: false });

    expect(gateway.get).not.toHaveBeenCalled();
  });

  it('携带完整连接事实的 remote project 仍以 typed unsupported 结果关闭', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.get({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath: '/repo',
          backend: 'remote',
          remoteConnectionId: 'connection-1',
          remoteHost: 'host.example',
        },
      },
      definitionId: 'definition-1',
    })).rejects.toMatchObject({
      code: 'unsupported_remote_project',
      retryable: false,
    });

    expect(gateway.get).not.toHaveBeenCalled();
  });

  it('拒绝 Gateway 返回的跨 workspace Agent 记录', async () => {
    const gateway = createGateway();
    gateway.get.mockResolvedValueOnce({
      ...definition,
      scope: {
        level: 'project',
        workspace: {
          workspaceId: 'workspace-other',
          workspacePath: 'D:/repo',
          backend: 'local',
        },
      },
    });
    const service = new AgentRevisionService(gateway);

    await expect(service.get({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: '  workspace-1  ',
          workspacePath: '  D:/repo  ',
          backend: 'local',
        },
      },
      definitionId: 'definition-1',
    })).rejects.toMatchObject({
      code: 'workspace_scope_mismatch',
      retryable: false,
    });

    expect(gateway.get).toHaveBeenCalledWith({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath: 'D:/repo',
          backend: 'local',
        },
      },
      definitionId: 'definition-1',
    });
  });

  it('用持久化 idempotency key 打开 definition 的显式 editing 草稿', async () => {
    const gateway = createGateway();
    const draft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-1',
      draftFingerprint: 'draft-revision-1',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: 'revision-1',
      status: 'editing' as const,
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
      validationEvidence: [],
      updatedAt: '2026-08-15T12:00:00Z',
    };
    gateway.openDraft.mockResolvedValueOnce(draft);
    const service = new AgentRevisionService(gateway);

    await expect(service.openDraft({
      scope: { level: 'user' },
      definitionId: '  definition-1  ',
      personaKey: '  user::void::writer  ',
      idempotencyKey: '  open-draft-command-1  ',
    })).resolves.toBe(draft);

    expect(gateway.openDraft).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      personaKey: 'user::void::writer',
      idempotencyKey: 'open-draft-command-1',
    });
  });

  it('为新 definition 规范化并传递 initial content', async () => {
    const gateway = createGateway();
    const content = {
      personaKey: 'user::void::new-writer',
      displayName: 'New Writer',
      description: 'Writes new scripts.',
      prompt: 'Write a new script.',
      tools: ['Read'],
      readonly: false,
      review: false,
      model: '',
      allowedParentAgentIds: ['agentic'],
    };
    const draft = {
      draftId: 'draft-new',
      draftRevisionId: 'draft-revision-new',
      draftFingerprint: 'draft-revision-new',
      definitionId: 'definition-new',
      scope: { level: 'user' as const },
      baseRevisionId: null,
      status: 'editing' as const,
      content,
      validationEvidence: [],
      updatedAt: '2026-08-15T12:00:00Z',
    };
    gateway.openDraft.mockResolvedValueOnce(draft);
    const service = new AgentRevisionService(gateway);

    await service.openDraft({
      scope: { level: 'user' },
      personaKey: ' user::void::new-writer ',
      initialContent: {
        ...content,
        displayName: ' New Writer ',
        tools: [' Read ', 'Read'],
      },
      idempotencyKey: 'open-new-command-1',
    });

    expect(gateway.openDraft).toHaveBeenCalledWith({
      scope: { level: 'user' },
      personaKey: 'user::void::new-writer',
      initialContent: content,
      idempotencyKey: 'open-new-command-1',
    });
  });

  it('在进入 Gateway 前拒绝缺少必需文本的 revision content', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.openDraft({
      scope: { level: 'user' },
      initialContent: {
        personaKey: 'user::void::new-writer',
        displayName: 'New Writer',
        description: 'Writes new scripts.',
        prompt: '   ',
        tools: [],
        readonly: false,
        review: false,
        model: '',
        allowedParentAgentIds: [],
      },
      idempotencyKey: 'open-new-command-invalid-content',
    })).rejects.toMatchObject({
      code: 'validation_failed',
      retryable: false,
    });

    expect(gateway.openDraft).not.toHaveBeenCalled();
  });

  it('允许仅凭 stable definition ID 打开已有草稿', async () => {
    const gateway = createGateway();
    const draft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-1',
      draftFingerprint: 'draft-revision-1',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: 'revision-1',
      status: 'editing' as const,
      content: {
        personaKey: 'user::void::writer',
        displayName: 'Writer',
        description: 'Writes scripts.',
        prompt: 'Write a script.',
        tools: ['Read'],
        readonly: false,
        review: false,
        model: 'claude-sonnet',
        allowedParentAgentIds: ['agentic'],
      },
      validationEvidence: [],
      updatedAt: '2026-08-15T12:00:00Z',
    };
    gateway.openDraft.mockResolvedValueOnce(draft);
    const service = new AgentRevisionService(gateway);

    await expect(service.openDraft({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      idempotencyKey: 'open-existing-command-1',
    })).resolves.toBe(draft);

    expect(gateway.openDraft).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      idempotencyKey: 'open-existing-command-1',
    });
  });

  it('拒绝用 project scope 打开 user persona identity', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.openDraft({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath: 'D:/repo',
          backend: 'local',
        },
      },
      personaKey: 'user::void::writer',
      idempotencyKey: 'open-command-1',
    })).rejects.toMatchObject({ code: 'validation_failed' });

    expect(gateway.openDraft).not.toHaveBeenCalled();
  });

  it('保存草稿时逐字段传递 draft revision CAS 与 idempotency key', async () => {
    const gateway = createGateway();
    const savedDraft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      draftFingerprint: 'draft-revision-2',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: 'revision-1',
      status: 'editing' as const,
      content: {
        personaKey: 'user::void::writer',
        displayName: 'Writer v4',
        description: 'Writes scripts.',
        prompt: 'Write a script.',
        tools: ['Read', 'Write'],
        readonly: false,
        review: false,
        model: '',
        allowedParentAgentIds: ['agentic'],
      },
      validationEvidence: [],
      updatedAt: '2026-08-15T12:01:00Z',
    };
    gateway.saveDraft.mockResolvedValueOnce(savedDraft);
    const service = new AgentRevisionService(gateway);

    await expect(service.saveDraft({
      scope: { level: 'user' },
      definitionId: ' definition-1 ',
      draftId: ' draft-1 ',
      expectedDraftRevisionId: ' draft-revision-1 ',
      content: {
        ...savedDraft.content,
        displayName: '  Writer v4  ',
        tools: [' Read ', 'Write', 'Read'],
        allowedParentAgentIds: [' agentic ', 'agentic'],
      },
      idempotencyKey: ' save-command-1 ',
    })).resolves.toBe(savedDraft);

    expect(gateway.saveDraft).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedDraftRevisionId: 'draft-revision-1',
      content: savedDraft.content,
      idempotencyKey: 'save-command-1',
    });
  });

  it('拒绝 project scope 写入 user persona key 且不调用 Gateway', async () => {
    const gateway = createGateway();
    const service = new AgentRevisionService(gateway);

    await expect(service.saveDraft({
      scope: {
        level: 'project',
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath: 'D:/repo',
          backend: 'local',
        },
      },
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
      code: 'validation_failed',
      retryable: false,
    });

    expect(gateway.saveDraft).not.toHaveBeenCalled();
  });

  it('不信任 Web 伪造的 validation ID、时间或 draft binding', async () => {
    const gateway = createGateway();
    const returnedDraft = {
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      draftFingerprint: 'draft-revision-2',
      definitionId: 'definition-1',
      scope: { level: 'user' as const },
      baseRevisionId: 'revision-1',
      status: 'validated' as const,
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
      validationEvidence: [{
        validationId: 'host-validation-1',
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
    gateway.recordValidation.mockResolvedValueOnce(returnedDraft);
    const service = new AgentRevisionService(gateway);
    const untrustedEvidence = {
      status: 'passed' as const,
      debugSessionId: ' debug-session-1 ',
      testCaseId: ' test-case-1 ',
      capabilitySnapshot: [' Read ', 'Read'],
      message: ' Validated. ',
      validationId: 'forged-validation',
      draftRevisionId: 'draft-revision-1',
      validatedAt: 'forged-time',
      evidenceId: 'legacy-forged-evidence',
    };

    await expect(service.recordValidation({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      draftFingerprint: 'draft-revision-2',
      evidence: untrustedEvidence,
      idempotencyKey: 'validation-command-1',
    })).resolves.toBe(returnedDraft);

    expect(gateway.recordValidation).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      evidence: {
        status: 'passed',
        debugSessionId: 'debug-session-1',
        testCaseId: 'test-case-1',
        capabilitySnapshot: ['Read'],
        message: 'Validated.',
      },
      idempotencyKey: 'validation-command-1',
    });
  });

  it('拒绝 Gateway 回送未绑定当前 draft revision 的验证结果', async () => {
    const gateway = createGateway();
    gateway.recordValidation.mockResolvedValueOnce({
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      definitionId: 'definition-1',
      scope: { level: 'user' },
      baseRevisionId: 'revision-1',
      status: 'validated',
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
      validationEvidence: [{
        validationId: 'validation-1',
        draftRevisionId: 'draft-revision-1',
        status: 'passed',
        validatedAt: '2026-08-15T12:02:00Z',
        capabilitySnapshot: [],
      }],
      updatedAt: '2026-08-15T12:02:00Z',
    });
    const service = new AgentRevisionService(gateway);

    await expect(service.recordValidation({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      evidence: {
        status: 'passed',
        capabilitySnapshot: [],
      },
      idempotencyKey: 'validation-command-1',
    })).rejects.toMatchObject({ code: 'stale_validation_evidence' });
  });

  it('保存新草稿版本后不接受残留的旧验证证据', async () => {
    const gateway = createGateway();
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
    gateway.saveDraft.mockResolvedValueOnce({
      draftId: 'draft-1',
      draftRevisionId: 'draft-revision-2',
      draftFingerprint: 'draft-revision-2',
      definitionId: 'definition-1',
      scope: { level: 'user' },
      baseRevisionId: 'revision-1',
      status: 'editing',
      content,
      validationEvidence: [{
        validationId: 'validation-old',
        draftRevisionId: 'draft-revision-1',
        status: 'passed',
        validatedAt: '2026-08-15T12:00:00Z',
        capabilitySnapshot: [],
      }],
      updatedAt: '2026-08-15T12:03:00Z',
    });
    const service = new AgentRevisionService(gateway);

    await expect(service.saveDraft({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedDraftRevisionId: 'draft-revision-1',
      content,
      idempotencyKey: 'save-command-2',
    })).rejects.toMatchObject({ code: 'stale_validation_evidence' });
  });

  it('发布使用 base 与 draft 双 CAS 且不隐式设置 default revision', async () => {
    const gateway = createGateway();
    const revision = {
      revisionId: 'revision-2',
      definitionId: 'definition-1',
      content: {
        personaKey: 'user::void::writer',
        displayName: 'Writer v4',
        description: 'Writes scripts.',
        prompt: 'Write a script.',
        tools: ['Read'],
        readonly: false,
        review: false,
        model: '',
        allowedParentAgentIds: ['agentic'],
      },
      createdAt: '2026-08-15T12:04:00Z',
    };
    const published = {
      status: 'published' as const,
      definition: {
        ...definition,
        defaultRevisionId: 'revision-1',
        latestPublishedRevisionId: 'revision-2',
        revisions: [revision],
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
        content: revision.content,
        validationEvidence: [{
          validationId: 'validation-1',
          draftRevisionId: 'draft-revision-2',
          status: 'passed' as const,
          validatedAt: '2026-08-15T12:03:00Z',
          capabilitySnapshot: [],
        }],
        updatedAt: '2026-08-15T12:04:00Z',
      },
    };
    gateway.publish.mockResolvedValueOnce(published);
    const service = new AgentRevisionService(gateway);

    await expect(service.publish({
      scope: { level: 'user' },
      definitionId: ' definition-1 ',
      draftId: ' draft-1 ',
      expectedBaseRevisionId: ' revision-1 ',
      expectedDraftRevisionId: ' draft-revision-2 ',
      idempotencyKey: ' publish-command-1 ',
    })).resolves.toBe(published);

    expect(gateway.publish).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      draftId: 'draft-1',
      expectedBaseRevisionId: 'revision-1',
      expectedDraftRevisionId: 'draft-revision-2',
      idempotencyKey: 'publish-command-1',
    });
    expect(gateway.setDefault).not.toHaveBeenCalled();
    expect(published.definition.defaultRevisionId).toBe('revision-1');
  });

  it('通过独立 default revision CAS 命令切换未来会话默认版本', async () => {
    const gateway = createGateway();
    const result = {
      status: 'updated' as const,
      definition: {
        ...definition,
        defaultRevisionId: 'revision-2',
        latestPublishedRevisionId: 'revision-2',
      },
    };
    gateway.setDefault.mockResolvedValueOnce(result);
    const service = new AgentRevisionService(gateway);

    await expect(service.setDefault({
      scope: { level: 'user' },
      definitionId: ' definition-1 ',
      revisionId: ' revision-2 ',
      expectedDefaultRevisionId: ' revision-1 ',
      idempotencyKey: ' default-command-1 ',
    })).resolves.toBe(result);

    expect(gateway.setDefault).toHaveBeenCalledWith({
      scope: { level: 'user' },
      definitionId: 'definition-1',
      revisionId: 'revision-2',
      expectedDefaultRevisionId: 'revision-1',
      idempotencyKey: 'default-command-1',
    });
  });
});
