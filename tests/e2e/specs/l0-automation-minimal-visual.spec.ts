import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { saveElementScreenshot, saveScreenshot } from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);
const automationNavigationSelector =
  'button.void-nav-panel__top-action-btn:has(svg.lucide-calendar-clock)';

type RectEvidence = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type AutomationLayoutEvidence = {
  body: RectEvidence | null;
  controls: Array<{
    rect: RectEvidence;
  }>;
  documentScrollWidth: number;
  filterOpen: boolean;
  filterPanel: RectEvidence | null;
  filterSelectCount: number;
  filterTriggerFocused: boolean;
  filterVisibleSelectCount: number;
  header: RectEvidence | null;
  scene: RectEvidence | null;
  sceneClientWidth: number;
  sceneScrollWidth: number;
  viewport: {
    height: number;
    width: number;
  };
};

type ThemeId = 'void-dark' | 'void-light';
type CalendarViewEvidence = {
  body: RectEvidence | null;
  documentScrollWidth: number;
  root: RectEvidence | null;
  scene: RectEvidence | null;
  view: 'day' | 'week' | 'month' | 'list';
  viewportWidth: number;
};

type TauriInternals = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

type AutomationThemeEvidence = {
  dateColor: string;
  sceneBackground: string;
  theme: string | null;
  themeType: string | null;
  todayBackground: string;
  todayDateBackground: string;
  todayDateColor: string;
  todayDateContrast: number;
};

const readThemeSelection = () => browser.execute(async () => {
  const internals = (
    window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  ).__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error('Tauri internals are unavailable while reading the theme');
  }

  return internals.invoke<unknown>('get_config', {
    request: {
      path: 'themes.current',
      skipRetryOnNotFound: true,
    },
  });
});

const writeThemeSelection = (themeId: string) => browser.execute(
  async (nextThemeId) => {
    const internals = (
      window as Window & { __TAURI_INTERNALS__?: TauriInternals }
    ).__TAURI_INTERNALS__;
    if (!internals) {
      throw new Error('Tauri internals are unavailable while setting the theme');
    }

    await internals.invoke('set_config', {
      request: {
        path: 'themes.current',
        value: nextThemeId,
      },
    });
  },
  themeId,
);

const describeCleanupFailure = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const attemptCleanup = async (
  failures: string[],
  label: string,
  action: () => Promise<void>,
) => {
  try {
    await action();
  } catch (error) {
    failures.push(`${label}: ${describeCleanupFailure(error)}`);
  }
};

const openAutomationScene = async () => {
  const automationNavigation = await $(automationNavigationSelector);
  await automationNavigation.waitForClickable({ timeout: 10_000 });
  await automationNavigation.click();

  await $('.automation-scene').waitForDisplayed({ timeout: 10_000 });
  await $('.automation-header').waitForDisplayed({ timeout: 10_000 });
  await browser.waitUntil(async () => browser.execute(() => {
    const loading = document.querySelector<HTMLElement>(
      '.automation-scene__host-loading',
    );
    const body = document.querySelector<HTMLElement>('.automation-scene__body');
    return (
      (!loading || getComputedStyle(loading).display === 'none')
      && Boolean(body)
      && (body?.getBoundingClientRect().height ?? 0) > 0
    );
  }), {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'Automation scene did not settle after host loading',
  });
  await $('.automation-scene__body').waitForDisplayed({ timeout: 5_000 });
};

const readAutomationLayout = (): Promise<AutomationLayoutEvidence> =>
  browser.execute(() => {
    const scene = document.querySelector<HTMLElement>('.automation-scene');
    const header = document.querySelector<HTMLElement>('.automation-header');
    const body = document.querySelector<HTMLElement>('.automation-scene__body');
    const filterDisclosure = document.querySelector<HTMLDetailsElement>(
      '.automation-header__filter-disclosure',
    );
    const filterPanel = document.querySelector<HTMLElement>(
      '.automation-header__filters',
    );
    const filterTrigger = document.querySelector<HTMLElement>(
      '.automation-header__filter-trigger',
    );
    const filterSelects = Array.from(
      document.querySelectorAll<HTMLSelectElement>(
        '.automation-header__filters select',
      ),
    );
    const headerControls = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.automation-header button, .automation-header select, .automation-header summary',
      ),
    );
    const rectOf = (element: HTMLElement | null): RectEvidence | null => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const isRendered = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0
      );
    };

    return {
      body: rectOf(body),
      controls: headerControls
        .filter(isRendered)
        .map((control) => ({
          rect: rectOf(control)!,
        })),
      documentScrollWidth: document.documentElement.scrollWidth,
      filterOpen: filterDisclosure?.open ?? false,
      filterPanel: filterPanel && isRendered(filterPanel)
        ? rectOf(filterPanel)
        : null,
      filterSelectCount: filterSelects.length,
      filterTriggerFocused: document.activeElement === filterTrigger,
      filterVisibleSelectCount: filterSelects.filter(isRendered).length,
      header: rectOf(header),
      scene: rectOf(scene),
      sceneClientWidth: scene?.clientWidth ?? 0,
      sceneScrollWidth: scene?.scrollWidth ?? 0,
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    };
  });

const expectStableAutomationLayout = (
  evidence: AutomationLayoutEvidence,
): void => {
  expect(evidence.scene?.width ?? 0).toBeGreaterThan(0);
  expect(evidence.scene?.height ?? 0).toBeGreaterThan(0);
  expect(evidence.header?.width ?? 0).toBeGreaterThan(0);
  expect(evidence.header?.height ?? 0).toBeGreaterThan(0);
  expect(evidence.body?.width ?? 0).toBeGreaterThan(0);
  expect(evidence.body?.height ?? 0).toBeGreaterThan(0);
  expect(evidence.controls.length).toBeGreaterThan(0);
  expect(evidence.body?.top ?? 0)
    .toBeGreaterThanOrEqual((evidence.header?.bottom ?? 0) - 1);
  expect(evidence.documentScrollWidth)
    .toBeLessThanOrEqual(evidence.viewport.width + 1);
  expect(evidence.sceneScrollWidth)
    .toBeLessThanOrEqual(evidence.sceneClientWidth + 1);

  for (const control of evidence.controls) {
    expect(control.rect.width).toBeGreaterThan(0);
    expect(control.rect.height).toBeGreaterThan(0);
    expect(control.rect.left).toBeGreaterThanOrEqual(-1);
    expect(control.rect.top).toBeGreaterThanOrEqual(-1);
    expect(control.rect.right).toBeLessThanOrEqual(evidence.viewport.width + 1);
    expect(control.rect.bottom).toBeLessThanOrEqual(evidence.viewport.height + 1);
  }
};

const readAutomationTheme = (): Promise<AutomationThemeEvidence> =>
  browser.execute(() => {
    const root = document.documentElement;
    const scene = document.querySelector<HTMLElement>('.automation-scene');
    const date = document.querySelector<HTMLElement>('.week-view__date-num');
    const today = document.querySelector<HTMLElement>(
      '.week-view__day-header--today',
    );
    const todayDate = document.querySelector<HTMLElement>(
      '.week-view__date-num--today',
    );
    const todayDateStyle = todayDate ? getComputedStyle(todayDate) : null;
    const parseRgb = (value: string): [number, number, number] | null => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3 || channels.some(Number.isNaN)) {
        return null;
      }
      return channels as [number, number, number];
    };
    const relativeLuminance = ([red, green, blue]: [number, number, number]) => {
      const linear = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrastRatio = (foreground: string, background: string): number => {
      const foregroundRgb = parseRgb(foreground);
      const backgroundRgb = parseRgb(background);
      if (!foregroundRgb || !backgroundRgb) {
        return 0;
      }
      const foregroundLuminance = relativeLuminance(foregroundRgb);
      const backgroundLuminance = relativeLuminance(backgroundRgb);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    };
    const todayDateColor = todayDateStyle?.color ?? '';
    const todayDateBackground = todayDateStyle?.backgroundColor ?? '';

    return {
      dateColor: date ? getComputedStyle(date).color : '',
      sceneBackground: scene ? getComputedStyle(scene).backgroundColor : '',
      theme: root.getAttribute('data-theme'),
      themeType: root.getAttribute('data-theme-type'),
      todayBackground: today ? getComputedStyle(today).backgroundColor : '',
      todayDateBackground,
      todayDateColor,
      todayDateContrast: contrastRatio(
        todayDateColor,
        todayDateBackground,
      ),
    };
  });

const switchAutomationView = async (
  view: CalendarViewEvidence['view'],
  optionIndex: number,
  rootSelector: string,
): Promise<CalendarViewEvidence> => {
  const buttonSelector =
    `.automation-header__view-btn:nth-child(${optionIndex})`;
  const button = await $(buttonSelector);
  await button.waitForClickable({ timeout: 5_000 });
  await button.click();
  await browser.waitUntil(async () => browser.execute(
    (activeSelector, viewSelector) => {
      const active = document.querySelector<HTMLElement>(
        '.automation-header__view-btn--active',
      );
      return (
        active?.matches(activeSelector) === true
        && Boolean(document.querySelector(viewSelector))
      );
    },
    buttonSelector,
    rootSelector,
  ), {
    timeout: 5_000,
    interval: 100,
    timeoutMsg: `Automation ${view} view did not become active`,
  });

  return browser.execute((nextView, selector) => {
    const scene = document.querySelector<HTMLElement>('.automation-scene');
    const body = document.querySelector<HTMLElement>('.automation-scene__body');
    const root = document.querySelector<HTMLElement>(selector);
    const rectOf = (element: HTMLElement | null): RectEvidence | null => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };

    return {
      body: rectOf(body),
      documentScrollWidth: document.documentElement.scrollWidth,
      root: rectOf(root),
      scene: rectOf(scene),
      view: nextView,
      viewportWidth: window.innerWidth,
    };
  }, view, rootSelector);
};

type FixtureCallbackCounts = {
  create: number;
  delete: number;
  run: number;
  toggle: number;
};

type PopulatedAutomationFixtureState = {
  appRoot: HTMLElement | null;
  appRootState: {
    ariaHidden: string | null;
    inert: boolean;
    style: string;
  };
  callbacks: FixtureCallbackCounts;
  host: HTMLElement;
  model: {
    artifactTypes: string[];
    conversationRoles: string[];
    priorities: string[];
    statuses: string[];
  };
  root: {
    unmount(): void;
  };
};

type PopulatedAutomationFixtureWindow = Window & {
  __VOID_AUTOMATION_E2E_FIXTURE__?: PopulatedAutomationFixtureState;
};

type FixtureCleanupEvidence = {
  ariaHiddenRestored: boolean;
  hostRemoved: boolean;
  inertRestored: boolean;
  keyRemoved: boolean;
  styleRestored: boolean;
};

type FilledAutomationEvidence = {
  callbackCounts: FixtureCallbackCounts;
  cardCount: number;
  cardLabels: string[];
  dialog: null | {
    controls: Array<{
      height: number;
      hit: boolean;
      width: number;
    }>;
    described: boolean;
    labelled: boolean;
    rect: RectEvidence;
    tabListLabelled: boolean;
  };
  documentScrollWidth: number;
  horizontalLeakCount: number;
  hostClientWidth: number;
  hostScrollWidth: number;
  longTextUnsafeCount: number;
  model: PopulatedAutomationFixtureState['model'];
  outsideControls: Array<{
    className: string;
    rect: RectEvidence;
    tagName: string;
  }>;
  priorityModifiers: string[];
  root: RectEvidence | null;
  scene: RectEvidence | null;
  viewport: {
    height: number;
    width: number;
  };
  visibleControlCount: number;
  visibleControlOutsideViewportCount: number;
};

const mountPopulatedAutomationFixture = () => browser.execute(async () => {
  const fixtureWindow = window as PopulatedAutomationFixtureWindow;
  if (fixtureWindow.__VOID_AUTOMATION_E2E_FIXTURE__) {
    throw new Error('The populated automation fixture is already mounted');
  }

  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  // Load the scene-owned base styles without importing or rendering
  // AutomationScene, whose host adapter owns Cron/API effects.
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  await import('/src/app/scenes/automation/AutomationScene.scss');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const contextModule = await import('/src/app/scenes/automation/automation-context.tsx');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const headerModule = await import('/src/app/scenes/automation/AutomationHeader.tsx');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const weekModule = await import('/src/app/scenes/automation/WeekView.tsx');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const listModule = await import('/src/app/scenes/automation/ListView.tsx');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const detailModule = await import('/src/app/scenes/automation/TaskDetailPanel.tsx');

  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  const AutomationProvider = contextModule.AutomationProvider;
  const useAutomation = contextModule.useAutomation;
  const AutomationHeader = headerModule.AutomationHeader;
  const WeekView = weekModule.WeekView;
  const ListView = listModule.ListView;
  const TaskDetailPanel = detailModule.TaskDetailPanel;
  if (
    !createRoot
    || !AutomationProvider
    || !useAutomation
    || !AutomationHeader
    || !WeekView
    || !ListView
    || !TaskDetailPanel
  ) {
    throw new Error('Unable to mount the real automation components');
  }

  const anchor = new Date();
  anchor.setHours(12, 0, 0, 0);
  const monday = new Date(anchor);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const scheduledAt = (dayOffset: number, hour: number, minute = 0) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  const agents = [
    {
      id: 'agent-research',
      name: 'ResearchAI · 超长代理名称 / research.example.com',
      type: 'research',
    },
    {
      id: 'agent-ops',
      name: 'OpsAI',
      type: 'ops',
    },
  ];
  const tasks = [
    {
      id: 'queued-long-task',
      name:
        '排队：生成整季短剧资产索引 https://example.com/projects/season-01/'
        + 'C:\\production\\episodes\\episode-0001\\assets\\characters\\lead.png',
      description:
        '检查长中英文、URL 与 Windows 路径是否只在自己的内容区域换行或省略。',
      prompt:
        '请读取 C:\\production\\episodes\\episode-0001\\scripts\\final.md，'
        + '对照 https://example.com/very/long/path/without/a/visual/breakpoint '
        + '生成完整资产清单，并保留角色、场景、道具之间的引用关系。',
      agentId: 'agent-research',
      scheduleType: 'daily',
      scheduledAt: scheduledAt(0, 9, 15),
      duration: 50,
      priority: 'P0',
      status: 'pending',
      runStatus: 'queued',
      enabled: true,
      createdAt: scheduledAt(0, 8),
      artifacts: [
        {
          id: 'artifact-document',
          name:
            'season-01-production-index-with-a-very-long-unbroken-name.md',
          type: 'document',
          size: '18 KB',
        },
        {
          id: 'artifact-image',
          name:
            'C:\\production\\episode-0001\\assets\\characters\\lead-final.png',
          type: 'image',
          size: '4.2 MB',
        },
        {
          id: 'artifact-code',
          name: 'https://example.com/generated/storyboard/episode-0001.json',
          type: 'code',
          size: '96 KB',
        },
        {
          id: 'artifact-data',
          name: 'asset-relations-production-dataset-v2026-07-20.parquet',
          type: 'data',
          size: '1.8 MB',
        },
      ],
      conversation: [
        {
          id: 'conversation-user',
          role: 'user',
          content:
            '请检查这个很长的入口：'
            + 'C:\\production\\episodes\\episode-0001\\scripts\\final.md',
          timestamp: scheduledAt(0, 9, 15),
        },
        {
          id: 'conversation-assistant',
          role: 'assistant',
          content:
            '已建立资产关系，继续核对 '
            + 'https://example.com/productions/season-01/episode-0001/assets。',
          timestamp: scheduledAt(0, 9, 16),
        },
        {
          id: 'conversation-tool',
          role: 'tool',
          content:
            'workspace.scan returned C:\\production\\episodes\\episode-0001'
            + '\\assets\\characters\\lead-final.png',
          timestamp: scheduledAt(0, 9, 17),
        },
      ],
    },
    {
      id: 'running-task',
      name: '直播素材同步',
      description: '同步直播短剧素材。',
      prompt: '同步素材。',
      agentId: 'agent-ops',
      scheduleType: 'hourly',
      scheduledAt: scheduledAt(1, 10),
      duration: 45,
      priority: 'P1',
      status: 'running',
      runStatus: 'running',
      enabled: true,
      createdAt: scheduledAt(0, 8),
    },
    {
      id: 'completed-task',
      name: '已完成清单',
      description: '已完成的自动化任务。',
      prompt: '输出清单。',
      agentId: 'agent-research',
      scheduleType: 'once',
      scheduledAt: scheduledAt(2, 11),
      duration: 30,
      priority: 'P2',
      status: 'completed',
      runStatus: 'ok',
      enabled: true,
      createdAt: scheduledAt(0, 8),
      completedAt: scheduledAt(2, 11, 30),
    },
    {
      id: 'failed-task',
      name: '失败回归样本',
      description: '失败状态必须在深浅主题中可读。',
      prompt: '验证失败状态。',
      agentId: 'agent-ops',
      scheduleType: 'weekly',
      scheduledAt: scheduledAt(3, 13),
      duration: 25,
      priority: 'P3',
      status: 'failed',
      runStatus: 'error',
      enabled: false,
      createdAt: scheduledAt(0, 8),
    },
    {
      id: 'pending-task',
      name: '下一集检查',
      description: '普通待执行状态。',
      prompt: '检查下一集。',
      agentId: 'agent-research',
      scheduleType: 'monthly',
      scheduledAt: scheduledAt(4, 14),
      duration: 20,
      priority: 'P2',
      status: 'pending',
      enabled: true,
      createdAt: scheduledAt(0, 8),
    },
  ];
  const callbacks: FixtureCallbackCounts = {
    create: 0,
    delete: 0,
    run: 0,
    toggle: 0,
  };

  const appRoot = document.getElementById('root');
  const appRootState = {
    ariaHidden: appRoot?.getAttribute('aria-hidden') ?? null,
    inert: appRoot?.inert ?? false,
    style: appRoot?.getAttribute('style') ?? '',
  };
  if (appRoot) {
    appRoot.style.display = 'none';
    appRoot.setAttribute('aria-hidden', 'true');
    appRoot.inert = true;
  }

  const host = document.createElement('div');
  host.id = 'automation-populated-e2e-host';
  host.className = 'void-ui--minimal';
  host.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483000',
    'display:flex',
    'min-width:0',
    'min-height:0',
    'overflow:hidden',
    'background:var(--workspace-surface-canvas)',
  ].join(';');
  document.body.appendChild(host);

  const root = createRoot(host);
  const FixtureSurface = () => {
    const { view } = useAutomation();
    return React.createElement(
      'main',
      {
        className: 'automation-scene',
        'data-testid': 'automation-populated-fixture',
      },
      React.createElement(AutomationHeader),
      React.createElement(
        'div',
        { className: 'automation-scene__body' },
        view === 'list'
          ? React.createElement(ListView)
          : React.createElement(WeekView),
      ),
      React.createElement(TaskDetailPanel),
    );
  };

  fixtureWindow.__VOID_AUTOMATION_E2E_FIXTURE__ = {
    appRoot,
    appRootState,
    callbacks,
    host,
    model: {
      artifactTypes: tasks[0].artifacts.map(artifact => artifact.type),
      conversationRoles: tasks[0].conversation.map(message => message.role),
      priorities: tasks.map(task => task.priority),
      statuses: tasks.map(task => (
        task.runStatus === 'queued' ? 'queued' : task.status
      )),
    },
    root,
  };
  root.render(
    React.createElement(
      AutomationProvider,
      {
        agents,
        initialDate: anchor,
        initialView: 'week',
        onCreateTask: () => {
          callbacks.create += 1;
        },
        onDeleteTask: () => {
          callbacks.delete += 1;
        },
        onRunTaskNow: () => {
          callbacks.run += 1;
        },
        onToggleTaskEnabled: () => {
          callbacks.toggle += 1;
        },
        tasks,
      },
      React.createElement(FixtureSurface),
    ),
  );

  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const cleanupPopulatedAutomationFixture =
  (): Promise<FixtureCleanupEvidence> => browser.execute(async () => {
    const fixtureWindow = window as PopulatedAutomationFixtureWindow;
    const fixture = fixtureWindow.__VOID_AUTOMATION_E2E_FIXTURE__;
    if (!fixture) {
      return {
        ariaHiddenRestored: true,
        hostRemoved: !document.getElementById('automation-populated-e2e-host'),
        inertRestored: true,
        keyRemoved: true,
        styleRestored: true,
      };
    }

    fixture.root.unmount();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    fixture.host.remove();
    if (fixture.appRoot) {
      if (fixture.appRootState.style) {
        fixture.appRoot.setAttribute('style', fixture.appRootState.style);
      } else {
        fixture.appRoot.removeAttribute('style');
      }
      if (fixture.appRootState.ariaHidden === null) {
        fixture.appRoot.removeAttribute('aria-hidden');
      } else {
        fixture.appRoot.setAttribute(
          'aria-hidden',
          fixture.appRootState.ariaHidden,
        );
      }
      fixture.appRoot.inert = fixture.appRootState.inert;
    }

    const evidence = {
      ariaHiddenRestored:
        fixture.appRoot?.getAttribute('aria-hidden')
          === fixture.appRootState.ariaHidden,
      hostRemoved: !document.body.contains(fixture.host),
      inertRestored:
        (fixture.appRoot?.inert ?? fixture.appRootState.inert)
          === fixture.appRootState.inert,
      keyRemoved: false,
      styleRestored:
        (fixture.appRoot?.getAttribute('style') ?? '')
          === fixture.appRootState.style,
    };
    delete fixtureWindow.__VOID_AUTOMATION_E2E_FIXTURE__;
    evidence.keyRemoved =
      fixtureWindow.__VOID_AUTOMATION_E2E_FIXTURE__ === undefined;
    return evidence;
  });

const readFilledAutomationEvidence =
  (): Promise<FilledAutomationEvidence> => browser.execute(() => {
    const fixture = (
      window as PopulatedAutomationFixtureWindow
    ).__VOID_AUTOMATION_E2E_FIXTURE__;
    if (!fixture) {
      throw new Error('The populated automation fixture is not mounted');
    }
    const host = fixture.host;
    const scene = host.querySelector<HTMLElement>('.automation-scene');
    const view = host.querySelector<HTMLElement>(
      '.week-view, .list-view',
    );
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    const rectOf = (element: HTMLElement | null): RectEvidence | null => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const isRendered = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0
      );
    };
    const isHitTarget = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return {
        height: rect.height,
        hit: hit === element || Boolean(hit && element.contains(hit)),
        width: rect.width,
      };
    };
    const isCenterVisible = (element: HTMLElement): boolean => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (
        x < 0
        || y < 0
        || x > window.innerWidth
        || y > window.innerHeight
      ) {
        return false;
      }
      const hit = document.elementFromPoint(x, y);
      return hit === element || Boolean(hit && element.contains(hit));
    };
    const controls = Array.from(
      host.querySelectorAll<HTMLElement>(
        'button, select, summary, [role="tab"], [role="tabpanel"]',
      ),
    ).filter(element => isRendered(element) && isCenterVisible(element));
    const horizontalLeakSelectors = [
      '.automation-scene',
      '.week-view',
      '.list-view',
      '.list-view__row',
      '.task-detail-panel',
      '.task-detail-panel__inner',
      '.task-detail-panel__head',
      '.task-detail-panel__body',
      '.task-detail-panel__prompt',
      '.task-detail-panel__artifact',
      '.task-detail-panel__msg',
    ].join(',');
    const horizontalLeakCount = Array.from(
      host.querySelectorAll<HTMLElement>(horizontalLeakSelectors),
    ).filter(element => element.scrollWidth > element.clientWidth + 1).length;
    const longTextUnsafeCount = Array.from(
      host.querySelectorAll<HTMLElement>([
        '.task-card__title',
        '.task-card__agent',
        '.list-view__title',
        '.list-view__desc',
        '.task-detail-panel__title',
        '.task-detail-panel__desc',
        '.task-detail-panel__detail-value',
        '.task-detail-panel__prompt p',
        '.task-detail-panel__artifact-name',
        '.task-detail-panel__msg-bubble',
      ].join(',')),
    ).filter(element => {
      if (element.scrollWidth <= element.clientWidth + 1) return false;
      const style = getComputedStyle(element);
      return ![
        style.overflow,
        style.overflowX,
        style.overflowWrap,
        style.wordBreak,
      ].some(value => [
        'anywhere',
        'auto',
        'break-all',
        'break-word',
        'clip',
        'hidden',
        'scroll',
      ].includes(value));
    }).length;
    const viewport = {
      height: window.innerHeight,
      width: window.innerWidth,
    };
    const outsideControls = controls.flatMap(control => {
      const rect = control.getBoundingClientRect();
      const verticalCenter = rect.top + rect.height / 2;
      if (
        rect.left >= -1
        && rect.right <= viewport.width + 1
        // Calendar cards live in an intentional vertical scrollport. A card
        // can be partially clipped at either edge while its actionable center
        // remains visible; horizontal escape is never permitted.
        && verticalCenter >= -1
        && verticalCenter <= viewport.height + 1
      ) {
        return [];
      }
      return [{
        className: control.className,
        rect: rectOf(control)!,
        tagName: control.tagName,
      }];
    });
    const labelledBy = dialog?.getAttribute('aria-labelledby') ?? '';
    const describedBy = dialog?.getAttribute('aria-describedby') ?? '';
    const tabList = dialog?.querySelector<HTMLElement>('[role="tablist"]');
    const dialogControls = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>([
        '.task-detail-panel__close',
        '.task-detail-panel__btn',
        '[role="tab"]',
      ].join(','))).filter(isRendered).map(isHitTarget)
      : [];

    return {
      callbackCounts: { ...fixture.callbacks },
      cardCount: host.querySelectorAll('.task-card').length,
      cardLabels: Array.from(
        host.querySelectorAll<HTMLElement>('.task-card'),
      ).map(card => card.getAttribute('aria-label') ?? ''),
      dialog: dialog && rectOf(dialog)
        ? {
          controls: dialogControls,
          described:
            Boolean(describedBy)
            && Boolean(document.getElementById(describedBy)?.textContent?.length),
          labelled:
            Boolean(labelledBy)
            && Boolean(document.getElementById(labelledBy)?.textContent?.length),
          rect: rectOf(dialog)!,
          tabListLabelled:
            tabList?.getAttribute('aria-labelledby') === labelledBy,
        }
        : null,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalLeakCount,
      hostClientWidth: host.clientWidth,
      hostScrollWidth: host.scrollWidth,
      longTextUnsafeCount,
      model: fixture.model,
      outsideControls,
      priorityModifiers: Array.from(
        host.querySelectorAll<HTMLElement>('.task-card'),
      ).flatMap(card => Array.from(card.classList).filter(
        className => /^task-card--p[0-3]$/.test(className),
      )),
      root: rectOf(view),
      scene: rectOf(scene),
      viewport,
      visibleControlCount: controls.length,
      visibleControlOutsideViewportCount: outsideControls.length,
    };
  });

const expectFilledAutomationLayout = (
  evidence: FilledAutomationEvidence,
): void => {
  expect(evidence.scene?.width ?? 0).toBeGreaterThan(0);
  expect(evidence.scene?.height ?? 0).toBeGreaterThan(0);
  expect(evidence.root?.width ?? 0).toBeGreaterThan(0);
  expect(evidence.root?.height ?? 0).toBeGreaterThan(0);
  expect(evidence.documentScrollWidth)
    .toBeLessThanOrEqual(evidence.viewport.width + 1);
  expect(evidence.hostScrollWidth)
    .toBeLessThanOrEqual(evidence.hostClientWidth + 1);
  expect(evidence.horizontalLeakCount).toBe(0);
  expect(evidence.longTextUnsafeCount).toBe(0);
  expect(evidence.visibleControlCount).toBeGreaterThan(0);
  if (evidence.outsideControls.length > 0) {
    throw new Error(
      'Rendered automation controls escaped the viewport:\n'
        + JSON.stringify(evidence.outsideControls, null, 2),
    );
  }
  expect(evidence.callbackCounts).toEqual({
    create: 0,
    delete: 0,
    run: 0,
    toggle: 0,
  });
};

const expectFixtureCleanup = (evidence: FixtureCleanupEvidence): void => {
  expect(evidence).toEqual({
    ariaHiddenRestored: true,
    hostRemoved: true,
    inertRestored: true,
    keyRemoved: true,
    styleRestored: true,
  });
};

describe('L0 minimal automation visual capture', () => {
  let sourceUrl = '';
  let originalThemeSelection = 'system';
  let originalWindowSize = { width: 1280, height: 800 };

  before(async () => {
    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    const savedSelection = await readThemeSelection();
    if (typeof savedSelection === 'string' && savedSelection.length > 0) {
      originalThemeSelection = savedSelection;
    }
    await browser.maximizeWindow();
    await browser.waitUntil(async () => browser.execute(() => (
      document
        .querySelector('[data-testid="app-layout"]')
        ?.getAttribute('data-ui-presentation') === 'minimal'
    )), {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: 'Minimal workspace presentation did not activate',
    });

    await openAutomationScene();
  });

  it('keeps the full automation workspace stable at the wide desktop size', async () => {
    const evidence = await readAutomationLayout();
    expectStableAutomationLayout(evidence);
    expect(evidence.filterOpen).toBe(false);
    expect(evidence.filterSelectCount).toBe(3);
    expect(evidence.filterVisibleSelectCount).toBe(0);
    expect(evidence.header?.height ?? Number.POSITIVE_INFINITY)
      .toBeLessThanOrEqual(44);

    await saveScreenshot('automation-wide', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice4-minimal',
    });
    await saveElementScreenshot('.automation-scene', 'automation-wide-scene', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice4-minimal',
    });
  });

  it('keeps filters accessible without growing the header at 1024x720', async () => {
    try {
      await browser.setWindowSize(1024, 720);
      await browser.waitUntil(async () => {
        const evidence = await readAutomationLayout();
        return (
          evidence.viewport.width <= 1024
          && evidence.viewport.height <= 720
          && (evidence.body?.top ?? 0) >= (evidence.header?.bottom ?? 0) - 1
        );
      }, {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'Automation layout did not settle at 1024x720',
      });

      const closedEvidence = await readAutomationLayout();
      expectStableAutomationLayout(closedEvidence);
      expect(closedEvidence.filterOpen).toBe(false);
      expect(closedEvidence.filterSelectCount).toBe(3);
      expect(closedEvidence.filterVisibleSelectCount).toBe(0);
      expect(closedEvidence.header?.height ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(72);

      await saveScreenshot('automation-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice4-minimal',
      });
      await saveElementScreenshot(
        '.automation-scene',
        'automation-1024x720-scene',
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice4-minimal',
        },
      );

      const filterTrigger = await $('.automation-header__filter-trigger');
      await filterTrigger.waitForClickable({ timeout: 5_000 });
      await filterTrigger.click();
      await browser.waitUntil(async () => {
        const evidence = await readAutomationLayout();
        return evidence.filterOpen && evidence.filterVisibleSelectCount === 3;
      }, {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'Automation filter disclosure did not open',
      });

      const openEvidence = await readAutomationLayout();
      expectStableAutomationLayout(openEvidence);
      expect(openEvidence.filterOpen).toBe(true);
      expect(openEvidence.filterVisibleSelectCount).toBe(3);
      expect(openEvidence.filterPanel).not.toBeNull();
      expect(
        Math.abs(
          (openEvidence.header?.height ?? 0)
          - (closedEvidence.header?.height ?? 0),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          (openEvidence.body?.top ?? 0)
          - (closedEvidence.body?.top ?? 0),
        ),
      ).toBeLessThanOrEqual(1);
      expect(openEvidence.filterPanel?.left ?? -1)
        .toBeGreaterThanOrEqual((openEvidence.scene?.left ?? 0) - 1);
      expect(openEvidence.filterPanel?.right ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual((openEvidence.scene?.right ?? 0) + 1);

      await saveScreenshot('automation-1024x720-filters-open', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice4-minimal',
      });
      await saveElementScreenshot(
        '.automation-scene',
        'automation-1024x720-filters-open-scene',
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice4-minimal',
        },
      );

      await browser.execute(() => {
        document
          .querySelector<HTMLSelectElement>(
            '.automation-header__filters select',
          )
          ?.focus();
      });
      await browser.keys(['Escape']);
      await browser.waitUntil(async () => {
        const evidence = await readAutomationLayout();
        return !evidence.filterOpen && evidence.filterTriggerFocused;
      }, {
        timeout: 5_000,
        interval: 100,
        timeoutMsg:
          'Escape did not close automation filters and restore trigger focus',
      });

      const escapedEvidence = await readAutomationLayout();
      expectStableAutomationLayout(escapedEvidence);
      expect(escapedEvidence.filterVisibleSelectCount).toBe(0);
      expect(
        Math.abs(
          (escapedEvidence.header?.height ?? 0)
          - (closedEvidence.header?.height ?? 0),
        ),
      ).toBeLessThanOrEqual(1);
    } finally {
      await browser.maximizeWindow();
    }
  });

  it('keeps day, month, and list views inside the same compact shell', async () => {
    const views = [
      ['day', 1, '.day-view'],
      ['month', 3, '.month-view'],
      ['list', 4, '.list-view'],
      ['week', 2, '.week-view'],
    ] as const;

    for (const [view, optionIndex, rootSelector] of views) {
      const evidence = await switchAutomationView(
        view,
        optionIndex,
        rootSelector,
      );
      expect(evidence.view).toBe(view);
      expect(evidence.scene?.width ?? 0).toBeGreaterThan(0);
      expect(evidence.scene?.height ?? 0).toBeGreaterThan(0);
      expect(evidence.body?.width ?? 0).toBeGreaterThan(0);
      expect(evidence.body?.height ?? 0).toBeGreaterThan(0);
      expect(evidence.root?.width ?? 0).toBeGreaterThan(0);
      expect(evidence.root?.height ?? 0).toBeGreaterThan(0);
      expect(evidence.root?.left ?? -1)
        .toBeGreaterThanOrEqual((evidence.body?.left ?? 0) - 1);
      expect(evidence.root?.right ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual((evidence.body?.right ?? 0) + 1);
      expect(evidence.documentScrollWidth)
        .toBeLessThanOrEqual(evidence.viewportWidth + 1);

      await saveElementScreenshot(
        '.automation-scene',
        `automation-${view}-view`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice15-minimal',
        },
      );
    }
  });

  it('renders the calendar from workspace tokens in dark and light themes', async () => {
    const captures: AutomationThemeEvidence[] = [];

    for (const [themeId, themeType] of [
      ['void-dark', 'dark'],
      ['void-light', 'light'],
    ] as const satisfies ReadonlyArray<readonly [ThemeId, 'dark' | 'light']>) {
      await writeThemeSelection(themeId);

      const target = new URL(sourceUrl);
      target.searchParams.set('void-ui', 'minimal');
      await browser.url(target.toString());
      await browser.waitUntil(async () => browser.execute(
        (expectedTheme) => (
          document.documentElement.getAttribute('data-theme') === expectedTheme
          && document
            .querySelector('[data-testid="app-layout"]')
            ?.getAttribute('data-ui-presentation') === 'minimal'
          && !document.querySelector('.splash-screen')
        ),
        themeId,
      ), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: `${themeId} did not settle before automation capture`,
      });

      await openAutomationScene();
      await browser.execute(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      });

      const evidence = await readAutomationTheme();
      expect(evidence.theme).toBe(themeId);
      expect(evidence.themeType).toBe(themeType);
      expect(evidence.sceneBackground.length).toBeGreaterThan(0);
      expect(evidence.dateColor.length).toBeGreaterThan(0);
      expect(evidence.todayBackground.length).toBeGreaterThan(0);
      expect(evidence.todayDateBackground.length).toBeGreaterThan(0);
      expect(evidence.todayDateColor.length).toBeGreaterThan(0);
      expect(evidence.todayDateContrast).toBeGreaterThanOrEqual(4.5);
      captures.push(evidence);

      await saveScreenshot(`automation-theme-${themeType}`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice8-minimal',
      });
      await saveElementScreenshot(
        '.automation-scene',
        `automation-theme-${themeType}-scene`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice8-minimal',
        },
      );

      const createButton = await $('.automation-header__create-btn');
      await createButton.waitForClickable({ timeout: 5_000 });
      await createButton.click();
      const createDialog = await $('.create-task-dialog');
      await createDialog.waitForDisplayed({ timeout: 5_000 });

      const prioritySignatures: string[] = [];
      for (let index = 1; index <= 4; index += 1) {
        const priorityOption = await $(
          `.create-task-dialog__priority-option:nth-child(${index})`,
        );
        await priorityOption.waitForClickable({ timeout: 5_000 });
        await priorityOption.click();
        await browser.waitUntil(async () => priorityOption.getAttribute(
          'class',
        ).then((className) => className.includes(
          'create-task-dialog__priority-option--active',
        )), {
          timeout: 2_000,
          interval: 50,
          timeoutMsg: `Priority option ${index} did not become active`,
        });
        await browser.waitUntil(async () => browser.execute(
          (selector) => {
            const option = document.querySelector<HTMLElement>(selector);
            return Boolean(option) && option!.getAnimations().every(
              animation => animation.playState === 'finished',
            );
          },
          `.create-task-dialog__priority-option:nth-child(${index})`,
        ), {
          timeout: 2_000,
          interval: 25,
          timeoutMsg: `Priority option ${index} transition did not settle`,
        });
        prioritySignatures.push(await browser.execute(
          (selector) => {
            const option = document.querySelector<HTMLElement>(selector);
            if (!option) return '';
            const style = getComputedStyle(option);
            return [
              style.color,
              style.backgroundColor,
              style.borderColor,
            ].join('|');
          },
          `.create-task-dialog__priority-option:nth-child(${index})`,
        ));
      }
      if (new Set(prioritySignatures).size !== 4) {
        throw new Error(
          'Automation priority visual signatures are not unique:\n'
            + JSON.stringify(prioritySignatures, null, 2),
        );
      }

      await saveScreenshot(`automation-theme-${themeType}-dialog`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice8-minimal',
      });
      await saveElementScreenshot(
        '.create-task-dialog',
        `automation-theme-${themeType}-dialog-surface`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice8-minimal',
        },
      );

      const closeDialog = await $('.create-task-dialog__close');
      await closeDialog.waitForClickable({ timeout: 5_000 });
      await closeDialog.click();
      await createDialog.waitForDisplayed({
        timeout: 5_000,
        reverse: true,
      });
    }

    expect(captures[0].sceneBackground)
      .not.toBe(captures[1].sceneBackground);
    expect(captures[0].dateColor).not.toBe(captures[1].dateColor);
    expect(captures[0].todayBackground)
      .not.toBe(captures[1].todayBackground);
  });

  for (const {
    height,
    themeId,
    themeType,
    width,
  } of [
    {
      height: 800,
      themeId: 'void-light',
      themeType: 'light',
      width: 1280,
    },
    {
      height: 720,
      themeId: 'void-dark',
      themeType: 'dark',
      width: 1024,
    },
  ] as const) {
    it(
      `keeps populated automation detail keyboard-safe in ${themeType} at `
        + `${width}x${height}`,
      async () => {
        try {
          await writeThemeSelection(themeId);
          const target = new URL(sourceUrl);
          target.searchParams.set('void-ui', 'minimal');
          await browser.url(target.toString());
          await browser.setWindowSize(width, height);
          await browser.waitUntil(async () => browser.execute(
            (expectedTheme, expectedWidth, expectedHeight) => (
              document.documentElement.getAttribute('data-theme')
                === expectedTheme
              && document
                .querySelector('[data-testid="app-layout"]')
                ?.getAttribute('data-ui-presentation') === 'minimal'
              && !document.querySelector('.splash-screen')
              && window.innerWidth <= expectedWidth
              && window.innerHeight <= expectedHeight
            ),
            themeId,
            width,
            height,
          ), {
            timeout: 20_000,
            interval: 100,
            timeoutMsg:
              `${themeId} ${width}x${height} did not settle before fixture mount`,
          });

          await mountPopulatedAutomationFixture();
          await $('.automation-scene .week-view').waitForDisplayed({
            timeout: 10_000,
          });
          await browser.waitUntil(async () => browser.execute(() => (
            document.querySelectorAll(
              '#automation-populated-e2e-host .task-card',
            ).length === 5
          )), {
            timeout: 10_000,
            interval: 100,
            timeoutMsg: 'The populated week fixture did not render five tasks',
          });

          const weekEvidence = await readFilledAutomationEvidence();
          expectFilledAutomationLayout(weekEvidence);
          expect(weekEvidence.cardCount).toBe(5);
          expect(new Set(weekEvidence.model.statuses)).toEqual(new Set([
            'pending',
            'queued',
            'running',
            'completed',
            'failed',
          ]));
          expect(new Set(weekEvidence.model.priorities)).toEqual(new Set([
            'P0',
            'P1',
            'P2',
            'P3',
          ]));
          expect(new Set(weekEvidence.priorityModifiers)).toEqual(new Set([
            'task-card--p0',
            'task-card--p1',
            'task-card--p2',
            'task-card--p3',
          ]));
          expect(weekEvidence.cardLabels.some(label => (
            /排队中|queued|status\.queued/i.test(label)
          ))).toBe(true);

          await saveScreenshot(`automation-filled-week-${themeType}`, {
            directory: screenshotDirectory,
            includeTimestamp: false,
            prefix: 'slice16-minimal',
          });

          const listViewButton = await $(
            '.automation-header__view-btn:nth-child(4)',
          );
          await listViewButton.waitForClickable({ timeout: 5_000 });
          await listViewButton.click();
          await $('.automation-scene .list-view').waitForDisplayed({
            timeout: 5_000,
          });
          await browser.waitUntil(async () => browser.execute(() => (
            document.querySelectorAll(
              '#automation-populated-e2e-host .list-view__row',
            ).length === 5
          )), {
            timeout: 5_000,
            interval: 100,
            timeoutMsg: 'The populated list fixture did not render five rows',
          });
          const listEvidence = await readFilledAutomationEvidence();
          expectFilledAutomationLayout(listEvidence);
          expect((await $$(
            '#automation-populated-e2e-host .list-view__row',
          )).length).toBe(5);
          await saveScreenshot(`automation-filled-list-${themeType}`, {
            directory: screenshotDirectory,
            includeTimestamp: false,
            prefix: 'slice16-minimal',
          });

          const weekViewButton = await $(
            '.automation-header__view-btn:nth-child(2)',
          );
          await weekViewButton.waitForClickable({ timeout: 5_000 });
          await weekViewButton.click();
          await $('.automation-scene .week-view').waitForDisplayed({
            timeout: 5_000,
          });

          const origin = await $(
            '#automation-populated-e2e-host '
              + '.task-card[aria-label*="排队"]',
          );
          await origin.waitForClickable({ timeout: 5_000 });
          await browser.execute(() => {
            document.querySelector<HTMLElement>(
              '#automation-populated-e2e-host '
                + '.task-card[aria-label*="排队"]',
            )?.focus();
          });
          await origin.click();
          const dialog = await $(
            '#automation-populated-e2e-host [role="dialog"]',
          );
          await dialog.waitForDisplayed({ timeout: 5_000 });
          await browser.waitUntil(async () => browser.execute(() => (
            document.activeElement?.classList.contains(
              'task-detail-panel__close',
            ) === true
          )), {
            timeout: 5_000,
            interval: 50,
            timeoutMsg: 'The task detail close button did not receive focus',
          });
          await browser.waitUntil(async () => browser.execute(() => {
            const panel = document.querySelector<HTMLElement>(
              '#automation-populated-e2e-host [role="dialog"]',
            );
            if (!panel) return false;
            const rect = panel.getBoundingClientRect();
            return (
              rect.left >= -1
              && rect.right <= window.innerWidth + 1
              && rect.top >= -1
              && rect.bottom <= window.innerHeight + 1
              && panel.getAnimations().every(
                animation => animation.playState === 'finished',
              )
            );
          }), {
            timeout: 2_000,
            interval: 25,
            timeoutMsg:
              'The task detail entrance animation did not settle in viewport',
          });

          const promptEvidence = await readFilledAutomationEvidence();
          expectFilledAutomationLayout(promptEvidence);
          expect(promptEvidence.dialog).not.toBeNull();
          expect(promptEvidence.dialog?.labelled).toBe(true);
          expect(promptEvidence.dialog?.described).toBe(true);
          expect(promptEvidence.dialog?.tabListLabelled).toBe(true);
          expect(promptEvidence.dialog?.rect.left ?? -1)
            .toBeGreaterThanOrEqual(-1);
          expect(promptEvidence.dialog?.rect.right ?? Number.POSITIVE_INFINITY)
            .toBeLessThanOrEqual(promptEvidence.viewport.width + 1);
          expect(promptEvidence.dialog?.rect.top ?? -1)
            .toBeGreaterThanOrEqual(-1);
          expect(promptEvidence.dialog?.rect.bottom ?? Number.POSITIVE_INFINITY)
            .toBeLessThanOrEqual(promptEvidence.viewport.height + 1);
          expect(promptEvidence.dialog?.controls).toHaveLength(7);
          for (const control of promptEvidence.dialog?.controls ?? []) {
            expect(control.hit).toBe(true);
            expect(control.width).toBeGreaterThanOrEqual(28);
            expect(control.height).toBeGreaterThanOrEqual(28);
          }
          expect(new Set(promptEvidence.model.artifactTypes)).toEqual(new Set([
            'document',
            'image',
            'code',
            'data',
          ]));
          expect(new Set(promptEvidence.model.conversationRoles)).toEqual(
            new Set(['user', 'assistant', 'tool']),
          );
          await saveScreenshot(`automation-detail-prompt-${themeType}`, {
            directory: screenshotDirectory,
            includeTimestamp: false,
            prefix: 'slice16-minimal',
          });

          const closeButton = await $('.task-detail-panel__close');
          await browser.execute(() => {
            const close = document.querySelector<HTMLElement>(
              '.task-detail-panel__close',
            );
            close?.focus();
            // The embedded WebDriver bridge performs native Tab traversal
            // without dispatching a DOM Tab keydown. Dispatch the cancellable
            // event here so the production focus trap itself is exercised.
            close?.dispatchEvent(new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: 'Tab',
              shiftKey: true,
            }));
          });
          expect(await browser.execute(() => (
            document.activeElement?.getAttribute('role')
          ))).toBe('tabpanel');
          await browser.execute(() => {
            document.activeElement?.dispatchEvent(
              new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'Tab',
              }),
            );
          });
          expect(await browser.execute(() => (
            document.activeElement?.classList.contains(
              'task-detail-panel__close',
            ) === true
          ))).toBe(true);

          const promptTab = await $(
            '.task-detail-panel__tab[aria-controls*="-prompt-panel"]',
          );
          await promptTab.click();
          await browser.keys(['ArrowRight']);
          await browser.waitUntil(async () => (
            $('.task-detail-panel__tab[aria-controls*="-artifacts-panel"]')
              .getAttribute('aria-selected')
          ).then(selected => selected === 'true'), {
            timeout: 2_000,
            interval: 50,
            timeoutMsg: 'ArrowRight did not activate the artifacts tab',
          });
          expect((await $$(
            '#automation-populated-e2e-host .task-detail-panel__artifact',
          )).length).toBe(4);
          const artifactEvidence = await readFilledAutomationEvidence();
          expectFilledAutomationLayout(artifactEvidence);
          await saveScreenshot(`automation-detail-artifacts-${themeType}`, {
            directory: screenshotDirectory,
            includeTimestamp: false,
            prefix: 'slice16-minimal',
          });

          await browser.keys(['End']);
          await browser.waitUntil(async () => (
            $('.task-detail-panel__tab[aria-controls*="-conversation-panel"]')
              .getAttribute('aria-selected')
          ).then(selected => selected === 'true'), {
            timeout: 2_000,
            interval: 50,
            timeoutMsg: 'End did not activate the conversation tab',
          });
          expect((await $$(
            '#automation-populated-e2e-host .task-detail-panel__msg',
          )).length).toBe(3);
          const conversationEvidence = await readFilledAutomationEvidence();
          expectFilledAutomationLayout(conversationEvidence);
          await saveScreenshot(`automation-detail-conversation-${themeType}`, {
            directory: screenshotDirectory,
            includeTimestamp: false,
            prefix: 'slice16-minimal',
          });

          await browser.keys(['Home']);
          await browser.waitUntil(async () => (
            promptTab.getAttribute('aria-selected')
          ).then(selected => selected === 'true'), {
            timeout: 2_000,
            interval: 50,
            timeoutMsg: 'Home did not return to the prompt tab',
          });
          await browser.keys(['Escape']);
          await dialog.waitForDisplayed({ timeout: 5_000, reverse: true });
          await browser.waitUntil(async () => browser.execute(() => (
            document.activeElement?.matches(
              '#automation-populated-e2e-host .task-card[aria-label*="排队"]',
            ) === true
          )), {
            timeout: 5_000,
            interval: 50,
            timeoutMsg: 'Escape did not restore focus to the source task card',
          });
          expect(await readFilledAutomationEvidence().then(
            evidence => evidence.callbackCounts,
          )).toEqual({
            create: 0,
            delete: 0,
            run: 0,
            toggle: 0,
          });
          expect(await closeButton.isExisting()).toBe(false);
        } finally {
          expectFixtureCleanup(await cleanupPopulatedAutomationFixture());
        }
      },
    );
  }

  after(async () => {
    const cleanupFailures: string[] = [];

    await attemptCleanup(
      cleanupFailures,
      'cleanup populated automation fixture',
      async () => {
        expectFixtureCleanup(await cleanupPopulatedAutomationFixture());
      },
    );
    await attemptCleanup(cleanupFailures, 'restore theme selection', async () => {
      await writeThemeSelection(originalThemeSelection);
    });
    await attemptCleanup(cleanupFailures, 'restore source URL', async () => {
      await browser.url(sourceUrl);
      await browser.waitUntil(async () => browser.execute(() => (
        Boolean(document.querySelector('[data-testid="app-layout"]'))
        && !document.querySelector('.splash-screen')
      )), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: 'Original application URL did not settle during cleanup',
      });
    });
    await attemptCleanup(cleanupFailures, 'restore window size', async () => {
      await browser.setWindowSize(
        originalWindowSize.width,
        originalWindowSize.height,
      );
    });
    await attemptCleanup(cleanupFailures, 'verify theme selection', async () => {
      const restoredSelection = await readThemeSelection();
      if (restoredSelection !== originalThemeSelection) {
        throw new Error(
          `expected ${originalThemeSelection}, received ${String(restoredSelection)}`,
        );
      }
    });
    await attemptCleanup(cleanupFailures, 'verify source URL', async () => {
      const restoredUrl = await browser.getUrl();
      if (restoredUrl !== sourceUrl) {
        throw new Error(`expected ${sourceUrl}, received ${restoredUrl}`);
      }
    });
    await attemptCleanup(cleanupFailures, 'verify window size', async () => {
      const restoredWindowSize = await browser.getWindowSize();
      if (
        restoredWindowSize.width !== originalWindowSize.width
        || restoredWindowSize.height !== originalWindowSize.height
      ) {
        throw new Error(
          `expected ${originalWindowSize.width}x${originalWindowSize.height}, `
          + `received ${restoredWindowSize.width}x${restoredWindowSize.height}`,
        );
      }
    });

    if (cleanupFailures.length > 0) {
      throw new Error(
        `Automation visual contract cleanup failed:\n${cleanupFailures.join('\n')}`,
      );
    }
  });
});
