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
type ThemeType = 'dark' | 'light';

type SurfaceCase = {
  height: number;
  screenshotNameSuffix: string;
  screenshotPrefix: string;
  themeId: ThemeId;
  themeType: ThemeType;
  width: number;
};

type TauriInternals = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

type SurfaceEvidence = {
  backgroundColor: string;
  clientWidth: number;
  color: string;
  controls: Array<{
    bottom: number;
    height: number;
    hit: boolean;
    left: number;
    pointerEvents: string;
    right: number;
    top: number;
    visible: boolean;
    width: number;
  }>;
  documentScrollWidth: number;
  rect: {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
  };
  scrollWidth: number;
  viewport: {
    height: number;
    width: number;
  };
};

const surfaceCases = [
  {
    height: 800,
    screenshotNameSuffix: '',
    screenshotPrefix: 'slice10-minimal',
    themeId: 'void-light',
    themeType: 'light',
    width: 1280,
  },
  {
    height: 720,
    screenshotNameSuffix: '-dark-narrow',
    screenshotPrefix: 'slice11-minimal',
    themeId: 'void-dark',
    themeType: 'dark',
    width: 1024,
  },
] as const satisfies ReadonlyArray<SurfaceCase>;

const mountedRootKeys = [
  '__statusBarE2ERoot',
  '__remoteFileBrowserE2ERoot',
  '__diffFullscreenE2ERoot',
  '__snapshotFullscreenE2ERoot',
] as const;

const mountedElementIds = [
  'status-bar-e2e-host',
  'remote-file-browser-e2e-host',
  'remote-file-browser-e2e-origin',
  'diff-fullscreen-e2e-host',
  'diff-fullscreen-e2e-origin',
  'snapshot-fullscreen-e2e-host',
  'snapshot-fullscreen-e2e-origin',
] as const;

const remoteFixtureRoot =
  '/workspace/productions/season-01/episode-0001/'
  + 'very-long-collaboration-directory-for-responsive-verification';
const remoteFixtureFile =
  `${remoteFixtureRoot}/very-long-production-script-name-for-overflow-check.ts`;

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

const waitForTwoAnimationFrames = () => browser.execute(async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const cleanupMountedSurfaces = async (): Promise<void> => {
  const failures = await browser.execute((rootKeys, elementIds) => {
    const cleanupFailures: string[] = [];
    const scopedWindow = window as unknown as Record<string, unknown>;

    for (const key of rootKeys) {
      try {
        const root = scopedWindow[key] as { unmount?(): void } | undefined;
        root?.unmount?.();
      } catch (error) {
        cleanupFailures.push(
          `unmount ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        delete scopedWindow[key];
      }
    }

    try {
      const remoteApi = scopedWindow.__remoteFileBrowserE2EApi as {
        readDir?: (...args: unknown[]) => unknown;
      } | undefined;
      const originalReadDir = scopedWindow.__remoteFileBrowserE2EReadDir as
        | ((...args: unknown[]) => unknown)
        | undefined;
      if (remoteApi && originalReadDir) {
        remoteApi.readDir = originalReadDir;
      }
    } catch (error) {
      cleanupFailures.push(
        `restore sshApi.readDir: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      delete scopedWindow.__remoteFileBrowserE2EApi;
      delete scopedWindow.__remoteFileBrowserE2EReadDir;
      delete scopedWindow.__remoteFileBrowserSelected;
    }

    for (const id of elementIds) {
      try {
        document.getElementById(id)?.remove();
      } catch (error) {
        cleanupFailures.push(
          `remove ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return cleanupFailures;
  }, [...mountedRootKeys], [...mountedElementIds]);

  if (failures.length > 0) {
    throw new Error(`Mounted-surface cleanup failed:\n${failures.join('\n')}`);
  }
};

const configureSurfaceCase = async (
  sourceUrl: string,
  surfaceCase: SurfaceCase,
): Promise<void> => {
  await browser.setWindowSize(surfaceCase.width, surfaceCase.height);
  await writeThemeSelection(surfaceCase.themeId);

  const target = new URL(sourceUrl);
  target.searchParams.set('void-ui', 'minimal');
  await browser.url(target.toString());
  await browser.waitUntil(async () => browser.execute(
    (expectedTheme, expectedThemeType) => (
      document.documentElement.getAttribute('data-theme') === expectedTheme
      && document.documentElement.getAttribute('data-theme-type') === expectedThemeType
      && document.body.classList.contains('void-ui--minimal')
      && document
        .querySelector('[data-testid="app-layout"]')
        ?.getAttribute('data-ui-presentation') === 'minimal'
      && !document.querySelector('.splash-screen')
    ),
    surfaceCase.themeId,
    surfaceCase.themeType,
  ), {
    timeout: 20_000,
    interval: 100,
    timeoutMsg:
      `${surfaceCase.themeId} ${surfaceCase.width}x${surfaceCase.height} `
      + 'did not settle for legacy-surface verification',
  });

  await waitForTwoAnimationFrames();

  const actualSize = await browser.getWindowSize();
  expect(actualSize.width).toBe(surfaceCase.width);
  expect(actualSize.height).toBe(surfaceCase.height);
};

const readSurfaceEvidence = (
  surfaceSelector: string,
  controlSelector: string,
) => browser.execute((nextSurfaceSelector, nextControlSelector) => {
  const surface = document.querySelector<HTMLElement>(nextSurfaceSelector);
  if (!surface) {
    throw new Error(`Surface not found: ${nextSurfaceSelector}`);
  }

  const toRect = (rect: DOMRect) => ({
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  });
  const surfaceRect = surface.getBoundingClientRect();
  const surfaceStyle = window.getComputedStyle(surface);
  const controls = Array.from(
    surface.querySelectorAll<HTMLElement>(nextControlSelector),
  ).map((control) => {
    const rect = control.getBoundingClientRect();
    const style = window.getComputedStyle(control);
    const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + (rect.width / 2)));
    const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + (rect.height / 2)));
    const hitTarget = document.elementFromPoint(centerX, centerY);
    return {
      bottom: rect.bottom,
      height: rect.height,
      hit: Boolean(hitTarget && control.contains(hitTarget)),
      left: rect.left,
      pointerEvents: style.pointerEvents,
      right: rect.right,
      top: rect.top,
      visible: (
        rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
      ),
      width: rect.width,
    };
  });

  return {
    backgroundColor: surfaceStyle.backgroundColor,
    clientWidth: surface.clientWidth,
    color: surfaceStyle.color,
    controls,
    documentScrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    rect: toRect(surfaceRect),
    scrollWidth: surface.scrollWidth,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
  };
}, surfaceSelector, controlSelector);

const isOpaqueColor = (color: string): boolean => (
  color.length > 0
  && color !== 'transparent'
  && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color)
);

const expectSurfaceStable = (
  evidence: SurfaceEvidence,
  surfaceCase: SurfaceCase,
  expectedControlCount: number,
  minimumControlHeight = 28,
): void => {
  expect(evidence.documentScrollWidth).toBeLessThanOrEqual(evidence.viewport.width + 1);
  expect(evidence.scrollWidth).toBeLessThanOrEqual(evidence.clientWidth + 1);
  expect(evidence.rect.width).toBeGreaterThan(0);
  expect(evidence.rect.height).toBeGreaterThan(0);
  expect(evidence.rect.left).toBeGreaterThanOrEqual(-1);
  expect(evidence.rect.top).toBeGreaterThanOrEqual(-1);
  expect(evidence.rect.right).toBeLessThanOrEqual(evidence.viewport.width + 1);
  expect(evidence.rect.bottom).toBeLessThanOrEqual(evidence.viewport.height + 1);
  expect(evidence.controls.length).toBe(expectedControlCount);
  for (const control of evidence.controls) {
    expect(control.visible).toBe(true);
    expect(control.width).toBeGreaterThanOrEqual(28);
    expect(control.height).toBeGreaterThanOrEqual(minimumControlHeight);
    expect(control.left).toBeGreaterThanOrEqual(-1);
    expect(control.top).toBeGreaterThanOrEqual(-1);
    expect(control.right).toBeLessThanOrEqual(evidence.viewport.width + 1);
    expect(control.bottom).toBeLessThanOrEqual(evidence.viewport.height + 1);
    expect(control.pointerEvents).not.toBe('none');
    expect(control.hit).toBe(true);
  }
  if (surfaceCase.themeType === 'dark') {
    expect(isOpaqueColor(evidence.backgroundColor)).toBe(true);
    expect(isOpaqueColor(evidence.color)).toBe(true);
  }
};

const waitForMonacoDiff = async (scopeSelector: string): Promise<void> => {
  const editor = await $(`${scopeSelector} .monaco-diff-editor`);
  await editor.waitForDisplayed({ timeout: 20_000 });
  await browser.waitUntil(async () => browser.execute((selector) => {
    const monaco = document.querySelector<HTMLElement>(`${selector} .monaco-diff-editor`);
    if (!monaco) return false;
    const rect = monaco.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, scopeSelector), {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: `Monaco diff did not acquire non-zero geometry in ${scopeSelector}`,
  });
};

const screenshotOptions = (surfaceCase: SurfaceCase) => ({
  directory: screenshotDirectory,
  includeTimestamp: false,
  prefix: surfaceCase.screenshotPrefix,
});

const mountStatusBar = () => browser.execute(async () => {
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  const statusModule = await import(
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    '/src/tools/editor/components/EditorStatusBar.tsx'
  );
  const popoverModule = await import(
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    '/src/tools/editor/components/StatusBarPopovers/StatusBarPopovers.tsx'
  );
  const EditorStatusBar = statusModule.EditorStatusBar ?? statusModule.default;
  const EncodingPopover = popoverModule.EncodingPopover;
  if (!createRoot || !EditorStatusBar || !EncodingPopover) {
    throw new Error('Unable to mount real status-bar components');
  }

  const host = document.createElement('div');
  host.id = 'status-bar-e2e-host';
  host.style.cssText = [
    'position:fixed',
    'left:max(24px, 28vw)',
    'right:24px',
    'bottom:40px',
    'z-index:10000',
    'border:1px solid var(--workspace-border-subtle)',
  ].join(';');
  document.body.appendChild(host);
  const root = createRoot(host);

  const Harness = () => {
    const [anchorRect, setAnchorRect] = React.useState(null);
    const triggerRef = React.useRef(null) as {
      current: HTMLButtonElement | null;
    };
    const closePopover = () => {
      setAnchorRect(null);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(EditorStatusBar, {
        line: 128,
        column: 24,
        selectedChars: 18,
        selectedLines: 2,
        language: 'typescript',
        encoding: 'UTF-8',
        tabSize: 2,
        insertSpaces: true,
        lspStatus: 'connected',
        onPositionClick: () => undefined,
        onIndentClick: () => undefined,
        onLanguageClick: () => undefined,
        onEncodingClick: (event: { currentTarget: HTMLButtonElement }) => {
          triggerRef.current = event.currentTarget;
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchorRect({
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          });
        },
      }),
      anchorRect
        ? React.createElement(EncodingPopover, {
          anchorRect,
          currentEncoding: 'UTF-8',
          onConfirm: () => undefined,
          onClose: closePopover,
        })
        : null,
    );
  };

  root.render(React.createElement(Harness));
  (window as unknown as Record<string, unknown>).__statusBarE2ERoot = root;
});

const mountRemoteFileBrowser = () => browser.execute(async (
  initialPath,
  fixtureFile,
) => {
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const remoteModule = await import('/src/features/ssh-remote/RemoteFileBrowser.tsx');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const sshModule = await import('/src/features/ssh-remote/sshApi.ts');
  const RemoteFileBrowser = remoteModule.RemoteFileBrowser ?? remoteModule.default;
  if (!createRoot || !RemoteFileBrowser || !sshModule.sshApi) {
    throw new Error('Unable to mount the real remote file browser');
  }

  const sshApi = sshModule.sshApi;
  const originalReadDir = sshApi.readDir;
  sshApi.readDir = async () => [
    {
      name: 'assets-for-character-reference-and-scene-production',
      path: `${initialPath}/assets-for-character-reference-and-scene-production`,
      isDir: true,
      isSymlink: false,
      modified: Date.now(),
    },
    {
      name: fixtureFile.slice(fixtureFile.lastIndexOf('/') + 1),
      path: fixtureFile,
      isDir: false,
      isSymlink: false,
      size: 4_096,
      modified: Date.now(),
    },
  ];
  const scopedWindow = window as unknown as Record<string, unknown>;
  scopedWindow.__remoteFileBrowserE2EApi = sshApi;
  scopedWindow.__remoteFileBrowserE2EReadDir = originalReadDir;

  const origin = document.createElement('button');
  origin.id = 'remote-file-browser-e2e-origin';
  origin.textContent = 'Remote browser origin';
  origin.style.position = 'fixed';
  origin.style.left = '-9999px';
  document.body.appendChild(origin);
  origin.focus();

  const host = document.createElement('div');
  host.id = 'remote-file-browser-e2e-host';
  document.body.appendChild(host);
  const root = createRoot(host);
  const Harness = () => {
    const [isOpen, setIsOpen] = React.useState(true);
    return isOpen
      ? React.createElement(RemoteFileBrowser, {
        connectionId: 'e2e-connection',
        initialPath,
        homePath: '/workspace',
        onSelect: (value: string) => {
          scopedWindow.__remoteFileBrowserSelected = value;
        },
        onCancel: () => setIsOpen(false),
      })
      : null;
  };
  root.render(React.createElement(Harness));
  scopedWindow.__remoteFileBrowserE2ERoot = root;
}, remoteFixtureRoot, remoteFixtureFile);

const mountSingleDiff = () => browser.execute(async () => {
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const diffModule = await import('/src/app/components/panels/DiffFullscreenViewer.tsx');
  const DiffFullscreenViewer = diffModule.DiffFullscreenViewer ?? diffModule.default;
  if (!createRoot || !DiffFullscreenViewer) {
    throw new Error('Unable to mount the real fullscreen diff viewer');
  }

  const origin = document.createElement('button');
  origin.id = 'diff-fullscreen-e2e-origin';
  origin.textContent = 'Diff origin';
  origin.style.position = 'fixed';
  origin.style.left = '-9999px';
  document.body.appendChild(origin);
  origin.focus();
  const host = document.createElement('div');
  host.id = 'diff-fullscreen-e2e-host';
  document.body.appendChild(host);
  const root = createRoot(host);
  const Harness = () => {
    const [isOpen, setIsOpen] = React.useState(true);
    return React.createElement(DiffFullscreenViewer, {
      isOpen,
      onClose: () => setIsOpen(false),
      filePath:
        '/workspace/productions/season-01/episode-0001/src/scenes/'
        + 'very-long-scene-composition-name-for-responsive-verification.ts',
      originalContent: 'const scene = "draft";\n',
      modifiedContent: 'const scene = "ready";\n',
      onAcceptFile: () => undefined,
      onRejectFile: () => undefined,
      onAcceptBlock: () => undefined,
      onRejectBlock: () => undefined,
    });
  };
  root.render(React.createElement(Harness));
  (window as unknown as Record<string, unknown>).__diffFullscreenE2ERoot = root;
});

const mountSnapshotDiff = () => browser.execute(async () => {
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactModule = await import('/node_modules/.vite/deps/react.js');
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const reactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  const snapshotModule = await import(
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    '/src/flow_chat/tool-cards/SnapshotFullscreenDiffViewer.tsx'
  );
  const SnapshotFullscreenDiffViewer = snapshotModule.SnapshotFullscreenDiffViewer;
  if (!createRoot || !SnapshotFullscreenDiffViewer) {
    throw new Error('Unable to mount the real snapshot diff viewer');
  }

  const origin = document.createElement('button');
  origin.id = 'snapshot-fullscreen-e2e-origin';
  origin.textContent = 'Snapshot origin';
  origin.style.position = 'fixed';
  origin.style.left = '-9999px';
  document.body.appendChild(origin);
  origin.focus();
  const host = document.createElement('div');
  host.id = 'snapshot-fullscreen-e2e-host';
  document.body.appendChild(host);
  const root = createRoot(host);
  const files = [
    {
      filePath:
        '/workspace/productions/season-01/episode-0001/src/scenes/'
        + 'very-long-opening-scene-name-for-responsive-verification.ts',
      originalContent: 'const scene = 1;\n',
      modifiedContent: 'const scene = 2;\n',
      fileStatus: 'pending',
    },
    {
      filePath:
        '/workspace/productions/season-01/episode-0001/src/assets/'
        + 'very-long-character-asset-board-name-for-responsive-verification.ts',
      originalContent: 'export const assets = [];\n',
      modifiedContent: 'export const assets = ["hero"];\n',
      fileStatus: 'accepted',
    },
  ];
  const Harness = () => {
    const [isOpen, setIsOpen] = React.useState(true);
    return React.createElement(SnapshotFullscreenDiffViewer, {
      isOpen,
      onClose: () => setIsOpen(false),
      files,
      onAcceptFile: async () => undefined,
      onRejectFile: async () => undefined,
      onAcceptBlock: async () => undefined,
      onRejectBlock: async () => undefined,
    });
  };
  root.render(React.createElement(Harness));
  (window as unknown as Record<string, unknown>).__snapshotFullscreenE2ERoot = root;
});

describe('L0 Minimal legacy editor surfaces', () => {
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
  });

  afterEach(async () => {
    await cleanupMountedSurfaces();
  });

  for (const surfaceCase of surfaceCases) {
    describe(
      `${surfaceCase.themeId} at ${surfaceCase.width}x${surfaceCase.height}`,
      () => {
        before(async () => {
          await cleanupMountedSurfaces();
          await configureSurfaceCase(sourceUrl, surfaceCase);
        });

        it('uses native status buttons and keyboard listbox navigation', async () => {
          await mountStatusBar();

          const statusBar = await $('.editor-status-bar');
          await statusBar.waitForDisplayed({ timeout: 10_000 });
          const actionCount = await browser.execute(() => (
            document.querySelectorAll('.editor-status-bar__action').length
          ));
          expect(actionCount).toBe(4);
          for (let index = 0; index < actionCount; index += 1) {
            const action = await $(`.editor-status-bar__action:nth-of-type(${index + 1})`);
            expect(await action.getTagName()).toBe('button');
          }

          await $('.editor-status-bar__action:nth-of-type(3)').click();
          const popover = await $('.status-bar-popover');
          await popover.waitForDisplayed({ timeout: 5_000 });
          expect(await $('.status-bar-popover__list').getAttribute('role')).toBe('listbox');
          expect(await browser.execute(() => (
            document.activeElement?.getAttribute('aria-selected')
          ))).toBe('true');
          const before = await browser.execute(() => document.activeElement?.textContent?.trim());
          await browser.keys(['ArrowDown']);
          const after = await browser.execute(() => document.activeElement?.textContent?.trim());
          expect(after).not.toBe(before);

          expectSurfaceStable(
            await readSurfaceEvidence('.editor-status-bar', '.editor-status-bar__action'),
            surfaceCase,
            4,
            19,
          );
          expectSurfaceStable(
            await readSurfaceEvidence('.status-bar-popover', '.status-bar-popover__item'),
            surfaceCase,
            7,
          );

          await saveScreenshot(
            `legacy-status-bar-popover${surfaceCase.screenshotNameSuffix}`,
            screenshotOptions(surfaceCase),
          );
          await saveElementScreenshot(
            '.status-bar-popover',
            `legacy-status-bar-popover${surfaceCase.screenshotNameSuffix}-surface`,
            screenshotOptions(surfaceCase),
          );

          await browser.keys(['Escape']);
          await popover.waitForDisplayed({ reverse: true, timeout: 5_000 });
          expect(await browser.execute(() => (
            document.activeElement?.classList.contains('editor-status-bar__action')
          ))).toBe(true);
        });

        it('operates real remote rows and context menus by keyboard', async () => {
          await mountRemoteFileBrowser();

          const dialog = await $('.remote-file-browser');
          await dialog.waitForDisplayed({ timeout: 10_000 });
          expect(await dialog.getAttribute('role')).toBe('dialog');
          expect(await dialog.getAttribute('aria-modal')).toBe('true');
          await browser.waitUntil(async () => browser.execute(() => (
            document.querySelectorAll('[data-remote-file-row]').length === 3
          )), {
            timeout: 10_000,
            interval: 100,
            timeoutMsg: 'Remote file fixture rows did not render',
          });

          const fileRow = await $(`[data-remote-file-path="${remoteFixtureFile}"]`);
          await fileRow.click();
          expect(await fileRow.getAttribute('aria-selected')).toBe('true');
          await browser.execute((fixtureFile) => {
            const row = document.querySelector<HTMLElement>(
              `[data-remote-file-path="${fixtureFile}"]`,
            );
            row?.focus();
            row?.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'F10',
              shiftKey: true,
              bubbles: true,
            }));
          }, remoteFixtureFile);
          const contextMenu = await $('.remote-file-browser__context-menu');
          await contextMenu.waitForDisplayed({ timeout: 5_000 });
          expect(await contextMenu.getAttribute('role')).toBe('menu');
          expect(await browser.execute(() => document.activeElement?.getAttribute('role')))
            .toBe('menuitem');

          expectSurfaceStable(
            await readSurfaceEvidence(
              '.remote-file-browser',
              [
                '.remote-file-browser__close-btn',
                '.remote-file-browser__breadcrumb-btn--edit',
                '.remote-file-browser__toolbar-btn',
              ].join(','),
            ),
            surfaceCase,
            5,
          );
          expectSurfaceStable(
            await readSurfaceEvidence(
              '.remote-file-browser__context-menu',
              '.remote-file-browser__context-menu-item',
            ),
            surfaceCase,
            4,
          );

          await saveScreenshot(
            `legacy-remote-file-browser${surfaceCase.screenshotNameSuffix}`,
            screenshotOptions(surfaceCase),
          );
          await saveElementScreenshot(
            '.remote-file-browser',
            `legacy-remote-file-browser${surfaceCase.screenshotNameSuffix}-surface`,
            screenshotOptions(surfaceCase),
          );

          await browser.keys(['ArrowDown']);
          expect(await browser.execute(() => document.activeElement?.getAttribute('role')))
            .toBe('menuitem');
          await browser.keys(['Escape']);
          await contextMenu.waitForDisplayed({ reverse: true, timeout: 5_000 });
          await browser.waitUntil(async () => browser.execute((fixtureFile) => (
            document.activeElement?.getAttribute('data-remote-file-path') === fixtureFile
          ), remoteFixtureFile), {
            timeout: 2_000,
            interval: 25,
            timeoutMsg: 'Remote context menu did not return focus to its file row',
          });

          await browser.keys(['Escape']);
          await dialog.waitForDisplayed({ reverse: true, timeout: 5_000 });
          expect(await browser.execute(() => document.activeElement?.id))
            .toBe('remote-file-browser-e2e-origin');
        });

        it('renders the real single-file diff as a compact focus-safe surface', async () => {
          await mountSingleDiff();

          const dialog = await $('.diff-fullscreen-container');
          await dialog.waitForDisplayed({ timeout: 15_000 });
          expect(await dialog.getAttribute('role')).toBe('dialog');
          expect(await dialog.getAttribute('aria-modal')).toBe('true');
          await $('.diff-editor-loading-overlay').waitForDisplayed({
            reverse: true,
            timeout: 20_000,
          });
          await waitForMonacoDiff('.diff-fullscreen-content');

          expectSurfaceStable(
            await readSurfaceEvidence(
              '.diff-fullscreen-container',
              '.diff-fullscreen-header .header-btn',
            ),
            surfaceCase,
            3,
          );

          await saveScreenshot(
            `legacy-single-diff${surfaceCase.screenshotNameSuffix}`,
            screenshotOptions(surfaceCase),
          );
          await saveElementScreenshot(
            '.diff-fullscreen-header',
            `legacy-single-diff${surfaceCase.screenshotNameSuffix}-header`,
            screenshotOptions(surfaceCase),
          );

          await browser.keys(['Escape']);
          await dialog.waitForDisplayed({ reverse: true, timeout: 5_000 });
          expect(await browser.execute(() => document.activeElement?.id))
            .toBe('diff-fullscreen-e2e-origin');
        });

        it('limits snapshot arrow navigation to the file switcher', async () => {
          await mountSnapshotDiff();

          const dialog = await $('.snapshot-fullscreen-container');
          await dialog.waitForDisplayed({ timeout: 15_000 });
          expect(await dialog.getAttribute('role')).toBe('dialog');
          expect(await dialog.getAttribute('aria-modal')).toBe('true');
          await waitForMonacoDiff('.snapshot-fullscreen-content');
          expect(await browser.execute(() => document.querySelectorAll('.file-tab').length))
            .toBe(2);
          const secondTab = await $('.file-tab:nth-of-type(2)');
          await browser.execute(() => {
            document.querySelector<HTMLElement>('.file-tab:nth-of-type(1)')?.focus();
          });
          await browser.keys(['ArrowRight']);
          expect(await secondTab.getAttribute('aria-pressed')).toBe('true');

          await browser.execute(() => {
            const content = document.querySelector<HTMLElement>('.snapshot-fullscreen-content');
            content?.setAttribute('tabindex', '0');
            content?.focus();
            content?.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'ArrowRight',
              bubbles: true,
            }));
          });
          expect(await secondTab.getAttribute('aria-pressed')).toBe('true');

          expectSurfaceStable(
            await readSurfaceEvidence(
              '.snapshot-fullscreen-container',
              [
                '.snapshot-fullscreen-header .header-btn',
                '.file-navigation .nav-btn',
                '.file-navigation .file-tab',
                '.current-file-actions .file-action-btn',
              ].join(','),
            ),
            surfaceCase,
            9,
          );

          await saveScreenshot(
            `legacy-snapshot-diff${surfaceCase.screenshotNameSuffix}`,
            screenshotOptions(surfaceCase),
          );
          await saveElementScreenshot(
            '.snapshot-fullscreen-header',
            `legacy-snapshot-diff${surfaceCase.screenshotNameSuffix}-header`,
            screenshotOptions(surfaceCase),
          );

          await browser.keys(['Escape']);
          await dialog.waitForDisplayed({ reverse: true, timeout: 5_000 });
          expect(await browser.execute(() => document.activeElement?.id))
            .toBe('snapshot-fullscreen-e2e-origin');
        });
      },
    );
  }

  after(async () => {
    const cleanupFailures: string[] = [];

    await attemptCleanup(cleanupFailures, 'remove mounted surface fixtures', async () => {
      await cleanupMountedSurfaces();
    });
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
    await attemptCleanup(cleanupFailures, 'verify fixture cleanup', async () => {
      const residue = await browser.execute((rootKeys, elementIds) => {
        const scopedWindow = window as unknown as Record<string, unknown>;
        return {
          elements: elementIds.filter((id) => Boolean(document.getElementById(id))),
          roots: rootKeys.filter((key) => Boolean(scopedWindow[key])),
          sshApiMock: Boolean(
            scopedWindow.__remoteFileBrowserE2EApi
            || scopedWindow.__remoteFileBrowserE2EReadDir,
          ),
        };
      }, [...mountedRootKeys], [...mountedElementIds]);
      if (residue.elements.length > 0 || residue.roots.length > 0 || residue.sshApiMock) {
        throw new Error(`fixture residue: ${JSON.stringify(residue)}`);
      }
    });

    if (cleanupFailures.length > 0) {
      throw new Error(
        `Legacy surface visual contract cleanup failed:\n${cleanupFailures.join('\n')}`,
      );
    }
  });
});
