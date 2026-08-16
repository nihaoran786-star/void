// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentCatalogEntry,
  TeamCatalogEntry,
} from '@/shared/services/customization';
import { ComposerPersonaPicker } from './ComposerPersonaPicker';

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const agentEntry: AgentCatalogEntry = {
  kind: 'agent',
  identity: {
    id: 'writer',
    revision: { status: 'known', value: 'writer-v1' },
    displayName: '文案智能体',
    description: '编写中文文案。',
    aliases: [],
  },
  source: {
    adapterId: 'test',
    recordType: 'subagent',
    recordId: 'writer',
  },
  origin: 'user',
  scenarioEligibility: ['code'],
  tags: [],
  availability: { status: 'available' },
  agentKind: 'subagent',
  executionPolicyEligibility: [],
  isReadonly: false,
  toolCount: 1,
  activationSupport: 'parent_persona',
};

const teamEntry: TeamCatalogEntry = {
  kind: 'team',
  identity: {
    id: 'software-team',
    revision: { status: 'known', value: 'team-v1' },
    displayName: '软件开发团队',
    description: '协作完成软件开发。',
    aliases: [],
  },
  source: {
    adapterId: 'test',
    recordType: 'team_definition',
    recordId: 'software-team',
  },
  origin: 'user',
  scenarioEligibility: ['code'],
  tags: [],
  availability: { status: 'available' },
  leadBinding: 'parent_persona',
  lead: {
    identity: {
      id: 'software-lead',
      revision: { status: 'known', value: 'team-v1:software-lead' },
      displayName: '研发主理人',
      description: '',
      aliases: [],
    },
    role: 'lead',
    isReadonly: false,
  },
  members: [],
  activationSupport: 'parent_persona',
  managementSupport: 'authorable',
};

const fixedTeamEntry: TeamCatalogEntry = {
  ...teamEntry,
  identity: {
    ...teamEntry.identity,
    id: 'custom-00000000000000000000000000000001',
    revision: { status: 'known', value: 'short-drama-v1' },
    displayName: 'AI 短剧团队',
  },
  source: {
    adapterId: 'short-drama',
    recordType: 'fixed_team',
    recordId: 'custom-00000000000000000000000000000001',
  },
  origin: 'fixed_runtime',
  leadBinding: 'parent_persona',
  lead: {
    ...teamEntry.lead,
    identity: {
      ...teamEntry.lead.identity,
      id: 'member-00000000000000000000000000000001',
      revision: {
        status: 'known',
        value: 'short-drama-v1:member-00000000000000000000000000000001',
      },
      displayName: '短剧制片人',
    },
  },
  activationSupport: 'parent_persona',
  managementSupport: 'readonly_fixed',
};

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  for (const mounted of mountedRoots.splice(0)) {
    act(() => mounted.root.unmount());
    mounted.container.remove();
  }
});

describe('composer persona presentation contract', () => {
  it('keeps agent and team selection mutually exclusive and preserves fixed-team actions', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    act(() => {
      root.render(
        <ComposerPersonaPicker
          agents={[agentEntry]}
          teams={[teamEntry, fixedTeamEntry]}
          loading={false}
          status="ready"
          activePersonaId={agentEntry.identity.id}
          activeTeamId={teamEntry.identity.id}
          onSelectAgent={vi.fn()}
          onSelectTeam={vi.fn()}
          onOpenLibrary={vi.fn()}
        />,
      );
    });

    const radioItems = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    expect(radioItems).toHaveLength(3);
    expect(radioItems.filter(item => item.getAttribute('aria-checked') === 'true'))
      .toHaveLength(1);
    expect(
      radioItems.find(item => item.textContent?.includes('软件开发团队'))
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      radioItems.find(item => item.textContent?.includes('文案智能体'))
        ?.getAttribute('aria-checked'),
    ).toBe('false');
    expect(container.querySelectorAll('.void-chat-input__persona-item-check'))
      .toHaveLength(1);
    expect(container.querySelectorAll('.void-chat-input__persona-item-avatar'))
      .toHaveLength(3);
    expect(
      radioItems.find(item => item.textContent?.includes('AI 短剧团队'))?.textContent,
    ).toContain('customization.composerPersona.summon');
  });
});
