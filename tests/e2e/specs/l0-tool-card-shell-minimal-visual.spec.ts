import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';

import {
  saveElementScreenshot,
  saveScreenshot,
} from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);

type FixtureWindow = Window & {
  __VOID_TOOL_CARD_SHELL_E2E_FIXTURE__?: {
    appRoot: HTMLElement | null;
    appRootAriaHidden: string | null;
    appRootInert: boolean;
    appRootStyle: string;
    colorScheme: string;
    host: HTMLElement;
    root: { unmount(): void };
    theme: string | null;
    themeType: string | null;
  };
};

const setFixtureTheme = async (theme: string) => {
  await browser.execute(async (themeId) => {
    const internals = (
      window as Window & {
        __TAURI_INTERNALS__?: {
          invoke(command: string, args?: unknown): Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (!internals) {
      throw new Error('Tauri internals are unavailable while setting the theme');
    }
    await internals.invoke('set_config', {
      request: { path: 'themes.current', value: themeId },
    });
  }, theme);
  return true;
};

const resetFixtureScroll = () => browser.execute(async () => {
  const list = document.querySelector<HTMLElement>(
    '#tool-card-shell-minimal-e2e-host .virtual-message-list',
  );
  if (list) list.scrollTop = 0;
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const waitForFixtureContentStable = async () => {
  let previousHeights: readonly [number, number] | null = null;
  let stableSamples = 0;

  await browser.waitUntil(async () => {
    const evidence = await browser.execute(() => {
      const readCollapse = (selector: string) => {
        const collapse = document.querySelector<HTMLElement>(selector);
        const inner = collapse?.querySelector<HTMLElement>(
          '.smooth-height-collapse__inner',
        );
        if (!collapse || !inner) {
          return [false, -1] as const;
        }

        const collapseRect = collapse.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        const tolerance = 1;
        return [
          (
            collapse.classList.contains('smooth-height-collapse--open')
            && getComputedStyle(collapse).opacity === '1'
            && innerRect.top >= collapseRect.top - tolerance
            && innerRect.bottom <= collapseRect.bottom + tolerance
            && collapseRect.height >= inner.scrollHeight - tolerance
          ),
          collapseRect.height,
        ] as const;
      };

      const confirmation = readCollapse(
        '.fixture-confirmation .base-tool-card-expanded-collapse',
      );
      const error = readCollapse(
        '.fixture-error .base-tool-card-error-collapse',
      );
      return [
        confirmation[0],
        confirmation[1],
        error[0],
        error[1],
      ] as const;
    });

    if (!evidence[0] || !evidence[2]) {
      previousHeights = null;
      stableSamples = 0;
      return false;
    }

    const heights = [evidence[1], evidence[3]] as const;
    if (
      previousHeights
      && Math.abs(previousHeights[0] - heights[0]) <= 0.25
      && Math.abs(previousHeights[1] - heights[1]) <= 0.25
    ) {
      stableSamples += 1;
    } else {
      stableSamples = 0;
    }
    previousHeights = heights;
    return stableSamples >= 2;
  }, {
    timeout: 5_000,
    interval: 50,
    timeoutMsg:
      'Confirmation and error collapse content did not become fully visible and height-stable',
  });
};

const mountToolCardFixture = () => browser.execute(async () => {
  const fixtureWindow = window as FixtureWindow;
  if (fixtureWindow.__VOID_TOOL_CARD_SHELL_E2E_FIXTURE__) {
    throw new Error('The tool-card fixture is already mounted');
  }

  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const baseModule = await import('/src/flow_chat/tool-cards/BaseToolCard.tsx');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const compactModule = await import('/src/flow_chat/tool-cards/CompactToolCard.tsx');

  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  const BaseToolCard = baseModule.BaseToolCard;
  const ToolCardHeader = baseModule.ToolCardHeader;
  const CompactToolCard = compactModule.CompactToolCard;
  const CompactToolCardHeader = compactModule.CompactToolCardHeader;
  if (
    !createRoot
    || !BaseToolCard
    || !ToolCardHeader
    || !CompactToolCard
    || !CompactToolCardHeader
  ) {
    throw new Error('Unable to mount the real shared tool-card components');
  }

  const appRoot = document.getElementById('root');
  const appRootAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
  const appRootInert = appRoot?.inert ?? false;
  const appRootStyle = appRoot?.getAttribute('style') ?? '';
  if (appRoot) {
    appRoot.style.display = 'none';
    appRoot.setAttribute('aria-hidden', 'true');
    appRoot.inert = true;
  }

  const documentRoot = document.documentElement;
  const host = document.createElement('div');
  host.id = 'tool-card-shell-minimal-e2e-host';
  host.className = 'void-ui--minimal';
  host.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'overflow:hidden',
    'background:var(--workspace-surface-canvas)',
    'color:var(--workspace-text-primary)',
  ].join(';');
  document.body.appendChild(host);

  const icon = (text: string, className = '') => React.createElement(
    'span',
    {
      'aria-hidden': 'true',
      className,
      style: { display: 'inline-grid', placeItems: 'center', width: '16px' },
    },
    text,
  );
  const baseHeader = (
    action: string,
    content: string,
    statusClass = '',
  ) => React.createElement(ToolCardHeader, {
    action,
    content,
    icon: icon('·'),
    statusIcon: icon('●', statusClass),
  });
  const compactHeader = (
    action: string,
    content: string,
    statusClass = '',
  ) => React.createElement(CompactToolCardHeader, {
    action,
    content,
    icon: icon('·', statusClass),
    rightStatusIcon: icon('›'),
  });

  function Fixture() {
    const [expanded, setExpanded] = React.useState(true);
    const [activationCount, setActivationCount] = React.useState(0);
    const [nestedActionCount, setNestedActionCount] = React.useState(0);
    return React.createElement(
      'main',
      {
        className: 'modern-flowchat-container flow-chat-typography',
        'data-activation-count': activationCount,
        'data-nested-action-count': nestedActionCount,
        'data-testid': 'tool-card-shell-minimal-fixture',
        style: {
          width: 'min(760px, calc(100vw - 48px))',
          border: '1px solid var(--workspace-border-subtle)',
          borderRadius: 'var(--workspace-radius-panel)',
          background: 'var(--workspace-surface-panel)',
          overflow: 'hidden',
        },
      },
      React.createElement(
        'section',
        {
          className: 'virtual-message-list',
          style: { overflow: 'auto', padding: '24px' },
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gap: 'var(--workspace-space-2)',
              width: '100%',
            },
          },
          React.createElement(
            'header',
            { style: { paddingBlockEnd: 'var(--workspace-space-2)' } },
            React.createElement(
              'strong',
              { style: { fontSize: 'var(--workspace-font-size-body)' } },
              '工具调用',
            ),
            React.createElement(
              'p',
              {
                style: {
                  margin: 'var(--workspace-space-1) 0 0',
                  color: 'var(--workspace-text-muted)',
                  fontSize: 'var(--workspace-font-size-caption)',
                },
              },
              '普通状态保持轻量，风险与错误状态保持可见。',
            ),
          ),
          React.createElement(
            'div',
            { className: 'fixture-completed' },
            React.createElement(CompactToolCard, {
              status: 'completed',
              header: compactHeader('读取文件', 'src/short-drama/scene.ts', 'tcss-check'),
            }),
          ),
          React.createElement(
            'div',
            { className: 'fixture-running' },
            React.createElement(CompactToolCard, {
              status: 'running',
              header: compactHeader('生成分镜', '正在整理镜头与资产'),
            }),
          ),
          React.createElement(
            'div',
            { className: 'fixture-expandable' },
            React.createElement(BaseToolCard, {
              status: 'completed',
              isExpanded: expanded,
              onClick: () => {
                setActivationCount((value: number) => value + 1);
                setExpanded((value: boolean) => !value);
              },
              header: React.createElement(ToolCardHeader, {
                action: '已完成',
                content: '查看生成结果',
                icon: icon('·'),
                statusIcon: icon('●', 'icon-completed'),
                extra: React.createElement(
                  'button',
                  {
                    'data-testid': 'tool-card-nested-action',
                    onClick: () => setNestedActionCount(
                      (value: number) => value + 1,
                    ),
                    style: {
                      minHeight: '24px',
                      padding: '0 var(--workspace-space-1)',
                      border: '1px solid var(--workspace-border-subtle)',
                      borderRadius: 'var(--workspace-radius-control)',
                      background: 'transparent',
                      color: 'var(--workspace-text-secondary)',
                      font: 'inherit',
                    },
                    type: 'button',
                  },
                  '详情操作',
                ),
              }),
              expandedContent: React.createElement(
                'div',
                { 'data-testid': 'tool-card-expanded-content' },
                '角色、场景与分镜资产已写入工作区。',
              ),
            }),
          ),
          React.createElement(
            'div',
            { className: 'fixture-compact-default' },
            React.createElement(CompactToolCard, {
              status: 'completed',
              clickable: true,
              onClick: () => undefined,
              header: compactHeader('内联展开', '查看命令结果'),
            }),
          ),
          React.createElement(
            'div',
            {
              className: 'fixture-open-right',
              style: { position: 'fixed', left: '-20000px', width: '600px' },
            },
            React.createElement(CompactToolCard, {
              status: 'completed',
              clickable: true,
              onClick: () => undefined,
              header: React.createElement(CompactToolCardHeader, {
                action: '在侧栏打开',
                affordanceKind: 'open-panel-right',
                content: '查看完整结果',
                icon: icon('·'),
              }),
            }),
          ),
          React.createElement(
            'div',
            { className: 'fixture-confirmation' },
            React.createElement(BaseToolCard, {
              status: 'pending_confirmation',
              isExpanded: true,
              requiresConfirmation: true,
              className: 'default-tool-card',
              header: baseHeader('需要确认', '即将覆盖当前分镜草稿'),
              expandedContent: React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    gap: 'var(--workspace-space-2)',
                    alignItems: 'center',
                  },
                },
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    style: {
                      minHeight: '28px',
                      padding: '0 var(--workspace-space-2)',
                      border: '1px solid var(--workspace-border-subtle)',
                      borderRadius: 'var(--workspace-radius-control)',
                      background: 'var(--workspace-surface-panel)',
                      color: 'var(--workspace-text-primary)',
                    },
                  },
                  '确认',
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    style: {
                      minHeight: '28px',
                      padding: '0 var(--workspace-space-2)',
                      border: '1px solid var(--workspace-border-subtle)',
                      borderRadius: 'var(--workspace-radius-control)',
                      background: 'transparent',
                      color: 'var(--workspace-text-secondary)',
                    },
                  },
                  '取消',
                ),
              ),
            }),
          ),
          React.createElement(
            'div',
            { className: 'fixture-error' },
            React.createElement(BaseToolCard, {
              status: 'error',
              isFailed: true,
              header: baseHeader('生成失败', '图片服务暂时不可用', 'icon-error'),
              errorContent: React.createElement(
                'div',
                { className: 'error-content' },
                React.createElement(
                  'span',
                  { className: 'error-message' },
                  '请检查网络后重试，现有资产不会丢失。',
                ),
              ),
            }),
          ),
          React.createElement(
            'div',
            {
              'aria-hidden': 'true',
              style: { position: 'fixed', left: '-20000px', width: '600px' },
            },
            React.createElement(
              'div',
              { className: 'fixture-excluded-task' },
              React.createElement(BaseToolCard, {
                status: 'completed',
                className: 'task-tool-display',
                header: baseHeader('子代理', '保持既有专属呈现'),
              }),
            ),
            React.createElement(
              'div',
              { className: 'fixture-excluded-media' },
              React.createElement(CompactToolCard, {
                status: 'completed',
                className: 'media-generation-card',
                header: compactHeader('媒体生成', '保持既有专属呈现'),
              }),
            ),
          ),
        ),
      ),
    );
  }

  const root = createRoot(host);
  fixtureWindow.__VOID_TOOL_CARD_SHELL_E2E_FIXTURE__ = {
    appRoot,
    appRootAriaHidden,
    appRootInert,
    appRootStyle,
    colorScheme: documentRoot.style.colorScheme,
    host,
    root,
    theme: documentRoot.getAttribute('data-theme'),
    themeType: documentRoot.getAttribute('data-theme-type'),
  };
  root.render(React.createElement(Fixture));

  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  const frame = host.querySelector<HTMLElement>(
    '[data-testid="tool-card-shell-minimal-fixture"]',
  );
  const activation = host.querySelector<HTMLButtonElement>(
    '.fixture-expandable .tool-card-header-activation',
  );
  if (!frame || !activation) {
    throw new Error('The real header activation button did not mount');
  }
  const recordActivationKey = (event: KeyboardEvent) => {
    const key = event.key === ' ' || event.key === 'Spacebar'
      ? 'space'
      : event.key.toLowerCase();
    if (key !== 'enter' && key !== 'space') return;
    const field = `${key}${event.type === 'keydown' ? 'Keydown' : 'Keyup'}Count`;
    frame.dataset[field] = String(Number(frame.dataset[field] ?? '0') + 1);
  };
  activation.addEventListener('keydown', recordActivationKey);
  activation.addEventListener('keyup', recordActivationKey);
});

const cleanupToolCardFixture = () => browser.execute(async () => {
  const fixtureWindow = window as FixtureWindow;
  const fixture = fixtureWindow.__VOID_TOOL_CARD_SHELL_E2E_FIXTURE__;
  if (!fixture) {
    return !document.getElementById('tool-card-shell-minimal-e2e-host');
  }

  const internals = (
    window as Window & {
      __TAURI_INTERNALS__?: {
        invoke(command: string, args?: unknown): Promise<unknown>;
      };
    }
  ).__TAURI_INTERNALS__;
  if (fixture.theme && internals) {
    await internals.invoke('set_config', {
      request: { path: 'themes.current', value: fixture.theme },
    });
  }
  fixture.root.unmount();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  fixture.host.remove();
  const documentRoot = document.documentElement;
  const restoreAttribute = (name: string, value: string | null) => {
    if (value === null) documentRoot.removeAttribute(name);
    else documentRoot.setAttribute(name, value);
  };
  restoreAttribute('data-theme', fixture.theme);
  restoreAttribute('data-theme-type', fixture.themeType);
  documentRoot.style.colorScheme = fixture.colorScheme;
  if (fixture.appRoot) {
    if (fixture.appRootStyle) {
      fixture.appRoot.setAttribute('style', fixture.appRootStyle);
    } else {
      fixture.appRoot.removeAttribute('style');
    }
    if (fixture.appRootAriaHidden === null) {
      fixture.appRoot.removeAttribute('aria-hidden');
    } else {
      fixture.appRoot.setAttribute('aria-hidden', fixture.appRootAriaHidden);
    }
    fixture.appRoot.inert = fixture.appRootInert;
  }
  delete fixtureWindow.__VOID_TOOL_CARD_SHELL_E2E_FIXTURE__;
  return (
    !document.getElementById('tool-card-shell-minimal-e2e-host')
    && fixtureWindow.__VOID_TOOL_CARD_SHELL_E2E_FIXTURE__ === undefined
  );
});

const readToolCardEvidence = () => browser.execute(() => {
  const read = (selector: string, property: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    return element ? getComputedStyle(element).getPropertyValue(property) : '';
  };
  const frame = document.querySelector<HTMLElement>(
    '[data-testid="tool-card-shell-minimal-fixture"]',
  );
  const error = document.querySelector<HTMLElement>(
    '.fixture-error .base-tool-card-error-collapse',
  );
  return {
    completedBackground: read(
      '.fixture-completed .compact-tool-card',
      'background-color',
    ),
    completedTransition: read(
      '.fixture-completed .compact-tool-card',
      'transition-property',
    ),
    confirmationAnimation: read(
      '.fixture-confirmation .base-tool-card-wrapper',
      'animation-name',
    ),
    confirmationBackground: read(
      '.fixture-confirmation .base-tool-card-wrapper',
      'background-color',
    ),
    errorHeight: error?.getBoundingClientRect().height ?? -1,
    excludedMediaTransition: read(
      '.fixture-excluded-media .compact-tool-card',
      'transition-property',
    ),
    excludedTaskBackdrop: read(
      '.fixture-excluded-task .base-tool-card-wrapper',
      'backdrop-filter',
    ),
    expandedBackdrop: read(
      '.fixture-expandable .base-tool-card-wrapper',
      'backdrop-filter',
    ),
    expandedShadow: read(
      '.fixture-expandable .base-tool-card-wrapper',
      'box-shadow',
    ),
    frameRight: frame?.getBoundingClientRect().right ?? null,
    runningClass: document
      .querySelector('.fixture-running .compact-tool-card-wrapper')
      ?.classList.contains('compact-tool-card-wrapper--loading-shimmer') ?? false,
    scrollWidth: document.documentElement.scrollWidth,
  };
});

const readKeyboardEvidence = () => browser.execute(() => {
  const frame = document.querySelector<HTMLElement>(
    '[data-testid="tool-card-shell-minimal-fixture"]',
  );
  const card = document.querySelector<HTMLElement>(
    '.fixture-expandable .base-tool-card',
  );
  const activation = card?.querySelector<HTMLButtonElement>(
    '.tool-card-header-activation',
  );
  const nested = card?.querySelector<HTMLButtonElement>(
    '[data-testid="tool-card-nested-action"]',
  );
  const openRight = document.querySelector<HTMLElement>(
    '.fixture-open-right .compact-tool-card',
  );
  const openRightActivation = openRight?.querySelector<HTMLButtonElement>(
    '.tool-card-header-activation',
  );
  const compactDefault = document.querySelector<HTMLElement>(
    '.fixture-compact-default .compact-tool-card, .fixture-compact-default .base-tool-card',
  );
  const compactDefaultActivation = compactDefault?.querySelector<HTMLButtonElement>(
    '.tool-card-header-activation',
  );
  const focused = document.activeElement;
  const style = card ? getComputedStyle(card) : null;
  return {
    activationCount: Number(frame?.dataset.activationCount ?? '-1'),
    enterKeydownCount: Number(frame?.dataset.enterKeydownCount ?? '0'),
    enterKeyupCount: Number(frame?.dataset.enterKeyupCount ?? '0'),
    activationLabel: activation?.getAttribute('aria-label') ?? null,
    activationTag: activation?.tagName ?? null,
    ariaExpanded: activation?.getAttribute('aria-expanded') ?? null,
    focusedActivation: focused === activation,
    focusedNestedAction:
      focused?.getAttribute('data-testid') === 'tool-card-nested-action',
    nestedActionCount: Number(frame?.dataset.nestedActionCount ?? '-1'),
    nestedInsideActivation: activation?.contains(nested ?? null) ?? false,
    nestedLabel: nested?.textContent ?? null,
    nestedTabIndex: nested?.tabIndex ?? -1,
    nestedTag: nested?.tagName ?? null,
    compactDefaultAriaExpanded:
      compactDefaultActivation?.getAttribute('aria-expanded') ?? null,
    compactDefaultLabel:
      compactDefaultActivation?.getAttribute('aria-label') ?? null,
    compactDefaultRootRole: compactDefault?.getAttribute('role') ?? null,
    compactDefaultTag: compactDefaultActivation?.tagName ?? null,
    openRightAriaExpanded:
      openRightActivation?.getAttribute('aria-expanded') ?? null,
    openRightLabel:
      openRightActivation?.getAttribute('aria-label') ?? null,
    openRightRootRole: openRight?.getAttribute('role') ?? null,
    openRightTag: openRightActivation?.tagName ?? null,
    outlineColor: style?.outlineColor ?? '',
    outlineStyle: style?.outlineStyle ?? '',
    rootRole: card?.getAttribute('role') ?? null,
    rootTabIndex: card?.getAttribute('tabindex') ?? null,
    spaceKeydownCount: Number(frame?.dataset.spaceKeydownCount ?? '0'),
    spaceKeyupCount: Number(frame?.dataset.spaceKeyupCount ?? '0'),
  };
});

const focusFirstFixtureControl = async () => {
  await browser.keys(['Tab']);
  await browser.execute(() => {
    document.querySelector<HTMLElement>(
      '.fixture-expandable .tool-card-header-activation',
    )?.focus();
  });
  await browser.waitUntil(async () => (
    await readKeyboardEvidence()
  ).focusedActivation, {
    timeout: 2_000,
    interval: 50,
    timeoutMsg: 'Direct focus did not reach the real header activation button',
  });
};

describe('L0 Minimal shared tool-card shell visual contract', () => {
  let originalSize: { width: number; height: number };
  let originalTheme: string;

  before(async () => {
    originalSize = await browser.getWindowSize();
    await browser.setWindowSize(1280, 800);
    await browser.waitUntil(async () => browser.execute(() => (
      !document.querySelector('.splash-screen')
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Startup splash did not leave before tool-card fixture mount',
    });
    originalTheme = await browser.execute(() => (
      document.documentElement.getAttribute('data-theme') ?? 'void-light'
    ));
    await mountToolCardFixture();
    await $('[data-testid="tool-card-shell-minimal-fixture"]').waitForDisplayed({
      timeout: 10_000,
    });
    await waitForFixtureContentStable();
  });

  after(async () => {
    expect(await cleanupToolCardFixture()).toBe(true);
    await setFixtureTheme(originalTheme);
    await browser.setWindowSize(originalSize.width, originalSize.height);
  });

  it('keeps completed, running, confirmation, and error states visible', async () => {
    expect(await setFixtureTheme('void-light')).toBe(true);
    const evidence = await readToolCardEvidence();
    expect(evidence.scrollWidth).toBeLessThanOrEqual(1281);
    expect(evidence.completedBackground).toBe('rgba(0, 0, 0, 0)');
    expect(evidence.completedTransition).not.toBe('all');
    expect(evidence.runningClass).toBe(true);
    expect(evidence.expandedBackdrop).toBe('none');
    expect(evidence.expandedShadow).toBe('none');
    expect(evidence.confirmationAnimation).toBe('none');
    expect(evidence.confirmationBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(evidence.errorHeight).toBeGreaterThan(0);

    await resetFixtureScroll();
    await saveElementScreenshot(
      '[data-testid="tool-card-shell-minimal-fixture"]',
      'slice31-minimal-tool-card-shell-light',
      { directory: screenshotDirectory, includeTimestamp: false },
    );
  });

  it('preserves real expand and collapse interaction', async () => {
    const card = await $('.fixture-expandable .base-tool-card');
    await card.click();
    await browser.waitUntil(async () => browser.execute(() => (
      document
        .querySelector('.fixture-expandable .base-tool-card-expanded-collapse')
        ?.classList.contains('smooth-height-collapse--closed') ?? false
    )), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Real BaseToolCard did not collapse',
    });
    await card.click();
    await browser.waitUntil(async () => browser.execute(() => (
      document
        .querySelector('.fixture-expandable .base-tool-card-expanded-collapse')
        ?.classList.contains('smooth-height-collapse--open') ?? false
    )), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Real BaseToolCard did not expand',
    });
    expect(await $('[data-testid="tool-card-expanded-content"]').isDisplayed()).toBe(true);
  });

  it('records trusted native-button keys and validates activation without a product keydown workaround', async () => {
    await focusFirstFixtureControl();
    let evidence = await readKeyboardEvidence();
    expect(evidence.rootRole).toBeNull();
    expect(evidence.rootTabIndex).toBeNull();
    expect(evidence.activationTag).toBe('BUTTON');
    expect(evidence.activationLabel).toBe('Collapse details');
    expect(evidence.ariaExpanded).toBe('true');
    expect(evidence.focusedActivation).toBe(true);
    expect(evidence.outlineStyle).not.toBe('none');
    expect(evidence.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(evidence.compactDefaultRootRole).toBeNull();
    expect(evidence.compactDefaultTag).toBe('BUTTON');
    expect(evidence.compactDefaultLabel).toBe('Expand details');
    expect(evidence.compactDefaultAriaExpanded).toBe('false');
    expect(evidence.openRightRootRole).toBeNull();
    expect(evidence.openRightTag).toBe('BUTTON');
    expect(evidence.openRightLabel).toBe('Open details');
    expect(evidence.openRightAriaExpanded).toBeNull();
    expect(evidence.nestedTag).toBe('BUTTON');
    expect(evidence.nestedLabel).toBe('详情操作');
    expect(evidence.nestedTabIndex).toBe(0);
    expect(evidence.nestedInsideActivation).toBe(false);
    const startingActivationCount = evidence.activationCount;
    const startingEnterKeydown = evidence.enterKeydownCount;
    const startingEnterKeyup = evidence.enterKeyupCount;
    const startingSpaceKeydown = evidence.spaceKeydownCount;
    const startingSpaceKeyup = evidence.spaceKeyupCount;

    await browser.keys(['Enter']);
    await browser.waitUntil(async () => {
      const current = await readKeyboardEvidence();
      return (
        current.enterKeydownCount === startingEnterKeydown + 1
        && current.enterKeyupCount === startingEnterKeyup + 1
      );
    }, {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Trusted Enter keydown/keyup did not reach the native button',
    });
    evidence = await readKeyboardEvidence();
    expect(evidence.activationCount).toBe(startingActivationCount);
    expect(evidence.ariaExpanded).toBe('true');

    await browser.keys([' ']);
    await browser.waitUntil(async () => {
      const current = await readKeyboardEvidence();
      return (
        current.spaceKeydownCount === startingSpaceKeydown + 1
        && current.spaceKeyupCount === startingSpaceKeyup + 1
      );
    }, {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Trusted Space keydown/keyup did not reach the native button',
    });
    evidence = await readKeyboardEvidence();
    expect(evidence.activationCount).toBe(startingActivationCount);
    expect(evidence.ariaExpanded).toBe('true');

    await $('.fixture-expandable .tool-card-header-activation').click();
    await browser.waitUntil(async () => {
      const current = await readKeyboardEvidence();
      return (
        current.activationCount === startingActivationCount + 1
        && current.ariaExpanded === 'false'
      );
    }, {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Pointer click did not activate the native button exactly once',
    });

    await browser.execute(() => {
      document.querySelector<HTMLElement>(
        '[data-testid="tool-card-nested-action"]',
      )?.focus();
    });
    evidence = await readKeyboardEvidence();
    expect(evidence.focusedNestedAction).toBe(true);
    expect(evidence.outlineStyle).not.toBe('none');
    await browser.keys(['Enter']);
    evidence = await readKeyboardEvidence();
    expect(evidence.activationCount).toBe(startingActivationCount + 1);

    await focusFirstFixtureControl();
    expect((await readKeyboardEvidence()).focusedActivation).toBe(true);
    await resetFixtureScroll();
    await saveElementScreenshot(
      '[data-testid="tool-card-shell-minimal-fixture"]',
      'slice32-minimal-tool-card-keyboard-focus-light',
      { directory: screenshotDirectory, includeTimestamp: false },
    );
  });

  it('keeps task and media shells outside the generic Minimal projection', async () => {
    const evidence = await readToolCardEvidence();
    expect(evidence.excludedTaskBackdrop).not.toBe('none');
    expect(evidence.excludedMediaTransition).toBe('all');
  });

  it('stays token-driven in dark and overflow-safe at narrow width', async () => {
    expect(await cleanupToolCardFixture()).toBe(true);
    expect(await setFixtureTheme('void-dark')).toBe(true);
    const sourceUrl = await browser.getUrl();
    await browser.url(sourceUrl);
    await browser.waitUntil(async () => browser.execute(() => (
      document.documentElement.getAttribute('data-theme') === 'void-dark'
      && !document.querySelector('.splash-screen')
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Reloaded desktop did not settle to void-dark',
    });
    await mountToolCardFixture();
    await $('[data-testid="tool-card-shell-minimal-fixture"]').waitForDisplayed({
      timeout: 10_000,
    });
    await waitForFixtureContentStable();
    await focusFirstFixtureControl();
    const focusEvidence = await readKeyboardEvidence();
    expect(focusEvidence.focusedActivation).toBe(true);
    expect(focusEvidence.outlineStyle).not.toBe('none');
    expect(focusEvidence.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
    await resetFixtureScroll();
    await saveElementScreenshot(
      '[data-testid="tool-card-shell-minimal-fixture"]',
      'slice32-minimal-tool-card-keyboard-focus-dark',
      { directory: screenshotDirectory, includeTimestamp: false },
    );
    await saveElementScreenshot(
      '[data-testid="tool-card-shell-minimal-fixture"]',
      'slice31-minimal-tool-card-shell-dark',
      { directory: screenshotDirectory, includeTimestamp: false },
    );

    await browser.setWindowSize(720, 720);
    await waitForFixtureContentStable();
    await resetFixtureScroll();
    const evidence = await readToolCardEvidence();
    expect(evidence.scrollWidth).toBeLessThanOrEqual(721);
    expect(evidence.frameRight).not.toBeNull();
    expect(evidence.frameRight!).toBeLessThanOrEqual(720);
    await saveScreenshot('slice31-minimal-tool-card-shell-narrow', {
      directory: screenshotDirectory,
      includeTimestamp: false,
    });
  });
});
