/**
 * One dismissal contract for every transient surface on the Infinite Canvas
 * (owner feedback 2026-08-26).
 *
 * The owner asked for the "Close" buttons to go: a popover, a picker or the
 * full-screen viewer closes by pressing outside it or by pressing Escape, and
 * nothing else. Rather than repeating that in each component — three pickers
 * and a viewer had grown four slightly different versions of it — every
 * surface calls this hook and gets identical behaviour.
 *
 * Notes on the details that matter:
 * - The press listener is `mousedown` in the CAPTURE phase, so a surface
 *   closes as soon as the user presses somewhere else, before that press turns
 *   into a click on whatever is underneath.
 * - `ignore` exists for the control that opened the surface. Without it the
 *   opening button could never close its own surface: the press would dismiss
 *   and the click would immediately re-open.
 * - `inside` lets a surface be non-contiguous — the viewer's media is one
 *   element and its chrome another, and pressing either must not close.
 *
 * Pure interaction plumbing: it owns no state and touches no document data.
 */
import React from 'react';

/**
 * An element, or a ref to one. Refs are resolved at event time, so a surface
 * can name a region that had not mounted yet when the hook was called.
 */
export type InfiniteCanvasDismissTarget =
  | Element
  | { readonly current: Element | null }
  | null
  | undefined;

export interface InfiniteCanvasDismissOptions {
  /** Called on an outside press or on Escape. */
  onDismiss: () => void;
  /** Set false to unhook without unmounting the surface. */
  enabled?: boolean;
  /** Further regions that count as part of the surface. */
  inside?: readonly InfiniteCanvasDismissTarget[];
  /** The control that opened the surface; a press there must not dismiss. */
  ignore?: readonly InfiniteCanvasDismissTarget[];
}

/**
 * Duck-typed on purpose. `instanceof Element` is wrong here: tests build their
 * own JSDOM window, whose `Element` is a different constructor from the
 * ambient one, and the check would silently report "outside" for every node.
 */
function resolveTarget(target: InfiniteCanvasDismissTarget): Element | null {
  if (!target) return null;
  if (typeof (target as Element).contains === 'function') return target as Element;
  return (target as { current: Element | null }).current ?? null;
}

function isNode(value: EventTarget | null): value is Node {
  return Boolean(value) && typeof (value as Node).nodeType === 'number';
}

/**
 * Returns the ref to put on the surface. Everything outside it (and outside
 * `inside` / `ignore`) dismisses on press; Escape always dismisses.
 */
export function useInfiniteCanvasDismiss<T extends Element = HTMLElement>(
  options: InfiniteCanvasDismissOptions,
): React.MutableRefObject<T | null> {
  const surfaceRef = React.useRef<T | null>(null);
  const latest = React.useRef(options);
  latest.current = options;

  const enabled = options.enabled !== false;

  React.useEffect(() => {
    if (!enabled) return undefined;
    const ownerDocument = surfaceRef.current?.ownerDocument
      ?? (typeof document === 'undefined' ? undefined : document);
    if (!ownerDocument) return undefined;

    const isWithin = (target: EventTarget | null): boolean => {
      if (!isNode(target)) return false;
      const { inside, ignore } = latest.current;
      const candidates: InfiniteCanvasDismissTarget[] = [
        surfaceRef.current,
        ...(inside ?? []),
        ...(ignore ?? []),
      ];
      return candidates.some(candidate => {
        const element = resolveTarget(candidate);
        return Boolean(element) && (element === target || element!.contains(target));
      });
    };

    const onPress = (event: Event) => {
      if (isWithin(event.target)) return;
      latest.current.onDismiss();
    };
    const onKeyDown = (event: Event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.preventDefault();
      latest.current.onDismiss();
    };

    ownerDocument.addEventListener('mousedown', onPress, true);
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    return () => {
      ownerDocument.removeEventListener('mousedown', onPress, true);
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);

  return surfaceRef;
}
