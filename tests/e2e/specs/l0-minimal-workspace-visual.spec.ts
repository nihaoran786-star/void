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
});
