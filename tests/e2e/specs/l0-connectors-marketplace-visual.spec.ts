import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';

import { capturePhysicalVoidWindow } from '../helpers/screenshot-utils';
import { openWorkspace } from '../helpers/workspace-helper';

const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();
const artifactDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'connectors-marketplace-physical',
);

type WindowSize = { width: number; height: number };

const waitForLayout = () => browser.execute(async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

async function activateChineseMinimalPresentation(): Promise<void> {
  const target = new URL(await browser.getUrl());
  target.searchParams.set('void-ui', 'minimal');
  await browser.url(target.toString());
  await browser.waitUntil(async () => browser.execute(() => (
    document.querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === 'minimal'
    && !document.querySelector('.splash-screen')
  )), {
    timeout: 15_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not activate for connector marketplace capture',
  });
  await browser.execute(async () => {
    const modulePath = '/src/infrastructure/i18n/index.ts';
    const { i18nService } = await import(/* @vite-ignore */ modulePath);
    await i18nService.changeLanguage('zh-CN');
  });
  await browser.waitUntil(async () => browser.execute(() => (
    document.documentElement.lang === 'zh-CN'
  )), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: 'Simplified Chinese locale did not activate',
  });
}

async function openConnectorMarketplace(): Promise<void> {
  const extensionToggle = await $('.void-nav-panel__top-action-btn--expand');
  await extensionToggle.waitForClickable({ timeout: 10_000 });
  if ((await extensionToggle.getAttribute('aria-expanded')) !== 'true') {
    await extensionToggle.click();
  }

  const connectorEntry = await $('[data-testid="nav-connectors"]');
  await connectorEntry.waitForClickable({ timeout: 10_000 });
  await connectorEntry.click();
  await $('[data-testid="connectors-scene"]').waitForDisplayed({ timeout: 20_000 });
  expect((await connectorEntry.getAttribute('class'))?.split(/\s+/) ?? [])
    .toContain('is-active');

  const marketTab = await $('.void-mcp-tools__catalog-view:last-child');
  await marketTab.waitForClickable({ timeout: 20_000 });
  expect(await marketTab.getText()).toBe('连接器市场');
  await marketTab.click();
  await $('.void-connector-market').waitForDisplayed({ timeout: 20_000 });
  expect(await marketTab.getAttribute('aria-selected')).toBe('true');
}

describe('L0 connector marketplace complete-window visual acceptance', () => {
  let originalWindowSize: WindowSize | null = null;
  let wasMaximized = false;
  let originalLocale = 'zh-CN';

  before(async () => {
    originalWindowSize = await browser.getWindowSize();
    wasMaximized = await browser.execute(async () => {
      const tauri = (
        window as Window & {
          __TAURI__?: {
            window?: {
              getCurrentWindow?: () => { isMaximized(): Promise<boolean> };
            };
          };
        }
      ).__TAURI__;
      const getCurrentWindow = tauri?.window?.getCurrentWindow;
      if (typeof getCurrentWindow !== 'function') {
        throw new Error('Tauri window API is unavailable while reading maximize state');
      }
      return getCurrentWindow().isMaximized();
    });
    originalLocale = await browser.execute(async () => {
      const modulePath = '/src/infrastructure/i18n/index.ts';
      const { i18nService } = await import(/* @vite-ignore */ modulePath);
      return i18nService.getCurrentLocale();
    });

    await browser.maximizeWindow();
    await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', '0']);
    await waitForLayout();
    await activateChineseMinimalPresentation();
    expect(await openWorkspace(TEST_WORKSPACE_PATH)).toBe(true);
    await openConnectorMarketplace();
  });

  it('filters English aliases to Chinese cards and captures the complete four-column market', async () => {
    const search = await $('.void-connector-market .search__input');
    await search.setValue('memory');
    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.void-connector-market__card').length === 1
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'English memory search did not resolve to exactly one connector',
    });

    const filteredCard = await $('.void-connector-market__card');
    expect(await filteredCard.$('.void-connector-market__copy strong').getText())
      .toBe('长期记忆');
    expect(await filteredCard.getText()).not.toContain('Long-term memory');

    const clearSearch = await $('.void-connector-market .search__clear');
    await clearSearch.waitForClickable({ timeout: 5_000 });
    await clearSearch.click();
    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.void-connector-market__card').length === 7
      && document.querySelector<HTMLInputElement>(
        '.void-connector-market .search__input',
      )?.value === ''
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Connector market did not restore all seven cards after clearing search',
    });
    await waitForLayout();

    const layout = await browser.execute(() => {
      const requireElement = (selector: string): HTMLElement => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Required visual evidence is missing: ${selector}`);
        return element;
      };
      const rect = (element: Element) => {
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          width: value.width,
          height: value.height,
        };
      };
      const visibleWithinViewport = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && bounds.width > 0
          && bounds.height > 0
          && bounds.left >= -1
          && bounds.top >= -1
          && bounds.right <= window.innerWidth + 1
          && bounds.bottom <= window.innerHeight + 1;
      };

      const scene = requireElement('[data-testid="connectors-scene"]');
      const grid = requireElement('.void-connector-market__grid');
      const nav = requireElement('.void-nav-panel');
      const top = requireElement('.void-scene-bar');
      const controls = requireElement('.void-scene-bar__controls .window-controls');
      const cards = Array.from(document.querySelectorAll<HTMLElement>(
        '.void-connector-market__card',
      ));
      const rightmostCard = cards.reduce((rightmost, card) => (
        card.getBoundingClientRect().right > rightmost.getBoundingClientRect().right
          ? card
          : rightmost
      ));
      const pagination = document.querySelector<HTMLElement>(
        '.void-connector-market__pagination',
      );
      const gridColumns = getComputedStyle(grid).gridTemplateColumns
        .split(/\s+/)
        .filter(Boolean).length;

      return {
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        gridColumns,
        overflow: {
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scene: scene.scrollWidth - scene.clientWidth,
          grid: grid.scrollWidth - grid.clientWidth,
        },
        bounds: {
          scene: rect(scene),
          grid: rect(grid),
          nav: rect(nav),
          top: rect(top),
          rightmostCard: rect(rightmostCard),
          controls: rect(controls),
          pagination: pagination ? rect(pagination) : null,
        },
        visible: {
          nav: visibleWithinViewport(nav),
          top: visibleWithinViewport(top),
          rightmostCard: visibleWithinViewport(rightmostCard),
          controls: visibleWithinViewport(controls),
          pagination: pagination ? visibleWithinViewport(pagination) : null,
        },
        windowControlCount: controls.querySelectorAll('button').length,
      };
    });

    expect(layout.gridColumns).toBe(4);
    expect(layout.overflow.document).toBeLessThanOrEqual(1);
    expect(layout.overflow.scene).toBeLessThanOrEqual(1);
    expect(layout.overflow.grid).toBeLessThanOrEqual(1);
    expect(layout.bounds.scene.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    expect(layout.bounds.grid.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    expect(layout.visible.nav).toBe(true);
    expect(layout.visible.top).toBe(true);
    expect(layout.visible.rightmostCard).toBe(true);
    expect(layout.visible.controls).toBe(true);
    expect(layout.windowControlCount).toBe(3);
    if (layout.bounds.pagination) {
      expect(layout.visible.pagination).toBe(true);
      expect(layout.bounds.pagination.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    }

    const capture = await capturePhysicalVoidWindow('connector-marketplace', {
      directory: artifactDirectory,
    });
    expect(capture.metadata.capture_bounds.width).toBeGreaterThanOrEqual(1_900);
    expect(capture.metadata.capture_bounds.height).toBeGreaterThanOrEqual(1_000);
    expect(Math.round(layout.viewport.width * layout.devicePixelRatio))
      .toBeLessThanOrEqual(capture.metadata.capture_bounds.width + 2);
    expect(Math.round(layout.viewport.height * layout.devicePixelRatio))
      .toBeLessThanOrEqual(capture.metadata.capture_bounds.height + 2);
    console.log(`Connector marketplace physical evidence: ${JSON.stringify({
      image: capture.image,
      sidecar: capture.sidecar,
      layout,
    })}`);
  });

  after(async () => {
    await browser.execute(async (locale) => {
      const modulePath = '/src/infrastructure/i18n/index.ts';
      const { i18nService } = await import(/* @vite-ignore */ modulePath);
      await i18nService.changeLanguage(locale);
    }, originalLocale);
    if (wasMaximized) {
      await browser.maximizeWindow();
    } else if (originalWindowSize) {
      await browser.setWindowSize(originalWindowSize.width, originalWindowSize.height);
    }
  });
});
