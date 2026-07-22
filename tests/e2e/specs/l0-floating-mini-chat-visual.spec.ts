import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { saveScreenshot } from '../helpers/screenshot-utils';

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

type Rect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type FloatingEvidence = {
  background: string;
  backgroundImage: string;
  button: Rect | null;
  documentClientWidth: number;
  documentScrollWidth: number;
  intersectingVisibleConfigRows: Rect[];
  panel: Rect | null;
  panelClientWidth: number;
  panelScrollWidth: number;
  presentation: string | null;
  raisedSurface: string;
  root: Rect | null;
  transform: string;
  viewport: {
    height: number;
    width: number;
  };
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

const waitForDoubleAnimationFrame = () => browser.execute(async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const waitForTransientNotificationsToSettle = () => browser.waitUntil(
  async () => browser.execute(() => (
    document.querySelector('.notification-item') === null
  )),
  {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: 'Transient notifications obscured the mini-chat screenshot',
  },
);

const openSettingsScene = async () => {
  await browser.execute(() => {
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: 'settings' },
    }));
  });
  await $('.void-settings-scene').waitForDisplayed({ timeout: 15_000 });
  await $('.void-fmc__button').waitForDisplayed({ timeout: 10_000 });
};

const waitForFloatingGeometry = (
  state: 'closed' | 'open',
) => browser.waitUntil(async () => browser.execute((expectedState) => {
  const root = document.querySelector<HTMLElement>('.void-fmc');
  const button = document.querySelector<HTMLElement>('.void-fmc__button');
  const panel = document.querySelector<HTMLElement>('.void-fmc__panel');
  if (!root || !button || !panel) return false;

  if (expectedState === 'open') {
    return (
      root.classList.contains('void-fmc--open')
      && panel.classList.contains('void-fmc__panel--open')
      && getComputedStyle(panel).transform === 'none'
    );
  }

  const buttonRight = button.getBoundingClientRect().right;
  return (
    !root.classList.contains('void-fmc--open')
    && Math.abs(buttonRight - window.innerWidth) <= 1.5
  );
}, state), {
  timeout: 5_000,
  interval: 50,
  timeoutMsg: `Floating mini chat ${state} geometry did not settle`,
});

const readFloatingEvidence = (): Promise<FloatingEvidence> =>
  browser.execute(() => {
    const root = document.querySelector<HTMLElement>('.void-fmc');
    const button = document.querySelector<HTMLElement>('.void-fmc__button');
    const panel = document.querySelector<HTMLElement>('.void-fmc__panel');
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const visibleRows = Array.from(
      document.querySelectorAll<HTMLElement>('.void-config-page-row'),
    ).filter((row) => row.checkVisibility());
    const buttonRect = button?.getBoundingClientRect() ?? null;
    const intersects = (first: DOMRect, second: DOMRect) => (
      first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top
    );
    const probe = document.createElement('span');
    probe.style.background = 'var(--workspace-surface-raised)';
    probe.style.position = 'fixed';
    probe.style.pointerEvents = 'none';
    (root ?? document.body).appendChild(probe);
    const raisedSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();

    return {
      background: panelStyle?.backgroundColor ?? '',
      backgroundImage: panelStyle?.backgroundImage ?? '',
      button: buttonRect ? {
        bottom: buttonRect.bottom,
        height: buttonRect.height,
        left: buttonRect.left,
        right: buttonRect.right,
        top: buttonRect.top,
        width: buttonRect.width,
      } : null,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      intersectingVisibleConfigRows: buttonRect
        ? visibleRows
          .map((row) => row.getBoundingClientRect())
          .filter((rowRect) => intersects(buttonRect, rowRect))
          .map((rowRect) => ({
            bottom: rowRect.bottom,
            height: rowRect.height,
            left: rowRect.left,
            right: rowRect.right,
            top: rowRect.top,
            width: rowRect.width,
          }))
        : [],
      panel: panel ? {
        bottom: panel.getBoundingClientRect().bottom,
        height: panel.getBoundingClientRect().height,
        left: panel.getBoundingClientRect().left,
        right: panel.getBoundingClientRect().right,
        top: panel.getBoundingClientRect().top,
        width: panel.getBoundingClientRect().width,
      } : null,
      panelClientWidth: panel?.clientWidth ?? 0,
      panelScrollWidth: panel?.scrollWidth ?? 0,
      presentation: document
        .querySelector('[data-testid="app-layout"]')
        ?.getAttribute('data-ui-presentation') ?? null,
      raisedSurface,
      root: root ? {
        bottom: root.getBoundingClientRect().bottom,
        height: root.getBoundingClientRect().height,
        left: root.getBoundingClientRect().left,
        right: root.getBoundingClientRect().right,
        top: root.getBoundingClientRect().top,
        width: root.getBoundingClientRect().width,
      } : null,
      transform: panelStyle?.transform ?? '',
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    };
  });

const expectClosedMinimalLauncher = (evidence: FloatingEvidence) => {
  expect(evidence.presentation).toBe('minimal');
  expect(evidence.button).not.toBeNull();
  expect(evidence.button?.width ?? 0).toBeGreaterThanOrEqual(24.5);
  expect(evidence.button?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(25.5);
  expect(evidence.button?.height ?? 0).toBeGreaterThanOrEqual(39.5);
  expect(
    Math.abs((evidence.button?.right ?? 0) - evidence.viewport.width),
  ).toBeLessThanOrEqual(1.5);
  expect(evidence.intersectingVisibleConfigRows).toEqual([]);
  expect(evidence.documentScrollWidth)
    .toBeLessThanOrEqual(evidence.documentClientWidth + 1);
};

const expectOpenMinimalPanel = (evidence: FloatingEvidence) => {
  expect(evidence.presentation).toBe('minimal');
  expect(evidence.panel).not.toBeNull();
  expect(evidence.panel?.left ?? -1).toBeGreaterThanOrEqual(7);
  expect(evidence.panel?.top ?? -1).toBeGreaterThanOrEqual(7);
  expect(evidence.panel?.right ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(evidence.viewport.width - 7);
  expect(evidence.panel?.bottom ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(evidence.viewport.height - 7);
  expect(evidence.transform).toBe('none');
  expect(evidence.backgroundImage).toBe('none');
  expect(evidence.background).toBe(evidence.raisedSurface);
  expect(evidence.panelScrollWidth)
    .toBeLessThanOrEqual(evidence.panelClientWidth + 1);
  expect(evidence.documentScrollWidth)
    .toBeLessThanOrEqual(evidence.documentClientWidth + 1);
};

describe('L0 minimal floating mini chat visual contract', () => {
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
    it(`keeps the ${themeType} launcher quiet and panel bounded`, async () => {
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
        timeoutMsg: `${themeId} minimal workspace did not settle`,
      });

      await openSettingsScene();
      await waitForTransientNotificationsToSettle();
      await waitForFloatingGeometry('closed');
      await waitForDoubleAnimationFrame();
      expectClosedMinimalLauncher(await readFloatingEvidence());
      await saveScreenshot(`fmc-settings-${themeType}-closed`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice13-minimal',
      });

      const trigger = await $('.void-fmc__button');
      await trigger.waitForClickable({ timeout: 5_000 });
      await trigger.click();
      await browser.waitUntil(async () => browser.execute(() => (
        document.querySelector('.void-fmc')?.classList.contains(
          'void-fmc--open',
        ) === true
        && document.querySelector('.void-fmc__panel')?.classList.contains(
          'void-fmc__panel--open',
        ) === true
      )), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Floating mini chat did not open after the real click',
      });
      await waitForFloatingGeometry('open');
      await waitForTransientNotificationsToSettle();
      await waitForDoubleAnimationFrame();
      expectOpenMinimalPanel(await readFloatingEvidence());
      await saveScreenshot(`fmc-settings-${themeType}-open`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice13-minimal',
      });

      const close = await $('.void-fmc__header-btn--close');
      await close.waitForClickable({ timeout: 5_000 });
      await close.click();
      await browser.waitUntil(async () => browser.execute(() => (
        document.querySelector('.void-fmc')?.classList.contains(
          'void-fmc--open',
        ) === false
      )), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Floating mini chat did not close after the real click',
      });
      await trigger.waitForDisplayed({ timeout: 5_000 });
      await waitForFloatingGeometry('closed');
      expectClosedMinimalLauncher(await readFloatingEvidence());
    });
  }

  it('leaves the Classic 44px launcher inset and unchanged', async () => {
    const target = new URL(sourceUrl);
    target.searchParams.set('void-ui', 'classic');
    await browser.url(target.toString());
    await browser.waitUntil(async () => browser.execute(() => (
      document
        .querySelector('[data-testid="app-layout"]')
        ?.getAttribute('data-ui-presentation') === 'classic'
      && !document.querySelector('.splash-screen')
    )), {
      timeout: 20_000,
      interval: 100,
      timeoutMsg: 'Classic workspace did not settle',
    });

    await openSettingsScene();
    await waitForDoubleAnimationFrame();
    const classic = await readFloatingEvidence();
    expect(classic.presentation).toBe('classic');
    expect(classic.button?.width).toBe(44);
    expect(classic.button?.height).toBe(44);
    expect(classic.viewport.width - (classic.button?.right ?? 0))
      .toBeGreaterThanOrEqual(27);
  });

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
      const restoredTheme = await readThemeSelection();
      if (restoredTheme !== originalThemeSelection) {
        throw new Error(
          `expected ${originalThemeSelection}, received ${String(restoredTheme)}`,
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
        `Floating mini chat cleanup failed:\n${cleanupFailures.join('\n')}`,
      );
    }
  });
});
