import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { openWorkspace } from '../helpers/workspace-helper';
import {
  saveElementScreenshot,
  saveScreenshot,
} from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);
const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();

type TauriInternals = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

type ToolbarEvidence = {
  controlsVisible: boolean;
  controlsInsideGallery: boolean;
  controlsTop: number;
  documentOverflow: number;
  filterExpanded: string | null;
  filterButtonCount: number;
  filterButtonsInsideGallery: boolean;
  filterPanelInsideGallery: boolean;
  filterVisible: boolean;
  galleryWidth: number;
  galleryOverflow: number;
  inputAriaLabel: string | null;
  inputOpacity: string;
  inputPointerEvents: string;
  rowCount: number;
  searchInsideGallery: boolean;
  searchTop: number;
  searchWidth: number;
  toolbarHeight: number;
  toolbarMainHeight: number;
  toolbarMainInsideGallery: boolean;
  viewButtonCount: number;
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

const readToolbarEvidence = (): Promise<ToolbarEvidence> =>
  browser.execute(() => {
    const gallery = document.querySelector<HTMLElement>(
      '.workspace-media-gallery',
    );
    const toolbar = document.querySelector<HTMLElement>(
      '.workspace-media-gallery__toolbar',
    );
    const toolbarMain = document.querySelector<HTMLElement>(
      '.workspace-media-gallery__toolbar-main',
    );
    const searchRow = document.querySelector<HTMLElement>(
      '.workspace-media-gallery__search-row',
    );
    const search = document.querySelector<HTMLElement>(
      '.workspace-media-gallery__search',
    );
    const input = document.querySelector<HTMLInputElement>(
      '.workspace-media-gallery__search input',
    );
    const controls = document.querySelector<HTMLElement>(
      '.workspace-media-gallery__controls-row',
    );
    const filterToggle = document.querySelector<HTMLButtonElement>(
      '.workspace-media-gallery__refinement-toggle',
    );
    const filterPanel = document.querySelector<HTMLElement>(
      '.workspace-media-gallery__refinement-panel',
    );
    const inputStyle = input ? getComputedStyle(input) : null;
    const galleryRect = gallery?.getBoundingClientRect();
    const toolbarMainRect = toolbarMain?.getBoundingClientRect();
    const searchRowRect = searchRow?.getBoundingClientRect();
    const controlsRect = controls?.getBoundingClientRect();
    const filterPanelRect = filterPanel?.getBoundingClientRect();
    const isInsideGallery = (rect: DOMRect | undefined) => Boolean(
      galleryRect
      && rect
      && rect.left >= galleryRect.left - 1
      && rect.right <= galleryRect.right + 1
    );
    const rowTops = [searchRowRect, controlsRect]
      .filter((rect): rect is DOMRect => Boolean(rect && rect.height > 0))
      .map(rect => Math.round(rect.top));
    const filterButtons = filterPanel
      ? Array.from(filterPanel.querySelectorAll<HTMLElement>(
        '.workspace-media-gallery__filters button',
      ))
      : [];
    return {
      controlsVisible: Boolean(
        controls && controls.getBoundingClientRect().height > 0,
      ),
      controlsInsideGallery: isInsideGallery(controlsRect),
      controlsTop: controlsRect?.top ?? -1,
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filterExpanded: filterToggle?.getAttribute('aria-expanded') ?? null,
      filterButtonCount: filterButtons.length,
      filterButtonsInsideGallery: Boolean(
        galleryRect
        && filterButtons.length === 4
        && filterButtons.every((button) => {
          const rect = button.getBoundingClientRect();
          return (
            rect.left >= galleryRect.left - 1
            && rect.right <= galleryRect.right + 1
          );
        }),
      ),
      filterPanelInsideGallery: Boolean(
        galleryRect
        && filterPanelRect
        && filterPanelRect.left >= galleryRect.left - 1
        && filterPanelRect.right <= galleryRect.right + 1
      ),
      filterVisible: Boolean(
        filterPanel
        && !filterPanel.hidden
        && filterPanel.getBoundingClientRect().height > 0
      ),
      galleryWidth: galleryRect?.width ?? 0,
      galleryOverflow: gallery
        ? gallery.scrollWidth - gallery.clientWidth
        : Number.POSITIVE_INFINITY,
      inputAriaLabel: input?.getAttribute('aria-label') ?? null,
      inputOpacity: inputStyle?.opacity ?? '',
      inputPointerEvents: inputStyle?.pointerEvents ?? '',
      rowCount: new Set(rowTops).size,
      searchInsideGallery: isInsideGallery(searchRowRect),
      searchTop: searchRowRect?.top ?? -1,
      searchWidth: search?.getBoundingClientRect().width ?? 0,
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? 0,
      toolbarMainHeight: toolbarMainRect?.height ?? 0,
      toolbarMainInsideGallery: isInsideGallery(toolbarMainRect),
      viewButtonCount:
        controls?.querySelectorAll('.workspace-media-gallery__views button')
          .length ?? 0,
    };
  });

const waitForMinimalPresentation = () => browser.waitUntil(
  async () => browser.execute(() => (
    document
      .querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === 'minimal'
    && !document.querySelector('.splash-screen')
  )),
  {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not settle for media verification',
  },
);

const waitForTheme = (themeId: string) => browser.waitUntil(
  async () => browser.execute((expectedThemeId) => (
    document.documentElement.getAttribute('data-theme') === expectedThemeId
    && !document.querySelector('.splash-screen')
  ), themeId),
  {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: `Theme ${themeId} did not settle for media verification`,
  },
);

const dismissVisibleNotifications = () => browser.execute(() => {
  document.querySelectorAll<HTMLButtonElement>('.notification-item__close')
    .forEach(button => button.click());
});

describe('L0 minimal media toolbar visual contract', () => {
  let sourceUrl = '';
  let originalThemeSelection = 'system';
  let originalWindowSize = { width: 1280, height: 800 };
  let createdMediaSessionId: string | null = null;

  before(async () => {
    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    const themeSelection = await readThemeSelection();
    if (typeof themeSelection === 'string' && themeSelection.length > 0) {
      originalThemeSelection = themeSelection;
    }

    await writeThemeSelection('void-light');
    await browser.url(sourceUrl);
    await waitForMinimalPresentation();
    await waitForTheme('void-light');

    const hasWorkspace = await openWorkspace(TEST_WORKSPACE_PATH);
    expect(hasWorkspace).toBe(true);
    await browser.setWindowSize(1280, 800);
    await waitForMinimalPresentation();
    await waitForTheme('void-light');

    createdMediaSessionId = await browser.execute(async () => {
      const { useAgentCanvasStore } = await import(
        '/src/app/components/panels/content-canvas/stores/index.ts'
      );
      const { globalStateAPI } = await import(
        '/src/shared/types/global-state.ts'
      );
      const { flowChatManager } = await import(
        '/src/flow_chat/services/FlowChatManager.ts'
      );
      const { openMainSession } = await import(
        '/src/flow_chat/services/openBtwSession.ts'
      );
      useAgentCanvasStore.getState().reset();
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('Expected a workspace before creating the Media session');
      }
      const sessionId = await flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
      await openMainSession(sessionId);
      return sessionId;
    });

    await browser.execute(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });
    await $('.workspace-media-gallery').waitForDisplayed({ timeout: 15_000 });
    await $('.workspace-media-gallery__toolbar').waitForDisplayed({
      timeout: 10_000,
    });
    await dismissVisibleNotifications();
  });

  it('keeps the idle search at icon width and all media controls reachable', async () => {
    const evidence = await readToolbarEvidence();
    expect(evidence.galleryWidth).toBeGreaterThan(0);
    if (evidence.galleryWidth > 460) {
      expect(evidence.rowCount).toBe(1);
      expect(evidence.toolbarHeight).toBeGreaterThanOrEqual(38);
      expect(evidence.toolbarHeight).toBeLessThanOrEqual(43);
      expect(evidence.toolbarMainHeight).toBeGreaterThanOrEqual(27);
      expect(evidence.toolbarMainHeight).toBeLessThanOrEqual(31);
      expect(Math.abs(evidence.searchTop - evidence.controlsTop))
        .toBeLessThanOrEqual(1);
    } else {
      expect(evidence.rowCount).toBe(2);
      expect(evidence.toolbarHeight).toBeGreaterThanOrEqual(65);
      expect(evidence.toolbarHeight).toBeLessThanOrEqual(72);
      expect(evidence.toolbarMainHeight).toBeGreaterThanOrEqual(56);
      expect(evidence.toolbarMainHeight).toBeLessThanOrEqual(63);
      expect(evidence.controlsTop - evidence.searchTop).toBeGreaterThanOrEqual(27);
    }
    expect(evidence.toolbarMainInsideGallery).toBe(true);
    expect(evidence.searchInsideGallery).toBe(true);
    expect(evidence.controlsInsideGallery).toBe(true);
    expect(evidence.searchWidth).toBeGreaterThanOrEqual(26);
    expect(evidence.searchWidth).toBeLessThanOrEqual(30);
    expect(evidence.inputOpacity).toBe('0');
    expect(evidence.inputPointerEvents).toBe('none');
    expect(evidence.inputAriaLabel).toBeTruthy();
    expect(evidence.controlsVisible).toBe(true);
    expect(evidence.viewButtonCount).toBe(2);
    expect(evidence.filterExpanded).toBe('false');
    expect(evidence.galleryOverflow).toBeLessThanOrEqual(1);
    expect(evidence.documentOverflow).toBeLessThanOrEqual(1);

    await saveElementScreenshot(
      '.workspace-media-gallery',
      'media-toolbar-collapsed-light',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice21-minimal',
      },
    );
    await saveScreenshot('media-toolbar-collapsed-light-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice21-minimal',
    });
  });

  it('expands search on focus/query and collapses again after clearing', async () => {
    const input = await $('.workspace-media-gallery__search input');
    await browser.execute(() => {
      document.querySelector<HTMLInputElement>(
        '.workspace-media-gallery__search input',
      )?.focus();
    });
    await browser.waitUntil(async () => (
      (await readToolbarEvidence()).searchWidth >= 140
    ), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Media search did not expand on focus',
    });

    await input.setValue('png');
    await browser.execute(() => {
      document.querySelector<HTMLInputElement>(
        '.workspace-media-gallery__search input',
      )?.blur();
    });
    await browser.waitUntil(async () => (
      (await readToolbarEvidence()).inputOpacity === '1'
    ), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Media search did not finish revealing the query input',
    });
    const queried = await readToolbarEvidence();
    expect(queried.searchWidth).toBeGreaterThanOrEqual(140);
    expect(queried.inputOpacity).toBe('1');
    expect(queried.controlsVisible).toBe(true);

    await saveElementScreenshot(
      '.workspace-media-gallery',
      'media-toolbar-query-light',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice21-minimal',
      },
    );

    const clear = await $('.workspace-media-gallery__search button');
    await clear.click();
    await browser.execute(() => {
      document.querySelector<HTMLInputElement>(
        '.workspace-media-gallery__search input',
      )?.blur();
    });
    await browser.waitUntil(async () => (
      (await readToolbarEvidence()).searchWidth <= 30
    ), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Media search did not collapse after clearing and blur',
    });
  });

  it('keeps refinements keyboard-safe and responsive in dark narrow mode', async () => {
    await writeThemeSelection('void-dark');
    await browser.url(sourceUrl);
    await browser.setWindowSize(720, 720);
    await waitForMinimalPresentation();
    await waitForTheme('void-dark');
    if (!createdMediaSessionId) {
      throw new Error('Expected the Media session before dark-theme verification');
    }
    await browser.execute(async (sessionId) => {
      const { openMainSession } = await import(
        '/src/flow_chat/services/openBtwSession.ts'
      );
      await openMainSession(sessionId);
    }, createdMediaSessionId);
    await $('.void-session-scene').waitForDisplayed({ timeout: 20_000 });
    await browser.execute(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });
    await $('.workspace-media-gallery').waitForDisplayed({ timeout: 10_000 });
    await dismissVisibleNotifications();

    const toggle = await $('.workspace-media-gallery__refinement-toggle');
    await toggle.click();
    await $('.workspace-media-gallery__refinement-panel').waitForDisplayed({
      timeout: 5_000,
    });
    const opened = await readToolbarEvidence();
    expect(opened.filterExpanded).toBe('true');
    expect(opened.filterVisible).toBe(true);
    expect(opened.filterButtonCount).toBe(4);
    expect(opened.filterButtonsInsideGallery).toBe(true);
    expect(opened.filterPanelInsideGallery).toBe(true);
    expect(opened.galleryOverflow).toBeLessThanOrEqual(1);
    expect(opened.documentOverflow).toBeLessThanOrEqual(1);

    await saveElementScreenshot(
      '.workspace-media-gallery',
      'media-toolbar-filters-dark-narrow',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice21-minimal',
      },
    );
    await saveScreenshot('media-toolbar-filters-dark-narrow-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice21-minimal',
    });

    await browser.keys(['Escape']);
    await browser.waitUntil(async () => (
      (await toggle.getAttribute('aria-expanded')) === 'false'
    ), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Media refinements did not close with Escape',
    });
    expect(await toggle.isFocused()).toBe(true);
  });

  after(async () => {
    const cleanupErrors: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(
          `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    if (createdMediaSessionId) {
      const sessionId = createdMediaSessionId;
      await attempt('delete media session', async () => {
        await browser.execute(async (id) => {
          const { flowChatManager } = await import(
            '/src/flow_chat/services/FlowChatManager.ts'
          );
          await flowChatManager.deleteChatSession(id);
        }, sessionId);
      });
    }
    await attempt('restore theme', async () => {
      await writeThemeSelection(originalThemeSelection);
    });
    await attempt('restore URL', async () => {
      await browser.url(sourceUrl);
      await browser.waitUntil(async () => browser.execute(() => (
        Boolean(document.querySelector('[data-testid="app-layout"]'))
        && !document.querySelector('.splash-screen')
      )), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: 'Original URL did not settle during media cleanup',
      });
    });
    await attempt('restore window size', async () => {
      await browser.setWindowSize(
        originalWindowSize.width,
        originalWindowSize.height,
      );
    });
    await attempt('verify theme restore', async () => {
      const restored = await readThemeSelection();
      if (restored !== originalThemeSelection) {
        throw new Error(
          `expected ${originalThemeSelection}, received ${String(restored)}`,
        );
      }
    });
    if (cleanupErrors.length > 0) {
      throw new Error(`Media visual cleanup failed:\n${cleanupErrors.join('\n')}`);
    }
  });
});

type MediaShadowFixtureWindow = Window & {
  __VOID_MEDIA_SHADOW_E2E_FIXTURE__?: {
    appRoot: HTMLElement | null;
    appRootAriaHidden: string | null;
    appRootInert: boolean;
    appRootStyle: string;
    colorScheme: string;
    host: HTMLElement;
    onError: (event: ErrorEvent) => void;
    onUnhandledRejection: (event: PromiseRejectionEvent) => void;
    root: { unmount(): void };
    theme: string | null;
    themeType: string | null;
  };
};

const MEDIA_SHADOW_FIXTURE_HOST = '#media-shadow-minimal-e2e-host';

const mountMediaShadowFixture = () => browser.execute(async () => {
  const fixtureWindow = window as MediaShadowFixtureWindow;
  const existingFixture = fixtureWindow.__VOID_MEDIA_SHADOW_E2E_FIXTURE__;
  if (existingFixture) {
    if (existingFixture.host.isConnected) {
      return;
    }
    throw new Error(
      'The media shadow fixture record exists but its host is disconnected',
    );
  }

  const [gallerySource, headerSource, mainSource] = await Promise.all([
    fetch(
      '/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.tsx',
    ).then(response => response.text()),
    fetch('/src/flow_chat/components/modern/FlowChatHeader.tsx')
      .then(response => response.text()),
    fetch('/src/main.tsx').then(response => response.text()),
  ]);
  const reactPath = headerSource.match(
    /from "([^"]*\/react\.js[^"]*)"/,
  )?.[1] ?? gallerySource.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
  const reactDomPath = mainSource.match(
    /from "([^"]*\/react-dom_client\.js[^"]*)"/,
  )?.[1];
  const workspaceContextPath = headerSource.match(
    /from "([^"]*\/infrastructure\/contexts\/WorkspaceContext\.ts[^"]*)"/,
  )?.[1];
  const presentationActivityPath = headerSource.match(
    /from "([^"]*\/flow_chat\/components\/modern\/FlowChatPresentationActivity\.tsx[^"]*)"/,
  )?.[1];
  if (
    !reactPath
    || !reactDomPath
    || !workspaceContextPath
    || !presentationActivityPath
  ) {
    throw new Error(
      'Unable to resolve the exact Vite modules used by FlowChatHeader',
    );
  }

  const reactModule = await import(reactPath);
  const reactDomModule = await import(reactDomPath);
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const galleryModule = await import(
    '/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.tsx'
  );
  // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
  const headerModule = await import(
    '/src/flow_chat/components/modern/FlowChatHeader.tsx'
  );
  const workspaceContextModule = await import(workspaceContextPath);
  const presentationModule = await import(presentationActivityPath);

  const React = reactModule.default ?? reactModule;
  const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
  const WorkspaceMediaGallery = galleryModule.WorkspaceMediaGallery;
  const FlowChatHeader = headerModule.FlowChatHeader;
  const WorkspaceContext = workspaceContextModule.WorkspaceContext;
  const FlowChatPresentationActivityProvider =
    presentationModule.FlowChatPresentationActivityProvider;
  if (
    !createRoot
    || !WorkspaceMediaGallery
    || !FlowChatHeader
    || !WorkspaceContext
    || !FlowChatPresentationActivityProvider
  ) {
    throw new Error('Unable to mount the real media and Flow Chat components');
  }

  const appRoot = document.getElementById('root');
  const appRootAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
  const appRootInert = appRoot?.inert ?? false;
  const appRootStyle = appRoot?.getAttribute('style') ?? '';
  if (appRoot) {
    appRoot.style.display = 'none';
    appRoot.setAttribute('aria-hidden', 'true');
    appRoot.inert = true;
  }

  const documentRoot = document.documentElement;
  const host = document.createElement('div');
  host.id = 'media-shadow-minimal-e2e-host';
  host.className = 'void-ui--minimal';
  host.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483000',
    'overflow:auto',
    'padding:24px',
    'background:var(--workspace-surface-canvas)',
    'color:var(--workspace-text-primary)',
  ].join(';');
  document.body.appendChild(host);
  const describeReason = (reason: unknown) => (
    reason instanceof Error ? reason.message : String(reason)
  );
  const onError = (event: ErrorEvent) => {
    host.dataset.renderError = event.error
      ? describeReason(event.error)
      : event.message;
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    host.dataset.renderError = describeReason(event.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  const svgPreview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#1f2937"/>
      <rect x="42" y="42" width="876" height="456" rx="18" fill="#334155"/>
      <circle cx="310" cy="250" r="96" fill="#94a3b8"/>
      <path d="M480 360L620 190l210 250H480z" fill="#64748b"/>
    </svg>
  `)}`;
  const mediaService = {
    checkAvailability: async () => ({
      status: 'available',
      firstDetectedAt: 1,
    }),
    scanLibrary: async () => ({
      status: 'ready',
      scannedAt: 1,
      items: [
        {
          id: 'fixture-storyboard',
          kind: 'image',
          source: 'generated',
          filePath: 'C:/fixture/media/generated/storyboard-frame.png',
          relativePath: 'media/generated/storyboard-frame.png',
          fileName: 'storyboard-frame.png',
          extension: 'png',
          sizeBytes: 245_760,
          modifiedAt: Date.now() - 60_000,
          width: 960,
          height: 540,
          previewUrl: svgPreview,
        },
        {
          id: 'fixture-dialogue',
          kind: 'audio',
          source: 'input',
          filePath: 'C:/fixture/media/input/dialogue.wav',
          relativePath: 'media/input/dialogue.wav',
          fileName: 'dialogue.wav',
          extension: 'wav',
          sizeBytes: 98_304,
          modifiedAt: Date.now() - 120_000,
          durationMs: 12_000,
          previewUrl: 'data:audio/wav;base64,UklGRg==',
        },
      ],
    }),
    listTrash: async () => ({
      status: 'ready',
      items: [],
      checkedAt: 1,
    }),
    deleteItems: async () => ({
      status: 'ready',
      items: [],
      checkedAt: 1,
    }),
  };

  const fixtureWorkspace = {
    id: 'fixture-workspace',
    name: 'Media fixture',
    rootPath: 'C:/fixture',
    workspaceKind: 'normal',
    relatedPaths: [],
  };
  const workspaceContextValue = {
    currentWorkspace: fixtureWorkspace,
    openedWorkspaces: new Map([[fixtureWorkspace.id, fixtureWorkspace]]),
    activeWorkspaceId: fixtureWorkspace.id,
    lastUsedWorkspaceId: fixtureWorkspace.id,
    recentWorkspaces: [fixtureWorkspace],
    loading: false,
    error: null,
    activeWorkspace: fixtureWorkspace,
    openedWorkspacesList: [fixtureWorkspace],
    normalWorkspacesList: [fixtureWorkspace],
    assistantWorkspacesList: [],
    openWorkspace: async () => fixtureWorkspace,
    createAssistantWorkspace: async () => fixtureWorkspace,
    closeWorkspace: async () => undefined,
    closeWorkspaceById: async () => undefined,
    deleteAssistantWorkspace: async () => undefined,
    resetAssistantWorkspace: async () => fixtureWorkspace,
    switchWorkspace: async () => fixtureWorkspace,
    setActiveWorkspace: async () => fixtureWorkspace,
    reorderOpenedWorkspacesInSection: async () => undefined,
    updateWorkspaceRelatedPaths: async () => fixtureWorkspace,
    scanWorkspaceInfo: async () => fixtureWorkspace,
    refreshRecentWorkspaces: async () => undefined,
    removeWorkspaceFromRecent: async () => undefined,
    hasWorkspace: true,
    workspaceName: fixtureWorkspace.name,
    workspacePath: fixtureWorkspace.rootPath,
  };

  class FixtureErrorBoundary extends React.Component {
    state = { error: '' };

    static getDerivedStateFromError(error: unknown) {
      return { error: describeReason(error) };
    }

    componentDidCatch(error: unknown) {
      host.dataset.renderError = describeReason(error);
    }

    render() {
      if (this.state.error) {
        return React.createElement(
          'pre',
          { 'data-testid': 'media-shadow-render-error' },
          this.state.error,
        );
      }
      return this.props.children;
    }
  }

  const root = createRoot(host);
  fixtureWindow.__VOID_MEDIA_SHADOW_E2E_FIXTURE__ = {
    appRoot,
    appRootAriaHidden,
    appRootInert,
    appRootStyle,
    colorScheme: documentRoot.style.colorScheme,
    host,
    onError,
    onUnhandledRejection,
    root,
    theme: documentRoot.getAttribute('data-theme'),
    themeType: documentRoot.getAttribute('data-theme-type'),
  };

  root.render(
    React.createElement(
      FixtureErrorBoundary,
      null,
      React.createElement(
        'main',
      {
        'data-testid': 'media-shadow-minimal-fixture',
        style: {
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 0.72fr)',
          gap: '24px',
          width: 'min(1120px, 100%)',
          minHeight: '620px',
          margin: '0 auto',
        },
      },
      React.createElement(
        'section',
        {
          'data-testid': 'media-selection-surface',
          style: {
            minWidth: 0,
            height: '620px',
            overflow: 'hidden',
            border: '1px solid var(--workspace-border-subtle)',
            borderRadius: 'var(--workspace-radius-panel)',
            background: 'var(--workspace-surface-panel)',
          },
        },
        React.createElement(WorkspaceMediaGallery, {
          workspacePath: 'C:/fixture',
          isActive: true,
          service: mediaService,
          imagePreviewResolver: async () => svgPreview,
          mediaPreviewResolver: async () => undefined,
        }),
      ),
      React.createElement(
        'section',
        {
          'data-testid': 'flowchat-menu-surface',
          style: {
            position: 'relative',
            minWidth: 0,
            height: '360px',
            overflow: 'visible',
            border: '1px solid var(--workspace-border-subtle)',
            borderRadius: 'var(--workspace-radius-panel)',
            background: 'var(--workspace-surface-panel)',
          },
        },
        React.createElement(
          WorkspaceContext.Provider,
          { value: workspaceContextValue },
          React.createElement(
            FlowChatPresentationActivityProvider,
            { isActive: true },
            React.createElement(FlowChatHeader, {
              currentTurn: 1,
              totalTurns: 2,
              currentUserMessage: 'Review the selected media asset',
              visible: true,
              turns: [
                { turnId: 'fixture-turn-1', turnIndex: 1, title: 'Select media' },
                { turnId: 'fixture-turn-2', turnIndex: 2, title: 'Review output' },
              ],
              onJumpToTurn: () => true,
              onJumpToPreviousTurn: () => undefined,
              onJumpToNextTurn: () => undefined,
            }),
          ),
        ),
        React.createElement('span', {
          'aria-hidden': 'true',
          'data-testid': 'raised-shadow-probe',
          style: {
            position: 'absolute',
            left: '-10000px',
            boxShadow: 'var(--workspace-shadow-raised)',
            color: 'var(--workspace-accent)',
          },
        }),
        React.createElement('span', {
          'aria-hidden': 'true',
          'data-testid': 'menu-focus-token-probe',
          style: {
            position: 'absolute',
            left: '-10000px',
            background: 'var(--workspace-surface-hover)',
            outline: '2px solid var(--workspace-focus-ring)',
          },
        }),
      ),
    ),
    ),
  );

  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  if (host.dataset.renderError) {
    throw new Error(`Media shadow fixture render failed: ${host.dataset.renderError}`);
  }
});

const cleanupMediaShadowFixture = () => browser.execute(async () => {
  const fixtureWindow = window as MediaShadowFixtureWindow;
  const fixture = fixtureWindow.__VOID_MEDIA_SHADOW_E2E_FIXTURE__;
  if (!fixture) {
    return !document.querySelector('#media-shadow-minimal-e2e-host');
  }

  fixture.root.unmount();
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  window.removeEventListener('error', fixture.onError);
  window.removeEventListener(
    'unhandledrejection',
    fixture.onUnhandledRejection,
  );
  fixture.host.remove();

  const documentRoot = document.documentElement;
  const restoreAttribute = (name: string, value: string | null) => {
    if (value === null) documentRoot.removeAttribute(name);
    else documentRoot.setAttribute(name, value);
  };
  restoreAttribute('data-theme', fixture.theme);
  restoreAttribute('data-theme-type', fixture.themeType);
  documentRoot.style.colorScheme = fixture.colorScheme;
  if (fixture.appRoot) {
    if (fixture.appRootStyle) {
      fixture.appRoot.setAttribute('style', fixture.appRootStyle);
    } else {
      fixture.appRoot.removeAttribute('style');
    }
    if (fixture.appRootAriaHidden === null) {
      fixture.appRoot.removeAttribute('aria-hidden');
    } else {
      fixture.appRoot.setAttribute('aria-hidden', fixture.appRootAriaHidden);
    }
    fixture.appRoot.inert = fixture.appRootInert;
  }
  delete fixtureWindow.__VOID_MEDIA_SHADOW_E2E_FIXTURE__;
  return (
    !document.querySelector('#media-shadow-minimal-e2e-host')
    && fixtureWindow.__VOID_MEDIA_SHADOW_E2E_FIXTURE__ === undefined
  );
});

const readMediaSelectionEvidence = () => browser.execute(() => {
  const host = document.querySelector<HTMLElement>(
    '#media-shadow-minimal-e2e-host',
  );
  const gallery = host?.querySelector<HTMLElement>('.workspace-media-gallery');
  const shell = host?.querySelector<HTMLElement>(
    '[data-workspace-media-preview-key*="fixture-storyboard"]',
  );
  const card = shell?.querySelector<HTMLElement>('.workspace-media-card');
  const select = shell?.querySelector<HTMLButtonElement>(
    'button[aria-label^="Select "]',
  );
  const selectionBar = host?.querySelector<HTMLElement>(
    '.workspace-media-gallery__selection-bar',
  );
  const probe = host?.querySelector<HTMLElement>(
    '[data-testid="raised-shadow-probe"]',
  );
  const cardStyle = card ? getComputedStyle(card) : null;
  const probeStyle = probe ? getComputedStyle(probe) : null;
  return {
    accentColor: probeStyle?.color ?? '',
    borderColor: cardStyle?.borderColor ?? '',
    boxShadow: cardStyle?.boxShadow ?? '',
    galleryOverflow: gallery
      ? gallery.scrollWidth - gallery.clientWidth
      : Number.POSITIVE_INFINITY,
    pressed: select?.getAttribute('aria-pressed') ?? null,
    selected: shell?.classList.contains('is-selected') ?? false,
    selectionBarHeight: selectionBar?.getBoundingClientRect().height ?? 0,
    surfaceOverflow: host
      ? host.scrollWidth - host.clientWidth
      : Number.POSITIVE_INFINITY,
  };
});

const readFlowChatMenuEvidence = () => browser.execute(() => {
  const host = document.querySelector<HTMLElement>(
    '#media-shadow-minimal-e2e-host',
  );
  const trigger = host?.querySelector<HTMLButtonElement>(
    '[data-testid="flowchat-header-more-actions"]',
  );
  const menu = host?.querySelector<HTMLElement>('.flowchat-header__more-menu');
  const items = menu
    ? Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    : [];
  const enabledItems = items.filter(item => !item.disabled);
  const probe = host?.querySelector<HTMLElement>(
    '[data-testid="raised-shadow-probe"]',
  );
  const focusProbe = host?.querySelector<HTMLElement>(
    '[data-testid="menu-focus-token-probe"]',
  );
  const focusedItem = document.activeElement instanceof HTMLButtonElement
    && document.activeElement.getAttribute('role') === 'menuitem'
    ? document.activeElement
    : null;
  const focusedStyle = focusedItem ? getComputedStyle(focusedItem) : null;
  const focusProbeStyle = focusProbe ? getComputedStyle(focusProbe) : null;
  const focusedRect = focusedItem?.getBoundingClientRect() ?? null;
  const menuRect = menu?.getBoundingClientRect() ?? null;
  return {
    expanded: trigger?.getAttribute('aria-expanded') ?? null,
    focusedEnabledIndex: enabledItems.indexOf(
      document.activeElement as HTMLButtonElement,
    ),
    focusedTestId:
      (document.activeElement as HTMLElement | null)?.dataset.testid ?? null,
    menuItemCount: items.length,
    menuRole: menu?.getAttribute('role') ?? null,
    menuShadow: menu ? getComputedStyle(menu).boxShadow : '',
    focusedBackground: focusedStyle?.backgroundColor ?? '',
    focusedInsideMenu: Boolean(
      focusedRect
      && menuRect
      && focusedRect.top >= menuRect.top - 1
      && focusedRect.right <= menuRect.right + 1
      && focusedRect.bottom <= menuRect.bottom + 1
      && focusedRect.left >= menuRect.left - 1
    ),
    focusedIsFocus: focusedItem?.matches(':focus') ?? false,
    // Diagnostic only: WebView keyboard modality does not guarantee this value.
    focusedIsFocusVisible: focusedItem?.matches(':focus-visible') ?? false,
    focusedOutlineColor: focusedStyle?.outlineColor ?? '',
    focusedOutlineStyle: focusedStyle?.outlineStyle ?? '',
    focusedOutlineWidth: focusedStyle?.outlineWidth ?? '',
    tokenFocusColor: focusProbeStyle?.outlineColor ?? '',
    tokenHoverBackground: focusProbeStyle?.backgroundColor ?? '',
    tokenShadow: probe ? getComputedStyle(probe).boxShadow : '',
    triggerFocused: document.activeElement === trigger,
  };
});

const mountMediaShadowTheme = async (
  sourceUrl: string,
  themeId: 'void-light' | 'void-dark',
) => {
  expect(await cleanupMediaShadowFixture()).toBe(true);
  await writeThemeSelection(themeId);
  await browser.url(sourceUrl);
  await browser.setWindowSize(1280, 800);
  await waitForMinimalPresentation();
  await waitForTheme(themeId);
  await mountMediaShadowFixture();
  await browser.waitUntil(async () => {
    const fixtureState = await browser.execute(() => {
      const host = document.getElementById('media-shadow-minimal-e2e-host');
      return {
        error: host?.dataset.renderError ?? '',
        ready: Boolean(
          host
          ?.querySelector<HTMLElement>(
            '[data-testid="media-shadow-minimal-fixture"]',
          )
          ?.getBoundingClientRect().height,
        ),
      };
    });
    if (fixtureState.error) {
      throw new Error(`Media shadow fixture render failed: ${fixtureState.error}`);
    }
    return fixtureState.ready;
  }, {
    timeout: 15_000,
    interval: 50,
    timeoutMsg: 'The real media and Flow Chat fixture did not become visible',
  });
  await $('[data-testid="workspace-media-card-fixture-storyboard"]')
    .waitForDisplayed({ timeout: 10_000 });
};

const verifyMediaShadowTheme = async (themeName: 'light' | 'dark') => {
  const select = await $(
    `${MEDIA_SHADOW_FIXTURE_HOST} button[aria-label="Select storyboard-frame.png"]`,
  );
  await select.click();
  await browser.waitUntil(async () => {
    const current = await readMediaSelectionEvidence();
    return (
      current.pressed === 'true'
      && current.selected
      && current.borderColor === current.accentColor
    );
  }, {
    timeout: 3_000,
    interval: 50,
    timeoutMsg:
      'The real media selection did not settle to its semantic accent border',
  });

  const selected = await readMediaSelectionEvidence();
  expect(selected.pressed).toBe('true');
  expect(selected.selected).toBe(true);
  expect(selected.boxShadow).not.toBe('none');
  expect(selected.boxShadow).toContain('inset');
  expect(selected.borderColor).toBe(selected.accentColor);
  expect(selected.selectionBarHeight).toBeGreaterThan(0);
  expect(selected.galleryOverflow).toBeLessThanOrEqual(1);
  expect(selected.surfaceOverflow).toBeLessThanOrEqual(1);

  await saveElementScreenshot(
    '[data-testid="media-selection-surface"]',
    `slice37-minimal-media-selection-${themeName}`,
    { directory: screenshotDirectory, includeTimestamp: false },
  );

  const more = await $(
    `${MEDIA_SHADOW_FIXTURE_HOST} [data-testid="flowchat-header-more-actions"]`,
  );
  await more.click();
  await $(`${MEDIA_SHADOW_FIXTURE_HOST} [role="menu"]`).waitForDisplayed({
    timeout: 5_000,
  });
  await browser.execute(() => {
    document
      .querySelector<HTMLButtonElement>(
        '#media-shadow-minimal-e2e-host [role="menuitem"]:not(:disabled)',
      )
      ?.focus();
  });

  let menu = await readFlowChatMenuEvidence();
  expect(menu.expanded).toBe('true');
  expect(menu.menuRole).toBe('menu');
  expect(menu.menuItemCount).toBeGreaterThanOrEqual(5);
  expect(menu.menuShadow).toBe(menu.tokenShadow);
  expect(menu.focusedEnabledIndex).toBe(0);
  expect(menu.focusedTestId).toBe('flowchat-header-pull-requests');

  await browser.keys(['ArrowDown']);
  menu = await readFlowChatMenuEvidence();
  expect(menu.focusedEnabledIndex).toBe(1);
  expect(menu.focusedTestId).toBe('flowchat-header-search');
  expect(menu.focusedIsFocus).toBe(true);
  expect(menu.focusedOutlineStyle).toBe('solid');
  expect(menu.focusedOutlineWidth).toBe('2px');
  expect(menu.focusedOutlineColor).toBe(menu.tokenFocusColor);
  expect(menu.focusedBackground).toBe(menu.tokenHoverBackground);
  expect(menu.focusedInsideMenu).toBe(true);

  await saveElementScreenshot(
    '[data-testid="flowchat-menu-surface"]',
    `slice38-minimal-flowchat-menu-focus-${themeName}`,
    { directory: screenshotDirectory, includeTimestamp: false },
  );

  await browser.keys(['Escape']);
  await browser.waitUntil(async () => {
    const current = await readFlowChatMenuEvidence();
    return current.expanded === 'false' && current.triggerFocused;
  }, {
    timeout: 3_000,
    interval: 50,
    timeoutMsg: 'The real Flow Chat more menu did not close and restore focus',
  });
  menu = await readFlowChatMenuEvidence();
  expect(menu.menuRole).toBeNull();
  expect(menu.triggerFocused).toBe(true);
};

describe('L0 Minimal media selection and Flow Chat shadow contract', () => {
  let sourceUrl = '';
  let originalThemeSelection = 'system';
  let originalWindowSize = { width: 1280, height: 800 };

  before(async () => {
    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    const themeSelection = await readThemeSelection();
    if (typeof themeSelection === 'string' && themeSelection.length > 0) {
      originalThemeSelection = themeSelection;
    }
    await mountMediaShadowTheme(sourceUrl, 'void-light');
  });

  it('proves selected media geometry and shared menu elevation in light', async () => {
    await verifyMediaShadowTheme('light');
  });

  it('proves selected media geometry and shared menu elevation in dark', async () => {
    await mountMediaShadowTheme(sourceUrl, 'void-dark');
    await verifyMediaShadowTheme('dark');
  });

  after(async () => {
    const cleanupErrors: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(
          `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    await attempt('unmount fixture', async () => {
      expect(await cleanupMediaShadowFixture()).toBe(true);
    });
    await attempt('restore theme selection', async () => {
      await writeThemeSelection(originalThemeSelection);
    });
    await attempt('restore URL', async () => {
      await browser.url(sourceUrl);
      await browser.waitUntil(async () => browser.execute(() => (
        Boolean(document.querySelector('[data-testid="app-layout"]'))
        && !document.querySelector('.splash-screen')
      )), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: 'Original URL did not settle during fixture cleanup',
      });
    });
    await attempt('restore window size', async () => {
      await browser.setWindowSize(
        originalWindowSize.width,
        originalWindowSize.height,
      );
    });
    await attempt('verify theme selection restore', async () => {
      const restored = await readThemeSelection();
      if (restored !== originalThemeSelection) {
        throw new Error(
          `expected ${originalThemeSelection}, received ${String(restored)}`,
        );
      }
    });
    if (cleanupErrors.length > 0) {
      throw new Error(
        `Media shadow fixture cleanup failed:\n${cleanupErrors.join('\n')}`,
      );
    }
  });
});
