/**
 * BrowserPanel — embeds a browser into the AuxPane right panel.
 *
 * Uses a Tauri native Webview overlay positioned over the panel's DOM element.
 * When the panel is not active (tab switch / scene switch / AuxPane collapse),
 * the webview is reparented to a hidden holder window to preserve page state.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Globe, RefreshCw, MousePointer2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/component-library';
import {
  TOOLBAR_MODE_ACTIVATING_EVENT,
  TOOLBAR_MODE_ACTIVATION_FAILED_EVENT,
} from '@/shared/constants/toolbarModeEvents';
import { createLogger } from '@/shared/utils/logger';
import { useContextStore } from '@/shared/context-system';
import type { WebElementContext } from '@/shared/types/context';
import { createInspectorScript, CANCEL_INSPECTOR_SCRIPT, BLANK_TARGET_INTERCEPT_SCRIPT } from './browserInspectorScript';
import {
  BROWSER_HOLDER_WINDOW_LABEL,
  browserHolderWindowManager,
  type BrowserHolderWindowHandle,
} from './browserHolderWindowManager';
import {
  createBrowserPresentationLifecycle,
  getBrowserHostTaskActivity,
  runBrowserPresentationSequence,
} from './browserPresentationLifecycle';
import { validateUrl, checkConnectivity } from './browserUrlCheck';
import { createLatestBrowserTaskGate } from './browserTaskGate';
import { startBrowserUrlPolling } from './browserUrlPolling';
import { createBrowserPanelWebviewLabel } from './browserWebviewLabels';
import {
  createBrowserPendingNavigationController,
  createBrowserWebviewCommitCoordinator,
  swapBrowserWebview,
  type BrowserWebviewSlot,
} from './browserWebviewSwap';
import './BrowserPanel.scss';

const log = createLogger('BrowserPanel');
const DEFAULT_URL = 'https://openvoid.com/';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

type BrowserWebviewHandle = {
  close: () => Promise<void>;
  hide: () => Promise<void>;
  label: string;
  once: (event: string, handler: (event?: unknown) => void) => Promise<() => void>;
  reparent: (window: string | unknown) => Promise<void>;
  setFocus: () => Promise<void>;
  setPosition: (position: unknown) => Promise<void>;
  setSize: (size: unknown) => Promise<void>;
  show: () => Promise<void>;
};

async function evalWebview(label: string, script: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('browser_webview_eval', { request: { label, script } });
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const payload = 'payload' in record ? record.payload : undefined;
    const message =
      (typeof record.message === 'string' && record.message) ||
      (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).message === 'string'
        ? String((payload as Record<string, unknown>).message)
        : null);
    if (message) return message;
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
}

function isWebviewNotFoundError(error: unknown): boolean {
  return formatUnknownError(error).toLowerCase().includes('webview not found');
}

async function waitForWebviewCreated(handle: BrowserWebviewHandle): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
    void handle.once('tauri://created', () => finish(resolve));
    void handle.once('tauri://error', (event) => finish(() => reject(new Error(formatUnknownError(event)))));
  });
}

async function waitForWindowCreated(handle: BrowserHolderWindowHandle): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
    void handle.once('tauri://created', () => finish(resolve));
    void handle.once('tauri://error', (event) => finish(() => reject(new Error(formatUnknownError(event)))));
  });
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return DEFAULT_URL;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return value;
  return `https://${value}`;
}

interface InspectorElementData {
  tagName: string;
  path: string;
  attributes: Record<string, string>;
  textContent: string;
  outerHTML: string;
}

export interface BrowserPanelProps {
  /** Final tab/scene/document presentation state supplied by EditorGroup. */
  isActive: boolean;
  /** Optional initial URL (falls back to DEFAULT_URL) */
  initialUrl?: string;
}

const BrowserPanel: React.FC<BrowserPanelProps> = ({ isActive, initialUrl }) => {
  const { t } = useTranslation('common');
  // EditorGroup already combines tab, scene, and document presentation state.
  const shouldShowWebview = isActive;

  const isTauri = useMemo(() => isTauriEnvironment(), []);

  const startUrl = initialUrl ?? DEFAULT_URL;
  const viewportRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<BrowserWebviewHandle | null>(null);
  const ownedWebviewsRef = useRef(new Set<BrowserWebviewHandle>());
  const currentUrlRef = useRef<string>(startUrl);
  const resizeFrameRef = useRef<number | null>(null);
  const webviewLabelRef = useRef<string>('');
  const inspectorUnlistenRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasRenderableBoundsRef = useRef(false);
  const presentationLifecycleRef = useRef<ReturnType<typeof createBrowserPresentationLifecycle> | null>(null);
  if (!presentationLifecycleRef.current) {
    presentationLifecycleRef.current = createBrowserPresentationLifecycle(shouldShowWebview);
  }
  const presentationLifecycle = presentationLifecycleRef.current;
  presentationLifecycle.update(shouldShowWebview);
  const latestShouldShowWebviewRef = useRef(shouldShowWebview);
  latestShouldShowWebviewRef.current = shouldShowWebview;
  const loadRequestGateRef = useRef(createLatestBrowserTaskGate());
  const pendingNavigationRef = useRef<ReturnType<typeof createBrowserPendingNavigationController> | null>(null);
  if (!pendingNavigationRef.current) {
    pendingNavigationRef.current = createBrowserPendingNavigationController();
  }
  const pendingNavigation = pendingNavigationRef.current;
  const retryPendingNavigationRef = useRef<() => boolean>(() => false);
  const presentationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const webviewCommitCoordinatorRef = useRef<ReturnType<typeof createBrowserWebviewCommitCoordinator> | null>(null);
  if (!webviewCommitCoordinatorRef.current) {
    webviewCommitCoordinatorRef.current = createBrowserWebviewCommitCoordinator();
  }
  const webviewCommitCoordinator = webviewCommitCoordinatorRef.current;

  const [inputValue, setInputValue] = useState(startUrl);
  const [currentUrl, setCurrentUrl] = useState(startUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [pollingLabel, setPollingLabel] = useState<string | null>(null);
  const [isOccluded, setIsOccluded] = useState(false);
  const [hasRenderableBounds, setHasRenderableBounds] = useState(false);
  const setRenderableBounds = useCallback((renderable: boolean) => {
    hasRenderableBoundsRef.current = renderable;
    if (isMountedRef.current) {
      setHasRenderableBounds(renderable);
    }
  }, []);
  const {
    polling: pollingActive,
    resizeRecovery: resizeRecoveryActive,
  } = getBrowserHostTaskActivity(shouldShowWebview, isOccluded, hasRenderableBounds);

  useEffect(() => {
    const loadRequestGate = loadRequestGateRef.current;
    presentationLifecycle.update(latestShouldShowWebviewRef.current);
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      hasRenderableBoundsRef.current = false;
      loadRequestGate.invalidate();
      presentationLifecycle.dispose();
    };
  }, [presentationLifecycle]);

  useEffect(() => {
    if (!shouldShowWebview) {
      loadRequestGateRef.current.invalidate();
      pendingNavigation.suspend();
      setRenderableBounds(false);
      setIsLoading(false);
    }
  }, [pendingNavigation, setRenderableBounds, shouldShowWebview]);

  const addContext = useContextStore((s) => s.addContext);

  const stopInspector = useCallback(() => {
    const label = webviewLabelRef.current;
    if (isTauri && label) {
      void evalWebview(label, CANCEL_INSPECTOR_SCRIPT).catch(() => {});
    }

    inspectorUnlistenRef.current?.();
    inspectorUnlistenRef.current = null;
    if (isMountedRef.current) {
      setIsInspectorActive(false);
    }
  }, [isTauri]);

  /**
   * Sync webview bounds to the panel container.
   * Hides the webview if the container has no visible area (AuxPane collapsed, etc.).
   */
  const syncWebviewBounds = useCallback(async (handle?: BrowserWebviewHandle | null): Promise<boolean> => {
    const target = handle ?? webviewRef.current;
    const viewport = viewportRef.current;
    const presentation = presentationLifecycle.snapshot();
    const updateCurrentRenderableBounds = (renderable: boolean) => {
      if (
        !isMountedRef.current ||
        target !== webviewRef.current ||
        viewport !== viewportRef.current
      ) {
        return false;
      }
      const changed = hasRenderableBoundsRef.current !== renderable;
      setRenderableBounds(renderable);
      return changed;
    };
    if (!isTauri || presentation.status !== 'active' || !target || !viewport) {
      if (presentation.status !== 'active') {
        updateCurrentRenderableBounds(false);
      }
      return false;
    }

    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      if (updateCurrentRenderableBounds(false)) {
        stopInspector();
      }
      await target.hide().catch(() => {});
      return false;
    }

    let LogicalPosition!: typeof import('@tauri-apps/api/dpi').LogicalPosition;
    let LogicalSize!: typeof import('@tauri-apps/api/dpi').LogicalSize;
    const synced = await runBrowserPresentationSequence({
      lifecycle: presentationLifecycle,
      snapshot: presentation,
      isTargetCurrent: () => target === webviewRef.current && viewport === viewportRef.current,
      steps: [
        async () => {
          ({ LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi'));
        },
        () => Promise.all([
          target.setPosition(new LogicalPosition(rect.left, rect.top)),
          target.setSize(new LogicalSize(rect.width, rect.height)),
        ]).then(() => {}),
      ],
      onStale: () => target.hide().catch(() => {}),
    });
    if (!synced) {
      return false;
    }

    const latestRect = viewport.getBoundingClientRect();
    if (latestRect.width <= 1 || latestRect.height <= 1) {
      if (updateCurrentRenderableBounds(false)) {
        stopInspector();
      }
      await target.hide().catch(() => {});
      return false;
    }

    updateCurrentRenderableBounds(true);
    return true;
  }, [isTauri, presentationLifecycle, setRenderableBounds, stopInspector]);

  const readCurrentWebviewSlot = useCallback((): BrowserWebviewSlot<BrowserWebviewHandle> | null => {
    const handle = webviewRef.current;
    const label = webviewLabelRef.current;
    return handle && label ? { handle, label } : null;
  }, []);

  const publishWebviewSlot = useCallback((slot: BrowserWebviewSlot<BrowserWebviewHandle> | null) => {
    webviewRef.current = slot?.handle ?? null;
    webviewLabelRef.current = slot?.label ?? '';
    if (!slot) {
      setRenderableBounds(false);
    }
  }, [setRenderableBounds]);

  const closeWebview = useCallback(async (handle?: BrowserWebviewHandle | null) => {
    const target = handle ?? webviewRef.current;
    if (!target) return;

    if (target === webviewRef.current) {
      publishWebviewSlot(null);
      if (isMountedRef.current) {
        setPollingLabel(null);
      }
    }

    try {
      await target.close();
      ownedWebviewsRef.current.delete(target);
    } catch (e) {
      if (isWebviewNotFoundError(e)) {
        ownedWebviewsRef.current.delete(target);
      } else {
        log.warn('Close browser panel webview failed', e);
      }
    }
  }, [publishWebviewSlot]);

  const ensureHolderWindow = useCallback(async (): Promise<BrowserHolderWindowHandle | null> => {
    const holder = await browserHolderWindowManager.acquire(async () => {
      const { Window } = await import('@tauri-apps/api/window');
      const existing = (await Window.getByLabel(BROWSER_HOLDER_WINDOW_LABEL)) as BrowserHolderWindowHandle | null;
      if (existing) {
        return existing;
      }

      const created = new Window(BROWSER_HOLDER_WINDOW_LABEL, {
        visible: false,
        decorations: false,
        skipTaskbar: true,
        shadow: false,
        width: 1,
        height: 1,
        x: -10000,
        y: -10000,
        title: 'Browser Holder',
      }) as unknown as BrowserHolderWindowHandle & { close: () => Promise<void> };

      try {
        await waitForWindowCreated(created);
        await created.hide().catch(() => {});
        return created;
      } catch (error) {
        await created.close().catch(() => {});
        throw error;
      }
    });

    return isMountedRef.current ? holder : null;
  }, []);

  const recreateWebview = useCallback(async (url: string, requestToken: number) => {
    const isCurrentRequest = () =>
      isMountedRef.current &&
      presentationLifecycle.isActive() &&
      loadRequestGateRef.current.isCurrent(requestToken);

    const holderWindow = await ensureHolderWindow();
    if (!holderWindow || !isCurrentRequest()) {
      return { status: 'stale' } as const;
    }

    const [{ Webview }, { getCurrentWindow }] = await Promise.all([
      import('@tauri-apps/api/webview'),
      import('@tauri-apps/api/window'),
    ]);

    if (!isCurrentRequest()) {
      return { status: 'stale' } as const;
    }

    const label = createBrowserPanelWebviewLabel();
    const result = await swapBrowserWebview({
      commitCoordinator: webviewCommitCoordinator,
      commitCandidate: ({ label: committedLabel }) => {
        currentUrlRef.current = url;
        pendingNavigation.clear(requestToken);
        if (isMountedRef.current) {
          setCurrentUrl(url);
          setPollingLabel(committedLabel);
        }
      },
      createCandidate: () => {
        const handle = new Webview(
          holderWindow as unknown as import('@tauri-apps/api/window').Window,
          label,
          {
            url,
            x: 0,
            y: 0,
            width: 960,
            height: 640,
          },
        ) as unknown as BrowserWebviewHandle;
        ownedWebviewsRef.current.add(handle);
        return { handle, label };
      },
      waitForCandidate: ({ handle }) => waitForWebviewCreated(handle),
      prepareCandidate: ({ handle }) => handle.hide(),
      activateCandidate: async ({ handle, label: candidateLabel }) => {
        const presentation = presentationLifecycle.snapshot();
        return runBrowserPresentationSequence({
          lifecycle: presentationLifecycle,
          snapshot: presentation,
          isTargetCurrent: () =>
            isCurrentRequest() &&
            handle === webviewRef.current &&
            candidateLabel === webviewLabelRef.current,
          steps: [
            () => handle.reparent(getCurrentWindow()),
            () => syncWebviewBounds(handle),
            () => handle.show(),
            () => handle.setFocus(),
            () => evalWebview(candidateLabel, BLANK_TARGET_INTERCEPT_SCRIPT),
          ],
          onStale: () => handle.hide().catch(() => {}),
        });
      },
      isCurrentRequest,
      readCurrent: readCurrentWebviewSlot,
      publish: publishWebviewSlot,
      close: ({ handle }) => closeWebview(handle),
    });

    if (result.status !== 'committed') {
      const restored = webviewRef.current;
      const restoredPresentation = presentationLifecycle.snapshot();
      if (result.status === 'blocked') {
        await restored?.hide().catch(() => {});
      } else if (restored && restoredPresentation.status !== 'active') {
        let restoredHolder: BrowserHolderWindowHandle | null = null;
        const steps: Array<() => Promise<void>> = [
          () => restored.hide().catch(() => {}),
        ];
        if (!restoredPresentation.occluded) {
          steps.push(
            async () => {
              restoredHolder = await ensureHolderWindow();
            },
            () => restored.reparent(restoredHolder as BrowserHolderWindowHandle),
            () => (restoredHolder as BrowserHolderWindowHandle).hide().catch(() => {}),
          );
        }
        await runBrowserPresentationSequence({
          lifecycle: presentationLifecycle,
          snapshot: restoredPresentation,
          isTargetCurrent: () => restored === webviewRef.current,
          steps,
          onStale: () => restored.hide().catch(() => {}),
        });
      }
    }

    return result;
  }, [
    closeWebview,
    ensureHolderWindow,
    presentationLifecycle,
    publishWebviewSlot,
    readCurrentWebviewSlot,
    pendingNavigation,
    syncWebviewBounds,
    webviewCommitCoordinator,
  ]);

  const handlePolledUrl = useCallback((sourceLabel: string, url: string) => {
    if (
      !isMountedRef.current ||
      !presentationLifecycle.isActive() ||
      sourceLabel !== webviewLabelRef.current ||
      !url ||
      url === currentUrlRef.current
    ) {
      return;
    }

    currentUrlRef.current = url;
    setInputValue(url);
    setCurrentUrl(url);
    setError(null);

    void evalWebview(sourceLabel, BLANK_TARGET_INTERCEPT_SCRIPT).catch(() => {});
  }, [presentationLifecycle]);

  const loadUrl = useCallback(async (rawUrl: string) => {
    if (!isMountedRef.current || !presentationLifecycle.isActive()) {
      return;
    }

    const requestToken = loadRequestGateRef.current.start();
    const isCurrentRequest = () =>
      isMountedRef.current &&
      presentationLifecycle.isActive() &&
      loadRequestGateRef.current.isCurrent(requestToken);
    const nextUrl = normalizeUrl(rawUrl);
    pendingNavigation.begin(nextUrl, requestToken);
    setInputValue(nextUrl);
    setError(null);
    setIsLoading(true);
    stopInspector();

    if (!isTauri) {
      currentUrlRef.current = nextUrl;
      setCurrentUrl(nextUrl);
      pendingNavigation.clear(requestToken);
      setIsLoading(false);
      return;
    }

    try {
      validateUrl(nextUrl);
      await checkConnectivity(nextUrl, { skipLoopbackCheck: true });
      if (!isCurrentRequest() || !presentationLifecycle.isActive()) {
        return;
      }

      const result = await recreateWebview(nextUrl, requestToken);
      if (result.status === 'blocked' || result.status === 'stale') {
        pendingNavigation.suspend(requestToken);
        if (result.status === 'blocked') {
          window.requestAnimationFrame(() => {
            retryPendingNavigationRef.current();
          });
        }
        return;
      }
    } catch (loadError) {
      if (!isCurrentRequest()) {
        return;
      }

      const message = formatUnknownError(loadError);
      pendingNavigation.clear(requestToken);
      log.error('Load browser panel url failed', loadError);
      setError(message);
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
      }
    }
  }, [isTauri, pendingNavigation, presentationLifecycle, recreateWebview, stopInspector]);

  const retryPendingNavigation = useCallback((): boolean => {
    const retryUrl = pendingNavigation.retryUrl();
    const viewport = viewportRef.current;
    if (!retryUrl || !viewport || !isMountedRef.current || !presentationLifecycle.isActive()) {
      return false;
    }

    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return false;
    }

    void loadUrl(retryUrl).catch((loadError) => {
      log.warn('Retry pending browser panel navigation failed', loadError);
    });
    return true;
  }, [loadUrl, pendingNavigation, presentationLifecycle]);
  retryPendingNavigationRef.current = retryPendingNavigation;

  const queueSync = useCallback(() => {
    if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const handle = webviewRef.current;
      if (!handle) {
        retryPendingNavigationRef.current();
        return;
      }
      void syncWebviewBounds(handle)
        .then(async (canPresent) => {
          if (!canPresent) {
            return;
          }
          const presentation = presentationLifecycle.snapshot();
          const presented = await runBrowserPresentationSequence({
            lifecycle: presentationLifecycle,
            snapshot: presentation,
            isTargetCurrent: () => handle === webviewRef.current,
            steps: [() => handle.show()],
            onStale: () => handle.hide().catch(() => {}),
          });
          if (presented) {
            retryPendingNavigationRef.current();
          }
        })
        .catch((syncError) => log.warn('Sync browser panel webview bounds failed', syncError));
    });
  }, [presentationLifecycle, syncWebviewBounds]);

  useEffect(() => {
    if (!isTauri || !pollingActive || !pollingLabel) {
      return;
    }

    return startBrowserUrlPolling({
      label: pollingLabel,
      onUrl: handlePolledUrl,
    });
  }, [handlePolledUrl, isTauri, pollingActive, pollingLabel]);

  useEffect(() => {
    if (!shouldShowWebview) {
      stopInspector();
    }
  }, [shouldShowWebview, stopInspector]);

  const queueWebviewPresentation = useCallback((handle: BrowserWebviewHandle) => {
    const transition = presentationLifecycle.snapshot();
    presentationQueueRef.current = presentationQueueRef.current
      .catch(() => {})
      .then(async () => {
        const isTargetCurrent = () => isMountedRef.current && handle === webviewRef.current;

        if (transition.status !== 'active') {
          if (
            (transition.occluded && transition.requestedActive) ||
            transition.status === 'disposed'
          ) {
            await runBrowserPresentationSequence({
              lifecycle: presentationLifecycle,
              snapshot: transition,
              isTargetCurrent,
              steps: [() => handle.hide().catch(() => {})],
            });
            return;
          }

          let holderWindow: BrowserHolderWindowHandle | null = null;
          await runBrowserPresentationSequence({
            lifecycle: presentationLifecycle,
            snapshot: transition,
            isTargetCurrent,
            steps: [
              () => handle.hide().catch(() => {}),
              async () => {
                holderWindow = await ensureHolderWindow();
              },
              () => handle.reparent(holderWindow as BrowserHolderWindowHandle),
              () => (holderWindow as BrowserHolderWindowHandle).hide().catch(() => {}),
            ],
            onStale: () => handle.hide().catch(() => {}),
          });
          return;
        }

        let getCurrentWindow!: typeof import('@tauri-apps/api/window').getCurrentWindow;
        const presented = await runBrowserPresentationSequence({
          lifecycle: presentationLifecycle,
          snapshot: transition,
          isTargetCurrent,
          steps: [
            async () => {
              ({ getCurrentWindow } = await import('@tauri-apps/api/window'));
            },
            () => handle.reparent(getCurrentWindow()),
            () => new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
            () => syncWebviewBounds(handle),
            () => handle.show(),
            () => handle.setFocus(),
          ],
          onStale: () => handle.hide().catch(() => {}),
        });
        if (presented) {
          retryPendingNavigationRef.current();
        }
      })
      .catch((transitionError) => {
        log.warn('Transition browser panel webview visibility failed', transitionError);
        if (handle === webviewRef.current) {
          void handle.hide().catch(() => {});
        }
      });
  }, [ensureHolderWindow, presentationLifecycle, syncWebviewBounds]);

  // Activate / deactivate webview based on shouldShowWebview
  useEffect(() => {
    if (!isTauri) return;

    if (shouldShowWebview) {
      const hasPendingNavigation = pendingNavigation.snapshot() !== null;
      if (hasPendingNavigation) {
        retryPendingNavigationRef.current();
      }
      if (!webviewRef.current) {
        if (hasPendingNavigation) {
          return;
        }
        void loadUrl(currentUrlRef.current).catch((e) => log.warn('Restore browser panel webview failed', e));
        return;
      }
    }

    const handle = webviewRef.current;
    if (!handle) {
      return;
    }

    queueWebviewPresentation(handle);
  }, [isTauri, loadUrl, pendingNavigation, queueWebviewPresentation, shouldShowWebview]);

  // ResizeObserver + window resize → sync bounds
  useEffect(() => {
    if (!isTauri || !resizeRecoveryActive) return;

    const observer = new ResizeObserver(() => {
      queueSync();
    });

    if (viewportRef.current) observer.observe(viewportRef.current);

    const handleResize = () => queueSync();
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [isTauri, queueSync, resizeRecoveryActive]);

  // Cleanup on unmount
  useEffect(() => () => {
    stopInspector();
    for (const handle of [...ownedWebviewsRef.current]) {
      void closeWebview(handle);
    }
  }, [closeWebview, stopInspector]);

  // Hide webview when any overlay (modal, mission-control, toolbar-mode) is present.
  // Uses MutationObserver on document.body to detect overlay DOM nodes, so no
  // coupling with individual overlay components is needed.
  useEffect(() => {
    if (!isTauri || !shouldShowWebview) return;

    const OVERLAY_SELECTOR = '.modal-overlay, .canvas-mission-control, .void-toolbar-mode';

    const checkOverlays = () => {
      const hasOverlay = document.querySelector(OVERLAY_SELECTOR) !== null;
      const previous = presentationLifecycle.snapshot();
      const next = presentationLifecycle.setOccluded(hasOverlay);
      if (next.revision === previous.revision) {
        return;
      }
      setIsOccluded(hasOverlay);

      if (hasOverlay) {
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        loadRequestGateRef.current.invalidate();
        pendingNavigation.suspend();
        setRenderableBounds(false);
        setIsLoading(false);
        stopInspector();
      }

      const handle = webviewRef.current;
      if (!handle) {
        if (!hasOverlay && next.status === 'active') {
          if (pendingNavigation.snapshot()) {
            retryPendingNavigationRef.current();
            return;
          }
          void loadUrl(currentUrlRef.current).catch((loadError) => {
            log.warn('Restore browser panel webview after overlay failed', loadError);
          });
        }
        return;
      }

      if (hasOverlay) {
        void handle.hide().catch(() => {});
      }
      queueWebviewPresentation(handle);
      if (!hasOverlay && next.status === 'active') {
        retryPendingNavigationRef.current();
      }
    };

    const observer = new MutationObserver(checkOverlays);
    observer.observe(document.body, { childList: true, subtree: true });
    checkOverlays();

    const handleToolbarActivating = () => {
      const previous = presentationLifecycle.snapshot();
      const next = presentationLifecycle.setOccluded(true);
      setIsOccluded(true);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      loadRequestGateRef.current.invalidate();
      pendingNavigation.suspend();
      setRenderableBounds(false);
      setIsLoading(false);
      stopInspector();
      const handle = webviewRef.current;
      if (handle) {
        void handle.hide().catch(() => {});
        if (next.revision !== previous.revision) {
          queueWebviewPresentation(handle);
        }
      }
    };
    let toolbarRecoveryFrame: number | null = null;
    const handleToolbarActivationFailed = () => {
      checkOverlays();
      if (toolbarRecoveryFrame !== null) {
        window.cancelAnimationFrame(toolbarRecoveryFrame);
      }
      toolbarRecoveryFrame = window.requestAnimationFrame(() => {
        toolbarRecoveryFrame = null;
        checkOverlays();
      });
    };

    window.addEventListener(TOOLBAR_MODE_ACTIVATING_EVENT, handleToolbarActivating);
    window.addEventListener(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT, handleToolbarActivationFailed);

    return () => {
      observer.disconnect();
      window.removeEventListener(TOOLBAR_MODE_ACTIVATING_EVENT, handleToolbarActivating);
      window.removeEventListener(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT, handleToolbarActivationFailed);
      if (toolbarRecoveryFrame !== null) {
        window.cancelAnimationFrame(toolbarRecoveryFrame);
      }
    };
  }, [
    isTauri,
    loadUrl,
    pendingNavigation,
    presentationLifecycle,
    queueWebviewPresentation,
    setRenderableBounds,
    shouldShowWebview,
    stopInspector,
  ]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadUrl(inputValue);
  }, [inputValue, loadUrl]);

  const handleGoBack = useCallback(() => {
    if (!isTauri || !webviewLabelRef.current) return;
    void evalWebview(webviewLabelRef.current, 'history.back()').catch(() => {});
  }, [isTauri]);

  const handleGoForward = useCallback(() => {
    if (!isTauri || !webviewLabelRef.current) return;
    void evalWebview(webviewLabelRef.current, 'history.forward()').catch(() => {});
  }, [isTauri]);

  const handleRefresh = useCallback(() => {
    if (!isTauri || !webviewLabelRef.current) return;
    void evalWebview(webviewLabelRef.current, 'location.reload()').catch(() => {});
  }, [isTauri]);

  const handleInspector = useCallback(async () => {
    const handle = webviewRef.current;
    if (
      !isTauri ||
      !presentationLifecycle.isActive() ||
      !hasRenderableBoundsRef.current ||
      !handle
    ) return;

    if (isInspectorActive) {
      stopInspector();
      return;
    }

    const label = webviewLabelRef.current;
    if (!label) return;
    const presentation = presentationLifecycle.snapshot();
    const isCurrentInspectorRequest = () =>
      isMountedRef.current &&
      presentationLifecycle.isCurrent(presentation) &&
      hasRenderableBoundsRef.current &&
      handle === webviewRef.current &&
      label === webviewLabelRef.current;
    let pendingSelectedUnlisten: (() => void) | null = null;

    try {
      const { listen } = await import('@tauri-apps/api/event');
      if (!isCurrentInspectorRequest()) {
        return;
      }

      const eventSelected = `browser-inspector-element-selected-${label}`;
      const eventCancelled = `browser-inspector-cancelled-${label}`;

      const unlistenSelected = await listen<InspectorElementData>(
        eventSelected,
        (event) => {
          const data = event.payload;
          const context: WebElementContext = {
            id: `web-element-${Date.now()}`,
            type: 'web-element',
            timestamp: Date.now(),
            tagName: data.tagName,
            path: data.path,
            attributes: data.attributes,
            textContent: data.textContent,
            outerHTML: data.outerHTML,
            sourceUrl: currentUrlRef.current,
          };

          addContext(context);
          window.dispatchEvent(
            new CustomEvent('insert-context-tag', { detail: { context } }),
          );
        },
      );
      pendingSelectedUnlisten = unlistenSelected;
      if (!isCurrentInspectorRequest()) {
        unlistenSelected();
        pendingSelectedUnlisten = null;
        return;
      }

      const unlistenCancelled = await listen(
        eventCancelled,
        () => {
          unlistenSelected();
          unlistenCancelled();
          inspectorUnlistenRef.current = null;
          if (isMountedRef.current) {
            setIsInspectorActive(false);
          }
        },
      );

      const unlistenInspector = () => {
        unlistenSelected();
        unlistenCancelled();
      };
      if (!isCurrentInspectorRequest()) {
        unlistenInspector();
        pendingSelectedUnlisten = null;
        return;
      }
      inspectorUnlistenRef.current = unlistenInspector;
      pendingSelectedUnlisten = null;

      await evalWebview(label, createInspectorScript(label));
      if (!isCurrentInspectorRequest()) {
        if (inspectorUnlistenRef.current === unlistenInspector) {
          inspectorUnlistenRef.current = null;
        }
        unlistenInspector();
        await evalWebview(label, CANCEL_INSPECTOR_SCRIPT).catch(() => {});
        return;
      }
      setIsInspectorActive(true);

    } catch (e) {
      log.error('Start inspector failed', e);
      pendingSelectedUnlisten?.();
      inspectorUnlistenRef.current?.();
      inspectorUnlistenRef.current = null;
      if (isMountedRef.current) {
        setIsInspectorActive(false);
      }
    }
  }, [addContext, isInspectorActive, isTauri, presentationLifecycle, stopInspector]);

  return (
    <div className="browser-panel">
      <form className="browser-panel__toolbar" onSubmit={handleSubmit}>
        <IconButton
          type="button"
          variant="ghost"
          size="small"
          onClick={handleGoBack}
          aria-label={t('nav.back')}
        >
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          size="small"
          onClick={handleGoForward}
          aria-label={t('nav.forward')}
        >
          <ChevronRight size={14} />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          size="small"
          onClick={handleRefresh}
          disabled={isLoading}
          aria-label={t('actions.refresh')}
        >
          <RefreshCw size={14} className={isLoading ? 'browser-panel__spinning' : undefined} />
        </IconButton>
        <div className="browser-panel__address">
          <Globe size={16} />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('browserView.addressPlaceholder', { exampleUrl: 'https://example.com' })}
            spellCheck={false}
          />
        </div>
        {isTauri && (
          <IconButton
            type="button"
            variant="ghost"
            size="small"
            onClick={() => void handleInspector()}
            aria-label={isInspectorActive ? t('browserView.stopElementSelection') : t('browserView.startElementSelection')}
            className={isInspectorActive ? 'browser-panel__inspector-btn--active' : undefined}
          >
            <MousePointer2 size={14} />
          </IconButton>
        )}
      </form>

      {error ? (
        <div className="browser-panel__error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="browser-panel__content">
        {!isTauri ? (
          <iframe
            className="browser-panel__iframe"
            src={currentUrl}
            title="Embedded Browser Panel"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          />
        ) : (
          <div ref={viewportRef} className="browser-panel__webview-host">
            <div className="browser-panel__webview-placeholder">
              <Globe size={20} />
              <span>{currentUrl}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserPanel;
