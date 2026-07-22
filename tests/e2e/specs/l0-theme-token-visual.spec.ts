import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { saveElementScreenshot, saveScreenshot } from '../helpers/screenshot-utils';

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

const readThemeSelection = () => browser.execute(async () => {
  const internals = (
    window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  ).__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error('Tauri internals are unavailable while reading the theme');
  }

  return internals.invoke<unknown>('get_config', {
    request: {
      path: 'themes.current',
      skipRetryOnNotFound: true,
    },
  });
});

const writeThemeSelection = (themeId: string) => browser.execute(
  async (nextThemeId) => {
    const internals = (
      window as Window & { __TAURI_INTERNALS__?: TauriInternals }
    ).__TAURI_INTERNALS__;
    if (!internals) {
      throw new Error('Tauri internals are unavailable while setting the theme');
    }

    await internals.invoke('set_config', {
      request: {
        path: 'themes.current',
        value: nextThemeId,
      },
    });
  },
  themeId,
);

const describeCleanupFailure = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const attemptCleanup = async (
  failures: string[],
  label: string,
  action: () => Promise<void>,
) => {
  try {
    await action();
  } catch (error) {
    failures.push(`${label}: ${describeCleanupFailure(error)}`);
  }
};

const openSkillsScene = async () => {
  await browser.execute(() => {
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: 'skills' },
    }));
  });
  await $('.void-skills-scene').waitForDisplayed({ timeout: 15_000 });

  const discoverTab = await $('.skills-tabs-bar__tab:nth-of-type(2)');
  await discoverTab.waitForClickable({ timeout: 10_000 });
  await discoverTab.click();
  await $('.skills-discover__hero').waitForDisplayed({ timeout: 10_000 });
};

const readSkillsThemeEvidence = () => browser.execute(() => {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const scene = document.querySelector<HTMLElement>('.void-skills-scene');
  const tabs = document.querySelector<HTMLElement>('.skills-tabs-bar');
  const hero = document.querySelector<HTMLElement>('.skills-discover__hero');
  const sceneStyle = scene ? getComputedStyle(scene) : null;
  const tabsStyle = tabs ? getComputedStyle(tabs) : null;
  const heroStyle = hero ? getComputedStyle(hero) : null;

  return {
    theme: root.getAttribute('data-theme'),
    themeType: root.getAttribute('data-theme-type'),
    canonicalPrimary: rootStyle.getPropertyValue('--color-bg-primary').trim(),
    canonicalSecondary: rootStyle.getPropertyValue('--color-bg-secondary').trim(),
    retiredBase: rootStyle.getPropertyValue('--color-bg-base').trim(),
    retiredSemanticError: rootStyle
      .getPropertyValue('--color-semantic-error')
      .trim(),
    sceneBackground: sceneStyle?.backgroundColor ?? '',
    tabsBackground: tabsStyle?.backgroundColor ?? '',
    heroBackgroundImage: heroStyle?.backgroundImage ?? '',
    sceneClientWidth: scene?.clientWidth ?? 0,
    sceneScrollWidth: scene?.scrollWidth ?? 0,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  };
});

describe('L0 canonical theme token visual contract', () => {
  let sourceUrl = '';
  let originalThemeSelection = 'system';
  let originalWindowSize = { width: 1280, height: 800 };

  before(async () => {
    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    const savedSelection = await readThemeSelection();
    if (typeof savedSelection === 'string' && savedSelection.length > 0) {
      originalThemeSelection = savedSelection;
    }
    await browser.setWindowSize(1280, 800);
  });

  for (const [themeId, themeType] of [
    ['void-dark', 'dark'],
    ['void-light', 'light'],
  ] as const satisfies ReadonlyArray<readonly [ThemeId, 'dark' | 'light']>) {
    it(`renders the Skills canvas from canonical tokens in ${themeType} mode`, async () => {
      await writeThemeSelection(themeId);

      const target = new URL(sourceUrl);
      target.searchParams.set('void-ui', 'minimal');
      await browser.url(target.toString());
      await browser.waitUntil(async () => browser.execute(
        (expectedTheme) => (
          document.documentElement.getAttribute('data-theme') === expectedTheme
          && document
            .querySelector('[data-testid="app-layout"]')
            ?.getAttribute('data-ui-presentation') === 'minimal'
          && !document.querySelector('.splash-screen')
        ),
        themeId,
      ), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: `${themeId} did not settle before visual capture`,
      });

      await openSkillsScene();
      await browser.waitUntil(async () => browser.execute(() => (
        Boolean(document.querySelector('.skills-discover__hero'))
        && !document.querySelector('.splash-screen')
      )), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Skills scene pixels did not settle after startup',
      });
      await browser.execute(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      });
      const evidence = await readSkillsThemeEvidence();

      expect(evidence.theme).toBe(themeId);
      expect(evidence.themeType).toBe(themeType);
      expect(evidence.canonicalPrimary.length).toBeGreaterThan(0);
      expect(evidence.canonicalSecondary.length).toBeGreaterThan(0);
      expect(evidence.retiredBase).toBe('');
      expect(evidence.retiredSemanticError).toBe('');
      expect(evidence.sceneBackground.length).toBeGreaterThan(0);
      expect(evidence.tabsBackground).toBe(evidence.sceneBackground);
      expect(evidence.heroBackgroundImage).toContain('linear-gradient');
      expect(evidence.sceneScrollWidth)
        .toBeLessThanOrEqual(evidence.sceneClientWidth + 1);
      expect(evidence.documentScrollWidth)
        .toBeLessThanOrEqual(evidence.documentClientWidth + 1);

      await saveScreenshot(`theme-token-skills-${themeType}`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice7-minimal',
      });
      await saveElementScreenshot(
        '.void-skills-scene',
        `theme-token-skills-${themeType}-scene`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice7-minimal',
        },
      );
    });
  }

  after(async () => {
    const cleanupFailures: string[] = [];

    await attemptCleanup(cleanupFailures, 'restore theme selection', async () => {
      await writeThemeSelection(originalThemeSelection);
    });
    await attemptCleanup(cleanupFailures, 'restore source URL', async () => {
      await browser.url(sourceUrl);
      await browser.waitUntil(async () => browser.execute(() => (
        Boolean(document.querySelector('[data-testid="app-layout"]'))
        && !document.querySelector('.splash-screen')
      )), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: 'Original application URL did not settle during cleanup',
      });
    });
    await attemptCleanup(cleanupFailures, 'restore window size', async () => {
      await browser.setWindowSize(
        originalWindowSize.width,
        originalWindowSize.height,
      );
    });
    await attemptCleanup(cleanupFailures, 'verify theme selection', async () => {
      const restoredSelection = await readThemeSelection();
      if (restoredSelection !== originalThemeSelection) {
        throw new Error(
          `expected ${originalThemeSelection}, received ${String(restoredSelection)}`,
        );
      }
    });
    await attemptCleanup(cleanupFailures, 'verify source URL', async () => {
      const restoredUrl = await browser.getUrl();
      if (restoredUrl !== sourceUrl) {
        throw new Error(`expected ${sourceUrl}, received ${restoredUrl}`);
      }
    });
    await attemptCleanup(cleanupFailures, 'verify window size', async () => {
      const restoredWindowSize = await browser.getWindowSize();
      if (
        restoredWindowSize.width !== originalWindowSize.width
        || restoredWindowSize.height !== originalWindowSize.height
      ) {
        throw new Error(
          `expected ${originalWindowSize.width}x${originalWindowSize.height}, `
          + `received ${restoredWindowSize.width}x${restoredWindowSize.height}`,
        );
      }
    });

    if (cleanupFailures.length > 0) {
      throw new Error(
        `Theme visual contract cleanup failed:\n${cleanupFailures.join('\n')}`,
      );
    }
  });
});
