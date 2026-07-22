import { $, $$, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { saveScreenshot } from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);

const sessionTriggerSelector = [
  '.void-toolbar-mode__session-menu-trigger',
  '[aria-controls="void-toolbar-mode-session-listbox"]',
].join('');
const overflowTriggerSelector = [
  '.void-toolbar-mode__overflow-trigger',
  '[aria-controls="void-toolbar-mode-overflow-menu"]',
].join('');
const collapsedRestoreSelector = [
  '.void-toolbar-mode__header-collapsed-actions',
  'button.toolbar-btn.toolbar-btn--expand[aria-label]',
].join(' ');
const restoreKeyboardDiagnosticKey =
  '__voidToolbarRestoreKeyboardDiagnostic__';
const restoreKeyboardListenerKey =
  '__voidToolbarRestoreKeyboardListeners__';

type RestoreKeyboardDiagnostic = {
  keydown: number;
  keyup: number;
  click: number;
  lastKey: string;
  lastCode: string;
  lastTarget: string;
};

type RestoreKeyboardEvidence = RestoreKeyboardDiagnostic & {
  activeElement: string;
  documentHasFocus: boolean;
  restoreElement: string;
  restoreActive: boolean;
  restoreFocusVisible: boolean;
};

type TauriInternals = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

type NativeWindowSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  decorated: boolean;
  resizable: boolean;
  alwaysOnTop: boolean;
};

type TauriNativeWindow = {
  outerPosition(): Promise<{ x: number; y: number }>;
  outerSize(): Promise<{ width: number; height: number }>;
  isMaximized(): Promise<boolean>;
  isDecorated(): Promise<boolean>;
  isResizable(): Promise<boolean>;
  isAlwaysOnTop(): Promise<boolean>;
  unmaximize(): Promise<void>;
  setMinSize(size: unknown | null): Promise<void>;
  setDecorations(decorated: boolean): Promise<void>;
  setSize(size: unknown): Promise<void>;
  setPosition(position: unknown): Promise<void>;
  setResizable(resizable: boolean): Promise<void>;
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
  setSkipTaskbar(skip: boolean): Promise<void>;
  maximize(): Promise<void>;
  setFocus(): Promise<void>;
};

type TauriWindowGlobal = {
  window?: {
    getCurrentWindow?: () => TauriNativeWindow;
  };
  dpi?: {
    PhysicalSize?: new (width: number, height: number) => unknown;
    PhysicalPosition?: new (x: number, y: number) => unknown;
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

const readNativeWindowSnapshot = () => browser.execute(
  async (): Promise<NativeWindowSnapshot> => {
    const tauri = (
      window as Window & { __TAURI__?: TauriWindowGlobal }
    ).__TAURI__;
    const getCurrentWindow = tauri?.window?.getCurrentWindow;
    if (typeof getCurrentWindow !== 'function') {
      throw new Error(
        'Tauri window API is unavailable while reading the native window',
      );
    }
    const nativeWindow = getCurrentWindow();
    const [
      position,
      size,
      maximized,
      decorated,
      resizable,
      alwaysOnTop,
    ] = await Promise.all([
      nativeWindow.outerPosition(),
      nativeWindow.outerSize(),
      nativeWindow.isMaximized(),
      nativeWindow.isDecorated(),
      nativeWindow.isResizable(),
      nativeWindow.isAlwaysOnTop(),
    ]);

    return {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      maximized,
      decorated,
      resizable,
      alwaysOnTop,
    };
  },
);

const restoreNativeWindow = (snapshot: NativeWindowSnapshot) => browser.execute(
  async (saved) => {
    const tauri = (
      window as Window & { __TAURI__?: TauriWindowGlobal }
    ).__TAURI__;
    const getCurrentWindow = tauri?.window?.getCurrentWindow;
    const PhysicalSize = tauri?.dpi?.PhysicalSize;
    const PhysicalPosition = tauri?.dpi?.PhysicalPosition;
    if (
      typeof getCurrentWindow !== 'function'
      || typeof PhysicalSize !== 'function'
      || typeof PhysicalPosition !== 'function'
    ) {
      throw new Error(
        'Tauri window and DPI APIs are unavailable while restoring the native window',
      );
    }
    const nativeWindow = getCurrentWindow();
    const currentlyMaximized = await nativeWindow.isMaximized();

    if (currentlyMaximized) {
      await nativeWindow.unmaximize();
    }
    await nativeWindow.setMinSize(null);
    await nativeWindow.setDecorations(saved.decorated);
    await nativeWindow.setSize(
      new PhysicalSize(saved.width, saved.height),
    );
    await nativeWindow.setPosition(
      new PhysicalPosition(saved.x, saved.y),
    );
    await nativeWindow.setResizable(saved.resizable);
    await nativeWindow.setAlwaysOnTop(saved.alwaysOnTop);
    await nativeWindow.setSkipTaskbar(false);

    if (saved.maximized) {
      await nativeWindow.maximize();
    }

    await nativeWindow.setFocus();
  },
  snapshot,
);

const nativeSnapshotsMatch = (
  actual: NativeWindowSnapshot,
  expected: NativeWindowSnapshot,
) => (
  Math.abs(actual.x - expected.x) <= 2
  && Math.abs(actual.y - expected.y) <= 2
  && Math.abs(actual.width - expected.width) <= 2
  && Math.abs(actual.height - expected.height) <= 2
  && actual.maximized === expected.maximized
  && actual.decorated === expected.decorated
  && actual.resizable === expected.resizable
  && actual.alwaysOnTop === expected.alwaysOnTop
);

const waitForNativeWindowSnapshot = async (
  expected: NativeWindowSnapshot,
) => {
  await browser.waitUntil(async () => (
    nativeSnapshotsMatch(await readNativeWindowSnapshot(), expected)
  ), {
    timeout: 15_000,
    interval: 100,
    timeoutMsg: 'Native window state did not return to its original snapshot',
  });

  const actual = await readNativeWindowSnapshot();
  if (!nativeSnapshotsMatch(actual, expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
};

const waitForApplication = async (theme?: string) => {
  await browser.waitUntil(async () => browser.execute((expectedTheme) => (
    Boolean(document.querySelector('[data-testid="app-layout"]'))
    && !document.querySelector('.splash-screen')
    && (
      !expectedTheme
      || document.documentElement.getAttribute('data-theme') === expectedTheme
    )
  ), theme), {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'Desktop application did not settle',
  });
};

const openFooterMenu = async () => {
  const trigger = await $(
    '.void-nav-panel__footer-more-wrap .void-nav-panel__footer-btn--icon',
  );
  await trigger.waitForClickable({ timeout: 10_000 });
  await trigger.click();
  await $('.void-nav-panel__footer-menu').waitForDisplayed({ timeout: 5_000 });
};

const tabUntil = async (selector: string, maxTabs = 40) => {
  const target = await $(selector);
  await target.waitForDisplayed({ timeout: 5_000 });

  for (let index = 0; index < maxTabs; index += 1) {
    await browser.keys(['Tab']);
    const isTarget = await browser.execute((candidate) => (
      document.activeElement?.matches(candidate) ?? false
    ), selector);
    if (isTarget) {
      return;
    }
  }

  throw new Error(`Tab did not reach ${selector} within ${maxTabs} steps`);
};

const assertVisibleKeyboardFocus = async (selector: string) => {
  const evidence = await browser.execute((candidate) => {
    const target = document.querySelector<HTMLElement>(candidate);
    if (!target) return null;
    const style = getComputedStyle(target);
    return {
      active: document.activeElement === target,
      focusVisible: target.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  }, selector);

  expect(evidence).not.toBeNull();
  expect(evidence?.active).toBe(true);
  expect(evidence?.focusVisible).toBe(true);
  expect(evidence?.outlineStyle).not.toBe('none');
  expect(evidence?.outlineWidth).not.toBe('0px');
};

const attachRestoreKeyboardDiagnostics = async () => browser.execute(
  (selector, diagnosticKey, listenerKey) => {
    type ListenerStore = {
      target: HTMLElement;
      keydown: (event: KeyboardEvent) => void;
      keyup: (event: KeyboardEvent) => void;
      click: (event: MouseEvent) => void;
    };
    type DiagnosticWindow = Window & {
      [key: string]: RestoreKeyboardDiagnostic | ListenerStore | undefined;
    };

    const diagnosticWindow = window as unknown as DiagnosticWindow;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
      throw new Error(
        `Cannot attach keyboard diagnostics: ${selector} was not found`,
      );
    }

    const state: RestoreKeyboardDiagnostic = {
      keydown: 0,
      keyup: 0,
      click: 0,
      lastKey: '',
      lastCode: '',
      lastTarget: '',
    };
    const describeTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof HTMLElement)) {
        return eventTarget?.constructor?.name ?? 'null';
      }
      const id = eventTarget.id ? `#${eventTarget.id}` : '';
      const classes = Array.from(eventTarget.classList)
        .map((className) => `.${className}`)
        .join('');
      return `${eventTarget.tagName.toLowerCase()}${id}${classes}`;
    };
    const recordKeyboardEvent = (
      field: 'keydown' | 'keyup',
      event: KeyboardEvent,
    ) => {
      state[field] += 1;
      state.lastKey = event.key;
      state.lastCode = event.code;
      state.lastTarget = describeTarget(event.target);
    };
    const keydown = (event: KeyboardEvent) => {
      recordKeyboardEvent('keydown', event);
    };
    const keyup = (event: KeyboardEvent) => {
      recordKeyboardEvent('keyup', event);
    };
    const click = (event: MouseEvent) => {
      state.click += 1;
      state.lastTarget = describeTarget(event.target);
    };

    target.addEventListener('keydown', keydown, true);
    target.addEventListener('keyup', keyup, true);
    target.addEventListener('click', click, true);
    diagnosticWindow[diagnosticKey] = state;
    diagnosticWindow[listenerKey] = {
      target,
      keydown,
      keyup,
      click,
    };
  },
  collapsedRestoreSelector,
  restoreKeyboardDiagnosticKey,
  restoreKeyboardListenerKey,
);

const readRestoreKeyboardEvidence = async () => browser.execute(
  (selector, diagnosticKey) => {
    type DiagnosticWindow = Window & {
      [key: string]: RestoreKeyboardDiagnostic | undefined;
    };
    const diagnosticWindow = window as unknown as DiagnosticWindow;
    const target = document.querySelector<HTMLElement>(selector);
    const activeElement = document.activeElement;
    const state = diagnosticWindow[diagnosticKey] ?? {
      keydown: 0,
      keyup: 0,
      click: 0,
      lastKey: '',
      lastCode: '',
      lastTarget: '',
    };
    const describeElement = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return element?.constructor?.name ?? 'null';
      }
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList)
        .map((className) => `.${className}`)
        .join('');
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    return {
      ...state,
      activeElement: describeElement(activeElement),
      documentHasFocus: document.hasFocus(),
      restoreElement: describeElement(target),
      restoreActive: activeElement === target,
      restoreFocusVisible: target?.matches(':focus-visible') ?? false,
    } satisfies RestoreKeyboardEvidence;
  },
  collapsedRestoreSelector,
  restoreKeyboardDiagnosticKey,
);

const cleanupRestoreKeyboardDiagnostics = async () => browser.execute(
  (diagnosticKey, listenerKey) => {
    type ListenerStore = {
      target: HTMLElement;
      keydown: (event: KeyboardEvent) => void;
      keyup: (event: KeyboardEvent) => void;
      click: (event: MouseEvent) => void;
    };
    type DiagnosticWindow = Window & {
      [key: string]:
        | RestoreKeyboardDiagnostic
        | ListenerStore
        | undefined;
    };
    const diagnosticWindow = window as unknown as DiagnosticWindow;
    const listeners = diagnosticWindow[listenerKey] as
      | ListenerStore
      | undefined;

    if (listeners) {
      listeners.target.removeEventListener('keydown', listeners.keydown, true);
      listeners.target.removeEventListener('keyup', listeners.keyup, true);
      listeners.target.removeEventListener('click', listeners.click, true);
    }
    delete diagnosticWindow[diagnosticKey];
    delete diagnosticWindow[listenerKey];
  },
  restoreKeyboardDiagnosticKey,
  restoreKeyboardListenerKey,
);

const restoreMainWindowIfNeeded = async () => {
  if (!await $('.void-toolbar-mode').isExisting()) {
    return;
  }

  const collapsedRestore = await $(collapsedRestoreSelector);
  if (await collapsedRestore.isExisting()) {
    await collapsedRestore.click();
  } else {
    const overflowTrigger = await $(overflowTriggerSelector);
    if ((await overflowTrigger.getAttribute('aria-expanded')) !== 'true') {
      await overflowTrigger.click();
    }
    const restoreItem = await $(
      '#void-toolbar-mode-overflow-menu [role="menuitem"]:nth-of-type(2)',
    );
    await restoreItem.waitForClickable({ timeout: 5_000 });
    await restoreItem.click();
  }

  await browser.waitUntil(async () => (
    !await $('.void-toolbar-mode').isExisting()
  ), {
    timeout: 15_000,
    interval: 100,
    timeoutMsg: 'Toolbar Mode did not restore the main window',
  });
};

const describeFailure = (error: unknown) => (
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
    failures.push(`${label}: ${describeFailure(error)}`);
  }
};

describe('L0 Toolbar Mode accessibility and single-window restoration', () => {
  it('keeps compact controls named and restores the same desktop window', async () => {
    const sourceUrl = await browser.getUrl();
    const originalHandles = await browser.getWindowHandles();
    const originalNativeWindow = await readNativeWindowSnapshot();
    const savedTheme = await readThemeSelection();
    const cleanupFailures: string[] = [];

    expect(originalHandles).toHaveLength(1);
    if (typeof savedTheme !== 'string' || savedTheme.length === 0) {
      throw new Error(
        `Cannot precisely restore non-string theme value: ${String(savedTheme)}`,
      );
    }
    const originalTheme = savedTheme;

    try {
      await writeThemeSelection('void-light');
      await browser.url(sourceUrl);
      await waitForApplication('void-light');

      await openFooterMenu();
      const toolbarEntry = await $(
        '.void-nav-panel__footer-menu-item:has(svg.lucide-picture-in-picture-2)',
      );
      await toolbarEntry.waitForClickable({ timeout: 5_000 });
      await toolbarEntry.click();
      await $('.void-toolbar-mode').waitForDisplayed({ timeout: 15_000 });

      expect(await browser.getWindowHandles()).toEqual(originalHandles);

      const sessionTrigger = await $(sessionTriggerSelector);
      expect((await sessionTrigger.getAttribute('aria-label'))?.trim())
        .not.toBe('');
      expect(await sessionTrigger.getAttribute('aria-expanded')).toBe('false');

      await tabUntil(sessionTriggerSelector);
      await assertVisibleKeyboardFocus(sessionTriggerSelector);
      await saveScreenshot('toolbar-mode-accessibility-light-focus', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice18',
      });

      await sessionTrigger.click();
      const sessionList = await $('#void-toolbar-mode-session-listbox');
      await sessionList.waitForDisplayed({ timeout: 5_000 });
      expect(await sessionList.getAttribute('role')).toBe('listbox');
      expect((await sessionList.getAttribute('aria-label'))?.trim())
        .not.toBe('');
      expect(await sessionTrigger.getAttribute('aria-expanded')).toBe('true');
      const sessionOptions = await $$(
        '#void-toolbar-mode-session-listbox [role="option"]',
      );
      for (const option of sessionOptions) {
        expect(['true', 'false']).toContain(
          await option.getAttribute('aria-selected'),
        );
      }
      await sessionTrigger.click();

      const input = await $(
        '.void-toolbar-mode__input-field--expanded[aria-label]',
      );
      expect((await input.getAttribute('aria-label'))?.trim()).not.toBe('');
      const send = await $('.toolbar-btn--send[aria-label]');
      expect((await send.getAttribute('aria-label'))?.trim()).not.toBe('');

      const overflowTrigger = await $(overflowTriggerSelector);
      expect((await overflowTrigger.getAttribute('aria-label'))?.trim())
        .not.toBe('');
      await overflowTrigger.click();
      const overflowMenu = await $('#void-toolbar-mode-overflow-menu');
      await overflowMenu.waitForDisplayed({ timeout: 5_000 });
      expect(await overflowMenu.getAttribute('role')).toBe('menu');
      expect(await overflowTrigger.getAttribute('aria-expanded')).toBe('true');

      const overflowItems = await $$(
        '#void-toolbar-mode-overflow-menu [role="menuitem"]',
      );
      expect(overflowItems).toHaveLength(2);
      const restoreLabel = (await overflowItems[1].getText()).trim();
      expect(restoreLabel).not.toBe('');

      await overflowItems[0].click();
      const collapsedRestore = await $(collapsedRestoreSelector);
      await collapsedRestore.waitForDisplayed({ timeout: 10_000 });
      expect((await collapsedRestore.getAttribute('aria-label'))?.trim())
        .toBe(restoreLabel);
      expect(await collapsedRestore.$('svg.lucide-maximize-2').isExisting())
        .toBe(true);

      await tabUntil(collapsedRestoreSelector);
      await assertVisibleKeyboardFocus(collapsedRestoreSelector);
      await saveScreenshot('toolbar-mode-accessibility-light-collapsed', {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice18',
      });

      await browser.keys(['Shift', 'Tab']);
      await browser.keys(['Tab']);
      await assertVisibleKeyboardFocus(collapsedRestoreSelector);
      await attachRestoreKeyboardDiagnostics();
      try {
        await browser.keys(['Enter']);
        const keyboardEvidence = await readRestoreKeyboardEvidence();

        expect(keyboardEvidence.documentHasFocus).toBe(true);
        expect(keyboardEvidence.restoreActive).toBe(true);
        expect(keyboardEvidence.restoreFocusVisible).toBe(true);
        expect(keyboardEvidence.keydown).toBe(1);
        expect(keyboardEvidence.keyup).toBe(1);
        expect(keyboardEvidence.click).toBe(0);
        expect(keyboardEvidence.lastKey).toBe('Enter');
        expect(keyboardEvidence.lastCode).toBe('Enter');
        expect(keyboardEvidence.lastTarget)
          .toBe(keyboardEvidence.restoreElement);
        expect(await $('.void-toolbar-mode').isExisting()).toBe(true);

        // The embedded WebDriver dispatches key events but does not synthesize
        // the native button's default click. One real pointer click separately
        // verifies the existing onClick/provider restoration path.
        await collapsedRestore.click();
        await browser.waitUntil(async () => (
          !await $('.void-toolbar-mode').isExisting()
        ), {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'Pointer Restore Main Window did not leave Toolbar Mode',
        });

        const finalEvidence = await readRestoreKeyboardEvidence();
        expect(finalEvidence.click).toBe(1);
      } finally {
        await cleanupRestoreKeyboardDiagnostics();
      }

      expect(await browser.getWindowHandles()).toEqual(originalHandles);
    } finally {
      await attemptCleanup(
        cleanupFailures,
        'restore main window from either toolbar state',
        restoreMainWindowIfNeeded,
      );
      await attemptCleanup(cleanupFailures, 'restore theme', async () => {
        await writeThemeSelection(originalTheme);
      });
      await attemptCleanup(cleanupFailures, 'restore URL', async () => {
        await browser.url(sourceUrl);
        await waitForApplication();
      });
      await attemptCleanup(cleanupFailures, 'restore native window', async () => {
        await restoreNativeWindow(originalNativeWindow);
        await waitForNativeWindowSnapshot(originalNativeWindow);
      });
      await attemptCleanup(cleanupFailures, 'verify one window handle', async () => {
        const restoredHandles = await browser.getWindowHandles();
        if (
          restoredHandles.length !== 1
          || restoredHandles[0] !== originalHandles[0]
        ) {
          throw new Error(
            `expected ${originalHandles.join(',')}, received ${restoredHandles.join(',')}`,
          );
        }
      });
      await attemptCleanup(cleanupFailures, 'verify theme', async () => {
        const restoredTheme = await readThemeSelection();
        if (restoredTheme !== originalTheme) {
          throw new Error(
            `expected ${originalTheme}, received ${String(restoredTheme)}`,
          );
        }
      });
      await attemptCleanup(cleanupFailures, 'verify URL', async () => {
        const restoredUrl = await browser.getUrl();
        if (restoredUrl !== sourceUrl) {
          throw new Error(`expected ${sourceUrl}, received ${restoredUrl}`);
        }
      });

      if (cleanupFailures.length > 0) {
        throw new Error(
          `Toolbar Mode cleanup failed:\n${cleanupFailures.join('\n')}`,
        );
      }
    }
  });
});
