export type BrowserPresentationStatus = 'active' | 'hidden' | 'disposed';

export interface BrowserPresentationSnapshot {
  readonly occluded: boolean;
  readonly requestedActive: boolean;
  readonly revision: number;
  readonly status: BrowserPresentationStatus;
}

export interface BrowserPresentationLifecycle {
  /**
   * Update the desired presentation state. Repeating the same state is a no-op,
   * so unrelated React renders do not invalidate in-flight work. Updating after
   * disposal starts a fresh lifecycle (needed by React strict-effect replay).
   */
  update(isActive: boolean): BrowserPresentationSnapshot;
  /** Overlay/tooling occlusion is part of the same revision gate as tab state. */
  setOccluded(occluded: boolean): BrowserPresentationSnapshot;
  dispose(): BrowserPresentationSnapshot;
  snapshot(): BrowserPresentationSnapshot;
  canPresent(): boolean;
  isActive(): boolean;
  isCurrent(snapshot: BrowserPresentationSnapshot): boolean;
}

export interface BrowserPresentationSequenceOptions {
  lifecycle: BrowserPresentationLifecycle;
  snapshot: BrowserPresentationSnapshot;
  /** Keeps an old WebView from winning after its slot has been replaced. */
  isTargetCurrent: () => boolean;
  /** Each step is checked before and after its asynchronous boundary. */
  steps: ReadonlyArray<() => Promise<boolean | void>>;
  onStale?: () => Promise<void>;
}

export interface BrowserHostTaskActivity {
  readonly polling: boolean;
  readonly resizeRecovery: boolean;
}

/**
 * Polling requires renderable bounds, while resize recovery must stay mounted at
 * zero-size so a CSS-collapsed host can become renderable again.
 */
export function getBrowserHostTaskActivity(
  upstreamActive: boolean,
  occluded: boolean,
  hasRenderableBounds: boolean,
): BrowserHostTaskActivity {
  const resizeRecovery = upstreamActive && !occluded;
  return {
    polling: resizeRecovery && hasRenderableBounds,
    resizeRecovery,
  };
}

/**
 * Small state gate shared by the scene and panel browser hosts.
 *
 * Native Webview transitions are asynchronous. A snapshot captured by an old
 * transition must stop being authoritative as soon as the browser becomes
 * hidden, active again, or disposed. This gate provides that contract without
 * coupling presentation state to the global scene store.
 */
export function createBrowserPresentationLifecycle(
  initiallyActive: boolean,
): BrowserPresentationLifecycle {
  let revision = 0;
  let requestedActive = initiallyActive;
  let occluded = false;
  let disposed = false;

  const getStatus = (): BrowserPresentationStatus => {
    if (disposed) {
      return 'disposed';
    }
    return requestedActive && !occluded ? 'active' : 'hidden';
  };

  const getSnapshot = (): BrowserPresentationSnapshot => ({
    occluded,
    requestedActive,
    revision,
    status: getStatus(),
  });

  return {
    update(isActive) {
      if (disposed || requestedActive !== isActive) {
        disposed = false;
        requestedActive = isActive;
        revision += 1;
      }

      return getSnapshot();
    },
    setOccluded(nextOccluded) {
      if (occluded !== nextOccluded) {
        occluded = nextOccluded;
        revision += 1;
      }

      return getSnapshot();
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        revision += 1;
      }

      return getSnapshot();
    },
    snapshot: getSnapshot,
    canPresent() {
      return getStatus() === 'active';
    },
    isActive() {
      return getStatus() === 'active';
    },
    isCurrent(snapshot) {
      return (
        snapshot.revision === revision &&
        snapshot.status === getStatus() &&
        snapshot.occluded === occluded &&
        snapshot.requestedActive === requestedActive
      );
    },
  };
}

/**
 * Run a native presentation sequence with a revision check on both sides of
 * every await. This is deliberately independent of React/Tauri so races can be
 * covered with deterministic deferred-promise tests.
 */
export async function runBrowserPresentationSequence({
  lifecycle,
  snapshot,
  isTargetCurrent,
  steps,
  onStale,
}: BrowserPresentationSequenceOptions): Promise<boolean> {
  const isCurrent = () => lifecycle.isCurrent(snapshot) && isTargetCurrent();
  let staleHandled = false;

  const handleStale = async () => {
    if (!staleHandled) {
      staleHandled = true;
      await onStale?.();
    }
    return false;
  };

  if (!isCurrent()) {
    return handleStale();
  }

  for (const step of steps) {
    if (!isCurrent()) {
      return handleStale();
    }

    const shouldContinue = await step();

    if (!isCurrent()) {
      return handleStale();
    }

    if (shouldContinue === false) {
      return false;
    }
  }

  return true;
}
