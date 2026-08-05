// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    id: 'ai-short-drama-team',
    displayName: 'AI 短剧团队',
  },
  source: {
    adapterId: 'short-drama',
    recordType: 'fixed_team',
    recordId: 'ai-short-drama-team',
  },
  origin: 'fixed_runtime',
  leadBinding: 'child_orchestrator',
  activationSupport: 'existing_flow_only',
  managementSupport: 'readonly_fixed',
};

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  for (const mounted of mountedRoots.splice(0)) {
    act(() => mounted.root.unmount());
    mounted.container.remove();
  }
});

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
    .replace(/\r\n/g, '\n');

describe('composer persona presentation contract', () => {
  it('shows a localized agent or team name instead of an internal id', () => {
    const source = readSource('./ChatInput.tsx');
    const capsule = source.match(
      /\{composerActivePersonaBinding && \([\s\S]*?<\/div>\s*\)\}/,
    )?.[0];

    expect(source).toContain('localizeCatalogPresentation(');
    expect(source).toContain("tCommon('customization.composerPersona.selectedAgent')");
    expect(source).toContain("tCommon('customization.composerPersona.teams')");
    expect(capsule).toContain('{activePersonaDisplayName}');
    expect(capsule).toContain("composerActivePersonaBinding.kind === 'team_lead'");
    expect(capsule).toContain('<Users size={12} aria-hidden />');
    expect(capsule).not.toContain('personaId');
  });

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
    expect(
      radioItems.find(item => item.textContent?.includes('AI 短剧团队'))?.textContent,
    ).toContain('customization.composerPersona.open');
  });

  it('uses common three-locale keys for action feedback and the clear button', () => {
    const source = readSource('./ChatInput.tsx');
    for (const key of [
      'activationFailed',
      'clearFailed',
      'teamActionFailed',
      'clearPersona',
    ]) {
      expect(source).toContain(`customization.composerPersona.${key}`);
    }

    const localePaths = [
      '../../locales/en-US/common.json',
      '../../locales/zh-CN/common.json',
      '../../locales/zh-TW/common.json',
    ];
    for (const localePath of localePaths) {
      const locale = JSON.parse(readSource(localePath)) as {
        customization: {
          composerPersona: Record<string, string>;
        };
      };
      expect(locale.customization.composerPersona).toMatchObject({
        selectedAgent: expect.any(String),
        unsupportedWeb: expect.any(String),
        activationFailed: expect.any(String),
        clearFailed: expect.any(String),
        teamActionFailed: expect.any(String),
        clearPersona: expect.any(String),
      });
    }

  });

  it('renders an explicit unsupported state without actionable catalog rows', () => {
    const source = readSource('./ComposerPersonaPicker.tsx');

    expect(source).toContain("status === 'unsupported'");
    expect(source).toContain(
      "tCommon('customization.composerPersona.unsupportedWeb')",
    );
    expect(source).toContain("status !== 'unsupported'");
  });
});
