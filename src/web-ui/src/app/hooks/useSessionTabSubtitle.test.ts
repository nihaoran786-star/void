import { describe, expect, it } from 'vitest';

import type { AgentCatalogEntry } from '@/shared/services/customization';
import { resolveSessionTabSubtitle } from './useSessionTabSubtitle';

const draftAgent: AgentCatalogEntry = {
  kind: 'agent',
  identity: {
    id: 'user::void::visual-designer',
    revision: { status: 'known', value: 'visual-designer-v1' },
    displayName: '视觉设计智能体',
    displayNameKey: 'catalog.agents.visualDesigner.name',
    description: '负责视觉设计。',
    aliases: [],
  },
  source: {
    adapterId: 'existing-agents',
    recordType: 'subagent',
    recordId: 'user::void::visual-designer',
  },
  origin: 'user',
  scenarioEligibility: ['media'],
  tags: ['agent'],
  availability: { status: 'available' },
  agentKind: 'subagent',
  executionPolicyEligibility: [],
  isReadonly: false,
  toolCount: 1,
  activationSupport: 'parent_persona',
};

const tCommon = (key: string, options?: Record<string, unknown>) => (
  key === 'sceneTabs.personaDraftTitle'
    ? `${String(options?.name)} · 新建会话`
    : key
);
const tAgents = (key: string) => (
  key === 'catalog.agents.visualDesigner.name' ? '视觉设计智能体' : key
);

describe('resolveSessionTabSubtitle', () => {
  it('优先显示真实会话标题', () => {
    expect(resolveSessionTabSubtitle({
      sessionTitle: '已经创建的会话',
      draftStatus: 'draft',
      draftPersonaTarget: draftAgent,
      tCommon,
      tAgents,
    })).toBe('已经创建的会话');
  });

  it('市场草稿显示中文角色名与新建会话', () => {
    expect(resolveSessionTabSubtitle({
      sessionTitle: '',
      draftStatus: 'draft',
      draftPersonaTarget: draftAgent,
      tCommon,
      tAgents,
    })).toBe('视觉设计智能体 · 新建会话');
  });

  it('移除角色或退出草稿后恢复默认空副标题', () => {
    expect(resolveSessionTabSubtitle({
      sessionTitle: '',
      draftStatus: 'draft',
      draftPersonaTarget: null,
      tCommon,
      tAgents,
    })).toBe('');
    expect(resolveSessionTabSubtitle({
      sessionTitle: '',
      draftStatus: 'idle',
      draftPersonaTarget: draftAgent,
      tCommon,
      tAgents,
    })).toBe('');
  });
});
