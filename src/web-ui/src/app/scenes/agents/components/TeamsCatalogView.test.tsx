import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CustomizationRuntimeCapability,
  CustomizationRuntimeCapabilityReader,
  TeamAuthoringGateway,
  TeamCatalogEntry,
  TeamPackagePicker,
} from '@/shared/services/customization';
import { TeamAuthoringError } from '@/shared/services/customization';
import { useAgentsStore } from '../agentsStore';

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const confirmDanger = vi.hoisted(() => vi.fn(async () => true));
const workspaceFixture = vi.hoisted(() => ({
  workspace: {
    id: 'workspace-1',
    name: 'Project',
    rootPath: 'D:/workspace/project',
  },
  workspacePath: 'D:/workspace/project',
  hasWorkspace: true,
  isRemoteWorkspace: false,
}));
const catalogFixture = vi.hoisted(() => ({
  status: 'ready' as const,
  entries: [] as TeamCatalogEntry[],
  errors: [],
  reload: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/component-library', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  confirmDanger,
}));

vi.mock('@/app/components', () => ({
  GalleryEmpty: ({ message }: { message: string }) => <div>{message}</div>,
  GalleryGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  GalleryLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  GallerySkeleton: () => <div>loading</div>,
  GalleryZone: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <section id={id}>{children}</section>
  ),
}));

vi.mock('@/infrastructure/hooks/useWorkspaceManagerSync', () => ({
  useWorkspaceManagerSync: () => workspaceFixture,
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => notifications,
}));

vi.mock('../hooks/useTeamCatalog', () => ({
  useTeamCatalog: () => catalogFixture,
}));

vi.mock('./TeamCatalogCard', () => ({
  default: ({
    team,
    onOpen,
  }: {
    team: TeamCatalogEntry;
    onOpen: (team: TeamCatalogEntry) => void;
  }) => (
    <button type="button" onClick={() => onOpen(team)}>
      {team.identity.id}
    </button>
  ),
}));

vi.mock('./TeamCatalogDetail', () => ({
  default: ({
    team,
    onDelete,
    onDispatch,
  }: {
    team: TeamCatalogEntry | null;
    onDelete: (team: TeamCatalogEntry) => void;
    onDispatch: (team: TeamCatalogEntry) => void;
  }) => team ? (
    <div data-testid="team-detail">
      <button type="button" onClick={() => onDelete(team)}>delete-team</button>
      <button type="button" onClick={() => onDispatch(team)}>dispatch-team</button>
    </div>
  ) : null,
}));

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean; url?: string },
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

function teamFixture(id = 'custom-team-id'): TeamCatalogEntry {
  return {
    kind: 'team',
    identity: {
      id,
      revision: { status: 'known', value: 'revision-3' },
      displayName: '自定义团队',
      description: '用于验证管理动作。',
      aliases: [],
    },
    source: {
      adapterId: 'existing-team-definitions',
      recordType: 'team_definition',
      recordId: `user:${id}`,
    },
    origin: 'user',
    scenarioEligibility: ['code'],
    tags: ['team_definition'],
    availability: {
      status: 'unsupported',
      reasonCode: 'team_definition_runtime_not_implemented',
    },
    leadBinding: 'definition_only',
    lead: {
      identity: {
        id: 'lead-id',
        revision: { status: 'known', value: 'revision-3:lead-id' },
        displayName: '主理人',
        description: '交付负责人',
        aliases: [],
      },
      role: 'lead',
      isReadonly: false,
    },
    members: [],
    activationSupport: 'definition_only',
    managementSupport: 'authorable',
    definitionLevel: 'user',
    workflowCount: 1,
  };
}

function gatewayFixture(
  overrides: Partial<TeamAuthoringGateway> = {},
): TeamAuthoringGateway {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    install: vi.fn(),
    delete: vi.fn(async () => undefined),
    ...overrides,
  } as TeamAuthoringGateway;
}

function capabilityFixture(
  supported: boolean,
): CustomizationRuntimeCapabilityReader {
  return {
    getCapability: (_capability: CustomizationRuntimeCapability) => (
      supported
        ? { status: 'supported', transport: 'tauri' }
        : {
            status: 'unsupported',
            transport: 'websocket',
            reason: 'server_runtime_deferred',
          }
    ),
  };
}

describeWithJsdom('TeamsCatalogView', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Text', dom.window.Text);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLSelectElement', dom.window.HTMLSelectElement);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    catalogFixture.entries = [];
    catalogFixture.reload.mockClear();
    workspaceFixture.workspacePath = 'D:/workspace/project';
    workspaceFixture.workspace = {
      id: 'workspace-1',
      name: 'Project',
      rootPath: 'D:/workspace/project',
    };
    workspaceFixture.hasWorkspace = true;
    workspaceFixture.isRemoteWorkspace = false;
    useAgentsStore.setState({ catalogRefreshRevision: 0 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  async function renderView(
    gateway: TeamAuthoringGateway,
    packagePicker: TeamPackagePicker,
    capabilityService: CustomizationRuntimeCapabilityReader,
    taskDispatcher?: { dispatch: ReturnType<typeof vi.fn> },
  ) {
    const { default: TeamsCatalogView } = await import('./TeamsCatalogView');
    await act(async () => {
      root.render(
        <TeamsCatalogView
          gateway={gateway}
          packagePicker={packagePicker}
          capabilityService={capabilityService}
          taskDispatcher={taskDispatcher}
        />,
      );
      await Promise.resolve();
    });
  }

  function findButton(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button'))
      .find(candidate => candidate.textContent?.includes(text));
    expect(button).toBeTruthy();
    return button!;
  }

  async function clickButton(text: string) {
    const button = findButton(text);
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function clickButtonByLabel(label: string) {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
  }

  it('团队市场无页面标题且固定每页八张', async () => {
    catalogFixture.entries = Array.from({ length: 9 }, (_, index) => teamFixture(`team-${index}`));
    const gateway = gatewayFixture();
    const packagePicker = { pickPackage: vi.fn(async () => null) };

    await renderView(gateway, packagePicker, capabilityFixture(true));

    expect(container.querySelector('header')).toBeNull();
    expect(container.textContent).not.toContain('catalog.page.title');
    expect(container.querySelectorAll('#teams-catalog-zone > div button')).toHaveLength(8);
    expect(findButton('catalog.management.install')).toBeTruthy();
    expect(findButton('catalog.management.create')).toBeTruthy();

    await clickButtonByLabel('pagination.next');
    expect(container.textContent).toContain('team-8');
    expect(container.textContent).not.toContain('team-0');
  });

  it('团队数据缩减时把当前页收敛到有效页', async () => {
    catalogFixture.entries = Array.from({ length: 9 }, (_, index) => teamFixture(`team-${index}`));
    const gateway = gatewayFixture();
    const packagePicker = { pickPackage: vi.fn(async () => null) };

    await renderView(gateway, packagePicker, capabilityFixture(true));
    await clickButtonByLabel('pagination.next');
    expect(container.textContent).toContain('team-8');

    catalogFixture.entries = [teamFixture('team-0')];
    await renderView(gateway, packagePicker, capabilityFixture(true));

    expect(container.textContent).toContain('team-0');
    expect(container.querySelector('[aria-label="pagination.next"]')).toBeNull();
  });

  it('从团队详情派发到匹配场景的新会话', async () => {
    const team = teamFixture('delivery-team');
    team.availability = { status: 'available' };
    team.activationSupport = 'parent_persona';
    team.leadBinding = 'parent_persona';
    catalogFixture.entries = [team];
    const taskDispatcher = {
      dispatch: vi.fn(async () => ({
        scenario: 'code' as const,
        executionPolicy: 'agentic',
        action: 'draft_opened' as const,
      })),
    };

    await renderView(
      gatewayFixture(),
      { pickPackage: vi.fn(async () => null) },
      capabilityFixture(true),
      taskDispatcher,
    );
    await clickButton('delivery-team');
    await clickButton('dispatch-team');

    expect(taskDispatcher.dispatch).toHaveBeenCalledWith({
      target: team,
      preferredScenario: 'code',
    });
  });

  it('市场派发无需预先选择工作区', async () => {
    const team = teamFixture('delivery-team');
    team.availability = { status: 'available' };
    team.activationSupport = 'parent_persona';
    team.leadBinding = 'parent_persona';
    catalogFixture.entries = [team];
    (workspaceFixture as { workspace?: typeof workspaceFixture.workspace }).workspace = undefined;
    const taskDispatcher = {
      dispatch: vi.fn(async () => ({
        scenario: 'code' as const,
        executionPolicy: 'agentic',
        action: 'draft_opened' as const,
      })),
    };

    await renderView(
      gatewayFixture(),
      { pickPackage: vi.fn(async () => null) },
      capabilityFixture(true),
      taskDispatcher,
    );
    await clickButton('delivery-team');
    await clickButton('dispatch-team');

    expect(taskDispatcher.dispatch).toHaveBeenCalledWith({
      target: team,
      preferredScenario: 'code',
    });
  });

  it('浏览器能力不支持时禁用创建和安装且不会打开桌面文件选择器', async () => {
    const gateway = gatewayFixture();
    const packagePicker = { pickPackage: vi.fn(async () => 'D:/team.json') };

    await renderView(gateway, packagePicker, capabilityFixture(false));

    expect(findButton('catalog.management.install').disabled).toBe(true);
    expect(findButton('catalog.management.create').disabled).toBe(true);
    await clickButton('catalog.management.install');
    expect(packagePicker.pickPackage).not.toHaveBeenCalled();
    expect(gateway.install).not.toHaveBeenCalled();
  });

  it('安装失败时保留目录并显示结构化错误', async () => {
    const gateway = gatewayFixture({
      install: vi.fn(async () => {
        throw new TeamAuthoringError(
          'untrusted_package',
          'Package trust policy rejected the file',
        );
      }),
    });
    const packagePicker = {
      pickPackage: vi.fn(async () => 'D:/teams/untrusted.json'),
    };

    await renderView(gateway, packagePicker, capabilityFixture(true));
    await clickButton('catalog.management.install');

    expect(packagePicker.pickPackage).toHaveBeenCalledTimes(1);
    expect(gateway.install).toHaveBeenCalledWith({
      sourcePath: 'D:/teams/untrusted.json',
      level: 'user',
      workspacePath: undefined,
    });
    expect(notifications.error)
      .toHaveBeenCalledWith('teamAuthoring.errors.untrusted_package');
    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(0);
  });

  it('删除受能力门禁保护，支持时失败会显示结构化错误', async () => {
    catalogFixture.entries = [teamFixture()];
    const packagePicker = { pickPackage: vi.fn(async () => null) };
    const blockedGateway = gatewayFixture();

    await renderView(blockedGateway, packagePicker, capabilityFixture(false));
    await clickButton('custom-team-id');
    await clickButton('delete-team');
    expect(confirmDanger).not.toHaveBeenCalled();
    expect(blockedGateway.delete).not.toHaveBeenCalled();
    expect(notifications.error)
      .toHaveBeenCalledWith('catalog.management.unsupported');

    act(() => root.unmount());
    container.textContent = '';
    root = createRoot(container);
    vi.clearAllMocks();

    const failingGateway = gatewayFixture({
      delete: vi.fn(async () => {
        throw new TeamAuthoringError('delete_failed', 'Delete failed');
      }),
    });
    await renderView(failingGateway, packagePicker, capabilityFixture(true));
    await clickButton('custom-team-id');
    await clickButton('delete-team');

    expect(confirmDanger).toHaveBeenCalledTimes(1);
    expect(failingGateway.delete).toHaveBeenCalledWith({
      teamDefinitionId: 'custom-team-id',
      level: 'user',
      workspacePath: undefined,
    });
    expect(notifications.error)
      .toHaveBeenCalledWith('teamAuthoring.errors.delete_failed');
    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(0);
  });
});
