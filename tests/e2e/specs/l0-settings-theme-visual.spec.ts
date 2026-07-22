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

type FocusEvidence = {
  activeClassName: string;
  activeIsTarget: boolean;
  activeMatchesFocusVisible: boolean;
  activeOutlineColor: string;
  activeOutlineStyle: string;
  activeOutlineWidth: string;
  controlFocusRing: string;
  inactiveOutlineWidth: string;
  pressedSignature: string;
};

type AppearanceEvidence = {
  documentClientWidth: number;
  documentScrollWidth: number;
  fontButtonCount: number;
  pressedCount: number;
  previewBackground: string;
  previewColor: string;
  rootClientWidth: number;
  rootScrollWidth: number;
  secondaryBackground: string;
  secondaryText: string;
  theme: string | null;
  themeType: string | null;
};

type ReviewEvidence = {
  configPanelClientWidth: number;
  controlActive: string;
  controlBackground: string;
  controlHover: string;
  documentClientWidth: number;
  documentScrollWidth: number;
  optionCount: number;
  optionTops: number[];
  rootClientWidth: number;
  rootScrollWidth: number;
  selectedBackground: string;
  selectedBorder: string;
  selectedCount: number;
  theme: string | null;
  themeType: string | null;
  unselectedBackground: string;
  strategyClientWidth: number;
  strategyScrollWidth: number;
};

type SettingsNavDensityEvidence = {
  acpBottom: number;
  acpHeight: number;
  acpTop: number;
  categoryHeaderHeights: number[];
  footerTop: number;
  itemHeights: number[];
  mcpBottom: number;
  mcpHeight: number;
  mcpTop: number;
  overflowY: string;
  sectionsBottom: number;
  sectionsTop: number;
  scrollTop: number;
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
    timeoutMsg: 'Transient notifications obscured the Settings screenshot',
  },
);

const prepareUnfocusedSettingsScreenshot = () => browser.execute(() => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
  document.querySelector<HTMLElement>('.void-config-page-layout')
    ?.scrollTo({ top: 0, behavior: 'instant' });
});

const openSettingsScene = async (
  presentation: 'minimal' | 'classic' = 'minimal',
) => {
  await browser.execute(() => {
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: 'settings' },
    }));
  });

  await $('.void-settings-scene').waitForDisplayed({ timeout: 15_000 });
  await $('.void-settings-nav').waitForDisplayed({ timeout: 15_000 });
  const trigger = await $('.void-settings-nav__search-trigger');
  const input = await $('.void-settings-nav__search-field input');
  if (presentation === 'minimal') {
    await trigger.waitForDisplayed({ timeout: 10_000 });
    await input.waitForDisplayed({ timeout: 10_000, reverse: true });
  } else {
    await trigger.waitForDisplayed({ timeout: 10_000, reverse: true });
    await input.waitForDisplayed({ timeout: 10_000 });
  }
};

const readSettingsNavDensityEvidence = (): Promise<SettingsNavDensityEvidence> =>
  browser.execute(() => {
    const sections = document.querySelector<HTMLElement>(
      '.void-settings-nav__sections',
    );
    const categories = Array.from(
      document.querySelectorAll<HTMLElement>('.void-settings-nav__category'),
    );
    const smartItems = Array.from(
      categories[1]?.querySelectorAll<HTMLElement>(
        '.void-settings-nav__item',
      ) ?? [],
    );
    const mcp = smartItems.at(-2);
    const acp = smartItems.at(-1);
    const footer = document.querySelector<HTMLElement>(
      '.void-nav-panel__footer',
    );
    const sectionRect = sections?.getBoundingClientRect();
    const mcpRect = mcp?.getBoundingClientRect();
    const acpRect = acp?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();

    return {
      acpBottom: acpRect?.bottom ?? 0,
      acpHeight: acpRect?.height ?? 0,
      acpTop: acpRect?.top ?? 0,
      categoryHeaderHeights: Array.from(
        document.querySelectorAll<HTMLElement>(
          '.void-settings-nav__category-header',
        ),
      ).map((header) => header.getBoundingClientRect().height),
      footerTop: footerRect?.top ?? 0,
      itemHeights: Array.from(
        document.querySelectorAll<HTMLElement>('.void-settings-nav__item'),
      ).map((item) => item.getBoundingClientRect().height),
      mcpBottom: mcpRect?.bottom ?? 0,
      mcpHeight: mcpRect?.height ?? 0,
      mcpTop: mcpRect?.top ?? 0,
      overflowY: sections ? getComputedStyle(sections).overflowY : '',
      sectionsBottom: sectionRect?.bottom ?? 0,
      sectionsTop: sectionRect?.top ?? 0,
      scrollTop: sections?.scrollTop ?? -1,
    };
  });

const openMinimalSettingsSearch = async () => {
  const trigger = await $('.void-settings-nav__search-trigger');
  expect(await trigger.getAttribute('aria-expanded')).toBe('false');
  await trigger.waitForClickable({ timeout: 5_000 });
  await trigger.click();

  const input = await $('.void-settings-nav__search-field input');
  await input.waitForDisplayed({ timeout: 5_000 });
  await input.waitForEnabled({ timeout: 5_000 });
  await browser.waitUntil(async () => browser.execute(() => (
    document.activeElement?.matches(
      '.void-settings-nav__search-field input',
    ) === true
  )), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: 'Minimal Settings search input did not receive focus',
  });
  expect(await trigger.getAttribute('aria-expanded')).toBe('true');
  const prefixDisplay = await browser.execute(() => {
    const prefix = document.querySelector<HTMLElement>(
      '.void-settings-nav__search-field.search .search__prefix',
    );
    return prefix ? getComputedStyle(prefix).display : '';
  });
  expect(prefixDisplay).toBe('none');
  return { input, trigger };
};

const verifyMinimalSearchKeyboardContract = async (
  themeType: 'dark' | 'light',
) => {
  let { input, trigger } = await openMinimalSettingsSearch();
  await trigger.click();
  await input.waitForDisplayed({ timeout: 5_000, reverse: true });
  await browser.waitUntil(async () => browser.execute(() => (
    document.activeElement?.matches(
      '.void-settings-nav__search-trigger',
    ) === true
  )), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: 'Second trigger click did not close and restore focus',
  });
  expect(await trigger.getAttribute('aria-expanded')).toBe('false');

  ({ input, trigger } = await openMinimalSettingsSearch());
  await input.setValue('typography');
  await $('#settings-nav-result-appearance').waitForDisplayed({
    timeout: 10_000,
  });

  await saveElementScreenshot(
    '.void-settings-nav',
    `settings-search-${themeType}-open`,
    {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice12-minimal',
    },
  );

  await browser.keys(['Escape']);
  await browser.waitUntil(async () => (
    (await input.getValue()) === ''
    && (await trigger.getAttribute('aria-expanded')) === 'true'
    && await input.isDisplayed()
  ), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: 'First Escape did not clear and retain compact search',
  });

  await browser.keys(['Escape']);
  await input.waitForDisplayed({ timeout: 5_000, reverse: true });
  await browser.waitUntil(async () => browser.execute(() => (
    document.activeElement?.matches(
      '.void-settings-nav__search-trigger',
    ) === true
  )), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: 'Second Escape did not restore compact search trigger focus',
  });
  expect(await trigger.getAttribute('aria-expanded')).toBe('false');
};

const openSettingsSearchResult = async (
  query: string,
  resultId: 'appearance' | 'review',
  contentSelector: string,
) => {
  const { input: searchInput, trigger } = await openMinimalSettingsSearch();
  await searchInput.setValue(query);

  const result = await $(`#settings-nav-result-${resultId}`);
  await result.waitForClickable({ timeout: 10_000 });
  await result.click();

  await $(contentSelector).waitForDisplayed({ timeout: 20_000 });
  await searchInput.waitForDisplayed({ timeout: 5_000, reverse: true });
  await browser.waitUntil(async () => browser.execute(
    (expectedResultId, expectedContentSelector) => (
      !document.querySelector('#settings-nav-results[role="listbox"]')
      && Boolean(document.querySelector(expectedContentSelector))
      && document
        .querySelector(`#settings-nav-result-${expectedResultId}`)
        === null
      && document.activeElement?.matches(
        '.void-settings-nav__search-trigger',
      ) === true
    ),
    resultId,
    contentSelector,
  ), {
    timeout: 5_000,
    interval: 100,
    timeoutMsg: `${resultId} did not leave settings search mode`,
  });
  expect(await trigger.getAttribute('aria-expanded')).toBe('false');
  await waitForDoubleAnimationFrame();
};

const readAppearanceEvidence = (): Promise<AppearanceEvidence> =>
  browser.execute(() => {
    const root = document.documentElement;
    const appearance = document.querySelector<HTMLElement>(
      '.void-appearance-config',
    );
    const preview = document.querySelector<HTMLElement>(
      '.font-pref-panel__preview',
    );
    const fontButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.font-pref-panel__level-btn',
      ),
    );
    const resolveBackground = (token: string): string => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${token})`;
      probe.style.position = 'fixed';
      probe.style.pointerEvents = 'none';
      (appearance ?? document.body).appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    };
    const resolveColor = (token: string): string => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      probe.style.position = 'fixed';
      probe.style.pointerEvents = 'none';
      (appearance ?? document.body).appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };

    return {
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      fontButtonCount: fontButtons.length,
      pressedCount: fontButtons.filter(
        (button) => button.getAttribute('aria-pressed') === 'true',
      ).length,
      previewBackground: preview ? getComputedStyle(preview).backgroundColor : '',
      previewColor: preview ? getComputedStyle(preview).color : '',
      rootClientWidth: appearance?.clientWidth ?? 0,
      rootScrollWidth: appearance?.scrollWidth ?? 0,
      secondaryBackground: resolveBackground('--color-bg-secondary'),
      secondaryText: resolveColor('--color-text-secondary'),
      theme: root.getAttribute('data-theme'),
      themeType: root.getAttribute('data-theme-type'),
    };
  });

const readReviewEvidence = (): Promise<ReviewEvidence> =>
  browser.execute(() => {
    const root = document.documentElement;
    const review = document.querySelector<HTMLElement>('.review-config');
    const configPanel = document.querySelector<HTMLElement>(
      '.void-config-page-layout',
    );
    const strategyOptions = document.querySelector<HTMLElement>(
      '.review-config__strategy-options',
    );
    const options = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.review-config__strategy-option',
      ),
    );
    const selected = options.find(
      (option) => option.getAttribute('aria-pressed') === 'true',
    );
    const unselected = options.find(
      (option) => option.getAttribute('aria-pressed') !== 'true',
    );
    const resolveBackground = (token: string): string => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${token})`;
      probe.style.position = 'fixed';
      probe.style.pointerEvents = 'none';
      (review ?? document.body).appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    };

    return {
      configPanelClientWidth: configPanel?.clientWidth ?? 0,
      controlActive: resolveBackground('--control-bg-active'),
      controlBackground: resolveBackground('--control-bg'),
      controlHover: resolveBackground('--control-bg-hover'),
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      optionCount: options.length,
      optionTops: options.map(
        (option) => Math.round(option.getBoundingClientRect().top),
      ),
      rootClientWidth: review?.clientWidth ?? 0,
      rootScrollWidth: review?.scrollWidth ?? 0,
      selectedBackground: selected
        ? getComputedStyle(selected).backgroundColor
        : '',
      selectedBorder: selected ? getComputedStyle(selected).borderColor : '',
      selectedCount: options.filter(
        (option) => option.getAttribute('aria-pressed') === 'true',
      ).length,
      theme: root.getAttribute('data-theme'),
      themeType: root.getAttribute('data-theme-type'),
      unselectedBackground: unselected
        ? getComputedStyle(unselected).backgroundColor
        : '',
      strategyClientWidth: strategyOptions?.clientWidth ?? 0,
      strategyScrollWidth: strategyOptions?.scrollWidth ?? 0,
    };
  });

const readFocusEvidence = (
  selector: string,
): Promise<FocusEvidence> => browser.execute((buttonSelector) => {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(buttonSelector),
  );
  const active = document.activeElement as HTMLElement | null;
  const activeStyle = active ? getComputedStyle(active) : null;
  const inactive = buttons.find((button) => button !== active);
  const inactiveStyle = inactive ? getComputedStyle(inactive) : null;
  const probe = document.createElement('span');
  probe.style.color = 'var(--control-focus-ring)';
  probe.style.position = 'fixed';
  probe.style.pointerEvents = 'none';
  (active ?? document.body).appendChild(probe);
  const controlFocusRing = getComputedStyle(probe).color;
  probe.remove();

  return {
    activeClassName: active?.className ?? '',
    activeIsTarget: active?.matches(buttonSelector) ?? false,
    activeMatchesFocusVisible: active?.matches(':focus-visible') ?? false,
    activeOutlineColor: activeStyle?.outlineColor ?? '',
    activeOutlineStyle: activeStyle?.outlineStyle ?? '',
    activeOutlineWidth: activeStyle?.outlineWidth ?? '',
    controlFocusRing,
    inactiveOutlineWidth: inactiveStyle?.outlineWidth ?? '',
    pressedSignature: buttons
      .map((button) => button.getAttribute('aria-pressed'))
      .join('|'),
  };
}, selector);

const focusTargetWithKeyboard = async (
  selector: string,
): Promise<FocusEvidence> => {
  const beforeSignature = await browser.execute((buttonSelector) => (
    Array.from(document.querySelectorAll<HTMLButtonElement>(buttonSelector))
      .map((button) => button.getAttribute('aria-pressed'))
      .join('|')
  ), selector);

  const startsAtRestoredTrigger = await browser.execute(() => (
    document.activeElement?.matches(
      '.void-settings-nav__search-trigger',
    ) === true
  ));
  expect(startsAtRestoredTrigger).toBe(true);

  const maxTabPresses = await browser.execute(() => {
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(
      document.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => element.checkVisibility()).length + 2;
  });

  let reachedTarget = false;
  for (let attempt = 0; attempt < maxTabPresses; attempt += 1) {
    await browser.keys(['Shift', 'Tab']);
    reachedTarget = await browser.execute((buttonSelector) => (
      document.activeElement?.matches(buttonSelector) === true
    ), selector);
    if (reachedTarget) break;
  }
  expect(reachedTarget).toBe(true);

  await waitForDoubleAnimationFrame();
  const evidence = await readFocusEvidence(selector);
  expect(evidence.pressedSignature).toBe(beforeSignature);
  expect(evidence.activeClassName).toContain(
    selector.includes('strategy')
      ? 'review-config__strategy-option'
      : 'font-pref-panel__level-btn',
  );
  expect(evidence.activeIsTarget).toBe(true);
  // WebView2's embedded WebDriver can move focus with synthetic Shift+Tab
  // without updating its :focus-visible input modality. When it does expose
  // the pseudo-class, the real computed 2px ring remains a required contract;
  // the static visual contract covers the selector in both cases.
  if (evidence.activeMatchesFocusVisible) {
    expect(evidence.activeOutlineWidth).toBe('2px');
    expect(evidence.activeOutlineStyle).toBe('solid');
    expect(evidence.activeOutlineColor.length).toBeGreaterThan(0);
    expect(evidence.activeOutlineColor).not.toBe('rgba(0, 0, 0, 0)');
  }
  expect(evidence.controlFocusRing.length).toBeGreaterThan(0);
  expect(evidence.inactiveOutlineWidth).not.toBe('2px');
  return evidence;
};

describe('L0 real settings theme visual contract', () => {
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
    it(`keeps typography and review controls canonical in ${themeType} mode`, async () => {
      await writeThemeSelection(themeId);
      await browser.setWindowSize(1280, 800);

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
        timeoutMsg: `${themeId} did not settle before settings visual capture`,
      });

      await openSettingsScene();
      await prepareUnfocusedSettingsScreenshot();

      const navDensity = await readSettingsNavDensityEvidence();
      expect(navDensity.scrollTop).toBe(0);
      expect(navDensity.overflowY).toBe('auto');
      expect(navDensity.itemHeights.length).toBe(12);
      expect(navDensity.itemHeights.every(
        (height) => Math.abs(height - 28) <= 0.5,
      )).toBe(true);
      expect(navDensity.categoryHeaderHeights.length).toBe(3);
      expect(navDensity.categoryHeaderHeights.every(
        (height) => Math.abs(height - 20) <= 0.5,
      )).toBe(true);
      expect(navDensity.sectionsBottom)
        .toBeLessThanOrEqual(navDensity.footerTop + 0.5);
      for (const [top, bottom, height] of [
        [navDensity.mcpTop, navDensity.mcpBottom, navDensity.mcpHeight],
        [navDensity.acpTop, navDensity.acpBottom, navDensity.acpHeight],
      ]) {
        expect(height).toBeGreaterThan(0);
        expect(top).toBeGreaterThanOrEqual(navDensity.sectionsTop);
        expect(bottom).toBeLessThanOrEqual(navDensity.footerTop - 4);
      }

      await saveElementScreenshot(
        '.void-nav-panel',
        `settings-nav-${themeType}-compact`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice14-minimal',
        },
      );
      await saveScreenshot(`settings-default-${themeType}-closed`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice12-minimal',
      });
      await verifyMinimalSearchKeyboardContract(themeType);
      await openSettingsSearchResult(
        'typography',
        'appearance',
        '.void-appearance-config',
      );

      const appearance = await readAppearanceEvidence();
      expect(appearance.theme).toBe(themeId);
      expect(appearance.themeType).toBe(themeType);
      expect(appearance.fontButtonCount).toBe(6);
      expect(appearance.pressedCount).toBe(1);
      expect(appearance.previewBackground).toBe(appearance.secondaryBackground);
      expect(appearance.previewColor).toBe(appearance.secondaryText);
      expect(appearance.rootClientWidth).toBeGreaterThan(0);
      expect(appearance.rootScrollWidth)
        .toBeLessThanOrEqual(appearance.rootClientWidth + 1);
      expect(appearance.documentScrollWidth)
        .toBeLessThanOrEqual(appearance.documentClientWidth + 1);

      await focusTargetWithKeyboard('.font-pref-panel__level-btn');
      await browser.execute(() => {
        document
          .querySelector<HTMLElement>('.font-pref-panel__row--ui')
          ?.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
      await waitForDoubleAnimationFrame();
      await saveElementScreenshot(
        '.font-pref-panel__row--ui',
        `settings-appearance-${themeType}-font-row`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice12-minimal',
        },
      );
      await prepareUnfocusedSettingsScreenshot();
      await waitForDoubleAnimationFrame();
      await saveScreenshot(`settings-appearance-${themeType}`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice12-minimal',
      });

      await browser.setWindowSize(1600, 900);
      await waitForDoubleAnimationFrame();
      await openSettingsSearchResult(
        'deep review',
        'review',
        '.review-config__strategy-options',
      );

      const review = await readReviewEvidence();
      expect(review.theme).toBe(themeId);
      expect(review.themeType).toBe(themeType);
      expect(review.optionCount).toBe(3);
      expect(review.configPanelClientWidth).toBeGreaterThan(640);
      expect(review.optionTops).toHaveLength(3);
      expect(
        Math.max(...review.optionTops) - Math.min(...review.optionTops),
      ).toBeLessThanOrEqual(1);
      expect(review.selectedCount).toBe(1);
      expect(review.selectedBackground).toBe(review.controlActive);
      expect(review.unselectedBackground).toBe(review.controlBackground);
      expect(review.controlHover).not.toBe(review.controlBackground);
      expect(review.controlHover).not.toBe(review.controlActive);
      expect(review.selectedBorder).not.toBe('rgba(0, 0, 0, 0)');
      expect(review.rootClientWidth).toBeGreaterThan(0);
      expect(review.rootScrollWidth)
        .toBeLessThanOrEqual(review.rootClientWidth + 1);
      expect(review.strategyClientWidth).toBeGreaterThan(0);
      expect(review.strategyScrollWidth)
        .toBeLessThanOrEqual(review.strategyClientWidth + 1);
      expect(review.documentScrollWidth)
        .toBeLessThanOrEqual(review.documentClientWidth + 1);

      await focusTargetWithKeyboard('.review-config__strategy-option');
      await saveElementScreenshot(
        '.review-config__strategy-options',
        `settings-review-${themeType}-strategy-options`,
        {
          directory: screenshotDirectory,
          includeTimestamp: false,
          prefix: 'slice12-minimal',
        },
      );
      await waitForTransientNotificationsToSettle();
      await prepareUnfocusedSettingsScreenshot();
      await waitForDoubleAnimationFrame();
      await saveScreenshot(`settings-review-${themeType}`, {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice12-minimal',
      });
    });
  }

  it('keeps Classic search visible after Escape and result navigation', async () => {
    await browser.setWindowSize(1280, 800);
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
      timeoutMsg: 'Classic presentation did not settle before Settings parity',
    });

    await openSettingsScene('classic');
    const input = await $('.void-settings-nav__search-field input');
    await input.click();
    await input.setValue('typography');
    await $('#settings-nav-result-appearance').waitForDisplayed({
      timeout: 10_000,
    });
    await browser.keys(['Escape']);
    await browser.waitUntil(async () => (
      await input.isDisplayed()
      && (await input.getValue()) === ''
    ), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Classic Escape did not retain the visible search field',
    });

    await input.setValue('typography');
    const result = await $('#settings-nav-result-appearance');
    await result.waitForClickable({ timeout: 10_000 });
    await result.click();
    await $('.void-appearance-config').waitForDisplayed({ timeout: 20_000 });
    await browser.waitUntil(async () => browser.execute(() => (
      document.activeElement?.matches(
        '.void-settings-nav__search-field input',
      ) === true
      && Boolean(document.querySelector(
        '.void-settings-nav__search-field input',
      )?.checkVisibility())
      && !document.querySelector('#settings-nav-results[role="listbox"]')
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Classic result navigation did not retain visible search focus',
    });
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
        `Settings theme visual contract cleanup failed:\n${cleanupFailures.join('\n')}`,
      );
    }
  });
});
