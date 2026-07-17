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

const restoreZoomPreference = async (savedPreference: number) => {
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

  if (steps > 0) {
    await browser.waitUntil(async () => (
      (await readZoomPreference()) === visualLevel
    ), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Desktop visual test did not restore the original visual zoom',
    });
  }

  if (savedPreference !== visualLevel) {
    await browser.execute(async (value) => {
      type TauriInternals = {
        invoke<T>(command: string, args?: unknown): Promise<T>;
      };
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

    const emptyWorkspace = await $('.void-nav-panel__workspace-list-empty');
    if (await emptyWorkspace.isExisting()) {
      const emptyWorkspaceStyles = await browser.execute(() => {
        const element = document.querySelector<HTMLElement>(
          '.void-nav-panel__workspace-list-empty',
        );
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
          minHeight: style.minHeight,
        };
      });

      expect(emptyWorkspaceStyles).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderRadius: '0px',
        fontSize: '11px',
        minHeight: '28px',
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
        const notification = document.querySelector<HTMLElement>(
          '.notification-container',
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
          notification: rectOf(notification),
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
      if (layoutEvidence.notification) {
        expect(layoutEvidence.notification.width).toBeLessThanOrEqual(321);
        expect(layoutEvidence.notification.left)
          .toBeGreaterThanOrEqual((layoutEvidence.navigation?.right ?? 0) - 1);
        expect(layoutEvidence.notification.right)
          .toBeLessThanOrEqual(layoutEvidence.viewport.width + 1);
      }

      await saveScreenshot('desktop-narrow', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice1-minimal',
      });

      const workspaceReachability = await browser.execute(() => {
        const sections = document.querySelector<HTMLElement>(
          '.void-nav-panel__sections',
        );
        const workspaceItems = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.void-nav-panel__workspace-item-card',
          ),
        );
        if (!sections) {
          return {
            sectionExists: false,
            workspaceItemCount: workspaceItems.length,
            overflow: 0,
            scrollTop: 0,
            workspaceItemVisible: false,
          };
        }

        const overflow = sections.scrollHeight - sections.clientHeight;
        const targetWorkspaceItem = workspaceItems.at(-1) ?? null;
        targetWorkspaceItem?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
        });
        const sectionRect = sections.getBoundingClientRect();
        const workspaceItemVisible = workspaceItems.some((item) => {
          const itemRect = item.getBoundingClientRect();
          return (
            itemRect.bottom > sectionRect.top
            && itemRect.top < sectionRect.bottom
            && itemRect.height > 0
          );
        });

        return {
          sectionExists: true,
          workspaceItemCount: workspaceItems.length,
          overflow,
          scrollTop: sections.scrollTop,
          workspaceItemVisible,
        };
      });

      await saveScreenshot('desktop-narrow-workspace-reachable', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice1-minimal',
      });

      expect(workspaceReachability.sectionExists).toBe(true);
      expect(workspaceReachability.workspaceItemCount).toBeGreaterThan(0);
      if (workspaceReachability.overflow > 1) {
        expect(workspaceReachability.scrollTop).toBeGreaterThan(0);
      }
      expect(workspaceReachability.workspaceItemVisible).toBe(true);
    } finally {
      await browser.execute(() => {
        const sections = document.querySelector<HTMLElement>(
          '.void-nav-panel__sections',
        );
        if (sections) sections.scrollTop = 0;
      });
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
      const notification = document.querySelector<HTMLElement>(
        '.notification-container',
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
        notification: rectOf(notification),
      };
    });

    let baselineViewportWidth: number | null = null;
    let originalZoomPreference: number | null = null;
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
        (await readZoomPreference()) === 1
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
        if (evidence.notification) {
          expect(evidence.notification.width).toBeLessThanOrEqual(321);
          expect(evidence.notification.left)
            .toBeGreaterThanOrEqual((evidence.navigation?.right ?? 0) - 1);
          expect(evidence.notification.right)
            .toBeLessThanOrEqual(evidence.viewport.width + 1);
        }

        await saveScreenshot(`zoom-${step.level}`, {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice1-minimal',
        });

        previousViewportWidth = evidence.viewport.width;
      }
    } finally {
      await browser.keys([desktopPrimaryModifier, '0']);
      if (baselineViewportWidth !== null) {
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
        await restoreZoomPreference(originalZoomPreference);
        await browser.waitUntil(async () => (
          (await readZoomPreference()) === originalZoomPreference
        ), {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'Desktop visual test did not restore the original zoom preference',
        });
      }
      await browser.maximizeWindow();
    }
  });
});
