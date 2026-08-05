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
  'customization-market-unity-physical',
);

type CatalogDefinition = {
  id: 'agents' | 'skills' | 'connectors';
  tabSelector: string;
  gridSelector: string;
  cardSelector: string;
  avatarSelector: string;
  avatarWidth: number;
  paginationSelector: string;
  readySelector: string;
};

const catalogs: CatalogDefinition[] = [
  {
    id: 'agents',
    tabSelector: '.agents-catalog-tabs',
    gridSelector: '.void-agents-scene .gallery-grid',
    cardSelector: '.void-agents-scene .agent-card',
    avatarSelector: '.void-agents-scene .agent-avatar--card',
    avatarWidth: 44,
    paginationSelector: '.void-agents-scene .catalog-pagination',
    readySelector: '.void-agents-shell',
  },
  {
    id: 'skills',
    tabSelector: '.skills-tabs-bar',
    gridSelector: '.skills-main__grid',
    cardSelector: '.skills-card',
    avatarSelector: '.skills-card__avatar',
    avatarWidth: 52,
    paginationSelector: '.skills-installed__pagination',
    readySelector: '.void-skills-scene',
  },
  {
    id: 'connectors',
    tabSelector: '.void-mcp-tools__catalog-views',
    gridSelector: '.void-connector-market__grid',
    cardSelector: '.void-connector-market__card',
    avatarSelector: '.void-connector-market__avatar',
    avatarWidth: 52,
    paginationSelector: '.void-connector-market__pagination',
    readySelector: '[data-testid="connectors-scene"]',
  },
];

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
    timeoutMsg: 'Minimal presentation did not activate for customization capture',
  });
  await browser.execute(async () => {
    const modulePath = '/src/infrastructure/i18n/index.ts';
    const { i18nService } = await import(/* @vite-ignore */ modulePath);
    await i18nService.changeLanguage('zh-CN');
  });
}

async function openExtensions(): Promise<void> {
  const toggle = await $('.void-nav-panel__top-action-btn--expand');
  await toggle.waitForClickable({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}

async function openCatalog(catalog: CatalogDefinition): Promise<void> {
  const entry = await $(`[data-testid="nav-${catalog.id}"]`);
  await entry.waitForClickable({ timeout: 15_000 });
  await entry.click();
  await $(catalog.readySelector).waitForDisplayed({ timeout: 20_000 });

  if (catalog.id === 'agents') {
    const agentsTab = await $('.agents-catalog-tabs [role="tab"]:first-child');
    if ((await agentsTab.getAttribute('aria-selected')) !== 'true') {
      await agentsTab.click();
    }
  } else if (catalog.id === 'skills') {
    const installedTab = await $('.skills-tabs-bar [role="tab"]:first-child');
    if ((await installedTab.getAttribute('aria-selected')) !== 'true') {
      await installedTab.click();
    }
  } else {
    const marketTab = await $('.void-mcp-tools__catalog-view:last-child');
    if ((await marketTab.getAttribute('aria-selected')) !== 'true') {
      await marketTab.click();
    }
  }

  await browser.waitUntil(async () => browser.execute(
    (gridSelector, cardSelector) => Boolean(document.querySelector(gridSelector))
      && document.querySelectorAll(cardSelector).length > 0,
    catalog.gridSelector,
    catalog.cardSelector,
  ), {
    timeout: 20_000,
    interval: 120,
    timeoutMsg: `${catalog.id} catalog did not expose a measurable card grid`,
  });
  await waitForLayout();
}

describe('L0 customization markets share one complete-window contract', () => {
  before(async () => {
    await browser.maximizeWindow();
    await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', '0']);
    await activateChineseMinimalPresentation();
    expect(await openWorkspace(TEST_WORKSPACE_PATH)).toBe(true);
    await openExtensions();
  });

  for (const catalog of catalogs) {
    it(`${catalog.id} uses the shared four-column employee-market layout`, async () => {
      await openCatalog(catalog);
      const layout = await browser.execute((definition) => {
        const requireElement = (selector: string): HTMLElement => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`Missing visual contract element: ${selector}`);
          return element;
        };
        const rect = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          };
        };
        const visible = (element: HTMLElement) => {
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

        const scene = requireElement('.void-scene-viewport__scene--active');
        const nav = requireElement('.void-nav-panel');
        const top = requireElement('.void-scene-bar');
        const controls = requireElement('.void-scene-bar__controls .window-controls');
        const tabs = requireElement(definition.tabSelector);
        const grid = requireElement(definition.gridSelector);
        const card = requireElement(definition.cardSelector);
        const avatar = requireElement(definition.avatarSelector);
        const cards = Array.from(document.querySelectorAll<HTMLElement>(definition.cardSelector));
        const rightmostCard = cards.reduce((rightmost, candidate) => (
          candidate.getBoundingClientRect().right > rightmost.getBoundingClientRect().right
            ? candidate
            : rightmost
        ));
        const bottommostCard = cards.reduce((bottommost, candidate) => (
          candidate.getBoundingClientRect().bottom > bottommost.getBoundingClientRect().bottom
            ? candidate
            : bottommost
        ));
        const pagination = document.querySelector<HTMLElement>(definition.paginationSelector);
        const bottomEvidence = pagination ?? bottommostCard;
        const gridColumns = getComputedStyle(grid).gridTemplateColumns
          .split(/\s+/)
          .filter(Boolean).length;

        return {
          devicePixelRatio: window.devicePixelRatio,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          gridColumns,
          tabHeight: tabs.getBoundingClientRect().height,
          cardHeight: card.getBoundingClientRect().height,
          avatarWidth: avatar.getBoundingClientRect().width,
          gridWidth: grid.getBoundingClientRect().width,
          overflow: {
            document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            scene: scene.scrollWidth - scene.clientWidth,
            grid: grid.scrollWidth - grid.clientWidth,
          },
          bounds: {
            scene: rect(scene),
            nav: rect(nav),
            top: rect(top),
            grid: rect(grid),
            rightmostCard: rect(rightmostCard),
            bottomEvidence: rect(bottomEvidence),
            controls: rect(controls),
          },
          visible: {
            nav: visible(nav),
            top: visible(top),
            rightmostCard: visible(rightmostCard),
            bottomEvidence: visible(bottomEvidence),
            controls: visible(controls),
          },
          paginationPresent: Boolean(pagination),
          windowControlCount: controls.querySelectorAll('button').length,
        };
      }, catalog);

      expect(layout.gridColumns).toBe(4);
      expect(layout.tabHeight).toBeGreaterThanOrEqual(47);
      expect(layout.tabHeight).toBeLessThanOrEqual(49);
      expect(layout.cardHeight).toBeGreaterThanOrEqual(159);
      expect(layout.cardHeight).toBeLessThanOrEqual(161);
      expect(layout.avatarWidth).toBeGreaterThanOrEqual(catalog.avatarWidth - 1);
      expect(layout.avatarWidth).toBeLessThanOrEqual(catalog.avatarWidth + 1);
      expect(layout.gridWidth).toBeGreaterThanOrEqual(1_200);
      expect(layout.gridWidth).toBeLessThanOrEqual(1_280.5);
      expect(layout.overflow.document).toBeLessThanOrEqual(1);
      expect(layout.overflow.scene).toBeLessThanOrEqual(1);
      expect(layout.overflow.grid).toBeLessThanOrEqual(1);
      expect(layout.visible.nav).toBe(true);
      expect(layout.visible.top).toBe(true);
      expect(layout.visible.rightmostCard).toBe(true);
      expect(layout.visible.bottomEvidence).toBe(true);
      expect(layout.visible.controls).toBe(true);
      expect(layout.windowControlCount).toBe(3);
      expect(layout.bounds.scene.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
      expect(layout.bounds.bottomEvidence.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);

      const capture = await capturePhysicalVoidWindow(`customization-${catalog.id}`, {
        directory: artifactDirectory,
      });
      expect(capture.metadata.dpi_awareness).toBe('PerMonitorV2');
      expect(capture.metadata.capture_method).toBe('PrintWindow(PW_RENDERFULLCONTENT)');
      expect(capture.metadata.dwm_extended_frame_bounds).not.toBeNull();
      expect(Math.round(layout.viewport.width * layout.devicePixelRatio))
        .toBeLessThanOrEqual(capture.metadata.capture_bounds.width + 2);
      expect(Math.round(layout.viewport.height * layout.devicePixelRatio))
        .toBeLessThanOrEqual(capture.metadata.capture_bounds.height + 2);
      console.info(`VOID_CUSTOMIZATION_MARKET_EVIDENCE ${JSON.stringify({
        catalog: catalog.id,
        image: capture.image,
        sidecar: capture.sidecar,
        layout,
      })}`);
    });
  }
});
