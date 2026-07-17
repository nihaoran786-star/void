import { browser, expect, $ } from '@wdio/globals';
import * as path from 'node:path';
import { saveScreenshot } from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);

describe('L0 responsive notification visual capture', () => {
  it('keeps an actionable global notice inside one content edge', async () => {
    try {
      await browser.waitUntil(async () => (
        browser.execute(
          () => document.querySelector('[data-testid="app-layout"]')
            ?.getAttribute('data-ui-presentation'),
        )
      ).then(presentation => presentation === 'minimal'), {
        timeout: 15_000,
        timeoutMsg: 'Minimal workspace presentation did not activate',
      });

      await browser.setWindowSize(1024, 720);
      await browser.pause(300);

      await browser.execute(async () => {
        const modulePath = '/src/shared/notification-system/index.ts';
        const { notificationService } = await import(/* @vite-ignore */ modulePath);

        notificationService.warning(
          'void 已从一次异常退出后重新打开。如需反馈问题，可以导出诊断包。',
          {
            title: '上次没有正常关闭',
            duration: 0,
            actions: [
              {
                label: '导出诊断包',
                variant: 'primary',
                onClick: () => undefined,
              },
              {
                label: '打开日志设置',
                onClick: () => undefined,
              },
            ],
            metadata: {
              source: 'responsive-visual-test',
            },
          },
        );
      });

      const notification = await $('.notification-container');
      await notification.waitForDisplayed({ timeout: 5_000 });
      await browser.pause(400);

      const evidence = await browser.execute(() => {
        const navigation = document.querySelector<HTMLElement>('.void-nav-panel');
        const container = document.querySelector<HTMLElement>('.notification-container');
        const item = document.querySelector<HTMLElement>('.notification-item');
        const actions = Array.from(
          document.querySelectorAll<HTMLElement>('.notification-item__action'),
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
          navigation: rectOf(navigation),
          container: rectOf(container),
          item: rectOf(item),
          actionLabels: actions.map(action => action.textContent?.trim() ?? ''),
        };
      });

      expect(evidence.container).not.toBeNull();
      expect(evidence.item).not.toBeNull();
      expect(evidence.container?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(321);
      expect(evidence.item?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(321);
      expect(evidence.container?.left ?? 0)
        .toBeGreaterThanOrEqual((evidence.navigation?.right ?? 0) - 1);
      expect(evidence.container?.right ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(evidence.viewport.width + 1);
      expect(evidence.container?.bottom ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(evidence.viewport.height + 1);
      expect(evidence.documentScrollWidth)
        .toBeLessThanOrEqual(evidence.viewport.width + 1);
      expect(evidence.actionLabels).toEqual(['导出诊断包', '打开日志设置']);

      await saveScreenshot('toast-responsive-desktop-narrow', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice1-minimal',
      });
    } finally {
      await browser.maximizeWindow();
    }
  });
});
