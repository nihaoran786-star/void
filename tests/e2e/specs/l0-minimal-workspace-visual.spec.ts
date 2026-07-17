import { browser, expect, $ } from '@wdio/globals';
import * as path from 'node:path';
import { saveElementScreenshot, saveScreenshot } from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);
const desktopPrimaryModifier: 'Meta' | 'Control' =
  process.platform === 'darwin' ? 'Meta' : 'Control';

type ZoomPreferenceSnapshot = {
  exists: boolean;
  value: number;
};

const readZoomPreference = () => browser.execute(async () => {
  type TauriInternals = {
    invoke<T>(command: string, args?: unknown): Promise<T>;
  };
  const internals = (
    window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  ).__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error('Tauri internals are unavailable while reading desktop zoom');
  }

  let value: unknown;
  try {
    value = await internals.invoke('get_config', {
      request: {
        path: 'app.zoom_level',
        skipRetryOnNotFound: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('not found')) throw error;
  }

  return {
    exists: typeof value === 'number',
    value: typeof value === 'number' ? value : 1,
  };
});

const restoreZoomPreference = (snapshot: ZoomPreferenceSnapshot) =>
  browser.execute(async (savedPreference) => {
    type TauriInternals = {
      invoke<T>(command: string, args?: unknown): Promise<T>;
      metadata?: {
        currentWebview?: {
          label?: string;
        };
      };
    };
    const internals = (
      window as Window & { __TAURI_INTERNALS__?: TauriInternals }
    ).__TAURI_INTERNALS__;
    const webviewLabel = internals?.metadata?.currentWebview?.label;
    if (!internals || !webviewLabel) {
      throw new Error('Tauri internals are unavailable while restoring desktop zoom');
    }

    await internals.invoke('plugin:webview|set_webview_zoom', {
      label: webviewLabel,
      value: savedPreference.value,
    });
    if (savedPreference.exists) {
      await internals.invoke('set_config', {
        request: {
          path: 'app.zoom_level',
          value: savedPreference.value,
        },
      });
    } else {
      await internals.invoke('reset_config', {
        request: {
          path: 'app.zoom_level',
        },
      });
    }
  }, snapshot);

describe('L0 minimal workspace visual capture', () => {
  it('captures the real desktop shell without changing application data', async () => {
    await browser.waitUntil(async () => {
      const presentation = await browser.execute(
        () => document.querySelector('[data-testid="app-layout"]')?.getAttribute('data-ui-presentation'),
      );
      return presentation === 'minimal';
    }, {
      timeout: 15_000,
      timeoutMsg: 'Minimal workspace presentation did not activate',
    });

    expect(await $('[data-testid="app-layout"]')).toBeDisplayed();

    await saveScreenshot('desktop-shell', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice1-minimal',
    });

    const navPanel = await $('.void-nav-panel');
    if (await navPanel.isExisting()) {
      await saveElementScreenshot('.void-nav-panel', 'navigation', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice1-minimal',
      });
    }

    const chatInput = await $('.void-chat-input');
    if (await chatInput.isExisting()) {
      await saveElementScreenshot('.void-chat-input', 'composer', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice1-minimal',
      });
    }
  });

  it('keeps critical shell actions visible at a narrow desktop size', async () => {
    try {
      await browser.setWindowSize(1024, 720);
      await browser.pause(300);

      const layoutEvidence = await browser.execute(() => {
        const layout = document.querySelector<HTMLElement>('[data-testid="app-layout"]');
        const navigation = document.querySelector<HTMLElement>('.void-nav-panel');
        const main = document.querySelector<HTMLElement>(
          '[data-testid="app-main-content"], .void-app-main-workspace',
        );
        const moreButton = document.querySelector<HTMLElement>(
          '.void-nav-panel__footer-btn--icon',
        );
        const rectOf = (element: HTMLElement | null) => {
          if (!element) return null;
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
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          documentScrollWidth: document.documentElement.scrollWidth,
          layout: rectOf(layout),
          navigation: rectOf(navigation),
          main: rectOf(main),
          moreButton: rectOf(moreButton),
        };
      });

      expect(layoutEvidence.layout?.width ?? 0).toBeGreaterThan(0);
      expect(layoutEvidence.navigation?.right ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(layoutEvidence.viewport.width + 1);
      expect(layoutEvidence.main?.width ?? 0).toBeGreaterThan(0);
      expect(layoutEvidence.moreButton?.bottom ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(layoutEvidence.viewport.height + 1);
      expect(layoutEvidence.documentScrollWidth)
        .toBeLessThanOrEqual(layoutEvidence.viewport.width + 1);

      await saveScreenshot('desktop-narrow', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice1-minimal',
      });
    } finally {
      await browser.maximizeWindow();
    }
  });

  it('keeps critical shell actions visible from 100% through 200% zoom', async () => {
    const readShellEvidence = () => browser.execute(() => {
      const navigation = document.querySelector<HTMLElement>('.void-nav-panel');
      const main = document.querySelector<HTMLElement>(
        '[data-testid="app-main-content"], .void-app-main-workspace',
      );
      const moreButton = document.querySelector<HTMLElement>(
        '.void-nav-panel__footer-btn--icon',
      );
      const rectOf = (element: HTMLElement | null) => {
        if (!element) return null;
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
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        documentScrollWidth: document.documentElement.scrollWidth,
        navigation: rectOf(navigation),
        main: rectOf(main),
        moreButton: rectOf(moreButton),
      };
    });

    let baselineViewportWidth: number | null = null;
    let originalZoomPreference: ZoomPreferenceSnapshot | null = null;

    try {
      await browser.maximizeWindow();
      await browser.waitUntil(async () => browser.execute(() => (
        document.documentElement.dataset.voidDesktopZoomReady === 'true'
      )), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Desktop zoom controller did not finish initialization',
      });

      originalZoomPreference = await readZoomPreference();
      await browser.keys([desktopPrimaryModifier, '0']);
      await browser.waitUntil(async () => (
        (await readZoomPreference()).value === 1
      ), {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'Desktop zoom controller did not persist the 100% reset',
      });
      baselineViewportWidth = (await readShellEvidence()).viewport.width;

      const zoomSteps = [
        { level: 100, increments: 0 },
        { level: 125, increments: 2 },
        { level: 150, increments: 1 },
        { level: 200, increments: 2 },
      ];
      let previousViewportWidth = baselineViewportWidth + 1;

      for (const step of zoomSteps) {
        for (let increment = 0; increment < step.increments; increment += 1) {
          await browser.keys([desktopPrimaryModifier, '=']);
        }

        await browser.waitUntil(async () => {
          const evidence = await readShellEvidence();
          return evidence.viewport.width < previousViewportWidth;
        }, {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: `Desktop WebView did not reach the expected ${step.level}% zoom step`,
        });

        const evidence = await readShellEvidence();
        expect(evidence.viewport.width).toBeLessThan(previousViewportWidth);
        expect(evidence.navigation?.right ?? Number.POSITIVE_INFINITY)
          .toBeLessThanOrEqual(evidence.viewport.width + 1);
        expect(evidence.main?.width ?? 0).toBeGreaterThan(0);
        expect(evidence.moreButton?.bottom ?? Number.POSITIVE_INFINITY)
          .toBeLessThanOrEqual(evidence.viewport.height + 1);
        expect(evidence.documentScrollWidth)
          .toBeLessThanOrEqual(evidence.viewport.width + 1);

        await saveScreenshot(`zoom-${step.level}`, {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice1-minimal',
        });

        previousViewportWidth = evidence.viewport.width;
      }
    } finally {
      if (originalZoomPreference !== null) {
        await browser.keys([desktopPrimaryModifier, '0']);
      }
      if (originalZoomPreference !== null && baselineViewportWidth !== null) {
        await browser.waitUntil(async () => {
          const evidence = await readShellEvidence();
          return evidence.viewport.width >= baselineViewportWidth! - 1;
        }, {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'Desktop WebView did not restore 100% zoom after the visual test',
        });
      }
      if (originalZoomPreference !== null) {
        await browser.waitUntil(async () => (
          (await readZoomPreference()).value === 1
        ), {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'Desktop zoom controller did not finish its cleanup reset',
        });
        await restoreZoomPreference(originalZoomPreference);
        if (originalZoomPreference.exists) {
          await browser.waitUntil(async () => (
            (await readZoomPreference()).value === originalZoomPreference!.value
          ), {
            timeout: 5_000,
            interval: 100,
            timeoutMsg: 'Desktop visual test did not restore the original zoom preference',
          });
        }
      }
      await browser.maximizeWindow();
    }
  });
});
