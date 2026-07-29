import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillAuthoringDetail } from '@/infrastructure/config/types';
import type { CustomizationRuntimeCapabilityReader } from '../CustomizationRuntimeCapabilityService';
import { SkillAuthoringError } from '../SkillAuthoringGateway';
import { ExistingSkillAuthoringAdapter } from './ExistingSkillAuthoringAdapter';

const configApiMock = vi.hoisted(() => ({
  getSkillDetail: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
}));

vi.mock('@/infrastructure/api', () => ({
  configAPI: configApiMock,
}));

const detail: SkillAuthoringDetail = {
  skillKey: 'user::void::custom-0123456789abcdef0123456789abcdef',
  runtimeId: 'custom-0123456789abcdef0123456789abcdef',
  displayName: '财务报告分析',
  description: '分析财务报告并提示主要风险。',
  instructions: '先核对数据来源，再分析关键指标。',
  allowedParentAgentIds: ['Cowork'],
  suggestedPrompts: ['分析这份财务报告'],
  level: 'user',
  revision: 'revision-1',
};

const supportedCapabilities: CustomizationRuntimeCapabilityReader = {
  getCapability: () => ({
    status: 'supported',
    transport: 'tauri',
  }),
};

describe('ExistingSkillAuthoringAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('保留桌面接口返回的稳定身份和版本', async () => {
    configApiMock.createSkill.mockResolvedValue(detail);
    const adapter = new ExistingSkillAuthoringAdapter(supportedCapabilities);

    await expect(adapter.create({
      displayName: detail.displayName,
      description: detail.description,
      instructions: detail.instructions,
      allowedParentAgentIds: detail.allowedParentAgentIds,
      suggestedPrompts: detail.suggestedPrompts,
      level: detail.level,
    })).resolves.toEqual(detail);
  });

  it.each([
    [
      'revision_conflict',
      'Skill changed after it was opened.',
    ],
    [
      'not_authorable',
      'Only user-created Void skills can be edited.',
    ],
    [
      'unsupported_remote_project',
      'Remote project skill authoring is not supported yet.',
    ],
    [
      'rollback_failed',
      'Could not restore SKILL.md.',
    ],
  ] as const)('原样保留桌面端稳定错误码：%s', async (expectedCode, message) => {
    configApiMock.updateSkill.mockRejectedValue({
      code: expectedCode,
      message,
      recoveryPath: expectedCode === 'rollback_failed'
        ? 'D:/recovery/SKILL.md'
        : undefined,
    });
    const adapter = new ExistingSkillAuthoringAdapter(supportedCapabilities);

    const result = adapter.update({
      skillKey: detail.skillKey,
      expectedRevision: detail.revision,
      displayName: detail.displayName,
      description: detail.description,
      instructions: detail.instructions,
      allowedParentAgentIds: detail.allowedParentAgentIds,
      suggestedPrompts: detail.suggestedPrompts,
    });

    await expect(result).rejects.toMatchObject<Partial<SkillAuthoringError>>({
      code: expectedCode,
      causeMessage: message,
      recoveryPath: expectedCode === 'rollback_failed'
        ? 'D:/recovery/SKILL.md'
        : undefined,
    });
  });

  it('能力服务拒绝写入时不调用桌面 API', async () => {
    const adapter = new ExistingSkillAuthoringAdapter({
      getCapability: () => ({
        status: 'unsupported',
        transport: 'websocket',
        reason: 'server_runtime_deferred',
      }),
    });

    await expect(adapter.create({
      displayName: detail.displayName,
      description: detail.description,
      instructions: detail.instructions,
      allowedParentAgentIds: detail.allowedParentAgentIds,
      suggestedPrompts: detail.suggestedPrompts,
      level: detail.level,
    })).rejects.toMatchObject({
      code: 'unsupported_transport',
    });
    expect(configApiMock.createSkill).not.toHaveBeenCalled();
  });
});
