import { browser, expect, $ } from '@wdio/globals';
import { mkdirSync } from 'node:fs';

describe('Media preview smoke', () => {
  it('opens pure media in the lightweight overlay instead of BrowserPanel', async () => {
    await browser.execute(() => {
      window.dispatchEvent(new CustomEvent('void-media-preview-open', {
        detail: {
          kind: 'image',
          url: 'https://cdn.example.com/manual-smoke.png',
          title: 'Image Smoke',
        },
      }));
    });

    const dialog = await $('[role="dialog"][aria-label="Image Smoke"]');
    await dialog.waitForExist({ timeout: 5000 });
    await expect(dialog).toBeExisting();

    const image = await $('img[src="https://cdn.example.com/manual-smoke.png"]');
    await expect(image).toBeExisting();

    const browserPanel = await $('.browser-panel');
    await expect(browserPanel).not.toBeExisting();

    const focusIsInsideDialog = await browser.execute(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Image Smoke"]');
      return Boolean(dialog?.contains(document.activeElement));
    });
    expect(focusIsInsideDialog).toBe(true);

    mkdirSync('reports', { recursive: true });
    await browser.saveScreenshot('reports/media-preview-overlay.png');

    await browser.execute(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Image Smoke"]');
      const button = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find((candidate) => candidate.getAttribute('aria-label')?.includes('关闭'));
      button?.click();
    });
    await browser.waitUntil(
      async () => browser.execute(() => !document.querySelector('[role="dialog"][aria-label="Image Smoke"]')),
      { timeout: 5000, timeoutMsg: 'media preview overlay did not close after clicking close' },
    );
  });
});
