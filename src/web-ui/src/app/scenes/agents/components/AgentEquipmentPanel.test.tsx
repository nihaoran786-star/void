import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentEquipmentPanelProps } from './AgentEquipmentPanel';

// The equipment panel is the one place an agent gets kitted out. This guard pins
// the three promises the old three-tab editor broke: no section ever disappears,
// a missing prerequisite offers to turn itself on instead of hiding, and an agent
// kind that genuinely cannot be equipped here says so in words rather than
// rendering dead controls.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (options && 'count' in options ? `${key}:${options.count}` : key),
  }),
}));

vi.mock('@/component-library', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Switch: ({
    onChange,
    checked,
    'aria-label': ariaLabel,
  }: {
    onChange?: (event: { target: { checked: boolean } }) => void;
    checked?: boolean;
    'aria-label'?: string;
  }) => (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={Boolean(checked)}
      onChange={event => onChange?.({ target: { checked: event.target.checked } })}
    />
  ),
}));

vi.mock('../agentEquipmentModel', () => ({
  buildDuplicateSkillNameSet: () => new Set<string>(),
  buildSkillGroups: (
    skills: Array<{ key: string }>,
    enabledKeys: string[],
  ) => (skills.length === 0 ? [] : [{
    key: 'group',
    label: 'group',
    skills,
    enabledCount: skills.filter(skill => enabledKeys.includes(skill.key)).length,
    totalCount: skills.length,
  }]),
  formatSkillDisplayName: (skill: { name: string }) => skill.name,
  getConfiguredEnabledSkillKeys: (skills: Array<{ key: string; effectiveEnabled?: boolean }>) =>
    skills.filter(skill => skill.effectiveEnabled).map(skill => skill.key),
  getSkillTitle: (skill: { name: string }) => skill.name,
  subagentPresentation: (subagent: { name: string }) => ({
    displayName: subagent.name,
    description: subagent.name,
    aliases: [],
  }),
}));

const TOOLS = [
  { name: 'Read', description: 'read', load_mode: 'expanded' },
  { name: 'Skill', description: 'skill', load_mode: 'expanded' },
  { name: 'Task', description: 'task', load_mode: 'expanded' },
] as unknown as AgentEquipmentPanelProps['availableTools'];

const SKILLS = [
  { key: 'docx', name: 'docx', effectiveEnabled: true },
  { key: 'pdf', name: 'pdf', effectiveEnabled: false },
] as unknown as AgentEquipmentPanelProps['modeSkills'];

const SUBAGENTS = [
  { key: 'explore', id: 'explore', name: 'explore', effectiveEnabled: true, defaultEnabled: true },
  { key: 'writer', id: 'writer', name: 'writer', effectiveEnabled: false, defaultEnabled: false },
] as unknown as AgentEquipmentPanelProps['manageableSubagents'];

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    key: 'mode::agentic',
    id: 'agentic',
    name: 'agentic',
    displayName: 'Agentic',
    displayDescription: '',
    aliases: [],
    agentKind: 'mode',
    defaultTools: ['Read'],
    capabilities: [],
    catalogEntry: {},
    ...overrides,
  } as unknown as AgentEquipmentPanelProps['agent'];
}

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean; url?: string }
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

describeWithJsdom('AgentEquipmentPanel', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;
  let handlers: {
    onSetTools: ReturnType<typeof vi.fn>;
    onResetTools: ReturnType<typeof vi.fn>;
    onSetSkills: ReturnType<typeof vi.fn>;
    onResetSkills: ReturnType<typeof vi.fn>;
    onSetSubagentEnabled: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    handlers = {
      onSetTools: vi.fn().mockResolvedValue(undefined),
      onResetTools: vi.fn().mockResolvedValue(undefined),
      onSetSkills: vi.fn().mockResolvedValue(undefined),
      onResetSkills: vi.fn().mockResolvedValue(undefined),
      onSetSubagentEnabled: vi.fn().mockResolvedValue(undefined),
    };
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const render = async (overrides: Partial<AgentEquipmentPanelProps> = {}) => {
    const { default: AgentEquipmentPanel } = await import('./AgentEquipmentPanel');
    await act(async () => {
      root.render(
        <AgentEquipmentPanel
          agent={makeAgent()}
          availableTools={TOOLS}
          modeConfig={null}
          modeSkills={SKILLS}
          manageableSubagents={SUBAGENTS}
          {...handlers}
          {...overrides}
        />,
      );
    });
  };

  const click = async (element: Element | null | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => {
      (element as HTMLElement).dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true }),
      );
    });
  };

  const buttonWithText = (text: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === text) as HTMLButtonElement | undefined;

  const sections = (): Element[] =>
    Array.from(container.querySelectorAll('.agent-equipment-section'));

  /** Each section owns its own Equip/Save/Cancel/Restore, so scope the lookup. */
  const buttonIn = (sectionIndex: number, text: string): HTMLButtonElement | undefined =>
    Array.from(sections()[sectionIndex]?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === text) as HTMLButtonElement | undefined;

  const tokensIn = (sectionIndex: number): Element[] =>
    Array.from(sections()[sectionIndex]?.querySelectorAll('.agent-equipment__token') ?? []);

  it('三段永远都在,不会因为缺前置条件而消失', async () => {
    await render();

    expect(sections()).toHaveLength(3);
    expect(sections().map(section => section.querySelector('h3')?.textContent)).toEqual([
      'agentsOverview.equipment.toolsTitle',
      'agentsOverview.equipment.skillsTitle',
      'agentsOverview.equipment.subagentsTitle',
    ]);
  });

  it('没开 Skill 工具时,技能段给出开启入口而不是隐藏', async () => {
    await render();

    const notice = sections()[1]?.querySelector('.agent-equipment__notice');
    expect(notice?.querySelector('.agent-equipment__note')?.textContent)
      .toBe('agentsOverview.equipment.skillToolNote');

    await click(buttonWithText('agentsOverview.equipment.enableSkillTool'));

    expect(handlers.onSetTools).toHaveBeenCalledWith('agentic', ['Read', 'Skill']);
  });

  it('没开 Task 工具时,下属段给出开启入口', async () => {
    await render();

    expect(sections()[2]?.querySelector('.agent-equipment__note')?.textContent)
      .toBe('agentsOverview.equipment.taskToolNote');

    await click(buttonWithText('agentsOverview.equipment.enableTaskTool'));

    expect(handlers.onSetTools).toHaveBeenCalledWith('agentic', ['Read', 'Task']);
  });

  it('子智能体如实说明不可在此装配,且不渲染可编辑控件', async () => {
    await render({
      agent: makeAgent({ agentKind: 'subagent', key: 'user::writer', id: 'writer' }),
    });

    expect(sections()[1]?.querySelector('.agent-equipment__note')?.textContent)
      .toBe('agentsOverview.equipment.nonModeSkillsNote');
    expect(sections()[2]?.querySelector('.agent-equipment__note')?.textContent)
      .toBe('agentsOverview.equipment.nonModeSubagentsNote');
    expect(buttonWithText('agentsOverview.equipment.edit')).toBeUndefined();
    expect(container.querySelectorAll('.agent-equipment__token')).toHaveLength(0);
  });

  it('装配技能:勾选后保存,把完整的启用清单交给 onSetSkills', async () => {
    await render({ modeConfig: { enabled_tools: ['Read', 'Skill'] } as never });

    await click(buttonIn(1, 'agentsOverview.equipment.edit'));

    const pdf = tokensIn(1).find(token => token.textContent === 'pdf');
    await click(pdf);
    await click(buttonIn(1, 'agentsOverview.equipment.save'));

    expect(handlers.onSetSkills).toHaveBeenCalledWith('agentic', ['docx', 'pdf']);
  });

  it('取消丢弃改动,不落盘', async () => {
    await render({ modeConfig: { enabled_tools: ['Read', 'Skill'] } as never });

    await click(buttonIn(1, 'agentsOverview.equipment.edit'));
    const pdf = tokensIn(1).find(token => token.textContent === 'pdf');
    await click(pdf);
    await click(buttonIn(1, 'agentsOverview.equipment.cancel'));

    expect(handlers.onSetSkills).not.toHaveBeenCalled();
    expect(tokensIn(1)).toHaveLength(0);
  });

  it('恢复默认走各自的 reset 通道', async () => {
    await render({ modeConfig: { enabled_tools: ['Read', 'Skill'] } as never });

    await click(buttonIn(0, 'agentsOverview.equipment.edit'));
    await click(buttonIn(0, 'agentsOverview.equipment.reset'));

    expect(handlers.onResetTools).toHaveBeenCalledWith('agentic');
    expect(handlers.onResetSkills).not.toHaveBeenCalled();
  });
});
