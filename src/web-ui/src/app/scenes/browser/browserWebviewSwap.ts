export interface BrowserWebviewSlot<T> {
  readonly handle: T;
  readonly label: string;
}

export interface BrowserWebviewCommitCoordinator {
  run<T>(transaction: () => Promise<T>): Promise<T>;
}

export type BrowserWebviewSwapResult<T> =
  | { readonly status: 'committed'; readonly slot: BrowserWebviewSlot<T> }
  | { readonly status: 'blocked' }
  | { readonly status: 'stale' };

export interface BrowserPendingNavigationSnapshot {
  readonly inFlight: boolean;
  readonly requestToken: number;
  readonly url: string;
}

export interface BrowserPendingNavigationController {
  begin(url: string, requestToken: number): void;
  clear(requestToken: number): void;
  retryUrl(): string | null;
  snapshot(): BrowserPendingNavigationSnapshot | null;
  suspend(requestToken?: number): void;
}

/** Keeps a blocked navigation retryable without letting stale requests mutate it. */
export function createBrowserPendingNavigationController(): BrowserPendingNavigationController {
  let pending: BrowserPendingNavigationSnapshot | null = null;

  return {
    begin(url, requestToken) {
      pending = { inFlight: true, requestToken, url };
    },
    clear(requestToken) {
      if (pending?.requestToken === requestToken) {
        pending = null;
      }
    },
    retryUrl() {
      return pending && !pending.inFlight ? pending.url : null;
    },
    snapshot() {
      return pending;
    },
    suspend(requestToken) {
      if (pending && (requestToken === undefined || pending.requestToken === requestToken)) {
        pending = { ...pending, inFlight: false };
      }
    },
  };
}

/**
 * Candidate creation may overlap, but publishing/activation/retirement is a
 * single-writer transaction. This prevents one request from treating another
 * request's not-yet-committed candidate as its rollback target.
 */
export function createBrowserWebviewCommitCoordinator(): BrowserWebviewCommitCoordinator {
  let commitTail: Promise<void> = Promise.resolve();

  return {
    run(transaction) {
      const result = commitTail.then(transaction);
      commitTail = result.then(() => {}, () => {});
      return result;
    },
  };
}

export interface BrowserWebviewSwapOptions<T> {
  commitCoordinator: BrowserWebviewCommitCoordinator;
  /** Commit URL and other authoritative metadata only after activation. */
  commitCandidate: (candidate: BrowserWebviewSlot<T>) => void;
  createCandidate: () => BrowserWebviewSlot<T>;
  waitForCandidate: (candidate: BrowserWebviewSlot<T>) => Promise<void>;
  prepareCandidate: (candidate: BrowserWebviewSlot<T>) => Promise<void>;
  activateCandidate: (candidate: BrowserWebviewSlot<T>) => Promise<boolean>;
  isCurrentRequest: () => boolean;
  readCurrent: () => BrowserWebviewSlot<T> | null;
  /** Publishes the provisional handle/label inside the serialized transaction. */
  publish: (slot: BrowserWebviewSlot<T> | null) => void;
  close: (slot: BrowserWebviewSlot<T>) => Promise<void>;
}

function sameSlot<T>(
  left: BrowserWebviewSlot<T> | null,
  right: BrowserWebviewSlot<T> | null,
): boolean {
  return left?.handle === right?.handle && left?.label === right?.label;
}

const STALE_SWAP = Symbol('stale-browser-webview-swap');

/**
 * Two-phase WebView replacement. The previous slot stays authoritative until
 * the candidate is ready and prepared. Activation happens after an atomic
 * publish, but any failure/stale request rolls the slot back before the
 * candidate is closed. The previous handle is retired only after activation.
 */
export async function swapBrowserWebview<T>({
  commitCoordinator,
  commitCandidate,
  createCandidate,
  waitForCandidate,
  prepareCandidate,
  activateCandidate,
  isCurrentRequest,
  readCurrent,
  publish,
  close,
}: BrowserWebviewSwapOptions<T>): Promise<BrowserWebviewSwapResult<T>> {
  const candidate = createCandidate();
  let candidateClosed = false;

  const closeCandidate = async () => {
    if (!candidateClosed) {
      candidateClosed = true;
      await close(candidate);
    }
  };

  try {
    await waitForCandidate(candidate);
    if (!isCurrentRequest()) {
      await closeCandidate();
      return { status: 'stale' };
    }

    await prepareCandidate(candidate);
    if (!isCurrentRequest()) {
      await closeCandidate();
      return { status: 'stale' };
    }

  } catch (error) {
    await closeCandidate();
    throw error;
  }

  return commitCoordinator.run(async () => {
    if (!isCurrentRequest()) {
      await closeCandidate();
      return { status: 'stale' };
    }

    const previous = readCurrent();
    let published = false;

    try {
      publish(candidate);
      published = true;

      if (!isCurrentRequest()) {
        throw STALE_SWAP;
      }

      const activated = await activateCandidate(candidate);

      if (!activated) {
        if (sameSlot(readCurrent(), candidate)) {
          publish(previous);
        }
        await closeCandidate();
        return isCurrentRequest() ? { status: 'blocked' } : { status: 'stale' };
      }

      if (!isCurrentRequest() || !sameSlot(readCurrent(), candidate)) {
        throw STALE_SWAP;
      }

      commitCandidate(candidate);
    } catch (error) {
      if (published && sameSlot(readCurrent(), candidate)) {
        publish(previous);
      }
      await closeCandidate();

      if (error === STALE_SWAP) {
        return { status: 'stale' };
      }
      throw error;
    }

    if (previous && !sameSlot(previous, candidate)) {
      await close(previous);
    }
    return { status: 'committed', slot: candidate };
  });
}
