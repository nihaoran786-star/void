import { $, browser, expect } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { openWorkspace } from '../helpers/workspace-helper';
import { saveScreenshot } from '../helpers/screenshot-utils';

const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();
const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);

type ThemeId = 'void-dark' | 'void-light';

type TauriInternals = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

type FontEvidence = {
  canonical: string;
  families: string[];
  matchedElements: number;
};

type Rect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type SurfaceGeometry = {
  criticalRects: Array<{ selector: string; rect: Rect }>;
  documentClientHeight: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  edgeEntries: Array<{
    buttonCenter: { x: number; y: number };
    buttonCenterInViewport: boolean;
    disabled: boolean;
    hitMatches: boolean;
    iconCenter: { x: number; y: number };
    iconCenterInViewport: boolean;
    intersectionHeight: number;
    intersectionWidth: number;
    intersectsCriticalRect: boolean;
    pointerEvents: string;
    rect: Rect;
    selector: string;
  }>;
  notificationCenterRects: Rect[];
  notificationItemRects: Rect[];
  surfaceClientWidth: number;
  surfaceRect: Rect;
  surfaceScrollWidth: number;
  viewportHeight: number;
  viewportWidth: number;
};

type WindowMetrics = {
  devicePixelRatio: number;
  innerHeight: number;
  innerWidth: number;
  outerHeight: number;
  outerWidth: number;
};

const desktopPrimaryModifier: 'Meta' | 'Control' =
  process.platform === 'darwin' ? 'Meta' : 'Control';
const desktopZoomLevels = [
  0.5,
  0.67,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
] as const;

const normalizeFamily = (family: string) => (
  family.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
);

const readZoomPreference = () => browser.execute(async () => {
  const internals = (
    window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  ).__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error('Tauri internals are unavailable while reading desktop zoom');
  }

  const value = await internals.invoke<unknown>('get_config', {
    request: {
      path: 'app.zoom_level',
      skipRetryOnNotFound: true,
    },
  });
  if (typeof value !== 'number') {
    throw new Error('Desktop zoom preference is not numeric');
  }
  return value;
});

const normalizeZoomLevel = (value: number): number =>
  desktopZoomLevels.reduce((nearest, candidate) =>
    Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest,
  1);

const waitForZoomPreference = (expected: number, message: string) =>
  browser.waitUntil(async () => (
    (await readZoomPreference()) === expected
  ), {
    timeout: 5_000,
    interval: 100,
    timeoutMsg: message,
  });

const resetDesktopZoom = async () => {
  await browser.keys([desktopPrimaryModifier, '0']);
  await waitForZoomPreference(1, 'Desktop WebView did not restore 100% zoom');
  await waitForDoubleAnimationFrame();
};

const setDesktopZoomTo200 = async () => {
  await resetDesktopZoom();
  for (let step = 0; step < 5; step += 1) {
    await browser.keys([desktopPrimaryModifier, '=']);
  }
  await waitForZoomPreference(2, 'Desktop WebView did not reach 200% zoom');
  await waitForDoubleAnimationFrame();
};

const restoreZoomPreference = async (savedPreference: number) => {
  await resetDesktopZoom();
  const visualLevel = normalizeZoomLevel(savedPreference);
  const defaultIndex = desktopZoomLevels.indexOf(1);
  const targetIndex = desktopZoomLevels.indexOf(
    visualLevel as (typeof desktopZoomLevels)[number],
  );
  const direction = targetIndex >= defaultIndex ? '=' : '-';
  const steps = Math.abs(targetIndex - defaultIndex);

  for (let step = 0; step < steps; step += 1) {
    await browser.keys([desktopPrimaryModifier, direction]);
  }
  await waitForZoomPreference(
    visualLevel,
    'Desktop visual test did not restore the original visual zoom',
  );

  if (savedPreference !== visualLevel) {
    await browser.execute(async (value) => {
      const internals = (
        window as Window & { __TAURI_INTERNALS__?: TauriInternals }
      ).__TAURI_INTERNALS__;
      if (!internals) {
        throw new Error('Tauri internals are unavailable while restoring desktop zoom');
      }
      await internals.invoke('set_config', {
        request: {
          path: 'app.zoom_level',
          value,
        },
      });
    }, savedPreference);
  }
};

const applyRuntimeTheme = (themeId: ThemeId) =>
  browser.execute(async (id) => {
    const modulePath = '/src/infrastructure/theme/core/ThemeService.ts';
    const { themeService } = await import(/* @vite-ignore */ modulePath);
    await themeService.applyTheme(id);
  }, themeId);

const waitForDoubleAnimationFrame = () => browser.execute(async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const dismissVisualObstructions = async () => {
  await browser.execute(async () => {
    const modulePath = '/src/shared/notification-system/index.ts';
    const { notificationService } = await import(/* @vite-ignore */ modulePath);
    notificationService.toggleCenter(false);
    notificationService.dismissAll();
  });
  await waitForDoubleAnimationFrame();
  await browser.waitUntil(
    async () => browser.execute(() => {
      const isVisible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        const style = getComputedStyle(htmlElement);
        const rect = htmlElement.getBoundingClientRect();
        return (
          style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > 0
          && rect.width > 0
          && rect.height > 0
        );
      };

      return (
        Array.from(document.querySelectorAll('.notification-item'))
          .filter(isVisible).length === 0
        && Array.from(document.querySelectorAll('.notification-center'))
          .filter(isVisible).length === 0
      );
    }),
    {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Notification UI still obscures the typography matrix',
    },
  );
};

const openScene = async (sceneId: 'automation' | 'settings', selector: string) => {
  await browser.execute((id) => {
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: id },
    }));
  }, sceneId);
  await $(selector).waitForDisplayed({ timeout: 15_000 });
  await dismissVisualObstructions();
};

const openMediaSession = async (sessionId: string) => {
  await browser.execute(async (id) => {
    const modulePath = '/src/flow_chat/services/openBtwSession.ts';
    const { openMainSession } = await import(/* @vite-ignore */ modulePath);
    await openMainSession(id);
  }, sessionId);
  await $('.void-session-scene').waitForDisplayed({ timeout: 20_000 });
  await dismissVisualObstructions();
};

const readFontEvidence = (
  surfaceSelector: string,
): Promise<FontEvidence> => browser.execute((selector) => {
  const root = document.documentElement;
  const surface = document.querySelector<HTMLElement>(selector);
  if (!surface) {
    throw new Error(`Typography surface is unavailable: ${selector}`);
  }

  const candidates = [
    surface,
    ...Array.from(
      surface.querySelectorAll<HTMLElement>(
        'button, input, textarea, select, [role="button"], [role="tab"], h1, h2, h3, p',
      ),
    ).filter(element => element.checkVisibility()).slice(0, 24),
  ];

  return {
    canonical: getComputedStyle(root)
      .getPropertyValue('--font-family-sans')
      .trim(),
    families: candidates.map(element => getComputedStyle(element).fontFamily),
    matchedElements: candidates.length,
  };
}, surfaceSelector);

const readSurfaceGeometry = (
  surfaceSelector: string,
  criticalSelectors: string[],
  edgeEntrySelectors: string[],
): Promise<SurfaceGeometry> => browser.execute(
  ({ edgeSelectors, selector, requiredSelectors }) => {
    const surface = document.querySelector<HTMLElement>(selector);
    if (!surface) {
      throw new Error(`Geometry surface is unavailable: ${selector}`);
    }

    const rectOf = (element: Element): Rect => {
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
    const isVisible = (element: Element) => {
      const htmlElement = element as HTMLElement;
      const style = getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return (
        style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0
      );
    };
    const criticalRects = requiredSelectors.map((requiredSelector) => {
      const element = document.querySelector<HTMLElement>(requiredSelector);
      if (!element || !isVisible(element)) {
        throw new Error(`Critical typography control is unavailable: ${requiredSelector}`);
      }
      return { selector: requiredSelector, rect: rectOf(element) };
    });
    const rectsIntersect = (first: Rect, second: Rect) => (
      first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top
    );
    const pointInViewport = (point: { x: number; y: number }) => (
      point.x >= 0
      && point.x <= window.innerWidth
      && point.y >= 0
      && point.y <= window.innerHeight
    );
    const edgeEntries = edgeSelectors.map((edgeSelector) => {
      const element = document.querySelector<HTMLElement>(edgeSelector);
      if (!element || !isVisible(element)) {
        throw new Error(`Edge entry is unavailable: ${edgeSelector}`);
      }
      const icon = element.querySelector<SVGElement>('svg');
      if (!icon || !isVisible(icon)) {
        throw new Error(`Edge entry icon is unavailable: ${edgeSelector}`);
      }
      const rect = rectOf(element);
      const iconRect = rectOf(icon);
      const buttonCenter = {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
      };
      const iconCenter = {
        x: iconRect.left + (iconRect.width / 2),
        y: iconRect.top + (iconRect.height / 2),
      };
      const hit = pointInViewport(buttonCenter)
        ? document.elementFromPoint(buttonCenter.x, buttonCenter.y)
        : null;

      return {
        buttonCenter,
        buttonCenterInViewport: pointInViewport(buttonCenter),
        disabled: (
          (element instanceof HTMLButtonElement && element.disabled)
          || element.getAttribute('aria-disabled') === 'true'
        ),
        hitMatches: Boolean(hit && (hit === element || element.contains(hit))),
        iconCenter,
        iconCenterInViewport: pointInViewport(iconCenter),
        intersectionHeight: Math.max(
          0,
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
        ),
        intersectionWidth: Math.max(
          0,
          Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
        ),
        intersectsCriticalRect: criticalRects.some(({ rect: criticalRect }) =>
          rectsIntersect(rect, criticalRect)),
        pointerEvents: getComputedStyle(element).pointerEvents,
        rect,
        selector: edgeSelector,
      };
    });

    return {
      criticalRects,
      documentClientHeight: document.documentElement.clientHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      edgeEntries,
      notificationCenterRects: Array.from(
        document.querySelectorAll('.notification-center'),
      ).filter(isVisible).map(rectOf),
      notificationItemRects: Array.from(
        document.querySelectorAll('.notification-item'),
      ).filter(isVisible).map(rectOf),
      surfaceClientWidth: surface.clientWidth,
      surfaceRect: rectOf(surface),
      surfaceScrollWidth: surface.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  },
  {
    edgeSelectors: edgeEntrySelectors,
    selector: surfaceSelector,
    requiredSelectors: criticalSelectors,
  },
);

const expectCanonicalSurface = async (selector: string) => {
  const evidence = await readFontEvidence(selector);
  const canonical = normalizeFamily(evidence.canonical);

  expect(evidence.matchedElements).toBeGreaterThan(0);
  expect(canonical.length).toBeGreaterThan(0);
  for (const family of evidence.families) {
    expect(normalizeFamily(family)).toBe(canonical);
  }
};

const rectsIntersect = (first: Rect, second: Rect) => (
  first.left < second.right
  && first.right > second.left
  && first.top < second.bottom
  && first.bottom > second.top
);

const expectSurfaceGeometry = (evidence: SurfaceGeometry) => {
  expect(evidence.documentScrollWidth)
    .toBeLessThanOrEqual(evidence.documentClientWidth + 1);
  expect(evidence.surfaceScrollWidth)
    .toBeLessThanOrEqual(evidence.surfaceClientWidth + 1);

  expect(evidence.surfaceRect.right).toBeGreaterThan(0);
  expect(evidence.surfaceRect.bottom).toBeGreaterThan(0);
  expect(evidence.surfaceRect.left).toBeLessThan(evidence.viewportWidth);
  expect(evidence.surfaceRect.top).toBeLessThan(evidence.viewportHeight);

  for (const { rect } of evidence.criticalRects) {
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(evidence.viewportWidth + 1);
    expect(rect.bottom).toBeLessThanOrEqual(evidence.viewportHeight + 1);
  }

  for (const edgeEntry of evidence.edgeEntries) {
    expect(edgeEntry.intersectionWidth).toBeGreaterThanOrEqual(24);
    expect(edgeEntry.intersectionHeight).toBeGreaterThanOrEqual(24);
    expect(edgeEntry.buttonCenterInViewport).toBe(true);
    expect(edgeEntry.iconCenterInViewport).toBe(true);
    expect(edgeEntry.disabled).toBe(false);
    expect(edgeEntry.pointerEvents).not.toBe('none');
    expect(edgeEntry.hitMatches).toBe(true);
    expect(edgeEntry.intersectsCriticalRect).toBe(false);
  }

  expect(evidence.notificationItemRects).toHaveLength(0);
  expect(evidence.notificationCenterRects).toHaveLength(0);
  for (const notificationRect of [
    ...evidence.notificationItemRects,
    ...evidence.notificationCenterRects,
  ]) {
    expect(rectsIntersect(notificationRect, evidence.surfaceRect)).toBe(false);
  }
};

const verifyAndCaptureSurface = async ({
  criticalSelectors,
  edgeEntrySelectors = [],
  expectedZoom,
  screenshotName,
  selector,
}: {
  criticalSelectors: string[];
  edgeEntrySelectors?: string[];
  expectedZoom: number;
  screenshotName: string;
  selector: string;
}) => {
  await dismissVisualObstructions();
  expect(await readZoomPreference()).toBe(expectedZoom);
  await expectCanonicalSurface(selector);
  const geometry = await readSurfaceGeometry(
    selector,
    criticalSelectors,
    edgeEntrySelectors,
  );
  expectSurfaceGeometry(geometry);
  await saveScreenshot(screenshotName, {
    directory: screenshotDirectory,
    includeTimestamp: false,
    prefix: 'slice39-typography',
  });
  return geometry;
};

const verifyFloatingMiniChatRoundTrip = async () => {
  const trigger = await $('.void-fmc__button');
  await trigger.waitForClickable({ timeout: 5_000 });
  await trigger.click();
  await browser.waitUntil(async () => browser.execute(() => (
    document.querySelector('.void-fmc')?.classList.contains('void-fmc--open')
      === true
    && document.querySelector('.void-fmc__panel')?.classList.contains(
      'void-fmc__panel--open',
    ) === true
  )), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: 'Floating mini chat did not open at CSS 200%',
  });

  const close = await $('.void-fmc__header-btn--close');
  await close.waitForClickable({ timeout: 5_000 });
  await close.click();
  await browser.waitUntil(async () => browser.execute(() => (
    document.querySelector('.void-fmc')?.classList.contains('void-fmc--open')
      === false
  )), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: 'Floating mini chat did not close at CSS 200%',
  });
  await trigger.waitForClickable({ timeout: 5_000 });
};

const readWindowMetrics = (): Promise<WindowMetrics> => browser.execute(() => ({
  devicePixelRatio: window.devicePixelRatio,
  innerHeight: window.innerHeight,
  innerWidth: window.innerWidth,
  outerHeight: window.outerHeight,
  outerWidth: window.outerWidth,
}));

const ensureDesktopZoom200Viewport = async () => {
  const minimumViewport = { height: 700, width: 1024 };
  const maximumRequestedSize = { height: 2200, width: 3200 };
  const initialRequestedSize = { height: 1800, width: 2800 };

  await browser.setWindowSize(
    initialRequestedSize.width,
    initialRequestedSize.height,
  );
  await setDesktopZoomTo200();
  const firstZoomedMetrics = await readWindowMetrics();
  if (
    firstZoomedMetrics.innerWidth >= minimumViewport.width
    && firstZoomedMetrics.innerHeight >= minimumViewport.height
  ) {
    expect(firstZoomedMetrics.innerWidth).toBeGreaterThanOrEqual(
      minimumViewport.width,
    );
    expect(firstZoomedMetrics.innerHeight).toBeGreaterThanOrEqual(
      minimumViewport.height,
    );
    return firstZoomedMetrics;
  }

  await resetDesktopZoom();
  const retryRequestedSize = {
    height: Math.min(maximumRequestedSize.height, Math.ceil(
      initialRequestedSize.height
      * minimumViewport.height
      / firstZoomedMetrics.innerHeight
      * 1.03,
    )),
    width: Math.min(maximumRequestedSize.width, Math.ceil(
      initialRequestedSize.width
      * minimumViewport.width
      / firstZoomedMetrics.innerWidth
      * 1.03,
    )),
  };
  await browser.setWindowSize(
    retryRequestedSize.width,
    retryRequestedSize.height,
  );
  const retryMetricsAt100 = await readWindowMetrics();
  await setDesktopZoomTo200();
  const retryZoomedMetrics = await readWindowMetrics();
  const metrics = {
    firstZoomedMetrics,
    initialRequestedSize,
    maximumRequestedSize,
    minimumViewport,
    retryMetricsAt100,
    retryRequestedSize,
    retryZoomedMetrics,
  };
  const viewportGrew = (
    retryZoomedMetrics.innerWidth > firstZoomedMetrics.innerWidth
    || retryZoomedMetrics.innerHeight > firstZoomedMetrics.innerHeight
  );
  if (!viewportGrew) {
    throw new Error(
      `OS/WebDriver did not grow the 200% CSS viewport after one resize retry: `
      + JSON.stringify(metrics),
    );
  }
  if (
    retryZoomedMetrics.innerWidth < minimumViewport.width
    || retryZoomedMetrics.innerHeight < minimumViewport.height
  ) {
    throw new Error(
      `OS/WebDriver left the 200% CSS viewport below 1024x700 after one `
      + `resize retry: ${JSON.stringify(metrics)}`,
    );
  }
  expect(retryRequestedSize.width).toBeLessThanOrEqual(
    maximumRequestedSize.width,
  );
  expect(retryRequestedSize.height).toBeLessThanOrEqual(
    maximumRequestedSize.height,
  );
  expect(retryZoomedMetrics.innerWidth).toBeGreaterThanOrEqual(
    minimumViewport.width,
  );
  expect(retryZoomedMetrics.innerHeight).toBeGreaterThanOrEqual(
    minimumViewport.height,
  );
  return retryZoomedMetrics;
};

describe('L0 representative desktop typography matrix', () => {
  let originalThemeSelection = 'system';
  let originalUrl = '';
  let originalWindowSize = { width: 1280, height: 800 };
  let originalZoomPreference = 1;
  let mediaSessionId: string | null = null;

  before(async () => {
    originalUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    await browser.setWindowSize(1280, 800);
    expect(await openWorkspace(TEST_WORKSPACE_PATH)).toBe(true);
    await dismissVisualObstructions();
    await browser.waitUntil(async () => browser.execute(() => (
      document.documentElement.dataset.voidDesktopZoomReady === 'true'
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Desktop zoom controller did not finish initialization',
    });
    originalZoomPreference = await readZoomPreference();
    await resetDesktopZoom();

    originalThemeSelection = await browser.execute(async () => {
      const modulePath = '/src/infrastructure/theme/core/ThemeService.ts';
      const { themeService } = await import(/* @vite-ignore */ modulePath);
      return themeService.getCurrentThemeId();
    });

    mediaSessionId = await browser.execute(async () => {
      const globalStatePath = '/src/shared/types/global-state.ts';
      const flowChatManagerPath = '/src/flow_chat/services/FlowChatManager.ts';
      const openMainSessionPath = '/src/flow_chat/services/openBtwSession.ts';
      const { globalStateAPI } = await import(
        /* @vite-ignore */ globalStatePath
      );
      const { flowChatManager } = await import(
        /* @vite-ignore */ flowChatManagerPath
      );
      const { openMainSession } = await import(
        /* @vite-ignore */ openMainSessionPath
      );
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('Expected a workspace before creating the Media session');
      }
      const sessionId = await flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
      await openMainSession(sessionId);
      return sessionId;
    });
    await $('.void-session-scene').waitForDisplayed({ timeout: 20_000 });
    await dismissVisualObstructions();
  });

  for (const themeId of ['void-dark', 'void-light'] as const) {
    it(`keeps the visible workspace on the canonical family in ${themeId} at 100%`, async () => {
      if (!mediaSessionId) {
        throw new Error('Expected the Media session for typography verification');
      }
      await browser.setWindowSize(1280, 800);
      await resetDesktopZoom();
      await openMediaSession(mediaSessionId);
      await applyRuntimeTheme(themeId);
      await $('[data-testid="app-layout"]').waitForDisplayed({ timeout: 15_000 });

      await verifyAndCaptureSurface({
        criticalSelectors: ['.void-scene-bar'],
        expectedZoom: 1,
        screenshotName: `workspace-${themeId}-100`,
        selector: '[data-testid="app-layout"]',
      });
      await expectCanonicalSurface('.void-nav-panel');
    });

    it(`keeps real workspace, automation, settings, media and short-drama surfaces canonical in ${themeId} at CSS 200%`, async () => {
      if (!mediaSessionId) {
        throw new Error('Expected the Media session for typography verification');
      }
      try {
        await openMediaSession(mediaSessionId);
        await applyRuntimeTheme(themeId);
        const zoomMetrics = await ensureDesktopZoom200Viewport();
        console.log(
          `[typography-viewport] ${themeId} `
          + `${zoomMetrics.innerWidth}x${zoomMetrics.innerHeight} CSS px `
          + `(outer ${zoomMetrics.outerWidth}x${zoomMetrics.outerHeight}, `
          + `dpr ${zoomMetrics.devicePixelRatio})`,
        );

        await verifyAndCaptureSurface({
          criticalSelectors: ['.void-scene-bar'],
          expectedZoom: 2,
          screenshotName: `workspace-${themeId}-200`,
          selector: '[data-testid="app-layout"]',
        });

        await openScene('automation', '.automation-scene');
        const automationGeometry = await verifyAndCaptureSurface({
          criticalSelectors: ['.automation-header'],
          edgeEntrySelectors: ['.void-fmc__button'],
          expectedZoom: 2,
          screenshotName: `automation-${themeId}-200`,
          selector: '.automation-scene',
        });
        const [miniChatEdge] = automationGeometry.edgeEntries;
        console.log(
          `[typography-edge] ${themeId} `
          + `${miniChatEdge.intersectionWidth}x`
          + `${miniChatEdge.intersectionHeight} CSS px visible; `
          + `rect ${miniChatEdge.rect.width}x${miniChatEdge.rect.height}; `
          + `hit=${miniChatEdge.hitMatches}`,
        );
        await verifyFloatingMiniChatRoundTrip();

        await openScene('settings', '.void-settings-scene');
        await verifyAndCaptureSurface({
          criticalSelectors: [
            '.void-scene-bar',
            '.void-settings-scene__content-wrapper',
          ],
          expectedZoom: 2,
          screenshotName: `settings-${themeId}-200`,
          selector: '.void-settings-scene',
        });

        await openMediaSession(mediaSessionId);
        await browser.execute(() => {
          window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
        });
        await $('.workspace-media-gallery').waitForDisplayed({ timeout: 15_000 });
        await dismissVisualObstructions();
        await verifyAndCaptureSurface({
          criticalSelectors: ['.workspace-media-gallery__toolbar'],
          expectedZoom: 2,
          screenshotName: `media-${themeId}-200`,
          selector: '.workspace-media-gallery',
        });

        await browser.execute(() => {
          window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
        });
        await $('[data-testid="short-drama-center"]').waitForDisplayed({
          timeout: 15_000,
        });
        await dismissVisualObstructions();
        await verifyAndCaptureSurface({
          criticalSelectors: ['.short-drama-center__topbar'],
          expectedZoom: 2,
          screenshotName: `short-drama-${themeId}-200`,
          selector: '[data-testid="short-drama-center"]',
        });
      } finally {
        await resetDesktopZoom();
      }
    });
  }

  it('keeps Git graph UI text shared while preserving the hash mono exception', () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        '..',
        '..',
        'src/web-ui/src/tools/git/components/GitGraphView/GitGraphView.tsx',
      ),
      'utf8',
    );

    expect(source.match(/ctx\.font = buildCanvasFont/g)).toHaveLength(4);
    expect(source).toContain(
      'ctx.font = \'11px "SF Mono", "Monaco", "Courier New", monospace\';',
    );
  });

  after(async () => {
    const failures: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    await attempt('restore desktop zoom', async () => {
      await restoreZoomPreference(originalZoomPreference);
    });
    await attempt('restore notification presentation', async () => {
      await dismissVisualObstructions();
    });
    if (mediaSessionId) {
      const sessionId = mediaSessionId;
      await attempt('delete Media session', async () => {
        const deleted = await browser.execute(async (id) => {
          const modulePath = '/src/flow_chat/services/FlowChatManager.ts';
          const { flowChatManager } = await import(
            /* @vite-ignore */ modulePath
          );
          await flowChatManager.deleteChatSession(id);
          return !flowChatManager.getFlowChatState().sessions.has(id);
        }, sessionId);
        expect(deleted).toBe(true);
        mediaSessionId = null;
      });
    }
    await attempt('restore theme selection', async () => {
      await browser.execute(async (themeId) => {
        const modulePath = '/src/infrastructure/theme/core/ThemeService.ts';
        const { themeService } = await import(/* @vite-ignore */ modulePath);
        await themeService.applyTheme(themeId);
      }, originalThemeSelection);
    });
    await attempt('restore URL', async () => {
      await browser.url(originalUrl);
      await $('[data-testid="app-layout"]').waitForDisplayed({ timeout: 20_000 });
    });
    await attempt('restore window size', async () => {
      await browser.setWindowSize(
        originalWindowSize.width,
        originalWindowSize.height,
      );
    });

    await attempt('verify terminal cleanup state', async () => {
      const terminalState = await browser.execute(async () => {
        const modulePath = '/src/infrastructure/theme/core/ThemeService.ts';
        const { themeService } = await import(/* @vite-ignore */ modulePath);
        const isVisible = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const style = getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          return (
            style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number.parseFloat(style.opacity || '1') > 0
            && rect.width > 0
            && rect.height > 0
          );
        };

        return {
          centerCount: Array.from(document.querySelectorAll('.notification-center'))
            .filter(isVisible).length,
          itemCount: Array.from(document.querySelectorAll('.notification-item'))
            .filter(isVisible).length,
          themeId: themeService.getCurrentThemeId(),
        };
      });
      const restoredWindowSize = await browser.getWindowSize();

      expect(await readZoomPreference()).toBe(originalZoomPreference);
      expect(terminalState.centerCount).toBe(0);
      expect(terminalState.itemCount).toBe(0);
      expect(terminalState.themeId).toBe(originalThemeSelection);
      expect(await browser.getUrl()).toBe(originalUrl);
      expect(restoredWindowSize.width).toBe(originalWindowSize.width);
      expect(restoredWindowSize.height).toBe(originalWindowSize.height);
      expect(mediaSessionId).toBeNull();
    });

    if (failures.length > 0) {
      throw new Error(`Typography matrix cleanup failed:\n${failures.join('\n')}`);
    }
  });
});
