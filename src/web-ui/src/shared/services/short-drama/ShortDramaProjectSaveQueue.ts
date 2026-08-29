/**
 * One project, one writer at a time.
 *
 * Two paths write `.void/short-drama/manifest.json`, and they write it
 * differently. The short-drama panel holds the project in memory and saves the
 * whole thing. The canvas write-back reads the project, appends a revision and
 * saves the whole thing — three steps with two awaits between them. Nothing
 * stopped those interleaving: a panel save landing inside the canvas's window
 * was read after it had already read, and the canvas's write then put the
 * pre-panel project back on disk. The revision that was swallowed left no
 * trace, because the writer overwrites unconditionally.
 *
 * This queue makes each critical section run to completion before the next one
 * starts, keyed per project. The canvas path takes the lock around its whole
 * read-modify-write, so it can no longer be overtaken mid-flight; every other
 * writer goes through {@link withShortDramaProjectLock} inside
 * `writeShortDramaManifest` and therefore waits its turn.
 *
 * Why a queue rather than a version field on the manifest: the alternative
 * needs a monotonic revision or `updatedAt` carried on the project, compared on
 * write, and a retry loop in every caller. That is a data-model change plus
 * four call sites, against a few lines here that no caller has to know about.
 *
 * What it deliberately does NOT do: it cannot rescue a caller that read the
 * project long ago, sat on it, and saves a stale copy much later. Ordering is
 * not freshness. The panel reloads on `short-drama:project-changed`, which is
 * what keeps its copy current; closing that separately would need the version
 * field this file exists to avoid.
 */

/** The tail of each key's chain. Resolved promises are dropped as they settle. */
const chains = new Map<string, Promise<unknown>>();

/**
 * Keys whose critical section is running right now.
 *
 * A holder that calls back into a locked function — the canvas path holds the
 * lock and then calls the manifest writer, which locks too — would otherwise
 * wait for itself forever. JavaScript has no async-context tracking to detect
 * that properly, so re-entry is recognised by the key alone and runs inline. A
 * caller that is NOT the holder but reaches the writer for the same key while
 * the holder is awaiting also runs inline; that is exactly today's behaviour,
 * so nothing gets worse, and no such caller exists.
 */
const held = new Set<string>();

export function withShortDramaProjectLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  if (held.has(key)) {
    return task();
  }

  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(async () => {
    held.add(key);
    try {
      return await task();
    } finally {
      held.delete(key);
    }
  });
  // The chain must survive a failing task, or one rejection would wedge every
  // later write behind it.
  const tail = run.then(() => undefined, () => undefined).then(() => {
    if (chains.get(key) === tail) {
      chains.delete(key);
    }
  });
  chains.set(key, tail);
  return run;
}

/**
 * The lock's identity: the manifest file, as closely as the adapter can
 * describe it. Two adapters built for the same workspace are different objects
 * but the same file, so object identity is useless here.
 */
export function shortDramaProjectLockKey(
  adapter: { kind: string; scope?: string },
  projectId: string,
): string {
  return `${adapter.kind}:${adapter.scope ?? ''}:${projectId}`;
}
