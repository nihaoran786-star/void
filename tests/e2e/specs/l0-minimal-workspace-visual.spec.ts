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
});
