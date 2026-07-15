import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Globe, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/component-library';
import { createLogger } from '@/shared/utils/logger';
import { useSceneStore } from '@/app/stores/sceneStore';
import { BLANK_TARGET_INTERCEPT_SCRIPT } from './browserInspectorScript';
import { validateUrl, checkConnectivity } from './browserUrlCheck';
import { createLatestBrowserTaskGate } from './browserTaskGate';
import { startBrowserUrlPolling } from './browserUrlPolling';
import './BrowserScene.scss';

const log = createLogger('BrowserScene');
const DEFAULT_URL = 'https://openvoid.com/';
const BROWSER_HOLDER_WINDOW_LABEL = 'embedded-browser-holder-window';

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

type BrowserHolderWindowHandle = {
  close: () => Promise<void>;
  hide: () => Promise<void>;
  once: (event: string, handler: (event?: unknown) => void) => Promise<() => void>;
};

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const payload = 'payload' in record ? record.payload : undefined;
    const message =
      (typeof record.message === 'string' && record.message) ||
      (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).message === 'string'
        ? String((payload as Record<string, unknown>).message)
        : null);

    if (message) {
      return message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function isWebviewNotFoundError(error: unknown): boolean {
  const message = formatUnknownError(error);
  return message.toLowerCase().includes('webview not found');
}

async function evalWebview(label: string, script: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('browser_webview_eval', { request: { label, script } });
}

async function waitForWebviewCreated(handle: BrowserWebviewHandle): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    void handle.once('tauri://created', () => {
      finish(resolve);
    });

    void handle.once('tauri://error', (event) => {
      finish(() => reject(new Error(formatUnknownError(event))));
    });
  });
}

async function waitForWindowCreated(handle: BrowserHolderWindowHandle): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    void handle.once('tauri://created', () => {
      finish(resolve);
    });

    void handle.once('tauri://error', (event) => {
      finish(() => reject(new Error(formatUnknownError(event))));
    });
  });
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return DEFAULT_URL;
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return value;
  }

  return `https://${value}`;
}

const BrowserScene: React.FC = () => {
  const { t } = useTranslation('common');
  const activeTabId = useSceneStore((state) => state.activeTabId);
  const isActive = activeTabId === 'browser';
  const isTauri = useMemo(() => isTauriEnvironment(), []);

  const viewportRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<BrowserWebviewHandle | null>(null);
  const holderWindowRef = useRef<BrowserHolderWindowHandle | null>(null);
  const webviewSequenceRef = useRef(0);
  const currentUrlRef = useRef<string>(DEFAULT_URL);
  const resizeFrameRef = useRef<number | null>(null);
  const webviewLabelRef = useRef<string>('');
  const webviewGenerationRef = useRef(0);
  const isMountedRef = useRef(true);
  const isActiveRef = useRef(isActive);
  const loadRequestGateRef = useRef(createLatestBrowserTaskGate());
  const presentationQueueRef = useRef<Promise<void>>(Promise.resolve());
  isActiveRef.current = isActive;

  const [inputValue, setInputValue] = useState(DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingLabel, setPollingLabel] = useState<string | null>(null);

  useEffect(() => {
    const loadRequestGate = loadRequestGateRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      webviewGenerationRef.current += 1;
      loadRequestGate.invalidate();
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      loadRequestGateRef.current.invalidate();
      setIsLoading(false);
    }
  }, [isActive]);

  const syncWebviewBounds = useCallback(async (handle?: BrowserWebviewHandle | null) => {
    const target = handle ?? webviewRef.current;
    if (!isTauri || !isActiveRef.current || !viewportRef.current || !target) {
      return;
    }

    const rect = viewportRef.current.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return;
    }

    const [{ LogicalPosition, LogicalSize }] = await Promise.all([
      import('@tauri-apps/api/dpi'),
    ]);

    await Promise.all([
      target.setPosition(new LogicalPosition(rect.left, rect.top)),
      target.setSize(new LogicalSize(rect.width, rect.height)),
    ]);
  }, [isTauri]);

  const closeWebview = useCallback(async (handle?: BrowserWebviewHandle | null) => {
    const target = handle ?? webviewRef.current;
    if (!target) {
      return;
    }

    if (target === webviewRef.current) {
      webviewRef.current = null;
      webviewLabelRef.current = '';
      if (isMountedRef.current) {
        setPollingLabel(null);
      }
    }

    try {
      await target.close();
    } catch (closeError) {
      if (!isWebviewNotFoundError(closeError)) {
        log.warn('Close browser webview failed', closeError);
      }
    }
  }, []);

  const ensureHolderWindow = useCallback(async (): Promise<BrowserHolderWindowHandle | null> => {
    if (holderWindowRef.current) {
      return holderWindowRef.current;
    }

    const { Window } = await import('@tauri-apps/api/window');
    const existing = (await Window.getByLabel(BROWSER_HOLDER_WINDOW_LABEL)) as BrowserHolderWindowHandle | null;
    if (existing) {
      if (!isMountedRef.current) {
        await existing.close().catch(() => {});
        return null;
      }
      holderWindowRef.current = existing;
      return existing;
    }

    const holder = new Window(BROWSER_HOLDER_WINDOW_LABEL, {
      visible: false,
      decorations: false,
      skipTaskbar: true,
      shadow: false,
      width: 1,
      height: 1,
      x: -10000,
      y: -10000,
      title: 'Browser Holder',
    }) as BrowserHolderWindowHandle;

    await waitForWindowCreated(holder);
    await holder.hide().catch(() => {});
    if (!isMountedRef.current) {
      await holder.close().catch(() => {});
      return null;
    }
    holderWindowRef.current = holder;
    return holder;
  }, []);

  const recreateWebview = useCallback(async (url: string, requestToken: number) => {
    const generation = ++webviewGenerationRef.current;
    const isCurrentRequest = () =>
      isMountedRef.current &&
      isActiveRef.current &&
      loadRequestGateRef.current.isCurrent(requestToken);
    const previous = webviewRef.current;
    if (previous) {
      await closeWebview(previous);
    }

    if (!isCurrentRequest() || generation !== webviewGenerationRef.current) {
      return null;
    }

    const [{ Webview }, { getCurrentWindow }] = await Promise.all([
      import('@tauri-apps/api/webview'),
      import('@tauri-apps/api/window'),
    ]);

    if (!isCurrentRequest() || generation !== webviewGenerationRef.current) {
      return null;
    }

    const nextLabel = `embedded-browser-view-${webviewSequenceRef.current++}`;
    const handle = new Webview(getCurrentWindow(), nextLabel, {
      url,
      x: 0,
      y: 0,
      width: 960,
      height: 640,
    }) as unknown as BrowserWebviewHandle;

    await waitForWebviewCreated(handle);
    if (!isCurrentRequest() || generation !== webviewGenerationRef.current) {
      await closeWebview(handle);
      return null;
    }

    webviewRef.current = handle;
    webviewLabelRef.current = nextLabel;
    setPollingLabel(nextLabel);
    return handle;
  }, [closeWebview]);

  const handlePolledUrl = useCallback((sourceLabel: string, url: string) => {
    if (
      !isMountedRef.current ||
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
  }, []);

  const loadUrl = useCallback(async (rawUrl: string) => {
    if (!isMountedRef.current || !isActiveRef.current) {
      return;
    }

    const requestToken = loadRequestGateRef.current.start();
    const isCurrentRequest = () =>
      isMountedRef.current && loadRequestGateRef.current.isCurrent(requestToken);
    const nextUrl = normalizeUrl(rawUrl);
    setInputValue(nextUrl);
    setCurrentUrl(nextUrl);
    currentUrlRef.current = nextUrl;
    setError(null);
    setIsLoading(true);

    if (!isTauri) {
      setIsLoading(false);
      return;
    }

    try {
      validateUrl(nextUrl);
      await checkConnectivity(nextUrl);
      if (!isCurrentRequest() || !isActiveRef.current) {
        return;
      }

      const handle = await recreateWebview(nextUrl, requestToken);
      if (!handle) {
        return;
      }

      if (!isCurrentRequest() || !isActiveRef.current || handle !== webviewRef.current) {
        await closeWebview(handle);
        return;
      }
      await syncWebviewBounds(handle);
      if (!isCurrentRequest() || !isActiveRef.current || handle !== webviewRef.current) {
        await closeWebview(handle);
        return;
      }

      await handle.show();
      if (!isCurrentRequest() || !isActiveRef.current || handle !== webviewRef.current) {
        await handle.hide().catch(() => {});
        return;
      }
      await handle.setFocus();
      if (!isCurrentRequest() || !isActiveRef.current || handle !== webviewRef.current) {
        await handle.hide().catch(() => {});
        return;
      }

      const label = webviewLabelRef.current;
      if (!isCurrentRequest() || !isActiveRef.current || handle !== webviewRef.current || !label) {
        return;
      }
      await evalWebview(label, BLANK_TARGET_INTERCEPT_SCRIPT);
    } catch (loadError) {
      if (!isCurrentRequest()) {
        return;
      }

      const message = formatUnknownError(loadError);
      log.error('Load browser url failed', loadError);
      setError(message);
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
      }
    }
  }, [closeWebview, isTauri, recreateWebview, syncWebviewBounds]);

  const queueSync = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      void syncWebviewBounds().catch((syncError) => {
        log.warn('Sync browser webview bounds failed', syncError);
      });
    });
  }, [syncWebviewBounds]);

  useEffect(() => {
    if (!isTauri || !isActive || !pollingLabel) {
      return;
    }

    return startBrowserUrlPolling({
      label: pollingLabel,
      onUrl: handlePolledUrl,
    });
  }, [handlePolledUrl, isActive, isTauri, pollingLabel]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }

    if (isActive) {
      if (!webviewRef.current) {
        void loadUrl(currentUrlRef.current).catch((loadError) => {
          log.warn('Restore browser webview failed', loadError);
        });
        return;
      }
    }

    const handle = webviewRef.current;
    if (!handle) {
      return;
    }

    const shouldPresent = isActive;
    presentationQueueRef.current = presentationQueueRef.current
      .catch(() => {})
      .then(async () => {
        const isCurrentTransition = () =>
          isMountedRef.current &&
          isActiveRef.current === shouldPresent &&
          handle === webviewRef.current;

        if (!isCurrentTransition()) {
          return;
        }

        if (!shouldPresent) {
          await handle.hide().catch(() => {});
          if (!isCurrentTransition()) {
            return;
          }
          const holderWindow = await ensureHolderWindow();
          if (!holderWindow || !isCurrentTransition()) {
            return;
          }
          await handle.reparent(holderWindow);
          await holderWindow.hide().catch(() => {});
          return;
        }

        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (!isCurrentTransition()) {
          return;
        }
        await handle.reparent(getCurrentWindow());
        if (!isCurrentTransition()) {
          return;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!isCurrentTransition()) {
          return;
        }
        await syncWebviewBounds(handle);
        if (!isCurrentTransition()) {
          return;
        }
        await handle.show();
        if (!isCurrentTransition()) {
          await handle.hide().catch(() => {});
          return;
        }
        await handle.setFocus();
        if (!isCurrentTransition()) {
          await handle.hide().catch(() => {});
        }
      })
      .catch((transitionError) => {
        log.warn('Transition browser webview visibility failed', transitionError);
        if (!isActiveRef.current && handle === webviewRef.current) {
          return closeWebview(handle);
        }
      });
  }, [closeWebview, ensureHolderWindow, isActive, isTauri, loadUrl, syncWebviewBounds]);

  useEffect(() => () => {
    if (holderWindowRef.current) {
      void holderWindowRef.current.close().catch((closeError) => {
        log.warn('Close browser holder window failed', closeError);
      });
    }
  }, []);

  useEffect(() => {
    if (!isTauri) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (isActive) {
        queueSync();
      }
    });

    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }

    const handleResize = () => {
      if (isActive) {
        queueSync();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [isActive, isTauri, queueSync]);

  useEffect(() => () => {
    void closeWebview();
  }, [closeWebview]);

  useEffect(() => {
    if (!isTauri) return;

    const OVERLAY_SELECTOR = '.modal-overlay, .canvas-mission-control';
    let hiddenByOverlay = false;

    const checkOverlays = () => {
      const hasOverlay = document.querySelector(OVERLAY_SELECTOR) !== null;
      if (hasOverlay && !hiddenByOverlay) {
        hiddenByOverlay = true;
        void webviewRef.current?.hide().catch(() => {});
      } else if (!hasOverlay && hiddenByOverlay) {
        hiddenByOverlay = false;
        const handle = webviewRef.current;
        if (isActiveRef.current && handle) {
          void syncWebviewBounds(handle)
            .then(() => {
              if (isMountedRef.current && isActiveRef.current && handle === webviewRef.current) {
                return handle.show();
              }
            })
            .catch(() => {});
        }
      }
    };

    const observer = new MutationObserver(checkOverlays);
    observer.observe(document.body, { childList: true, subtree: true });

    const handleToolbarActivating = () => {
      void webviewRef.current?.hide().catch(() => {});
    };
    window.addEventListener('toolbar-mode-activating', handleToolbarActivating);

    return () => {
      observer.disconnect();
      window.removeEventListener('toolbar-mode-activating', handleToolbarActivating);
    };
  }, [isTauri, syncWebviewBounds]);

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

  return (
    <div className="browser-scene">
      <form className="browser-scene__toolbar" onSubmit={handleSubmit}>
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
          <RefreshCw size={14} className={isLoading ? 'browser-scene__spinning' : undefined} />
        </IconButton>
        <div className="browser-scene__address">
          <Globe size={16} />
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={t('browserView.addressPlaceholder', { exampleUrl: 'https://example.com' })}
            spellCheck={false}
          />
        </div>
      </form>

      {error ? (
        <div className="browser-scene__error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="browser-scene__content">
        {!isTauri ? (
          <iframe
            className="browser-scene__iframe"
            src={currentUrl}
            title="Embedded Browser"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          />
        ) : (
          <div ref={viewportRef} className="browser-scene__webview-host">
            <div className="browser-scene__webview-placeholder">
              <Globe size={20} />
              <span>{currentUrl}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserScene;
