/**
 * Reader-control gate.
 *
 * `VirtualMessageList` owns the "the reader has taken the viewport over" state,
 * but the components that shrink the list — tool cards, thinking cards, explore
 * groups — live far below it in the tree and already talk to the list through
 * window events rather than props. This module is the matching side channel for
 * the one thing they need to know: whether they are allowed to collapse
 * themselves right now.
 *
 * While the reader is in control, an automatic collapse is deferred rather than
 * performed. Anything that shrinks content above the reader's eyes moves the
 * text they are reading, and a burst of them (which is exactly what happens the
 * moment a response finishes) is the difference between a calm page and a
 * flickering one. Manual collapses are never deferred — the reader asked.
 *
 * Deferred collapses are flushed when control returns to the list, at which
 * point the viewport is back at the bottom and the existing collapse-intent
 * compensation path handles them normally.
 */

type DeferredAutoCollapse = () => void;

let readerControlled = false;
const deferredAutoCollapses = new Map<string, DeferredAutoCollapse>();

export function isReaderControlled(): boolean {
  return readerControlled;
}

export function flushDeferredAutoCollapses(): void {
  if (deferredAutoCollapses.size === 0) return;
  const pending = Array.from(deferredAutoCollapses.values());
  deferredAutoCollapses.clear();
  for (const run of pending) {
    run();
  }
}

export function clearDeferredAutoCollapses(): void {
  deferredAutoCollapses.clear();
}

export function setReaderControlled(nextValue: boolean): void {
  if (readerControlled === nextValue) return;
  readerControlled = nextValue;
  if (!nextValue) {
    flushDeferredAutoCollapses();
  }
}

export function deferAutoCollapse(key: string, run: DeferredAutoCollapse): void {
  deferredAutoCollapses.set(key, run);
}
