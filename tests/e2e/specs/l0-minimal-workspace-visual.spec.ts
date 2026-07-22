import { browser, expect, $ } from '@wdio/globals';
import * as path from 'node:path';
import { saveElementScreenshot, saveScreenshot } from '../helpers/screenshot-utils';
import { openWorkspace } from '../helpers/workspace-helper';

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

type WorkspacePresentation = 'classic' | 'minimal';

const navigateToPresentation = async (
  sourceUrl: string,
  presentation: WorkspacePresentation,
) => {
  const target = new URL(sourceUrl);
  target.searchParams.set('void-ui', presentation);
  await browser.url(target.toString());
  await browser.waitUntil(async () => browser.execute((expected) => (
    document.querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === expected
  ), presentation), {
    timeout: 15_000,
    interval: 100,
    timeoutMsg: `${presentation} workspace presentation did not activate`,
  });
};

const waitForSplashToExit = async () => {
  await browser.waitUntil(async () => browser.execute(() => (
    !document.querySelector('.splash-screen')
  )), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: 'Startup splash did not leave the DOM before visual capture',
  });
};

const readNavSearchPlacement = () => browser.execute(() => {
  const navigation = document.querySelector<HTMLElement>('.void-nav-panel');
  const sessionCreate = document.querySelector<HTMLElement>(
    '.void-nav-panel__session-create',
  );
  const sessionModeSwitch = document.querySelector<HTMLElement>(
    '.void-nav-panel__session-mode-switch',
  );
  const sessionModeOptions = Array.from(
    document.querySelectorAll<HTMLElement>('.void-nav-panel__session-mode-option'),
  );
  const sessionModeMenuTrigger = document.querySelector<HTMLElement>(
    '.void-nav-panel__session-mode-menu-trigger',
  );
  const sessionCreateFooter = document.querySelector<HTMLElement>(
    '.void-nav-panel__session-create-footer',
  );
  const createAction = document.querySelector<HTMLElement>(
    '.void-nav-panel__session-create-action',
  );
  const createActionMode = document.querySelector<HTMLElement>(
    '.void-nav-panel__session-create-action-mode',
  );
  const createActionIcon = createAction?.querySelector<SVGElement>(
    ':scope > .void-nav-panel__session-create-action-icon',
  ) ?? null;
  const createActionArrow = createAction?.querySelector<SVGElement>(
    ':scope > svg:not(.void-nav-panel__session-create-action-icon)',
  ) ?? null;
  const searchTrigger = document.querySelector<HTMLElement>(
    '.void-nav-panel__search-trigger',
  );
  const searchLabel = document.querySelector<HTMLElement>(
    '.void-nav-panel__search-trigger__label',
  );
  const topActionIconSlots = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.void-nav-panel__top-action-icon-slot',
    ),
  );
  const expandDefaultIcon = document.querySelector<HTMLElement>(
    '.void-nav-panel__top-action-expand-icon-default',
  );
  const expandChevron = document.querySelector<HTMLElement>(
    '.void-nav-panel__top-action-expand-icon-chevron',
  );
  const topActionButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.void-nav-panel__top-action-btn',
    ),
  );
  const footer = document.querySelector<HTMLElement>(
    '.void-nav-panel__footer',
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
  const overlaps = (
    first: ReturnType<typeof rectOf>,
    second: ReturnType<typeof rectOf>,
  ) => Boolean(
    first
    && second
    && first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top
  );

  const navigationRect = rectOf(navigation);
  const sessionCreateRect = rectOf(sessionCreate);
  const sessionModeSwitchRect = rectOf(sessionModeSwitch);
  const sessionCreateFooterRect = rectOf(sessionCreateFooter);
  const createActionRect = rectOf(createAction);
  const sessionModeMenuTriggerRect = rectOf(sessionModeMenuTrigger);
  const searchTriggerRect = rectOf(searchTrigger);
  const footerRect = rectOf(footer);
  const sessionCreateStyle = sessionCreate ? getComputedStyle(sessionCreate) : null;
  const createActionModeStyle = createActionMode ? getComputedStyle(createActionMode) : null;
  const createActionIconStyle = createActionIcon ? getComputedStyle(createActionIcon) : null;
  const createActionArrowStyle = createActionArrow ? getComputedStyle(createActionArrow) : null;
  const searchLabelStyle = searchLabel ? getComputedStyle(searchLabel) : null;
  const expandDefaultIconStyle = expandDefaultIcon
    ? getComputedStyle(expandDefaultIcon)
    : null;
  const expandChevronStyle = expandChevron ? getComputedStyle(expandChevron) : null;
  const sessionIconProbe = (() => {
    if (!navigation) return null;
    const row = document.createElement('div');
    row.className = 'void-nav-panel__inline-item';
    row.style.position = 'fixed';
    row.style.left = '-1000px';
    row.style.top = '0';

    const passiveIcon = document.createElement('span');
    passiveIcon.className = 'void-nav-panel__inline-item-icon is-code';
    passiveIcon.style.transition = 'none';
    const runningIcon = document.createElement('span');
    runningIcon.className = 'void-nav-panel__inline-item-icon is-running';
    runningIcon.style.transition = 'none';
    const attentionDot = document.createElement('span');
    attentionDot.className = 'void-nav-panel__inline-item-unread-dot';
    row.append(passiveIcon, runningIcon, attentionDot);
    navigation.appendChild(row);

    const idleOpacity = getComputedStyle(passiveIcon).opacity;
    row.classList.add('is-active');
    const activeOpacity = getComputedStyle(passiveIcon).opacity;
    const runningOpacity = getComputedStyle(runningIcon).opacity;
    const attentionStyle = getComputedStyle(attentionDot);
    const result = {
      idleOpacity,
      activeOpacity,
      runningOpacity,
      attentionVisible:
        attentionStyle.display !== 'none'
        && Number.parseFloat(attentionStyle.opacity) > 0,
    };
    row.remove();
    return result;
  })();

  return {
    theme: document.documentElement.getAttribute('data-theme'),
    presentation: document.querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') ?? null,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentScrollWidth: document.documentElement.scrollWidth,
    navigation: navigationRect,
    brandHeaderCount: document.querySelectorAll(
      '.void-nav-panel__brand-header',
    ).length,
    searchTriggerCount: document.querySelectorAll(
      '.void-nav-panel__search-trigger',
    ).length,
    inlineSlotCount: document.querySelectorAll(
      '.void-nav-panel__session-search-slot',
    ).length,
    searchInsideRadioGroup: Boolean(searchTrigger?.closest('[role="radiogroup"]')),
    searchOverlapsCreateAction: overlaps(searchTriggerRect, createActionRect),
    sessionCreateTopGap: navigationRect && sessionCreateRect
      ? sessionCreateRect.top - navigationRect.top
      : null,
    sessionCreate: sessionCreateRect,
    sessionModeSwitch: sessionModeSwitchRect,
    sessionModeMenuTrigger: sessionModeMenuTriggerRect,
    sessionModeMenuExpanded: sessionModeMenuTrigger?.getAttribute('aria-expanded') ?? null,
    sessionCreateFooter: sessionCreateFooterRect,
    sessionModeOptions: sessionModeOptions.map((option) => {
      const label = option.querySelector<HTMLElement>('span');
      const labelStyle = label ? getComputedStyle(label) : null;
      return {
        rect: rectOf(option),
        ariaChecked: option.getAttribute('aria-checked'),
        labelDisplay: labelStyle?.display ?? null,
      };
    }),
    sessionModeOptionIconCount: sessionModeOptions.reduce(
      (count, option) => count + option.querySelectorAll('svg').length,
      0,
    ),
    sessionCreateStyle: sessionCreateStyle
      ? {
          backgroundColor: sessionCreateStyle.backgroundColor,
          borderTopWidth: sessionCreateStyle.borderTopWidth,
          borderRadius: sessionCreateStyle.borderRadius,
          display: sessionCreateStyle.display,
        }
      : null,
    createActionModeDisplay: createActionModeStyle?.display ?? null,
    createActionIconDisplay: createActionIconStyle?.display ?? null,
    createActionArrowDisplay: createActionArrowStyle?.display ?? null,
    sessionCreateButtonCount: sessionCreate?.querySelectorAll('button').length ?? 0,
    searchTrigger: searchTriggerRect,
    createAction: createActionRect,
    searchLabel: searchLabel
      ? {
          display: searchLabelStyle?.display ?? '',
          width: searchLabel.getBoundingClientRect().width,
        }
      : null,
    topActionIconDisplays: topActionIconSlots.map(
      (icon) => getComputedStyle(icon).display,
    ),
    topActionHeights: topActionButtons.map(
      (button) => button.getBoundingClientRect().height,
    ),
    footer: footerRect,
    footerDisplay: footer ? getComputedStyle(footer).display : null,
    sessionIconProbe,
    expandDefaultIcon: expandDefaultIconStyle
      ? {
          display: expandDefaultIconStyle.display,
          opacity: expandDefaultIconStyle.opacity,
        }
      : null,
    expandChevron: expandChevronStyle
      ? {
          display: expandChevronStyle.display,
          opacity: expandChevronStyle.opacity,
        }
      : null,
  };
});

const readActiveFocusStyle = () => browser.execute(() => {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return null;
  const style = getComputedStyle(active);
  return {
    className: active.className,
    ariaLabel: active.getAttribute('aria-label'),
    focusVisible: active.matches(':focus-visible'),
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
  };
});

const readMinimalFocusRuleContract = () => browser.execute(() => {
  const contract = {
    mode: null as null | { outline: string },
    search: null as null | { outline: string },
  };
  const visitRules = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (rule.selectorText.includes(
          '.void-ui--minimal .void-nav-panel__session-mode-menu-trigger:focus-visible',
        )) {
          contract.mode = {
            outline: rule.style.outline,
          };
        }
        if (rule.selectorText.includes(
          '.void-ui--minimal .void-nav-panel__search-trigger:focus-visible',
        )) {
          contract.search = {
            outline: rule.style.outline,
          };
        }
        continue;
      }
      if ('cssRules' in rule) {
        visitRules((rule as CSSMediaRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visitRules(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets are irrelevant to the bundled workspace CSS.
    }
  }
  return contract;
});

const waitForSearchDialog = async (open: boolean) => {
  await browser.waitUntil(async () => browser.execute((expectedOpen) => {
    const dialog = document.querySelector('.void-nav-search-dialog__overlay');
    if (!expectedOpen) return !dialog;
    return Boolean(
      dialog
      && document.activeElement?.matches(
        '.void-nav-search-dialog__search .search__input',
      )
    );
  }, open), {
    timeout: 5_000,
    interval: 50,
    timeoutMsg: `Navigation search dialog did not ${open ? 'open and focus its input' : 'close'}`,
  });
};

const focusSearchTrigger = () => browser.execute(() => {
  document.querySelector<HTMLElement>('.void-nav-panel__search-trigger')?.focus();
});

const exerciseMinimalSearchInteraction = async () => {
  await focusSearchTrigger();
  await $('.void-nav-panel__search-trigger').click();
  await waitForSearchDialog(true);
  await browser.keys(['Escape']);
  await waitForSearchDialog(false);

  await browser.keys([desktopPrimaryModifier, 'k']);
  await waitForSearchDialog(true);
  await browser.keys(['Escape']);
  await waitForSearchDialog(false);

  await browser.keys(['Alt', 'f']);
  await waitForSearchDialog(true);
  await browser.keys(['Escape']);
  await waitForSearchDialog(false);
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

  it('keeps portal menus, the composer, and workspace status keyboard-reachable', async () => {
    const composerContract = await browser.execute(() => {
      const textbox = document.querySelector<HTMLElement>(
        '.void-chat-input [contenteditable="true"]',
      );
      if (!textbox) return null;
      return {
        role: textbox.getAttribute('role'),
        multiline: textbox.getAttribute('aria-multiline'),
        label: textbox.getAttribute('aria-label'),
      };
    });
    if (composerContract) {
      expect(composerContract.role).toBe('textbox');
      expect(composerContract.multiline).toBe('true');
      expect(composerContract.label?.trim().length ?? 0).toBeGreaterThan(0);
    }

    await browser.execute(async () => {
      type TauriInternals = {
        invoke<T>(command: string, args?: unknown): Promise<T>;
      };
      const internals = (
        window as Window & { __TAURI_INTERNALS__?: TauriInternals }
      ).__TAURI_INTERNALS__;
      if (!internals) {
        throw new Error('Tauri internals are unavailable while focusing the desktop window');
      }
      await internals.invoke('show_main_window');
      window.focus();
    });
    await browser.pause(200);

    const workspaceMenuTrigger = await $('[aria-controls="void-workspace-menu"]');
    expect(await workspaceMenuTrigger.isExisting()).toBe(true);
    await workspaceMenuTrigger.scrollIntoView();
    await browser.execute(() => {
      document.querySelector<HTMLElement>(
        '[aria-controls="void-workspace-menu"]',
      )?.focus();
    });
    await browser.keys(['ArrowDown']);
    await browser.waitUntil(async () => browser.execute(() => (
      document.activeElement?.getAttribute('role') === 'menuitem'
      && Boolean(document.getElementById('void-workspace-menu'))
    )), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Workspace menu did not move focus to its first item',
    });

    const firstFocusedMenuItem = await browser.execute(() => (
      document.activeElement?.textContent?.trim() ?? ''
    ));
    const firstFocusStyle = await browser.execute(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return null;
      const style = getComputedStyle(active);
      return {
        hasDocumentFocus: document.hasFocus(),
        keyboardFocus: active.getAttribute('data-keyboard-focus'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(firstFocusStyle?.keyboardFocus).toBe('true');
    expect(firstFocusStyle?.outlineStyle).not.toBe('none');
    expect(firstFocusStyle?.outlineWidth).not.toBe('0px');
    await saveScreenshot('keyboard-workspace-menu-first-focus', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice1-minimal',
    });

    await browser.keys(['ArrowDown']);
    await browser.waitUntil(async () => browser.execute((previousText) => (
      document.activeElement?.getAttribute('role') === 'menuitem'
      && document.activeElement?.textContent?.trim() !== previousText
    ), firstFocusedMenuItem), {
      timeout: 2_000,
      interval: 50,
      timeoutMsg: 'Workspace menu ArrowDown did not move focus',
    });

    await saveScreenshot('keyboard-workspace-menu-second-focus', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice1-minimal',
    });

    await browser.keys(['Escape']);
    await browser.waitUntil(async () => browser.execute(() => (
      document.activeElement?.getAttribute('aria-controls') === 'void-workspace-menu'
      && !document.getElementById('void-workspace-menu')
    )), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Workspace menu did not restore focus to its trigger',
    });

    const footerMenuTrigger = await $(
      '.void-nav-panel__footer-more-wrap .void-nav-panel__footer-btn--icon',
    );
    expect(await footerMenuTrigger.isExisting()).toBe(true);
    await footerMenuTrigger.click();
    const workspaceStatusItem = await $('[data-testid="workspace-status-menu-item"]');
    await workspaceStatusItem.waitForDisplayed({ timeout: 5_000 });
    await workspaceStatusItem.click();
    await browser.waitUntil(async () => browser.execute(() => (
      Boolean(document.querySelector('[role="dialog"]'))
    )), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Workspace status dialog did not open from the navigation menu',
    });
    await browser.pause(350);

    const workspaceDialogPresentation = await browser.execute(() => {
      const overlay = document.querySelector('.modal-overlay');
      const dialog = document.querySelector('[role="dialog"]');
      return {
        isMinimal: overlay?.classList.contains('void-ui--minimal') ?? false,
        title: dialog?.querySelector('.modal__title')?.textContent?.trim() ?? '',
        recentButtons: dialog?.querySelectorAll('button.workspace-card.recent').length ?? 0,
      };
    });
    expect(workspaceDialogPresentation.isMinimal).toBe(true);
    expect(workspaceDialogPresentation.title.length).toBeGreaterThan(0);
    expect(workspaceDialogPresentation.recentButtons).toBeGreaterThan(0);
    const modalNotificationVisibility = await browser.execute(() => {
      const notification = document.querySelector<HTMLElement>('.notification-container');
      return notification ? getComputedStyle(notification).visibility : null;
    });
    if (modalNotificationVisibility !== null) {
      expect(modalNotificationVisibility).toBe('hidden');
    }

    await saveScreenshot('workspace-status-dialog', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice1-minimal',
    });
    await browser.keys(['Escape']);
    await browser.waitUntil(async () => browser.execute(() => (
      !document.querySelector('[role="dialog"]')
    )), {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Workspace status dialog did not close with Escape',
    });
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

        if (step.level === 200) {
          const footerMenuTrigger = await $(
            '.void-nav-panel__footer-more-wrap .void-nav-panel__footer-btn--icon',
          );
          await footerMenuTrigger.click();
          const workspaceStatusItem = await $('[data-testid="workspace-status-menu-item"]');
          await workspaceStatusItem.waitForDisplayed({ timeout: 5_000 });
          await workspaceStatusItem.click();
          await browser.waitUntil(async () => browser.execute(() => (
            Boolean(document.querySelector('[role="dialog"]'))
          )), {
            timeout: 5_000,
            interval: 100,
            timeoutMsg: 'Workspace status dialog did not open at 200% zoom',
          });
          // Capture the settled surface instead of a translucent animation frame.
          await browser.pause(350);
          await saveScreenshot('zoom-200-workspace-status-dialog', {
            directory: screenshotDirectory,
            includeTimestamp: false,
            prefix: 'slice1-minimal',
          });
          await browser.keys(['Escape']);
        }

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

  it('renders one minimal session-launcher row without changing the classic contract', async () => {
    const originalUrl = await browser.getUrl();
    const originalSize = await browser.getWindowSize();
    const originalThemeSelection = await readThemeSelection();
    const originalPresentation = await browser.execute(() => (
      document.querySelector('[data-testid="app-layout"]')
        ?.getAttribute('data-ui-presentation') ?? 'minimal'
    )) as WorkspacePresentation;

    try {
      await writeThemeSelection('void-light' satisfies ThemeId);
      await navigateToPresentation(originalUrl, 'minimal');
      await browser.maximizeWindow();
      await waitForSplashToExit();
      await browser.waitUntil(async () => browser.execute(() => (
        document.documentElement.getAttribute('data-theme') === 'void-light'
      )), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Light theme did not settle for wide Minimal navigation',
      });

      const minimalWide = await readNavSearchPlacement();
      expect(minimalWide.theme).toBe('void-light');
      expect(minimalWide.presentation).toBe('minimal');
      expect(minimalWide.brandHeaderCount).toBe(0);
      expect(minimalWide.searchTriggerCount).toBe(1);
      expect(minimalWide.inlineSlotCount).toBe(1);
      expect(minimalWide.searchInsideRadioGroup).toBe(false);
      expect(minimalWide.searchOverlapsCreateAction).toBe(false);
      expect(minimalWide.sessionCreateTopGap ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(9);
      expect(minimalWide.sessionCreate?.height).toBe(28);
      expect(minimalWide.sessionModeSwitch).toBeNull();
      expect(minimalWide.sessionModeMenuTrigger?.width).toBe(28);
      expect(minimalWide.sessionModeMenuTrigger?.height).toBe(28);
      expect(minimalWide.sessionModeMenuExpanded).toBe('false');
      expect(minimalWide.createAction?.height).toBe(28);
      expect(minimalWide.sessionModeOptions).toHaveLength(0);
      expect(minimalWide.sessionCreateButtonCount).toBe(3);
      expect(minimalWide.navigation?.width).toBe(240);
      expect(minimalWide.sessionCreateStyle?.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(minimalWide.sessionCreateStyle?.borderTopWidth).toBe('0px');
      expect(minimalWide.sessionCreateStyle?.borderRadius).toBe('0px');
      expect(minimalWide.createActionModeDisplay).toBeNull();
      expect(minimalWide.createActionIconDisplay).toBeNull();
      expect(minimalWide.createActionArrowDisplay).toBeNull();
      expect(minimalWide.searchTrigger?.width).toBe(28);
      expect(minimalWide.searchTrigger?.height).toBe(28);
      expect(minimalWide.searchLabel).toBeNull();
      expect(minimalWide.topActionIconDisplays.every((display) => (
        display === 'none'
      ))).toBe(true);
      expect(minimalWide.topActionHeights.length).toBeGreaterThan(0);
      expect(minimalWide.topActionHeights.every((height) => height === 28))
        .toBe(true);
      expect(minimalWide.sessionIconProbe).toEqual({
        idleOpacity: '0.32',
        activeOpacity: '0.82',
        runningOpacity: '1',
        attentionVisible: true,
      });
      expect(minimalWide.footerDisplay).not.toBe('none');
      expect(minimalWide.footer?.bottom ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(minimalWide.viewportHeight + 1);
      expect(minimalWide.expandDefaultIcon?.display).toBe('none');
      expect(minimalWide.expandChevron?.display).not.toBe('none');
      expect(minimalWide.expandChevron?.opacity).toBe('1');
      expect(minimalWide.documentScrollWidth)
        .toBeLessThanOrEqual(minimalWide.viewportWidth + 1);

      const modeMenuTrigger = await $('.void-nav-panel__session-mode-menu-trigger');
      await modeMenuTrigger.click();
      await browser.waitUntil(async () => (
        (await modeMenuTrigger.getAttribute('aria-expanded')) === 'true'
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Session mode menu did not open',
      });
      await browser.waitUntil(async () => (
        (await $$('.void-nav-panel__session-mode-menu-item')).length === 3
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Lazy session mode menu did not finish loading',
      });
      let modeOptions = await $$('.void-nav-panel__session-mode-menu-item');
      expect(modeOptions).toHaveLength(3);
      await modeOptions[2].click();
      await browser.waitUntil(async () => (
        (await modeMenuTrigger.getAttribute('aria-expanded')) === 'false'
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Session mode menu did not close after selecting Media',
      });
      expect(await modeMenuTrigger.getAttribute('aria-label')).toContain('媒体');
      await modeMenuTrigger.click();
      modeOptions = await $$('.void-nav-panel__session-mode-menu-item');
      expect(await modeOptions[2].getAttribute('aria-checked')).toBe('true');
      await modeOptions[0].click();
      await browser.waitUntil(async () => (
        (await modeMenuTrigger.getAttribute('aria-expanded')) === 'false'
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Session mode menu did not close after restoring Code',
      });
      expect(await modeMenuTrigger.getAttribute('aria-label')).toContain('编码');

      await exerciseMinimalSearchInteraction();

      await saveScreenshot('navigation-launcher-single-row-wide', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-minimal',
      });
      await saveScreenshot('navigation-icon-only-light-wide', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice17-minimal',
      });

      await writeThemeSelection('void-dark' satisfies ThemeId);
      await navigateToPresentation(originalUrl, 'minimal');
      await browser.setWindowSize(1024, 720);
      await waitForSplashToExit();
      await browser.waitUntil(async () => browser.execute(() => (
        document.documentElement.getAttribute('data-theme') === 'void-dark'
      )), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Dark theme did not settle for narrow Minimal navigation',
      });
      const minimalNarrow = await readNavSearchPlacement();
      expect(minimalNarrow.theme).toBe('void-dark');
      expect(minimalNarrow.brandHeaderCount).toBe(0);
      expect(minimalNarrow.searchTriggerCount).toBe(1);
      expect(minimalNarrow.inlineSlotCount).toBe(1);
      expect(minimalNarrow.searchInsideRadioGroup).toBe(false);
      expect(minimalNarrow.searchOverlapsCreateAction).toBe(false);
      expect(minimalNarrow.sessionCreateTopGap ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(9);
      expect(minimalNarrow.sessionCreate?.height).toBe(28);
      expect(minimalNarrow.sessionModeSwitch).toBeNull();
      expect(minimalNarrow.sessionModeMenuTrigger?.width).toBe(28);
      expect(minimalNarrow.sessionModeMenuTrigger?.height).toBe(28);
      expect(minimalNarrow.sessionModeMenuExpanded).toBe('false');
      expect(minimalNarrow.createAction?.height).toBe(28);
      expect(minimalNarrow.sessionModeOptions).toHaveLength(0);
      expect(minimalNarrow.sessionCreateButtonCount).toBe(3);
      expect(minimalNarrow.navigation?.width).toBe(240);
      expect(minimalNarrow.sessionCreateStyle?.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(minimalNarrow.sessionCreateStyle?.borderTopWidth).toBe('0px');
      expect(minimalNarrow.sessionCreateStyle?.borderRadius).toBe('0px');
      expect(minimalNarrow.createActionModeDisplay).toBeNull();
      expect(minimalNarrow.createActionIconDisplay).toBeNull();
      expect(minimalNarrow.createActionArrowDisplay).toBeNull();
      expect(minimalNarrow.searchTrigger?.width).toBe(28);
      expect(minimalNarrow.searchTrigger?.height).toBe(28);
      expect(minimalNarrow.searchLabel).toBeNull();
      expect(minimalNarrow.topActionIconDisplays.every((display) => (
        display === 'none'
      ))).toBe(true);
      expect(minimalNarrow.topActionHeights.length).toBeGreaterThan(0);
      expect(minimalNarrow.topActionHeights.every((height) => height === 28))
        .toBe(true);
      expect(minimalNarrow.sessionIconProbe).toEqual({
        idleOpacity: '0.32',
        activeOpacity: '0.82',
        runningOpacity: '1',
        attentionVisible: true,
      });
      expect(minimalNarrow.footerDisplay).not.toBe('none');
      expect(minimalNarrow.footer?.bottom ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual(minimalNarrow.viewportHeight + 1);
      expect(minimalNarrow.expandDefaultIcon?.display).toBe('none');
      expect(minimalNarrow.expandChevron?.display).not.toBe('none');
      expect(minimalNarrow.expandChevron?.opacity).toBe('1');
      expect(minimalNarrow.documentScrollWidth)
        .toBeLessThanOrEqual(minimalNarrow.viewportWidth + 1);
      const minimalFocusRules = await readMinimalFocusRuleContract();
      expect(minimalFocusRules.mode?.outline).toContain('2px');
      expect(minimalFocusRules.mode?.outline).toContain('solid');
      expect(minimalFocusRules.search?.outline).toContain('2px');
      expect(minimalFocusRules.search?.outline).toContain('solid');

      const narrowModeTrigger = await $('.void-nav-panel__session-mode-menu-trigger');
      await narrowModeTrigger.click();
      await browser.waitUntil(async () => (
        (await narrowModeTrigger.getAttribute('aria-expanded')) === 'true'
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Session mode menu did not open at 1024x720',
      });
      await browser.waitUntil(async () => (
        (await $$('.void-nav-panel__session-mode-menu-item')).length === 3
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Lazy session mode menu did not finish loading at 1024x720',
      });
      const modeMenuGeometry = await browser.execute(() => {
        const menu = document.querySelector<HTMLElement>(
          '.void-nav-panel__session-mode-menu',
        );
        const navigation = document.querySelector<HTMLElement>(
          '.void-nav-panel__top-actions',
        );
        if (!menu || !navigation) return null;
        const rect = menu.getBoundingClientRect();
        const navigationRect = navigation.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          navigationRight: navigationRect.right,
          itemCount: menu.querySelectorAll('[role="menuitemradio"]').length,
        };
      });
      expect(modeMenuGeometry?.itemCount).toBe(3);
      expect(modeMenuGeometry?.width).toBe(168);
      expect(modeMenuGeometry?.left ?? -1).toBeGreaterThanOrEqual(0);
      expect(modeMenuGeometry?.top ?? -1).toBeGreaterThanOrEqual(0);
      expect(modeMenuGeometry?.right ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual((modeMenuGeometry?.viewportWidth ?? 0) + 1);
      expect(modeMenuGeometry?.right ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual((modeMenuGeometry?.navigationRight ?? 0) + 1);
      expect(modeMenuGeometry?.bottom ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual((modeMenuGeometry?.viewportHeight ?? 0) + 1);
      await saveScreenshot('navigation-launcher-mode-menu-open-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-minimal',
      });
      await browser.keys(['Escape']);
      await browser.waitUntil(async () => (
        (await narrowModeTrigger.getAttribute('aria-expanded')) === 'false'
      ), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Escape did not close the session mode menu',
      });

      await browser.execute(() => {
        document.querySelector<HTMLElement>(
          '.void-nav-panel__session-create-action',
        )?.focus();
      });
      await browser.keys(['Tab']);
      const modeFocus = await readActiveFocusStyle();
      expect(modeFocus?.className).toContain('void-nav-panel__session-mode-menu-trigger');
      expect(modeFocus?.ariaLabel).toBeTruthy();
      if (modeFocus?.focusVisible) {
        expect(modeFocus.outlineStyle).not.toBe('none');
        expect(modeFocus.outlineWidth).not.toBe('0px');
      }
      await saveScreenshot('navigation-launcher-mode-focus-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-minimal',
      });

      await browser.keys(['Tab']);
      const searchFocus = await readActiveFocusStyle();
      expect(searchFocus?.className).toContain('void-nav-panel__search-trigger');
      expect(searchFocus?.ariaLabel).toBeTruthy();
      if (searchFocus?.focusVisible) {
        expect(searchFocus.outlineStyle).not.toBe('none');
        expect(searchFocus.outlineWidth).not.toBe('0px');
      }
      await saveScreenshot('navigation-launcher-search-focus-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-minimal',
      });

      await saveScreenshot('navigation-launcher-single-row-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-minimal',
      });
      await saveScreenshot('navigation-icon-only-dark-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice17-minimal',
      });

      await navigateToPresentation(originalUrl, 'classic');
      await browser.maximizeWindow();
      await waitForSplashToExit();
      const classicWide = await readNavSearchPlacement();
      expect(classicWide.presentation).toBe('classic');
      expect(classicWide.brandHeaderCount).toBe(1);
      expect(classicWide.searchTriggerCount).toBe(1);
      expect(classicWide.inlineSlotCount).toBe(0);
      expect(classicWide.searchInsideRadioGroup).toBe(false);
      expect(classicWide.searchOverlapsCreateAction).toBe(false);
      expect(classicWide.searchLabel?.display).not.toBe('none');
      expect(classicWide.searchLabel?.width ?? 0).toBeGreaterThan(0);
      expect(classicWide.topActionIconDisplays.some((display) => (
        display !== 'none'
      ))).toBe(true);
      expect(classicWide.expandDefaultIcon?.display).not.toBe('none');
      expect(classicWide.expandDefaultIcon?.opacity).toBe('1');
      expect(classicWide.sessionCreate?.height ?? 0).toBeGreaterThan(60);
      expect(classicWide.sessionModeSwitch?.height).toBe(34);
      expect(classicWide.createAction?.height).toBe(32);
      expect(classicWide.sessionModeOptions).toHaveLength(3);
      expect(classicWide.sessionModeOptionIconCount).toBe(3);
      expect(classicWide.sessionModeOptions.some((option) => (
        option.labelDisplay !== 'none'
      ))).toBe(true);
      expect(classicWide.sessionCreateStyle?.borderTopWidth).not.toBe('0px');
      expect(classicWide.createActionModeDisplay).not.toBe('none');
      expect(classicWide.createActionArrowDisplay).not.toBe('none');
      expect(classicWide.documentScrollWidth)
        .toBeLessThanOrEqual(classicWide.viewportWidth + 1);

      const classicSearchTrigger = await $('.void-nav-panel__search-trigger');
      await classicSearchTrigger.click();
      await waitForSearchDialog(true);
      await browser.keys(['Escape']);
      await waitForSearchDialog(false);
      await browser.keys([desktopPrimaryModifier, 'k']);
      await waitForSearchDialog(true);
      await browser.keys(['Escape']);
      await waitForSearchDialog(false);

      await saveScreenshot('navigation-launcher-classic-wide', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-classic',
      });

      await browser.setWindowSize(1024, 720);
      await browser.pause(250);
      const classicNarrow = await readNavSearchPlacement();
      expect(classicNarrow.brandHeaderCount).toBe(1);
      expect(classicNarrow.searchTriggerCount).toBe(1);
      expect(classicNarrow.inlineSlotCount).toBe(0);
      expect(classicNarrow.searchOverlapsCreateAction).toBe(false);
      expect(classicNarrow.searchLabel?.display).not.toBe('none');
      expect(classicNarrow.searchLabel?.width ?? 0).toBeGreaterThan(0);
      expect(classicNarrow.sessionCreate?.height ?? 0).toBeGreaterThan(60);
      expect(classicNarrow.sessionModeSwitch?.height).toBe(34);
      expect(classicNarrow.createAction?.height).toBe(32);
      expect(classicNarrow.sessionModeOptions.some((option) => (
        option.labelDisplay !== 'none'
      ))).toBe(true);
      expect(classicNarrow.sessionModeOptionIconCount).toBe(3);
      expect(classicNarrow.sessionCreateStyle?.borderTopWidth).not.toBe('0px');
      expect(classicNarrow.createActionModeDisplay).not.toBe('none');
      expect(classicNarrow.createActionArrowDisplay).not.toBe('none');
      expect(classicNarrow.documentScrollWidth)
        .toBeLessThanOrEqual(classicNarrow.viewportWidth + 1);

      await saveScreenshot('navigation-launcher-classic-1024x720', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice6-classic',
      });
    } finally {
      if (
        typeof originalThemeSelection === 'string'
        && originalThemeSelection.length > 0
      ) {
        await writeThemeSelection(originalThemeSelection);
      }
      await browser.url(originalUrl);
      await browser.waitUntil(async () => browser.execute((expected) => (
        document.querySelector('[data-testid="app-layout"]')
          ?.getAttribute('data-ui-presentation') === expected
      ), originalPresentation), {
        timeout: 15_000,
        interval: 100,
        timeoutMsg: 'Workspace presentation did not restore after search visual verification',
      });
      await browser.setWindowSize(originalSize.width, originalSize.height);
    }
  });

  it('keeps footer capabilities and optional dialogs reachable after progressive disclosure', async () => {
    const originalUrl = await browser.getUrl();
    const originalPresentation = await browser.execute(() => (
      document.querySelector('[data-testid="app-layout"]')
        ?.getAttribute('data-ui-presentation') ?? 'minimal'
    ));
    const originalDisclaimer = await browser.execute(() => (
      localStorage.getItem('void:remote-connect:disclaimer-agreed:v1')
    ));

    try {
      await navigateToPresentation(originalUrl, 'minimal');
      await waitForSplashToExit();
      expect(await openWorkspace(process.env.E2E_TEST_WORKSPACE || process.cwd())).toBe(true);
      expect(await browser.execute(() => ({
        minimal: document.body.classList.contains('void-ui--minimal'),
        classic: document.body.classList.contains('void-ui--classic'),
      }))).toEqual({
        minimal: true,
        classic: false,
      });

      const footerDisclosure = await browser.execute(() => {
        const visible = (element: Element) => getComputedStyle(element).display !== 'none';
        const quickActions = Array.from(document.querySelectorAll(
          '.void-nav-panel__footer-quick-action',
        ));
        const footerButtons = Array.from(document.querySelectorAll(
          '.void-nav-panel__footer button',
        ));
        return {
          quickActionCount: quickActions.length,
          visibleQuickActionCount: quickActions.filter(visible).length,
          visibleFooterButtonCount: footerButtons.filter(visible).length,
        };
      });
      expect(footerDisclosure).toEqual({
        quickActionCount: 2,
        visibleQuickActionCount: 0,
        visibleFooterButtonCount: 2,
      });

      const openFooterMenu = async () => {
        await browser.waitUntil(async () => browser.execute(() => (
          !document.querySelector('.void-nav-panel__footer-menu')
        )), {
          timeout: 5_000,
          interval: 50,
          timeoutMsg: 'Previous Minimal footer menu did not finish closing',
        });
        await $(
          '.void-nav-panel__footer-more-wrap .void-nav-panel__footer-btn--icon',
        ).click();
        await browser.waitUntil(async () => browser.execute(() => (
          Boolean(document.querySelector('.void-nav-panel__footer-menu'))
        )), {
          timeout: 5_000,
          interval: 50,
          timeoutMsg: 'Minimal footer menu did not open',
        });
      };

      await openFooterMenu();
      const shellMenuItem = await $('[data-testid="minimal-footer-shell-menu-item"]');
      const browserMenuItem = await $('[data-testid="minimal-footer-browser-menu-item"]');
      expect(await shellMenuItem.isDisplayed()).toBe(true);
      expect(await browserMenuItem.isDisplayed()).toBe(true);
      await shellMenuItem.click();
      await browser.waitUntil(async () => browser.execute(async () => {
        const { useNavSceneStore } = await import(
          '/src/app/stores/navSceneStore.ts'
        );
        const state = useNavSceneStore.getState();
        return state.showSceneNav && state.navSceneId === 'shell';
      }), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Shell capability did not open from the Minimal footer menu',
      });

      await openFooterMenu();
      await $('[data-testid="minimal-footer-browser-menu-item"]').click();
      await browser.waitUntil(async () => browser.execute(() => (
        !document.querySelector('.void-nav-panel__footer-menu')
      )), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Browser footer action did not handle the click and close its menu',
      });

      await browser.execute(() => {
        localStorage.setItem(
          'void:remote-connect:disclaimer-agreed:v1',
          'true',
        );
      });
      await openFooterMenu();
      await $('[data-testid="remote-connect-menu-item"]').click();
      await $('.void-remote-connect').waitForDisplayed({ timeout: 10_000 });
      await saveScreenshot('optional-remote-connect-dialog', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice7-minimal',
      });
      await browser.keys(['Escape']);
      await browser.waitUntil(async () => browser.execute(() => (
        !document.querySelector('.void-remote-connect')
      )), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'Remote Connect dialog did not close with Escape',
      });

      await browser.execute(() => {
        window.dispatchEvent(new Event('nav:new-project'));
      });
      await $('.new-project-dialog').waitForDisplayed({ timeout: 10_000 });
      await saveScreenshot('optional-new-project-dialog', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice7-minimal',
      });
      await browser.keys(['Escape']);
      await browser.waitUntil(async () => browser.execute(() => (
        !document.querySelector('.new-project-dialog')
      )), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'New Project dialog did not close with Escape',
      });

      await openFooterMenu();
      await $('[data-testid="about-menu-item"]').click();
      await $('.void-about-dialog__content').waitForDisplayed({ timeout: 10_000 });
      expect(await browser.execute(() => {
        const content = document.querySelector('.void-about-dialog__content');
        const overlay = content?.closest('.modal-overlay');
        const modal = content?.closest('.modal');
        return {
          bodyMinimal: document.body.classList.contains('void-ui--minimal'),
          bodyClassic: document.body.classList.contains('void-ui--classic'),
          overlayRepeatsPresentation: overlay?.classList.contains('void-ui--minimal') ?? null,
          modalMaxWidth: modal ? getComputedStyle(modal).maxWidth : null,
        };
      })).toEqual({
        bodyMinimal: true,
        bodyClassic: false,
        overlayRepeatsPresentation: false,
        modalMaxWidth: '460px',
      });
      await saveScreenshot('optional-about-dialog', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice8-minimal',
      });
      await browser.keys(['Escape']);
      await browser.waitUntil(async () => browser.execute(() => (
        !document.querySelector('.void-about-dialog__content')
      )), {
        timeout: 5_000,
        interval: 50,
        timeoutMsg: 'About dialog did not close with Escape',
      });

      await saveScreenshot('footer-progressive-disclosure', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice7-minimal',
      });
    } finally {
      await browser.execute((savedDisclaimer) => {
        const key = 'void:remote-connect:disclaimer-agreed:v1';
        if (savedDisclaimer === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, savedDisclaimer);
        }
      }, originalDisclaimer);
      await browser.url(originalUrl);
      await browser.waitUntil(async () => browser.execute((expected) => (
        document.querySelector('[data-testid="app-layout"]')
          ?.getAttribute('data-ui-presentation') === expected
      ), originalPresentation), {
        timeout: 15_000,
        interval: 100,
        timeoutMsg: 'Workspace presentation did not restore after footer verification',
      });
    }
  });
});
