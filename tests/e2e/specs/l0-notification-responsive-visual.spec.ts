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

const parseRgb = (cssColor: string): [number, number, number] => {
  const channels = cssColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected an RGB color, received "${cssColor}"`);
  }
  return channels as [number, number, number];
};

const relativeLuminance = (cssColor: string): number => {
  const channels = parseRgb(cssColor).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

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
          actionStyles: actions.map(action => {
            const style = getComputedStyle(action);
            return {
              backgroundColor: style.backgroundColor,
              color: style.color,
            };
          }),
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
      expect(contrastRatio(
        evidence.actionStyles[0].color,
        evidence.actionStyles[0].backgroundColor,
      )).toBeGreaterThanOrEqual(4.5);

      await browser.execute(() => {
        document.querySelector<HTMLElement>('.notification-item__close')?.focus();
      });
      await browser.keys(['Shift', 'Tab']);
      await browser.keys(['Shift', 'Tab']);

      const focusedAction = await browser.execute(() => {
        const activeElement = document.activeElement as HTMLElement | null;
        return {
          isPrimaryAction: activeElement?.classList.contains(
            'notification-item__action--primary',
          ) ?? false,
          label: activeElement?.textContent?.trim() ?? '',
        };
      });

      expect(focusedAction.isPrimaryAction).toBe(true);
      expect(focusedAction.label).toBe('导出诊断包');

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
