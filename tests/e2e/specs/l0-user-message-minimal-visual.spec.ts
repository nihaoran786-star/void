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
  __VOID_USER_MESSAGE_E2E_FIXTURE__?: {
    appRoot: HTMLElement | null;
    appRootAriaHidden: string | null;
    appRootInert: boolean;
    appRootStyle: string;
    host: HTMLElement;
    root: { unmount(): void };
  };
};

const mountUserMessageFixture = () => browser.execute(async () => {
  const fixtureWindow = window as FixtureWindow;
  if (fixtureWindow.__VOID_USER_MESSAGE_E2E_FIXTURE__) {
    throw new Error('The user-message fixture is already mounted');
  }

  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const contextModule = await import(
    '/src/flow_chat/components/modern/FlowChatContext.tsx'
  );
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const userMessageModule = await import(
    '/src/flow_chat/components/modern/UserMessageItem.tsx'
  );

  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  const FlowChatContext = contextModule.FlowChatContext;
  const UserMessageItem = userMessageModule.UserMessageItem;
  if (!createRoot || !FlowChatContext || !UserMessageItem) {
    throw new Error('Unable to mount the real user-message component');
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

  const host = document.createElement('div');
  host.id = 'user-message-minimal-e2e-host';
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
  ].join(';');
  document.body.appendChild(host);

  const previewSvg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">'
    + '<rect width="240" height="240" fill="#d7dce5"/>'
    + '<rect x="54" y="38" width="132" height="164" rx="24" fill="#7c8799"/>'
    + '<circle cx="120" cy="93" r="32" fill="#f0d0bd"/>'
    + '<path d="M78 174c12-36 72-36 84 0" fill="#344054"/>'
    + '</svg>',
  );

  const messages = [
    {
      id: 'minimal-message-short',
      content: '把角色图固定为同一演员与服装。',
      timestamp: Date.now(),
    },
    {
      id: 'minimal-message-long',
      content:
        '请继续优化短剧工作台：减少装饰图标，保留角色、场景、分镜、媒体预览和子代理的全部操作。'
        + '\n长文本需要自然换行，不能撑出聊天区域。',
      timestamp: Date.now(),
    },
    {
      id: 'minimal-message-image',
      content: '参考图已附上，继续沿用现有图片生成能力。',
      timestamp: Date.now(),
      images: [
        {
          id: 'minimal-image',
          name: '角色参考图.png',
          dataUrl: `data:image/svg+xml;charset=utf-8,${previewSvg}`,
        },
      ],
    },
  ];

  const root = createRoot(host);
  fixtureWindow.__VOID_USER_MESSAGE_E2E_FIXTURE__ = {
    appRoot,
    appRootAriaHidden,
    appRootInert,
    appRootStyle,
    host,
    root,
  };

  root.render(
    React.createElement(
      FlowChatContext.Provider,
      {
        value: {
          allowUserMessageEdit: false,
          allowUserMessageRollback: false,
          config: { showTimestamps: false },
        },
      },
      React.createElement(
        'main',
        {
          className: 'modern-flowchat-container flow-chat-typography',
          'data-testid': 'user-message-minimal-fixture',
          style: {
            width: 'min(920px, calc(100vw - 48px))',
            height: 'min(620px, calc(100vh - 48px))',
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
            style: {
              position: 'relative',
              width: '100%',
              height: '100%',
            },
          },
          React.createElement(
            'div',
            {
              'data-virtuoso-scroller': 'true',
              style: {
                overflowY: 'auto',
              },
            },
            React.createElement(
              'div',
              {
                style: {
                  padding: '48px 0',
                },
              },
              messages.map((message, index) => React.createElement(
                UserMessageItem,
                {
                  key: message.id,
                  message,
                  turnId: `turn-${index + 1}`,
                },
              )),
            ),
          ),
        ),
      ),
    ),
  );

  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const cleanupUserMessageFixture = () => browser.execute(async () => {
  const fixtureWindow = window as FixtureWindow;
  const fixture = fixtureWindow.__VOID_USER_MESSAGE_E2E_FIXTURE__;
  if (!fixture) {
    return !document.getElementById('user-message-minimal-e2e-host');
  }

  fixture.root.unmount();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  fixture.host.remove();
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
  delete fixtureWindow.__VOID_USER_MESSAGE_E2E_FIXTURE__;
  return (
    !document.getElementById('user-message-minimal-e2e-host')
    && fixtureWindow.__VOID_USER_MESSAGE_E2E_FIXTURE__ === undefined
  );
});

const readMessageGeometry = () => browser.execute(() => {
  const host = document.getElementById('user-message-minimal-e2e-host');
  const frame = document.querySelector<HTMLElement>(
    '[data-testid="user-message-minimal-fixture"]',
  );
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(
      '#user-message-minimal-e2e-host .user-message-item',
    ),
  );
  const rectOf = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  };

  return {
    documentScrollWidth: document.documentElement.scrollWidth,
    frame: frame ? rectOf(frame) : null,
    hostOverflowX: host ? getComputedStyle(host).overflowX : null,
    items: items.map(item => {
      const actions = item.querySelector<HTMLElement>('.user-message-item__actions');
      const style = getComputedStyle(item);
      const actionStyle = actions ? getComputedStyle(actions) : null;
      return {
        rect: rectOf(item),
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        actionsOpacity: actionStyle?.opacity ?? null,
        actionsPointerEvents: actionStyle?.pointerEvents ?? null,
      };
    }),
    imageButtonName: (() => {
      const button = document.querySelector('.user-message-item__image-thumb');
      return button?.getAttribute('aria-label')
        ?? button?.querySelector('img')?.getAttribute('alt')
        ?? null;
    })(),
  };
});

describe('L0 Minimal user message visual contract', () => {
  let originalSize: { width: number; height: number };

  before(async () => {
    originalSize = await browser.getWindowSize();
    await browser.setWindowSize(1280, 800);
    await browser.waitUntil(async () => browser.execute(() => (
      !document.querySelector('.splash-screen')
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Startup splash did not leave before user-message fixture mount',
    });
    await mountUserMessageFixture();
    await $('[data-testid="user-message-minimal-fixture"]').waitForDisplayed({
      timeout: 10_000,
    });
  });

  after(async () => {
    expect(await cleanupUserMessageFixture()).toBe(true);
    await browser.setWindowSize(originalSize.width, originalSize.height);
  });

  it('keeps three real message variants compact, right aligned, and accessible', async () => {
    const geometry = await readMessageGeometry();
    expect(geometry.items).toHaveLength(3);
    expect(geometry.frame).not.toBeNull();
    expect(geometry.documentScrollWidth).toBeLessThanOrEqual(1281);
    expect(geometry.items[0].rect.width).toBeLessThan(360);
    expect(geometry.items[1].rect.width).toBeLessThanOrEqual(620);
    expect(geometry.items[2].rect.width).toBeLessThanOrEqual(620);
    expect(geometry.items.every(item => (
      Math.abs(item.rect.right - geometry.items[0].rect.right) <= 1
    ))).toBe(true);
    expect(geometry.items.every(item => item.actionsOpacity === '0')).toBe(true);
    expect(
      geometry.items.every(item => item.actionsPointerEvents === 'none'),
    ).toBe(true);
    expect(geometry.imageButtonName).toContain('角色参考图.png');

    await saveScreenshot('slice30-minimal-user-message-wide', {
      directory: screenshotDirectory,
      includeTimestamp: false,
    });
    await saveElementScreenshot(
      '[data-testid="user-message-minimal-fixture"]',
      'slice30-minimal-user-message-surface-wide',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
      },
    );
  });

  it('reveals compact actions without changing bubble geometry', async () => {
    const firstMessage = await $(
      '#user-message-minimal-e2e-host .user-message-item',
    );
    const widthBefore = await firstMessage.getSize('width');
    const copyButton = await $(
      '#user-message-minimal-e2e-host .user-message-item__copy-btn',
    );
    await browser.execute((element: HTMLElement) => element.focus(), copyButton);
    await browser.waitUntil(async () => browser.execute(() => {
      const actions = document.querySelector<HTMLElement>(
        '#user-message-minimal-e2e-host .user-message-item__actions',
      );
      return actions ? getComputedStyle(actions).opacity === '1' : false;
    }), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Minimal user-message actions did not reveal on hover',
    });
    expect(await firstMessage.getSize('width')).toBe(widthBefore);

    const actionGeometry = await browser.execute(() => {
      const actions = document.querySelector<HTMLElement>(
        '#user-message-minimal-e2e-host .user-message-item__actions',
      );
      const focusedButton = document.activeElement as HTMLElement | null;
      if (!actions) return null;
      const rect = actions.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        opacity: getComputedStyle(actions).opacity,
        focusedButtonOpacity: focusedButton
          ? getComputedStyle(focusedButton).opacity
          : null,
      };
    });
    expect(actionGeometry).not.toBeNull();
    expect(actionGeometry!.left).toBeGreaterThanOrEqual(0);
    expect(actionGeometry!.right).toBeLessThanOrEqual(1280);
    expect(actionGeometry!.opacity).toBe('1');
    expect(actionGeometry!.focusedButtonOpacity).toBe('1');

    await saveElementScreenshot(
      '[data-testid="user-message-minimal-fixture"]',
      'slice30-minimal-user-message-actions-wide',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
      },
    );
  });

  it('keeps the bubble and its disclosure actions inside a 720px window', async () => {
    await browser.setWindowSize(720, 720);
    const copyButton = await $(
      '#user-message-minimal-e2e-host .user-message-item__copy-btn',
    );
    await browser.execute((element: HTMLElement) => element.focus(), copyButton);
    const geometry = await readMessageGeometry();
    expect(geometry.documentScrollWidth).toBeLessThanOrEqual(721);
    expect(geometry.items.every(item => item.rect.left >= 0)).toBe(true);
    expect(geometry.items.every(item => item.rect.right <= 720)).toBe(true);
    const disclosureGap = await browser.execute(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>(
        '#user-message-minimal-e2e-host .user-message-item',
      ));
      const actions = items[0]?.querySelector<HTMLElement>(
        '.user-message-item__actions',
      );
      return actions && items[1]
        ? items[1].getBoundingClientRect().top
          - actions.getBoundingClientRect().bottom
        : null;
    });
    expect(disclosureGap).not.toBeNull();
    expect(disclosureGap!).toBeGreaterThanOrEqual(0);

    await saveScreenshot('slice30-minimal-user-message-narrow', {
      directory: screenshotDirectory,
      includeTimestamp: false,
    });
  });
});
