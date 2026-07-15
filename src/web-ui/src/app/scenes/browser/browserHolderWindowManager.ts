/** A single hidden holder can parent every detached browser WebView. */
export const BROWSER_HOLDER_WINDOW_LABEL = 'embedded-browser-holder-window';

export interface BrowserHolderWindowHandle {
  hide: () => Promise<void>;
  once: (event: string, handler: (event?: unknown) => void) => Promise<() => void>;
}

export interface BrowserHolderWindowManager<T> {
  /**
   * Acquire the app-lifetime holder. There is intentionally no component-level
   * release: a hidden WebView owned by another component may still be attached.
   */
  acquire(create: () => Promise<T>): Promise<T>;
}

/**
 * Deduplicates both settled and in-flight holder creation. Failed creation is
 * forgotten so the next caller can retry; successful ownership lasts until the
 * native application exits.
 */
export function createBrowserHolderWindowManager<T>(): BrowserHolderWindowManager<T> {
  let holderPromise: Promise<T> | null = null;

  return {
    acquire(create) {
      if (holderPromise) {
        return holderPromise;
      }

      const pending = Promise.resolve()
        .then(create)
        .catch((error) => {
          if (holderPromise === pending) {
            holderPromise = null;
          }
          throw error;
        });
      holderPromise = pending;
      return pending;
    },
  };
}

export const browserHolderWindowManager = createBrowserHolderWindowManager<BrowserHolderWindowHandle>();
